import type {
  CategoryGroupingCoverage,
  CategoryMode,
  CategoryNode,
  CategoryUnitDecision,
  MeaningUnit,
  MeaningUnitGenerationCounts,
  Project,
  ReviewerComment,
  ReviewerWorkspace
} from "@/lib/types";
import {
  validateCategoryGrouping,
  type ProposedUnassignedUnit,
} from "@/lib/category-grouping";
import { addRunEvent } from "@/lib/run-logs";
import {
  getOllamaChatCompletionsUrl,
  getOllamaNativeChatUrl,
  getOllamaConnectionErrorMessage,
  getOllamaModel,
} from "@/lib/ollama-config";
import { cleanTranscriptSourceForAnalysis } from "@/lib/transcript-source-cleaner";
import {
  parseSpeakerLine,
  splitTranscriptIntoSpeakerTurns,
} from "@/lib/transcript-speakers";
import {
  countMeaningWords,
  splitParticipantTurnConservatively,
} from "@/lib/meaning-unit-boundaries";
import {
  addCrossUnitBoundaryWarnings,
  buildSemanticAnalysisWindows,
  contextForSourceTurns,
  isOpeningBackgroundTurn,
  preprocessTranscriptForMeaningUnits,
  reviewerWarningsForMeaningUnit,
  type ClassifiedTranscriptTurn,
  type SemanticAnalysisWindow,
} from "@/lib/meaning-unit-preprocessing";
import {
  isOpeningBackgroundCandidate,
  OPENING_BACKGROUND_REVIEW_WARNING,
} from "@/lib/meaning-unit-review-flags";
import {
  buildGdiqrStageKnowledge,
  buildGdiqrSystemMessage,
  type GdiqrAiStage,
} from "@/lib/gdiqr-ai-knowledge";

type AiProvider = "ollama";

interface OllamaMessage {
  role: "system" | "user";
  content: string;
}

interface SemanticMeaningUnitCandidate extends Partial<MeaningUnit> {
  end_quote?: string;
  endQuote?: string;
  start_quote?: string;
  startQuote?: string;
  summary?: string;
  source_turn_ids?: string[];
}

type SemanticWindowDecision =
  | "meaning_units"
  | "no_substantive_meaning";

interface SemanticWindowResult {
  analysisDecision?: SemanticWindowDecision;
  decisionReason: string;
  meaningUnits: MeaningUnit[];
  noSubstantiveSourceTurnIds: string[];
  returnedCandidateCount: number;
  uncertainties: Array<{ unit: number; note: string }>;
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
  counts: MeaningUnitGenerationCounts;
  generationMethod: "ai_semantic" | "mixed" | "rule_based_fallback";
}

export interface CategoryResult {
  provider: AiProvider;
  model?: string;
  caseId: string;
  researchQuestion: string;
  mode: CategoryMode;
  categories: CategoryNode[];
  categoryUnitDecisions: CategoryUnitDecision[];
  coverage: CategoryGroupingCoverage;
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
  input: MeaningUnitInput,
): Promise<MeaningUnitResult> {
  assertOllamaConfigured();
  assertNonEmpty(
    input.transcript,
    "Transcript is required before generating meaning units.",
  );
  const cleanedSource = cleanTranscriptSourceForAnalysis(
    input.transcript,
    input.project,
  );
  assertNonEmpty(
    cleanedSource.transcript,
    "Interview transcript / participant account is required before generating meaning units.",
  );
  if (cleanedSource.removedLineCount > 0) {
    addRunEvent(
      input.runId,
      `Removed ${cleanedSource.removedLineCount} non-transcript setup/metadata line${cleanedSource.removedLineCount === 1 ? "" : "s"} before MU generation`,
    );
  }

  const model = getOllamaModel();
  const turns = preprocessTranscriptForMeaningUnits(
    cleanedSource.transcript,
    input.project,
  );
  const windows = buildSemanticAnalysisWindows(
    turns,
    Number(process.env.TRANSCRIPT_MU_WINDOW_CHARS ?? 6000),
  );
  console.info("[gdiqr:mu] generation start", {
    participantTurnCount: turns.filter((turn) => turn.role === "participant")
      .length,
    semanticWindowCount: windows.length,
    model,
    provider: "ollama",
    transcriptChars: cleanedSource.transcript.length,
  });
  const caseId = input.caseId ?? "CASE-001";
  const segmentId = input.segmentId ?? "SEG-001";
  const initialNumber = input.startingNumber ?? 1;
  const allUnits: MeaningUnit[] = [];
  const allUncertainties: Array<{ unit: number; note: string }> = [];
  const noSubstantiveSourceTurnIds = new Set<string>();

  addRunEvent(
    input.runId,
    `Classified ${turns.length} transcript turns and prepared ${windows.length} conversational window${windows.length === 1 ? "" : "s"} for semantic delineation`,
  );

  for (const [index, window] of windows.entries()) {
    throwIfAborted(input.abortSignal);
    const startedAt = Date.now();
    addRunEvent(
      input.runId,
      `Calling Ollama for semantic window ${index + 1}/${windows.length} (${window.participantTurns.length} participant turns plus context)`,
    );
    const result = await generateMeaningUnitsForWindowWithSafeguards({
      input,
      startingNumber: initialNumber + allUnits.length,
      window,
      windowIndex: index,
    });
    addRunEvent(
      input.runId,
      `Semantic window ${index + 1}/${windows.length} finished in ${formatDuration(Date.now() - startedAt)} with ${result.meaningUnits.length} substantive draft MUs`,
    );
    allUnits.push(...result.meaningUnits);
    allUncertainties.push(...result.uncertainties);
    result.noSubstantiveSourceTurnIds.forEach((turnId) =>
      noSubstantiveSourceTurnIds.add(turnId),
    );
  }

  const overlapSafeResult = consolidateOverlappingSemanticMeaningUnits(
    allUnits,
    turns,
  );
  if (overlapSafeResult.overlapGroupCount > 0) {
    addRunEvent(
      input.runId,
      `A final traceability check found ${overlapSafeResult.overlapGroupCount} overlapping semantic boundary group${overlapSafeResult.overlapGroupCount === 1 ? "" : "s"}; ${overlapSafeResult.collapsedCandidateCount} duplicate/nested candidates were collapsed into uncertain source spans for researcher splitting`,
    );
  }
  const reviewedUnits = addCrossUnitBoundaryWarnings(
    overlapSafeResult.meaningUnits,
    turns,
  );
  const meaningUnits = orderAndNumberAnalysisRecords(
    reviewedUnits,
    turns,
    initialNumber,
  );
  const counts = countGenerationRecords(
    turns,
    meaningUnits,
    noSubstantiveSourceTurnIds,
  );
  console.info("[gdiqr:mu] generation finished", {
    counts,
    fallbackTriggered: false,
    provider: "ollama",
  });

  return {
    provider: "ollama",
    model,
    caseId,
    segmentId,
    lightInterpretation: input.lightInterpretation,
    meaningUnits,
    uncertainties: allUncertainties,
    nextInstruction: "Review and accept or edit the generated meaning units.",
    counts,
    generationMethod: "ai_semantic",
  };
}

export function generateRuleBasedMeaningUnits(
  input: MeaningUnitInput,
  reason = "Rule-based draft — for researcher review.",
): MeaningUnitResult {
  assertNonEmpty(
    input.transcript,
    "Transcript is required before generating meaning units.",
  );
  const cleanedSource = cleanTranscriptSourceForAnalysis(
    input.transcript,
    input.project,
  );
  assertNonEmpty(
    cleanedSource.transcript,
    "Interview transcript / participant account is required before generating meaning units.",
  );

  const turns = preprocessTranscriptForMeaningUnits(
    cleanedSource.transcript,
    input.project,
  );
  const caseId = input.caseId ?? "CASE-001";
  const segmentId = input.segmentId ?? "Transcript fallback";
  const initialNumber = input.startingNumber ?? 1;
  console.info("[gdiqr:mu] rule-based fallback start", {
    transcriptTurnCount: turns.length,
    transcriptChars: cleanedSource.transcript.length,
  });
  if (cleanedSource.removedLineCount > 0) {
    addRunEvent(
      input.runId,
      `Removed ${cleanedSource.removedLineCount} non-transcript setup/metadata line${cleanedSource.removedLineCount === 1 ? "" : "s"} before rule-based MU generation`,
    );
  }
  addRunEvent(
    input.runId,
    `Rule-based fallback classified ${turns.length} transcript turns before structural preprocessing`,
  );

  const substantiveRecords = fallbackMeaningUnitsFromTurns(turns, {
    caseId,
    segmentId,
  }).map((unit) => ({
    ...unit,
    contextExcerpt: contextForSourceTurns(unit.sourceTurnIds ?? [], turns),
  }));
  const allUnits = orderAndNumberAnalysisRecords(
    substantiveRecords,
    turns,
    initialNumber,
  );
  const counts = countGenerationRecords(turns, allUnits);

  console.info("[gdiqr:mu] rule-based fallback finished", {
    meaningUnits: allUnits.length,
  });
  addRunEvent(
    input.runId,
    `Rule-based fallback generated ${allUnits.length} traceable structural/context record${allUnits.length === 1 ? "" : "s"}; semantic MUs were not generated`,
  );

  return {
    provider: "ollama",
    model: "rule-based-fallback",
    caseId,
    segmentId,
    lightInterpretation: input.lightInterpretation,
    meaningUnits: allUnits,
    uncertainties: [
      {
        note: reason,
        unit: initialNumber,
      },
    ],
    nextInstruction:
      "These are provisional structural spans, not completed semantic MUs. Delineate and summarise participant meanings before accepting them.",
    counts,
    generationMethod: "rule_based_fallback",
  };
}

