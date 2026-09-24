import {
  benchmarkStageKinds,
  type BenchmarkStageKind,
  type CreateBenchmarkRunInput
} from "./types.ts";
import { meaningUnitPromptReferences } from "./mu-prompts.ts";
import { MU_SCHEMA_VERSION } from "./mu-validation.ts";

const forbiddenBenchmarkInputKeys = new Set([
  "humanmeaningunits",
  "humansummaries",
  "categorymembership",
  "categorymemberships",
  "categoryedits",
  "reviewercomments",
  "integratedfindings",
  "comparisondata",
  "humananalysis",
  "researchernotes",
  "researcherreflexivitynotes"
]);

function assertAllowedKeys(
  value: object,
  allowedKeys: readonly string[],
  path: string
) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`Benchmark input contains prohibited field at ${path}.${key}.`);
    }
  }
}

function normalizedKey(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function assertNoHumanAnalysisFields(value: unknown, path = "input") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoHumanAnalysisFields(item, `${path}[${index}]`)
    );
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenBenchmarkInputKeys.has(normalizedKey(key))) {
      throw new Error(
        `Benchmark input contains prohibited human-derived analysis at ${path}.${key}.`
      );
    }
    assertNoHumanAnalysisFields(item, `${path}.${key}`);
  }
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

