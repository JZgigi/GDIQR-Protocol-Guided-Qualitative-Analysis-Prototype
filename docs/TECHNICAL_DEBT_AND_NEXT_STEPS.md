# Technical Debt And Next Steps

This file tracks known maintainability, reliability, and release-readiness work that should not be hidden inside acceptance notes.

## Priority Summary

P0 items block safe release testing or can cause data loss/privacy risk.

P1 items should be addressed before merging `release/1.0` into `main` if time allows, or immediately after if the current acceptance scope is otherwise stable.

P2 items improve maintainability and future development speed.

## P1: Split The Monolithic Workspace Component

Current file:

```text
src/components/gdiqr-workspace.tsx
```

Problem:

- The file is over 10,000 lines.
- It mixes project setup, transcript review, segment editing, MU review, category work, integration, integrity review, export, local helpers, and UI subcomponents.
- Small changes are hard to review and regression risk is high.

Recommended split:

- `ProjectSetupPanel`
- `TranscriptReviewPanel`
- `SegmentReviewPanel`
- `MeaningUnitPanel`
- `CategoryPanel`
- `IntegrationPanel`
- `IntegrityPanel`
- `ExportPanel`
- shared hooks for workspace refresh, API status, recoverable errors, and project state transitions.

Suggested order:

1. Extract pure display/helper subcomponents that already receive clear props.
2. Extract `ProjectSetupPanel`, because it is mostly project metadata and data-suitability state.
3. Extract `TranscriptReviewPanel`, including transcript import/prepare/save/confirm controls.
4. Extract `MeaningUnitPanel`, but only after tests cover MU add/edit/split/merge/delete/accept/exclude.
5. Extract category/integration/integrity/export panels one at a time.

Acceptance criteria:

- No behavior change during extraction.
- `npm run typecheck` and `npm run build` pass after each extraction.
- Manual acceptance checks for the affected panel pass after each extraction.

## P1: Replace Browser Prompt/Confirm With In-Page UI

Current state:

- Direct `window.prompt` and `window.confirm` calls are centralised through helper wrappers.
- This reduces future replacement cost but still uses browser-native dialogs.

Problem:

- Native dialogs are visually inconsistent.
- They block the browser thread.
- They are hard to test and localise.
- They are not ideal for accessibility or structured validation.

Recommended replacement:

- Confirmation modal for destructive actions.
- Text-entry modal or inline form for category names, merge targets, integrity memos, and anonymisation labels.
- Shared modal state manager or lightweight component to avoid repeated one-off implementations.

Acceptance criteria:

- Every destructive action clearly names what will be deleted or invalidated.
- Text prompts validate empty values and invalid IDs before submitting.
- Keyboard and screen-reader basics are checked.

## P1: Expand Automated Coverage

Current state:

- `npm run typecheck` and `npm run build` are the main automated checks.
- v1.0 relies heavily on manual acceptance.

Recommended coverage:

- Unit tests for transcript source cleaning.
- Unit tests for auto split vs speaker split behavior.
- Repository tests for guidance memo persistence and export format history.
- Playwright end-to-end path for create project -> transcript confirm -> MU draft -> category -> integration -> integrity -> export.
- Regression test for reset SQL assumptions if database testing infrastructure is added.

## P1: Strengthen AI Run Provenance

Current state:

- Run logs are visible locally.
- Export and audit records capture major user-visible actions.

Gaps:

- Model name, prompt version, timing, fallback reason, input version, and output version are not consistently persisted as first-class analysis record entities.

Recommended work:

- Add `ai_runs` table.
- Add prompt template/version identifiers.
- Link generated MUs/categories/reviewer issues to run IDs.
- Export AI run provenance without storing sensitive raw prompt content unless explicitly approved.

## P1: Production Security Boundary

Current state:

- Supabase-backed mode uses server-side service-role API routes.
- RLS exists but owner-scoped auth is not implemented.

Required before production or multi-user deployment:

- Supabase Auth.
- Owner-scoped RLS policies.
- Project membership model.
- Server-side access checks.
- Retention/deletion policy.
- Incident response and audit procedure.

## P2: Local-Only Audio Architecture

Current state:

- Audio upload is tied to Supabase-backed testing.
- Local transcription uses faster-whisper, but raw audio storage lifecycle is not fully local-only.

Recommended work:

- Local-only audio import path that does not upload to Supabase.
- Clear temporary-file cleanup.
- Optional timestamp/confidence preservation.
- Better long-job handling for transcription.
- Test fixtures for strong accents and unclear recordings.

## P2: Document Export Hardening

Recommended work:

- Verify DOCX output with Word or LibreOffice.
- Add PDF/print report visual checks.
- Add export manifest with schema version.
- Add redaction review gate before export.

## P2: Documentation Maintenance

Current cleanup:

- Added v1.0 testing guide.
- Added v1.0 Supabase setup guide.
- Added docs index.
- Removed obsolete Phase 2 Supabase guide.

Ongoing rule:

- Keep `README.md` short and current.
- Keep detailed execution steps in `docs/`.
- Move historical planning documents under an archive folder if they stop being useful for active release review.
- Update `CHANGELOG.md` whenever release behavior or test instructions change.

## P2: Release Branch Hygiene

Recommended workflow:

```bash
git switch release/1.0
git pull --ff-only origin release/1.0
git switch -c feature/<short-name>
```

After review:

```bash
git switch release/1.0
git merge --ff-only feature/<short-name>
git push origin release/1.0
```

If `--ff-only` fails, rebase the feature branch on the latest release branch before merging.
