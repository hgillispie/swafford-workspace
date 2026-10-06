export interface TranscriptWord {
  id: string;
  position: number;
  text: string;
  startMs: number;
  endMs: number;
  speakerId: string | null;
  paragraphStart: boolean;
  deleted: boolean;
  gapTrimMs: number;
  originalText?: string | null;
}

export interface TranscriptSpeaker {
  id: string;
  name: string;
  position: number;
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

export interface WordPatch {
  position: number;
  deleted?: boolean;
  gapTrimMs?: number;
  text?: string;
}

export interface PositionRange {
  from: number;
  to: number;
}

export const DEFAULT_FILLERS = ["um", "uh", "er", "erm", "ah", "hmm"] as const;
export const OPTIONAL_FILLERS = [
  "like",
  "you know",
  "i mean",
  "sort of",
  "kind of",
  "basically",
] as const;
export const DEFAULT_MAX_GAP_MS = 600;
export const PAUSE_MARK_MS = 900;

const FILLER_ALIASES: Record<string, string> = {
  umm: "um",
  ummm: "um",
  uhm: "um",
  uhh: "uh",
  uhhh: "uh",
  ahh: "ah",
  hmmm: "hmm",
  mm: "hmm",
  mmm: "hmm",
};

export function normalizeToken(text: string): string {
  const token = text
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9']+/g, "")
    .replace(/^'+|'+$/g, "");
  return FILLER_ALIASES[token] ?? token;
}

export function sortWords<T extends { position: number }>(words: T[]): T[] {
  return [...words].sort((a, b) => a.position - b.position);
}

/** Media span a word owns: from its start until the next word starts. */
export function slotBounds(
  words: TranscriptWord[],
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

export function trailingGapMs(
  words: TranscriptWord[],
  index: number,
  mediaDurationMs: number,
): number {
  const { end } = slotBounds(words, index, mediaDurationMs);
  return Math.max(0, end - Math.max(words[index].endMs, words[index].startMs));
}

/** Source media ranges that survive the edit, in playback order. */
export function buildComposition(
  words: TranscriptWord[],
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
      Math.max(0, word.gapTrimMs),
      trailingGapMs(words, i, mediaDurationMs),
    );
    const end = slot.end - trim;
    if (end <= slot.start) continue;
    const last = ranges[ranges.length - 1];
    if (last && last.end === slot.start) {
      last.end = end;
    } else {
      ranges.push({ start: slot.start, end });
    }
  }
  let out = 0;
  const segments = ranges.map((range) => {
    const segment = { srcStart: range.start, srcEnd: range.end, outStart: out };
    out += range.end - range.start;
    return segment;
  });
  return { segments, durationMs: out };
}

function findSegmentIndex(
  segments: CompositionSegment[],
  srcMs: number,
): number {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = segments[mid];
    if (srcMs < seg.srcStart) hi = mid - 1;
    else if (srcMs >= seg.srcEnd) lo = mid + 1;
    else return mid;
  }
  return -(lo + 1);
}

export function srcToOut(composition: Composition, srcMs: number): number {
  const { segments } = composition;
  if (segments.length === 0) return 0;
  const idx = findSegmentIndex(segments, srcMs);
  if (idx >= 0) {
    const seg = segments[idx];
    return seg.outStart + (srcMs - seg.srcStart);
  }
  const insertAt = -idx - 1;
  if (insertAt >= segments.length) return composition.durationMs;
  return segments[insertAt].outStart;
}

export function outToSrc(composition: Composition, outMs: number): number {
  const { segments } = composition;
  if (segments.length === 0) return 0;
  const clamped = Math.max(0, Math.min(outMs, composition.durationMs));
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].outStart <= clamped) lo = mid;
    else hi = mid - 1;
  }
  const seg = segments[lo];
  return Math.min(seg.srcEnd, seg.srcStart + (clamped - seg.outStart));
}

/** The source time playback should be at, skipping over cut ranges. */
export function nextPlayableSrc(
  composition: Composition,
  srcMs: number,
): number | null {
  const { segments } = composition;
  if (segments.length === 0) return null;
  const idx = findSegmentIndex(segments, srcMs);
  if (idx >= 0) return srcMs;
  const insertAt = -idx - 1;
  return insertAt < segments.length ? segments[insertAt].srcStart : null;
}

export function segmentEndAt(
  composition: Composition,
  srcMs: number,
): number | null {
  const idx = findSegmentIndex(composition.segments, srcMs);
  return idx >= 0 ? composition.segments[idx].srcEnd : null;
}

