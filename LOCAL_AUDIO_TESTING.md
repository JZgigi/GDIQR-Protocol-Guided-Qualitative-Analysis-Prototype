# Local Audio Testing

Use this when you want to upload your own interview audio locally and test against the real remote Supabase project.

## 1. Confirm Supabase

The remote project needs:

- Storage bucket: `interview-audio`
- Tables: `public.audio_files`, `public.transcription_jobs`
- Existing Phase 2 tables: `projects`, `transcripts`, `segments`, `meaning_units`, `category_systems`, `categories`, `reviewer_comments`, `audit_events`

For a fresh project, run:

```sql
supabase/phase2_schema.sql
```

For an existing Phase 2 project, run:

```sql
supabase/audio_upload_transcription.sql
```

This has already been applied to the current project `zlyukznrcujjvkcqifzw`.

## 2. Install Local Transcription

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install faster-whisper
```

If audio decoding fails on macOS:

```bash
brew install ffmpeg
```

## 3. Configure `.env.local`

Keep your existing Supabase and Ollama settings, then add:

```text
PYTHON_BIN=.venv/bin/python
WHISPER_MODEL=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
TRANSCRIPTION_TIMEOUT_MS=1800000
```

For stronger Chinese transcription, switch later to:

```text
WHISPER_MODEL=large-v3-turbo
```

## 4. Run The App

Start Ollama if you also want to run the analysis steps:

```bash
ollama serve
```

Start Next.js:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 5. Upload And Test

1. Go to **Upload**.
2. Select **English** or **Chinese**.
3. Choose an audio file: mp3, m4a, wav, mp4, webm, ogg, or aac.
4. Click **Upload and transcribe**.
5. Wait for the status to say the transcript was saved to Supabase.
6. Open **Transcript** and review the generated text.
7. Run **Generate draft MUs**, then Categories and Reviewers.

If transcription fails, the audio still remains in Supabase Storage and the failed job is recorded in `public.transcription_jobs` with the error message.

## 6. What Changes In Supabase

Successful upload creates:

- one object in `interview-audio`
- one row in `public.audio_files`
- one row in `public.transcription_jobs`
- one new transcript row in `public.transcripts`
- one replacement segment in `public.segments`
- one audit event

When a new transcript is imported, old meaning units, category systems, and reviewer comments are cleared so the next AI run uses the new audio-derived transcript only.
