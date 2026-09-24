export const benchmarkStageKinds = [
  "mu_draft",
  "mu_review",
  "mu_final",
  "category_draft",
  "category_review",
  "category_final",
  "integration_draft",
  "integration_review",
  "integration_final",
  "final_validation"
] as const;

export type BenchmarkStageKind = (typeof benchmarkStageKinds)[number];
export const benchmarkStageSequence: Record<BenchmarkStageKind, number> = {
  mu_draft: 1,
  mu_review: 2,
  mu_final: 3,
  category_draft: 4,
  category_review: 5,
  category_final: 6,
  integration_draft: 7,
  integration_review: 8,
  integration_final: 9,
  final_validation: 10
};
export type BenchmarkRunStatus = "running" | "completed_frozen" | "failed";
export type BenchmarkStageStatus = "completed" | "failed";
export type BenchmarkAttemptType = "initial" | "technical_retry" | "json_repair";
export type BenchmarkSpeakerRole = "participant" | "facilitator" | "unknown";
export type BenchmarkFailureCategory =
  | "transport_failure"
  | "timeout"
  | "malformed_json"
  | "schema_invalid"
  | "invalid_reference"
  | "semantic_validation_failure";

export interface BenchmarkTranscriptTurn {
  turnId: string;
  speakerId: string;
  start?: number;
  end?: number;
  text: string;
}

export interface BenchmarkTranscriptInput {
  transcriptId: string;
  focusGroupId: string;
  content: string;
  turns: BenchmarkTranscriptTurn[];
}

export interface BenchmarkSpeakerRoleInput {
  transcriptId: string;
  focusGroupId: string;
  speakerId: string;
  role: BenchmarkSpeakerRole;
}

export interface MethodologicalProtocolSnapshot {
  name: string;
  version: string;
  meaningUnitRules: string[];
  meaningUnitReviewCriteria: string[];
  categoryRules: string[];
  categoryReviewCriteria: string[];
  integrationRules: string[];
  integrationReviewCriteria: string[];
  reviewPasses: {
    meaningUnits: 1;
    categories: 1;
    integration: 1;
  };
}

export interface PromptTemplateReference {
  version: string;
  hash: string;
}

export interface BenchmarkAnalyticDatasetMetadata {
  originalDataLanguage: "zh-CN";
  benchmarkInputLanguage: "en";
  analyticOutputLanguage: "en";
  translatedTranscriptVersion: string;
  translatedTranscriptHash?: string;
  participantVerified: true;
}

export interface BenchmarkChunkingPolicy {
  strategy: "full_transcript_preferred";
  maxInputCharacters: number;
  overlapTurns: number;
}

export interface ComputationalConfigurationSnapshot {
  version: string;
  provider: string;
  model: string;
  modelDigest?: string;
  temperature: number;
  seed?: number;
  requestTimeoutMs: number;
  tokenLimits: Record<string, number>;
  chunkingPolicy: BenchmarkChunkingPolicy;
  technicalRetryCount: number;
  jsonRepairEnabled: boolean;
  jsonRepairPrompt?: PromptTemplateReference;
  schemaVersions: Record<string, string>;
  promptTemplates: {
    meaningUnits: {
      generation: PromptTemplateReference;
      selfReview: PromptTemplateReference;
      finalRevision: PromptTemplateReference;
    };
    categories: {
      generation: PromptTemplateReference;
      selfReview: PromptTemplateReference;
      finalRevision: PromptTemplateReference;
    };
    integration: {
      generation: PromptTemplateReference;
      selfReview: PromptTemplateReference;
      finalRevision: PromptTemplateReference;
    };
  };
}

export interface CreateBenchmarkRunInput {
  projectId: string;
  researchQuestion: string;
  studyContext: string;
  analyticDataset: BenchmarkAnalyticDatasetMetadata;
  transcripts: BenchmarkTranscriptInput[];
  speakerRoles: BenchmarkSpeakerRoleInput[];
  methodologicalProtocol: MethodologicalProtocolSnapshot;
  computationalConfiguration: ComputationalConfigurationSnapshot;
  applicationVersion?: string;
  gitCommit?: string;
}

export interface FrozenBenchmarkInput {
  projectId: string;
  researchQuestion: string;
  studyContext: string;
  analyticDataset: BenchmarkAnalyticDatasetMetadata & {
    translatedTranscriptHash: string;
  };
  transcripts: BenchmarkTranscriptInput[];
  speakerRoles: BenchmarkSpeakerRoleInput[];
  methodologicalProtocol: MethodologicalProtocolSnapshot;
  computationalConfiguration: ComputationalConfigurationSnapshot;
  transcriptHash: string;
  methodologicalProtocolHash: string;
  computationalConfigurationHash: string;
  inputHash: string;
}

