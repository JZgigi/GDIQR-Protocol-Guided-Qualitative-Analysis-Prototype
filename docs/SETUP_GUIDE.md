# Setup Guide

## 1. Install Local Dependencies

Install Node.js dependencies from the project folder:

```bash
npm install
```

Then start the local prototype:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## 2. Environment Variables

Copy `.env.example` to `.env.local` when you are ready to run locally:

```bash
cp .env.example .env.local
```

Use Ollama for local AI:

```text
AI_PROVIDER=ollama
```

For Phase 2 Supabase persistence, also fill:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
GDIQR_DEFAULT_PROJECT_ID=proj_student_wellbeing
```

For the local AI phase:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:8b
```

## 3. GitHub Setup

From this folder:

```bash
git init
git add .
git commit -m "Create phase 1 GDI-QR-informed prototype"
```

Create an empty GitHub repository, then connect it:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

## 4. Vercel Setup

1. Go to Vercel and import the GitHub repository.
2. Choose the default Next.js settings.
3. Add the same Supabase and Ollama-facing environment variables you use locally, or deploy only after you have an external AI/transcription provider.

4. Deploy.

For local AI setup after Phase 2 is stable, see `LOCAL_AI_PHASE3.md`.

## 5. Supabase Setup for Phase 2

Create a Supabase project, then collect:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Then run `supabase/phase2_schema.sql` in the Supabase SQL Editor. The SQL creates the first tables, enables RLS, grants server-side Data API access, creates Storage buckets, and creates an empty default project.

Planned storage buckets:

- `interview-audio`
- `exports`
- `transcript-versions`

Planned first tables:

- `projects`
- `transcripts`
- `segments`
- `meaning_units`
- `category_systems`
- `categories`
- `reviewer_comments`
- `edit_logs`
- `exports`
