# Autonomous Benchmark v1 Foundation

## Scope

Benchmark v1 evaluates the core operations of an independent GDI-QR-informed AI analysis. It is not an automated version of the researcher-led UI.

The locked pipeline is:

1. Draft meaning units and summaries.
2. One MU self-review.
3. Final meaning units.
4. Draft flat categories.
5. One category self-review.
6. Final categories.
7. Draft integrated analytic summary.
8. One evidence/methodological review.
9. Final integrated analysis and validation.

The Meaning Unit phase is now implemented as three locked model stages: draft generation, exactly one methodological self-review, and final revision/validation. Category and integration prompts remain intentionally deferred.

## Isolation boundary

A run is created only from an allowlisted input contract containing the research question, study context, transcript dataset, speaker roles, methodological protocol, and computational configuration. Unknown fields and known human-analysis fields are rejected recursively.

The benchmark repository does not read researcher-led meaning units, summaries, categories, reviewer comments, or integrated findings. Each run receives an independent database-generated run ID and stores its own snapshots and outputs.

## Persistence

The MVP migration adds only:

- benchmark run metadata and frozen snapshots;
- append-oriented stage outputs;
- model attempts;
- final meaning units;
- final flat categories;
- category memberships;
- final integrated narratives and evidence-linked claims.

No relationship graph, category hierarchy, protocol publishing registry, XLSX registry, or object-storage manifest is included.

Completed and failed runs are read-only through the application repository. Hard database immutability triggers remain a later production-hardening task.

## API foundation

- `POST /api/benchmark-runs` validates, snapshots, hashes, and creates a run.
- `GET /api/benchmark-runs/:runId` returns the complete read-only run bundle.
- `GET /api/benchmark-runs/:runId/export` downloads the complete JSON bundle.

- `POST /api/benchmark-runs/:runId/meaning-units` claims the run once and executes only the three-stage Meaning Unit phase.

See `BENCHMARK_V1_MEANING_UNITS.md` for the locked MU contract, retry policy, and synthetic examples.

## Deferred

- Category and integration analytic prompts.
- A background stage runner/queue.
- Relationship graph or integrated map.
- Category hierarchy.
- Cross-focus-group synthesis stage.
- Multiple or adaptive review loops.
- Separate reviewer model.
- Researcher-led workflow changes.
- XLSX and document exports.
- Protocol publishing UI.
- Hard database immutability triggers and full multi-user authorization.

## Locked MU decisions

- Stable turn IDs plus exact source text are primary; offsets are optional and validated only when supplied.
- Full focus-group transcripts are preferred. Over-limit inputs use fixed, turn-based chunks with locked overlap.
- Only frozen `participant` roles can become draft or final MUs; `unknown` and `facilitator` cannot.
- The EvidenceBundle and analytic output are participant-verified English only.
- Final lineage is limited to unchanged, revised, split, merged, added, and separately recorded removed drafts.
- Empty outputs fail when any non-filler participant material exists.
- Seed is optional and recorded only when configured; no application-level determinism is simulated.
- Invalid raw responses remain server-side and are removed from normal GET/export bundles.
