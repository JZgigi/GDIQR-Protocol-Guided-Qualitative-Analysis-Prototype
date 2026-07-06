# Gap Analysis v1

Date: 22 June 2026  
Baseline: `local_docs/Product Requirement Document v2.docx`  
Companion evidence: `PRODUCT_AUDIT_v1.md`

## How to read this analysis

Completion percentages estimate **observable product completeness against the approved FRD**, not engineering effort consumed or code volume. A high percentage does not mean production ready: security, persistence, verification, and methodological safeguards can remain release-blocking. Any behavior not exercised against its real dependency is labelled **Needs manual verification**.

## Product and project foundations

| Feature | FRD expectation | Current state | Completion | Gap and evidence |
|---|---|---:|---:|---|
| User login | Login is in MVP scope and Milestone 1 | No authentication UI, session, user model use, or auth middleware | 0% | Implement authentication and ownership. `src/lib/supabase/server.ts` uses a service-role client with `persistSession: false`; README warns that auth is absent. |
| Dashboard/project list | Dashboard shows project list, create project, recent transcripts, protocol status, last edited, progress | App opens one workspace for one default project | 10% | No dashboard, list, recent items, or project selection. Evidence: `src/app/page.tsx`, `defaultProjectId` in `src/lib/gdiqr-repository.ts`. |
| Project creation | Capture title, research question, study description, language, data type, participant/case structure, goal | Existing default project can update title, research question, study description, language, and light interpretation | 45% | No create action; data type, case structure, goal, and dedicated protocol preview are absent. Evidence: `Project` in `src/lib/types.ts`, `saveProjectSetup`, `/api/project`. |
| Project save/load | Persist and resume a project | Supabase loads/updates one default project; local mode is memory-only | 40% | Add local durability, project list/create, import/restore, ownership. Supabase path is **Needs manual verification**. |
| GDI-QR-only positioning | Product supports GDI-QR only and avoids automated-final-analysis claims | UI/README consistently use GDI-QR-informed, draft, and researcher-review framing | 85% | Add onboarding limitations and protocol-version provenance. Evidence: `README.md`, step guidance and prompts in `gdiqr-workspace.tsx`/`ai-provider.ts`. |

## Audio, transcription, and transcript preparation

