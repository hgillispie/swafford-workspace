import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { pushToPulse } from "../server/lib/live.js";

export default defineAction({
  description:
    "Copy a Scout recreate onto the Pulse idea backlog in the shared database. Pulse keeps its own ingest. This does not post to TikTok.",
  schema: z.object({
    id: z.string().describe("Recreate id to send"),
  }),
  http: { method: "POST" },
  run: async ({ id }) => {
    const actor = await requireMember();
    return pushToPulse(actor, id);
  },
});
