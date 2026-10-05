import { callAction } from "@agent-native/core/client/hooks";

type StartedUpload = {
  id: string;
  partSize: number;
  partCount: number;
  cors?: { ok: boolean; message?: string };
};

type SignedParts = {
  parts: Array<{ partNumber: number; url: string }>;
};

export type DumpTransferFile = {
  file: File;
  relativePath: string;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (
    success: (file: File) => void,
    failure?: (error: unknown) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      failure?: (error: unknown) => void,
    ) => void;
  };
};

function entryFile(entry: FileSystemEntryLike): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file?.(resolve, reject);
  });
}

async function readDirectory(
  entry: FileSystemEntryLike,
): Promise<FileSystemEntryLike[]> {
  const reader = entry.createReader?.();
  if (!reader) return [];
  const all: FileSystemEntryLike[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntryLike[]>(
      (resolve, reject) => {
        reader.readEntries(resolve, reject);
      },
    );
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walkEntry(
  entry: FileSystemEntryLike,
  parent: string,
  into: DumpTransferFile[],
) {
  const relativePath = parent ? `${parent}/${entry.name}` : entry.name;
  if (entry.isFile) {
    if (entry.name === ".DS_Store") return;
    const file = await entryFile(entry);
    into.push({ file, relativePath });
    return;
  }
  if (!entry.isDirectory) return;
  for (const child of await readDirectory(entry)) {
    await walkEntry(child, relativePath, into);
  }
}

export async function filesFromDrop(
  data: DataTransfer,
): Promise<DumpTransferFile[]> {
  const entries = Array.from(data.items)
    .map((item) => item.webkitGetAsEntry?.() as FileSystemEntryLike | null)
    .filter((entry): entry is FileSystemEntryLike => !!entry);
  if (entries.length === 0) {
    return Array.from(data.files).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || file.name,
    }));
  }
  const into: DumpTransferFile[] = [];
  for (const entry of entries) await walkEntry(entry, "", into);
  return into;
}

export function filesFromInput(list: FileList | null): DumpTransferFile[] {
  return Array.from(list ?? []).map((file) => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

async function mapPool<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await run(item);
      }
    },
  );
  await Promise.all(workers);
}

async function putPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
): Promise<string> {
  let lastError = "Upload part failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (signal.aborted) throw new Error("Upload cancelled.");
    try {
      const response = await fetch(url, { method: "PUT", body, signal });
      const etag = response.headers.get("etag");
      if (response.ok && etag) return etag;
      lastError = response.ok
        ? "Backblaze did not expose the part ETag. Allow the site origin for PUT and expose ETag on the bucket."
        : `Part upload failed (${response.status}).`;
    } catch (error) {
      if (signal.aborted) throw new Error("Upload cancelled.");
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

export async function uploadDumpFile(input: {
  file: File;
  folderId: string | null;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
}): Promise<{ id: string; corsMessage?: string }> {
  const started = await callAction("start-dump-upload", {
    filename: input.file.name,
    sizeBytes: input.file.size,
    contentType: input.file.type || "application/octet-stream",
    folderId: input.folderId,
  });
  const upload = started as StartedUpload;
  const loaded = new Map<number, number>();
  const report = () => {
    let total = 0;
    for (const value of loaded.values()) total += value;
    input.onProgress(total);
  };
  try {
    const completed: Array<{ partNumber: number; etag: string }> = [];
    for (let start = 1; start <= upload.partCount; start += 20) {
      const partNumbers: number[] = [];
      for (
        let partNumber = start;
        partNumber < start + 20 && partNumber <= upload.partCount;
        partNumber += 1
      ) {
        partNumbers.push(partNumber);
      }
      const signed = (await callAction("sign-dump-parts", {
        id: upload.id,
        partNumbers,
      })) as SignedParts;
      await mapPool(signed.parts, 4, async (part) => {
        const offset = (part.partNumber - 1) * upload.partSize;
        const blob = input.file.slice(offset, offset + upload.partSize);
        const etag = await putPart(part.url, blob, input.signal);
        loaded.set(part.partNumber, blob.size);
        report();
        completed.push({ partNumber: part.partNumber, etag });
      });
    }
    await callAction("complete-dump-upload", {
      id: upload.id,
      parts: completed,
    });
    return {
      id: upload.id,
      corsMessage: upload.cors?.ok ? undefined : upload.cors?.message,
    };
  } catch (error) {
    if (upload.id) {
      try {
        await callAction("abort-dump-upload", { id: upload.id });
      } catch {
        // The row can still be aborted from the library.
      }
    }
    throw error;
  }
}

export async function ensureDumpFolders(
  relativePath: string,
  rootFolderId: string | null,
  cache: Map<string, string | null>,
): Promise<string | null> {
  const directory = relativePath.split("/").slice(0, -1).filter(Boolean);
  if (directory.length === 0) return rootFolderId;
  let parent = rootFolderId;
  let built = "";
  for (const name of directory) {
    built = built ? `${built}/${name}` : name;
    const key = `${rootFolderId ?? "root"}:${built}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      parent = cached;
      continue;
    }
    const created = (await callAction("create-dump-folder", {
      name,
      parentId: parent,
    })) as { id: string };
    parent = created.id;
    cache.set(key, parent);
  }
  return parent;
}
