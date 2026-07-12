# Product Audit v1

Date: 22 June 2026  
Repository: `GDIQR-Protocol-Guided-Qualitative-Analysis-Prototype`  
Approved requirements baseline: `local_docs/Product Requirement Document v2.docx`

## Executive summary

The repository contains a substantive single-page, researcher-in-the-loop GDI-QR-informed prototype. The strongest implemented path is: import or paste a transcript, prepare it locally, review privacy markers, confirm it, generate draft meaning units, review/accept/exclude those units, construct provisional categories, run integrity support, and export browser-state data. The current code separates meaning-unit work from category work, uses accepted meaning units for categorisation, labels assistant output as provisional, and requires researcher confirmation at several gates.

It is not production ready. The default local-only mode keeps most state only in React memory; there is no `localStorage`, IndexedDB, project file import, or resume workflow. Local-only audio is explicitly disabled. The existing `faster-whisper` engine is coupled to a Supabase-first route that uploads raw audio before local transcription. Audio confidence, uncertain audio segments, accent-specific review, timestamp navigation, and synchronised replay are absent. Supabase persistence is broad but uses a single default project and a service-role server client without user authentication or owner-scoped policies. Several researcher edits—pre-analysis notes, category edits, integration relationships, and integration confirmation—remain client-only even in Supabase mode.

The approved FRD's staged methodological boundary is partly well represented, but Mode C is not exposed by the current UI: the Mode C API and prompt exist, while Step 4 uses a client-side relationship heuristic and editable narrative instead. JSON, CSV, and TXT downloads work; DOCX and PDF are disabled placeholders, XLSX is absent, and the JSON “audit” is not a complete immutable AI-human change history.

## Audit method and verification boundary

- Code and repository documentation were inspected without modifying application code.
- The FRD was extracted from `local_docs/Product Requirement Document v2.docx` and compared with the implementation.
- `npm run typecheck` passed on 22 June 2026.
- The existing local dev server returned HTTP 200 for `/` and rendered the current app shell in a browser with meaningful content, no current Next.js error overlay, and no current console errors in that load.
- `POST /api/transcripts/prepare` was verified with `forceRuleBased: true`: HTTP 200 returned a prepared, speaker-labelled transcript without Supabase persistence.
- `POST /api/ai/meaning-units` was verified with `forceRuleBased: true`: HTTP 200 returned four draft units, excluded interviewer turns, and `persisted: false`.
- The browser automation harness did not reliably re-enable React form buttons after entering text. End-to-end form submission is therefore **Needs manual verification**, despite direct API success.
- Supabase writes, audio transcription accuracy, live Ollama generation quality, all supported import formats, downloads, and long-transcript behavior were not exercised against real services or files. They are marked **Needs manual verification**.
- Status vocabulary is limited to: Production Ready, Partially Implemented, Prototype Only, Placeholder, Not Implemented.

## Overall status

**Prototype Only**

The application demonstrates the intended workflow and some real local processing, but it lacks the persistence, security, local-audio, audit, export, test, and operational foundations required for production use.

## Core Workflow

### Step 1 — Pre-analysis

- **Purpose:** Establish the research question/domains, prepare source material, record researcher preunderstandings/reflexivity, judge relevance, review anonymisation, and confirm the transcript.
- **Current implementation:** A single Step 1 surface contains research question and domain fields, optional expectations/notes/reflexivity fields, relevance guidance, transcript import/preparation, sensitive-item review, transcript editing, cleaning, save, and confirmation.
- **What works:** The page renders; transcript preparation and the local rule fallback API were verified; transcript confirmation is a real client gate in local mode; editing invalidates confirmation; high-risk privacy findings block confirmation unless explicitly overridden.
- **What partially works:** Project title/research question/study description can save locally or through `PATCH /api/project`; transcript preparation can use Ollama or rules. Researcher expectations, researcher notes, reflexivity notes, relevance guidance, and `theoreticalFramework` are component state only and are not included in `buildExportPayload()`.
- **Placeholder/demo-only behaviour:** Copy repeatedly describes the flow as a demo/prototype. “Save progress” is JSON download rather than project persistence.
- **Missing persistence:** Pre-analysis notes and relevance decisions are not in `Project`, `WorkspaceData`, or the Supabase schema. Local project setup disappears on refresh.
- **Missing methodology support:** No structured domain objects, domain revision history, relevance decisions linked to source passages, or reflexive memo history.
- **Technical risks:** The whole workflow is concentrated in `src/components/gdiqr-workspace.tsx` (over 8,000 lines), increasing regression risk and making state dependencies difficult to validate.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`saveProjectSetup`, Step 1 render, `confirmTranscriptForAnalysis`, `buildExportPayload`); `src/app/api/project/route.ts`; `src/lib/types.ts` (`Project`); `supabase/phase2_schema.sql` (`projects`).
- **Status:** Partially Implemented

### Step 2 — Understanding & Translating

