import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { requireMember } from "../server/lib/access.js";
import { bestTime } from "../server/lib/live.js";

export default defineAction({
  description:
    "Best posting hours in America/New_York from fetched competitor and audit timestamps, plus first-hour reply guidance. Not a reach oracle.",
  schema: z.object({
    handle: z
      .string()
      .max(40)
      .optional()
      .describe("Optional handle. Omit to use every saved competitor and audit."),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ handle }) => {
    const actor = await requireMember();
    return bestTime(actor, handle);
  },
});
