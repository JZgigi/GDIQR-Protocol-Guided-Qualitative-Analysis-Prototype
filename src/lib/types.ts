export type WorkflowStep =
  | "pre-analysis"
  | "understanding"
  | "categorizing"
  | "integrating"
  | "integrity"
  | "export";

export type HumanStatus =
  | "Draft"
  | "Accepted"
  | "Edited"
  | "Needs review"
  | "Excluded";
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
}

export interface CategoryNode {
  confidence?: "low" | "medium" | "high";
  id: string;
  name: string;
  definition: string;
  includedUnitIds: number[];
  rationale?: string;
  source?: "ai" | "fallback" | "researcher_confirmed";
  status?:
    | "ai_draft"
    | "fallback_draft"
    | "needs_review"
    | "edited"
    | "confirmed"
    | "rejected";
  subcategories?: CategoryNode[];
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
  actor: "AI" | "Researcher" | "Reviewer";
  action: string;
  target: string;
}
