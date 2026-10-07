import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { discoverTrends } from "../server/lib/live.js";

export default defineAction({
  description:
    "Discover TikTok trends from two seed keywords plus the trending feed. Classifies mega trends versus 24–72h flashes over a 7–14 day window. Costs up to three credits when caches are cold.",
  schema: z.object({}),
  http: { method: "POST" },
  run: async () => {
    const actor = await requireMember();
    return discoverTrends(actor);
  },
});
