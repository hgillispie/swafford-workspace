import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db.js";
import { presignGet } from "./b2.js";
import { jobsForSubject, publicJob } from "./jobs.js";
import { enqueuePrepare } from "./prepare.js";
import { nowIso, readProject, type ProjectRow } from "./access.js";
import { parseWords, type TranscriptWord } from "./words.js";

export async function applyFinishedJobs(id: string): Promise<ProjectRow> {
  let project = await readProject(id);
  const jobs = await jobsForSubject(id);
  const db = getDb();

  const ingest = jobs.find(
    (job) => job.kind === "ingest-youtube" && job.status === "succeeded" && job.result,
  );
  if (ingest?.result && !project.sourceKey) {
    const result = JSON.parse(ingest.result) as {
      sourceKey?: string;
      outputKey?: string;
      durationMs?: number;
      width?: number | null;
      height?: number | null;
    };
    const sourceKey = result.sourceKey || result.outputKey;
    if (sourceKey) {
      const [row] = await db
        .update(schema.projects)
        .set({
          sourceKey,
          durationMs: Math.max(project.durationMs, result.durationMs ?? 0),
          mediaWidth: result.width ?? project.mediaWidth,
          mediaHeight: result.height ?? project.mediaHeight,
          updatedAt: nowIso(),
        })
        .where(eq(schema.projects.id, id))
        .returning();
      if (row) project = row;
      const already = jobs.some(
        (job) => job.kind === "proxy" || job.kind === "extract-audio",
      );
      if (!already) await enqueuePrepare(project);
    }
  }

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
    (job) => job.kind === "transcribe" && job.status === "succeeded" && job.result,
  );
  if (transcriptJob?.result && project.transcriptStatus !== "ready") {
    const result = JSON.parse(transcriptJob.result) as {
      words?: TranscriptWord[];
      language?: string | null;
      provider?: string;
    };
    const words = result.words ?? [];
    if (words.length === 0) {
      const [row] = await db
        .update(schema.projects)
        .set({
          transcriptStatus: "failed",
          transcriptError: "No speech was detected.",
          wordsJson: "[]",
          updatedAt: nowIso(),
        })
        .where(eq(schema.projects.id, id))
        .returning();
      if (row) project = row;
    } else {
      const [row] = await db
        .update(schema.projects)
        .set({
          transcriptStatus: "ready",
          transcriptError: null,
          transcriptSource: result.provider || "worker",
          language: result.language ?? project.language,
          wordsJson: JSON.stringify(words),
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
    (job) =>
      (job.kind === "transcribe" || job.kind === "ingest-youtube") &&
      job.status === "failed",
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

  const renders = jobs.filter((job) => job.kind === "opus-render");
  for (const job of renders) {
    if (job.status === "succeeded" && job.result) {
      const result = JSON.parse(job.result) as {
        outputKey?: string;
        clips?: Array<{ clipId?: string; outputKey?: string; error?: string }>;
      };
      if (Array.isArray(result.clips) && result.clips.length > 0) {
        for (const item of result.clips) {
          if (!item.clipId) continue;
          const failed = Boolean(item.error) || !item.outputKey;
          await db
            .update(schema.clips)
            .set(
              failed
                ? {
                    status: "failed",
                    error: item.error || "Render failed.",
                    outputKey: null,
                  }
                : {
                    status: "ready",
                    outputKey: item.outputKey,
                    error: null,
                  },
            )
            .where(
              and(
                eq(schema.clips.projectId, id),
                eq(schema.clips.id, item.clipId),
                eq(schema.clips.jobId, job.id),
              ),
            );
        }
      } else if (result.outputKey) {
        await db
          .update(schema.clips)
          .set({
            status: "ready",
            outputKey: result.outputKey,
            error: null,
          })
          .where(
            and(eq(schema.clips.projectId, id), eq(schema.clips.jobId, job.id)),
          );
      }
    } else if (job.status === "failed") {
      await db
        .update(schema.clips)
        .set({ status: "failed", error: job.error || "Render failed." })
        .where(
          and(eq(schema.clips.projectId, id), eq(schema.clips.jobId, job.id)),
        );
    } else if (job.status === "running" || job.status === "queued") {
      await db
        .update(schema.clips)
        .set({ status: job.status === "running" ? "rendering" : "queued" })
        .where(
          and(
            eq(schema.clips.projectId, id),
            eq(schema.clips.jobId, job.id),
            eq(schema.clips.status, "queued"),
          ),
        );
    }
  }

  return project;
}

export async function projectView(project: ProjectRow) {
  const jobs = await jobsForSubject(project.id);
  const clips = await getDb()
    .select()
    .from(schema.clips)
    .where(eq(schema.clips.projectId, project.id));
  let mediaUrl: string | null = null;
  if (project.proxyKey) {
    const signed = await presignGet({
      key: project.proxyKey,
      filename: "proxy.mp4",
      contentType: "video/mp4",
    });
    mediaUrl = signed.url;
  }
  return {
    project: {
      id: project.id,
      title: project.title,
      durationMs: project.durationMs,
      mediaFilename: project.mediaFilename,
      transcriptStatus: project.transcriptStatus,
      transcriptError: project.transcriptError,
      transcriptSource: project.transcriptSource,
      captionStyle: project.captionStyle,
      captionFont: project.captionFont,
      captionPosition: project.captionPosition,
      aspect: project.aspect,
      hookOverlay: project.hookOverlay !== 0,
      youtubeUrl: project.youtubeUrl,
      mediaUrl,
      hasSource: Boolean(project.sourceKey),
    },
    words: parseWords(project.wordsJson),
    clips: clips
      .sort((a, b) => b.score - a.score || a.startMs - b.startMs)
      .map((clip) => {
        const job = jobs.find((item) => item.id === clip.jobId);
        return {
          id: clip.id,
          title: clip.title,
          startMs: clip.startMs,
          endMs: clip.endMs,
          score: clip.score,
          reason: clip.reason,
          hook: clip.hook,
          engagement: clip.engagement,
          value: clip.valueScore,
          shareability: clip.shareability,
          source: clip.source,
          status: clip.status,
          error: clip.error,
          aspect: clip.aspect,
          captionStyle: clip.captionStyle,
          captionFont: clip.captionFont,
          captionPosition: clip.captionPosition,
          hookOverlay: clip.hookOverlay !== 0,
          downloadable: Boolean(clip.outputKey),
          progress: job?.progress ?? 0,
          progressLabel: job?.progressLabel ?? null,
          jobStatus: job?.status ?? null,
        };
      }),
    jobs: jobs.map(publicJob),
  };
}
