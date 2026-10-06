import {
  actionErrorMessage,
  callAction,
} from "@agent-native/core/client/hooks";

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

/**
 * Three parts in flight, each at most 32 MiB. Six 128 MiB PUTs at once reset
 * after a few megabytes each; the summed progress then jumped between about
 * 5 MB and 15 MB as every retry cleared that part's in-flight bytes.
 * Must match `BROWSER_MAX_PART_BYTES` in `packages/object-storage`.
 */
export const BROWSER_MAX_PART_BYTES = 32 * 1024 * 1024;
export const PART_CONCURRENCY = 3;
const SIGN_BATCH = 8;
const PART_ATTEMPTS = 5;

export function coerceByteCount(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `The upload record has an unreadable ${label}. Abort it and start again.`,
    );
  }
  return Math.floor(parsed);
}

export function partByteRange(
  partNumber: number,
  partSize: number,
  fileSize: number,
): { offset: number; size: number } {
  const offset = (partNumber - 1) * partSize;
  if (!Number.isFinite(offset) || offset < 0) {
    throw new Error(`Could not place part ${partNumber}.`);
  }
  const size = fileSize <= offset ? 0 : Math.min(partSize, fileSize - offset);
  return { offset, size };
}

export function missingPartNumbers(
  partCount: number,
  done: { has(partNumber: number): boolean },
): number[] {
  const missing: number[] = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber += 1) {
    if (!done.has(partNumber)) missing.push(partNumber);
  }
  return missing;
}

export function normalizeStoredParts(
  parts: Array<{ partNumber: unknown; etag: unknown }>,
): Map<number, string> {
  const done = new Map<number, string>();
  for (const part of parts) {
    const partNumber = Number(part.partNumber);
    const etag = typeof part.etag === "string" ? part.etag.trim() : "";
    if (!Number.isInteger(partNumber) || partNumber < 1 || !etag) continue;
    done.set(partNumber, etag);
  }
  return done;
}

export function transferErrorMessage(error: unknown, fallback: string): string {
  const authored = actionErrorMessage(error);
  if (authored?.trim()) return authored.trim();
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (!message) return fallback;
  const failed = message.match(/^Action [\w-]+ failed: (.+)$/);
  if (failed?.[1]) return failed[1];
  const timedOut = message.match(/^Action [\w-]+ timed out after (\d+)s$/);
  if (timedOut) {
    return `The server timed out after ${timedOut[1]}s. Resume to continue.`;
  }
  if (message.startsWith("Action ")) return fallback;
  return message;
}

export function shouldRetryPartStatus(
  status: number,
  attempt: number,
): boolean {
  if (attempt >= PART_ATTEMPTS) return false;
  if (status === 0 || status === 408 || status === 429) return true;
  return status >= 500;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("errorCode" in error)) {
    return undefined;
  }
  const code = (error as { errorCode?: unknown }).errorCode;
  return typeof code === "string" ? code : undefined;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("Upload cancelled."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Upload cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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

export function partUploadError(
  status: number,
  body: string,
  missingEtag: boolean,
): string {
  if (missingEtag && status >= 200 && status < 300) {
    return "Backblaze did not expose the part ETag. Allow the site origin for PUT and expose ETag on the bucket.";
  }
  if (status === 0) {
    return "Backblaze closed the connection before the browser could read a response for this part. Parts already stored are kept. Resume to continue.";
  }
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return detail
    ? `Part upload failed (${status}). ${detail}`
    : `Part upload failed (${status}).`;
}

function putPartOnce(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onBytes: (loaded: number) => void,
): Promise<string> {
  if (typeof XMLHttpRequest === "undefined") {
    return fetch(url, { method: "PUT", body, signal })
      .then(async (response) => {
        const etag = response.headers.get("etag");
        if (response.ok && etag) {
          onBytes(body.size);
          return etag;
        }
        const text = await response.text().catch(() => "");
        throw Object.assign(
          new Error(
            partUploadError(response.status, text, response.ok && !etag),
          ),
          {
            status: response.status,
          },
        );
      })
      .catch((error: unknown) => {
        if (error && typeof error === "object" && "status" in error) {
          throw error;
        }
        if (
          signal.aborted ||
          (error instanceof Error && error.message === "Upload cancelled.")
        ) {
          throw new Error("Upload cancelled.");
        }
        throw Object.assign(new Error(partUploadError(0, "", false)), {
          status: 0,
        });
      });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.responseType = "text";
    xhr.withCredentials = false;
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onBytes(event.loaded);
    };
    xhr.onload = () => {
      signal.removeEventListener("abort", onAbort);
      const etag = xhr.getResponseHeader("ETag");
      if (xhr.status >= 200 && xhr.status < 300 && etag) {
        onBytes(body.size);
        resolve(etag);
        return;
      }
      const error = new Error(
        partUploadError(
          xhr.status,
          xhr.responseText ?? "",
          xhr.status >= 200 && xhr.status < 300 && !etag,
        ),
      );
      Object.assign(error, { status: xhr.status });
      reject(error);
    };
    xhr.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      const error = new Error(partUploadError(0, "", false));
      Object.assign(error, { status: 0 });
      reject(error);
    };
    xhr.onabort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Upload cancelled."));
    };
    xhr.send(body);
  });
}

