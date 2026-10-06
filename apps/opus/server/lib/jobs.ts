import {
  launchMediaWorker,
  launchStatusLabel,
} from "@swafford-workspace/media-core/launch";
import { and, desc, eq } from "drizzle-orm";

import { getDb, schema } from "../db.js";
import { nowIso } from "./access.js";

export async function enqueueMediaJob(input: {
  kind: string;
  subjectId: string;
  orgId: string | null;
  ownerEmail: string;
  payload: unknown;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await getDb()
    .insert(schema.mediaJobs)
    .values({
      id,
      app: "opus",
      kind: input.kind,
      status: "queued",
      orgId: input.orgId,
      ownerEmail: input.ownerEmail,
      subjectId: input.subjectId,
      payload: JSON.stringify(input.payload),
      progress: 0,
      attempts: 0,
      maxAttempts: 3,
      runAfter: Date.now(),
      createdAt: now,
      updatedAt: now,
    });
  await noteWorkerWake(id);
  return id;
}

async function noteWorkerWake(jobId: string): Promise<void> {
  const launch = await launchMediaWorker();
  const label = launchStatusLabel(launch);
  if (launch.error) console.warn(`[opus] media worker: ${launch.error}`);
  if (!label) return;
  await getDb()
    .update(schema.mediaJobs)
    .set({ progressLabel: label, updatedAt: nowIso() })
    .where(
      and(eq(schema.mediaJobs.id, jobId), eq(schema.mediaJobs.status, "queued")),
    );
}

export async function jobsForSubject(subjectId: string) {
  return getDb()
    .select()
    .from(schema.mediaJobs)
    .where(
      and(
        eq(schema.mediaJobs.app, "opus"),
        eq(schema.mediaJobs.subjectId, subjectId),
      ),
    )
    .orderBy(desc(schema.mediaJobs.createdAt));
}

export function publicJob(row: typeof schema.mediaJobs.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    progress: row.progress,
    progressLabel: row.progressLabel,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
