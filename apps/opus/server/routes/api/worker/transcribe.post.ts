import { timingSafeEqual } from "node:crypto";

import { runWithRequestContext } from "@agent-native/core/server";
import { transcribeWithBuilder } from "@agent-native/core/transcription/builder";
import {
  defineEventHandler,
  getHeader,
  readRawBody,
  setResponseStatus,
} from "h3";

const MAX_BYTES = 20 * 1024 * 1024;

function authorized(header: string | undefined): boolean {
  const expected = process.env.MEDIA_WORKER_SECRET?.trim();
  if (!expected) return false;
  const presented = header?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const left = Buffer.from(presented);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function wordsFromBuilder(result: Awaited<ReturnType<typeof transcribeWithBuilder>>) {
  const words: Array<{
    text: string;
    startMs: number;
    endMs: number;
    speaker?: string;
  }> = [];
  for (const segment of result.segments ?? []) {
    const speaker =
      typeof segment.speakerLabel === "string" ? segment.speakerLabel : undefined;
    const timed = segment.words ?? [];
    if (timed.length === 0 && segment.text) {
      const parts = String(segment.text).split(/\s+/).filter(Boolean);
      const start = Math.round(segment.startMs ?? 0);
      const end = Math.round(segment.endMs ?? start);
      const span = Math.max(1, end - start);
      parts.forEach((text, index) => {
        words.push({
          text,
          startMs: start + Math.round((span * index) / parts.length),
          endMs: start + Math.round((span * (index + 1)) / parts.length),
          speaker,
        });
      });
      continue;
    }
    for (const word of timed) {
      const text = String(word.text ?? "").trim();
      if (!text) continue;
      words.push({
        text,
        startMs: Math.round(word.startMs),
        endMs: Math.round(word.endMs),
        speaker,
      });
    }
  }
  return words;
}

/**
 * Machine callback for the media worker. The worker posts one audio chunk.
 * This route uses the app's Builder connection, so the worker does not need
 * its own Builder private key. MEDIA_WORKER_SECRET is the only shared secret.
 */
export default defineEventHandler(async (event) => {
  if (!process.env.MEDIA_WORKER_SECRET?.trim()) {
    setResponseStatus(event, 503);
    return { error: "MEDIA_WORKER_SECRET is not configured." };
  }
  if (!authorized(getHeader(event, "authorization"))) {
    setResponseStatus(event, 401);
    return { error: "Unauthorized." };
  }
  const length = Number(getHeader(event, "content-length") ?? 0);
  if (!Number.isFinite(length) || length <= 0 || length > MAX_BYTES) {
    setResponseStatus(event, 413);
    return { error: "Audio chunk is missing or too large." };
  }
  const ownerEmail = getHeader(event, "x-opus-owner-email")?.trim() ?? "";
  if (ownerEmail && !/^[^\s@]+@[^\s@]+$/.test(ownerEmail)) {
    setResponseStatus(event, 400);
    return { error: "Owner email is invalid." };
  }
  const orgId = getHeader(event, "x-opus-org-id")?.trim() || undefined;
  const body = await readRawBody(event, false);
  if (!body || body.byteLength === 0) {
    setResponseStatus(event, 400);
    return { error: "Audio chunk is empty." };
  }
  try {
    const result = await runWithRequestContext(
      { userEmail: ownerEmail || undefined, orgId },
      () =>
        transcribeWithBuilder({
          audioBytes: new Uint8Array(body),
          mimeType: "audio/mpeg",
          diarize: true,
          timeoutMs: 10 * 60 * 1000,
        }),
    );
    return {
      words: wordsFromBuilder(result),
      language: result.language ?? null,
    };
  } catch (error) {
    setResponseStatus(event, 502);
    return {
      error: error instanceof Error ? error.message : "Transcription failed.",
    };
  }
});