- **Purpose:** Delineate participant accounts into meaning units and create participant-close analytic summaries under researcher control.
- **Current implementation:** Confirmed transcript text is sent to `/api/ai/meaning-units`; Ollama or a rule fallback produces units. The UI supports excerpt/summary editing, individual or bulk acceptance, exclusion/restoration, return-to-transcript, uncertainty flags, and a local deterministic integrity check.
- **What works:** Direct rule-fallback generation was verified. Interviewer turns were separated and excluded; participant turns remained drafts. The code blocks generation until the transcript is confirmed and passes only accepted/non-excluded units to categorisation.
- **What partially works:** AI generation is full-transcript based in the current UI even though segment routes and segment state exist. Segment numbering is normalised client-side after generation. Manual split/merge/add actions exist around `TranscriptSegment`, but the product copy sometimes calls processing segments “meaning units,” creating conceptual ambiguity.
- **Placeholder/demo-only behaviour:** Rule-generated summaries are mechanical and explicitly marked for review. Run logs are diagnostic files under `.next`, not durable analytic records.
- **Missing persistence:** Local edits are memory-only. Supabase can persist MU changes, but the UI's unused `updateMeaningUnitSpeaker` handler is not wired into `MeaningUnitReviewCard`.
- **Missing methodology support:** No formal uncertainty-resolution workflow, no source timestamp linkage, no multi-case comparison, and no verified segment-by-segment continuation workflow as specified by the FRD.
- **Technical risks:** Automatic fallbacks can preserve workflow continuity but may produce plausible low-quality units; UI status relies on researchers noticing uncertainty labels.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`generateMeaningUnits`, `markAccepted`, `acceptAllReviewedMeaningUnits`, `excludeMeaningUnit`, `runMeaningUnitIntegrityReview`); `src/app/api/ai/meaning-units/route.ts`; `src/lib/ai-provider.ts` (`generateMeaningUnits`, `generateRuleBasedMeaningUnits`); `src/lib/auto-segmenter.ts`; `src/app/api/segments/*`.
- **Status:** Partially Implemented

### Step 3 — Categorizing

- **Purpose:** Compare accepted summaries, build parsimonious provisional categories, and refine category structure.
- **Current implementation:** The UI exposes assistant-supported Mode A and Mode B actions plus manual create, rename/edit, assign, remove, merge, split, reject, and confirm operations.
- **What works:** Only researcher-accepted, non-excluded MUs enter the category request. The prompts forbid raw transcript access, external theory, premature integration, and category proliferation. Fallback category drafts are labelled and blocked from later use until reviewed/accepted.
- **What partially works:** Ollama category output and Supabase category-system saving exist but were not live-tested. Manual category edits are React-state operations and are not persisted to Supabase.
- **Placeholder/demo-only behaviour:** Category fallback groups are mechanical low-confidence drafts. Category “confidence” is model-provided, not calibrated evidence.
- **Missing persistence:** Researcher category confirmations, manual assignments, merges, splits, and deletions have no dedicated API or repository write path.
- **Missing methodology support:** Mode B does not have a distinct UI for “new batch” selection, per-summary fit decision, or an explicit category revision history. Constant comparison is prompt-driven rather than inspectable.
- **Technical risks:** The API stores each generated category system as a new row but the workspace loads only the latest; manual refinement can be lost or overwritten.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`runCategories`, `addCategoryDraft`, `updateCategoryDraft`, `mergeCategoryDraft`, `splitCategoryDraft`, `confirmCategoryDraft`); `src/app/api/ai/categories/route.ts`; `src/lib/ai-provider.ts` (`generateCategories`, `buildCategoryGenerationPrompt`); `src/lib/gdiqr-repository.ts` (`saveCategorySystemFromAi`).
- **Status:** Partially Implemented

### Step 4 — Integrating

- **Purpose:** Review the full category system, articulate relationships, preserve tensions/limits, and create a cautious integrated narrative only after all material is processed.
- **Current implementation:** Step 4 requires a researcher checkbox, builds a client-side provisional relationship structure from reviewed categories, supports editing relationship type/rationale/evidence, and provides an editable narrative with confirmation.
- **What works:** The UI prevents integration with fallback categories, fewer than two reviewed categories, no accepted MUs, or an unchecked all-processed confirmation. Relationship evidence is restricted to accepted MUs.
- **What partially works:** `generateCategories` and `/api/ai/categories` support Mode C and an integrated narrative, but no current UI action calls `runCategories({ modeOverride: "C" })`. The visible integration suggestion is a local heuristic (`buildIntegrationStructureDraft`), not the FRD Mode C operation.
- **Placeholder/demo-only behaviour:** The generated relationship structure and category map are prototype heuristics. “Researcher-reviewed” is a boolean in component state.
- **Missing persistence:** Relationships, structure explanation, integration note, narrative edits, and confirmation are not saved to Supabase; only generated `category_systems.integrated_narrative` can persist.
- **Missing methodology support:** No explicit global constant-comparison record, negative-case workspace, uncertainty carry-forward, versioned structural model, or evidence-backed Mode C review screen.
- **Technical risks:** Users may interpret the Step 4 heuristic as Mode C even though the FRD operation is not exposed; reloading loses the relationship model.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`generateIntegrationStructureDraft`, `buildIntegrationStructureDraft`, `IntegrationRelationshipCard`, Step 4 render); `src/lib/ai-provider.ts` (`buildCategoryGenerationPrompt`, Mode C); `src/app/api/ai/categories/route.ts`; `supabase/phase2_schema.sql` (`category_systems`).
- **Status:** Prototype Only

### Step 5 — Methodological Integrity

- **Purpose:** Flag grounding, coverage, interpretation-boundary, category-coherence, and integration issues for researcher judgement.
- **Current implementation:** A deterministic in-browser MU integrity check and an Ollama category/narrative reviewer feed issue panels with severity, target navigation, resolve/dismiss, and researcher memo actions.
- **What works:** The deterministic MU check creates reviewable issues and records local actions. Reviewer prompts explicitly state that the assistant does not validate the analysis.
- **What partially works:** The FRD's four reviewer agents are represented as two workspaces rather than four separately attributable checks. The Ollama reviewer and Supabase issue persistence were not live-tested; reviewer generation has no rule fallback.
- **Placeholder/demo-only behaviour:** The checklist is a status summary, not methodological validation. Empty model output may appear as no issues without independent coverage evidence.
- **Missing persistence:** Local issues are session-only. Supabase stores structured payloads inside `suggested_action`; the newer reviewer columns exist in SQL but are not used directly by repository writes.
- **Missing methodology support:** No explicit audit of skipped transcript spans, no protocol-version binding, no reviewer-run provenance, and no systematic connection between resolved issues and before/after analytic edits.
- **Technical risks:** One model call is asked to cover several reviewer roles; absence of findings could be mistaken for a pass.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`runReviewer`, `runMeaningUnitIntegrityReview`, `MethodologicalIntegrityChecklist`, `ReviewerPanel`); `src/app/api/ai/reviewer/route.ts`; `src/lib/ai-provider.ts` (`buildMeaningUnitReviewerPrompt`, `buildCategoryReviewerPrompt`); `src/lib/gdiqr-repository.ts` (`replaceReviewerCommentsFromAi`, `updateReviewerComment`).
- **Status:** Partially Implemented

