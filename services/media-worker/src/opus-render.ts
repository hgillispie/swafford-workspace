import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { downloadToFile, uploadFile } from "@swafford-workspace/object-storage";

import { animatedAss, writeAss, type TimedWord } from "./captions.js";
import { setProgress, type JobRow } from "./db.js";
import {
  makeTempDir,
  probeMedia,
  progressFromFfmpeg,
  removeTemp,
  runFfmpeg,
} from "./ffmpeg.js";

const here = dirname(fileURLToPath(import.meta.url));

interface OpusClipJob {
  clipId?: string;
  outputKey: string;
  startMs: number;
  endMs: number;
  words: TimedWord[];
  captionStyle: string;
  font: string;
  position: string;
  aspect: string;
  title: string;
  hookOverlay: boolean;
}

interface TrackSample {
  t: number;
  cx: number;
  cy: number;
  kind: string;
}

interface Track {
  mode: "face" | "motion" | "center";
  facesFound: number;
  samples: TrackSample[];
  width: number;
  height: number;
}

function outputFrame(aspect: string): {
  width: number;
  height: number;
  ratio: number;
} {
  if (aspect === "1:1") return { width: 1080, height: 1080, ratio: 1 };
  if (aspect === "16:9") return { width: 1920, height: 1080, ratio: 16 / 9 };
  return { width: 1080, height: 1920, ratio: 9 / 16 };
}

function clipsFromPayload(payload: Record<string, unknown>): OpusClipJob[] {
  if (Array.isArray(payload.clips) && payload.clips.length > 0) {
    return payload.clips.map((item) => clipFromRecord(item as Record<string, unknown>, true));
  }
  return [clipFromRecord(payload, false)];
}

function clipFromRecord(
  record: Record<string, unknown>,
  wordsAreRelative: boolean,
): OpusClipJob {
  const startMs = Number(record.startMs ?? 0);
  const endMs = Number(record.endMs ?? 0);
  const words = ((record.words ?? []) as TimedWord[]).map((word) => ({
    text: word.text,
    startMs: wordsAreRelative
      ? Math.max(0, word.startMs)
      : Math.max(0, word.startMs - startMs),
    endMs: wordsAreRelative
      ? Math.max(0, word.endMs)
      : Math.max(0, word.endMs - startMs),
  }));
  const outputKey = typeof record.outputKey === "string" ? record.outputKey : "";
  if (!outputKey) throw new Error("Job payload is missing outputKey.");
  return {
    clipId: typeof record.clipId === "string" ? record.clipId : undefined,
    outputKey,
    startMs,
    endMs,
    words,
    captionStyle:
      typeof record.captionStyle === "string" ? record.captionStyle : "karaoke",
    font: typeof record.font === "string" ? record.font : "dejavu",
    position: typeof record.position === "string" ? record.position : "bottom",
    aspect: typeof record.aspect === "string" ? record.aspect : "9:16",
    title: typeof record.title === "string" ? record.title : "",
    hookOverlay: record.hookOverlay !== false,
  };
}

export async function renderOpus(
  row: JobRow,
  payload: Record<string, unknown>,
): Promise<unknown> {
  const sourceKey = stringField(payload, "sourceKey");
  const proxyKey = typeof payload.proxyKey === "string" ? payload.proxyKey : "";
  const clips = clipsFromPayload(payload);
  const dir = await makeTempDir("opus-");
  try {
    await setProgress(row.id, 4, "Downloading original once");
    const original = join(dir, "original.mp4");
    await downloadToFile(sourceKey, original);
    const source = await probeMedia(original);
    let proxy: string | null = null;
    if (proxyKey) {
      await setProgress(row.id, 12, "Downloading 720p proxy");
      proxy = join(dir, "proxy.mp4");
      await downloadToFile(proxyKey, proxy);
    }
    const rendered: Array<Record<string, unknown>> = [];
    for (const [index, clip] of clips.entries()) {
      const slice = 80 / clips.length;
      const base = 15 + index * slice;
      const label = `Clip ${index + 1} of ${clips.length}`;
      try {
        if (!(clip.endMs > clip.startMs)) {
          throw new Error("Clip range is empty.");
        }
        await setProgress(row.id, Math.round(base), label);
        const analysis = join(dir, `track-${index}.mp4`);
        await extractAnalysis(
          proxy ?? original,
          analysis,
          clip.startMs,
          clip.endMs,
        );
        const tracked = scaleTrack(
          await trackSubject(analysis),
          source.width ?? 1920,
          source.height ?? 1080,
        );
        const frame = outputFrame(clip.aspect);
        const crop = cropFilter(tracked, frame.ratio);
        const ass = join(dir, `captions-${index}.ass`);
        await writeAss(
          ass,
          animatedAss({
            words: clip.words,
            width: frame.width,
            height: frame.height,
            style: clip.captionStyle,
            font: clip.font,
            position: clip.position,
            title: clip.hookOverlay ? clip.title : "",
            titleMs: 3000,
          }),
        );
        const output = join(dir, `clip-${index}.mp4`);
        await encodeClip({
          original,
          output,
          startMs: clip.startMs,
          endMs: clip.endMs,
          filter: `${crop},scale=${frame.width}:${frame.height},ass=${escapeFilterPath(ass)}`,
          onProgress: (progress) => {
            void setProgress(
              row.id,
              Math.round(base + progress * slice * 0.85),
              label,
            );
          },
        });
        await uploadFile({
          key: clip.outputKey,
          filePath: output,
          contentType: "video/mp4",
        });
        const probed = await probeMedia(output);
        rendered.push({
          clipId: clip.clipId,
          outputKey: clip.outputKey,
          durationMs: probed.durationMs,
          width: probed.width,
          height: probed.height,
          crop: tracked.mode,
          facesFound: tracked.facesFound,
        });
      } catch (error) {
        rendered.push({
          clipId: clip.clipId,
          outputKey: clip.outputKey,
          error: error instanceof Error ? error.message : "Render failed.",
        });
      }
    }
    if (rendered.every((item) => item.error)) {
      throw new Error(
        rendered.map((item) => String(item.error)).join(" ") || "Render failed.",
      );
    }
    const first = rendered.find((item) => !item.error);
    return {
      outputKey: first?.outputKey,
      clips: rendered,
      durationMs: first?.durationMs,
      width: first?.width,
      height: first?.height,
    };
  } finally {
    await removeTemp(dir);
  }
}

