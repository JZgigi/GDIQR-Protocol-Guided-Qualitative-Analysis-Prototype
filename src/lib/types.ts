export type WorkflowStep =
  | "pre-analysis"
  | "understanding"
  | "categorizing"
  | "integrating"
  | "integrity"
  | "export";

export type HumanStatus =
  "Draft" | "Accepted" | "Edited" | "Needs review" | "Excluded";
export type ReviewerStatus = "Not run" | "Pass" | "Warning" | "Major issue";
export type CategoryMode = "A" | "B" | "C";
export type ReviewerWorkspace = "meaning-units" | "categories";
export type ReviewerIssueStatus = "unresolved" | "resolved" | "dismissed";
export type ReviewerIssueSeverity = "info" | "warning" | "major";
export type SegmentStatus =
  | "Draft"
  | "Needs Review"
  | "Ready for MU Analysis"
  | "Analysed"
  | "Needs Revision"
  | "Completed";

export type SegmentSpeakerRole =
  | "facilitator"
  | "interviewer"
  | "participant"
  | "unclear";

export type MeaningUnitClassification =
  | "substantive_participant"
  | "context_only"
  | "non_analytic"
  | "uncertain";

export type MeaningUnitGenerationMethod =
  | "ai_semantic"
  | "rule_based_fallback"
  | "researcher";

export interface MeaningUnitGenerationCounts {
  participantTurns: number;
  substantiveMeaningUnits: number;
  contextOnlySegments: number;
  nonAnalyticSegments: number;
  uncertainSegments: number;
  openingBackgroundCandidates: number;
}

export type DatasetType = "open" | "anonymised" | "identifiable_sensitive";
export type ProjectDataSource =
  "SMARTEN" | "photovoice" | "interview" | "other";

export type AuditActor = "AI" | "Researcher" | "Reviewer";

export type AuditActionType =
  | "project_created"
  | "project_updated"
  | "data_suitability_confirmed"
  | "transcript_uploaded"
  | "audio_uploaded"
  | "transcript_generated"
  | "transcript_edited"
  | "transcript_confirmed"
  | "pre_analysis_updated"
  | "meaning_units_generated"
  | "meaning_units_redelineated"
  | "meaning_unit_created"
  | "meaning_unit_edited"
  | "meaning_unit_restored"
  | "meaning_unit_accepted"
  | "meaning_unit_excluded"
  | "meaning_unit_split"
  | "meaning_unit_merged"
  | "meaning_unit_deleted"
  | "category_system_generated"
  | "category_created"
  | "category_renamed"
  | "category_updated"
  | "category_deleted"
  | "meaning_unit_moved"
  | "relationship_created"
  | "relationship_updated"
  | "relationship_deleted"
  | "reviewer_issue_generated"
  | "reviewer_issue_resolved"
  | "integrity_review_updated"
  | "export_generated"
  | "workspace_cleared"
  | "guidance_memo_saved"
  | "voice_guidance_note_saved"
  | "segment_updated"
  | "segment_speaker_role_updated"
  | "other";

export type AuditTargetType =
  | "project"
  | "transcript"
  | "audio_file"
  | "transcription_job"
  | "pre_analysis"
  | "segment"
  | "meaning_unit"
  | "category"
  | "category_system"
  | "integration_relationship"
  | "integrity_review"
  | "integrity_review_item"
  | "reviewer_comment"
  | "export"
  | "workspace";

export interface Project {
  id: string;
  title: string;
  researchQuestion: string;
  studyDescription: string;
  language: "English" | "Chinese";
  // Internal legacy value retained for the existing Supabase contract; UI displays "GDI-QR-informed".
  protocol: "GDIQR";
  lightInterpretation: boolean;
  status: string;
  updatedAt: string;
  datasetType: DatasetType;
  dataSource: ProjectDataSource;
  dataSuitabilityConfirmed: boolean;
  dataSuitabilityConfirmedAt?: string;
  researcherNotes: string;
  metadata?: Record<string, unknown>;
}

