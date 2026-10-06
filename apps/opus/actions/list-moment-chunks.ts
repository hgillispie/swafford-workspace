import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { readProject } from "../server/lib/access.js";
import { momentChunks } from "../server/lib/sentences.js";
import { parseWords } from "../server/lib/words.js";

export default defineAction({
  description:
    "Page a project's transcript as sentence chunks. Call with offset 0, then advance until offset covers total. Rank across every chunk before save-opus-moments.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe("Chunk index to start at. Defaults to 0."),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(8)
      .default(4)
      .describe("Chunks to return, from 1 to 8. Defaults to 4."),
  }),
  http: { method: "GET" },
  run: async ({ id, offset, limit }) => {
    const project = await readProject(id);
    const words = parseWords(project.wordsJson);
    if (words.length === 0) {
      fail("Transcribe the video before reading chunks.", {
        statusCode: 409,
        errorCode: "no_transcript",
      });
    }
    const chunks = momentChunks(words);
    return {
      total: chunks.length,
      offset,
      durationMs: project.durationMs,
      chunks: chunks.slice(offset, offset + limit).map((chunk) => ({
        index: chunk.index,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        text: chunk.text,
        sentences: chunk.sentences,
      })),
    };
  },
});
