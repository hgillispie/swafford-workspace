import { defineAction } from "@agent-native/core/action";
import { and, eq } from "@agent-native/core/db/schema";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseKeywords } from "../server/db/schema.js";
import { readDynoUnlocked, requireMember } from "../server/lib/pulse-access.js";

export default defineAction({
  description:
    "Save an expanded or manual keyword. While dyno is locked, the row stays dyno-safe.",
  schema: z.object({
    term: z.string().trim().min(1).max(120),
    related: z.array(z.string().max(120)).max(12).optional(),
    intent: z
      .enum([
        "informational",
        "how_to",
        "local_shop",
        "product",
        "entertainment",
        "mixed",
      ])
      .default("mixed"),
    searchVsTrend: z.enum(["search", "trend", "hybrid"]).default("search"),
    pillar: z.string().max(40).default("other"),
    geo: z.enum(["upstate_sc", "wnc", "east_tn", "national"]).nullable().optional(),
    dynoSafe: z.boolean().default(true),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireMember();
    const unlocked = await readDynoUnlocked(actor.orgId);
    const db = getDb();
    const existing = (
      await db
        .select({ id: pulseKeywords.id })
        .from(pulseKeywords)
        .where(
          and(
            eq(pulseKeywords.orgId, actor.orgId),
            eq(pulseKeywords.term, input.term),
            eq(pulseKeywords.seedLibrary, false),
          ),
        )
        .limit(1)
    )[0];
    const values = {
      term: input.term,
      intent: input.intent,
      searchVsTrend: input.searchVsTrend,
      dynoSafe: unlocked ? input.dynoSafe : true,
      pillar: input.pillar,
      geo: input.geo ?? null,
      volumeProxy: "unknown",
      competitionProxy: null,
      evergreen: true,
      seedLibrary: false,
      relatedJson: JSON.stringify(input.related ?? []),
      examplesJson: "[]",
      reportId: null,
      ownerEmail: actor.email,
      orgId: actor.orgId,
      visibility: "org" as const,
    };
    const id = existing?.id ?? randomUUID();
    if (existing) {
      await db.update(pulseKeywords).set(values).where(eq(pulseKeywords.id, id));
    } else {
      await db.insert(pulseKeywords).values({ id, ...values });
    }
    return {
      id,
      term: input.term,
      dynoSafe: values.dynoSafe,
      message: `Saved keyword “${input.term}”.`,
      summary: "Keyword is on the finder list.",
    };
  },
});
