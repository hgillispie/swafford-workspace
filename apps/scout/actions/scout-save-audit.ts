import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { saveAuditNote } from "../server/lib/live.js";

export default defineAction({
  description:
    "Save the written audit narrative. Use the strongest configured model. Dyno hero claims and empty follow CTAs are scrubbed.",
  schema: z.object({
    id: z.string().describe("Audit id from scout-audit-page"),
    narrative: z.string().trim().min(1).max(4000).describe("Written audit"),
  }),
  http: { method: "POST" },
  run: async ({ id, narrative }) => {
    const actor = await requireMember();
    return saveAuditNote(actor, id, narrative);
  },
});
