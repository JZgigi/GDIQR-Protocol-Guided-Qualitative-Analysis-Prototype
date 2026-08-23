-- Step 2 role/context-aware meaning-unit metadata.
-- Apply after the existing v1.0 schema files.

alter table public.meaning_units
  add column if not exists ai_excerpt text,
  add column if not exists classification text not null default 'substantive_participant'
    check (classification in ('substantive_participant', 'context_only', 'non_analytic', 'uncertain')),
  add column if not exists context_excerpt text,
  add column if not exists generation_method text not null default 'ai_semantic'
    check (generation_method in ('ai_semantic', 'rule_based_fallback', 'researcher')),
  add column if not exists reviewer_warnings jsonb not null default '[]'::jsonb,
  add column if not exists source_start_line integer,
  add column if not exists source_end_line integer,
  add column if not exists source_turn_ids text[] not null default '{}',
  add column if not exists speaker_role text not null default 'unclear'
    check (speaker_role in ('facilitator', 'interviewer', 'participant', 'unclear'));

update public.meaning_units
set ai_excerpt = excerpt
where ai_excerpt is null;

comment on column public.meaning_units.ai_excerpt is
  'Immutable participant excerpt originally proposed by AI; researcher edits remain in excerpt.';

comment on column public.meaning_units.classification is
  'Machine/researcher material classification used to keep context and housekeeping out of substantive MU categorisation.';
comment on column public.meaning_units.context_excerpt is
  'Preceding conversational context retained for interpretation but not treated as participant evidence.';
comment on column public.meaning_units.generation_method is
  'Distinguishes AI semantic delineation, structural fallback, and researcher-created/overridden records.';
comment on column public.meaning_units.source_turn_ids is
  'Stable preprocessing turn references supporting transcript-to-draft auditability.';
