import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db.js";
import { presignGet } from "../server/lib/b2.js";
import { jobsForSubject, publicJob } from "../server/lib/media-jobs.js";
import {
  nowIso,
  readProject,
  replaceTranscript,
  toSummary,
} from "../server/lib/projects.js";

export default defineAction({
  description:
    "Refresh proxy and transcript state for a project from finished media jobs, and return a short-lived playback URL for the 720p proxy.",
  schema: z.object({
    id: z.string().min(1).describe("Project id"),
  }),
  http: { method: "GET" },
  run: async ({ id }) => {
    let project = await readProject(id);
    const jobs = await jobsForSubject(id);
    const db = getDb();
    const proxyJob = jobs.find(
      (job) => job.kind === "proxy" && job.status === "succeeded" && job.result,
    );
    if (proxyJob?.result && !project.proxyKey) {
      const result = JSON.parse(proxyJob.result) as {
        outputKey?: string;
        durationMs?: number;
        width?: number | null;
        height?: number | null;
      };
      if (result.outputKey) {
        const [row] = await db
          .update(schema.projects)
          .set({
            proxyKey: result.outputKey,
            durationMs: Math.max(project.durationMs, result.durationMs ?? 0),
            mediaWidth: result.width ?? project.mediaWidth,
            mediaHeight: result.height ?? project.mediaHeight,
            updatedAt: nowIso(),
          })
          .where(eq(schema.projects.id, id))
          .returning();
        if (row) project = row;
      }
    }
    const transcriptJob = jobs.find(
      (job) =>
        job.kind === "transcribe" && job.status === "succeeded" && job.result,
    );
    if (
      transcriptJob?.result &&
      project.transcriptStatus !== "ready"
    ) {
      const result = JSON.parse(transcriptJob.result) as {
        words?: Array<{
          text: string;
          startMs: number;
          endMs: number;
          speaker?: string;
        }>;
        language?: string | null;
        provider?: string;
      };
      const words = result.words ?? [];
      if (words.length === 0) {
        await db
          .update(schema.projects)
          .set({
            transcriptStatus: "failed",
            transcriptError: "No speech was detected.",
            updatedAt: nowIso(),
          })
          .where(eq(schema.projects.id, id));
      } else {
        const speakerKeys = [
          ...new Set(words.map((word) => word.speaker || "default")),
        ];
        await replaceTranscript(
          project,
          speakerKeys.map((key, index) => ({
            key,
            name: speakerKeys.length > 1 ? `Speaker ${index + 1}` : "Speaker 1",
          })),
          words.map((word, index) => ({
            text: word.text,
            startMs: word.startMs,
            endMs: word.endMs,
            speakerKey: word.speaker || "default",
            paragraphStart: index === 0,
          })),
        );
        const [row] = await db
          .update(schema.projects)
          .set({
            transcriptStatus: "ready",
            transcriptSource: result.provider || "worker",
            transcriptError: null,
            language: result.language ?? project.language,
            durationMs: Math.max(
              project.durationMs,
              words[words.length - 1]?.endMs ?? 0,
            ),
            updatedAt: nowIso(),
          })
          .where(eq(schema.projects.id, id))
          .returning();
        if (row) project = row;
      }
    }
    const failed = jobs.find(
      (job) => job.kind === "transcribe" && job.status === "failed",
    );
    if (failed && project.transcriptStatus === "processing") {
      const [row] = await db
        .update(schema.projects)
        .set({
          transcriptStatus: "failed",
          transcriptError: failed.error || "Transcription failed.",
          updatedAt: nowIso(),
        })
        .where(eq(schema.projects.id, id))
        .returning();
      if (row) project = row;
    }
    let mediaUrl: string | null = null;
    if (project.proxyKey) {
      try {
        const signed = await presignGet({
          key: project.proxyKey,
          filename: project.mediaFilename || "proxy.mp4",
          contentType: "video/mp4",
        });
        mediaUrl = signed.url;
      } catch (error) {
        fail(
          error instanceof Error ? error.message : "Could not sign playback.",
          { statusCode: 502, errorCode: "b2_request_failed" },
        );
      }
    }
    return {
      project: { ...toSummary(project), mediaUrl },
      jobs: jobs.map(publicJob),
    };
  },
});
