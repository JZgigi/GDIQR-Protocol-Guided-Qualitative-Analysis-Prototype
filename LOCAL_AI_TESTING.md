# Local AI + Remote Supabase Testing

Use this checklist after setting:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:8b
```

## 1. Confirm services

Start Ollama:

```bash
ollama serve
```

Confirm the model exists:

```bash
ollama list
```

Start the app:

```bash
npm run dev
```

## 2. Check the integrated health endpoint

Open:

```text
http://localhost:3000/api/ai/health
```

Expected signals:

```json
{
  "aiProvider": "ollama",
  "ollama": {
    "ok": true
  },
  "supabase": {
    "dataSource": "supabase",
    "configured": true
  }
}
```

If `supabase.dataSource` is `mock`, check `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `GDIQR_DEFAULT_PROJECT_ID`.

If `ollama.ok` is `false`, check that Ollama is running and that `OLLAMA_BASE_URL` ends in `/v1`.

## 3. Test the UI flow

Open:

```text
http://localhost:3000
```

Then test in this order:

1. Click **Refresh API** and confirm the status says data loaded from Supabase.
2. Go to **Meaning Units** and click **Generate draft MUs**.
3. Confirm the status says the result was saved to Supabase.
4. Click **Refresh API** and confirm the generated meaning units remain.
5. Go to **Categories** and click **Run Mode A**, **Run Mode B**, or **Run Mode C**.
6. Click **Refresh API** and confirm the latest category system remains.
7. Go to **Reviewers** and click **Run reviewer agents**.
8. Click **Refresh API** and confirm reviewer comments remain.

## 4. What is persisted

The current implementation persists:

- Generated meaning units into `public.meaning_units`
- Generated category systems into `public.category_systems` and `public.categories`
- Generated reviewer comments into `public.reviewer_comments`
- Audit events into `public.audit_events`

Meaning-unit generation replaces the current project meaning units. Reviewer generation replaces the current project reviewer comments. Category generation creates a new category system, and the app loads the latest one.

## 5. Known testing limits

- The local model may occasionally return invalid JSON. The API will show an error instead of saving malformed output.
- Long transcripts may exceed the useful context window for `qwen3:8b`; test one segment at a time first.
- Local transcription is not wired yet. This test path starts from an existing transcript row in Supabase.
- Chinese transcripts are supported; direct Chinese audio transcription is the next worker step.

## 6. Next development step

After this test passes, add:

- `ai_runs` table for model run history and latency
- prompt versioning in `prompt_templates`
- segment-level batch processing for long interviews
- local faster-whisper transcription worker
