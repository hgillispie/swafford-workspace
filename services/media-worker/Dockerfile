# Portable media worker. Build from the workspace root:
#   docker build -f services/media-worker/Dockerfile -t swafford-media-worker .
FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    ffmpeg \
    fonts-dejavu-core \
    fonts-liberation \
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

RUN pnpm install --frozen-lockfile --filter media-worker...

WORKDIR /repo/services/media-worker
ENV MEDIA_WORKDIR=/tmp/media-worker
ENV TRANSCRIPTION_PROVIDER=builder
CMD ["pnpm", "start"]
