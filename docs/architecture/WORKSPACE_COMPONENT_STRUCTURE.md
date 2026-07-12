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
