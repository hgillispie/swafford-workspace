import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { watchAllSeeds } from "../server/lib/live.js";

export default defineAction({
  description:
    "Fetch unfetched brand watchlist seeds (up to eight). Skips profiles already saved. Stops on a missing key, rate limit, or empty credits. Costs about two credits per cold profile.",
  schema: z.object({}),
  http: { method: "POST" },
  run: async () => {
    const actor = await requireMember();
    return watchAllSeeds(actor);
  },
});
