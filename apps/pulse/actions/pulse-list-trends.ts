import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/pulse-access.js";
import { latestReport, listTrends } from "../server/lib/pulse-read.js";

export default defineAction({
  description:
    "Discover trends and trending terms from the latest Brandbot pulse.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const report = await latestReport(actor.orgId);
    const trends = report ? await listTrends(actor.orgId, report.id) : [];
    return {
      reportId: report?.id ?? null,
      trends,
      summary: report
        ? `${trends.length} trends on ${report.reportDate}.`
        : "No pulse stored yet.",
    };
  },
});
