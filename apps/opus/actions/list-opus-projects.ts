import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { currentOrgId, requireUserEmail } from "../server/lib/access.js";

export default defineAction({
  description: "List Opus projects in the current organization.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    requireUserEmail();
    const orgId = currentOrgId();
    const rows = await getDb()
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.orgId, orgId ?? ""))
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
