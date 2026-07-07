-- GDI-QR v1.0 foundation schema.
-- Run after phase2_schema.sql and phase3_segment_workflow.sql.
-- This migration creates the durable data model needed for project creation,
-- Step 1 persistence, integration relationships, integrity review, edit logs,
-- and export tracking.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Project metadata and data suitability confirmation
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists dataset_type text not null default 'open',
  add column if not exists data_source text not null default 'other',
  add column if not exists data_suitability_confirmed boolean not null default false,
  add column if not exists data_suitability_confirmed_at timestamptz,
  add column if not exists researcher_notes text not null default '',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.projects
    add constraint projects_dataset_type_check
    check (dataset_type in ('open', 'anonymised', 'identifiable_sensitive'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.projects
    add constraint projects_data_source_check
    check (data_source in ('SMARTEN', 'photovoice', 'interview', 'other'));
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Step 1: pre-analysis notes
-- ---------------------------------------------------------------------------

create table if not exists public.pre_analysis_notes (
  id text primary key default ('pre_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  research_question text not null default '',
  study_description text not null default '',
  researcher_position text not null default '',
  contextual_notes text not null default '',
  initial_sensitising_concepts text not null default '',
  data_familiarisation_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

-- ---------------------------------------------------------------------------
-- Step 3/4 support: richer categories and integration relationships
-- ---------------------------------------------------------------------------

alter table public.category_systems
  add column if not exists integration_memo text not null default '',
  add column if not exists updated_at timestamptz not null default now();

alter table public.categories
  add column if not exists memo text not null default '',
  add column if not exists status text not null default 'ai_draft',
  add column if not exists source text not null default 'ai',
  add column if not exists intentionally_uncategorised_unit_numbers integer[] not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  alter table public.categories
    add constraint categories_status_check
    check (status in ('ai_draft', 'fallback_draft', 'needs_review', 'edited', 'confirmed', 'rejected'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.categories
    add constraint categories_source_check
    check (source in ('ai', 'fallback', 'researcher_confirmed'));
exception when duplicate_object then null;
end $$;

create table if not exists public.integration_relationships (
  id text primary key default ('rel_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  category_system_id text references public.category_systems(id) on delete cascade,
  source_category_id text not null references public.categories(id) on delete cascade,
  target_category_id text not null references public.categories(id) on delete cascade,
  relationship_label text not null default 'unclear relationship',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_category_id <> target_category_id),
  check (relationship_label in (
    'contributes to',
    'contrasts with',
    'supports',
    'explains',
    'is part of',
    'leads to',
    'contextualises',
    'unclear relationship'
  ))
);

-- ---------------------------------------------------------------------------
-- Step 5: methodological integrity review
-- ---------------------------------------------------------------------------

create table if not exists public.integrity_reviews (
  id text primary key default ('intrev_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  overall_status text not null default 'not_started',
  reviewer_summary text not null default '',
  researcher_response text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id),
  check (overall_status in ('not_started', 'in_progress', 'issues_found', 'ready_for_export'))
);

create table if not exists public.integrity_review_items (
  id text primary key default ('intitem_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  review_id text references public.integrity_reviews(id) on delete cascade,
  check_key text not null,
  prompt text not null,
  status text not null default 'not_checked',
  response text not null default '',
  researcher_note text not null default '',
  generated_from_state boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, check_key),
  check (status in ('not_checked', 'pass', 'issue', 'resolved', 'dismissed'))
);

-- ---------------------------------------------------------------------------
-- Research-grade audit/edit logs
-- ---------------------------------------------------------------------------

alter table public.audit_events
  add column if not exists step text,
  add column if not exists action_type text,
  add column if not exists target_type text,
  add column if not exists target_id text,
  add column if not exists previous_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists researcher_note text;

create table if not exists public.edit_logs (
  id text primary key default ('edit_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  interview_id text references public.interviews(id) on delete set null,
  transcript_id text references public.transcripts(id) on delete set null,
  step text not null default 'pre-analysis',
  target_type text not null,
  target_id text not null,
  actor text not null default 'Researcher',
  action_type text not null default 'other',
  action text not null,
  before_value text,
  after_value text,
  previous_value jsonb,
  new_value jsonb,
  researcher_note text,
  created_at timestamptz not null default now()
);

alter table public.edit_logs
  alter column id set default ('edit_' || replace(gen_random_uuid()::text, '-', '')),
  add column if not exists step text not null default 'pre-analysis',
  add column if not exists action_type text not null default 'other',
  add column if not exists previous_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists researcher_note text;

-- ---------------------------------------------------------------------------
-- Export tracking
-- ---------------------------------------------------------------------------

create table if not exists public.exports (
  id text primary key default ('export_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  format text not null check (format in ('json', 'csv', 'txt', 'docx', 'pdf')),
  storage_bucket text,
  storage_path text,
  generated_at timestamptz not null default now()
);

alter table public.exports
  drop constraint if exists exports_format_check;

alter table public.exports
  add constraint exports_format_check
  check (format in ('json', 'csv', 'txt', 'docx', 'pdf'));

create table if not exists public.guidance_memos (
  id text primary key default ('guide_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  step text not null,
  question text not null default '',
  answer text not null default '',
  created_at timestamptz not null default now(),
  check (step in ('pre-analysis', 'understanding', 'categorizing', 'integrating', 'integrity', 'export'))
);

-- ---------------------------------------------------------------------------
-- Indexes, RLS, and service role grants
-- ---------------------------------------------------------------------------

create index if not exists pre_analysis_notes_project_idx
  on public.pre_analysis_notes(project_id);

create index if not exists integration_relationships_project_idx
  on public.integration_relationships(project_id, category_system_id);

create index if not exists integration_relationships_category_idx
  on public.integration_relationships(source_category_id, target_category_id);

create index if not exists integrity_reviews_project_idx
  on public.integrity_reviews(project_id);

create index if not exists integrity_review_items_project_idx
  on public.integrity_review_items(project_id, status);

create index if not exists edit_logs_project_created_idx
  on public.edit_logs(project_id, created_at desc);

create index if not exists audit_events_project_action_idx
  on public.audit_events(project_id, action_type, event_timestamp desc);

create index if not exists exports_project_generated_idx
  on public.exports(project_id, generated_at desc);

create index if not exists guidance_memos_project_created_idx
  on public.guidance_memos(project_id, created_at desc);

alter table public.pre_analysis_notes enable row level security;
alter table public.integration_relationships enable row level security;
alter table public.integrity_reviews enable row level security;
alter table public.integrity_review_items enable row level security;
alter table public.edit_logs enable row level security;
alter table public.exports enable row level security;
alter table public.guidance_memos enable row level security;

grant select, insert, update, delete on
  public.pre_analysis_notes,
  public.integration_relationships,
  public.integrity_reviews,
  public.integrity_review_items,
  public.edit_logs,
  public.exports,
  public.guidance_memos
to service_role;
