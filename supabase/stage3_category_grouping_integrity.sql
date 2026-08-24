-- Stage 3 category grouping integrity and researcher comparison records.
-- Apply after the existing v1.0 schema files and Step 2 migration.

alter table public.categories
  add column if not exists inclusion_criteria text not null default '',
  add column if not exists exclusion_criteria text not null default '',
  add column if not exists comparison_similarity_note text not null default '',
  add column if not exists comparison_difference_note text not null default '',
  add column if not exists grouping_decision text;

do $$
begin
  alter table public.categories
    add constraint categories_grouping_decision_check
    check (grouping_decision is null or grouping_decision in ('yes', 'partly', 'no'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.category_unit_decisions (
  id text primary key,
  category_system_id text not null references public.category_systems(id) on delete cascade,
  category_id text references public.categories(id) on delete cascade,
  meaning_unit_id text not null references public.meaning_units(id) on delete cascade,
  unit_number integer not null,
  decision text not null check (
    decision in ('assigned', 'intentionally_unassigned', 'needs_review')
  ),
  evidence_role text not null default 'core' check (
    evidence_role in ('core', 'qualifying', 'contradictory', 'unique_case')
  ),
  reason text not null default '',
  source text not null default 'researcher' check (source in ('ai', 'researcher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_system_id, meaning_unit_id),
  check (
    (decision = 'assigned' and category_id is not null)
    or (decision <> 'assigned' and category_id is null)
  )
);

create index if not exists category_unit_decisions_system_idx
  on public.category_unit_decisions(category_system_id);
create index if not exists category_unit_decisions_category_idx
  on public.category_unit_decisions(category_id);
create index if not exists category_unit_decisions_meaning_unit_idx
  on public.category_unit_decisions(meaning_unit_id);

alter table public.category_unit_decisions enable row level security;

revoke all on table public.category_unit_decisions from anon, authenticated;
grant select, insert, update, delete on table public.category_unit_decisions to service_role;

comment on table public.category_unit_decisions is
  'One explicit primary Stage 3 disposition per accepted meaning unit in a category-system version.';
comment on column public.category_unit_decisions.decision is
  'Records assigned, intentionally unassigned, or needs-review status so absent category membership is never ambiguous.';
comment on column public.category_unit_decisions.evidence_role is
  'Preserves core, qualifying, contradictory, and unique-case relationships without duplicating primary category membership.';
