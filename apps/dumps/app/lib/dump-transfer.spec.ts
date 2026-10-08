import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@agent-native/core/client/hooks", () => ({
  callAction: vi.fn(),
  actionErrorMessage: (error: unknown) => {
    if (!error || typeof error !== "object" || !("actionMessage" in error)) {
      return undefined;
    }
    const value = (error as { actionMessage?: unknown }).actionMessage;
    return typeof value === "string" ? value : undefined;
  },
}));

import { callAction } from "@agent-native/core/client/hooks";

import { signParts } from "../../../../packages/object-storage/src/index.ts";
import {
  BROWSER_MAX_PART_BYTES as serverMaxPartBytes,
  browserPartUrlProblem,
  isMissingMultipartUpload,
  planParts,
  s3ErrorCode,
  s3ErrorMessage,
} from "../../../../packages/object-storage/src/parts.ts";
import {
  BROWSER_MAX_PART_BYTES,
  coerceByteCount,
  missingPartNumbers,
  isRecoverableTransferError,
  normalizeStoredParts,
  PART_ATTEMPTS,
  PART_CONCURRENCY,
  PART_STALL_MS,
  partByteRange,
  partConcurrencyFor,
  partUploadError,
  resumeDumpFile,
  runMultipartUpload,
  SERIAL_UPLOAD_BYTES,
  shouldRetryPartStatus,
  transferErrorMessage,
} from "./dump-transfer";

const call = vi.mocked(callAction);

describe("planParts", () => {
  it("sends every file up to about 78 GiB in 8 MiB parts", () => {
    expect(planParts(0)).toEqual({ partSize: 8 * 1024 * 1024, partCount: 1 });
    expect(planParts(100 * 1024 * 1024).partSize).toBe(8 * 1024 * 1024);
    const threePointNineGb = planParts(3_900_000_000);
    expect(threePointNineGb.partSize).toBe(8 * 1024 * 1024);
    expect(threePointNineGb.partCount).toBe(465);
  });

  it("plans a 16 GiB file as 2,048 parts of 8 MiB", () => {
    const sixteenGib = 16 * 1024 ** 3;
    const plan = planParts(sixteenGib);
    expect(BROWSER_MAX_PART_BYTES).toBe(serverMaxPartBytes);
    expect(plan.partSize).toBe(8 * 1024 * 1024);
    expect(plan.partSize).toBe(BROWSER_MAX_PART_BYTES);
    expect(plan.partCount).toBe(2048);
    expect(plan.partCount).toBeLessThanOrEqual(10_000);
    expect(planParts(17_187_792_609).partSize).toBe(8 * 1024 * 1024);
  });

  it("stays under 10,000 parts for a multi-terabyte file", () => {
    const plan = planParts(5 * 1024 ** 4);
    expect(plan.partCount).toBeLessThanOrEqual(10_000);
    expect(plan.partSize).toBeGreaterThan(8 * 1024 * 1024);
    expect(planParts(10_000 * 8 * 1024 * 1024).partCount).toBe(10_000);
  });
});

describe("part ranges", () => {
  it("places a part past 6 GiB without string-concatenating the part size", () => {
    const partSize = coerceByteCount("33554432", "part size");
    const range = partByteRange(193, partSize, 16 * 1024 ** 3);
    expect(range.offset).toBe(192 * 33_554_432);
    expect(range.offset).toBe(6 * 1024 ** 3);
    expect(range.size).toBe(33_554_432);
    expect(String(range.offset + partSize)).not.toBe(
      `${range.offset}${partSize}`,
    );
  });

  it("skips stored parts even when their numbers arrived as strings", () => {
    const done = normalizeStoredParts([
      { partNumber: "1", etag: '"aaa"' },
      { partNumber: "2", etag: '"bbb"' },
    ]);
    expect(missingPartNumbers(4, done)).toEqual([3, 4]);
  });
});

