# Backlog Draft v1

Date: 22 June 2026  
Level: Epics only — not Jira-ready stories

## Backlog principles

- Preserve researcher responsibility and explicit confirmation gates.
- Keep transcript preparation, meaning-unit work, category development, and integration as distinct stages.
- Treat every assistant output as a reviewable draft with visible provenance.
- Make local-only a complete product mode, including audio, rather than a transcript-only demo mode.
- Stabilise the single-transcript workflow before multi-case, collaboration, or additional methodologies.

## EPIC-01 — Transcript Preparation

- **Goal:** Provide a reliable, reviewable path from transcript source to a researcher-confirmed analysis transcript.
- **Why it matters:** Every downstream MU, category, and integration judgement depends on transcript accuracy, speaker attribution, and appropriate anonymisation.
- **Current maturity:** Partially Implemented. Paste/file import, preparation, free-text editing, sensitive-item review, save, and confirmation exist; local preparation fallback was verified.
- **Major gaps:** Durable versions; raw/prepared/final comparison; structured speaker turns; separate accuracy and anonymisation sign-offs; timestamp navigation; local resume; correction history.
- **Recommended next work:** Define the canonical transcript states and confirmation gates; make review decisions durable; provide version comparison/restoration; make the source-to-confirmed transition auditable.

## EPIC-02 — Local Audio & Transcription

- **Goal:** Deliver the required local-only audio workflow with no cloud transcription, no external API processing, and no remote audio/transcript storage.
- **Why it matters:** Local-only currently excludes audio, contradicting the new product requirement and limiting real interview workflows.
- **Current maturity:** Prototype Only as a product flow. A local `faster-whisper` engine exists, but the only audio route first uploads to Supabase.
- **Major gaps:** Local audio lifecycle; confidence data; uncertain-segment flags; strong Scottish accent/unclear-recording support; synchronised replay; local transcription draft; researcher-controlled masking review; long-job reliability.
- **Recommended next work:** Establish the privacy and lifecycle contract for local audio; retain timestamps/confidence; create a review queue for uncertain segments; support correction with optional replay; test with accent and poor-quality fixtures.

## EPIC-03 — Meaning Unit Workflow

- **Goal:** Make single-transcript MU delineation, summary review, uncertainty resolution, and acceptance reliable and traceable end to end.
- **Why it matters:** MU quality is the methodological foundation for later categories; weak boundaries or summaries propagate into the full analysis.
- **Current maturity:** Partially Implemented. AI/rule drafts, editing, acceptance, exclusion, fallback warnings, and integrity support exist; the rule fallback API was verified.
- **Major gaps:** Clear separation between processing segments and MUs; verified numbering continuity; explicit uncertainty action/resolution; timestamp/source coverage; durable original-vs-human edits; complete split/merge/add workflow validation.
- **Recommended next work:** Clarify the stage model and terminology; preserve source coverage; make every MU decision durable; add boundary/summary review criteria; verify one long single transcript from confirmation through accepted MUs.

## EPIC-04 — Category Development

- **Goal:** Support transparent, parsimonious Mode A and Mode B category construction from accepted MU summaries only.
- **Why it matters:** Category development is the central interpretive step and must remain inspectable, revisable, and grounded in researcher-confirmed evidence.
- **Current maturity:** Partially Implemented. Mode A/B prompts and manual create/edit/assign/merge/split/reject/confirm operations exist.
- **Major gaps:** Persistence of manual refinements; explicit new-batch scope for Mode B; per-MU fit decisions; category revision history; stronger subcategory editing; evidence/uncertainty tracking.
- **Recommended next work:** Make the category system a versioned researcher-owned record; expose comparison and fit decisions; retain the evolution from assistant draft through researcher-confirmed provisional categories.

## EPIC-05 — Integration & Relationships

- **Goal:** Provide a methodologically explicit Mode C that relates reviewed categories and creates a cautious integrated narrative with evidence and limits.
- **Why it matters:** The current visible Step 4 is not the same as the FRD Mode C, creating both product and methodological ambiguity.
- **Current maturity:** Prototype Only. An editable client-side relationship heuristic exists; Mode C exists in the API/prompt but is not exposed by the UI.
- **Major gaps:** Mode C launch/review flow; global constant-comparison record; durable relationship model; structural-model versions; tensions/contradictions/negative cases; uncertainty carry-forward; narrative confirmation history.
- **Recommended next work:** Decide and document the canonical integration workflow; expose Mode C only after explicit completion confirmation; make relationships and narrative evidence-linked, editable, versioned, and reviewable.