async function generateMeaningUnitsForWindow({
  input,
  revisionDirective,
  startingNumber,
  window,
  windowIndex,
}: {
  input: MeaningUnitInput;
  revisionDirective?: string;
  startingNumber: number;
  window: SemanticAnalysisWindow;
  windowIndex: number;
}) {
  const result = await callOllamaJson<{
    analysisDecision?: SemanticWindowDecision;
    analysis_decision?: SemanticWindowDecision;
    caseId?: string;
    decisionReason?: string;
    decision_reason?: string;
    segmentId?: string;
    meaningUnits?: SemanticMeaningUnitCandidate[];
    meaning_units?: SemanticMeaningUnitCandidate[];
    noSubstantiveSourceTurnIds?: string[];
    no_substantive_source_turn_ids?: string[];
    units?: SemanticMeaningUnitCandidate[];
    uncertainties?: Array<{ unit?: number; note?: string }>;
  }>(
    [
      systemMessage("meaning_unit"),
      {
        role: "user",
        content: `/no_think
Create GDI-QR-informed draft meaning units from this role-classified conversational window.
${revisionDirective ? `\nMANDATORY REVISION: ${revisionDirective}\n` : ""}

Task-specific rules:
- Analyse only text explicitly marked PARTICIPANT MATERIAL TO ANALYSE. Context is interpretive support, never participant evidence.
- Never create a substantive MU from facilitator, moderator, interviewer, or researcher speech.
- Never combine different participants' speech in one MU. A participant may be reconnected across a short facilitator clarification when the later turn continues the same meaning.
- Return a non-overlapping partition of participant evidence. Two MUs must never reuse the same source passage, contain one another, or overlap. Each participant phrase may belong to at most one MU in this response.
- Preserve participant meaning closely and privilege participant wording over facilitator paraphrases or leading questions.
- Keep each summary concise, descriptive, data-near, and in the transcript language. Condense the central participant meaning without copying the excerpt or adding theory, diagnosis, motivation, unsupported causality, or category-level interpretation.
- Evaluate relevance against the overall research question, not merely the immediately preceding facilitator question. Mark genuinely uncertain relevance "uncertain" so a researcher can decide; do not silently omit uncertain material.
- A participant turn is a source container, not an automatic MU. A window may legitimately produce no substantive MU when all of its participant material is purely procedural, conversational, clearly unrelated to the research purpose, or otherwise non-analytic.
- If the entire window has no substantive meaning, return analysisDecision "no_substantive_meaning", an empty units array, a brief decisionReason, and noSubstantiveSourceTurnIds containing every participant TURN identifier in the window. This is a provisional AI classification, not a researcher exclusion.
- Never use an empty units array for uncertainty, output failure, or difficulty choosing boundaries. If relevance is uncertain, return a reviewable unit classified "uncertain".
- Otherwise return analysisDecision "meaning_units" and delineate every substantive or uncertain participant meaning. Opening/icebreaker and background material remains eligible and reviewable when it carries a substantive or uncertain meaning.
- If a window mixes substantive or uncertain meanings with a clearly non-analytic participant span, return that span as a "non_analytic" review record so it is not silently lost or categorised.
- Classification is assistance only. Every returned classification and every no-substantive decision remains provisional until researcher review.
- Use conservative, meaning-preserving delineation. Sentence punctuation and speaker turns are not MU boundaries. Treat each participant turn only as a source container, never as a default MU.
- Split at a substantial shift in experience, evaluation, concern, proposal, reason, time point, or perspective when one concise summary cannot accurately cover the full span.
- Keep connected examples, explanations, reasons, and consequences together when they elaborate the same meaning.
- Before returning JSON, apply the summary test separately to every participant account: if a proposed summary needs a list or joins independent central meanings with "and", "also", or "but", split that span unless the clauses form one reason/example/consequence chain.
- Before choosing anchors, map the participant's central meanings across the whole turn. A long answer may produce one MU or several MUs; return one only when its single concise summary preserves every central meaning without becoming a list.
- Do not anchor one MU from the beginning to the end of a long answer merely because it is one uninterrupted turn. Conversely, do not split connected sentences that develop one experience, reason, example, or consequence.
- A short facilitator clarification does not force a new MU when the same participant continues the same meaning, but a later participant clarification takes priority over the facilitator's wording.
- Delineate each MU with compact exact boundary anchors instead of repeating the full excerpt: startQuote and endQuote must each be a short verbatim phrase copied from the participant material. The application reconstructs the full participant excerpt between those anchors.
- Boundary anchors must not contain speaker labels or facilitator wording.
- Return sourceTurnIds for every MU, using only the TURN identifiers shown below.
- classification must be "substantive_participant", "non_analytic", or "uncertain". Context turns are retained separately by the application and must not be returned as MUs.
- If Light Interpretation is OFF, tentativeInterpretation must be an empty string.
- If Light Interpretation is ON, tentativeInterpretation may contain at most one brief, explicitly tentative, transcript-grounded note. Otherwise leave it empty.
- Participant claims about institutions, cultures, treatment credibility/effectiveness, or other external matters must be phrased as participant perceptions rather than objective facts.
- If facilitator/interviewer wording is corrected or qualified by a participant, preserve the participant clarification and do not adopt the facilitator framing as participant meaning.
- Start numbering at ${startingNumber}.
- Use caseId "${input.caseId ?? "CASE-001"}" and source reference "${sourceReferenceForMeaningUnit(input.segmentId, windowIndex)}".
- Return only JSON matching this shape:
{
  "caseId": "${input.caseId ?? "CASE-001"}",
  "segmentId": "${sourceReferenceForMeaningUnit(input.segmentId, windowIndex)}",
  "analysisDecision": "meaning_units",
  "decisionReason": "brief reason for the window-level decision",
  "noSubstantiveSourceTurnIds": [],
  "units": [
    {
      "speaker": "Participant F1",
      "speakerRole": "participant",
      "classification": "substantive_participant",
      "sourceTurnIds": ["TURN-0002"],
      "number": 1,
      "startQuote": "exact opening words of this MU",
      "endQuote": "exact closing words of this MU",
      "summary": "concise summary",
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
Conversational window: ${windowIndex + 1}

Role-classified conversation (context and participant material are deliberately separated):
${window.promptText}`,
      },
    ],
    {
      maxTokens: Number(
        process.env.OLLAMA_MU_BOUNDARY_MAX_TOKENS ?? 2400,
      ),
      onJsonRetry: (stage, message) =>
        addRunEvent(
          input.runId,
          stage === "repair"
            ? `Semantic window ${windowIndex + 1} returned malformed JSON; attempting a lossless JSON repair. ${message}`
            : `Semantic window ${windowIndex + 1} repair output was still invalid; regenerating this window once as compact JSON. ${message}`,
        ),
      signal: input.abortSignal,
      temperature: 0,
      timeoutMs: getMeaningUnitChunkTimeoutMs(),
    },
  );

  const returnedUnits =
    result.meaningUnits ?? result.meaning_units ?? result.units ?? [];
  const analysisDecision =
    result.analysisDecision ?? result.analysis_decision;
  const requestedNoSubstantiveTurnIds =
    result.noSubstantiveSourceTurnIds ??
    result.no_substantive_source_turn_ids ??
    [];
  return {
    analysisDecision,
    decisionReason: cleanText(
      result.decisionReason ?? result.decision_reason,
    ),
    meaningUnits: normalizeSemanticMeaningUnits(
      returnedUnits,
      startingNumber,
      {
        caseId: input.caseId ?? result.caseId ?? "CASE-001",
        segmentId:
          input.segmentId ??
          result.segmentId ??
          sourceReferenceForMeaningUnit(input.segmentId, windowIndex),
      },
      window.turns,
    ),
    noSubstantiveSourceTurnIds: Array.isArray(
      requestedNoSubstantiveTurnIds,
    )
      ? requestedNoSubstantiveTurnIds.map(cleanText).filter(Boolean)
      : [],
    returnedCandidateCount: Array.isArray(returnedUnits)
      ? returnedUnits.length
      : 0,
    uncertainties: (result.uncertainties ?? [])
      .filter((item) => item.unit && item.note)
      .map((item) => ({ unit: item.unit ?? 0, note: item.note ?? "" })),
  };
}

