import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { completeUpload, planParts } from "../server/lib/b2.js";
import {
  dumpFiles,
  failB2,
  getDb,
  loadFile,
  requireActor,
  toFile,
} from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Finish a multipart upload after every part has an ETag. Marks the dump file ready.",
  schema: z.object({
    id: z.string().describe("Dump file id."),
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().min(1).max(10000),
          etag: z.string().trim().min(1).max(200),
        }),
      )
      .min(1)
      .max(10000)
      .describe("Completed parts with the ETag returned by each PUT."),
  }),
  run: async ({ id, parts }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status === "ready") {
      return { id, file: toFile(file), message: "Upload already finished." };
    }
    if (!file.uploadId) {
      fail("This file has no open upload.", {
        statusCode: 409,
        errorCode: "upload_not_open",
      });
    }
    const { partCount } = planParts(file.sizeBytes);
    if (parts.length !== partCount) {
      fail(`Expected ${partCount} parts and received ${parts.length}.`, {
        statusCode: 400,
        errorCode: "incomplete_parts",
      });
    }
    let stored: { sizeBytes: number | null; contentType: string | null };
    try {
      stored = await completeUpload({
        key: file.b2Key,
        uploadId: file.uploadId,
        parts,
      });
    } catch (err) {
      await getDb()
        .update(dumpFiles)
        .set({ status: "failed" })
        .where(and(eq(dumpFiles.id, id), eq(dumpFiles.orgId, orgId)));
      failB2(err);
    }
    const [row] = await getDb()
      .update(dumpFiles)
      .set({
        status: "ready",
        uploadId: null,
        sizeBytes: stored.sizeBytes ?? file.sizeBytes,
        contentType: stored.contentType ?? file.contentType,
      })
      .where(and(eq(dumpFiles.id, id), eq(dumpFiles.orgId, orgId)))
      .returning();
    return {
      id,
      file: row ? toFile(row) : toFile(file),
      message: `Finished upload for ${file.filename}.`,
    };
  },
});
