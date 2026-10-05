import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import {
  dumpFiles,
  dumpFolders,
  getDb,
  loadFolder,
  requireActor,
} from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Delete an empty dump folder. Refuses when the folder still contains files or folders.",
  schema: z.object({
    id: z.string().describe("Folder id."),
  }),
  run: async ({ id }) => {
    const { orgId } = requireActor();
    const folder = await loadFolder(id, orgId);
    const db = getDb();
    const [child] = await db
      .select({ id: dumpFolders.id })
      .from(dumpFolders)
      .where(and(eq(dumpFolders.parentId, id), eq(dumpFolders.orgId, orgId)))
      .limit(1);
    const [file] = await db
      .select({ id: dumpFiles.id })
      .from(dumpFiles)
      .where(and(eq(dumpFiles.folderId, id), eq(dumpFiles.orgId, orgId)))
      .limit(1);
    if (child || file) {
      fail("Empty this folder before deleting it.", {
        statusCode: 409,
        errorCode: "folder_not_empty",
      });
    }
    await db
      .delete(dumpFolders)
      .where(and(eq(dumpFolders.id, id), eq(dumpFolders.orgId, orgId)));
    return { id, message: `Deleted folder ${folder.name}.` };
  },
});
