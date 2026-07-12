# v1.0 Collaborator Testing Guide

For the current Chinese end-to-end guide, see `docs/RELEASE_1_0_ACCEPTANCE_GUIDE_ZH.md`.

Use this guide when reviewing or executing the `release/1.0` test cycle. It assumes the project is being tested with open, anonymised, de-identified, or synthetic material only.

## 1. Testing Goal

The goal is to verify that a researcher can complete and recover a single-project GDI-QR-informed workflow:

1. Create or open a project.
2. Confirm data suitability.
3. Upload or import transcript/audio.
4. Review and confirm the transcript.
5. Complete Step 1 pre-analysis notes.
6. Generate, review, edit, accept, exclude, split, merge, and delete meaning units.
7. Build and refine categories.
8. Save integration relationships, narrative, and researcher memo.
9. Complete methodological integrity review.
10. Export the complete analysis record.
11. Refresh or reopen the project and confirm persisted work remains available.

The app should support researcher decisions, not replace researcher judgement. AI output must remain labelled and treated as draft support.

## 2. Required Branch And Local Checks

Start from:

```bash
git switch release/1.0
git pull --ff-only origin release/1.0
```

Before testing, verify:

```bash
npm install
npm run typecheck
npm run build
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 3. Environment Baseline

For Supabase-backed v1.0 testing:

```text
NEXT_PUBLIC_APP_ENV=local
STORAGE_MODE=supabase
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
PYTHON_BIN=python3
WHISPER_MODEL=small
WHISPER_DEVICE=auto
WHISPER_COMPUTE_TYPE=int8
TRANSCRIPTION_TIMEOUT_MS=1800000
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

Keep `SUPABASE_SERVICE_ROLE_KEY` out of browser-facing variables and out of commits.

## 4. Supabase Migration Order

Run these in Supabase SQL Editor in this order:

1. `supabase/phase2_schema.sql`
2. `supabase/phase3_segment_workflow.sql`
3. `supabase/audio_upload_transcription.sql`
4. `supabase/v1_0_foundation_schema.sql`
5. `supabase/v1_0_transcript_audio_review_schema.sql`

Then run the reset script before a fresh v1.0 acceptance pass:

```text
supabase/reset_default_project_empty.sql
```

Important: Supabase SQL Editor blocks direct deletion from `storage.objects`. The reset script clears database records only. To remove uploaded file objects as well, use the Supabase dashboard:

1. Open `Storage`.
2. Open each bucket: `interview-audio`, `exports`, `transcript-versions`.
3. Delete the `proj_student_wellbeing/` folder or objects inside it.

## 5. Health Checks

Start Ollama:

```bash
ollama serve
```

Make sure the model exists:

```bash
ollama list
```

Open:

```text
http://localhost:3000/api/ai/health
```

Expected:

- `ollama.ok` is `true`.
- `supabase.configured` is `true`.
- `supabase.dataSource` is `supabase`.

If Ollama fails, check `OLLAMA_BASE_URL` and model availability.

If Supabase fails, check `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GDIQR_DEFAULT_PROJECT_ID`.

## 6. Recommended Test Data

Use only:

- synthetic transcripts,
- open public sample text,
- anonymised or de-identified research material approved for this test,
- short audio files created specifically for testing.

Do not upload identifiable sensitive, confidential, counselling, psychotherapy, clinical, or client records.

For first-pass testing, use a short transcript with clear speaker labels:

```text
Interviewer: Can you tell me about your experience with the course?
Participant: I felt supported in the first weeks, but I struggled when deadlines overlapped.
Interviewer: What helped you manage that?
Participant: Talking with classmates helped. I also used the wellbeing service once.
```

## 7. End-to-End Test Script

Follow the detailed ticket checks in [v1.0 acceptance checklist](v1_0_acceptance_checklist.md). At minimum, execute this complete path:

