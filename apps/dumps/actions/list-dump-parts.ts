import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import {
  isMissingMultipartUpload,
  listUploadedParts,
  partCountFor,
  planParts,
} from "../server/lib/b2.js";
import { failB2, loadFile, requireActor } from "../server/lib/dumps.js";

export default defineAction({
  description:
    "List parts already stored for an open multipart upload so a browser can resume after a refresh. Does not return file bytes. If Backblaze dropped the session, fails with upload_session_missing so the caller can restart-dump-upload.",
  schema: z.object({
    id: z.string().describe("Dump file id with status uploading or failed."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status === "ready") {
      fail("This file has no open upload to resume.", {
        statusCode: 409,
        errorCode: "upload_not_open",
      });
    }
    if (!file.uploadId) {
      fail(
        "Backblaze no longer has this upload session, so parts already sent cannot be resumed.",
        {
          statusCode: 409,
          errorCode: "upload_session_missing",
        },
      );
    }
    const sizeBytes = Number(file.sizeBytes);
    const partSize = Number(
      file.partSizeBytes ?? planParts(sizeBytes).partSize,
    );
    try {
      const parts = await listUploadedParts({
        key: file.b2Key,
        uploadId: file.uploadId,
      });
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
    } catch (err) {
      if (isMissingMultipartUpload(err)) {
        fail(
          "Backblaze no longer has this upload session, so parts already sent cannot be resumed.",
          {
            statusCode: 409,
            errorCode: "upload_session_missing",
          },
        );
      }
      failB2(err);
    }
  },
});