async function generateMeaningUnitsForWindowWithSafeguards({
  input,
  startingNumber,
  window,
  windowIndex,
}: {
  input: MeaningUnitInput;
  startingNumber: number;
  window: SemanticAnalysisWindow;
  windowIndex: number;
}) {
  try {
    let result = await generateMeaningUnitsForWindow({
      input,
      startingNumber,
      window,
      windowIndex,
    });
    if (result.meaningUnits.length === 0) {
      const explicitNoMeaning = validateNoSubstantiveWindowDecision(
        result,
        window,
      );
      if (explicitNoMeaning.valid) {
        addRunEvent(
          input.runId,
          `Semantic window ${windowIndex + 1} was provisionally assessed as containing no substantive participant meaning (${explicitNoMeaning.sourceTurnIds.length} participant turn${explicitNoMeaning.sourceTurnIds.length === 1 ? "" : "s"}). Reason: ${result.decisionReason}`,
        );
        return {
          ...result,
          fallbackUsed: false,
          noSubstantiveSourceTurnIds: explicitNoMeaning.sourceTurnIds,
        };
      }
      addRunEvent(
        input.runId,
        result.returnedCandidateCount > 0
          ? `Semantic window ${windowIndex + 1} returned ${result.returnedCandidateCount} draft candidate${result.returnedCandidateCount === 1 ? "" : "s"} whose participant TURN ids or boundary anchors could not be mapped back to the source; requesting one focused anchor correction`
          : `Semantic window ${windowIndex + 1} returned no units without a valid no-substantive decision; requesting one focused clarification`,
      );
      result = await generateMeaningUnitsForWindow({
        input,
        revisionDirective:
          result.returnedCandidateCount > 0
            ? "The previous draft candidates could not be mapped back to the source. Return the same meaning-based analysis with corrected traceability. For every unit: copy sourceTurnIds exactly from the PARTICIPANT TURN identifiers shown in this window; copy short startQuote and endQuote phrases verbatim from those participant turns; do not paraphrase anchors, add ellipses, include speaker labels, or use facilitator wording. Both anchors must occur in source order inside the listed participant turns. If the window genuinely has no substantive meaning, use the explicit no_substantive_meaning decision instead of inventing anchors."
            : "The previous response returned no valid units. Reassess the full window. If it contains any substantive or uncertain participant meaning, return correctly anchored units. Only if every participant turn is clearly procedural, conversational, or non-analytic may you return analysisDecision \"no_substantive_meaning\" with a non-empty decisionReason and every participant TURN id in noSubstantiveSourceTurnIds.",
        startingNumber,
        window,
        windowIndex,
      });
      if (result.meaningUnits.length === 0) {
        const clarifiedNoMeaning = validateNoSubstantiveWindowDecision(
          result,
          window,
        );
        if (clarifiedNoMeaning.valid) {
          addRunEvent(
            input.runId,
            `Semantic window ${windowIndex + 1} was provisionally assessed as containing no substantive participant meaning after clarification (${clarifiedNoMeaning.sourceTurnIds.length} participant turn${clarifiedNoMeaning.sourceTurnIds.length === 1 ? "" : "s"}). Reason: ${result.decisionReason}`,
          );
          return {
            ...result,
            fallbackUsed: false,
            noSubstantiveSourceTurnIds: clarifiedNoMeaning.sourceTurnIds,
          };
        }
        if (result.returnedCandidateCount > 0) {
          throw new Error(
            "Ollama returned draft candidates after focused traceability correction, but none could be mapped safely to participant source turns and boundary anchors.",
          );
        }
        throw new Error(
          "Ollama returned neither valid meaning units nor an explicit, traceable no-substantive-meaning decision after clarification.",
        );
      }
    }
    const initialBoundaryConcerns = semanticBoundaryConcerns(
      result.meaningUnits,
      window,
    );
    if (initialBoundaryConcerns.length > 0) {
      addRunEvent(
        input.runId,
        `Semantic window ${windowIndex + 1} may still treat a long participant answer as one MU; requesting one focused semantic-boundary revision`,
      );
      try {
        const revised = await generateMeaningUnitsForWindow({
          input,
          revisionDirective:
            buildSemanticBoundaryRevisionDirective(initialBoundaryConcerns),
          startingNumber,
          window,
          windowIndex,
        });
        if (revised.meaningUnits.length > 0) {
          const revisedBoundaryConcerns = semanticBoundaryConcerns(
            revised.meaningUnits,
            window,
          );
          if (revisedBoundaryConcerns.length === 0) {
            return ensureNonOverlappingSemanticBoundaries({
              input,
              result: revised,
              startingNumber,
              window,
              windowIndex,
            });
          }
          addRunEvent(
            input.runId,
            `Semantic window ${windowIndex + 1} still has ${revisedBoundaryConcerns.length} unresolved whole-turn boundary candidate${revisedBoundaryConcerns.length === 1 ? "" : "s"}; keeping them out of substantive analysis pending researcher review`,
          );
          return ensureNonOverlappingSemanticBoundaries({
            input,
            result: {
              ...revised,
              meaningUnits: markUnresolvedSemanticBoundaries(
                revised.meaningUnits,
                revisedBoundaryConcerns,
              ),
            },
            startingNumber,
            window,
            windowIndex,
          });
        }
      } catch (revisionError) {
        console.warn("[gdiqr:mu] boundary revision failed", {
          message:
            revisionError instanceof Error
              ? revisionError.message
              : "Unknown revision error",
            window: windowIndex + 1,
          });
      }
      return ensureNonOverlappingSemanticBoundaries({
        input,
        result: {
          ...result,
          meaningUnits: markUnresolvedSemanticBoundaries(
            result.meaningUnits,
            initialBoundaryConcerns,
          ),
        },
        startingNumber,
        window,
        windowIndex,
      });
    }
    return ensureNonOverlappingSemanticBoundaries({
      input,
      result,
      startingNumber,
      window,
      windowIndex,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Meaning-unit window failed.";
    addRunEvent(
      input.runId,
      `Semantic window ${windowIndex + 1} failed. No structural spans were substituted or saved. ${message}`,
    );
    throw new Error(
      `Semantic meaning-unit delineation failed for window ${windowIndex + 1}. Existing meaning units were left unchanged; retry the AI generation instead of treating speaker- or length-based spans as MUs. ${message}`,
    );
  }
}

async function ensureNonOverlappingSemanticBoundaries({
  input,
  result,
  startingNumber,
  window,
  windowIndex,
}: {
  input: MeaningUnitInput;
  result: SemanticWindowResult;
  startingNumber: number;
  window: SemanticAnalysisWindow;
  windowIndex: number;
}) {
  const initialOverlapResult = consolidateOverlappingSemanticMeaningUnits(
    result.meaningUnits,
    window.turns,
  );
  if (initialOverlapResult.overlapGroupCount === 0) {
    return { ...result, fallbackUsed: false };
  }

  addRunEvent(
    input.runId,
    `Semantic window ${windowIndex + 1} returned ${initialOverlapResult.overlapGroupCount} overlapping or nested MU boundary group${initialOverlapResult.overlapGroupCount === 1 ? "" : "s"}; requesting one focused non-overlap correction`,
  );

  try {
    const corrected = await generateMeaningUnitsForWindow({
      input,
      revisionDirective:
        "Replace the previous MU list completely. It reused participant source passages across multiple MUs. Return a non-overlapping semantic partition: no MU may contain another MU, no two excerpts may overlap, and every participant phrase may be assigned to at most one MU. Preserve all distinct substantive or uncertain meanings, use compact exact anchors, and do not merely return both a whole-turn container and its subspans.",
      startingNumber,
      window,
      windowIndex,
    });
    if (corrected.meaningUnits.length > 0) {
      const correctedOverlapResult =
        consolidateOverlappingSemanticMeaningUnits(
          corrected.meaningUnits,
          window.turns,
        );
      if (correctedOverlapResult.overlapGroupCount === 0) {
        const boundaryConcerns = semanticBoundaryConcerns(
          corrected.meaningUnits,
          window,
        );
        return {
          ...corrected,
          meaningUnits:
            boundaryConcerns.length > 0
              ? markUnresolvedSemanticBoundaries(
                  corrected.meaningUnits,
                  boundaryConcerns,
                )
              : corrected.meaningUnits,
          fallbackUsed: false,
        };
      }
    }
  } catch (correctionError) {
    console.warn("[gdiqr:mu] overlap correction failed", {
      message:
        correctionError instanceof Error
          ? correctionError.message
          : "Unknown overlap correction error",
      window: windowIndex + 1,
    });
  }

  addRunEvent(
    input.runId,
    `Semantic window ${windowIndex + 1} still had overlapping boundaries after focused correction; ${initialOverlapResult.collapsedCandidateCount} candidates were collapsed into ${initialOverlapResult.overlapGroupCount} uncertain source span${initialOverlapResult.overlapGroupCount === 1 ? "" : "s"} for researcher splitting`,
  );
  return {
    ...result,
    meaningUnits: initialOverlapResult.meaningUnits,
    fallbackUsed: false,
  };
}

export function validateNoSubstantiveWindowDecision(
  result: SemanticWindowResult,
  window: SemanticAnalysisWindow,
) {
  const participantTurnIds = window.participantTurns.map((turn) => turn.id);
  const requestedIds = new Set(
    result.noSubstantiveSourceTurnIds.map((id) => id.trim().toUpperCase()),
  );
  const sourceTurnIds = participantTurnIds.filter((id) =>
    requestedIds.has(id.toUpperCase()),
  );
  const valid = Boolean(
    result.analysisDecision === "no_substantive_meaning" &&
      result.decisionReason.trim() &&
      participantTurnIds.length > 0 &&
      sourceTurnIds.length === participantTurnIds.length &&
      result.returnedCandidateCount === 0,
  );
  return { sourceTurnIds, valid };
}

interface SemanticBoundaryConcern {
  message: string;
  sourceTurnId: string;
}

function semanticBoundaryConcerns(
  units: MeaningUnit[],
  window: SemanticAnalysisWindow,
) {
  const concerns: SemanticBoundaryConcern[] = [];
  for (const turn of window.participantTurns) {
    const relatedUnits = units.filter(
      (unit) =>
        unit.classification === "substantive_participant" &&
        (unit.sourceTurnIds ?? []).includes(turn.id),
    );
    if (relatedUnits.length !== 1) {
      continue;
    }
    const unit = relatedUnits[0];
    const sourceWords = countMeaningWords(turn.content);
    const excerptWords = countMeaningWords(unit.excerpt);
    const coverage = boundaryCoverage(unit.excerpt, turn.content);
    const shiftMarkers = countSemanticShiftMarkerGroups(turn.content);
    const summarySignalsMultipleMeanings =
      excerptWords > 55 &&
      /\b(?:and|also|but|however|while|whereas)\b|(?:并且|也|但是|不过|而|同时)/iu.test(
        unit.aiSummary,
      );
    const likelyWholeTurnContainer =
      coverage >= 0.72 &&
      (sourceWords > 100 ||
        (sourceWords > 55 && shiftMarkers >= 2) ||
        (sourceWords > 70 && summarySignalsMultipleMeanings));
    if (!likelyWholeTurnContainer) {
      continue;
    }
    concerns.push({
      message: `${turn.id} was returned as one MU covering most of a ${sourceWords}-word participant turn with ${shiftMarkers} distinct shift-marker group${shiftMarkers === 1 ? "" : "s"}.`,
      sourceTurnId: turn.id,
    });
  }
  return concerns;
}

function buildSemanticBoundaryRevisionDirective(
  concerns: SemanticBoundaryConcern[],
) {
  return `The first draft may have used a whole participant turn as one MU. Re-read the participant material clause by clause and map distinct central meanings before choosing anchors. Reapply the one-concise-summary test; split substantial changes in experience, evaluation, concern, proposal, reason, time point, or perspective, while keeping a connected example/reason/consequence chain together. Do not split by punctuation. Boundary concerns: ${concerns
    .map((concern) => concern.message)
    .join(" ")}`;
}

function markUnresolvedSemanticBoundaries(
  units: MeaningUnit[],
  concerns: SemanticBoundaryConcern[],
) {
  const affectedTurnIds = new Set(
    concerns.map((concern) => concern.sourceTurnId),
  );
  return units.map((unit) => {
    const affected = (unit.sourceTurnIds ?? []).some((turnId) =>
      affectedTurnIds.has(turnId),
    );
    if (!affected) {
      return unit;
    }
    return {
      ...unit,
      analysisExcluded: false,
      classification: "uncertain" as const,
      exclusionReason: undefined,
      humanStatus: "Needs review" as const,
      reviewerStatus: "Warning" as const,
      reviewerWarnings: [
        ...new Set([
          ...(unit.reviewerWarnings ?? []),
          "Unresolved semantic boundary: AI retained most of a participant turn as one span after focused re-delineation. Split it or explicitly restore it only after confirming that one concise summary covers the whole span.",
        ]),
      ],
      uncertainty: [
        unit.uncertainty,
        "Semantic boundary unresolved — researcher decision required.",
      ]
        .filter(Boolean)
        .join(" "),
    };
  });
}

function boundaryCoverage(excerpt: string, source: string) {
  const normalizedExcerpt = normalizeBoundaryText(excerpt);
  const normalizedSource = normalizeBoundaryText(source);
  if (!normalizedSource) {
    return 0;
  }
  return Math.min(1, normalizedExcerpt.length / normalizedSource.length);
}

function countSemanticShiftMarkerGroups(text: string) {
  const groups = [
    /\b(?:before|previously|used to|at first|initially)\b|(?:以前|起初|最初)/iu,
    /\b(?:now|currently|these days|later|eventually|still)\b|(?:现在|目前|后来|最终|仍然)/iu,
    /\b(?:but|however|although|whereas|on the other hand|in contrast)\b|(?:但是|不过|虽然|然而|另一方面|相比之下)/iu,
    /\b(?:also|another thing|in addition|separately|secondly|finally)\b|(?:另外|还有|此外|其次|最后)/iu,
    /\b(?:i (?:want|wish|hope|would like)|my concern|the problem is)\b|(?:我希望|我想|我的担忧|问题是)/iu,
  ];
  return groups.filter((pattern) => pattern.test(text)).length;
}

function normalizeBoundaryText(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export async function generateCategories(
  input: CategoryInput,
): Promise<CategoryResult> {
  assertOllamaConfigured();
  if (input.units.length === 0) {
    throw new Error("Meaning units are required before generating categories.");
  }

  const model = getOllamaModel();
  try {
    const batchSize = Math.max(
      10,
      Number(process.env.OLLAMA_CATEGORY_BATCH_SIZE ?? 30),
    );
    const batches =
      input.mode === "C" ? [input.units] : chunkArray(input.units, batchSize);
    const drafts = [] as Awaited<ReturnType<typeof generateCategoryBatch>>[];
    for (const [batchIndex, units] of batches.entries()) {
      drafts.push(
        await generateCategoryBatch({
          batchIndex,
          input: { ...input, units },
        }),
      );
    }

    let categoryDraft = combineCategoryBatchDrafts(drafts, input.units);
    const uncertainties = drafts.flatMap((draft) => draft.uncertainties);
    if (drafts.length > 1 && input.mode !== "C") {
      try {
        const consolidated = await generateCategoryConsolidation({
          categories: categoryDraft.categories,
          input,
        });
        if (consolidated.valid) {
          categoryDraft = consolidated;
        } else {
          uncertainties.push(
            "Cross-batch consolidation returned conflicting MU assignments, so the complete batch-level groupings were retained for researcher comparison.",
          );
        }
      } catch {
        uncertainties.push(
          "Cross-batch consolidation did not complete. All accepted MUs remain accounted for in provisional batch-level groupings for researcher merging and refinement.",
        );
      }
    }

    if (categoryDraft.categories.length === 0) {
      throw new Error("Local AI returned no usable category groupings.");
    }

    return {
      provider: "ollama",
      model,
      caseId: input.units[0]?.caseId ?? "CASE-001",
      researchQuestion: input.project.researchQuestion,
      mode: input.mode,
      categories: categoryDraft.categories,
      categoryUnitDecisions: categoryDraft.decisions,
      coverage: categoryDraft.coverage,
      categoryRevisions: drafts.flatMap((draft) => draft.categoryRevisions),
      structuralModel: drafts
        .map((draft) => draft.structuralModel)
        .filter(Boolean)
        .join("\n\n"),
      integratedNarrative: drafts
        .map((draft) => draft.integratedNarrative)
        .filter(Boolean)
        .join("\n\n"),
      isFallbackDraft: false,
      uncertainties,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Category generation failed.";
    throw new Error(
      `The local AI did not return a usable category result. No fallback categories were created or saved, so the accepted meaning units remain unchanged. ${message}`,
    );
  }
}

export async function generateReviewer(
  input: ReviewerInput,
): Promise<ReviewerResult> {
  assertOllamaConfigured();
  if (input.units.length === 0) {
    throw new Error(
      "Meaning units are required before running reviewer agents.",
    );
  }

  const model = getOllamaModel();
  const result = await callOllamaJson<{
    issues?: Array<Partial<ReviewerComment>>;
    comments?: Array<Partial<ReviewerComment>>;
  }>(
    [
      systemMessage("reviewer"),
      {
        role: "user",
        content:
          input.reviewerWorkspace === "categories"
            ? buildCategoryReviewerPrompt(input)
            : buildMeaningUnitReviewerPrompt(input),
      },
    ],
    {
      maxTokens: Number(process.env.OLLAMA_REVIEWER_MAX_TOKENS ?? 1200),
      timeoutMs: getOllamaTimeoutMs(),
    },
  );

  const aiComments = normalizeReviewerComments(
    result.issues ?? result.comments ?? [],
    input.reviewerWorkspace,
  );
  const deterministicComments =
    input.reviewerWorkspace === "meaning-units"
      ? buildDeterministicMeaningUnitReviewerComments(input.units)
      : [];

  return {
    provider: "ollama",
    model,
    status: "completed",
    comments: [...deterministicComments, ...aiComments].filter(
      (comment, index, comments) =>
        comments.findIndex(
          (candidate) =>
            candidate.targetId === comment.targetId &&
            candidate.issueType === comment.issueType,
        ) === index,
    ),
  };
}

export async function processTranscriptForPrivacyAndSpeakers(
  input: TranscriptProcessingInput,
): Promise<TranscriptProcessingResult> {
  assertOllamaConfigured();
  assertNonEmpty(
    input.transcript,
    "Transcript is required before privacy review.",
  );

  const model = getOllamaModel();
  const chunks = chunkTranscript(
    input.transcript,
    Number(process.env.TRANSCRIPT_PROCESS_CHUNK_CHARS ?? 6000),
  );
  const results: TranscriptProcessingResult[] = [];

  addRunEvent(
    input.runId,
    `Privacy/speaker processing split transcript into ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`,
  );

  for (const [index, chunk] of chunks.entries()) {
    const startedAt = Date.now();
    addRunEvent(
      input.runId,
      `Processing transcript chunk ${index + 1}/${chunks.length} (${chunk.length} chars)`,
    );
    const result = await processTranscriptChunk({
      chunk,
      chunkIndex: index,
      language: input.language,
      runId: input.runId,
      signal: input.abortSignal,
      transcriptionSegments:
        chunks.length === 1 ? input.transcriptionSegments : undefined,
    });
    addRunEvent(
      input.runId,
      `Finished transcript chunk ${index + 1}/${chunks.length} in ${formatDuration(Date.now() - startedAt)}`,
    );
    results.push(result);
  }

  const sanitizedTranscript = results
    .map((result) => result.sanitizedTranscript)
    .join("\n\n")
    .trim();

  assertNonEmpty(
    sanitizedTranscript,
    "Privacy/speaker transcript processing returned an empty transcript.",
  );

  return {
    provider: "ollama",
    model,
    sanitizedTranscript,
    privacyFindings: results.flatMap((result) => result.privacyFindings),
    speakerNotes: results.flatMap((result) => result.speakerNotes),
  };
}

export function prepareTranscriptWithLocalRules(
  input: TranscriptProcessingInput,
  reason = "Local rule-based transcript preparation used for demo responsiveness.",
): TranscriptProcessingResult {
  assertNonEmpty(
    input.transcript,
    "Transcript is required before privacy review.",
  );

  const chunks = chunkTranscript(
    input.transcript,
    Number(process.env.TRANSCRIPT_PROCESS_CHUNK_CHARS ?? 6000),
  );
  console.info("[gdiqr:transcript-prepare] local fallback start", {
    chunkCount: chunks.length,
    transcriptChars: input.transcript.length,
  });
  addRunEvent(
    input.runId,
    `Local rule-based transcript preparation started (${chunks.length} chunk${chunks.length === 1 ? "" : "s"})`,
  );
  const sanitizedTranscript = chunks
    .map(fallbackPrepareTranscript)
    .join("\n\n");

  return {
    provider: "ollama",
    model: "local-rule-based-fallback",
    sanitizedTranscript,
    privacyFindings: [
      `${reason} Please review names, places, institutions, contact details, and other sensitive information before saving or analysis.`,
    ],
    speakerNotes: [
      "Speaker labels were inferred by local rules for demo responsiveness. Please check Interviewer/Participant labels carefully.",
    ],
  };
}

function buildCategoryGenerationPrompt(
  input: CategoryInput,
  revisionDirective = "",
) {
  const existingCategories =
    input.mode !== "A" &&
    input.existingCategories &&
    input.existingCategories.length > 0
      ? JSON.stringify(input.existingCategories, null, 2)
      : "None";
  const modeInstructions =
    input.mode === "A"
      ? `MODE A - Initial Category Construction
- Use when no existing category system is being refined.
- Compare summaries within this single-transcript batch.
- Cluster summaries into substantive categories that answer the research question.
- Produce flat evidence clusters only. Do not create subcategories during initial construction; internal distinctions can be developed after researcher comparison.
- Define each category clearly and list included MU numbers.
- Do not produce narrative integration.`
      : input.mode === "B"
        ? `MODE B - Category Expansion and Refinement
- Mode B generates provisional analytic groupings from confirmed meaning units. These are draft categories for researcher review, not findings.
- Use the existing category system as the starting point.
- Compare each confirmed summary against existing provisional categories.
- Decide whether each summary fits, requires a new peer category, or suggests merging/redefining categories.
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
- For every major relationship or higher-order claim, name the supporting category/category IDs where available and relevant MU numbers in the narrative or structuralModel.
- Use relationship wording such as "may shape", "may support or hinder", "is described alongside", or "creates an opportunity for" when causality is not established.
- Do not introduce new categories unless essential for coherence.`;

  const stage = input.mode === "C" ? "integration" : "categorisation";
  const stageKnowledge = buildGdiqrStageKnowledge(stage, {
    maxExamples: input.mode === "C" ? 1 : 3,
  });

  return `/no_think
You are a qualitative research assistant providing draft support within a GDI-QR-informed generic descriptive-interpretive qualitative research workflow.

Method knowledge for this stage:
${stageKnowledge}

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
- Keep this Stage 3 output flat and researcher-editable. Record relationships and higher-order structure later during Integration rather than creating read-only nested outputs here.
- Preserve tensions, contradictions, qualifications, and uncertainty rather than smoothing them over.
- Do not turn participant accounts into explanatory mechanisms at category stage; reserve explanations of why/how relationships operate for Integration.
- Treat participant claims about external institutions, culture, credibility, effectiveness, or prevalence as participant perceptions unless independently verified outside this analysis.
- In each category definition/rationale, state meaningful variations, tensions, contradictory cases, or uncertainties when they are present in the included MUs.
- Category includedUnitIds must refer to MU numbers only so every category remains traceable to researcher-accepted/edited evidence.
- Account for every confirmed MU exactly once. Put it in one primary category, or list it once in unassignedUnits with a transparent reason and decision.
- Never assign one MU to multiple primary categories. Other relationships belong in the later Integration stage.
- Do not force a weak fit. A coherent one-MU provisional category or an explicitly documented unique/uncertain case is methodologically preferable to a miscellaneous category.
- Stage 3 categories must be flat; omit subcategories.
- Return strict JSON only, with no markdown or commentary.
${revisionDirective}

Return JSON in this shape:
{
  "categories": [
    {
      "name": "category name",
      "definition": "category definition",
      "includedUnitIds": [1, 2],
      "rationale": "brief reason these MUs belong together",
      "status": "ai_draft",
      "inclusionCriteria": "what shared meaning belongs here",
      "exclusionCriteria": "nearby but distinct meanings that do not belong here",
      "comparisonSimilarityNote": "important shared meaning across included MUs",
      "comparisonDifferenceNote": "variation, tension, or negative case within the grouping",
      "groupingDecision": "yes | partly | no"
    }
  ],
  "unassignedUnits": [
    {
      "unitNumber": 3,
      "decision": "intentionally_unassigned | needs_review",
      "evidenceRole": "unique_case | contradictory | qualifying | core",
      "reason": "specific transparent reason"
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
      `MU ${unit.number} (${unit.caseId}, ${unit.segmentId})\nSpeaker: ${unit.speaker}\nSummary: ${unit.humanSummary || unit.aiSummary}`,
  )
  .join("\n\n")}`;
}

function buildMeaningUnitReviewerPrompt(input: ReviewerInput) {
  return `/no_think
You are a reviewer-check assistant for a GDI-QR-informed workflow. Your task is to flag possible issues in the AI-drafted meaning units and summaries so the researcher can review them.

Method knowledge for reviewer checks:
${buildGdiqrStageKnowledge("reviewer", { maxExamples: 1 })}

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
14. Flag facilitator/interviewer framing that replaces a participant correction or clarification.
15. Flag participant belief/perception presented as an objective external fact.
16. Flag false consensus where disagreement, contradiction, or qualifying cases are present.
17. Do not assign numerical scores, quality grades, probabilities, or pass/fail judgements to the analysis.
18. Speaker-role error: flag any substantive MU containing only facilitator/moderator/interviewer speech.
19. Mixed-role contamination: flag facilitator wording combined with participant evidence.
20. Summary too extractive: flag summaries that mostly copy or shorten the excerpt.
21. Summary too interpretive: flag concepts not clearly supported by participant material.
22. Possible multiple meanings: flag clear distinguishable meanings that may need splitting.
23. Possible fragmentation: flag narrow fragments that may need merging with adjacent participant material.
24. Missing context: flag responses that require a preceding question or probe to interpret.

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
      `MU${unit.number} (${unit.caseId}, ${unit.segmentId})\nClassification: ${unit.classification ?? "legacy/unclassified"}\nSpeaker role: ${unit.speakerRole ?? "unknown"}\nSpeaker label: ${unit.speaker}\nContext (not evidence): ${unit.contextExcerpt ?? ""}\nExcerpt: ${unit.excerpt}\nAI summary: ${unit.aiSummary}\nHuman summary: ${unit.humanSummary}\nTentative interpretation: ${unit.tentativeInterpretation ?? ""}\nExisting deterministic warnings: ${(unit.reviewerWarnings ?? []).join(" | ")}\nUncertainty: ${unit.uncertainty ?? ""}`,
  )
  .join("\n\n")}`;
}

function buildCategoryReviewerPrompt(input: ReviewerInput) {
  return `/no_think
You are a reviewer-check assistant for GDI-QR-informed category-level drafting. Your task is to flag possible issues in category construction, refinement, or integration drafts so the researcher can review them.

Method knowledge for reviewer checks:
${buildGdiqrStageKnowledge("reviewer", { maxExamples: 1 })}

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
- Major integration claims remain traceable to categories/MU IDs.
- New categories are not introduced unless essential.

Across all modes also flag domain/category confusion, premature explanatory mechanisms, participant perceptions stated as facts, false consensus, lost qualifications, unsupported causal language, and missing evidence traceability.
Do not assign numerical scores, quality grades, probabilities, or pass/fail judgements to the analysis.

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
  transcriptionSegments,
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
            "You are a careful research transcript preparation assistant. Return strict JSON only. Do not wrap JSON in markdown. Do not output chain-of-thought.",
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
${JSON.stringify(transcriptionSegments?.slice(0, 60) ?? [], null, 2)}`,
        },
      ],
      {
        maxTokens: Number(
          process.env.OLLAMA_TRANSCRIPT_PROCESS_MAX_TOKENS ?? 4096,
        ),
        signal,
        timeoutMs: getTranscriptProcessTimeoutMs(),
      },
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
      speakerNotes: stringArray(result.speakerNotes),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Transcript chunk processing failed.";
    addRunEvent(
      runId,
      `Chunk ${chunkIndex + 1}: AI transcript preparation did not return usable text, so a conservative local cleanup was used. Please review this transcript carefully before confirming. ${message}`,
    );

    return {
      provider: "ollama",
      model,
      sanitizedTranscript: fallbackPrepareTranscript(chunk),
      privacyFindings: [
        `Chunk ${chunkIndex + 1}: local fallback masked contact/identifier patterns only`,
      ],
      speakerNotes: [
        `Chunk ${chunkIndex + 1}: speaker labels were inferred by local fallback because Ollama returned an unusable chunk`,
      ],
    };
  }
}

function systemMessage(stage: GdiqrAiStage = "summary"): OllamaMessage {
  return {
    role: "system",
    content: `${buildGdiqrSystemMessage(stage)}\nReturn strict JSON only. Do not wrap JSON in markdown.`,
  };
}

async function callOllamaJson<T>(
  messages: OllamaMessage[],
  options: {
    maxTokens?: number;
    onJsonRetry?: (
      stage: "repair" | "regenerate",
      message: string,
    ) => void;
    signal?: AbortSignal;
    temperature?: number;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const maxTokens = options.maxTokens ?? 1600;
  const timeoutMs = options.timeoutMs ?? getOllamaTimeoutMs();
  const content = await callOllamaContent(
    messages,
    timeoutMs,
    maxTokens,
    options.signal,
    options.temperature,
  );

  let initialParseError: unknown;
  try {
    return parseJsonObject<T>(content);
  } catch (error) {
    initialParseError = error;
    options.onJsonRetry?.(
      "repair",
      error instanceof Error ? error.message : "Invalid JSON output.",
    );
    const retryMaxTokens = getJsonRetryMaxTokens(maxTokens);
    const repaired = await callOllamaContent(
      [
        systemMessage(),
        {
          role: "user",
          content: `Repair this into valid JSON only. Do not add commentary, markdown, or explanation. Preserve the original fields and values as much as possible.

Invalid JSON-like content:
${content}`,
        },
      ],
      Math.min(timeoutMs, 120000),
      retryMaxTokens,
      options.signal,
      0,
    );

    try {
      return parseJsonObject<T>(repaired);
    } catch (repairError) {
      options.onJsonRetry?.(
        "regenerate",
        repairError instanceof Error
          ? repairError.message
          : "Repaired output was still invalid JSON.",
      );
      const regenerated = await callOllamaContent(
        [
          ...messages,
          {
            role: "user",
            content:
              "Your previous response could not be parsed as JSON. Regenerate the requested result once as compact valid JSON with no markdown, comments, or trailing text. Keep summaries concise, preserve the requested evidence and fields, and close every array and object. Do not explain the correction.",
          },
        ],
        timeoutMs,
        retryMaxTokens,
        options.signal,
        0,
      );

      try {
        return parseJsonObject<T>(regenerated);
      } catch (regenerationError) {
        const lastMessage =
          regenerationError instanceof Error
            ? regenerationError.message
            : "Regenerated output was still invalid JSON.";
        const firstMessage =
          initialParseError instanceof Error
            ? initialParseError.message
            : "Initial output was invalid JSON.";
        throw new Error(
          `Ollama returned malformed JSON after local repair and two controlled format retries. Initial parse: ${firstMessage} Final parse: ${lastMessage}`,
        );
      }
    }
  }
}

interface RawCategoryGenerationResult {
  categories?: Array<Partial<CategoryNode>>;
  categoryRevisions?: string[];
  integratedNarrative?: string;
  structuralModel?: string;
  unassignedUnits?: ProposedUnassignedUnit[];
  uncertainties?: string[];
}

async function generateCategoryBatch({
  batchIndex,
  input,
}: {
  batchIndex: number;
  input: CategoryInput;
}) {
  let raw = await callCategoryModel(
    buildCategoryGenerationPrompt(input),
    input.mode,
  );
  let integrity = validateCategoryGrouping({
    categories: normalizeCategories(
      raw.categories ?? [],
      "ai",
      `cat_ai_b${batchIndex + 1}`,
    ),
    proposedUnassigned: raw.unassignedUnits,
    units: input.units,
  });
  if (!integrity.valid) {
    raw = await callCategoryModel(
      buildCategoryGenerationPrompt(
        input,
        categoryCoverageCorrection(integrity.coverage),
      ),
      input.mode,
    );
    integrity = validateCategoryGrouping({
      categories: normalizeCategories(
        raw.categories ?? [],
        "ai",
        `cat_ai_b${batchIndex + 1}`,
      ),
      proposedUnassigned: raw.unassignedUnits,
      units: input.units,
    });
  }
  return {
    ...integrity,
    categoryRevisions: stringArray(raw.categoryRevisions),
    integratedNarrative: raw.integratedNarrative ?? "",
    structuralModel: raw.structuralModel ?? "",
    uncertainties: [
      ...stringArray(raw.uncertainties),
      ...(integrity.valid
        ? []
        : [
            `The assistant did not fully account for MU ${integrity.coverage.unaccountedUnits.join(", ") || "coverage"}; these records remain visible as Needs review.`,
          ]),
    ],
  };
}

async function callCategoryModel(prompt: string, mode: CategoryMode = "A") {
  return callOllamaJson<RawCategoryGenerationResult>(
    [
      systemMessage(mode === "C" ? "integration" : "categorisation"),
      { role: "user", content: prompt },
    ],
    {
      maxTokens: Number(process.env.OLLAMA_CATEGORY_MAX_TOKENS ?? 3600),
      timeoutMs: getOllamaTimeoutMs(),
    },
  );
}

function combineCategoryBatchDrafts(
  drafts: Array<{
    categories: CategoryNode[];
    decisions: CategoryUnitDecision[];
  }>,
  units: MeaningUnit[],
) {
  const categories = drafts.flatMap((draft) => draft.categories);
  const proposedUnassigned = drafts
    .flatMap((draft) => draft.decisions)
    .filter((decision) => decision.decision !== "assigned")
    .map((decision) => ({
      decision:
        decision.decision === "intentionally_unassigned"
          ? ("intentionally_unassigned" as const)
          : ("needs_review" as const),
      evidenceRole: decision.evidenceRole,
      reason: decision.reason,
      unitNumber: decision.unitNumber,
    }));
  return validateCategoryGrouping({ categories, proposedUnassigned, units });
}

async function generateCategoryConsolidation({
  categories,
  input,
}: {
  categories: CategoryNode[];
  input: CategoryInput;
}) {
  const raw = await callCategoryModel(
    buildCategoryConsolidationPrompt(input, categories),
    input.mode,
  );
  return validateCategoryGrouping({
    categories: normalizeCategories(
      raw.categories ?? [],
      "ai",
      "cat_ai_consolidated",
    ),
    proposedUnassigned: raw.unassignedUnits,
    units: input.units,
  });
}

function categoryCoverageCorrection(coverage: CategoryGroupingCoverage) {
  return `\nCORRECTION REQUIRED: Replace the entire previous JSON result. Every input MU must appear exactly once: either in one category includedUnitIds array or in unassignedUnits. Duplicate assignments: ${coverage.duplicateAssignments.join(", ") || "none"}. Omitted MUs: ${coverage.unaccountedUnits.join(", ") || "none"}. Invalid references: ${coverage.invalidReferences.join(", ") || "none"}.`;
}

function buildCategoryConsolidationPrompt(
  input: CategoryInput,
  categories: CategoryNode[],
) {
  return `/no_think
Consolidate provisional category groupings created from separate batches of the same transcript. Compare their definitions and rationales semantically, merge only genuinely shared meanings, and preserve meaningful differences, tensions, negative cases, and unique cases.

Rules:
- Return a complete replacement flat category system, not subcategories.
- Each MU number from the input set must occur exactly once in one includedUnitIds array, or once in unassignedUnits with a reason.
- One MU has one primary category only. Do not duplicate MU numbers across categories.
- Do not force a weak fit merely to reduce the number of categories. A coherent one-MU provisional category is allowed.
- Keep wording descriptive and data-near. Do not copy a manual category framework or introduce theory.
- Return strict JSON only in the same shape as the supplied category drafts plus unassignedUnits.

Research question: ${input.project.researchQuestion}
Valid MU numbers: ${input.units.map((unit) => unit.number).join(", ")}

Batch-level provisional categories:
${JSON.stringify(categories, null, 2)}`;
}

function chunkArray<T>(items: T[], size: number) {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size),
  );
}

