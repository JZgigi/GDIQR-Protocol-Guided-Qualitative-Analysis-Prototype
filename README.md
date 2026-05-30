# GDIQR Qualitative Analysis Prototype

This is a GDIQR-specific qualitative analysis workspace. Phase 1 was a mock prototype; Phase 2 adds a Supabase-backed API layer while keeping mock fallback behavior for local demo use.

## Current Prototype Scope

- Project setup for one GDIQR study.
- Mock audio upload state.
- Editable English or Chinese transcript.
- Segment overview with continuous meaning unit numbering.
- Editable Meaning Units + Summaries table.
- Mode A, Mode B, and Mode C category workflow.
- Reviewer agent panels.
- Mock export and audit trail.
- Mock AI API routes for future AI provider switching.
- Supabase-backed workspace API for projects, transcripts, segments, meaning units, category systems, reviewer comments, and audit events.

## Planned Provider Strategy

The app is designed to support three AI modes:

- `mock`: default demo mode for Vercel.
- `ollama`: local model mode for development, planned for Phase 3.
- `external`: future API-compatible model service.

Recommended local models:

- Transcription: Whisper large-v3-turbo through faster-whisper.
- GDIQR analysis: Qwen3-8B through Ollama, with Qwen3-14B as the stronger local option.

## Useful Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

The local app will usually run at `http://localhost:3000`.

## Mock API Routes

```http
POST /api/ai/meaning-units
POST /api/ai/categories
POST /api/ai/reviewer
```

These routes currently return deterministic mock outputs so the interface can be demonstrated on Vercel without a live model.

## Phase 2 Supabase Routes

```http
GET /api/workspace
POST /api/transcript-versions
PATCH /api/meaning-units/:unitId
```

Run `supabase/phase2_schema.sql` in the Supabase SQL Editor, then fill `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GDIQR_DEFAULT_PROJECT_ID`. See `SUPABASE_PHASE2.md` for the Supabase dashboard checklist.

## Phase 3 Local AI

See `LOCAL_AI_PHASE3.md` for the Ollama setup path and the recommended order for replacing mock AI responses with a local provider.

For live local testing against remote Supabase data, use `LOCAL_AI_TESTING.md`.

For Chinese audio/transcript support, see `CHINESE_AUDIO_SUPPORT.md`.
