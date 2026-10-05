import { randomUUID } from "node:crypto";

import { ensureBucket } from "@swafford-workspace/object-storage";

import {
  claimJob,
  closeDb,
  completeJob,
  countOpenJobs,
  failJob,
  heartbeat,
  markCancelled,
  migrateJobs,
} from "./db.js";
import { ensureWorkdir, JobCancelled, killActiveChildren } from "./ffmpeg.js";
import { handleJob } from "./handlers.js";

const workerId = process.env.MEDIA_WORKER_ID?.trim() || `worker-${randomUUID()}`;
let stopped = false;

/** Minutes to wait after the queue is empty before exiting. 0 keeps running. */
function idleWindowMs(): number {
  const raw = process.env.MEDIA_WORKER_IDLE_MINUTES?.trim();
  if (raw === undefined || raw === "") return 5 * 60_000;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes < 0) return 5 * 60_000;
  return minutes * 60_000;
}

async function sleep(ms: number): Promise<void> {
  const step = 250;
  let left = ms;
  while (left > 0 && !stopped) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(step, left)));
    left -= step;
  }
}

async function tick(): Promise<boolean> {
  const job = await claimJob(workerId);
  if (!job) return false;
  const beat = setInterval(() => {
    void heartbeat(job.id).catch(() => undefined);
  }, 15_000);
  try {
    const result = await handleJob(job);
    await completeJob(job.id, result);
    console.log(`[media-worker] ${job.kind} ${job.id} done`);
  } catch (error) {
    if (error instanceof JobCancelled) {
      await markCancelled(job.id);
      console.log(`[media-worker] ${job.kind} ${job.id} cancelled`);
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[media-worker] ${job.kind} ${job.id} failed: ${message}`);
      await failJob(job, message);
    }
  } finally {
    clearInterval(beat);
  }
  return true;
}

async function main(): Promise<void> {
  await ensureWorkdir();
  await migrateJobs();
  try {
    await ensureBucket();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[media-worker] bucket check: ${message}`);
  }
  const idleMs = idleWindowMs();
  console.log(
    `[media-worker] ${workerId} polling; idle exit after ${idleMs / 60_000} min`,
  );
  let idleSince: number | null = null;
  while (!stopped) {
    const worked = await tick();
    if (stopped) break;
    if (worked) {
      idleSince = null;
      continue;
    }
    const pending = await countOpenJobs();
    if (pending > 0 || idleMs === 0) {
      idleSince = null;
      await sleep(1500);
      continue;
    }
    const now = Date.now();
    idleSince ??= now;
    if (now - idleSince >= idleMs) {
      console.log(
        `[media-worker] queue empty for ${idleMs / 60_000} min, exiting`,
      );
      break;
    }
    await sleep(1500);
  }
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => {
  stopped = true;
  killActiveChildren();
});
process.on("SIGINT", () => {
  stopped = true;
  killActiveChildren();
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
