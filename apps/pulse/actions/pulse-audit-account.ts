import { defineAction, fail } from "@agent-native/core/action";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { getDb } from "../server/db/index.js";
import { pulseAudits } from "../server/db/schema.js";
import { buildAccountAudit } from "../server/lib/pulse-audit.js";
import { requireMember } from "../server/lib/pulse-access.js";
import { latestReport } from "../server/lib/pulse-read.js";

export default defineAction({
  description:
    "Account audit from stored Brandbot snapshots. Paste a TikTok URL or handle. Does not scrape TikTok.",
  schema: z.object({
    account: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .describe("TikTok handle or profile URL."),
  }),
  http: { method: "POST" },
  run: async ({ account }) => {
    const actor = await requireMember();
    const report = await latestReport(actor.orgId);
    const audit = await buildAccountAudit({
      orgId: actor.orgId,
      reportId: report?.id ?? null,
      raw: account,
    });
    if (!audit.handle) {
      fail("Enter a TikTok handle or profile URL.", {
        errorCode: "invalid_handle",
      });
    }
    const id = randomUUID();
    const db = getDb();
    await db.insert(pulseAudits).values({
      id,
      handle: audit.handle,
      url: audit.url,
      summaryJson: JSON.stringify(audit),
      narrative: null,
      limitationsJson: JSON.stringify(audit.limitations),
      ownerEmail: actor.email,
      orgId: actor.orgId,
      visibility: "org",
    });
    return {
      id,
      audit,
      message: audit.foundInPulse
        ? `Audit for @${audit.handle} uses the latest stored pulse.`
        : `@${audit.handle} is not in the latest pulse. Summary stays empty on purpose.`,
      summary: audit.foundInPulse
        ? `Stored-pulse audit for @${audit.handle}.`
        : "No stored snapshot for that handle.",
    };
  },
});
