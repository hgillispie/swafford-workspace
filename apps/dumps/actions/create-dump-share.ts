import { randomBytes } from "node:crypto";

import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import {
  dumpShares,
  getDb,
  loadFile,
  newId,
  requireActor,
} from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Create an expiring share link for a ready dump file. Opening it requires a signed-in member of the same organization.",
  schema: z.object({
    id: z.string().describe("Dump file id."),
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(720)
      .default(24)
      .describe("Hours until the link expires. Defaults to 24. Maximum 720."),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      app: "dumps",
      view: "library",
      params: { share: result.token },
    }),
    label: "Open share link",
  }),
  run: async ({ id, expiresInHours }) => {
    const { email, orgId } = requireActor();
    const file = await loadFile(id, orgId);
    if (file.status !== "ready") {
      fail("Only a finished upload can be shared.", {
        statusCode: 409,
        errorCode: "not_ready",
      });
    }
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000,
    ).toISOString();
    const shareId = newId();
    await getDb().insert(dumpShares).values({
      id: shareId,
      fileId: id,
      token,
      expiresAt,
      ownerEmail: email,
      orgId,
      visibility: "org",
    });
    return {
      id: shareId,
      fileId: id,
      token,
      expiresAt,
      sharePath: `/home?share=${encodeURIComponent(token)}`,
      message: `Share link for ${file.filename} expires ${expiresAt}.`,
    };
  },
});
