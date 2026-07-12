-- GDI-QR v1.0 read-only schema verification
-- Safe to run in Supabase SQL Editor. This file does not alter data or schema.

with required_tables(table_name) as (
  values
    ('projects'),
    ('transcripts'),
    ('segments'),
    ('meaning_units'),
    ('category_systems'),
    ('categories'),
    ('audit_events'),
    ('edit_logs'),
    ('pre_analysis_notes'),
    ('integration_relationships'),
    ('integrity_reviews'),
    ('guidance_memos'),
    ('exports')
)
select
  r.table_name,
  case when t.table_name is null then 'MISSING' else 'OK' end as status
from required_tables r
left join information_schema.tables t
  on t.table_schema = 'public'
 and t.table_name = r.table_name
order by r.table_name;

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'guidance_memos'
  and column_name in ('id', 'project_id', 'step', 'question', 'answer', 'created_at')
order by ordinal_position;

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'audit_events'
  and column_name in (
    'project_id', 'event_timestamp', 'actor', 'action', 'target',
    'step', 'action_type', 'target_type', 'target_id',
    'previous_value', 'new_value', 'researcher_note'
  )
order by ordinal_position;

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.guidance_memos'::regclass
order by conname;
