import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { providerStatus } from "../server/lib/live.js";

export default defineAction({
  description:
    "Whether SCRAPECREATORS_API_KEY is available. Returns only { configured }. Never returns the key.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    await requireMember();
    return providerStatus();
  },
});
