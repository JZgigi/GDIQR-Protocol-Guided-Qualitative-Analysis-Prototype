export type WorkflowStep =
  | "setup"
  | "upload"
  | "transcript"
  | "segments"
  | "meaning-units"
  | "categories"
  | "reviewers"
  | "export";

export type HumanStatus = "Draft" | "Accepted" | "Edited" | "Needs review";
export type ReviewerStatus = "Not run" | "Pass" | "Warning" | "Major issue";
export type CategoryMode = "A" | "B" | "C";

export interface Project {
  id: string;
  title: string;
  researchQuestion: string;
  studyDescription: string;
  language: "English" | "Chinese";
  protocol: "GDIQR";
  lightInterpretation: boolean;
  status: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  id: string;
  caseId: string;
  segmentId: string;
  speakerInfo: string;
  startTimestamp: string;
  endTimestamp: string;
  startingMuNumber: number;
  status: "Ready" | "Processed" | "Needs review";
  text: string;
}

export interface MeaningUnit {
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
}

export interface CategoryNode {
  id: string;
  name: string;
  definition: string;
  includedUnitIds: number[];
  subcategories?: CategoryNode[];
}

export interface ReviewerComment {
  id: string;
  agent: string;
  target: string;
  severity: "Pass" | "Warning" | "Major issue";
  comment: string;
  suggestedAction: string;
  resolved: boolean;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: "AI" | "Researcher" | "Reviewer";
  action: string;
  target: string;
}
