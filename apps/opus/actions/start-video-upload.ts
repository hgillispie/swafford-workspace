import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { currentOrgId, nowIso, requireUserEmail } from "../server/lib/access.js";
import {
  B2ConfigError,
  contentTypeForName,
  createUpload,
  objectKey,
  planParts,
  publicB2Error,
} from "../server/lib/b2.js";

const MAX_BYTES = 5 * 1024 * 1024 * 1024 * 1024;

export default defineAction({
  description:
    "Begin a multipart upload into the shared dumps bucket. The browser PUTs parts with sign-video-parts. Do not send file bytes.",
  schema: z.object({
    filename: z.string().trim().min(1).max(240),
    sizeBytes: z.number().int().nonnegative().max(MAX_BYTES),
    contentType: z.string().max(200).optional(),
  }),
  run: async ({ filename, sizeBytes, contentType }) => {
    const ownerEmail = requireUserEmail();
    const orgId = currentOrgId();
    if (!orgId) {
      fail("Sign in to an organization before uploading.", {
        statusCode: 401,
        errorCode: "unauthenticated",
      });
    }
    const id = crypto.randomUUID();
    const key = objectKey(orgId, id, filename);
    const mime = contentType?.trim() || contentTypeForName(filename);
    const { partSize, partCount } = planParts(sizeBytes);
    let uploadId = "";
    try {
      uploadId = await createUpload({ key, contentType: mime });
    } catch (err) {
      if (err instanceof B2ConfigError) {
        fail(err.message, { statusCode: 503, errorCode: "b2_not_configured" });
      }
      fail(publicB2Error(err), { statusCode: 502, errorCode: "b2_request_failed" });
    }
    await getDb().insert(schema.libraryFiles).values({
      id,
      filename,
      sizeBytes,
      contentType: mime,
      uploaderEmail: ownerEmail,
      b2Key: key,
      uploadId,
      partSizeBytes: partSize,
      status: "uploading",
      ownerEmail,
      orgId,
      visibility: "org",
      createdAt: nowIso(),
    });
    return { id, partSize, partCount };
  },
});
