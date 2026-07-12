# Workspace component structure

## Batch 0 scope

Batch 0 is a behaviour-preserving decomposition of the original `src/components/gdiqr-workspace.tsx` monolith.

- `gdiqr-workspace.tsx` remains the orchestration boundary. It owns workspace state, effects, API calls, and event handlers.
- `gdiqr-workspace-support.tsx` contains extracted presentation components and pure/supporting functions used by the workspace.
- The public import remains unchanged: `GdiqrWorkspace` is still exported from `src/components/gdiqr-workspace.tsx`.
- No API contract, database schema, workflow copy, persistence behaviour, or feature behaviour was intentionally changed.

## Why this was done first

The simplification and Voice Guide tickets repeatedly touch the same workflow UI. Separating orchestration from supporting UI and utilities reduces future diff size and merge conflicts on `release/1.0`.

## Follow-up extraction rule

When a later ticket materially changes one workflow area, move that area from `gdiqr-workspace-support.tsx` into its own feature folder at the same time, for example:

- `gdiqr-workspace/transcript/`
- `gdiqr-workspace/meaning-units/`
- `gdiqr-workspace/categories/`
- `gdiqr-workspace/integration/`
- `gdiqr-workspace/integrity/`
- `gdiqr-workspace/export/`

Avoid introducing a new global state library during the v1.0 simplification unless a concrete requirement cannot be met with the current local state model.

## Verification

Run after structural changes:

```bash
npm ci
npm run typecheck
npm run build
```

## Batch 1 follow-up extraction

The first feature-led extraction now lives under:

- `gdiqr-workspace/project/project-bar.tsx`: compact current-project summary, project settings disclosure, and create-project disclosure.
- `gdiqr-workspace/workflow/workflow-navigation.tsx`: top workflow navigation and blocked-navigation handling.

The workspace root continues to own state and handlers. Subsequent batches should extract a workflow area only when that area is materially changed, so structural movement remains reviewable alongside a real feature boundary.

## Batch 2 analysis services

Speaker recognition and conservative MU boundary logic now live outside the workspace UI:

- `src/lib/transcript-speakers.ts`
- `src/lib/meaning-unit-boundaries.ts`

The repository, auto-segmenter, and AI provider share these rules so speaker roles and MU boundaries do not drift between local fallback and Supabase-backed workflows. UI extraction will continue when later tickets materially change transcript and MU review panels.

## Batch 3 addition

Long-running workflow feedback is now isolated in `gdiqr-workspace/shared/long-task-status.tsx`. The workspace still owns task state and retry orchestration; the shared component owns elapsed-time display, approximate ranges, accessibility announcements, and reduced-motion presentation.

## Voice Guide foundation

Voice Guide methodology and response safety are kept outside the workspace UI:

```text
src/lib/guidance/gdiqr-guidance.ts
src/lib/guidance/voice-guide-context.ts
src/lib/guidance/voice-guide-response.ts
src/app/api/voice-guide/route.ts
```

This prevents the future avatar component from owning methodology rules or direct analytic-decision logic. The UI will call the API and render transient voice/caption state in a later batch.

## Batch 5 addition

The Voice Guide UI is isolated under `gdiqr-workspace/voice-guide/`. The workspace
passes a current in-browser snapshot into the avatar, while the avatar owns transient
interaction UI state. Voice recording and persistence remain separate follow-up concerns.

## Batch 6 voice interaction boundary

`voice-guide/voice-guide-avatar.tsx` owns transient browser microphone/TTS state. The workspace remains responsible for project persistence: it receives a structured `VoiceGuidanceNoteDraft` only after the researcher selects **Save note**, converts it into the existing guidance memo record, and logs the save. This keeps unsaved voice interaction out of workspace persistence and export.
