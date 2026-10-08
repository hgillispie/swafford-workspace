const MIN_PART_SIZE = 8 * 1024 * 1024;
/**
 * Part size for browser uploads to the B2 S3 endpoint.
 *
 * 8 MiB matches the default of rclone and the AWS CLI, which already copy
 * multi-gigabyte files into this bucket from the shop machines. Larger browser
 * parts (128 MiB, then 32 MiB) kept dying before Backblaze answered. Backblaze error responses omit
 * Access-Control-Allow-Origin, so a reset, a rejected request, and a lost
 * Wi-Fi link all reach the browser as the same status 0. A short PUT has far
 * less time to be interrupted and a retry resends only 8 MiB. B2's own
 * minimum part is 5 MB. A 16 GiB file is 2,048 parts, well under the
 * 10,000-part limit. Files above about 78 GiB grow past this size so they stay
 * under that limit. An upload that already stored parts keeps the part size
 * recorded on its row.
 */
export const BROWSER_MAX_PART_BYTES = MIN_PART_SIZE;
const MAX_PARTS = 10_000;

export function planParts(sizeBytes: number): {
  partSize: number;
  partCount: number;
} {
  const size = Math.max(0, Math.floor(sizeBytes));
  if (size === 0) return { partSize: MIN_PART_SIZE, partCount: 1 };
  let partSize = MIN_PART_SIZE;
  if (size > partSize * MAX_PARTS) {
    partSize = Math.ceil(size / MAX_PARTS);
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

/** Pull the S3 error code out of an XML error body, if there is one. */
export function s3ErrorCode(body: string): string | null {
  const match = body.match(/<Code>\s*([^<\s][^<]*?)\s*<\/Code>/i);
  return match?.[1] ?? null;
}

/** Pull the S3 error message out of an XML error body, if there is one. */
export function s3ErrorMessage(body: string): string | null {
  const match = body.match(/<Message>\s*([^<]*?)\s*<\/Message>/i);
  return match?.[1] ?? null;
}
