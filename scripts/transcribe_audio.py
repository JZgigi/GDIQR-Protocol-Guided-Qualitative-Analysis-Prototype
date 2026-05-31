#!/usr/bin/env python3
import json
import os
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print(
            "Usage: transcribe_audio.py <audio_path> <language_code>",
            file=sys.stderr,
        )
        return 2

    audio_path = sys.argv[1]
    language_code = sys.argv[2]

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    model_name = os.environ.get("WHISPER_MODEL", "small")
    device = os.environ.get("WHISPER_DEVICE", "auto")
    compute_type = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, _info = model.transcribe(
        audio_path,
        language=language_code,
        vad_filter=True,
    )

    rows = []
    text_parts = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue

        rows.append(
            {
                "start": segment.start,
                "end": segment.end,
                "text": text,
            }
        )
        text_parts.append(text)

    print(
        json.dumps(
            {
                "text": "\n".join(text_parts),
                "segments": rows,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
