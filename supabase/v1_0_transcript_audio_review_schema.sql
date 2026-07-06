-- GDI-QR v1.0 transcript/audio review support.
-- Run after phase2_schema.sql, audio_upload_transcription.sql,
-- phase3_segment_workflow.sql, and v1_0_foundation_schema.sql.
-- This keeps original transcript/audio-derived text, prepared review text,
-- and confirmed transcript text separately for audit and export.

alter table public.transcripts
  add column if not exists status text not null default 'Needs Review',
  add column if not exists raw_content text,
  add column if not exists cleaned_content text,
  add column if not exists final_content text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists transcripts_project_status_created_idx
  on public.transcripts(project_id, status, created_at desc);

create index if not exists transcripts_project_updated_idx
  on public.transcripts(project_id, updated_at desc);
