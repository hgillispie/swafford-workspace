import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { searchHashtags } from "../server/lib/live.js";

export default defineAction({
  description:
    "Search TikTok by hashtag through ScrapeCreators, without the #. Costs one credit on a cache miss. Returns normalized videos and a volume proxy.",
  schema: z.object({
    hashtag: z.string().trim().min(1).max(80).describe("Hashtag text, with or without #"),
  }),
  http: { method: "POST" },
  run: async ({ hashtag }) => {
    const actor = await requireMember();
    return searchHashtags(actor, hashtag);
  },
});
