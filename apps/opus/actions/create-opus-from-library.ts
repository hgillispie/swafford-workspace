import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  currentOrgId,
  nowIso,
  requireUserEmail,
} from "../server/lib/access.js";
import { enqueuePrepare } from "../server/lib/prepare.js";

export default defineAction({
  description:
    "Create an Opus project from a ready dumps video and queue proxy plus transcription.",
  schema: z.object({
    dumpFileId: z.string().min(1).describe("Ready dump file id."),
    title: z.string().trim().max(200).optional(),
  }),
  run: async ({ dumpFileId, title }) => {
    const ownerEmail = requireUserEmail();
    const orgId = currentOrgId();
    const db = getDb();
    const [file] = await db
      .select()
      .from(schema.libraryFiles)
      .where(
        and(
          eq(schema.libraryFiles.id, dumpFileId),
          eq(schema.libraryFiles.orgId, orgId ?? ""),
        ),
      )
      .limit(1);
    if (!file || file.status !== "ready") {
      fail("That library video is not ready.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    }
    const now = nowIso();
    const [row] = await db
      .insert(schema.projects)
      .values({
        id: crypto.randomUUID(),
        title: title?.trim() || file.filename,
        mediaFilename: file.filename,
        mediaMimeType: file.contentType,
        mediaBytes: file.sizeBytes,
        sourceKey: file.b2Key,
        dumpFileId: file.id,
        transcriptStatus: "processing",
        ownerEmail,
        orgId,
        visibility: "org",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await enqueuePrepare(row);
    return { id: row.id, title: row.title };
  },
});
