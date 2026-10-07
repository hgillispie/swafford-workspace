import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseExports, pulseRecreateCards } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";
import { toCard, toPasteCard } from "../server/lib/pulse-read.js";
import { buildPastePack } from "../shared/pulse-guardrails.js";

export default defineAction({
  description:
    "Build a paste pack for a shoot card and log the export. Copy happens in the browser; this action records it.",
  schema: z.object({
    id: z.string().min(1),
    format: z.enum(["caption", "capcut", "descript", "markdown"]),
  }),
  http: { method: "POST" },
  run: async ({ id, format }) => {
    const actor = await requireMember();
    const db = getDb();
    const row = (
      await db
        .select()
        .from(pulseRecreateCards)
        .where(
          and(
            eq(pulseRecreateCards.id, id),
            eq(pulseRecreateCards.orgId, actor.orgId),
          ),
        )
        .limit(1)
    )[0];
    if (!row) {
      fail("Shoot card was not found.", { statusCode: 404, errorCode: "not_found" });
    }
    const pack = buildPastePack(toPasteCard(toCard(row)));
    await db.insert(pulseExports).values({
      id: randomUUID(),
      cardId: row.id,
      format,
      ownerEmail: actor.email,
      orgId: actor.orgId,
      visibility: "org",
    });
    return {
      id: row.id,
      format,
      text: pack[format],
      message: `Paste pack ready: ${format}.`,
      summary: "Original Swafford shoot brief. Paste into Descript or CapCut.",
    };
  },
});
