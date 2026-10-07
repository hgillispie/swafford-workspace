import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseReports } from "../server/db/schema.js";
import { isOrgAdmin, requireMember } from "../server/lib/pulse-access.js";

export default defineAction({
  description:
    "Latest Brandbot reports stored for this organization, and whether the caller may paste a report by hand. Does not return credentials.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const db = getDb();
    const reports = await db
      .select({
        id: pulseReports.id,
        reportDate: pulseReports.reportDate,
        source: pulseReports.source,
        headline: pulseReports.headline,
        createdAt: pulseReports.createdAt,
      })
      .from(pulseReports)
      .where(eq(pulseReports.orgId, actor.orgId))
      .orderBy(desc(pulseReports.reportDate), desc(pulseReports.createdAt))
      .limit(12);
    return {
      canPaste: isOrgAdmin(actor.role),
      reports,
      summary:
        reports.length > 0
          ? "Brandbot sent these reports. Open This week for the latest shoot cards."
          : "No reports yet. Brandbot sends them on its own.",
    };
  },
});
