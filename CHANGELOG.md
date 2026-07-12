# Changelog

## 2026-07-07

- Updated repository documentation for the `release/1.0` testing cycle.
- Added `docs/README.md` as the documentation index.
- Added `docs/RELEASE_1_0_TESTING_GUIDE.md` for collaborator acceptance testing.
- Added `docs/SUPABASE_V1_0_SETUP.md` with the full SQL migration order, reset instructions, and Supabase Storage cleanup notes.
- Added `docs/TECHNICAL_DEBT_AND_NEXT_STEPS.md` to track workspace splitting, modal replacement, automated testing, AI provenance, security, and export hardening work.
- Rewrote `README.md`, `docs/SETUP_GUIDE.md`, and `docs/LOCAL_AI_TESTING.md` for v1.0.
- Removed the obsolete `docs/SUPABASE_PHASE2.md`; Phase 2 SQL remains part of the v1.0 migration chain, but it is no longer sufficient on its own.

## 2026-05-29

- Created Phase 1 Next.js prototype scaffold in the current project folder.
- Added mock GDI-QR-informed project data, transcript, segments, meaning units, categories, reviewer comments, and audit events.
- Added interactive single-page workflow for setup, upload, transcript editing, segmentation, meaning units, categories, reviewers, and export.
- Added mock AI API routes for meaning units, categories, and reviewer checks.
- Added `.env.example`, `README.md`, and `SETUP_GUIDE.md` for local, GitHub, Vercel, and later Supabase setup.
- Installed project dependencies and verified the prototype with TypeScript and production build checks.
- Added a PostCSS dependency override to address the npm audit warning without downgrading Next.js.

## Unreleased — Batch 0 workspace decomposition

- Split supporting workspace UI and helper functions out of the 12,110-line workspace component.
- Kept the existing `GdiqrWorkspace` public import and runtime behaviour unchanged.
- Added workspace architecture guidance for subsequent v1.0 feature batches.

## 2026-07-12 - Batch 1 core workflow simplification

- Replaced the full-width project setup form with a compact current-project bar.
- Moved project settings and project creation into collapsed disclosures.
- Reframed the mixed data-source selector as a dataset/source note while retaining the legacy internal value for database compatibility.
- Removed the methodological guidance chat panel from the visible workflow; saved guidance memo data remains compatible for the future Voice Guide.
- Moved detailed step guidance behind progressive disclosure and added a compact Voice Guide placeholder.
- Kept speaker and segment handling available as an advanced, collapsed tool.
- Extracted project entry and workflow navigation into feature folders.
- Verified with `npm run typecheck` and `npm run build`.

## Batch 2 — Speaker parsing and MU granularity

- Added a shared line-level speaker-turn parser with English and Chinese interviewer/participant aliases.
- Preserved continuation lines within the preceding speaker turn and kept unknown labels as unclear.
- Updated transcript preparation, auto-segmentation, repository splitting, and MU generation to use consistent speaker roles.
- Changed AI and rule-based MU delineation to a conservative, meaning-preserving default.
- Added Batch 2 verification checks and implementation documentation.

## Batch 3 — Long-task feedback

- Added shared elapsed-time and approximate-range feedback for transcript preparation, meaning-unit generation, category generation, and export.
- Made fallback state explicit and retained recoverable Retry handling.
- Added duplicate export protection and reduced-motion support.
- Added Batch 3 verification and implementation documentation.

## Batch 4 — Voice Guide foundation

- Added a structured GDI-QR Voice Guide knowledge base for Steps 1–5 and Export.
- Added deterministic boundary redirects for analytic decision requests.
- Added workflow-aware context summaries and guidance source tracing.
- Added `POST /api/voice-guide` with local-only and Supabase context support.
- Kept all unsaved guide interactions transient.
- Added Batch 4 verification and Voice Guide boundary/privacy documentation.

## Batch 5 — Floating Voice Guide avatar

- Added a floating, workflow-aware Voice Guide avatar.
- Added visible idle, listening, thinking, speaking, error, and captions-only states.
- Connected the avatar to the structured Voice Guide API without retaining chat history.
- Kept guidance interactions transient pending researcher-selected note saving in Batch 6.
- Added keyboard, ARIA, responsive, and reduced-motion support.

## Batch 6 — Voice interaction and saved notes

- Added browser speech recognition and speech synthesis to the floating Voice Guide.
- Added captions-only, replay, microphone-permission, and text fallback handling.
- Kept raw audio and unsaved interactions out of project storage.
- Added researcher-selected Voice Guide note saving through the existing guidance memo, audit, and export pathways.
- Added the `voice_guidance_note_saved` audit action type.

## Batch 7 — Release acceptance and documentation consolidation

- Added a Chinese end-to-end `release/1.0` acceptance guide covering Batch 0–6.
- Added a read-only Supabase schema verification SQL script.
- Confirmed that Batch 0–6 require no additional Supabase migration when the five documented migrations are already present.
- Updated current testing, setup, acceptance, and technical-debt documentation.
- Archived early audits, plans, backlog, and Batch implementation notes so they are not mistaken for current product status.

## Batch 8 — Conversational Ollama Voice Agent

- Replaced fixed readiness-check responses with question-aware Ollama conversation.
- Added natural casual conversation, general support, app help, methodology explanation, workflow guidance, and analytic-decision routing.
- Used the GDI-QR knowledge base as methodological grounding rather than a closed topic list.
- Added transient short-term conversation context for follow-up questions.
- Retained deterministic analytic-decision boundaries and output guarding.
- Added explicit structured fallback reporting when Ollama is unavailable.
- Introduced the warm conversational assistant persona “Mira”.
