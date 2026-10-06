# Portable media worker. Build from the workspace root:
#   docker build -f services/media-worker/Dockerfile -t swafford-media-worker .
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    fonts-dejavu-core \
    fonts-liberation \
    fonts-noto-core \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Local ASR and optional YouTube ingest. Builder, Deepgram, and AssemblyAI
# need no extra packages, but the image still includes both tools.
# Pin PyAV. faster-whisper 1.1.1 passes metadata_errors, which PyAV 19 removed.
RUN pip3 install --break-system-packages --no-cache-dir \
    faster-whisper==1.1.1 yt-dlp "av==14.2.0" "opencv-python-headless==4.10.0.84"

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

COPY . .

# Root postinstall builds creative-context and embedding. Selecting only
# media-worker skips those packages, so the build fails without zod and
# playwright. Include them and their dependencies; do not install every app.
RUN pnpm install --frozen-lockfile \
    --filter media-worker... \
    --filter ./packages/creative-context... \
    --filter ./packages/embedding...

WORKDIR /repo/services/media-worker
# Scratch lives on the machine rootfs (/tmp). Each job downloads its source
# into a temp directory and deletes it before the next job. Do not mount a
# volume here: a stopped machine resets this disk (persist_rootfs = never).
ENV MEDIA_WORKDIR=/tmp/media-worker
ENV MEDIA_WORKER_IDLE_MINUTES=5
# Production posts audio to Opus (MEDIA_APP_TRANSCRIBE_URL). A Mac can
# override this with whisper, or with builder plus BUILDER_PRIVATE_KEY.
ENV TRANSCRIPTION_PROVIDER=app
CMD ["pnpm", "start"]
