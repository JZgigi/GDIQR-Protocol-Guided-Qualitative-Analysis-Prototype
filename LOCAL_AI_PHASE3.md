# Local AI Phase 3 Setup

This phase replaces the deterministic mock AI route outputs with a local model provider while keeping the same Next.js API surface:

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

## 2. Pull the first local analysis model

Start with the smaller model first:

```bash
ollama pull qwen3:8b
```

If your machine has enough memory and you want stronger qualitative-analysis output later:

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

Recommended development sequence:

1. Add a provider switch in `src/lib/ai-provider.ts`.
2. Keep `mock` as the safe fallback provider.
3. Add an Ollama-compatible chat completion helper using `OLLAMA_BASE_URL` and `OLLAMA_MODEL`.
4. Update `src/app/api/ai/meaning-units/route.ts` first.
5. Parse model output with strict JSON validation before updating UI state.
6. Add persistence so generated meaning units can be inserted into `public.meaning_units`.
7. Repeat for categories and reviewer agents.

## 6. Supabase changes for local AI

No new Supabase tables are required just to start local AI text generation.

The next useful Supabase additions are:

- `ai_runs`: store prompt, provider, model, route, status, latency, and token estimates.
- `prompt_templates`: version prompts for GDIQR meaning units, category construction, and reviewers.
- `transcription_jobs`: track audio-to-text work when local Whisper is added.

Do not store raw service-role keys, local model logs, or sensitive transcript snippets in public client state.

## 7. Local transcription after text AI

For audio transcription, use a separate local service rather than blocking the Next.js request:

```text
audio upload -> Supabase Storage -> transcription job -> local faster-whisper worker -> transcript row
```

Recommended first local transcription model:

```text
Whisper large-v3-turbo through faster-whisper
```

This should be treated as a later Phase 3 subtask after the text-only Ollama flow is stable.
