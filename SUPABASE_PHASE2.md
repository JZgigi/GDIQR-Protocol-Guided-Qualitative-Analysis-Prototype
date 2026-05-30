# Supabase Phase 2 Setup

## 1. Run the schema SQL

Open the Supabase dashboard for the new project, go to **SQL Editor**, and run:

```text
supabase/phase2_schema.sql
```

This creates the Phase 2 tables, enables RLS, grants Data API access to `service_role`, creates the private Storage buckets, and seeds the demo project `proj_student_wellbeing`.

## 2. Add local environment variables

Create `.env.local` from `.env.example` and fill these values from **Project Settings > API**:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Do not prefix it with `NEXT_PUBLIC_`.

## 3. Storage buckets

The SQL creates these private buckets:

- `interview-audio`
- `exports`
- `transcript-versions`

Phase 2 currently stores transcript versions in the database table. The buckets are ready for the next step: audio upload, generated exports, and file-backed transcript snapshots.

## 4. Data API note for new projects

New Supabase projects may not expose newly created public tables to the Data API by default. The SQL includes explicit `GRANT` statements for `service_role`, which is what this Next.js server API uses.

For browser-side direct table access later, add authenticated-user policies first, then grant only the required table operations to `authenticated`.

## 5. Quick verification

After filling `.env.local`, restart Next.js and check:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/api/workspace
```

The JSON response should say:

```json
{
  "dataSource": "supabase",
  "supabaseConfigured": true
}
```
