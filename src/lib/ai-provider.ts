import type {
  CategoryMode,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerComment,
  ReviewerWorkspace
} from "@/lib/types";
import { addRunEvent } from "@/lib/run-logs";
import {
  getOllamaChatCompletionsUrl,
  getOllamaConnectionErrorMessage,
  getOllamaModel
} from "@/lib/ollama-config";

type AiProvider = "ollama";

interface OllamaMessage {
  role: "system" | "user";
  content: string;
}

interface MeaningUnitInput {
  abortSignal?: AbortSignal;
  caseId?: string;
  lightInterpretation: boolean;
  project: Project;
  runId?: string;
  segmentId?: string;
  startingNumber?: number;
  transcript: string;
}

interface CategoryInput {
  existingCategories?: CategoryNode[];
  allBatchesProcessed?: boolean;
  mode: CategoryMode;
  project: Project;
  units: MeaningUnit[];
}

interface ReviewerInput {
  categoryMode?: CategoryMode;
  project: Project;
  reviewerWorkspace: ReviewerWorkspace;
  units: MeaningUnit[];
  categories: CategoryNode[];
  integratedNarrative: string;
}

interface TranscriptProcessingInput {
  abortSignal?: AbortSignal;
  language: Project["language"];
  runId?: string;
  transcript: string;
  transcriptionSegments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export interface MeaningUnitResult {
  provider: AiProvider;
  model?: string;
  caseId: string;
  segmentId: string;
  lightInterpretation: boolean;
  meaningUnits: MeaningUnit[];
  uncertainties: Array<{ unit: number; note: string }>;
  nextInstruction: string;
}

export interface CategoryResult {
  provider: AiProvider;
  model?: string;
  caseId: string;
  researchQuestion: string;
  mode: CategoryMode;
  categories: CategoryNode[];
  categoryRevisions: string[];
  structuralModel: string;
  integratedNarrative: string;
  isFallbackDraft: boolean;
  uncertainties: string[];
}

export interface ReviewerResult {
  provider: AiProvider;
  model?: string;
  status: "completed";
  comments: ReviewerComment[];
}

export interface TranscriptProcessingResult {
  provider: AiProvider;
  model?: string;
  sanitizedTranscript: string;
  privacyFindings: string[];
  speakerNotes: string[];
}

export function getAiProvider(): AiProvider {
  return "ollama";
}

export async function generateMeaningUnits(
  input: MeaningUnitInput
): Promise<MeaningUnitResult> {
  assertOllamaConfigured();
  assertNonEmpty(input.transcript, "Transcript is required before generating meaning units.");

  const model = getOllamaModel();
  const chunks = chunkMeaningUnitCandidates(
    input.transcript,
    Number(process.env.TRANSCRIPT_MU_CHUNK_CHARS ?? 1200)
  );
  console.info("[gdiqr:mu] generation start", {
    candidateChunkCount: chunks.length,
    model,
    provider: "ollama",
    transcriptChars: input.transcript.length
  });
  const caseId = input.caseId ?? "CASE-001";
  const segmentId = input.segmentId ?? "SEG-001";
  const initialNumber = input.startingNumber ?? 1;
  const allUnits: MeaningUnit[] = [];
  const allUncertainties: Array<{ unit: number; note: string }> = [];

  addRunEvent(
    input.runId,
    `Meaning-unit generation split transcript into ${chunks.length} candidate chunk${chunks.length === 1 ? "" : "s"}`
  );

  for (const [index, chunk] of chunks.entries()) {
    throwIfAborted(input.abortSignal);
    const startedAt = Date.now();
    const startingNumber = initialNumber + allUnits.length;
    addRunEvent(
      input.runId,
      `Calling Ollama for MU candidate ${index + 1}/${chunks.length} (${chunk.length} chars)`
    );
    const result = await generateMeaningUnitsForChunkWithFallback({
      chunk,
      chunkIndex: index,
      input,
      startingNumber
    });
    addRunEvent(
      input.runId,
      `MU chunk ${index + 1}/${chunks.length} finished in ${formatDuration(Date.now() - startedAt)} with ${result.meaningUnits.length} units`
    );
    allUnits.push(...result.meaningUnits);
    allUncertainties.push(...result.uncertainties);
  }

  const transcriptWordCount = countApproxWords(input.transcript);
  const minimumExpectedUnits = Math.min(
    8,
    Math.max(1, Math.floor(transcriptWordCount / 140))
  );
  const participantUnitCount = allUnits.filter(
    (unit) => !unit.analysisExcluded && !/interviewer/i.test(unit.speaker)
  ).length;
  if (
    transcriptWordCount >= 280 &&
    participantUnitCount < minimumExpectedUnits
  ) {
    addRunEvent(
      input.runId,
      `Ollama returned only ${participantUnitCount} participant MU${participantUnitCount === 1 ? "" : "s"} for ${transcriptWordCount} words; using rule-based fallback delineation`
    );
    const fallbackUnits = fallbackMeaningUnitsFromChunk(input.transcript, initialNumber, {
      caseId,
      segmentId: "Transcript fallback"
    });
    if (fallbackUnits.length > allUnits.length) {
      console.info("[gdiqr:mu] fallback triggered because AI returned too few MUs", {
        fallbackUnits: fallbackUnits.length,
        participantUnitCount,
        transcriptWordCount
      });
      allUnits.splice(0, allUnits.length, ...fallbackUnits);
      allUncertainties.push({
        note:
          "Rule-based fallback delineation used because the local AI returned too few meaning units for the transcript length.",
        unit: initialNumber
      });
    }
  }
  console.info("[gdiqr:mu] generation finished", {
    fallbackTriggered: allUncertainties.some((item) =>
      item.note.toLowerCase().includes("fallback")
    ),
    meaningUnits: allUnits.length,
    provider: "ollama"
  });

  return {
    provider: "ollama",
    model,
    caseId,
    segmentId,
    lightInterpretation: input.lightInterpretation,
    meaningUnits: allUnits,
    uncertainties: allUncertainties,
    nextInstruction: "Review and accept or edit the generated meaning units."
  };
}

export function generateRuleBasedMeaningUnits(
  input: MeaningUnitInput,
  reason = "Rule-based draft — for researcher review."
): MeaningUnitResult {
  assertNonEmpty(input.transcript, "Transcript is required before generating meaning units.");

  const maxChars = Math.min(
    Number(process.env.TRANSCRIPT_MU_CHUNK_CHARS ?? 900),
    900
  );
  const chunks = chunkMeaningUnitCandidates(input.transcript, maxChars);
  const caseId = input.caseId ?? "CASE-001";
  const initialNumber = input.startingNumber ?? 1;
  const allUnits: MeaningUnit[] = [];

  console.info("[gdiqr:mu] rule-based fallback start", {
    candidateChunkCount: chunks.length,
    transcriptChars: input.transcript.length
  });
  addRunEvent(
    input.runId,
    `Rule-based fallback split transcript into ${chunks.length} candidate chunk${chunks.length === 1 ? "" : "s"}`
  );

  chunks.forEach((chunk, chunkIndex) => {
    const chunkUnits = fallbackMeaningUnitsFromChunk(
      chunk,
      initialNumber + allUnits.length,
      {
        caseId,
        segmentId: sourceReferenceForMeaningUnit(input.segmentId, chunkIndex)
      }
    ).map((unit) => ({
      ...unit,
      aiSummary: unit.aiSummary.startsWith("Rule-based draft")
        ? unit.aiSummary
        : unit.aiSummary,
      humanSummary: unit.humanSummary || unit.aiSummary,
      reviewerStatus: "Warning" as const,
      uncertainty: [
        "Rule-based draft — for researcher review.",
        unit.uncertainty,
        reason
      ]
        .filter(Boolean)
        .join(" ")
    }));
    allUnits.push(...chunkUnits);
  });

  console.info("[gdiqr:mu] rule-based fallback finished", {
    meaningUnits: allUnits.length
  });
  addRunEvent(
    input.runId,
    `Rule-based fallback generated ${allUnits.length} draft meaning unit${allUnits.length === 1 ? "" : "s"}`
  );

  return {
    provider: "ollama",
    model: "rule-based-fallback",
    caseId,
    segmentId: input.segmentId ?? "Transcript fallback",
    lightInterpretation: input.lightInterpretation,
    meaningUnits: allUnits,
    uncertainties: [
      {
        note: reason,
        unit: initialNumber
      }
    ],
    nextInstruction:
      "Rule-based draft MUs are provisional. Review, edit, accept, or exclude each unit."
  };
}

async function generateMeaningUnitsForChunk({
  chunk,
  chunkIndex,
  input,
  startingNumber
}: {
  chunk: string;
  chunkIndex: number;
  input: MeaningUnitInput;
  startingNumber: number;
}) {
  const result = await callOllamaJson<{
    caseId?: string;
    segmentId?: string;
    meaningUnits?: Array<Partial<MeaningUnit>>;
    uncertainties?: Array<{ unit?: number; note?: string }>;
  }>(
    [
      systemMessage(),
      {
        role: "user",
        content: `/no_think
Create GDI-QR-informed draft meaning units from this reviewed transcript source excerpt.

Rules:
- Preserve participant meaning closely.
- Do not create categories in this step.
- Do not compare this excerpt with other transcripts.
- Keep summaries concise and descriptive.
- Write aiSummary and humanSummary in the same language as the interview transcript.
- Treat this transcript excerpt as processing context, not as one meaning unit.
- Delineate meaning units when a new meaning appears.
- A meaning unit should be large enough to communicate a clear message, but small enough to remain analytically manageable.
- Create multiple meaning units when the participant shifts topic, experience, feeling, action, evaluation, or implication.
- Do not create one large meaning unit from the whole excerpt unless it genuinely contains only one clear meaning.
- Do not merge interviewer/researcher questions into participant meaning units.
- If the chunk is mainly an interviewer/researcher prompt, return it with speaker "Interviewer", reviewerStatus "Warning", and uncertainty "Context candidate; review for exclusion".
- Set humanSummary to the exact same summary text as aiSummary.
- Use reviewerStatus "Not run" unless there is a clear concern, then use "Warning".
- Start numbering at ${startingNumber}.
- Use caseId "${input.caseId ?? "CASE-001"}" and source reference "${sourceReferenceForMeaningUnit(input.segmentId, chunkIndex)}".
- Return only JSON matching this shape:
{
  "caseId": "${input.caseId ?? "CASE-001"}",
  "segmentId": "${sourceReferenceForMeaningUnit(input.segmentId, chunkIndex)}",
  "meaningUnits": [
    {
      "speaker": "Participant",
      "number": 1,
      "excerpt": "short verbatim excerpt",
      "aiSummary": "concise summary",
      "humanSummary": "concise summary",
      "tentativeInterpretation": "",
      "uncertainty": "",
      "reviewerStatus": "Not run"
    }
  ],
  "uncertainties": [{"unit": 1, "note": "optional note"}]
}

Project title: ${input.project.title}
Research question: ${input.project.researchQuestion}
Interview language: ${input.project.language}
Light interpretation: ${input.lightInterpretation ? "on" : "off"}
Transcript chunk: ${chunkIndex + 1}

Transcript:
${chunk}`
      }
    ],
    {
      maxTokens: Number(process.env.OLLAMA_MU_MAX_TOKENS ?? 1800),
      signal: input.abortSignal,
      timeoutMs: getMeaningUnitChunkTimeoutMs()
    }
  );

  return {
    meaningUnits: normalizeMeaningUnits(
      result.meaningUnits ?? [],
      startingNumber,
      {
        caseId: input.caseId ?? result.caseId ?? "CASE-001",
        segmentId:
          input.segmentId ??
          result.segmentId ??
          sourceReferenceForMeaningUnit(input.segmentId, chunkIndex)
      }
    ),
    uncertainties: (result.uncertainties ?? [])
      .filter((item) => item.unit && item.note)
      .map((item) => ({ unit: item.unit ?? 0, note: item.note ?? "" })),
  };
}

async function generateMeaningUnitsForChunkWithFallback({
  chunk,
  chunkIndex,
  input,
  startingNumber
}: {
  chunk: string;
  chunkIndex: number;
  input: MeaningUnitInput;
  startingNumber: number;
}) {
  try {
    const result = await generateMeaningUnitsForChunk({
      chunk,
      chunkIndex,
      input,
      startingNumber
    });
    if (result.meaningUnits.length === 0) {
      throw new Error("Ollama returned no draft meaning units.");
    }
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meaning-unit chunk failed.";
    addRunEvent(
      input.runId,
      `MU chunk ${chunkIndex + 1} failed; using local fallback. ${message}`
    );

    return {
      meaningUnits: fallbackMeaningUnitsFromChunk(chunk, startingNumber, {
        caseId: input.caseId ?? "CASE-001",
        segmentId: sourceReferenceForMeaningUnit(input.segmentId, chunkIndex)
      }),
      uncertainties: [
        {
          note: `Local fallback used because Ollama failed for chunk ${chunkIndex + 1}: ${message}`,
          unit: startingNumber
        }
      ]
    };
  }
}

export async function generateCategories(
  input: CategoryInput
): Promise<CategoryResult> {
  assertOllamaConfigured();
  if (input.units.length === 0) {
    throw new Error("Meaning units are required before generating categories.");
  }

  const model = getOllamaModel();
  try {
    const result = await callOllamaJson<{
      categories?: Array<Partial<CategoryNode>>;
      categoryRevisions?: string[];
      structuralModel?: string;
      integratedNarrative?: string;
      uncertainties?: string[];
    }>(
      [
        systemMessage(),
        {
          role: "user",
          content: buildCategoryGenerationPrompt(input)
        }
      ],
      {
        maxTokens: Number(process.env.OLLAMA_CATEGORY_MAX_TOKENS ?? 1800),
        timeoutMs: getOllamaTimeoutMs()
      }
    );
    const categories = normalizeCategories(result.categories ?? [], "ai");
    if (categories.length === 0) {
      throw new Error("Local AI returned no categories.");
    }

    return {
      provider: "ollama",
      model,
      caseId: input.units[0]?.caseId ?? "CASE-001",
      researchQuestion: input.project.researchQuestion,
      mode: input.mode,
      categories,
      categoryRevisions: stringArray(result.categoryRevisions),
      structuralModel: result.structuralModel ?? "",
      integratedNarrative: result.integratedNarrative ?? "",
      isFallbackDraft: false,
      uncertainties: stringArray(result.uncertainties)
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Category generation failed.";
    const categories = fallbackCategoriesFromUnits(input.units);

    return {
      provider: "ollama",
      model,
      caseId: input.units[0]?.caseId ?? "CASE-001",
      researchQuestion: input.project.researchQuestion,
      mode: input.mode,
      categories,
      categoryRevisions: [
        `Local fallback category draft used because Ollama did not return a usable category result: ${message}`
      ],
      structuralModel: "",
      integratedNarrative:
        input.mode === "C"
          ? buildFallbackIntegrationNarrative(categories, input.units)
          : "",
      isFallbackDraft: true,
      uncertainties: [
        "Local fallback categories are mechanical draft groupings from confirmed summaries. Review, rename, merge, or replace them before treating them as analysis."
      ]
    };
  }
}

function buildFallbackIntegrationNarrative(
  categories: CategoryNode[],
  units: MeaningUnit[]
) {
  const categoryLines = categories
    .map((category) => {
      const linkedUnits = units.filter((unit) =>
        category.includedUnitIds.includes(unit.number)
      );
      const evidence = linkedUnits
        .slice(0, 2)
        .map((unit) => `MU #${unit.number}: ${unit.humanSummary || unit.aiSummary}`)
        .join("; ");
      return `- ${category.name}: ${category.definition}${evidence ? ` Evidence: ${evidence}` : ""}`;
    })
    .join("\n");

  return [
    "Brief overview:",
    "This fallback integration draft is a placeholder created because the local AI did not return usable Mode C output. It should be treated only as an editable starting point for researcher review.",
    "",
    "Key categories to review:",
    categoryLines || "- No reviewed categories are available yet.",
    "",
    "Provisional interpretation:",
    "Within this transcript, the participant's account should be synthesised cautiously from the confirmed meaning units and reviewed categories only. Rewrite this section after checking the supporting evidence.",
    "",
    "Methodological cautions:",
    "- This draft is based on one transcript workspace and should not be treated as generalisable evidence.",
    "- Avoid clinical, causal, or broad claims unless directly supported by the participant's account.",
    "- Check that no sensitive placeholders or identifiers appear in analytic claims."
  ].join("\n");
}

export async function generateReviewer(
  input: ReviewerInput
): Promise<ReviewerResult> {
  assertOllamaConfigured();
  if (input.units.length === 0) {
    throw new Error("Meaning units are required before running reviewer agents.");
  }

  const model = getOllamaModel();
  const result = await callOllamaJson<{
    issues?: Array<Partial<ReviewerComment>>;
    comments?: Array<Partial<ReviewerComment>>;
  }>(
    [
      systemMessage(),
      {
        role: "user",
        content:
          input.reviewerWorkspace === "categories"
            ? buildCategoryReviewerPrompt(input)
            : buildMeaningUnitReviewerPrompt(input)
      }
    ],
    {
      maxTokens: Number(process.env.OLLAMA_REVIEWER_MAX_TOKENS ?? 1200),
      timeoutMs: getOllamaTimeoutMs()
    }
  );

  return {
    provider: "ollama",
    model,
    status: "completed",
    comments: normalizeReviewerComments(
      result.issues ?? result.comments ?? [],
      input.reviewerWorkspace
    )
  };
}

export async function processTranscriptForPrivacyAndSpeakers(
  input: TranscriptProcessingInput
): Promise<TranscriptProcessingResult> {
  assertOllamaConfigured();
  assertNonEmpty(input.transcript, "Transcript is required before privacy review.");

  const model = getOllamaModel();
  const chunks = chunkTranscript(
    input.transcript,
    Number(process.env.TRANSCRIPT_PROCESS_CHUNK_CHARS ?? 6000)
  );
  const results: TranscriptProcessingResult[] = [];

  addRunEvent(
    input.runId,
    `Privacy/speaker processing split transcript into ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`
  );

  for (const [index, chunk] of chunks.entries()) {
    const startedAt = Date.now();
    addRunEvent(
      input.runId,
      `Processing transcript chunk ${index + 1}/${chunks.length} (${chunk.length} chars)`
    );
    const result = await processTranscriptChunk({
      chunk,
      chunkIndex: index,
      language: input.language,
      runId: input.runId,
      signal: input.abortSignal,
      transcriptionSegments:
        chunks.length === 1 ? input.transcriptionSegments : undefined
    });
    addRunEvent(
      input.runId,
      `Finished transcript chunk ${index + 1}/${chunks.length} in ${formatDuration(Date.now() - startedAt)}`
    );
    results.push(result);
  }

  const sanitizedTranscript = results
    .map((result) => result.sanitizedTranscript)
    .join("\n\n")
    .trim();

  assertNonEmpty(
    sanitizedTranscript,
    "Privacy/speaker transcript processing returned an empty transcript."
  );

  return {
    provider: "ollama",
    model,
    sanitizedTranscript,
    privacyFindings: results.flatMap((result) => result.privacyFindings),
    speakerNotes: results.flatMap((result) => result.speakerNotes)
  };
}

export function prepareTranscriptWithLocalRules(
  input: TranscriptProcessingInput,
  reason = "Local rule-based transcript preparation used for demo responsiveness."
): TranscriptProcessingResult {
  assertNonEmpty(input.transcript, "Transcript is required before privacy review.");

  const chunks = chunkTranscript(
    input.transcript,
    Number(process.env.TRANSCRIPT_PROCESS_CHUNK_CHARS ?? 6000)
  );
  console.info("[gdiqr:transcript-prepare] local fallback start", {
    chunkCount: chunks.length,
    transcriptChars: input.transcript.length
  });
  addRunEvent(
    input.runId,
    `Local rule-based transcript preparation started (${chunks.length} chunk${chunks.length === 1 ? "" : "s"})`
  );
  const sanitizedTranscript = chunks.map(fallbackPrepareTranscript).join("\n\n");

  return {
    provider: "ollama",
    model: "local-rule-based-fallback",
    sanitizedTranscript,
    privacyFindings: [
      `${reason} Please review names, places, institutions, contact details, and other sensitive information before saving or analysis.`
    ],
    speakerNotes: [
      "Speaker labels were inferred by local rules for demo responsiveness. Please check Interviewer/Participant labels carefully."
    ]
  };
}

function buildCategoryGenerationPrompt(input: CategoryInput) {
  const existingCategories =
    input.existingCategories && input.existingCategories.length > 0
      ? JSON.stringify(input.existingCategories, null, 2)
      : "None";
  const modeInstructions =
    input.mode === "A"
      ? `MODE A - Initial Category Construction
- Use when no existing category system is being refined.
- Compare summaries within this single-transcript batch.
- Cluster summaries into substantive categories that answer the research question.
- Create subcategories only when there are strong internal conceptual distinctions.
- Define each category clearly and list included MU numbers.
- Do not produce narrative integration.`
      : input.mode === "B"
        ? `MODE B - Category Expansion and Refinement
- Mode B generates provisional analytic groupings from confirmed meaning units. These are draft categories for researcher review, not findings.
- Use the existing category system as the starting point.
- Compare each confirmed summary against existing categories/subcategories.
- Decide whether each summary fits, requires a new category/subcategory, or suggests merging/redefining categories.
- Explicitly report structural changes in categoryRevisions.
- Maintain parsimony and avoid category proliferation.
- Generate concise analytic titles, not raw transcript openings.
- Avoid greetings, names, identifiers, sensitive placeholders, interviewer questions, or identity details in category titles.
- Include brief rationale and confidence when possible.
- Do not produce narrative integration.`
        : `MODE C - Provisional Integration Draft
- Use only after the researcher has confirmed all segments in this transcript have been processed and reviewed.
- Review the full category system globally for coherence and parsimony.
- Produce a provisional integration draft, not a final report.
- Use cautious wording such as "in this transcript", "the participant described", and "this account suggests".
- Do not make clinical, causal, or general claims about all students.
- Mention limitations, tensions, exceptions, and methodological cautions.
- Produce integratedNarrative that answers the research question, explains central patterns, identifies tensions/contradictions, and notes interpretative limits.
- Do not introduce new categories unless essential for coherence.`;

  return `/no_think
You are a qualitative research assistant providing draft support within a GDI-QR-informed generic descriptive-interpretive qualitative research workflow.

Task: Draft, refine, or integrate category-level material using constant comparison across researcher-confirmed meaning-unit summaries.

${modeInstructions}

Global rules:
- Use only the research question, confirmed meaning-unit summaries, and existing category system when provided.
- Do not return to raw transcript text.
- Do not introduce external theory or general world knowledge.
- Categories must address the research question and say something substantive.
- Category titles must be concise analytic labels. Do not use raw transcript greetings, names, identifiers, privacy placeholders, or interviewer wording as titles.
- Avoid categories that merely repeat interview questions or broad domains.
- Avoid redundant, trivial, or overly numerous categories.
- Subcategories must reflect conceptual distinctions, not minor wording differences.
- Preserve tensions, contradictions, and uncertainty rather than smoothing them over.
- Category includedUnitIds must refer to MU numbers only.
- Return strict JSON only, with no markdown or commentary.

Return JSON in this shape:
{
  "categories": [
    {
      "name": "category name",
      "definition": "category definition",
      "includedUnitIds": [1, 2],
      "rationale": "brief reason these MUs belong together",
      "confidence": "low | medium | high",
      "status": "ai_draft",
      "subcategories": [
        {
          "name": "subcategory name",
          "definition": "subcategory definition",
          "includedUnitIds": [1]
        }
      ]
    }
  ],
  "categoryRevisions": ["for Mode B/C: structural changes, merges, renamed categories, uncertainties"],
  "structuralModel": "Mode C only, otherwise empty string",
  "integratedNarrative": "Mode C only, otherwise empty string",
  "uncertainties": ["optional uncertainty"]
}

Project title: ${input.project.title}
Research question: ${input.project.researchQuestion}
Interview language: ${input.project.language}
Mode: ${input.mode}
All single-transcript segments processed and reviewed: ${input.allBatchesProcessed ? "yes" : "no"}

Existing category system:
${existingCategories}

Confirmed meaning-unit summaries:
${input.units
  .map(
    (unit) =>
      `MU ${unit.number} (${unit.caseId}, ${unit.segmentId})\nSpeaker: ${unit.speaker}\nSummary: ${unit.humanSummary || unit.aiSummary}`
  )
  .join("\n\n")}`;
}

function buildMeaningUnitReviewerPrompt(input: ReviewerInput) {
  return `/no_think
You are a reviewer-check assistant for a GDI-QR-informed workflow. Your task is to flag possible issues in the AI-drafted meaning units and summaries so the researcher can review them.

You are NOT generating new analysis.
You are NOT creating categories or themes.
You are NOT integrating findings.
You are not deciding validity. You are only flagging possible issues such as weak grounding, over-interpretation, uncertainty, or poor fit with this workflow stage.

Check:
1. Use only provided transcript segment.
2. No external knowledge.
3. No categories or themes at this stage.
4. No integrated findings.
5. No comparison across segments.
6. All content in the segment should be covered.
7. Meaning units should be segmented by shifts in topic, experience, meaning, emotional change, or process change.
8. Summaries should stay close to participant meaning.
9. Summaries should use phrases and key words only.
10. Summaries should avoid abstraction, theorising, diagnosis, causality, or unsupported psychological interpretation.
11. If Light Interpretation is OFF, no interpretation should appear.
12. If Light Interpretation is ON, tentative interpretation must be clearly labelled, grounded in text, brief, and non-theoretical.
13. Ambiguous meaning should be marked UNCERTAIN.

Return only structured review issues. Do not rewrite the full analysis unless a suggested revision is necessary.
If no issue is found, return an empty issues array.

Output JSON only:
{
  "issues": [
    {
      "targetType": "summary",
      "targetId": "MU7",
      "issueType": "Over-interpretation",
      "severity": "warning",
      "shortTitle": "Unsupported psychological wording",
      "comment": "The summary introduces a concept not stated by the participant.",
      "suggestedAction": "Revise using participant-close wording."
    }
  ]
}

Project:
${JSON.stringify(input.project, null, 2)}

Light interpretation: ${input.project.lightInterpretation ? "ON" : "OFF"}

Meaning units:
${input.units
  .map(
    (unit) =>
      `MU${unit.number} (${unit.caseId}, ${unit.segmentId})\nSpeaker: ${unit.speaker}\nExcerpt: ${unit.excerpt}\nAI summary: ${unit.aiSummary}\nHuman summary: ${unit.humanSummary}\nTentative interpretation: ${unit.tentativeInterpretation ?? ""}\nUncertainty: ${unit.uncertainty ?? ""}`
  )
  .join("\n\n")}`;
}

function buildCategoryReviewerPrompt(input: ReviewerInput) {
  return `/no_think
You are a reviewer-check assistant for GDI-QR-informed category-level drafting. Your task is to flag possible issues in category construction, refinement, or integration drafts so the researcher can review them.

You are NOT generating a new category system unless asked.
You are NOT creating new findings.
You are NOT returning to the raw transcript.
You are not deciding validity. You are only checking whether the category-level draft fits the selected mode and remains grounded in confirmed meaning-unit summaries.

Check based on mode:

Mode A:
- Categories are based only on provided meaning unit summaries.
- Categories address the research question.
- Categories are substantive, not trivial.
- Category proliferation is avoided.
- Subcategories are only used when conceptually distinct.
- Included unit IDs are clearly listed.
- No integrated narrative is produced.

Mode B:
- New summaries are compared with existing categories.
- The output reports whether summaries fit existing categories/subcategories or require new ones.
- Category revisions are explicitly reported.
- Overlapping categories are merged where appropriate.
- Definitions are revised when needed.
- Category proliferation is avoided.
- Category titles are analytic labels, not raw transcript phrases, names, greetings, privacy placeholders, or interviewer questions.
- Included MU summaries fit the category title and definition.
- Weak categories based on a single thin or ambiguous MU are flagged for human review.
- Unassigned or mismatched MUs are flagged so the researcher can reassign, split, merge, or remove them.
- No integrated narrative is produced.

Mode C:
- Used only after "All batches processed".
- Full category system is reviewed globally.
- Final structure is coherent and parsimonious.
- Integrated narrative answers the research question.
- Central patterns, tensions, contradictions, and interpretative limits are included.
- Claims are cautious and grounded in this transcript only.
- The narrative avoids clinical, causal, or general claims unless they are directly supported by confirmed MUs.
- Tensions, negative cases, uncertainty, and evidence limits are identified.
- Sensitive placeholders or identifiable details are not repeated in analytic claims.
- No external theory is introduced.
- No raw transcript is used.
- New categories are not introduced unless essential.

Return only structured review issues. If no issue is found, return an empty issues array.

Output JSON only:
{
  "issues": [
    {
      "targetType": "category",
      "targetId": "cat_ai_001",
      "issueType": "Category coherence",
      "severity": "warning",
      "shortTitle": "Category definition too broad",
      "comment": "The category appears to combine distinct meanings.",
      "suggestedAction": "Review included MU summaries and narrow the definition."
    }
  ]
}

Mode: ${input.categoryMode ?? "A"}
Research question: ${input.project.researchQuestion}

Confirmed meaning-unit summaries:
${input.units
  .map((unit) => `MU${unit.number}: ${unit.humanSummary || unit.aiSummary}`)
  .join("\n")}

Categories:
${JSON.stringify(input.categories, null, 2)}

Integrated narrative:
${input.integratedNarrative}`;
}

async function processTranscriptChunk({
  chunk,
  chunkIndex,
  language,
  runId,
  signal,
  transcriptionSegments
}: {
  chunk: string;
  chunkIndex: number;
  language: Project["language"];
  runId?: string;
  signal?: AbortSignal;
  transcriptionSegments?: TranscriptProcessingInput["transcriptionSegments"];
}): Promise<TranscriptProcessingResult> {
  const model = getOllamaModel();

  try {
    const result = await callOllamaJson<{
      sanitizedTranscript?: string;
      privacyFindings?: string[];
      speakerNotes?: string[];
    }>(
      [
        {
          role: "system",
          content:
            "You are a careful research transcript preparation assistant. Return strict JSON only. Do not wrap JSON in markdown. Do not output chain-of-thought."
        },
        {
          role: "user",
          content: `/no_think
Prepare this raw interview transcript chunk for qualitative analysis.

Tasks:
1. Separate speech into turns labelled exactly "Interviewer:" and "Participant:".
2. Infer speakers conservatively from questions, answers, greetings, and interview flow. If uncertain, choose the most likely label and add a short speakerNotes item.
3. Detect privacy-sensitive information, including specific person names, third-party identifiers, exact addresses, postcodes, local place names, workplaces, schools, organizations, phone numbers, emails, IDs, social handles, URLs, health-related disclosures, immigration/legal details, financial details, and highly identifying rare details.
4. For high-confidence direct identifiers or sensitive details, replace with stable bracket placeholders, for example [PERSON_1], [LOCATION_1], [POSTCODE_1], [ORGANIZATION_1], [CONTACT_1], [HEALTH_1], [FINANCIAL_1], [IMMIGRATION_1], [LEGAL_1], [IDENTIFIER_1], [DATE_1], [OTHER_PRIVATE_DETAIL_1].
5. For uncertain possible names or details that may need human review, keep the text but wrap it inline as [[PRIVACY_REVIEW:TYPE:original text]], for example "谢谢[[PRIVACY_REVIEW:PERSON:Sam]]". Add a privacyFindings note for each marker.
6. Do not summarize, translate, add new content, or remove research meaning.
7. Preserve the original interview language: ${language}.
8. Return only JSON matching this shape:
{
  "sanitizedTranscript": "Interviewer: ...\\nParticipant: ... [[PRIVACY_REVIEW:PERSON:Sam]]",
  "privacyFindings": ["[[PRIVACY_REVIEW:PERSON:Sam]] may be a specific person name"],
  "speakerNotes": ["optional uncertainty note"]
}

Raw transcript chunk ${chunkIndex + 1}:
${chunk}

Timestamped transcription segments for reference:
${JSON.stringify(transcriptionSegments?.slice(0, 60) ?? [], null, 2)}`
        }
      ],
      {
        maxTokens: Number(
          process.env.OLLAMA_TRANSCRIPT_PROCESS_MAX_TOKENS ?? 4096
        ),
        signal,
        timeoutMs: getTranscriptProcessTimeoutMs()
      }
    );

    const sanitizedTranscript = cleanText(result.sanitizedTranscript);
    if (!sanitizedTranscript) {
      throw new Error("Ollama returned an empty prepared transcript chunk.");
    }

    return {
      provider: "ollama",
      model,
      sanitizedTranscript,
      privacyFindings: stringArray(result.privacyFindings),
      speakerNotes: stringArray(result.speakerNotes)
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcript chunk processing failed.";
    addRunEvent(
      runId,
      `Chunk ${chunkIndex + 1}: AI transcript preparation did not return usable text, so a conservative local cleanup was used. Please review this transcript carefully before confirming. ${message}`
    );

    return {
      provider: "ollama",
      model,
      sanitizedTranscript: fallbackPrepareTranscript(chunk),
      privacyFindings: [
        `Chunk ${chunkIndex + 1}: local fallback masked contact/identifier patterns only`
      ],
      speakerNotes: [
        `Chunk ${chunkIndex + 1}: speaker labels were inferred by local fallback because Ollama returned an unusable chunk`
      ]
    };
  }
}

function systemMessage(): OllamaMessage {
  return {
    role: "system",
    content:
      "You are a careful qualitative research assistant providing draft support within a GDI-QR-informed generic descriptive-interpretive workflow. Return strict JSON only. Do not wrap JSON in markdown. Do not output chain-of-thought."
  };
}

async function callOllamaJson<T>(
  messages: OllamaMessage[],
  options: { maxTokens?: number; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<T> {
  const maxTokens = options.maxTokens ?? 1600;
  const timeoutMs = options.timeoutMs ?? getOllamaTimeoutMs();
  const content = await callOllamaContent(
    messages,
    timeoutMs,
    maxTokens,
    options.signal
  );

  try {
    return parseJsonObject<T>(content);
  } catch {
    const repaired = await callOllamaContent(
      [
        systemMessage(),
        {
          role: "user",
          content: `Repair this into valid JSON only. Do not add commentary, markdown, or explanation. Preserve the original fields and values as much as possible.

Invalid JSON-like content:
${content}`
        }
      ],
      Math.min(timeoutMs, 120000),
      Math.min(maxTokens, 1600),
      options.signal
    );

    return parseJsonObject<T>(repaired);
  }
}

async function callOllamaContent(
  messages: OllamaMessage[],
  timeoutMs: number,
  maxTokens: number,
  signal?: AbortSignal
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = combineAbortSignals([timeoutSignal, signal].filter(Boolean) as AbortSignal[]);
  let response: Response;
  try {
    response = await fetch(getOllamaChatCompletionsUrl(), {
      body: JSON.stringify({
        messages,
        max_tokens: maxTokens,
        model: getOllamaModel(),
        options: {
          num_predict: maxTokens
        },
        response_format: { type: "json_object" },
        stream: false,
        temperature: 0.2
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: requestSignal
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Generation stopped by user.");
    }
    if (timeoutSignal.aborted) {
      throw new Error(
        "Local AI request timed out before Ollama returned a response. Try a shorter transcript, a smaller model, or increase OLLAMA_API_TIMEOUT_MS."
      );
    }
    throw new Error(getOllamaConnectionErrorMessage());
  }

  if (!response.ok) {
    throw new Error(
      `Ollama request failed with ${response.status}. Check that model "${getOllamaModel()}" is installed and that OLLAMA_BASE_URL points to your local Ollama server.`
    );
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "Local AI did not return usable text. Try again, use a smaller/faster model, or reduce the amount of text in this step."
    );
  }

  return content;
}

function combineAbortSignals(signals: AbortSignal[]) {
  if (signals.length === 1) {
    return signals[0];
  }
  if ("any" in AbortSignal) {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error("Meaning-unit generation was stopped.");
  }
}

function parseJsonObject<T>(content: string): T {
  const stripped = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Ollama response did not contain a JSON object.");
  }

  return JSON.parse(stripped.slice(start, end + 1)) as T;
}

function getOllamaTimeoutMs() {
  return Number(process.env.OLLAMA_API_TIMEOUT_MS ?? 300000);
}

function getMeaningUnitChunkTimeoutMs() {
  return Number(
    process.env.OLLAMA_MU_CHUNK_TIMEOUT_MS ?? Math.min(getOllamaTimeoutMs(), 120000)
  );
}

function getTranscriptProcessTimeoutMs() {
  const configured = Number(
    process.env.OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS ??
      Math.min(getOllamaTimeoutMs(), 45000)
  );
  if (!Number.isFinite(configured)) {
    return 45000;
  }
  return Math.max(10000, Math.min(configured, 45000));
}

function assertOllamaConfigured() {
  if (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "ollama") {
    throw new Error("Local AI requires AI_PROVIDER=ollama.");
  }
}

function assertNonEmpty(value: string, message: string) {
  if (!value.trim()) {
    throw new Error(message);
  }
}

function chunkTranscript(transcript: string, maxChars: number) {
  const chunks: string[] = [];
  const paragraphs = transcript.split(/\n{2,}/);
  let current = "";

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.length > maxChars) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      chunks.push(...splitLongText(trimmed, maxChars));
      continue;
    }

    const candidate = current ? `${current}\n\n${trimmed}` : trimmed;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      current = trimmed;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [transcript.trim()];
}

function chunkMeaningUnitCandidates(transcript: string, maxChars: number) {
  const normalized = transcript.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!normalized) {
    return [];
  }

  const turnChunks = chunkBySpeakerTurns(normalized, maxChars);
  const baseChunks =
    turnChunks.length > 1
      ? turnChunks
      : chunkTranscriptByMeaningBoundaries(normalized, maxChars);

  const chunks = baseChunks
    .flatMap((chunk) =>
      chunk.length > maxChars ? chunkTranscriptByMeaningBoundaries(chunk, maxChars) : [chunk]
    )
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.length > 0 ? chunks : chunkTranscript(normalized, maxChars);
}

function sourceReferenceForMeaningUnit(segmentId: string | undefined, chunkIndex: number) {
  if (segmentId?.trim()) {
    return segmentId.trim();
  }
  return `Transcript excerpt ${String(chunkIndex + 1).padStart(2, "0")}`;
}

function chunkBySpeakerTurns(transcript: string, maxChars: number) {
  const turns = transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const hasSpeakerLabels = turns.some((line) => parseSpeakerLine(line));
  if (!hasSpeakerLabels) {
    return [];
  }

  const chunks: string[] = [];
  for (const turn of turns) {
    const parsed = parseSpeakerLine(turn);
    if (!parsed) {
      chunks.push(...chunkTranscriptByMeaningBoundaries(turn, maxChars));
      continue;
    }

    const speaker = normalizeSpeakerLabel(parsed.label);
    if (speaker === "interviewer") {
      chunks.push(turn);
      continue;
    }

    chunks.push(
      ...chunkTranscriptByMeaningBoundaries(turn, Math.min(maxChars, 900))
    );
  }

  return combineTinyCandidateChunks(chunks);
}

function chunkTranscriptByMeaningBoundaries(transcript: string, maxChars: number) {
  const paragraphs = transcript
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const source = paragraphs.length > 1 ? paragraphs : splitIntoSentences(transcript);
  const targetWords = 90;
  const maxWords = 160;
  const chunks: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const item of source) {
    const parts =
      countApproxWords(item) > maxWords ? splitIntoSentences(item) : [item];
    for (const part of parts) {
      const partWords = countApproxWords(part);
      const candidateWords = currentWords + partWords;
      const candidateText = [...current, part].join(" ");
      if (
        current.length > 0 &&
        (candidateWords > targetWords || candidateText.length > maxChars)
      ) {
        chunks.push(current.join(" ").trim());
        current = [];
        currentWords = 0;
      }
      current.push(part);
      currentWords += partWords;
    }
  }

  if (current.length > 0) {
    chunks.push(current.join(" ").trim());
  }

  return chunks.flatMap((chunk) =>
    chunk.length > maxChars ? splitLongText(chunk, maxChars) : [chunk]
  );
}

function combineTinyCandidateChunks(chunks: string[]) {
  const combined: string[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) {
      continue;
    }
    const last = combined[combined.length - 1];
    if (
      last &&
      countApproxWords(trimmed) < 12 &&
      !isInterviewerCandidate(trimmed) &&
      !isInterviewerCandidate(last)
    ) {
      combined[combined.length - 1] = `${last}\n${trimmed}`.trim();
    } else {
      combined.push(trimmed);
    }
  }
  return combined;
}

function splitIntoSentences(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const sentences = normalized
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length > 1 ? sentences : [normalized];
}

function countApproxWords(text: string) {
  const latinWords = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g);
  if (latinWords && latinWords.length > 0) {
    return latinWords.length;
  }
  const cjkCharacters = text.match(/[\u3400-\u9fff]/g);
  if (cjkCharacters && cjkCharacters.length > 0) {
    return Math.ceil(cjkCharacters.length / 2);
  }
  return text.trim() ? 1 : 0;
}

