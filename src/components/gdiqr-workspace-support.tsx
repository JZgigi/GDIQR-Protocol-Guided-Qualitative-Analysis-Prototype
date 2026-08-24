"use client";

import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, FileText, Pencil, Play, RefreshCcw, ShieldCheck, Trash2 } from "lucide-react";
import type {
  AuditEvent, CategoryMode, CategoryNode, GuidanceMemo, IntegrationRelationship as StoredIntegrationRelationship, IntegrityReviewItem, IntegrityReviewItemStatus, IntegrationRelationshipLabel, MeaningUnit, Project, ReviewerComment, ReviewerWorkspace, SegmentSpeakerRole, SegmentStatus, TranscriptRecord, TranscriptSegment, WorkflowStep,
} from "@/lib/types";
import type { RunLog } from "@/lib/run-logs";
import type { AutoSegmentMode } from "@/lib/auto-segmenter";
import { containsNonTranscriptMaterial } from "@/lib/transcript-source-cleaner";
import { formatDateTime, formatTime } from "@/lib/date-format";
import { isOpeningBackgroundCandidate } from "@/lib/meaning-unit-review-flags";

const METHODOLOGICAL_FRAME = "GDI-QR-informed";

const steps: Array<{ id: WorkflowStep; label: string }> = [
  { id: "pre-analysis", label: "Pre-analysis" },
  { id: "understanding", label: "Understanding & Translating" },
  { id: "categorizing", label: "Categorizing" },
  { id: "integrating", label: "Integrating" },
  { id: "integrity", label: "Methodological Integrity" },
  { id: "export", label: "Export" },
];

type AnalysisExportFormat = "json" | "csv" | "txt" | "docx" | "pdf";
type SensitiveRiskLevel = "low" | "medium" | "high";
type SensitiveReviewStatus = "pending" | "confirmed" | "ignored" | "edited";
interface SensitiveReviewItem {
  id: string;
  placeholder: string;
  category: string;
  matchedText?: string;
  riskLevel: SensitiveRiskLevel;
  replacementText: string;
  startOffset?: number;
  endOffset?: number;
  status: SensitiveReviewStatus;
  explanation: string;
}
interface MeaningUnitValidationFlag {
  label: string;
  tone?: "blue" | "danger" | "warning";
}
interface ReviewerIssueContext {
  label: string;
  text: string;
}
interface IntegrationRelationshipDraft {
  evidenceUnitNumbers: number[];
  id: string;
  label: IntegrationRelationshipLabel;
  rationale: string;
  researcherNote: string;
  sourceCategoryId: string;
  targetCategoryId: string;
}
interface IntegrationMapGroup {
  categories: CategoryNode[];
  description: string;
  label: string;
}
interface GuidanceMessage {
  answer: string;
  createdAt: string;
  id: string;
  projectId?: string;
  question: string;
  saved?: boolean;
  step: WorkflowStep;
}

