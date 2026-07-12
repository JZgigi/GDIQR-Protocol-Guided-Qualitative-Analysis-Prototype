# Batch 1: core workflow simplification

## Included tickets

- Ticket 15: simplify project entry and project settings.
- Ticket 16: simplify dataset/source fields.
- Ticket 17: reduce default UI complexity across Steps 1–5.
- Ticket 18: remove guidance chat from the main workflow.

## Behaviour changes

- The page opens on a compact current-project bar rather than a persistent setup form.
- Project settings and project creation are collapsed by default.
- The legacy mixed `dataSource` value is retained internally for Supabase compatibility, but it is no longer presented as a user-facing mixed classification. Researchers record dataset/source label, material type, de-identification status, and related notes in the `Dataset/source note` field.
- Detailed step guidance is collapsed by default.
- The methodological text-chat interface is no longer rendered in the workflow.
- Existing saved guidance memos remain in the data model and exports for forward compatibility with researcher-saved Voice Guide notes.
- Speaker/segment handling remains available under an Advanced disclosure.

## Deliberate non-changes

- No Supabase migration.
- No API contract change.
- No deletion of existing guidance memo records.
- No Voice Guide API, avatar, speech input, or speech output yet.
- No change to meaning-unit or category generation logic.

## Verification

```bash
npm run typecheck
npm run build
```

Both commands must pass before merging to `release/1.0`.

## Manual smoke test

1. Open the application and confirm the workflow is visible without expanding project settings.
2. Open another project from the compact selector.
3. Expand Project settings, edit the title and dataset/source note, and save.
4. Expand Create new project and confirm the required fields remain available.
5. Move through Steps 1–5 and Export.
6. Confirm detailed step guidance is collapsed by default.
7. Confirm no question textarea or methodological chat history appears in the main workflow.
8. In Step 2, confirm speaker/segment handling is collapsed under Advanced.
