import { defineAction } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import {
  assertFolderInOrg,
  dumpFiles,
  getDb,
  loadFile,
  requireActor,
  toFile,
} from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Rename a dump file, replace its tags or notes, or move it to another folder.",
  schema: z.object({
    id: z.string().describe("Dump file id."),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .optional()
      .describe("New filename. Omit to leave it unchanged."),
    notes: z
      .string()
      .max(4000)
      .nullable()
      .optional()
      .describe("Replacement note, or null to clear it. Omit to leave it."),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .optional()
      .describe("Replacement tags. Pass an empty array to clear them."),
    folderId: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Destination folder id, or null for the library root. Omit to leave the folder unchanged.",
      ),
  }),
  run: async ({ id, filename, notes, tags, folderId }) => {
    const { orgId } = requireActor();
    const current = await loadFile(id, orgId);
    if (folderId) await assertFolderInOrg(folderId, orgId);
    const [row] = await getDb()
      .update(dumpFiles)
      .set({
        ...(filename ? { filename } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(tags ? { tags: tags.length ? JSON.stringify(tags) : null } : {}),
        ...(folderId !== undefined ? { folderId } : {}),
      })
      .where(and(eq(dumpFiles.id, id), eq(dumpFiles.orgId, orgId)))
      .returning();
    return {
      id,
      file: row ? toFile(row) : toFile(current),
      message: "File updated.",
    };
  },
});
