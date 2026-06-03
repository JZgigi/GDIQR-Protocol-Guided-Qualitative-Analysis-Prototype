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
  const chunks = chunkTranscript(
    input.transcript,
    Number(process.env.TRANSCRIPT_MU_CHUNK_CHARS ?? 1200)
  );
  const caseId = input.caseId ?? "CASE-001";
  const segmentId = input.segmentId ?? "SEG-001";
  const initialNumber = input.startingNumber ?? 1;
  const allUnits: MeaningUnit[] = [];
  const allUncertainties: Array<{ unit: number; note: string }> = [];

  addRunEvent(
    input.runId,
    `Meaning-unit generation split transcript into ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}`
  );

  for (const [index, chunk] of chunks.entries()) {
    throwIfAborted(input.abortSignal);
    const startedAt = Date.now();
    const startingNumber = initialNumber + allUnits.length;
    addRunEvent(
      input.runId,
      `Calling Ollama for MU chunk ${index + 1}/${chunks.length} (${chunk.length} chars)`
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
Create GDIQR meaning units from this reviewed transcript segment.

Rules:
- Preserve participant meaning closely.
- Do not create categories in this step.
- Do not compare this segment with other transcripts or segments.
- Keep summaries concise and descriptive.
- Write aiSummary and humanSummary in the same language as the interview transcript.
- Produce at most 5 meaning units for this chunk; combine adjacent short turns when they express the same point.
- Set humanSummary to the exact same summary text as aiSummary.
- Use reviewerStatus "Not run" unless there is a clear concern, then use "Warning".
- Start numbering at ${startingNumber}.
- Use caseId "${input.caseId ?? "CASE-001"}" and segmentId "${input.segmentId ?? "SEG-001"}".
- Return only JSON matching this shape:
{
  "caseId": "${input.caseId ?? "CASE-001"}",
  "segmentId": "${input.segmentId ?? "SEG-001"}",
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
        segmentId: input.segmentId ?? result.segmentId ?? "SEG-001"
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
    return await generateMeaningUnitsForChunk({
      chunk,
      chunkIndex,
      input,
      startingNumber
    });
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
        segmentId: input.segmentId ?? "SEG-001"
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
          ? "Local fallback created a draft category grouping only. Please write or revise the integrated narrative after reviewing the categories."
          : "",
      isFallbackDraft: true,
      uncertainties: [
        "Local fallback categories are mechanical draft groupings from confirmed summaries. Review, rename, merge, or replace them before treating them as analysis."
      ]
    };
  }
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
- Use the existing category system as the starting point.
- Compare each confirmed summary against existing categories/subcategories.
- Decide whether each summary fits, requires a new category/subcategory, or suggests merging/redefining categories.
- Explicitly report structural changes in categoryRevisions.
- Maintain parsimony and avoid category proliferation.
- Do not produce narrative integration.`
        : `MODE C - Final Integration
- Use only after the researcher has confirmed all segments in this transcript have been processed and reviewed.
- Review the full category system globally for coherence and parsimony.
- Finalise a hierarchical structure, normally 3-6 levels at most.
- Produce integratedNarrative that answers the research question, explains central patterns, identifies tensions/contradictions, and notes interpretative limits.
- Do not introduce new categories unless essential for coherence.`;

  return `/no_think
You are a qualitative research assistant using a Generic Descriptive-Interpretive qualitative research approach (GDIQR).

Task: Construct, refine, or integrate a category system using constant comparison across confirmed meaning-unit summaries.

${modeInstructions}

Global rules:
- Use only the research question, confirmed meaning-unit summaries, and existing category system when provided.
- Do not return to raw transcript text.
- Do not introduce external theory or general world knowledge.
- Categories must address the research question and say something substantive.
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
You are a GDIQR reviewer agent. Your task is to audit the AI-generated Meaning Units + Summaries against the GDIQR protocol.

You are NOT generating new analysis.
You are NOT creating categories or themes.
You are NOT integrating findings.
You are only checking whether the current output follows the protocol.

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
You are a GDIQR category reviewer agent. Your task is to audit the category construction, refinement, or final integration output against GDIQR rules.

You are NOT generating a new category system unless asked.
You are NOT creating new findings.
You are NOT returning to the raw transcript.
You are only checking whether the category output follows the selected mode.

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
- No integrated narrative is produced.

Mode C:
- Used only after "All batches processed".
- Full category system is reviewed globally.
- Final structure is coherent and parsimonious.
- Integrated narrative answers the research question.
- Central patterns, tensions, contradictions, and interpretative limits are included.
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
  transcriptionSegments
}: {
  chunk: string;
  chunkIndex: number;
  language: Project["language"];
  runId?: string;
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
3. Detect privacy-sensitive information, including specific person names, exact addresses, local place names, workplaces, schools, organizations, phone numbers, emails, IDs, social handles, URLs, and highly identifying rare details.
4. For high-confidence direct identifiers, replace with stable bracket placeholders, for example [PERSON_1], [LOCATION_1], [ORGANIZATION_1], [CONTACT_1], [IDENTIFIER_1], [DATE_1], [OTHER_PRIVATE_DETAIL_1].
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
        timeoutMs: Number(
          process.env.OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS ?? 300000
        )
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
      "You are a careful qualitative analysis assistant specialized in Generic Descriptive-Interpretive Qualitative Research (GDIQR). Return strict JSON only. Do not wrap JSON in markdown. Do not output chain-of-thought."
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
  const lines = chunk
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const participantLines = lines.filter((line) =>
    /^participant\s*:/i.test(line)
  );
  const sourceLines = participantLines.length ? participantLines : lines;
  const grouped = groupLines(sourceLines, 5);

  return grouped
    .map((group, index) => {
      const number = startingNumber + index;
      const text = group
        .join(" ")
        .replace(/^(interviewer|participant)\s*:\s*/i, "")
        .trim();
      const excerpt = text.slice(0, 260);
      const aiSummary =
        excerpt.length > 140 ? `${excerpt.slice(0, 137)}...` : excerpt;

      return {
        id: `mu_ai_${String(number).padStart(3, "0")}`,
        segmentId: defaults.segmentId,
        caseId: defaults.caseId,
        speaker: group.some((line) => /^interviewer\s*:/i.test(line))
          ? "Interviewer"
          : "Participant",
        number,
        excerpt,
        aiSummary: aiSummary || "Local fallback meaning unit",
        humanSummary: aiSummary || "Local fallback meaning unit",
        uncertainty:
          "Generated by local fallback because the Ollama meaning-unit chunk failed.",
        humanStatus: "Draft",
        reviewerStatus: "Warning",
        analysisExcluded: false
      } satisfies MeaningUnit;
    })
    .filter((unit) => unit.excerpt);
}

