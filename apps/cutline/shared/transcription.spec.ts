import { describe, expect, it } from "vitest";

import {
  buildTranscriptWords,
  compactWords,
  distributeWords,
} from "./transcription";

describe("distributeWords", () => {
  it("spreads untimed text across the segment in order", () => {
    const words = distributeWords("hello big world", 1000, 4000);
    expect(words.map((w) => w.text)).toEqual(["hello", "big", "world"]);
    expect(words[0].startMs).toBe(1000);
    for (let i = 1; i < words.length; i++) {
      expect(words[i].startMs).toBeGreaterThanOrEqual(words[i - 1].endMs);
    }
    expect(words[words.length - 1].endMs).toBeLessThanOrEqual(4000);
  });
});

describe("buildTranscriptWords", () => {
  it("keeps timestamps monotonic when chunks overlap slightly", () => {
    const built = buildTranscriptWords([
      {
        text: "a b",
        startMs: 0,
        endMs: 1000,
        speakerLabel: "s0",
        words: [
          { text: "a", startMs: 0, endMs: 400 },
          { text: "b", startMs: 500, endMs: 1000 },
        ],
      },
      {
        text: "c",
        startMs: 450,
        endMs: 1200,
        speakerLabel: "s0",
        words: [{ text: "c", startMs: 450, endMs: 1200 }],
      },
    ]);
    const starts = built.words.map((w) => w.startMs);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
    expect(built.words.every((w) => w.endMs >= w.startMs)).toBe(true);
  });

  it("starts paragraphs on speaker changes and long pauses", () => {
    const built = buildTranscriptWords([
      { text: "one two", startMs: 0, endMs: 1000, speakerLabel: "s0" },
      { text: "three", startMs: 1100, endMs: 1500, speakerLabel: "s1" },
      { text: "four", startMs: 1600, endMs: 2000, speakerLabel: "s1" },
      { text: "five", startMs: 6000, endMs: 6500, speakerLabel: "s1" },
    ]);
    expect(built.words.map((w) => w.paragraphStart)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(built.speakers.map((s) => s.name)).toEqual([
      "Speaker 1",
      "Speaker 2",
    ]);
  });
});

describe("compactWords", () => {
  it("serializes words with speaker indexes", () => {
    const built = buildTranscriptWords([
      { text: "hi", startMs: 0, endMs: 300, speakerLabel: "s1" },
      { text: "there", startMs: 400, endMs: 800, speakerLabel: "s0" },
    ]);
    const { speakers, words } = compactWords(built);
    expect(speakers).toEqual(["Speaker 1", "Speaker 2"]);
    expect(words).toEqual([
      ["hi", 0, expect.any(Number), 0, 1],
      ["there", 400, expect.any(Number), 1, 1],
    ]);
  });
});
