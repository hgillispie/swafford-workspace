import { defineAction } from "@agent-native/core/action";

import {
  assertIngestAuthorized,
  resolveOrgId,
} from "../server/lib/pulse-access.js";
import { upsertPulseReport } from "../server/lib/pulse-ingest.js";
import { pulseIngestSchema } from "../shared/pulse-schema.js";
import { getRequestUserEmail } from "@agent-native/core/server";

export default defineAction({
  description:
    "Upsert a Brandbot Swafford Pulse JSON document (schema 1.0). Idempotent on reportDate + source. HTTP callers send Authorization: Bearer <PULSE_INGEST_SECRET>. Signed-in members may also call it.",
  schema: pulseIngestSchema,
  http: { method: "POST" },
  requiresAuth: false,
  maxBodyBytes: 1_500_000,
  run: async (payload, ctx) => {
    const auth = await assertIngestAuthorized(
      ctx?.requestHeaders?.get("authorization"),
    );
    const orgId =
      auth.mode === "session" ? auth.orgId : await resolveOrgId();
    const actorEmail =
      auth.mode === "session"
        ? auth.email
        : (getRequestUserEmail()?.trim() || "pulse-ingest@example.com");
    const saved = await upsertPulseReport({
      payload,
      orgId,
      actorEmail,
    });
    return {
      id: saved.id,
      message: saved.replaced
        ? `Replaced pulse ${saved.idempotencyKey}.`
        : `Stored pulse ${saved.idempotencyKey}.`,
      idempotencyKey: saved.idempotencyKey,
      reportDate: saved.reportDate,
      source: saved.source,
      replaced: saved.replaced,
      cardCount: saved.cardCount,
      effectiveDynoUnlocked: saved.effectiveDynoUnlocked,
      summary: saved.replaced
        ? "Existing report row and child rows were replaced. Card and idea statuses were kept."
        : "New report stored. PDFs stay on Drive; this row is the interactive source of truth.",
    };
  },
});
