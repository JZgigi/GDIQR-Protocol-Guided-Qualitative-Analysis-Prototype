import type {
  CategoryMode,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerComment
} from "@/lib/types";

type AiProvider = "ollama";

interface OllamaMessage {
  role: "system" | "user";
  content: string;
}

interface MeaningUnitInput {
  lightInterpretation: boolean;
  project: Project;
  transcript: string;
}

interface CategoryInput {
  mode: CategoryMode;
  project: Project;
  units: MeaningUnit[];
}

interface ReviewerInput {
  project: Project;
  units: MeaningUnit[];
  categories: CategoryNode[];
  integratedNarrative: string;
}

interface TranscriptProcessingInput {
  language: Project["language"];
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
Create GDIQR meaning units from this transcript.

Rules:
- Preserve participant meaning closely.
- Do not create categories in this step.
- Keep summaries concise and descriptive.
- Set humanSummary equal to aiSummary.
- Use reviewerStatus "Not run" unless there is a clear concern, then use "Warning".
- Return only JSON matching this shape:
{
  "caseId": "CASE-001",
  "segmentId": "SEG-001",
  "meaningUnits": [
    {
      "speaker": "Participant",
      "number": 1,
      "excerpt": "short verbatim excerpt",
      "aiSummary": "concise summary",
      "humanSummary": "same as aiSummary",
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

Transcript:
${input.transcript}`
      }
    ],
    {
      maxTokens: Number(process.env.OLLAMA_MU_MAX_TOKENS ?? 1800),
      timeoutMs: getOllamaTimeoutMs()
    }
  );

  const meaningUnits = normalizeMeaningUnits(result.meaningUnits ?? []);

  return {
    provider: "ollama",
    model,
    caseId: result.caseId ?? "CASE-001",
    segmentId: result.segmentId ?? "SEG-001",
    lightInterpretation: input.lightInterpretation,
    meaningUnits,
    uncertainties: (result.uncertainties ?? [])
      .filter((item) => item.unit && item.note)
      .map((item) => ({ unit: item.unit ?? 0, note: item.note ?? "" })),
    nextInstruction: "Review and accept or edit the generated meaning units."
  };
}

export async function generateCategories(
  input: CategoryInput
): Promise<CategoryResult> {
  assertOllamaConfigured();
  if (input.units.length === 0) {
    throw new Error("Meaning units are required before generating categories.");
  }

  const model = getOllamaModel();
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
        content: `/no_think
Construct a compact GDIQR category system for Mode ${input.mode}.

Rules:
- Use only the provided meaning units.
- Category includedUnitIds must refer to MU numbers only.
- Preserve tensions and uncertainty rather than over-interpreting.
- Produce 2 to 4 top-level categories.
- Produce at most 2 subcategories per top-level category.
- Keep every definition under 25 words.
- Do not include chain-of-thought or reasoning notes.
- In Mode C only, include structuralModel and integratedNarrative.
- Return only JSON matching this shape:
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
  "categoryRevisions": ["optional revision note"],
  "structuralModel": "only for Mode C or empty string",
  "integratedNarrative": "only for Mode C or empty string",
  "uncertainties": ["optional uncertainty"]
}

Research question: ${input.project.researchQuestion}
Interview language: ${input.project.language}
Meaning units:
${input.units
  .map(
    (unit) =>
      `MU ${unit.number}: ${unit.excerpt}\nSummary: ${unit.humanSummary || unit.aiSummary}`
  )
  .join("\n\n")}`
      }
    ],
    {
      maxTokens: Number(process.env.OLLAMA_CATEGORY_MAX_TOKENS ?? 1800),
      timeoutMs: getOllamaTimeoutMs()
    }
  );

  return {
    provider: "ollama",
    model,
    caseId: input.units[0]?.caseId ?? "CASE-001",
    researchQuestion: input.project.researchQuestion,
    mode: input.mode,
    categories: normalizeCategories(result.categories ?? []),
    categoryRevisions: stringArray(result.categoryRevisions),
    structuralModel: result.structuralModel ?? "",
    integratedNarrative: result.integratedNarrative ?? "",
    uncertainties: stringArray(result.uncertainties)
  };
}

export async function generateReviewer(
  input: ReviewerInput
): Promise<ReviewerResult> {
  assertOllamaConfigured();
  if (input.units.length === 0) {
    throw new Error("Meaning units are required before running reviewer agents.");
  }

  const model = getOllamaModel();
  const result = await callOllamaJson<{ comments?: Array<Partial<ReviewerComment>> }>(
    [
      systemMessage(),
      {
        role: "user",
        content: `/no_think
Review this GDIQR analysis.

Rules:
- Check meaning-unit coverage, category coherence, GDIQR boundary discipline, and uncertainty handling.
- Do not rewrite the full analysis.
- Return 2 to 5 actionable reviewer comments.
- Keep each comment under 30 words.
- Severity must be "Pass", "Warning", or "Major issue".
- Return only JSON matching this shape:
{
  "comments": [
    {
      "agent": "Coverage Reviewer",
      "target": "MU 1",
      "severity": "Warning",
      "comment": "specific finding",
      "suggestedAction": "specific action",
      "resolved": false
    }
  ]
}

Project:
${JSON.stringify(input.project, null, 2)}

Meaning units:
${input.units
  .map(
    (unit) =>
      `MU ${unit.number}: ${unit.excerpt}\nSummary: ${unit.humanSummary || unit.aiSummary}`
  )
  .join("\n\n")}

Categories:
${JSON.stringify(input.categories, null, 2)}

Integrated narrative:
${input.integratedNarrative}`
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
    comments: normalizeReviewerComments(result.comments ?? [])
  };
}

export async function processTranscriptForPrivacyAndSpeakers(
  input: TranscriptProcessingInput
): Promise<TranscriptProcessingResult> {
  assertOllamaConfigured();
  assertNonEmpty(input.transcript, "Transcript is required before privacy review.");

  const model = getOllamaModel();
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
Prepare this raw interview transcript for qualitative analysis.

Tasks:
1. Separate speech into turns labelled exactly "Interviewer:" and "Participant:".
2. Infer speakers conservatively from questions, answers, greetings, and interview flow. If uncertain, choose the most likely label and add a short speakerNotes item.
3. Detect and anonymize privacy-sensitive information, including specific person names, exact addresses, local place names, workplaces, schools, organizations, phone numbers, emails, IDs, social handles, URLs, and highly identifying rare details.
4. Replace private details with stable bracket placeholders, for example [PERSON_1], [LOCATION_1], [ORGANIZATION_1], [CONTACT_1], [IDENTIFIER_1], [DATE_1], [OTHER_PRIVATE_DETAIL_1].
5. Do not summarize, translate, add new content, or remove research meaning.
6. Preserve the original interview language: ${input.language}.
7. Return only JSON matching this shape:
{
  "sanitizedTranscript": "Interviewer: ...\\nParticipant: ...",
  "privacyFindings": ["[PERSON_1] replaced a specific person name"],
  "speakerNotes": ["optional uncertainty note"]
}

Raw transcript:
${input.transcript}

Timestamped transcription segments for reference:
${JSON.stringify(input.transcriptionSegments?.slice(0, 80) ?? [], null, 2)}`
      }
    ],
    {
      maxTokens: Number(process.env.OLLAMA_TRANSCRIPT_PROCESS_MAX_TOKENS ?? 4096),
      timeoutMs: Number(process.env.OLLAMA_TRANSCRIPT_PROCESS_TIMEOUT_MS ?? 300000)
    }
  );

  const sanitizedTranscript = cleanText(result.sanitizedTranscript);
  assertNonEmpty(
    sanitizedTranscript,
    "Privacy/speaker transcript processing returned an empty transcript."
  );

  return {
    provider: "ollama",
    model,
    sanitizedTranscript,
    privacyFindings: stringArray(result.privacyFindings),
    speakerNotes: stringArray(result.speakerNotes)
  };
}

