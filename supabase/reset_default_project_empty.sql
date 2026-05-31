delete from public.reviewer_comments
where project_id = 'proj_student_wellbeing';

delete from public.meaning_units
where project_id = 'proj_student_wellbeing';

delete from public.category_systems
where project_id = 'proj_student_wellbeing';

delete from public.segments
where project_id = 'proj_student_wellbeing';

delete from public.transcription_jobs
where project_id = 'proj_student_wellbeing';

delete from public.audio_files
where project_id = 'proj_student_wellbeing';

delete from public.transcripts
where project_id = 'proj_student_wellbeing';

delete from public.audit_events
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
  title = excluded.title,
  research_question = excluded.research_question,
  study_description = excluded.study_description,
  language = excluded.language,
  protocol = excluded.protocol,
  light_interpretation = excluded.light_interpretation,
  status = excluded.status,
  updated_at = excluded.updated_at;
