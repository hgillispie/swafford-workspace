import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { isOrgAdmin, requireMember } from "../server/lib/pulse-access.js";
import { upsertPulseReport } from "../server/lib/pulse-ingest.js";
import { pulseIngestSchema } from "../shared/pulse-schema.js";

export default defineAction({
  description:
    "Admin-only fallback when a Brandbot report did not arrive on its own. Pass the report JSON text. A Drive file id alone is recorded as not fetched — Pulse does not download Drive bytes.",
  schema: z.object({
    json: z
      .string()
      .max(1_500_000)
      .optional()
      .describe("Raw JSON text of the Drive drop. Omit when you only have a file id."),
    driveFileId: z
      .string()
      .max(200)
      .optional()
      .describe("Google Drive file id stored on the report after a successful JSON ingest, or echoed when JSON is missing."),
    driveUrl: z
      .string()
      .max(500)
      .optional()
      .describe("Optional Drive URL. Not fetched."),
  }),
  http: { method: "POST" },
  run: async ({ json, driveFileId, driveUrl }) => {
    const actor = await requireMember();
    if (!isOrgAdmin(actor.role)) {
      fail("Only an owner or admin can store a pasted report.", {
        statusCode: 403,
        errorCode: "forbidden",
      });
    }
    if (!json?.trim()) {
      return {
        ingested: false,
        fallback: "drive-drop",
        driveFileId: driveFileId ?? null,
        driveUrl: driveUrl ?? null,
        expectedFileName: "pulse-{reportDate}-{source}.json",
        message: "Paste the report text. Pulse does not download files.",
        summary: "Nothing was written.",
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      fail("That text is not JSON.", { errorCode: "invalid_json" });
    }
    const payload = pulseIngestSchema.safeParse(parsed);
    if (!payload.success) {
      fail(payload.error.issues.map((issue) => issue.message).join("; "), {
        errorCode: "invalid_pulse",
      });
    }
    if (driveFileId && !payload.data.summary.pdfDriveFileId) {
      payload.data.summary.pdfDriveFileId = driveFileId;
    }
    const saved = await upsertPulseReport({
      payload: payload.data,
      orgId: actor.orgId,
      actorEmail: actor.email,
    });
    return {
      ingested: true,
      id: saved.id,
      idempotencyKey: saved.idempotencyKey,
      replaced: saved.replaced,
      cardCount: saved.cardCount,
      driveFileId: driveFileId ?? payload.data.summary.pdfDriveFileId ?? null,
      message: `Ingested Drive JSON as ${saved.idempotencyKey}.`,
      summary: "Drive fallback stored the pasted JSON. The file itself was not downloaded.",
    };
  },
});
