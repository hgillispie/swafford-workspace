import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  editProject,
  nowIso,
  refreshDerived,
  replaceTranscript,
  toSummary,
} from "../server/lib/projects.js";

const compactWord = z.tuple([
  z.string().min(1).max(200),
  z.number().int().min(0),
  z.number().int().min(0),
  z.number().int().min(0),
  z.union([z.literal(0), z.literal(1)]),
]);

export default defineAction({
  description:
    "Save a transcript produced by the editor's in-browser transcription, replacing the project's words, speakers, and edits, and mark it ready.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    speakers: z
      .array(z.string().trim().min(1).max(80))
      .min(1)
      .max(50)
      .describe("Speaker names; words reference them by index"),
    words: z
      .array(compactWord)
      .min(1)
      .max(200_000)
      .describe("Words as [text, startMs, endMs, speakerIndex, paragraphStart 0|1]"),
    language: z.string().max(20).nullable().optional().describe("Detected language"),
    durationMs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Media duration in milliseconds"),
  }),
  agentTool: false,
  timeoutMs: 2 * 60 * 1000,
  run: async ({ id, speakers, words, language, durationMs }) => {
    const project = await editProject(id);
    if (words.some((w) => w[3] >= speakers.length)) {
      fail("A word references a missing speaker.", {
        errorCode: "invalid_speaker",
      });
    }
    await replaceTranscript(
      project,
      speakers.map((name, i) => ({ key: String(i), name })),
      words.map(([text, startMs, endMs, speaker, paragraph]) => ({
        text,
        startMs,
        endMs,
        speakerKey: String(speaker),
        paragraphStart: paragraph === 1,
      })),
    );
    const db = getDb();
    const [row] = await db
      .update(schema.projects)
      .set({
        durationMs: Math.max(
          project.durationMs,
          durationMs ?? 0,
          words[words.length - 1]?.[2] ?? 0,
        ),
        language: language ?? null,
        transcriptStatus: "ready",
        transcriptSource: "builder",
        transcriptError: null,
        updatedAt: nowIso(),
      })
      .where(eq(schema.projects.id, id))
      .returning();
    return toSummary(await refreshDerived(row ?? project));
  },
});
