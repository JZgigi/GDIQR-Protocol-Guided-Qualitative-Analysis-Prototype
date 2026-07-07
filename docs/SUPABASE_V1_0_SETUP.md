# Supabase v1.0 Setup

Use this guide for `release/1.0` testing with Supabase-backed persistence.

## 1. Required Environment Variables

Create `.env.local` from `.env.example` and fill:

```text
STORAGE_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix it with `NEXT_PUBLIC_`.

## 2. SQL Migration Order

Run these files in Supabase SQL Editor in this exact order:

1. `supabase/phase2_schema.sql`
2. `supabase/phase3_segment_workflow.sql`
3. `supabase/audio_upload_transcription.sql`
4. `supabase/v1_0_foundation_schema.sql`
5. `supabase/v1_0_transcript_audio_review_schema.sql`

Why all five are required:

- `phase2_schema.sql` creates the original project, transcript, MU, category, reviewer, audit, and export tables.
- `phase3_segment_workflow.sql` adds interview and segment workflow support.
- `audio_upload_transcription.sql` adds audio file and transcription job records plus storage buckets.
- `v1_0_foundation_schema.sql` adds v1.0 project metadata, pre-analysis notes, integration relationships, integrity review, edit logs, export format support, and guidance memos.
- `v1_0_transcript_audio_review_schema.sql` adds transcript/audio review fields required by the v1.0 workflow.

## 3. Fresh Test Reset

After the migrations have run, reset the default test project:

```text
supabase/reset_default_project_empty.sql
```

This script resets only:

```text
proj_student_wellbeing
```

It does not delete other projects.

## 4. Storage Cleanup

Supabase blocks direct `delete from storage.objects` in SQL Editor. If a test needs uploaded files removed too:

1. Open the Supabase dashboard.
2. Go to `Storage`.
3. Open these buckets if they exist:
   - `interview-audio`
   - `exports`
   - `transcript-versions`
4. Delete the `proj_student_wellbeing/` folder or the objects inside it.

The database reset script clears the rows that reference uploaded files, but old file objects can remain in Storage until removed through the Storage UI or Storage API.

## 5. Quick Verification

Restart the app:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/api/workspace
```

Expected signals:

```json
{
  "dataSource": "supabase",
  "supabaseConfigured": true
}
```

Open:

```text
http://localhost:3000/api/ai/health
```

Expected:

- Supabase is configured.
- Ollama is reachable if `AI_PROVIDER=ollama`.

## 6. Common Problems

### `storage.objects` deletion is blocked

Cause: Supabase SQL Editor prevents direct deletion from storage tables.

Fix: Use the Storage dashboard or Storage API. Do not add direct `delete from storage.objects` back into the reset SQL.

### `guidance_memos` does not exist

Cause: `v1_0_foundation_schema.sql` has not been run, or it failed.

Fix: Re-run `v1_0_foundation_schema.sql`, then run the reset script.

### Export history misses CSV or TXT

Cause: The old `exports.format` constraint allowed only JSON/DOCX/PDF.

Fix: Re-run `v1_0_foundation_schema.sql`, which updates the check constraint to include `csv` and `txt`.

### Workspace loads as `unconfigured`

Check:

- `.env.local` has `STORAGE_MODE=supabase`.
- `NEXT_PUBLIC_SUPABASE_URL` is set.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set.
- `SUPABASE_SERVICE_ROLE_KEY` is set.
- The dev server was restarted after changing `.env.local`.

## 7. Security Note

The current Supabase-backed release test mode uses server-side service-role access through Next.js API routes. It is for controlled development and acceptance testing only. Before any production or multi-user deployment, add Supabase Auth, owner-scoped RLS policies, retention rules, and audited deletion procedures.
