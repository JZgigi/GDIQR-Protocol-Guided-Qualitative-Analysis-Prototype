# Batch 5 — Floating Voice Guide avatar

## Scope

This batch adds the non-blocking floating Voice Guide interface for Ticket 25.
It connects to the structured `/api/voice-guide` foundation from Batch 4 while
keeping interactions transient.

## Behaviour

- The guide is opened from a floating avatar rather than a chat panel.
- Only the latest caption summary is shown; there is no chat history.
- The UI models idle, listening, thinking, speaking, error, and captions-only states.
- The current workflow step and in-browser project snapshot are sent to the API.
- No question or answer is persisted in this batch.
- Microphone capture, speech-to-text, text-to-speech, replay, and saved notes remain
  Batch 6 work.
- A temporary browser prompt is used only to test the API-connected avatar before
  voice capture is introduced.

## Verification

```bash
npm run typecheck
npm run test:batch4
npm run test:batch5
npm run build
```
