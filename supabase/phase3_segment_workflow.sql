-- Phase 3 / segment workflow support.
-- Run this in Supabase SQL Editor when you are ready to preserve multiple
-- interviews/documents and a full project -> transcript -> segment hierarchy.
-- The app currently remains backward compatible with the Phase 2 tables.

create table if not exists public.interviews (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  title text not null,
  source_type text not null default 'transcript',
  source_file_id text,
  language text not null default 'English',
  status text not null default 'Draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transcripts
  add column if not exists interview_id text references public.interviews(id) on delete set null,
  add column if not exists status text not null default 'Needs Review',
  add column if not exists raw_content text,
  add column if not exists cleaned_content text,
  add column if not exists final_content text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.segments
  add column if not exists transcript_id text references public.transcripts(id) on delete cascade,
  add column if not exists segment_number integer,
  add column if not exists topic_label text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.meaning_units
  add column if not exists transcript_id text references public.transcripts(id) on delete cascade,
  add column if not exists light_interpretation boolean not null default false,
  add column if not exists uncertainty_note text,
  add column if not exists analysis_excluded boolean not null default false,
  add column if not exists exclusion_reason text;

alter table public.meaning_units
  drop constraint if exists meaning_units_human_status_check;

alter table public.meaning_units
  add constraint meaning_units_human_status_check
  check (human_status in ('Draft', 'Accepted', 'Edited', 'Needs review', 'Excluded'));

alter table public.reviewer_comments
  add column if not exists target_type text not null default 'analysis',
  add column if not exists target_id text,
  add column if not exists reviewer_agent_type text,
  add column if not exists issue_type text,
  add column if not exists issue_status text not null default 'unresolved',
  add column if not exists resolved_at timestamptz,
  add column if not exists researcher_memo text;

create table if not exists public.edit_logs (
  id text primary key,
  project_id text not null references public.projects(id) on delete cascade,
  interview_id text references public.interviews(id) on delete set null,
  transcript_id text references public.transcripts(id) on delete set null,
  target_type text not null,
  target_id text not null,
  actor text not null default 'Researcher',
  action text not null,
  before_value text,
  after_value text,
  created_at timestamptz not null default now()
);

create index if not exists interviews_project_id_idx
  on public.interviews(project_id);

create index if not exists transcripts_project_interview_idx
  on public.transcripts(project_id, interview_id);

create index if not exists segments_project_transcript_idx
  on public.segments(project_id, transcript_id, segment_number);

create index if not exists meaning_units_project_segment_idx
  on public.meaning_units(project_id, segment_id, unit_number);

create index if not exists edit_logs_project_target_idx
  on public.edit_logs(project_id, target_type, target_id);
