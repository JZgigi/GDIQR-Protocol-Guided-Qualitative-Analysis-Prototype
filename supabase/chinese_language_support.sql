alter table public.projects
  drop constraint if exists projects_language_check;

alter table public.projects
  add constraint projects_language_check
  check (language in ('English', 'Chinese'));
