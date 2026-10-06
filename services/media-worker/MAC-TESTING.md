# Test the media worker on a Mac

Production rendering runs on Fly and scales to zero. This machine is only for trying the same image against the real Neon database and the dumps bucket. Matt’s PC is not part of that.

## One-time

From the workspace root, with Docker Desktop running:

```bash
cp services/media-worker/.env.example services/media-worker/.env.local
```

Fill `.env.local` with the Neon **unpooled** `DATABASE_URL` and the `B2_*` values. Leave `WORKER_LAUNCHER=local`. That adapter does not call Fly.

For speech recognition, either leave `TRANSCRIPTION_PROVIDER=whisper`, or point `MEDIA_APP_TRANSCRIBE_URL` at a running Opus app (`http://127.0.0.1:<port>/api/worker/transcribe` when Opus is not behind the `/opus` prefix) and set the same `MEDIA_WORKER_SECRET` on the app. The app then uses its Builder connection. A `BUILDER_PRIVATE_KEY` on the worker is only for calling Builder directly, without the app.

Stop the Fly machine while you do this (`fly machine stop <id>`). Otherwise Fly and the Mac can both claim jobs from the same table. The claim is safe (only one worker gets each job), but you would pay for Fly time you did not mean to use.

Run the workspace apps locally too, with `WORKER_LAUNCHER=local` and the same `DATABASE_URL`. The hosted Netlify site will keep waking Fly if its launcher env is set.

## Run

```bash
docker compose -f services/media-worker/docker-compose.yml up --build
```

Or, without Docker, from the workspace root after `pnpm install`:

```bash
pnpm worker:dev
```

`pnpm worker:dev` reads `services/media-worker/.env.local` when that file exists.

Enqueue a job from Cutline or Opus (pick a dumps video, export, or render a clip). The worker claims it, downloads the original into a temp directory, writes the result back to B2, and deletes the temp directory. When the queue stays empty for `MEDIA_WORKER_IDLE_MINUTES` (default 5), the process exits. Compose does not restart it. Start the same command again for the next batch.

Set `MEDIA_WORKER_IDLE_MINUTES=0` in `.env.local` if you want the process to stay up while you debug.

ffmpeg, the face tracker, and transcription all run inside this process. Nothing here starts Fly.
