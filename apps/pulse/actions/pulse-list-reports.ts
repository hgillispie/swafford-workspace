import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseReports } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";

export default defineAction({
  description: "List stored Pulse reports for this organization, newest first.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const db = getDb();
    const rows = await db
      .select({
        id: pulseReports.id,
        reportDate: pulseReports.reportDate,
        source: pulseReports.source,
        idempotencyKey: pulseReports.idempotencyKey,
        schemaVersion: pulseReports.schemaVersion,
        headline: pulseReports.headline,
        pdfDriveFileId: pulseReports.pdfDriveFileId,
        pdfDriveUrl: pulseReports.pdfDriveUrl,
        payloadDynoUnlocked: pulseReports.payloadDynoUnlocked,
        effectiveDynoUnlocked: pulseReports.effectiveDynoUnlocked,
        methodology: pulseReports.methodology,
      })
      .from(pulseReports)
      .where(eq(pulseReports.orgId, actor.orgId))
      .orderBy(desc(pulseReports.reportDate))
      .limit(40);
    return { reports: rows, summary: `${rows.length} pulse reports.` };
  },
});
