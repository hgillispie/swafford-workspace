import { defineAction } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { abortUpload } from "../server/lib/b2.js";
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
    "Abort an in-progress dump upload and delete its metadata. Also removes any object already stored for that key.",
  schema: z.object({
    id: z.string().describe("Dump file id."),
  }),
  run: async ({ id }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    try {
      await abortUpload({ key: file.b2Key, uploadId: file.uploadId });
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
    return { id, message: `Aborted upload for ${file.filename}.` };
  },
});
