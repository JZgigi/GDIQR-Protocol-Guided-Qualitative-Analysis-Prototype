# Release Plan v1

Date: 22 June 2026  
Basis: `PRODUCT_AUDIT_v1.md`, `GAP_ANALYSIS_v1.md`, and `BACKLOG_DRAFT_v1.md`

## Release strategy

The releases are outcome gates, not date commitments. Each release should be accepted only after its end-to-end workflow is demonstrated with anonymised/synthetic test material and its known limitations are documented. Local-only privacy claims must be verified from actual data flows, not inferred from provider names.

## v0.4 — Single-transcript workflow works end to end

### Objectives

- Turn the existing transcript-first prototype into a durable, coherent single-transcript product slice.
- Remove ambiguity between processing segments, meaning units, categories, and integration.
- Ensure researcher decisions survive refresh/restart and can be restored.

### Features

- Create, save, load, resume, export, and restore one local single-transcript project.
- Import/paste transcript, review preparation, correct speakers/text, review anonymisation, and confirm for analysis.
- Generate or manually create MUs; edit, split, merge, add, exclude, resolve uncertainty, and accept them.
- Construct/refine categories from accepted MUs; persist manual assignments, edits, merges, splits, rejections, and confirmations.
- Expose an explicit single-transcript Mode C integration flow, or clearly separate and label any pre-Mode-C relationship workspace.
- Persist integration relationships, evidence references, narrative edits, researcher notes, and confirmation.
- Provide complete versioned JSON analysis-record export and restore, plus validated MU CSV.
- Record before/after changes and assistant/reviewer provenance for all in-scope analytic decisions.
- Add repeatable end-to-end tests and one documented manual acceptance script.

### Dependencies

- Canonical project/analysis-record and version model.
- Clear transcript → MU → category → integration state transitions.
- Local persistence and recovery policy.
- Agreed GDI-QR methodological acceptance criteria for MUs, categories, and Mode C.
- Representative anonymised transcript fixture.

### Risks

- Expanding v0.4 into audio or multi-case work would delay the core reliability goal.
- Existing client-only and Supabase state models may diverge if a single canonical record is not agreed first.
- Fallback outputs can make a demo appear complete without meeting analytic quality criteria.
- The monolithic workspace component increases regression risk during workflow stabilisation.
- “End to end” could be declared too early if only API routes, rather than researcher actions and restored state, are tested.

### Release gate

A researcher can start from a transcript, close/reopen the product, resume at each stage, complete a reviewed single-transcript integration, and export/restore the same analysis record without losing decisions or confusing assistant drafts with confirmed analysis.

## v0.5 — Local audio, transcription, transcript review, anonymisation

### Objectives

- Meet the new requirement that local-only mode supports audio while keeping audio, transcript, and processing local.
- Make transcription uncertainty visible and correctable before analysis.
- Address strong Scottish accents and unclear recordings as first-class product risks.

### Features

- Local-only audio upload/open with no Supabase or external API processing.
- Local transcription draft with timestamps and segment/word confidence where available.
- Confidence indicators, uncertain-segment flags, and a focused review queue.
- Optional audio replay during transcript review, including seek-to-segment behavior.
- Speaker correction and transcript correction with saved versions/diffs.
- Sensitive-data detection and masking suggestions after the local transcription draft.
- Researcher-controlled anonymisation review and separate transcript accuracy/anonymisation confirmations.
- Clear local audio/transcript retention and deletion controls.
- Accent/recording-quality warnings and tested workflow for strong Scottish accents and unclear recordings.
- Graceful handling of long jobs, cancellation, retry, partial failure, and dependency/model unavailability.

### Dependencies

- v0.4 transcript state, versioning, confirmation, audit, and local persistence.
- Defined local privacy threat model and retention policy.
- Approved Whisper model/device support matrix.
- Anonymised/synthetic audio corpus including strong Scottish accents and degraded recordings.
- Agreed confidence interpretation and uncertainty thresholds.

### Risks

- Speech confidence is model-dependent and must not be presented as certainty.
- Accent performance may vary significantly by model, device, recording conditions, and speaker.
- Large local models can create hardware, memory, battery, and latency constraints.
- Local browser/server file handling can still leak data through logs, temporary files, or exports if lifecycle rules are incomplete.
- Automatic masking may remove analytically relevant context or miss identifiers.

### Release gate

An audio file can complete the target chain—local upload, local draft, confidence review, sensitive-data/masking review, correction, researcher confirmations, and MU generation—while verified network/data-flow checks show that neither audio nor transcript leaves the local environment.

## v0.6 — Full GDI-QR analysis record and export

### Objectives

- Convert current-state prototype exports into a transparent, defensible analysis record.
- Make researcher decisions, assistant drafts, revisions, evidence, reviewer issues, and limits inspectable.

### Features

- Canonical GDI-QR analysis record covering project setup, domains, preunderstandings/reflexivity, relevance guidance, transcript versions, MUs, categories, integration, integrity review, and audit history.
- AI-human comparison for MU excerpts/summaries, category development, relationships, and narrative.
- Assistant run provenance: provider/model, prompt version, fallback reason, timing, input/output version references, and status.
- Source traceability from integrated claims and categories to accepted MUs and transcript/audio references.
- Purpose-specific audit export with immutable event/edit history.
- Formatted DOCX and PDF analysis records.
- Structured XLSX export consistent with the approved FRD.
- Export review/redaction gate, export manifest, schema/version identifier, and export history.

