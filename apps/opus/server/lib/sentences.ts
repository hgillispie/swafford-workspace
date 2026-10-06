import type { TranscriptWord } from "./words.js";

export interface Sentence {
  startMs: number;
  endMs: number;
  text: string;
}

export interface MomentChunk {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
  sentences: Sentence[];
}

const SENTENCE_END = /[.!?]["')\]]*$/;

/** Group words into sentences. A long pause or a hard cap also ends a sentence. */
export function sentencesFromWords(words: TranscriptWord[]): Sentence[] {
  const sentences: Sentence[] = [];
  let bucket: TranscriptWord[] = [];
  const flush = () => {
    if (bucket.length === 0) return;
    sentences.push({
      startMs: bucket[0].startMs,
      endMs: bucket[bucket.length - 1].endMs,
      text: bucket.map((word) => word.text).join(" "),
    });
    bucket = [];
  };
  for (const word of words) {
    const previous = bucket[bucket.length - 1];
    if (previous && word.startMs - previous.endMs > 1400) flush();
    bucket.push(word);
    const started = bucket[0]?.startMs ?? word.startMs;
    const tooLong = bucket.length >= 24 || word.endMs - started > 18_000;
    if (SENTENCE_END.test(word.text) || tooLong) flush();
  }
  flush();
  return sentences;
}

/**
 * Expand a requested range to the sentences it touches.
 * Ranges longer than `maxMs` keep the sentences nearest the request.
 */
export function snapToSentences(
  words: TranscriptWord[],
  startMs: number,
  endMs: number,
  maxMs = 90_000,
): { startMs: number; endMs: number } {
  const sentences = sentencesFromWords(words);
  if (sentences.length === 0 || endMs <= startMs) {
    return { startMs, endMs };
  }
  let pool = sentences.filter(
    (sentence) => sentence.endMs > startMs && sentence.startMs < endMs,
  );
  if (pool.length === 0) {
    const nearest = sentences.reduce((best, sentence) => {
      const distance = Math.abs(sentence.startMs - startMs);
      const bestDistance = Math.abs(best.startMs - startMs);
      return distance < bestDistance ? sentence : best;
    });
    pool = [nearest];
  }
  let lo = 0;
  let hi = pool.length - 1;
  while (hi > lo && pool[hi].endMs - pool[lo].startMs > maxMs) {
    const startOverflow = Math.max(0, startMs - pool[lo].startMs);
    const endOverflow = Math.max(0, pool[hi].endMs - endMs);
    if (startOverflow >= endOverflow) lo += 1;
    else hi -= 1;
  }
  const start = pool[lo].startMs;
  const end = pool[hi].endMs;
  if (end <= start) return { startMs, endMs };
  return { startMs: start, endMs: end };
}

/** Sentence groups of about two and a half minutes, for long vlogs. */
export function momentChunks(
  words: TranscriptWord[],
  targetMs = 150_000,
): MomentChunk[] {
  const sentences = sentencesFromWords(words);
  const chunks: MomentChunk[] = [];
  let current: Sentence[] = [];
  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      index: chunks.length,
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
      text: current.map((sentence) => sentence.text).join(" "),
      sentences: current,
    });
    current = [];
  };
  for (const sentence of sentences) {
    if (
      current.length > 0 &&
      sentence.endMs - current[0].startMs > targetMs
    ) {
      flush();
    }
    current.push(sentence);
  }
  flush();
  return chunks;
}
