# GDI-QR-informed AI-Assisted Qualitative Analysis Prototype

This is an early MVP for exploring human-in-the-loop AI support for GDI-QR-informed qualitative analysis. It supports a researcher-led workflow for transcript preparation, segmentation, meaning unit generation, reviewer checking, category-level drafting, and export. AI outputs are draft material for researcher review, not final analysis.

For non-technical demo setup, see the local demo guide if it is available in your working copy.

## Current Prototype Scope

- Project setup for one GDI-QR-informed study.
- Transcript paste/file import for local-only shared demos.
- Optional Supabase-backed audio upload with local faster-whisper transcription when `STORAGE_MODE=supabase`.
- Editable English or Chinese transcript.
- Segment overview with reviewable boundaries and continuous meaning unit numbering.
- Editable Meaning Units + Summaries table.
- Mode A, Mode B, and Mode C category-level drafting workflow.
- Reviewer panels that flag possible grounding, fit, uncertainty, and over-interpretation issues.
- JSON, CSV, and TXT export from the current workspace.
- Ollama and local transcription provider flow for local testing.
- Configurable storage mode: local-only browser/session state by default, or Supabase-backed workspace APIs for longer testing.

## Methodological Note

In this project, GDI-QR is used as shorthand for the generic approach to descriptive-interpretive qualitative research, drawing on Elliott and Timulak's work. The prototype uses this as a methodological scaffold for bounded AI draft support; it should not be treated as a rigid automated protocol.

The reviewer layer does not decide whether an output is valid. It flags possible issues such as weak grounding, over-interpretation, uncertainty, or poor fit with the selected analysis stage, so the researcher can review and decide what to do next.

## Ethics And Data Protection

Do not upload identifiable, sensitive, confidential, counselling, psychotherapy, clinical, or client data unless you have the required consent, ethical approval, and data protection arrangements. For testing and demos, use anonymised or synthetic data.

This prototype is not currently approved for processing identifiable counselling, psychotherapy, clinical, or client records.

Transcript file and paste imports use a local-first review flow: the raw pasted/imported text is prepared for anonymisation before any database save. In default local-only mode, reviewed transcripts, segments, meaning units, categories, and reviewer notes stay in browser/session state and can be kept through JSON export. In Supabase-backed mode, only the reviewed/anonymised transcript should be saved by default. The app stores sensitive-item metadata without retaining original sensitive text. Audio upload is disabled in local-only mode because the current audio path stores raw audio before review; only enable audio in Supabase-backed mode with anonymised or ethically approved data.

The transcript page includes a deletion pathway for the active project transcript, uploaded audio records/files, segments, meaning units, categories, reviewer comments, and review-trail records.

RLS is enabled in the Supabase schema, but this local prototype currently uses a server-side service role key and does not implement per-user authentication or project ownership. Do not treat the temporary-link demo as a multi-user secure deployment. A production version should add Supabase Auth and owner-scoped RLS policies.

## Development Workflow

Development should happen on feature branches. Please do not commit directly to `main`. Open a pull request for review before merging.

## Planned Provider Strategy

The app currently uses local-first providers:

- `ollama`: local model mode for GDI-QR-informed draft support.
- `faster-whisper`: local audio transcription.
- `external`: future API-compatible model service.

Recommended local models:

- Transcription: faster-whisper `small` for quick local tests, or `large-v3-turbo` for stronger Chinese transcription.
- GDI-QR-informed draft support: Qwen3-8B through Ollama, with Qwen3-14B as the stronger local option.

## Useful Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

The local app will usually run at `http://localhost:3000`.

## Storage Mode

The prototype defaults to local-only mode:

```bash
STORAGE_MODE=local
NEXT_PUBLIC_APP_ENV=local
```

Local-only mode is intended for temporary-link demos and early ethical review. It does not write transcript data, segments, meaning units, categories, reviewer notes, or project setup changes to Supabase through the normal UI. The working copy lives in browser state while the app is open; use JSON export to keep a copy. Transcript preparation and AI generation still go through the local Next.js server and local Ollama instance, so raw transcript text is temporarily sent from the browser to your local server for processing.

Supabase-backed mode can be used for longer development testing:

```bash
STORAGE_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

In Supabase-backed mode, reviewed/anonymised transcripts and derived outputs can be persisted to Supabase. Do not enable this mode for identifiable or sensitive research data unless the project has appropriate consent, approval, access controls, retention rules, and deletion procedures.

## Sharing the local prototype with a temporary link

This prototype can be shared through ngrok or Cloudflare Tunnel while it still runs on your own computer. The supervisor does not need to install Ollama or this project. Their browser talks to your local Next.js server through the temporary link, and the Next.js API routes call the Ollama instance on your machine.

1. Start Ollama:

```bash
ollama serve
```

2. Make sure the configured model is installed:

```bash
ollama pull qwen3:8b
```

3. Check `.env.local` has local Ollama settings:

```bash
STORAGE_MODE=local
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

`OLLAMA_BASE_URL=http://localhost:11434/v1` also works for compatibility, but the shorter base URL is recommended.

4. Start the prototype:

```bash
npm run dev
```

The dev server is configured to allow common temporary tunnel hosts such as `*.ngrok-free.app`, `*.ngrok-free.dev`, `*.ngrok.app`, `*.ngrok.dev`, and `*.trycloudflare.com`. Restart `npm run dev` after changing `next.config.ts`.

5. Share it with ngrok:

```bash
ngrok http 3000
```

Or share it with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

6. Send the generated temporary HTTPS link to your supervisor.

The supervisor can open the page, paste or upload a small transcript file, and try segmentation, meaning-unit generation, categories, and reviewer checks. Audio upload is disabled in local-only sharing mode. AI requests are processed through your local Next.js server and your local Ollama instance, so the supervisor's computer never needs `localhost:11434`.

Privacy reminder: because this is a local prototype, any transcript uploaded through the temporary link will be processed through the developer's local machine. Please use anonymised, synthetic, or ethically approved test transcripts only. For this demo setup, prefer short transcript files or pasted text.

## API Routes

```http
POST /api/ai/meaning-units
POST /api/ai/categories
POST /api/ai/reviewer
POST /api/audio/transcribe
```

The AI routes require Ollama and run server-side. In local-only mode they use request-body workspace data and return results to browser state without saving to Supabase. The audio route is disabled in local-only mode; in Supabase-backed mode it stores the uploaded file in Supabase and calls a local faster-whisper script.

## Phase 2 Supabase Routes

```http
GET /api/workspace
POST /api/transcript-versions
PATCH /api/meaning-units/:unitId
```

Run `supabase/phase2_schema.sql` in the Supabase SQL Editor for a fresh setup, then fill `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GDIQR_DEFAULT_PROJECT_ID`. The `GDIQR_DEFAULT_PROJECT_ID` name is kept as a legacy internal environment variable for compatibility. See `SUPABASE_PHASE2.md` for the Supabase dashboard checklist.

## Phase 3 Local AI

See `LOCAL_AI_PHASE3.md` for the Ollama setup path.

For live local testing against remote Supabase data, use `LOCAL_AI_TESTING.md`.

For Chinese audio/transcript support, see `CHINESE_AUDIO_SUPPORT.md`.

For the upload-to-transcript setup, use `LOCAL_AUDIO_TESTING.md`.
