#!/usr/bin/env python3
"""Word-level transcription via faster-whisper. Prints JSON to stdout."""

import json
import sys


def main() -> None:
    path = sys.argv[1]
    model_name = __import__("os").environ.get("WHISPER_MODEL", "tiny")
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit(
            "faster-whisper is not installed. pip install faster-whisper, "
            "or set TRANSCRIPTION_PROVIDER=builder."
        ) from exc
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, info = model.transcribe(path, word_timestamps=True, vad_filter=True)
    words = []
    for segment in segments:
        for word in segment.words or []:
            text = (word.word or "").strip()
            if not text:
                continue
            words.append(
                {
                    "text": text,
                    "startMs": int(round(word.start * 1000)),
                    "endMs": int(round(word.end * 1000)),
                }
            )
    json.dump(
        {"language": getattr(info, "language", None), "words": words},
        sys.stdout,
    )


if __name__ == "__main__":
    main()
