# Chinese Audio Support

## Current Support

Chinese audio is now wired through the local test flow:

```text
Chinese audio file
  -> Supabase Storage interview-audio bucket
  -> public.audio_files
  -> public.transcription_jobs
  -> local faster-whisper with language=zh
  -> Ollama speaker labelling and de-identification
  -> public.transcripts and public.segments
  -> Ollama GDI-QR-informed draft-support routes
```

In the Upload step, choose **Chinese** before selecting the audio file. The app sends `zh` to the transcription script, then asks Ollama to label turns as `Interviewer:` and `Participant:`. High-confidence private details are replaced with bracket placeholders, and uncertain names or places are kept as review markers such as `[[PRIVACY_REVIEW:PERSON:Sam]]` for manual review.

## Recommended Chinese Transcription Model

For a quick first test:

```text
WHISPER_MODEL=small
```

For better Chinese accuracy, especially with longer interviews:

```text
WHISPER_MODEL=large-v3-turbo
```

The first run downloads the model locally, so it may take several minutes.

## Required Local Tools

Install the local transcription dependency:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install faster-whisper
```

Set this in `.env.local`:

```text
PYTHON_BIN=.venv/bin/python
WHISPER_MODEL=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
```

On macOS, install ffmpeg if your audio format fails to decode:

```bash
brew install ffmpeg
```

## After Transcription

Once transcription succeeds:

1. Open the **Transcript** step and review/edit the transcript.
2. Resolve privacy review markers and save a transcript version if you make manual edits.
3. Click **Confirm transcript for analysis**.
4. Open **Meaning Units** and run the local AI flow.
5. Continue to **Categories** and **Reviewers**.

Old meaning units, categories, and reviewer comments are cleared when a new audio transcript is imported, because they belong to the previous transcript.