function parseSpeakerLine(line: string) {
  const match = line.match(/^([\p{L}][\p{L}\s.'-]{0,32}|[IQPA])\s*[:：]\s*(.*)$/u);
  if (!match) {
    return null;
  }
  return {
    content: match[2] ?? "",
    label: (match[1] ?? "").trim()
  };
}

function normalizeSpeakerLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  if (
    [
      "interviewer",
      "researcher",
      "moderator",
      "facilitator",
      "i",
      "q",
      "jiawan"
    ].includes(normalized)
  ) {
    return "interviewer";
  }
  if (["participant", "interviewee", "student", "p", "a"].includes(normalized)) {
    return "participant";
  }
  return "other";
}

function isInterviewerCandidate(text: string) {
  const parsed = parseSpeakerLine(text.split("\n")[0] ?? text);
  if (parsed && normalizeSpeakerLabel(parsed.label) === "interviewer") {
    return true;
  }
  return /[?？]\s*$/.test(text.trim());
}

function splitLongText(text: string, maxChars: number) {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChars) {
    chunks.push(text.slice(index, index + maxChars));
  }
  return chunks;
}

function fallbackPrepareTranscript(transcript: string) {
  const masked = transcript
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[CONTACT_1]")
    .replace(/https?:\/\/\S+/gi, "[URL_1]")
    .replace(/\b\+?\d[\d\s().-]{7,}\d\b/g, "[CONTACT_1]")
    .replace(/\b[A-Z]{1,3}\d{5,}[A-Z0-9]*\b/g, "[IDENTIFIER_1]")
    .replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g, "[DATE_1]");

  const lines = masked
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.some((line) => /^(interviewer|participant)\s*:/i.test(line))) {
    return lines.join("\n");
  }

  return lines
    .map((line, index) => {
      const isQuestion =
        /[?？]\s*$/.test(line) ||
        /^(can|could|would|what|when|where|why|how|tell me|请问|你能|可以|能否)/i.test(
          line
        );
      const speaker = isQuestion || index === 0 ? "Interviewer" : "Participant";
      return `${speaker}: ${line}`;
    })
    .join("\n");
}

