import { sha256 } from "./hash.ts";
import type {
  DraftMeaningUnit,
  MeaningUnitReviewFinding,
  PromptTemplateReference
} from "./types.ts";

export const MU_PROMPT_VERSION = "benchmark-mu-v1.0.1";

export const MU_SYSTEM_PROMPT = `You are the independent analyst for a locked GDI-QR-informed methodological benchmark. Work only from the supplied verified English EvidenceBundle. Never use or infer human analysis, another AI run, or information outside the bundle. Speaker roles are frozen: do not infer a role or demographics from a speaker label. Return only the requested JSON object. Do not reveal chain-of-thought. Where a concise methodological rationale is requested, provide only the brief auditable conclusion.`;

export const MU_DRAFT_PROMPT_TEMPLATE = `TASK: Identify draft Meaning Units and faithful summaries.

METHOD:
- A Meaning Unit is one coherent substantive participant meaning relevant to the research question.
- A participant turn may yield zero, one, or multiple MUs.
- Keep a long multi-sentence passage together when it develops one coherent meaning.
- Split only at a genuine shift in substantive meaning, not because of length, sentences, or punctuation.
- Multiple clauses, changes in example, internal contrast, temporal development, qualifications, or words such as “but”, “however”, or “although” do not by themselves justify splitting. They may remain within one MU when they contribute to one coherent substantive meaning.
- Normally construct an MU within one participant turn. Multiple turns from the same participant may support one MU only when a later turn directly completes or elaborates the same coherent meaning, such as after a facilitator probe. Do not combine distant turns merely because they discuss a similar topic.
- Include only confirmed participant speech. Facilitator, procedural, filler, and unknown-speaker material cannot become an MU.
- When analysisTurnIds is supplied, create MUs only for material that includes at least one of those turns; other turns are fixed overlap context only.
- Copy exact source wording. Use only stable turn IDs supplied in the EvidenceBundle. Never invent offsets.
- Condense the core meaning faithfully in English. Preserve qualifiers, tensions, and direction. Do not theorise or add context. Close wording is acceptable when the participant statement is already concise and further paraphrasing would reduce fidelity; do not force abstract synonyms merely to avoid wording overlap.
- Prefix every ID with the supplied batchId, for example transcript-1:chunk-001:DRAFT-MU-001.

OUTPUT JSON:
{"draftMeaningUnits":[{"draftMuId":"batchId:DRAFT-MU-001","transcriptId":"...","focusGroupId":"...","speakerId":"...","speakerRole":"participant","sourceLocation":{"turnIds":["..."]},"sourceText":"exact source wording","summary":"concise English condensation","uncertainty":"optional concise uncertainty"}]}

Return an empty array only when the EvidenceBundle genuinely contains no substantive participant material.`;

export const MU_REVIEW_PROMPT_TEMPLATE = `TASK: Perform exactly one methodological self-review of the supplied draft MUs against the complete EvidenceBundle.

Check only these issue types:
1. substantive_meaning_omitted
2. over_segmentation
3. under_segmentation
4. duplicate_or_overlap
5. distinct_meanings_combined
6. facilitator_included
7. unknown_speaker_included
8. source_or_speaker_mismatch
9. summary_inaccurate
10. summary_over_interpreted
11. summary_repeats_source

Do not identify an issue merely because a review is required. If the draft MUs are methodologically adequate, return an empty findings array. Prefer retaining an adequately coherent MU unless there is a clear substantive meaning shift requiring revision or splitting. Treat summary_repeats_source as an issue only when useful condensation is genuinely possible and the summary provides none; close wording is acceptable for an already concise statement when paraphrasing would reduce fidelity.

Do not rewrite the MU set in this pass. Report only structured findings. Reference exact frozen source evidence. Keep the rationale short and methodological; do not provide chain-of-thought.

OUTPUT JSON:
{"findings":[{"findingId":"batchId:MU-FINDING-001","issueType":"one allowed issue type","affectedDraftMuIds":["batchId:DRAFT-MU-001"],"sourceReferences":[{"transcriptId":"...","focusGroupId":"...","turnIds":["..."],"speakerId":"...","speakerRole":"participant","exactSourceText":"exact source wording"}],"recommendedAction":"retain|revise|split|merge|remove|add","conciseMethodologicalRationale":"brief auditable rationale"}]}`;

