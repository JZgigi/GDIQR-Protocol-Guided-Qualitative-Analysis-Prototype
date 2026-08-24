# GDI-QR-informed AI-Assisted Qualitative Analysis Prototype

This repository contains a researcher-led prototype for GDI-QR-informed qualitative analysis. The app supports project setup, transcript/audio preparation, segmentation, meaning-unit review, category development, integration, methodological integrity checks, and export.

AI output is always draft support for researcher review. It must not be treated as final coding, final interpretation, or methodological validation.

## Current Release Branch

Active release branch: `release/1.0`

The v1.0 research release is intended for controlled testing with open, anonymised, de-identified, or synthetic data. It is not a production deployment for identifiable sensitive, counselling, psychotherapy, clinical, or client records.

Start here for release testing and setup:

- [Documentation index](docs/README.md)
- [v1.0 中文验收指南](docs/RELEASE_1_0_ACCEPTANCE_GUIDE_ZH.md)
- [v1.0 collaborator testing guide](docs/RELEASE_1_0_TESTING_GUIDE.md)
- [Supabase v1.0 setup](docs/SUPABASE_V1_0_SETUP.md)
- [Acceptance checklist](docs/v1_0_acceptance_checklist.md)
- [Known technical debt and next steps](docs/TECHNICAL_DEBT_AND_NEXT_STEPS.md)

## Main Capabilities

- Project setup with data-suitability confirmation.
- Supabase-backed project persistence for v1.0 testing.
- Transcript import, preparation, privacy review, save, and confirmation.
- Optional audio upload and local faster-whisper transcription in Supabase-backed testing mode.
- Speaker and segment handling, including separate auto-split and speaker-split routes.
- Meaning-unit generation, manual review, edit, accept, exclude, split, merge, and delete flows.
- Category drafting and researcher-led refinement.
- Integration relationships, narrative, and researcher memo persistence.
- Methodological integrity checklist, reviewer issues, audit trail, and export history.
- JSON, CSV, TXT, DOCX, and printable report/PDF-oriented export flows.
- Local Ollama-based AI support with configurable timeout and chunk settings.

## Quick Start

Install dependencies:

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env.local
```

Start the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Run verification before pushing changes:

```bash
npm run typecheck
npm run build
```

## Storage Modes

Use local-only mode for quick demos that should not write project data to Supabase:

```text
STORAGE_MODE=local
NEXT_PUBLIC_APP_ENV=local
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
```

Use Supabase-backed mode for release/1.0 acceptance testing:

```text
STORAGE_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not expose it in browser code or commit it to the repository.

## Supabase Migration Order

If the five migrations have already been run, Batch 0–6 need no new SQL migration. Use `supabase/verify_v1_0_schema.sql` for a read-only check.

For a fresh or rebuilt v1.0 test database, run these SQL files in Supabase SQL Editor:

1. `supabase/phase2_schema.sql`
2. `supabase/phase3_segment_workflow.sql`
3. `supabase/audio_upload_transcription.sql`
4. `supabase/v1_0_foundation_schema.sql`
5. `supabase/v1_0_transcript_audio_review_schema.sql`
6. `supabase/step2_meaning_unit_semantics.sql`
7. `supabase/stage3_category_grouping_integrity.sql`

To reset only the default v1.0 test project after migrations:

```text
supabase/reset_default_project_empty.sql
```

Supabase SQL Editor does not allow direct deletion from `storage.objects`. If uploaded files also need to be removed, delete the `proj_student_wellbeing/` folder from the relevant Storage buckets in the Supabase dashboard, or use the Storage API with a service role script.

## Local AI Baseline

Recommended starting settings:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:8b
OLLAMA_API_TIMEOUT_MS=300000
OLLAMA_MU_BOUNDARY_MAX_TOKENS=1200
OLLAMA_MU_CHUNK_TIMEOUT_MS=120000
OLLAMA_CATEGORY_MAX_TOKENS=3600
OLLAMA_CATEGORY_BATCH_SIZE=30
NEXT_PUBLIC_MU_JOB_TIMEOUT_MS=5400000
OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS=300000
NEXT_PUBLIC_TRANSCRIPT_PREPARE_TIMEOUT_MS=300000
TRANSCRIPT_PROCESS_CHUNK_CHARS=6000
TRANSCRIPT_MU_WINDOW_CHARS=6000
```

For stronger lab machines, including RTX 5090-class machines, change one variable at a time and record latency, fallback use, output quality, and whether researcher review remains manageable. See [Local AI testing](docs/LOCAL_AI_TESTING.md).

## Development Workflow

Development should happen on feature branches. Do not commit directly to `main`. For release fixes:

```bash
git switch release/1.0
git pull --ff-only origin release/1.0
git switch -c feature/your-feature-name
```

After review, prefer fast-forward merging when the feature branch is based directly on the latest release branch:

```bash
git switch release/1.0
git merge --ff-only feature/your-feature-name
git push origin release/1.0
```

## Current Maintainability Notes

The largest known code maintainability issue is the monolithic workspace component:

```text
src/components/gdiqr-workspace.tsx
```

It should be split after v1.0 validation into smaller panels such as `ProjectSetupPanel`, `TranscriptReviewPanel`, `MeaningUnitPanel`, `CategoryPanel`, `IntegrationPanel`, `IntegrityPanel`, and `ExportPanel`. This is intentionally documented as follow-up work rather than mixed into final acceptance fixes.
