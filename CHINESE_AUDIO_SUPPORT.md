# Chinese Audio Support

## Current Support

The app can support Chinese analysis once a Chinese transcript is available in Supabase.

Current tested path:

```text
Chinese transcript text -> Supabase transcript row -> Ollama AI routes -> meaning units/categories/reviewer comments
```

The local AI prompts pass the project language to the model, and the project schema now allows:

```text
English
Chinese
```

## What Is Not Wired Yet

Direct audio-to-text transcription is not implemented in the Next.js app yet.

That means Chinese audio files can be stored later, but the app does not yet automatically turn audio into transcript rows.

## Recommended Next Step

Add a local transcription worker:

```text
Supabase Storage interview-audio bucket
  -> transcription_jobs table
  -> local faster-whisper worker
  -> transcripts table
  -> existing Ollama analysis routes
```

Recommended model:

```text
faster-whisper large-v3-turbo
```

Recommended language mode for Chinese:

```text
language=zh
task=transcribe
```

## Manual Testing Before Worker Is Built

To test Chinese analysis now:

1. Put a Chinese transcript into `public.transcripts` for the current project.
2. Set `public.projects.language` to `Chinese`.
3. Open `http://localhost:3000`.
4. Click **Refresh API**.
5. Use **Generate draft MUs**, **Run Mode A/B/C**, and **Run reviewer agents**.

The generated outputs are saved back to Supabase.
