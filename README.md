# GDIQR Qualitative Analysis Prototype

This is a GDIQR-specific qualitative analysis workspace backed by Supabase, local audio transcription, and Ollama analysis.

For non-technical demo setup, see: [DEMO_SETUP_GUIDE_FOR_NON_TECHNICAL_USER.md](DEMO_SETUP_GUIDE_FOR_NON_TECHNICAL_USER.md).

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

The supervisor can open the page, paste or upload a small transcript, and try segmentation, meaning-unit generation, categories, and reviewer checks. AI requests are processed through your local Next.js server and your local Ollama instance, so the supervisor's computer never needs `localhost:11434`.

Privacy reminder: because this is a local prototype, any transcript uploaded through the temporary link will be processed through the developer's local machine. Please use anonymised or test transcripts only. For this demo setup, prefer short transcript files or pasted text.

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
