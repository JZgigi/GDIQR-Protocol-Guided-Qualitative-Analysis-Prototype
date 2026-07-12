# Batch 4 — Voice Guide methodological foundation

This batch implements Tickets 22, 23, 23A, and 24 without adding the floating avatar or microphone interaction yet.

## Included

- Structured GDI-QR guidance for Steps 1–5 and Export.
- Explicit researcher-responsibility boundaries.
- Deterministic redirect rules for requests that ask the guide to make analytic decisions.
- Context builder using current project, MU, category, relationship, and integrity state.
- `POST /api/voice-guide` endpoint.
- Local-only support through a transient browser-provided project snapshot.
- Supabase support through server-side workspace retrieval.
- Source-key tracing for guidance responses.
- Verification script for boundary coverage and non-persistence.

## Deliberate limitations

- No avatar UI in this batch.
- No microphone, speech-to-text, or text-to-speech.
- No automatic saving of questions or answers.
- The API currently composes answers deterministically from the structured knowledge base. A later natural-language layer may be added only if it preserves the same boundary checks.

## Privacy and storage

The endpoint does not save the question or answer. In local-only mode, the current project snapshot is used only for the request. Saved Voice Guide notes remain a later researcher-triggered feature.

## API contract

Request:

```json
{
  "projectId": "project-id",
  "step": "understanding",
  "spokenQuestionTranscript": "Should I split this MU?",
  "selectedContext": { "meaningUnitId": "mu-id" },
  "projectState": { "project": {} }
}
```

`projectState` is required only when the server cannot retrieve a Supabase workspace.

Response includes:

- `spokenAnswer`
- `captionSummary`
- `boundaryReminder`
- `suggestedChecks`
- `canSaveAsGuidanceNote`
- `guidanceSourceKeys`
- a limited `contextSummary`

## Verification

```bash
npm run typecheck
npm run test:batch2
npm run test:batch3
npm run test:batch4
npm run build
```