### Dependencies

- Stable v0.4/v0.5 domain and audit models.
- Agreed analysis-record template with methodology and supervision stakeholders.
- Stable source identifiers and version history.
- Data minimisation/redaction policy for exported material.
- Document rendering and verification pipeline.

### Risks

- Exports can imply methodological validity if draft/confirmed states and limitations are not prominent.
- Sensitive data may be reintroduced through excerpts, notes, or historical diffs.
- Different formats may drift unless generated from one canonical record.
- Large records may become unreadable without careful hierarchy and appendices.
- Prompt/model provenance can itself contain sensitive transcript content if not minimised.

### Release gate

The same completed analysis produces internally consistent JSON, XLSX, DOCX, PDF, and audit outputs; every final category/narrative claim can be traced to reviewed evidence and revision history; sensitive-data review is completed before download.

## v0.7 — Pilot-ready researcher testing version

### Objectives

- Demonstrate that target researchers can use the product safely and understand the staged GDI-QR-informed workflow without developer intervention.
- Generate evidence for usability, methodological alignment, reliability, and audio/transcript quality.

### Features

- Guided onboarding covering product limits, data protection, fallback meaning, and researcher responsibility.
- Stable recovery, error, cancellation, and dependency-health experiences.
- Accessibility review and keyboard/screen-reader baseline.
- Pilot instrumentation that avoids sensitive content while capturing completion, errors, timing, and fallback use.
- Researcher feedback/memo pathway and structured pilot issue capture.
- Supported environment/model/device matrix.
- Anonymised pilot corpus and task scripts spanning clean transcripts, long transcripts, strong Scottish accents, unclear audio, sensitive data, contradictions, and negative cases.
- Pilot administration and deletion/retention controls.

### Dependencies

- v0.4–v0.6 release gates passed.
- Ethics/data-protection approval for the pilot design and materials.
- Recruitment plan and defined target-user mix.
- Methodology expert review of prompts, gates, analysis record, and limitations.
- Support/escalation process for pilot incidents.

### Risks

- Pilot participants may upload real identifiable data despite guidance.
- Small or homogeneous pilots may miss accent, accessibility, and methodological failure modes.
- Researchers may over-trust polished outputs or misunderstand fallback drafts.
- Local hardware variability may dominate the experience.
- Telemetry can conflict with local-only privacy unless deliberately content-free.

### Release gate

Pilot participants complete predefined workflows with acceptable task success, recoverability, comprehension, and data-handling outcomes; critical privacy/methodology defects are closed; remaining limitations are explicit and accepted for pilot use.

## v1.0 — Deliverable product for real-world use

### Objectives

- Deliver a secure, maintainable product suitable for approved real-world research use within its stated GDI-QR-informed scope.
- Make privacy, reliability, auditability, and methodological transparency operational qualities rather than prototype guidance.

### Features

- Production-grade local-only workflow and, if retained, securely authenticated owner-scoped Supabase mode.
- Project lifecycle, backup/restore, retention, deletion, and disaster-recovery behavior.
- Stable job management for transcription and local AI with resumability and clear failure states.
- Versioned prompts/models/migrations and reproducible analysis records.
- Complete security, privacy, accessibility, compatibility, and performance hardening.
- Audited exports and project portability.
- In-product limitations, method guidance, support documentation, and release notes.
- Operational monitoring that does not capture research content without explicit approved consent.
- Defined upgrade/migration path for projects created in earlier versions.

### Dependencies

- Successful v0.7 pilot with methodology, privacy, and usability approval.
- Formal security/privacy review and threat model.
- Supported deployment/distribution and update strategy.
- Data governance, incident response, support, and maintenance ownership.
- Regression suite covering full local and any supported persisted mode.

### Risks

- “Real-world use” may include sensitive clinical/counselling material beyond the product's approved governance boundary.
- Model upgrades can change outputs and weaken reproducibility.
- Local-only assurances can be undermined by OS backups, tunnels, logs, temporary files, or user exports.
- Cloud mode creates substantially greater authentication, tenancy, compliance, and incident-response obligations.
- Scope pressure toward other qualitative methods or automatic findings could erode methodological clarity.

### Release gate

The product passes agreed security/privacy, methodology, accessibility, reliability, compatibility, and data-lifecycle criteria; real-world deployment boundaries are explicit; project records remain reproducible and recoverable across supported upgrades.

## Recommended immediate release scope

Start v0.4 with the smallest credible end-to-end slice:

1. Durable local single-project save/load and JSON restore.
2. Separate transcript accuracy and anonymisation confirmation states.
3. Reliable MU review with uncertainty resolution and durable edits.
4. Durable manual category refinement.
5. Explicit Mode C integration with persisted relationships/narrative.
6. Before/after edit trail and assistant run provenance.
7. Versioned JSON analysis record plus MU CSV.
8. Automated state-gate tests and one researcher acceptance script.

Do not include audio, collaboration, multiple methodologies, cross-case analysis, or polished document export in v0.4. Those belong to later release gates already defined above.