### Export / Analysis Record

- **Purpose:** Preserve a transparent record of source preparation, AI drafts, researcher decisions, category development, integration, integrity review, and audit history.
- **Current implementation:** Browser-side JSON, MU CSV, and TXT report downloads. The JSON contains the current transcript, segments, audio/job metadata, MUs, categories, reviewer comments, narrative, relationship structure, and audit events.
- **What works:** Export functions are implemented in the client and controls render. JSON export is used as the only local-mode preservation mechanism.
- **What partially works:** The JSON is broad but captures current state, not all revisions. TXT omits relationship details and most pre-analysis fields. CSV contains only MUs.
- **Placeholder/demo-only behaviour:** The UI calls TXT “DOCX-style text.” DOCX and PDF buttons are disabled and labelled “Coming next.”
- **Missing persistence:** Exports are not recorded in the `exports` bucket or an export table despite schema/storage preparation.
- **Missing methodology support:** No complete AI-human diff, decision chronology, prompt/model provenance, source-to-claim traceability report, or immutable analysis record.
- **Technical risks:** Exporting the transcript and sensitive metadata from browser state can create unmanaged local copies; there is no redaction/export review gate.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`exportWorkspace`, `buildExportPayload`, `buildTextReport`, Export render); `supabase/phase2_schema.sql` (`exports` bucket); FRD sections 17.8 and 19.7.
- **Status:** Prototype Only

## Data Preparation

### Transcript import

- **Purpose:** Accept an existing transcript without requiring audio transcription.
- **Current implementation:** Paste input and file extraction for TXT, MD, VTT, SRT, DOCX, and PDF up to 5 MB, followed by local preparation.
- **What works:** Paste-to-rule-preparation API was verified. Extraction is local through a temporary file and `scripts/extract_transcript_file.py`.
- **What partially works:** All file formats and encoding/layout cases need manual verification. PDF extraction depends on an installed local parser.
- **Placeholder/demo-only behaviour:** Legacy direct-import route is disabled; the current UI correctly uses prepare/review/confirm instead.
- **Missing persistence:** Imported draft stays only in component state until reviewed/confirmed.
- **Missing methodology support:** No import provenance checksum, source file retention choice, or extraction quality report.
- **Technical risks:** DOCX extraction flattens document structure; PDF extraction may reorder text.
- **Evidence:** `src/app/api/transcripts/extract/route.ts`; `scripts/extract_transcript_file.py`; `src/app/api/transcripts/prepare/route.ts`; `src/app/api/transcripts/import/route.ts`.
- **Status:** Partially Implemented

### Transcript versioning

- **Purpose:** Preserve raw, cleaned, and researcher-confirmed transcript revisions.
- **Current implementation:** Supabase “save version” inserts a new `transcripts` row with a label and privacy metadata. Confirmation also inserts a new row.
- **What works:** Version insertion and audit-event code paths exist.
- **What partially works:** The workspace loads only the latest transcript. No UI lists, compares, restores, or labels previous versions. Needs manual verification against Supabase.
- **Placeholder/demo-only behaviour:** In local mode, “save reviewed transcript” only updates in-memory state.
- **Missing persistence:** No local version store. `raw_content`, `cleaned_content`, and `final_content` columns added by Phase 3 are not used by repository code.
- **Missing methodology support:** No transcript change diff or confirmation history.
- **Technical risks:** Multiple transcript rows exist without user-facing recovery, while confirming clears derived analysis.
- **Evidence:** `src/lib/gdiqr-repository.ts` (`saveTranscriptVersion`, `confirmTranscriptForAnalysis`, `getWorkspace`); `src/app/api/transcript-versions/route.ts`; `supabase/phase3_segment_workflow.sql`.
- **Status:** Partially Implemented

### Transcript confirmation

- **Purpose:** Require researcher approval before meaning-unit generation.
- **Current implementation:** Editing resets confirmation; confirmation checks transcript content and privacy markers, cleans metadata, creates draft processing segments, and clears derived work.
- **What works:** The local client gate is implemented and meaning-unit generation checks `transcriptConfirmed`.
- **What partially works:** Supabase confirmation status is inferred from the project status string rather than a typed confirmation record; live persistence needs manual verification.
- **Placeholder/demo-only behaviour:** A privacy override permits proceeding with unresolved high-risk items after responsibility acknowledgement.
- **Missing persistence:** Local confirmation is lost on refresh. No named reviewer, timestamped sign-off record, or re-confirmation reason.
- **Missing methodology support:** No structured confirmation checklist for accuracy, speaker labels, completeness, and anonymisation as separate sign-offs.
- **Technical risks:** Project status strings are brittle workflow state.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`confirmTranscriptForAnalysis`, `canGenerateMeaningUnits`); `src/app/api/transcripts/confirm/route.ts`; `src/lib/gdiqr-repository.ts` (`confirmTranscriptForAnalysis`).
- **Status:** Partially Implemented

### Transcript review

