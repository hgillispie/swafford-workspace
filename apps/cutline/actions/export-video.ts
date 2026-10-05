import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { enqueueMediaJob } from "../server/lib/media-jobs.js";
import {
  editProject,
  loadWords,
  mediaDuration,
  requireTranscript,
} from "../server/lib/projects.js";

export default defineAction({
  description:
    "Queue a full-quality MP4 export of the current transcript edit. Captions can be burned in or written as a sidecar SRT. The worker renders from the original file.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    quality: z
      .enum(["draft", "standard", "source"])
      .default("standard")
      .describe('Encode preset: "draft" 720p, "standard" 1080p, or "source"'),
    captions: z
      .enum(["none", "burn", "sidecar"])
      .default("sidecar")
      .describe('Caption mode: "none", "burn" into the picture, or "sidecar" SRT'),
  }),
  run: async ({ id, quality, captions }) => {
    const project = await editProject(id);
    if (!project.sourceKey) {
      fail("This project has no original media to export.", {
        statusCode: 409,
        errorCode: "no_media",
      });
    }
    const words = await loadWords(id);
    requireTranscript(words);
    const exportId = crypto.randomUUID();
    const outputKey = `cutline/${project.id}/exports/${exportId}.mp4`;
    const jobId = await enqueueMediaJob({
      kind: "cutline-render",
      subjectId: project.id,
      orgId: project.orgId,
      ownerEmail: project.ownerEmail,
      payload: {
        sourceKey: project.sourceKey,
        outputKey,
        sidecarKey: `cutline/${project.id}/exports/${exportId}.srt`,
        quality,
        captions,
        mediaDurationMs: mediaDuration(project, words),
        words: words.map((word) => ({
          text: word.text,
          startMs: word.startMs,
          endMs: word.endMs,
          deleted: word.deleted,
          gapTrimMs: word.gapTrimMs,
        })),
      },
    });
    return { jobId, exportId, outputKey };
  },
});
