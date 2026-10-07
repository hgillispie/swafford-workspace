import { defineAction } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseRecreateCards } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";
import { latestReport, toCard, toPasteCard } from "../server/lib/pulse-read.js";
import { buildPastePack } from "../shared/pulse-guardrails.js";

export default defineAction({
  description:
    "List recreate cards for the latest pulse, or one report. Includes paste packs for CapCut, Descript, and captions.",
  schema: z.object({
    reportId: z.string().optional(),
    priority: z.enum(["this_week", "next_window", "backlog"]).optional(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ reportId, priority }) => {
    const actor = await requireMember();
    const report = reportId
      ? { id: reportId }
      : await latestReport(actor.orgId);
    if (!report) {
      return { cards: [], summary: "No pulse stored yet." };
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(pulseRecreateCards)
      .where(
        and(
          eq(pulseRecreateCards.orgId, actor.orgId),
          eq(pulseRecreateCards.reportId, report.id),
          ...(priority ? [eq(pulseRecreateCards.priority, priority)] : []),
        ),
      );
    const cards = rows.map((row) => {
      const card = toCard(row);
      return { ...card, paste: buildPastePack(toPasteCard(card)) };
    });
    return {
      reportId: report.id,
      cards,
      summary: `${cards.length} shoot card${cards.length === 1 ? "" : "s"}.`,
    };
  },
});
