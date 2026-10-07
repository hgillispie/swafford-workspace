import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "@agent-native/core/db/schema";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseIngestRuns } from "../server/db/schema.js";
import {
  readIngestSecret,
  requireMember,
} from "../server/lib/pulse-access.js";

export default defineAction({
  description:
    "Latest Pulse ingest runs for this organization, plus whether the vault secret resolves for this session. Does not return the secret.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const secret = await readIngestSecret();
    const db = getDb();
    const runs = await db
      .select({
        id: pulseIngestRuns.id,
        reportId: pulseIngestRuns.reportId,
        idempotencyKey: pulseIngestRuns.idempotencyKey,
        status: pulseIngestRuns.status,
        errorMessage: pulseIngestRuns.errorMessage,
        schemaVersion: pulseIngestRuns.schemaVersion,
        receivedAt: pulseIngestRuns.receivedAt,
      })
      .from(pulseIngestRuns)
      .where(eq(pulseIngestRuns.orgId, actor.orgId))
      .orderBy(desc(pulseIngestRuns.receivedAt))
      .limit(20);
    return {
      secretConfiguredForSession: Boolean(secret),
      ingestPath: "/pulse/_agent-native/actions/pulse-ingest",
      authHeader: "Authorization: Bearer <PULSE_INGEST_SECRET>",
      driveFileName: "pulse-{reportDate}-{source}.json",
      runs,
      summary: secret
        ? "Ingest secret resolves for this session."
        : "No vault secret resolved for this session. Brandbot can still use the deploy env var on the unauthenticated POST.",
    };
  },
});