function partStatus(error: unknown): number {
  if (!error || typeof error !== "object" || !("status" in error)) return 0;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : 0;
}

async function independentPart(slice: Blob): Promise<Blob> {
  if (slice.size === 0 || typeof slice.arrayBuffer !== "function") return slice;
  // Copy the slice so the PUT is not a live read of a multi-gigabyte File.
  // If that copy fails, send the original slice.
  try {
    const buffer = await slice.arrayBuffer();
    if (buffer.byteLength !== slice.size) return slice;
    return new Blob([buffer], { type: "application/octet-stream" });
  } catch {
    return slice;
  }
}

async function putPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onBytes: (loaded: number) => void,
  refreshUrl?: () => Promise<string>,
): Promise<string> {
  let currentUrl = url;
  let lastError = new Error("Upload part failed.");
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt += 1) {
    if (signal.aborted) throw new Error("Upload cancelled.");
    try {
      return await putPartOnce(currentUrl, body, signal, onBytes);
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.message === "Upload cancelled.")
      ) {
        throw new Error("Upload cancelled.");
      }
      lastError = error instanceof Error ? error : lastError;
      const status = partStatus(error);
      if (!shouldRetryPartStatus(status, attempt)) throw lastError;
      if (status === 0 && refreshUrl) {
        try {
          const fresh = await refreshUrl();
          if (fresh) currentUrl = fresh;
        } catch {
          // Keep the current URL. The next attempt still runs.
        }
      }
      // Leave the last progress value in place. Zeroing it makes the bar
      // jump backward while the other in-flight parts are still sending.
      await sleep(Math.min(10_000, 750 * 2 ** (attempt - 1)), signal);
    }
  }
  throw lastError;
}

type OpenUpload = {
  id: string;
  partSize: number;
  partCount: number;
  parts: Array<{ partNumber: number; etag: string }>;
  sizeBytes: number;
  filename: string;
  restarted?: boolean;
  message?: string;
};

function slicePart(
  file: Blob,
  partNumber: number,
  partSize: number,
  partCount: number,
): Blob {
  const range = partByteRange(partNumber, partSize, file.size);
  const isLast = partNumber === partCount;
  if (
    range.offset > file.size ||
    (range.size === 0 && file.size > 0) ||
    (!isLast && range.size !== partSize)
  ) {
    throw new Error(
      `Could not read part ${partNumber} (${range.size} bytes at offset ${range.offset}). The browser did not return the expected slice of this file.`,
    );
  }
  const blob = file.slice(range.offset, range.offset + range.size);
  if (blob.size !== range.size) {
    throw new Error(
      `Could not read part ${partNumber} (${blob.size} of ${range.size} bytes). The browser did not return the expected slice of this file.`,
    );
  }
  return blob;
}

