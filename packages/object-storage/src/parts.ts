const MIN_PART_SIZE = 8 * 1024 * 1024;
/**
 * Largest part a browser PUT to the B2 S3 endpoint should use.
 *
 * 32 MiB parts previously carried a 16 GB dump through gigabytes of stored
 * parts. Raising the cap to 128 MiB and sending six of those at once stored
 * nothing: each PUT reset after a few megabytes, six of those resets added
 * up to the 9–15 MB the progress bar showed, and a retry cleared the
 * in-flight bytes so the bar jumped backward. Backblaze error responses
 * omit Access-Control-Allow-Origin, so the browser reports a network error
 * instead of the HTTP status. 32 MiB stays above B2's 5 MiB minimum and
 * keeps a 16 GiB file at 512 parts. Files that would exceed 10,000 parts
 * still grow past this cap. An upload that already stored parts keeps the
 * part size recorded on its row.
 */
export const BROWSER_MAX_PART_BYTES = 32 * 1024 * 1024;
const MAX_PART_SIZE = BROWSER_MAX_PART_BYTES;
const TARGET_PARTS = 128;
const MAX_PARTS = 10_000;

export function planParts(sizeBytes: number): {
  partSize: number;
  partCount: number;
} {
  const size = Math.max(0, Math.floor(sizeBytes));
  if (size === 0) return { partSize: MIN_PART_SIZE, partCount: 1 };
  let partSize = MIN_PART_SIZE;
  if (size > MIN_PART_SIZE * TARGET_PARTS) {
    partSize = Math.ceil(size / TARGET_PARTS / MIN_PART_SIZE) * MIN_PART_SIZE;
  }
  if (partSize > MAX_PART_SIZE) partSize = MAX_PART_SIZE;
  if (size > partSize * MAX_PARTS) {
    partSize = Math.ceil(size / MAX_PARTS);
  }
  if (partSize < MIN_PART_SIZE && size > MIN_PART_SIZE) {
    partSize = MIN_PART_SIZE;
  }
  return { partSize, partCount: Math.ceil(size / partSize) };
}

export function partCountFor(sizeBytes: number, partSize: number): number {
  if (sizeBytes <= 0) return 1;
  if (!Number.isFinite(partSize) || partSize <= 0) return 1;
  return Math.max(1, Math.ceil(sizeBytes / partSize));
}

/**
 * Presigned UploadPart URLs must not carry a checksum query parameter.
 * The AWS SDK's default flexible checksum signs `x-amz-checksum-crc32=AAAAAA==`
 * (the checksum of an empty body). A browser PUT of the real part cannot
 * satisfy it, and Backblaze resets the connection while the body is still
 * uploading. The browser then reports status 0 because the error response
 * has no Access-Control-Allow-Origin.
 */
export function browserPartUrlProblem(url: string): string | null {
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return "Part URL is not a valid URL.";
  }
  for (const key of params.keys()) {
    const name = key.toLowerCase();
    if (
      name.startsWith("x-amz-checksum-") ||
      name === "x-amz-sdk-checksum-algorithm"
    ) {
      return "Part URL includes a checksum the browser cannot send. Backblaze closes the connection while the part is uploading.";
    }
  }
  return null;
}

export function isMissingMultipartUpload(err: unknown): boolean {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: unknown }).name)
      : "";
  const code =
    err && typeof err === "object" && "Code" in err
      ? String((err as { Code?: unknown }).Code)
      : "";
  const message = err instanceof Error ? err.message : "";
  return (
    name === "NoSuchUpload" ||
    code === "NoSuchUpload" ||
    /NoSuchUpload|specified upload does not exist|upload does not exist/i.test(
      message,
    )
  );
}
