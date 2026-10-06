import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { enqueuePrepare } from "../server/lib/prepare.js";
import { editProject, toSummary } from "../server/lib/projects.js";

export default defineAction({
  description:
    "Queue proxy generation and word-level transcription for a project whose original already lives in object storage. The media worker extracts audio and transcribes it. Does not download the video inside this action.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    force: z
      .boolean()
      .optional()
      .describe("Queue again even if a transcription is already marked processing"),
  }),
  run: async ({ id, force }) => {
    const project = await editProject(id);
    if (!project.sourceKey) {
      fail("Attach a library video before transcribing.", {
        errorCode: "no_media",
        statusCode: 409,
      });
    }
    if (project.transcriptStatus === "processing" && !force) {
      fail("A transcription is already queued for this project.", {
        errorCode: "already_processing",
        statusCode: 409,
      });
    }
    await enqueuePrepare(project);
    return { project: toSummary({ ...project, transcriptStatus: "processing" }) };
  },
});