export async function runMultipartUpload(input: {
  id: string;
  file: Blob;
  partSize: number;
  partCount: number;
  done: Map<number, string>;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
  sign?: (partNumbers: number[]) => Promise<SignedParts["parts"]>;
  put?: (
    url: string,
    body: Blob,
    signal: AbortSignal,
    onBytes: (loaded: number) => void,
    refreshUrl?: () => Promise<string>,
  ) => Promise<string>;
  complete?: (
    parts: Array<{ partNumber: number; etag: string }>,
  ) => Promise<void>;
}) {
  const partSize = coerceByteCount(input.partSize, "part size");
  const partCount = coerceByteCount(input.partCount, "part count");
  const loaded = new Map<number, number>();
  for (const [partNumber] of input.done) {
    loaded.set(
      partNumber,
      partByteRange(partNumber, partSize, input.file.size).size,
    );
  }
  const report = () => {
    let total = 0;
    for (const value of loaded.values()) total += value;
    input.onProgress(total);
  };
  report();
  const missing = missingPartNumbers(partCount, input.done);
  const sign =
    input.sign ??
    (async (partNumbers: number[]) => {
      const signed = (await callAction("sign-dump-parts", {
        id: input.id,
        partNumbers,
      })) as SignedParts;
      if (!Array.isArray(signed.parts) || signed.parts.length === 0) {
        throw new Error("Backblaze did not return part upload URLs.");
      }
      return signed.parts;
    });
  const put = input.put ?? putPart;
  const complete =
    input.complete ??
    (async (parts: Array<{ partNumber: number; etag: string }>) => {
      await callAction("complete-dump-upload", { id: input.id, parts });
    });
  const refreshPart = async (partNumber: number, fallback: string) => {
    const signed = await sign([partNumber]);
    const match =
      signed.find((part) => Number(part.partNumber) === partNumber) ??
      signed[0];
    return match?.url || fallback;
  };
  const sendPart = async (part: { partNumber: number; url: string }) => {
    if (!part.url) {
      throw new Error("Backblaze did not return a part upload URL.");
    }
    const partNumber = coerceByteCount(part.partNumber, "part number");
    const blob = await independentPart(
      slicePart(input.file, partNumber, partSize, partCount),
    );
    const etag = await put(
      part.url,
      blob,
      input.signal,
      (bytes) => {
        const next = Math.min(blob.size, Math.max(0, bytes));
        // Keep this part's best progress. A retry starts again at zero, and
        // writing that zero used to pull the whole bar backward.
        loaded.set(partNumber, Math.max(loaded.get(partNumber) ?? 0, next));
        report();
      },
      () => refreshPart(partNumber, part.url),
    );
    if (!etag.trim()) {
      throw new Error(
        "Backblaze did not expose the part ETag. Allow the site origin for PUT and expose ETag on the bucket.",
      );
    }
    input.done.set(partNumber, etag.trim());
    loaded.set(partNumber, blob.size);
    report();
  };
  for (let start = 0; start < missing.length; start += SIGN_BATCH) {
    const partNumbers = missing.slice(start, start + SIGN_BATCH);
    const signed = await sign(partNumbers);
    const dropped: Array<{ partNumber: number; url: string }> = [];
    await mapPool(signed, PART_CONCURRENCY, async (part) => {
      try {
        await sendPart(part);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "status" in error &&
          partStatus(error) === 0
        ) {
          dropped.push(part);
          return;
        }
        throw error;
      }
    });
    for (const part of dropped) {
      const partNumber = coerceByteCount(part.partNumber, "part number");
      if (input.done.has(partNumber)) continue;
      await sendPart(part);
    }
  }
  if (input.done.size !== partCount) {
    throw new Error(
      `Uploaded ${input.done.size} of ${partCount} parts. Resume to continue.`,
    );
  }
  const parts = [...input.done.entries()]
    .map(([partNumber, etag]) => ({ partNumber, etag }))
    .sort((a, b) => a.partNumber - b.partNumber);
  await complete(parts);
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
  await runMultipartUpload({
    id: upload.id,
    file: input.file,
    partSize: upload.partSize,
    partCount: upload.partCount,
    done: new Map(),
    signal: input.signal,
    onProgress: input.onProgress,
  });
  return {
    id: upload.id,
    corsMessage: upload.cors?.ok ? undefined : upload.cors?.message,
  };
}

async function loadOpenUpload(id: string): Promise<OpenUpload> {
  try {
    return (await callAction(
      "list-dump-parts",
      { id },
      { method: "GET" },
    )) as OpenUpload;
  } catch (error) {
    if (errorCode(error) !== "upload_session_missing") throw error;
    return (await callAction("restart-dump-upload", { id })) as OpenUpload;
  }
}

export async function resumeDumpFile(input: {
  id: string;
  file: File;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
}): Promise<{ message?: string }> {
  let open = await loadOpenUpload(input.id);
  const stored = normalizeStoredParts(open.parts ?? []);
  if (open.partSize > BROWSER_MAX_PART_BYTES && stored.size === 0) {
    open = (await callAction("restart-dump-upload", {
      id: input.id,
      replaceEmpty: true,
    })) as OpenUpload;
  }
  const sizeBytes = coerceByteCount(open.sizeBytes, "file size");
  if (input.file.size !== sizeBytes) {
    throw new Error(
      `Choose the same file. This upload is ${sizeBytes} bytes and the selected file is ${input.file.size} bytes.`,
    );
  }
  if (open.filename && input.file.name !== open.filename) {
    throw new Error(
      `Choose ${open.filename}. The selected file is named ${input.file.name}.`,
    );
  }
  await runMultipartUpload({
    id: input.id,
    file: input.file,
    partSize: open.partSize,
    partCount: open.partCount,
    done: normalizeStoredParts(open.parts ?? []),
    signal: input.signal,
    onProgress: input.onProgress,
  });
  return open.restarted && open.message ? { message: open.message } : {};
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
