import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { draftCopy } from "../server/lib/live.js";

export default defineAction({
  description:
    "Preview a hook, script, or caption in shop voice with growth principles. Saves a structural draft. Rewrite with the strongest configured model, then call scout-save-draft.",
  schema: z.object({
    kind: z.enum(["hook", "script", "caption"]).describe('Draft kind: "hook", "script", or "caption"'),
    topic: z.string().trim().min(1).max(200).describe("Job, bike, or keyword the draft is about"),
  }),
  http: { method: "POST" },
  run: async (input) => {
    const actor = await requireMember();
    return draftCopy(actor, input);
  },
});
