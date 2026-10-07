import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { saveDraft } from "../server/lib/live.js";

export default defineAction({
  description:
    "Save a rewritten hook, script, or caption. Scrubs dyno hero claims and empty follow-for-more lines. Use the strongest configured model for the rewrite.",
  schema: z.object({
    id: z.string().describe("Draft id from scout-draft-copy"),
    body: z.string().trim().min(1).max(4000).describe("Rewritten draft text"),
  }),
  http: { method: "POST" },
  run: async ({ id, body }) => {
    const actor = await requireMember();
    return saveDraft(actor, id, body);
  },
});