| Feature | FRD expectation | Current state | Completion | Gap and evidence |
|---|---|---:|---:|---|
| English audio upload | Upload one MP3/WAV/M4A/MP4 interview | Formats plus WebM/OGG/AAC supported only in Supabase mode; local mode disables upload | 50% | Implement target local-only path; verify real files. Evidence: `/api/audio/transcribe`, `uploadAndTranscribeAudio`. |
| Audio storage | Store uploaded audio and metadata | Supabase private bucket and `audio_files` table; no local audio store | 45% | Add local lifecycle/retention and ownership. Supabase behavior is **Needs manual verification**. |
| English transcription | Generate editable transcript | `faster-whisper` script returns text and timestamps; server orchestrates it | 55% | Real accuracy/decoding/timeouts are **Needs manual verification**; raw draft/timestamps are discarded after preparation. |
| Raw transcript preservation | Preserve raw transcript | Audio route saves only Ollama-prepared text; `raw_transcript_retained` defaults false | 20% | Preserve a protected local raw draft or explicit no-retention decision plus provenance. Evidence: `completeTranscriptionJob`, `insertTranscriptWithOptionalPrivacyMetadata`. |
| Speaker labels | Produce and allow correction of speaker labels | Ollama/rules output Interviewer/Participant; free-text correction possible | 55% | Add structured turns, speaker roster, unknown state, correction history. `updateMeaningUnitSpeaker` exists but is not wired. |
| Timestamps/navigation | Transcript editor includes timestamps and timestamp navigation | Whisper returns start/end transiently; stored segments use `00:00`; no navigation | 10% | Persist timestamps and implement click-to-seek. Evidence: `scripts/transcribe_audio.py`, repository segment inserts. |
| Confidence markers | Output confidence markers if available | No confidence fields collected or displayed | 0% | Capture word/segment confidence and expose review queue. |
| Audio player in editor | Play audio during transcript review | Generic audio player works only for Supabase-stored audio; no sync | 35% | Add local audio URL and timestamp-linked replay. Signed URL flow is **Needs manual verification**. |
| Transcript text editing | Editable transcript is mandatory | Free-text editor exists; edits revoke confirmation | 80% | Add diff, autosave/version choice, and structured turns. Evidence: Step 1/2 textareas and `setTranscriptConfirmed(false)`. |
| Transcript cleaning | Light cleaning preserves meaning/hesitation | Spacing cleanup and metadata removal; AI preparation instructed not to summarize/remove meaning | 55% | No reviewable cleaning diff or explicit preservation checks. Evidence: `cleanTranscript`, `transcript-source-cleaner.ts`, privacy prompt. |
| Transcript file import | Upload existing transcript | TXT/MD/VTT/SRT/DOCX/PDF extraction and paste flow | 70% | All formats/encodings/layouts are **Needs manual verification**; add provenance and extraction report. |
| Transcript versioning | Save transcript versions | Supabase inserts versions; latest only is loaded; local save is memory-only | 45% | Add list/compare/restore/label flow and use Phase 3 raw/clean/final columns. |
| Transcript confirmation | Researcher approves before analysis | Client gate blocks MU generation until confirmed | 80% | Persist structured confirmation/sign-off and separate accuracy/anonymisation decisions. Supabase path is **Needs manual verification**. |
| Sensitive-data detection | Not explicit in original FRD; new requirement adds detection before analysis | Ollama detector, review markers, limited rule fallback | 60% | Validate recall/precision, preserve provenance, require a systematic manual sweep. |
| Masking suggestions | New requirement calls for suggestions and researcher review | Auto-placeholders, uncertain markers, editable replacement, consistent string replacement | 60% | Convert auto-masking into reviewable suggestions where appropriate; persist replacement decisions. |
| Anonymisation review | New requirement requires researcher review | High-risk queue, confirm/edit/ignore, blocking gate, override | 70% | Separate sign-off, full decision log, prevent Supabase save before review in audio flow. |
| Strong Scottish accent support | New requirement calls out strong Scottish accents/unclear recordings | No accent/quality workflow | 0% | Add confidence flags, uncertain segments, replay/correction, model/test guidance, pilot fixtures. |
| Local-only audio | New requirement: audio and transcript stay local; no external API | Audio is explicitly disabled locally; implemented route uploads to Supabase first | 5% | Build a local file-to-Whisper-to-review path with no Supabase/external calls. Local engine can be reused. |

## Segmentation and meaning units