- **Purpose:** Correct transcription and anonymisation errors while retaining access to source context.
- **Current implementation:** Free-text editor, highlighted sensitive-item preview, clean-spacing action, save, confirm, and a separate audio player when Supabase audio exists.
- **What works:** Text editing, invalidation of confirmation, and sensitive-marker focus are implemented.
- **What partially works:** Audio replay is available only for stored Supabase audio and is not synchronised to transcript segments.
- **Placeholder/demo-only behaviour:** “Clean transcript” trims spacing and removes detected metadata; it is not a linguistically informed cleaning review.
- **Missing persistence:** No local autosave, revision comparison, review assignment, or per-turn decision store.
- **Missing methodology support:** No confidence-led review queue, timestamp navigation, uncertainty resolution, or preservation/display of raw-vs-cleaned text.
- **Technical risks:** Free-text editing can accidentally change participant meaning without a diff.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`cleanTranscript`, transcript editor, `SensitiveTranscriptPreview`, `loadAudioPreview`); `src/lib/transcript-source-cleaner.ts`.
- **Status:** Partially Implemented

### Speaker correction

- **Purpose:** Correct speaker attribution before analysis.
- **Current implementation:** Researchers can edit speaker labels as transcript text. Ollama or rules initially infer Interviewer/Participant labels.
- **What works:** Speaker-labelled preparation is returned by the verified rule fallback; manual text correction is possible.
- **What partially works:** `updateMeaningUnitSpeaker` and repository support exist, but that handler is not wired into the current MU review card.
- **Placeholder/demo-only behaviour:** Rule fallback alternates/infer labels heuristically.
- **Missing persistence:** No structured transcript-turn speaker entities or speaker correction history.
- **Missing methodology support:** No speaker roster, unknown-speaker state, or batch relabelling.
- **Technical risks:** String editing can introduce inconsistent speaker labels and breaks timestamp alignment.
- **Evidence:** `src/lib/ai-provider.ts` (`processTranscriptChunk`, `fallbackPrepareTranscript`); `src/components/gdiqr-workspace.tsx` (transcript editor, unused `updateMeaningUnitSpeaker`); `src/lib/gdiqr-repository.ts` (`updateMeaningUnit`).
- **Status:** Partially Implemented

## Audio Pipeline

### Audio upload

- **Purpose:** Accept interview audio while preserving privacy and enabling transcription/review.
- **Current implementation:** Supabase mode accepts common audio/video formats up to 500 MB, uploads to the private `interview-audio` bucket, and creates audio/job records. Local mode returns HTTP 403 and disables the UI control.
- **What works:** Validation and Supabase upload code paths exist.
- **What partially works:** Supabase upload needs manual verification.
- **Placeholder/demo-only behaviour:** UI tells local users to import a transcript.
- **Missing persistence:** The new required local-only workflow has no local audio handle, local file lifecycle, or browser-local audio project reference.
- **Missing methodology support:** No audio consent/retention metadata.
- **Technical risks:** In the existing path, raw audio is uploaded before transcription/privacy review.
- **Evidence:** `src/app/api/audio/transcribe/route.ts`; `src/lib/gdiqr-repository.ts` (`uploadAudioForTranscription`); `src/components/gdiqr-workspace.tsx` (`uploadAndTranscribeAudio`); `README.md` Ethics section.
- **Status:** Partially Implemented

### Audio transcription

- **Purpose:** Produce an editable transcript from audio.
- **Current implementation:** `faster-whisper` runs locally inside the Next.js request, then Ollama prepares speakers/privacy text, then the prepared transcript is stored in Supabase.
- **What works:** The Python transcription script and server orchestration exist.
- **What partially works:** Real audio accuracy, decoding, duration, failure recovery, and large-file behavior need manual verification. Long transcription runs synchronously in a request.
- **Placeholder/demo-only behaviour:** Run log progress is local diagnostic state.
- **Missing persistence:** Raw transcription output and timestamp segments are not stored as reviewable transcript versions.
- **Missing methodology support:** No transcription quality sign-off or provenance attached to segments.
- **Technical risks:** Request timeout/process failure; audio may remain in Supabase after failure.
- **Evidence:** `scripts/transcribe_audio.py`; `src/lib/local-transcription.ts`; `src/app/api/audio/transcribe/route.ts`; `LOCAL_AUDIO_TESTING.md`.
- **Status:** Partially Implemented

### Local transcription support

- **Purpose:** Transcribe audio without cloud transcription or external APIs.
- **Current implementation:** The engine is local `faster-whisper`, but the route requires Supabase mode and uploads audio to Supabase Storage before local processing.
- **What works:** No cloud speech-to-text provider is called by the transcription engine.
- **What partially works:** The processing engine can be reused for the target workflow, but the product workflow is not local-only.
- **Placeholder/demo-only behaviour:** README calls it local transcription while requiring remote storage.
- **Missing persistence:** No local-only audio/transcript project storage.
- **Missing methodology support:** No researcher-controlled transition from local draft to confirmed transcript.
- **Technical risks:** Terminology may lead users to believe raw audio never leaves the machine.
- **Evidence:** `src/lib/local-transcription.ts`; `src/app/api/audio/transcribe/route.ts`; `README.md` Storage Mode; `LOCAL_AI_PHASE3.md`.
- **Status:** Partially Implemented

### Transcript confidence review

- **Purpose:** Direct researchers to low-confidence transcript areas before analysis.
- **Current implementation:** None for speech-recognition confidence. Category nodes have a separate qualitative `confidence` field, which is unrelated.
- **What works:** Nothing in the audio/transcript workflow.
- **What partially works:** Whisper timestamps are returned transiently but no confidence metrics are collected.
- **Placeholder/demo-only behaviour:** General speaker/privacy notes are not transcription confidence.
- **Missing persistence:** No word/segment confidence fields.
- **Missing methodology support:** No low-confidence review queue or confirmation requirement.
- **Technical risks:** Transcription errors can enter analysis without targeted review.
- **Evidence:** `scripts/transcribe_audio.py` emits only `start`, `end`, and `text`; `src/lib/local-transcription.ts`; `src/lib/types.ts` has no transcript confidence type.
- **Status:** Not Implemented

