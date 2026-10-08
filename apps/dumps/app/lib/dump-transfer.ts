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
 * Browser parts are 8 MiB, the same size rclone and the AWS CLI use for the
 * shop copies that already land in this bucket. Larger parts (128 MiB, then
 * 32 MiB) kept dying before Backblaze answered. A multi-gigabyte file sends
 * one part at a time so a reset cannot look like progress across several
 * half-sent parts. Must match `BROWSER_MAX_PART_BYTES` in
 * `packages/object-storage`.
 */
export const BROWSER_MAX_PART_BYTES = 8 * 1024 * 1024;
export const PART_CONCURRENCY = 3;
export const SERIAL_UPLOAD_BYTES = 1024 * 1024 * 1024;
const SIGN_BATCH = 16;
export const PART_ATTEMPTS = 8;
const PART_TIMEOUT_MS = 10 * 60 * 1000;
/** No upload progress and no response for this long means a dead link. */
export const PART_STALL_MS = 60 * 1000;
const STALL_CHECK_MS = 5 * 1000;
/** Rounds of "list stored parts and continue" that store nothing new. */
export const AUTO_RESUME_STALLS = 4;
const FILE_READ_MESSAGE =
  "The browser could not read this file from disk while uploading. If it is on an external drive, a network share, a camera card, or a cloud-synced folder, copy it to this computer first. If another program is still writing it, wait for that to finish. Then choose the same file to resume.";

export function partConcurrencyFor(fileSize: number): number {
  if (fileSize >= SERIAL_UPLOAD_BYTES) return 1;
  return PART_CONCURRENCY;
}

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
    return "The connection to Backblaze dropped before it answered this part. Backblaze hides the reason from the browser, so a reset, a rejected request, and a lost link look the same. Parts already stored are kept.";
  }
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 180);
  return detail
    ? `Part upload failed (${status}). ${detail}`
    : `Part upload failed (${status}).`;
}

function partResultError(
  status: number,
  body: string,
  missingEtag: boolean,
): Error {
  return Object.assign(new Error(partUploadError(status, body, missingEtag)), {
    status,
    missingEtag,
  });
}

function putPartOnce(
  url: string,
  body: ArrayBuffer,
  signal: AbortSignal,
  onBytes: (loaded: number) => void,
): Promise<string> {
  if (typeof XMLHttpRequest === "undefined") {
    return fetch(url, {
      method: "PUT",
      body,
      signal,
      credentials: "omit",
      mode: "cors",
    })
      .then(async (response) => {
        const etag = response.headers.get("etag");
        if (response.ok && etag) {
          onBytes(body.byteLength);
          return etag;
        }
        const text = await response.text().catch(() => "");
        throw partResultError(response.status, text, response.ok && !etag);
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
        throw partResultError(0, "", false);
      });
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.responseType = "text";
    xhr.withCredentials = false;
    xhr.timeout = PART_TIMEOUT_MS;
    let lastActivity = Date.now();
    let stalled = false;
    // A half-open connection (a Wi-Fi hop, a sleeping laptop) can hold a PUT
    // for minutes without an error. Abort it so the retry starts promptly.
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity < PART_STALL_MS) return;
      stalled = true;
      xhr.abort();
    }, STALL_CHECK_MS);
    const onAbort = () => xhr.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearInterval(watchdog);
      signal.removeEventListener("abort", onAbort);
    };
    xhr.upload.onprogress = (event) => {
      lastActivity = Date.now();
      if (event.lengthComputable) onBytes(event.loaded);
    };
    // The body is sent. From here the clock waits on Backblaze's answer.
    xhr.upload.onload = () => {
      lastActivity = Date.now();
    };
    xhr.onload = () => {
      cleanup();
      const etag = xhr.getResponseHeader("ETag");
      const missingEtag = xhr.status >= 200 && xhr.status < 300 && !etag;
      if (xhr.status >= 200 && xhr.status < 300 && etag) {
        onBytes(body.byteLength);
        resolve(etag);
        return;
      }
      reject(partResultError(xhr.status, xhr.responseText ?? "", missingEtag));
    };
    xhr.onerror = () => {
      cleanup();
      reject(partResultError(0, "", false));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(partResultError(0, "", false));
    };
    xhr.onabort = () => {
      cleanup();
      if (stalled && !signal.aborted) {
        reject(partResultError(0, "", false));
        return;
      }
      reject(new Error("Upload cancelled."));
    };
    // The part is an in-memory copy of the file slice, so the upload does not
    // depend on the file on disk staying readable. Do not set Content-Type:
    // the presign only signs `host`.
    try {
      xhr.send(body);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : partResultError(0, "", false));
    }
  });
}

function partStatus(error: unknown): number {
  if (!error || typeof error !== "object" || !("status" in error)) return 0;
  const status = Number((error as { status?: unknown }).status);
  return Number.isFinite(status) ? status : 0;
}

function hasMissingEtag(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "missingEtag" in error &&
    (error as { missingEtag?: unknown }).missingEtag === true,
  );
}

function isUnreadablePartResult(error: unknown): boolean {
  return partStatus(error) === 0 || hasMissingEtag(error);
}

