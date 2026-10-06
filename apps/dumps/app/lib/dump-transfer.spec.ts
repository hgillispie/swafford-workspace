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

import {
  BROWSER_MAX_PART_BYTES as serverMaxPartBytes,
  isMissingMultipartUpload,
  planParts,
} from "../../../../packages/object-storage/src/parts.ts";
import {
  BROWSER_MAX_PART_BYTES,
  coerceByteCount,
  missingPartNumbers,
  normalizeStoredParts,
  PART_CONCURRENCY,
  partByteRange,
  partUploadError,
  resumeDumpFile,
  runMultipartUpload,
  shouldRetryPartStatus,
  transferErrorMessage,
} from "./dump-transfer";

const call = vi.mocked(callAction);

describe("planParts", () => {
  it("keeps small and few-gigabyte files on modest parts", () => {
    expect(planParts(0)).toEqual({ partSize: 8 * 1024 * 1024, partCount: 1 });
    expect(planParts(100 * 1024 * 1024).partSize).toBe(8 * 1024 * 1024);
    const threePointNineGb = planParts(3_900_000_000);
    expect(threePointNineGb.partSize).toBe(32 * 1024 * 1024);
    expect(threePointNineGb.partCount).toBeLessThan(200);
  });

  it("caps a 16 GiB file at 32 MiB parts", () => {
    const sixteenGib = 16 * 1024 ** 3;
    const plan = planParts(sixteenGib);
    expect(BROWSER_MAX_PART_BYTES).toBe(serverMaxPartBytes);
    expect(plan.partSize).toBe(32 * 1024 * 1024);
    expect(plan.partSize).toBe(BROWSER_MAX_PART_BYTES);
    expect(plan.partCount).toBe(512);
    expect(plan.partCount).toBeLessThanOrEqual(10_000);
    expect(planParts(17_187_792_609).partSize).toBe(32 * 1024 * 1024);
  });

  it("stays under 10,000 parts for a multi-terabyte file", () => {
    const plan = planParts(5 * 1024 ** 4);
    expect(plan.partCount).toBeLessThanOrEqual(10_000);
    expect(plan.partSize).toBeGreaterThanOrEqual(8 * 1024 * 1024);
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
    expect(shouldRetryPartStatus(503, 4)).toBe(true);
    expect(shouldRetryPartStatus(503, 5)).toBe(false);
    expect(partUploadError(403, "<Code>AccessDenied</Code>", false)).toContain(
      "403",
    );
    expect(partUploadError(200, "", true)).toContain("ETag");
    expect(partUploadError(0, "", false)).toMatch(/closed the connection/i);
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
      send(body: Blob) {
        expect(body.size).toBe(40);
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
      send(body: Blob) {
        expect(body.size).toBe(40);
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