### Accent review workflow

- **Purpose:** Support known accuracy risks such as strong Scottish accents and unclear recordings.
- **Current implementation:** No accent-specific detection, model guidance, quality warning, test fixture, or review mode.
- **What works:** Researchers can manually edit transcript text.
- **What partially works:** Generic local Whisper model selection can be changed by environment variable.
- **Placeholder/demo-only behaviour:** None.
- **Missing persistence:** No accent/recording-quality metadata.
- **Missing methodology support:** No explicit uncertainty escalation for accent-related errors.
- **Technical risks:** Accuracy may be systematically lower without being visible to the researcher.
- **Evidence:** No matches for Scottish/accent or Whisper confidence fields outside styling tokens; `scripts/transcribe_audio.py`; `LOCAL_AUDIO_TESTING.md` only discusses model choice.
- **Status:** Not Implemented

### Sensitive data detection

- **Purpose:** Identify possible identifiers and sensitive details before analysis.
- **Current implementation:** Ollama prompt detects defined privacy categories; uncertain items receive inline review markers. Rule fallback masks contact/identifier patterns conservatively. Client code also builds review items from markers/placeholders.
- **What works:** Marker generation/review plumbing exists and the verified quick fallback returned privacy/speaker warnings.
- **What partially works:** Detection accuracy and recall need manual verification; rule fallback explicitly covers only a limited set.
- **Placeholder/demo-only behaviour:** Model-generated risk level is not an independently validated detector.
- **Missing persistence:** In local mode, findings disappear on refresh. Original sensitive text is intentionally omitted from Supabase metadata.
- **Missing methodology support:** No documented detector validation, false-negative review protocol, or language/accent performance evidence.
- **Technical risks:** False negatives are the highest privacy risk; false positives may distort participant meaning.
- **Evidence:** `src/lib/ai-provider.ts` (`processTranscriptChunk`, `prepareTranscriptWithLocalRules`); `src/components/gdiqr-workspace.tsx` (`buildSensitiveReviewItems`); `README.md` Ethics section.
- **Status:** Partially Implemented

### Sensitive data masking

- **Purpose:** Suggest and apply stable anonymised replacements without changing analytic meaning.
- **Current implementation:** High-confidence items may be auto-replaced with bracket tokens; uncertain text is wrapped for review. UI supports confirm, edit replacement, ignore, and apply consistently.
- **What works:** Replacement operations and gating logic are implemented.
- **What partially works:** Stable numbering across chunks/cases is not guaranteed; the AI may mask sensitive health/context details before researcher review.
- **Placeholder/demo-only behaviour:** “Apply consistently” is string replacement, not entity resolution.
- **Missing persistence:** Replacement dictionary and rationale are not first-class saved records.
- **Missing methodology support:** No reversible pseudonym map, consistency report, or participant-meaning impact check.
- **Technical risks:** Automatic masking can remove analytically relevant context or create inconsistent tokens.
- **Evidence:** `src/lib/ai-provider.ts` privacy prompt; `src/components/gdiqr-workspace.tsx` (`replaceSensitiveItemText`, `applyConsistentReplacement`, `editSensitiveReplacement`).
- **Status:** Partially Implemented

### Anonymisation review

- **Purpose:** Require researcher review of sensitive-data handling before analysis.
- **Current implementation:** Sensitive-item cards, highlights, status actions, high-risk blocking, optional override, save metadata, and transcript confirmation gate.
- **What works:** The review gate and UI controls are implemented.
- **What partially works:** Supabase audio flow saves the prepared transcript before the researcher completes the anonymisation review. Local state is not durable.
- **Placeholder/demo-only behaviour:** Override checkbox can bypass unresolved high-risk findings.
- **Missing persistence:** No full decision log with original/replacement/diff, reviewer identity, or reason.
- **Missing methodology support:** No separate anonymisation sign-off independent of transcript accuracy sign-off.
- **Technical risks:** Prepared text may already be remote before human review in Supabase mode.
- **Evidence:** `src/components/gdiqr-workspace.tsx` sensitive review and confirmation; `src/app/api/audio/transcribe/route.ts`; `src/lib/gdiqr-repository.ts` (`completeTranscriptionJob`, `insertTranscriptWithOptionalPrivacyMetadata`).
- **Status:** Partially Implemented

### New local-only audio requirement assessment

| Required stage/constraint | Current support | Classification | Evidence |
|---|---|---|---|
| Audio Upload | Disabled in local mode; Supabase-only path exists | Not Implemented for target workflow | `src/app/api/audio/transcribe/route.ts`, `src/components/gdiqr-workspace.tsx` |
| Local Transcription Draft | Local engine exists but requires prior Supabase upload | Partially Implemented | `src/lib/local-transcription.ts`, `scripts/transcribe_audio.py` |
| Transcript Confidence Review | No recognition confidence captured or shown | Not Implemented | `scripts/transcribe_audio.py`, `src/lib/types.ts` |
| Sensitive Data Detection | Ollama/rule preparation exists locally | Partially Implemented | `src/app/api/transcripts/prepare/route.ts`, `src/lib/ai-provider.ts` |
| Masking Suggestions | Markers/replacements exist; some items auto-mask | Partially Implemented | `src/lib/ai-provider.ts`, sensitive review UI |
| Transcript Review & Correction | Free-text editor exists; audio is unsynchronised | Partially Implemented | `src/components/gdiqr-workspace.tsx` |
| Researcher Confirmation | Required before MU generation | Partially Implemented | `confirmTranscriptForAnalysis`, `generateMeaningUnits` |
| Meaning Unit Generation | Local Ollama/rule route works with confirmed client state | Partially Implemented | `/api/ai/meaning-units`; direct fallback verification |
| No cloud transcription | Transcription engine is local | Partially Implemented | `scripts/transcribe_audio.py` |
| No external API processing in local-only mode | Core transcript/AI routes avoid Supabase and use local server/Ollama; local audio cannot run | Partially Implemented | storage-mode branches in AI routes; audio route 403 |
| Audio remains local | Not possible in current audio workflow | Not Implemented | Supabase Storage upload precedes transcription |
| Transcript remains local | Works for paste/file local drafts; not for current audio workflow | Partially Implemented | `/api/transcripts/prepare`; audio completion repository write |
| Researcher reviews anonymisation | UI gate exists | Partially Implemented | sensitive review UI and confirmation gate |
| Strong Scottish accent/unclear recording support | No confidence, flagging, accent test, or review queue | Not Implemented | repository-wide search; transcription script |
| Optional audio replay during transcript review | Generic audio player exists only for stored Supabase audio; no segment sync | Partially Implemented | signed-url route; `loadAudioPreview`; `<audio controls>` |

