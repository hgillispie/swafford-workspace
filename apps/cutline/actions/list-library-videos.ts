import { defineAction } from "@agent-native/core/action";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { currentOrgId, requireUserEmail } from "../server/lib/projects.js";

export default defineAction({
  description:
    "List ready video files already stored in the shared dumps bucket for this organization.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    requireUserEmail();
    const orgId = currentOrgId();
    const rows = await getDb()
      .select()
      .from(schema.libraryFiles)
      .where(
        and(
          eq(schema.libraryFiles.orgId, orgId ?? ""),
          eq(schema.libraryFiles.status, "ready"),
        ),
      )
      .orderBy(desc(schema.libraryFiles.createdAt))
      .limit(100);
    return {
      videos: rows
        .filter((row) => (row.contentType ?? "").startsWith("video/"))
        .map((row) => ({
          id: row.id,
          filename: row.filename,
          sizeBytes: row.sizeBytes,
          contentType: row.contentType,
          createdAt: row.createdAt,
        })),
    };
  },
});
