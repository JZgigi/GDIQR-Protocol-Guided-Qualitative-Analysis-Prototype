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
