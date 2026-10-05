import { defineAction } from "@agent-native/core/action";
import { accessFilter } from "@agent-native/core/sharing";
import { and, desc, ilike } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { requireUserEmail, toSummary } from "../server/lib/projects.js";

export default defineAction({
  description:
    "List the user's Cutline projects (owned or shared), most recently edited first. Returns id, title, media kind, source and edited duration (ms), and transcript status for each.",
  schema: z.object({
    query: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Optional case-insensitive filter on project title"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ query }) => {
    requireUserEmail();
    const db = getDb();
    const access = accessFilter(schema.projects, schema.projectShares);
    const where = query
      ? and(
          access,
          ilike(schema.projects.title, `%${query.replace(/[%_\\]/g, "\\$&")}%`),
        )
      : access;
    const rows = await db
      .select()
      .from(schema.projects)
      .where(where)
      .orderBy(desc(schema.projects.updatedAt))
      .limit(200);
    return rows.map(toSummary);
  },
});
