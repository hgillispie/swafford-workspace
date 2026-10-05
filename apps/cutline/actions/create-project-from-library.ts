import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { enqueuePrepare } from "../server/lib/prepare.js";
import {
  currentOrgId,
  nowIso,
  requireUserEmail,
  toSummary,
} from "../server/lib/projects.js";

export default defineAction({
  description:
    "Create a Cutline project from a video that is already ready in the dumps library, and queue proxy, audio, and transcription jobs.",
  schema: z.object({
    dumpFileId: z.string().min(1).describe("Ready dump file id."),
    title: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Project title. Defaults to the filename."),
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
        mediaKind: "video",
        mediaFilename: file.filename,
        mediaMimeType: file.contentType,
        mediaBytes: file.sizeBytes,
        mediaSize: Math.min(file.sizeBytes, 2_147_483_647),
        sourceKey: file.b2Key,
        dumpFileId: file.id,
        transcriptStatus: "processing",
        ownerEmail,
        orgId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await enqueuePrepare(row);
    return { project: toSummary(row) };
  },
});