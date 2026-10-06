import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  commitEdit,
  editProject,
  loadWords,
  mediaDuration,
  requireTranscript,
} from "../server/lib/projects.js";
import { DEFAULT_MAX_GAP_MS, planShortenGaps } from "../shared/transcript.js";

export default defineAction({
  description:
    "Shorten every pause between words that is longer than maxGapMs down to maxGapMs (non-destructive, recomputed from the original pauses each time). Use clear to restore all original pauses, or dryRun to preview.",
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    maxGapMs: z
      .number()
      .int()
      .min(100)
      .max(5000)
      .default(DEFAULT_MAX_GAP_MS)
      .describe(
        "Longest pause to keep, in milliseconds (100-5000); defaults to 600",
      ),
    clear: z
      .boolean()
      .optional()
      .describe("Restore all original pauses instead; defaults to false"),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview without editing; defaults to false"),
  }),
  run: async ({ projectId, maxGapMs, clear, dryRun }) => {
    const project = await editProject(projectId);
    const words = await loadWords(projectId);
    requireTranscript(words);
    const plan = planShortenGaps(
      words,
      mediaDuration(project, words),
      clear ? null : maxGapMs,
    );
    if (dryRun) {
      return {
        shortened: plan.shortened,
        savedMs: plan.savedMs,
        changed: 0,
        before: [],
        after: [],
      };
    }
    const result = await commitEdit(project, plan);
    return {
      ...result,
      shortened: plan.shortened,
      savedMs: plan.savedMs,
      message: clear
        ? "Restored original pauses."
        : `Shortened ${plan.shortened} pause${plan.shortened === 1 ? "" : "s"}.`,
    };
  },
});
