import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  editProject,
  nowIso,
  refreshDerived,
  toSummary,
} from "../server/lib/projects.js";

const httpUrl = z
  .string()
  .url()
  .max(4000)
  .refine((value) => /^https?:\/\//i.test(value), "Media URL must be http(s)");

export default defineAction({
  description:
    "Update a project's title and/or attach media (mediaUrl plus file details). Attaching new media does not transcribe it; call transcribe-project next.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    title: z.string().trim().min(1).max(200).optional().describe("New title"),
    mediaUrl: httpUrl
      .optional()
      .describe("Durable http(s) URL of the uploaded video or audio"),
    mediaKind: z
      .enum(["video", "audio"])
      .optional()
      .describe('"video" or "audio"'),
    mediaMimeType: z.string().max(120).optional().describe("Media MIME type"),
    mediaFilename: z.string().max(300).optional().describe("Original filename"),
    mediaSize: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("File size in bytes"),
    transcriptStatus: z
      .enum(["none", "processing", "failed"])
      .optional()
      .describe(
        'Transcript status: "processing" while the editor transcribes, "failed" with transcriptError, or "none"',
      ),
    transcriptError: z
      .string()
      .max(500)
      .nullable()
      .optional()
      .describe("Error shown when transcriptStatus is failed; null clears it"),
    mediaProvider: z
      .string()
      .max(60)
      .optional()
      .describe("Storage provider id from the upload"),
    mediaUploadId: z
      .string()
      .max(500)
      .optional()
      .describe("Storage provider file id"),
    durationMs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Media duration in milliseconds"),
    mediaWidth: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Video width in pixels"),
    mediaHeight: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Video height in pixels"),
  }),
  run: async ({ id, ...patch }) => {
    const project = await editProject(id);
    const set: Partial<typeof schema.projects.$inferInsert> = {
      updatedAt: nowIso(),
    };
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) (set as Record<string, unknown>)[key] = value;
    }
    if (patch.mediaSize !== undefined) {
      set.mediaBytes = patch.mediaSize;
      set.mediaSize = Math.min(patch.mediaSize, 2_147_483_647);
    }
    if (Object.keys(set).length === 1)
      fail("Nothing to update.", { errorCode: "empty_patch" });
    const db = getDb();
    const [row] = await db
      .update(schema.projects)
      .set(set)
      .where(eq(schema.projects.id, id))
      .returning();
    const updated =
      patch.durationMs !== undefined
        ? await refreshDerived(row ?? project)
        : row;
    return toSummary(updated ?? project);
  },
});
