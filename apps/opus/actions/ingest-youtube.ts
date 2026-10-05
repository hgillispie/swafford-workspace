import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { currentOrgId, nowIso, requireUserEmail } from "../server/lib/access.js";
import { enqueueMediaJob } from "../server/lib/jobs.js";

export default defineAction({
  description:
    "Queue a YouTube download on the media worker, then proxy and transcribe it. The worker must have yt-dlp.",
  schema: z.object({
    url: z.string().url().max(500),
    title: z.string().trim().max(200).optional(),
  }),
  run: async ({ url, title }) => {
    const ownerEmail = requireUserEmail();
    const orgId = currentOrgId();
    if (!orgId) {
      fail("Sign in to an organization first.", {
        statusCode: 401,
        errorCode: "unauthenticated",
      });
    }
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      host = "";
    }
    if (host !== "youtube.com" && host !== "youtu.be" && host !== "m.youtube.com") {
      fail("Paste a YouTube URL.", { statusCode: 400, errorCode: "bad_url" });
    }
    const id = crypto.randomUUID();
    const now = nowIso();
    await getDb()
      .insert(schema.projects)
      .values({
        id,
        title: title?.trim() || "YouTube video",
        youtubeUrl: url,
        transcriptStatus: "processing",
        ownerEmail,
        orgId,
        visibility: "org",
        createdAt: now,
        updatedAt: now,
      });
    const base = `opus/${id}`;
    await enqueueMediaJob({
      kind: "ingest-youtube",
      subjectId: id,
      orgId,
      ownerEmail,
      payload: {
        url,
        outputKey: `${base}/source.mp4`,
        proxyKey: `${base}/proxy.mp4`,
        audioPrefix: `${base}/audio`,
        chainPrepare: true,
      },
    });
    return { id };
  },
});
