# Batch 3 — Long-task feedback

## Scope

Implements Ticket 21 for transcript preparation/audio transcription, meaning-unit generation, category generation, and export.

## Behaviour

- A shared status card reports the current phase and elapsed time.
- Each task shows an approximate expected range rather than a false precise countdown.
- Buttons remain disabled while the corresponding task is active.
- Export includes an explicit duplicate-submission guard.
- Existing recoverable errors continue to provide Retry and Dismiss actions.
- Fallback use is stated explicitly when quick local or rule-based processing is active.
- The animated progress indicator respects `prefers-reduced-motion`.

## Estimates

The displayed ranges are interface guidance only. They are not promises and may vary with transcript length, local hardware, AI provider, and network/storage mode.

## Verification

```bash
npm run typecheck
npm run test:batch2
npm run test:batch3
npm run build
```