**Target workflow status:** **Not Implemented** as an end-to-end local-only audio workflow.

## AI Layer

### Ollama integration

- **Purpose:** Provide local model support for transcript preparation, MU drafting, category work, and reviewer checks.
- **Current implementation:** Fixed provider `ollama`, OpenAI-compatible local HTTP calls, health endpoint, configurable base URL/model/timeouts, and strict JSON parsing.
- **What works:** Direct rule fallback routes work without Supabase. Live Ollama calls need manual verification.
- **What partially works:** There is no provider abstraction in practice—`getAiProvider()` always returns Ollama—and no run provenance stored with analysis outputs.
- **Placeholder/demo-only behaviour:** `external` is documented as future but not implemented.
- **Missing persistence:** Model, prompt version, latency, token estimates, input hash, and run status are not in the analytic database.
- **Missing methodology support:** No prompt/version approval or reproducibility record.
- **Technical risks:** Local model variability, invalid JSON, timeouts, and hardware-dependent quality.
- **Evidence:** `src/lib/ai-provider.ts`; `src/lib/ollama-config.ts`; `src/app/api/ai/health/route.ts`; `LOCAL_AI_PHASE3.md`.
- **Status:** Partially Implemented

### Meaning-unit generation

- **Purpose:** Generate numbered, bounded MUs and concise summaries without categories/integration.
- **Current implementation:** Chunking, bounded prompt, speaker/context handling, uncertainty, optional tentative interpretation, normalisation, and fallback.
- **What works:** Rule fallback was verified; methodological prompt boundaries are explicit.
- **What partially works:** Live model output quality, coverage, numbering continuity on long interviews, and light-interpretation behavior need manual verification.
- **Placeholder/demo-only behaviour:** Fallback summaries are heuristic drafts.
- **Missing persistence:** AI run provenance and original AI output are not retained separately from normalised current values.
- **Missing methodology support:** No automated source coverage map across every transcript span.
- **Technical risks:** Silent under-segmentation is mitigated only by a word-count heuristic and reviewer checks.
- **Evidence:** `src/lib/ai-provider.ts` MU functions/prompt; `src/app/api/ai/meaning-units/route.ts`; `src/lib/gdiqr-repository.ts` replace functions.
- **Status:** Partially Implemented

### Category suggestions

- **Purpose:** Suggest Mode A/B category structures from confirmed summaries only.
- **Current implementation:** Mode-specific prompt, accepted-MU filtering, normalised categories, fallback drafts, and optional persistence.
- **What works:** Input boundary and fallback labelling are implemented.
- **What partially works:** Live model quality and Supabase writes need manual verification; manual refinements are not persisted.
- **Placeholder/demo-only behaviour:** Mechanical fallback categories.
- **Missing persistence:** No explicit category revision/diff log.
- **Missing methodology support:** No per-MU fit-decision matrix for Mode B.
- **Technical risks:** Latest-system loading can hide earlier versions and researcher edits.
- **Evidence:** `src/app/api/ai/categories/route.ts`; `src/lib/ai-provider.ts`; `src/lib/gdiqr-repository.ts`.
- **Status:** Partially Implemented

### Relationship suggestions

- **Purpose:** Suggest evidence-linked relationships among confirmed categories for integration.
- **Current implementation:** A deterministic client heuristic groups category meanings and proposes relationship types, rationales, evidence MU numbers, and a draft narrative.
- **What works:** Relationships are editable and evidence selection is constrained to accepted MUs.
- **What partially works:** The code is not an AI route, has no persistence, and is not the FRD Mode C operation.
- **Placeholder/demo-only behaviour:** Provisional relationship and map generation.
- **Missing persistence:** Entire relationship model.
- **Missing methodology support:** Global constant comparison, contradiction/negative-case procedure, and versioned structural model.
- **Technical risks:** Heuristic group labels may imply analytic validity.
- **Evidence:** `src/components/gdiqr-workspace.tsx` (`buildIntegrationStructureDraft`, `buildRelationshipEvidenceGroups`).
- **Status:** Prototype Only

### Integrity review support

- **Purpose:** Flag possible methodological problems without deciding validity.
- **Current implementation:** Client rules for MU issues and Ollama reviewer prompts for category/narrative issues.
- **What works:** Human decision framing and issue-management controls.
- **What partially works:** Reviewer model path and persistence need manual verification; roles are collapsed.
- **Placeholder/demo-only behaviour:** Checklist/status summaries.
- **Missing persistence:** Complete reviewer provenance and issue-to-edit trace.
- **Missing methodology support:** Independent coverage computation and four distinct FRD reviewer outputs.
- **Technical risks:** False assurance from empty issue arrays.
- **Evidence:** `src/components/gdiqr-workspace.tsx`; `src/app/api/ai/reviewer/route.ts`; `src/lib/ai-provider.ts` reviewer prompts.
- **Status:** Partially Implemented