export function partRetryDelayMs(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** (attempt - 1));
}

/** Pause between rounds of re-listing stored parts. */
export function resumeRoundDelayMs(round: number): number {
  return Math.min(30_000, 3000 * 2 ** (round - 1));
}

function fileReadError(): Error {
  return Object.assign(new Error(FILE_READ_MESSAGE), {
    status: -1,
    fileRead: true,
  });
}

async function readPartBytes(body: Blob): Promise<ArrayBuffer> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const bytes = await body.arrayBuffer();
      if (bytes.byteLength === body.size) return bytes;
    } catch {
      // Try once more. A busy disk or a sync client can fail one read.
    }
    if (attempt === 1) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw fileReadError();
}

/** Hold a retry while the browser reports no network, without spending it. */
function waitForOnline(signal: AbortSignal): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine !== false) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const done = () => {
      globalThis.removeEventListener?.("online", onOnline);
      signal.removeEventListener("abort", onAbort);
    };
    const onOnline = () => {
      done();
      resolve();
    };
    const onAbort = () => {
      done();
      reject(new Error("Upload cancelled."));
    };
    globalThis.addEventListener?.("online", onOnline);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function putPart(
  url: string,
  body: Blob,
  signal: AbortSignal,
  onBytes: (loaded: number) => void,
  refreshUrl?: () => Promise<string>,
  adoptStored?: () => Promise<string | null>,
): Promise<string> {
  let currentUrl = url;
  let lastError = new Error("Upload part failed.");
  const bytes = await readPartBytes(body);
  for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt += 1) {
    if (signal.aborted) throw new Error("Upload cancelled.");
    await waitForOnline(signal);
    try {
      return await putPartOnce(currentUrl, bytes, signal, onBytes);
    } catch (error) {
      if (
        signal.aborted ||
        (error instanceof Error && error.message === "Upload cancelled.")
      ) {
        throw new Error("Upload cancelled.");
      }
      lastError = error instanceof Error ? error : lastError;
      // A reset, or a 200 whose ETag the browser could not read, often means
      // Backblaze already stored the part and omitted CORS on the response.
      if (isUnreadablePartResult(error) && adoptStored) {
        try {
          const etag = (await adoptStored())?.trim();
          if (etag) return etag;
        } catch {
          // Listing parts is best-effort. The next attempt still runs.
        }
      }
      const status = partStatus(error);
      if (!shouldRetryPartStatus(status, attempt)) throw lastError;
      if (refreshUrl) {
        try {
          const fresh = await refreshUrl();
          if (fresh) currentUrl = fresh;
        } catch {
          // Keep the current URL. The next attempt still runs.
        }
      }
      // Leave the last progress value in place. Zeroing it makes the bar
      // jump backward while the other in-flight parts are still sending.
      await sleep(partRetryDelayMs(attempt), signal);
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
  /** Backblaze already holds the finished object. Nothing is left to send. */
  completed?: boolean;
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
  // The third argument clears the blob type. An inherited video/mp4 or an
  // explicit application/octet-stream makes the browser send Content-Type,
  // which this presign does not cover.
  const blob = file.slice(range.offset, range.offset + range.size, "");
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
    adoptStored?: () => Promise<string | null>,
  ) => Promise<string>;
  complete?: (
    parts: Array<{ partNumber: number; etag: string }>,
  ) => Promise<void>;
  /** Re-read the stored parts between rounds. Defaults to list-dump-parts. */
  listStored?: () => Promise<Array<{ partNumber: unknown; etag: unknown }>>;
  /** Explain a failure Backblaze hides from the browser. Defaults to the probe. */
  diagnose?: () => Promise<string | null>;
  /** Pause before round `n` of auto-resume. Defaults to resumeRoundDelayMs. */
  roundDelayMs?: (round: number) => number;
  /** Short status for the row while the upload is waiting to reconnect. */
  onStatus?: (note: string | null) => void;
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
  const lookupStoredPart = async (partNumber: number) => {
    // List twice. Backblaze can commit the part before the browser sees the
    // response, and the first list can still miss it.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const open = (await callAction(
          "list-dump-parts",
          { id: input.id },
          { method: "GET" },
        )) as OpenUpload;
        if (!open || !Array.isArray(open.parts)) return null;
        const etag = normalizeStoredParts(open.parts).get(partNumber) ?? null;
        if (etag || attempt === 1) return etag;
      } catch {
        return null;
      }
      await sleep(400, input.signal);
    }
    return null;
  };
  const sendPart = async (part: { partNumber: number; url: string }) => {
    if (!part.url) {
      throw new Error("Backblaze did not return a part upload URL.");
    }
    const partNumber = coerceByteCount(part.partNumber, "part number");
    const blob = slicePart(input.file, partNumber, partSize, partCount);
    let etag: string;
    try {
      etag = await put(
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
        () => lookupStoredPart(partNumber),
      );
    } catch (error) {
      if (
        input.signal.aborted ||
        (error instanceof Error && error.message === "Upload cancelled.")
      ) {
        throw new Error("Upload cancelled.");
      }
      const recovered = isUnreadablePartResult(error)
        ? await lookupStoredPart(partNumber)
        : null;
      if (!recovered) throw error;
      etag = recovered;
    }
    if (!etag.trim()) {
      throw new Error(
        "Backblaze did not expose the part ETag. Allow the site origin for PUT and expose ETag on the bucket.",
      );
    }
    input.done.set(partNumber, etag.trim());
    loaded.set(partNumber, blob.size);
    report();
  };
  const sendMissing = async () => {
    const todo = missingPartNumbers(partCount, input.done);
    for (let start = 0; start < todo.length; start += SIGN_BATCH) {
      const partNumbers = todo.slice(start, start + SIGN_BATCH);
      const signed = await sign(partNumbers);
      const dropped: Array<{ partNumber: number; url: string }> = [];
      await mapPool(
        signed,
        partConcurrencyFor(input.file.size),
        async (part) => {
          try {
            await sendPart(part);
          } catch (error) {
            if (isUnreadablePartResult(error)) {
              dropped.push(part);
              return;
            }
            throw error;
          }
        },
      );
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
  };
  const listStored =
    input.listStored ??
    (async () => {
      const open = (await callAction(
        "list-dump-parts",
        { id: input.id },
        { method: "GET" },
      )) as OpenUpload;
      return Array.isArray(open?.parts) ? open.parts : [];
    });
  const diagnose =
    input.diagnose ??
    (async () => {
      const probe = (await callAction("probe-dump-upload", {})) as {
        summary?: unknown;
      };
      return typeof probe?.summary === "string" ? probe.summary : null;
    });
  const roundDelayMs = input.roundDelayMs ?? resumeRoundDelayMs;
  // A flaky link should not end a multi-gigabyte upload. After a part runs out
  // of retries, ask Backblaze which parts it holds, wait, and continue. Give up
  // only when several rounds in a row store nothing new.
  let barren = 0;
  for (let round = 1; ; round += 1) {
    const before = input.done.size;
    try {
      await sendMissing();
      break;
    } catch (error) {
      if (input.signal.aborted || !isRecoverableTransferError(error)) {
        throw error;
      }
      barren = input.done.size > before ? 0 : barren + 1;
      if (barren >= AUTO_RESUME_STALLS) {
        throw await explainFailure(error, diagnose);
      }
      const delay = roundDelayMs(barren || 1);
      input.onStatus?.(
        `Lost the connection to Backblaze. ${input.done.size} of ${partCount} parts are stored. Trying again in ${Math.ceil(delay / 1000)}s.`,
      );
      await sleep(delay, input.signal);
      await waitForOnline(input.signal);
      try {
        for (const [partNumber, etag] of normalizeStoredParts(
          await listStored(),
        )) {
          if (!input.done.has(partNumber)) input.done.set(partNumber, etag);
        }
      } catch (listError) {
        // The session itself is gone. Resume restarts it on the same row.
        if (errorCode(listError) === "upload_session_missing") throw listError;
      }
      report();
      input.onStatus?.(null);
    }
  }
  const parts = [...input.done.entries()]
    .map(([partNumber, etag]) => ({ partNumber, etag }))
    .sort((a, b) => a.partNumber - b.partNumber);
  await complete(parts);
}

