import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { presignGet } from "../server/lib/b2.js";
import {
  dumpShares,
  failB2,
  getDb,
  loadFile,
  requireActor,
} from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Open an unexpired share link as a signed-in member of the file's organization and return a 15-minute download URL.",
  schema: z.object({
    token: z.string().min(16).max(200).describe("Share token from the link."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ token }) => {
    const { orgId } = requireActor();
    const [share] = await getDb()
      .select()
      .from(dumpShares)
      .where(and(eq(dumpShares.token, token), eq(dumpShares.orgId, orgId)))
      .limit(1);
    if (!share) {
      fail("Share link not found.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    }
    if (share.expiresAt < new Date().toISOString()) {
      fail("This share link has expired.", {
        statusCode: 410,
        errorCode: "share_expired",
      });
    }
    const file = await loadFile(share.fileId, orgId);
    if (file.status !== "ready") {
      fail("This file is not ready.", {
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
        id: file.id,
        filename: file.filename,
        contentType: file.contentType,
        url: signed.url,
        expiresInSeconds: signed.expiresInSeconds,
        expiresAt: share.expiresAt,
        message: `Opened share for ${file.filename}.`,
      };
    } catch (err) {
      failB2(err);
    }
  },
});