export interface PreAnalysisNotes {
  id: string;
  projectId: string;
  researchQuestion: string;
  studyDescription: string;
  researcherPosition: string;
  contextualNotes: string;
  initialSensitisingConcepts: string;
  dataFamiliarisationNotes: string;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationRelationshipLabel =
  | "contributes to"
  | "contrasts with"
  | "supports"
  | "explains"
  | "is part of"
  | "leads to"
  | "contextualises"
  | "unclear relationship";

export interface IntegrationRelationship {
  id: string;
  projectId: string;
  categorySystemId?: string;
  sourceCategoryId: string;
  targetCategoryId: string;
  label: IntegrationRelationshipLabel;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export type IntegrityReviewItemStatus =
  "not_checked" | "pass" | "issue" | "resolved" | "dismissed";

export interface IntegrityReviewItem {
  id: string;
  projectId: string;
  checkKey: string;
  prompt: string;
  status: IntegrityReviewItemStatus;
  response: string;
  researcherNote: string;
  generatedFromState: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExportRecord {
  id: string;
  projectId: string;
  format: "json" | "csv" | "txt" | "docx" | "pdf";
  storageBucket?: string;
  storagePath?: string;
  generatedAt: string;
}

export interface GuidanceMemo {
  id: string;
  projectId: string;
  step: WorkflowStep;
  question: string;
  answer: string;
  createdAt: string;
}

export interface TranscriptSegment {
  createdBy?: "auto" | "manual";
  endTurnIndex?: number;
  id: string;
  caseId: string;
  segmentId: string;
  segmentNumber: number;
  sourceTranscriptId?: string;
  splittingMode?: "conservative" | "balanced" | "detailed";
  startTurnIndex?: number;
  topicLabel: string;
  speakerInfo: string;
  speakerRole?: SegmentSpeakerRole;
  startTimestamp: string;
  endTimestamp: string;
  startingMuNumber: number;
  status: SegmentStatus;
  text: string;
}

export interface AudioFileRecord {
  id: string;
  projectId: string;
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  language: Project["language"];
  uploadedAt: string;
}

export interface TranscriptionJobRecord {
  id: string;
  projectId: string;
  audioFileId: string;
  status: "queued" | "processing" | "completed" | "failed";
  provider: string;
  language: Project["language"];
  transcriptId?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface TranscriptRecord {
  id: string;
  projectId: string;
  content: string;
  versionLabel: string;
  anonymisationStatus: "not_reviewed" | "reviewed" | "confirmed";
  rawTranscriptRetained: boolean;
  sensitiveItems: unknown[];
  sensitiveItemsReviewedAt?: string | null;
  reviewedBy?: string | null;
  createdAt: string;
  interviewId?: string | null;
  status?: string;
  rawContent?: string | null;
  cleanedContent?: string | null;
  finalContent?: string | null;
  updatedAt?: string;
}

export interface MeaningUnit {
  aiExcerpt?: string;
  id: string;
  segmentId: string;
  caseId: string;
  speaker: string;
  number: number;
  excerpt: string;
  aiSummary: string;
  humanSummary: string;
  tentativeInterpretation?: string;
  uncertainty?: string;
  humanStatus: HumanStatus;
  reviewerStatus: ReviewerStatus;
  analysisExcluded: boolean;
  exclusionReason?: string;
  classification?: MeaningUnitClassification;
  contextExcerpt?: string;
  generationMethod?: MeaningUnitGenerationMethod;
  reviewerWarnings?: string[];
  sourceEndLine?: number;
  sourceStartLine?: number;
  sourceTranscriptId?: string;
  sourceTurnIds?: string[];
  speakerRole?: SegmentSpeakerRole;
}

export interface CategoryNode {
  confidence?: "low" | "medium" | "high";
  comparisonDifferenceNote?: string;
  comparisonSimilarityNote?: string;
  id: string;
  name: string;
  definition: string;
  exclusionCriteria?: string;
  groupingDecision?: "yes" | "partly" | "no";
  includedUnitIds: number[];
  inclusionCriteria?: string;
  rationale?: string;
  source?: "ai" | "fallback" | "researcher_confirmed";
  status?:
    | "ai_draft"
    | "fallback_draft"
    | "needs_review"
    | "edited"
    | "confirmed"
    | "rejected";
  memo?: string;
  intentionallyUncategorisedUnitIds?: number[];
  subcategories?: CategoryNode[];
}

export type CategoryUnitDecisionStatus =
  | "assigned"
  | "intentionally_unassigned"
  | "needs_review";

export type CategoryEvidenceRole =
  | "core"
  | "qualifying"
  | "contradictory"
  | "unique_case";

export interface CategoryUnitDecision {
  categoryId?: string;
  decision: CategoryUnitDecisionStatus;
  evidenceRole: CategoryEvidenceRole;
  reason: string;
  source: "ai" | "researcher";
  unitNumber: number;
}

export interface CategoryGroupingCoverage {
  assigned: number;
  duplicateAssignments: number[];
  inputUnits: number;
  intentionallyUnassigned: number;
  invalidReferences: number[];
  needsReview: number;
  unaccountedUnits: number[];
}

export interface ReviewerComment {
  id: string;
  agent: string;
  target: string;
  targetType:
    | "meaning_unit"
    | "summary"
    | "segment"
    | "category"
    | "subcategory"
    | "integrated_narrative"
    | "mode_output";
  targetId: string;
  issueType: string;
  workspace: ReviewerWorkspace;
  severity: ReviewerIssueSeverity;
  status: ReviewerIssueStatus;
  comment: string;
  suggestedAction: string;
  resolved: boolean;
  createdAt?: string;
  resolvedAt?: string;
  researcherMemo?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: AuditActor;
  action: string;
  target: string;
  step?: WorkflowStep;
  actionType?: AuditActionType;
  targetType?: AuditTargetType;
  targetId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  researcherNote?: string;
}

export interface EditLog {
  id: string;
  projectId: string;
  step: WorkflowStep;
  actor: AuditActor;
  actionType: AuditActionType;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
  researcherNote?: string;
  createdAt: string;
}