export function isRecoverableTransferError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "Upload cancelled.") return false;
  if (error && typeof error === "object" && "fileRead" in error) return false;
  if (error && typeof error === "object" && "status" in error) {
    const status = partStatus(error);
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }
  const code = errorCode(error);
  if (code) return code === "b2_request_failed";
  return /Uploaded \d+ of \d+ parts|timed out|Failed to fetch|NetworkError|Load failed|network/i.test(
    error.message,
  );
}

async function explainFailure(
  error: unknown,
  diagnose: () => Promise<string | null>,
): Promise<unknown> {
  if (!(error instanceof Error) || !isUnreadablePartResult(error)) {
    return error;
  }
  let summary: string | null = null;
  try {
    summary = await Promise.race([
      diagnose(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 30_000)),
    ]);
  } catch {
    summary = null;
  }
  if (!summary?.trim()) return error;
  return Object.assign(new Error(`${error.message} ${summary.trim()}`), {
    status: partStatus(error),
    missingEtag: hasMissingEtag(error),
  });
}

export async function uploadDumpFile(input: {
  file: File;
  folderId: string | null;
  signal: AbortSignal;
  onProgress: (loaded: number) => void;
  onStatus?: (note: string | null) => void;
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
    onStatus: input.onStatus,
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
  onStatus?: (note: string | null) => void;
}): Promise<{ message?: string }> {
  let open = await loadOpenUpload(input.id);
  if (open.completed) {
    input.onProgress(input.file.size);
    return { message: open.message };
  }
  const stored = normalizeStoredParts(open.parts ?? []);
  if (open.partSize > BROWSER_MAX_PART_BYTES && stored.size === 0) {
    open = (await callAction("restart-dump-upload", {
      id: input.id,
      replaceEmpty: true,
    })) as OpenUpload;
    if (open.completed) {
      input.onProgress(input.file.size);
      return { message: open.message };
    }
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
    onStatus: input.onStatus,
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
