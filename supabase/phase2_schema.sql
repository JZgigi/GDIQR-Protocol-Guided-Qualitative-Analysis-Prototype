create extension if not exists pgcrypto;

create table if not exists public.projects (
  id text primary key default ('proj_' || replace(gen_random_uuid()::text, '-', '')),
  title text not null,
  research_question text not null default '',
  study_description text not null default '',
  language text not null default 'English' check (language in ('English', 'Chinese')),
  protocol text not null default 'GDIQR' check (protocol in ('GDIQR')),
  light_interpretation boolean not null default false,
  status text not null default 'Draft',
  updated_at timestamptz not null default now()
);

create table if not exists public.transcripts (
  id text primary key default ('tr_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  content text not null,
  version_label text not null default 'Initial transcript',
  created_at timestamptz not null default now()
);

create table if not exists public.segments (
  id text primary key default ('seg_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  case_id text not null,
  segment_id text not null,
  speaker_info text not null default '',
  start_timestamp text not null default '00:00',
  end_timestamp text not null default '00:00',
  starting_mu_number integer not null default 1,
  status text not null default 'Ready' check (status in ('Ready', 'Processed', 'Needs review')),
  text text not null
);

create table if not exists public.audio_files (
  id text primary key default ('audio_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  storage_bucket text not null default 'interview-audio',
  storage_path text not null,
  original_filename text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  language text not null default 'English' check (language in ('English', 'Chinese')),
  uploaded_at timestamptz not null default now()
);

create table if not exists public.transcription_jobs (
  id text primary key default ('txjob_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  audio_file_id text not null references public.audio_files(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  provider text not null default 'local-faster-whisper',
  language text not null default 'English' check (language in ('English', 'Chinese')),
  transcript_id text references public.transcripts(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.meaning_units (
  id text primary key default ('mu_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  segment_id text not null,
  case_id text not null,
  speaker text not null default '',
  unit_number integer not null,
  excerpt text not null,
  ai_summary text not null default '',
  human_summary text not null default '',
  tentative_interpretation text,
  uncertainty text,
  human_status text not null default 'Draft' check (human_status in ('Draft', 'Accepted', 'Edited', 'Needs review')),
  reviewer_status text not null default 'Not run' check (reviewer_status in ('Not run', 'Pass', 'Warning', 'Major issue')),
  updated_at timestamptz not null default now(),
  unique (project_id, unit_number)
);

create table if not exists public.category_systems (
  id text primary key default ('catsys_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  mode text not null default 'A' check (mode in ('A', 'B', 'C')),
  integrated_narrative text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key default ('cat_' || replace(gen_random_uuid()::text, '-', '')),
  category_system_id text not null references public.category_systems(id) on delete cascade,
  parent_category_id text references public.categories(id) on delete cascade,
  name text not null,
  definition text not null default '',
  included_unit_numbers integer[] not null default '{}',
  sort_order integer not null default 0
);

create table if not exists public.reviewer_comments (
  id text primary key default ('rev_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  agent text not null,
  target text not null,
  severity text not null default 'Pass' check (severity in ('Pass', 'Warning', 'Major issue')),
  comment text not null,
  suggested_action text not null default '',
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id text primary key default ('audit_' || replace(gen_random_uuid()::text, '-', '')),
  project_id text not null references public.projects(id) on delete cascade,
  event_timestamp timestamptz not null default now(),
  actor text not null check (actor in ('AI', 'Researcher', 'Reviewer')),
  action text not null,
  target text not null,
  created_at timestamptz not null default now()
);

create index if not exists transcripts_project_created_idx on public.transcripts(project_id, created_at desc);
create index if not exists segments_project_segment_idx on public.segments(project_id, segment_id);
create index if not exists audio_files_project_uploaded_idx on public.audio_files(project_id, uploaded_at desc);
create index if not exists transcription_jobs_project_created_idx on public.transcription_jobs(project_id, created_at desc);
create index if not exists transcription_jobs_audio_file_idx on public.transcription_jobs(audio_file_id);
create index if not exists meaning_units_project_number_idx on public.meaning_units(project_id, unit_number);
create index if not exists category_systems_project_created_idx on public.category_systems(project_id, created_at desc);
create index if not exists categories_system_parent_idx on public.categories(category_system_id, parent_category_id);
create index if not exists reviewer_comments_project_created_idx on public.reviewer_comments(project_id, created_at);
create index if not exists audit_events_project_time_idx on public.audit_events(project_id, event_timestamp);

alter table public.projects enable row level security;
alter table public.transcripts enable row level security;
alter table public.segments enable row level security;
alter table public.audio_files enable row level security;
alter table public.transcription_jobs enable row level security;
alter table public.meaning_units enable row level security;
alter table public.category_systems enable row level security;
alter table public.categories enable row level security;
alter table public.reviewer_comments enable row level security;
alter table public.audit_events enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.projects,
  public.transcripts,
  public.segments,
  public.audio_files,
  public.transcription_jobs,
  public.meaning_units,
  public.category_systems,
  public.categories,
  public.reviewer_comments,
  public.audit_events
to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('interview-audio', 'interview-audio', false, 524288000, array['audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a', 'video/mp4', 'application/octet-stream']),
  ('exports', 'exports', false, 104857600, array['application/json', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('transcript-versions', 'transcript-versions', false, 10485760, array['text/plain', 'application/json'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.projects (
  id,
  title,
  research_question,
  study_description,
  language,
  protocol,
  light_interpretation,
  status,
  updated_at
) values (
  'proj_student_wellbeing',
  'Untitled GDIQR project',
  '',
  '',
  'English',
  'GDIQR',
  false,
  'Ready for local testing',
  now()
) on conflict (id) do update set
  status = excluded.status;
