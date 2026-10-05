import { defineAction, fail } from "@agent-native/core/action";
import { and, desc, eq, isNull, sql } from "@agent-native/core/db/schema";
import { z } from "zod";

import { missingB2Env } from "../server/lib/b2.js";
import {
  breadcrumbs,
  dumpFiles,
  dumpFolders,
  getDb,
  requireActor,
  toFile,
  toFolder,
} from "../server/lib/dumps.js";

function likePattern(query: string): string {
  return `%${query.replace(/[%_\\]/g, "\\$&")}%`;
}

export default defineAction({
  description:
    "List dump folders and files in the current organization. Omit folderId for the library root. Pass q to search filenames, notes, and tags across the library.",
  schema: z.object({
    q: z
      .string()
      .max(200)
      .optional()
      .describe("Search filenames, notes, and tags. Omit to list one folder."),
    folderId: z
      .string()
      .optional()
      .describe("Folder to list. Omit for the library root."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ q, folderId }) => {
    const { orgId } = requireActor();
    const query = q?.trim() ?? "";
    const db = getDb();
    const folder = folderId
      ? ((
          await db
            .select()
            .from(dumpFolders)
            .where(
              and(eq(dumpFolders.id, folderId), eq(dumpFolders.orgId, orgId)),
            )
            .limit(1)
        )[0] ?? null)
      : null;
    if (folderId && !folder) {
      fail("Folder not found.", { statusCode: 404, errorCode: "not_found" });
    }

    const pattern = query ? likePattern(query) : null;
    const folders = pattern
      ? await db
          .select()
          .from(dumpFolders)
          .where(
            and(
              eq(dumpFolders.orgId, orgId),
              sql`${dumpFolders.name} ILIKE ${pattern} ESCAPE '\\'`,
            ),
          )
          .orderBy(dumpFolders.name)
          .limit(200)
      : await db
          .select()
          .from(dumpFolders)
          .where(
            and(
              eq(dumpFolders.orgId, orgId),
              folderId
                ? eq(dumpFolders.parentId, folderId)
                : isNull(dumpFolders.parentId),
            ),
          )
          .orderBy(dumpFolders.name)
          .limit(200);

    const files = pattern
      ? await db
          .select()
          .from(dumpFiles)
          .where(
            and(
              eq(dumpFiles.orgId, orgId),
              sql`(${dumpFiles.filename} ILIKE ${pattern} ESCAPE '\\' OR COALESCE(${dumpFiles.notes}, '') ILIKE ${pattern} ESCAPE '\\' OR COALESCE(${dumpFiles.tags}, '') ILIKE ${pattern} ESCAPE '\\')`,
            ),
          )
          .orderBy(desc(dumpFiles.createdAt))
          .limit(200)
      : await db
          .select()
          .from(dumpFiles)
          .where(
            and(
              eq(dumpFiles.orgId, orgId),
              folderId
                ? eq(dumpFiles.folderId, folderId)
                : isNull(dumpFiles.folderId),
            ),
          )
          .orderBy(desc(dumpFiles.createdAt))
          .limit(200);

    const allFolders = await db
      .select({
        id: dumpFolders.id,
        name: dumpFolders.name,
        parentId: dumpFolders.parentId,
      })
      .from(dumpFolders)
      .where(eq(dumpFolders.orgId, orgId))
      .orderBy(dumpFolders.name)
      .limit(500);

    return {
      missingEnv: missingB2Env(),
      folder: folder ? toFolder(folder) : null,
      breadcrumbs: await breadcrumbs(folder?.id ?? null, orgId),
      folders: folders.map(toFolder),
      files: files.map(toFile),
      allFolders,
    };
  },
});
