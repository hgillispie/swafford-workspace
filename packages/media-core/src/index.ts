/** Job kinds the media worker claims from Postgres. */
export const MEDIA_JOB_KINDS = [
  "proxy",
  "extract-audio",
  "transcribe",
  "cutline-render",
  "opus-render",
  "ingest-youtube",
] as const;

export type MediaJobKind = (typeof MEDIA_JOB_KINDS)[number];

export type MediaJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

/** Shown while a queued job is waiting for a stopped worker to boot. */
export const STARTING_RENDERER_LABEL = "Starting renderer…";

export function isStartingRenderer(job: {
  status: string;
  progressLabel?: string | null;
}): boolean {
  return (
    job.status === "queued" && job.progressLabel === STARTING_RENDERER_LABEL
  );
}

export const MEDIA_JOBS_MIGRATION_NAME = "media-jobs-queue";

/** Additive, shared queue. Safe to run from every app boot and the worker. */
export const MEDIA_JOBS_SQL = `CREATE TABLE IF NOT EXISTS media_jobs (
  id TEXT PRIMARY KEY,
  app TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  org_id TEXT,
  owner_email TEXT NOT NULL DEFAULT '',
  subject_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  progress_label TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  heartbeat_at BIGINT,
  locked_by TEXT,
  run_after BIGINT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS media_jobs_claim_idx ON media_jobs (status, run_after);
CREATE INDEX IF NOT EXISTS media_jobs_subject_idx ON media_jobs (app, subject_id);`;

export interface CutWord {
  text: string;
  startMs: number;
  endMs: number;
  deleted?: boolean;
  gapTrimMs?: number;
}

export interface CompositionSegment {
  srcStart: number;
  srcEnd: number;
  outStart: number;
}

export interface Composition {
  segments: CompositionSegment[];
  durationMs: number;
}

function slotBounds(
  words: CutWord[],
  index: number,
  mediaDurationMs: number,
): { start: number; end: number } {
  const word = words[index];
  const start = index === 0 ? 0 : word.startMs;
  const next = words[index + 1];
  const end = next
    ? Math.max(start, next.startMs)
    : Math.max(start, mediaDurationMs, word.endMs);
  return { start, end };
}

function trailingGapMs(
  words: CutWord[],
  index: number,
  mediaDurationMs: number,
): number {
  const { end } = slotBounds(words, index, mediaDurationMs);
  return Math.max(0, end - Math.max(words[index].endMs, words[index].startMs));
}

/**
 * Kept source ranges after word deletes and gap trims.
 * Matches Cutline `shared/transcript.ts` `buildComposition`.
 */
export function buildComposition(
  words: CutWord[],
  mediaDurationMs: number,
): Composition {
  if (words.length === 0) {
    const durationMs = Math.max(0, mediaDurationMs);
    return {
      segments:
        durationMs > 0
          ? [{ srcStart: 0, srcEnd: durationMs, outStart: 0 }]
          : [],
      durationMs,
    };
  }
  const ranges: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.deleted) continue;
    const slot = slotBounds(words, i, mediaDurationMs);
    const trim = Math.min(
      Math.max(0, word.gapTrimMs ?? 0),
      trailingGapMs(words, i, mediaDurationMs),
    );
    const end = slot.end - trim;
    if (end <= slot.start) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.end === slot.start) last.end = end;
    else ranges.push({ start: slot.start, end });
  }
  let out = 0;
  const segments = ranges.map((range) => {
    const segment = {
      srcStart: range.start,
      srcEnd: range.end,
      outStart: out,
    };
    out += range.end - range.start;
    return segment;
  });
  return { segments, durationMs: out };
}

export function srcToOut(composition: Composition, srcMs: number): number {
  for (const segment of composition.segments) {
    if (srcMs < segment.srcStart) return segment.outStart;
    if (srcMs < segment.srcEnd) {
      return segment.outStart + (srcMs - segment.srcStart);
    }
  }
  return composition.durationMs;
}

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

/** Phrase cues on the edited timeline, for sidecar and burn-in captions. */
export function captionCues(
  words: CutWord[],
  mediaDurationMs: number,
  maxChars = 42,
): CaptionCue[] {
  const composition = buildComposition(words, mediaDurationMs);
  const cues: CaptionCue[] = [];
  let bucket: CutWord[] = [];
  let start = 0;
  let end = 0;
  const flush = () => {
    if (bucket.length === 0) return;
    cues.push({
      startMs: start,
      endMs: Math.max(end, start + 400),
      text: bucket.map((word) => word.text).join(" "),
    });
    bucket = [];
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.deleted) continue;
    const slot = slotBounds(words, i, mediaDurationMs);
    const trim = Math.min(
      Math.max(0, word.gapTrimMs ?? 0),
      trailingGapMs(words, i, mediaDurationMs),
    );
    const keptEnd = slot.end - trim;
    const startOut = srcToOut(
      composition,
      Math.max(slot.start, word.startMs),
    );
    const endOut =
      srcToOut(
        composition,
        Math.max(word.startMs, Math.min(word.endMs, keptEnd) - 1),
      ) + 1;
    const nextText = [...bucket.map((item) => item.text), word.text].join(" ");
    if (bucket.length > 0 && nextText.length > maxChars) flush();
    if (bucket.length === 0) {
      start = startOut;
      end = endOut;
    }
    bucket.push(word);
    end = Math.max(end, endOut);
    if (/[.?!…]$/.test(word.text)) flush();
  }
  flush();
  return cues;
}

export function cuesToSrt(cues: CaptionCue[]): string {
  const stamp = (ms: number) => {
    const clamped = Math.max(0, Math.round(ms));
    const hours = Math.floor(clamped / 3_600_000);
    const minutes = Math.floor((clamped % 3_600_000) / 60_000);
    const seconds = Math.floor((clamped % 60_000) / 1000);
    const millis = clamped % 1000;
    const pad = (value: number, width = 2) =>
      String(value).padStart(width, "0");
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
  };
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n${cue.text}\n`,
    )
    .join("\n");
}
