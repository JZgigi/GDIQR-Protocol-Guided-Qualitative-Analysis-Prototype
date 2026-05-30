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

For Phase 1, keep:

```text
AI_PROVIDER=mock
```

For the later local AI phase:

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
git commit -m "Create phase 1 GDIQR prototype"
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
3. Add environment variable:

```text
AI_PROVIDER=mock
```

4. Deploy.

The Vercel demo will use mock data, so reviewers can open it without installing Ollama or Supabase.

## 5. Supabase Setup for Phase 2

Create a Supabase project, then collect:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

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
