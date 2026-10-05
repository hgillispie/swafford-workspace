# Media worker

Host-agnostic ffmpeg worker for Cutline and Opus. It claims rows from the shared Postgres `media_jobs` table, reads originals from S3-compatible storage (Backblaze B2 in production, MinIO in tests), and writes proxies, audio chunks, edited masters, and vertical clips back to the same bucket. Apps enqueue jobs with `defineAction`. Nothing in this process is tied to Netlify, Fly, Railway, or a laptop.

Video bytes never go through the Netlify functions. The browser uses presigned PUT/GET. This worker is the only place that downloads and transcodes.

## Jobs

| Kind | What it does |
| --- | --- |
| `proxy` | 720p H.264 proxy so browsers can play DJI H.265 |
| `extract-audio` | 16 kHz mono MP3, split into chunks (default 10 minutes) |
| `transcribe` | Word-level timestamps for those chunks |
| `cutline-render` | Applies a transcript cut list to the **original**, with optional caption burn-in or a sidecar SRT |
| `opus-render` | One 9:16 clip: face tracking, else motion, else center crop, plus animated captions |
| `ingest-youtube` | Optional. Requires `yt-dlp` on `PATH` |

Claiming uses `FOR UPDATE SKIP LOCKED`. Running jobs heartbeat every 15s. A job with no heartbeat for 90s is retried until `max_attempts` (3). Set `status = 'cancelled'` to stop a job at the next check.

## Configure

All configuration is environment variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres that also serves the apps. Use the Neon **unpooled** URL. |
| `B2_S3_ENDPOINT` | yes | `https://s3.us-east-005.backblazeb2.com` |
| `B2_REGION` | yes | `us-east-005` |
| `B2_BUCKET` | yes | `swafford-video-dumps` |
| `B2_KEY_ID` | yes | Backblaze application key id |
| `B2_APPLICATION_KEY` | yes | Backblaze application key |
| `B2_FORCE_PATH_STYLE` | no | `true` for MinIO. Leave unset for B2. |
| `B2_SSE` | no | Default `AES256` (SSE-B2). Set `off` for MinIO. |
| `TRANSCRIPTION_PROVIDER` | no | `builder` (default when a Builder key is present), `whisper`, `deepgram`, or `assemblyai` |
| `BUILDER_PRIVATE_KEY` | for Builder ASR | Same Builder private key the workspace already uses for LLM credits |
| `DEEPGRAM_API_KEY` | for Deepgram | |
| `ASSEMBLYAI_API_KEY` | for AssemblyAI | |
| `WHISPER_MODEL` | no | faster-whisper model. Default `tiny`. `base` or `small` are more accurate and slower. |
| `MEDIA_WORKDIR` | no | Scratch disk. Default `/tmp/media-worker`. Each job deletes its download when it finishes. |
| `MEDIA_WORKER_ID` | no | Lock owner id. Default is a random id per process. |
| `MEDIA_WORKER_IDLE_MINUTES` | no | Exit after the queue has been empty this long. Default `5`. `0` stays up. |
| `WORKER_LAUNCHER` | no | `fly` or `local` (also `noop`). Set on the **apps**, not required on the worker. Default is `fly` when `FLY_API_TOKEN` and `FLY_APP` are set, otherwise `local`. |
| `FLY_API_TOKEN` | for Fly wake | Deploy token that can start Machines. Netlify env. |
| `FLY_APP` | for Fly wake | Fly app name, for example `swafford-media-worker`. |
| `FLY_MACHINE_ID` | for Fly wake | Id of the pre-created machine. Without it, the launcher uses the machine named `media-worker`, or creates one when `FLY_IMAGE` is set. |
| `FLY_IMAGE` | to create a machine | Registry image, only if no machine exists yet. |
| `FLY_MACHINE_SIZE` | no | Default `performance-4x` (4 dedicated vCPU, 8 GB). |
| `FLY_REGION` | no | Default `iad`. |
| `FLY_ROOTFS_GB` | no | Ephemeral root disk when the launcher creates a machine. Default `80`. |

Transcription is behind `src/transcribe.ts`. Builder.io ASR is the production default and matches Cutline. Whisper runs locally with no API key. Deepgram and AssemblyAI are drop-in when their keys are set.

## Run

From the workspace root, after `pnpm install`:

```bash
pnpm --filter media-worker start
```

The process migrates `media_jobs` on startup (`CREATE TABLE IF NOT EXISTS`) and then polls.

## Docker

