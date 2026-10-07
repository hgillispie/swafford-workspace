import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/pulse-access.js";
import { latestReport, listCompetitors } from "../server/lib/pulse-read.js";

export default defineAction({
  description:
    "North-star, performer, local, and competitor watchlist from the latest pulse.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const report = await latestReport(actor.orgId);
    const accounts = report
      ? await listCompetitors(actor.orgId, report.id)
      : [];
    return {
      reportId: report?.id ?? null,
      reportDate: report?.reportDate ?? null,
      localNotes: report?.localNotes ?? null,
      accounts,
      summary: report
        ? `${accounts.length} accounts on the ${report.reportDate} watchlist.`
        : "No pulse stored yet.",
    };
  },
});
