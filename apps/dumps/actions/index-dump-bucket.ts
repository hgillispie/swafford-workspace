import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray, isNull } from "@agent-native/core/db/schema";
import { z } from "zod";

import { contentTypeForName, listBucketPage, safeBasename } from "../server/lib/b2.js";
import {
  dumpFiles,
  dumpFolders,
  failB2,
  getDb,
  newId,
  requireActor,
} from "../server/lib/dumps.js";

function folderName(value: string): string {
  const cleaned = value.replace(/[^\w.\- ()[\]]+/g, " ").trim().slice(0, 120);
  return cleaned || "folder";
}

export default defineAction({
  description:
    "Sync and index objects already in the Backblaze bucket, including shop copies made with rclone under org/{orgId}/inbox/. Inserts ledger rows for keys this organization does not have yet. Call again with cursor when nextToken is set.",
  schema: z.object({
    prefix: z
      .string()
      .max(500)
      .optional()
      .describe(
        "Key prefix inside this organization. Defaults to org/{orgId}/.",
      ),
    cursor: z
      .string()
      .max(2000)
      .optional()
      .describe("Continuation token from the previous index call."),
  }),
  run: async ({ prefix, cursor }) => {
    const { email, orgId } = requireActor();
    const root = `org/${orgId}/`;
    const scoped = (prefix?.trim() || root).replace(/^\/+/, "");
    if (!scoped.startsWith(root)) {
      fail("Prefix must stay inside this organization.", {
        statusCode: 400,
        errorCode: "prefix_out_of_scope",
      });
    }
    let page: Awaited<ReturnType<typeof listBucketPage>>;
    try {
      page = await listBucketPage({ prefix: scoped, cursor });
    } catch (err) {
      failB2(err);
    }
    const db = getDb();
    const keys = page.objects.map((object) => object.key);
    const existing = new Set<string>();
    if (keys.length > 0) {
      const rows = await db
        .select({ b2Key: dumpFiles.b2Key })
        .from(dumpFiles)
        .where(
          and(eq(dumpFiles.orgId, orgId), inArray(dumpFiles.b2Key, keys)),
        );
      for (const row of rows) existing.add(row.b2Key);
    }
    const folderCache = new Map<string, string | null>();
    async function folderFor(segments: string[]): Promise<string | null> {
      let parent: string | null = null;
      let built = "";
      for (const segment of segments.slice(0, 12)) {
        const name = folderName(segment);
        built = built ? `${built}/${name}` : name;
        const cached = folderCache.get(built);
        if (cached !== undefined) {
          parent = cached;
          continue;
        }
        const [found] = await db
          .select()
          .from(dumpFolders)
          .where(
            and(
              eq(dumpFolders.orgId, orgId),
              eq(dumpFolders.name, name),
              parent
                ? eq(dumpFolders.parentId, parent)
                : isNull(dumpFolders.parentId),
            ),
          )
          .limit(1);
        if (found) {
          parent = found.id;
          folderCache.set(built, parent);
          continue;
        }
        const id = newId();
        await db.insert(dumpFolders).values({
          id,
          name,
          parentId: parent,
          ownerEmail: email,
          orgId,
          visibility: "org",
        });
        parent = id;
        folderCache.set(built, parent);
      }
      return parent;
    }
    let indexed = 0;
    let skipped = existing.size;
    for (const object of page.objects) {
      if (existing.has(object.key)) continue;
      const relative = object.key.slice(root.length);
      const segments = relative.split("/").filter(Boolean);
      const filename = safeBasename(segments.pop() ?? "file");
      const appUpload = segments[0] === "files" && segments.length >= 1;
      const folderId = appUpload ? null : await folderFor(segments);
      await db.insert(dumpFiles).values({
        id: newId(),
        folderId,
        filename,
        sizeBytes: object.sizeBytes,
        contentType: contentTypeForName(filename),
        uploaderEmail: email,
        notes: "Indexed from the bucket.",
        tags: null,
        b2Key: object.key,
        uploadId: null,
        partSizeBytes: null,
        status: "ready",
        ownerEmail: email,
        orgId,
        visibility: "org",
      });
      indexed += 1;
    }
    return {
      prefix: scoped,
      indexed,
      skipped,
      nextToken: page.nextToken,
      message: page.nextToken
        ? `Indexed ${indexed} objects. Call index-dump-bucket again with the cursor to continue.`
        : `Indexed ${indexed} objects. The bucket prefix is in sync.`,
    };
  },
});
