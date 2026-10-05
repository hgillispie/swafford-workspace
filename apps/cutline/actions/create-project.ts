import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import {
  currentOrgId,
  nowIso,
  requireUserEmail,
  toSummary,
} from "../server/lib/projects.js";

export default defineAction({
  description:
    "Create a new, empty Cutline project. Media is attached afterwards with update-project (mediaUrl) and transcribed with transcribe-project.",
  schema: z.object({
    title: z.string().trim().min(1).max(200).describe("Project title"),
    mediaKind: z
      .enum(["video", "audio"])
      .optional()
      .describe('Kind of media that will be attached: "video" or "audio"'),
    mediaMimeType: z
      .string()
      .max(120)
      .optional()
      .describe("MIME type of the media file"),
    mediaFilename: z
      .string()
      .max(300)
      .optional()
      .describe("Original media filename"),
    mediaSize: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Media file size in bytes"),
    durationMs: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Media duration in milliseconds, if known"),
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
  run: async (args) => {
    const ownerEmail = requireUserEmail();
    const db = getDb();
    const now = nowIso();
    const durationMs = args.durationMs ?? 0;
    const [row] = await db
      .insert(schema.projects)
      .values({
        id: crypto.randomUUID(),
        title: args.title,
        mediaKind: args.mediaKind ?? null,
        mediaMimeType: args.mediaMimeType ?? null,
        mediaFilename: args.mediaFilename ?? null,
        mediaSize:
          args.mediaSize === undefined
            ? null
            : Math.min(args.mediaSize, 2_147_483_647),
        mediaBytes: args.mediaSize ?? null,
        mediaWidth: args.mediaWidth ?? null,
        mediaHeight: args.mediaHeight ?? null,
        durationMs,
        editedDurationMs: durationMs,
        ownerEmail,
        orgId: currentOrgId(),
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toSummary(row);
  },
});