| Feature | FRD expectation | Current state | Completion | Gap and evidence |
|---|---|---:|---:|---|
| Processing segments | Split transcript into manageable segments; segments are not MUs | Rule auto-segmenter and segment CRUD exist | 65% | UI terminology conflates some segments with MUs; current MU button sends full transcript. Evidence: `auto-segmenter.ts`, segment routes, `generateMeaningUnitsFromTranscript`. |
| Segment metadata | Case/segment IDs, timestamps, speaker, status, starting number | IDs/status/text exist; timestamps default `00:00`; speaker info is often a title | 50% | Persist actual timestamps/turn references and source transcript relation. |
| Manual segment adjustment | Split, merge, reorder, create from selection | Handlers and APIs exist | 65% | End-to-end controls and Supabase behavior are **Needs manual verification**; add undo/version history. |
| Number continuity | Continue MU numbering across segments | Client normalises current units to 1..N; segment starting numbers use 100-step placeholders | 45% | Implement FRD start/continue/manual controls and verified batch continuity. Evidence: `normalizeMeaningUnitNumbersForSegments`, segment row creation. |
| MU generation | Numbered MUs with speaker, excerpt, concise summary | Ollama and verified rule fallback generate these fields | 75% | Verify live Ollama and long transcripts; add source coverage map and provenance. |
| No categories in MU stage | Enforce stage boundary | MU prompt forbids categories/themes/integration; Step 3 is separate | 90% | Add automated tests and protocol-version binding. |
| Light interpretation | OFF by default; ON yields labelled tentative interpretation | Project flag, prompt, UI copy, and MU field exist | 65% | Toggle persistence can lag project save; behavior needs live-model verification and tests. |
| Uncertainty handling | Mark UNCERTAIN and surface in UI | Uncertainty field/flags and reviewer warnings exist | 65% | Add resolution state, source audio linkage, and required review gate for uncertain units. |
| Human MU actions | Accept, edit, reject, split, merge, add, uncertain | Accept/edit/exclude/restore/delete are present; segmentation handlers provide split/merge/add; no dedicated mark-uncertain action | 70% | Make actions conceptually consistent, persist all actions, add undo and uncertainty action. |
| MU auditability | Record AI draft and human modification | AI and human summaries/excerpts coexist; audit events record broad actions | 50% | Store immutable original output, before/after edits, run/prompt/model, actor identity. |

## Categories and integration

| Feature | FRD expectation | Current state | Completion | Gap and evidence |
|---|---|---:|---:|---|
| Mode A | Initial categories from summaries; no narrative | UI action and prompt exist; accepted summaries only | 75% | Live model/Supabase path **Needs manual verification**; persist manual edits. |
| Mode B | Compare new summaries with existing system; report structural changes | UI refinement action and prompt exist | 60% | No explicit “new batch” selection or per-summary fit decisions; revisions are not a durable history. |
| Manual category editor | Edit names/definitions/assignments and hierarchy | Create/edit/assign/merge/split/reject/confirm top-level categories | 70% | Manual edits are not persisted; subcategory editing is limited. |
| Parsimony safeguards | Avoid redundant/trivial proliferation | Prompt and reviewer checks include parsimony; fallback labelled | 70% | Add visible category-count/coherence criteria and measurable review results. |
| Unit traceability | Categories list included unit IDs | `includedUnitIds` and evidence cards exist | 80% | Persist every assignment revision and link to source/timestamp. |
| Mode C confirmation | Explicit “all batches processed” confirmation | Checkbox exists and API validates flag | 70% | Current Step 4 does not invoke Mode C API; confirmation is memory-only. |
| Mode C integration | Global comparison, structural model, integrated narrative | API/prompt supports Mode C; UI uses local relationship heuristic instead | 40% | Expose Mode C, show structural model/uncertainties/revisions, persist reviewed output. |
| Relationship structure | Explain relationships, tensions, contradictions | Editable client relationship draft with MU evidence | 55% | Heuristic only, session-only, and not FRD Mode C. Add negative-case/uncertainty workflow. |
| Integrated narrative | Cautious draft answering research question | Editable narrative and confirmation; Mode C prompt can generate one | 55% | Persist human edits/confirmation; ensure it is generated only through explicit Mode C or clearly label alternative. |

## Reviewer and methodological integrity

| Feature | FRD expectation | Current state | Completion | Gap and evidence |
|---|---|---:|---:|---|
| Compliance reviewer | Check stage/protocol boundaries | Included in MU/category prompts and deterministic MU rules | 65% | No separately attributable reviewer result or prompt provenance. |
| Coverage reviewer | Detect skipped content and bad MU breadth | Prompt asks for coverage; local checks inspect some boundary issues | 45% | No transcript-span coverage calculation; live reviewer is **Needs manual verification**. |
| Interpretation-boundary reviewer | Flag theory, causality, diagnosis, overstatement | Reviewer prompt and local summary heuristics | 65% | No independent reviewer run; connect issues to before/after edits. |
| Category-coherence reviewer | Check fit, proliferation, revisions, integration | Category/narrative reviewer prompt and issue panel | 65% | One combined model call; no fallback; no validated no-issue state. |
| Issue workflow | Pass/warning/major, suggested fix, researcher resolution | Severity, target, comment, suggested action, resolve/dismiss/memo | 75% | Store fields directly, actor identity, timestamps, and links to corrective edits. |
| Methodological checklist | Transparent, coherent, credible, respectful review | Summary checklist renders | 45% | It derives simple counts/booleans, not evidence-based methodological evaluation. |

