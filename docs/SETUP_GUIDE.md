# Setup Guide

Use this guide for local development and release/1.0 testing.

## 1. Install Dependencies

```bash
npm install
```

## 2. Create Local Environment File

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

## 3. Choose Storage Mode

### Local-only quick demo

```text
NEXT_PUBLIC_APP_ENV=local
STORAGE_MODE=local
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

Local-only mode does not persist project data to Supabase through the normal UI. Use JSON export if you need to keep a copy.

### Supabase-backed v1.0 testing

```text
NEXT_PUBLIC_APP_ENV=local
STORAGE_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

## 4. Configure Local AI

Baseline:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_API_TIMEOUT_MS=300000
OLLAMA_MU_BOUNDARY_MAX_TOKENS=1200
OLLAMA_MU_CHUNK_TIMEOUT_MS=120000
NEXT_PUBLIC_MU_JOB_TIMEOUT_MS=5400000
OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS=300000
NEXT_PUBLIC_TRANSCRIPT_PREPARE_TIMEOUT_MS=300000
TRANSCRIPT_PROCESS_CHUNK_CHARS=6000
TRANSCRIPT_MU_CHUNK_CHARS=1200
```

Start Ollama:

```bash
ollama serve
```

Install the model if needed:

```bash
ollama pull qwen3:8b
```

## 5. Optional Local Audio Transcription

Install faster-whisper:

```bash
python -m venv .venv
.venv\Scripts\python -m pip install faster-whisper
```

On macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install faster-whisper
```

Set:

```text
PYTHON_BIN=.venv/Scripts/python
WHISPER_MODEL=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
TRANSCRIPTION_TIMEOUT_MS=1800000
```

On macOS/Linux, use:

```text
PYTHON_BIN=.venv/bin/python
```

See [Local audio testing](LOCAL_AUDIO_TESTING.md) for the full flow.

## 6. Supabase Setup

Run the v1.0 SQL sequence in [Supabase v1.0 setup](SUPABASE_V1_0_SETUP.md).

Short version:

1. `supabase/phase2_schema.sql`
2. `supabase/phase3_segment_workflow.sql`
3. `supabase/audio_upload_transcription.sql`
4. `supabase/v1_0_foundation_schema.sql`
5. `supabase/v1_0_transcript_audio_review_schema.sql`

For a fresh default-project test reset:

```text
supabase/reset_default_project_empty.sql
```

## 7. Run The App

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 8. Verify Before Review

```bash
npm run typecheck
npm run build
```

## 9. Main Test Documents

- [v1.0 collaborator testing guide](RELEASE_1_0_TESTING_GUIDE.md)
- [Acceptance checklist](v1_0_acceptance_checklist.md)
- [Local AI testing](LOCAL_AI_TESTING.md)
- [Known technical debt and next steps](TECHNICAL_DEBT_AND_NEXT_STEPS.md)