### Fallback behaviour

- **Purpose:** Keep local demos usable when Ollama is slow or returns unusable output while clearly signalling reduced quality.
- **Current implementation:** Transcript preparation, MU generation, and categories have rule/mechanical fallbacks; fallback MUs are warnings and fallback categories are blocked until reviewed. Reviewer generation has no fallback.
- **What works:** Transcript and MU forced fallbacks were directly verified.
- **What partially works:** Category fallback path is code-inspected only. No common fallback policy or quality telemetry.
- **Placeholder/demo-only behaviour:** Category fallback and integration fallback narrative are explicitly placeholders.
- **Missing persistence:** Fallback reason/model is not reliably preserved in exported output or database run history.
- **Missing methodology support:** No mandatory enhanced review checklist for fallback-derived material.
- **Technical risks:** A fallback can appear structurally complete despite weak analytic quality.
- **Evidence:** `src/app/api/transcripts/prepare/route.ts`; `src/app/api/ai/meaning-units/route.ts`; `src/lib/ai-provider.ts` fallback functions; `src/app/api/ai/categories/route.ts`.
- **Status:** Partially Implemented

## Persistence

### Local-only mode

- **Purpose:** Keep research data and processing local while supporting a usable workflow.
- **Current implementation:** Default storage mode. Project, transcript, MUs, categories, issues, integration, and audit events live in React state; local Next.js/Ollama routes return outputs without Supabase writes; JSON download preserves a snapshot.
- **What works:** The app shell, rule transcript preparation, and rule MU generation were verified locally without persistence.
- **What partially works:** It is local for transcript workflows but not durable and explicitly excludes audio.
- **Placeholder/demo-only behaviour:** Designed for temporary-link demos and short sessions.
- **Missing persistence:** Browser refresh/reopen recovery, local project files, audio, version history, and autosave.
- **Missing methodology support:** Durable audit and review history.
- **Technical risks:** Accidental tab close loses work; temporary-link users send transcript text to the host machine's local server.
- **Evidence:** `src/lib/storage-mode.ts`; `src/lib/gdiqr-repository.ts` (`getLocalWorkspace`); local branches in `gdiqr-workspace.tsx`; `README.md` Storage Mode.
- **Status:** Prototype Only

### Browser persistence

- **Purpose:** Preserve local projects across refresh/restart without cloud storage.
- **Current implementation:** None. No `localStorage`, `sessionStorage`, or IndexedDB usage exists.
- **What works:** JSON file download.
- **What partially works:** None.
- **Placeholder/demo-only behaviour:** “Save progress” triggers JSON export.
- **Missing persistence:** Entire browser persistence layer and import/restore workflow.
- **Missing methodology support:** Durable local audit/history.
- **Technical risks:** High probability of data loss.
- **Evidence:** Repository-wide search; `src/components/gdiqr-workspace.tsx` footer and `exportWorkspace`.
- **Status:** Not Implemented

### Supabase persistence

- **Purpose:** Persist project, transcript, audio/job, segments, MUs, categories, reviewer issues, and audit events for longer testing.
- **Current implementation:** Tables, buckets, server repository, and CRUD/generation routes cover those entities.
- **What works:** Schema and repository code are substantial.
- **What partially works:** Needs live verification. Manual category/integration/pre-analysis edits are not persisted; only latest transcript/category system is loaded.
- **Placeholder/demo-only behaviour:** A single fixed default project is auto-created.
- **Missing persistence:** User/project ownership, integration relationship model, AI runs, export records/files, and direct use of edit logs.
- **Missing methodology support:** Versioned analysis record and AI-human comparison.
- **Technical risks:** Service-role access bypasses RLS; no authentication; partial schema/repository mismatch.
- **Evidence:** `supabase/phase2_schema.sql`; `supabase/phase3_segment_workflow.sql`; `src/lib/gdiqr-repository.ts`; `src/lib/supabase/server.ts`; `README.md` security warning.
- **Status:** Partially Implemented

### Audit trail

- **Purpose:** Record who/what changed analytic material, when, and from/to values.
- **Current implementation:** Action-level `audit_events`, local session events, and diagnostic run logs. `edit_logs` table is defined but unused.
- **What works:** Many repository writes create audit events; local MU decisions and relationship edits add events.
- **What partially works:** Coverage is inconsistent. Events lack before/after values and actor identity. Some destructive local actions and category edits do not add events.
- **Placeholder/demo-only behaviour:** `.next/gdiqr-run-logs.json` is diagnostic and can be cleared.
- **Missing persistence:** Immutable edit history, prompt/model/run data, export history, AI-human diff, and full local durability.
- **Missing methodology support:** Trace from source/version through AI draft, human revision, reviewer issue, and final claim.
- **Technical risks:** Current-state JSON can be mistaken for a complete audit trail.
- **Evidence:** `src/lib/gdiqr-repository.ts` audit inserts; `src/lib/run-logs.ts`; `supabase/phase3_segment_workflow.sql` (`edit_logs`); `buildExportPayload`.
- **Status:** Partially Implemented

### Project save/load

