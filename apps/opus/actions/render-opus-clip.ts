import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { editProject } from "../server/lib/access.js";
import { enqueueMediaJob } from "../server/lib/jobs.js";
import { parseWords } from "../server/lib/words.js";

export default defineAction({
  description:
    "Queue a 9:16 render of one saved moment. The worker crops to the subject and burns animated captions.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    clipId: z.string().min(1),
  }),
  run: async ({ id, clipId }) => {
    const project = await editProject(id);
    if (!project.sourceKey) {
      fail("This project has no source video yet.", {
        statusCode: 409,
        errorCode: "no_media",
      });
    }
    const db = getDb();
    const [clip] = await db
      .select()
      .from(schema.clips)
      .where(and(eq(schema.clips.id, clipId), eq(schema.clips.projectId, id)))
      .limit(1);
    if (!clip) {
      fail("Clip not found.", { statusCode: 404, errorCode: "not_found" });
    }
    const words = parseWords(project.wordsJson).filter(
      (word) => word.endMs > clip.startMs && word.startMs < clip.endMs,
    );
    const outputKey = `opus/${project.id}/clips/${clip.id}.mp4`;
    const jobId = await enqueueMediaJob({
      kind: "opus-render",
      subjectId: project.id,
      orgId: project.orgId,
      ownerEmail: project.ownerEmail,
      payload: {
        sourceKey: project.sourceKey,
        outputKey,
        startMs: clip.startMs,
        endMs: clip.endMs,
        words,
        captionStyle: project.captionStyle,
        font: project.captionFont,
        title: clip.title,
      },
    });
    await db
      .update(schema.clips)
      .set({ status: "queued", jobId, outputKey: null, error: null })
      .where(eq(schema.clips.id, clip.id));
    return { jobId, clipId: clip.id };
  },
});
