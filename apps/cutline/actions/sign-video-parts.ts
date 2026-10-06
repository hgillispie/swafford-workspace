import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { publicB2Error, signParts, B2ConfigError } from "../server/lib/b2.js";
import { currentOrgId, requireUserEmail } from "../server/lib/projects.js";

export default defineAction({
  description:
    "Sign multipart PUT URLs for a video upload. The browser uploads each part directly to object storage.",
  schema: z.object({
    id: z.string().describe("Upload id from start-video-upload."),
    partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(50),
  }),
  run: async ({ id, partNumbers }) => {
    requireUserEmail();
    const orgId = currentOrgId() ?? "";
    const [file] = await getDb()
      .select()
      .from(schema.libraryFiles)
      .where(
        and(eq(schema.libraryFiles.id, id), eq(schema.libraryFiles.orgId, orgId)),
      )
      .limit(1);
    if (!file?.uploadId || file.status !== "uploading") {
      fail("This upload is not waiting for parts.", {
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
      return { id, parts };
    } catch (err) {
      if (err instanceof B2ConfigError) {
        fail(err.message, { statusCode: 503, errorCode: "b2_not_configured" });
      }
      fail(publicB2Error(err), { statusCode: 502, errorCode: "b2_request_failed" });
    }
  },
});
