import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  completeUpload,
  partCountFor,
  planParts,
  publicB2Error,
  B2ConfigError,
} from "../server/lib/b2.js";
import { enqueuePrepare } from "../server/lib/prepare.js";
import {
  currentOrgId,
  nowIso,
  requireUserEmail,
  toSummary,
} from "../server/lib/projects.js";

export default defineAction({
  description:
    "Finish a multipart video upload, create a Cutline project for that file, and queue proxy plus transcription jobs.",
  schema: z.object({
    id: z.string().describe("Upload id."),
    title: z.string().trim().max(200).optional(),
    parts: z
      .array(
        z.object({
          partNumber: z.number().int().min(1).max(10000),
          etag: z.string().trim().min(1).max(200),
        }),
      )
      .min(1)
      .max(10000),
    durationMs: z.number().int().min(0).optional(),
    mediaWidth: z.number().int().min(0).optional(),
    mediaHeight: z.number().int().min(0).optional(),
  }),
  run: async ({ id, title, parts, durationMs, mediaWidth, mediaHeight }) => {
    const ownerEmail = requireUserEmail();
    const orgId = currentOrgId() ?? "";
    const db = getDb();
    const [file] = await db
      .select()
      .from(schema.libraryFiles)
      .where(
        and(eq(schema.libraryFiles.id, id), eq(schema.libraryFiles.orgId, orgId)),
      )
      .limit(1);
    if (!file) {
      fail("Upload not found.", { statusCode: 404, errorCode: "not_found" });
    }
    if (file.status !== "ready") {
      if (!file.uploadId) {
        fail("This upload is not open.", {
          statusCode: 409,
          errorCode: "upload_not_open",
        });
      }
      const partSize = file.partSizeBytes ?? planParts(file.sizeBytes).partSize;
      const expected = partCountFor(file.sizeBytes, partSize);
      if (parts.length !== expected) {
        fail(`Expected ${expected} parts and received ${parts.length}.`, {
          statusCode: 400,
          errorCode: "incomplete_parts",
        });
      }
      try {
        await completeUpload({
          key: file.b2Key,
          uploadId: file.uploadId,
          parts,
        });
      } catch (err) {
        if (err instanceof B2ConfigError) {
          fail(err.message, { statusCode: 503, errorCode: "b2_not_configured" });
        }
        fail(publicB2Error(err), {
          statusCode: 502,
          errorCode: "b2_request_failed",
        });
      }
      await db
        .update(schema.libraryFiles)
        .set({ status: "ready", uploadId: null })
        .where(eq(schema.libraryFiles.id, id));
    }
    const now = nowIso();
    const [project] = await db
      .insert(schema.projects)
      .values({
        id: crypto.randomUUID(),
        title: title?.trim() || file.filename,
        mediaKind: "video",
        mediaFilename: file.filename,
        mediaMimeType: file.contentType,
        mediaBytes: file.sizeBytes,
        mediaSize: Math.min(file.sizeBytes, 2_147_483_647),
        mediaWidth: mediaWidth ?? null,
        mediaHeight: mediaHeight ?? null,
        durationMs: durationMs ?? 0,
        editedDurationMs: durationMs ?? 0,
        sourceKey: file.b2Key,
        dumpFileId: file.id,
        transcriptStatus: "processing",
        ownerEmail,
        orgId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await enqueuePrepare(project);
    return { project: toSummary(project) };
  },
});
