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

create index if not exists audio_files_project_uploaded_idx on public.audio_files(project_id, uploaded_at desc);
create index if not exists transcription_jobs_project_created_idx on public.transcription_jobs(project_id, created_at desc);
create index if not exists transcription_jobs_audio_file_idx on public.transcription_jobs(audio_file_id);

alter table public.audio_files enable row level security;
alter table public.transcription_jobs enable row level security;

grant select, insert, update, delete on
  public.audio_files,
  public.transcription_jobs
to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'interview-audio',
  'interview-audio',
  false,
  524288000,
  array[
    'audio/aac',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/wav',
    'audio/webm',
    'audio/x-m4a',
    'video/mp4',
    'application/octet-stream'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