/** Index of the word being spoken at a source time (or the last one started). */
export function wordIndexAt(words: TranscriptWord[], srcMs: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].startMs <= srcMs) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function rangesFromPositions(positions: number[]): PositionRange[] {
  const sorted = [...new Set(positions)].sort((a, b) => a - b);
  const ranges: PositionRange[] = [];
  for (const position of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && last.to === position - 1) last.to = position;
    else ranges.push({ from: position, to: position });
  }
  return ranges;
}

export function positionsInRanges(ranges: PositionRange[]): Set<number> {
  const set = new Set<number>();
  for (const range of ranges) {
    const from = Math.min(range.from, range.to);
    const to = Math.max(range.from, range.to);
    for (let p = from; p <= to; p++) set.add(p);
  }
  return set;
}

/** Patches that set `deleted` for the given ranges, plus the inverse patches. */
export function planSetDeleted(
  words: TranscriptWord[],
  ranges: PositionRange[],
  deleted: boolean,
): { before: WordPatch[]; after: WordPatch[] } {
  const targets = positionsInRanges(ranges);
  const before: WordPatch[] = [];
  const after: WordPatch[] = [];
  for (const word of words) {
    if (!targets.has(word.position) || word.deleted === deleted) continue;
    before.push({ position: word.position, deleted: word.deleted });
    after.push({ position: word.position, deleted });
  }
  return { before, after };
}

export interface FillerMatch {
  phrase: string;
  positions: number[];
}

export function findFillers(
  words: TranscriptWord[],
  phrases: readonly string[] = DEFAULT_FILLERS,
): FillerMatch[] {
  const tokenized = phrases
    .map((phrase) => ({
      phrase: phrase.toLowerCase().trim(),
      tokens: phrase.split(/\s+/).map(normalizeToken).filter(Boolean),
    }))
    .filter((entry) => entry.tokens.length > 0)
    .sort((a, b) => b.tokens.length - a.tokens.length);
  const normalized = words.map((word) => normalizeToken(word.text));
  const matches: FillerMatch[] = [];
  const claimed = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    if (words[i].deleted || claimed.has(i)) continue;
    for (const entry of tokenized) {
      const n = entry.tokens.length;
      if (i + n > words.length) continue;
      let ok = true;
      for (let k = 0; k < n; k++) {
        if (words[i + k].deleted || normalized[i + k] !== entry.tokens[k]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const positions: number[] = [];
      for (let k = 0; k < n; k++) {
        claimed.add(i + k);
        positions.push(words[i + k].position);
      }
      matches.push({ phrase: entry.phrase, positions });
      break;
    }
  }
  return matches;
}

export function countFillers(matches: FillerMatch[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of matches)
    counts[match.phrase] = (counts[match.phrase] ?? 0) + 1;
  return counts;
}

export function fillerPositionSet(words: TranscriptWord[]): Set<number> {
  const set = new Set<number>();
  for (const match of findFillers(words, DEFAULT_FILLERS)) {
    for (const p of match.positions) set.add(p);
  }
  return set;
}

/** Gap trims that shorten every pause longer than maxGapMs down to maxGapMs. */
export function planShortenGaps(
  words: TranscriptWord[],
  mediaDurationMs: number,
  maxGapMs: number | null,
): {
  before: WordPatch[];
  after: WordPatch[];
  shortened: number;
  savedMs: number;
} {
  const before: WordPatch[] = [];
  const after: WordPatch[] = [];
  let shortened = 0;
  let savedMs = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const gap = trailingGapMs(words, i, mediaDurationMs);
    const target =
      maxGapMs === null || word.deleted
        ? 0
        : Math.max(0, gap - Math.max(0, maxGapMs));
    if (target > 0) {
      shortened += 1;
      savedMs += target - Math.min(word.gapTrimMs, gap);
    }
    if (target !== word.gapTrimMs) {
      before.push({ position: word.position, gapTrimMs: word.gapTrimMs });
      after.push({ position: word.position, gapTrimMs: target });
    }
  }
  return { before, after, shortened, savedMs: Math.max(0, savedMs) };
}

export function applyPatches(
  words: TranscriptWord[],
  patches: WordPatch[],
): TranscriptWord[] {
  if (patches.length === 0) return words;
  const byPosition = new Map(patches.map((patch) => [patch.position, patch]));
  return words.map((word) => {
    const patch = byPosition.get(word.position);
    if (!patch) return word;
    return {
      ...word,
      ...(patch.deleted !== undefined ? { deleted: patch.deleted } : {}),
      ...(patch.gapTrimMs !== undefined ? { gapTrimMs: patch.gapTrimMs } : {}),
      ...(patch.text !== undefined ? { text: patch.text } : {}),
    };
  });
}

