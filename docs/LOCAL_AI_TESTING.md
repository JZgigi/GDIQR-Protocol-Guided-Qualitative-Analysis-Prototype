# Local AI Testing And Tuning

Use this guide to test Ollama-backed AI behavior for `release/1.0`.

## 1. Baseline Configuration

Start with the `.env.example` defaults:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_API_TIMEOUT_MS=300000
OLLAMA_MU_MAX_TOKENS=1800
OLLAMA_MU_CHUNK_TIMEOUT_MS=120000
MU_DEMO_AI_TIMEOUT_MS=120000
NEXT_PUBLIC_MU_DEMO_AI_TIMEOUT_MS=120000
OLLAMA_CATEGORY_MAX_TOKENS=1800
OLLAMA_REVIEWER_MAX_TOKENS=1200
OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS=300000
NEXT_PUBLIC_TRANSCRIPT_PREPARE_TIMEOUT_MS=300000
OLLAMA_TRANSCRIPT_PROCESS_MAX_TOKENS=4096
TRANSCRIPT_PROCESS_CHUNK_CHARS=6000
TRANSCRIPT_MU_CHUNK_CHARS=1200
```

Start Ollama:

```bash
ollama serve
```

Confirm the model is installed:

```bash
ollama list
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/api/ai/health
```

Expected:

- `ollama.ok` is `true`.
- `supabase.configured` is `true` when testing in Supabase mode.

## 2. What Each Setting Does

| Setting | Purpose | First tuning move |
| --- | --- | --- |
| `OLLAMA_MODEL` | Model used for transcript prep, MU drafting, categories, and review. | Start with `qwen3:8b`; compare stronger models later. |
| `OLLAMA_API_TIMEOUT_MS` | General Ollama request timeout. | Keep at `300000` unless long runs fail. |
| `OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS` | Transcript preparation timeout. | Increase for long transcripts or bigger models. |
| `NEXT_PUBLIC_TRANSCRIPT_PREPARE_TIMEOUT_MS` | Browser request timeout for transcript preparation. | Keep equal to or slightly above server timeout. |
| `TRANSCRIPT_PROCESS_CHUNK_CHARS` | Transcript prep chunk size. | Reduce if JSON or privacy/speaker labelling fails. |
| `TRANSCRIPT_MU_CHUNK_CHARS` | MU generation chunk size. | Increase slowly on stronger GPUs; reduce if output drifts or times out. |
| `OLLAMA_MU_CHUNK_TIMEOUT_MS` | Server timeout for each MU generation chunk. | Increase if good outputs time out. |
| `MU_DEMO_AI_TIMEOUT_MS` | Meaning-unit API fallback timeout. | Increase for larger models; reduce for quick smoke checks. |
| `NEXT_PUBLIC_MU_DEMO_AI_TIMEOUT_MS` | Browser-side MU request timeout. | Keep aligned with `MU_DEMO_AI_TIMEOUT_MS`. |
| `OLLAMA_MU_MAX_TOKENS` | Maximum tokens for MU output. | Increase only if outputs are truncated. |
| `OLLAMA_CATEGORY_MAX_TOKENS` | Maximum tokens for category output. | Increase only if category JSON is truncated. |
| `OLLAMA_REVIEWER_MAX_TOKENS` | Maximum tokens for reviewer output. | Increase only if reviewer output is incomplete. |

## 3. RTX 5090-Class Lab Machine Plan

Do not immediately change every parameter. Use staged comparisons.

### Pass A: Baseline

```text
OLLAMA_MODEL=qwen3:8b
TRANSCRIPT_MU_CHUNK_CHARS=1200
OLLAMA_MU_CHUNK_TIMEOUT_MS=120000
MU_DEMO_AI_TIMEOUT_MS=120000
```

Record:

- transcript length,
- transcript preparation time,
- MU generation time,
- number of generated MUs,
- fallback use,
- JSON repair or parse errors,
- researcher-perceived MU boundary quality.

### Pass B: Larger Context

Only change:

```text
TRANSCRIPT_MU_CHUNK_CHARS=1800
```

Compare whether MU boundaries improve or whether outputs become too broad.

### Pass C: Longer Timeout

Only change:

```text
OLLAMA_MU_CHUNK_TIMEOUT_MS=240000
MU_DEMO_AI_TIMEOUT_MS=240000
NEXT_PUBLIC_MU_DEMO_AI_TIMEOUT_MS=240000
```

Use this if the model produces good output but times out.

### Pass D: Stronger Model

Only change:

```text
OLLAMA_MODEL=<larger-local-model>
```

Keep the same chunk and timeout settings for the first comparison. Then tune chunk size and timeouts if the stronger model is stable.

## 4. Quality Criteria

Do not judge model quality by fluent prose alone. Prefer outputs that:

- stay close to participant wording,
- avoid unsupported interpretation,
- preserve uncertainty,
- produce reviewable MU boundaries,
- keep category names grounded and parsimonious,
- make researcher review easier rather than more impressive-looking.

Watch for:

- broad MUs that combine several ideas,
- summaries that add causes or emotions not present in the transcript,
- categories that sound polished but are weakly grounded,
- reviewer outputs that imply validation instead of flagging possible issues,
- fallback drafts that are not clearly visible as fallback drafts.

## 5. Test Log Template

```text
Date:
Branch:
Commit:
Machine/GPU:
Ollama model:
Transcript source:
Transcript length:
TRANSCRIPT_PROCESS_CHUNK_CHARS:
TRANSCRIPT_MU_CHUNK_CHARS:
Timeout settings:
Transcript prep time:
MU generation time:
Category generation time:
Reviewer time:
Fallback used:
Errors:
Researcher quality notes:
Decision for next run:
```

## 6. Troubleshooting

### Ollama health check fails

Check:

```bash
ollama serve
ollama list
```

Then confirm `OLLAMA_BASE_URL=http://localhost:11434`.

### Meaning units fall back too quickly

Increase:

```text
OLLAMA_MU_CHUNK_TIMEOUT_MS
MU_DEMO_AI_TIMEOUT_MS
NEXT_PUBLIC_MU_DEMO_AI_TIMEOUT_MS
```

### Outputs are too broad or over-interpretive

Reduce:

```text
TRANSCRIPT_MU_CHUNK_CHARS
```

Then re-run the same transcript.

### JSON parse failures increase

Try one or more:

- reduce chunk size,
- reduce max tokens,
- use a stronger instruction-following model,
- keep the transcript test shorter for smoke checks.

### Browser request aborts before the server finishes

Increase the matching `NEXT_PUBLIC_*` timeout so the browser-side request does not end earlier than the server-side generation.

## 7. Relationship To Acceptance Testing

AI tuning is not a replacement for acceptance testing. After any parameter change that looks promising, run the relevant steps in [v1.0 collaborator testing guide](RELEASE_1_0_TESTING_GUIDE.md) and [acceptance checklist](v1_0_acceptance_checklist.md).
