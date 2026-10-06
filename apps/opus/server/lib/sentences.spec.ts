import { describe, expect, it } from "vitest";

import {
  momentChunks,
  sentencesFromWords,
  snapToSentences,
} from "./sentences.js";
import type { TranscriptWord } from "./words.js";

function wordsFrom(text: string, startMs = 0): TranscriptWord[] {
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.map((part, index) => ({
    text: part,
    startMs: startMs + index * 400,
    endMs: startMs + index * 400 + 320,
  }));
}

describe("sentence snapping", () => {
  it("expands a mid-sentence range to the surrounding punctuation", () => {
    const words = wordsFrom(
      "Hello there friend. This is the moment we keep. Then we stop.",
    );
    const target = words[5];
    const snapped = snapToSentences(
      words,
      target.startMs,
      target.endMs + 200,
    );
    expect(snapped.startMs).toBe(words[3].startMs);
    expect(snapped.endMs).toBe(words[8].endMs);
  });

  it("starts a new sentence after a long pause", () => {
    const first = wordsFrom("We begin here.");
    const second = wordsFrom("Later we continue.", first[2].endMs + 3000);
    const sentences = sentencesFromWords([...first, ...second]);
    expect(sentences).toHaveLength(2);
    expect(sentences[1].text).toBe("Later we continue.");
  });

  it("pages a long transcript into chunks and still snaps inside one", () => {
    const words = wordsFrom(
      Array.from({ length: 80 }, (_, index) =>
        index % 8 === 7 ? `word${index}.` : `word${index}`,
      ).join(" "),
    );
    const chunks = momentChunks(words, 4_000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[1].startMs).toBeGreaterThan(chunks[0].startMs);
    const snapped = snapToSentences(
      words,
      chunks[0].startMs + 100,
      chunks[0].startMs + 900,
      20_000,
    );
    expect(snapped.endMs).toBeGreaterThan(snapped.startMs);
    expect(snapped.endMs - snapped.startMs).toBeLessThanOrEqual(20_000);
  });
});
