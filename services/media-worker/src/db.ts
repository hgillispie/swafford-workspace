import {
  MEDIA_JOBS_SQL,
  type MediaJobKind,
} from "@swafford-workspace/media-core";
import postgres from "postgres";

export type JobRow = {
  id: string;
  app: string;
  kind: MediaJobKind;
  status: string;
  org_id: string | null;
  owner_email: string;
  subject_id: string;
  payload: string;
  result: string | null;
  progress: number;
  progress_label: string | null;
  attempts: number;
  max_attempts: number;
  heartbeat_at: number | null;
  locked_by: string | null;
  run_after: number;
  error: string | null;
};

let client: ReturnType<typeof postgres> | null = null;

export function db() {
  if (client) return client;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required.");
  client = postgres(url, { max: 4, prepare: false });
  return client;
}

export async function migrateJobs(): Promise<void> {
  await db().unsafe(MEDIA_JOBS_SQL);
}

export async function claimJob(workerId: string): Promise<JobRow | null> {
  const now = Date.now();
  const staleBefore = now - 90_000;
  const rows = await db()<JobRow[]>`
    UPDATE media_jobs
    SET status = 'running',
        locked_by = ${workerId},
        heartbeat_at = ${now},
        attempts = attempts + 1,
        updated_at = ${new Date().toISOString()}
    WHERE id = (
      SELECT id FROM media_jobs
      WHERE (
        status = 'queued' AND run_after <= ${now}
      ) OR (
        status = 'running'
        AND COALESCE(heartbeat_at, 0) < ${staleBefore}
        AND attempts < max_attempts
      )
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function heartbeat(id: string): Promise<void> {
  const now = Date.now();
  await db()`
    UPDATE media_jobs
    SET heartbeat_at = ${now}, updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND status = 'running'
  `;
}

export async function isCancelled(id: string): Promise<boolean> {
  const rows = await db()`SELECT status FROM media_jobs WHERE id = ${id}`;
  return rows[0]?.status === "cancelled";
}

export async function setProgress(
  id: string,
  progress: number,
  label: string,
): Promise<void> {
  const now = Date.now();
  await db()`
    UPDATE media_jobs
    SET progress = ${Math.max(0, Math.min(100, Math.round(progress)))},
        progress_label = ${label},
        heartbeat_at = ${now},
        updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND status = 'running'
  `;
}

export async function completeJob(
  id: string,
  result: unknown,
): Promise<void> {
  await db()`
    UPDATE media_jobs
    SET status = 'succeeded',
        progress = 100,
        progress_label = 'Done',
        result = ${JSON.stringify(result)},
        error = NULL,
        locked_by = NULL,
        updated_at = ${new Date().toISOString()}
    WHERE id = ${id}
  `;
}

export async function failJob(row: JobRow, message: string): Promise<void> {
  const retry = row.attempts < row.max_attempts;
  const delay = Math.min(60_000, 2_000 * 2 ** Math.max(0, row.attempts - 1));
  await db()`
    UPDATE media_jobs
    SET status = ${retry ? "queued" : "failed"},
        error = ${message.slice(0, 800)},
        locked_by = NULL,
        run_after = ${Date.now() + (retry ? delay : 0)},
        updated_at = ${new Date().toISOString()}
    WHERE id = ${row.id} AND status = 'running'
  `;
}

export async function markCancelled(id: string): Promise<void> {
  await db()`
    UPDATE media_jobs
    SET status = 'cancelled',
        locked_by = NULL,
        progress_label = 'Cancelled',
        updated_at = ${new Date().toISOString()}
    WHERE id = ${id}
  `;
}

export async function enqueueJob(input: {
  id?: string;
  app: string;
  kind: MediaJobKind;
  subjectId: string;
  orgId?: string | null;
  ownerEmail?: string;
  payload: unknown;
}): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await db()`
    INSERT INTO media_jobs (
      id, app, kind, status, org_id, owner_email, subject_id, payload,
      progress, attempts, max_attempts, run_after, created_at, updated_at
    ) VALUES (
      ${id},
      ${input.app},
      ${input.kind},
      'queued',
      ${input.orgId ?? null},
      ${input.ownerEmail ?? ""},
      ${input.subjectId},
      ${JSON.stringify(input.payload)},
      0,
      0,
      3,
      ${Date.now()},
      ${now},
      ${now}
    )
  `;
  return id;
}
