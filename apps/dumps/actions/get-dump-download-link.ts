import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { presignGet } from "../server/lib/b2.js";
import { failB2, loadFile, requireActor } from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Return a 15-minute presigned download URL for a ready dump file. Use it for download and for image, video, audio, or PDF preview.",
  schema: z.object({
    id: z.string().describe("Dump file id."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }) => {
    const { orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status !== "ready") {
      fail("This file is not ready to download.", {
        statusCode: 409,
        errorCode: "not_ready",
      });
    }
    try {
      const signed = await presignGet({
        key: file.b2Key,
        filename: file.filename,
      });
      return {
        id,
        filename: file.filename,
        contentType: file.contentType,
        url: signed.url,
        expiresInSeconds: signed.expiresInSeconds,
        message: `Download link for ${file.filename} expires in 15 minutes.`,
      };
    } catch (err) {
      failB2(err);
    }
  },
});
