-- Reset only the default v1.0 testing project to a clean, empty workspace.
-- Run this after the v1.0 foundation migrations when you want a fresh test
-- without deleting other projects in the same Supabase instance.
-- Supabase SQL Editor blocks direct deletion from storage.objects. If you need
-- to remove uploaded files too, delete the proj_student_wellbeing/ folder from
-- the interview-audio, exports, and transcript-versions buckets in the Storage
-- UI, or call the Storage API from a service-role script.

delete from public.guidance_memos
where project_id = 'proj_student_wellbeing';

delete from public.exports
where project_id = 'proj_student_wellbeing';

delete from public.edit_logs
where project_id = 'proj_student_wellbeing';

delete from public.integrity_review_items
where project_id = 'proj_student_wellbeing';

delete from public.integrity_reviews
where project_id = 'proj_student_wellbeing';

delete from public.integration_relationships
where project_id = 'proj_student_wellbeing';

delete from public.reviewer_comments
where project_id = 'proj_student_wellbeing';

delete from public.categories
where category_system_id in (
  select id from public.category_systems
  where project_id = 'proj_student_wellbeing'
);

delete from public.category_systems
where project_id = 'proj_student_wellbeing';

delete from public.meaning_units
where project_id = 'proj_student_wellbeing';

delete from public.segments
where project_id = 'proj_student_wellbeing';

delete from public.transcription_jobs
where project_id = 'proj_student_wellbeing';

delete from public.audio_files
where project_id = 'proj_student_wellbeing';

delete from public.transcripts
where project_id = 'proj_student_wellbeing';

delete from public.interviews
where project_id = 'proj_student_wellbeing';

delete from public.audit_events
where project_id = 'proj_student_wellbeing';

delete from public.pre_analysis_notes
where project_id = 'proj_student_wellbeing';

insert into public.projects (
  id,
  title,
  research_question,
  study_description,
  language,
  protocol,
  light_interpretation,
  status,
  updated_at,
  dataset_type,
  data_source,
  data_suitability_confirmed,
  data_suitability_confirmed_at,
  researcher_notes,
  metadata
) values (
  'proj_student_wellbeing',
  'Untitled GDI-QR project',
  '',
  '',
  'English',
  'GDIQR',
  false,
  'Ready for v1.0 testing',
  now(),
  'open',
  'other',
  false,
  null,
  '',
  '{}'::jsonb
) on conflict (id) do update set
  title = excluded.title,
  research_question = excluded.research_question,
  study_description = excluded.study_description,
  language = excluded.language,
  protocol = excluded.protocol,
  light_interpretation = excluded.light_interpretation,
  status = excluded.status,
  updated_at = excluded.updated_at,
  dataset_type = excluded.dataset_type,
  data_source = excluded.data_source,
  data_suitability_confirmed = excluded.data_suitability_confirmed,
  data_suitability_confirmed_at = excluded.data_suitability_confirmed_at,
  researcher_notes = excluded.researcher_notes,
  metadata = excluded.metadata;

insert into public.pre_analysis_notes (
  id,
  project_id,
  research_question,
  study_description,
  researcher_position,
  contextual_notes,
  initial_sensitising_concepts,
  data_familiarisation_notes,
  created_at,
  updated_at
) values (
  'pre_proj_student_wellbeing',
  'proj_student_wellbeing',
  '',
  '',
  '',
  '',
  '',
  '',
  now(),
  now()
) on conflict (project_id) do update set
  research_question = excluded.research_question,
  study_description = excluded.study_description,
  researcher_position = excluded.researcher_position,
  contextual_notes = excluded.contextual_notes,
  initial_sensitising_concepts = excluded.initial_sensitising_concepts,
  data_familiarisation_notes = excluded.data_familiarisation_notes,
  updated_at = excluded.updated_at;
