import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { saveReportNote } from "../server/lib/live.js";

export default defineAction({
  description:
    "Save the written niche-pulse narrative. Use the strongest configured model. Does not fetch TikTok.",
  schema: z.object({
    id: z.string().describe("Report id from scout-intelligence-report"),
    narrative: z.string().trim().min(1).max(4000).describe("Written pulse brief"),
  }),
  http: { method: "POST" },
  run: async ({ id, narrative }) => {
    const actor = await requireMember();
    return saveReportNote(actor, id, narrative);
  },
});
