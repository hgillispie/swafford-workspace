const MIN_PART_SIZE = 8 * 1024 * 1024;
/** Backblaze's recommended part is 100 MB. 128 MiB keeps multi-GB files near
 * the target part count without a 32 MiB cap that turns a 16 GiB upload into
 * 512 round trips. */
const MAX_PART_SIZE = 128 * 1024 * 1024;
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
