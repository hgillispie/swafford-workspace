import { describe, expect, it } from "vitest";

import {
  applyPatches,
  buildComposition,
  computeSpeechPrint,
  exportTranscript,
  findFillers,
  nextPlayableSrc,
  outToSrc,
  planSetDeleted,
  planShortenGaps,
  splitSentences,
  srcToOut,
  type TranscriptWord,
} from "./transcript";

function word(
  position: number,
  text: string,
  startMs: number,
  endMs: number,
): TranscriptWord {
  return {
    id: `w${position}`,
    position,
    text,
    startMs,
    endMs,
    speakerId: "s1",
    paragraphStart: position === 0,
    deleted: false,
    gapTrimMs: 0,
  };
}

// Trailing gaps: 100, 100, 100, 2200, 600 (media is 5000ms long).
const words = [
  word(0, "Hello,", 0, 400),
  word(1, "um,", 500, 800),
  word(2, "welcome", 900, 1300),
  word(3, "back.", 1400, 1800),
  word(4, "Today", 4000, 4400),
];

describe("buildComposition", () => {
  it("keeps the whole timeline when nothing is cut", () => {
    const composition = buildComposition(words, 5000);
    expect(composition.segments).toEqual([
      { srcStart: 0, srcEnd: 5000, outStart: 0 },
    ]);
    expect(composition.durationMs).toBe(5000);
  });

  it("removes a cut word's slot and maps time across the splice", () => {
    const edited = applyPatches(words, [{ position: 1, deleted: true }]);
    const composition = buildComposition(edited, 5000);
    expect(composition.segments).toEqual([
      { srcStart: 0, srcEnd: 500, outStart: 0 },
      { srcStart: 900, srcEnd: 5000, outStart: 500 },
    ]);
    expect(composition.durationMs).toBe(4600);
    expect(srcToOut(composition, 950)).toBe(550);
    expect(outToSrc(composition, 550)).toBe(950);
    expect(nextPlayableSrc(composition, 600)).toBe(900);
  });
});

describe("planShortenGaps", () => {
  it("shortens only pauses longer than the limit", () => {
    const plan = planShortenGaps(words, 5000, 600);
    expect(plan.shortened).toBe(1);
    expect(plan.savedMs).toBe(1600);
    expect(plan.after).toEqual([{ position: 3, gapTrimMs: 1600 }]);
    const composition = buildComposition(applyPatches(words, plan.after), 5000);
    expect(composition.segments).toEqual([
      { srcStart: 0, srcEnd: 2400, outStart: 0 },
      { srcStart: 4000, srcEnd: 5000, outStart: 2400 },
    ]);
    expect(composition.durationMs).toBe(3400);
  });

  it("clears trims when the limit is null", () => {
    const trimmed = applyPatches(words, [{ position: 3, gapTrimMs: 1600 }]);
    const plan = planShortenGaps(trimmed, 5000, null);
    expect(plan.after).toEqual([{ position: 3, gapTrimMs: 0 }]);
    expect(plan.before).toEqual([{ position: 3, gapTrimMs: 1600 }]);
  });
});

describe("edits", () => {
  it("finds fillers ignoring punctuation", () => {
    const matches = findFillers(words);
    expect(matches).toEqual([{ phrase: "um", positions: [1] }]);
  });

  it("plans cuts with inverse patches", () => {
    const plan = planSetDeleted(words, [{ from: 1, to: 2 }], true);
    expect(plan.after).toEqual([
      { position: 1, deleted: true },
      { position: 2, deleted: true },
    ]);
    expect(plan.before).toEqual([
      { position: 1, deleted: false },
      { position: 2, deleted: false },
    ]);
  });

  it("splits sentences at terminal punctuation", () => {
    const sentences = splitSentences(words);
    expect(sentences.map((s) => [s.from, s.to])).toEqual([
      [0, 3],
      [4, 4],
    ]);
  });
});

describe("exports", () => {
  const edited = applyPatches(words, [{ position: 1, deleted: true }]);
  const speakers = [{ id: "s1", name: "Maya", position: 0 }];

  it("writes captions that skip cut words", () => {
    const srt = exportTranscript("srt", edited, speakers, 5000);
    expect(srt.startsWith("1\n00:00:00,000 --> ")).toBe(true);
    expect(srt).toContain("Hello, welcome back.");
    expect(srt).not.toContain("um,");
    const vtt = exportTranscript("vtt", edited, speakers, 5000);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("<v Maya>");
  });

  it("writes plain text with speaker headers", () => {
    const txt = exportTranscript("txt", edited, speakers, 5000);
    expect(txt).toBe("Maya (00:00)\nHello, welcome back. Today\n");
  });

  it("summarizes the edit as a 48-bucket speech print", () => {
    const print = computeSpeechPrint(edited, speakers, 5000);
    expect(print).toHaveLength(96);
    expect(print).toMatch(/^([0-9][a-fz])+$/);
  });
});
