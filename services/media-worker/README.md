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
| `MEDIA_WORKDIR` | no | Scratch disk. Default `/tmp/media-worker`. Point this at a large volume. |
| `MEDIA_WORKER_ID` | no | Lock owner id. Default is a random id per process. |

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
  -e MEDIA_WORKDIR=/data \
  -v media-tmp:/data \
  swafford-media-worker
```

The image is Debian bookworm, Node 22, ffmpeg, OpenCV (Haar face tracking), DejaVu and Liberation fonts, and faster-whisper. No GPU runtime. H.264 encoding is CPU (`libx264`).

## Fly.io

```bash
fly launch --no-deploy --name swafford-media-worker --dockerfile services/media-worker/Dockerfile
fly volumes create media_tmp --size 100 --region iad
fly secrets set \
  DATABASE_URL="postgres://…" \
  B2_S3_ENDPOINT="https://s3.us-east-005.backblazeb2.com" \
  B2_REGION="us-east-005" \
  B2_BUCKET="swafford-video-dumps" \
  B2_KEY_ID="…" \
  B2_APPLICATION_KEY="…" \
  TRANSCRIPTION_PROVIDER="builder" \
  BUILDER_PRIVATE_KEY="…"
```

Mount the volume at `/data` and set `MEDIA_WORKDIR=/data` in `fly.toml`. One machine is enough. Do not autoscale past one until you are comfortable with two workers sharing the queue (the claim query allows it).

Suggested size for multi-GB 4K H.265 DJI originals: `performance-4x` (4 dedicated vCPU, 8 GB RAM) and a 100 GB volume. Face detection and encoding do not use a GPU. A 4 GB machine can OOM while decoding 4K. Scratch space should be at least three times the largest original (download + proxy + render).

Rough always-on cost for that Fly size is on the order of $120–160 per month plus volume storage (~$15 for 100 GB). Stopping the machine between batches drops the bill to mostly the volume. Hunter's Mac, running this same image, is the zero-marginal-cost option if it can stay awake with enough free disk.

## Object layout

Originals stay where Dumps put them (`org/{orgId}/files/…`). Derived objects:

- `cutline/{projectId}/proxy.mp4`
- `cutline/{projectId}/audio/chunk-000.mp3`
- `cutline/{projectId}/exports/{exportId}.mp4` and `.srt`
- `opus/{projectId}/proxy.mp4`
- `opus/{projectId}/clips/{clipId}.mp4`
