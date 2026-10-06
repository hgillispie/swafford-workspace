import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  applyWordPatches,
  editProject,
  refreshDerived,
} from "../server/lib/projects.js";

export default defineAction({
  description:
    "Apply exact word state patches. Used by the editor for undo and redo.",
  schema: z.object({
    projectId: z.string().min(1).describe("Project id"),
    patches: z
      .array(
        z.object({
          position: z.number().int().min(0),
          deleted: z.boolean().optional(),
          gapTrimMs: z.number().int().min(0).max(600_000).optional(),
          text: z.string().trim().min(1).max(80).optional(),
        }),
      )
      .max(20_000),
  }),
  agentTool: false,
  maxBodyBytes: 2 * 1024 * 1024,
  run: async ({ projectId, patches }) => {
    const project = await editProject(projectId);
    const textPatches = patches.filter((patch) => patch.text !== undefined);
    const statePatches = patches.map(({ text: _text, ...rest }) => rest);
    const changed = await applyWordPatches(projectId, statePatches);
    if (textPatches.length > 0) {
      const db = getDb();
      for (const patch of textPatches) {
        await db
          .update(schema.transcriptWords)
          .set({ text: patch.text })
          .where(
            and(
              eq(schema.transcriptWords.projectId, projectId),
              eq(schema.transcriptWords.position, patch.position),
            ),
          );
      }
    }
    const row = await refreshDerived(project);
    return {
      changed: changed + textPatches.length,
      editedDurationMs: row.editedDurationMs,
    };
  },
});
