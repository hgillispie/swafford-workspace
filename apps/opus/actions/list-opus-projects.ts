import { defineAction } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireUserEmail } from "../server/lib/access.js";

export default defineAction({
  description: "List Opus projects the user owns or that were shared with them.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    requireUserEmail();
    const rows = await getDb()
      .select()
      .from(schema.projects)
      .where(accessFilter(schema.projects, schema.projectShares))
      .orderBy(desc(schema.projects.updatedAt))
      .limit(50);
    return {
      projects: rows.map((row) => ({
        id: row.id,
        title: row.title,
        transcriptStatus: row.transcriptStatus,
        durationMs: row.durationMs,
        updatedAt: row.updatedAt,
      })),
    };
  },
});