function systemMessage(): OllamaMessage {
  return {
    role: "system",
    content:
      "You are a careful qualitative analysis assistant specialized in Giorgi-informed descriptive phenomenological qualitative research. Return strict JSON only. Do not wrap JSON in markdown. Do not output chain-of-thought."
  };
}

async function callOllamaJson<T>(
  messages: OllamaMessage[],
  options: { maxTokens?: number; timeoutMs?: number } = {}
): Promise<T> {
  const maxTokens = options.maxTokens ?? 1600;
  const timeoutMs = options.timeoutMs ?? getOllamaTimeoutMs();
  const content = await callOllamaContent(messages, timeoutMs, maxTokens);

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
      Math.min(maxTokens, 1600)
    );

    return parseJsonObject<T>(repaired);
  }
}

async function callOllamaContent(
  messages: OllamaMessage[],
  timeoutMs: number,
  maxTokens: number
) {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with ${response.status}.`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return content;
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

function getOllamaModel() {
  return process.env.OLLAMA_MODEL ?? "qwen3:8b";
}

function getOllamaTimeoutMs() {
  return Number(process.env.OLLAMA_API_TIMEOUT_MS ?? 300000);
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

function normalizeMeaningUnits(items: Array<Partial<MeaningUnit>>) {
  return items
    .map((item, index) => {
      const number = toNumber(item.number, index + 1);
      const aiSummary = cleanText(item.aiSummary);

      return {
        id: `mu_ai_${String(number).padStart(3, "0")}`,
        segmentId: cleanText(item.segmentId) || "SEG-001",
        caseId: cleanText(item.caseId) || "CASE-001",
        speaker: cleanText(item.speaker) || "Participant",
        number,
        excerpt: cleanText(item.excerpt),
        aiSummary,
        humanSummary: cleanText(item.humanSummary) || aiSummary,
        tentativeInterpretation:
          cleanText(item.tentativeInterpretation) || undefined,
        uncertainty: cleanText(item.uncertainty) || undefined,
        humanStatus: "Draft",
        reviewerStatus:
          item.reviewerStatus === "Warning" ||
          item.reviewerStatus === "Major issue"
            ? item.reviewerStatus
            : "Not run"
      } satisfies MeaningUnit;
    })
    .filter((item) => item.excerpt && item.aiSummary);
}

function normalizeCategories(
  items: Array<Partial<CategoryNode>>
): CategoryNode[] {
  return items
    .map((item, index) => ({
      id: `cat_ai_${String(index + 1).padStart(3, "0")}`,
      name: cleanText(item.name) || `Category ${index + 1}`,
      definition: cleanText(item.definition),
      includedUnitIds: numberArray(item.includedUnitIds),
      subcategories: normalizeCategories(item.subcategories ?? [])
    }))
    .map((item) =>
      item.subcategories.length ? item : { ...item, subcategories: undefined }
    );
}

function normalizeReviewerComments(
  items: Array<Partial<ReviewerComment>>
): ReviewerComment[] {
  return items
    .map((item, index) => {
      const severity: ReviewerComment["severity"] =
        item.severity === "Major issue" || item.severity === "Warning"
          ? item.severity
          : "Pass";

      return {
        id: `rev_ai_${String(index + 1).padStart(3, "0")}`,
        agent: cleanText(item.agent) || "GDIQR Reviewer",
        target: cleanText(item.target) || "Analysis",
        severity,
        comment: cleanText(item.comment),
        suggestedAction: cleanText(item.suggestedAction),
        resolved: Boolean(item.resolved)
      };
    })
    .filter((item) => item.comment);
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
