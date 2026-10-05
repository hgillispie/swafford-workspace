import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  commitEdit,
  editProject,
  loadWords,
  requireTranscript,
} from "../server/lib/projects.js";
import { planSetDeleted } from "../shared/transcript.js";

export default defineAction({
  description:
    "Cut (deleted=true) or restore (deleted=false) transcript words by inclusive word-position ranges. Cutting removes those words' media from the edit non-destructively; restoring brings it back. Get positions from get-transcript or find-in-transcript.",
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    ranges: z
      .array(
        z.object({
          from: z
            .number()
            .int()
            .min(0)
            .describe("First word position (inclusive)"),
          to: z
            .number()
            .int()
            .min(0)
            .describe("Last word position (inclusive)"),
        }),
      )
      .min(1)
      .max(1000)
      .describe("Word position ranges to change"),
    deleted: z
      .boolean()
      .describe("true to cut the words, false to restore them"),
  }),
  run: async ({ projectId, ranges, deleted }) => {
    const project = await editProject(projectId);
    const words = await loadWords(projectId);
    requireTranscript(words);
    const plan = planSetDeleted(words, ranges, deleted);
    const result = await commitEdit(project, plan);
    return {
      ...result,
      message: `${deleted ? "Cut" : "Restored"} ${result.changed} word${result.changed === 1 ? "" : "s"}.`,
    };
  },
});
