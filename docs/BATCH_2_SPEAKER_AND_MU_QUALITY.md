# Batch 2 — Speaker parsing and meaning-unit quality

## Scope

This batch implements Tickets 19 and 20 without changing database tables or API contracts.

## Speaker parsing

A shared parser now handles line-level turns and continuation lines. Recognised interviewer aliases include Interviewer, Moderator, Researcher, Facilitator, Q, I, 访谈者, 主持人, 研究者, and 采访者. Recognised participant aliases include Participant, Interviewee, Student, Respondent, P, A, 受访者, 被访者, 参与者, and 学生.

Unknown labels remain `unclear`; they are not silently classified as participant. Interviewer-only segments remain available as context and are excluded from MU generation by default.

## Conservative MU boundaries

The AI instruction and local fallback now:

- avoid sentence-by-sentence splitting;
- preserve one coherent participant turn as one draft MU by default;
- keep examples, reasons, and consequences together when they express one meaning;
- split only at a substantial meaning shift;
- avoid filler-only and backchannel-only MUs;
- retain interviewer prompts as excluded context.

Long participant turns are split only when they exceed conservative size thresholds or contain explicit shift cues. All generated MUs remain drafts requiring researcher review.

## Verification

Run:

```bash
npm run typecheck
npm run test:batch2
npm run build
```

Manual fixtures should include English and Chinese labels, Q/A and I/P forms, continuation lines, unlabelled transcripts, short backchannels, and a long participant response containing connected examples.
