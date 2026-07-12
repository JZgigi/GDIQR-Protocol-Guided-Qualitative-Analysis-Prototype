import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Audio path is required."}))
        return 2

    audio_path = sys.argv[1]
    language_hint = (sys.argv[2] if len(sys.argv) > 2 else "").strip().lower()
    language = "zh" if language_hint.startswith("zh") or "chinese" in language_hint else "en" if language_hint.startswith("en") or "english" in language_hint else None

    try:
        from faster_whisper import WhisperModel
    except Exception:
        print(json.dumps({"error": "faster-whisper is not installed in the project Python environment. Run: pip install faster-whisper"}))
        return 3

    model_name = os.getenv("VOICE_GUIDE_WHISPER_MODEL", "small")
    device = os.getenv("VOICE_GUIDE_WHISPER_DEVICE", "auto")
    compute_type = os.getenv("VOICE_GUIDE_WHISPER_COMPUTE_TYPE", "int8")

    try:
        model = WhisperModel(model_name, device=device, compute_type=compute_type)
        segments, _ = model.transcribe(
            audio_path,
            language=language,
            vad_filter=True,
            beam_size=3,
            condition_on_previous_text=False,
        )
        transcript = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
        if not transcript:
            print(json.dumps({"error": "No speech was recognised."}, ensure_ascii=False))
            return 4
        print(json.dumps({"transcript": transcript}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(json.dumps({"error": f"Local transcription failed: {exc}"}, ensure_ascii=False))
        return 5


if __name__ == "__main__":
    raise SystemExit(main())