function fallbackMeaningUnitsFromChunk(
  chunk: string,
  startingNumber: number,
  defaults: { caseId: string; segmentId: string }
) {
  const grouped = chunkTranscriptByMeaningBoundaries(chunk, 900).map((item) => [
    item
  ]);

  return grouped
    .map((group, index) => {
      const number = startingNumber + index;
      const rawText = group.join(" ").trim();
      const contextCandidate = isInterviewerCandidate(rawText);
      const text = rawText
        .replace(/^(interviewer|researcher|moderator|facilitator|participant|interviewee|student|[IQPA])\s*[:：]\s*/i, "")
        .trim();
      const excerpt = text.slice(0, 260);
      const aiSummary =
        excerpt.length > 140 ? `${excerpt.slice(0, 137)}...` : excerpt;

      return {
        id: `mu_ai_${String(number).padStart(3, "0")}`,
        segmentId: defaults.segmentId,
        caseId: defaults.caseId,
        speaker: contextCandidate ? "Interviewer" : "Participant",
        number,
        aiExcerpt: excerpt,
        excerpt,
        aiSummary: aiSummary || "Local fallback meaning unit",
        humanSummary: aiSummary || "Local fallback meaning unit",
        uncertainty:
          contextCandidate
            ? "Context candidate; review for exclusion. Generated by local fallback because the Ollama meaning-unit chunk failed."
            : "Generated by local fallback because the Ollama meaning-unit chunk failed.",
        humanStatus: contextCandidate ? "Excluded" : "Draft",
        reviewerStatus: "Warning",
        analysisExcluded: contextCandidate,
        exclusionReason: contextCandidate
          ? "Interviewer prompt/context candidate"
          : undefined
      } satisfies MeaningUnit;
    })
    .filter((unit) => unit.excerpt);
}

