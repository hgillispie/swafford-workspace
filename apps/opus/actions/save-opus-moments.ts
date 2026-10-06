import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject, nowIso, requireUserEmail } from "../server/lib/access.js";
import { clipLook } from "../server/lib/clip-look.js";
import { snapToSentences } from "../server/lib/sentences.js";
import { parseWords } from "../server/lib/words.js";

const moment = z.object({
  title: z.string().trim().min(1).max(120),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(1),
  score: z.number().int().min(0).max(100),
  reason: z.string().trim().min(1).max(400),
  hook: z.number().int().min(0).max(100).default(0),
  engagement: z.number().int().min(0).max(100).default(0),
  value: z.number().int().min(0).max(100).default(0),
  shareability: z.number().int().min(0).max(100).default(0),
});

export default defineAction({
  description:
    "Save the agent's global shortlist. Snaps each range to sentence boundaries and replaces earlier agent moments that have not been rendered.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    moments: z.array(moment).min(1).max(12),
  }),
  run: async ({ id, moments }) => {
    const ownerEmail = requireUserEmail();
    const project = await editProject(id);
    const words = parseWords(project.wordsJson);
    if (words.length === 0) {
      fail("Transcribe the video before saving moments.", {
        statusCode: 409,
        errorCode: "no_transcript",
      });
    }
    const duration = Math.max(
      project.durationMs,
      words[words.length - 1]?.endMs ?? 0,
    );
    const look = clipLook(project);
    const snapped = moments.map((item) => {
      const range = snapToSentences(words, item.startMs, item.endMs);
      return { ...item, startMs: range.startMs, endMs: range.endMs };
    });
    for (const item of snapped) {
      if (item.endMs <= item.startMs || item.endMs > duration + 1500) {
        fail(`"${item.title}" is outside the transcript.`, {
          statusCode: 400,
          errorCode: "bad_range",
        });
      }
    }
    const db = getDb();
    await db
      .delete(schema.clips)
      .where(
        and(eq(schema.clips.projectId, id), eq(schema.clips.source, "agent")),
      );
    const now = nowIso();
    await db.insert(schema.clips).values(
      snapped.map((item) => ({
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
        source: "agent",
        status: "draft",
        ownerEmail,
        orgId: project.orgId,
        createdAt: now,
      })),
    );
    return { saved: snapped.length, scorer: "agent" as const, moments: snapped };
  },
});
