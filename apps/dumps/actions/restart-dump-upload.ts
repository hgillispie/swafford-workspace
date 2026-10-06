import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import {
  abortUpload,
  BROWSER_MAX_PART_BYTES,
  createUpload,
  isMissingMultipartUpload,
  listUploadedParts,
  partCountFor,
  planParts,
} from "../server/lib/b2.js";
import {
  dumpFiles,
  failB2,
  getDb,
  loadFile,
  requireActor,
} from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Resume an open dump upload. Returns parts Backblaze already stored. If that multipart session is gone, or replaceEmpty is set and nothing has been stored for an oversized part size, opens a new one on the same row and returns no parts so the browser can send the file again. Does not accept file bytes.",
  schema: z.object({
    id: z.string().describe("Dump file id with status uploading or failed."),
    replaceEmpty: z
      .boolean()
      .optional()
      .describe(
        "When true and Backblaze has no parts yet, replace a part size above the browser limit with a new session.",
      ),
  }),
  run: async ({ id, replaceEmpty }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status === "ready") {
      fail("This file has no open upload to resume.", {
        statusCode: 409,
        errorCode: "upload_not_open",
      });
    }
    const sizeBytes = Number(file.sizeBytes);
    const planned = planParts(sizeBytes);
    let replace = false;
    if (file.uploadId) {
      try {
        const parts = await listUploadedParts({
          key: file.b2Key,
          uploadId: file.uploadId,
        });
        const partSize = Number(file.partSizeBytes ?? planned.partSize);
        replace =
          replaceEmpty === true &&
          parts.length === 0 &&
          partSize > BROWSER_MAX_PART_BYTES;
        if (!replace) {
          return {
            id,
            filename: file.filename,
            sizeBytes,
            partSize,
            partCount: partCountFor(sizeBytes, partSize),
            parts,
            restarted: false,
            message: `${parts.length} parts are already stored for ${file.filename}.`,
          };
        }
      } catch (err) {
        if (!isMissingMultipartUpload(err)) failB2(err);
      }
    }
    if (replace && file.uploadId) {
      await abortUpload({ key: file.b2Key, uploadId: file.uploadId });
    }
    const { partSize, partCount } = planned;
    let uploadId: string;
    try {
      uploadId = await createUpload({
        key: file.b2Key,
        contentType: file.contentType?.trim() || "application/octet-stream",
      });
    } catch (err) {
      failB2(err);
    }
    await getDb()
      .update(dumpFiles)
      .set({
        uploadId,
        partSizeBytes: partSize,
        status: "uploading",
      })
      .where(and(eq(dumpFiles.id, id), eq(dumpFiles.orgId, orgId)));
    return {
      id,
      filename: file.filename,
      sizeBytes,
      partSize,
      partCount,
      parts: [],
      restarted: true,
      message: replace
        ? `No parts were stored for ${file.filename}, and each part was too large for the browser to finish. Sending it again in smaller parts.`
        : `Backblaze dropped the open upload for ${file.filename}, so parts already sent cannot be resumed. Sending the file again from the start.`,
    };
  },
});