function getJsonRetryMaxTokens(maxTokens: number) {
  const configured = Number(
    process.env.OLLAMA_JSON_REPAIR_MAX_TOKENS ?? 4096,
  );
  const upperBound =
    Number.isFinite(configured) && configured >= maxTokens
      ? configured
      : Math.max(maxTokens, 4096);
  return Math.min(Math.max(maxTokens * 2, 2400), upperBound);
}

async function callOllamaContent(
  messages: OllamaMessage[],
  timeoutMs: number,
  maxTokens: number,
  signal?: AbortSignal,
  temperature = 0.2,
) {
  const requestStartedAt = Date.now();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = combineAbortSignals(
    [timeoutSignal, signal].filter(Boolean) as AbortSignal[],
  );
  let response: Response;
  try {
    response = await fetch(getOllamaNativeChatUrl(), {
      body: JSON.stringify({
        model: getOllamaModel(),
        messages,
        stream: false,
        think: false,
        format: "json",
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: requestSignal,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw new Error("Generation stopped by user.");
    }
    if (timeoutSignal.aborted) {
      throw new Error(
        "Local AI request timed out before Ollama returned a response. Try a shorter transcript, a smaller model, or increase OLLAMA_API_TIMEOUT_MS.",
      );
    }
    throw new Error(getOllamaConnectionErrorMessage());
  }

  if (!response.ok) {
    throw new Error(
      `Ollama request failed with ${response.status}. Check that model "${getOllamaModel()}" is installed and that OLLAMA_BASE_URL points to your local Ollama server.`,
    );
  }

  const remainingMs = Math.max(1, timeoutMs - (Date.now() - requestStartedAt));
  const body = (await readOllamaJsonResponse(response, remainingMs)) as {
    message?: {
      role?: string;
      content?: string;
    };
  };

  const content = body.message?.content;

  if (!content) {
    throw new Error(
      "Local AI did not return usable text. Try again, use a smaller/faster model, or reduce the amount of text in this step.",
    );
  }

  return content;
}

async function readOllamaJsonResponse(response: Response, timeoutMs: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      response.json(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          void response.body?.cancel().catch(() => undefined);
          reject(
            new Error(
              "Local AI request timed out before Ollama returned a complete response.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
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

export function parseJsonObject<T>(content: string): T {
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

  const candidate = stripped.slice(start, end + 1);
  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    const locallyRepaired = repairCommonJsonPunctuation(candidate);
    if (locallyRepaired !== candidate) {
      try {
        return JSON.parse(locallyRepaired) as T;
      } catch {
        // Preserve the original parse error for clearer diagnostics and retries.
      }
    }
    throw error;
  }
}

function repairCommonJsonPunctuation(candidate: string) {
  const output: string[] = [];
  const stack: string[] = [];
  let escaped = false;
  let inString = false;
  let lastSignificant = "";

  const nextSignificantCharacter = (fromIndex: number) => {
    for (let index = fromIndex; index < candidate.length; index += 1) {
      if (!/\s/u.test(candidate[index] ?? "")) {
        return candidate[index] ?? "";
      }
    }
    return "";
  };

  for (let index = 0; index < candidate.length; index += 1) {
    const character = candidate[index] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
        output.push(character);
        continue;
      }
      if (character === "\\") {
        escaped = true;
        output.push(character);
        continue;
      }
      if (character === '"') {
        inString = false;
        lastSignificant = '"';
        output.push(character);
        continue;
      }
      if (character === "\n" || character === "\r") {
        output.push(character === "\n" ? "\\n" : "\\r");
        continue;
      }
      output.push(character);
      continue;
    }

    if (character === '"') {
      const container = stack.at(-1);
      if (
        (container === "{" && ["}", "]", '"'].includes(lastSignificant)) ||
        (container === "[" && ["}", "]", '"'].includes(lastSignificant))
      ) {
        output.push(",");
      }
      inString = true;
      lastSignificant = '"';
      output.push(character);
      continue;
    }

    if (character === ",") {
      const next = nextSignificantCharacter(index + 1);
      if (next === "]" || next === "}") {
        continue;
      }
      lastSignificant = character;
      output.push(character);
      continue;
    }

    if (character === "{" || character === "[") {
      const container = stack.at(-1);
      if (
        container === "[" &&
        (lastSignificant === "}" || lastSignificant === "]")
      ) {
        output.push(",");
      }
      stack.push(character);
      lastSignificant = character;
      output.push(character);
      continue;
    }

    if (character === "}" || character === "]") {
      stack.pop();
      lastSignificant = character;
      output.push(character);
      continue;
    }

    if (!/\s/u.test(character)) {
      lastSignificant = character;
    }
    output.push(character);
  }

  return output.join("");
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
      getOllamaTimeoutMs()
  );
  if (!Number.isFinite(configured)) {
    return Math.min(getOllamaTimeoutMs(), 300000);
  }
  return Math.max(10000, Math.min(configured, 900000));
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

function sourceReferenceForMeaningUnit(segmentId: string | undefined, chunkIndex: number) {
  if (segmentId?.trim()) {
    return segmentId.trim();
  }
  return `Transcript excerpt ${String(chunkIndex + 1).padStart(2, "0")}`;
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

  if (lines.some((line) => parseSpeakerLine(line))) {
    return splitTranscriptIntoSpeakerTurns(lines.join("\n"))
      .map((turn) => turn.raw)
      .join("\n");
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

function fallbackMeaningUnitsFromTurns(
  turns: ClassifiedTranscriptTurn[],
  defaults: { caseId: string; segmentId: string },
) {
  return turns
    .filter((turn) => turn.role === "participant" && Boolean(turn.content.trim()))
    .flatMap((turn) =>
      splitParticipantTurnConservatively(turn.raw, 1800).map((candidate) => ({
        candidate,
        turn,
      })),
    )
    .map(({ candidate, turn }, index) => {
      const excerpt = stripSpeakerPrefix(candidate);
      const openingBackgroundCandidate = isOpeningBackgroundTurn(turn);
      const base: MeaningUnit = {
        aiExcerpt: excerpt,
        aiSummary: "",
        analysisExcluded: true,
        caseId: defaults.caseId,
        classification: "uncertain",
        contextExcerpt: "",
        excerpt,
        exclusionReason:
          "Structural source span only; semantic delineation and summary are required before it can become a substantive MU.",
        generationMethod: "rule_based_fallback",
        humanStatus: "Excluded",
        humanSummary: "",
        id: `structural_${turn.id.toLowerCase()}_${index + 1}`,
        number: index + 1,
        reviewerStatus: "Warning",
        reviewerWarnings: [
          "Provisional structural span: structural boundary only; semantic researcher review is required.",
          ...(openingBackgroundCandidate
            ? [OPENING_BACKGROUND_REVIEW_WARNING]
            : []),
        ],
        segmentId: defaults.segmentId,
        sourceEndLine: turn.endLine,
        sourceStartLine: turn.startLine,
        sourceTurnIds: [turn.id],
        speaker: turn.label,
        speakerRole: "participant",
        uncertainty:
          `Provisional structural span — boundary and summary require researcher review.${openingBackgroundCandidate ? " Possible opening/background material — researcher inclusion decision required." : ""}`,
      };
      return base;
    });
}

function normalizeSemanticMeaningUnits(
  items: SemanticMeaningUnitCandidate[],
  startingNumber: number,
  defaults: { caseId: string; segmentId: string },
  turns: ClassifiedTranscriptTurn[],
) {
  const participantTurns = turns.filter((turn) => turn.role === "participant");
  return items
    .map((item, index): MeaningUnit | null => {
      const candidateTurnIds = item.sourceTurnIds ?? item.source_turn_ids;
      const requestedTurnIds = Array.isArray(candidateTurnIds)
        ? candidateTurnIds.map(cleanText).filter(Boolean)
        : [];
      let sourceTurns = requestedTurnIds
        .map((id) => resolveRequestedSourceTurn(id, participantTurns))
        .filter((turn): turn is ClassifiedTranscriptTurn => Boolean(turn));
      const rawExcerpt = stripSpeakerPrefix(cleanText(item.excerpt));
      const startQuote = stripSpeakerPrefix(
        cleanText(item.startQuote ?? item.start_quote),
      );
      const endQuote = stripSpeakerPrefix(
        cleanText(item.endQuote ?? item.end_quote),
      );
      if (sourceTurns.length === 0 && rawExcerpt) {
        sourceTurns = participantTurns.filter(
          (turn) =>
            turn.content.includes(rawExcerpt) || rawExcerpt.includes(turn.content),
        );
      }
      if (sourceTurns.length === 0 && (startQuote || endQuote)) {
        sourceTurns = participantTurns.filter(
          (turn) =>
            (startQuote && containsQuote(turn.content, startQuote)) ||
            (endQuote && containsQuote(turn.content, endQuote)),
        );
      }
      if (sourceTurns.length === 0) {
        return null;
      }
      const sourceTurnIds = [...new Set(sourceTurns.map((turn) => turn.id))];
      const anchoredExcerpt = reconstructAnchoredParticipantExcerpt(
        startQuote,
        endQuote,
        sourceTurns,
      );
      const candidateExcerpt = anchoredExcerpt || rawExcerpt;
      if (!candidateExcerpt) {
        return null;
      }
      const excerpt = sanitizeSemanticExcerpt(candidateExcerpt, sourceTurns);
      if (!excerpt) {
        return null;
      }
      const classification =
        item.classification === "non_analytic" ||
        item.classification === "uncertain"
          ? item.classification
          : "substantive_participant";
      const contextExcerpt = contextForSourceTurns(sourceTurnIds, turns);
      const openingBackgroundCandidate = sourceTurns.some(
        isOpeningBackgroundTurn,
      );
      const aiSummary = sanitizeSemanticSummary(
        cleanText(item.summary ?? item.aiSummary),
        excerpt,
      );
      const number = startingNumber + index;
      const base: MeaningUnit = {
        aiExcerpt: excerpt,
        aiSummary,
        analysisExcluded: false,
        caseId: cleanText(item.caseId) || defaults.caseId,
        classification,
        contextExcerpt,
        excerpt,
        exclusionReason: undefined,
        generationMethod: "ai_semantic",
        humanStatus:
          classification === "substantive_participant" ? "Draft" : "Needs review",
        humanSummary: aiSummary,
        id: `mu_ai_${String(number).padStart(3, "0")}`,
        number,
        reviewerStatus:
          classification === "uncertain" || !aiSummary ? "Warning" : "Not run",
        segmentId: cleanText(item.segmentId) || defaults.segmentId,
        sourceEndLine: Math.max(...sourceTurns.map((turn) => turn.endLine)),
        sourceStartLine: Math.min(...sourceTurns.map((turn) => turn.startLine)),
        sourceTurnIds,
        speaker: sourceTurns[0]?.label || cleanText(item.speaker) || "Participant",
        speakerRole: "participant",
        tentativeInterpretation:
          cleanText(item.tentativeInterpretation) || undefined,
        uncertainty:
          [
            cleanText(item.uncertainty),
            openingBackgroundCandidate
              ? "Possible opening/background material — researcher inclusion decision required."
              : "",
            classification === "uncertain"
              ? "Uncertain — researcher review required."
              : "",
            !aiSummary ? "Summary needs researcher review." : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
      };
      base.reviewerWarnings = openingBackgroundCandidate
        ? [OPENING_BACKGROUND_REVIEW_WARNING]
        : [];
      base.reviewerWarnings = reviewerWarningsForMeaningUnit(base);
      if (base.reviewerWarnings.length > 0) {
        base.reviewerStatus = "Warning";
      }
      return base;
    })
    .filter((unit): unit is MeaningUnit => Boolean(unit));
}

function containsQuote(source: string, quote: string) {
  return Boolean(findParticipantQuote(source, quote));
}

export function reconstructAnchoredParticipantExcerpt(
  startQuote: string,
  endQuote: string,
  sourceTurns: ClassifiedTranscriptTurn[],
) {
  if (!startQuote || !endQuote || sourceTurns.length === 0) {
    return "";
  }
  const orderedTurns = [...sourceTurns].sort(
    (left, right) => left.turnIndex - right.turnIndex,
  );
  const participantText = orderedTurns.map((turn) => turn.content).join("\n");
  const startMatch = findParticipantQuote(participantText, startQuote);
  if (!startMatch) {
    return "";
  }
  const endMatch = findParticipantQuote(
    participantText,
    endQuote,
    startMatch.start,
  );
  if (!endMatch || endMatch.end < startMatch.end) {
    return "";
  }
  return participantText.slice(startMatch.start, endMatch.end).trim();
}

function findParticipantQuote(
  source: string,
  quote: string,
  fromSourceIndex = 0,
) {
  if (!source || !quote) {
    return undefined;
  }
  const directStart = source
    .toLocaleLowerCase()
    .indexOf(quote.toLocaleLowerCase(), fromSourceIndex);
  if (directStart >= 0) {
    return { end: directStart + quote.length, start: directStart };
  }

  const searchableSource = buildAnchorSearchText(source);
  const searchableQuote = buildAnchorSearchText(quote).text.trim();
  if (searchableQuote.replace(/\s/gu, "").length < 3) {
    return undefined;
  }
  const normalizedFrom = Math.max(
    0,
    searchableSource.ends.findIndex((end) => end > fromSourceIndex),
  );
  let matchIndex = searchableSource.text.indexOf(
    searchableQuote,
    normalizedFrom,
  );
  while (matchIndex >= 0) {
    const matchEnd = matchIndex + searchableQuote.length;
    const beginsAtWordBoundary =
      matchIndex === 0 || searchableSource.text[matchIndex - 1] === " ";
    const endsAtWordBoundary =
      matchEnd === searchableSource.text.length ||
      searchableSource.text[matchEnd] === " ";
    if (beginsAtWordBoundary && endsAtWordBoundary) {
      return {
        end: searchableSource.ends[matchEnd - 1],
        start: searchableSource.starts[matchIndex],
      };
    }
    matchIndex = searchableSource.text.indexOf(
      searchableQuote,
      matchIndex + 1,
    );
  }
  return undefined;
}

interface LocatedMeaningUnitBoundary {
  end: number;
  index: number;
  start: number;
  unit: MeaningUnit;
}

export function consolidateOverlappingSemanticMeaningUnits(
  units: MeaningUnit[],
  turns: ClassifiedTranscriptTurn[],
) {
  const participantTurns = turns
    .filter((turn) => turn.role === "participant")
    .sort((left, right) => left.turnIndex - right.turnIndex);
  const sourceOffsets = new Map<
    string,
    { end: number; start: number; turn: ClassifiedTranscriptTurn }
  >();
  let participantSource = "";
  for (const turn of participantTurns) {
    if (participantSource) {
      participantSource += "\n";
    }
    const start = participantSource.length;
    participantSource += turn.content;
    sourceOffsets.set(turn.id, {
      end: participantSource.length,
      start,
      turn,
    });
  }

  const located = units
    .map((unit, index): LocatedMeaningUnitBoundary | undefined => {
      if (
        unit.analysisExcluded ||
        unit.generationMethod !== "ai_semantic" ||
        unit.speakerRole !== "participant"
      ) {
        return undefined;
      }
      const offsets = (unit.sourceTurnIds ?? [])
        .map((turnId) => sourceOffsets.get(turnId))
        .filter(
          (
            offset,
          ): offset is {
            end: number;
            start: number;
            turn: ClassifiedTranscriptTurn;
          } => Boolean(offset),
        )
        .sort((left, right) => left.start - right.start);
      if (offsets.length === 0) {
        return undefined;
      }
      const scopeStart = offsets[0].start;
      const scopeEnd = offsets[offsets.length - 1].end;
      const match = findParticipantQuote(
        participantSource.slice(scopeStart, scopeEnd),
        unit.excerpt,
      );
      if (!match) {
        return undefined;
      }
      return {
        end: scopeStart + match.end,
        index,
        start: scopeStart + match.start,
        unit,
      };
    })
    .filter(
      (item): item is LocatedMeaningUnitBoundary => Boolean(item),
    );

  const adjacency = new Map<number, Set<number>>();
  for (let leftIndex = 0; leftIndex < located.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < located.length;
      rightIndex += 1
    ) {
      const left = located[leftIndex];
      const right = located[rightIndex];
      if (!meaningUnitBoundariesOverlap(left, right)) {
        continue;
      }
      if (!adjacency.has(left.index)) {
        adjacency.set(left.index, new Set());
      }
      if (!adjacency.has(right.index)) {
        adjacency.set(right.index, new Set());
      }
      adjacency.get(left.index)?.add(right.index);
      adjacency.get(right.index)?.add(left.index);
    }
  }

  const locatedByIndex = new Map(located.map((item) => [item.index, item]));
  const visited = new Set<number>();
  const overlapGroups: LocatedMeaningUnitBoundary[][] = [];
  for (const index of adjacency.keys()) {
    if (visited.has(index)) {
      continue;
    }
    const pending = [index];
    const group: LocatedMeaningUnitBoundary[] = [];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === undefined || visited.has(current)) {
        continue;
      }
      visited.add(current);
      const locatedUnit = locatedByIndex.get(current);
      if (locatedUnit) {
        group.push(locatedUnit);
      }
      adjacency.get(current)?.forEach((neighbour) => pending.push(neighbour));
    }
    if (group.length > 1) {
      overlapGroups.push(group.sort((left, right) => left.index - right.index));
    }
  }

  if (overlapGroups.length === 0) {
    return {
      collapsedCandidateCount: 0,
      meaningUnits: units,
      overlapGroupCount: 0,
    };
  }

  const groupByIndex = new Map<number, LocatedMeaningUnitBoundary[]>();
  overlapGroups.forEach((group) =>
    group.forEach((item) => groupByIndex.set(item.index, group)),
  );
  const emittedGroups = new Set<LocatedMeaningUnitBoundary[]>();
  const meaningUnits: MeaningUnit[] = [];
  for (const [index, unit] of units.entries()) {
    const group = groupByIndex.get(index);
    if (!group) {
      meaningUnits.push(unit);
      continue;
    }
    if (emittedGroups.has(group)) {
      continue;
    }
    emittedGroups.add(group);
    const start = Math.min(...group.map((item) => item.start));
    const end = Math.max(...group.map((item) => item.end));
    const sourceTurnIds = [
      ...new Set(group.flatMap((item) => item.unit.sourceTurnIds ?? [])),
    ].sort(
      (left, right) =>
        (sourceOffsets.get(left)?.turn.turnIndex ?? Number.MAX_SAFE_INTEGER) -
        (sourceOffsets.get(right)?.turn.turnIndex ?? Number.MAX_SAFE_INTEGER),
    );
    const base = group[0].unit;
    const overlapWarning =
      "Overlapping AI boundaries were collapsed into one source-verbatim span. Split it into non-overlapping semantic MUs before accepting it.";
    meaningUnits.push({
      ...base,
      aiExcerpt: participantSource.slice(start, end).trim(),
      aiSummary: "",
      analysisExcluded: false,
      classification: "uncertain",
      contextExcerpt: contextForSourceTurns(sourceTurnIds, turns),
      excerpt: participantSource.slice(start, end).trim(),
      exclusionReason: undefined,
      humanStatus: "Needs review",
      humanSummary: "",
      reviewerStatus: "Warning",
      reviewerWarnings: [
        ...new Set([
          ...group.flatMap((item) => item.unit.reviewerWarnings ?? []),
          overlapWarning,
        ]),
      ],
      sourceEndLine: Math.max(
        ...sourceTurnIds.map(
          (turnId) => sourceOffsets.get(turnId)?.turn.endLine ?? 0,
        ),
      ),
      sourceStartLine: Math.min(
        ...sourceTurnIds.map(
          (turnId) =>
            sourceOffsets.get(turnId)?.turn.startLine ?? Number.MAX_SAFE_INTEGER,
        ),
      ),
      sourceTurnIds,
      uncertainty: [base.uncertainty, overlapWarning]
        .filter(Boolean)
        .join(" "),
    });
  }

  return {
    collapsedCandidateCount: overlapGroups.reduce(
      (count, group) => count + group.length,
      0,
    ),
    meaningUnits,
    overlapGroupCount: overlapGroups.length,
  };
}

function meaningUnitBoundariesOverlap(
  left: LocatedMeaningUnitBoundary,
  right: LocatedMeaningUnitBoundary,
) {
  const sharedTurn = (left.unit.sourceTurnIds ?? []).some((turnId) =>
    (right.unit.sourceTurnIds ?? []).includes(turnId),
  );
  if (!sharedTurn) {
    return false;
  }
  const overlapLength =
    Math.min(left.end, right.end) - Math.max(left.start, right.start);
  if (overlapLength <= 0) {
    return false;
  }
  const leftLength = left.end - left.start;
  const rightLength = right.end - right.start;
  const shorterLength = Math.min(leftLength, rightLength);
  const normalizedLeft = buildAnchorSearchText(left.unit.excerpt).text;
  const normalizedRight = buildAnchorSearchText(right.unit.excerpt).text;
  if (normalizedLeft === normalizedRight) {
    return true;
  }
  const shorterCoverage = overlapLength / Math.max(shorterLength, 1);
  return (
    (overlapLength >= 8 && shorterCoverage >= 0.8) ||
    (overlapLength >= 20 && shorterCoverage >= 0.3)
  );
}

function buildAnchorSearchText(value: string) {
  let text = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < value.length; ) {
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }
    const character = String.fromCodePoint(codePoint);
    const characterEnd = index + character.length;
    const folded = character
      .normalize("NFKD")
      .toLocaleLowerCase()
      .replace(/\p{M}/gu, "");
    for (const foldedCharacter of folded) {
      if (/^[\p{L}\p{N}]$/u.test(foldedCharacter)) {
        text += foldedCharacter;
        starts.push(index);
        ends.push(characterEnd);
        continue;
      }
      if (/^[’‘'"“”]$/u.test(foldedCharacter)) {
        continue;
      }
      if (text && !text.endsWith(" ")) {
        text += " ";
        starts.push(index);
        ends.push(characterEnd);
      }
    }
    index = characterEnd;
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    starts.pop();
    ends.pop();
  }
  return { ends, starts, text };
}

function resolveRequestedSourceTurn(
  requestedId: string,
  participantTurns: ClassifiedTranscriptTurn[],
) {
  const normalized = requestedId.trim().toUpperCase();
  const direct = participantTurns.find(
    (turn) => turn.id.toUpperCase() === normalized,
  );
  if (direct) {
    return direct;
  }
  const numericSuffix = normalized.match(/(?:TURN[-_ ]*)?(\d+)$/)?.[1];
  if (!numericSuffix) {
    return undefined;
  }
  const canonicalId = `TURN-${numericSuffix.padStart(4, "0")}`;
  return participantTurns.find((turn) => turn.id === canonicalId);
}

function sanitizeSemanticExcerpt(
  excerpt: string,
  sourceTurns: ClassifiedTranscriptTurn[],
) {
  const withoutRoleLines = excerpt
    .split("\n")
    .filter(
      (line) =>
        !/^\s*(?:facilitator|moderator|interviewer|researcher)(?:\s+[a-z]?\d+)?\s*[:：]/iu.test(
          line,
        ),
    )
    .join("\n")
    .trim();
  if (withoutRoleLines) {
    return stripSpeakerPrefix(withoutRoleLines);
  }
  return sourceTurns.map((turn) => turn.content).join("\n").trim();
}

function sanitizeSemanticSummary(summary: string, excerpt: string) {
  if (!summary) {
    return "";
  }
  if (
    /participant\s+(?:expressed|said|described)\s+(?:facilitator|moderator|interviewer|researcher)\b/iu.test(
      summary,
    )
  ) {
    return "";
  }
  if (summaryIsTooCloseToExcerpt(summary, excerpt)) {
    return summary;
  }
  return summary;
}

function orderAndNumberAnalysisRecords(
  records: MeaningUnit[],
  turns: ClassifiedTranscriptTurn[],
  startingNumber: number,
) {
  const turnOrder = new Map(turns.map((turn, index) => [turn.id, index]));
  const ordered = records
    .map((record, originalIndex) => ({ record, originalIndex }))
    .sort((left, right) => {
      const firstTurn = (item: MeaningUnit) =>
        Math.min(
          ...(item.sourceTurnIds ?? []).map(
            (id) => turnOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
          ),
        );
      return (
        firstTurn(left.record) - firstTurn(right.record) ||
        left.originalIndex - right.originalIndex
      );
    });
  return ordered.map(({ record }, index) => ({
      ...record,
      id: `mu_${String(startingNumber + index).padStart(4, "0")}`,
      number: startingNumber + index,
    }));
}

function countGenerationRecords(
  turns: ClassifiedTranscriptTurn[],
  records: MeaningUnit[],
  noSubstantiveSourceTurnIds: ReadonlySet<string> = new Set<string>(),
) {
  return {
    participantTurns: turns.filter((turn) => turn.role === "participant").length,
    substantiveMeaningUnits: records.filter(
      (unit) => unit.classification === "substantive_participant",
    ).length,
    contextOnlySegments: turns.filter(
      (turn) =>
        turn.role !== "participant" && turn.classification === "context_only",
    ).length,
    nonAnalyticSegments:
      records.filter((unit) => unit.classification === "non_analytic").length +
      turns.filter(
        (turn) =>
          (turn.role !== "participant" &&
            turn.classification === "non_analytic") ||
          (turn.role === "participant" &&
            noSubstantiveSourceTurnIds.has(turn.id)),
      ).length,
    uncertainSegments:
      records.filter((unit) => unit.classification === "uncertain").length +
      turns.filter((turn) => turn.role === "unclear").length,
    openingBackgroundCandidates: records.filter(isOpeningBackgroundCandidate)
      .length,
  };
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

function summaryIsTooCloseToExcerpt(summary: string, excerpt: string) {
  const normalizedSummary = normalizeForSimilarity(summary);
  const normalizedExcerpt = normalizeForSimilarity(excerpt);
  if (!normalizedSummary || !normalizedExcerpt) {
    return false;
  }
  if (
    normalizedExcerpt.includes(normalizedSummary) &&
    normalizedSummary.length > 24
  ) {
    return true;
  }
  if (/[\u3400-\u9fff]/.test(normalizedSummary)) {
    const summaryChars = new Set([...normalizedSummary.replace(/\s/g, "")]);
    const excerptChars = new Set([...normalizedExcerpt.replace(/\s/g, "")]);
    if (summaryChars.size < 8) {
      return false;
    }
    const overlap = [...summaryChars].filter((char) =>
      excerptChars.has(char)
    ).length;
    return overlap / summaryChars.size > 0.9 && normalizedSummary.length > 24;
  }
  const summaryTokens = new Set(normalizedSummary.split(" ").filter(Boolean));
  const excerptTokens = new Set(normalizedExcerpt.split(" ").filter(Boolean));
  if (summaryTokens.size < 5) {
    return false;
  }
  const overlap = [...summaryTokens].filter((token) =>
    excerptTokens.has(token)
  ).length;
  return overlap / summaryTokens.size > 0.86 && summaryTokens.size > 10;
}

function normalizeForSimilarity(text: string) {
  return stripSpeakerPrefix(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSpeakerPrefix(text: string) {
  return text
    .replace(
      /^(interviewer|researcher|moderator|facilitator|participant|interviewee|respondent|student|[IQPA])(?:\s+[a-z]?\d+)?\s*[:：]\s*/i,
      "",
    )
    .trim();
}

function normalizeCategories(
  items: Array<Partial<CategoryNode>>,
  source: CategoryNode["source"] = "ai",
  idPrefix = "cat_ai",
): CategoryNode[] {
  return items
    .map((item, index): CategoryNode => {
      const status: CategoryNode["status"] =
        source === "fallback" ? "fallback_draft" : "ai_draft";
      return {
        id: `${idPrefix}_${String(index + 1).padStart(3, "0")}`,
        confidence: normalizeConfidence(item.confidence),
        comparisonDifferenceNote: cleanText(item.comparisonDifferenceNote),
        comparisonSimilarityNote: cleanText(item.comparisonSimilarityNote),
        name:
          safeCategoryTitle(cleanText(item.name), index + 1) ||
          `Draft category ${index + 1}: Needs researcher review`,
        definition:
          cleanText(item.definition) ||
          "AI-drafted category definition. Review and edit before using.",
        exclusionCriteria: cleanText(item.exclusionCriteria),
        groupingDecision: normalizeGroupingDecision(item.groupingDecision),
        includedUnitIds: numberArray(item.includedUnitIds),
        inclusionCriteria: cleanText(item.inclusionCriteria),
        rationale: cleanText(item.rationale),
        source,
        status,
        subcategories: normalizeCategories(
          item.subcategories ?? [],
          source,
          `${idPrefix}_${String(index + 1).padStart(3, "0")}`,
        )
      };
    })
    .map((item) =>
      item.subcategories?.length ? item : { ...item, subcategories: undefined }
    );
}

function normalizeGroupingDecision(
  value: unknown,
): CategoryNode["groupingDecision"] {
  return value === "yes" || value === "partly" || value === "no"
    ? value
    : undefined;
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

function buildDeterministicMeaningUnitReviewerComments(units: MeaningUnit[]) {
  return units.flatMap((unit) =>
    reviewerWarningsForMeaningUnit(unit).map((warning, index) => {
      const [issueType] = warning.split(":", 1);
      return {
        agent: "Automated Step 2 safeguard",
        comment: warning,
        id: `review_auto_${unit.id}_${index + 1}`,
        issueType: issueType || "Meaning-unit review warning",
        resolved: false,
        severity:
          warning.startsWith("Speaker-role error") ||
          warning.startsWith("Mixed-role contamination")
            ? ("major" as const)
            : ("warning" as const),
        status: "unresolved" as const,
        suggestedAction:
          "Review the source, context, boundary, classification, and summary; then revise, split, merge, exclude, or resolve this warning with a memo.",
        target: `MU ${unit.number}`,
        targetId: `MU${unit.number}`,
        targetType: "meaning_unit" as const,
        workspace: "meaning-units" as const,
      } satisfies ReviewerComment;
    }),
  );
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