describe("transfer errors", () => {
  it("shows the client error instead of a generic resume failure", () => {
    expect(
      transferErrorMessage(
        new Error(
          "Part upload failed (403). <Code>SignatureDoesNotMatch</Code>",
        ),
        "Resume failed.",
      ),
    ).toBe("Part upload failed (403). <Code>SignatureDoesNotMatch</Code>");
  });

  it("prefers the action message and strips a transport prefix", () => {
    expect(
      transferErrorMessage(
        Object.assign(new Error("Action list-dump-parts failed: internal"), {
          actionMessage:
            "Backblaze rejected the request. Check the bucket endpoint, region, and key permissions.",
        }),
        "Resume failed.",
      ),
    ).toMatch(/Backblaze rejected/);
    expect(
      transferErrorMessage(
        new Error("Action sign-dump-parts failed: Failed to fetch"),
        "Resume failed.",
      ),
    ).toBe("Failed to fetch");
    expect(
      transferErrorMessage(
        new Error("Action sign-dump-parts failed"),
        "Resume failed.",
      ),
    ).toBe("Resume failed.");
  });

  it("retries only transient part statuses", () => {
    expect(shouldRetryPartStatus(403, 1)).toBe(false);
    expect(shouldRetryPartStatus(0, 1)).toBe(true);
    expect(shouldRetryPartStatus(503, PART_ATTEMPTS - 1)).toBe(true);
    expect(shouldRetryPartStatus(503, PART_ATTEMPTS)).toBe(false);
    expect(shouldRetryPartStatus(-1, 1)).toBe(false);
    expect(partUploadError(403, "<Code>AccessDenied</Code>", false)).toContain(
      "403",
    );
    expect(partUploadError(200, "", true)).toContain("ETag");
    expect(partUploadError(0, "", false)).toMatch(
      /connection to Backblaze dropped/i,
    );
  });

  it("rejects a part URL that carries an empty checksum", () => {
    const url =
      "https://bucket.s3.us-east-005.backblazeb2.com/key?partNumber=1&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32";
    expect(browserPartUrlProblem(url)).toMatch(/checksum/i);
    expect(
      browserPartUrlProblem(
        "https://bucket.s3.us-east-005.backblazeb2.com/key?partNumber=1&X-Amz-SignedHeaders=host",
      ),
    ).toBeNull();
  });

  it("signs part URLs the browser can PUT", async () => {
    const previousId = process.env.B2_KEY_ID;
    const previousKey = process.env.B2_APPLICATION_KEY;
    process.env.B2_KEY_ID = "TESTKEYID";
    process.env.B2_APPLICATION_KEY = "testsecret";
    try {
      const parts = await signParts({
        key: "org/example/files/id/clip.mp4",
        uploadId: "upload-id",
        partNumbers: [1],
      });
      const url = new URL(parts[0]?.url ?? "");
      expect(browserPartUrlProblem(url.toString())).toBeNull();
      expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("host");
      expect(url.searchParams.get("X-Amz-Content-Sha256")).toBe(
        "UNSIGNED-PAYLOAD",
      );
      expect(url.searchParams.has("x-amz-checksum-crc32")).toBe(false);
      expect(url.searchParams.has("x-amz-sdk-checksum-algorithm")).toBe(false);
    } finally {
      if (previousId === undefined) delete process.env.B2_KEY_ID;
      else process.env.B2_KEY_ID = previousId;
      if (previousKey === undefined) delete process.env.B2_APPLICATION_KEY;
      else process.env.B2_APPLICATION_KEY = previousKey;
    }
  });

  it("uploads one part at a time once the file reaches 1 GiB", () => {
    expect(partConcurrencyFor(SERIAL_UPLOAD_BYTES - 1)).toBe(PART_CONCURRENCY);
    expect(partConcurrencyFor(13 * 1000 ** 3)).toBe(1);
    expect(partConcurrencyFor(16 * 1024 ** 3)).toBe(1);
  });

  it("recognizes a missing multipart session", () => {
    expect(
      isMissingMultipartUpload(
        Object.assign(new Error("gone"), { name: "NoSuchUpload" }),
      ),
    ).toBe(true);
    expect(
      isMissingMultipartUpload(
        new Error("The specified upload does not exist."),
      ),
    ).toBe(true);
    expect(isMissingMultipartUpload(new Error("SlowDown"))).toBe(false);
  });
});