```bash
docker build -f services/media-worker/Dockerfile -t swafford-media-worker .
docker run --rm \
  -e DATABASE_URL \
  -e B2_S3_ENDPOINT -e B2_REGION -e B2_BUCKET \
  -e B2_KEY_ID -e B2_APPLICATION_KEY \
  -e TRANSCRIPTION_PROVIDER=builder \
  -e BUILDER_PRIVATE_KEY \
  -e MEDIA_WORKDIR=/tmp/media-worker \
  -e MEDIA_WORKER_IDLE_MINUTES=5 \
  swafford-media-worker
```

The image is Debian bookworm, Node 22, ffmpeg, OpenCV (Haar face tracking), DejaVu and Liberation fonts, and faster-whisper. No GPU runtime. H.264 encoding is CPU (`libx264`).

There is no persistent volume. A job downloads its original into `MEDIA_WORKDIR`, uploads the result, and deletes that directory. The next start of a stopped Fly machine also resets the root disk (`persist_rootfs = never`).

## Idle exit and wake

After the queue has no `queued` or `running` rows for `MEDIA_WORKER_IDLE_MINUTES` (default 5), the process exits 0. `[[restart]] policy = "on-failure"` leaves the machine stopped. A non-zero crash can still retry.

Cutline and Opus call `launchMediaWorker()` from `@swafford-workspace/media-core/launch` after they insert a job. The Fly adapter starts the existing machine, or creates one from `FLY_IMAGE` if none exists. Starting an already-started machine is a no-op. The local adapter does nothing, which is what a Mac uses while `docker compose` or `pnpm worker:dev` is already polling. See `MAC-TESTING.md`.

While a job is still `queued` because the machine was stopped, the apps set the progress label to `Starting renderer…`.

## Fly.io

One `performance-4x` machine (4 dedicated vCPU, 8 GB RAM). No GPU. Do not autoscale past one.

From the workspace root, after `fly auth login`:

```bash
fly apps create swafford-media-worker
fly secrets set --app swafford-media-worker \
  DATABASE_URL="postgres://…" \
  B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com" \
  B2_REGION="us-east-005" \
  B2_BUCKET="swafford-video-dumps" \
  B2_KEY_ID="…" \
  B2_APPLICATION_KEY="…" \
  TRANSCRIPTION_PROVIDER="builder" \
  BUILDER_PRIVATE_KEY="…" \
  MEDIA_WORKER_IDLE_MINUTES="5" \
  MEDIA_WORKDIR="/tmp/media-worker"
fly deploy . --config services/media-worker/fly.toml --ha=false
fly machine update <id> --app swafford-media-worker \
  --vm-size performance-4x --memory 8192 \
  --rootfs-size 80gb --rootfs-persist never -y
fly machine stop <id> --app swafford-media-worker
```

`fly.toml` sets the VM size and `persist_rootfs = never`. `--rootfs-size 80gb` is the scratch ceiling for one original plus its outputs (about three times a large file). That disk is billed while the machine exists, including when it is stopped. It is not a Fly Volume, and it does not keep footage.

On Netlify, set `WORKER_LAUNCHER=fly`, `FLY_API_TOKEN` (a deploy token for this app: `fly tokens create deploy -a swafford-media-worker`), `FLY_APP=swafford-media-worker`, and `FLY_MACHINE_ID` to the id from `fly machines list`. Optional: `FLY_IMAGE` (only used to create a machine when the id is missing), `FLY_MACHINE_SIZE=performance-4x`, `FLY_REGION=iad`, `FLY_ROOTFS_GB=80`.

Published Fly prices as of 1 Oct 2026 (`https://fly.io/pricing/`): `performance-4x` · 8 GB is **$0.1833 per hour** ($0.00005092 per second) while the machine is running, and a stopped machine’s rootfs is **$0.15 per GB per month**. Always-on for this preset is about **$132 per month** before disk. The worked example for a month of edits is in the pull request. A 4 GB machine can run out of memory decoding 4K.

Mac testing against Neon and B2 is `MAC-TESTING.md`. Production does not depend on that computer.

## Object layout

Originals stay where Dumps put them (`org/{orgId}/files/…`). Derived objects:

- `cutline/{projectId}/proxy.mp4`
- `cutline/{projectId}/audio/chunk-000.mp3`
- `cutline/{projectId}/exports/{exportId}.mp4` and `.srt`
- `opus/{projectId}/proxy.mp4`
- `opus/{projectId}/clips/{clipId}.mp4`
