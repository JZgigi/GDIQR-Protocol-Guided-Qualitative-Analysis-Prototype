# Documentation Index

This directory contains the project documentation for the current `release/1.0` testing cycle plus earlier planning and audit material.

## Read First

- [v1.0 collaborator testing guide](RELEASE_1_0_TESTING_GUIDE.md) - end-to-end instructions for reviewers and collaborators.
- [Supabase v1.0 setup](SUPABASE_V1_0_SETUP.md) - migration order, reset steps, and storage cleanup notes.
- [Acceptance checklist](v1_0_acceptance_checklist.md) - ticket-level manual smoke and acceptance checks.
- [Local AI testing](LOCAL_AI_TESTING.md) - Ollama, timeout, model, and performance tuning guidance.
- [Known technical debt and next steps](TECHNICAL_DEBT_AND_NEXT_STEPS.md) - maintainability and post-v1.0 cleanup backlog.

## Setup And Operations

- [Setup guide](SETUP_GUIDE.md) - local setup, environment variables, and development commands.
- [Local audio testing](LOCAL_AUDIO_TESTING.md) - faster-whisper audio workflow for Supabase-backed testing.
- [Chinese audio support](CHINESE_AUDIO_SUPPORT.md) - Chinese transcript/audio notes.

## Historical Planning And Audit Material

These files are retained as background evidence for product direction. They are not the primary execution guide for `release/1.0`.

- [Release plan v1](RELEASE_PLAN_v1.md)
- [Product audit v1](PRODUCT_AUDIT_v1.md)
- [Gap analysis v1](GAP_ANALYSIS_v1.md)
- [Backlog draft v1](BACKLOG_DRAFT_v1.md)
- [Local AI phase 3 notes](LOCAL_AI_PHASE3.md)

## Deprecated Documents Removed

The old `SUPABASE_PHASE2.md` document has been replaced by [Supabase v1.0 setup](SUPABASE_V1_0_SETUP.md). Phase 2 table setup is still part of the migration chain, but the current release requires the full v1.0 migration sequence.
