import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface StampedWord {
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string;
}

export interface TranscriptChunk {
  words: StampedWord[];
  language?: string | null;
}

const here = dirname(fileURLToPath(import.meta.url));

export interface TranscribeIdentity {
  ownerEmail?: string;
  orgId?: string | null;
}

export function providerName(): string {
  const explicit = process.env.TRANSCRIPTION_PROVIDER?.trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.MEDIA_APP_TRANSCRIBE_URL?.trim()) return "app";
  if (process.env.BUILDER_PRIVATE_KEY?.trim() || process.env.BUILDER_API_KEY?.trim()) {
    return "builder";
  }
  return "whisper";
}

export async function transcribeFile(
  filePath: string,
  offsetMs: number,
  provider = providerName(),
  identity: TranscribeIdentity = {},
): Promise<TranscriptChunk> {
  const chunk =
    provider === "app"
      ? await transcribeViaApp(filePath, identity)
      : provider === "builder"
        ? await transcribeBuilder(filePath)
        : provider === "assemblyai"
          ? await transcribeAssembly(filePath)
          : provider === "deepgram"
            ? await transcribeDeepgram(filePath)
            : await transcribeWhisper(filePath);
  return {
    language: chunk.language,
    words: chunk.words.map((word) => ({
      ...word,
      startMs: word.startMs + offsetMs,
      endMs: word.endMs + offsetMs,
    })),
  };
}

async function transcribeViaApp(
  filePath: string,
  identity: TranscribeIdentity,
): Promise<TranscriptChunk> {
  const url = process.env.MEDIA_APP_TRANSCRIBE_URL?.trim();
  const secret = process.env.MEDIA_WORKER_SECRET?.trim();
  if (!url || !secret) {
    throw new Error(
      "MEDIA_APP_TRANSCRIBE_URL and MEDIA_WORKER_SECRET are required for app transcription.",
    );
  }
  const bytes = await readFile(filePath);
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret}`,
    "content-type": "audio/mpeg",
    "content-length": String(bytes.byteLength),
  };
  if (identity.ownerEmail?.includes("@")) {
    headers["x-opus-owner-email"] = identity.ownerEmail;
  }
  if (identity.orgId) headers["x-opus-org-id"] = identity.orgId;
  const response = await fetch(url, { method: "POST", headers, body: bytes });
  const payload = (await response.json().catch(() => ({}))) as {
    words?: StampedWord[];
    language?: string | null;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(
      payload.error || `App transcription failed (${response.status}).`,
    );
  }
  return { words: payload.words ?? [], language: payload.language ?? null };
}

async function transcribeBuilder(filePath: string): Promise<TranscriptChunk> {
  const { transcribeWithBuilder } = await import(
    "@agent-native/core/transcription/builder"
  );
  const bytes = new Uint8Array(await readFile(filePath));
  const result = await transcribeWithBuilder({
    audioBytes: bytes,
    mimeType: "audio/mpeg",
    diarize: true,
    timeoutMs: 10 * 60 * 1000,
  });
  const words: StampedWord[] = [];
  for (const segment of result.segments ?? []) {
    const speaker =
      typeof segment.speakerLabel === "string" ? segment.speakerLabel : undefined;
    const timed = segment.words ?? [];
    if (timed.length === 0 && segment.text) {
      const parts = String(segment.text).split(/\s+/).filter(Boolean);
      const start = Math.round((segment.startMs ?? 0) as number);
      const end = Math.round((segment.endMs ?? start) as number);
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
  return { words, language: result.language ?? null };
}

async function transcribeAssembly(filePath: string): Promise<TranscriptChunk> {
  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!key) throw new Error("ASSEMBLYAI_API_KEY is not set.");
  const bytes = await readFile(filePath);
  const uploaded = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: key },
    body: bytes,
  });
  if (!uploaded.ok) {
    throw new Error(`AssemblyAI upload failed (${uploaded.status}).`);
  }
  const uploadBody = (await uploaded.json()) as { upload_url?: string };
  const created = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: key,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: uploadBody.upload_url,
      speaker_labels: true,
    }),
  });
  if (!created.ok) {
    throw new Error(`AssemblyAI transcript failed (${created.status}).`);
  }
  const job = (await created.json()) as { id: string };
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > 15 * 60 * 1000) {
      throw new Error("AssemblyAI timed out.");
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const poll = await fetch(
      `https://api.assemblyai.com/v2/transcript/${job.id}`,
      { headers: { authorization: key } },
    );
    const body = (await poll.json()) as {
      status?: string;
      error?: string;
      language_code?: string;
      words?: Array<{
        text: string;
        start: number;
        end: number;
        speaker?: string;
      }>;
    };
    if (body.status === "error") {
      throw new Error(body.error || "AssemblyAI failed.");
    }
    if (body.status === "completed") {
      return {
        language: body.language_code ?? null,
        words: (body.words ?? []).map((word) => ({
          text: word.text,
          startMs: word.start,
          endMs: word.end,
          speaker: word.speaker,
        })),
      };
    }
  }
}

async function transcribeDeepgram(filePath: string): Promise<TranscriptChunk> {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) throw new Error("DEEPGRAM_API_KEY is not set.");
  const bytes = await readFile(filePath);
  const response = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&smart_format=true&diarize=true",
    {
      method: "POST",
      headers: {
        authorization: `Token ${key}`,
        "content-type": "audio/mpeg",
      },
      body: bytes,
    },
  );
  if (!response.ok) {
    throw new Error(`Deepgram failed (${response.status}).`);
  }
  const body = (await response.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          words?: Array<{
            word: string;
            punctuated_word?: string;
            start: number;
            end: number;
            speaker?: number;
          }>;
        }>;
      }>;
    };
  };
  const words =
    body.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  return {
    words: words.map((word) => ({
      text: word.punctuated_word || word.word,
      startMs: Math.round(word.start * 1000),
      endMs: Math.round(word.end * 1000),
      speaker:
        word.speaker === undefined ? undefined : `speaker-${word.speaker}`,
    })),
  };
}

function transcribeWhisper(filePath: string): Promise<TranscriptChunk> {
  const script = join(here, "whisper_transcribe.py");
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [script, filePath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `whisper exited ${code}`));
        return;
      }
      const parsed = JSON.parse(stdout) as TranscriptChunk;
      resolve({
        language: parsed.language ?? null,
        words: parsed.words ?? [],
      });
    });
  });
}
