import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { presignGet } from "../server/lib/b2.js";
import { readProject } from "../server/lib/projects.js";

export default defineAction({
  description:
    "Presign a finished Cutline export MP4 or its sidecar captions for download.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
    jobId: z.string().min(1).describe("Succeeded cutline-render job id"),
    file: z
      .enum(["video", "captions"])
      .default("video")
      .describe('Which file to sign: "video" or "captions"'),
  }),
  http: { method: "GET" },
  run: async ({ id, jobId, file }) => {
    await readProject(id);
    const [job] = await getDb()
      .select()
      .from(schema.mediaJobs)
      .where(
        and(
          eq(schema.mediaJobs.id, jobId),
          eq(schema.mediaJobs.app, "cutline"),
          eq(schema.mediaJobs.subjectId, id),
        ),
      )
      .limit(1);
    if (!job || job.status !== "succeeded" || !job.result) {
      fail("That export is not ready.", {
        statusCode: 409,
        errorCode: "not_ready",
      });
    }
    const result = JSON.parse(job.result) as {
      outputKey?: string;
      sidecarKey?: string | null;
    };
    const key = file === "captions" ? result.sidecarKey : result.outputKey;
    if (!key) {
      fail("That file was not produced.", {
        statusCode: 404,
        errorCode: "not_found",
      });
    }
    const signed = await presignGet({
      key,
      filename: key.split("/").pop() || "export.mp4",
      contentType: file === "captions" ? "application/x-subrip" : "video/mp4",
      disposition: "attachment",
    });
    return { url: signed.url, expiresInSeconds: signed.expiresInSeconds };
  },
});