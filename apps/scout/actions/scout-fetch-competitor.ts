import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { fetchCompetitor } from "../server/lib/live.js";

export default defineAction({
  description:
    "Fetch a public TikTok profile and recent videos, save the watchlist row, and return hook, CTA, and observed sound names. Costs about two credits on a cache miss. Sounds are observed names, not a music chart.",
  schema: z.object({
    handle: z.string().trim().min(1).max(40).describe("TikTok handle, with or without @"),
    role: z
      .enum(["north_star", "local", "watch"])
      .optional()
      .describe('Watchlist role: "north_star", "local", or "watch"'),
    displayName: z.string().max(80).optional().describe("Optional display name"),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireMember();
    return fetchCompetitor(actor, input);
  },
});
