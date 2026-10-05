import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { deleteObject } from "../server/lib/b2.js";
import {
  dumpFiles,
  dumpShares,
  failB2,
  getDb,
  loadFile,
  requireActor,
} from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Delete a ready dump file from the private bucket and remove its metadata.",
  schema: z.object({
    id: z.string().describe("Dump file id."),
  }),
  run: async ({ id }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status === "uploading") {
      fail("Abort the in-progress upload instead of deleting it.", {
        statusCode: 409,
        errorCode: "upload_open",
      });
    }
    try {
      await deleteObject(file.b2Key);
    } catch (err) {
      failB2(err);
    }
    const db = getDb();
    await db
      .delete(dumpShares)
      .where(and(eq(dumpShares.fileId, id), eq(dumpShares.orgId, orgId)));
    await db
      .delete(dumpFiles)
      .where(and(eq(dumpFiles.id, id), eq(dumpFiles.orgId, orgId)));
    return { id, message: `Deleted ${file.filename}.` };
  },
});
