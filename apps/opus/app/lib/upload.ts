import { callAction } from "@agent-native/core/client/hooks";

async function mapPool<T>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<void>,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await run(item);
      }
    }),
  );
}

async function putPart(url: string, body: Blob): Promise<string> {
  let lastError = "Upload part failed.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { method: "PUT", body });
    const etag = response.headers.get("etag");
    if (response.ok && etag) return etag;
    lastError = response.ok
      ? "Storage did not expose the part ETag."
      : `Part upload failed (${response.status}).`;
  }
  throw new Error(lastError);
}

export async function uploadVideoFile(
  file: File,
  onProgress: (ratio: number) => void,
): Promise<{ id: string }> {
  const started = (await callAction("start-video-upload", {
    filename: file.name,
    sizeBytes: file.size,
    contentType: file.type || "video/mp4",
  })) as { id: string; partSize: number; partCount: number };
  const done = new Map<number, string>();
  let loaded = 0;
  const missing = Array.from({ length: started.partCount }, (_, i) => i + 1);
  for (let start = 0; start < missing.length; start += 20) {
    const partNumbers = missing.slice(start, start + 20);
    const signed = (await callAction("sign-video-parts", {
      id: started.id,
      partNumbers,
    })) as { parts: Array<{ partNumber: number; url: string }> };
    await mapPool(signed.parts, 4, async (part) => {
      const offset = (part.partNumber - 1) * started.partSize;
      const blob = file.slice(offset, offset + started.partSize);
      const etag = await putPart(part.url, blob);
      done.set(part.partNumber, etag);
      loaded += blob.size;
      onProgress(file.size ? loaded / file.size : 1);
    });
  }
  const finished = (await callAction("complete-video-upload", {
    id: started.id,
    title: file.name.replace(/\.[^.]+$/, ""),
    parts: [...done.entries()].map(([partNumber, etag]) => ({
      partNumber,
      etag,
    })),
  })) as { id: string };
  return { id: finished.id };
}
