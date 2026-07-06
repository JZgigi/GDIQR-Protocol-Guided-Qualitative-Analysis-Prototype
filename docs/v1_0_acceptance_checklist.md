# GDI-QR v1.0 Acceptance Checklist

This checklist tracks the manual acceptance flow for the July v1.0 research release. Keep updating this file after each feature branch so that final end-to-end testing can be done once all P0 tickets have been merged into `release/1.0`.

## Testing strategy

During feature development, each branch only needs to pass:

- `npm run typecheck`
- `npm run dev`
- the branch-specific smoke checks listed below

Full end-to-end testing should be completed after all P0 tickets are merged.

## Environment prerequisites

1. Start from `release/1.0` or the active feature branch.
2. Confirm `.env.local` has Supabase values for cloud-assisted mode.
3. Run all required Supabase SQL migrations in order.
4. Start the app with `npm run dev`.
5. Use open, public, anonymised, or synthetic data only.

## SQL migration order so far

1. `supabase/phase2_schema.sql`
2. `supabase/phase3_segment_workflow.sql`
3. `supabase/audio_upload_transcription.sql` if audio upload/transcription tables and storage bucket have not already been created
4. `supabase/v1_0_foundation_schema.sql`
5. `supabase/v1_0_transcript_audio_review_schema.sql`

## Ticket 0: v1.0 data-model foundation

Branch: `feature/v1-data-model-foundation`

Smoke checks:

1. Run all required SQL migrations without errors.
2. Run `npm run typecheck`.
3. Run `npm run dev` and confirm the workspace opens.
4. Confirm `getWorkspace()` can load without crashing when these records exist or are empty:
   - `preAnalysisNotes`
   - `editLogs`
   - `integrationRelationships`
   - `integrityReviewItems`
   - `exportRecords`
5. Confirm existing meaning-unit, category, reviewer, and export UI still renders.

Expected result:

- Existing prototype behaviour is unchanged.
- New persistence tables/types are available for later tickets.

## Ticket 1: Create Project and data suitability gate

Branch: `feature/v1-create-project`

Smoke checks:

1. Open the app and confirm the **Project setup and data suitability** panel appears.
2. Try to save project setup without confirming data suitability.
   - Expected: the app blocks the action and shows a notice.
3. Select **Identifiable sensitive data** in cloud-assisted mode.
   - Expected: confirmation is disabled or blocked.
4. Create a new project with:
   - Project title
   - Research question
   - Study description
   - Dataset type: open or anonymised
   - Data source
   - Researcher notes
   - Data suitability confirmation checked
5. Confirm the URL changes to `?projectId=<new project id>`.
6. Refresh the page.
   - Expected: the project is still available in the project list.
7. Try upload/analysis actions on an unconfirmed project.
   - Expected: upload and analysis are blocked until data suitability is confirmed.
8. Export JSON/TXT and confirm the project metadata includes:
   - dataset type
   - data source
   - data suitability confirmation
   - researcher notes

Expected result:

- Project metadata persists.
- Data suitability gate prevents upload/analysis when not confirmed.

## Ticket 2: Transcript upload, editable preview, and confirmation

Branch: `feature/v1-transcript-audio-review`

Smoke checks:

1. Create or open a data-suitability-confirmed open/anonymised project.
2. Go to Step 1 → **Import or paste transcript**.
3. Upload `.txt` or `.docx`, or paste transcript text.
4. Click **Prepare transcript**.
5. Confirm an editable transcript preview appears.
6. Confirm the transcript review record indicates a saved review draft.
7. Before confirming the transcript, try to generate meaning units in Step 2.
   - Expected: generation is blocked.
8. Edit the transcript.
9. Click **Save reviewed transcript**.
10. Click **Confirm reviewed transcript for analysis**.
11. Confirm Step 2 can now generate meaning units.
12. Export JSON and confirm it includes `transcriptRecords` and transcript review status.

Expected result:

- Original/uploaded and edited transcript versions are distinguishable.
- Analysis cannot start before researcher confirmation.

## Ticket 3: Audio upload, transcription review, and confirmation

Branch: `feature/v1-transcript-audio-review`

Smoke checks:

1. Open a data-suitability-confirmed open/anonymised project.
2. Go to Step 1 → **Optional: transcribe interview audio**.
3. Upload `.mp3`, `.wav`, or `.m4a` audio.
4. Wait for transcription to complete.
5. Confirm generated transcript appears in the editable transcript review area.
6. Confirm the transcript remains unconfirmed after generation.
7. Edit the generated transcript if needed.
8. Click **Save reviewed transcript**.
9. Click **Confirm reviewed transcript for analysis**.
10. Confirm Step 2 can generate meaning units only after confirmation.
11. Export JSON and confirm it includes:
    - `audioFiles`
    - `transcriptionJobs`
    - `transcriptRecords`

Expected audit/edit-log events:

- `audio_uploaded`
- `transcript_generated`
- `transcript_edited`
- `transcript_confirmed`

## Ticket 4: Durable save/load project foundation

Branch: `feature/v1-save-load-step1`

Smoke checks:

1. Open an existing project from the project switcher.
2. Confirm loaded project state includes:
   - project metadata
   - transcript records
   - segments
   - meaning units
   - categories
   - reviewer comments
   - audit events
   - Step 1 pre-analysis notes
3. Make a small Step 1 change and save it.
4. Refresh the browser.
5. Reopen the same project from the project list.
6. Confirm saved Step 1 values are still visible.
7. Confirm the app recommends a sensible active step after load:
   - no confirmed transcript → Step 1
   - confirmed transcript but no accepted MUs → Step 2
   - accepted MUs but no categories → Step 3
   - categories but no narrative → Step 4
   - narrative present → Step 5

Expected result:

- Browser reload does not lose persisted Step 1 work.
- Project list can be used to return to existing work.

## Ticket 5: Step 1 pre-analysis persistence

Branch: `feature/v1-save-load-step1`

Smoke checks:

1. Open a data-suitability-confirmed project.
2. Fill or edit these Step 1 fields:
   - Research question
   - Study description / domains of investigation
   - Researcher position / reflexive note
   - Contextual notes
   - Initial sensitising concepts
   - Data familiarisation notes
3. Click **Save Step 1 pre-analysis notes**.
4. Confirm success message appears.
5. Refresh the browser.
6. Confirm all Step 1 fields reload correctly.
7. Check Supabase `pre_analysis_notes` for the project.
8. Check Supabase `edit_logs` or the exported audit record for `pre_analysis_updated`.
9. Export JSON/TXT and confirm Step 1 notes are included.

Expected result:

- All Step 1 fields persist and are audit logged.
- Step 1 appears in export as part of the research record.

## Full v1.0 end-to-end test placeholder

Run this only after all P0 tickets are merged:

1. Create project.
2. Confirm data suitability.
3. Upload transcript or audio.
4. Review and confirm transcript.
5. Complete Step 1 notes.
6. Generate and review meaning units.
7. Accept/exclude/edit meaning units.
8. Create and edit categories.
9. Build integration relationships and narrative.
10. Complete methodological integrity review.
11. Export complete analysis record.
12. Close browser, reopen project, and confirm no work is lost.
