# Benchmark v1 Meaning Unit Phase

## Implemented pipeline

```text
frozen verified-English input
  -> draft MUs and summaries
  -> exactly one structured MU self-review
  -> final revision and lineage validation
  -> current_stage = category_draft (no category analysis is run)
```

`POST /api/benchmark-runs/:runId/meaning-units` claims the MU phase once. The claim prevents a second analytic execution in the same run. Every stage stores its structured output, hash, validation result, and batch-scoped model attempts.

The exact prompt strings and their computed version/hash references are in `src/lib/benchmark/mu-prompts.ts`. A run can start only when its locked MU and optional JSON-repair prompt references match those code-defined templates.

## Prompt version history

Historical prompt references remain recorded rather than being overwritten:

| Prompt version | Generation hash | Self-review hash | Final-revision hash | JSON-repair hash |
| --- | --- | --- | --- | --- |
| `benchmark-mu-v1.0.0` | `15bf6f81844e9c7a28ee7f214615ac6b69dd913da1f0ed8d823a28932de00558` | `be79e31e4c670ee034c5feadbc4402a2f8ec6c965620496c1671e89841e43218` | `6dfd9a0920fe8e3891ef63da6c8cd566f48aa5c99d66830b8e822fd9ece6aba7` | `71608e3f53b6bef53824c74966069a6d3a06232ed973b9cd316efd958eca7379` |
| `benchmark-mu-v1.0.1` | `efb83c1c5c54f62b6ad2e23bfa8eb97a27dc312b12ff4408502d03ed960536f7` | `6777b78de6d7c6c2161875a707d068ae0ca00d6a0530a0f6acc73c2900332dba` | `c919f6b5b3f8def10e89ad4a6c884ff9448a35bb9c6552a0e3a7211acd7a617a` | `71608e3f53b6bef53824c74966069a6d3a06232ed973b9cd316efd958eca7379` |

The JSON-repair wording did not change in v1.0.1, so its content hash is unchanged. The structured MU schema remains `benchmark-mu-v1.0.0`; prompt and schema versions are recorded separately.

## Evidence boundary

Only the frozen participant-verified English transcript, research question, study context, and frozen speaker-role mapping enter an MU EvidenceBundle. The run records:

- original language `zh-CN`;
- benchmark input language `en`;
- analytic output language `en`;
- translated transcript version and computed transcript-only hash;
- `participantVerified = true`.

The original Chinese transcript is not a permitted input field and is not copied into model evidence. A conservative guard rejects transcript bodies that appear predominantly Chinese.

Anonymised IDs such as `F1` and `M2` have no inferred role or demographic meaning. Their role comes only from the frozen mapping. Only `participant` speech may become a draft or final MU.

## Source grounding and chunking

Each MU uses transcript ID, focus-group ID, speaker ID/role, stable turn IDs, and exact source text. The exact text must be a literal substring of the selected frozen turns. Offsets are optional; both must be present and exact if used.

MUs normally remain within one participant turn. A multi-turn reference is allowed only for the same confirmed participant, in transcript order, when the turns are adjacent or separated by one facilitator probe. This structural rule prevents arbitrary distant-turn combinations; the prompt remains responsible for requiring that the later turn directly complete or elaborate the same coherent meaning.

Each focus-group transcript is sent whole when it is within the locked `maxInputCharacters`, which must reserve room for prompts and output. Oversized transcripts use deterministic turn chunks and fixed `overlapTurns`. Overlap-only turns are context and cannot independently produce an MU. No semantic/adaptive chunker or cross-chunk selection pass exists.

## Runtime validation

Strict parsers reject unknown fields, missing fields, invalid enums, malformed IDs, duplicate IDs, unsupported speaker roles, non-exact sources, unknown turns, cross-batch references, invalid lineage, and predominantly non-English analytic summaries. For conservative Benchmark v1 validation, an entirely empty output is rejected whenever any non-empty confirmed participant speech is present. No short-response or filler lexicon determines qualitative relevance; contextual relevance remains a model judgement.

Final lineage rules are:

- `unchanged`, `revised`, and `split`: exactly one draft parent;
- `merged`: at least two draft parents;
- `added`: no draft parent and at least one review finding;
- `removed`: stored separately with at least one review finding;
- every draft is represented by one or more final descendants or exactly one removal record.

## Retry and audit policy

The first response passing the locked JSON, schema, source-reference, and predefined semantic validation is accepted. The only retry categories are transport failure, timeout, malformed JSON, schema invalidity, invalid reference, and semantic validation failure. A malformed response may receive one locked content-preserving JSON repair when enabled. Weak-looking but valid analysis is never retried or ranked.

Attempt audit records include batch, attempt number/type, failure category, validation error, request hash, prompt version/hash, locked parameters, duration, and provider generation/model identifiers when exposed. Invalid raw and parsed responses stay in the service-role-only table and are removed from ordinary run reads and research exports.

## Synthetic lineage example

Transcript excerpts:

```text
T3 F1 participant: The group listened without judging me. That made it easier to speak honestly.
T4 M2 participant: I felt isolated at first. Later, meeting peers gave me confidence.
```

Draft/review/final:

```text
D1 "The group listened without judging me."      \
D2 "That made it easier to speak honestly."       -> over_segmentation -> MU1 merged [D1,D2]

D3 full T4 passage                                  -> under_segmentation -> MU2 split [D3]
                                                                         -> MU3 split [D3]
```

The tests also cover a duplicate draft removed with explicit lineage, an omitted travel-cost meaning added from exact source, and an inaccurate summary revised without changing its evidence.

## Known methodological boundary

The conservative empty-output check avoids context-insensitive lexical exclusion, but it can technically reject an empty output for a transcript containing only procedural participant acknowledgements. It does not force every short response to become an MU; it only prevents the whole batch from being empty. Chunking is deterministic and auditable, but any context-window split can still increase boundary sensitivity; full-transcript processing remains preferred.
