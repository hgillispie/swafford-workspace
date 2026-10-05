import { defineAction } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import {
  assertFolderInOrg,
  assertNoFolderCycle,
  dumpFolders,
  getDb,
  loadFolder,
  requireActor,
  toFolder,
} from "../server/lib/dumps.js";

export default defineAction({
  description: "Rename a dump folder or move it under another folder.",
  schema: z.object({
    id: z.string().describe("Folder id."),
    name: z
      .string()
      .trim()
      .min(1)
      .max(160)
      .optional()
      .describe("New folder name. Omit to leave it unchanged."),
    parentId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "New parent folder id, or null to move to the library root. Omit to leave the parent unchanged.",
      ),
  }),
  run: async ({ id, name, parentId }) => {
    const { orgId } = requireActor();
    const current = await loadFolder(id, orgId);
    const nextParent = parentId === undefined ? current.parentId : parentId;
    if (nextParent) await assertFolderInOrg(nextParent, orgId);
    if (parentId !== undefined) {
      await assertNoFolderCycle(id, nextParent, orgId);
    }
    const [row] = await getDb()
      .update(dumpFolders)
      .set({
        ...(name ? { name } : {}),
        ...(parentId !== undefined ? { parentId: nextParent } : {}),
      })
      .where(and(eq(dumpFolders.id, id), eq(dumpFolders.orgId, orgId)))
      .returning();
    return {
      id,
      folder: row ? toFolder(row) : toFolder(current),
      message: "Folder updated.",
    };
  },
});