function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function normalizeMeaningUnits(
  items: Array<Partial<MeaningUnit>>,
  startingNumber = 1,
  defaults: { caseId: string; segmentId: string } = {
    caseId: "CASE-001",
    segmentId: "SEG-001"
  }
) {
  return items
    .map((item, index) => {
      const number = startingNumber + index;
      const aiSummary = cleanText(item.aiSummary);
      const humanSummary = cleanText(item.humanSummary);
      const speaker = cleanText(item.speaker) || "Participant";
      const normalizedSpeaker = speaker.toLowerCase();
      const contextCandidate =
        normalizedSpeaker.includes("interviewer") ||
        (!normalizedSpeaker.includes("participant") &&
          isInterviewerCandidate(cleanText(item.excerpt)));

      return {
        id: `mu_ai_${String(number).padStart(3, "0")}`,
        segmentId: cleanText(item.segmentId) || defaults.segmentId,
        caseId: cleanText(item.caseId) || defaults.caseId,
        speaker: contextCandidate ? "Interviewer" : speaker,
        number,
        aiExcerpt: cleanText(item.excerpt),
        excerpt: cleanText(item.excerpt),
        aiSummary,
        humanSummary:
          humanSummary.toLowerCase() === "same as aisummary"
            ? aiSummary
            : humanSummary || aiSummary,
        tentativeInterpretation:
          cleanText(item.tentativeInterpretation) || undefined,
        uncertainty: cleanText(item.uncertainty) || undefined,
        humanStatus: contextCandidate ? "Excluded" : "Draft",
        reviewerStatus:
          contextCandidate ||
          item.reviewerStatus === "Warning" ||
          item.reviewerStatus === "Major issue"
            ? item.reviewerStatus
              ? item.reviewerStatus
              : "Warning"
            : "Not run",
        analysisExcluded: contextCandidate,
        exclusionReason: contextCandidate
          ? "Interviewer prompt/context candidate"
          : undefined
      } satisfies MeaningUnit;
    })
    .filter((item) => item.excerpt && item.aiSummary);
}