1. Open the app and create a new project.
2. Fill title, research question, study description, dataset type, data source, and researcher notes.
3. Confirm data suitability.
4. Import or paste a transcript.
5. Run transcript preparation.
6. Review any privacy markers and speaker labels.
7. Save the reviewed transcript.
8. Confirm the transcript for analysis.
9. Fill and save Step 1 pre-analysis notes.
10. In Step 2, test speaker segmentation with labelled text.
11. Edit one segment label, role, and text.
12. Generate draft meaning units.
13. Edit one MU excerpt and summary.
14. Accept one MU.
15. Exclude one MU with a reason.
16. Add one manual MU.
17. Split and merge MUs.
18. Refresh the page and confirm MU decisions persist.
19. In Step 3, create and edit categories.
20. Assign accepted MUs to categories.
21. Confirm at least one category.
22. Refresh and confirm category edits persist.
23. In Step 4, generate or edit integration relationships.
24. Save integration draft, narrative, and researcher memo.
25. Refresh and confirm Step 4 content persists.
26. In Step 5, refresh methodological integrity items.
27. Add researcher responses and notes.
28. Save methodological integrity review.
29. Open the floating Voice Guide, ask at least one methodological question, verify that it redirects analytic-decision requests, and save one selected guidance note.
30. Save useful guidance as a memo.
31. Refresh and confirm saved guidance memo remains in the app and export.
32. Export JSON, CSV, TXT, DOCX, and printable report/PDF.
33. Refresh and confirm export history and audit trail include export actions.

## 8. AI Parameter Tuning

Start with the baseline in `.env.example`. Change one variable at a time and record the result.

Recommended first tuning order:

1. `OLLAMA_MODEL`
2. `TRANSCRIPT_MU_CHUNK_CHARS`
3. `OLLAMA_MU_CHUNK_TIMEOUT_MS`
4. `MU_DEMO_AI_TIMEOUT_MS`
5. `OLLAMA_MU_MAX_TOKENS`
6. `OLLAMA_CATEGORY_MAX_TOKENS`
7. `OLLAMA_REVIEWER_MAX_TOKENS`

For RTX 5090-class machines, test a stronger model after the qwen3:8b baseline. Record:

- model name,
- transcript length,
- chunk size,
- timeout values,
- generation time,
- fallback use,
- whether JSON repair was needed,
- MU boundary quality,
- category grounding,
- over-interpretation concerns,
- whether researcher review workload increased or decreased.

Do not judge better output only by fluency. Prefer outputs that stay close to participant wording, preserve uncertainty, and make researcher review easier.

## 9. Pass/Fail Criteria

Pass criteria:

- `npm run typecheck` passes.
- `npm run build` passes.
- Supabase migrations and reset script run without SQL errors.
- The full workflow can be completed without page crashes.
- Refresh/reopen does not lose saved project setup, transcript records, Step 1 notes, MUs, categories, integration content, integrity review, guidance memos, audit trail, or export history.
- Exports contain the expected project metadata, transcript records, analysis content, integrity review, guidance memos, audit trail, and export records.
- AI fallback states are visible and do not silently masquerade as final analysis.

Fail criteria:

- Data suitability can be bypassed for upload or analysis.
- Transcript analysis can proceed before researcher confirmation.
- Saved researcher edits disappear after refresh.
- Speaker split and auto split call the wrong route or produce indistinguishable behavior.
- Guidance memos disappear after refresh or export.
- Export history misses CSV/TXT/DOCX/PDF actions.
- Errors leave the UI stuck without a recoverable message.
- The app encourages final interpretation without researcher review.

## 10. Bug Report Template

Use this format when reporting issues:

```text
Branch:
Commit:
Storage mode:
Model:
Browser:
Test data type:
Step:
Expected:
Actual:
Can reproduce? yes/no
Console/server error:
Screenshot or export filename:
Supabase table checked:
Severity: P0/P1/P2/P3
```

Severity guide:

- P0: blocks release testing or risks data loss/privacy breach.
- P1: breaks a core v1.0 workflow or persistence guarantee.
- P2: degrades review quality, clarity, export completeness, or recovery.
- P3: polish, copy, layout, or non-blocking maintainability issue.

## 11. Known Follow-Up Work

These are not blockers for starting v1.0 acceptance, but they should be tracked:

- Split the large workspace component into smaller panels.
- Replace centralised `window.prompt`/`window.confirm` wrappers with in-page modals/forms.
- Add automated end-to-end tests for the full v1.0 flow.
- Add stronger AI run provenance: model, prompt version, timings, fallback reason, input/output references.
- Add owner-scoped authentication and RLS before any multi-user or production cloud deployment.
- Improve local-only audio so raw audio does not require Supabase-backed storage.
- Add stronger document export verification for DOCX/PDF.
