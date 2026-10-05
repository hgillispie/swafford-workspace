import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { createUpload, objectKey, planParts } from "../server/lib/b2.js";
import {
  assertFolderInOrg,
  dumpFiles,
  failB2,
  getDb,
  newId,
  requireActor,
  toFile,
} from "../server/lib/dumps.js";

const MAX_BYTES = 5 * 1024 * 1024 * 1024 * 1024;

export default defineAction({
  description:
    "Begin a private multipart upload. Returns the part size and upload id. The browser uploads bytes directly to Backblaze with sign-dump-parts, then calls complete-dump-upload. Do not send file bytes to this action. Bucket CORS is already configured; use configure-dump-cors only when an origin is missing.",
  schema: z.object({
    filename: z.string().trim().min(1).max(240).describe("Original filename."),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_BYTES)
      .describe("File size in bytes."),
    contentType: z
      .string()
      .max(200)
      .optional()
      .describe("MIME type. Defaults to application/octet-stream."),
    folderId: z
      .string()
      .nullable()
      .optional()
      .describe("Destination folder id. Omit or null for the library root."),
    notes: z.string().max(4000).optional().describe("Optional note."),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .max(20)
      .optional()
      .describe("Optional tags."),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "dumps",
      view: "library",
      params: { id: result.id },
    }),
    label: "Open dump",
  }),
  run: async ({ filename, sizeBytes, contentType, folderId, notes, tags }) => {
    const { email, orgId } = requireActor();
    const parent = folderId ?? null;
    await assertFolderInOrg(parent, orgId);
    const id = newId();
    const key = objectKey(orgId, id, filename);
    const { partSize, partCount } = planParts(sizeBytes);
    let uploadId: string;
    try {
      uploadId = await createUpload({
        key,
        contentType: contentType?.trim() || "application/octet-stream",
      });
    } catch (err) {
      failB2(err);
    }
    const [row] = await getDb()
      .insert(dumpFiles)
      .values({
        id,
        folderId: parent,
        filename,
        sizeBytes,
        contentType: contentType?.trim() || "application/octet-stream",
        uploaderEmail: email,
        notes: notes?.trim() || null,
        tags: tags?.length ? JSON.stringify(tags) : null,
        b2Key: key,
        uploadId,
        partSizeBytes: partSize,
        status: "uploading",
        ownerEmail: email,
        orgId,
        visibility: "org",
      })
      .returning();
    if (!row) fail("Upload was not recorded.", { statusCode: 500 });
    return {
      id: row.id,
      uploadId,
      partSize,
      partCount,
      file: toFile(row),
      message: `Started upload for ${filename}.`,
      nextRequiredAction: "sign-dump-parts",
    };
  },
});
