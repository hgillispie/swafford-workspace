import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { signParts } from "../server/lib/b2.js";
import { failB2, loadFile, requireActor } from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Sign a batch of multipart upload part URLs. The browser PUTs each part directly to Backblaze and reads the ETag. Call this while an upload is in progress.",
  schema: z.object({
    id: z.string().describe("Dump file id returned by start-dump-upload."),
    partNumbers: z
      .array(z.number().int().min(1).max(10000))
      .min(1)
      .max(50)
      .describe("1-based part numbers to sign. At most 50 per call."),
  }),
  run: async ({ id, partNumbers }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status !== "uploading" || !file.uploadId) {
      fail("This file is not waiting for parts.", {
        statusCode: 409,
        errorCode: "upload_not_open",
      });
    }
    try {
      const parts = await signParts({
        key: file.b2Key,
        uploadId: file.uploadId,
        partNumbers,
      });
      return {
        id,
        parts,
        message: `Signed ${parts.length} part URL${parts.length === 1 ? "" : "s"}.`,
      };
    } catch (err) {
      failB2(err);
    }
  },
});
