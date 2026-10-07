import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { recreateFromHit } from "../server/lib/live.js";

export default defineAction({
  description:
    "Turn a public hit into an original-shoot CapCut and Descript paste pack with growth principles. Saves a structural draft. Rewrite lines in shop voice with the strongest configured model, then call scout-save-recreate. Does not copy footage.",
  schema: z.object({
    caption: z.string().trim().min(1).max(500).describe("Source caption to inspire the original shoot"),
    handle: z.string().max(40).nullable().optional().describe("Source handle, if known"),
    url: z.string().max(300).nullable().optional().describe("Source video URL"),
    soundName: z.string().max(120).nullable().optional().describe("Observed sound name, if any"),
    searchVsTrend: z
      .enum(["search", "trend", "hybrid"])
      .describe('Whether the hit is "search", "trend", or "hybrid"'),
    geo: z
      .enum(["upstate_sc", "wnc", "east_tn", "national"])
      .nullable()
      .optional()
      .describe("Geo tag when the caption is local"),
    videoId: z.string().max(40).optional().describe("Source video id"),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireMember();
    return recreateFromHit(actor, input);
  },
});
