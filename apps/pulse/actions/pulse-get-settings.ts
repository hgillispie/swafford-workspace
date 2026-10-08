import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import {
  brandbotDeliveryFor,
  isOrgAdmin,
  readDynoUnlocked,
  requireMember,
} from "../server/lib/pulse-access.js";
import { latestReport } from "../server/lib/pulse-read.js";

export default defineAction({
  description:
    "Pulse settings. dynoUnlocked is the Hunter admin flag and wins over Brandbot payloads. Owners and admins also get the workspace id and whether Brandbot reports reach this workspace.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async () => {
    const actor = await requireMember();
    const dynoUnlocked = await readDynoUnlocked(actor.orgId);
    const report = await latestReport(actor.orgId);
    const admin = isOrgAdmin(actor.role);
    return {
      dynoUnlocked,
      canToggle: admin,
      ...(admin
        ? {
            workspaceId: actor.orgId,
            brandbotDelivery: brandbotDeliveryFor(actor.orgId),
          }
        : {}),
      payloadDynoUnlocked: report?.payloadDynoUnlocked ?? null,
      summary: dynoUnlocked
        ? "Dyno claims are unlocked by an admin."
        : "Dyno is locked. Admin toggle wins over Brandbot.",
    };
  },
});
