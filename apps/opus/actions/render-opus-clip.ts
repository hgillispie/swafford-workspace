import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject } from "../server/lib/access.js";
import { enqueueMediaJob } from "../server/lib/jobs.js";
import { parseWords } from "../server/lib/words.js";

export default defineAction({
  description:
    "Queue one worker job that downloads the original once and renders the selected clips. Face tracking uses the 720p proxy. Pass clipId for one clip, or omit it to render every saved clip.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    clipId: z
      .string()
      .min(1)
      .optional()
      .describe("Render this clip. Omit to render every saved clip."),
    clipIds: z
      .array(z.string().min(1))
      .max(40)
      .optional()
      .describe("Render these clips in the same job."),
  }),
  run: async ({ id, clipId, clipIds }) => {
    const project = await editProject(id);
    if (!project.sourceKey) {
      fail("This project has no source video yet.", {
        statusCode: 409,
        errorCode: "no_media",
      });
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.clips)
      .where(eq(schema.clips.projectId, id));
    const wanted = new Set([...(clipIds ?? []), ...(clipId ? [clipId] : [])]);
    const selected =
      wanted.size === 0
        ? rows
        : rows.filter((clip) => wanted.has(clip.id));
    if (wanted.size > 0 && selected.length !== wanted.size) {
      fail("One of those clips is not on this project.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    }
    const clips = selected.filter(
      (clip) => clip.status !== "queued" && clip.status !== "rendering",
    );
    if (clips.length === 0) {
      fail(
        selected.length === 0
          ? "Save moments before rendering."
          : "Those clips are already rendering.",
        { statusCode: 409, errorCode: "nothing_to_render" },
      );
    }
    const words = parseWords(project.wordsJson);
    const jobId = await enqueueMediaJob({
      kind: "opus-render",
      subjectId: project.id,
      orgId: project.orgId,
      ownerEmail: project.ownerEmail,
      payload: {
        sourceKey: project.sourceKey,
        proxyKey: project.proxyKey,
        clips: clips.map((clip) => ({
          clipId: clip.id,
          outputKey: `opus/${project.id}/clips/${clip.id}.mp4`,
          startMs: clip.startMs,
          endMs: clip.endMs,
          words: words
            .filter(
              (word) => word.endMs > clip.startMs && word.startMs < clip.endMs,
            )
            .map((word) => ({
              text: word.text,
              startMs: Math.max(0, word.startMs - clip.startMs),
              endMs: Math.max(0, word.endMs - clip.startMs),
            })),
          captionStyle: clip.captionStyle,
          font: clip.captionFont,
          position: clip.captionPosition,
          aspect: clip.aspect,
          title: clip.title,
          hookOverlay: clip.hookOverlay !== 0,
        })),
      },
    });
    await db
      .update(schema.clips)
      .set({ status: "queued", jobId, outputKey: null, error: null })
      .where(
        and(
          eq(schema.clips.projectId, id),
          inArray(
            schema.clips.id,
            clips.map((clip) => clip.id),
          ),
        ),
      );
    return { jobId, clipIds: clips.map((clip) => clip.id) };
  },
});
