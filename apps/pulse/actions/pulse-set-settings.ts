import { defineAction } from "@agent-native/core/action";
import { eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseSettings } from "../server/db/schema.js";
import { requireAdmin } from "../server/lib/pulse-access.js";

export default defineAction({
  description:
    "Hunter admin toggle for dyno hero claims. This flag wins over Brandbot brand.dynoUnlocked.",
  schema: z.object({
    dynoUnlocked: z.boolean(),
  }),
  http: { method: "POST" },
  run: async ({ dynoUnlocked }) => {
    const actor = await requireAdmin();
    const db = getDb();
    const existing = (
      await db
        .select({ id: pulseSettings.id })
        .from(pulseSettings)
        .where(eq(pulseSettings.id, actor.orgId))
        .limit(1)
    )[0];
    const values = {
      dynoUnlocked,
      updatedAt: new Date().toISOString(),
      ownerEmail: actor.email,
      orgId: actor.orgId,
      visibility: "org" as const,
    };
    if (existing) {
      await db
        .update(pulseSettings)
        .set(values)
        .where(eq(pulseSettings.id, actor.orgId));
    } else {
      await db.insert(pulseSettings).values({ id: actor.orgId, ...values });
    }
    return {
      dynoUnlocked,
      message: dynoUnlocked
        ? "Dyno claims unlocked for this workspace."
        : "Dyno claims locked. Cards stay dyno-safe.",
      summary: dynoUnlocked ? "Dyno unlocked." : "Dyno locked.",
    };
  },
});