function normalizeCategories(
  items: Array<Partial<CategoryNode>>,
  source: CategoryNode["source"] = "ai"
): CategoryNode[] {
  return items
    .map((item, index): CategoryNode => {
      const status: CategoryNode["status"] =
        source === "fallback" ? "fallback_draft" : "ai_draft";
      return {
        id: `cat_ai_${String(index + 1).padStart(3, "0")}`,
        confidence: normalizeConfidence(item.confidence),
        name:
          safeCategoryTitle(cleanText(item.name), index + 1) ||
          `Draft category ${index + 1}: Needs researcher review`,
        definition:
          cleanText(item.definition) ||
          "AI-drafted category definition. Review and edit before using.",
        includedUnitIds: numberArray(item.includedUnitIds),
        rationale: cleanText(item.rationale),
        source,
        status,
        subcategories: normalizeCategories(item.subcategories ?? [], source)
      };
    })
    .map((item) =>
      item.subcategories?.length ? item : { ...item, subcategories: undefined }
    );
}

function fallbackCategoriesFromUnits(units: MeaningUnit[]): CategoryNode[] {
  const themes = inferFallbackThemeGroups(units);
  const categories: CategoryNode[] = [];

  themes.forEach((group) => {
    categories.push({
      id: `cat_fallback_${String(categories.length + 1).padStart(3, "0")}`,
      name: `Draft category ${categories.length + 1}: ${group.title}`,
      definition:
        "This category was created by fallback grouping because the AI returned empty output. Please review and rename before using it.",
      confidence: "low",
      includedUnitIds: group.units.map((unit) => unit.number),
      rationale:
        "Fallback grouping based on broad wording patterns in confirmed meaning-unit summaries.",
      source: "fallback",
      status: "fallback_draft"
    });
  });

  return categories;
}