## EPIC-06 — Methodological Integrity

- **Goal:** Provide transparent quality-control support for protocol boundaries, coverage, interpretation, and category/integration coherence without claiming validation.
- **Why it matters:** The product's credibility depends on visible limits and on helping researchers detect omissions or over-interpretation.
- **Current maturity:** Partially Implemented. Deterministic MU checks and combined Ollama category/narrative review exist with issue resolution controls.
- **Major gaps:** Four clearly attributable FRD reviewer functions; independent transcript coverage evidence; reviewer provenance; fallback/no-result semantics; issue-to-revision trace; durable researcher memos.
- **Recommended next work:** Define reviewer outputs and evidence standards; separate “no issue detected” from “not checked”; connect every issue to source and corrective decision; validate checks on known good/bad examples.

## EPIC-07 — Export & Analysis Record

- **Goal:** Produce a complete GDI-QR analysis record for supervision, audit, reporting, and later method appendices.
- **Why it matters:** Current JSON/CSV/TXT snapshots do not satisfy the FRD or provide a defensible, readable record of analytic development.
- **Current maturity:** Prototype Only. JSON, MU CSV, and TXT are implemented; DOCX/PDF are placeholders and XLSX is absent.
- **Major gaps:** Canonical record structure; full pre-analysis/reflexivity content; AI-human comparisons; category/integration evolution; source traceability; real DOCX/PDF/XLSX; export manifest and redaction review.
- **Recommended next work:** Agree the analysis-record content model first; complete a versioned JSON record; then produce readable DOCX/PDF and structured XLSX from the same record; add an export review gate.

## EPIC-08 — Persistence & Audit Trail

- **Goal:** Make both local-only and Supabase-backed projects durable, secure, recoverable, and fully traceable.
- **Why it matters:** Data loss and incomplete audit trails are the largest blockers to meaningful researcher use.
- **Current maturity:** Partially Implemented overall. Supabase entities and broad repository operations exist; local mode is memory-only; action-level audit events are incomplete.
- **Major gaps:** Browser/local project persistence and restore; immutable edit log; AI run/prompt/model provenance; before/after values; manual category/integration persistence; authentication/ownership; owner-scoped RLS; export history.
- **Recommended next work:** Define one versioned project/analysis-record model across storage modes; ensure every researcher/assistant/reviewer change is traceable; add recovery/deletion/retention behavior; secure Supabase mode before multi-user use.

## EPIC-09 — Pilot Testing & Researcher Experience

- **Goal:** Establish that researchers can complete the intended workflow safely, understand the staged method, and recover from errors without developer help.
- **Why it matters:** The repository contains extensive guidance but little repeatable evidence that the complete product works for target researchers and real interview material.
- **Current maturity:** Prototype Only. Setup/test guides and a demo flow exist; typecheck and limited local API/browser verification passed.
- **Major gaps:** Automated workflow tests; supported-platform matrix; accessibility review; usability sessions; accent/audio benchmark; privacy detector evaluation; long-transcript performance; failure/recovery studies; methodology expert review.
- **Recommended next work:** Define pilot entry/exit criteria; build a small anonymised test corpus including strong Scottish accents and unclear recordings; run task-based sessions; record defects, misunderstandings, and timing; use evidence to approve v0.7.

## Suggested ordering

1. EPIC-08 Persistence & Audit Trail foundations
2. EPIC-01 Transcript Preparation
3. EPIC-03 Meaning Unit Workflow
4. EPIC-04 Category Development
5. EPIC-05 Integration & Relationships
6. EPIC-06 Methodological Integrity
7. EPIC-07 Export & Analysis Record
8. EPIC-02 Local Audio & Transcription
9. EPIC-09 Pilot Testing & Researcher Experience throughout, with a formal gate at v0.7

The ordering places a durable transcript-first v0.4 before local audio v0.5, while ensuring audio uses the same transcript-review, confirmation, audit, and export foundations rather than creating a parallel workflow.
