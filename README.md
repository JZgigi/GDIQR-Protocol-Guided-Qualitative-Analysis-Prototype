# GDIQR Protocol-Guided Qualitative Analysis Prototype

This is a Phase 1 mock prototype for a GDIQR-specific qualitative analysis workspace. It demonstrates the intended end-to-end flow before connecting Supabase, local transcription, or a local LLM.

## Current Prototype Scope

- Project setup for one GDIQR study.
- Mock audio upload state.
- Editable English transcript.
- Segment overview with continuous meaning unit numbering.
- Editable Meaning Units + Summaries table.
- Mode A, Mode B, and Mode C category workflow.
- Reviewer agent panels.
- Mock export and audit trail.
- Mock API routes for future AI provider switching.

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