- **Purpose:** Create, select, save, resume, and manage projects.
- **Current implementation:** One default project loads on `/`; setup can update it; Supabase workspace loads the latest related records.
- **What works:** Single-project setup state and repository load/update paths exist.
- **What partially works:** Supabase save/load needs manual verification; local mode is not resumable.
- **Placeholder/demo-only behaviour:** No dashboard despite FRD; default ID `proj_student_wellbeing` is hard-coded/configured.
- **Missing persistence:** Project list, create/delete/archive, JSON import/restore, local resume, user ownership.
- **Missing methodology support:** Multiple case/interview management is only partially scaffolded in SQL.
- **Technical risks:** A new transcript confirmation clears current derived work for the project.
- **Evidence:** `src/app/page.tsx`; `src/lib/gdiqr-repository.ts` (`defaultProjectId`, `getWorkspace`, `updateProjectSettings`); FRD Core Pages; Phase 3 SQL `interviews`.
- **Status:** Partially Implemented

## Export

### Analysis record export

- **Purpose:** Produce a coherent, reviewable GDI-QR analysis record.
- **Current implementation:** JSON snapshot and TXT summary; CSV for MUs.
- **What works:** Client generation and download code exist.
- **What partially works:** JSON captures most current core outputs but omits several pre-analysis/reflexive fields and change history.
- **Placeholder/demo-only behaviour:** TXT is presented as “DOCX-style.”
- **Missing persistence:** Export record/file storage.
- **Missing methodology support:** AI-human comparisons, versioned decisions, prompt provenance, and full source evidence trace.
- **Technical risks:** Snapshot may be treated as a final analytic record.
- **Evidence:** `src/components/gdiqr-workspace.tsx` export functions/UI.
- **Status:** Prototype Only

### PDF export

- **Purpose:** Produce a stable formatted analysis record for review/reporting.
- **Current implementation:** Disabled UI card labelled placeholder.
- **What works:** Nothing beyond the affordance.
- **What partially works:** None.
- **Placeholder/demo-only behaviour:** “Coming next.”
- **Missing persistence:** Generation, storage, download metadata.
- **Missing methodology support:** Report structure and evidence appendix.
- **Technical risks:** None until implemented; current UI may imply near-term availability.
- **Evidence:** Export render in `src/components/gdiqr-workspace.tsx`.
- **Status:** Placeholder

### DOCX export

- **Purpose:** Produce an editable formatted analysis record for supervision and research documentation.
- **Current implementation:** Disabled UI card labelled placeholder.
- **What works:** Nothing beyond the affordance.
- **What partially works:** TXT can be manually copied but is not DOCX.
- **Placeholder/demo-only behaviour:** “Coming next.”
- **Missing persistence:** Generation, storage, download metadata.
- **Missing methodology support:** Tables for MUs/categories, review issues, AI-human changes, and audit appendices.
- **Technical risks:** TXT “DOCX-style” labelling can confuse expectations.
- **Evidence:** Export render and `buildTextReport` in `src/components/gdiqr-workspace.tsx`.
- **Status:** Placeholder

### Audit export

- **Purpose:** Export a defensible trail of decisions, revisions, assistant runs, and reviewer resolutions.
- **Current implementation:** “Export audit trail” downloads the same full workspace JSON used for backup.
- **What works:** Audit events and current issues are included.
- **What partially works:** It is a current-state snapshot with action events, not a complete history.
- **Placeholder/demo-only behaviour:** The label overstates completeness.
- **Missing persistence:** Edit logs, AI runs, prompts, versions, before/after values, export manifest.
- **Missing methodology support:** End-to-end traceability and AI-human comparison.
- **Technical risks:** False confidence in audit completeness.
- **Evidence:** Integrity step button, `exportWorkspace("json")`, `buildExportPayload`, `audit_events`, unused `edit_logs`.
- **Status:** Prototype Only

## Top 10 product risks

1. **Local work loss:** Default mode has no browser persistence or restore path.
2. **Local-only audio requirement failure:** Audio is disabled locally and uploaded to Supabase in the only implemented path.
3. **No transcription confidence/accent workflow:** Strong Scottish accents and unclear recordings can silently contaminate downstream analysis.
4. **Incomplete auditability:** Action events lack before/after values, run provenance, and reliable coverage of researcher edits.
5. **Security/ownership gap:** Supabase uses a service-role client with no user authentication or owner-scoped RLS flow.
6. **Mode C/UI mismatch:** Mode C exists in code but is not exposed; Step 4 substitutes a heuristic that may be mistaken for full integration.
7. **Partial persistence mismatch:** Manual category and integration edits can vanish even when cloud persistence is enabled.
8. **Synchronous long-running work:** Transcription and AI calls run inside Next.js requests and can time out or block.
9. **Fallback quality ambiguity:** Mechanical drafts keep the demo moving but can look analytically complete.
10. **Monolithic client component:** The very large workspace component increases regression, testing, and state-consistency risk.

## Top 10 missing features

1. Local-only audio upload and local audio lifecycle.
2. Transcript/word confidence indicators and low-confidence segment queue.
3. Scottish-accent/unclear-recording review workflow with replay and correction.
4. Browser-local durable save/load, autosave, and JSON restore/import.
5. UI-exposed, evidence-backed Mode C final integration.
6. Full AI-human edit log with before/after values and run/prompt/model provenance.
7. Persisted manual category refinements and integration relationships.
8. Real DOCX and PDF exports; FRD XLSX export is also absent.
9. Authentication, project ownership, project list/create, and secure RLS policies.
10. Version comparison/restoration for transcripts and analytic outputs.

## Recommended next release scope

Prioritise **v0.4: a reliable single-transcript, transcript-first workflow** before adding local audio. The release should make the existing methodological path durable and unambiguous: local project save/load and restore; explicit transcript accuracy/anonymisation confirmation; one stable MU workflow; persisted researcher edits and exclusions; persisted category refinement; UI-exposed Mode C or a clearly labelled non-Mode-C integration workspace; complete JSON/CSV analysis-record export; and an audit trail with before/after values. Add automated tests for the researcher gates and one manual pilot script. Defer local audio to v0.5, but design v0.4 persistence and transcript review models so confidence/timestamps/audio references can be added without replacing them.
