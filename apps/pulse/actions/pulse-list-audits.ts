import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseAudits } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";
import { parseJson } from "../server/lib/pulse-read.js";

export default defineAction({
  description: "Recent account audits for this workspace.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const db = getDb();
    const rows = await db
      .select()
      .from(pulseAudits)
      .where(eq(pulseAudits.orgId, actor.orgId))
      .orderBy(desc(pulseAudits.createdAt))
      .limit(12);
    return {
      audits: rows.map((row) => ({
        id: row.id,
        handle: row.handle,
        url: row.url,
        narrative: row.narrative,
        createdAt: row.createdAt,
        summary: parseJson<Record<string, unknown>>(row.summaryJson, {}),
      })),
      summary: `${rows.length} saved audits.`,
    };
  },
});
