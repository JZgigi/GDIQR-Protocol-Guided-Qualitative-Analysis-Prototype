# Local AI Phase 3 Setup

This phase uses a local model provider while keeping the same Next.js API surface:

```http
POST /api/ai/meaning-units
POST /api/ai/categories
POST /api/ai/reviewer
```

## 1. Install Ollama

Install Ollama from:

```text
https://ollama.com/download
```

Then start the local service:

```bash
ollama serve
```

On macOS, the desktop app may already keep the service running at:

```text
http://localhost:11434
```

## 2. Pull the first local draft-support model

Start with the smaller model first:

```bash
ollama pull qwen3:8b
```

If your machine has enough memory and you want stronger draft-support output later:

```bash
ollama pull qwen3:14b
```

## 3. Set local environment variables

In `.env.local`, use:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:8b
```

Keep the Supabase variables from Phase 2:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

## 4. Smoke-test Ollama manually

```bash
curl http://localhost:11434/api/tags
```

You should see `qwen3:8b` in the model list.

## 5. Implementation order

Implemented first-pass sequence:

1. Use Ollama-compatible chat completion through `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
2. Update `src/app/api/ai/meaning-units/route.ts` first.
3. Parse model output with strict JSON validation before updating UI state.
4. Persist generated meaning units into `public.meaning_units`.
5. Repeat for categories and reviewer agents.

Use `LOCAL_AI_TESTING.md` for the current end-to-end test flow.

## 6. Supabase changes for local AI

No new Supabase tables are required just to start local AI text generation.

The next useful Supabase additions are:

- `ai_runs`: store prompt, provider, model, route, status, latency, and token estimates.
- `prompt_templates`: version prompts for GDI-QR-informed meaning units, category-level drafting, and reviewer checks.
- `audio_files` and `transcription_jobs`: track audio upload and local Whisper work.

Do not store raw service-role keys, local model logs, or sensitive transcript snippets in public client state.

## 7. Local transcription after text AI

Audio transcription, including Chinese audio, is now implemented for local testing:

```text
audio upload -> Supabase Storage -> transcription job -> local faster-whisper script -> transcript row
```

Recommended first local transcription model:

```text
Whisper large-v3-turbo through faster-whisper
```

The current implementation runs during the Next.js API request. For production or long interviews, move the transcription step to a background worker or queue.

For Chinese audio specifics, see `CHINESE_AUDIO_SUPPORT.md`.