function groupLines(lines: string[], maxGroups: number) {
  if (lines.length <= maxGroups) {
    return lines.map((line) => [line]);
  }

  const groupSize = Math.ceil(lines.length / maxGroups);
  const groups: string[][] = [];
  for (let index = 0; index < lines.length; index += groupSize) {
    groups.push(lines.slice(index, index + groupSize));
  }
  return groups;
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

      return {
        id: `mu_ai_${String(number).padStart(3, "0")}`,
        segmentId: cleanText(item.segmentId) || defaults.segmentId,
        caseId: cleanText(item.caseId) || defaults.caseId,
        speaker: cleanText(item.speaker) || "Participant",
        number,
        excerpt: cleanText(item.excerpt),
        aiSummary,
        humanSummary:
          humanSummary.toLowerCase() === "same as aisummary"
            ? aiSummary
            : humanSummary || aiSummary,
        tentativeInterpretation:
          cleanText(item.tentativeInterpretation) || undefined,
        uncertainty: cleanText(item.uncertainty) || undefined,
        humanStatus: "Draft",
        reviewerStatus:
          item.reviewerStatus === "Warning" ||
          item.reviewerStatus === "Major issue"
            ? item.reviewerStatus
            : "Not run",
        analysisExcluded: false
      } satisfies MeaningUnit;
    })
    .filter((item) => item.excerpt && item.aiSummary);
}

function normalizeCategories(
  items: Array<Partial<CategoryNode>>,
  source: CategoryNode["source"] = "ai"
): CategoryNode[] {
  return items
    .map((item, index) => ({
      id: `cat_ai_${String(index + 1).padStart(3, "0")}`,
      name: cleanText(item.name) || `Category ${index + 1}`,
      definition: cleanText(item.definition),
      includedUnitIds: numberArray(item.includedUnitIds),
      source,
      subcategories: normalizeCategories(item.subcategories ?? [], source)
    }))
    .map((item) =>
      item.subcategories.length ? item : { ...item, subcategories: undefined }
    );
}

function fallbackCategoriesFromUnits(units: MeaningUnit[]): CategoryNode[] {
  const topLevelCount = Math.min(4, Math.max(2, Math.ceil(units.length / 4)));
  const groupSize = Math.ceil(units.length / topLevelCount);
  const categories: CategoryNode[] = [];

  for (let index = 0; index < units.length; index += groupSize) {
    const group = units.slice(index, index + groupSize);
    const firstSummary = group[0]?.humanSummary || group[0]?.aiSummary || "";
    const name = fallbackCategoryName(firstSummary, categories.length + 1);
    categories.push({
      id: `cat_fallback_${String(categories.length + 1).padStart(3, "0")}`,
      name,
      definition:
        "Draft grouping from confirmed meaning-unit summaries; review and refine.",
      includedUnitIds: group.map((unit) => unit.number),
      source: "fallback"
    });
  }

  return categories;
}

function fallbackCategoryName(summary: string, index: number) {
  const cleaned = cleanText(summary).replace(/\s+/g, " ");
  if (!cleaned) {
    return `Draft category ${index}`;
  }

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length > 1) {
    return `Draft category ${index}: ${words.slice(0, 6).join(" ")}`;
  }

  return `Draft category ${index}: ${cleaned.slice(0, 18)}`;
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
      const issueType = cleanText(item.issueType) || cleanText(item.agent) || "Protocol check";
      const shortTitle =
        cleanText((item as { shortTitle?: string }).shortTitle) || issueType;

      return {
        id: `rev_ai_${String(index + 1).padStart(3, "0")}`,
        agent:
          workspace === "categories"
            ? "GDIQR Category Review"
            : "GDIQR Meaning Units Review",
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
