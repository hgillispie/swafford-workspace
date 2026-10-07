import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { intelligenceReport } from "../server/lib/live.js";

export default defineAction({
  description:
    "Build the niche pulse from seed trends, the trending feed, and up to four stale watchlist profiles. A missing public record is skipped and named in warning. Stores a packet only — no model call. Write the narrative with the strongest configured model via scout-save-report. Costs credits only for stale fetches.",
  schema: z.object({}),
  http: { method: "POST" },
  run: async () => {
    const actor = await requireMember();
    return intelligenceReport(actor);
  },
});
