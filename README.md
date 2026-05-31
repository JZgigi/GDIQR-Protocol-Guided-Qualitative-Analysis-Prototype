# GDIQR Qualitative Analysis Prototype

This is a GDIQR-specific qualitative analysis workspace backed by Supabase, local audio transcription, and Ollama analysis.

## Current Prototype Scope

- Project setup for one GDIQR study.
- Real audio upload to Supabase Storage with local faster-whisper transcription.
- Editable English or Chinese transcript.
- Segment overview with continuous meaning unit numbering.
- Editable Meaning Units + Summaries table.
- Mode A, Mode B, and Mode C category workflow.
- Reviewer agent panels.
- JSON, CSV, and TXT export from the current workspace.
- Ollama and local transcription provider flow for local testing.
- Supabase-backed workspace API for projects, transcripts, segments, meaning units, category systems, reviewer comments, and audit events.

## Planned Provider Strategy

The app currently uses local-first providers:

- `ollama`: local model mode for GDIQR analysis.
- `faster-whisper`: local audio transcription.
- `external`: future API-compatible model service.

Recommended local models:

- Transcription: faster-whisper `small` for quick local tests, or `large-v3-turbo` for stronger Chinese transcription.
- GDIQR analysis: Qwen3-8B through Ollama, with Qwen3-14B as the stronger local option.

## Useful Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

The local app will usually run at `http://localhost:3000`.

## API Routes

```http
POST /api/ai/meaning-units
POST /api/ai/categories
POST /api/ai/reviewer
POST /api/audio/transcribe
```

The AI routes require Ollama; the audio route stores the uploaded file in Supabase and calls a local faster-whisper script.

## Phase 2 Supabase Routes

```http
GET /api/workspace
POST /api/transcript-versions
PATCH /api/meaning-units/:unitId
```

Run `supabase/phase2_schema.sql` in the Supabase SQL Editor for a fresh setup, then fill `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GDIQR_DEFAULT_PROJECT_ID`. See `SUPABASE_PHASE2.md` for the Supabase dashboard checklist.

## Phase 3 Local AI

See `LOCAL_AI_PHASE3.md` for the Ollama setup path.

For live local testing against remote Supabase data, use `LOCAL_AI_TESTING.md`.

For Chinese audio/transcript support, see `CHINESE_AUDIO_SUPPORT.md`.

For the upload-to-transcript setup, use `LOCAL_AUDIO_TESTING.md`.
