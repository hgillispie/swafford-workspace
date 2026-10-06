import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject, nowIso, requireUserEmail } from "../server/lib/access.js";
import { clipLook } from "../server/lib/clip-look.js";
import { scoreLocally } from "../server/lib/score.js";
import { parseWords } from "../server/lib/words.js";

export default defineAction({
  description:
    "Score moments with the deterministic local fallback and save them. This is not the agent. Use it when no model is available.",
  schema: z.object({
    id: z.string().min(1),
  }),
  run: async ({ id }) => {
    const ownerEmail = requireUserEmail();
    const project = await editProject(id);
    const words = parseWords(project.wordsJson);
    const moments = scoreLocally(words);
    if (moments.length === 0) {
      fail("The transcript is too short to score locally.", {
        statusCode: 409,
        errorCode: "no_transcript",
      });
    }
    const db = getDb();
    await db
      .delete(schema.clips)
      .where(
        and(eq(schema.clips.projectId, id), eq(schema.clips.source, "local")),
      );
    const now = nowIso();
    const look = clipLook(project);
    await db.insert(schema.clips).values(
      moments.map((item) => ({
        id: crypto.randomUUID(),
        projectId: id,
        title: item.title,
        startMs: item.startMs,
        endMs: item.endMs,
        score: item.score,
        reason: item.reason,
        hook: item.hook,
        engagement: item.engagement,
        valueScore: item.value,
        shareability: item.shareability,
        ...look,
        source: "local",
        status: "draft",
        ownerEmail,
        orgId: project.orgId,
        createdAt: now,
      })),
    );
    return { saved: moments.length, scorer: "local" as const, moments };
  },
});
