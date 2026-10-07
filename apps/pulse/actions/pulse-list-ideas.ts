import { defineAction } from "@agent-native/core/action";
import { and, desc, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseIdeas } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";

export default defineAction({
  description:
    "Idea backlog: idea, filmed, edited, posted. Filter by status, assignee, or search vs trend.",
  schema: z.object({
    status: z.enum(["idea", "filmed", "edited", "posted"]).optional(),
    assignee: z.enum(["matt", "hunter"]).optional(),
    q: z.string().max(80).optional(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ status, assignee, q }) => {
    const actor = await requireMember();
    const db = getDb();
    const rows = await db
      .select()
      .from(pulseIdeas)
      .where(
        and(
          eq(pulseIdeas.orgId, actor.orgId),
          ...(status ? [eq(pulseIdeas.status, status)] : []),
          ...(assignee ? [eq(pulseIdeas.assignee, assignee)] : []),
        ),
      )
      .orderBy(desc(pulseIdeas.createdAt));
    const needle = q?.trim().toLowerCase() ?? "";
    const ideas = rows
      .filter((row) => {
        if (!needle) return true;
        return (
          row.title.toLowerCase().includes(needle) ||
          (row.notes ?? "").toLowerCase().includes(needle)
        );
      })
      .map((row) => ({
        id: row.id,
        title: row.title,
        notes: row.notes,
        status: row.status,
        assignee: row.assignee,
        pillar: row.pillar,
        searchVsTrend: row.searchVsTrend,
        dynoSafe: row.dynoSafe,
        geo: row.geo,
        softCta: row.softCta,
        sourceCardId: row.sourceCardId,
        reportId: row.reportId,
      }));
    return { ideas, summary: `${ideas.length} backlog items.` };
  },
});
