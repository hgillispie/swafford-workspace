import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { readBrand, requireAdmin, saveBrand } from "../server/lib/access.js";
import { mergeBrand } from "../shared/brand.js";

export default defineAction({
  description:
    "Update Scout brand defaults. Admin only. Dyno stays locked unless dynoUnlocked is true. Swafford values are only the seed, not a permanent hardwire.",
  schema: z.object({
    displayName: z.string().trim().min(1).max(80).optional(),
    handle: z.string().trim().min(1).max(40).optional(),
    site: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(40).optional(),
    softCta: z.string().trim().min(1).max(200).optional(),
    niche: z.string().trim().min(1).max(200).optional(),
    voiceNotes: z.string().max(500).optional(),
    dynoUnlocked: z
      .boolean()
      .optional()
      .describe("Set true only when dyno claims are allowed"),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireAdmin();
    const current = await readBrand(actor.orgId);
    const next = mergeBrand({
      ...current,
      ...input,
      dynoUnlocked: input.dynoUnlocked ?? current.dynoUnlocked,
    });
    await saveBrand(actor, next);
    return {
      dynoUnlocked: next.dynoUnlocked,
      displayName: next.displayName,
      summary: `Brand saved for ${next.displayName}.`,
    };
  },
});
