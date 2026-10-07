import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { listDashboard } from "../server/lib/live.js";

export default defineAction({
  description:
    "Niche pulse already stored in Scout: breakouts, trend terms, watchlist, recreates, and drafts. Does not call ScrapeCreators. Filters are search vs trend, geo, and dyno-safe.",
  schema: z.object({
    searchVsTrend: z
      .enum(["all", "search", "trend", "hybrid"])
      .default("all")
      .describe('Filter: "all", "search", "trend", or "hybrid"'),
    geo: z
      .enum(["all", "upstate_sc", "wnc", "east_tn", "national"])
      .default("all")
      .describe('Geo filter: "all", "upstate_sc", "wnc", "east_tn", or "national"'),
    dyno: z
      .enum(["all", "safe"])
      .default("all")
      .describe('Dyno filter: "all" or "safe"'),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (filters) => {
    const actor = await requireMember();
    return listDashboard(actor, filters);
  },
});
