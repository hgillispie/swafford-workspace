import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { auditPage } from "../server/lib/live.js";

export default defineAction({
  description:
    "Audit a public TikTok handle: topic clusters, average views, outlier winners, posting hours, follower÷likes, and CTA quality. Live ScrapeCreators when the profile cache is stale. Narrative belongs in scout-save-audit, using the strongest configured model.",
  schema: z.object({
    handle: z.string().trim().min(1).max(40).describe("TikTok handle to audit"),
  }),
  http: { method: "POST" },
  run: async ({ handle }) => {
    const actor = await requireMember();
    return auditPage(actor, handle);
  },
});