function stringField(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Job payload is missing ${key}.`);
  }
  return value;
}

async function extractAnalysis(
  input: string,
  output: string,
  startMs: number,
  endMs: number,
): Promise<void> {
  const start = Math.max(0, startMs / 1000);
  const duration = Math.max(0.4, (endMs - startMs) / 1000);
  await runFfmpeg([
    "-ss",
    start.toFixed(3),
    "-i",
    input,
    "-t",
    duration.toFixed(3),
    "-vf",
    "scale=-2:720",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "30",
    output,
  ]);
}

async function encodeClip(input: {
  original: string;
  output: string;
  startMs: number;
  endMs: number;
  filter: string;
  onProgress: (progress: number) => void;
}): Promise<void> {
  const start = Math.max(0, input.startMs / 1000);
  const duration = Math.max(0.4, (input.endMs - input.startMs) / 1000);
  await runFfmpeg(
    [
      "-ss",
      start.toFixed(3),
      "-i",
      input.original,
      "-t",
      duration.toFixed(3),
      "-vf",
      input.filter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      input.output,
    ],
    (chunk) => {
      const progress = progressFromFfmpeg(chunk, input.endMs - input.startMs);
      if (progress !== null) input.onProgress(progress);
    },
  );
}

async function trackSubject(file: string): Promise<Track> {
  const script = join(here, "track_subject.py");
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn("python3", [script, file], {
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
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr || `tracker exited ${code}`));
      else resolve(stdout);
    });
  }).catch(() => "");
  if (!raw) {
    return { mode: "center", facesFound: 0, samples: [], width: 0, height: 0 };
  }
  const parsed = JSON.parse(raw) as {
    width: number;
    height: number;
    facesFound: number;
    samples: TrackSample[];
  };
  const mode = parsed.facesFound > 0
    ? "face"
    : parsed.samples.some((sample) => sample.kind === "motion")
      ? "motion"
      : "center";
  return { ...parsed, mode };
}

function scaleTrack(track: Track, width: number, height: number): Track {
  const scaleX = track.width > 0 ? width / track.width : 1;
  const scaleY = track.height > 0 ? height / track.height : 1;
  return {
    ...track,
    width,
    height,
    samples: track.samples.map((sample) => ({
      ...sample,
      cx: sample.cx * scaleX,
      cy: sample.cy * scaleY,
    })),
  };
}

function cropFilter(track: Track, ratio: number): string {
  const srcW = track.width || 1920;
  const srcH = track.height || 1080;
  let cropW = Math.round(srcH * ratio);
  let cropH = srcH;
  if (cropW > srcW) {
    cropW = srcW;
    cropH = Math.round(srcW / ratio);
  }
  cropW -= cropW % 2;
  cropH -= cropH % 2;
  const maxX = Math.max(0, srcW - cropW);
  const y = Math.max(0, Math.round((srcH - cropH) / 2));
  let xExpr = String(Math.round(maxX / 2));
  if (track.mode !== "center" && track.samples.length > 0) {
    let smoothed = track.samples[0].cx;
    const points = track.samples.map((sample) => {
      smoothed = smoothed * 0.65 + sample.cx * 0.35;
      const x = Math.max(0, Math.min(maxX, Math.round(smoothed - cropW / 2)));
      return { t: sample.t, x };
    });
    const reduced = points.filter(
      (point, index) =>
        index === 0 || Math.abs(point.x - points[index - 1].x) > 8,
    );
    xExpr = String(reduced[reduced.length - 1]?.x ?? Math.round(maxX / 2));
    for (let index = reduced.length - 2; index >= 0; index -= 1) {
      xExpr = `if(lt(t\\,${reduced[index + 1].t.toFixed(2)})\\,${reduced[index].x}\\,${xExpr})`;
    }
    if (xExpr.length > 6000) xExpr = String(Math.round(maxX / 2));
  }
  return `crop=${cropW}:${cropH}:${xExpr}:${y}`;
}

function escapeFilterPath(file: string): string {
  return file.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}