function inferFallbackThemeGroups(units: MeaningUnit[]) {
  const buckets: Array<{ keywords: RegExp; title: string; units: MeaningUnit[] }> = [
    { keywords: /stress|anxiety|worry|pause|react|calm|压力|焦虑|紧张/i, title: "Stress and anxiety management", units: [] },
    { keywords: /concentration|focus|study|reading|task|distraction|attention|学习|专注|阅读/i, title: "Concentration and study habits", units: [] },
    { keywords: /self-awareness|self awareness|self-compassion|self compassion|self-critic|ask for help|自我觉察|自我关怀|自责/i, title: "Self-awareness and self-compassion", units: [] },
    { keywords: /limit|challenge|difficult|recommend|magic solution|uncomfortable|impatient|限制|挑战|困难|建议/i, title: "Limits and challenges of mindfulness", units: [] }
  ];
  const reviewBucket = { title: "Needs researcher review", units: [] as MeaningUnit[] };

  units.forEach((unit) => {
    const summary = `${unit.humanSummary || unit.aiSummary} ${unit.excerpt}`;
    const bucket = buckets.find((item) => item.keywords.test(summary));
    if (bucket) {
      bucket.units.push(unit);
    } else {
      reviewBucket.units.push(unit);
    }
  });

  const used = buckets
    .filter((bucket) => bucket.units.length > 0)
    .map(({ title, units }) => ({ title, units }));
  if (reviewBucket.units.length > 0) {
    used.push(reviewBucket);
  }
  if (used.length > 0) {
    return used;
  }

  const topLevelCount = Math.min(4, Math.max(2, Math.ceil(units.length / 4)));
  const groupSize = Math.ceil(units.length / topLevelCount);
  return Array.from({ length: topLevelCount }, (_item, index) => ({
    title: "Needs researcher review",
    units: units.slice(index * groupSize, (index + 1) * groupSize)
  })).filter((group) => group.units.length > 0);
}

