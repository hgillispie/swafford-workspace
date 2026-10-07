import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseIdeas } from "../server/db/schema.js";
import { readDynoUnlocked, requireMember } from "../server/lib/pulse-access.js";
import { SOFT_CTA, isDynoHeroClaim } from "../shared/pulse-guardrails.js";

export default defineAction({
  description:
    "Create or update a backlog idea. Dyno stays locked unless Hunter has unlocked it.",
  schema: z.object({
    id: z.string().optional(),
    title: z.string().trim().min(1).max(120),
    notes: z.string().max(2000).optional(),
    status: z.enum(["idea", "filmed", "edited", "posted"]).default("idea"),
    assignee: z.enum(["matt", "hunter"]).default("matt"),
    pillar: z.string().max(40).default("other"),
    searchVsTrend: z.enum(["search", "trend", "hybrid"]).default("hybrid"),
    dynoSafe: z.boolean().default(true),
    geo: z.enum(["upstate_sc", "wnc", "east_tn", "national"]).nullable().optional(),
    softCta: z.string().max(200).optional(),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireMember();
    const unlocked = await readDynoUnlocked(actor.orgId);
    const dynoSafe = unlocked ? input.dynoSafe : true;
    if (!unlocked && (isDynoHeroClaim(input.title) || isDynoHeroClaim(input.notes ?? ""))) {
      fail("Dyno hero claims stay off until an admin unlocks dyno.", {
        statusCode: 409,
        errorCode: "dyno_locked",
      });
    }
    const db = getDb();
    const values = {
      title: input.title,
      notes: input.notes ?? null,
      status: input.status,
      assignee: input.assignee,
      pillar: input.pillar,
      searchVsTrend: input.searchVsTrend,
      dynoSafe,
      geo: input.geo ?? null,
      softCta: input.softCta?.trim() || SOFT_CTA,
      ownerEmail: actor.email,
      orgId: actor.orgId,
      visibility: "org" as const,
    };
    if (input.id) {
      const existing = (
        await db
          .select({ id: pulseIdeas.id })
          .from(pulseIdeas)
          .where(
            and(eq(pulseIdeas.id, input.id), eq(pulseIdeas.orgId, actor.orgId)),
          )
          .limit(1)
      )[0];
      if (!existing) {
        fail("Idea was not found.", { statusCode: 404, errorCode: "not_found" });
      }
      await db.update(pulseIdeas).set(values).where(eq(pulseIdeas.id, existing.id));
      return {
        id: existing.id,
        status: input.status,
        message: `Updated “${input.title}”.`,
        summary: `Backlog item is ${input.status}.`,
      };
    }
    const id = randomUUID();
    await db.insert(pulseIdeas).values({
      id,
      reportId: null,
      sourceCardId: null,
      ...values,
    });
    return {
      id,
      status: input.status,
      message: `Added “${input.title}”.`,
      summary: "Idea is on the backlog.",
    };
  },
});
