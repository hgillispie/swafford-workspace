import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  commitEdit,
  editProject,
  loadWords,
  requireTranscript,
} from "../server/lib/projects.js";
import {
  countFillers,
  DEFAULT_FILLERS,
  findFillers,
  planSetDeleted,
  rangesFromPositions,
} from "../shared/transcript.js";

export default defineAction({
  description:
    'Find and cut filler words (default: um, uh, er, erm, ah, hmm) across a project\'s transcript. Pass fillers to target specific words or phrases such as "you know". Use dryRun to preview counts without editing.',
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    fillers: z
      .array(z.string().trim().min(1).max(40))
      .max(30)
      .optional()
      .describe(
        "Filler words/phrases to cut; defaults to um, uh, er, erm, ah, hmm",
      ),
    dryRun: z
      .boolean()
      .optional()
      .describe("Preview counts only; defaults to false"),
  }),
  run: async ({ projectId, fillers, dryRun }) => {
    const project = await editProject(projectId);
    const words = await loadWords(projectId);
    requireTranscript(words);
    const matches = findFillers(
      words,
      fillers && fillers.length > 0 ? fillers : DEFAULT_FILLERS,
    );
    const counts = countFillers(matches);
    const positions = matches.flatMap((match) => match.positions);
    if (dryRun || positions.length === 0) {
      return {
        counts,
        found: matches.length,
        changed: 0,
        before: [],
        after: [],
      };
    }
    const plan = planSetDeleted(words, rangesFromPositions(positions), true);
    const result = await commitEdit(project, plan);
    return {
      ...result,
      counts,
      found: matches.length,
      message: `Cut ${matches.length} filler${matches.length === 1 ? "" : "s"}.`,
    };
  },
});
