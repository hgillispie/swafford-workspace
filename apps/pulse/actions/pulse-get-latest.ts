import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/pulse-access.js";
import {
  cardsForReport,
  latestReport,
  parseJson,
  toPasteCard,
  windowsForReport,
} from "../server/lib/pulse-read.js";
import { buildPastePack } from "../shared/pulse-guardrails.js";

export default defineAction({
  description:
    "Latest Swafford Pulse for Matt: blurb, this-week shoot cards, posting windows, and high-severity data gaps.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const report = await latestReport(actor.orgId);
    if (!report) {
      return {
        report: null,
        cards: [],
        postingWindows: null,
        dataGaps: [],
        mix: { search: 0, trend: 0, hybrid: 0 },
        summary: "No pulse stored yet.",
      };
    }
    const cards = (await cardsForReport(report.id)).filter(
      (card) => card.priority === "this_week",
    );
    const shown = cards.slice(0, 4);
    const mix = { search: 0, trend: 0, hybrid: 0 };
    for (const card of shown) {
      if (card.searchVsTrend === "search") mix.search += 1;
      else if (card.searchVsTrend === "trend") mix.trend += 1;
      else mix.hybrid += 1;
    }
    const gaps = parseJson<
      Array<{ code: string; message: string; severity: string }>
    >(report.dataGapsJson, []).filter((gap) => gap.severity === "high");
    return {
      report: {
        id: report.id,
        reportDate: report.reportDate,
        source: report.source,
        headline: report.headline,
        mattBlurb: report.mattBlurb,
        methodology: report.methodology,
        pdfDriveFileId: report.pdfDriveFileId,
        pdfDriveUrl: report.pdfDriveUrl,
        effectiveDynoUnlocked: report.effectiveDynoUnlocked,
        payloadDynoUnlocked: report.payloadDynoUnlocked,
      },
      cards: shown.map((card) => ({
        ...card,
        paste: buildPastePack(toPasteCard(card)),
      })),
      postingWindows: await windowsForReport(report.id, actor.orgId),
      dataGaps: gaps,
      mix,
      summary: report.headline,
    };
  },
});
