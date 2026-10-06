import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class JobCancelled extends Error {
  constructor() {
    super("Job cancelled.");
    this.name = "JobCancelled";
  }
}

const children = new Set<ReturnType<typeof spawn>>();

export function killActiveChildren(): void {
  for (const child of children) child.kill("SIGKILL");
}

export function workdir(): string {
  return process.env.MEDIA_WORKDIR?.trim() || join(tmpdir(), "media-worker");
}

export async function ensureWorkdir(): Promise<string> {
  const dir = workdir();
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function makeTempDir(prefix: string): Promise<string> {
  await ensureWorkdir();
  return mkdtemp(join(workdir(), prefix));
}

export async function removeTemp(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

function run(
  command: string,
  args: string[],
  onStderr?: (text: string) => void,
): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    children.add(child);
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-12_000);
      onStderr?.(chunk);
    });
    child.on("error", (error) => {
      children.delete(child);
      reject(error);
    });
    child.on("close", (code) => {
      children.delete(child);
      if (code === 0) resolve({ stderr });
      else {
        reject(
          new Error(
            `${command} exited ${code}: ${stderr.trim().slice(-700) || "no stderr"}`,
          ),
        );
      }
    });
  });
}

export function runFfmpeg(
  args: string[],
  onStderr?: (text: string) => void,
): Promise<void> {
  return run("ffmpeg", ["-hide_banner", "-y", ...args], onStderr).then(
    () => undefined,
  );
}

export function probeMedia(file: string): Promise<{
  durationMs: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,width,height",
        "-of",
        "json",
        file,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited ${code}`));
        return;
      }
      resolve(summarizeProbe(JSON.parse(stdout)));
    });
  });
}

function summarizeProbe(parsed: {
  format?: { duration?: string };
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
}) {
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const duration = Number(parsed.format?.duration ?? 0);
  return {
    durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : 0,
    width: video?.width ?? null,
    height: video?.height ?? null,
    hasAudio: Boolean(
      parsed.streams?.some((stream) => stream.codec_type === "audio"),
    ),
  };
}

/** Map ffmpeg `time=` progress onto 0–100 for a known duration. */
export function progressFromFfmpeg(
  chunk: string,
  durationMs: number,
): number | null {
  const match = chunk.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match || durationMs <= 0) return null;
  const ms =
    (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) *
    1000;
  return Math.max(0, Math.min(99, (ms / durationMs) * 100));
}
