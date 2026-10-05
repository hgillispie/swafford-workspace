import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { nowIso, requireUserEmail } from "../server/lib/access.js";

export default defineAction({
  description: "Cancel a queued or running Opus media job.",
  schema: z.object({
    id: z.string().min(1),
  }),
  run: async ({ id }) => {
    requireUserEmail();
    const db = getDb();
    const [job] = await db
      .select()
      .from(schema.mediaJobs)
      .where(and(eq(schema.mediaJobs.id, id), eq(schema.mediaJobs.app, "opus")))
      .limit(1);
    if (!job) {
      fail("Job not found.", { statusCode: 404, errorCode: "not_found" });
    }
    await db
      .update(schema.mediaJobs)
      .set({
        status: "cancelled",
        updatedAt: nowIso(),
        progressLabel: "Cancelled",
      })
      .where(eq(schema.mediaJobs.id, id));
    return { id, status: "cancelled" };
  },
});