export function validateCreateBenchmarkRunInput(
  value: unknown
): CreateBenchmarkRunInput {
  assertNoHumanAnalysisFields(value);
  if (!value || typeof value !== "object") {
    throw new Error("Benchmark run input must be an object.");
  }

  const input = value as CreateBenchmarkRunInput;
  assertAllowedKeys(
    input,
    [
      "projectId",
      "researchQuestion",
      "studyContext",
      "analyticDataset",
      "transcripts",
      "speakerRoles",
      "methodologicalProtocol",
      "computationalConfiguration",
      "applicationVersion",
      "gitCommit"
    ],
    "input"
  );
  requiredText(input.projectId, "Project ID");
  requiredText(input.researchQuestion, "Research question");
  requiredText(input.studyContext, "Study context");

  const dataset = input.analyticDataset;
  if (!dataset || typeof dataset !== "object") {
    throw new Error("Analytic dataset metadata is required.");
  }
  assertAllowedKeys(
    dataset,
    [
      "originalDataLanguage",
      "benchmarkInputLanguage",
      "analyticOutputLanguage",
      "translatedTranscriptVersion",
      "translatedTranscriptHash",
      "participantVerified"
    ],
    "input.analyticDataset"
  );
  if (
    dataset.originalDataLanguage !== "zh-CN" ||
    dataset.benchmarkInputLanguage !== "en" ||
    dataset.analyticOutputLanguage !== "en" ||
    dataset.participantVerified !== true
  ) {
    throw new Error(
      "Benchmark v1 requires participant-verified English analytic transcripts prepared from zh-CN data."
    );
  }
  requiredText(
    dataset.translatedTranscriptVersion,
    "Translated transcript version"
  );
  if (dataset.translatedTranscriptHash !== undefined) {
    requiredText(dataset.translatedTranscriptHash, "Translated transcript hash");
  }

  if (!Array.isArray(input.transcripts) || input.transcripts.length === 0) {
    throw new Error("At least one transcript is required.");
  }
  const transcriptIds = new Set<string>();
  for (const transcript of input.transcripts) {
    assertAllowedKeys(
      transcript,
      ["transcriptId", "focusGroupId", "content", "turns"],
      "input.transcripts[]"
    );
    const transcriptId = requiredText(transcript.transcriptId, "Transcript ID");
    const focusGroupId = requiredText(transcript.focusGroupId, "Focus-group ID");
    requiredText(transcript.content, `Transcript ${transcriptId} content`);
    const cjkCharacters = transcript.content.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
    if (cjkCharacters >= 20 && cjkCharacters / transcript.content.length >= 0.05) {
      throw new Error(
        `Transcript ${transcriptId} appears to contain Chinese source data; the benchmark EvidenceBundle accepts only the final verified English transcript.`
      );
    }
    if (transcriptIds.has(transcriptId)) {
      throw new Error(`Duplicate transcript ID: ${transcriptId}.`);
    }
    transcriptIds.add(transcriptId);
    if (!Array.isArray(transcript.turns)) {
      throw new Error(`Transcript ${transcriptId} turns must be an array.`);
    }
    const turnIds = new Set<string>();
    for (const turn of transcript.turns) {
      assertAllowedKeys(
        turn,
        ["turnId", "speakerId", "start", "end", "text"],
        `input.transcripts[${transcriptId}].turns[]`
      );
      const turnId = requiredText(turn.turnId, "Turn ID");
      if (turnIds.has(turnId)) {
        throw new Error(`Duplicate turn ID ${turnId} in transcript ${transcriptId}.`);
      }
      turnIds.add(turnId);
      requiredText(turn.speakerId, "Turn speaker ID");
      requiredText(turn.text, "Turn text");
      const hasStart = turn.start !== undefined;
      const hasEnd = turn.end !== undefined;
      if (hasStart !== hasEnd) {
        throw new Error(`Turn ${turn.turnId} must provide both offsets or neither.`);
      }
      if (hasStart && hasEnd) {
        if (
          !Number.isInteger(turn.start) ||
          !Number.isInteger(turn.end) ||
          (turn.start as number) < 0 ||
          (turn.end as number) < (turn.start as number) ||
          transcript.content.slice(turn.start, turn.end) !== turn.text
        ) {
          throw new Error(`Turn ${turn.turnId} has an invalid transcript span.`);
        }
      }
    }
  }

  if (!Array.isArray(input.speakerRoles)) {
    throw new Error("Speaker roles must be an array.");
  }
  const transcriptFocusGroups = new Map(
    input.transcripts.map((transcript) => [
      transcript.transcriptId,
      transcript.focusGroupId
    ])
  );
  const assignedSpeakers = new Set<string>();
  for (const speaker of input.speakerRoles) {
    assertAllowedKeys(
      speaker,
      ["transcriptId", "focusGroupId", "speakerId", "role"],
      "input.speakerRoles[]"
    );
    if (!transcriptIds.has(speaker.transcriptId)) {
      throw new Error(
        `Speaker ${speaker.speakerId} references an unknown transcript.`
      );
    }
    if (transcriptFocusGroups.get(speaker.transcriptId) !== speaker.focusGroupId) {
      throw new Error(
        `Speaker ${speaker.speakerId} does not match its transcript focus group.`
      );
    }
    requiredText(speaker.speakerId, "Speaker ID");
    if (!["participant", "facilitator", "unknown"].includes(speaker.role)) {
      throw new Error(`Invalid speaker role for ${speaker.speakerId}.`);
    }
    assignedSpeakers.add(`${speaker.transcriptId}:${speaker.speakerId}`);
  }
  for (const transcript of input.transcripts) {
    for (const turn of transcript.turns) {
      if (!assignedSpeakers.has(`${transcript.transcriptId}:${turn.speakerId}`)) {
        throw new Error(
          `Turn ${turn.turnId} has no frozen speaker-role assignment.`
        );
      }
    }
  }

  const protocol = input.methodologicalProtocol;
  if (!protocol || typeof protocol !== "object") {
    throw new Error("Methodological protocol is required.");
  }
  assertAllowedKeys(
    protocol,
    [
      "name",
      "version",
      "meaningUnitRules",
      "meaningUnitReviewCriteria",
      "categoryRules",
      "categoryReviewCriteria",
      "integrationRules",
      "integrationReviewCriteria",
      "reviewPasses"
    ],
    "input.methodologicalProtocol"
  );
  requiredText(protocol.name, "Methodological protocol name");
  requiredText(protocol.version, "Methodological protocol version");
  if (
    protocol.reviewPasses?.meaningUnits !== 1 ||
    protocol.reviewPasses?.categories !== 1 ||
    protocol.reviewPasses?.integration !== 1
  ) {
    throw new Error("Benchmark v1 requires exactly one review pass per phase.");
  }

  const configuration = input.computationalConfiguration;
  if (!configuration || typeof configuration !== "object") {
    throw new Error("Computational configuration is required.");
  }
  assertAllowedKeys(
    configuration,
    [
      "version",
      "provider",
      "model",
      "modelDigest",
      "temperature",
      "seed",
      "requestTimeoutMs",
      "tokenLimits",
      "chunkingPolicy",
      "technicalRetryCount",
      "jsonRepairEnabled",
      "jsonRepairPrompt",
      "schemaVersions",
      "promptTemplates"
    ],
    "input.computationalConfiguration"
  );
  requiredText(configuration.version, "Computational configuration version");
  requiredText(configuration.provider, "Model provider");
  if (configuration.provider !== "ollama") {
    throw new Error("Benchmark v1 currently supports only the locked Ollama provider.");
  }
  requiredText(configuration.model, "Model");
  if (!Number.isFinite(configuration.temperature)) {
    throw new Error("Model temperature must be a finite number.");
  }
  if (configuration.seed !== undefined && !Number.isInteger(configuration.seed)) {
    throw new Error("Model seed must be an integer when provided.");
  }
  if (!Number.isInteger(configuration.requestTimeoutMs) || configuration.requestTimeoutMs < 1) {
    throw new Error("Model request timeout must be a positive integer.");
  }
  if (!Number.isInteger(configuration.technicalRetryCount) || configuration.technicalRetryCount < 0) {
    throw new Error("Technical retry count must be a non-negative integer.");
  }
  const chunking = configuration.chunkingPolicy;
  if (
    !chunking ||
    chunking.strategy !== "full_transcript_preferred" ||
    !Number.isInteger(chunking.maxInputCharacters) ||
    chunking.maxInputCharacters < 1 ||
    !Number.isInteger(chunking.overlapTurns) ||
    chunking.overlapTurns < 0
  ) {
    throw new Error(
      "Benchmark v1 requires a locked full-transcript-preferred turn chunking policy."
    );
  }
  if (configuration.jsonRepairEnabled && !configuration.jsonRepairPrompt) {
    throw new Error("JSON repair requires a locked repair prompt reference.");
  }
  const configuredMuPrompts = configuration.promptTemplates?.meaningUnits;
  for (const [kind, expected] of Object.entries({
    generation: meaningUnitPromptReferences.generation,
    selfReview: meaningUnitPromptReferences.selfReview,
    finalRevision: meaningUnitPromptReferences.finalRevision
  })) {
    const actual = configuredMuPrompts?.[kind as keyof typeof configuredMuPrompts];
    if (actual?.version !== expected.version || actual.hash !== expected.hash) {
      throw new Error(`Locked Meaning Unit ${kind} prompt reference is invalid.`);
    }
  }
  if (
    configuration.jsonRepairEnabled &&
    (configuration.jsonRepairPrompt?.version !== meaningUnitPromptReferences.jsonRepair.version ||
      configuration.jsonRepairPrompt.hash !== meaningUnitPromptReferences.jsonRepair.hash)
  ) {
    throw new Error("Locked JSON repair prompt reference is invalid.");
  }
  if (configuration.schemaVersions?.meaningUnits !== MU_SCHEMA_VERSION) {
    throw new Error("Locked Meaning Unit schema version is invalid.");
  }

  return structuredClone(input);
}

export function isBenchmarkStageKind(value: string): value is BenchmarkStageKind {
  return (benchmarkStageKinds as readonly string[]).includes(value);
}