export const MU_FINAL_PROMPT_TEMPLATE = `TASK: Produce the final Meaning Unit set after applying the single supplied review pass.

RULES:
- Re-check the complete EvidenceBundle, draft MUs, and review findings.
- You may retain, revise, split, merge, remove, or add an omitted MU. Global corrections are permitted.
- Final MUs may contain only confirmed participant material and exact source wording grounded in supplied turn IDs.
- Final summaries must be concise, faithful English analytic condensations without unsupported interpretation. Close wording is acceptable when the participant statement is already concise and further paraphrasing would reduce fidelity.
- Prefix every final ID with the supplied batchId, for example transcript-1:chunk-001:MU-001.
- Lineage actions are: unchanged, revised, split, merged, added. Every final MU records derived draft IDs and applicable review finding IDs.
- Account for every removed draft MU separately with action removed. Do not emit a removed item as a final MU.
- Do not provide chain-of-thought.

OUTPUT JSON:
{"finalMeaningUnits":[{"muId":"batchId:MU-001","transcriptId":"...","focusGroupId":"...","speakerId":"...","speakerRole":"participant","sourceLocation":{"turnIds":["..."]},"sourceText":"exact source wording","summary":"concise English condensation","uncertainty":"optional concise uncertainty","sourceDraftMuIds":["batchId:DRAFT-MU-001"],"appliedReviewFindingIds":["batchId:MU-FINDING-001"],"reviewAction":"unchanged|revised|split|merged|added"}],"removedDraftMeaningUnits":[{"draftMuId":"batchId:DRAFT-MU-002","reviewAction":"removed","appliedReviewFindingIds":["batchId:MU-FINDING-002"],"conciseMethodologicalRationale":"brief auditable rationale"}]}`;

export const JSON_REPAIR_PROMPT_TEMPLATE = `Repair the supplied response into the requested JSON schema without changing its analytic content. Do not add, omit, improve, reinterpret, or select analytic findings. Return only repaired JSON.`;

function promptRef(template: string): PromptTemplateReference {
  return { version: MU_PROMPT_VERSION, hash: sha256(template) };
}

export const meaningUnitPromptReferences = Object.freeze({
  generation: promptRef(`${MU_SYSTEM_PROMPT}\n\n${MU_DRAFT_PROMPT_TEMPLATE}`),
  selfReview: promptRef(`${MU_SYSTEM_PROMPT}\n\n${MU_REVIEW_PROMPT_TEMPLATE}`),
  finalRevision: promptRef(`${MU_SYSTEM_PROMPT}\n\n${MU_FINAL_PROMPT_TEMPLATE}`),
  jsonRepair: promptRef(`${MU_SYSTEM_PROMPT}\n\n${JSON_REPAIR_PROMPT_TEMPLATE}`)
});

function evidenceText(evidence: unknown) {
  return `\n\nLOCKED EVIDENCE BUNDLE:\n${JSON.stringify(evidence)}`;
}

export function buildDraftMuPrompt(evidence: unknown) {
  return `${MU_DRAFT_PROMPT_TEMPLATE}${evidenceText(evidence)}`;
}

export function buildReviewMuPrompt(
  evidence: unknown,
  draftMeaningUnits: DraftMeaningUnit[]
) {
  return `${MU_REVIEW_PROMPT_TEMPLATE}${evidenceText(evidence)}\n\nDRAFT MEANING UNITS:\n${JSON.stringify({ draftMeaningUnits })}`;
}

export function buildFinalMuPrompt(
  evidence: unknown,
  draftMeaningUnits: DraftMeaningUnit[],
  findings: MeaningUnitReviewFinding[]
) {
  return `${MU_FINAL_PROMPT_TEMPLATE}${evidenceText(evidence)}\n\nDRAFT MEANING UNITS:\n${JSON.stringify({ draftMeaningUnits })}\n\nREVIEW FINDINGS:\n${JSON.stringify({ findings })}`;
}
