import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/pulse-access.js";
import { listKeywords } from "../server/lib/pulse-read.js";

export default defineAction({
  description:
    "Keyword finder: Brandbot terms from the latest pulses plus the Swafford seed library.",
  schema: z.object({
    q: z.string().max(80).optional(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ q }) => {
    const actor = await requireMember();
    const needle = q?.trim().toLowerCase() ?? "";
    const keywords = (await listKeywords(actor.orgId)).filter((row) => {
      if (!needle) return true;
      return (
        row.term.toLowerCase().includes(needle) ||
        row.related.some((item) => item.toLowerCase().includes(needle))
      );
    });
    return {
      keywords,
      summary: `${keywords.length} keywords. Seed library stays available before the first pulse.`,
    };
  },
});
