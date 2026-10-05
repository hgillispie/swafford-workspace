import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { listUploadedParts, partCountFor, planParts } from "../server/lib/b2.js";
import { failB2, loadFile, requireActor } from "../server/lib/dumps.js";

export default defineAction({
  description:
    "List parts already stored for an open multipart upload so a browser can resume after a refresh. Does not return file bytes.",
  schema: z.object({
    id: z.string().describe("Dump file id with status uploading or failed."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status === "ready" || !file.uploadId) {
      fail("This file has no open upload to resume.", {
        statusCode: 409,
        errorCode: "upload_not_open",
      });
    }
    const partSize = file.partSizeBytes ?? planParts(file.sizeBytes).partSize;
    try {
      const parts = await listUploadedParts({
        key: file.b2Key,
        uploadId: file.uploadId,
      });
      return {
        id,
        filename: file.filename,
        sizeBytes: file.sizeBytes,
        partSize,
        partCount: partCountFor(file.sizeBytes, partSize),
        parts,
        message: `${parts.length} parts are already stored for ${file.filename}.`,
      };
    } catch (err) {
      failB2(err);
    }
  },
});
