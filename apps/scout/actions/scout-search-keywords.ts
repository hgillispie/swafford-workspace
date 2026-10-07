import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { searchKeywords } from "../server/lib/live.js";

export default defineAction({
  description:
    "Search TikTok by keyword through ScrapeCreators and cache the normalized videos, volume proxy, and related tags. Costs one credit on a cache miss. Volume is a proxy, not Google Ads.",
  schema: z.object({
    query: z.string().trim().min(1).max(120).describe("Keyword or phrase to search"),
    datePosted: z
      .string()
      .max(40)
      .optional()
      .describe("Optional ScrapeCreators date_posted filter"),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireMember();
    return searchKeywords(actor, input.query, input.datePosted);
  },
});
