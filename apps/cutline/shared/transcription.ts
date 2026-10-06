export interface TranscriptSegmentWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  speakerLabel?: string;
  words?: TranscriptSegmentWord[];
}

export interface BuiltWord {
  text: string;
  startMs: number;
  endMs: number;
  speakerKey: string;
  paragraphStart: boolean;
}

export interface BuiltTranscript {
  speakers: Array<{ key: string; name: string }>;
  words: BuiltWord[];
}

/** Spread a segment's text over its time span when no word timing exists. */
export function distributeWords(
  text: string,
  startMs: number,
  endMs: number,
): TranscriptSegmentWord[] {
  const parts = text.split(/\s+/).filter(Boolean);
  const total = parts.reduce((sum, part) => sum + part.length + 1, 0) || 1;
  const span = Math.max(0, endMs - startMs);
  let cursor = startMs;
  return parts.map((part) => {
    const duration = (span * (part.length + 1)) / total;
    const token = {
      text: part,
      startMs: Math.round(cursor),
      endMs: Math.round(cursor + duration * 0.92),
    };
    cursor += duration;
    return token;
  });
}

/** Flatten timed segments into words with speakers and paragraph breaks. */
export function buildTranscriptWords(
  segments: TranscriptSegment[],
): BuiltTranscript {
  const speakerKeys: string[] = [];
  const words: BuiltWord[] = [];
  let lastSpeaker: string | null = null;
  let lastStart = 0;
  let lastEnd = 0;
  let paragraphLength = 0;

  for (const segment of segments) {
    const key = segment.speakerLabel?.trim() || "default";
    if (!speakerKeys.includes(key)) speakerKeys.push(key);
    const tokens =
      segment.words && segment.words.length > 0
        ? segment.words.map((w) => ({
            text: w.text.trim(),
            startMs: w.startMs,
            endMs: w.endMs,
          }))
        : distributeWords(segment.text, segment.startMs, segment.endMs);
    let first = true;
    for (const token of tokens) {
      if (!token.text) continue;
      const startMs = Math.max(lastStart, token.startMs);
      const endMs = Math.max(startMs, token.endMs);
      const speakerChanged = key !== lastSpeaker;
      const longPause = words.length > 0 && startMs - lastEnd > 2000;
      const longParagraph = first && paragraphLength > 90;
      const paragraphStart =
        words.length === 0 ||
        (first && (speakerChanged || longPause || longParagraph));
      if (paragraphStart) paragraphLength = 0;
      words.push({
        text: token.text,
        startMs,
        endMs,
        speakerKey: key,
        paragraphStart,
      });
      paragraphLength += 1;
      lastStart = startMs;
      lastEnd = endMs;
      lastSpeaker = key;
      first = false;
    }
  }

  const named = speakerKeys.length > 1 || speakerKeys[0] !== "default";
  return {
    speakers: speakerKeys.map((key, i) => ({
      key,
      name: named ? `Speaker ${i + 1}` : "Speaker 1",
    })),
    words,
  };
}

/** Compact wire format for saving long transcripts: [text, start, end, speakerIndex, paragraphStart]. */
export type CompactWord = [string, number, number, number, 0 | 1];

export function compactWords(
  built: BuiltTranscript,
): { speakers: string[]; words: CompactWord[] } {
  const index = new Map(built.speakers.map((s, i) => [s.key, i]));
  return {
    speakers: built.speakers.map((s) => s.name),
    words: built.words.map((w) => [
      w.text,
      Math.round(w.startMs),
      Math.round(w.endMs),
      index.get(w.speakerKey) ?? 0,
      w.paragraphStart ? 1 : 0,
    ]),
  };
}