describe("multipart resume", () => {
  beforeEach(() => {
    call.mockReset();
  });

  it("puts the file slice without adding a content type", async () => {
    const file = new File([new Uint8Array(10)], "clip.mp4", {
      type: "video/mp4",
    });
    let contentType = "unset";
    await runMultipartUpload({
      id: "typed",
      file,
      partSize: 10,
      partCount: 1,
      done: new Map(),
      signal: new AbortController().signal,
      onProgress: () => undefined,
      sign: async (partNumbers) =>
        partNumbers.map((partNumber) => ({
          partNumber,
          url: "https://b2.test/1",
        })),
      put: async (_url, body) => {
        contentType = body.type;
        expect(body.size).toBe(10);
        return '"etag"';
      },
      complete: async () => undefined,
    });
    expect(contentType).toBe("");
  });

  it("keeps a part whose response never reached the browser", async () => {
    const file = new File([new Uint8Array(20)], "clip.mp4");
    call.mockImplementation(async (name) => {
      if (name === "list-dump-parts") {
        return {
          id: "file-landed",
          parts: [{ partNumber: 1, etag: '"landed"' }],
        };
      }
      throw new Error(`unexpected ${String(name)}`);
    });
    let puts = 0;
    await runMultipartUpload({
      id: "file-landed",
      file,
      partSize: 20,
      partCount: 1,
      done: new Map(),
      signal: new AbortController().signal,
      onProgress: () => undefined,
      sign: async (partNumbers) =>
        partNumbers.map((partNumber) => ({
          partNumber,
          url: "https://b2.test/1",
        })),
      put: async () => {
        puts += 1;
        throw Object.assign(new Error("closed"), { status: 0 });
      },
      complete: async (parts) => {
        expect(parts).toEqual([{ partNumber: 1, etag: '"landed"' }]);
      },
    });
    expect(puts).toBe(1);
  });

  it("adopts a stored part when the real PUT cannot read a response", async () => {
    const file = new File([new Uint8Array(20)], "clip.mp4", {
      type: "video/mp4",
    });
    call.mockImplementation(async (name, params) => {
      if (name === "sign-dump-parts") {
        const partNumbers = (params as { partNumbers: number[] }).partNumbers;
        return {
          parts: partNumbers.map((partNumber) => ({
            partNumber,
            url: `https://b2.test/${partNumber}`,
          })),
        };
      }
      if (name === "list-dump-parts") {
        return {
          id: "file-xhr",
          parts: [{ partNumber: 1, etag: '"from-list"' }],
        };
      }
      if (name === "complete-dump-upload") {
        const parts = (
          params as { parts: Array<{ partNumber: number; etag: string }> }
        ).parts;
        expect(parts).toEqual([{ partNumber: 1, etag: '"from-list"' }]);
        return { id: "file-xhr" };
      }
      throw new Error(`unexpected ${String(name)}`);
    });
    const original = globalThis.XMLHttpRequest;
    class FakeXhr {
      status = 0;
      responseText = "";
      timeout = 0;
      upload = { onprogress: (_event: ProgressEvent) => undefined };
      private errorHandler: (() => void) | null = null;
      open() {}
      set responseType(_value: string) {}
      set withCredentials(_value: boolean) {}
      addEventListener() {}
      getResponseHeader() {
        return null;
      }
      send(body: ArrayBuffer) {
        expect(body.byteLength).toBe(20);
        this.errorHandler?.();
      }
      set onload(_handler: () => void) {}
      set onerror(handler: () => void) {
        this.errorHandler = handler;
      }
      set ontimeout(_handler: () => void) {}
      set onabort(_handler: () => void) {}
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    try {
      await runMultipartUpload({
        id: "file-xhr",
        file,
        partSize: 20,
        partCount: 1,
        done: new Map(),
        signal: new AbortController().signal,
        onProgress: () => undefined,
      });
      expect(call.mock.calls.map((entry) => entry[0])).toEqual([
        "sign-dump-parts",
        "list-dump-parts",
        "complete-dump-upload",
      ]);
    } finally {
      if (original) vi.stubGlobal("XMLHttpRequest", original);
      else vi.unstubAllGlobals();
    }
  });

  it("uploads only missing parts and completes with the stored ETags", async () => {
    const file = new File([new Uint8Array(100)], "clip.mp4", {
      type: "video/mp4",
    });
    const signed: number[][] = [];
    const uploaded: Array<{ partNumber: number; size: number }> = [];
    let inFlight = 0;
    let maxInFlight = 0;
    await runMultipartUpload({
      id: "file-1",
      file,
      partSize: 40,
      partCount: 3,
      done: new Map([
        [1, '"one"'],
        [2, '"two"'],
      ]),
      signal: new AbortController().signal,
      onProgress: () => undefined,
      sign: async (partNumbers) => {
        signed.push(partNumbers);
        return partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://example.test/${partNumber}`,
        }));
      },
      put: async (_url, body) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        uploaded.push({ partNumber: uploaded.length + 3, size: body.size });
        return `"part-${body.size}"`;
      },
      complete: async (parts) => {
        expect(parts.map((part) => part.partNumber)).toEqual([1, 2, 3]);
        expect(parts[0]?.etag).toBe('"one"');
        expect(parts[2]?.etag).toBe('"part-20"');
      },
    });
    expect(signed).toEqual([[3]]);
    expect(uploaded).toEqual([{ partNumber: 3, size: 20 }]);
    expect(maxInFlight).toBeLessThanOrEqual(PART_CONCURRENCY);
  });

  it("keeps at most three part uploads in flight", async () => {
    const file = new File([new Uint8Array(80)], "wide.bin");
    let inFlight = 0;
    let maxInFlight = 0;
    await runMultipartUpload({
      id: "file-2",
      file,
      partSize: 10,
      partCount: 8,
      done: new Map(),
      signal: new AbortController().signal,
      onProgress: () => undefined,
      sign: async (partNumbers) =>
        partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://example.test/${partNumber}`,
        })),
      put: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 15));
        inFlight -= 1;
        return '"etag"';
      },
      complete: async (parts) => {
        expect(parts).toHaveLength(8);
      },
    });
    expect(maxInFlight).toBe(PART_CONCURRENCY);
  });

  it("does not move the progress total backward when a part resets", async () => {
    const file = new File([new Uint8Array(80)], "clip.mp4");
    const seen: number[] = [];
    await runMultipartUpload({
      id: "file-progress",
      file,
      partSize: 40,
      partCount: 2,
      done: new Map(),
      signal: new AbortController().signal,
      onProgress: (loaded) => seen.push(loaded),
      sign: async (partNumbers) =>
        partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://example.test/${partNumber}`,
        })),
      put: async (_url, body, _signal, onBytes) => {
        onBytes(body.size);
        onBytes(Math.floor(body.size / 5));
        return '"etag"';
      },
      complete: async () => undefined,
    });
    expect(seen.length).toBeGreaterThan(1);
    for (let index = 1; index < seen.length; index += 1) {
      expect(seen[index]).toBeGreaterThanOrEqual(seen[index - 1] ?? 0);
    }
    expect(seen[seen.length - 1]).toBe(file.size);
  });

  it("retries a reset part without dropping the parts beside it", async () => {
    const file = new File([new Uint8Array(80)], "clip.mp4");
    const attempts = new Map<number, number>();
    await runMultipartUpload({
      id: "file-reset",
      file,
      partSize: 40,
      partCount: 2,
      done: new Map(),
      signal: new AbortController().signal,
      onProgress: () => undefined,
      sign: async (partNumbers) =>
        partNumbers.map((partNumber) => ({
          partNumber,
          url: `https://example.test/${partNumber}`,
        })),
      put: async (url) => {
        const partNumber = Number(new URL(url).pathname.slice(1));
        const count = (attempts.get(partNumber) ?? 0) + 1;
        attempts.set(partNumber, count);
        if (partNumber === 1 && count === 1) {
          throw Object.assign(new Error("closed"), { status: 0 });
        }
        return `"${partNumber}"`;
      },
      complete: async (parts) => {
        expect(parts.map((part) => part.etag)).toEqual(['"1"', '"2"']);
      },
    });
    expect(attempts.get(1)).toBe(2);
    expect(attempts.get(2)).toBe(1);
  });

  it("continues a listed upload from the first missing part", async () => {
    const file = new File(
      [new Uint8Array(80)],
      "DJI_20261003104831_0003_D.MP4",
    );
    call.mockImplementation(async (name, params) => {
      if (name === "list-dump-parts") {
        return {
          id: "row-1",
          filename: file.name,
          sizeBytes: file.size,
          partSize: 40,
          partCount: 2,
          parts: [{ partNumber: 1, etag: '"stored"' }],
        };
      }
      if (name === "sign-dump-parts") {
        const partNumbers = (params as { partNumbers: number[] }).partNumbers;
        expect(partNumbers).toEqual([2]);
        return {
          parts: partNumbers.map((partNumber) => ({
            partNumber,
            url: `https://b2.test/${partNumber}`,
          })),
        };
      }
      if (name === "complete-dump-upload") {
        const parts = (
          params as { parts: Array<{ partNumber: number; etag: string }> }
        ).parts;
        expect(parts).toEqual([
          { partNumber: 1, etag: '"stored"' },
          { partNumber: 2, etag: '"next"' },
        ]);
        return { id: "row-1" };
      }
      throw new Error(`unexpected ${String(name)}`);
    });
    const original = globalThis.XMLHttpRequest;
    class FakeXhr {
      status = 200;
      responseText = "";
      upload = { onprogress: (_event: ProgressEvent) => undefined };
      private load: (() => void) | null = null;
      open() {}
      set responseType(_value: string) {}
      set withCredentials(_value: boolean) {}
      addEventListener() {}
      getResponseHeader() {
        return '"next"';
      }
      send(body: ArrayBuffer) {
        expect(body.byteLength).toBe(40);
        this.load?.();
      }
      set onload(handler: () => void) {
        this.load = handler;
      }
      set onerror(_handler: () => void) {}
      set onabort(_handler: () => void) {}
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    try {
      const result = await resumeDumpFile({
        id: "row-1",
        file,
        signal: new AbortController().signal,
        onProgress: () => undefined,
      });
      expect(result).toEqual({});
      expect(call.mock.calls.map((entry) => entry[0])).toEqual([
        "list-dump-parts",
        "sign-dump-parts",
        "complete-dump-upload",
      ]);
    } finally {
      if (original) vi.stubGlobal("XMLHttpRequest", original);
      else vi.unstubAllGlobals();
    }
  });

  it("restarts when the Backblaze session is gone and explains that", async () => {
    const file = new File([new Uint8Array(40)], "clip.mp4");
    call.mockImplementation(async (name) => {
      if (name === "list-dump-parts") {
        throw Object.assign(
          new Error(
            "Action list-dump-parts failed: Backblaze no longer has this upload session",
          ),
          {
            errorCode: "upload_session_missing",
            actionMessage:
              "Backblaze no longer has this upload session, so parts already sent cannot be resumed.",
          },
        );
      }
      if (name === "restart-dump-upload") {
        return {
          id: "row-1",
          filename: file.name,
          sizeBytes: String(file.size),
          partSize: "40",
          partCount: "1",
          parts: [],
          restarted: true,
          message:
            "Backblaze dropped the open upload for clip.mp4, so parts already sent cannot be resumed. Sending the file again from the start.",
        };
      }
      if (name === "sign-dump-parts") {
        return { parts: [{ partNumber: "1", url: "https://b2.test/1" }] };
      }
      if (name === "complete-dump-upload") return { id: "row-1" };
      throw new Error(`unexpected ${String(name)}`);
    });
    const original = globalThis.XMLHttpRequest;
    class FakeXhr {
      status = 200;
      responseText = "";
      upload = { onprogress: (_event: ProgressEvent) => undefined };
      private load: (() => void) | null = null;
      open() {}
      set responseType(_value: string) {}
      set withCredentials(_value: boolean) {}
      getResponseHeader() {
        return '"fresh"';
      }
      send() {
        this.load?.();
      }
      set onload(handler: () => void) {
        this.load = handler;
      }
      set onerror(_handler: () => void) {}
      set onabort(_handler: () => void) {}
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    try {
      const result = await resumeDumpFile({
        id: "row-1",
        file,
        signal: new AbortController().signal,
        onProgress: () => undefined,
      });
      expect(result.message).toMatch(/from the start/);
      expect(call.mock.calls.map((entry) => entry[0])).toContain(
        "restart-dump-upload",
      );
    } finally {
      if (original) vi.stubGlobal("XMLHttpRequest", original);
      else vi.unstubAllGlobals();
    }
  });

  it("replaces an empty upload whose parts are too large to finish", async () => {
    const file = new File([new Uint8Array(40)], "DJI_shop video_0003_D.MP4");
    call.mockImplementation(async (name, params) => {
      if (name === "list-dump-parts") {
        return {
          id: "row-big",
          filename: file.name,
          sizeBytes: file.size,
          partSize: 128 * 1024 * 1024,
          partCount: 1,
          parts: [],
        };
      }
      if (name === "restart-dump-upload") {
        expect(params).toEqual({ id: "row-big", replaceEmpty: true });
        return {
          id: "row-big",
          filename: file.name,
          sizeBytes: file.size,
          partSize: 40,
          partCount: 1,
          parts: [],
          restarted: true,
          message: "Sending it again in smaller parts.",
        };
      }
      if (name === "sign-dump-parts") {
        return { parts: [{ partNumber: 1, url: "https://b2.test/1" }] };
      }
      if (name === "complete-dump-upload") return { id: "row-big" };
      throw new Error(`unexpected ${String(name)}`);
    });
    const original = globalThis.XMLHttpRequest;
    class FakeXhr {
      status = 200;
      responseText = "";
      upload = { onprogress: (_event: ProgressEvent) => undefined };
      private load: (() => void) | null = null;
      open() {}
      set responseType(_value: string) {}
      set withCredentials(_value: boolean) {}
      getResponseHeader() {
        return '"small"';
      }
      send(body: ArrayBuffer) {
        expect(body.byteLength).toBe(40);
        this.load?.();
      }
      set onload(handler: () => void) {
        this.load = handler;
      }
      set onerror(_handler: () => void) {}
      set onabort(_handler: () => void) {}
      abort() {}
    }
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    try {
      const result = await resumeDumpFile({
        id: "row-big",
        file,
        signal: new AbortController().signal,
        onProgress: () => undefined,
      });
      expect(result.message).toMatch(/smaller parts/);
      expect(call.mock.calls.map((entry) => entry[0])).toEqual([
        "list-dump-parts",
        "restart-dump-upload",
        "sign-dump-parts",
        "complete-dump-upload",
      ]);
    } finally {
      if (original) vi.stubGlobal("XMLHttpRequest", original);
      else vi.unstubAllGlobals();
    }
  });

  it("keeps an in-progress upload that already stored parts", async () => {
    const file = new File([new Uint8Array(40)], "keep.mp4");
    call.mockImplementation(async (name) => {
      if (name === "list-dump-parts") {
        return {
          id: "row-keep",
          filename: file.name,
          sizeBytes: file.size,
          partSize: 128 * 1024 * 1024,
          partCount: 1,
          parts: [{ partNumber: 1, etag: '"stored"' }],
        };
      }
      if (name === "complete-dump-upload") return { id: "row-keep" };
      throw new Error(`unexpected ${String(name)}`);
    });
    const result = await resumeDumpFile({
      id: "row-keep",
      file,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    expect(result).toEqual({});
    expect(call.mock.calls.map((entry) => entry[0])).toEqual([
      "list-dump-parts",
      "complete-dump-upload",
    ]);
  });

  it("rejects a different file with the sizes, not a generic failure", async () => {
    call.mockResolvedValue({
      id: "row-1",
      filename: "clip.mp4",
      sizeBytes: 80,
      partSize: 40,
      partCount: 2,
      parts: [],
    });
    const file = new File([new Uint8Array(10)], "clip.mp4");
    await expect(
      resumeDumpFile({
        id: "row-1",
        file,
        signal: new AbortController().signal,
        onProgress: () => undefined,
      }),
    ).rejects.toThrow(/80 bytes and the selected file is 10 bytes/);
    try {
      await resumeDumpFile({
        id: "row-1",
        file,
        signal: new AbortController().signal,
        onProgress: () => undefined,
      });
    } catch (error) {
      expect(transferErrorMessage(error, "Resume failed.")).toMatch(/80 bytes/);
    }
  });
});

describe("S3 error bodies", () => {
  it("reads the code and message Backblaze returns", () => {
    const body =
      "<?xml version='1.0'?><Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated does not match.</Message></Error>";
    expect(s3ErrorCode(body)).toBe("SignatureDoesNotMatch");
    expect(s3ErrorMessage(body)).toMatch(/signature we calculated/);
    expect(s3ErrorCode("")).toBeNull();
    expect(s3ErrorMessage("plain text")).toBeNull();
  });
});

describe("recoverable transfer errors", () => {
  it("retries connection loss and server trouble, not rejections", () => {
    expect(
      isRecoverableTransferError(Object.assign(new Error("x"), { status: 0 })),
    ).toBe(true);
    expect(
      isRecoverableTransferError(
        Object.assign(new Error("x"), { status: 503 }),
      ),
    ).toBe(true);
    expect(
      isRecoverableTransferError(
        Object.assign(new Error("x"), { status: 403 }),
      ),
    ).toBe(false);
    expect(
      isRecoverableTransferError(
        Object.assign(new Error("x"), { status: -1, fileRead: true }),
      ),
    ).toBe(false);
    expect(
      isRecoverableTransferError(
        new Error("Uploaded 3 of 9 parts. Resume to continue."),
      ),
    ).toBe(true);
    expect(isRecoverableTransferError(new Error("Failed to fetch"))).toBe(true);
    expect(
      isRecoverableTransferError(
        Object.assign(new Error("Action x failed"), {
          errorCode: "upload_not_open",
        }),
      ),
    ).toBe(false);
    expect(isRecoverableTransferError(new Error("Upload cancelled."))).toBe(
      false,
    );
  });
});

describe("auto-resume", () => {
  beforeEach(() => {
    call.mockReset();
  });

  const signer = async (partNumbers: number[]) =>
    partNumbers.map((partNumber) => ({
      partNumber,
      url: `https://b2.test/${partNumber}`,
    }));

  it("lists stored parts and keeps going after a part runs out of retries", async () => {
    const file = new File([new Uint8Array(30)], "clip.mp4");
    let puts = 0;
    const notes: Array<string | null> = [];
    let completed: Array<{ partNumber: number; etag: string }> = [];
    await runMultipartUpload({
      id: "flaky",
      file,
      partSize: 10,
      partCount: 3,
      done: new Map(),
      signal: new AbortController().signal,
      onProgress: () => undefined,
      sign: signer,
      put: async (url) => {
        puts += 1;
        // Part 2 keeps failing until the second round. Backblaze stored it.
        if (url.endsWith("/2") && puts < 6) {
          throw Object.assign(new Error("reset"), { status: 0 });
        }
        return `"etag-${url.slice(-1)}"`;
      },
      listStored: async () => [{ partNumber: 2, etag: '"listed-2"' }],
      roundDelayMs: () => 0,
      onStatus: (note) => notes.push(note),
      complete: async (parts) => {
        completed = parts;
      },
    });
    expect(completed.map((part) => part.partNumber)).toEqual([1, 2, 3]);
    expect(completed.find((part) => part.partNumber === 2)?.etag).toBe(
      '"listed-2"',
    );
    expect(notes[0]).toMatch(/Lost the connection to Backblaze/);
    expect(notes[notes.length - 1]).toBeNull();
  });

  it("stops after several rounds that store nothing and says what Backblaze told the server", async () => {
    const file = new File([new Uint8Array(10)], "clip.mp4");
    let listed = 0;
    let diagnosed = 0;
    await expect(
      runMultipartUpload({
        id: "dead",
        file,
        partSize: 10,
        partCount: 1,
        done: new Map(),
        signal: new AbortController().signal,
        onProgress: () => undefined,
        sign: signer,
        put: async () => {
          throw Object.assign(new Error(partUploadError(0, "", false)), {
            status: 0,
          });
        },
        listStored: async () => {
          listed += 1;
          return [];
        },
        diagnose: async () => {
          diagnosed += 1;
          return "Backblaze accepted a test part from the server.";
        },
        roundDelayMs: () => 0,
        complete: async () => undefined,
      }),
    ).rejects.toThrow(
      /connection to Backblaze dropped.*Backblaze accepted a test part/s,
    );
    expect(diagnosed).toBe(1);
    expect(listed).toBe(3);
  });

  it("does not retry or probe a rejection the browser can read", async () => {
    const file = new File([new Uint8Array(10)], "clip.mp4");
    let listed = 0;
    let diagnosed = 0;
    await expect(
      runMultipartUpload({
        id: "denied",
        file,
        partSize: 10,
        partCount: 1,
        done: new Map(),
        signal: new AbortController().signal,
        onProgress: () => undefined,
        sign: signer,
        put: async () => {
          throw Object.assign(new Error("Part upload failed (403)."), {
            status: 403,
          });
        },
        listStored: async () => {
          listed += 1;
          return [];
        },
        diagnose: async () => {
          diagnosed += 1;
          return null;
        },
        roundDelayMs: () => 0,
        complete: async () => undefined,
      }),
    ).rejects.toThrow(/403/);
    expect(listed).toBe(0);
    expect(diagnosed).toBe(0);
  });

  it("explains an unreadable file instead of calling it a dropped connection", async () => {
    const unreadable = {
      size: 10,
      slice: () => ({
        size: 10,
        arrayBuffer: async () => {
          throw new DOMException("gone", "NotReadableError");
        },
      }),
    } as unknown as Blob;
    let diagnosed = 0;
    await expect(
      runMultipartUpload({
        id: "unreadable",
        file: unreadable,
        partSize: 10,
        partCount: 1,
        done: new Map(),
        signal: new AbortController().signal,
        onProgress: () => undefined,
        sign: signer,
        listStored: async () => [],
        diagnose: async () => {
          diagnosed += 1;
          return null;
        },
        roundDelayMs: () => 0,
        complete: async () => undefined,
      }),
    ).rejects.toThrow(/could not read this file from disk/i);
    expect(diagnosed).toBe(0);
  });

  it("abandons a part that stops moving instead of waiting minutes", async () => {
    vi.useFakeTimers();
    const file = new File([new Uint8Array(20)], "clip.mp4");
    call.mockImplementation(async (name) => {
      if (name === "list-dump-parts") {
        return { id: "stall", parts: [{ partNumber: 1, etag: '"landed"' }] };
      }
      throw new Error(`unexpected ${String(name)}`);
    });
    const original = globalThis.XMLHttpRequest;
    let aborts = 0;
    class StalledXhr {
      status = 0;
      responseText = "";
      timeout = 0;
      upload: { onprogress?: unknown; onload?: unknown } = {};
      onabort: (() => void) | null = null;
      open() {}
      set responseType(_value: string) {}
      set withCredentials(_value: boolean) {}
      getResponseHeader() {
        return null;
      }
      send() {}
      abort() {
        aborts += 1;
        this.onabort?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", StalledXhr);
    try {
      let completed: Array<{ partNumber: number; etag: string }> = [];
      const upload = runMultipartUpload({
        id: "stall",
        file,
        partSize: 20,
        partCount: 1,
        done: new Map(),
        signal: new AbortController().signal,
        onProgress: () => undefined,
        sign: signer,
        complete: async (parts) => {
          completed = parts;
        },
      });
      await vi.advanceTimersByTimeAsync(PART_STALL_MS + 10_000);
      await upload;
      expect(aborts).toBe(1);
      expect(completed).toEqual([{ partNumber: 1, etag: '"landed"' }]);
    } finally {
      vi.useRealTimers();
      if (original) vi.stubGlobal("XMLHttpRequest", original);
      else vi.unstubAllGlobals();
    }
  });

  it("finishes without sending anything when Backblaze already holds the file", async () => {
    const file = new File([new Uint8Array(40)], "done.mp4");
    call.mockImplementation(async (name) => {
      if (name === "list-dump-parts") {
        throw Object.assign(new Error("missing"), {
          errorCode: "upload_session_missing",
        });
      }
      if (name === "restart-dump-upload") {
        return {
          id: "row-done",
          completed: true,
          message: "done.mp4 had already finished uploading.",
        };
      }
      throw new Error(`unexpected ${String(name)}`);
    });
    const result = await resumeDumpFile({
      id: "row-done",
      file,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    expect(result.message).toMatch(/already finished/);
    expect(call.mock.calls.map((entry) => entry[0])).toEqual([
      "list-dump-parts",
      "restart-dump-upload",
    ]);
  });
});