function safeCategoryTitle(title: string, index: number) {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (
    !cleaned ||
    /^(sure|my name is|i am|thank you|interviewer|participant said|interviewer asked)\b/i.test(cleaned) ||
    /\[(PERSON|CONTACT|LOCATION|POSTCODE|ADDRESS|IDENTIFIER)_\d+\]/i.test(cleaned)
  ) {
    return `Draft category ${index}: Needs researcher review`;
  }
  return cleaned.slice(0, 90);
}

function normalizeConfidence(value: unknown): CategoryNode["confidence"] {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : undefined;
}

function normalizeReviewerComments(
  items: Array<Partial<ReviewerComment>>,
  workspace: ReviewerWorkspace
): ReviewerComment[] {
  return items
    .map((item, index) => {
      const severity = normalizeReviewerSeverity(item.severity);
      const targetType =
        item.targetType === "meaning_unit" ||
        item.targetType === "summary" ||
        item.targetType === "segment" ||
        item.targetType === "category" ||
        item.targetType === "subcategory" ||
        item.targetType === "integrated_narrative" ||
        item.targetType === "mode_output"
          ? item.targetType
          : workspace === "categories"
            ? "mode_output"
            : "summary";
      const targetId =
        cleanText(item.targetId) ||
        cleanText(item.target) ||
        `${workspace === "categories" ? "category" : "MU"}-${index + 1}`;
      const issueType =
        cleanText(item.issueType) || cleanText(item.agent) || "Reviewer check";
      const shortTitle =
        cleanText((item as { shortTitle?: string }).shortTitle) || issueType;

      return {
        id: `rev_ai_${String(index + 1).padStart(3, "0")}`,
        agent:
          workspace === "categories"
            ? "GDI-QR Category Review"
            : "GDI-QR Meaning Units Review",
        target: `${targetType}:${targetId}`,
        targetType,
        targetId,
        issueType,
        workspace,
        severity,
        status: "unresolved" as const,
        comment:
          cleanText(item.comment) ||
          cleanText((item as { explanation?: string }).explanation) ||
          shortTitle,
        suggestedAction: cleanText(item.suggestedAction),
        resolved: false
      };
    })
    .filter((item) => item.comment);
}

function normalizeReviewerSeverity(value: unknown): ReviewerComment["severity"] {
  const cleaned = cleanText(value).toLowerCase();
  if (cleaned === "major" || cleaned === "major issue") {
    return "major";
  }
  if (cleaned === "warning") {
    return "warning";
  }
  return "info";
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
    : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(cleanText).filter((item) => item.length > 0)
    : [];
}

function toNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
