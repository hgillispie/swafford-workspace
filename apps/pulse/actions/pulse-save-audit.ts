import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseAudits } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";

export default defineAction({
  description:
    "Save an agent narrative onto an existing account audit. The structured summary stays from stored pulse data.",
  schema: z.object({
    id: z.string().min(1),
    narrative: z.string().max(8000),
  }),
  http: { method: "POST" },
  run: async ({ id, narrative }) => {
    const actor = await requireMember();
    const db = getDb();
    const row = (
      await db
        .select({ id: pulseAudits.id })
        .from(pulseAudits)
        .where(and(eq(pulseAudits.id, id), eq(pulseAudits.orgId, actor.orgId)))
        .limit(1)
    )[0];
    if (!row) {
      fail("Audit was not found.", { statusCode: 404, errorCode: "not_found" });
    }
    await db
      .update(pulseAudits)
      .set({ narrative })
      .where(eq(pulseAudits.id, row.id));
    return {
      id: row.id,
      message: "Saved the audit note.",
      summary: "Audit narrative stored.",
    };
  },
});
