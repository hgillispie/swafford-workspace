import { snapToSentences } from "./sentences.js";
import type { TranscriptWord } from "./words.js";

export interface ScoredMoment {
  title: string;
  startMs: number;
  endMs: number;
  score: number;
  reason: string;
  hook: number;
  engagement: number;
  value: number;
  shareability: number;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Deterministic offline fallback. It is not a virality model.
 * The product path is the agent calling save-opus-moments.
 */
export function scoreLocally(words: TranscriptWord[]): ScoredMoment[] {
  if (words.length < 6) return [];
  const end = words[words.length - 1].endMs;
  const windowMs = Math.min(32_000, Math.max(12_000, Math.round(end * 0.45)));
  const step = Math.max(4_000, Math.round(windowMs / 4));
  const candidates: ScoredMoment[] = [];
  for (let start = 0; start < end - 6_000; start += step) {
    const stop = Math.min(end, start + windowMs);
    const slice = words.filter(
      (word) => word.endMs > start && word.startMs < stop,
    );
    if (slice.length < 6) continue;
    const seconds = Math.max(1, (slice[slice.length - 1].endMs - slice[0].startMs) / 1000);
    const pace = slice.length / seconds;
    const questions = slice.filter((word) => word.text.includes("?")).length;
    const bangs = slice.filter((word) => word.text.includes("!")).length;
    const unique = new Set(
      slice.map((word) => word.text.toLowerCase().replace(/[^a-z0-9']/g, "")),
    ).size;
    const variety = unique / slice.length;
    const hook = clamp(questions * 28 + bangs * 16 + Math.min(36, pace * 14));
    const engagement = clamp(pace * 24 + questions * 12);
    const value = clamp(variety * 70 + Math.min(24, slice.length / 2));
    const shareability = clamp((hook + engagement + value) / 3);
    const score = clamp(
      hook * 0.35 + engagement * 0.25 + value * 0.2 + shareability * 0.2,
    );
    const title = slice
      .slice(0, 7)
      .map((word) => word.text)
      .join(" ")
      .replace(/[.,!?]+$/g, "")
      .slice(0, 80);
    const notes = ["Local score"];
    if (questions > 0) notes.push(`${questions} question${questions === 1 ? "" : "s"}`);
    notes.push(`${pace.toFixed(1)} words/sec`);
    const snapped = snapToSentences(
      words,
      slice[0].startMs,
      slice[slice.length - 1].endMs,
    );
    if (snapped.endMs - snapped.startMs < 8_000) continue;
    candidates.push({
      title: title || "Moment",
      startMs: snapped.startMs,
      endMs: snapped.endMs,
      score,
      reason: notes.join(" · "),
      hook,
      engagement,
      value,
      shareability,
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const picked: ScoredMoment[] = [];
  for (const candidate of candidates) {
    const overlaps = picked.some(
      (item) => candidate.startMs < item.endMs && candidate.endMs > item.startMs,
    );
    if (overlaps) continue;
    picked.push(candidate);
    if (picked.length === 4) break;
  }
  return picked.sort((a, b) => a.startMs - b.startMs);
}
