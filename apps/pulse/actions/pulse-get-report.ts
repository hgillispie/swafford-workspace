import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseReports } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";
import { parseJson } from "../server/lib/pulse-read.js";

export default defineAction({
  description:
    "Read one Pulse report, including the raw Brandbot payload and Drive PDF ids. Pass id.",
  schema: z.object({
    id: z.string().min(1).describe("Pulse report id."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }) => {
    const actor = await requireMember();
    const db = getDb();
    const row = (
      await db
        .select()
        .from(pulseReports)
        .where(and(eq(pulseReports.id, id), eq(pulseReports.orgId, actor.orgId)))
        .limit(1)
    )[0];
    if (!row) {
      fail("Report not found.", { statusCode: 404, errorCode: "not_found" });
    }
    return {
      id: row.id,
      reportDate: row.reportDate,
      source: row.source,
      idempotencyKey: row.idempotencyKey,
      schemaVersion: row.schemaVersion,
      headline: row.headline,
      mattBlurb: row.mattBlurb,
      hunterNotes: row.hunterNotes,
      methodology: row.methodology,
      pdfDriveFileId: row.pdfDriveFileId,
      pdfDriveUrl: row.pdfDriveUrl,
      xlsxDriveFileId: row.xlsxDriveFileId,
      payloadDynoUnlocked: row.payloadDynoUnlocked,
      effectiveDynoUnlocked: row.effectiveDynoUnlocked,
      dataGaps: parseJson(row.dataGapsJson, []),
      growthPrincipleTags: parseJson(row.growthTagsJson, []),
      payload: parseJson(row.payloadJson, null),
      summary: row.headline,
    };
  },
});