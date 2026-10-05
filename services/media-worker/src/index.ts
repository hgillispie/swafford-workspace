import { randomUUID } from "node:crypto";

import { ensureBucket } from "@swafford-workspace/object-storage";

import {
  claimJob,
  completeJob,
  failJob,
  heartbeat,
  markCancelled,
  migrateJobs,
} from "./db.js";
import { ensureWorkdir, JobCancelled, killActiveChildren } from "./ffmpeg.js";
import { handleJob } from "./handlers.js";

const workerId = process.env.MEDIA_WORKER_ID?.trim() || `worker-${randomUUID()}`;
let stopped = false;

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
  console.log(`[media-worker] ${workerId} polling`);
  while (!stopped) {
    const worked = await tick();
    if (!worked) await new Promise((resolve) => setTimeout(resolve, 1500));
  }
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
