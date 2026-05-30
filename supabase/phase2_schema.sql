create extension if not exists pgcrypto;

create table if not exists public.projects (
  id text primary key default ('proj_' || replace(gen_random_uuid()::text, '-', '')),
  title text not null,
  research_question text not null default '',
  study_description text not null default '',
  language text not null default 'English' check (language in ('English')),
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
create index if not exists meaning_units_project_number_idx on public.meaning_units(project_id, unit_number);
create index if not exists category_systems_project_created_idx on public.category_systems(project_id, created_at desc);
create index if not exists categories_system_parent_idx on public.categories(category_system_id, parent_category_id);
create index if not exists reviewer_comments_project_created_idx on public.reviewer_comments(project_id, created_at);
create index if not exists audit_events_project_time_idx on public.audit_events(project_id, event_timestamp);

alter table public.projects enable row level security;
alter table public.transcripts enable row level security;
alter table public.segments enable row level security;
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
  public.meaning_units,
  public.category_systems,
  public.categories,
  public.reviewer_comments,
  public.audit_events
to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('interview-audio', 'interview-audio', false, 524288000, array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a']),
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
  'Student Well-being Interview Study',
  'How do students describe their experiences of brief mindfulness practice and peer support?',
  'Prototype demo project using a short English interview excerpt for GDIQR-guided analysis.',
  'English',
  'GDIQR',
  false,
  'Supabase workspace ready',
  '2026-05-29 00:00:00+00'
) on conflict (id) do update set
  title = excluded.title,
  research_question = excluded.research_question,
  study_description = excluded.study_description,
  light_interpretation = excluded.light_interpretation,
  status = excluded.status,
  updated_at = excluded.updated_at;

insert into public.transcripts (id, project_id, content, version_label, created_at)
values (
  'tr_demo_initial',
  'proj_student_wellbeing',
  'Interviewer: Can you tell me what it was like to try the brief mindfulness practice during the week?

Participant: At first I thought it would be a bit pointless because it was only five minutes. But when I did it before studying, it helped me pause instead of jumping straight into panic. I still got distracted, but I noticed it sooner.

Interviewer: What role did peer support play for you?

Participant: The group chat made it easier to actually do it. If someone posted that they had done the practice, I felt a little push to try as well. But sometimes it also felt like another thing I was failing at when I missed a day.

Interviewer: Did anything change by the end?

Participant: I would not say it fixed my stress. It was more like I had one small thing I could do before everything got too much. Talking to others helped me feel less weird about struggling.',
  'Initial demo transcript',
  '2026-05-29 18:38:00+00'
) on conflict (id) do update set
  content = excluded.content,
  version_label = excluded.version_label,
  created_at = excluded.created_at;

insert into public.segments (
  id,
  project_id,
  case_id,
  segment_id,
  speaker_info,
  start_timestamp,
  end_timestamp,
  starting_mu_number,
  status,
  text
) values (
  'seg_001',
  'proj_student_wellbeing',
  'CASE-001',
  'SEG-001',
  'Interviewer, Participant',
  '00:00',
  '02:14',
  1,
  'Processed',
  (select content from public.transcripts where id = 'tr_demo_initial')
) on conflict (id) do update set
  text = excluded.text,
  status = excluded.status;

insert into public.meaning_units (
  id,
  project_id,
  segment_id,
  case_id,
  speaker,
  unit_number,
  excerpt,
  ai_summary,
  human_summary,
  uncertainty,
  human_status,
  reviewer_status
) values
  ('mu_001', 'proj_student_wellbeing', 'SEG-001', 'CASE-001', 'Participant', 1, 'At first I thought it would be a bit pointless because it was only five minutes.', 'initial doubt; five minutes seemed pointless', 'initial doubt; five minutes seemed pointless', null, 'Accepted', 'Pass'),
  ('mu_002', 'proj_student_wellbeing', 'SEG-001', 'CASE-001', 'Participant', 2, 'when I did it before studying, it helped me pause instead of jumping straight into panic', 'used before studying; paused before panic', 'used before studying; paused before panic', null, 'Edited', 'Pass'),
  ('mu_003', 'proj_student_wellbeing', 'SEG-001', 'CASE-001', 'Participant', 3, 'I still got distracted, but I noticed it sooner.', 'still distracted; noticed distraction sooner', 'still distracted; noticed distraction sooner', null, 'Accepted', 'Pass'),
  ('mu_004', 'proj_student_wellbeing', 'SEG-001', 'CASE-001', 'Participant', 4, 'The group chat made it easier to actually do it. If someone posted that they had done the practice, I felt a little push to try as well.', 'group chat encouraged practice; others'' posts gave a push', 'group chat encouraged practice; others'' posts gave a push', null, 'Accepted', 'Pass'),
  ('mu_005', 'proj_student_wellbeing', 'SEG-001', 'CASE-001', 'Participant', 5, 'sometimes it also felt like another thing I was failing at when I missed a day.', 'missed days felt like another failure', 'missed days felt like another failure', 'Check whether this refers to the practice itself or social comparison in the chat.', 'Needs review', 'Warning'),
  ('mu_006', 'proj_student_wellbeing', 'SEG-001', 'CASE-001', 'Participant', 6, 'I would not say it fixed my stress. It was more like I had one small thing I could do before everything got too much.', 'did not fix stress; small action before overwhelm', 'did not fix stress; small action before overwhelm', null, 'Accepted', 'Pass'),
  ('mu_007', 'proj_student_wellbeing', 'SEG-001', 'CASE-001', 'Participant', 7, 'Talking to others helped me feel less weird about struggling.', 'talking to others normalised struggling', 'talking to others helped struggling feel less unusual', null, 'Edited', 'Pass')
on conflict (id) do update set
  ai_summary = excluded.ai_summary,
  human_summary = excluded.human_summary,
  uncertainty = excluded.uncertainty,
  human_status = excluded.human_status,
  reviewer_status = excluded.reviewer_status;

insert into public.category_systems (id, project_id, mode, integrated_narrative, created_at)
values (
  'catsys_demo_c',
  'proj_student_wellbeing',
  'C',
  'Draft integrated narrative for researcher review: In this case, brief mindfulness practice is described as a small but usable interruption before stress escalates, rather than as a complete solution. Peer support appears to make practice more likely and helps the participant feel less alone in struggling, but it can also introduce pressure when practice is missed. The central tension is that shared accountability can be supportive and burdensome at the same time. Interpretation is limited by the short excerpt and should be checked against the full transcript.',
  '2026-05-29 18:50:00+00'
) on conflict (id) do update set
  integrated_narrative = excluded.integrated_narrative,
  created_at = excluded.created_at;

insert into public.categories (
  id,
  category_system_id,
  parent_category_id,
  name,
  definition,
  included_unit_numbers,
  sort_order
) values
  ('cat_001', 'catsys_demo_c', null, 'Small practices as interruption before overwhelm', 'Participants describe brief practice as a modest, practical pause rather than a complete solution.', array[1, 2, 3, 6], 10),
  ('cat_002', 'catsys_demo_c', null, 'Peer contact as encouragement and pressure', 'Peer interaction supports practice and normalises difficulty, while also creating possible pressure.', array[4, 5, 7], 20),
  ('cat_001_a', 'catsys_demo_c', 'cat_001', 'Initial doubt about usefulness', 'The practice initially appears too brief to be meaningful.', array[1], 11),
  ('cat_001_b', 'catsys_demo_c', 'cat_001', 'Pause and noticing', 'The practice supports pausing and earlier noticing of distraction or panic.', array[2, 3, 6], 12),
  ('cat_002_a', 'catsys_demo_c', 'cat_002', 'Encouragement through shared action', 'Seeing others participate makes it easier to attempt the practice.', array[4], 21),
  ('cat_002_b', 'catsys_demo_c', 'cat_002', 'Pressure when missing practice', 'Missed practice can be experienced as another failure.', array[5], 22),
  ('cat_002_c', 'catsys_demo_c', 'cat_002', 'Normalising struggle', 'Talking with peers makes stress feel less isolating or unusual.', array[7], 23)
on conflict (id) do update set
  name = excluded.name,
  definition = excluded.definition,
  included_unit_numbers = excluded.included_unit_numbers,
  sort_order = excluded.sort_order;

insert into public.reviewer_comments (
  id,
  project_id,
  agent,
  target,
  severity,
  comment,
  suggested_action,
  resolved,
  created_at
) values
  ('rev_001', 'proj_student_wellbeing', 'GDIQR Rule Compliance Reviewer', 'Meaning Units + Summaries', 'Pass', 'The output stays within meaning unit and summary work without creating categories.', 'No change needed.', true, '2026-05-29 18:46:00+00'),
  ('rev_002', 'proj_student_wellbeing', 'Coverage Reviewer', 'MU 5', 'Warning', 'The emotional shift around missing a day may need a separate researcher check.', 'Review the original transcript around MU 5 before accepting the summary.', false, '2026-05-29 18:47:00+00'),
  ('rev_003', 'proj_student_wellbeing', 'Interpretation Boundary Reviewer', 'Category narrative', 'Pass', 'The draft avoids diagnostic language and does not claim a causal mechanism.', 'Keep integrated narrative labelled as draft for review.', true, '2026-05-29 18:48:00+00'),
  ('rev_004', 'proj_student_wellbeing', 'Category Coherence Reviewer', 'Current category system', 'Warning', 'The peer support category contains both encouragement and pressure; this is coherent if kept as a tension.', 'Make the tension explicit in Mode C rather than splitting too aggressively.', false, '2026-05-29 18:49:00+00')
on conflict (id) do update set
  comment = excluded.comment,
  suggested_action = excluded.suggested_action,
  resolved = excluded.resolved;

insert into public.audit_events (
  id,
  project_id,
  event_timestamp,
  actor,
  action,
  target
) values
  ('audit_001', 'proj_student_wellbeing', '2026-05-29 18:40:00+00', 'Researcher', 'Created project with GDIQR protocol', 'Project setup'),
  ('audit_002', 'proj_student_wellbeing', '2026-05-29 18:44:00+00', 'AI', 'Generated draft meaning units and concise summaries', 'SEG-001'),
  ('audit_003', 'proj_student_wellbeing', '2026-05-29 18:47:00+00', 'Reviewer', 'Flagged uncertainty around MU 5', 'MU 5'),
  ('audit_004', 'proj_student_wellbeing', '2026-05-29 18:49:00+00', 'Researcher', 'Edited human summary for MU 7', 'MU 7')
on conflict (id) do update set
  event_timestamp = excluded.event_timestamp,
  action = excluded.action,
  target = excluded.target;