## Persistence, audit, and export

| Feature | FRD expectation | Current state | Completion | Gap and evidence |
|---|---|---:|---:|---|
| Local workspace persistence | New product direction requires local data retention | React state and JSON download only | 15% | Add IndexedDB/local project package, autosave, resume, import, deletion. No browser storage calls exist. |
| Supabase workspace persistence | Persist MVP entities | Broad schema/repository routes exist | 65% | Manual category/integration/pre-analysis state missing; live verification required; add auth/ownership. |
| Edit log | Field, old value, new value, editor, time | `edit_logs` SQL table exists but repository never writes it | 15% | Implement complete change capture and export. |
| Audit trail | Preserve AI outputs and human modifications | Action-level audit events and local event list | 45% | Add immutable before/after, run provenance, complete action coverage, actor identity. |
| AI-human comparison | Exportable comparison | AI/human MU summary fields exist | 25% | No generated comparison view/export; category/narrative diffs absent. |
| JSON export | Export current record | Implemented client-side | 80% | Verify download manually; add schema version, checksum, import/restore, and complete pre-analysis fields. |
| Spreadsheet export | FRD requires XLSX | CSV MU export only | 30% | Implement XLSX with transcript, MUs, categories, issues, diffs, audit sheets. |
| DOCX export | FRD requires DOCX | Disabled placeholder; TXT is called DOCX-style | 5% | Implement formatted analysis record and verification. |
| PDF export | New roadmap requires PDF | Disabled placeholder | 5% | Implement after analysis-record structure is stable. |
| Audit export | Export reviewer comments, comparison, audit trail | Same JSON snapshot is used | 40% | Build a purpose-specific, immutable audit package/manifest and include run/version history. |
| Export record | FRD data model includes Export entity | No export table/repository; bucket only | 10% | Record export type, content/version hash, timestamp, owner, and file reference. |

## New local-only target workflow gap

Target:

`Audio Upload → Local Transcription Draft → Transcript Confidence Review → Sensitive Data Detection → Masking Suggestions → Transcript Review & Correction → Researcher Confirmation → Meaning Unit Generation`

Current:

`Local mode: transcript paste/file → local preparation → privacy review → confirmation → MU generation`

`Supabase mode: raw audio upload to Supabase → local transcription → Ollama preparation → prepared transcript saved to Supabase → researcher review → confirmation → MU generation`

The reusable assets are the local Whisper wrapper, transcript-preparation route, privacy review UI, confirmation gate, and MU API. The missing product slice is the local audio/file lifecycle plus confidence/timestamp model and synchronised review UI. Overall completion against the new end-to-end local-only audio requirement is estimated at **35%**; the orchestration as a usable workflow is **Not Implemented**.

## Highest-impact gaps before release planning

1. Durable local save/load and restore.
2. Local-only audio path with no Supabase/external processing.
3. Confidence/timestamp/uncertain-segment transcript review.
4. Persisted manual category and integration edits.
5. UI-exposed and methodologically explicit Mode C.
6. Complete edit/audit/run provenance.
7. Authentication and project ownership for Supabase mode.
8. Real DOCX/PDF/XLSX analysis-record exports.
9. End-to-end automated and manual verification suite.
10. Pilot evidence for accent, unclear audio, privacy detection, and researcher usability.
