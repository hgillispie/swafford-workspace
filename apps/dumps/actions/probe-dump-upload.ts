import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { probePartUpload } from "../server/lib/b2.js";
import { failB2, requireActor } from "../server/lib/dumps.js";

export default defineAction({
  description:
    "Check that Backblaze accepts a signed part upload. The server opens a throwaway multipart upload, PUTs one 5 MiB part through the same presigned URL the browser uses, aborts it, and reports the real HTTP status and S3 error code plus whether the bucket CORS rule allows the site and exposes ETag. Use it when a browser upload says Backblaze closed the connection: the browser cannot read Backblaze error responses, the server can. Nothing is added to the library.",
  schema: z.object({}),
  run: async () => {
    const { orgId } = requireActor();
    try {
      const probe = await probePartUpload({ orgId });
      return {
        ...probe,
        summary: probeSummary(probe),
      };
    } catch (err) {
      failB2(err);
    }
  },
});

function probeSummary(probe: {
  ok: boolean;
  message: string;
  cors: "ok" | "origin_missing" | "etag_not_exposed" | "unknown";
}): string {
  const cors =
    probe.cors === "origin_missing"
      ? " The bucket CORS rule does not list this site, so run configure-dump-cors."
      : probe.cors === "etag_not_exposed"
        ? " The bucket CORS rule does not expose ETag, so run configure-dump-cors."
        : "";
  if (probe.ok) {
    return `${probe.message} The upload is not failing on the signed URL, the key, or encryption. The break is between this computer and Backblaze: a VPN, a firewall or antivirus that inspects uploads, an unstable link, or a source file that changes on disk.${cors}`;
  }
  return `${probe.message}${cors}`;
}
