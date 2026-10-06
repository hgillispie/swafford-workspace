import { mkdir, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, join } from "node:path";

import {
  buildComposition,
  captionCues,
  cuesToSrt,
  type CutWord,
} from "@swafford-workspace/media-core";
import {
  downloadToFile,
  uploadFile,
} from "@swafford-workspace/object-storage";

import { phraseAss, writeAss } from "./captions.js";
import { enqueueJob, isCancelled, setProgress, type JobRow } from "./db.js";
import {
  JobCancelled,
  makeTempDir,
  probeMedia,
  progressFromFfmpeg,
  removeTemp,
  runFfmpeg,
} from "./ffmpeg.js";
import { renderOpus } from "./opus-render.js";
import { providerName, transcribeFile } from "./transcribe.js";

async function throwIfCancelled(id: string): Promise<void> {
  if (await isCancelled(id)) throw new JobCancelled();
}

async function localObject(key: string, dir: string): Promise<string> {
  const dest = join(dir, `source${extname(key) || ".bin"}`);
  await downloadToFile(key, dest);
  return dest;
}

function payloadOf(row: JobRow): Record<string, unknown> {
  return JSON.parse(row.payload || "{}") as Record<string, unknown>;
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Job payload is missing ${key}.`);
  }
  return value;
}

export async function handleJob(row: JobRow): Promise<unknown> {
  const payload = payloadOf(row);
  if (row.kind === "proxy") return renderProxy(row, payload);
  if (row.kind === "extract-audio") return extractAudio(row, payload);
  if (row.kind === "transcribe") return transcribe(row, payload);
  if (row.kind === "cutline-render") return renderCutline(row, payload);
  if (row.kind === "opus-render") return renderOpus(row, payload);
  if (row.kind === "ingest-youtube") return ingestYoutube(row, payload);
  throw new Error(`Unknown job kind ${row.kind}.`);
}

async function renderProxy(
  row: JobRow,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const sourceKey = stringField(payload, "sourceKey");
  const outputKey = stringField(payload, "outputKey");
  const dir = await makeTempDir("proxy-");
  try {
    await setProgress(row.id, 5, "Downloading source");
    const source = await localObject(sourceKey, dir);
    await throwIfCancelled(row.id);
    const output = join(dir, "proxy.mp4");
    const probed = await probeMedia(source);
    await setProgress(row.id, 15, "Encoding 720p proxy");
    await runFfmpeg(
      [
        "-i",
        source,
        "-vf",
        "scale=-2:720",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        output,
      ],
      (chunk) => {
        const progress = progressFromFfmpeg(chunk, probed.durationMs);
        if (progress !== null) {
          void setProgress(row.id, 15 + progress * 0.7, "Encoding 720p proxy");
        }
      },
    );
    await throwIfCancelled(row.id);
    await setProgress(row.id, 90, "Uploading proxy");
    await uploadFile({
      key: outputKey,
      filePath: output,
      contentType: "video/mp4",
    });
    const proxy = await probeMedia(output);
    return {
      outputKey,
      durationMs: proxy.durationMs || probed.durationMs,
      width: proxy.width,
      height: proxy.height,
    };
  } finally {
    await removeTemp(dir);
  }
}

async function extractAudio(
  row: JobRow,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const sourceKey = stringField(payload, "sourceKey");
  const outputPrefix = stringField(payload, "outputPrefix").replace(/\/$/, "");
  const chunkSeconds = Number(payload.chunkSeconds ?? 600) || 600;
  const dir = await makeTempDir("audio-");
  try {
    await setProgress(row.id, 8, "Extracting audio");
    const source = await localObject(sourceKey, dir);
    const full = join(dir, "full.mp3");
    await runFfmpeg([
      "-i",
      source,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      full,
    ]);
    await throwIfCancelled(row.id);
    const chunkDir = join(dir, "chunks");
    await mkdir(chunkDir);
    await runFfmpeg([
      "-i",
      full,
      "-f",
      "segment",
      "-segment_time",
      String(chunkSeconds),
      "-reset_timestamps",
      "1",
      join(chunkDir, "chunk-%03d.mp3"),
    ]);
    const names = (await readdir(chunkDir)).filter((name) => name.endsWith(".mp3")).sort();
    const chunks: Array<{ key: string; offsetMs: number; durationMs: number }> = [];
    let offset = 0;
    for (const [index, name] of names.entries()) {
      const file = join(chunkDir, name);
      const probed = await probeMedia(file);
      const key = `${outputPrefix}/chunk-${String(index).padStart(3, "0")}.mp3`;
      await uploadFile({ key, filePath: file, contentType: "audio/mpeg" });
      chunks.push({ key, offsetMs: offset, durationMs: probed.durationMs });
      offset += probed.durationMs;
      await setProgress(
        row.id,
        20 + ((index + 1) / names.length) * 70,
        `Uploaded audio chunk ${index + 1}`,
      );
    }
    if (payload.chainTranscribe === true) {
      await enqueueJob({
        app: row.app,
        kind: "transcribe",
        subjectId: row.subject_id,
        orgId: row.org_id,
        ownerEmail: row.owner_email,
        payload: {
          chunks,
          provider: payload.provider,
        },
      });
    }
    return { chunks, durationMs: offset };
  } finally {
    await removeTemp(dir);
  }
}

async function transcribe(
  row: JobRow,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const chunks = payload.chunks;
  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("Transcribe job has no audio chunks.");
  }
  const provider =
    typeof payload.provider === "string" ? payload.provider : providerName();
  const words: Array<{
    text: string;
    startMs: number;
    endMs: number;
    speaker?: string;
  }> = [];
  let language: string | null = null;
  const dir = await makeTempDir("asr-");
  try {
    for (const [index, chunk] of chunks.entries()) {
      const record = chunk as {
        key?: string;
        offsetMs?: number;
      };
      if (!record.key) throw new Error("Audio chunk is missing a key.");
      await throwIfCancelled(row.id);
      await setProgress(
        row.id,
        (index / chunks.length) * 90,
        `Transcribing chunk ${index + 1} of ${chunks.length}`,
      );
      const file = join(dir, `chunk-${index}.mp3`);
      await downloadToFile(record.key, file);
      const result = await transcribeFile(
        file,
        Number(record.offsetMs ?? 0),
        provider,
        { ownerEmail: row.owner_email, orgId: row.org_id },
      );
      language = language ?? result.language ?? null;
      words.push(...result.words);
    }
    return { words, language, provider };
  } finally {
    await removeTemp(dir);
  }
}

function encodePlan(
  quality: string,
  height: number | null,
): { scale: string | null; codec: string[] } {
  const draft = quality === "draft";
  const codec = [
    "-c:v",
    "libx264",
    "-preset",
    draft ? "veryfast" : "medium",
    "-crf",
    quality === "source" ? "18" : draft ? "28" : "20",
    "-pix_fmt",
    "yuv420p",
  ];
  if (quality === "source") return { scale: null, codec };
  const target = draft ? 720 : 1080;
  if (height && height <= target) return { scale: null, codec };
  return { scale: `scale=-2:${target}`, codec };
}

async function renderCutline(
  row: JobRow,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const sourceKey = stringField(payload, "sourceKey");
  const outputKey = stringField(payload, "outputKey");
  const words = (payload.words ?? []) as CutWord[];
  const quality = typeof payload.quality === "string" ? payload.quality : "standard";
  const captions = typeof payload.captions === "string" ? payload.captions : "none";
  const dir = await makeTempDir("cut-");
  try {
    await setProgress(row.id, 5, "Downloading original");
    const source = await localObject(sourceKey, dir);
    const probed = await probeMedia(source);
    const durationMs = Number(payload.mediaDurationMs ?? probed.durationMs) || probed.durationMs;
    const composition = buildComposition(words, durationMs);
    if (composition.segments.length === 0) {
      throw new Error("The edit has no remaining media.");
    }
    await throwIfCancelled(row.id);
    const output = join(dir, "edit.mp4");
    const cues = captionCues(words, durationMs);
    let assFile: string | null = null;
    if (captions === "burn" && cues.length > 0) {
      assFile = join(dir, "captions.ass");
      const width = probed.width ?? 1920;
      const height = probed.height ?? 1080;
      await writeAss(
        assFile,
        phraseAss({
          cues,
          width: quality === "draft" ? Math.round((width * 720) / (height || 720)) : width,
          height: quality === "draft" ? 720 : quality === "standard" ? Math.min(height, 1080) : height,
        }),
      );
    }
    const plan = encodePlan(quality, probed.height);
    await setProgress(row.id, 20, "Rendering edit");
    await renderSegments({
      source,
      output,
      segments: composition.segments,
      hasAudio: probed.hasAudio,
      durationMs: composition.durationMs,
      scale: plan.scale,
      codec: plan.codec,
      assFile,
      onProgress: (progress) => {
        void setProgress(row.id, 20 + progress * 0.65, "Rendering edit");
      },
    });
    await throwIfCancelled(row.id);
    await uploadFile({
      key: outputKey,
      filePath: output,
      contentType: "video/mp4",
    });
    let sidecarKey: string | null = null;
    if (captions === "sidecar" || captions === "burn") {
      sidecarKey =
        typeof payload.sidecarKey === "string"
          ? payload.sidecarKey
          : outputKey.replace(/\.mp4$/i, ".srt");
      const srt = join(dir, "captions.srt");
      await writeFile(srt, cuesToSrt(cues), "utf8");
      await uploadFile({
        key: sidecarKey,
        filePath: srt,
        contentType: "application/x-subrip",
      });
    }
    const rendered = await probeMedia(output);
    return {
      outputKey,
      sidecarKey,
      durationMs: rendered.durationMs,
      width: rendered.width,
      height: rendered.height,
    };
  } finally {
    await removeTemp(dir);
  }
}

async function renderSegments(input: {
  source: string;
  output: string;
  segments: Array<{ srcStart: number; srcEnd: number }>;
  hasAudio: boolean;
  durationMs: number;
  scale: string | null;
  codec: string[];
  assFile: string | null;
  onProgress: (progress: number) => void;
}): Promise<void> {
  const filters: string[] = [];
  const labels: string[] = [];
  input.segments.forEach((segment, index) => {
    const start = (segment.srcStart / 1000).toFixed(3);
    const end = (segment.srcEnd / 1000).toFixed(3);
    filters.push(
      `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${index}]`,
    );
    if (input.hasAudio) {
      filters.push(
        `[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${index}]`,
      );
      labels.push(`[v${index}][a${index}]`);
    } else {
      labels.push(`[v${index}]`);
    }
  });
  const count = input.segments.length;
  filters.push(
    input.hasAudio
      ? `${labels.join("")}concat=n=${count}:v=1:a=1[v][a]`
      : `${labels.join("")}concat=n=${count}:v=1:a=0[v]`,
  );
  let videoLabel = "[v]";
  if (input.assFile) {
    filters.push(
      `${videoLabel}ass=${escapeFilterPath(input.assFile)}[vass]`,
    );
    videoLabel = "[vass]";
  }
  if (input.scale) {
    filters.push(`${videoLabel}${input.scale}[vscaled]`);
    videoLabel = "[vscaled]";
  }
  await runFfmpeg(
    [
      "-i",
      input.source,
      "-filter_complex",
      filters.join(";"),
      "-map",
      videoLabel,
      ...(input.hasAudio ? ["-map", "[a]", "-c:a", "aac", "-b:a", "160k"] : []),
      ...input.codec,
      "-movflags",
      "+faststart",
      input.output,
    ],
    (chunk) => {
      const progress = progressFromFfmpeg(chunk, input.durationMs);
      if (progress !== null) input.onProgress(progress);
    },
  );
}

function escapeFilterPath(file: string): string {
  return file.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function ingestYoutube(
  row: JobRow,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const url = stringField(payload, "url");
  const outputKey = stringField(payload, "outputKey");
  const dir = await makeTempDir("yt-");
  try {
    await setProgress(row.id, 10, "Downloading video");
    const target = join(dir, "source.mp4");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        "yt-dlp",
        [
          "-f",
          "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
          "--no-playlist",
          "-o",
          target,
          url,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-1000);
      });
      child.on("error", () => {
        reject(new Error("yt-dlp is not installed on the worker."));
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `yt-dlp exited ${code}`));
      });
    });
    await uploadFile({
      key: outputKey,
      filePath: target,
      contentType: "video/mp4",
    });
    const probed = await probeMedia(target);
    if (payload.chainPrepare === true) {
      const proxyKey =
        typeof payload.proxyKey === "string" ? payload.proxyKey : "";
      const audioPrefix =
        typeof payload.audioPrefix === "string" ? payload.audioPrefix : "";
      if (proxyKey) {
        await enqueueJob({
          app: row.app,
          kind: "proxy",
          subjectId: row.subject_id,
          orgId: row.org_id,
          ownerEmail: row.owner_email,
          payload: { sourceKey: outputKey, outputKey: proxyKey },
        });
      }
      if (audioPrefix) {
        await enqueueJob({
          app: row.app,
          kind: "extract-audio",
          subjectId: row.subject_id,
          orgId: row.org_id,
          ownerEmail: row.owner_email,
          payload: {
            sourceKey: outputKey,
            outputPrefix: audioPrefix,
            chunkSeconds: 600,
            chainTranscribe: true,
          },
        });
      }
    }
    return { outputKey, sourceKey: outputKey, ...probed };
  } finally {
    await removeTemp(dir);
  }
}