export interface Paragraph {
  index: number;
  speakerId: string | null;
  words: TranscriptWord[];
}

export function groupParagraphs(words: TranscriptWord[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  for (const word of words) {
    const current = paragraphs[paragraphs.length - 1];
    if (!current || word.paragraphStart) {
      paragraphs.push({
        index: paragraphs.length,
        speakerId: word.speakerId,
        words: [word],
      });
    } else {
      current.words.push(word);
    }
  }
  return paragraphs;
}

export interface Sentence {
  from: number;
  to: number;
  speakerId: string | null;
  startMs: number;
  words: TranscriptWord[];
}

export function splitSentences(words: TranscriptWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  let current: TranscriptWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    sentences.push({
      from: current[0].position,
      to: current[current.length - 1].position,
      speakerId: current[0].speakerId,
      startMs: current[0].startMs,
      words: current,
    });
    current = [];
  };
  for (const word of words) {
    if (
      current.length > 0 &&
      (word.paragraphStart || word.speakerId !== current[0].speakerId)
    ) {
      flush();
    }
    current.push(word);
    if (/[.?!…]["')\]]*$/.test(word.text)) flush();
  }
  flush();
  return sentences;
}

export function sentenceText(
  words: TranscriptWord[],
  markCuts: boolean,
): string {
  return words
    .map((word) => (markCuts && word.deleted ? `~~${word.text}~~` : word.text))
    .join(" ");
}

export function formatTimecode(
  ms: number,
  opts: { tenths?: boolean } = {},
): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${hours > 0 ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`;
  if (!opts.tenths) return base;
  return `${base}.${Math.floor((safe % 1000) / 100)}`;
}

function captionStamp(ms: number, separator: "," | "."): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

interface Cue {
  startMs: number;
  endMs: number;
  text: string;
  speakerId: string | null;
}

export function buildCues(
  words: TranscriptWord[],
  mediaDurationMs: number,
  maxChars = 42,
): Cue[] {
  const composition = buildComposition(words, mediaDurationMs);
  const cues: Cue[] = [];
  let current: {
    words: TranscriptWord[];
    startMs: number;
    endMs: number;
  } | null = null;
  const flush = () => {
    if (!current || current.words.length === 0) return;
    cues.push({
      startMs: current.startMs,
      endMs: Math.max(current.endMs, current.startMs + 400),
      text: current.words.map((w) => w.text).join(" "),
      speakerId: current.words[0].speakerId,
    });
    current = null;
  };
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (word.deleted) continue;
    const slot = slotBounds(words, i, mediaDurationMs);
    const keptEnd =
      slot.end -
      Math.min(word.gapTrimMs, trailingGapMs(words, i, mediaDurationMs));
    const startOut = srcToOut(composition, Math.max(slot.start, word.startMs));
    const endOut =
      srcToOut(
        composition,
        Math.max(word.startMs, Math.min(word.endMs, keptEnd) - 1),
      ) + 1;
    if (current) {
      const length =
        current.words.map((w) => w.text).join(" ").length +
        1 +
        word.text.length;
      const last = current.words[current.words.length - 1];
      const speakerChanged = word.speakerId !== current.words[0].speakerId;
      const longPause = startOut - current.endMs > 700;
      if (
        length > maxChars ||
        speakerChanged ||
        longPause ||
        word.paragraphStart
      ) {
        flush();
      } else if (
        /[,;:]$/.test(last.text) &&
        current.words.length >= 4 &&
        length > maxChars * 0.6
      ) {
        flush();
      }
    }
    if (!current) current = { words: [], startMs: startOut, endMs: endOut };
    current.words.push(word);
    current.endMs = Math.max(current.endMs, endOut);
    if (/[.?!…]["')\]]*$/.test(word.text)) flush();
  }
  flush();
  for (let i = 0; i < cues.length - 1; i++) {
    if (cues[i].endMs > cues[i + 1].startMs)
      cues[i].endMs = cues[i + 1].startMs;
  }
  return cues;
}

export type TranscriptExportFormat = "txt" | "srt" | "vtt";

export function exportTranscript(
  format: TranscriptExportFormat,
  words: TranscriptWord[],
  speakers: TranscriptSpeaker[],
  mediaDurationMs: number,
): string {
  const speakerName = new Map(speakers.map((s) => [s.id, s.name]));
  if (format === "txt") {
    const composition = buildComposition(words, mediaDurationMs);
    return groupParagraphs(words)
      .map((paragraph) => {
        const kept = paragraph.words.filter((w) => !w.deleted);
        if (kept.length === 0) return null;
        const name = paragraph.speakerId
          ? speakerName.get(paragraph.speakerId)
          : null;
        const stamp = formatTimecode(srcToOut(composition, kept[0].startMs));
        const header = name ? `${name} (${stamp})` : `(${stamp})`;
        return `${header}\n${kept.map((w) => w.text).join(" ")}`;
      })
      .filter(Boolean)
      .join("\n\n")
      .concat("\n");
  }
  const cues = buildCues(words, mediaDurationMs);
  if (format === "srt") {
    return cues
      .map(
        (cue, i) =>
          `${i + 1}\n${captionStamp(cue.startMs, ",")} --> ${captionStamp(cue.endMs, ",")}\n${cue.text}\n`,
      )
      .join("\n");
  }
  const body = cues
    .map((cue) => {
      const name = cue.speakerId ? speakerName.get(cue.speakerId) : null;
      const text = name
        ? `<v ${name.replace(/[<>]/g, "")}>${cue.text}`
        : cue.text;
      return `${captionStamp(cue.startMs, ".")} --> ${captionStamp(cue.endMs, ".")}\n${text}\n`;
    })
    .join("\n");
  return `WEBVTT\n\n${body}`;
}

const SPEECH_PRINT_BUCKETS = 48;
const SPEAKER_CODES = "abcdef";

/**
 * Compact summary of the edited timeline: one level digit (0-9) and one
 * speaker code (a-f, or "z" for silence) per bucket.
 */
export function computeSpeechPrint(
  words: TranscriptWord[],
  speakers: TranscriptSpeaker[],
  mediaDurationMs: number,
): string {
  const composition = buildComposition(words, mediaDurationMs);
  if (composition.durationMs <= 0 || words.length === 0) return "";
  const speakerIndex = new Map(
    speakers.map((s, i) => [s.id, i % SPEAKER_CODES.length]),
  );
  const bucketMs = composition.durationMs / SPEECH_PRINT_BUCKETS;
  const coverage = new Array<number>(SPEECH_PRINT_BUCKETS).fill(0);
  const bySpeaker = Array.from(
    { length: SPEECH_PRINT_BUCKETS },
    () => new Map<number, number>(),
  );
  for (const word of words) {
    if (word.deleted) continue;
    const start = srcToOut(composition, word.startMs);
    const end = Math.max(
      start + 1,
      srcToOut(composition, Math.max(word.startMs, word.endMs - 1)) + 1,
    );
    const first = Math.min(
      SPEECH_PRINT_BUCKETS - 1,
      Math.floor(start / bucketMs),
    );
    const last = Math.min(
      SPEECH_PRINT_BUCKETS - 1,
      Math.floor((end - 1) / bucketMs),
    );
    for (let b = first; b <= last; b++) {
      const overlap =
        Math.min(end, (b + 1) * bucketMs) - Math.max(start, b * bucketMs);
      if (overlap <= 0) continue;
      coverage[b] += overlap;
      const sp = word.speakerId ? (speakerIndex.get(word.speakerId) ?? 0) : 0;
      bySpeaker[b].set(sp, (bySpeaker[b].get(sp) ?? 0) + overlap);
    }
  }
  let print = "";
  for (let b = 0; b < SPEECH_PRINT_BUCKETS; b++) {
    const ratio = Math.min(1, coverage[b] / bucketMs);
    const level = Math.round(ratio * 9);
    let dominant = -1;
    let best = 0;
    for (const [sp, amount] of bySpeaker[b]) {
      if (amount > best) {
        best = amount;
        dominant = sp;
      }
    }
    print += `${level}${dominant >= 0 ? SPEAKER_CODES[dominant] : "z"}`;
  }
  return print;
}

export function parseSpeechPrint(
  print: string,
): Array<{ level: number; speaker: number }> {
  const bars: Array<{ level: number; speaker: number }> = [];
  for (let i = 0; i + 1 < print.length; i += 2) {
    const level = Number(print[i]);
    const code = print[i + 1];
    bars.push({
      level: Number.isFinite(level) ? level : 0,
      speaker: code === "z" ? -1 : SPEAKER_CODES.indexOf(code),
    });
  }
  return bars;
}
