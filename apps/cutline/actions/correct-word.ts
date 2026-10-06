import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject, nowIso } from "../server/lib/projects.js";

export default defineAction({
  description:
    "Fix the text of one transcript word (e.g. a misheard name) without changing the media or timing.",
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    position: z.number().int().min(0).describe("Word position to correct"),
    text: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => !/\s/.test(value), "Use a single word without spaces")
      .describe("Corrected word text (one word, punctuation allowed)"),
  }),
  run: async ({ projectId, position, text }) => {
    await editProject(projectId);
    const db = getDb();
    const where = and(
      eq(schema.transcriptWords.projectId, projectId),
      eq(schema.transcriptWords.position, position),
    );
    const [word] = await db
      .select({
        text: schema.transcriptWords.text,
        originalText: schema.transcriptWords.originalText,
      })
      .from(schema.transcriptWords)
      .where(where);
    if (!word)
      fail("No word at that position.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    await db
      .update(schema.transcriptWords)
      .set({ text, originalText: word.originalText ?? word.text })
      .where(where);
    await db
      .update(schema.projects)
      .set({ updatedAt: nowIso() })
      .where(eq(schema.projects.id, projectId));
    return {
      position,
      text,
      before: [{ position, text: word.text }],
      after: [{ position, text }],
    };
  },
});