export function WorkflowErrorPanel({
  message,
  onClear,
  onRetry,
  retryAvailable,
}: {
  message: string;
  onClear: () => void;
  onRetry: () => void;
  retryAvailable: boolean;
}) {
  return (
    <div className="mini-card warning-card" role="alert">
      <div className="category-header">
        <div>
          <span className="label">Recoverable error</span>
          <p className="small">{message}</p>
        </div>
        <div className="button-row">
          {retryAvailable && (
            <button className="button" onClick={onRetry} type="button">
              Retry
            </button>
          )}
          <button className="button" onClick={onClear} type="button">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function GuidanceChatPanel({
  activeStep,
  isLoading,
  messages,
  onAsk,
  onQuestionChange,
  onSaveMemo,
  question,
  savedMemoCount,
}: {
  activeStep: WorkflowStep;
  isLoading: boolean;
  messages: GuidanceMessage[];
  onAsk: () => void;
  onQuestionChange: (value: string) => void;
  onSaveMemo: (message: GuidanceMessage) => void;
  question: string;
  savedMemoCount: number;
}) {
  return (
    <details className="workbook-details guidance-chat-panel">
      <summary>Methodological guidance chat</summary>
      <div className="mini-card soft">
        <span className="label">
          Current step: {getStepShortLabel(activeStep)}
        </span>
        <p className="small">
          Ask reflective process questions. The guide can suggest checks,
          prompts, and possible issues, but it does not produce final coding or
          final interpretation.
        </p>
        <textarea
          className="textarea compact-textarea"
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="Example: Is this meaning unit too interpretive? What should I check before moving to Step 3?"
          value={question}
        />
        <div className="button-row">
          <button
            className="button primary"
            disabled={isLoading || !question.trim()}
            onClick={onAsk}
            type="button"
          >
            {isLoading ? "Preparing guidance..." : "Ask guidance question"}
          </button>
          <span className="small">Saved guidance memos: {savedMemoCount}</span>
        </div>
      </div>
      {messages.length === 0 ? (
        <EmptyState text="No guidance questions yet. Ask a methodological process question when you are unsure what to check next." />
      ) : (
        <div className="summary-list">
          {messages.slice(0, 4).map((message) => (
            <article className="summary-card" key={message.id}>
              <div className="category-header">
                <div>
                  <span className="label">
                    {getStepShortLabel(message.step)} ·{" "}
                    {formatTime(message.createdAt)}
                  </span>
                  <strong>{message.question}</strong>
                </div>
                <StatusBadge
                  label={message.saved ? "Saved memo" : "Guidance draft"}
                />
              </div>
              <p className="small preserve-lines">{message.answer}</p>
              <button
                className="button"
                disabled={message.saved}
                onClick={() => onSaveMemo(message)}
                type="button"
              >
                {message.saved
                  ? "Saved as memo"
                  : "Save useful guidance as memo"}
              </button>
            </article>
          ))}
        </div>
      )}
    </details>
  );
}

export function buildMethodologicalGuidanceAnswer({
  activeStep,
  categoryCount,
  confirmedMeaningUnitCount,
  hasTranscript,
  question,
  transcriptConfirmed,
}: {
  activeStep: WorkflowStep;
  categoryCount: number;
  confirmedMeaningUnitCount: number;
  hasTranscript: boolean;
  question: string;
  transcriptConfirmed: boolean;
}) {
  const lowerQuestion = question.toLowerCase();
  const boundaryReminder =
    "Boundary: this is methodological guidance only. Treat the response as prompts for researcher judgement, not as final analysis.";
  const stepPrompt = getStepGuidance(activeStep);
  const checks: string[] = [];

  if (activeStep === "pre-analysis") {
    checks.push(
      hasTranscript
        ? "Check whether the transcript is anonymised, readable, and actually relevant to the research question."
        : "Prepare or paste an anonymised transcript before asking for analytic support.",
      transcriptConfirmed
        ? "Because the transcript is confirmed, future edits should trigger re-confirmation before analysis."
        : "Do not move into meaning-unit generation until the reviewed transcript is confirmed.",
    );
  }

  if (activeStep === "understanding") {
    checks.push(
      "Compare each meaning-unit boundary with the participant account: is it one meaning, or does it contain two separable meanings?",
      "A summary may be too interpretive if it adds motives, causes, or emotions not visible in the excerpt.",
      "Interviewer-only segments should usually stay as context and should not become analytic MUs.",
    );
  }

  if (activeStep === "categorizing") {
    checks.push(
      confirmedMeaningUnitCount > 0
        ? `You have ${confirmedMeaningUnitCount} accepted MU(s). Check whether each category is grounded in more than a label similarity.`
        : "Accept researcher-reviewed meaning units before treating any grouping as a category.",
      "A useful category name should describe the shared meaning across MUs, not just the topic domain.",
      categoryCount > 0
        ? "Check category overlap: could one MU reasonably fit multiple categories, and what does that imply?"
        : "Start with a small number of provisional evidence clusters, then name them after comparison.",
    );
  }

  if (activeStep === "integrating") {
    checks.push(
      "Ask how categories relate: sequence, contrast, support, tension, condition, or shared context.",
      "The integration narrative should explain relationships among categories rather than simply listing them.",
      "Check whether each relationship has evidence MU numbers, not only an intuitive link.",
    );
  }

  if (activeStep === "integrity" || activeStep === "export") {
    checks.push(
      "Check whether the audit trail makes researcher decisions visible enough for supervision or replication.",
      "Look for unresolved issues, weak evidence support, over-broad categories, and missing reflexive notes.",
      "Before export, confirm that draft assistant text is clearly labelled and researcher-reviewed.",
    );
  }

  if (lowerQuestion.includes("name") || lowerQuestion.includes("category")) {
    checks.push(
      "For naming: try a concise phrase that captures the shared meaning, then test it against every included MU.",
    );
  }

  if (
    lowerQuestion.includes("interpretive") ||
    lowerQuestion.includes("too much")
  ) {
    checks.push(
      "For interpretation level: separate what the participant explicitly says from your tentative inference, then document the inference as provisional.",
    );
  }

  return [
    boundaryReminder,
    "",
    `Step-specific focus: ${stepPrompt.meaning}`,
    "",
    "Suggested checks:",
    ...checks.map((check) => `- ${check}`),
    "",
    "Possible memo: Record what you checked, what you changed, and why you decided it was acceptable to continue.",
  ].join("\n");
}

export function getStepShortLabel(step: WorkflowStep) {
  return steps.find((item) => item.id === step)?.label ?? step;
}

export function TranscriptReviewHistory({
  transcriptRecords,
}: {
  transcriptRecords: TranscriptRecord[];
}) {
  if (transcriptRecords.length === 0) {
    return (
      <div className="mini-card soft">
        <span className="label">Transcript review record</span>
        <p className="small">
          No transcript has been saved yet. Upload or paste a transcript, review
          the prepared text, and confirm it before analysis.
        </p>
      </div>
    );
  }

  const latest = transcriptRecords[0];
  return (
    <div className="mini-card soft">
      <span className="label">Transcript review record</span>
      <p className="small">
        Original upload, edited review drafts, and confirmed transcript versions
        are stored separately for audit and export. Latest:{" "}
        {latest.versionLabel}
        {latest.status ? ` · ${latest.status}` : ""}.
      </p>
      <div className="timeline compact-timeline">
        {transcriptRecords.slice(0, 5).map((record) => (
          <div className="timeline-item" key={record.id}>
            <span className="mono small">
              {formatDateTime(record.createdAt)}
            </span>
            <div>
              <strong>{record.versionLabel}</strong>
              <p className="small">
                {record.status ?? "Saved"} · raw{" "}
                {record.rawContent ? "saved" : "not saved"} · edited{" "}
                {record.cleanedContent ? "saved" : "not saved"} · confirmed{" "}
                {record.finalContent ? "saved" : "not saved"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function getRecommendedActiveStep({
  categories,
  integratedNarrative,
  meaningUnits,
  project,
}: {
  categories: CategoryNode[];
  integratedNarrative: string;
  meaningUnits: MeaningUnit[];
  project: Project;
}): WorkflowStep {
  if (!project.dataSuitabilityConfirmed || !isTranscriptConfirmed(project)) {
    return "pre-analysis";
  }

  const acceptedUnits = meaningUnits.filter(isConfirmedMeaningUnit);
  if (meaningUnits.length === 0 || acceptedUnits.length === 0) {
    return "understanding";
  }

  if (categories.length === 0) {
    return "categorizing";
  }

  if (!integratedNarrative.trim()) {
    return "integrating";
  }

  return "integrity";
}

export function StatusBadge({ label }: { label: string }) {
  const lowered = label.toLowerCase();
  const className = lowered.includes("warning")
    ? "badge warning"
    : lowered.includes("major") ||
        lowered.includes("needs") ||
        lowered.includes("failed") ||
        lowered.includes("excluded")
      ? "badge danger"
      : lowered.includes("pass") ||
          lowered.includes("accepted") ||
          lowered.includes("completed")
        ? "badge"
        : "badge blue";
  return <span className={className}>{label}</span>;
}

export function getSegmentDisplayStatus(
  segment: TranscriptSegment,
  counts?: { accepted: number; excluded: number; total: number },
) {
  const total = counts?.total ?? 0;
  const accepted = counts?.accepted ?? 0;
  const excluded = counts?.excluded ?? 0;

  if (total === 0) {
    return "Ready for delineation";
  }

  if (excluded === total) {
    return "Context only";
  }

  if (accepted + excluded === total) {
    return "Reviewed";
  }

  if (accepted > 0 || excluded > 0) {
    return "Partially reviewed";
  }

  return segment.status;
}

export function formatSegmentMeaningUnitCounts({
  accepted,
  excluded,
  total,
}: {
  accepted: number;
  excluded: number;
  total: number;
}) {
  if (total === 0) {
    return "0 meaning units · Ready for delineation";
  }
  return `${total} meaning unit${total === 1 ? "" : "s"} · ${accepted} accepted · ${excluded} excluded/context`;
}

export function StepGuidance({ step }: { step: WorkflowStep }) {
  const guidance = getStepGuidance(step);
  return (
    <div className="step-guidance">
      <section className="guidance-card meaning">
        <span className="guide-icon">?</span>
        <div>
          <span className="label">What this step means</span>
          <p>{guidance.meaning}</p>
        </div>
      </section>
      <section className="guidance-card assistant-help">
        <span className="guide-icon assistant">+</span>
        <div>
          <span className="label">How the assistant can help</span>
          <p>{guidance.ai}</p>
        </div>
      </section>
      <section className="judgment-callout">
        <strong>Your analytic judgement matters here:</strong>
        <span>{guidance.judgment}</span>
      </section>
    </div>
  );
}

export function GdiqrTips({ step }: { step: WorkflowStep }) {
  const tips = getGdiqrTips(step);
  return (
    <section className="gdiqr-tips">
      <span className="guide-icon tips">□</span>
      <div>
        <h3>Tips from GDI-QR</h3>
        <ul>
          {tips.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function GuidanceCard({
  emphasis = false,
  text,
  title,
}: {
  emphasis?: boolean;
  text: string;
  title: string;
}) {
  return (
    <div className={`guidance-card ${emphasis ? "judgment" : ""}`}>
      <span className="label">{title}</span>
      <p className="small">{text}</p>
    </div>
  );
}

export function MethodologicalIntegrityGuide({
  activeStep,
  categoryCount,
  issueCount,
  meaningUnitCount,
  transcriptConfirmed,
}: {
  activeStep: WorkflowStep;
  categoryCount: number;
  issueCount: number;
  meaningUnitCount: number;
  transcriptConfirmed: boolean;
}) {
  return (
    <aside className="method-guide">
      <span className="label">Methodological Integrity</span>
      <h3>Guidance while you work</h3>
      <p className="small">
        I can flag possible issues, and you decide how to respond.
      </p>
      <div className="integrity-mini-list">
        <StatusLine
          label="Transcript prepared"
          status={transcriptConfirmed ? "Passed" : "Needs review"}
        />
        <StatusLine
          label="Meaning units reviewed"
          status={meaningUnitCount > 0 ? "Needs review" : "Not addressed"}
        />
        <StatusLine
          label="Categories reviewed"
          status={categoryCount > 0 ? "Needs review" : "Not addressed"}
        />
        <StatusLine
          label="Active integrity issues"
          status={issueCount > 0 ? "Needs review" : "Not addressed"}
        />
      </div>
      <p className="small">
        Current focus: {steps.find((step) => step.id === activeStep)?.label}.
      </p>
    </aside>
  );
}

export function buildIntegrityReviewItemsFromState({
  auditEvents,
  categories,
  categoryReviewIssues,
  confirmedMeaningUnits,
  excludedMeaningUnits,
  integrationRelationships,
  integrationReviewed,
  meaningUnitReviewIssues,
  meaningUnits,
  narrative,
  project,
  transcriptConfirmed,
  unassignedMeaningUnits,
}: {
  auditEvents: AuditEvent[];
  categories: CategoryNode[];
  categoryReviewIssues: ReviewerComment[];
  confirmedMeaningUnits: MeaningUnit[];
  excludedMeaningUnits: MeaningUnit[];
  integrationRelationships: IntegrationRelationshipDraft[];
  integrationReviewed: boolean;
  meaningUnitReviewIssues: ReviewerComment[];
  meaningUnits: MeaningUnit[];
  narrative: string;
  project: Project;
  transcriptConfirmed: boolean;
  unassignedMeaningUnits: MeaningUnit[];
}): IntegrityReviewItem[] {
  const now = new Date().toISOString();
  const effectiveCategories = categories.filter(
    (category) => category.status !== "rejected",
  );
  const unreviewedMeaningUnits = meaningUnits.filter(
    (unit) => !unit.analysisExcluded && unit.humanStatus !== "Accepted",
  );
  const unjustifiedExcludedUnits = excludedMeaningUnits.filter(
    (unit) => !unit.exclusionReason?.trim(),
  );
  const unsupportedCategories = effectiveCategories.filter(
    (category) => category.includedUnitIds.length === 0,
  );
  const broadCategories = effectiveCategories.filter((category) =>
    categoryTitleNeedsIntegrityReview(category),
  );
  const unresolvedReviewerIssues = [
    ...meaningUnitReviewIssues,
    ...categoryReviewIssues,
  ].filter((issue) => issue.status === "unresolved");
  const interpretiveSummaryUnits = confirmedMeaningUnits.filter((unit) =>
    summaryPossiblyGoesBeyondExcerpt(
      unit.humanSummary || unit.aiSummary || "",
      unit.excerpt,
    ),
  );

  const buildItem = ({
    checkKey,
    prompt,
    response,
    status,
  }: {
    checkKey: string;
    prompt: string;
    response: string;
    status: IntegrityReviewItemStatus;
  }): IntegrityReviewItem => ({
    id: `integrity_${project.id}_${checkKey}`,
    projectId: project.id,
    checkKey,
    prompt,
    status,
    response,
    researcherNote: "",
    generatedFromState: true,
    createdAt: now,
    updatedAt: now,
  });

  return [
    buildItem({
      checkKey: "transcript_confirmed",
      prompt: "Has the transcript been reviewed and confirmed?",
      response: transcriptConfirmed
        ? "Transcript is marked as reviewed and confirmed for analysis."
        : "Transcript has not yet been confirmed for analysis.",
      status: transcriptConfirmed ? "pass" : "issue",
    }),
    buildItem({
      checkKey: "meaning_units_reviewed",
      prompt: "Have all AI-generated meaning units been reviewed?",
      response:
        meaningUnits.length === 0
          ? "No meaning units are available yet."
          : unreviewedMeaningUnits.length === 0
            ? "All non-excluded meaning units are accepted or excluded."
            : `${unreviewedMeaningUnits.length} non-excluded meaning unit(s) still need review.`,
      status:
        meaningUnits.length === 0
          ? "not_checked"
          : unreviewedMeaningUnits.length === 0
            ? "pass"
            : "issue",
    }),
    buildItem({
      checkKey: "uncategorised_accepted_meaning_units",
      prompt: "Are any accepted meaning units uncategorised?",
      response:
        confirmedMeaningUnits.length === 0
          ? "No accepted meaning units are available for categorising yet."
          : unassignedMeaningUnits.length === 0
            ? "All accepted meaning units are assigned to at least one non-rejected category."
            : `${unassignedMeaningUnits.length} accepted meaning unit(s) are uncategorised.`,
      status:
        confirmedMeaningUnits.length === 0
          ? "not_checked"
          : unassignedMeaningUnits.length === 0
            ? "pass"
            : "issue",
    }),
    buildItem({
      checkKey: "unsupported_categories",
      prompt: "Are any categories unsupported by meaning units?",
      response:
        effectiveCategories.length === 0
          ? "No active categories are available yet."
          : unsupportedCategories.length === 0
            ? "All active categories contain at least one accepted meaning-unit reference."
            : `${unsupportedCategories.length} active category/categories have no included meaning units.`,
      status:
        effectiveCategories.length === 0
          ? "not_checked"
          : unsupportedCategories.length === 0
            ? "pass"
            : "issue",
    }),
    buildItem({
      checkKey: "excluded_items_justified",
      prompt: "Are excluded items justified?",
      response:
        unjustifiedExcludedUnits.length === 0
          ? "Excluded meaning units have researcher reasons or no exclusions are present."
          : `${unjustifiedExcludedUnits.length} excluded meaning unit(s) do not have a reason.`,
      status: unjustifiedExcludedUnits.length === 0 ? "pass" : "issue",
    }),
    buildItem({
      checkKey: "category_names_specificity",
      prompt: "Are category names too broad or too interpretive?",
      response:
        effectiveCategories.length === 0
          ? "No active categories are available yet."
          : broadCategories.length === 0
            ? "No broad/generic category names were automatically flagged."
            : `${broadCategories.length} category name(s) may be broad, generic, or too close to a placeholder label.`,
      status:
        effectiveCategories.length === 0
          ? "not_checked"
          : broadCategories.length === 0
            ? "pass"
            : "issue",
    }),
    buildItem({
      checkKey: "potential_overinterpretation",
      prompt: "Are there potential over-interpretations?",
      response:
        unresolvedReviewerIssues.length === 0 &&
        interpretiveSummaryUnits.length === 0
          ? "No unresolved reviewer issue or summary over-interpretation flag is currently active."
          : `${unresolvedReviewerIssues.length} unresolved reviewer issue(s) and ${interpretiveSummaryUnits.length} accepted summary/summaries may need an interpretation check.`,
      status:
        unresolvedReviewerIssues.length === 0 &&
        interpretiveSummaryUnits.length === 0
          ? "pass"
          : "issue",
    }),
    buildItem({
      checkKey: "interpretation_participant_wording",
      prompt:
        "Is researcher interpretation clearly separated from participant wording?",
      response:
        interpretiveSummaryUnits.length === 0
          ? "Accepted summaries do not currently trigger the over-interpretation wording check."
          : `${interpretiveSummaryUnits.length} accepted meaning-unit summary/summaries may need closer grounding in the excerpt.`,
      status: interpretiveSummaryUnits.length === 0 ? "pass" : "issue",
    }),
    buildItem({
      checkKey: "integration_reviewed",
      prompt:
        "Has the integration narrative been reviewed against category evidence?",
      response:
        effectiveCategories.length === 0
          ? "No active categories are available for integration yet."
          : integrationReviewed && narrative.trim()
            ? `Integration narrative is marked as researcher-reviewed with ${integrationRelationships.length} relationship(s).`
            : "Integration narrative or category relationship structure still needs researcher review.",
      status:
        effectiveCategories.length === 0
          ? "not_checked"
          : integrationReviewed && narrative.trim()
            ? "pass"
            : "issue",
    }),
    buildItem({
      checkKey: "clear_audit_trail",
      prompt: "Is there a clear audit trail?",
      response:
        auditEvents.length > 0
          ? `${auditEvents.length} audit event(s) are available for export.`
          : "No audit events are currently visible.",
      status: auditEvents.length > 0 ? "pass" : "issue",
    }),
  ];
}

export function mergeIntegrityReviewItems(
  generatedItems: IntegrityReviewItem[],
  storedItems: IntegrityReviewItem[],
) {
  const storedByCheckKey = new Map(
    storedItems.map((item) => [item.checkKey, item]),
  );
  const merged = generatedItems.map((generated) => {
    const stored = storedByCheckKey.get(generated.checkKey);
    if (!stored) {
      return generated;
    }
    return {
      ...generated,
      id: stored.id || generated.id,
      response: stored.response || generated.response,
      researcherNote: stored.researcherNote,
      status:
        stored.status === "resolved" || stored.status === "dismissed"
          ? stored.status
          : generated.status,
      createdAt: stored.createdAt || generated.createdAt,
      updatedAt: stored.updatedAt || generated.updatedAt,
    } satisfies IntegrityReviewItem;
  });

  const generatedKeys = new Set(generatedItems.map((item) => item.checkKey));
  const customStoredItems = storedItems.filter(
    (item) => !generatedKeys.has(item.checkKey),
  );
  return [...merged, ...customStoredItems];
}

export function formatIntegrityStatus(status: IntegrityReviewItemStatus) {
  const labels: Record<IntegrityReviewItemStatus, string> = {
    dismissed: "Dismissed / justified",
    issue: "Issue",
    not_checked: "Not checked",
    pass: "Passed",
    resolved: "Resolved",
  };
  return labels[status] ?? status;
}

export function categoryTitleNeedsIntegrityReview(category: CategoryNode) {
  const title = category.name.trim().toLowerCase();
  if (!title) {
    return true;
  }
  return (
    title === "theme" ||
    title === "category" ||
    title === "misc" ||
    title === "other" ||
    title.includes("untitled") ||
    title.includes("provisional") ||
    title.includes("draft") ||
    title.length < 4 ||
    title.length > 90
  );
}

export function MethodologicalIntegrityChecklist({
  isSaving,
  items,
  lastSavedAt,
  onRefresh,
  onSave,
  onUpdate,
}: {
  isSaving: boolean;
  items: IntegrityReviewItem[];
  lastSavedAt: string;
  onRefresh: () => void;
  onSave: () => void;
  onUpdate: (
    itemId: string,
    updates: Partial<
      Pick<IntegrityReviewItem, "researcherNote" | "response" | "status">
    >,
  ) => void;
}) {
  const issueCount = items.filter((item) => item.status === "issue").length;
  const resolvedCount = items.filter(
    (item) => item.status === "resolved",
  ).length;
  const uncheckedCount = items.filter(
    (item) => item.status === "not_checked",
  ).length;

  return (
    <div className="mini-card">
      <div className="category-header">
        <div>
          <span className="label">Step 5 checklist</span>
          <h3>Methodological integrity review</h3>
          <p className="small checklist-explanation">
            This checklist is generated from the current project state and then
            reviewed by the researcher. Use the response and note fields to
            document how each issue was checked, resolved, or justified.
          </p>
        </div>
        <div className="button-row">
          <StatusBadge
            label={`${issueCount} issue${issueCount === 1 ? "" : "s"} · ${resolvedCount} resolved · ${uncheckedCount} unchecked`}
          />
        </div>
      </div>
      <div className="button-row">
        <button className="button" onClick={onRefresh} type="button">
          Refresh from project state
        </button>
        <button
          className="button primary"
          disabled={isSaving}
          onClick={onSave}
          type="button"
        >
          {isSaving
            ? "Saving review..."
            : "Save methodological integrity review"}
        </button>
        {lastSavedAt && (
          <span className="small">Last saved: {formatTime(lastSavedAt)}</span>
        )}
      </div>
      <div className="integrity-checklist">
        {items.map((item) => (
          <article className="mini-card soft" key={item.id}>
            <div className="category-header">
              <div>
                <strong>{item.prompt}</strong>
                <p className="small">
                  {item.response || "No response recorded yet."}
                </p>
              </div>
              <StatusBadge label={formatIntegrityStatus(item.status)} />
            </div>
            <div className="grid two">
              <label className="label">
                Status
                <select
                  className="select"
                  onChange={(event) =>
                    onUpdate(item.id, {
                      status: event.target.value as IntegrityReviewItemStatus,
                    })
                  }
                  value={item.status}
                >
                  <option value="not_checked">Not checked</option>
                  <option value="pass">Pass</option>
                  <option value="issue">Issue</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed / justified</option>
                </select>
              </label>
              <label className="label">
                Researcher response
                <textarea
                  className="textarea compact-textarea"
                  onChange={(event) =>
                    onUpdate(item.id, { response: event.target.value })
                  }
                  placeholder="Record what you checked and what conclusion you reached."
                  value={item.response}
                />
              </label>
            </div>
            <label className="label">
              Researcher note / resolution
              <textarea
                className="textarea compact-textarea"
                onChange={(event) =>
                  onUpdate(item.id, { researcherNote: event.target.value })
                }
                placeholder="Add a note explaining any revision, resolution, or reason for dismissing this issue."
                value={item.researcherNote}
              />
            </label>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AuditTrailPanel({
  auditEvents,
}: {
  auditEvents: AuditEvent[];
}) {
  return (
    <div className="mini-card soft">
      <div className="category-header">
        <div>
          <span className="label">Audit trail</span>
          <h3>Visible research decision trail</h3>
          <p className="small">
            Audit events show AI-generated suggestions separately from
            researcher decisions. The full trail is included in JSON and text
            exports.
          </p>
        </div>
        <StatusBadge
          label={`${auditEvents.length} event${auditEvents.length === 1 ? "" : "s"}`}
        />
      </div>
      {auditEvents.length === 0 ? (
        <EmptyState text="No audit events yet." />
      ) : (
        <div className="timeline">
          {auditEvents
            .slice()
            .reverse()
            .slice(0, 20)
            .map((event) => (
              <div className="timeline-item" key={event.id}>
                <span className="mono small">{event.timestamp}</span>
                <div>
                  <strong>
                    {event.actor}: {event.action}
                  </strong>
                  <p className="small">
                    {event.step ?? "unknown step"} ·{" "}
                    {event.actionType ?? "other"} · {event.target}
                  </p>
                  {event.researcherNote && (
                    <p className="small">
                      Researcher note: {event.researcherNote}
                    </p>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export function StatusLine({
  label,
  status,
}: {
  label: string;
  status: "Passed" | "Needs review" | "Not addressed";
}) {
  return (
    <div className="status-line">
      <span>{label}</span>
      <StatusBadge label={status} />
    </div>
  );
}

const segmentStatuses: SegmentStatus[] = [
  "Draft",
  "Needs Review",
  "Ready for MU Analysis",
  "Analysed",
  "Needs Revision",
  "Completed",
];

export function ContextPreview({
  current,
  next,
  previous,
}: {
  current: TranscriptSegment;
  next: TranscriptSegment | null;
  previous: TranscriptSegment | null;
}) {
  return (
    <div className="context-stack">
      <ContextItem label="Previous" segment={previous} />
      <ContextItem current label="Current" segment={current} />
      <ContextItem label="Next" segment={next} />
    </div>
  );
}

export function ContextItem({
  current = false,
  label,
  segment,
}: {
  current?: boolean;
  label: string;
  segment: TranscriptSegment | null;
}) {
  return (
    <div className={`context-item ${current ? "current" : ""}`}>
      <span className="label">{label}</span>
      {segment ? (
        <>
          <strong>{segment.segmentId}</strong>
          <p className="small">
            {segment.text.slice(0, current ? 240 : 160)}
            {segment.text.length > (current ? 240 : 160) ? "..." : ""}
          </p>
        </>
      ) : (
        <p className="small">No segment.</p>
      )}
    </div>
  );
}

export function isTranscriptConfirmed(project: Project) {
  return (
    project.status === "Transcript confirmed for analysis" ||
    project.status === "Transcript confirmed for local analysis"
  );
}

export function normaliseResearcherFacingText(value: string) {
  return value
    .replace(
      /Local-only mode:\s*transcript data is processed and stored within the local environment\.?/gi,
      "",
    )
    .trim();
}

export function buildLocalTranscriptSegment({
  caseId,
  createdBy = "manual",
  segmentNumber,
  speakerRole = "unclear",
  splittingMode,
  text,
  topicLabel,
}: {
  caseId: string;
  createdBy?: "auto" | "manual";
  segmentNumber: number;
  speakerRole?: SegmentSpeakerRole;
  splittingMode?: AutoSegmentMode;
  text: string;
  topicLabel?: string;
}): TranscriptSegment {
  return {
    caseId,
    createdBy,
    endTimestamp: "00:00",
    id: `local-seg-${String(segmentNumber).padStart(3, "0")}-${Date.now()}`,
    segmentId: `SEG-${String(segmentNumber).padStart(3, "0")}`,
    segmentNumber,
    speakerInfo: topicLabel ?? "Local draft segment",
    speakerRole,
    sourceTranscriptId: "active-transcript",
    splittingMode,
    startingMuNumber: (segmentNumber - 1) * 100 + 1,
    startTimestamp: "00:00",
    status: "Needs Review",
    text,
    topicLabel: topicLabel ?? `Segment ${segmentNumber}`,
  };
}

export function renumberLocalSegments(segments: TranscriptSegment[]) {
  return segments.map((segment, index) => ({
    ...segment,
    segmentId: `SEG-${String(index + 1).padStart(3, "0")}`,
    segmentNumber: index + 1,
    startingMuNumber: index * 100 + 1,
  }));
}

export function canRunMeaningUnitsForSegment(segment: TranscriptSegment) {
  return (
    segment.text.trim().length > 0 &&
    (segment.status === "Ready for MU Analysis" ||
      segment.status === "Analysed" ||
      segment.status === "Completed")
  );
}

export function isConfirmedMeaningUnit(unit: MeaningUnit) {
  return (
    !unit.analysisExcluded &&
    (unit.classification ?? "substantive_participant") ===
      "substantive_participant" &&
    ((unit.speakerRole ?? "participant") === "participant" ||
      unit.generationMethod === "researcher") &&
    unit.humanStatus === "Accepted" &&
    (!containsNonTranscriptMaterial(unit.excerpt) ||
      Boolean(unit.exclusionReason?.trim()))
  );
}

export function normalizeMeaningUnitNumbersForSegments(
  units: MeaningUnit[],
  segments: TranscriptSegment[],
) {
  const segmentOrder = new Map(
    segments.map((segment, index) => [segment.segmentId, index]),
  );

  const ordered = [...units]
    .sort((left, right) => {
      const leftSegment =
        segmentOrder.get(left.segmentId) ?? Number.MAX_SAFE_INTEGER;
      const rightSegment =
        segmentOrder.get(right.segmentId) ?? Number.MAX_SAFE_INTEGER;
      if (leftSegment !== rightSegment) {
        return leftSegment - rightSegment;
      }
      return (
        (left.sourceStartLine ?? Number.MAX_SAFE_INTEGER) -
          (right.sourceStartLine ?? Number.MAX_SAFE_INTEGER) ||
        left.number - right.number
      );
    });
  const reviewableMeaningUnits = ordered.filter(
    (unit) =>
      unit.speakerRole === "participant" ||
      unit.generationMethod === "researcher",
  );
  const contextRecords = ordered.filter(
    (unit) =>
      unit.speakerRole !== "participant" &&
      unit.generationMethod !== "researcher",
  );

  return [...reviewableMeaningUnits, ...contextRecords].map((unit, index) => ({
      ...unit,
      number: index + 1,
    }));
}

export function getMeaningUnitValidationFlags(
  unit: MeaningUnit,
): MeaningUnitValidationFlag[] {
  const flags: MeaningUnitValidationFlag[] = [];
  const reviewedSummary = (unit.humanSummary || "").trim();
  const excerpt = unit.excerpt.trim();
  const wordCount = approximateWordCount(excerpt);
  const speaker = unit.speaker.toLowerCase();

  if (
    unit.generationMethod === "rule_based_fallback" ||
    unit.uncertainty?.toLowerCase().includes("rule-based draft")
  ) {
    flags.push({
      label: "Provisional structural span — semantic review required",
      tone: "warning",
    });
  }
  if (
    unit.uncertainty?.toLowerCase().includes("summary needs researcher review")
  ) {
    flags.push({ label: "Summary needs researcher review", tone: "warning" });
  }
  if (unit.speakerRole === "participant" && !reviewedSummary) {
    flags.push({ label: "Researcher summary needed", tone: "warning" });
  }
  if (excerpt && meaningUnitEndsMidSentence(excerpt)) {
    flags.push({ label: "Meaning unit ends mid-sentence", tone: "danger" });
  }
  if (unit.uncertainty?.toLowerCase().includes("may be incomplete")) {
    flags.push({ label: "Meaning unit may be incomplete", tone: "danger" });
  }
  if (reviewedSummary && summaryIsTooCloseToExcerpt(reviewedSummary, excerpt)) {
    flags.push({
      label: "Summary may be too close to excerpt",
      tone: "warning",
    });
  }
  if (reviewedSummary && summaryIsTooGeneric(reviewedSummary)) {
    flags.push({ label: "Summary too generic", tone: "warning" });
  }
  if (excerpt && wordCount < 3) {
    flags.push({ label: "Excerpt may be too short", tone: "warning" });
  }
  if (wordCount > 80) {
    flags.push({ label: "Excerpt may be too long", tone: "warning" });
  }
  if (
    speaker.includes("interviewer") ||
    /^interviewer\s*:/i.test(excerpt) ||
    /\?\s*$/.test(excerpt)
  ) {
    flags.push({ label: "Interviewer/context candidate", tone: "blue" });
  }
  if (unit.analysisExcluded && !unit.exclusionReason?.trim()) {
    flags.push({ label: "Excluded without reason", tone: "danger" });
  }
  if (!unit.caseId || !unit.segmentId) {
    flags.push({ label: "Source reference missing", tone: "danger" });
  }
  if (containsNonTranscriptMaterial(excerpt)) {
    flags.push({
      label: "Possible non-transcript material included",
      tone: "danger",
    });
  }

  return flags;
}

export function buildMeaningUnitIntegrityIssues(units: MeaningUnit[]) {
  const now = new Date().toISOString();
  const issues: ReviewerComment[] = [];
  const addIssue = (
    unit: MeaningUnit,
    issueType: string,
    severity: ReviewerComment["severity"],
    comment: string,
    suggestedAction: string,
    targetType: ReviewerComment["targetType"] = "meaning_unit",
  ) => {
    issues.push({
      agent: "Meaning Unit Integrity Support",
      comment,
      createdAt: now,
      id: `mu_integrity_${unit.id}_${issueType
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")}`,
      issueType,
      resolved: false,
      severity,
      status: "unresolved",
      suggestedAction,
      target: `MU ${unit.number}`,
      targetId: `MU${unit.number}`,
      targetType,
      workspace: "meaning-units",
    });
  };

  units.forEach((unit) => {
    const excerpt = unit.excerpt.trim();
    const summary = unit.humanSummary.trim();
    const aiSummary = unit.aiSummary.trim();
    const wordCount = approximateWordCount(excerpt);
    const speaker = unit.speaker.toLowerCase();

    if (unit.speakerRole === "participant" && !summary) {
      addIssue(
        unit,
        "Researcher summary needed",
        "warning",
        "This MU does not yet have a researcher-reviewed summary.",
        "What concise participant-close wording best captures this MU?",
        "summary",
      );
    }
    if (excerpt && meaningUnitEndsMidSentence(excerpt)) {
      addIssue(
        unit,
        "Meaning unit ends mid-sentence",
        "major",
        "This MU appears to end with an incomplete phrase rather than a complete participant meaning.",
        "Should the boundary be extended to include the next sentence, or should this MU be redrafted?",
      );
    } else if (unit.uncertainty?.toLowerCase().includes("may be incomplete")) {
      addIssue(
        unit,
        "Meaning unit may be incomplete",
        "warning",
        "This MU was generated by fallback logic and may need a boundary check.",
        "Does this MU stand alone as a clear meaning, or does it need surrounding participant text?",
      );
    }
    if (wordCount > 0 && wordCount < 3) {
      addIssue(
        unit,
        "Excerpt may be too short",
        "info",
        "This MU excerpt is very short and may not communicate a clear meaning on its own.",
        "Would including surrounding participant text better represent the intended meaning?",
      );
    }
    if (wordCount > 140) {
      addIssue(
        unit,
        "MU may contain several meanings",
        "major",
        "This MU is long enough that it may contain several shifts in meaning.",
        "Can this MU be split into smaller meaning-based units?",
      );
    } else if (wordCount > 80) {
      addIssue(
        unit,
        "Excerpt may be long",
        "info",
        "This MU excerpt is relatively long and may benefit from a boundary check.",
        "Does this still communicate one coherent meaning, or are there multiple meanings here?",
      );
    }
    if (
      !unit.analysisExcluded &&
      (speaker.includes("interviewer") ||
        /^interviewer\s*:/i.test(excerpt) ||
        /\?\s*$/.test(excerpt))
    ) {
      const acceptedInterviewerPrompt = unit.humanStatus === "Accepted";
      addIssue(
        unit,
        acceptedInterviewerPrompt
          ? "Interviewer prompt accepted as participant MU"
          : "Possible interviewer/context material",
        acceptedInterviewerPrompt ? "major" : "info",
        acceptedInterviewerPrompt
          ? "This MU appears to contain an interviewer or researcher prompt, but it has been accepted as a participant meaning unit."
          : "This MU may contain interviewer prompt or contextual material and should be reviewed before analysis.",
        "Should this be treated as context rather than a participant meaning unit?",
      );
    }
    if (unit.analysisExcluded && !unit.exclusionReason?.trim()) {
      addIssue(
        unit,
        "Excluded without reason",
        "warning",
        "This MU is excluded but does not include a researcher reason.",
        "What methodological reason explains the exclusion?",
      );
    }
    if (!unit.caseId || !unit.segmentId) {
      addIssue(
        unit,
        "Source reference missing",
        unit.humanStatus === "Accepted" ? "major" : "info",
        "This MU is missing a source reference, making auditability weaker.",
        "Can you link this MU back to the transcript source reference?",
      );
    }
    if (containsNonTranscriptMaterial(excerpt)) {
      addIssue(
        unit,
        "Possible non-transcript material included",
        "major",
        "This MU excerpt appears to contain project setup, research question, domain labels, demo metadata, file labels, or another non-transcript source.",
        "Should this be removed from analysis or explicitly justified as part of the participant account?",
      );
    }
    if (
      unit.humanStatus === "Accepted" &&
      (!summary ||
        summary === aiSummary ||
        summary.toLowerCase() === "same as aisummary")
    ) {
      addIssue(
        unit,
        "Accepted without clear researcher-reviewed summary",
        "warning",
        "This MU is accepted but the summary appears unchanged or missing.",
        "Have you reviewed the summary wording and confirmed it represents the participant account?",
        "summary",
      );
    }
    if (summary && summaryIsTooCloseToExcerpt(summary, excerpt)) {
      addIssue(
        unit,
        "Summary may be too close to excerpt",
        "warning",
        "The researcher summary appears to repeat the MU excerpt rather than condensing the participant's main meaning.",
        "Could this be condensed into a brief statement of the participant's main meaning?",
        "summary",
      );
    }
    if (summary && summaryIsTooGeneric(summary)) {
      addIssue(
        unit,
        "Summary too generic",
        "warning",
        "The summary appears too generic to capture the specific meaning in this MU.",
        "Can the summary name the participant's main meaning more specifically while staying close to their account?",
        "summary",
      );
    }
    if (summary && summaryPossiblyGoesBeyondExcerpt(summary, excerpt)) {
      addIssue(
        unit,
        "Summary may go beyond participant account",
        "major",
        "The summary may introduce wording that is not clearly grounded in the MU excerpt.",
        "Can the summary be revised closer to the participant's words?",
        "summary",
      );
    }
  });

  const seen = new Map<string, MeaningUnit>();
  units.forEach((unit) => {
    const key = normalizeForOverlapCheck(unit.excerpt);
    if (!key || key.length < 30) {
      return;
    }
    const previous = seen.get(key);
    if (previous) {
      addIssue(
        unit,
        "Duplicate or overlapping MU",
        "warning",
        `This MU appears to overlap strongly with MU ${previous.number}.`,
        "Should these MUs be merged, revised, or kept separate for a methodological reason?",
      );
    } else {
      seen.set(key, unit);
    }
  });

  return issues;
}

export function normalizeForOverlapCheck(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export function buildMeaningUnitIssueContextById(
  issues: ReviewerComment[],
  units: MeaningUnit[],
) {
  const unitsByTargetId = new Map(
    units.map((unit) => [`MU${unit.number}`, unit]),
  );

  return issues.reduce<Record<string, ReviewerIssueContext>>(
    (contexts, issue) => {
      const unit = unitsByTargetId.get(issue.targetId);
      if (!unit) {
        return contexts;
      }
      const isSummaryIssue = issue.targetType === "summary";
      const text = isSummaryIssue
        ? unit.humanSummary || unit.aiSummary || "No summary available yet."
        : unit.excerpt || unit.aiExcerpt || "No excerpt available yet.";
      contexts[issue.id] = {
        label: isSummaryIssue ? "Current summary" : "Current excerpt",
        text: truncateForReviewSnippet(text),
      };
      return contexts;
    },
    {},
  );
}

export function truncateForReviewSnippet(text: string, maxLength = 220) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

export function summaryPossiblyGoesBeyondExcerpt(
  summary: string,
  excerpt: string,
) {
  const lowerSummary = summary.toLowerCase();
  const lowerExcerpt = excerpt.toLowerCase();
  const interpretiveTerms = [
    "causes",
    "clinical",
    "diagnosis",
    "improves",
    "psychological",
    "therapeutic",
    "trauma",
    "treatment",
  ];
  return interpretiveTerms.some(
    (term) => lowerSummary.includes(term) && !lowerExcerpt.includes(term),
  );
}

export function summaryIsTooCloseToExcerpt(summary: string, excerpt: string) {
  const normalizedSummary = normalizeForSummarySimilarity(summary);
  const normalizedExcerpt = normalizeForSummarySimilarity(excerpt);
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
      excerptChars.has(char),
    ).length;
    return overlap / summaryChars.size > 0.9 && normalizedSummary.length > 24;
  }
  const summaryTokens = new Set(normalizedSummary.split(" ").filter(Boolean));
  const excerptTokens = new Set(normalizedExcerpt.split(" ").filter(Boolean));
  if (summaryTokens.size < 5) {
    return false;
  }
  const overlap = [...summaryTokens].filter((token) =>
    excerptTokens.has(token),
  ).length;
  return overlap / summaryTokens.size > 0.86 && summaryTokens.size > 10;
}

export function meaningUnitEndsMidSentence(text: string) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return false;
  }
  if (/[.!?。！？)”'’」』]$/.test(trimmed)) {
    return false;
  }
  return /\b(and|but|because|because of|when|while|where|which|that|so|so that|then|with|without|to|for|from|into|about|if|although|though|as)\s*$/i.test(
    trimmed,
  );
}

export function summaryIsTooGeneric(summary: string) {
  const trimmed = summary.trim();
  const normalized = normalizeForSummarySimilarity(trimmed);
  if (!normalized) {
    return true;
  }
  return (
    /^participant (described|expressed|talked about|shared|said|mentioned)( at the beginning| in the beginning| initially)?\.?$/i.test(
      trimmed,
    ) ||
    /^participant (described|expressed|talked about|shared|said|mentioned) (at the beginning|in the beginning|initially)\b/i.test(
      trimmed,
    ) ||
    normalized === "participant described" ||
    normalized === "participant expressed"
  );
}

export function normalizeForSummarySimilarity(text: string) {
  return text
    .toLowerCase()
    .replace(
      /^(interviewer|researcher|moderator|facilitator|participant|interviewee|student|[IQPA])\s*[:：]\s*/i,
      "",
    )
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function approximateWordCount(text: string) {
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

export function getSegmentSplitIndex(
  text: string,
  cursorPosition?: number | null,
) {
  if (
    typeof cursorPosition === "number" &&
    cursorPosition > 0 &&
    cursorPosition < text.length
  ) {
    return cursorPosition;
  }

  const middle = Math.floor(text.length / 2);
  const nextParagraph = text.indexOf("\n\n", middle);
  if (nextParagraph > 0) {
    return nextParagraph;
  }

  const previousParagraph = text.lastIndexOf("\n\n", middle);
  if (previousParagraph > 0) {
    return previousParagraph;
  }

  return middle;
}

export function extractPrivacyReviewMarkers(transcript: string) {
  return Array.from(
    new Set(
      transcript
        .match(/\[\[PRIVACY_REVIEW:[^\]]+\]\]/g)
        ?.map((item) => item.trim()) ?? [],
    ),
  );
}

export function hasUnresolvedPrivacyMarkers(transcript: string) {
  return countUnresolvedPrivacyMarkers(transcript) > 0;
}

export function countUnresolvedPrivacyMarkers(transcript: string) {
  return transcript.match(/\[\[PRIVACY_REVIEW:[^\]]+\]\]/g)?.length ?? 0;
}

export function buildSensitiveReviewItems(
  transcript: string,
  findings: string[],
  existingItems: SensitiveReviewItem[] = [],
): SensitiveReviewItem[] {
  const existingByKey = new Map(
    existingItems.map((item) => [sensitiveItemKey(item), item]),
  );
  const items: SensitiveReviewItem[] = [];
  const markerCounters = new Map<string, number>();
  const regex =
    /\[\[(PRIVACY_REVIEW):([A-Z_ -]+):([^\]]+)\]\]|\[((?:PERSON|LOCATION|POSTCODE|CONTACT|ADDRESS|ORGANIZATION|ORGANISATION|INSTITUTION|HEALTH|FINANCIAL|IMMIGRATION|LEGAL|IDENTIFIER|DATE|OTHER_PRIVATE_DETAIL|THIRD_PARTY)[A-Z_]*_\d+)\]/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(transcript)) !== null) {
    const fullMatch = match[0];
    const markerCategory = match[2];
    const categoryKey = normaliseSensitiveCategory(
      markerCategory ?? match[4] ?? "OTHER_PRIVATE_DETAIL",
    );
    const safePlaceholderCategory = safePlaceholderCategoryName(categoryKey);
    const markerNumber = (markerCounters.get(safePlaceholderCategory) ?? 0) + 1;
    markerCounters.set(safePlaceholderCategory, markerNumber);
    const placeholder = match[4]
      ? `[${match[4]}]`
      : `[${safePlaceholderCategory}_${markerNumber}]`;
    const metadata = sensitiveCategoryMetadata(categoryKey);
    const startOffset = match.index;
    const endOffset = match.index + fullMatch.length;
    const base: SensitiveReviewItem = {
      id: `sensitive-${items.length + 1}`,
      placeholder,
      category: metadata.label,
      matchedText: fullMatch === placeholder ? undefined : fullMatch,
      riskLevel: metadata.riskLevel,
      replacementText: placeholder,
      startOffset,
      endOffset,
      status: "pending",
      explanation:
        findMatchingPrivacyFinding(findings, fullMatch, placeholder) ??
        metadata.explanation,
    };
    const existing =
      existingByKey.get(sensitiveItemKey(base)) ??
      existingItems.find(
        (item) =>
          item.placeholder === base.placeholder &&
          item.startOffset === base.startOffset,
      );
    items.push(
      existing
        ? {
            ...base,
            ...existing,
            matchedText: base.matchedText,
            startOffset,
            endOffset,
          }
        : base,
    );
  }

  return items;
}

export function safePlaceholderCategoryName(categoryKey: string) {
  if (categoryKey === "IMMIGRATION_LEGAL") {
    return "LEGAL_STATUS";
  }
  return categoryKey;
}

export function prepareTranscriptForStorage(transcript: string) {
  const markerCounters = new Map<string, number>();
  return transcript.replace(
    /\[\[PRIVACY_REVIEW:([A-Z_ -]+):[^\]]+\]\]/g,
    (_marker, rawCategory: string) => {
      const category = safePlaceholderCategoryName(
        normaliseSensitiveCategory(rawCategory),
      );
      const nextNumber = (markerCounters.get(category) ?? 0) + 1;
      markerCounters.set(category, nextNumber);
      return `[${category}_${nextNumber}]`;
    },
  );
}

export function serialiseSensitiveItemsForStorage(
  items: SensitiveReviewItem[],
) {
  return items.map(
    ({
      category,
      endOffset,
      explanation,
      id,
      placeholder,
      replacementText,
      riskLevel,
      startOffset,
      status,
    }) => ({
      category,
      endOffset,
      explanation,
      id,
      placeholder,
      replacementText,
      riskLevel,
      startOffset,
      status,
    }),
  );
}

export function sensitiveItemKey(item: SensitiveReviewItem) {
  return `${item.placeholder}:${item.startOffset ?? ""}:${item.category}`;
}

export function findMatchingPrivacyFinding(
  findings: string[],
  rawMarker: string,
  placeholder: string,
) {
  const finding = findings.find(
    (finding) => finding.includes(rawMarker) || finding.includes(placeholder),
  );
  if (!finding) {
    return undefined;
  }
  return finding.replace(/\[\[PRIVACY_REVIEW:[^\]]+\]\]/g, placeholder);
}

export function normaliseSensitiveCategory(category: string) {
  const upper = category.toUpperCase().replace(/[^A-Z]/g, "_");
  if (upper.includes("PERSON") || upper.includes("THIRD_PARTY")) {
    return "PERSON";
  }
  if (
    upper.includes("LOCATION") ||
    upper.includes("ADDRESS") ||
    upper.includes("POSTCODE") ||
    upper.includes("INSTITUTION") ||
    upper.includes("ORGANIZATION") ||
    upper.includes("ORGANISATION")
  ) {
    return upper.includes("POSTCODE")
      ? "POSTCODE"
      : upper.includes("ADDRESS")
        ? "ADDRESS"
        : upper.includes("ORGANIZATION") || upper.includes("ORGANISATION")
          ? "ORGANIZATION"
          : "LOCATION";
  }
  if (
    upper.includes("CONTACT") ||
    upper.includes("EMAIL") ||
    upper.includes("PHONE")
  ) {
    return "CONTACT";
  }
  if (upper.includes("HEALTH") || upper.includes("CLINICAL")) {
    return "HEALTH";
  }
  if (upper.includes("FINANCIAL") || upper.includes("MONEY")) {
    return "FINANCIAL";
  }
  if (upper.includes("IMMIGRATION") || upper.includes("LEGAL")) {
    return "IMMIGRATION_LEGAL";
  }
  if (upper.includes("IDENTIFIER") || upper.includes("ID")) {
    return "IDENTIFIER";
  }
  return "OTHER_PRIVATE_DETAIL";
}

export function sensitiveCategoryMetadata(categoryKey: string): {
  explanation: string;
  label: string;
  riskLevel: SensitiveRiskLevel;
} {
  const map: Record<
    string,
    { explanation: string; label: string; riskLevel: SensitiveRiskLevel }
  > = {
    PERSON: {
      explanation:
        "May identify a participant, interviewer, or third-party person.",
      label: "person name or third-party identifier",
      riskLevel: "high",
    },
    LOCATION: {
      explanation: "May reveal a specific location or institution.",
      label: "location or institution",
      riskLevel: "medium",
    },
    ADDRESS: {
      explanation: "May reveal a specific address.",
      label: "address",
      riskLevel: "high",
    },
    POSTCODE: {
      explanation: "May reveal a precise geographic area.",
      label: "postcode",
      riskLevel: "high",
    },
    ORGANIZATION: {
      explanation:
        "May identify a workplace, school, service, or organisation.",
      label: "organisation or institution",
      riskLevel: "medium",
    },
    CONTACT: {
      explanation: "May reveal direct contact details.",
      label: "contact detail",
      riskLevel: "high",
    },
    HEALTH: {
      explanation: "May reveal sensitive health-related information.",
      label: "health-related disclosure",
      riskLevel: "high",
    },
    FINANCIAL: {
      explanation: "May reveal sensitive financial detail.",
      label: "financial detail",
      riskLevel: "high",
    },
    IMMIGRATION_LEGAL: {
      explanation:
        "May reveal immigration, legal, or status-related information.",
      label: "immigration/legal detail",
      riskLevel: "high",
    },
    IDENTIFIER: {
      explanation:
        "May reveal an ID, account, social handle, or unique identifier.",
      label: "identifier",
      riskLevel: "high",
    },
    OTHER_PRIVATE_DETAIL: {
      explanation: "May contain identifying or sensitive contextual detail.",
      label: "other private detail",
      riskLevel: "medium",
    },
  };

  return map[categoryKey] ?? map.OTHER_PRIVATE_DETAIL;
}

export function isFallbackCategory(category: CategoryNode): boolean {
  return (
    category.source === "fallback" ||
    category.id.startsWith("cat_fallback") ||
    Boolean(category.subcategories?.some(isFallbackCategory))
  );
}

export function markCategoriesResearcherConfirmed(
  categories: CategoryNode[],
): CategoryNode[] {
  return categories.map((category) => ({
    ...category,
    source: "researcher_confirmed" as const,
    subcategories: category.subcategories
      ? markCategoriesResearcherConfirmed(category.subcategories)
      : undefined,
  }));
}

export function markCategoriesEditableDraft(
  categories: CategoryNode[],
): CategoryNode[] {
  return categories.map((category) => ({
    ...category,
    status: isFallbackCategory(category) ? "fallback_draft" : "needs_review",
    subcategories: category.subcategories
      ? markCategoriesEditableDraft(category.subcategories)
      : undefined,
  }));
}

export function formatCategoryStatus(
  status: NonNullable<CategoryNode["status"]>,
) {
  const labels: Record<NonNullable<CategoryNode["status"]>, string> = {
    ai_draft: "Suggested draft",
    edited: "Edited",
    confirmed: "Confirmed",
    fallback_draft: "Fallback draft",
    needs_review: "Needs review",
    rejected: "Rejected",
  };
  return labels[status] ?? "Needs review";
}

export function hasSensitivePlaceholder(text: string) {
  return /\[(PERSON|CONTACT|LOCATION|POSTCODE|ADDRESS|IDENTIFIER|HEALTH|FINANCIAL|LEGAL_STATUS)_\d+\]/i.test(
    text,
  );
}

export function getCategoryRunDisabledReason({
  allSegmentsProcessedForModeC,
  categoryCount,
  confirmedMeaningUnits,
  hasTemporaryFallbackCategories,
  mode,
}: {
  allSegmentsProcessedForModeC: boolean;
  categoryCount: number;
  confirmedMeaningUnits: number;
  hasTemporaryFallbackCategories: boolean;
  mode: CategoryMode;
}) {
  if (confirmedMeaningUnits === 0) {
    return "Accept meaning units before running categories";
  }
  if (hasTemporaryFallbackCategories && (mode === "B" || mode === "C")) {
    return "Regenerate or explicitly accept the temporary fallback draft before continuing";
  }
  if (mode === "B" && categoryCount === 0) {
    return "Construct provisional categories before refining the category system";
  }
  if (mode === "C" && categoryCount === 0) {
    return "Construct and review categories before integrating findings";
  }
  if (mode === "C" && !allSegmentsProcessedForModeC) {
    return "Confirm all meaning units in this transcript have been processed and reviewed before integration";
  }
  return getCategoryRunLabel(mode);
}

export function getCategoryRunLabel(mode: CategoryMode, running = false) {
  const labels: Record<CategoryMode, string> = {
    A: "Optional assistant suggestion: provisional categories",
    B: "Refine categories",
    C: "Optional assistant suggestion: structure and summary narrative",
  };
  return running ? `${labels[mode]}...` : labels[mode];
}

export function getStepCopy(step: WorkflowStep) {
  switch (step) {
    case "pre-analysis":
      return "Prepare and organise your data before formal analysis.";
    case "understanding":
      return "Work with meaning units and translate participants' accounts into analytically useful forms.";
    case "categorizing":
      return "Compare meaning units and work with provisional categories.";
    case "integrating":
      return "Depict structure and provide summary narratives.";
    case "integrity":
      return "Check transparency, coherence, and credibility.";
    case "export":
      return "Export the analysis record and audit trail.";
  }
}

export function getStepGuidance(step: WorkflowStep) {
  const guidance: Record<
    WorkflowStep,
    { ai: string; judgment: string; meaning: string; task: string }
  > = {
    "pre-analysis": {
      meaning:
        "Pre-analysis helps you prepare your material before detailed analysis begins. You will organise data into domains of investigation, prepare your transcript, and make initial judgements about relevance.",
      task: "Define the research question, domains of investigation, researcher expectations, notes, and relevance guideline. Upload or paste a transcript and review it before analysis.",
      ai: "I can help you structure your domains, prepare transcript material, and flag sections that may need your attention. You remain the final decision-maker.",
      judgment:
        "You decide how to define your domains, what counts as relevant study data, and what preparation decisions are appropriate for your research question.",
    },
    understanding: {
      meaning:
        "In this step, you work closely with meaning units. The aim is to understand what each meaning unit says and translate it into a more manageable analytic form.",
      task: "Review, split, merge, delete, and confirm meaning units. Edit summaries and implicit meaning notes before accepting them.",
      ai: "I can help suggest possible meaning unit boundaries, concise summaries, and context-based implicit meanings. These are draft suggestions for your review.",
      judgment:
        "You decide whether each meaning unit is clear, whether the summary stays close to the participant’s account, and whether any implicit meaning is justified by the context.",
    },
    categorizing: {
      meaning:
        "Categorizing involves comparing meaning units, grouping similar meanings, naming categories, and revising them as the analysis develops.",
      task: "Review category names, descriptions, linked meaning units, participant count, supporting quotes, and researcher notes.",
      ai: "I can help notice possible similarities across meaning units and suggest provisional category names. You can rename, merge, split, or reject any suggestion.",
      judgment:
        "You decide whether a category captures the shared meaning across meaning units, whether it needs to be revised, and how it should be named.",
    },
    integrating: {
      meaning:
        "Integrating means moving beyond a list of categories. The aim is to depict the structure of your findings and develop a coherent summary narrative.",
      task: "Review the category relationship map, edit relationships, reorder categories, and confirm the summary narrative.",
      ai: "I can help sketch possible relationships among categories and draft a provisional summary narrative. You decide whether the structure is convincing and grounded in the data.",
      judgment:
        "You decide how categories relate to one another, what structure best represents your findings, and which claims are supported by the evidence.",
    },
    integrity: {
      meaning:
        "Methodological integrity helps you review whether the analysis is transparent, coherent, credible, and respectful of participants.",
      task: "Review checklist items, address flagged issues, add researcher notes, and export the audit trail.",
      ai: "I can help flag places where the analysis may need more evidence, clearer context, or closer attention to contradictory cases. These flags are prompts for reflection, not final judgements.",
      judgment:
        "You decide how to address each issue, what needs revision, and how to make the analysis more transparent and credible.",
    },
    export: {
      meaning:
        "Export preserves the analysis record and audit trail for review, supervision, and reporting.",
      task: "Export the research question, domains, expectations, relevance guideline, meaning units, summaries, categories, structure, narrative, checklist, and audit trail.",
      ai: "I can help package the current analysis record into export formats.",
      judgment:
        "Take a final look before using exported material in reports, publications, supervision, or teaching.",
    },
  };
  return guidance[step];
}

export function getGdiqrTips(step: WorkflowStep) {
  const tips: Record<WorkflowStep, string[]> = {
    "pre-analysis": [
      "Domains of investigation help organise the data, but they are not findings.",
      "Data preparation should preserve participants’ meaning and context.",
      "Judgement of relevance is guided by the research problem and research questions.",
    ],
    understanding: [
      "Meaning units should be large enough to communicate a clear message and small enough to remain manageable.",
      "Summaries should stay close to the participant's account.",
      "Implicit meaning should clarify context-based meaning, not become speculation.",
    ],
    categorizing: [
      "Categories are provisional and may be renamed, merged, divided, or reorganised.",
      "Categories emerge from meaning units.",
      "Domains are not findings; categories are analytic findings developed from the data.",
    ],
    integrating: [
      "Integration shows how categories relate to one another.",
      "Summary narratives help readers understand the structure of the findings.",
      "Narrative claims should remain linked to category and meaning-unit evidence.",
    ],
    integrity: [
      "The analytic process should be transparent and traceable.",
      "Coherence matters: findings should fit together while preserving complexity.",
      "Contradictory or negative cases should be considered rather than smoothed over.",
    ],
    export: [
      "The analysis record should preserve decisions, evidence, and revisions.",
      "Audit trails support transparency and supervision.",
      "Exported material should be reviewed before use in reporting.",
    ],
  };
  return tips[step];
}

export function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

export function RunLogPanel({
  logs,
  onClear,
}: {
  logs: RunLog[];
  onClear: () => void;
}) {
  return (
    <section className="section run-log-section">
      <div className="section-header compact">
        <div>
          <span className="badge blue">Activity</span>
          <h2 className="run-log-title">Current processing activity</h2>
          <p className="small">
            Shows the current upload, transcript preparation, and analysis run.
            Finished runs are automatically cleared when a new run starts.
          </p>
        </div>
        <button className="button" onClick={onClear} type="button">
          Clear finished
        </button>
      </div>
      <div className="section-body grid">
        {logs.length === 0 ? (
          <EmptyState text="No current activity. Start an upload, transcript import, or analysis step to see progress here." />
        ) : (
          logs.slice(0, 8).map((log) => (
            <article className="run-log-card" key={log.id}>
              <div className="category-header">
                <div>
                  <h3>{log.label}</h3>
                  <p className="small">
                    Started {formatTime(log.startedAt)}
                    {log.durationMs
                      ? ` · ${formatMs(log.durationMs)} total`
                      : ""}
                  </p>
                </div>
                <StatusBadge label={formatRunStatus(log.status)} />
              </div>
              <div className="timeline">
                {log.events.slice(-20).map((event) => (
                  <div className="timeline-item compact" key={event.id}>
                    <span className="mono small">
                      {formatTime(event.timestamp)}
                    </span>
                    <p className="small">{event.message}</p>
                  </div>
                ))}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

export function formatMs(ms: number) {
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatRunStatus(status: RunLog["status"]) {
  return status === "failed"
    ? "Needs attention"
    : status === "completed"
      ? "Completed"
      : "Running";
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs: number },
) {
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }
  const timeout = window.setTimeout(
    () => controller.abort(),
    options.timeoutMs,
  );

  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (options.signal?.aborted) {
        throw new Error("Generation stopped by user.");
      }
      throw new Error(
        "Local AI request timed out in the browser. Check the live log panel to see whether the server is still processing semantic windows, or increase NEXT_PUBLIC_MU_JOB_TIMEOUT_MS / OLLAMA_MU_CHUNK_TIMEOUT_MS, or reduce TRANSCRIPT_MU_WINDOW_CHARS.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function guidanceMemoToMessage(memo: GuidanceMemo): GuidanceMessage {
  return {
    answer: memo.answer,
    createdAt: memo.createdAt,
    id: memo.id,
    projectId: memo.projectId,
    question: memo.question,
    saved: true,
    step: memo.step,
  };
}

export function getMeaningUnitRequestTimeoutMs() {
  return getClientConfiguredTimeoutMs(
    process.env.NEXT_PUBLIC_MU_JOB_TIMEOUT_MS,
    5400000,
    120000,
    7200000,
  );
}

export function getTranscriptPrepareRequestTimeoutMs() {
  return getClientConfiguredTimeoutMs(
    process.env.NEXT_PUBLIC_TRANSCRIPT_PREPARE_TIMEOUT_MS,
    300000,
    10000,
    900000,
  );
}

export function getClientConfiguredTimeoutMs(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const configured = Number(value ?? fallback);
  if (!Number.isFinite(configured)) {
    return fallback;
  }
  return Math.max(min, Math.min(configured, max));
}

export function confirmWorkspaceAction(message: string) {
  return window.confirm(message);
}

export function promptWorkspaceText(message: string, defaultValue?: string) {
  return window.prompt(message, defaultValue);
}

export function slugifyFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "gdi-qr-project"
  );
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openPrintableAnalysisRecord(reportText: string) {
  const popup = window.open("", "_blank");
  if (!popup) {
    downloadFile("gdi-qr-analysis-record.txt", reportText, "text/plain");
    return;
  }

  popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>GDI-QR Analysis Record</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 32px; color: #111827; line-height: 1.45; }
    pre { white-space: pre-wrap; word-break: break-word; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; }
    .toolbar { position: sticky; top: 0; background: white; padding: 12px 0; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; }
    button { padding: 8px 12px; border: 1px solid #9ca3af; border-radius: 8px; background: #f9fafb; cursor: pointer; }
    @media print { .toolbar { display: none; } body { margin: 18mm; } }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
  <pre>${escapeHtml(reportText)}</pre>
</body>
</html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 500);
}

export function buildDocxBlobFromText(reportText: string) {
  const documentXml = buildWordDocumentXml(reportText);
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    },
    {
      name: "word/document.xml",
      content: documentXml,
    },
  ];

  return new Blob([createZipArchive(files)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function buildWordDocumentXml(reportText: string) {
  const sectionHeadings = new Set([
    "Step 1 Pre-analysis",
    "Transcript",
    "Meaning Units",
    "Categories",
    "Methodological Integrity Review",
    "Reviewer Issues",
    "Step 4 Integration",
    "Summary Narrative",
    "Export History",
    "Audit Trail",
  ]);
  const lines = reportText.split("\n");
  const paragraphs = lines
    .map((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return `<w:p/>`;
      }
      const isTitle = index === 0;
      const isHeading = sectionHeadings.has(trimmed);
      return buildWordParagraphXml(trimmed, { isHeading, isTitle });
    })
    .join("\n\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

export function buildWordParagraphXml(
  text: string,
  options: { isHeading?: boolean; isTitle?: boolean } = {},
) {
  const size = options.isTitle ? "32" : options.isHeading ? "26" : "22";
  const bold = options.isTitle || options.isHeading ? "<w:b/>" : "";
  const spacing =
    options.isTitle || options.isHeading
      ? '<w:spacing w:before="240" w:after="120"/>'
      : '<w:spacing w:after="80"/>';
  return `<w:p>
    <w:pPr>${spacing}</w:pPr>
    <w:r>
      <w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

export function createZipArchive(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);
    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    centralParts.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

export function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

export function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildMeaningUnitCsv(units: MeaningUnit[]) {
  const rows = [
    [
      "number",
      "caseId",
      "segmentId",
      "speaker",
      "excerpt",
      "aiSummary",
      "humanSummary",
      "humanStatus",
      "reviewerStatus",
      "analysisExcluded",
      "exclusionReason",
      "uncertainty",
    ],
    ...units.map((unit) => [
      String(unit.number),
      unit.caseId,
      unit.segmentId,
      unit.speaker,
      unit.excerpt,
      unit.aiSummary,
      unit.humanSummary,
      unit.humanStatus,
      unit.reviewerStatus,
      unit.analysisExcluded ? "true" : "false",
      unit.exclusionReason ?? "",
      unit.uncertainty ?? "",
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function SensitiveReviewCard({
  isActive,
  item,
  onApplyConsistent,
  onConfirm,
  onEdit,
  onFocus,
  onIgnore,
}: {
  isActive: boolean;
  item: SensitiveReviewItem;
  onApplyConsistent: (item: SensitiveReviewItem) => void;
  onConfirm: (item: SensitiveReviewItem) => void;
  onEdit: (item: SensitiveReviewItem) => void;
  onFocus: (item: SensitiveReviewItem) => void;
  onIgnore: (item: SensitiveReviewItem) => void;
}) {
  return (
    <article className={`sensitive-card ${isActive ? "active" : ""}`}>
      <button
        className="sensitive-card-main"
        onClick={() => onFocus(item)}
        type="button"
      >
        <span className={`sensitive-chip ${riskClass(item.riskLevel)}`}>
          {item.placeholder}
        </span>
        <span>{item.category}</span>
        <StatusBadge label={`${item.riskLevel} risk`} />
        <StatusBadge label={item.status} />
      </button>
      <p className="small">{item.explanation}</p>
      <div className="button-row">
        <button
          className="button"
          onClick={() => onConfirm(item)}
          type="button"
        >
          Confirm
        </button>
        <button className="button" onClick={() => onEdit(item)} type="button">
          Edit label
        </button>
        <button className="button" onClick={() => onIgnore(item)} type="button">
          Ignore
        </button>
        <button
          className="button"
          onClick={() => onApplyConsistent(item)}
          type="button"
        >
          Apply consistently
        </button>
      </div>
    </article>
  );
}

export function SensitiveTranscriptPreview({
  activeItemId,
  items,
  onSelect,
  transcript,
}: {
  activeItemId: string;
  items: SensitiveReviewItem[];
  onSelect: (item: SensitiveReviewItem) => void;
  transcript: string;
}) {
  if (!items.length) {
    return (
      <div className="transcript-highlight-preview">
        {transcript || "No transcript text is available for review."}
      </div>
    );
  }

  const sortedItems = [...items]
    .filter(
      (item) =>
        typeof item.startOffset === "number" &&
        typeof item.endOffset === "number",
    )
    .sort((left, right) => (left.startOffset ?? 0) - (right.startOffset ?? 0));
  const parts: ReactNode[] = [];
  let cursor = 0;

  sortedItems.forEach((item) => {
    const start = item.startOffset ?? cursor;
    const end = item.endOffset ?? start + item.placeholder.length;
    if (start < cursor) {
      return;
    }
    if (start > cursor) {
      parts.push(
        <span key={`${item.id}-text-before`}>
          {transcript.slice(cursor, start)}
        </span>,
      );
    }
    parts.push(
      <button
        className={`sensitive-highlight ${riskClass(item.riskLevel)} ${
          item.id === activeItemId ? "active" : ""
        }`}
        key={item.id}
        onClick={() => onSelect(item)}
        title={`${item.category}: ${item.explanation}`}
        type="button"
      >
        {transcript.slice(start, end)}
      </button>,
    );
    cursor = end;
  });

  if (cursor < transcript.length) {
    parts.push(<span key="tail">{transcript.slice(cursor)}</span>);
  }

  return <div className="transcript-highlight-preview">{parts}</div>;
}

export function riskClass(riskLevel: SensitiveRiskLevel) {
  return `risk-${riskLevel}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function ModeButton({
  active,
  description,
  label,
  onClick,
}: {
  active: boolean;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`mode-button ${active ? "active" : ""}`}
      onClick={onClick}
      type="button"
    >
      <strong>{label}</strong>
      <span className="small">{description}</span>
    </button>
  );
}

export function ReviewerPanel({
  dismissActionLabel = "Dismiss",
  emptyText = "Integrity check not yet run. The system flags possible issues; the researcher decides how to address them.",
  expandedIssueIds,
  hasRun = false,
  issueContextById = {},
  isOpen,
  issues,
  isRunning,
  noActiveText = "No active review issues. Dismissed and resolved items remain in the review trail.",
  onAddMemo,
  onDismiss,
  onResolve,
  onRun,
  onToggle,
  onToggleIssue,
  onView,
  panelBadge = "Methodological Integrity Review",
  responsibilityText,
  runButtonLabel = "Review methodological integrity",
  showAddMemoAction = true,
  title,
  viewActionLabel = "View target",
}: {
  dismissActionLabel?: string;
  emptyText?: string;
  expandedIssueIds: string[];
  hasRun?: boolean;
  issueContextById?: Record<string, ReviewerIssueContext>;
  isOpen: boolean;
  issues: ReviewerComment[];
  isRunning: boolean;
  noActiveText?: string;
  onAddMemo: (issue: ReviewerComment) => void;
  onDismiss: (issue: ReviewerComment) => void;
  onResolve: (issue: ReviewerComment) => void;
  onRun: () => void;
  onToggle: () => void;
  onToggleIssue: (issueId: string) => void;
  onView: (issue: ReviewerComment) => void;
  panelBadge?: string;
  responsibilityText?: string;
  runButtonLabel?: string;
  showAddMemoAction?: boolean;
  title: string;
  viewActionLabel?: string;
}) {
  const activeIssues = issues.filter((issue) => issue.status === "unresolved");
  const warningCount = activeIssues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const infoCount = activeIssues.filter(
    (issue) => issue.severity === "info",
  ).length;
  const majorCount = activeIssues.filter(
    (issue) => issue.severity === "major",
  ).length;
  const resolvedCount = issues.filter(
    (issue) => issue.status === "resolved",
  ).length;
  const dismissedCount = issues.filter(
    (issue) => issue.status === "dismissed",
  ).length;
  const groupedIssues = groupReviewerIssues(activeIssues);

  return (
    <aside className={`review-panel ${isOpen ? "" : "collapsed"}`}>
      <div className="category-header">
        <div>
          <span className="badge blue">{panelBadge}</span>
          <h3>{title}</h3>
          <p className="small">
            {hasRun && issues.length === 0
              ? "No major Step 2 integrity issues found. Please still review meaning-unit boundaries and summaries carefully."
              : reviewSummaryText(
                  issues,
                  infoCount,
                  warningCount,
                  majorCount,
                  resolvedCount,
                )}
          </p>
        </div>
        <button className="button icon" onClick={onToggle} type="button">
          {isOpen ? "−" : "+"}
        </button>
      </div>
      {isOpen && (
        <div className="review-panel-body">
          <div className="button-row">
            <button
              className="button primary"
              disabled={isRunning}
              onClick={onRun}
              type="button"
            >
              <ShieldCheck size={18} />
              {isRunning ? "Reviewing..." : runButtonLabel}
            </button>
            <span className="badge">
              {activeIssues.length} active · {resolvedCount} resolved
            </span>
            {dismissedCount > 0 && (
              <span className="badge blue">{dismissedCount} dismissed</span>
            )}
          </div>
          {responsibilityText && (
            <p className="small review-responsibility-note">
              {responsibilityText}
            </p>
          )}
          {issues.length === 0 ? (
            <EmptyState
              text={
                hasRun
                  ? "No major Step 2 integrity issues found. Please still review meaning-unit boundaries and summaries carefully."
                  : emptyText
              }
            />
          ) : activeIssues.length === 0 ? (
            <EmptyState text={noActiveText} />
          ) : (
            Object.entries(groupedIssues).map(([group, groupIssues]) => (
              <div className="review-group" key={group}>
                <span className="label">{group}</span>
                {groupIssues.map((issue) => {
                  const expanded = expandedIssueIds.includes(issue.id);
                  const issueContext = issueContextById[issue.id];
                  return (
                    <article className="review-issue" key={issue.id}>
                      <button
                        className="review-issue-header"
                        onClick={() => onToggleIssue(issue.id)}
                        type="button"
                      >
                        <div>
                          <span className="review-issue-kicker">
                            <StatusBadge label={issue.severity} />
                            <span>{issue.target}</span>
                          </span>
                          <strong>{reviewerIssueTitle(issue)}</strong>
                          <p className="small">{issue.issueType}</p>
                        </div>
                      </button>
                      {expanded && (
                        <div className="review-issue-body">
                          {issueContext && (
                            <div className="review-issue-snippet">
                              <span className="label">
                                {issueContext.label}
                              </span>
                              <p>{issueContext.text}</p>
                            </div>
                          )}
                          <div>
                            <span className="label">
                              Why this may need review
                            </span>
                            <p>{issue.comment}</p>
                          </div>
                          <p className="small">
                            <strong>Reflection question:</strong>{" "}
                            {issue.suggestedAction ||
                              "Researcher review needed."}
                          </p>
                          {issue.researcherMemo && (
                            <p className="small">
                              <strong>Memo:</strong> {issue.researcherMemo}
                            </p>
                          )}
                          <div className="button-row">
                            <button
                              className="button"
                              onClick={() => onView(issue)}
                              type="button"
                            >
                              {viewActionLabel}
                            </button>
                            <button
                              className="button"
                              disabled={issue.status === "resolved"}
                              onClick={() => onResolve(issue)}
                              type="button"
                            >
                              Mark resolved
                            </button>
                            <button
                              className="button"
                              onClick={() => onDismiss(issue)}
                              type="button"
                            >
                              {dismissActionLabel}
                            </button>
                            {showAddMemoAction && (
                              <button
                                className="button"
                                onClick={() => onAddMemo(issue)}
                                type="button"
                              >
                                Add memo
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}

export function MeaningUnitReviewCard({
  actionFeedback,
  onAccept,
  onDelete,
  onEditExclusionReason,
  onEditExcerpt,
  onEditSummary,
  onExclude,
  onMergeNext,
  onMergePrevious,
  onRestore,
  onReturnToTranscript,
  onSaveExcerpt,
  onSaveSummary,
  onSplit,
  unit,
}: {
  actionFeedback?: string;
  onAccept: (unitId: string) => void;
  onDelete: (unit: MeaningUnit) => void;
  onEditExclusionReason: (unitId: string, value: string) => void;
  onEditExcerpt: (unitId: string, value: string) => void;
  onEditSummary: (unitId: string, value: string) => void;
  onExclude: (unit: MeaningUnit) => void;
  onMergeNext: (unit: MeaningUnit) => void;
  onMergePrevious: (unit: MeaningUnit) => void;
  onRestore: (unit: MeaningUnit) => void;
  onReturnToTranscript: (unit: MeaningUnit) => void;
  onSaveExcerpt: (unitId: string) => void;
  onSaveSummary: (unitId: string) => void;
  onSplit: (unit: MeaningUnit) => void;
  unit: MeaningUnit;
}) {
  const validationFlags = getMeaningUnitValidationFlags(unit);
  const openingBackgroundCandidate = isOpeningBackgroundCandidate(unit);
  const exclusionReasonRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <article
      className={`summary-card ${unit.analysisExcluded ? "excluded-row" : ""}`}
      id={`mu-${unit.number}`}
    >
      <div className="category-header">
        <strong>
          {unit.speakerRole === "participant" ||
          unit.generationMethod === "researcher"
            ? `MU #${unit.number}`
            : "Source context"}
        </strong>
        <StatusBadge label={unit.humanStatus} />
      </div>
      <div className="button-row">
        <span className="badge blue">
          {openingBackgroundCandidate
            ? "Opening/background candidate — researcher decision"
            : formatMeaningUnitClassification(unit.classification)}
        </span>
        {unit.generationMethod && (
          <span className="badge">
            {unit.generationMethod === "ai_semantic"
              ? "AI semantic draft"
              : unit.generationMethod === "rule_based_fallback"
                ? "Provisional structural span"
                : "Researcher created"}
          </span>
        )}
      </div>
      <p className="small">
        Source reference: {unit.caseId || "No case"} ·{" "}
        {unit.segmentId || "Transcript source"} · Speaker:{" "}
        {unit.speaker || "Unspecified"}
        {unit.sourceStartLine
          ? ` · line${unit.sourceEndLine && unit.sourceEndLine !== unit.sourceStartLine ? "s" : ""} ${unit.sourceStartLine}${unit.sourceEndLine && unit.sourceEndLine !== unit.sourceStartLine ? `–${unit.sourceEndLine}` : ""}`
          : ""}
      </p>
      {validationFlags.length > 0 && (
        <div className="button-row">
          {validationFlags.map((flag) => (
            <span
              className={`badge ${flag.tone ?? ""}`.trim()}
              key={flag.label}
            >
              {flag.label}
            </span>
          ))}
        </div>
      )}
      {unit.reviewerWarnings && unit.reviewerWarnings.length > 0 && (
        <ul className="small panel-note">
          {unit.reviewerWarnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      <div className="mini-card">
        <span className="label">
          {unit.speakerRole !== "participant"
            ? "Contextual transcript material"
            : openingBackgroundCandidate
              ? "Participant opening/background material"
            : unit.generationMethod === "rule_based_fallback"
              ? "Provisional participant span"
              : "Participant excerpt"}
        </span>
        <p>{unit.excerpt}</p>
      </div>
      {openingBackgroundCandidate ? (
        <div className="mini-card soft">
          <span className="label">Assistant inclusion suggestion</span>
          <p className="small">
            The system detected this material inside a likely opening or
            icebreaker phase before the first formal research question. It has
            still been delineated and summarised. This is background guidance
            only: you decide whether to include or exclude it.
          </p>
        </div>
      ) : null}
      {unit.speakerRole === "participant" ? (
        <div className="mini-card soft">
          <span className="label">Draft meaning-unit summary</span>
          <p className="small">
            {unit.aiSummary ||
              (unit.generationMethod === "rule_based_fallback"
                ? "Not generated — semantic delineation and summary are still required."
                : "No safe draft summary was generated; researcher wording is required.")}
          </p>
        </div>
      ) : null}
      {unit.uncertainty &&
        !unit.uncertainty.toLowerCase().includes("rule-based draft") && (
          <p className="small panel-note">{unit.uncertainty}</p>
        )}
      {unit.contextExcerpt && (
        <details className="mini-card soft">
          <summary className="label">
            Interaction context — not participant evidence
          </summary>
          <p className="small">{unit.contextExcerpt}</p>
        </details>
      )}
      <label className="label">
        {unit.speakerRole === "participant"
          ? "Researcher-reviewed participant excerpt"
          : "Researcher-reviewed contextual material"}
        <textarea
          className="field"
          disabled={unit.analysisExcluded}
          onBlur={() => void onSaveExcerpt(unit.id)}
          onChange={(event) => onEditExcerpt(unit.id, event.target.value)}
          value={unit.excerpt}
        />
      </label>
      {unit.speakerRole === "participant" && (
        <label className="label">
          Researcher-reviewed summary
          <textarea
            className="field"
            disabled={unit.analysisExcluded}
            onBlur={() => void onSaveSummary(unit.id)}
            onChange={(event) => onEditSummary(unit.id, event.target.value)}
            value={unit.humanSummary}
          />
        </label>
      )}
      <label className="label">
        Researcher memo / exclusion reason
        <textarea
          className="field"
          onChange={(event) =>
            onEditExclusionReason(unit.id, event.target.value)
          }
          placeholder={
            unit.speaker === "Interviewer"
              ? "Example: interviewer prompt or contextual question"
              : "Required before excluding this meaning unit"
          }
          ref={exclusionReasonRef}
          value={unit.exclusionReason ?? ""}
        />
      </label>
      {!unit.analysisExcluded && !unit.exclusionReason?.trim() && (
        <p className="small panel-note">
          To exclude this MU, enter a short researcher reason above first. The
          reason remains visible in the audit trail.
        </p>
      )}
      {actionFeedback && (
        <div aria-live="polite" className="mu-card-action-feedback" role="status">
          <strong>Action status</strong>
          <span>{actionFeedback}</span>
        </div>
      )}
      <div className="button-row">
        {!unit.analysisExcluded && (
          <button
            className="button"
            onClick={() => onAccept(unit.id)}
            title="Accept meaning unit"
            type="button"
          >
            <Check size={18} />
            Accept
          </button>
        )}
        {unit.analysisExcluded ? (
          <button
            className="button"
            onClick={() => void onRestore(unit)}
            type="button"
          >
            Restore
          </button>
        ) : (
          <>
            {unit.classification !== "substantive_participant" && (
              <button
                className="button"
                onClick={() => void onRestore(unit)}
                type="button"
              >
                Include as substantive
              </button>
            )}
            <button
              className="button"
              onClick={() => {
                if (!unit.exclusionReason?.trim()) {
                  exclusionReasonRef.current?.focus();
                }
                void onExclude(unit);
              }}
              type="button"
            >
              Exclude
            </button>
          </>
        )}
        <button
          className="button"
          disabled={unit.analysisExcluded}
          onClick={() => onSplit(unit)}
          type="button"
        >
          Split
        </button>
        <button
          className="button"
          onClick={() => onMergePrevious(unit)}
          type="button"
        >
          Merge previous
        </button>
        <button
          className="button"
          onClick={() => onMergeNext(unit)}
          type="button"
        >
          Merge next
        </button>
        <button
          className="button icon"
          disabled={unit.analysisExcluded}
          onClick={() => onReturnToTranscript(unit)}
          title="Fix source transcript and redraft"
          type="button"
        >
          <Pencil size={18} />
        </button>
        <button
          className="button danger"
          onClick={() => onDelete(unit)}
          type="button"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function formatMeaningUnitClassification(
  classification: MeaningUnit["classification"],
) {
  if (classification === "context_only") {
    return "Context only";
  }
  if (classification === "non_analytic") {
    return "Non-analytic / housekeeping";
  }
  if (classification === "uncertain") {
    return "Uncertain — review required";
  }
  return "Substantive participant MU";
}

export function reviewSummaryText(
  issues: ReviewerComment[],
  infoCount: number,
  warningCount: number,
  majorCount: number,
  resolvedCount: number,
) {
  if (issues.length === 0) {
    return "No integrity review yet";
  }
  return `${majorCount} major · ${warningCount} warning${
    warningCount === 1 ? "" : "s"
  } · ${infoCount} info · ${resolvedCount} resolved`;
}

export function reviewerIssueTitle(issue: ReviewerComment) {
  const target = issue.target || issue.targetId;
  const normalized = issue.issueType.toLowerCase();
  if (normalized.includes("too short")) {
    return `${target} may be too short`;
  }
  if (normalized.includes("mid-sentence")) {
    return `${target} may end mid-sentence`;
  }
  if (normalized.includes("may be incomplete")) {
    return `${target} may be incomplete`;
  }
  if (
    normalized.includes("too long") ||
    normalized.includes("several meanings")
  ) {
    return `${target} may contain more than one meaning`;
  }
  if (
    normalized.includes("summary missing") ||
    normalized.includes("summary needed")
  ) {
    return `${target} needs a researcher summary`;
  }
  if (normalized.includes("too close to excerpt")) {
    return `${target} summary may repeat the excerpt`;
  }
  if (normalized.includes("summary too generic")) {
    return `${target} summary may be too generic`;
  }
  if (normalized.includes("interviewer")) {
    return `${target} may be contextual material`;
  }
  if (normalized.includes("source reference")) {
    return `${target} needs a clearer source reference`;
  }
  if (normalized.includes("duplicate") || normalized.includes("overlap")) {
    return `${target} may overlap with another MU`;
  }
  if (normalized.includes("beyond participant")) {
    return `${target} summary may over-interpret`;
  }
  if (normalized.includes("non-transcript")) {
    return `${target} may include project setup or metadata`;
  }
  if (normalized.includes("excluded without reason")) {
    return `${target} needs an exclusion reason`;
  }
  return `${target}: ${issue.issueType}`;
}

export function groupReviewerIssues(issues: ReviewerComment[]) {
  return issues.reduce<Record<string, ReviewerComment[]>>((groups, issue) => {
    const group = reviewerGroupLabel(issue.issueType);
    groups[group] = [...(groups[group] ?? []), issue];
    return groups;
  }, {});
}

export function reviewerGroupLabel(issueType: string) {
  const normalized = issueType.toLowerCase();
  if (
    normalized.includes("excerpt") ||
    normalized.includes("source reference") ||
    normalized.includes("summary") ||
    normalized.includes("interviewer") ||
    normalized.includes("duplicate") ||
    normalized.includes("overlap") ||
    normalized.includes("excluded")
  ) {
    return "Potential issues for review";
  }
  if (normalized.includes("coverage")) {
    return "Coverage";
  }
  if (normalized.includes("over") || normalized.includes("interpret")) {
    return "Over-interpretation";
  }
  if (normalized.includes("light")) {
    return "Light interpretation";
  }
  if (normalized.includes("uncertain")) {
    return "Uncertainty";
  }
  if (normalized.includes("category") || normalized.includes("coherence")) {
    return "Category coherence";
  }
  if (normalized.includes("integration") || normalized.includes("narrative")) {
    return "Integration limits";
  }
  return "Potential issues for review";
}

export function getCategoryDisplayTitle(category: CategoryNode) {
  if (isAutomaticCategoryTitle(category.name)) {
    return "Untitled Provisional Category";
  }
  return category.name.trim() || "Untitled Provisional Category";
}

export function getCategoryTitleInputValue(category: CategoryNode) {
  if (
    category.status === "ai_draft" ||
    category.status === "fallback_draft" ||
    category.status === "needs_review"
  ) {
    return "";
  }
  return isAutomaticCategoryTitle(category.name) ? "" : category.name;
}

export function getCategoryDescriptionValue(category: CategoryNode) {
  if (
    category.status === "ai_draft" ||
    category.status === "fallback_draft" ||
    category.status === "needs_review"
  ) {
    return "";
  }
  if (isSystemGeneratedCategoryDescription(category.definition)) {
    return "";
  }
  return category.definition;
}

export function getCategoryMemoValue(category: CategoryNode) {
  if (category.status === "ai_draft" || category.status === "fallback_draft") {
    return "";
  }
  return category.memo ?? category.rationale ?? "";
}

export function getCategoryAssistantStatusItems(category: CategoryNode) {
  if (isFallbackCategory(category)) {
    return [
      "Assistant suggestion unavailable",
      "Fallback grouping used",
      "Redraft available",
    ];
  }
  if (category.status === "confirmed") {
    return ["Researcher-confirmed category"];
  }
  if (category.status === "edited") {
    return [
      "Researcher edits present",
      "Assistant suggestion remains provisional",
    ];
  }
  if (category.status === "rejected") {
    return ["Category rejected by researcher"];
  }
  return ["Assistant suggestion generated", "Researcher review required"];
}

export function isAutomaticCategoryTitle(name: string) {
  const trimmed = name.trim();
  return (
    /^draft category\s+\d+\s*:/i.test(trimmed) ||
    /^untitled provisional category$/i.test(trimmed) ||
    /^new draft category$/i.test(trimmed)
  );
}

export function isSystemGeneratedCategoryDescription(description: string) {
  const normalized = description.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("assistant could not generate") ||
    normalized.includes("assistant returned empty") ||
    normalized.includes("ai returned empty") ||
    normalized.includes("returned empty output") ||
    normalized.includes("fallback grouping") ||
    normalized.includes("temporary fallback") ||
    normalized.includes("fallback draft") ||
    normalized.includes("could not draft") ||
    normalized.includes("created as a temporary draft") ||
    normalized.includes("researcher-created draft category")
  );
}

export function getOptionalCategoryDraft(
  category: CategoryNode,
  _includedUnits: MeaningUnit[],
) {
  const assistantLabel =
    !isAutomaticCategoryTitle(category.name) &&
    category.status !== "edited" &&
    category.status !== "confirmed" &&
    category.name.trim()
      ? category.name.trim()
      : "";
  const assistantDefinition =
    !isSystemGeneratedCategoryDescription(category.definition) &&
    category.status !== "edited" &&
    category.status !== "confirmed" &&
    category.definition.trim()
      ? category.definition.trim()
      : "";
  const label = assistantLabel;
  const definition = assistantDefinition;
  const rationale =
    category.rationale &&
    !isSystemGeneratedCategoryDescription(category.rationale)
      ? category.rationale
      : "";

  return {
    available: Boolean(label || definition),
    definition,
    label,
    rationale,
    statusNote: "Assistant suggestion only · researcher confirmation required",
  };
}

export function CategoryBlock({
  categories,
  category,
  onAssignUnit,
  onConfirm,
  onDelete,
  onMerge,
  onReject,
  onRemoveUnit,
  onSplit,
  onUpdate,
  units,
}: {
  categories: CategoryNode[];
  category: CategoryNode;
  onAssignUnit: (unitNumber: number, categoryId: string) => void;
  onConfirm: (categoryId: string) => void;
  onDelete: (category: CategoryNode) => void;
  onMerge: (category: CategoryNode) => void;
  onReject: (category: CategoryNode) => void;
  onRemoveUnit: (categoryId: string, unitNumber: number) => void;
  onSplit: (category: CategoryNode) => void;
  onUpdate: (categoryId: string, updates: Partial<CategoryNode>) => void;
  units: MeaningUnit[];
}) {
  const isFallback = isFallbackCategory(category);
  const includedUnits = units.filter((unit) =>
    category.includedUnitIds.includes(unit.number),
  );
  const isConfirmedCategory = category.status === "confirmed";
  const clusterStatusLabel = isConfirmedCategory
    ? "Provisional category"
    : "Unconfirmed evidence cluster";
  const titleValue = getCategoryTitleInputValue(category);
  const descriptionValue = getCategoryDescriptionValue(category);
  const memoValue = getCategoryMemoValue(category);
  const [similarityNote, setSimilarityNote] = useState("");
  const [differenceNote, setDifferenceNote] = useState("");
  const [clusterDecision, setClusterDecision] = useState("partly");
  const [assistantDraftIgnored, setAssistantDraftIgnored] = useState(false);
  const assistantDraft = getOptionalCategoryDraft(category, includedUnits);
  return (
    <article
      className={`category ${isFallback ? "temporary-draft" : ""}`}
      id={`category-${category.id}`}
    >
      <div className="category-header">
        <div>
          <span className="label">Evidence Cluster</span>
          <h3 className="category-title">
            {isConfirmedCategory && titleValue
              ? titleValue
              : "Accepted meaning units in this cluster"}
          </h3>
        </div>
        <div className="button-row">
          <span className="badge blue">{clusterStatusLabel}</span>
          <span className="badge">
            Units{" "}
            {includedUnits.map((unit) => unit.number).join(", ") || "None"}
          </span>
        </div>
      </div>
      <details className="evidence-panel" open>
        <summary>
          Accepted Meaning Units in this Cluster ({includedUnits.length} MU)
        </summary>
        {includedUnits.length === 0 ? (
          <EmptyState text="No meaning units assigned. Add accepted MUs before developing a provisional category." />
        ) : (
          <div className="evidence-list">
            {includedUnits.map((unit) => (
              <div className="evidence-item" key={unit.id}>
                <div>
                  <div className="evidence-item-header">
                    <strong>MU {unit.number}</strong>
                    <span className="badge blue">{unit.speaker}</span>
                  </div>
                  <p>{unit.excerpt}</p>
                  <p className="small">
                    <strong>Researcher summary:</strong>{" "}
                    {unit.humanSummary || "No researcher summary yet."}
                  </p>
                  <details className="source-reference-details">
                    <summary>Source reference</summary>
                    <p className="small">
                      {unit.caseId} · {unit.segmentId}
                    </p>
                  </details>
                </div>
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() => onRemoveUnit(category.id, unit.number)}
                    type="button"
                  >
                    {isConfirmedCategory
                      ? "Remove from category"
                      : "Remove from cluster"}
                  </button>
                  <select
                    className="select compact"
                    onChange={(event) => {
                      if (event.target.value) {
                        onAssignUnit(unit.number, event.target.value);
                      }
                    }}
                    value=""
                  >
                    <option value="">Move to...</option>
                    {categories
                      .filter((item) => item.id !== category.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {getCategoryDisplayTitle(item)}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
      <section className="comparison-reflection-panel">
        <span className="label">Compare Similarities and Differences</span>
        <label className="label" htmlFor={`${category.id}-similarities`}>
          What appears similar across these meaning units?
        </label>
        <textarea
          className="textarea compact-textarea"
          id={`${category.id}-similarities`}
          onChange={(event) => setSimilarityNote(event.target.value)}
          placeholder="Note repeated meanings, shared concerns, or common ways of describing experience."
          value={similarityNote}
        />
        <label className="label" htmlFor={`${category.id}-differences`}>
          Are there important differences or tensions?
        </label>
        <textarea
          className="textarea compact-textarea"
          id={`${category.id}-differences`}
          onChange={(event) => setDifferenceNote(event.target.value)}
          placeholder="Note contrasts, exceptions, uncertainties, or reasons this grouping may need revision."
          value={differenceNote}
        />
        <label className="label" htmlFor={`${category.id}-decision`}>
          Do these meaning units seem to belong together?
        </label>
        <select
          className="select"
          id={`${category.id}-decision`}
          onChange={(event) => setClusterDecision(event.target.value)}
          value={clusterDecision}
        >
          <option value="yes">Yes, develop as a provisional category</option>
          <option value="partly">Partly / needs revision</option>
          <option value="no">No, split or reassign these meaning units</option>
        </select>
      </section>
      <section className="optional-draft-panel">
        <div className="category-header">
          <div>
            <span className="label">Optional assistant draft</span>
            <p className="small">
              Possible shared meaning · draft label for review · not confirmed
            </p>
          </div>
          <span className="badge blue">Researcher confirmation required</span>
        </div>
        {assistantDraftIgnored ? (
          <EmptyState text="Assistant draft ignored for this cluster. You can still name the category by comparing the accepted meaning units." />
        ) : assistantDraft.available ? (
          <div className="assistant-draft-grid">
            <div>
              <span className="label">Draft category label</span>
              <p className="assistant-draft-text">{assistantDraft.label}</p>
            </div>
            <div>
              <span className="label">Draft shared-meaning definition</span>
              <p className="assistant-draft-text">
                {assistantDraft.definition}
              </p>
            </div>
            <div>
              <span className="label">Why these MUs may belong together</span>
              <p className="small">{assistantDraft.rationale}</p>
            </div>
            <p className="small panel-note">{assistantDraft.statusNote}</p>
            <div className="button-row">
              <button
                className="button"
                disabled={!assistantDraft.label}
                onClick={() =>
                  onUpdate(category.id, { name: assistantDraft.label })
                }
                type="button"
              >
                Use label
              </button>
              <button
                className="button"
                disabled={!assistantDraft.definition}
                onClick={() =>
                  onUpdate(category.id, {
                    definition: assistantDraft.definition,
                  })
                }
                type="button"
              >
                Use definition
              </button>
              <button
                className="button"
                disabled={!assistantDraft.label && !assistantDraft.definition}
                onClick={() =>
                  onUpdate(category.id, {
                    definition: assistantDraft.definition,
                    name: assistantDraft.label,
                  })
                }
                type="button"
              >
                Edit before using
              </button>
              <button
                className="button"
                onClick={() => setAssistantDraftIgnored(true)}
                type="button"
              >
                Ignore suggestion
              </button>
            </div>
          </div>
        ) : (
          <EmptyState text="Assistant draft label unavailable. You can still name this category by comparing the accepted meaning units." />
        )}
      </section>
      <section className="emerging-category-panel">
        <span className="label">Emerging Category</span>
        <label className="label" htmlFor={`${category.id}-name`}>
          Category name
        </label>
        <input
          className="field category-title-input"
          id={`${category.id}-name`}
          onChange={(event) =>
            onUpdate(category.id, { name: event.target.value })
          }
          placeholder="Name this category after reviewing the meaning units"
          value={titleValue}
        />
        <label className="label" htmlFor={`${category.id}-definition`}>
          Category definition / shared meaning
        </label>
        <textarea
          className="textarea compact-textarea"
          id={`${category.id}-definition`}
          onChange={(event) =>
            onUpdate(category.id, { definition: event.target.value })
          }
          placeholder="Describe the shared meaning represented by these meaning units"
          value={descriptionValue}
        />
        <label className="label" htmlFor={`${category.id}-memo`}>
          Researcher memo
        </label>
        <textarea
          className="textarea compact-textarea"
          id={`${category.id}-memo`}
          onChange={(event) =>
            onUpdate(category.id, { memo: event.target.value })
          }
          placeholder="Note naming decisions, alternatives, doubts, or reasons to revisit this category"
          value={memoValue}
        />
      </section>
      <details className="assistant-status-panel">
        <summary>Assistant Generation Status</summary>
        <ul className="assistant-status-list">
          {getCategoryAssistantStatusItems(category).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {category.rationale &&
          (category.status === "ai_draft" || isFallback) && (
            <p className="small">
              Assistant rationale available for review; keep analytic wording in
              the category title, definition, and researcher memo.
            </p>
          )}
      </details>
      <div className="button-row">
        <button
          className="button primary"
          onClick={() => onConfirm(category.id)}
          type="button"
        >
          Confirm as provisional category
        </button>
        <button
          className="button"
          onClick={() => setClusterDecision("partly")}
          type="button"
        >
          Revise grouping
        </button>
        <button
          className="button"
          onClick={() => onMerge(category)}
          type="button"
        >
          Merge with another cluster
        </button>
        <button
          className="button"
          onClick={() => onSplit(category)}
          type="button"
        >
          Split cluster
        </button>
        <button
          className="button"
          onClick={() => onReject(category)}
          type="button"
        >
          Reject grouping
        </button>
        <button
          className="button danger"
          onClick={() => onDelete(category)}
          type="button"
        >
          Delete
        </button>
      </div>
      {category.subcategories && category.subcategories.length > 0 && (
        <div className="subcategories">
          {category.subcategories.map((subcategory) => (
            <div id={`category-${subcategory.id}`} key={subcategory.id}>
              <strong>{subcategory.name}</strong>
              <p className="small">{subcategory.definition}</p>
              <span className="badge blue">
                Units {subcategory.includedUnitIds.join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function UnassignedMeaningUnits({
  categories,
  onAssign,
  onCreateCategory,
  units,
}: {
  categories: CategoryNode[];
  onAssign: (unitNumber: number, categoryId: string) => void;
  onCreateCategory: (unitNumbers?: number[]) => void;
  units: MeaningUnit[];
}) {
  return (
    <div className="mini-card soft">
      <div className="category-header">
        <div>
          <span className="label">Unassigned meaning units</span>
          <p className="small">
            These confirmed MUs are not currently linked to a category. Assign
            them, create a new category, or leave them unassigned with a
            researcher note.
          </p>
        </div>
        <button
          className="button"
          disabled={units.length === 0}
          onClick={() => onCreateCategory(units.map((unit) => unit.number))}
          type="button"
        >
          Make provisional category from all unassigned
        </button>
      </div>
      {units.length === 0 ? (
        <EmptyState text="No unassigned confirmed MUs." />
      ) : (
        <div className="evidence-list">
          {units.map((unit) => (
            <div className="evidence-item" key={unit.id}>
              <div>
                <strong>MU #{unit.number}</strong>{" "}
                <span className="badge blue">{unit.segmentId}</span>
                <p className="small">{unit.humanSummary || unit.aiSummary}</p>
              </div>
              <select
                className="select compact"
                onChange={(event) => {
                  if (event.target.value) {
                    onAssign(unit.number, event.target.value);
                  }
                }}
                value=""
              >
                <option value="">Assign to category...</option>
                {categories
                  .filter((category) => category.status !== "rejected")
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const relationshipTypeOptions: IntegrationRelationshipLabel[] = [
  "supports",
  "contrasts with",
  "contributes to",
  "explains",
  "is part of",
  "leads to",
  "contextualises",
  "unclear relationship",
];

export function toIntegrationRelationshipLabel(
  value: string,
): IntegrationRelationshipLabel {
  if (relationshipTypeOptions.includes(value as IntegrationRelationshipLabel)) {
    return value as IntegrationRelationshipLabel;
  }
  if (value === "develops into") {
    return "leads to";
  }
  if (value === "part of / contains") {
    return "is part of";
  }
  if (value === "overlaps with" || value === "co-occurs with") {
    return "contributes to";
  }
  if (value === "tensions with") {
    return "contrasts with";
  }
  return "unclear relationship";
}

export function parseIntegrationMemoPayload(memo: string) {
  try {
    const parsed = JSON.parse(memo) as {
      evidenceUnitNumbers?: unknown;
      rationale?: unknown;
      researcherNote?: unknown;
    };
    return {
      evidenceUnitNumbers: Array.isArray(parsed.evidenceUnitNumbers)
        ? parsed.evidenceUnitNumbers.filter(
            (item): item is number => typeof item === "number",
          )
        : undefined,
      rationale:
        typeof parsed.rationale === "string" ? parsed.rationale : undefined,
      researcherNote:
        typeof parsed.researcherNote === "string"
          ? parsed.researcherNote
          : undefined,
    };
  } catch {
    return { rationale: memo };
  }
}

export function buildIntegrationRelationshipDrafts({
  categories,
  storedRelationships,
  units,
}: {
  categories: CategoryNode[];
  storedRelationships: StoredIntegrationRelationship[];
  units: MeaningUnit[];
}): IntegrationRelationshipDraft[] {
  const acceptedUnitNumbers = new Set(
    units.filter(isConfirmedMeaningUnit).map((unit) => unit.number),
  );

  return storedRelationships
    .filter(
      (relationship) =>
        categories.some(
          (category) => category.id === relationship.sourceCategoryId,
        ) &&
        categories.some(
          (category) => category.id === relationship.targetCategoryId,
        ),
    )
    .map((relationship) => {
      const payload = parseIntegrationMemoPayload(relationship.memo);
      const source = categories.find(
        (category) => category.id === relationship.sourceCategoryId,
      );
      const target = categories.find(
        (category) => category.id === relationship.targetCategoryId,
      );
      const fallbackEvidence = [
        ...(source?.includedUnitIds ?? []),
        ...(target?.includedUnitIds ?? []),
      ].filter(
        (unitNumber, index, array) =>
          acceptedUnitNumbers.has(unitNumber) &&
          array.indexOf(unitNumber) === index,
      );

      return {
        evidenceUnitNumbers:
          payload.evidenceUnitNumbers ?? fallbackEvidence.slice(0, 6),
        id: relationship.id,
        label: relationship.label,
        rationale:
          payload.rationale ??
          relationship.memo ??
          "Review the category evidence before treating this as an analytic relationship.",
        researcherNote: payload.researcherNote ?? "",
        sourceCategoryId: relationship.sourceCategoryId,
        targetCategoryId: relationship.targetCategoryId,
      };
    });
}

export function encodeIntegrationRelationshipDraft(
  relationship: IntegrationRelationshipDraft,
) {
  return JSON.stringify({
    evidenceUnitNumbers: relationship.evidenceUnitNumbers,
    rationale: relationship.rationale,
    researcherNote: relationship.researcherNote,
  });
}

export function buildRelationshipEvidenceGroups({
  relationship,
  sourceCategory,
  targetCategory,
  units,
}: {
  relationship: IntegrationRelationshipDraft;
  sourceCategory: CategoryNode | undefined;
  targetCategory: CategoryNode | undefined;
  units: MeaningUnit[];
}) {
  const sourceNumbers = new Set(sourceCategory?.includedUnitIds ?? []);
  const targetNumbers = new Set(targetCategory?.includedUnitIds ?? []);
  const assignedNumbers = new Set<number>();
  const sourceUnits = units.filter((unit) => {
    const included = sourceNumbers.has(unit.number);
    if (included) {
      assignedNumbers.add(unit.number);
    }
    return included;
  });
  const targetUnits = units.filter((unit) => {
    const included =
      targetNumbers.has(unit.number) && !assignedNumbers.has(unit.number);
    if (included) {
      assignedNumbers.add(unit.number);
    }
    return included;
  });
  const otherUnits = units.filter(
    (unit) =>
      !assignedNumbers.has(unit.number) ||
      relationship.evidenceUnitNumbers.includes(unit.number),
  );

  return [
    {
      label: `Source category MUs · ${sourceCategory?.name ?? "Source category"}`,
      units: sourceUnits,
    },
    {
      label: `Target category MUs · ${targetCategory?.name ?? "Target category"}`,
      units: targetUnits,
    },
    {
      label: "Other accepted MUs",
      units: otherUnits.filter(
        (unit, index, array) =>
          array.findIndex((item) => item.number === unit.number) === index &&
          !sourceNumbers.has(unit.number) &&
          !targetNumbers.has(unit.number),
      ),
    },
  ];
}

export function buildRelationshipEvidenceOptionText(unit: MeaningUnit) {
  const summary = (unit.humanSummary || unit.aiSummary).trim();
  const excerpt = unit.excerpt.trim();
  const text = summary || excerpt || "No summary or excerpt available.";
  return text.length > 150 ? `${text.slice(0, 147).trim()}...` : text;
}

export function IntegrationRelationshipCard({
  categories,
  onRemove,
  onUpdate,
  relationship,
  units,
}: {
  categories: CategoryNode[];
  onRemove: (relationshipId: string) => void;
  onUpdate: (
    relationshipId: string,
    updates: Partial<IntegrationRelationshipDraft>,
  ) => void;
  relationship: IntegrationRelationshipDraft;
  units: MeaningUnit[];
}) {
  const sourceCategory = categories.find(
    (category) => category.id === relationship.sourceCategoryId,
  );
  const targetCategory = categories.find(
    (category) => category.id === relationship.targetCategoryId,
  );
  const evidenceUnits = units.filter((unit) =>
    relationship.evidenceUnitNumbers.includes(unit.number),
  );
  const evidenceGroups = buildRelationshipEvidenceGroups({
    relationship,
    sourceCategory,
    targetCategory,
    units,
  });
  const selectedEvidenceNumbers = new Set(relationship.evidenceUnitNumbers);
  const updateEvidenceSelection = (unitNumber: number, selected: boolean) => {
    const nextEvidenceNumbers = selected
      ? Array.from(new Set([...relationship.evidenceUnitNumbers, unitNumber]))
      : relationship.evidenceUnitNumbers.filter(
          (number) => number !== unitNumber,
        );
    onUpdate(relationship.id, {
      evidenceUnitNumbers: nextEvidenceNumbers.sort(
        (left, right) => left - right,
      ),
    });
  };

  return (
    <article className="relationship-card">
      <div className="category-header">
        <div>
          <span className="label">Editable relationship</span>
          <h3>
            {sourceCategory?.name ?? "Select source"} {"->"}{" "}
            {targetCategory?.name ?? "Select target"}
          </h3>
        </div>
        <StatusBadge label="Researcher review needed" />
      </div>
      <div className="relationship-card-grid">
        <label className="label">
          Source category
          <select
            className="select"
            onChange={(event) =>
              onUpdate(relationship.id, {
                sourceCategoryId: event.target.value,
              })
            }
            value={relationship.sourceCategoryId}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Relationship type
          <select
            className="select"
            onChange={(event) =>
              onUpdate(relationship.id, {
                label: event.target.value as IntegrationRelationshipLabel,
              })
            }
            value={relationship.label}
          >
            {relationshipTypeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Target category
          <select
            className="select"
            onChange={(event) =>
              onUpdate(relationship.id, {
                targetCategoryId: event.target.value,
              })
            }
            value={relationship.targetCategoryId}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="label">
        Relationship rationale
        <textarea
          className="textarea compact-textarea"
          onChange={(event) =>
            onUpdate(relationship.id, { rationale: event.target.value })
          }
          value={relationship.rationale}
        />
      </label>
      <section className="relationship-evidence-selector">
        <div className="category-header">
          <div>
            <span className="label">Evidence grounding</span>
            <p className="small">
              Choose the accepted meaning units that support, complicate, or
              qualify this relationship.
            </p>
          </div>
          {evidenceUnits.length === 0 ? (
            <span className="badge warning">
              This relationship has no evidence grounding yet
            </span>
          ) : (
            <span className="badge blue">
              {evidenceUnits.length} selected MU
              {evidenceUnits.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="selected-evidence-list">
          <span className="label">Selected meaning-unit evidence</span>
          {evidenceUnits.length === 0 ? (
            <p className="small">No linked MU evidence yet.</p>
          ) : (
            <div className="evidence-chip-list">
              {evidenceUnits.map((unit) => (
                <button
                  className="evidence-chip"
                  key={unit.id}
                  onClick={() => updateEvidenceSelection(unit.number, false)}
                  title="Remove evidence"
                  type="button"
                >
                  MU {unit.number}
                  <span>Remove evidence</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <details className="relationship-evidence-picker" open>
          <summary>Select meaning-unit evidence for this relationship</summary>
          {evidenceGroups.map((group) => (
            <div className="relationship-evidence-group" key={group.label}>
              <span className="label">{group.label}</span>
              {group.units.length === 0 ? (
                <p className="small">No accepted MUs in this group.</p>
              ) : (
                group.units.map((unit) => (
                  <label className="relationship-evidence-option" key={unit.id}>
                    <input
                      checked={selectedEvidenceNumbers.has(unit.number)}
                      onChange={(event) =>
                        updateEvidenceSelection(
                          unit.number,
                          event.target.checked,
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      <strong>
                        MU {unit.number} · {unit.speaker || "Speaker unknown"}
                      </strong>
                      <small>{buildRelationshipEvidenceOptionText(unit)}</small>
                    </span>
                  </label>
                ))
              )}
            </div>
          ))}
        </details>
      </section>
      <label className="label">
        Researcher note
        <textarea
          className="textarea compact-textarea"
          onChange={(event) =>
            onUpdate(relationship.id, { researcherNote: event.target.value })
          }
          placeholder="Revise, qualify, or reject this relationship after checking the evidence."
          value={relationship.researcherNote}
        />
      </label>
      <button
        className="button danger"
        onClick={() => onRemove(relationship.id)}
        type="button"
      >
        Remove relationship
      </button>
    </article>
  );
}

export function RelationshipFlowRow({
  categories,
  relationship,
  units,
}: {
  categories: CategoryNode[];
  relationship: IntegrationRelationshipDraft;
  units: MeaningUnit[];
}) {
  const sourceCategory = categories.find(
    (category) => category.id === relationship.sourceCategoryId,
  );
  const targetCategory = categories.find(
    (category) => category.id === relationship.targetCategoryId,
  );
  const evidenceUnits = units.filter((unit) =>
    relationship.evidenceUnitNumbers.includes(unit.number),
  );

  return (
    <div className="relationship-flow-row">
      <div className="relationship-map-node">
        <span className="label">Category node</span>
        <strong>{sourceCategory?.name ?? "Source category"}</strong>
      </div>
      <div className="relationship-map-link">
        <span className="relationship-flow-type">
          Possible relationship · {relationship.label}
        </span>
        <span className="relationship-arrow-inline">--&gt;</span>
      </div>
      <div className="relationship-map-node">
        <span className="label">Category node</span>
        <strong>{targetCategory?.name ?? "Target category"}</strong>
      </div>
      <p className="small">
        <strong>Draft rationale:</strong> {relationship.rationale}
      </p>
      <details className="relationship-evidence-details">
        <summary>
          Review MU evidence (
          {evidenceUnits.length || relationship.evidenceUnitNumbers.length})
        </summary>
        <div className="evidence-strip">
          {evidenceUnits.length === 0 ? (
            <span className="badge warning">No linked MU evidence yet</span>
          ) : (
            evidenceUnits.map((unit) => (
              <span
                className="badge blue"
                key={unit.id}
                title={unit.humanSummary || unit.aiSummary}
              >
                MU {unit.number}
              </span>
            ))
          )}
        </div>
        <p className="small">
          Evidence is secondary here. Use it to check whether the draft
          relationship is grounded before confirming or revising it.
        </p>
      </details>
    </div>
  );
}

export function IntegrationDraftPanel({
  categories,
  integrationNote,
  integrationReviewed,
  narrative,
  onChangeNarrative,
  onConfirm,
  onNoteChange,
  units,
}: {
  categories: CategoryNode[];
  integrationNote: string;
  integrationReviewed: boolean;
  narrative: string;
  onChangeNarrative: (value: string) => void;
  onConfirm: () => void;
  onNoteChange: (value: string) => void;
  units: MeaningUnit[];
}) {
  const linkedUnits = units.filter((unit) =>
    categories.some((category) =>
      category.includedUnitIds.includes(unit.number),
    ),
  );
  return (
    <div className="mini-card soft">
      <div className="category-header">
        <div>
          <span className="label">
            Provisional summary of the category structure
          </span>
          <h3>Editable summary narrative</h3>
          <p className="small">
            This narrative should explain the relationships among categories.
            Treat it as a provisional summary of the category structure, not as
            the main analytic product.
          </p>
        </div>
        <StatusBadge
          label={
            integrationReviewed ? "Confirmed by researcher" : "Needs review"
          }
        />
      </div>
      <textarea
        className="textarea integration-textarea"
        id="integrated-narrative"
        onChange={(event) => onChangeNarrative(event.target.value)}
        placeholder="Write or generate a cautious integration draft. Example: In this transcript, the participant described..."
        value={narrative}
      />
      <label className="label" htmlFor="integration-note">
        Researcher note
      </label>
      <textarea
        className="textarea compact-textarea"
        id="integration-note"
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Add decisions, cautions, or methodological integrity notes."
        value={integrationNote}
      />
      <details className="evidence-panel">
        <summary>View linked category and MU evidence</summary>
        <div className="evidence-list">
          {categories.map((category) => (
            <div className="evidence-item" key={category.id}>
              <div>
                <strong>{category.name}</strong>
                <p className="small">{category.definition}</p>
                <p className="small">
                  Linked MUs: {category.includedUnitIds.join(", ") || "None"}
                </p>
              </div>
            </div>
          ))}
          <p className="small">
            Evidence coverage: {linkedUnits.length} linked MU
            {linkedUnits.length === 1 ? "" : "s"}.
          </p>
        </div>
      </details>
      <div className="mini-card warning-card">
        <strong>Integration caution</strong>
        <p className="small">
          This draft is based on one transcript workspace. Avoid claims such as
          "mindfulness improves all students" or causal/clinical statements.
          Prefer wording like "in this account, the participant described...".
        </p>
      </div>
      <button className="button primary" onClick={onConfirm} type="button">
        I reviewed evidence and confirm this provisional draft
      </button>
    </div>
  );
}

export function buildIntegrationMapGroups(
  categories: CategoryNode[],
): IntegrationMapGroup[] {
  const groupDefinitions = [
    {
      key: "context",
      label: "Context / starting point",
      description:
        "Categories that describe the situation, condition, or concern that frames the account.",
    },
    {
      key: "process",
      label: "Experience / process",
      description:
        "Categories that describe what the participant noticed, did, felt, or made sense of.",
    },
    {
      key: "support",
      label: "Supportive condition",
      description:
        "Categories that appear to support, enable, or shape the experience described.",
    },
    {
      key: "boundary",
      label: "Boundary / tension",
      description:
        "Categories that qualify the account, introduce limits, or show tension in the interpretation.",
    },
    {
      key: "implication",
      label: "Practical implication",
      description:
        "Categories that point toward cautious practical considerations within this transcript.",
    },
  ];

  return groupDefinitions
    .map((group) => ({
      categories: categories.filter(
        (category) => classifyIntegrationCategory(category) === group.key,
      ),
      description: group.description,
      label: group.label,
    }))
    .filter((group) => group.categories.length > 0);
}

export function classifyIntegrationCategory(category: CategoryNode) {
  const text = `${category.name} ${category.definition}`.toLowerCase();
  if (
    /\b(context|background|before|stress|pressure|symptom|anxiety|uncertainty|starting|initial)\b/.test(
      text,
    )
  ) {
    return "context";
  }
  if (
    /\b(peer|group|support|shared|relationship|recognised|recognized|belong|wechat|community)\b/.test(
      text,
    )
  ) {
    return "support";
  }
  if (
    /\b(limit|barrier|privacy|discomfort|difficulty|challenge|tension|concern|risk|hesitat)\b/.test(
      text,
    )
  ) {
    return "boundary";
  }
  if (
    /\b(implication|suggest|recommend|design|programme|program|practice|flexible|future|should)\b/.test(
      text,
    )
  ) {
    return "implication";
  }
  return "process";
}

export function buildIntegrationStructureDraft({
  categories,
  researchQuestion,
  units,
}: {
  categories: CategoryNode[];
  researchQuestion: string;
  units: MeaningUnit[];
}) {
  const acceptedUnitNumbers = new Set(units.map((unit) => unit.number));
  const mapGroups = buildIntegrationMapGroups(categories);
  const representativeByGroup = new Map(
    mapGroups.map((group) => [group.label, group.categories[0]]),
  );
  const relationships: IntegrationRelationshipDraft[] = [];

  const addRelationship = (
    source: CategoryNode | undefined,
    target: CategoryNode | undefined,
    type: string,
    rationale: string,
  ) => {
    if (!source || !target || source.id === target.id) {
      return;
    }
    if (
      relationships.some(
        (relationship) =>
          relationship.sourceCategoryId === source.id &&
          relationship.targetCategoryId === target.id &&
          relationship.label === toIntegrationRelationshipLabel(type),
      )
    ) {
      return;
    }
    const evidenceUnitNumbers = [
      ...source.includedUnitIds,
      ...target.includedUnitIds,
    ].filter(
      (unitNumber, index, array) =>
        acceptedUnitNumbers.has(unitNumber) &&
        array.indexOf(unitNumber) === index,
    );
    relationships.push({
      evidenceUnitNumbers: evidenceUnitNumbers.slice(0, 6),
      id: `rel-${relationships.length + 1}-${source.id}-${target.id}`,
      rationale,
      researcherNote: "",
      sourceCategoryId: source.id,
      targetCategoryId: target.id,
      label: toIntegrationRelationshipLabel(type),
    });
  };

  const contextCategory = representativeByGroup.get("Context / starting point");
  const processCategory = representativeByGroup.get("Experience / process");
  const supportCategory = representativeByGroup.get("Supportive condition");
  const boundaryCategory = representativeByGroup.get("Boundary / tension");
  const implicationCategory = representativeByGroup.get(
    "Practical implication",
  );

  addRelationship(
    contextCategory,
    processCategory,
    "contextualises",
    buildRelationshipRationale(contextCategory, processCategory, "may frame"),
  );
  addRelationship(
    supportCategory,
    processCategory,
    "supports",
    buildRelationshipRationale(supportCategory, processCategory, "may support"),
  );
  addRelationship(
    boundaryCategory,
    processCategory ?? supportCategory,
    "tensions with",
    buildRelationshipRationale(
      boundaryCategory,
      processCategory ?? supportCategory,
      "may qualify",
    ),
  );
  addRelationship(
    processCategory,
    implicationCategory,
    "develops into",
    buildRelationshipRationale(
      processCategory,
      implicationCategory,
      "may inform",
    ),
  );

  if (relationships.length === 0) {
    categories.slice(0, 4).forEach((category, index, array) => {
      const nextCategory = array[index + 1];
      addRelationship(
        category,
        nextCategory,
        "co-occurs with",
        buildRelationshipRationale(
          category,
          nextCategory,
          "may be read alongside",
        ),
      );
    });
  }

  const categoryNames = categories.map((category) => category.name);
  const narrative = [
    `In relation to the research question${
      researchQuestion.trim() ? ` ("${researchQuestion.trim()}")` : ""
    }, the reviewed categories can be read as a provisional structure rather than final findings.`,
    categoryNames.length > 0
      ? `The current structure connects ${categoryNames
          .slice(0, 4)
          .join(
            ", ",
          )}${categoryNames.length > 4 ? ", and related categories" : ""}.`
      : "",
    relationships.length > 0
      ? `The suggested links point to possible relationships among categories, grounded in accepted meaning units. These links should be checked against the source excerpts before being treated as analytic claims.`
      : `No relationship has been confirmed yet. Add or revise links after reviewing the category evidence.`,
    `Because this is a single-transcript prototype, the narrative should remain cautious: describe what appears in this account and avoid causal or generalisable claims.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    explanation:
      "This temporary draft organises reviewed categories into a cautious relationship structure. It is generated from accepted MUs and editable category assignments, not from unreviewed transcript text.",
    narrative,
    relationships,
    title:
      relationships.length > 0
        ? "Provisional relationship structure from reviewed categories"
        : "Researcher-created relationship structure needed",
  };
}

export function buildRelationshipRationale(
  source: CategoryNode | undefined,
  target: CategoryNode | undefined,
  verb: string,
) {
  if (!source || !target) {
    return "Review the category evidence before treating this as an analytic relationship.";
  }
  const evidenceIds = [...source.includedUnitIds, ...target.includedUnitIds]
    .filter((unitNumber, index, array) => array.indexOf(unitNumber) === index)
    .slice(0, 4);
  return `"${source.name}" ${verb} "${target.name}" in this transcript. Check MU ${
    evidenceIds.join(", ") || "evidence"
  } before confirming or revising this link.`;
}
