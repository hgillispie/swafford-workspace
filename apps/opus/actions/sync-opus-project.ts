import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { applyFinishedJobs, projectView } from "../server/lib/sync.js";

export default defineAction({
  description:
    "Import finished proxy, transcript, and clip-render jobs for an Opus project and return playback plus clips.",
  schema: z.object({
    id: z.string().min(1),
  }),
  http: { method: "GET" },
  run: async ({ id }) => projectView(await applyFinishedJobs(id)),
});
