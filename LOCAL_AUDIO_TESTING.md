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
OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS=300000
OLLAMA_TRANSCRIPT_PROCESS_MAX_TOKENS=4096
TRANSCRIPT_PROCESS_CHUNK_CHARS=6000
TRANSCRIPT_MU_CHUNK_CHARS=4500
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
5. Watch **AI / transcription activity** at the bottom of the page to see upload, faster-whisper, transcript chunk processing, and Supabase save timings.
6. Wait for the status to say the transcript was speaker-labelled, de-identified, and saved to Supabase.
7. Open **Transcript** and review the generated text. It should use `Interviewer:` and `Participant:` labels.
8. Resolve privacy review markers such as `[[PRIVACY_REVIEW:PERSON:Sam]]`, edit recognition errors, then click **Confirm transcript for analysis**.
9. Run **Generate draft MUs**, then Categories and Reviewers.

If you already have a transcript, use **Import existing transcript** on the same Upload page. Paste text or choose a `.txt`, `.md`, `.vtt`, or `.srt` file, then click **Import transcript**. The same speaker labelling and de-identification step runs before saving to Supabase.

If transcription fails, the audio still remains in Supabase Storage and the failed job is recorded in `public.transcription_jobs` with the error message.

## 6. What Changes In Supabase

Successful upload creates:

- one object in `interview-audio`
- one row in `public.audio_files`
- one row in `public.transcription_jobs`
- one new transcript row in `public.transcripts`
- one replacement segment in `public.segments`
- one audit event

The saved transcript is the Ollama-prepared version, not the raw faster-whisper output. The preparation step detects likely person names, places, organizations, contact details, IDs, and other identifying details. High-confidence identifiers are replaced with bracket placeholders such as `[PERSON_1]` or `[LOCATION_1]`; uncertain items are kept inline as review markers such as `[[PRIVACY_REVIEW:PERSON:Sam]]` so you can manually decide whether to remove them.

Long transcripts are split into chunks before privacy/speaker processing. If Ollama returns an empty chunk, the app records it in the live log and uses a conservative local fallback for that chunk instead of failing the entire upload.

When a new transcript is imported, old meaning units, category systems, and reviewer comments are cleared so the next AI run uses the new audio-derived transcript only. Meaning-unit generation also runs in transcript chunks and reports each chunk in the live log panel.