export interface SourceLocation {
  start?: number;
  end?: number;
  turnIds: string[];
}

export interface DraftMeaningUnit {
  draftMuId: string;
  transcriptId: string;
  focusGroupId: string;
  speakerId: string;
  speakerRole: BenchmarkSpeakerRole;
  sourceLocation: SourceLocation;
  sourceText: string;
  summary: string;
  uncertainty?: string;
}

export type MeaningUnitReviewIssueType =
  | "substantive_meaning_omitted"
  | "over_segmentation"
  | "under_segmentation"
  | "duplicate_or_overlap"
  | "distinct_meanings_combined"
  | "facilitator_included"
  | "unknown_speaker_included"
  | "source_or_speaker_mismatch"
  | "summary_inaccurate"
  | "summary_over_interpreted"
  | "summary_repeats_source";

export interface MeaningUnitReviewFinding {
  findingId: string;
  issueType: MeaningUnitReviewIssueType;
  affectedDraftMuIds: string[];
  sourceReferences: Array<{
    transcriptId: string;
    focusGroupId: string;
    turnIds: string[];
    speakerId: string;
    speakerRole: BenchmarkSpeakerRole;
    exactSourceText: string;
    start?: number;
    end?: number;
  }>;
  recommendedAction: "retain" | "revise" | "split" | "merge" | "remove" | "add";
  conciseMethodologicalRationale: string;
}

export type MeaningUnitReviewAction =
  | "unchanged"
  | "revised"
  | "split"
  | "merged"
  | "added";

export interface FinalMeaningUnit extends Omit<DraftMeaningUnit, "draftMuId"> {
  muId: string;
  sourceDraftMuIds: string[];
  appliedReviewFindingIds: string[];
  reviewAction: MeaningUnitReviewAction;
}

export interface RemovedDraftMeaningUnit {
  draftMuId: string;
  reviewAction: "removed";
  appliedReviewFindingIds: string[];
  conciseMethodologicalRationale: string;
}

export interface FinalMeaningUnitOutput {
  finalMeaningUnits: FinalMeaningUnit[];
  removedDraftMeaningUnits: RemovedDraftMeaningUnit[];
}

export interface DraftCategory {
  draftCategoryId: string;
  name: string;
  description: string;
  includedMuIds: string[];
  rationale: string;
}

export type CategoryReviewIssueType =
  | "poor_internal_coherence"
  | "overlap_or_redundancy"
  | "unsupported_label"
  | "overly_abstract_label"
  | "uncategorised_mu"
  | "insufficient_source_support";

export interface CategoryReviewFinding {
  findingId: string;
  issueType: CategoryReviewIssueType;
  affectedDraftCategoryIds: string[];
  affectedMuIds: string[];
  description: string;
  proposedCorrection: string;
}

export interface FinalCategory {
  categoryId: string;
  sourceDraftCategoryIds: string[];
  appliedReviewFindingIds: string[];
  name: string;
  description: string;
  includedMuIds: string[];
  rationale: string;
}

export interface IntegratedClaim {
  claimId: string;
  text: string;
  categoryIds: string[];
  muIds: string[];
}

export interface DraftIntegratedAnalysis {
  narrative: string;
  claims: IntegratedClaim[];
}

export type IntegrationReviewIssueType =
  | "category_omitted"
  | "unsupported_claim"
  | "contradiction_smoothed_over"
  | "overly_abstract_or_speculative";

export interface IntegrationReviewFinding {
  findingId: string;
  issueType: IntegrationReviewIssueType;
  affectedClaimIds: string[];
  affectedCategoryIds: string[];
  affectedMuIds: string[];
  description: string;
  proposedCorrection: string;
}

export interface FinalIntegratedAnalysis extends DraftIntegratedAnalysis {
  appliedReviewFindingIds: string[];
}

export interface BenchmarkStageOutput<T = unknown> {
  stage: BenchmarkStageKind;
  schemaVersion: string;
  output: T;
  inputReferenceHash: string;
  validationResult: Record<string, unknown>;
}

export interface BenchmarkModelAttempt {
  stageOutputId?: string;
  stage: BenchmarkStageKind;
  batchId: string;
  attemptNumber: number;
  attemptType: BenchmarkAttemptType;
  promptTemplateVersion: string;
  promptTemplateHash: string;
  requestHash: string;
  rawResponse?: string;
  parsedResponse?: unknown;
  validationStatus: "valid" | "invalid";
  failureCategory?: BenchmarkFailureCategory;
  error?: string;
  durationMs?: number;
  providerGenerationId?: string;
  providerResponseModel?: string;
}
