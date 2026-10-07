import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseIdeas, pulseRecreateCards } from "../server/db/schema.js";
import { requireMember } from "../server/lib/pulse-access.js";

export default defineAction({
  description:
    "Mark a shoot card open, filmed, or skipped. Filmed also advances a still-idea backlog row.",
  schema: z.object({
    id: z.string().min(1),
    status: z.enum(["open", "filmed", "skipped"]),
  }),
  http: { method: "POST" },
  run: async ({ id, status }) => {
    const actor = await requireMember();
    const db = getDb();
    const card = (
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
    if (!card) {
      fail("Shoot card was not found.", { statusCode: 404, errorCode: "not_found" });
    }
    await db
      .update(pulseRecreateCards)
      .set({ status })
      .where(eq(pulseRecreateCards.id, card.id));
    if (status === "filmed") {
      await db
        .update(pulseIdeas)
        .set({ status: "filmed" })
        .where(
          and(
            eq(pulseIdeas.orgId, actor.orgId),
            eq(pulseIdeas.reportId, card.reportId),
            eq(pulseIdeas.sourceCardId, card.cardKey),
            eq(pulseIdeas.status, "idea"),
          ),
        );
    }
    return {
      id: card.id,
      status,
      message: `${card.title} is ${status}.`,
      summary: `Shoot card status is ${status}.`,
    };
  },
});
