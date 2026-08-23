"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  Check,
  ChevronRight,
  Download,
  FileAudio,
  FileText,
  FolderKanban,
  GitBranch,
  Layers3,
  Pencil,
  Play,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  AudioFileRecord,
  AuditActionType,
  AuditEvent,
  CategoryMode,
  CategoryNode,
  DatasetType,
  ExportRecord,
  GuidanceMemo,
  IntegrationRelationship as StoredIntegrationRelationship,
  IntegrityReviewItem,
  IntegrityReviewItemStatus,
  IntegrationRelationshipLabel,
  MeaningUnit,
  Project,
  ProjectDataSource,
  PreAnalysisNotes,
  ReviewerComment,
  ReviewerWorkspace,
  SegmentSpeakerRole,
  SegmentStatus,
  TranscriptionJobRecord,
  TranscriptRecord,
  TranscriptSegment,
  WorkflowStep,
} from "@/lib/types";
import type { WorkspaceData } from "@/lib/gdiqr-repository";
import type { RunLog } from "@/lib/run-logs";
import {
  autoSplitTranscript,
  type AutoSegmentMode,
} from "@/lib/auto-segmenter";
import type { StorageMode } from "@/lib/storage-mode";
import {
  cleanTranscriptSourceForAnalysis,
  containsNonTranscriptMaterial,
} from "@/lib/transcript-source-cleaner";
import {
  WorkflowErrorPanel,
  buildMethodologicalGuidanceAnswer,
  getStepShortLabel,
  TranscriptReviewHistory,
  getRecommendedActiveStep,
  StatusBadge,
  getSegmentDisplayStatus,
  formatSegmentMeaningUnitCounts,
  StepGuidance,
  GdiqrTips,
  GuidanceCard,
  MethodologicalIntegrityGuide,
  buildIntegrityReviewItemsFromState,
  mergeIntegrityReviewItems,
  formatIntegrityStatus,
  categoryTitleNeedsIntegrityReview,
  MethodologicalIntegrityChecklist,
  AuditTrailPanel,
  StatusLine,
  ContextPreview,
  ContextItem,
  isTranscriptConfirmed,
  normaliseResearcherFacingText,
  buildLocalTranscriptSegment,
  renumberLocalSegments,
  canRunMeaningUnitsForSegment,
  isConfirmedMeaningUnit,
  normalizeMeaningUnitNumbersForSegments,
  getMeaningUnitValidationFlags,
  buildMeaningUnitIntegrityIssues,
  normalizeForOverlapCheck,
  buildMeaningUnitIssueContextById,
  truncateForReviewSnippet,
  summaryPossiblyGoesBeyondExcerpt,
  summaryIsTooCloseToExcerpt,
  meaningUnitEndsMidSentence,
  summaryIsTooGeneric,
  normalizeForSummarySimilarity,
  approximateWordCount,
  getSegmentSplitIndex,
  extractPrivacyReviewMarkers,
  hasUnresolvedPrivacyMarkers,
  countUnresolvedPrivacyMarkers,
  buildSensitiveReviewItems,
  safePlaceholderCategoryName,
  prepareTranscriptForStorage,
  serialiseSensitiveItemsForStorage,
  sensitiveItemKey,
  findMatchingPrivacyFinding,
  normaliseSensitiveCategory,
  sensitiveCategoryMetadata,
  isFallbackCategory,
  markCategoriesResearcherConfirmed,
  markCategoriesEditableDraft,
  formatCategoryStatus,
  hasSensitivePlaceholder,
  getCategoryRunDisabledReason,
  getCategoryRunLabel,
  getStepCopy,
  getStepGuidance,
  getGdiqrTips,
  EmptyState,
  RunLogPanel,
  formatMs,
  formatRunStatus,
  guidanceMemoToMessage,
  getMeaningUnitRequestTimeoutMs,
  getTranscriptPrepareRequestTimeoutMs,
  getClientConfiguredTimeoutMs,
  confirmWorkspaceAction,
  promptWorkspaceText,
  slugifyFilename,
  downloadBlob,
  openPrintableAnalysisRecord,
  buildDocxBlobFromText,
  buildWordDocumentXml,
  buildWordParagraphXml,
  createZipArchive,
  concatUint8Arrays,
  crc32,
  escapeXml,
  escapeHtml,
  downloadFile,
  buildMeaningUnitCsv,
  csvEscape,
  SensitiveReviewCard,
  SensitiveTranscriptPreview,
  riskClass,
  formatBytes,
  fetchWithTimeout,
  ModeButton,
  ReviewerPanel,
  MeaningUnitReviewCard,
  reviewSummaryText,
  reviewerIssueTitle,
  groupReviewerIssues,
  reviewerGroupLabel,
  getCategoryDisplayTitle,
  getCategoryTitleInputValue,
  getCategoryDescriptionValue,
  getCategoryMemoValue,
  getCategoryAssistantStatusItems,
  isAutomaticCategoryTitle,
  isSystemGeneratedCategoryDescription,
  getOptionalCategoryDraft,
  CategoryBlock,
  UnassignedMeaningUnits,
  toIntegrationRelationshipLabel,
  parseIntegrationMemoPayload,
  buildIntegrationRelationshipDrafts,
  encodeIntegrationRelationshipDraft,
  buildRelationshipEvidenceGroups,
  buildRelationshipEvidenceOptionText,
  IntegrationRelationshipCard,
  RelationshipFlowRow,
  IntegrationDraftPanel,
  buildIntegrationMapGroups,
  classifyIntegrationCategory,
  buildIntegrationStructureDraft,
  buildRelationshipRationale
} from "./gdiqr-workspace-support";
import { ProjectBar } from "./gdiqr-workspace/project/project-bar";
import { WorkflowNavigation } from "./gdiqr-workspace/workflow/workflow-navigation";
import { LongTaskStatus } from "./gdiqr-workspace/shared/long-task-status";
import { VoiceGuideAvatar, type VoiceGuidanceNoteDraft } from "./gdiqr-workspace/voice-guide/voice-guide-avatar";
import { formatDateTime, formatTime } from "@/lib/date-format";
import { isOpeningBackgroundCandidate } from "@/lib/meaning-unit-review-flags";

const PRODUCT_TITLE =
  "GDI-QR-informed AI-Assisted Qualitative Analysis Prototype";
const PRODUCT_SHORT_TITLE = "GDI-QR x AI Prototype";
const METHODOLOGICAL_FRAME = "GDI-QR-informed";

type AnalysisExportFormat = "json" | "csv" | "txt" | "docx" | "pdf";

type SensitiveRiskLevel = "low" | "medium" | "high";
type SensitiveReviewStatus = "pending" | "confirmed" | "ignored" | "edited";

interface SensitiveReviewItem {
  id: string;
  placeholder: string;
  category: string;
  // Client-only raw marker/span used for locating text. Strip before storage.
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
  source?: "legacy-guidance" | "voice-guide";
  step: WorkflowStep;
}

const steps: Array<{
  id: WorkflowStep;
  label: string;
  icon: typeof FolderKanban;
}> = [
  { id: "pre-analysis", label: "Pre-analysis", icon: Settings2 },
  { id: "understanding", label: "Understanding & Translating", icon: Layers3 },
  { id: "categorizing", label: "Categorizing", icon: FolderKanban },
  { id: "integrating", label: "Integrating", icon: GitBranch },
  { id: "integrity", label: "Methodological Integrity", icon: ShieldCheck },
  { id: "export", label: "Export", icon: Download },
];

interface GdiqrWorkspaceProps {
  aiProvider?: string;
  project: Project;
  projectList?: Project[];
  transcript: string;
  segments: TranscriptSegment[];
  audioFiles: AudioFileRecord[];
  transcriptionJobs: TranscriptionJobRecord[];
  transcriptRecords?: TranscriptRecord[];
  preAnalysisNotes?: PreAnalysisNotes;
  meaningUnits: MeaningUnit[];
  categories: CategoryNode[];
  reviewerComments: ReviewerComment[];
  auditEvents: AuditEvent[];
  integratedNarrative: string;
  integrationRelationships?: StoredIntegrationRelationship[];
  integrationMemo?: string;
  integrityReviewItems?: IntegrityReviewItem[];
  exportRecords?: ExportRecord[];
  guidanceMemos?: GuidanceMemo[];
  dataSource?: WorkspaceData["dataSource"];
  storageMode?: StorageMode;
  supabaseConfigured?: boolean;
}

export function GdiqrWorkspace({
  aiProvider = "ollama",
  project,
  projectList = [project],
  transcript,
  segments,
  audioFiles,
  transcriptionJobs,
  transcriptRecords = [],
  preAnalysisNotes,
  meaningUnits,
  categories,
  reviewerComments,
  auditEvents,
  integratedNarrative,
  integrationRelationships: storedIntegrationRelationships = [],
  integrationMemo = "",
  integrityReviewItems = [],
  exportRecords = [],
  guidanceMemos = [],
  dataSource = "unconfigured",
  storageMode = "local",
  supabaseConfigured = false,
}: GdiqrWorkspaceProps) {
  const isLocalOnlyMode = storageMode === "local";
  const [activeStep, setActiveStep] = useState<WorkflowStep>(() =>
    getRecommendedActiveStep({
      categories,
      integratedNarrative,
      meaningUnits,
      project,
    }),
  );
  const [currentProject, setCurrentProject] = useState(project);
  const [availableProjects, setAvailableProjects] = useState(projectList);
  const [projectTitle, setProjectTitle] = useState(project.title);
  const [datasetType, setDatasetType] = useState<DatasetType>(
    project.datasetType,
  );
  const [projectDataSource, setProjectDataSource] = useState<ProjectDataSource>(
    project.dataSource,
  );
  const [dataSuitabilityConfirmed, setDataSuitabilityConfirmed] = useState(
    project.dataSuitabilityConfirmed,
  );
  const [projectResearcherNotes, setProjectResearcherNotes] = useState(
    project.researcherNotes,
  );
  const [createProjectExpanded, setCreateProjectExpanded] = useState(
    !project.dataSuitabilityConfirmed && !isLocalOnlyMode,
  );
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newResearchQuestion, setNewResearchQuestion] = useState("");
  const [newStudyDescription, setNewStudyDescription] = useState("");
  const [newDatasetType, setNewDatasetType] = useState<DatasetType>("open");
  const [newDataSource, setNewDataSource] =
    useState<ProjectDataSource>("SMARTEN");
  const [newResearcherNotes, setNewResearcherNotes] = useState("");
  const [newDataSuitabilityConfirmed, setNewDataSuitabilityConfirmed] =
    useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [researchQuestion, setResearchQuestion] = useState(
    preAnalysisNotes?.researchQuestion || project.researchQuestion,
  );
  const [studyDescription, setStudyDescription] = useState(
    normaliseResearcherFacingText(
      preAnalysisNotes?.studyDescription || project.studyDescription,
    ),
  );
  const [researcherExpectations, setResearcherExpectations] = useState(
    preAnalysisNotes?.initialSensitisingConcepts ?? "",
  );
  const [researcherNotes, setResearcherNotes] = useState(
    preAnalysisNotes?.contextualNotes ?? "",
  );
  const [researcherReflexivityNotes, setResearcherReflexivityNotes] = useState(
    preAnalysisNotes?.researcherPosition ?? "",
  );
  const [dataFamiliarisationNotes, setDataFamiliarisationNotes] = useState(
    preAnalysisNotes?.dataFamiliarisationNotes ?? "",
  );
  const [preAnalysisSavedAt, setPreAnalysisSavedAt] = useState(
    preAnalysisNotes?.updatedAt ?? "",
  );
  const [isSavingPreAnalysis, setIsSavingPreAnalysis] = useState(false);
  const [relevanceGuideline, setRelevanceGuideline] = useState("");
  const [theoreticalFramework, setTheoreticalFramework] = useState("");
  const [projectLanguage, setProjectLanguage] = useState<Project["language"]>(
    project.language,
  );
  const [mode, setMode] = useState<CategoryMode>("A");
  const [lightInterpretation, setLightInterpretation] = useState(
    project.lightInterpretation,
  );
  const [projectSetupSavedAt, setProjectSetupSavedAt] = useState("");
  const [editableTranscript, setEditableTranscript] = useState(transcript);
  const [transcriptConfirmed, setTranscriptConfirmed] = useState(
    isTranscriptConfirmed(project),
  );
  const [aiPrivacyFindings, setAiPrivacyFindings] = useState<string[]>(
    extractPrivacyReviewMarkers(transcript),
  );
  const [sensitiveReviewItems, setSensitiveReviewItems] = useState<
    SensitiveReviewItem[]
  >(() =>
    buildSensitiveReviewItems(
      transcript,
      extractPrivacyReviewMarkers(transcript),
    ),
  );
  const [privacyReviewExpanded, setPrivacyReviewExpanded] = useState(true);
  const [activeSensitiveItemId, setActiveSensitiveItemId] = useState("");
  const [privacyOverrideAccepted, setPrivacyOverrideAccepted] = useState(false);
  const [transcriptStorageStatus, setTranscriptStorageStatus] = useState(
    transcript.trim()
      ? "Anonymised version saved"
      : "Not saved yet — local draft only",
  );
  const [displaySegments, setDisplaySegments] = useState(segments);
  const [displayAudioFiles, setDisplayAudioFiles] = useState(audioFiles);
  const [displayTranscriptionJobs, setDisplayTranscriptionJobs] =
    useState(transcriptionJobs);
  const [displayTranscriptRecords, setDisplayTranscriptRecords] =
    useState(transcriptRecords);
  const [units, setUnits] = useState(meaningUnits);
  const [displayCategories, setDisplayCategories] = useState(categories);
  const [reviewerOutputs, setReviewerOutputs] = useState(reviewerComments);
  const [displayAuditEvents, setDisplayAuditEvents] = useState(auditEvents);
  const [displayExportRecords, setDisplayExportRecords] =
    useState(exportRecords);
  const [narrative, setNarrative] = useState(integratedNarrative);
  const [integrationReviewed, setIntegrationReviewed] = useState(false);
  const [integrationNote, setIntegrationNote] = useState(integrationMemo);
  const [integrationRelationships, setIntegrationRelationships] = useState<
    IntegrationRelationshipDraft[]
  >(() =>
    buildIntegrationRelationshipDrafts({
      categories,
      storedRelationships: storedIntegrationRelationships,
      units: meaningUnits,
    }),
  );
  const [integrationSavedAt, setIntegrationSavedAt] = useState("");
  const [isSavingIntegration, setIsSavingIntegration] = useState(false);
  const [displayIntegrityItems, setDisplayIntegrityItems] =
    useState<IntegrityReviewItem[]>(integrityReviewItems);
  const [integritySavedAt, setIntegritySavedAt] = useState("");
  const [isSavingIntegrityReview, setIsSavingIntegrityReview] = useState(false);
  const [integrationStructureExplanation, setIntegrationStructureExplanation] =
    useState("");
  const [integrationStructureNotice, setIntegrationStructureNotice] =
    useState("");
  const [integrationStructureTitle, setIntegrationStructureTitle] =
    useState("");
  const [categoryDraftNotice, setCategoryDraftNotice] = useState("");
  const [categoryDraftIsFallback, setCategoryDraftIsFallback] = useState(false);
  const [allSegmentsProcessedForModeC, setAllSegmentsProcessedForModeC] =
    useState(false);
  const [apiDataSource, setApiDataSource] = useState(dataSource);
  const [apiStatus, setApiStatus] = useState(
    storageMode === "local"
      ? "Local-only mode ready. Import or paste a transcript to begin."
      : supabaseConfigured
        ? "Workspace ready. Start by uploading audio or importing a transcript."
        : "Supabase is not connected yet. Add your Supabase settings before testing with real data.",
  );
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [uploadLanguage, setUploadLanguage] = useState<Project["language"]>(
    project.language,
  );
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isAutoSplittingTranscript, setIsAutoSplittingTranscript] =
    useState(false);
  const [isSpeakerSplittingTranscript, setIsSpeakerSplittingTranscript] =
    useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isGeneratingMeaningUnits, setIsGeneratingMeaningUnits] =
    useState(false);
  const [isAcceptingMeaningUnits, setIsAcceptingMeaningUnits] = useState(false);
  const [isSavingMeaningUnitAction, setIsSavingMeaningUnitAction] =
    useState(false);
  const [meaningUnitGenerationScope, setMeaningUnitGenerationScope] = useState<
    "all" | "selected"
  >("selected");
  const [meaningUnitSegmentId, setMeaningUnitSegmentId] = useState(
    segments[0]?.id ?? "",
  );
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    label?: string;
    total: number;
  } | null>(null);
  const [meaningUnitGenerationStage, setMeaningUnitGenerationStage] =
    useState("");
  const [meaningUnitGenerationMethod, setMeaningUnitGenerationMethod] =
    useState<"ai_semantic" | "mixed" | "rule_based_fallback" | "">("");
  const [isRunningCategories, setIsRunningCategories] = useState(false);
  const [categoryGenerationStage, setCategoryGenerationStage] = useState("");
  const [isRunningReviewer, setIsRunningReviewer] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [transcriptImportText, setTranscriptImportText] = useState("");
  const [transcriptImportName, setTranscriptImportName] = useState(
    "Imported transcript",
  );
  const [isImportingTranscript, setIsImportingTranscript] = useState(false);
  const [transcriptPreparationStage, setTranscriptPreparationStage] =
    useState("");
  const [isConfirmingTranscript, setIsConfirmingTranscript] = useState(false);
  const [activeMeaningUnitRunId, setActiveMeaningUnitRunId] = useState("");
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [isExportingFormat, setIsExportingFormat] =
    useState<AnalysisExportFormat | null>(null);
  const [exportStage, setExportStage] = useState("");
  const [workflowError, setWorkflowError] = useState("");
  const retryActionRef = useRef<(() => void) | null>(null);
  const [guidanceQuestion, setGuidanceQuestion] = useState("");
  const [guidanceMessages, setGuidanceMessages] = useState<GuidanceMessage[]>(
    () => guidanceMemos.map(guidanceMemoToMessage),
  );
  const [isGuidanceLoading, setIsGuidanceLoading] = useState(false);
  const [savedGuidanceMemos, setSavedGuidanceMemos] = useState<
    GuidanceMessage[]
  >(() => guidanceMemos.map(guidanceMemoToMessage));
  const [muReviewOpen, setMuReviewOpen] = useState(true);
  const [muIntegrityReviewRan, setMuIntegrityReviewRan] = useState(false);
  const [categoryReviewOpen, setCategoryReviewOpen] = useState(true);
  const [expandedReviewIssueIds, setExpandedReviewIssueIds] = useState<
    string[]
  >([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState(
    segments[0]?.id ?? "",
  );
  const [segmentDraftTitle, setSegmentDraftTitle] = useState(
    segments[0]?.topicLabel ?? "",
  );
  const [segmentDraftText, setSegmentDraftText] = useState(
    segments[0]?.text ?? "",
  );
  const [segmentDraftRole, setSegmentDraftRole] = useState<SegmentSpeakerRole>(
    segments[0]?.speakerRole ?? "unclear",
  );
  const [isSavingSegment, setIsSavingSegment] = useState(false);
  const [segmentSplitMode, setSegmentSplitMode] =
    useState<AutoSegmentMode>("balanced");
  const transcriptTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const segmentTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const meaningUnitAbortControllerRef = useRef<AbortController | null>(null);

  function setRecoverableWorkflowError(message: string, retry?: () => void) {
    retryActionRef.current = retry ?? null;
    setWorkflowError(message);
    setApiStatus(message);
  }

  function clearWorkflowError() {
    retryActionRef.current = null;
    setWorkflowError("");
  }

  async function loadRunLogs() {
    try {
      const response = await fetch("/api/run-logs", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const result = (await response.json().catch(() => ({}))) as {
        logs?: RunLog[];
      };
      setRunLogs(result.logs ?? []);
    } catch {
      // Ignore transient polling failures during dev-server reloads or navigation.
    }
  }

  async function clearFinishedRunLogs() {
    try {
      const response = await fetch("/api/run-logs", {
        method: "DELETE",
      });
      const result = (await response.json().catch(() => ({}))) as {
        logs?: RunLog[];
      };
      if (response.ok) {
        setRunLogs(result.logs ?? []);
      }
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Could not clear run logs.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadIfActive() {
      if (!cancelled) {
        await loadRunLogs();
      }
    }

    void loadIfActive();
    const interval = window.setInterval(loadIfActive, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!activeMeaningUnitRunId) {
      return;
    }

    const activeLog = runLogs.find((log) => log.id === activeMeaningUnitRunId);
    if (!activeLog) {
      return;
    }

    if (activeLog.status === "completed") {
      setIsGeneratingMeaningUnits(false);
      setActiveMeaningUnitRunId("");
      setApiStatus(
        "Meaning-unit job completed; refreshing Supabase workspace...",
      );
      void refreshWorkspace();
      return;
    }

    if (activeLog.status === "failed") {
      setIsGeneratingMeaningUnits(false);
      setActiveMeaningUnitRunId("");
      setApiStatus(activeLog.error ?? "Meaning-unit job failed");
    }
  }, [activeMeaningUnitRunId, runLogs]);

  useEffect(() => {
    setSensitiveReviewItems((current) =>
      buildSensitiveReviewItems(editableTranscript, aiPrivacyFindings, current),
    );
  }, [aiPrivacyFindings, editableTranscript]);

  useEffect(() => {
    if (displaySegments.length === 0) {
      setSelectedSegmentId("");
      setMeaningUnitSegmentId("");
      setSegmentDraftTitle("");
      setSegmentDraftText("");
      return;
    }

    const segment =
      displaySegments.find((item) => item.id === selectedSegmentId) ??
      displaySegments[0];
    if (segment.id !== selectedSegmentId) {
      setSelectedSegmentId(segment.id);
    }
    setSegmentDraftTitle(segment.topicLabel || segment.speakerInfo);
    setSegmentDraftText(segment.text);
    setSegmentDraftRole(segment.speakerRole ?? "unclear");
    if (!displaySegments.some((item) => item.id === meaningUnitSegmentId)) {
      const readySegment =
        displaySegments.find((item) => canRunMeaningUnitsForSegment(item)) ??
        displaySegments[0];
      setMeaningUnitSegmentId(readySegment.id);
    }
  }, [displaySegments, meaningUnitSegmentId, selectedSegmentId]);

  const completedSteps = useMemo(() => {
    const completed = new Set<WorkflowStep>(["pre-analysis"]);
    if (units.length > 0) {
      completed.add("understanding");
    }
    if (displayCategories.length > 0) {
      completed.add("categorizing");
    }
    if (integrationReviewed || narrative.trim()) {
      completed.add("integrating");
    }
    if (reviewerOutputs.length > 0) {
      completed.add("integrity");
    }
    return completed;
  }, [
    displayCategories.length,
    editableTranscript,
    integrationReviewed,
    narrative,
    reviewerOutputs.length,
    units.length,
  ]);

  const selectedTitle = steps.find((step) => step.id === activeStep)?.label;
  const guidedSteps = steps.filter((step) => step.id !== "export");
  const currentStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStep),
  );
  const nextStep = steps[(currentStepIndex + 1) % steps.length];
  const latestAudioFile = displayAudioFiles[0];
  const latestTranscriptionJob = displayTranscriptionJobs[0];
  const pendingHighRiskItems = useMemo(
    () =>
      sensitiveReviewItems.filter(
        (item) => item.riskLevel === "high" && item.status === "pending",
      ),
    [sensitiveReviewItems],
  );
  const unresolvedHighRiskCount = pendingHighRiskItems.length;
  const canProceedWithTranscript =
    unresolvedHighRiskCount === 0 || privacyOverrideAccepted;
  const identifiableSensitiveDatasetSelected =
    datasetType === "identifiable_sensitive" && !isLocalOnlyMode;
  const dataSuitabilityBlocksAnalysis =
    !isLocalOnlyMode &&
    (!dataSuitabilityConfirmed || identifiableSensitiveDatasetSelected);
  const activeSensitiveItem =
    sensitiveReviewItems.find((item) => item.id === activeSensitiveItemId) ??
    null;
  const selectedSegment = useMemo(
    () =>
      displaySegments.find((segment) => segment.id === selectedSegmentId) ??
      displaySegments[0],
    [displaySegments, selectedSegmentId],
  );
  const selectedSegmentIndex = selectedSegment
    ? displaySegments.findIndex((segment) => segment.id === selectedSegment.id)
    : -1;
  const previousSegment =
    selectedSegmentIndex > 0 ? displaySegments[selectedSegmentIndex - 1] : null;
  const nextSegment =
    selectedSegmentIndex >= 0 &&
    selectedSegmentIndex < displaySegments.length - 1
      ? displaySegments[selectedSegmentIndex + 1]
      : null;
  const readySegments = useMemo(
    () =>
      displaySegments.filter((segment) =>
        canRunMeaningUnitsForSegment(segment),
      ),
    [displaySegments],
  );
  const selectedMeaningUnitSegment = useMemo(
    () =>
      displaySegments.find((segment) => segment.id === meaningUnitSegmentId) ??
      null,
    [displaySegments, meaningUnitSegmentId],
  );
  const canGenerateMeaningUnits = Boolean(
    transcriptConfirmed && editableTranscript.trim(),
  );
  const currentMeaningUnits = useMemo(
    () => normalizeMeaningUnitNumbersForSegments(units, displaySegments),
    [displaySegments, units],
  );
  const reviewableMeaningUnits = useMemo(
    () =>
      currentMeaningUnits.filter(
        (unit) =>
          unit.speakerRole === "participant" ||
          unit.generationMethod === "researcher",
      ),
    [currentMeaningUnits],
  );
  const contextMaterialRecords = useMemo(
    () =>
      currentMeaningUnits.filter(
        (unit) =>
          unit.speakerRole !== "participant" &&
          unit.generationMethod !== "researcher",
      ),
    [currentMeaningUnits],
  );
  const segmentMeaningUnitCounts = useMemo(() => {
    const counts = new Map<
      string,
      { accepted: number; excluded: number; total: number }
    >();
    currentMeaningUnits.forEach((unit) => {
      const current = counts.get(unit.segmentId) ?? {
        accepted: 0,
        excluded: 0,
        total: 0,
      };
      current.total += 1;
      if (unit.analysisExcluded) {
        current.excluded += 1;
      }
      if (unit.humanStatus === "Accepted" && !unit.analysisExcluded) {
        current.accepted += 1;
      }
      counts.set(unit.segmentId, current);
    });
    return counts;
  }, [currentMeaningUnits]);
  const confirmedMeaningUnits = useMemo(
    () => currentMeaningUnits.filter((unit) => isConfirmedMeaningUnit(unit)),
    [currentMeaningUnits],
  );
  const unconfirmedMeaningUnits = useMemo(
    () => reviewableMeaningUnits.filter((unit) => !isConfirmedMeaningUnit(unit)),
    [reviewableMeaningUnits],
  );
  const excludedMeaningUnits = useMemo(
    () => reviewableMeaningUnits.filter((unit) => unit.analysisExcluded),
    [reviewableMeaningUnits],
  );
  const hasFallbackCategoryLabels = displayCategories.some(isFallbackCategory);
  const hasTemporaryFallbackCategories = categoryDraftIsFallback;
  const assignedMeaningUnitNumbers = useMemo(
    () =>
      new Set(
        displayCategories
          .filter((category) => category.status !== "rejected")
          .flatMap((category) => category.includedUnitIds),
      ),
    [displayCategories],
  );
  const unassignedMeaningUnits = useMemo(
    () =>
      confirmedMeaningUnits.filter(
        (unit) => !assignedMeaningUnitNumbers.has(unit.number),
      ),
    [assignedMeaningUnitNumbers, confirmedMeaningUnits],
  );
  const confirmedCategoryCount = displayCategories.filter(
    (category) => category.status === "confirmed",
  ).length;
  const acceptedMeaningUnitNumbers = useMemo(
    () => new Set(confirmedMeaningUnits.map((unit) => unit.number)),
    [confirmedMeaningUnits],
  );
  const reviewedIntegrationCategories = useMemo(
    () =>
      displayCategories.filter(
        (category) =>
          category.status !== "rejected" &&
          category.includedUnitIds.some((unitNumber) =>
            acceptedMeaningUnitNumbers.has(unitNumber),
          ),
      ),
    [acceptedMeaningUnitNumbers, displayCategories],
  );
  const integrationMapGroups = useMemo(
    () => buildIntegrationMapGroups(reviewedIntegrationCategories),
    [reviewedIntegrationCategories],
  );
  const canGenerateIntegrationStructure =
    allSegmentsProcessedForModeC &&
    confirmedMeaningUnits.length > 0 &&
    reviewedIntegrationCategories.length >= 2 &&
    !hasTemporaryFallbackCategories;
  const canRunCategories =
    confirmedMeaningUnits.length > 0 &&
    (mode === "A" ||
      (mode === "B" &&
        displayCategories.length > 0 &&
        !hasTemporaryFallbackCategories) ||
      (mode === "C" &&
        displayCategories.length > 0 &&
        !hasTemporaryFallbackCategories &&
        allSegmentsProcessedForModeC));
  const canRunReviewer = reviewableMeaningUnits.length > 0;
  const meaningUnitReviewIssues = useMemo(
    () =>
      reviewerOutputs.filter(
        (comment) => comment.workspace === "meaning-units",
      ),
    [reviewerOutputs],
  );
  const meaningUnitIssueContextById = useMemo(
    () =>
      buildMeaningUnitIssueContextById(
        meaningUnitReviewIssues,
        currentMeaningUnits,
      ),
    [currentMeaningUnits, meaningUnitReviewIssues],
  );
  const categoryReviewIssues = useMemo(
    () =>
      reviewerOutputs.filter((comment) => comment.workspace === "categories"),
    [reviewerOutputs],
  );
  const canExport = Boolean(
    editableTranscript.trim() ||
    units.length ||
    displayCategories.length ||
    reviewerOutputs.length,
  );
  const generationTargetLabel = "the confirmed transcript";
  const selectedSegmentAlreadyHasUnits = Boolean(
    selectedMeaningUnitSegment &&
    currentMeaningUnits.some(
      (unit) => unit.segmentId === selectedMeaningUnitSegment.segmentId,
    ),
  );
  const generationButtonLabel = "Generate draft meaning units";
  const generationCounts = useMemo(
    () => ({
      participantTurns: new Set(
        currentMeaningUnits
          .filter((unit) => unit.speakerRole === "participant")
          .flatMap((unit) => unit.sourceTurnIds ?? []),
      ).size,
      substantiveMeaningUnits: currentMeaningUnits.filter(
        (unit) =>
          (unit.classification ?? "substantive_participant") ===
          "substantive_participant",
      ).length,
      contextOnlySegments: currentMeaningUnits.filter(
        (unit) => unit.classification === "context_only",
      ).length,
      nonAnalyticSegments: currentMeaningUnits.filter(
        (unit) => unit.classification === "non_analytic",
      ).length,
      uncertainSegments: currentMeaningUnits.filter(
        (unit) => unit.classification === "uncertain",
      ).length,
      openingBackgroundCandidates: currentMeaningUnits.filter(
        isOpeningBackgroundCandidate,
      ).length,
    }),
    [currentMeaningUnits],
  );
  const acceptedMeaningUnitNumberKey = confirmedMeaningUnits
    .map((unit) => unit.number)
    .join(",");
  const integrityChecklistItems = useMemo(
    () =>
      mergeIntegrityReviewItems(
        buildIntegrityReviewItemsFromState({
          auditEvents: displayAuditEvents,
          categories: displayCategories,
          categoryReviewIssues,
          confirmedMeaningUnits,
          excludedMeaningUnits,
          integrationRelationships,
          integrationReviewed,
          meaningUnitReviewIssues,
          meaningUnits: currentMeaningUnits,
          narrative,
          project: currentProject,
          transcriptConfirmed,
          unassignedMeaningUnits,
        }),
        displayIntegrityItems,
      ),
    [
      categoryReviewIssues,
      confirmedMeaningUnits,
      currentMeaningUnits,
      currentProject,
      displayAuditEvents,
      displayCategories,
      displayIntegrityItems,
      excludedMeaningUnits,
      integrationRelationships,
      integrationReviewed,
      meaningUnitReviewIssues,
      narrative,
      transcriptConfirmed,
      unassignedMeaningUnits,
    ],
  );

  useEffect(() => {
    const acceptedNumbers = new Set(
      acceptedMeaningUnitNumberKey
        .split(",")
        .map((value) => Number(value))
        .filter(Number.isFinite),
    );
    setDisplayCategories((current) => {
      let changed = false;
      const next = current.map((category) => {
        const includedUnitIds = category.includedUnitIds.filter((number) =>
          acceptedNumbers.has(number),
        );
        if (includedUnitIds.length !== category.includedUnitIds.length) {
          changed = true;
          return { ...category, includedUnitIds };
        }
        return category;
      });
      return changed ? next : current;
    });
  }, [acceptedMeaningUnitNumberKey]);

  function applyWorkspace(workspace: WorkspaceData) {
    setCurrentProject(workspace.project);
    setProjectTitle(workspace.project.title);
    setDatasetType(workspace.project.datasetType);
    setProjectDataSource(workspace.project.dataSource);
    setDataSuitabilityConfirmed(workspace.project.dataSuitabilityConfirmed);
    setProjectResearcherNotes(workspace.project.researcherNotes);
    setResearchQuestion(
      workspace.preAnalysisNotes?.researchQuestion ||
        workspace.project.researchQuestion,
    );
    setStudyDescription(
      normaliseResearcherFacingText(
        workspace.preAnalysisNotes?.studyDescription ||
          workspace.project.studyDescription,
      ),
    );
    setResearcherReflexivityNotes(
      workspace.preAnalysisNotes?.researcherPosition ?? "",
    );
    setResearcherNotes(workspace.preAnalysisNotes?.contextualNotes ?? "");
    setResearcherExpectations(
      workspace.preAnalysisNotes?.initialSensitisingConcepts ?? "",
    );
    setDataFamiliarisationNotes(
      workspace.preAnalysisNotes?.dataFamiliarisationNotes ?? "",
    );
    setPreAnalysisSavedAt(workspace.preAnalysisNotes?.updatedAt ?? "");
    setProjectLanguage(workspace.project.language);
    setLightInterpretation(workspace.project.lightInterpretation);
    setUploadLanguage(workspace.project.language);
    setEditableTranscript(workspace.transcript);
    setTranscriptConfirmed(isTranscriptConfirmed(workspace.project));
    setAiPrivacyFindings(extractPrivacyReviewMarkers(workspace.transcript));
    setPrivacyOverrideAccepted(false);
    setTranscriptStorageStatus(
      workspace.transcript.trim()
        ? "Anonymised version saved"
        : "Not saved yet — local draft only",
    );
    setDisplaySegments(workspace.segments);
    setDisplayAudioFiles(workspace.audioFiles);
    setDisplayTranscriptionJobs(workspace.transcriptionJobs);
    setDisplayTranscriptRecords(workspace.transcriptRecords ?? []);
    setUnits(workspace.meaningUnits);
    setDisplayCategories(workspace.categories);
    setReviewerOutputs(workspace.reviewerComments);
    setDisplayAuditEvents(workspace.auditEvents);
    setDisplayExportRecords(workspace.exportRecords ?? []);
    setNarrative(workspace.integratedNarrative);
    setIntegrationNote(workspace.integrationMemo ?? "");
    setDisplayIntegrityItems(workspace.integrityReviewItems ?? []);
    const nextGuidanceMemos = (workspace.guidanceMemos ?? []).map(
      guidanceMemoToMessage,
    );
    setGuidanceMessages(nextGuidanceMemos);
    setSavedGuidanceMemos(nextGuidanceMemos);
    setIntegrationRelationships(
      buildIntegrationRelationshipDrafts({
        categories: workspace.categories,
        storedRelationships: workspace.integrationRelationships ?? [],
        units: workspace.meaningUnits,
      }),
    );
    setIntegrationSavedAt("");
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
    setApiDataSource(workspace.dataSource);
    setActiveStep(getRecommendedActiveStep(workspace));
    setApiStatus("Workspace refreshed.");
  }

  async function saveProjectSetup() {
    setIsSavingProject(true);
    if (!dataSuitabilityConfirmed) {
      setApiStatus(
        "Confirm the data suitability notice before saving project setup or uploading data.",
      );
      setIsSavingProject(false);
      return;
    }

    if (datasetType === "identifiable_sensitive" && !isLocalOnlyMode) {
      setApiStatus(
        "Identifiable sensitive data is not supported in the cloud-assisted v1.0 research release. Use an approved secure/local deployment before uploading that data.",
      );
      setIsSavingProject(false);
      return;
    }

    if (isLocalOnlyMode) {
      const now = new Date().toISOString();
      setCurrentProject((current) => ({
        ...current,
        dataSource: projectDataSource,
        dataSuitabilityConfirmed,
        dataSuitabilityConfirmedAt: dataSuitabilityConfirmed
          ? (current.dataSuitabilityConfirmedAt ?? now)
          : undefined,
        datasetType,
        language: projectLanguage,
        lightInterpretation,
        researcherNotes: projectResearcherNotes,
        researchQuestion,
        studyDescription,
        title: projectTitle,
        updatedAt: now,
      }));
      setUploadLanguage(projectLanguage);
      setProjectSetupSavedAt(now);
      setApiStatus(
        `Project setup saved locally at ${formatTime(now)}. Nothing was saved to Supabase.`,
      );
      setIsSavingProject(false);
      return;
    }

    setApiStatus("Saving project setup...");

    try {
      const response = await fetch("/api/project", {
        body: JSON.stringify({
          dataSource: projectDataSource,
          dataSuitabilityConfirmed,
          datasetType,
          language: projectLanguage,
          lightInterpretation,
          projectId: currentProject.id,
          researcherNotes: projectResearcherNotes,
          researchQuestion,
          studyDescription,
          title: projectTitle,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: Project;
        saved?: boolean;
      };

      if (!response.ok || !result.saved) {
        setApiStatus(result.error ?? "Project setup save failed");
        return;
      }

      if (result.project) {
        const nextProject = result.project;
        setCurrentProject(nextProject);
        setDatasetType(nextProject.datasetType);
        setProjectDataSource(nextProject.dataSource);
        setDataSuitabilityConfirmed(nextProject.dataSuitabilityConfirmed);
        setProjectResearcherNotes(nextProject.researcherNotes);
        setAvailableProjects((current) =>
          current.some((item) => item.id === nextProject.id)
            ? current.map((item) =>
                item.id === nextProject.id ? nextProject : item,
              )
            : [nextProject, ...current],
        );
      }
      setProjectSetupSavedAt(new Date().toISOString());
      setApiStatus("Project setup saved to Supabase");
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Project setup save failed",
      );
    } finally {
      setIsSavingProject(false);
    }
  }

  async function saveStepOnePreAnalysisNotes() {
    if (!researchQuestion.trim() || !studyDescription.trim()) {
      setApiStatus(
        "Add a research question and study description/domains before saving Step 1.",
      );
      return;
    }

    setIsSavingPreAnalysis(true);

    if (isLocalOnlyMode) {
      const now = new Date().toISOString();
      setCurrentProject((current) => ({
        ...current,
        researchQuestion,
        studyDescription,
        updatedAt: now,
      }));
      setPreAnalysisSavedAt(now);
      recordLocalAuditEvent({
        action: "Updated Step 1 pre-analysis notes locally",
        target: "Step 1 pre-analysis",
      });
      setApiStatus(
        "Step 1 pre-analysis notes saved locally for this browser session. Export JSON to keep a copy.",
      );
      setIsSavingPreAnalysis(false);
      return;
    }

    setApiStatus("Saving Step 1 pre-analysis notes...");

    try {
      const response = await fetch("/api/pre-analysis", {
        body: JSON.stringify({
          contextualNotes: researcherNotes,
          dataFamiliarisationNotes,
          initialSensitisingConcepts: researcherExpectations,
          projectId: currentProject.id,
          researcherPosition: researcherReflexivityNotes,
          researchQuestion,
          studyDescription,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        preAnalysisNotes?: PreAnalysisNotes;
        project?: Project;
        saved?: boolean;
      };

      if (!response.ok || !result.saved) {
        setApiStatus(result.error ?? "Step 1 pre-analysis save failed.");
        return;
      }

      if (result.project) {
        setCurrentProject(result.project);
        setProjectTitle(result.project.title);
        setProjectLanguage(result.project.language);
      }
      if (result.preAnalysisNotes) {
        setResearchQuestion(result.preAnalysisNotes.researchQuestion);
        setStudyDescription(
          normaliseResearcherFacingText(
            result.preAnalysisNotes.studyDescription,
          ),
        );
        setResearcherReflexivityNotes(
          result.preAnalysisNotes.researcherPosition,
        );
        setResearcherNotes(result.preAnalysisNotes.contextualNotes);
        setResearcherExpectations(
          result.preAnalysisNotes.initialSensitisingConcepts,
        );
        setDataFamiliarisationNotes(
          result.preAnalysisNotes.dataFamiliarisationNotes,
        );
        setPreAnalysisSavedAt(result.preAnalysisNotes.updatedAt);
      }
      setApiStatus("Step 1 pre-analysis notes saved to Supabase.");
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Step 1 pre-analysis save failed.",
      );
    } finally {
      setIsSavingPreAnalysis(false);
    }
  }

  function openProject(projectId: string) {
    if (!projectId || projectId === currentProject.id) {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("projectId", projectId);
    window.location.href = url.toString();
  }

  function ensureDataSuitabilityConfirmed(actionLabel: string) {
    if (isLocalOnlyMode) {
      return true;
    }

    if (!dataSuitabilityConfirmed) {
      setApiStatus(
        `Confirm the data suitability notice before ${actionLabel}. This v1.0 release is for open, public, or anonymised datasets only.`,
      );
      setCreateProjectExpanded(true);
      return false;
    }

    if (datasetType === "identifiable_sensitive") {
      setApiStatus(
        "Identifiable sensitive data is not supported in the cloud-assisted v1.0 research release. Use an approved secure/local deployment before uploading that data.",
      );
      setCreateProjectExpanded(true);
      return false;
    }

    return true;
  }

  async function createNewProject() {
    if (isLocalOnlyMode) {
      setApiStatus(
        "Project creation is stored only in browser state in local-only mode. Use the current workspace or switch to Supabase storage for a project list.",
      );
      return;
    }

    if (
      !newProjectTitle.trim() ||
      !newResearchQuestion.trim() ||
      !newStudyDescription.trim() ||
      !newResearcherNotes.trim()
    ) {
      setApiStatus(
        "Complete the project title, research question, study description, and researcher notes before creating a project.",
      );
      return;
    }

    if (!newDataSuitabilityConfirmed) {
      setApiStatus(
        "Confirm the data suitability notice before creating a v1.0 research-release project.",
      );
      return;
    }

    if (newDatasetType === "identifiable_sensitive") {
      setApiStatus(
        "Identifiable sensitive data is not supported in the cloud-assisted v1.0 research release. Choose open/anonymised data or use an approved secure/local deployment.",
      );
      return;
    }

    setIsCreatingProject(true);
    setApiStatus("Creating project...");

    try {
      const response = await fetch("/api/project", {
        body: JSON.stringify({
          dataSource: newDataSource,
          dataSuitabilityConfirmed: newDataSuitabilityConfirmed,
          datasetType: newDatasetType,
          language: projectLanguage,
          lightInterpretation,
          researcherNotes: newResearcherNotes,
          researchQuestion: newResearchQuestion,
          studyDescription: newStudyDescription,
          title: newProjectTitle,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        created?: boolean;
        error?: string;
        project?: Project;
        reason?: string;
      };

      if (!response.ok || !result.created || !result.project) {
        setApiStatus(
          result.error ?? result.reason ?? "Project creation failed.",
        );
        return;
      }

      const createdProject = result.project;
      setAvailableProjects((current) => [
        createdProject,
        ...current.filter((item) => item.id !== createdProject.id),
      ]);
      setApiStatus("Project created. Opening the new workspace...");
      const url = new URL(window.location.href);
      url.searchParams.set("projectId", createdProject.id);
      window.location.href = url.toString();
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Project creation failed.",
      );
    } finally {
      setIsCreatingProject(false);
    }
  }

  function toggleLightInterpretation(nextValue?: boolean) {
    const value = nextValue ?? !lightInterpretation;
    setLightInterpretation(value);
    setCurrentProject((current) => ({
      ...current,
      lightInterpretation: value,
      updatedAt: new Date().toISOString(),
    }));
    setApiStatus(
      value
        ? "Light interpretation is ON. New meaning-unit drafts may include cautious tentative interpretation."
        : "Light interpretation is OFF. New meaning-unit drafts will stay closer to descriptive summaries.",
    );
  }

  async function uploadAndTranscribeAudio() {
    if (isLocalOnlyMode) {
      setApiStatus(
        "Audio upload is disabled in local-only sharing mode because raw audio would need special temporary handling. Please import an anonymised transcript for this prototype test.",
      );
      return;
    }

    if (!ensureDataSuitabilityConfirmed("uploading audio")) {
      return;
    }

    if (!selectedAudioFile) {
      setApiStatus("Choose an audio file before starting transcription.");
      return;
    }

    clearWorkflowError();
    setIsUploadingAudio(true);
    setTranscriptPreparationStage(
      "Uploading audio securely before local transcription.",
    );
    setApiStatus(
      "Uploading and transcribing. You can follow progress in the activity panel below.",
    );

    const formData = new FormData();
    formData.append("file", selectedAudioFile);
    formData.append("projectId", currentProject.id);
    formData.append("language", uploadLanguage);

    try {
      const response = await fetch("/api/audio/transcribe", {
        body: formData,
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        privacyFindings?: string[];
        speakerNotes?: string[];
        transcribed?: boolean;
        workspace?: WorkspaceData;
      };

      if (!response.ok) {
        setRecoverableWorkflowError(
          result.error ?? "Audio upload failed",
          () => void uploadAndTranscribeAudio(),
        );
        return;
      }

      if (result.workspace) {
        applyWorkspace(result.workspace);
      }
      setTranscriptConfirmed(false);
      setTranscriptStorageStatus(
        result.transcribed
          ? "Audio transcript generated and saved as review draft"
          : "Audio uploaded; transcription did not complete",
      );
      setAiPrivacyFindings(
        result.privacyFindings?.length
          ? result.privacyFindings
          : extractPrivacyReviewMarkers(result.workspace?.transcript ?? ""),
      );

      setApiStatus(
        result.transcribed
          ? `Transcript prepared and saved. Please review the transcript before analysis${
              result.privacyFindings?.length
                ? ` (${result.privacyFindings.length} privacy finding${result.privacyFindings.length === 1 ? "" : "s"})`
                : ""
            }`
          : (result.error ??
              "Audio uploaded to Supabase, but local transcription failed"),
      );
    } catch (error) {
      setRecoverableWorkflowError(
        error instanceof Error ? error.message : "Audio upload failed",
        () => void uploadAndTranscribeAudio(),
      );
    } finally {
      setIsUploadingAudio(false);
      setTranscriptPreparationStage("");
    }
  }

  async function loadTranscriptFile(file: File | null) {
    if (!file) {
      return;
    }

    setApiStatus(`Reading transcript text from ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/transcripts/extract", {
        body: formData,
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        filename?: string;
        transcript?: string;
      };

      if (!response.ok || !result.transcript) {
        setApiStatus(result.error ?? "Transcript file extraction failed");
        return;
      }

      setTranscriptImportText(result.transcript);
      setTranscriptImportName(result.filename ?? file.name);
      setTranscriptPreparationStage("");
      setApiStatus(
        `Transcript loaded from ${result.filename ?? file.name}. Review it before importing.`,
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Transcript file extraction failed",
      );
    }
  }

  async function importTranscript(forceRuleBased = false) {
    if (!transcriptImportText.trim()) {
      setApiStatus("Paste text or choose a transcript file before importing.");
      return;
    }

    if (!ensureDataSuitabilityConfirmed("importing a transcript")) {
      return;
    }

    clearWorkflowError();
    setIsImportingTranscript(true);
    setTranscriptPreparationStage(
      forceRuleBased
        ? "Using quick local transcript preparation. Please review speaker labels and sensitive details carefully."
        : "Preparing transcript with local AI first. If it is slow, the app will switch to quick local preparation automatically.",
    );
    const slowNoticeTimer = window.setTimeout(() => {
      setTranscriptPreparationStage(
        "Still preparing. Local AI can be slow; the app will use quick local preparation if needed.",
      );
    }, 30000);
    setApiStatus(
      forceRuleBased
        ? "Preparing transcript with quick local rules..."
        : "Preparing transcript. The app will label speakers and flag possible private details for your review.",
    );

    try {
      const transcriptPrepareTimeoutMs = getTranscriptPrepareRequestTimeoutMs();
      const response = await fetchWithTimeout("/api/transcripts/prepare", {
        body: JSON.stringify({
          forceRuleBased,
          language: uploadLanguage,
          projectId: currentProject.id,
          saveReviewDraft: !isLocalOnlyMode,
          sourceLabel:
            transcriptImportName || "Uploaded transcript — review draft",
          timeoutMs: transcriptPrepareTimeoutMs,
          transcript: transcriptImportText,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: transcriptPrepareTimeoutMs + 30000,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        fallbackUsed?: boolean;
        model?: string;
        prepared?: boolean;
        privacyFindings?: string[];
        savedDraft?: boolean;
        speakerNotes?: string[];
        transcript?: string;
        workspace?: WorkspaceData;
      };

      if (!response.ok || !result.prepared || !result.transcript) {
        setApiStatus(result.error ?? "Transcript preparation failed");
        return;
      }

      if (result.workspace) {
        applyWorkspace(result.workspace);
      }
      const safePreparedTranscript = prepareTranscriptForStorage(
        result.transcript,
      );
      setEditableTranscript(safePreparedTranscript);
      setTranscriptConfirmed(false);
      setTranscriptStorageStatus(
        result.savedDraft
          ? "Original upload and prepared review draft saved"
          : "Not saved yet — local draft only",
      );
      setPrivacyOverrideAccepted(false);
      setAiPrivacyFindings(
        result.privacyFindings?.length
          ? result.privacyFindings
          : extractPrivacyReviewMarkers(result.transcript),
      );

      setTranscriptImportText("");
      setTranscriptPreparationStage(
        result.fallbackUsed || forceRuleBased
          ? "Quick local preparation completed. Please review speaker labels and sensitive-information items before confirming."
          : "AI-assisted transcript preparation completed. Please review before confirming.",
      );
      setApiStatus(
        `${result.fallbackUsed || forceRuleBased ? "Transcript prepared with quick local rules" : "Transcript prepared locally"}${result.savedDraft ? " and saved as a review draft" : " and not saved yet"}. Please review speaker labels, sensitive-information items, and wording before saving or confirming${
          result.privacyFindings?.length
            ? ` (${result.privacyFindings.length} privacy finding${result.privacyFindings.length === 1 ? "" : "s"})`
            : ""
        }`,
      );
    } catch (error) {
      setRecoverableWorkflowError(
        error instanceof Error ? error.message : "Transcript import failed",
        () => void importTranscript(forceRuleBased),
      );
    } finally {
      window.clearTimeout(slowNoticeTimer);
      setIsImportingTranscript(false);
    }
  }

  async function refreshWorkspace() {
    if (isLocalOnlyMode) {
      setApiStatus(
        "Local-only mode keeps the current workspace in browser state. Export project JSON to keep a copy.",
      );
      return;
    }
    setApiStatus("Refreshing workspace...");
    const response = await fetch(
      `/api/workspace?projectId=${currentProject.id}`,
      {
        cache: "no-store",
      },
    );
    if (!response.ok) {
      setApiStatus(
        "Could not refresh the workspace. Check Supabase connection and try again.",
      );
      return;
    }
    const workspace = (await response.json()) as WorkspaceData;
    applyWorkspace(workspace);
  }

  async function saveTranscriptVersion() {
    if (!ensureDataSuitabilityConfirmed("saving a transcript")) {
      return;
    }

    if (!canProceedWithTranscript) {
      setApiStatus(
        "This transcript may still contain identifiable or sensitive information. Please review high-risk items before saving.",
      );
      return;
    }

    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain in this transcript. Please review or anonymise them before saving or analysis.",
      );
      return;
    }
    const preparedTranscript = prepareTranscriptForStorage(editableTranscript);
    const cleanedSource = cleanTranscriptSourceForAnalysis(
      preparedTranscript,
      currentProject,
    );
    const transcriptForStorage = cleanedSource.transcript;
    if (!transcriptForStorage.trim()) {
      setApiStatus(
        "Only project setup or metadata was detected. Add the interview transcript / participant account before confirming for analysis.",
      );
      return;
    }
    if (isLocalOnlyMode) {
      setEditableTranscript(transcriptForStorage);
      setTranscriptConfirmed(false);
      setTranscriptStorageStatus("Reviewed transcript saved locally");
      setApiStatus(
        "Reviewed transcript saved locally in this browser session. Export project JSON to keep a copy.",
      );
      return;
    }
    setApiStatus("Saving reviewed transcript...");
    setTranscriptConfirmed(false);
    const response = await fetch("/api/transcript-versions", {
      body: JSON.stringify({
        content: transcriptForStorage,
        projectId: currentProject.id,
        sensitiveItems: serialiseSensitiveItemsForStorage(sensitiveReviewItems),
        anonymisationStatus:
          unresolvedHighRiskCount === 0 ? "reviewed" : "not_reviewed",
        rawTranscriptRetained: false,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (!response.ok) {
      const errorResult = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      setApiStatus(errorResult.error ?? "Transcript save failed");
      return;
    }
    const result = (await response.json()) as {
      saved?: boolean;
      reason?: string;
      error?: string;
      workspace?: WorkspaceData;
    };
    setApiStatus(
      result.saved
        ? "Reviewed transcript saved. Please confirm again before analysis."
        : (result.reason ?? result.error ?? "Transcript save failed"),
    );
    if (result.saved) {
      if (result.workspace) {
        applyWorkspace(result.workspace);
      }
      setEditableTranscript(transcriptForStorage);
      setTranscriptStorageStatus("Edited transcript version saved");
    }
  }

  async function confirmTranscriptForAnalysis() {
    if (!editableTranscript.trim()) {
      setApiStatus(
        "Add or import a transcript before confirming it for analysis.",
      );
      return;
    }
    if (
      !ensureDataSuitabilityConfirmed("confirming a transcript for analysis")
    ) {
      return;
    }
    if (!canProceedWithTranscript) {
      setApiStatus(
        "This transcript may still contain identifiable or sensitive information. Please review high-risk items before analysis.",
      );
      return;
    }

    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain in this transcript. Please review or anonymise them before saving or analysis.",
      );
      return;
    }
    const preparedTranscript = prepareTranscriptForStorage(editableTranscript);
    const cleanedSource = cleanTranscriptSourceForAnalysis(
      preparedTranscript,
      currentProject,
    );
    const transcriptForStorage = cleanedSource.transcript;
    if (!transcriptForStorage.trim()) {
      setApiStatus(
        "Only project setup or metadata was detected. Add the interview transcript / participant account before confirming for analysis.",
      );
      return;
    }
    if (isLocalOnlyMode) {
      const now = new Date().toISOString();
      setEditableTranscript(transcriptForStorage);
      setTranscriptConfirmed(true);
      setTranscriptStorageStatus("Reviewed transcript saved locally");
      setCurrentProject((current) => ({
        ...current,
        status: "Transcript confirmed for local analysis",
        updatedAt: now,
      }));
      const splitResult = autoSplitTranscript(transcriptForStorage, {
        mode: segmentSplitMode,
        researchQuestion,
        sourceTranscriptId: "active-transcript",
      });
      const splitStartedAt = Date.now();
      const localSegments =
        splitResult.segments.length > 0
          ? splitResult.segments.map(
              (segment, index): TranscriptSegment => ({
                caseId: "CASE-001",
                createdBy: "auto",
                endTimestamp: "00:00",
                endTurnIndex: segment.endTurnIndex,
                id: `local-seg-${splitStartedAt}-${index + 1}`,
                segmentId: `SEG-${String(index + 1).padStart(3, "0")}`,
                segmentNumber: index + 1,
                sourceTranscriptId: segment.sourceTranscriptId,
                speakerInfo: segment.title,
                splittingMode: segment.splittingMode,
                startingMuNumber: index * 100 + 1,
                startTimestamp: "00:00",
                startTurnIndex: segment.startTurnIndex,
                status: "Needs Review",
                text: segment.text,
                topicLabel: segment.title || `Segment ${index + 1}`,
              }),
            )
          : [
              buildLocalTranscriptSegment({
                caseId: "CASE-001",
                segmentNumber: 1,
                text: transcriptForStorage,
              }),
            ];
      setDisplaySegments(localSegments);
      setSelectedSegmentId(localSegments[0]?.id ?? "");
      setMeaningUnitSegmentId(localSegments[0]?.id ?? "");
      setUnits([]);
      setDisplayCategories([]);
      setReviewerOutputs([]);
      setNarrative("");
      setDisplayAuditEvents((current) => [
        {
          actor: "Researcher",
          action: "Confirmed reviewed transcript locally",
          id: `audit_local_${Date.now()}`,
          target: "Local-only workspace",
          timestamp: now,
        },
        ...current,
      ]);
      setApiStatus(
        cleanedSource.removedLineCount > 0
          ? `Reviewed transcript confirmed locally. Removed ${cleanedSource.removedLineCount} non-transcript setup/metadata line${cleanedSource.removedLineCount === 1 ? "" : "s"} before analysis.`
          : "Reviewed transcript confirmed locally. Internal source chunks are ready; generate draft meaning units when you are ready to review them.",
      );
      return;
    }
    setIsConfirmingTranscript(true);
    setApiStatus(
      "Confirming transcript. Previous derived analysis will be cleared so the next analysis uses this reviewed text.",
    );

    try {
      const response = await fetch("/api/transcripts/confirm", {
        body: JSON.stringify({
          content: transcriptForStorage,
          language: projectLanguage,
          projectId: currentProject.id,
          sensitiveItems:
            serialiseSensitiveItemsForStorage(sensitiveReviewItems),
          anonymisationStatus:
            unresolvedHighRiskCount === 0 ? "confirmed" : "not_reviewed",
          rawTranscriptRetained: false,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        workspace?: WorkspaceData;
      };

      if (!response.ok || !result.saved) {
        setApiStatus(result.error ?? "Transcript confirmation failed");
        return;
      }

      if (result.workspace) {
        applyWorkspace(result.workspace);
      }
      setTranscriptConfirmed(true);
      setEditableTranscript(transcriptForStorage);
      setTranscriptStorageStatus("Anonymised version saved");
      setApiStatus(
        cleanedSource.removedLineCount > 0
          ? `Transcript confirmed. Removed ${cleanedSource.removedLineCount} non-transcript setup/metadata line${cleanedSource.removedLineCount === 1 ? "" : "s"} before analysis.`
          : "Transcript confirmed. You can now generate meaning units from the reviewed text.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Transcript confirmation failed",
      );
    } finally {
      setIsConfirmingTranscript(false);
    }
  }

  async function clearTranscriptAndDerivedOutputs() {
    const confirmed = confirmWorkspaceAction(
      "Delete the current transcript, uploaded audio records, and all derived meaning units, categories, methodological integrity issues, and audit records for this project? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    if (isLocalOnlyMode) {
      setEditableTranscript("");
      setTranscriptImportText("");
      setTranscriptConfirmed(false);
      setTranscriptStorageStatus("Not saved yet — local draft only");
      setDisplayAudioFiles([]);
      setDisplayTranscriptionJobs([]);
      setDisplaySegments([]);
      setSelectedSegmentId("");
      setMeaningUnitSegmentId("");
      setUnits([]);
      setDisplayCategories([]);
      setReviewerOutputs([]);
      setNarrative("");
      setCategoryDraftNotice("");
      setCategoryDraftIsFallback(false);
      setSensitiveReviewItems([]);
      setAiPrivacyFindings([]);
      setPrivacyOverrideAccepted(false);
      setDisplayAuditEvents([]);
      setApiStatus(
        "Local transcript and derived outputs cleared from this browser session.",
      );
      return;
    }

    setApiStatus("Deleting transcript and derived outputs...");
    const response = await fetch("/api/project/clear-data", {
      body: JSON.stringify({ projectId: currentProject.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const result = (await response.json().catch(() => ({}))) as {
      cleared?: boolean;
      error?: string;
      reason?: string;
      workspace?: WorkspaceData;
    };

    if (!response.ok || !result.cleared) {
      setApiStatus(
        result.error ?? result.reason ?? "Project data clear failed.",
      );
      return;
    }

    if (result.workspace) {
      applyWorkspace(result.workspace);
    }
    setEditableTranscript("");
    setTranscriptConfirmed(false);
    setTranscriptStorageStatus("Not saved yet — local draft only");
    setSensitiveReviewItems([]);
    setAiPrivacyFindings([]);
    setApiStatus("Transcript, uploads, and derived outputs deleted.");
  }

  async function saveSelectedSegment(status?: SegmentStatus) {
    if (!selectedSegment) {
      setApiStatus("Select a segment before saving.");
      return;
    }

    if (isLocalOnlyMode) {
      const updatedSegment: TranscriptSegment = {
        ...selectedSegment,
        speakerInfo: segmentDraftTitle,
        speakerRole: segmentDraftRole,
        status: status ?? selectedSegment.status,
        text: segmentDraftText,
        topicLabel: segmentDraftTitle,
      };
      setDisplaySegments((current) =>
        current.map((segment) =>
          segment.id === selectedSegment.id ? updatedSegment : segment,
        ),
      );
      setSelectedSegmentId(updatedSegment.id);
      setUnits((current) =>
        current.filter((unit) => unit.segmentId !== updatedSegment.segmentId),
      );
      setDisplayCategories([]);
      setReviewerOutputs([]);
      setNarrative("");
      recordLocalAuditEvent({
        action:
          status === "Ready for MU Analysis"
            ? `Marked ${updatedSegment.segmentId} ready for MU analysis`
            : `Edited ${updatedSegment.segmentId} boundary/excerpt text`,
        target: updatedSegment.segmentId,
      });
      setApiStatus(
        status === "Ready for MU Analysis"
          ? "Meaning unit marked ready locally. You can now generate its summary."
          : "Meaning unit saved locally. Existing summaries for this unit were cleared so regenerated analysis uses the edited text.",
      );
      return;
    }

    setIsSavingSegment(true);
    setApiStatus("Saving meaning unit changes...");

    try {
      const response = await fetch(`/api/segments/${selectedSegment.id}`, {
        body: JSON.stringify({
          projectId: currentProject.id,
          speakerRole: segmentDraftRole,
          status,
          text: segmentDraftText,
          topicLabel: segmentDraftTitle,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        segment?: TranscriptSegment;
      };
      if (!response.ok || !result.saved || !result.segment) {
        setApiStatus(result.error ?? "Meaning unit save failed.");
        return;
      }
      setDisplaySegments((current) =>
        current.map((segment) =>
          segment.id === result.segment?.id ? result.segment : segment,
        ),
      );
      setSelectedSegmentId(result.segment.id);
      setApiStatus(
        status === "Ready for MU Analysis"
          ? "Meaning unit marked ready. You can now generate its summary."
          : "Meaning unit saved.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Meaning unit save failed.",
      );
    } finally {
      setIsSavingSegment(false);
    }
  }

  async function runSegmentAction(
    action: "split" | "merge" | "move",
    direction?: "previous" | "next" | "up" | "down",
  ) {
    if (!selectedSegment) {
      setApiStatus("Select a meaning unit first.");
      return;
    }

    let beforeText = "";
    let afterText = "";
    if (action === "split") {
      const splitIndex = getSegmentSplitIndex(
        segmentDraftText,
        segmentTextAreaRef.current?.selectionStart,
      );
      beforeText = segmentDraftText.slice(0, splitIndex).trim();
      afterText = segmentDraftText.slice(splitIndex).trim();
      if (!beforeText || !afterText) {
        setApiStatus(
          "Place the cursor where this meaning unit should split, then try again.",
        );
        return;
      }
    }

    setIsSavingSegment(true);
    setApiStatus(
      action === "split"
        ? "Splitting meaning unit..."
        : action === "merge"
          ? "Merging meaning units..."
          : "Reordering meaning unit...",
    );

    try {
      if (isLocalOnlyMode) {
        let nextSegments = [...displaySegments];
        if (action === "split") {
          const nextNumber = selectedSegment.segmentNumber + 1;
          const beforeSegment: TranscriptSegment = {
            ...selectedSegment,
            text: beforeText,
            topicLabel: segmentDraftTitle || selectedSegment.topicLabel,
            status: "Needs Review",
          };
          const afterSegment = buildLocalTranscriptSegment({
            caseId: selectedSegment.caseId,
            segmentNumber: nextNumber,
            speakerRole: selectedSegment.speakerRole ?? segmentDraftRole,
            text: afterText,
            topicLabel: `Split from ${selectedSegment.segmentId}`,
          });
          nextSegments.splice(
            selectedSegmentIndex,
            1,
            beforeSegment,
            afterSegment,
          );
        } else if (action === "merge") {
          const targetIndex =
            direction === "previous"
              ? selectedSegmentIndex - 1
              : selectedSegmentIndex + 1;
          const target = nextSegments[targetIndex];
          if (!target) {
            setApiStatus("No adjacent meaning unit is available to merge.");
            return;
          }
          const merged: TranscriptSegment = {
            ...target,
            text:
              direction === "previous"
                ? `${target.text}\n\n${segmentDraftText}`.trim()
                : `${segmentDraftText}\n\n${target.text}`.trim(),
            topicLabel: `${target.topicLabel} + ${selectedSegment.topicLabel}`,
            status: "Needs Review",
          };
          nextSegments = nextSegments.filter(
            (segment) => segment.id !== selectedSegment.id,
          );
          nextSegments[
            targetIndex > selectedSegmentIndex
              ? selectedSegmentIndex
              : targetIndex
          ] = merged;
          setSelectedSegmentId(merged.id);
        } else {
          const targetIndex =
            direction === "up"
              ? selectedSegmentIndex - 1
              : selectedSegmentIndex + 1;
          if (targetIndex < 0 || targetIndex >= nextSegments.length) {
            setApiStatus("Meaning unit cannot move further in that direction.");
            return;
          }
          const [moving] = nextSegments.splice(selectedSegmentIndex, 1);
          nextSegments.splice(targetIndex, 0, moving);
        }

        nextSegments = renumberLocalSegments(nextSegments);
        setDisplaySegments(nextSegments);
        setUnits([]);
        setDisplayCategories([]);
        setReviewerOutputs([]);
        setNarrative("");
        recordLocalAuditEvent({
          action:
            action === "split"
              ? `Split ${selectedSegment.segmentId}`
              : action === "merge"
                ? `Merged ${selectedSegment.segmentId} ${direction ?? ""}`.trim()
                : `Reordered ${selectedSegment.segmentId}`,
          target: selectedSegment.segmentId,
        });
        setApiStatus(
          "Meaning unit list updated locally. Review boundaries before generating summaries.",
        );
        return;
      }

      const response = await fetch(`/api/segments/${selectedSegment.id}`, {
        body: JSON.stringify({
          action,
          afterText,
          beforeText,
          direction,
          projectId: currentProject.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        saved?: boolean;
        segments?: TranscriptSegment[];
      };
      if (!response.ok || !result.saved || !result.segments) {
        setApiStatus(
          result.error ?? result.reason ?? "Meaning unit action failed.",
        );
        return;
      }
      setDisplaySegments(result.segments);
      const selected =
        result.segments.find((segment) => segment.id === selectedSegment.id) ??
        result.segments[Math.max(0, selectedSegmentIndex)];
      setSelectedSegmentId(selected?.id ?? "");
      setApiStatus(
        "Meaning unit list updated. Review boundaries before generating summaries.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Meaning unit action failed.",
      );
    } finally {
      setIsSavingSegment(false);
    }
  }

  function createSegmentFromSelection() {
    if (!selectedSegment) {
      setApiStatus("Select a meaning unit first.");
      return;
    }

    const textarea = segmentTextAreaRef.current;
    const selectionStart = textarea?.selectionStart ?? 0;
    const selectionEnd = textarea?.selectionEnd ?? 0;
    if (selectionEnd <= selectionStart) {
      setApiStatus(
        "Select the text that should become its own meaning unit, then click Create new meaning unit from selection.",
      );
      return;
    }

    const selectedText = segmentDraftText
      .slice(selectionStart, selectionEnd)
      .trim();
    const beforeText = segmentDraftText.slice(0, selectionStart).trim();
    const afterText = segmentDraftText.slice(selectionEnd).trim();
    const remainingText = [beforeText, afterText].filter(Boolean).join("\n\n");
    if (!selectedText || !remainingText) {
      setApiStatus(
        "Selection split needs both selected text and remaining text in the current meaning unit.",
      );
      return;
    }

    const newTitle =
      window
        .prompt("Title for the new meaning unit:", "New selected meaning unit")
        ?.trim() || "New selected meaning unit";
    const selectedSegmentDraft = buildLocalTranscriptSegment({
      caseId: selectedSegment.caseId,
      createdBy: "manual",
      segmentNumber: selectedSegment.segmentNumber + 1,
      speakerRole: selectedSegment.speakerRole ?? segmentDraftRole,
      splittingMode: segmentSplitMode,
      text: selectedText,
      topicLabel: newTitle,
    });
    const updatedOriginal: TranscriptSegment = {
      ...selectedSegment,
      createdBy: selectedSegment.createdBy ?? "manual",
      splittingMode: selectedSegment.splittingMode ?? segmentSplitMode,
      status: "Needs Review",
      text: remainingText,
    };
    const nextSegments = renumberLocalSegments([
      ...displaySegments.slice(0, selectedSegmentIndex),
      updatedOriginal,
      selectedSegmentDraft,
      ...displaySegments.slice(selectedSegmentIndex + 1),
    ]);

    setDisplaySegments(nextSegments);
    setSelectedSegmentId(selectedSegmentDraft.id);
    setMeaningUnitSegmentId(selectedSegmentDraft.id);
    setUnits([]);
    setDisplayCategories([]);
    setReviewerOutputs([]);
    setNarrative("");
    recordLocalAuditEvent({
      action: `Created ${selectedSegmentDraft.segmentId} from selected transcript text`,
      target: selectedSegmentDraft.segmentId,
    });
    setApiStatus(
      "Created a new meaning unit from the selected text. Review both boundaries before generating summaries.",
    );
  }

  async function deleteSelectedSegment() {
    if (!selectedSegment) {
      setApiStatus("Select a meaning unit first.");
      return;
    }

    setIsSavingSegment(true);
    setApiStatus("Deleting meaning unit...");

    try {
      if (isLocalOnlyMode) {
        const nextSegments = renumberLocalSegments(
          displaySegments.filter(
            (segment) => segment.id !== selectedSegment.id,
          ),
        );
        setDisplaySegments(nextSegments);
        setSelectedSegmentId(nextSegments[0]?.id ?? "");
        setMeaningUnitSegmentId(nextSegments[0]?.id ?? "");
        setUnits((current) =>
          current.filter(
            (unit) => unit.segmentId !== selectedSegment.segmentId,
          ),
        );
        setDisplayCategories([]);
        setReviewerOutputs([]);
        setNarrative("");
        setApiStatus(
          "Meaning unit deleted locally. Related summaries and categories were cleared.",
        );
        return;
      }

      const response = await fetch(
        `/api/segments/${selectedSegment.id}?projectId=${currentProject.id}`,
        { method: "DELETE" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        segments?: TranscriptSegment[];
      };
      if (!response.ok || !result.saved || !result.segments) {
        setApiStatus(result.error ?? "Meaning unit delete failed.");
        return;
      }
      setDisplaySegments(result.segments);
      setSelectedSegmentId(result.segments[0]?.id ?? "");
      setApiStatus("Meaning unit deleted.");
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Meaning unit delete failed.",
      );
    } finally {
      setIsSavingSegment(false);
    }
  }

  async function autoSplitTranscriptSegments() {
    if (!editableTranscript.trim()) {
      setApiStatus(
        "No transcript text found. Please confirm or edit the transcript before auto-delineation.",
      );
      return;
    }
    if (!transcriptConfirmed) {
      setApiStatus(
        "Confirm the transcript before auto-delineating meaning units.",
      );
      return;
    }
    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain. Review or anonymise them before delineation and analysis.",
      );
      return;
    }

    const confirmed = confirmWorkspaceAction(
      "Auto-delineation will replace the current meaning unit list. Existing summaries linked to these units may need to be regenerated. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setIsAutoSplittingTranscript(true);
    setApiStatus("Auto-delineating transcript into draft meaning units...");

    try {
      const cleanedSource = cleanTranscriptSourceForAnalysis(
        editableTranscript,
        currentProject,
      );
      if (!cleanedSource.transcript.trim()) {
        setApiStatus(
          "Only project setup or metadata was detected. Add the interview transcript / participant account before auto-delineation.",
        );
        return;
      }
      const response = await fetch("/api/segments/auto-split", {
        body: JSON.stringify({
          caseId: selectedSegment?.caseId ?? "CASE-001",
          projectId: currentProject.id,
          researchQuestion: currentProject.researchQuestion,
          splittingMode: segmentSplitMode,
          transcript: cleanedSource.transcript,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        notice?: string;
        reason?: string;
        saved?: boolean;
        segments?: TranscriptSegment[];
      };
      if (!response.ok || !result.saved || !result.segments) {
        setApiStatus(
          result.error ?? result.reason ?? "Auto-delineation failed.",
        );
        return;
      }

      setDisplaySegments(result.segments);
      setSelectedSegmentId(result.segments[0]?.id ?? "");
      setUnits([]);
      setDisplayCategories([]);
      setReviewerOutputs([]);
      setNarrative("");
      setApiStatus(
        result.notice ??
          `Created ${result.segments.length} draft meaning unit${result.segments.length === 1 ? "" : "s"}. Please review the suggested boundaries before analysis.`,
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Auto-delineation failed.",
      );
    } finally {
      setIsAutoSplittingTranscript(false);
    }
  }

  function getTranscriptForMeaningUnitGeneration() {
    return {
      transcript: editableTranscript,
    };
  }

  async function speakerSplitTranscriptSegments() {
    if (!editableTranscript.trim()) {
      setApiStatus(
        "Prepare and confirm a transcript before splitting by speaker labels.",
      );
      return;
    }
    if (!transcriptConfirmed) {
      setApiStatus(
        "Confirm the reviewed transcript before creating speaker segments.",
      );
      return;
    }
    const confirmed = confirmWorkspaceAction(
      "Speaker segmentation will replace the current segment list and clear existing meaning units, categories, reviewer issues, and integration outputs. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setIsSpeakerSplittingTranscript(true);
    clearWorkflowError();
    setApiStatus("Splitting transcript by speaker labels...");

    try {
      const cleanedSource = cleanTranscriptSourceForAnalysis(
        editableTranscript,
        currentProject,
      );
      const response = await fetch("/api/segments/speaker-split", {
        body: JSON.stringify({
          caseId: selectedSegment?.caseId ?? "CASE-001",
          projectId: currentProject.id,
          transcript: cleanedSource.transcript,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        notice?: string;
        reason?: string;
        saved?: boolean;
        segments?: TranscriptSegment[];
      };
      if (!response.ok || !result.saved || !result.segments) {
        setRecoverableWorkflowError(
          result.error ?? result.reason ?? "Speaker segmentation failed.",
          () => void speakerSplitTranscriptSegments(),
        );
        return;
      }

      setDisplaySegments(result.segments);
      setSelectedSegmentId(result.segments[0]?.id ?? "");
      setMeaningUnitSegmentId(
        result.segments.find((segment) => segment.speakerRole === "participant")
          ?.id ??
          result.segments[0]?.id ??
          "",
      );
      setUnits([]);
      setDisplayCategories([]);
      setReviewerOutputs([]);
      setNarrative("");
      setCategoryDraftNotice("");
      setCategoryDraftIsFallback(false);
      setApiStatus(
        result.notice ??
          `Created ${result.segments.length} speaker segment${result.segments.length === 1 ? "" : "s"}. Correct speaker type before generating meaning units.`,
      );
    } catch (error) {
      setRecoverableWorkflowError(
        error instanceof Error ? error.message : "Speaker segmentation failed.",
        () => void speakerSplitTranscriptSegments(),
      );
    } finally {
      setIsSpeakerSplittingTranscript(false);
    }
  }

  async function generateMeaningUnitsFromTranscript(
    forceRuleBased: boolean,
    signal: AbortSignal,
  ) {
    const generationSource = getTranscriptForMeaningUnitGeneration();
    const cleanedSource = cleanTranscriptSourceForAnalysis(
      generationSource.transcript,
      currentProject,
    );
    if (!cleanedSource.transcript.trim()) {
      throw new Error(
        "Only project setup or metadata was detected. Add the interview transcript / participant account before generating meaning units.",
      );
    }
    const meaningUnitTimeoutMs = getMeaningUnitRequestTimeoutMs();
    const response = await fetchWithTimeout("/api/ai/meaning-units", {
      body: JSON.stringify({
        background: false,
        caseId: displaySegments[0]?.caseId ?? "CASE-001",
        forceRuleBased,
        lightInterpretation,
        project: currentProject,
        projectId: currentProject.id,
        startingNumber: 1,
        timeoutMs: meaningUnitTimeoutMs,
        transcript: cleanedSource.transcript,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
      timeoutMs: meaningUnitTimeoutMs + 30000,
    });

    if (!response.ok) {
      const errorResult = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errorResult.error ?? "Meaning-unit API failed");
    }

    const result = (await response.json()) as {
      counts?: {
        participantTurns: number;
        substantiveMeaningUnits: number;
        contextOnlySegments: number;
        nonAnalyticSegments: number;
        uncertainSegments: number;
        openingBackgroundCandidates: number;
      };
      generationMethod?: "ai_semantic" | "mixed" | "rule_based_fallback";
      meaningUnits?: MeaningUnit[];
      fallbackUsed?: boolean;
      model?: string;
      persisted?: boolean;
      provider?: string;
    };

    const newUnits = result.meaningUnits;
    if (newUnits) {
      const draftUnits: MeaningUnit[] = newUnits.map(
        (unit): MeaningUnit => ({
          ...unit,
          aiExcerpt: unit.aiExcerpt ?? unit.excerpt,
          humanStatus:
            unit.analysisExcluded || unit.humanStatus === "Excluded"
              ? "Excluded"
              : unit.classification === "uncertain"
                ? "Needs review"
                : "Draft",
        }),
      );
      setUnits(draftUnits.sort((left, right) => left.number - right.number));
      setDisplaySegments((current) =>
        current.map((item) => ({ ...item, status: "Analysed" })),
      );
      const runMethod =
        result.generationMethod ??
        (forceRuleBased || result.fallbackUsed
          ? "rule_based_fallback"
          : "ai_semantic");
      const runDescription =
        runMethod === "ai_semantic"
          ? "Generated AI-assisted semantic"
          : runMethod === "mixed"
            ? "Generated AI-assisted semantic draft with provisional structural spans"
            : "Generated provisional structural spans";
      recordLocalAuditEvent({
        actor: "AI",
        action: `${runDescription}: ${result.counts?.substantiveMeaningUnits ?? draftUnits.filter((unit) => unit.classification === "substantive_participant").length} substantive MUs, ${result.counts?.contextOnlySegments ?? 0} context-only, ${result.counts?.nonAnalyticSegments ?? 0} non-analytic, ${result.counts?.uncertainSegments ?? 0} uncertain/provisional`,
        actionType:
          currentMeaningUnits.length > 0
            ? "meaning_units_redelineated"
            : "meaning_units_generated",
        newValue: draftUnits,
        previousValue: currentMeaningUnits,
        target: "Step 2 Meaning Units",
        targetType: "meaning_unit",
      });
      setMeaningUnitGenerationMethod(runMethod);
      setMeaningUnitGenerationStage(
        runMethod === "ai_semantic"
          ? "AI-assisted semantic draft generated. Review every boundary, classification, context link, and summary before accepting."
          : runMethod === "mixed"
            ? `AI semantic MUs were generated for successful windows; ${result.counts?.uncertainSegments ?? 0} provisional structural spans still require semantic delineation and summaries.`
            : "Provisional structural spans generated. Semantic MU delineation and summaries have not been generated and require researcher review.",
      );
    }

    return result;
  }

  async function generateMeaningUnits(
    segmentOverride?: TranscriptSegment | null,
    forceRuleBased = false,
  ) {
    if (!editableTranscript.trim()) {
      setApiStatus(
        "Prepare and confirm a transcript before generating meaning units.",
      );
      return;
    }
    if (!transcriptConfirmed) {
      setApiStatus(
        "Review and confirm the transcript before generating meaning units.",
      );
      return;
    }
    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain. Review or anonymise them before requesting AI analysis.",
      );
      return;
    }
    if (currentMeaningUnits.length > 0) {
      const confirmed = confirmWorkspaceAction(
        "Draft meaning units already exist. Redelineating will replace draft MU boundaries and clear later category/review outputs. Accepted/excluded decisions should be exported first if you need to preserve them. Continue?",
      );
      if (!confirmed) {
        return;
      }
      setDisplayCategories([]);
      setReviewerOutputs([]);
      setNarrative("");
    }

    const controller = new AbortController();
    const slowNoticeTimer = window.setTimeout(() => {
      setMeaningUnitGenerationStage(
        "Still working through semantic windows. Any window that cannot be completed will remain a clearly segregated provisional structural span for researcher review.",
      );
    }, 30000);
    meaningUnitAbortControllerRef.current = controller;
    setIsGeneratingMeaningUnits(true);
    setGenerationProgress({
      current: 1,
      label: "Confirmed transcript",
      total: 1,
    });
    setMeaningUnitGenerationStage(
      forceRuleBased
        ? "Generating provisional structural spans for manual semantic review."
        : "Parsing speaker roles and context before AI-assisted semantic delineation. Failed windows will be segregated rather than replacing successful semantic MUs.",
    );

    try {
      setApiStatus(
        forceRuleBased
          ? "Generating provisional structural spans..."
          : "Delineating draft meaning units from the confirmed transcript...",
      );
      const result = await generateMeaningUnitsFromTranscript(
        forceRuleBased,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setApiStatus(
          result.generationMethod === "ai_semantic"
            ? "AI-assisted semantic draft generated. Facilitator questions are retained as context, while participant meanings remain provisional until researcher acceptance."
            : result.generationMethod === "mixed"
              ? "AI semantic MUs were generated where Ollama succeeded. Provisional structural spans are segregated and require researcher delineation before categorisation."
              : "Provisional structural spans generated. Context is retained separately; semantic MU delineation and summaries have not been completed.",
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setApiStatus("Generation stopped by user.");
        return;
      }
      setRecoverableWorkflowError(
        error instanceof Error ? error.message : "Meaning-unit API failed",
        () => void generateMeaningUnits(segmentOverride, forceRuleBased),
      );
    } finally {
      window.clearTimeout(slowNoticeTimer);
      meaningUnitAbortControllerRef.current = null;
      setIsGeneratingMeaningUnits(false);
      setGenerationProgress(null);
    }
  }

  function stopMeaningUnitGeneration() {
    meaningUnitAbortControllerRef.current?.abort();
    meaningUnitAbortControllerRef.current = null;
    setIsGeneratingMeaningUnits(false);
    setGenerationProgress(null);
    setMeaningUnitGenerationStage("Generation stopped by user.");
    setApiStatus("Generation stopped by user.");
  }

  async function runCategories(
    options: {
      allowFallbackRegenerate?: boolean;
      modeOverride?: CategoryMode;
    } = {},
  ) {
    const requestedMode = options.modeOverride ?? mode;
    if (confirmedMeaningUnits.length === 0) {
      setApiStatus(
        "Accept meaning units before creating categories. Categories only use researcher-accepted, non-excluded meaning units.",
      );
      return;
    }
    if (requestedMode === "B" && displayCategories.length === 0) {
      setApiStatus("Construct provisional categories before refining them.");
      return;
    }
    if (
      (requestedMode === "B" || requestedMode === "C") &&
      hasTemporaryFallbackCategories &&
      !options.allowFallbackRegenerate
    ) {
      setApiStatus(
        "This category set is a fallback draft. Regenerate it or use it as an editable starting point before continuing.",
      );
      return;
    }
    if (requestedMode === "C") {
      if (displayCategories.length === 0) {
        setApiStatus(
          "Construct and review categories before integrating findings.",
        );
        return;
      }
      if (!allSegmentsProcessedForModeC) {
        setApiStatus(
          "Confirm that all meaning units in this transcript have been processed and reviewed before integrating findings.",
        );
        return;
      }
    }

    clearWorkflowError();
    setMode(requestedMode);
    setIsRunningCategories(true);
    setCategoryGenerationStage(
      requestedMode === "A"
        ? "Comparing accepted meaning units and drafting provisional groupings."
        : requestedMode === "B"
          ? "Comparing current categories, overlaps, and possible refinements."
          : "Reviewing category relationships for an integration draft.",
    );
    setApiStatus(getCategoryRunLabel(requestedMode, true));

    try {
      const response = await fetchWithTimeout("/api/ai/categories", {
        body: JSON.stringify({
          mode: requestedMode,
          projectId: currentProject.id,
          allBatchesProcessed: allSegmentsProcessedForModeC,
          categories: displayCategories,
          integratedNarrative: narrative,
          project: currentProject,
          units: confirmedMeaningUnits,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 900000,
      });
      if (!response.ok) {
        const errorResult = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setRecoverableWorkflowError(
          errorResult.error ?? `${getCategoryRunLabel(requestedMode)} failed`,
          () => void runCategories({ ...options, modeOverride: requestedMode }),
        );
        return;
      }
      const result = (await response.json()) as {
        categories?: CategoryNode[];
        categoryRevisions?: string[];
        integratedNarrative?: string;
        isFallbackDraft?: boolean;
        persisted?: boolean;
        provider?: string;
        uncertainties?: string[];
      };
      if (result.categories) {
        setDisplayCategories(result.categories);
      }
      setNarrative(result.integratedNarrative ?? "");
      setCategoryDraftIsFallback(Boolean(result.isFallbackDraft));
      const warning =
        result.uncertainties?.[0] ?? result.categoryRevisions?.[0] ?? "";
      setCategoryDraftNotice(
        result.isFallbackDraft
          ? "The assistant returned an empty response, so a temporary draft was created to keep the workflow testable. You can redraft it or use it as an editable starting point; please do not treat it as final analysis."
          : warning,
      );
      setApiStatus(
        `${warning ? `${warning} ` : ""}${getCategoryRunLabel(requestedMode)} completed using ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`,
      );
    } catch (error) {
      setRecoverableWorkflowError(
        error instanceof Error
          ? error.message
          : `${getCategoryRunLabel(requestedMode)} failed`,
        () => void runCategories({ ...options, modeOverride: requestedMode }),
      );
    } finally {
      setIsRunningCategories(false);
      setCategoryGenerationStage("");
    }
  }

  async function acceptTemporaryCategoryDraft() {
    if (!hasTemporaryFallbackCategories || displayCategories.length === 0) {
      setApiStatus(
        "No temporary fallback category draft is available to accept.",
      );
      return;
    }

    const confirmed = confirmWorkspaceAction(
      isLocalOnlyMode
        ? "This will mark the temporary fallback category draft as researcher-confirmed in this local browser session. Only continue if you have reviewed it and accept it for prototype testing."
        : "This will save the temporary fallback category draft to Supabase for prototype testing. Only continue if you have reviewed it and accept it as a researcher-confirmed draft.",
    );
    if (!confirmed) {
      return;
    }

    setIsRunningCategories(true);
    if (isLocalOnlyMode) {
      setDisplayCategories(markCategoriesEditableDraft(displayCategories));
      setCategoryDraftIsFallback(false);
      setCategoryDraftNotice(
        "Fallback draft is now an editable starting point. It still requires review, renaming, evidence checks, and confirmation.",
      );
      setApiStatus("Fallback draft kept as editable draft only.");
      setIsRunningCategories(false);
      return;
    }

    setApiStatus("Saving researcher-confirmed temporary category draft...");
    try {
      const response = await fetchWithTimeout("/api/ai/categories", {
        body: JSON.stringify({
          acceptFallbackDraft: true,
          categories: displayCategories,
          integratedNarrative: narrative,
          mode,
          projectId: currentProject.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 120000,
      });
      const result = (await response.json().catch(() => ({}))) as {
        categories?: CategoryNode[];
        error?: string;
        integratedNarrative?: string;
        persisted?: boolean;
      };
      if (!response.ok || !result.persisted) {
        setApiStatus(
          result.error ?? "Temporary category draft could not be saved.",
        );
        return;
      }
      setDisplayCategories(result.categories ?? displayCategories);
      setNarrative(result.integratedNarrative ?? narrative);
      setCategoryDraftIsFallback(false);
      setCategoryDraftNotice(
        "Temporary fallback draft saved after explicit researcher confirmation. Review/refine it before using it as final analysis.",
      );
      setApiStatus(
        "Temporary category draft saved to Supabase after researcher confirmation.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Temporary category draft could not be saved.",
      );
    } finally {
      setIsRunningCategories(false);
    }
  }

  async function generateIntegrationStructureDraft() {
    if (hasTemporaryFallbackCategories) {
      setApiStatus(
        "This category set is still a fallback draft. Review or regenerate categories before integrating.",
      );
      return;
    }
    if (
      confirmedMeaningUnits.length === 0 ||
      reviewedIntegrationCategories.length < 2
    ) {
      setApiStatus(
        "Not enough reviewed categories to generate an integration structure. Please return to Step 3 and accept or revise categories first.",
      );
      return;
    }
    if (!allSegmentsProcessedForModeC) {
      setApiStatus(
        "Confirm that all meaning units in this transcript have been processed and reviewed before generating an integration draft.",
      );
      return;
    }

    const draft = buildIntegrationStructureDraft({
      categories: reviewedIntegrationCategories,
      researchQuestion: currentProject.researchQuestion,
      units: confirmedMeaningUnits,
    });
    setIntegrationStructureTitle(draft.title);
    setIntegrationStructureExplanation(draft.explanation);
    setIntegrationRelationships(draft.relationships);
    setIntegrationStructureNotice(
      "Provisional relationship structure generated from reviewed categories. Researcher review needed; edit before treating it as an analytic finding.",
    );
    setNarrative(draft.narrative);
    setIntegrationReviewed(false);
    setApiStatus(
      "Provisional relationship structure, draft category map, and editable narrative created from reviewed categories.",
    );
    await persistIntegrationWorkspace({
      action: "Generated provisional integration structure",
      actionType: "relationship_created",
      narrativeValue: draft.narrative,
      noteValue: integrationNote,
      relationships: draft.relationships,
    });
  }

  function addIntegrationRelationship() {
    if (reviewedIntegrationCategories.length < 2) {
      setApiStatus(
        "Add at least two reviewed categories before creating a relationship.",
      );
      return;
    }
    const [source, target] = reviewedIntegrationCategories;
    const nextRelationship: IntegrationRelationshipDraft = {
      evidenceUnitNumbers: Array.from(
        new Set([
          ...source.includedUnitIds.filter((unitNumber) =>
            acceptedMeaningUnitNumbers.has(unitNumber),
          ),
          ...target.includedUnitIds.filter((unitNumber) =>
            acceptedMeaningUnitNumbers.has(unitNumber),
          ),
        ]),
      ).slice(0, 4),
      id: `rel_manual_${Date.now()}`,
      rationale:
        "Researcher-created provisional relationship. Edit the rationale and evidence references before use.",
      researcherNote: "",
      sourceCategoryId: source.id,
      targetCategoryId: target.id,
      label: "unclear relationship",
    };
    const nextRelationships = [...integrationRelationships, nextRelationship];
    setIntegrationRelationships(nextRelationships);
    setIntegrationStructureNotice(
      "Relationship added as an editable researcher draft. Save the integration draft after editing rationale and evidence.",
    );
    void persistIntegrationWorkspace({
      action: "Added integration relationship",
      actionType: "relationship_created",
      relationships: nextRelationships,
    });
  }

  function updateIntegrationRelationship(
    relationshipId: string,
    updates: Partial<IntegrationRelationshipDraft>,
  ) {
    const existingRelationship = integrationRelationships.find(
      (relationship) => relationship.id === relationshipId,
    );
    setIntegrationRelationships((current) =>
      current.map((relationship) =>
        relationship.id === relationshipId
          ? { ...relationship, ...updates }
          : relationship,
      ),
    );
    if (existingRelationship) {
      const auditActions: string[] = [];
      if (
        updates.evidenceUnitNumbers &&
        updates.evidenceUnitNumbers.join(",") !==
          existingRelationship.evidenceUnitNumbers.join(",")
      ) {
        const previous = new Set(existingRelationship.evidenceUnitNumbers);
        const next = new Set(updates.evidenceUnitNumbers);
        const added = updates.evidenceUnitNumbers.filter(
          (unitNumber) => !previous.has(unitNumber),
        );
        const removed = existingRelationship.evidenceUnitNumbers.filter(
          (unitNumber) => !next.has(unitNumber),
        );
        if (added.length > 0) {
          auditActions.push(
            `Added MU evidence ${added.join(", ")} to relationship`,
          );
        }
        if (removed.length > 0) {
          auditActions.push(
            `Removed MU evidence ${removed.join(", ")} from relationship`,
          );
        }
      }
      if (
        typeof updates.rationale === "string" &&
        updates.rationale !== existingRelationship.rationale
      ) {
        auditActions.push("Edited relationship rationale");
      }
      if (updates.label && updates.label !== existingRelationship.label) {
        auditActions.push(`Changed relationship type to ${updates.label}`);
      }
      auditActions.forEach((action) =>
        recordLocalAuditEvent({
          action,
          target: `Step 4 relationship ${relationshipId}`,
        }),
      );
    }
    setIntegrationStructureNotice(
      "Relationship edited. Save the integration draft to persist rationale, type, and evidence changes.",
    );
    setIntegrationReviewed(false);
  }

  function removeIntegrationRelationship(relationshipId: string) {
    const nextRelationships = integrationRelationships.filter(
      (relationship) => relationship.id !== relationshipId,
    );
    setIntegrationRelationships(nextRelationships);
    setIntegrationStructureNotice(
      "Relationship removed from the provisional structure. Save the integration draft to persist this change.",
    );
    setIntegrationReviewed(false);
    void persistIntegrationWorkspace({
      action: "Removed integration relationship",
      actionType: "relationship_deleted",
      relationships: nextRelationships,
    });
  }

  async function saveIntegrationDraft() {
    await persistIntegrationWorkspace({
      action: "Saved Step 4 integration draft",
      actionType: "relationship_updated",
    });
  }

  async function persistIntegrationWorkspace({
    action,
    actionType = "relationship_updated",
    narrativeValue = narrative,
    noteValue = integrationNote,
    relationships = integrationRelationships,
    reviewed = false,
  }: {
    action: string;
    actionType?: AuditActionType;
    narrativeValue?: string;
    noteValue?: string;
    relationships?: IntegrationRelationshipDraft[];
    reviewed?: boolean;
  }) {
    setIsSavingIntegration(true);

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action,
        target: "Step 4 integration workspace",
      });
      setIntegrationSavedAt(new Date().toISOString());
      setIntegrationReviewed(reviewed || integrationReviewed);
      setApiStatus("Integration draft saved locally for this browser session.");
      setIsSavingIntegration(false);
      return true;
    }

    try {
      const response = await fetch("/api/integration", {
        body: JSON.stringify({
          action,
          actionType,
          integratedNarrative: narrativeValue,
          integrationMemo: noteValue,
          projectId: currentProject.id,
          relationships: relationships.map((relationship) => ({
            evidenceUnitNumbers: relationship.evidenceUnitNumbers,
            id: relationship.id,
            label: relationship.label,
            memo: encodeIntegrationRelationshipDraft(relationship),
            rationale: relationship.rationale,
            researcherNote: relationship.researcherNote,
            sourceCategoryId: relationship.sourceCategoryId,
            targetCategoryId: relationship.targetCategoryId,
          })),
          reviewed,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        integrationMemo?: string;
        integratedNarrative?: string;
        relationships?: StoredIntegrationRelationship[];
        saved?: boolean;
      };

      if (!response.ok || !result.saved) {
        setApiStatus(result.error ?? "Integration draft could not be saved.");
        return false;
      }

      setNarrative(result.integratedNarrative ?? narrativeValue);
      setIntegrationNote(result.integrationMemo ?? noteValue);
      setIntegrationRelationships(
        buildIntegrationRelationshipDrafts({
          categories: reviewedIntegrationCategories,
          storedRelationships: result.relationships ?? [],
          units: confirmedMeaningUnits,
        }),
      );
      setIntegrationReviewed(reviewed || integrationReviewed);
      setIntegrationSavedAt(new Date().toISOString());
      setApiStatus(`${action} and saved to Supabase.`);
      return true;
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Integration draft could not be saved.",
      );
      return false;
    } finally {
      setIsSavingIntegration(false);
    }
  }

  async function runReviewer(reviewerWorkspace: ReviewerWorkspace) {
    if (units.length === 0) {
      setApiStatus(
        "Generate meaning units before running methodological integrity checks.",
      );
      return;
    }
    if (reviewerWorkspace === "meaning-units") {
      runMeaningUnitIntegrityReview();
      return;
    }
    if (reviewerWorkspace === "categories" && displayCategories.length === 0) {
      setApiStatus("Create categories before running the category review.");
      return;
    }

    setIsRunningReviewer(true);
    setApiStatus(
      reviewerWorkspace === "categories"
        ? "Running category methodological integrity check..."
        : "Running meaning-unit methodological integrity check...",
    );

    try {
      const response = await fetchWithTimeout("/api/ai/reviewer", {
        body: JSON.stringify({
          categories: displayCategories,
          integratedNarrative: narrative,
          mode,
          projectId: currentProject.id,
          project: currentProject,
          units,
          workspace: reviewerWorkspace,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 900000,
      });
      if (!response.ok) {
        const errorResult = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setApiStatus(
          errorResult.error ?? "Methodological integrity check failed",
        );
        return;
      }
      const result = (await response.json()) as {
        comments?: ReviewerComment[];
        persisted?: boolean;
        provider?: string;
      };
      setReviewerOutputs((current) => [
        ...current.filter((comment) => comment.workspace !== reviewerWorkspace),
        ...(result.comments ?? []),
      ]);
      setApiStatus(
        `Methodological integrity check applied from ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`,
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Methodological integrity check failed",
      );
    } finally {
      setIsRunningReviewer(false);
    }
  }

  function runMeaningUnitIntegrityReview() {
    setIsRunningReviewer(true);
    setApiStatus("Running Meaning Unit Integrity Support...");

    const comments = buildMeaningUnitIntegrityIssues(currentMeaningUnits);
    setReviewerOutputs((current) => [
      ...current.filter((comment) => comment.workspace !== "meaning-units"),
      ...comments,
    ]);
    setMuIntegrityReviewRan(true);
    recordLocalAuditEvent({
      actor: "Reviewer",
      action: `Ran Step 2 MU integrity support (${comments.length} issue${comments.length === 1 ? "" : "s"})`,
      target: "Meaning Unit Integrity Support",
    });
    setApiStatus(
      comments.length === 0
        ? "No major Step 2 integrity issues found. Please still review meaning-unit boundaries and summaries carefully."
        : `Meaning Unit Integrity Support found ${comments.length} point${comments.length === 1 ? "" : "s"} for researcher review.`,
    );
    setIsRunningReviewer(false);
  }

  async function updateCategoryDraft(
    categoryId: string,
    updates: Partial<CategoryNode>,
  ) {
    const previousCategories = displayCategories;
    const existingCategory = previousCategories.find(
      (item) => item.id === categoryId,
    );
    const nextCategories: CategoryNode[] = previousCategories.map((category) =>
      category.id === categoryId
        ? {
            ...category,
            ...updates,
            status: updates.status ?? getEditedCategoryStatus(category.status),
          }
        : category,
    );
    const actionType: AuditActionType =
      typeof updates.name === "string" &&
      updates.name !== existingCategory?.name
        ? "category_renamed"
        : "category_updated";
    await persistCategorySystem({
      action:
        actionType === "category_renamed"
          ? `Renamed category ${existingCategory?.name ?? categoryId} to ${updates.name}`
          : `Updated category ${existingCategory?.name ?? categoryId}`,
      actionType,
      nextCategories,
      previousCategories,
      researcherNote:
        typeof updates.memo === "string" ||
        typeof updates.rationale === "string"
          ? (updates.memo ?? updates.rationale)
          : undefined,
    });
  }

  async function addCategoryDraft(unitNumbers: number[] = []) {
    const name =
      promptWorkspaceText(
        "New category title:",
        "New draft category",
      )?.trim() || "New draft category";
    const previousCategories = displayCategories;
    const nextCategory: CategoryNode = {
      definition:
        "Researcher-created draft category. Add a short analytic definition.",
      id: `cat_manual_${Date.now()}`,
      includedUnitIds: unitNumbers,
      name,
      source: "researcher_confirmed",
      status: "edited",
    };
    await persistCategorySystem({
      action: `Created category ${name}`,
      actionType: "category_created",
      nextCategories: [...previousCategories, nextCategory],
      previousCategories,
      researcherNote:
        unitNumbers.length > 0
          ? `Created from MU ${unitNumbers.join(", ")}`
          : "Researcher-created empty category",
    });
  }

  async function removeMeaningUnitFromCategory(
    categoryId: string,
    unitNumber: number,
  ) {
    const previousCategories = displayCategories;
    const category = previousCategories.find((item) => item.id === categoryId);
    const nextCategories: CategoryNode[] = previousCategories.map((item) =>
      item.id === categoryId
        ? {
            ...item,
            includedUnitIds: item.includedUnitIds.filter(
              (number) => number !== unitNumber,
            ),
            status: getEditedCategoryStatus(item.status),
          }
        : item,
    );
    await persistCategorySystem({
      action: `Removed MU #${unitNumber} from ${category?.name ?? categoryId}`,
      actionType: "meaning_unit_moved",
      nextCategories,
      previousCategories,
    });
  }

  async function assignMeaningUnitToCategory(
    unitNumber: number,
    categoryId: string,
  ) {
    const previousCategories = displayCategories;
    const target = previousCategories.find(
      (category) => category.id === categoryId,
    );
    const previousCategory = previousCategories.find((category) =>
      category.includedUnitIds.includes(unitNumber),
    );
    const nextCategories: CategoryNode[] = previousCategories.map(
      (category) => {
        const withoutUnit = category.includedUnitIds.filter(
          (number) => number !== unitNumber,
        );
        if (category.id !== categoryId) {
          return { ...category, includedUnitIds: withoutUnit };
        }
        return {
          ...category,
          includedUnitIds: Array.from(
            new Set([...withoutUnit, unitNumber]),
          ).sort((left, right) => left - right),
          status: getEditedCategoryStatus(category.status),
        };
      },
    );
    await persistCategorySystem({
      action: `Moved MU #${unitNumber} to ${target?.name ?? categoryId}`,
      actionType: "meaning_unit_moved",
      nextCategories,
      previousCategories,
      researcherNote: previousCategory
        ? `Previous category: ${previousCategory.name}`
        : "Previously unassigned",
    });
  }

  async function deleteCategoryDraft(category: CategoryNode) {
    if (
      category.includedUnitIds.length > 0 &&
      !confirmWorkspaceAction(
        `${category.name} contains ${category.includedUnitIds.length} MU(s). Delete it and move those MUs to Unassigned?`,
      )
    ) {
      return;
    }

    const previousCategories = displayCategories;
    const nextCategories = previousCategories.filter(
      (item) => item.id !== category.id,
    );
    await persistCategorySystem({
      action: `Deleted category ${category.name}`,
      actionType: "category_deleted",
      nextCategories,
      previousCategories,
      researcherNote:
        category.includedUnitIds.length > 0
          ? `MUs returned to unassigned: ${category.includedUnitIds.join(", ")}`
          : undefined,
    });
  }

  async function mergeCategoryDraft(category: CategoryNode) {
    const targetId = promptWorkspaceText(
      `Merge "${category.name}" into which category ID? Available: ${displayCategories
        .filter((item) => item.id !== category.id)
        .map((item) => item.id)
        .join(", ")}`,
    );
    const target = displayCategories.find((item) => item.id === targetId);
    if (!target) {
      setApiStatus("Choose a valid target category ID to merge.");
      return;
    }

    const mergedName =
      promptWorkspaceText("Merged category title:", target.name)?.trim() ||
      target.name;
    const previousCategories = displayCategories;
    const nextCategories = previousCategories
      .filter((item) => item.id !== category.id)
      .map((item) =>
        item.id === target.id
          ? {
              ...item,
              definition:
                `${item.definition}\n\nMerged note: ${category.definition}`.trim(),
              includedUnitIds: Array.from(
                new Set([...item.includedUnitIds, ...category.includedUnitIds]),
              ).sort((left, right) => left - right),
              name: mergedName,
              status: "edited" as const,
            }
          : item,
      );
    await persistCategorySystem({
      action: `Merged category ${category.name} into ${mergedName}`,
      actionType: "category_updated",
      nextCategories,
      previousCategories,
      researcherNote: `Merged into target category ${target.name}`,
    });
  }

  async function splitCategoryDraft(category: CategoryNode) {
    if (category.includedUnitIds.length < 2) {
      setApiStatus(
        "Add at least two meaning units before splitting this category.",
      );
      return;
    }
    const splitIndex = Math.ceil(category.includedUnitIds.length / 2);
    const remainingUnitIds = category.includedUnitIds.slice(0, splitIndex);
    const splitUnitIds = category.includedUnitIds.slice(splitIndex);
    const splitName =
      window
        .prompt(
          "Title for the new split category:",
          "Untitled provisional category",
        )
        ?.trim() || "Untitled provisional category";
    const splitCategory: CategoryNode = {
      definition:
        "Researcher-created split category. Add a short analytic definition.",
      id: `cat_split_${Date.now()}`,
      includedUnitIds: splitUnitIds,
      name: splitName,
      source: "researcher_confirmed",
      status: "edited",
    };

    const previousCategories = displayCategories;
    const nextCategories = [
      ...previousCategories.map((item) =>
        item.id === category.id
          ? {
              ...item,
              includedUnitIds: remainingUnitIds,
              status:
                item.status === "confirmed"
                  ? ("confirmed" as const)
                  : ("edited" as const),
            }
          : item,
      ),
      splitCategory,
    ];
    await persistCategorySystem({
      action: `Split category ${category.name}`,
      actionType: "category_updated",
      nextCategories,
      previousCategories,
      researcherNote: `New split category ${splitName} contains MU ${splitUnitIds.join(", ")}`,
    });
  }

  async function confirmCategoryDraft(categoryId: string) {
    const category = displayCategories.find((item) => item.id === categoryId);
    if (!category) {
      return;
    }
    const categoryTitle = getCategoryTitleInputValue(category).trim();
    const categoryDefinition = getCategoryDescriptionValue(category).trim();
    if (!categoryTitle || category.includedUnitIds.length === 0) {
      setApiStatus(
        "An evidence cluster needs a researcher category name and at least one included MU before it can be confirmed.",
      );
      return;
    }
    if (!categoryDefinition) {
      setApiStatus(
        "Add a shared-meaning definition before confirming this evidence cluster as a provisional category.",
      );
      return;
    }
    if (hasSensitivePlaceholder(categoryTitle)) {
      setApiStatus(
        "Category title contains a sensitive placeholder. Rename it before confirming.",
      );
      return;
    }
    await updateCategoryDraft(categoryId, { status: "confirmed" });
    setApiStatus("Category confirmed as researcher-reviewed draft.");
  }

  async function rejectCategoryDraft(category: CategoryNode) {
    if (
      !confirmWorkspaceAction(
        `Reject "${category.name}"? Its meaning units will move to Unassigned.`,
      )
    ) {
      return;
    }
    await updateCategoryDraft(category.id, {
      includedUnitIds: [],
      status: "rejected",
    });
  }

  function updateIntegrityReviewItem(
    itemId: string,
    updates: Partial<
      Pick<IntegrityReviewItem, "researcherNote" | "response" | "status">
    >,
  ) {
    setDisplayIntegrityItems((current) => {
      const baseItems = mergeIntegrityReviewItems(
        integrityChecklistItems,
        current,
      );
      return baseItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
    });
  }

  function refreshIntegrityChecklistFromProjectState() {
    setDisplayIntegrityItems((current) =>
      mergeIntegrityReviewItems(
        buildIntegrityReviewItemsFromState({
          auditEvents: displayAuditEvents,
          categories: displayCategories,
          categoryReviewIssues,
          confirmedMeaningUnits,
          excludedMeaningUnits,
          integrationRelationships,
          integrationReviewed,
          meaningUnitReviewIssues,
          meaningUnits: currentMeaningUnits,
          narrative,
          project: currentProject,
          transcriptConfirmed,
          unassignedMeaningUnits,
        }),
        current,
      ),
    );
    setApiStatus(
      "Methodological integrity checklist refreshed from the current project state.",
    );
  }

  async function saveIntegrityReview() {
    const itemsToSave = integrityChecklistItems.map((item) => ({
      ...item,
      updatedAt: new Date().toISOString(),
    }));
    setDisplayIntegrityItems(itemsToSave);
    setIsSavingIntegrityReview(true);

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: "Updated methodological integrity review locally",
        target: "Step 5 methodological integrity review",
      });
      setIntegritySavedAt(new Date().toISOString());
      setApiStatus(
        "Methodological integrity review saved locally for this browser session.",
      );
      setIsSavingIntegrityReview(false);
      return;
    }

    try {
      const response = await fetch("/api/integrity", {
        body: JSON.stringify({
          action: "Updated Step 5 methodological integrity review",
          items: itemsToSave,
          projectId: currentProject.id,
          researcherNote:
            "Researcher reviewed Step 5 methodological integrity checklist",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        items?: IntegrityReviewItem[];
        saved?: boolean;
      };

      if (!response.ok || !result.saved) {
        setApiStatus(
          result.error ?? "Methodological integrity review could not be saved.",
        );
        return;
      }

      setDisplayIntegrityItems(result.items ?? itemsToSave);
      setIntegritySavedAt(new Date().toISOString());
      setApiStatus("Methodological integrity review saved to Supabase.");
      void refreshWorkspace();
      return true;
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Methodological integrity review could not be saved.",
      );
    } finally {
      setIsSavingIntegrityReview(false);
    }
  }

  async function recordExportEvent(format: AnalysisExportFormat) {
    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Generated ${format.toUpperCase()} export locally`,
        target: "Export",
      });
      return;
    }

    try {
      const response = await fetch("/api/export-records", {
        body: JSON.stringify({
          format,
          projectId: currentProject.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (response.ok) {
        const result = (await response.json().catch(() => ({}))) as {
          exportRecord?: ExportRecord;
        };
        if (result.exportRecord) {
          setDisplayExportRecords((current) => [
            result.exportRecord as ExportRecord,
            ...current.filter((item) => item.id !== result.exportRecord?.id),
          ]);
        }
        void refreshWorkspace();
      }
    } catch {
      // Export should still download even if the audit event cannot be recorded.
    }
  }

  async function updateReviewerIssue(
    commentId: string,
    updates: { memo?: string; status?: ReviewerComment["status"] },
  ) {
    const isSessionOnlyIssue = commentId.startsWith("mu_integrity_");
    if (isLocalOnlyMode || isSessionOnlyIssue) {
      setReviewerOutputs((current) =>
        current.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                researcherMemo: updates.memo ?? comment.researcherMemo,
                resolved: updates.status
                  ? updates.status === "resolved"
                  : comment.resolved,
                resolvedAt:
                  updates.status === "resolved"
                    ? new Date().toISOString()
                    : comment.resolvedAt,
                status: updates.status ?? comment.status,
              }
            : comment,
        ),
      );
      recordLocalAuditEvent({
        action: updates.status
          ? `${updates.status === "resolved" ? "Resolved" : "Dismissed"} MU integrity issue`
          : "Updated memo on MU integrity issue",
        target: commentId,
      });
      setApiStatus(
        "Meaning Unit Integrity Support item updated for this session.",
      );
      return;
    }

    const response = await fetch(`/api/reviewer-comments/${commentId}`, {
      body: JSON.stringify({
        ...updates,
        projectId: currentProject.id,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const result = (await response.json().catch(() => ({}))) as {
      comment?: ReviewerComment;
      error?: string;
      saved?: boolean;
    };
    if (!response.ok || !result.saved || !result.comment) {
      setApiStatus(result.error ?? "Integrity issue update failed.");
      return;
    }
    setReviewerOutputs((current) =>
      current.map((comment) =>
        comment.id === result.comment?.id ? result.comment : comment,
      ),
    );
    setApiStatus("Integrity issue updated.");
  }

  function viewReviewerTarget(comment: ReviewerComment) {
    if (comment.workspace === "meaning-units") {
      recordLocalAuditEvent({
        action: "Opened MU from integrity issue",
        target: comment.target,
      });
    }
    const targetId =
      comment.targetType === "category" || comment.targetType === "subcategory"
        ? `category-${comment.targetId}`
        : comment.targetType === "integrated_narrative"
          ? "integrated-narrative"
          : comment.targetId.replace(/^MU/i, "mu-");
    const step: WorkflowStep =
      comment.targetType === "integrated_narrative"
        ? "integrating"
        : comment.workspace === "categories"
          ? "categorizing"
          : "understanding";
    setActiveStep(step);
    window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      document.getElementById(targetId)?.classList.add("target-highlight");
      window.setTimeout(
        () =>
          document
            .getElementById(targetId)
            ?.classList.remove("target-highlight"),
        1800,
      );
    }, 80);
  }

  function clearDerivedAnalysisAfterMeaningUnitChange() {
    setDisplayCategories([]);
    setNarrative("");
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
  }

  function getEditedCategoryStatus(
    status: CategoryNode["status"],
  ): CategoryNode["status"] {
    return status === "confirmed" ? "confirmed" : "edited";
  }

  async function persistCategorySystem({
    action,
    actionType = "category_updated",
    nextCategories,
    previousCategories = displayCategories,
    researcherNote,
  }: {
    action: string;
    actionType?: AuditActionType;
    nextCategories: CategoryNode[];
    previousCategories?: CategoryNode[];
    researcherNote?: string;
  }) {
    setDisplayCategories(nextCategories);
    setNarrative("");
    setReviewerOutputs((current) =>
      current.filter((comment) => comment.workspace !== "categories"),
    );
    setCategoryDraftNotice(
      `${action}. Category changes are researcher-led and should be reviewed against accepted meaning units.`,
    );
    setCategoryDraftIsFallback(false);

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action,
        target: "Step 3 category system",
      });
      return true;
    }

    try {
      const response = await fetch("/api/categories", {
        body: JSON.stringify({
          action,
          actionType,
          categories: nextCategories,
          integratedNarrative: "",
          mode,
          previousCategories,
          projectId: currentProject.id,
          researcherNote,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        categories?: CategoryNode[];
        error?: string;
        reason?: string;
        saved?: boolean;
      };

      if (!response.ok || !result.saved) {
        setApiStatus(
          result.error ??
            result.reason ??
            "Category change could not be saved.",
        );
        setDisplayCategories(previousCategories);
        return false;
      }

      setDisplayCategories(result.categories ?? nextCategories);
      setApiStatus(`${action} and saved to Supabase.`);
      return true;
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Category change could not be saved.",
      );
      setDisplayCategories(previousCategories);
      return false;
    }
  }

  function recordLocalAuditEvent({
    action,
    actionType,
    actor = "Researcher",
    newValue,
    previousValue,
    target = "Step 2 meaning-unit pipeline",
    targetType,
  }: {
    action: string;
    actionType?: AuditEvent["actionType"];
    actor?: AuditEvent["actor"];
    newValue?: unknown;
    previousValue?: unknown;
    target?: string;
    targetType?: AuditEvent["targetType"];
  }) {
    if (!isLocalOnlyMode) {
      return;
    }
    const now = new Date().toISOString();
    setDisplayAuditEvents((current) => [
      {
        actor,
        action,
        actionType,
        id: `audit_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        newValue,
        previousValue,
        target,
        targetType,
        timestamp: now,
      },
      ...current,
    ]);
  }

  function createLocalMeaningUnitDraft({
    excerpt,
    humanSummary = "",
    segmentId,
    speaker = "Participant",
  }: {
    excerpt: string;
    humanSummary?: string;
    segmentId?: string;
    speaker?: string;
  }): MeaningUnit {
    const nextNumber =
      Math.max(0, ...reviewableMeaningUnits.map((unit) => unit.number)) + 1;
    const sourceSegment =
      displaySegments.find((segment) => segment.segmentId === segmentId) ??
      selectedMeaningUnitSegment ??
      displaySegments[0];
    return {
      aiExcerpt: excerpt.trim(),
      aiSummary: "",
      analysisExcluded: false,
      caseId: sourceSegment?.caseId ?? "CASE-001",
      classification: "substantive_participant",
      excerpt: excerpt.trim(),
      generationMethod: "researcher",
      humanStatus: "Needs review",
      humanSummary: humanSummary.trim(),
      id: `mu_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      number: nextNumber,
      reviewerStatus: "Not run",
      segmentId: segmentId ?? sourceSegment?.segmentId ?? "SEG-001",
      speaker,
      speakerRole: "participant",
      uncertainty: "Researcher-created meaning unit",
    };
  }

  function renumberMeaningUnitsForDisplay(nextUnits: MeaningUnit[]) {
    return normalizeMeaningUnitNumbersForSegments(nextUnits, displaySegments);
  }

  async function addManualMeaningUnit() {
    const excerpt = window
      .prompt(
        "New meaning-unit excerpt. Keep it close to the participant account:",
      )
      ?.trim();
    if (!excerpt) {
      return;
    }
    const humanSummary =
      window
        .prompt("Optional researcher summary for this manual MU:", "")
        ?.trim() ?? "";
    const researcherNote =
      window
        .prompt(
          "Optional audit note for why this manual MU was added:",
          "Manual MU added during researcher review",
        )
        ?.trim() ?? "Manual MU added during researcher review";
    const sourceSegment = selectedMeaningUnitSegment ?? displaySegments[0];

    setIsSavingMeaningUnitAction(true);
    setApiStatus("Adding manual meaning unit...");

    try {
      if (isLocalOnlyMode) {
        const manualUnit = createLocalMeaningUnitDraft({
          excerpt,
          humanSummary,
          segmentId: sourceSegment?.segmentId,
          speaker: "Participant",
        });
        setUnits((current) =>
          renumberMeaningUnitsForDisplay([...current, manualUnit]),
        );
        clearDerivedAnalysisAfterMeaningUnitChange();
        recordLocalAuditEvent({
          action: `Created manual MU #${manualUnit.number}: ${researcherNote}`,
          target: manualUnit.id,
        });
        setApiStatus(
          "Manual meaning unit added locally. Review it before accepting.",
        );
        return;
      }

      const response = await fetch("/api/meaning-units", {
        body: JSON.stringify({
          action: "manual_create",
          caseId: sourceSegment?.caseId ?? "CASE-001",
          excerpt,
          humanSummary,
          projectId: currentProject.id,
          researcherNote,
          segmentId: sourceSegment?.segmentId ?? "SEG-001",
          speaker: "Participant",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        units?: MeaningUnit[];
      };
      if (!response.ok || !result.saved) {
        setApiStatus(result.error ?? "Manual meaning unit could not be added.");
        return;
      }
      setUnits(result.units ?? []);
      clearDerivedAnalysisAfterMeaningUnitChange();
      setApiStatus(
        "Manual meaning unit added and audit logged. Review it before accepting.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Manual meaning unit could not be added.",
      );
    } finally {
      setIsSavingMeaningUnitAction(false);
    }
  }

  function findMeaningUnitNeighbor(
    unit: MeaningUnit,
    direction: "previous" | "next",
  ) {
    const ordered = [...reviewableMeaningUnits].sort(
      (left, right) => left.number - right.number,
    );
    const index = ordered.findIndex((item) => item.id === unit.id);
    return direction === "previous" ? ordered[index - 1] : ordered[index + 1];
  }

  function suggestMeaningUnitSplit(text: string) {
    const trimmed = text.trim();
    const sentenceBoundary = trimmed.search(/(?<=[.!?。！？])\s+/u);
    if (sentenceBoundary > 0 && sentenceBoundary < trimmed.length - 1) {
      const firstEnd = sentenceBoundary + 1;
      return {
        first: trimmed.slice(0, firstEnd).trim(),
        second: trimmed.slice(firstEnd).trim(),
      };
    }
    const midpoint = Math.floor(trimmed.length / 2);
    const nearestSpace = trimmed.indexOf(" ", midpoint);
    const splitIndex = nearestSpace > 0 ? nearestSpace : midpoint;
    return {
      first: trimmed.slice(0, splitIndex).trim(),
      second: trimmed.slice(splitIndex).trim(),
    };
  }

  async function splitMeaningUnitFromCard(unit: MeaningUnit) {
    if (unit.analysisExcluded) {
      setApiStatus("Restore the meaning unit before splitting it.");
      return;
    }
    const suggestion = suggestMeaningUnitSplit(unit.excerpt);
    const firstExcerpt = window
      .prompt(`First part for MU #${unit.number}:`, suggestion.first)
      ?.trim();
    if (!firstExcerpt) {
      return;
    }
    const secondExcerpt = window
      .prompt(`Second part for MU #${unit.number}:`, suggestion.second)
      ?.trim();
    if (!secondExcerpt) {
      return;
    }
    const researcherNote =
      window
        .prompt(
          "Optional audit note for the split decision:",
          "Split because the original MU contained more than one meaning",
        )
        ?.trim() ??
      "Split because the original MU contained more than one meaning";

    setIsSavingMeaningUnitAction(true);
    setApiStatus(`Splitting MU #${unit.number}...`);

    try {
      if (isLocalOnlyMode) {
        const secondUnit: MeaningUnit = {
          ...unit,
          aiExcerpt: secondExcerpt,
          aiSummary: "",
          excerpt: secondExcerpt,
          generationMethod: "researcher",
          humanStatus: "Needs review",
          humanSummary: "",
          id: `mu_split_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          number: unit.number + 0.1,
          uncertainty: "Researcher split from an existing MU",
          reviewerWarnings: [
            "Researcher split: review this new semantic boundary.",
          ],
        };
        setUnits((current) =>
          renumberMeaningUnitsForDisplay(
            current.flatMap((item) =>
              item.id === unit.id
                ? [
                    {
                      ...item,
                      excerpt: firstExcerpt,
                      generationMethod: "researcher" as const,
                      humanStatus: "Needs review" as const,
                      humanSummary: item.humanSummary || item.aiSummary || "",
                      reviewerWarnings: [
                        "Researcher split: review this revised semantic boundary.",
                      ],
                    },
                    secondUnit,
                  ]
                : [item],
            ),
          ),
        );
        clearDerivedAnalysisAfterMeaningUnitChange();
        recordLocalAuditEvent({
          action: `Split MU #${unit.number}: ${researcherNote}`,
          target: unit.id,
        });
        setApiStatus(
          "Meaning unit split locally. Review both MUs before accepting.",
        );
        return;
      }

      const response = await fetch("/api/meaning-units", {
        body: JSON.stringify({
          action: "split",
          firstExcerpt,
          firstSummary: unit.humanSummary || unit.aiSummary || "",
          projectId: currentProject.id,
          researcherNote,
          secondExcerpt,
          secondSummary: "",
          unitId: unit.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        units?: MeaningUnit[];
      };
      if (!response.ok || !result.saved) {
        setApiStatus(result.error ?? "Meaning unit split failed.");
        return;
      }
      setUnits(result.units ?? []);
      clearDerivedAnalysisAfterMeaningUnitChange();
      setApiStatus(
        "Meaning unit split and audit logged. Review both MUs before accepting.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Meaning unit split failed.",
      );
    } finally {
      setIsSavingMeaningUnitAction(false);
    }
  }

  async function mergeMeaningUnitFromCard(
    unit: MeaningUnit,
    direction: "previous" | "next",
  ) {
    const neighbor = findMeaningUnitNeighbor(unit, direction);
    if (!neighbor) {
      setApiStatus(`No ${direction} meaning unit is available to merge.`);
      return;
    }
    const first = neighbor.number < unit.number ? neighbor : unit;
    const second = neighbor.number < unit.number ? unit : neighbor;
    const confirmed = confirmWorkspaceAction(
      `Merge MU #${first.number} and MU #${second.number}? This clears category and reviewer outputs because the accepted evidence base changes.`,
    );
    if (!confirmed) {
      return;
    }
    const mergedExcerpt = window
      .prompt(
        "Merged MU excerpt:",
        `${first.excerpt.trim()}\n\n${second.excerpt.trim()}`.trim(),
      )
      ?.trim();
    if (!mergedExcerpt) {
      return;
    }
    const mergedSummary =
      window
        .prompt(
          "Optional merged researcher summary:",
          [
            first.humanSummary || first.aiSummary,
            second.humanSummary || second.aiSummary,
          ]
            .filter(Boolean)
            .join(" / "),
        )
        ?.trim() ?? "";
    const researcherNote =
      window
        .prompt(
          "Optional audit note for the merge decision:",
          "Merged because the two MUs represented one connected meaning",
        )
        ?.trim() ??
      "Merged because the two MUs represented one connected meaning";

    setIsSavingMeaningUnitAction(true);
    setApiStatus(`Merging MU #${first.number} and MU #${second.number}...`);

    try {
      if (isLocalOnlyMode) {
        setUnits((current) =>
          renumberMeaningUnitsForDisplay(
            current
              .filter((item) => item.id !== second.id)
              .map((item) =>
                item.id === first.id
                  ? {
                      ...item,
                      analysisExcluded: false,
                      exclusionReason: undefined,
                      excerpt: mergedExcerpt,
                      generationMethod: "researcher" as const,
                      humanStatus: "Needs review" as const,
                      humanSummary: mergedSummary,
                      reviewerWarnings: [
                        "Researcher merge: review the combined semantic boundary.",
                      ],
                      sourceTurnIds: [
                        ...new Set([
                          ...(first.sourceTurnIds ?? []),
                          ...(second.sourceTurnIds ?? []),
                        ]),
                      ],
                    }
                  : item,
              ),
          ),
        );
        clearDerivedAnalysisAfterMeaningUnitChange();
        recordLocalAuditEvent({
          action: `Merged MU #${first.number} and MU #${second.number}: ${researcherNote}`,
          target: first.id,
        });
        setApiStatus(
          "Meaning units merged locally. Review the merged MU before accepting.",
        );
        return;
      }

      const response = await fetch("/api/meaning-units", {
        body: JSON.stringify({
          action: "merge",
          mergedExcerpt,
          mergedSummary,
          projectId: currentProject.id,
          researcherNote,
          sourceUnitId: first.id,
          targetUnitId: second.id,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        saved?: boolean;
        units?: MeaningUnit[];
      };
      if (!response.ok || !result.saved) {
        setApiStatus(result.error ?? "Meaning unit merge failed.");
        return;
      }
      setUnits(result.units ?? []);
      clearDerivedAnalysisAfterMeaningUnitChange();
      setApiStatus(
        "Meaning units merged and audit logged. Review the merged MU before accepting.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Meaning unit merge failed.",
      );
    } finally {
      setIsSavingMeaningUnitAction(false);
    }
  }

  function updateMeaningUnitExcerpt(unitId: string, value: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              aiExcerpt: unit.aiExcerpt ?? unit.excerpt,
              excerpt: value,
              humanStatus:
                unit.humanStatus === "Accepted" ||
                unit.humanStatus === "Excluded"
                  ? "Needs review"
                  : "Edited",
            }
          : unit,
      ),
    );
    clearDerivedAnalysisAfterMeaningUnitChange();
  }

  async function saveMeaningUnitExcerpt(unitId: string) {
    const unit = currentMeaningUnits.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    if (!unit.excerpt.trim()) {
      setApiStatus("Meaning-unit excerpt cannot be empty.");
      return;
    }

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Edited MU #${unit.number} excerpt`,
        target: unit.id,
      });
      setApiStatus("Meaning-unit excerpt edit saved locally.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        excerpt: unit.excerpt,
        humanStatus:
          unit.humanStatus === "Accepted" ? "Needs review" : unit.humanStatus,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      setApiStatus("Meaning-unit excerpt edit could not be saved. Try again.");
      return;
    }
    setApiStatus("Meaning-unit excerpt edit saved.");
  }

  function updateExclusionReason(unitId: string, value: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              exclusionReason: value,
            }
          : unit,
      ),
    );
  }

  function updateHumanSummary(unitId: string, value: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? { ...unit, humanSummary: value, humanStatus: "Edited" }
          : unit,
      ),
    );
    clearDerivedAnalysisAfterMeaningUnitChange();
  }

  async function saveMeaningUnitHumanSummary(unitId: string) {
    const unit = currentMeaningUnits.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Edited MU #${unit.number} summary`,
        target: unit.id,
      });
      setApiStatus("Meaning-unit summary edit saved locally.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        humanStatus: unit.humanStatus,
        humanSummary: unit.humanSummary,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      setApiStatus("Meaning-unit summary edit could not be saved. Try again.");
      return;
    }
    setApiStatus("Meaning-unit summary edit saved.");
  }

  async function acceptAllReviewedMeaningUnits() {
    const includableUnits = currentMeaningUnits.filter(
      (unit) =>
        !unit.analysisExcluded &&
        (unit.classification ?? "substantive_participant") ===
          "substantive_participant" &&
        ((unit.speakerRole ?? "participant") === "participant" ||
          unit.generationMethod === "researcher"),
    );
    if (includableUnits.length === 0) {
      setApiStatus("Generate meaning units before accepting summaries.");
      return;
    }
    const incompleteUnit = includableUnits.find(
      (unit) =>
        !unit.excerpt.trim() || !(unit.humanSummary || unit.aiSummary).trim(),
    );
    if (incompleteUnit) {
      setApiStatus(
        `Review MU #${incompleteUnit.number} before accepting all summaries. Each MU needs an excerpt and researcher summary.`,
      );
      return;
    }
    const nonTranscriptUnit = includableUnits.find(
      (unit) =>
        containsNonTranscriptMaterial(unit.excerpt) &&
        !unit.exclusionReason?.trim(),
    );
    if (nonTranscriptUnit) {
      setApiStatus(
        `MU #${nonTranscriptUnit.number} may contain project setup or other non-transcript material. Add a researcher memo or exclude it before accepting all.`,
      );
      return;
    }
    const confirmed = confirmWorkspaceAction(
      "Accept all visible, non-excluded meaning units? This records the current researcher-reviewed excerpts and summaries as accepted analytic material.",
    );
    if (!confirmed) {
      return;
    }
    const acceptedDraftSummaryWithoutEditCount = includableUnits.filter(
      (unit) =>
        (unit.humanSummary || unit.aiSummary).trim() ===
        (unit.aiSummary || "").trim(),
    ).length;

    setIsAcceptingMeaningUnits(true);
    setApiStatus("Saving accepted meaning-unit summaries...");

    try {
      if (isLocalOnlyMode) {
        const includableIds = new Set(includableUnits.map((unit) => unit.id));
        setUnits((current) =>
          current.map((unit) =>
            !includableIds.has(unit.id)
              ? unit
              : {
                  ...unit,
                  excerpt: unit.excerpt.trim(),
                  humanStatus: "Accepted",
                  humanSummary: (unit.humanSummary || unit.aiSummary).trim(),
                },
          ),
        );
        recordLocalAuditEvent({
          action:
            acceptedDraftSummaryWithoutEditCount > 0
              ? `Accepted ${includableUnits.length} reviewed meaning unit${includableUnits.length === 1 ? "" : "s"} in bulk (${acceptedDraftSummaryWithoutEditCount} draft summar${acceptedDraftSummaryWithoutEditCount === 1 ? "y" : "ies"} accepted without edit)`
              : `Accepted ${includableUnits.length} reviewed meaning unit${includableUnits.length === 1 ? "" : "s"} in bulk`,
          target: "Step 2 meaning-unit review",
        });
        setApiStatus(
          "Meaning-unit summaries accepted locally. You can now create and refine provisional categories.",
        );
        return;
      }

      const results = await Promise.all(
        includableUnits.map(async (unit) => {
          const response = await fetch(`/api/meaning-units/${unit.id}`, {
            body: JSON.stringify({
              excerpt: unit.excerpt.trim(),
              humanStatus: "Accepted",
              humanSummary: (unit.humanSummary || unit.aiSummary).trim(),
            }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          });
          if (!response.ok) {
            throw new Error(`Could not save MU #${unit.number}.`);
          }
          return (await response.json()) as {
            meaningUnit?: MeaningUnit;
          };
        }),
      );

      const savedUnits = results
        .map((result) => result.meaningUnit)
        .filter((unit): unit is MeaningUnit => Boolean(unit));
      setUnits((current) =>
        current.map(
          (unit) =>
            savedUnits.find((savedUnit) => savedUnit.id === unit.id) ?? {
              ...unit,
              humanStatus: "Accepted",
            },
        ),
      );
      setApiStatus(
        "Meaning-unit summaries accepted. You can now create and refine provisional categories.",
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Could not accept meaning-unit summaries.",
      );
    } finally {
      setIsAcceptingMeaningUnits(false);
    }
  }

  async function updateMeaningUnitSpeaker(unitId: string, speaker: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId ? { ...unit, speaker, humanStatus: "Edited" } : unit,
      ),
    );

    if (isLocalOnlyMode) {
      setApiStatus("Speaker correction saved locally for this meaning unit.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        humanStatus: "Edited",
        speaker,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      setApiStatus("Speaker change could not be saved. Try again.");
      return;
    }
    setApiStatus("Speaker correction saved for this meaning unit.");
  }

  async function excludeMeaningUnit(unit: MeaningUnit) {
    const reason = (unit.exclusionReason ?? "").trim();
    if (!reason) {
      setApiStatus(
        `Add a short reason before excluding MU #${unit.number}. This keeps the researcher decision audit-visible.`,
      );
      return;
    }

    setUnits((current) =>
      current.map((item) =>
        item.id === unit.id
          ? {
              ...item,
              analysisExcluded: true,
              exclusionReason: reason,
              humanStatus: "Excluded",
            }
          : item,
      ),
    );
    setDisplayCategories([]);
    setNarrative("");
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
    setApiStatus("Excluding meaning unit...");

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Excluded MU #${unit.number}: ${reason}`,
        target: unit.id,
      });
      setApiStatus(
        "Meaning unit excluded locally. Existing categories were cleared; rerun categories when ready.",
      );
      return;
    }

    const response = await fetch(`/api/meaning-units/${unit.id}`, {
      body: JSON.stringify({
        analysisExcluded: true,
        exclusionReason: reason,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      meaningUnit?: MeaningUnit;
      saved?: boolean;
    };
    if (!response.ok || !result.saved) {
      setApiStatus(
        result.error ?? "Meaning-unit exclusion could not be saved.",
      );
      return;
    }
    if (result.meaningUnit) {
      setUnits((current) =>
        current.map((item) =>
          item.id === result.meaningUnit?.id ? result.meaningUnit : item,
        ),
      );
    }
    setApiStatus(
      "Meaning unit excluded from category analysis. Existing categories were cleared; rerun categories when ready.",
    );
  }

  async function restoreMeaningUnit(unit: MeaningUnit) {
    setUnits((current) =>
      current.map((item) =>
        item.id === unit.id
          ? {
              ...item,
              analysisExcluded: false,
              classification: "substantive_participant",
              generationMethod: "researcher",
              humanStatus: "Needs review",
              reviewerStatus: "Warning",
              reviewerWarnings: [
                ...(item.reviewerWarnings ?? []),
                "Researcher override: material was reclassified from context/non-analytic status for substantive review.",
              ],
            }
          : item,
      ),
    );
    clearDerivedAnalysisAfterMeaningUnitChange();
    setApiStatus("Restoring meaning unit...");

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Restored MU #${unit.number} for review`,
        actionType: "meaning_unit_restored",
        newValue: {
          ...unit,
          analysisExcluded: false,
          classification: "substantive_participant",
          generationMethod: "researcher",
        },
        previousValue: unit,
        target: unit.id,
      });
      setApiStatus(
        "Meaning unit restored locally. Review and accept it before categories.",
      );
      return;
    }

    const response = await fetch(`/api/meaning-units/${unit.id}`, {
      body: JSON.stringify({
        analysisExcluded: false,
        classification: "substantive_participant",
        exclusionReason: null,
        generationMethod: "researcher",
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      meaningUnit?: MeaningUnit;
      saved?: boolean;
    };
    if (!response.ok || !result.saved) {
      setApiStatus(result.error ?? "Meaning-unit restore could not be saved.");
      return;
    }
    if (result.meaningUnit) {
      setUnits((current) =>
        current.map((item) =>
          item.id === result.meaningUnit?.id ? result.meaningUnit : item,
        ),
      );
    }
    setApiStatus(
      "Meaning unit restored for analysis. Review and accept it before categories.",
    );
  }

  async function deleteMeaningUnitFromWorkspace(unit: MeaningUnit) {
    const confirmed = confirmWorkspaceAction(
      `Delete MU #${unit.number}? This removes it from the workspace and clears existing categories because category results may reference it. Use Exclude instead if you want to keep an audit-visible record.`,
    );
    if (!confirmed) {
      return;
    }

    setApiStatus(`Deleting MU #${unit.number}...`);
    if (isLocalOnlyMode) {
      setUnits((current) =>
        renumberMeaningUnitsForDisplay(
          current.filter((item) => item.id !== unit.id),
        ),
      );
      clearDerivedAnalysisAfterMeaningUnitChange();
      recordLocalAuditEvent({
        action: `Deleted MU #${unit.number}`,
        target: unit.id,
      });
      setApiStatus(
        `MU #${unit.number} deleted locally. Existing categories were cleared; rerun categories when ready.`,
      );
      return;
    }

    const response = await fetch(`/api/meaning-units/${unit.id}`, {
      method: "DELETE",
    });
    const result = (await response.json().catch(() => ({}))) as {
      deleted?: boolean;
      error?: string;
      units?: MeaningUnit[];
    };
    if (!response.ok || !result.deleted) {
      setApiStatus(result.error ?? "Meaning unit could not be deleted.");
      return;
    }
    if (result.units) {
      setUnits(result.units);
    } else {
      setUnits((current) =>
        renumberMeaningUnitsForDisplay(
          current.filter((item) => item.id !== unit.id),
        ),
      );
    }
    clearDerivedAnalysisAfterMeaningUnitChange();
    setApiStatus(
      `MU #${unit.number} deleted. Existing categories were cleared; rerun categories when ready.`,
    );
  }

  async function askGuidanceQuestion() {
    const question = guidanceQuestion.trim();
    if (!question) {
      setApiStatus("Ask a methodological guidance question first.");
      return;
    }

    setIsGuidanceLoading(true);
    clearWorkflowError();
    setApiStatus("Preparing methodological guidance...");

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const answer = buildMethodologicalGuidanceAnswer({
        activeStep,
        categoryCount: displayCategories.length,
        confirmedMeaningUnitCount: confirmedMeaningUnits.length,
        hasTranscript: Boolean(editableTranscript.trim()),
        question,
        transcriptConfirmed,
      });
      const message: GuidanceMessage = {
        answer,
        createdAt: new Date().toISOString(),
        id: `guidance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        question,
        step: activeStep,
      };
      setGuidanceMessages((current) => [message, ...current]);
      setGuidanceQuestion("");
      setApiStatus(
        "Guidance drafted. Save it as a memo only if it is useful for your audit trail.",
      );
    } catch (error) {
      setRecoverableWorkflowError(
        error instanceof Error
          ? error.message
          : "Guidance could not be generated.",
        () => void askGuidanceQuestion(),
      );
    } finally {
      setIsGuidanceLoading(false);
    }
  }

  async function saveGuidanceAsMemo(message: GuidanceMessage) {
    if (message.saved) {
      setApiStatus("This guidance is already saved as a memo.");
      return false;
    }

    if (isLocalOnlyMode) {
      const savedMessage = { ...message, saved: true };
      setGuidanceMessages((current) =>
        current.map((item) => (item.id === message.id ? savedMessage : item)),
      );
      setSavedGuidanceMemos((current) => [savedMessage, ...current]);
      recordLocalAuditEvent({
        action:
          message.source === "voice-guide"
            ? `voice_guidance_note_saved for ${message.step}`
            : `Saved methodological guidance memo for ${message.step}`,
        target:
          message.source === "voice-guide" ? "Voice Guide" : "Guidance panel",
      });
      setApiStatus(
        message.source === "voice-guide"
          ? "Voice guidance note saved locally and audit logged."
          : "Guidance memo saved locally and audit logged.",
      );
      return true;
    }

    try {
      const response = await fetch("/api/guidance-memos", {
        body: JSON.stringify({
          answer: message.answer,
          projectId: currentProject.id,
          question: message.question,
          source: message.source,
          step: message.step,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        memo?: GuidanceMemo;
        saved?: boolean;
      };
      if (!response.ok || !result.saved) {
        setRecoverableWorkflowError(
          result.error ?? "Guidance memo could not be saved.",
          () => void saveGuidanceAsMemo(message),
        );
        return false;
      }

      const savedMessage = result.memo
        ? guidanceMemoToMessage(result.memo)
        : { ...message, saved: true };
      setGuidanceMessages((current) =>
        current.map((item) => (item.id === message.id ? savedMessage : item)),
      );
      setSavedGuidanceMemos((current) => [savedMessage, ...current]);
      setApiStatus(
        message.source === "voice-guide"
          ? "Voice guidance note saved and audit logged."
          : "Guidance memo saved and audit logged.",
      );
      void refreshWorkspace();
      return true;
    } catch (error) {
      setRecoverableWorkflowError(
        error instanceof Error
          ? error.message
          : "Guidance memo could not be saved.",
        () => void saveGuidanceAsMemo(message),
      );
      return false;
    }
  }

  async function saveVoiceGuidanceNote(note: VoiceGuidanceNoteDraft) {
    const answer = [
      note.spokenAnswer,
      "",
      `Boundary reminder: ${note.boundaryReminder}`,
      "",
      "Caption summary:",
      ...note.captionSummary.map((item) => `- ${item}`),
    ].join("\n");
    const message: GuidanceMessage = {
      answer,
      createdAt: note.createdAt,
      id: `voice_guidance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: currentProject.id,
      question: note.transcribedQuestion,
      source: "voice-guide",
      step: note.step,
    };
    const wasSaved = await saveGuidanceAsMemo(message);
    if (!wasSaved) {
      throw new Error("Voice guidance note could not be saved.");
    }
  }

  function returnToTranscriptForUnit(unit: MeaningUnit) {
    setActiveStep("pre-analysis");
    setTranscriptConfirmed(false);
    setApiStatus(
      `Check the transcript around MU #${unit.number}. After editing, save/confirm the transcript and regenerate meaning units.`,
    );
  }

  function cleanTranscript() {
    const spacingCleaned = editableTranscript
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const sourceCleaned = cleanTranscriptSourceForAnalysis(
      spacingCleaned,
      currentProject,
    );
    const cleaned = sourceCleaned.transcript;
    setEditableTranscript(cleaned);
    setTranscriptConfirmed(false);
    setAiPrivacyFindings(extractPrivacyReviewMarkers(cleaned));
    setPrivacyOverrideAccepted(false);
    setTranscriptStorageStatus("Not saved yet — local draft only");
    setApiStatus(
      sourceCleaned.removedLineCount > 0
        ? `Transcript cleaned. Removed ${sourceCleaned.removedLineCount} non-transcript setup/metadata line${sourceCleaned.removedLineCount === 1 ? "" : "s"}. Review, save, then confirm before analysis.`
        : "Transcript spacing cleaned. Review the text, save a reviewed transcript, then confirm before analysis.",
    );
  }

  function focusSensitiveItem(item: SensitiveReviewItem) {
    setActiveSensitiveItemId(item.id);
    setActiveStep("pre-analysis");
    window.setTimeout(() => {
      const textarea = transcriptTextAreaRef.current;
      if (!textarea || typeof item.startOffset !== "number") {
        return;
      }
      textarea.focus();
      textarea.scrollIntoView({ behavior: "smooth", block: "center" });
      textarea.setSelectionRange(
        item.startOffset,
        item.endOffset ?? item.startOffset + item.placeholder.length,
      );
    }, 0);
  }

  function updateSensitiveItemStatus(
    itemId: string,
    status: SensitiveReviewStatus,
  ) {
    const item = sensitiveReviewItems.find((current) => current.id === itemId);
    if (
      status === "confirmed" &&
      item?.matchedText &&
      item.matchedText !== item.replacementText
    ) {
      replaceSensitiveItemText(item, item.replacementText);
    }
    setSensitiveReviewItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, status } : item)),
    );
  }

  function editSensitiveReplacement(item: SensitiveReviewItem) {
    const replacement = promptWorkspaceText(
      "Edit the anonymised replacement label:",
      item.replacementText,
    );
    if (!replacement?.trim()) {
      return;
    }
    const nextReplacement = replacement.trim();
    replaceSensitiveItemText(item, nextReplacement);
    setSensitiveReviewItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              placeholder: nextReplacement,
              replacementText: nextReplacement,
              status: "edited",
            }
          : currentItem,
      ),
    );
  }

  function applyConsistentReplacement(item: SensitiveReviewItem) {
    const replacement = item.replacementText || item.placeholder;
    const sourceText = item.matchedText ?? item.placeholder;
    setEditableTranscript((current) =>
      current.split(sourceText).join(replacement),
    );
    setTranscriptConfirmed(false);
    setTranscriptStorageStatus("Not saved yet — local draft only");
    setSensitiveReviewItems((current) =>
      current.map((currentItem) =>
        (currentItem.matchedText ?? currentItem.placeholder) === sourceText
          ? {
              ...currentItem,
              placeholder: replacement,
              replacementText: replacement,
              status:
                currentItem.status === "ignored" ? "ignored" : "confirmed",
            }
          : currentItem,
      ),
    );
    setApiStatus(`Applied ${replacement} consistently across the transcript.`);
  }

  function replaceSensitiveItemText(
    item: SensitiveReviewItem,
    replacement: string,
  ) {
    const sourceText = item.matchedText ?? item.placeholder;
    setEditableTranscript((current) => {
      if (
        typeof item.startOffset === "number" &&
        typeof item.endOffset === "number" &&
        current.slice(item.startOffset, item.endOffset) === sourceText
      ) {
        return `${current.slice(0, item.startOffset)}${replacement}${current.slice(item.endOffset)}`;
      }
      return current.replace(sourceText, replacement);
    });
    setTranscriptConfirmed(false);
    setPrivacyOverrideAccepted(false);
    setTranscriptStorageStatus("Not saved yet — local draft only");
  }

  async function loadAudioPreview() {
    if (!latestAudioFile) {
      setApiStatus("Upload audio before previewing it");
      return;
    }

    setApiStatus("Loading signed audio preview...");
    const response = await fetch(
      `/api/audio/${latestAudioFile.id}/signed-url?projectId=${currentProject.id}`,
      { cache: "no-store" },
    );
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      signedUrl?: string;
    };

    if (!response.ok || !result.signedUrl) {
      setApiStatus(result.error ?? "Audio preview failed");
      return;
    }

    setAudioPreviewUrl(result.signedUrl);
    setApiStatus("Audio preview loaded");
  }

  async function exportWorkspace(format: AnalysisExportFormat) {
    if (isExportingFormat) return;
    setIsExportingFormat(format);
    clearWorkflowError();
    setExportStage(
      format === "pdf"
        ? "Preparing a printable analysis record for the browser print dialog."
        : `Building the ${format.toUpperCase()} analysis record and review trail.`,
    );
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeProjectTitle = slugifyFilename(
      currentProject.title || "gdi-qr-project",
    );

    try {
      if (format === "json") {
        downloadFile(
          `${safeProjectTitle}-analysis-record-${timestamp}.json`,
          JSON.stringify(buildExportPayload(), null, 2),
          "application/json",
        );
        setApiStatus("JSON backup export downloaded.");
        await recordExportEvent("json");
        return;
      }

      if (format === "csv") {
        downloadFile(
          `${safeProjectTitle}-meaning-units-${timestamp}.csv`,
          buildMeaningUnitCsv(currentMeaningUnits),
          "text/csv",
        );
        setApiStatus("Meaning-unit CSV export downloaded.");
        await recordExportEvent("csv");
        return;
      }

      if (format === "docx") {
        const docxBlob = buildDocxBlobFromText(buildTextReport());
        downloadBlob(
          `${safeProjectTitle}-analysis-record-${timestamp}.docx`,
          docxBlob,
        );
        setApiStatus("DOCX analysis record downloaded.");
        await recordExportEvent("docx");
        return;
      }

      if (format === "pdf") {
        openPrintableAnalysisRecord(buildTextReport());
        setApiStatus(
          "Printable analysis record opened. Use the browser print dialog to save as PDF.",
        );
        await recordExportEvent("pdf");
        return;
      }

      downloadFile(
        `${safeProjectTitle}-analysis-record-${timestamp}.txt`,
        buildTextReport(),
        "text/plain",
      );
      setApiStatus("Text analysis record downloaded.");
      await recordExportEvent("txt");
    } catch (error) {
      setRecoverableWorkflowError(
        error instanceof Error
          ? error.message
          : `${format.toUpperCase()} export failed.`,
        () => void exportWorkspace(format),
      );
    } finally {
      setIsExportingFormat(null);
      setExportStage("");
    }
  }

  function buildExportPayload() {
    return {
      exportNote:
        "This export may contain draft assistant-supported material. Review all outputs against transcript evidence before use.",
      project: currentProject,
      dataSuitability: {
        datasetType: currentProject.datasetType,
        dataSource: currentProject.dataSource,
        confirmed: currentProject.dataSuitabilityConfirmed,
        confirmedAt: currentProject.dataSuitabilityConfirmedAt,
        researcherNotes: currentProject.researcherNotes,
      },
      preAnalysis: {
        researchQuestion,
        studyDescription,
        researcherPosition: researcherReflexivityNotes,
        contextualNotes: researcherNotes,
        initialSensitisingConcepts: researcherExpectations,
        dataFamiliarisationNotes,
        relevanceGuideline,
      },
      transcript: editableTranscript,
      transcriptRecords: displayTranscriptRecords,
      segments: displaySegments,
      audioFiles: displayAudioFiles,
      transcriptionJobs: displayTranscriptionJobs,
      transcriptReview: {
        originalSaved: displayTranscriptRecords.some((item) =>
          Boolean(item.rawContent),
        ),
        editedDraftSaved: displayTranscriptRecords.some((item) =>
          Boolean(item.cleanedContent),
        ),
        confirmedSaved: displayTranscriptRecords.some(
          (item) => item.status === "Confirmed" || Boolean(item.finalContent),
        ),
      },
      meaningUnits: currentMeaningUnits,
      categories: displayCategories,
      methodologicalIntegrityReview: integrityChecklistItems,
      methodologicalIntegrityIssues: reviewerOutputs,
      reviewerComments: reviewerOutputs,
      integratedNarrative: narrative,
      integrationStructure: {
        title: integrationStructureTitle,
        explanation: integrationStructureExplanation,
        relationships: integrationRelationships,
        researcherNote: integrationNote,
        reviewed: integrationReviewed,
        savedAt: integrationSavedAt,
        note: integrationStructureNotice,
      },
      guidanceMemos: savedGuidanceMemos,
      auditTrail: displayAuditEvents,
      auditEvents: displayAuditEvents,
      exportRecords: displayExportRecords,
    };
  }

  function buildTextReport() {
    const categoryText = displayCategories
      .map((category) => `- ${category.name}: ${category.definition}`)
      .join("\n");
    const reviewerText = reviewerOutputs
      .map(
        (comment) =>
          `- [${comment.severity}] ${comment.agent} on ${comment.target}: ${comment.comment}`,
      )
      .join("\n");
    const integrityChecklistText = integrityChecklistItems
      .map(
        (item) =>
          `- [${formatIntegrityStatus(item.status)}] ${item.prompt}\n  Response: ${item.response || "Not recorded"}\n  Researcher note: ${item.researcherNote || "Not recorded"}`,
      )
      .join("\n");
    const guidanceMemoText = savedGuidanceMemos
      .map(
        (memo) =>
          `- ${memo.createdAt} | ${getStepShortLabel(memo.step)} | Q: ${memo.question}\n  Guidance: ${memo.answer}`,
      )
      .join("\n");
    const auditTrailText = displayAuditEvents
      .map(
        (event) =>
          `- ${event.timestamp} | ${event.actor} | ${event.actionType ?? "other"} | ${event.action} | ${event.target}`,
      )
      .join("\n");

    return [
      PRODUCT_TITLE,
      currentProject.title,
      "",
      `Research question: ${currentProject.researchQuestion || "Not set"}`,
      `Methodological frame: ${METHODOLOGICAL_FRAME}`,
      "Note: assistant-supported drafts need researcher review against transcript evidence before use.",
      `Language: ${currentProject.language}`,
      `Dataset type: ${currentProject.datasetType}`,
      `Data source: ${currentProject.dataSource}`,
      `Data suitability confirmed: ${currentProject.dataSuitabilityConfirmed ? "Yes" : "No"}`,
      `Researcher notes: ${currentProject.researcherNotes || "Not set"}`,
      "",
      "Step 1 Pre-analysis",
      `Research question: ${researchQuestion || "Not set"}`,
      `Study description / domains: ${studyDescription || "Not set"}`,
      `Researcher position / reflexive note: ${researcherReflexivityNotes || "Not set"}`,
      `Contextual notes: ${researcherNotes || "Not set"}`,
      `Initial sensitising concepts: ${researcherExpectations || "Not set"}`,
      `Data familiarisation notes: ${dataFamiliarisationNotes || "Not set"}`,
      `Relevance guideline: ${relevanceGuideline || "Not set"}`,
      "",
      `Transcript records: ${displayTranscriptRecords.length}`,
      `Original transcript saved: ${displayTranscriptRecords.some((item) => Boolean(item.rawContent)) ? "Yes" : "No"}`,
      `Edited transcript draft saved: ${displayTranscriptRecords.some((item) => Boolean(item.cleanedContent)) ? "Yes" : "No"}`,
      `Confirmed transcript saved: ${displayTranscriptRecords.some((item) => item.status === "Confirmed" || Boolean(item.finalContent)) ? "Yes" : "No"}`,
      "",
      "Transcript",
      editableTranscript || "No transcript yet.",
      "",
      "Meaning Units",
      units.length
        ? units
            .map(
              (unit) =>
                `${unit.number}. ${unit.humanSummary || unit.aiSummary} (${unit.excerpt})`,
            )
            .join("\n")
        : "No meaning units yet.",
      "",
      "Categories",
      categoryText || "No categories yet.",
      "",
      "Methodological Integrity Review",
      integrityChecklistText ||
        "No methodological integrity checklist items yet.",
      "",
      "Reviewer Issues",
      reviewerText || "No methodological integrity issues yet.",
      "",
      "Step 4 Integration",
      `Relationship count: ${integrationRelationships.length}`,
      `Integration reviewed: ${integrationReviewed ? "Yes" : "No"}`,
      `Integration researcher note: ${integrationNote || "Not set"}`,
      "",
      "Summary Narrative",
      narrative || "No summary narrative yet.",
      "",
      "Export History",
      displayExportRecords.length
        ? displayExportRecords
            .map(
              (record) =>
                `- ${record.generatedAt} | ${record.format.toUpperCase()} | ${record.storagePath || "local/download"}`,
            )
            .join("\n")
        : "No export records yet.",
      "",
      "Audit Trail",
      auditTrailText || "No audit events yet.",
    ].join("\n");
  }

  async function markAccepted(unitId: string) {
    const unit = currentMeaningUnits.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }
    if (
      (unit.classification ?? "substantive_participant") !==
      "substantive_participant"
    ) {
      setApiStatus(
        "Only substantive participant material can be accepted as a meaning unit. Restore/reclassify this source segment first if you intend to override its context status.",
      );
      return;
    }
    const reviewedExcerpt = unit.excerpt.trim();
    const reviewedSummary = (unit.humanSummary || unit.aiSummary).trim();
    const acceptedDraftSummaryWithoutEdit =
      reviewedSummary === (unit.aiSummary || "").trim();
    if (!reviewedExcerpt || !reviewedSummary) {
      setApiStatus(
        `Review the excerpt and summary before accepting MU #${unit.number}.`,
      );
      return;
    }
    if (
      containsNonTranscriptMaterial(reviewedExcerpt) &&
      !unit.exclusionReason?.trim()
    ) {
      setApiStatus(
        `MU #${unit.number} may contain project setup or other non-transcript material. Add a researcher memo explaining why it belongs in analysis, or exclude it.`,
      );
      return;
    }
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? {
              ...unit,
              excerpt: reviewedExcerpt,
              humanSummary: reviewedSummary,
              humanStatus: "Accepted",
            }
          : unit,
      ),
    );
    setApiStatus("Saving meaning-unit decision...");

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: acceptedDraftSummaryWithoutEdit
          ? `Accepted MU #${unit.number} draft summary without edit`
          : `Accepted MU #${unit.number}`,
        target: unit.id,
      });
      setApiStatus("Meaning-unit decision saved locally.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        excerpt: reviewedExcerpt,
        humanStatus: "Accepted",
        humanSummary: reviewedSummary,
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    const result = (await response.json()) as {
      saved?: boolean;
      reason?: string;
      error?: string;
      meaningUnit?: MeaningUnit;
    };

    if (result.meaningUnit) {
      setUnits((current) =>
        current.map((item) =>
          item.id === result.meaningUnit?.id ? result.meaningUnit : item,
        ),
      );
    }

    setApiStatus(
      result.saved
        ? "Meaning-unit decision saved"
        : (result.reason ?? result.error ?? "Meaning-unit save skipped"),
    );
  }

  return (
    <div className="app-shell workbook-shell">
      <header className="topbar">
        <div className="brand" aria-label={PRODUCT_TITLE}>
          <div className="brand-mark">GDI-QR</div>
          <div>
            <h1 className="brand-title">GDI-QR Guided Qualitative Analysis</h1>
            <p className="brand-subtitle">
              A step-by-step workspace based on A Generic Approach to
              Descriptive-Interpretive Qualitative Research
            </p>
          </div>
        </div>
      </header>

      <div className="layout">
        <main className="main">
          <ProjectBar
            availableProjects={availableProjects}
            currentProject={currentProject}
            createProjectExpanded={createProjectExpanded}
            dataSuitabilityConfirmed={dataSuitabilityConfirmed}
            datasetType={datasetType}
            isCreatingProject={isCreatingProject}
            isLocalOnlyMode={isLocalOnlyMode}
            isSavingProject={isSavingProject}
            newDataSuitabilityConfirmed={newDataSuitabilityConfirmed}
            newDatasetType={newDatasetType}
            newProjectTitle={newProjectTitle}
            newResearchQuestion={newResearchQuestion}
            newResearcherNotes={newResearcherNotes}
            newStudyDescription={newStudyDescription}
            onCreateProject={() => void createNewProject()}
            onOpenProject={openProject}
            onSaveProject={() => void saveProjectSetup()}
            onSetCreateProjectExpanded={setCreateProjectExpanded}
            onSetDataSuitabilityConfirmed={(confirmed) => {
              setDataSuitabilityConfirmed(confirmed);
            }}
            onSetDatasetType={(value) => {
              setDatasetType(value);
              setDataSuitabilityConfirmed(
                value === "identifiable_sensitive"
                  ? false
                  : dataSuitabilityConfirmed,
              );
            }}
            onSetNewDataSuitabilityConfirmed={setNewDataSuitabilityConfirmed}
            onSetNewDatasetType={(value) => {
              setNewDatasetType(value);
              if (value === "identifiable_sensitive") {
                setNewDataSuitabilityConfirmed(false);
              }
            }}
            onSetNewProjectTitle={setNewProjectTitle}
            onSetNewResearchQuestion={setNewResearchQuestion}
            onSetNewResearcherNotes={setNewResearcherNotes}
            onSetNewStudyDescription={setNewStudyDescription}
            onSetProjectResearcherNotes={setProjectResearcherNotes}
            onSetProjectTitle={setProjectTitle}
            projectResearcherNotes={projectResearcherNotes}
            projectSetupSavedAt={projectSetupSavedAt}
            projectTitle={projectTitle}
          />

          {dataSuitabilityBlocksAnalysis && (
            <div className="mini-card warning-card">
              <span className="label">
                Action required before upload or analysis
              </span>
              <p className="small">
                Confirm data suitability for an open/public/anonymised dataset
                before uploading transcripts, uploading audio, or generating
                analysis outputs.
              </p>
            </div>
          )}

          <WorkflowNavigation
            activeStep={activeStep}
            completedSteps={completedSteps}
            dataSuitabilityBlocksAnalysis={dataSuitabilityBlocksAnalysis}
            guidedSteps={guidedSteps}
            onBlockedNavigation={() => {
              void ensureDataSuitabilityConfirmed(
                "moving beyond project setup",
              );
            }}
            onSelectStep={setActiveStep}
          />
          <section className={`section step-${activeStep}`}>
            <div className="section-header">
              <div>
                <span className="badge">Current step</span>
                <h2 className="section-title">
                  {currentStepIndex + 1}. {selectedTitle}
                </h2>
                <p className="section-copy">{getStepCopy(activeStep)}</p>
              </div>
            </div>
            <div className="step-support-row">
              <details className="workbook-details step-guidance-details">
                <summary>Step guidance</summary>
                <StepGuidance step={activeStep} />
              </details>
              <div className="voice-guide-entry" aria-label="Voice Guide entry">
                <strong>Need guidance?</strong>
                <span>
                  Open the floating AI Guide for step-aware methodological
                  reflection.
                </span>
              </div>
            </div>
            {workflowError && (
              <WorkflowErrorPanel
                message={workflowError}
                onClear={clearWorkflowError}
                onRetry={() => retryActionRef.current?.()}
                retryAvailable={Boolean(retryActionRef.current)}
              />
            )}
            <LongTaskStatus
              active={isUploadingAudio || isImportingTranscript}
              estimatedRangeSeconds={[15, 120]}
              fallbackNotice={
                transcriptPreparationStage.toLowerCase().includes("quick local")
                  ? "Quick local fallback is active. Review speaker labels and privacy findings carefully."
                  : undefined
              }
              onRetry={
                workflowError ? () => retryActionRef.current?.() : undefined
              }
              phase={
                transcriptPreparationStage ||
                (isUploadingAudio
                  ? "Uploading and transcribing the selected audio file."
                  : "Preparing the transcript for researcher review.")
              }
              title={
                isUploadingAudio
                  ? "Audio transcription"
                  : "Transcript preparation"
              }
            />
            <LongTaskStatus
              active={isGeneratingMeaningUnits}
              estimatedRangeSeconds={[10, 90]}
              fallbackNotice={
                meaningUnitGenerationStage
                  .toLowerCase()
                  .includes("rule-based") ||
                meaningUnitGenerationStage.toLowerCase().includes("fallback")
                  ? "A rule-based fallback may be used. Draft boundaries still require researcher review."
                  : undefined
              }
              phase={
                meaningUnitGenerationStage ||
                "Delineating conservative, meaning-preserving draft units."
              }
              title="Meaning-unit generation"
            />
            <LongTaskStatus
              active={isRunningCategories}
              estimatedRangeSeconds={[15, 180]}
              fallbackNotice={
                categoryDraftIsFallback
                  ? "A temporary fallback draft was created and must not be treated as final analysis."
                  : undefined
              }
              phase={
                categoryGenerationStage ||
                "Preparing provisional category suggestions."
              }
              title="Category generation"
            />
            <LongTaskStatus
              active={Boolean(isExportingFormat)}
              estimatedRangeSeconds={[2, 20]}
              phase={exportStage || "Preparing the selected export."}
              title={`${isExportingFormat?.toUpperCase() ?? "Analysis"} export`}
            />
            <div className="workbook-task-heading">
              <span className="label">What you’ll work on</span>
              <p>
                {activeStep === "pre-analysis"
                  ? "You can move back and forth between domains, data preparation, and relevance judgement as your understanding develops."
                  : "Use the workspace below to review, revise, and record your analytic decisions for this step."}
              </p>
            </div>
            {activeStep === "pre-analysis" && (
              <div
                className="overlap-strip"
                aria-label="Pre-analysis activities overlap"
              >
                <span>Domains of Investigation</span>
                <span>Data Preparation</span>
                <span>Judgement of Relevance</span>
                <strong>overlapping and iterative</strong>
              </div>
            )}

            {activeStep === "pre-analysis" && (
              <div className="section-body grid pre-analysis-card domain-card">
                <div className="substep-heading">
                  <span>1</span>
                  <div>
                    <h3>Organising Data into Domains of Investigation</h3>
                    <p>
                      Organise data according to areas of investigation related
                      to the research question. Domains are not findings.
                    </p>
                  </div>
                </div>
                <div className="mini-card soft">
                  <span className="label">Purpose</span>
                  <p className="small">
                    Domains are broad areas of inquiry that help structure the
                    analysis. They remain provisional and may change as you work
                    with the data.
                  </p>
                  <p className="small">
                    Keep domains broad at this stage. They help you organise
                    attention; they are not the final analytic categories.
                  </p>
                  <span className="label">Examples</span>
                  <ul className="compact-list">
                    <li>Self-confidence</li>
                    <li>Therapeutic relationship</li>
                    <li>Emotional expression</li>
                    <li>Changes over time</li>
                  </ul>
                </div>
                <div>
                  <label className="label" htmlFor="research-question">
                    Research Question
                  </label>
                  <textarea
                    className="textarea"
                    id="research-question"
                    onChange={(event) =>
                      setResearchQuestion(event.target.value)
                    }
                    value={researchQuestion}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="study-description">
                    Domains of Investigation
                  </label>
                  <textarea
                    className="textarea"
                    id="study-description"
                    onChange={(event) =>
                      setStudyDescription(event.target.value)
                    }
                    placeholder="Initial areas that organise the data in relation to the research question. These are not findings or categories."
                    value={studyDescription}
                  />
                </div>
                <details className="workbook-details" open>
                  <summary>Step 1 pre-analysis notes</summary>
                  <p className="small">
                    These notes are part of the durable project record and will
                    appear in the analysis export.
                  </p>
                  <div className="grid">
                    <div>
                      <label className="label" htmlFor="researcher-reflexivity">
                        Researcher position / reflexive note
                      </label>
                      <textarea
                        className="textarea compact-textarea"
                        id="researcher-reflexivity"
                        onChange={(event) =>
                          setResearcherReflexivityNotes(event.target.value)
                        }
                        placeholder="What assumptions, experiences, expectations, roles, or theoretical perspectives might shape your analysis?"
                        value={researcherReflexivityNotes}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="researcher-notes">
                        Contextual notes
                      </label>
                      <textarea
                        className="textarea compact-textarea"
                        id="researcher-notes"
                        onChange={(event) =>
                          setResearcherNotes(event.target.value)
                        }
                        placeholder="Add project context, sample/context notes, early decisions, questions, and methodological notes."
                        value={researcherNotes}
                      />
                    </div>
                    <div>
                      <label
                        className="label"
                        htmlFor="researcher-expectations"
                      >
                        Initial sensitising concepts
                      </label>
                      <textarea
                        className="textarea compact-textarea"
                        id="researcher-expectations"
                        onChange={(event) =>
                          setResearcherExpectations(event.target.value)
                        }
                        placeholder="Record sensitising concepts, preunderstandings, expectations, or concepts to watch without treating them as fixed findings."
                        value={researcherExpectations}
                      />
                    </div>
                    <div>
                      <label
                        className="label"
                        htmlFor="data-familiarisation-notes"
                      >
                        Data familiarisation notes
                      </label>
                      <textarea
                        className="textarea compact-textarea"
                        id="data-familiarisation-notes"
                        onChange={(event) =>
                          setDataFamiliarisationNotes(event.target.value)
                        }
                        placeholder="Record first impressions from reading/listening, transcript quality notes, questions to revisit, or repeated points noticed during familiarisation."
                        value={dataFamiliarisationNotes}
                      />
                    </div>
                  </div>
                  <div className="button-row">
                    <button
                      className="button primary"
                      disabled={isSavingPreAnalysis}
                      onClick={() => void saveStepOnePreAnalysisNotes()}
                      type="button"
                    >
                      {isSavingPreAnalysis
                        ? "Saving Step 1 notes..."
                        : "Save Step 1 pre-analysis notes"}
                    </button>
                    {preAnalysisSavedAt && (
                      <span className="small">
                        Last saved: {formatDateTime(preAnalysisSavedAt)}
                      </span>
                    )}
                  </div>
                </details>
              </div>
            )}

            {activeStep === "pre-analysis" && (
              <div className="section-body grid pre-analysis-card preparation-card">
                <div className="substep-heading">
                  <span>2</span>
                  <div>
                    <h3>Data Preparation</h3>
                    <p>
                      Prepare transcripts and source materials for analysis.
                    </p>
                  </div>
                </div>
                <div className="mini-card soft">
                  <span className="label">Purpose</span>
                  <p className="small">
                    I can help with preparation, and you remain in charge of
                    ensuring the material is readable, anonymised, and
                    appropriate for analysis.
                  </p>
                  <p className="small">
                    This is the practical checkpoint: get the transcript into a
                    readable form, then review anonymisation before saving it
                    for analysis.
                  </p>
                  <span className="label">Preparation Checklist</span>
                  <div className="preparation-checklist">
                    <StatusLine
                      label="Transcript available"
                      status={
                        editableTranscript.trim() ? "Passed" : "Not addressed"
                      }
                    />
                    <StatusLine
                      label="Readable format"
                      status={
                        transcriptImportText.trim() || editableTranscript.trim()
                          ? "Passed"
                          : "Not addressed"
                      }
                    />
                    <StatusLine
                      label="Anonymisation completed"
                      status={
                        unresolvedHighRiskCount === 0
                          ? "Passed"
                          : "Needs review"
                      }
                    />
                    <StatusLine
                      label="Ready for analysis"
                      status={transcriptConfirmed ? "Passed" : "Needs review"}
                    />
                  </div>
                </div>
                <div className="mini-card soft">
                  <span className="label">Before preparing data</span>
                  <p className="small">
                    Use anonymised or synthetic data for testing. Do not upload
                    identifiable, sensitive, or confidential counselling,
                    psychotherapy, clinical, or client data unless you have the
                    required consent, ethical approval, and data protection
                    arrangements in place. Remove names, contact details,
                    locations, and any details that could identify a participant
                    before upload.
                  </p>
                  <p className="small">
                    Transcript file/paste imports are prepared as a local draft
                    first and are not saved until you review and confirm them.
                    For shared demonstrations, use a short anonymised transcript
                    or test text.
                  </p>
                  {/* TODO: Consider an enforced ethics acknowledgement for non-demo deployments. */}
                </div>
                <details className="workbook-details">
                  <summary>Optional: transcribe interview audio</summary>
                  <div className="upload-panel">
                    <div className="upload-dropzone">
                      <FileAudio size={32} />
                      <h3>Upload interview audio</h3>
                      <p className="small">
                        Supported audio: MP3, M4A, WAV, MP4, WebM, OGG, AAC.
                        {isLocalOnlyMode
                          ? " For shared demos, please use transcript import instead."
                          : " The transcript will be shown for researcher review before any analysis begins."}
                      </p>
                      <div className="upload-controls">
                        <div>
                          <label className="label" htmlFor="audio-language">
                            Audio language
                          </label>
                          <select
                            className="select"
                            id="audio-language"
                            onChange={(event) =>
                              setUploadLanguage(
                                event.target.value === "Chinese"
                                  ? "Chinese"
                                  : "English",
                              )
                            }
                            value={uploadLanguage}
                          >
                            <option value="English">English</option>
                            <option value="Chinese">Chinese</option>
                          </select>
                        </div>
                        <div>
                          <label className="label" htmlFor="audio-file">
                            Audio file
                          </label>
                          <input
                            accept="audio/*,.m4a,.mp3,.mp4,.wav,.webm,.ogg,.aac"
                            className="field"
                            disabled={
                              isLocalOnlyMode || dataSuitabilityBlocksAnalysis
                            }
                            id="audio-file"
                            onChange={(event) =>
                              setSelectedAudioFile(
                                event.target.files?.[0] ?? null,
                              )
                            }
                            type="file"
                          />
                        </div>
                      </div>
                      {selectedAudioFile && (
                        <div className="selected-file">
                          <strong>{selectedAudioFile.name}</strong>
                          <span className="small">
                            {formatBytes(selectedAudioFile.size)}
                          </span>
                        </div>
                      )}
                      <div className="button-row">
                        <button
                          className="button primary"
                          disabled={
                            isLocalOnlyMode ||
                            dataSuitabilityBlocksAnalysis ||
                            isUploadingAudio ||
                            !selectedAudioFile
                          }
                          onClick={uploadAndTranscribeAudio}
                          type="button"
                        >
                          <Upload size={18} />
                          {isLocalOnlyMode
                            ? "Use transcript import for this demo"
                            : isUploadingAudio
                              ? "Uploading and transcribing..."
                              : "Upload and transcribe"}
                        </button>
                        <button
                          className="button"
                          disabled={!latestAudioFile}
                          onClick={loadAudioPreview}
                          type="button"
                        >
                          <Play size={18} />
                          Preview latest audio
                        </button>
                      </div>
                    </div>
                  </div>
                </details>
                <details className="workbook-details transcript-import-details">
                  <summary>Import or paste transcript</summary>
                  <div className="transcript-import-panel">
                    <div>
                      <FileText size={28} />
                      <h3>Import existing transcript</h3>
                      <p className="small">
                        Supported transcript files: TXT, MD, VTT, SRT, DOCX, and
                        PDF. You can also paste text below. The app will prepare
                        the text, then ask you to review it before any draft
                        outputs are created. For shared-link demos, use a short
                        anonymised transcript or test text only. Files over 5 MB
                        are not accepted.
                      </p>
                    </div>
                    <div className="upload-controls">
                      <div>
                        <label className="label" htmlFor="transcript-language">
                          Transcript language
                        </label>
                        <select
                          className="select"
                          id="transcript-language"
                          onChange={(event) =>
                            setUploadLanguage(
                              event.target.value === "Chinese"
                                ? "Chinese"
                                : "English",
                            )
                          }
                          value={uploadLanguage}
                        >
                          <option value="English">English</option>
                          <option value="Chinese">Chinese</option>
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor="transcript-file">
                          Transcript file
                        </label>
                        <input
                          accept=".txt,.md,.vtt,.srt,.docx,.pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                          className="field"
                          disabled={dataSuitabilityBlocksAnalysis}
                          id="transcript-file"
                          onChange={(event) =>
                            void loadTranscriptFile(
                              event.target.files?.[0] ?? null,
                            )
                          }
                          type="file"
                        />
                      </div>
                    </div>
                    <label className="label" htmlFor="transcript-import-text">
                      Paste transcript
                    </label>
                    <textarea
                      className="textarea transcript-import"
                      id="transcript-import-text"
                      onChange={(event) =>
                        setTranscriptImportText(event.target.value)
                      }
                      placeholder="Paste transcript text here. Speaker labels can already be included; otherwise the app will infer Interviewer and Participant turns for your review."
                      value={transcriptImportText}
                    />
                    <button
                      className="button primary"
                      disabled={
                        dataSuitabilityBlocksAnalysis ||
                        isImportingTranscript ||
                        !transcriptImportText.trim()
                      }
                      onClick={() => void importTranscript(false)}
                      type="button"
                    >
                      <Upload size={18} />
                      {isImportingTranscript
                        ? "Preparing transcript..."
                        : "Prepare transcript"}
                    </button>
                    <button
                      className="button"
                      disabled={
                        dataSuitabilityBlocksAnalysis ||
                        isImportingTranscript ||
                        !transcriptImportText.trim()
                      }
                      onClick={() => void importTranscript(true)}
                      type="button"
                    >
                      Use quick local preparation
                    </button>
                    {transcriptPreparationStage && (
                      <div className="mini-card warning-card">
                        <strong>Transcript preparation status</strong>
                        <p className="small">{transcriptPreparationStage}</p>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}

            {activeStep === "pre-analysis" && (
              <div className="section-body grid pre-analysis-card relevance-card">
                <div className="substep-heading">
                  <span>3</span>
                  <div>
                    <h3>Judgement of Relevance</h3>
                    <p>
                      Determine what data are relevant to the study. The
                      researcher is the final decision-maker.
                    </p>
                  </div>
                </div>
                <div className="mini-card soft">
                  <span className="label">Purpose</span>
                  <p className="small">
                    GDI-QR emphasises researcher judgement rather than automated
                    exclusion. I can help flag sections that may be relevant,
                    but you decide what becomes part of your study data.
                  </p>
                  <p className="small">
                    Use this as a visible decision rule for the demo: the system
                    may suggest, but it does not remove material automatically.
                  </p>
                  <label className="label" htmlFor="relevance-guideline">
                    Relevance Decision Guideline
                  </label>
                  <textarea
                    className="textarea compact-textarea"
                    id="relevance-guideline"
                    onChange={(event) =>
                      setRelevanceGuideline(event.target.value)
                    }
                    placeholder="Example: Include participant accounts that address the research question; mark unclear passages as possibly relevant for later review."
                    value={relevanceGuideline}
                  />
                  <p className="small">
                    Use this guideline while reviewing the transcript. The
                    system can assist, but the decision about relevance remains
                    yours.
                  </p>
                </div>
                <details className="workbook-details review-workbook-details">
                  <summary>
                    Review prepared transcript and anonymisation
                  </summary>
                  <div
                    className={`mini-card ${
                      transcriptConfirmed ? "soft" : "review-required"
                    }`}
                  >
                    <div className="category-header">
                      <div>
                        <span className="label">Researcher review gate</span>
                        <h3>
                          {transcriptConfirmed
                            ? "Transcript confirmed for analysis"
                            : "Review transcript before analysis"}
                        </h3>
                        <p className="small">
                          Before continuing, check that every turn is assigned
                          to the correct speaker. Questions and prompts can be
                          labelled Interviewer; interviewee experiences can be
                          labelled Participant. Also correct any missing words,
                          recognition errors, or anonymisation issues. Mistakes
                          here will carry into the meaning units and category
                          drafts.
                        </p>
                        <p className="small">
                          Please ensure that all personal identifiers and
                          sensitive information have been removed or
                          appropriately anonymised before analysis. This may
                          include names, addresses, contact details,
                          institutions, health information, immigration status,
                          financial details, and third-party identifiers.
                        </p>
                      </div>
                      <StatusBadge
                        label={
                          transcriptConfirmed ? "Confirmed" : "Needs review"
                        }
                      />
                    </div>
                    {sensitiveReviewItems.length > 0 && (
                      <div className="privacy-review-list">
                        <div className="category-header">
                          <div>
                            <span className="label">
                              Sensitive information review
                            </span>
                            <p className="small">
                              Review each detected placeholder before analysis.
                              Please confirm, edit, or mark high-risk items as
                              false positives before moving ahead.
                            </p>
                          </div>
                          <button
                            className="button"
                            onClick={() =>
                              setPrivacyReviewExpanded((value) => !value)
                            }
                            type="button"
                          >
                            {privacyReviewExpanded
                              ? "Hide review list"
                              : `Show ${sensitiveReviewItems.length} item${sensitiveReviewItems.length === 1 ? "" : "s"}`}
                          </button>
                        </div>
                        {unresolvedHighRiskCount > 0 && (
                          <div className="mini-card warning-card">
                            <strong>
                              This transcript may still contain identifiable or
                              sensitive information.
                            </strong>
                            <p className="small">
                              Please review these items before analysis.
                            </p>
                          </div>
                        )}
                        {privacyReviewExpanded && (
                          <div className="sensitive-review-grid">
                            {sensitiveReviewItems.map((item) => (
                              <SensitiveReviewCard
                                isActive={item.id === activeSensitiveItemId}
                                item={item}
                                key={item.id}
                                onApplyConsistent={applyConsistentReplacement}
                                onConfirm={(target) =>
                                  updateSensitiveItemStatus(
                                    target.id,
                                    "confirmed",
                                  )
                                }
                                onEdit={editSensitiveReplacement}
                                onFocus={focusSensitiveItem}
                                onIgnore={(target) =>
                                  updateSensitiveItemStatus(
                                    target.id,
                                    "ignored",
                                  )
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {unresolvedHighRiskCount > 0 && (
                      <label className="scope-option">
                        <input
                          checked={privacyOverrideAccepted}
                          onChange={(event) =>
                            setPrivacyOverrideAccepted(event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          I confirm that I have reviewed the transcript and
                          accept responsibility for proceeding.
                        </span>
                      </label>
                    )}
                    {activeSensitiveItem && (
                      <div className="mini-card soft">
                        <span className="label">Selected sensitive item</span>
                        <p className="small">
                          <strong>{activeSensitiveItem.placeholder}</strong> ·{" "}
                          {activeSensitiveItem.category} ·{" "}
                          {activeSensitiveItem.riskLevel} risk
                        </p>
                        <p className="small">
                          {activeSensitiveItem.explanation}
                        </p>
                        <div className="button-row">
                          <button
                            className="button"
                            onClick={() =>
                              updateSensitiveItemStatus(
                                activeSensitiveItem.id,
                                "confirmed",
                              )
                            }
                            type="button"
                          >
                            Confirm anonymisation
                          </button>
                          <button
                            className="button"
                            onClick={() =>
                              editSensitiveReplacement(activeSensitiveItem)
                            }
                            type="button"
                          >
                            Edit label
                          </button>
                          <button
                            className="button"
                            onClick={() =>
                              updateSensitiveItemStatus(
                                activeSensitiveItem.id,
                                "ignored",
                              )
                            }
                            type="button"
                          >
                            Ignore
                          </button>
                          <button
                            className="button"
                            onClick={() =>
                              applyConsistentReplacement(activeSensitiveItem)
                            }
                            type="button"
                          >
                            Apply consistently
                          </button>
                        </div>
                      </div>
                    )}
                    {editableTranscript.trim() && (
                      <div className="mini-card soft">
                        <span className="label">
                          Highlighted transcript review
                        </span>
                        <p className="small">
                          Click a highlighted placeholder to locate it in the
                          editable transcript and review its metadata.
                        </p>
                        <SensitiveTranscriptPreview
                          activeItemId={activeSensitiveItemId}
                          items={sensitiveReviewItems}
                          onSelect={focusSensitiveItem}
                          transcript={editableTranscript}
                        />
                      </div>
                    )}
                    {unresolvedHighRiskCount > 0 &&
                      !privacyOverrideAccepted && (
                        <div className="mini-card warning-card">
                          <strong>
                            Analysis is paused for privacy review.
                          </strong>
                          <p className="small">
                            Confirm, edit, or ignore all high-risk sensitive
                            items before confirming this transcript for
                            analysis.
                          </p>
                        </div>
                      )}
                    {editableTranscript.trim() && (
                      <div className="mini-card soft">
                        <span className="label">Before saving</span>
                        <p className="small">
                          Raw transcripts may contain identifiable or sensitive
                          information. Please review and anonymise the
                          transcript before saving it for analysis.
                        </p>
                      </div>
                    )}
                    <TranscriptReviewHistory
                      transcriptRecords={displayTranscriptRecords}
                    />
                    <button
                      className="button primary"
                      disabled={
                        isConfirmingTranscript ||
                        !editableTranscript.trim() ||
                        dataSuitabilityBlocksAnalysis ||
                        !canProceedWithTranscript
                      }
                      onClick={confirmTranscriptForAnalysis}
                      type="button"
                    >
                      <Check size={18} />
                      {isConfirmingTranscript
                        ? "Confirming..."
                        : "Confirm reviewed transcript for analysis"}
                    </button>
                  </div>
                  <div className="button-row">
                    <button
                      className="button soft"
                      disabled={!latestAudioFile}
                      onClick={loadAudioPreview}
                      type="button"
                    >
                      <Play size={18} />
                      Audio preview
                    </button>
                    <button
                      className="button"
                      disabled={!editableTranscript.trim()}
                      onClick={cleanTranscript}
                      type="button"
                    >
                      <RefreshCcw size={18} />
                      Clean transcript
                    </button>
                    <button
                      className="button"
                      disabled={
                        !editableTranscript.trim() ||
                        dataSuitabilityBlocksAnalysis ||
                        !canProceedWithTranscript
                      }
                      onClick={saveTranscriptVersion}
                      type="button"
                    >
                      <Archive size={18} />
                      Save reviewed transcript
                    </button>
                    <button
                      className="button danger"
                      disabled={
                        !editableTranscript.trim() &&
                        displayAudioFiles.length === 0 &&
                        displaySegments.length === 0 &&
                        units.length === 0 &&
                        displayCategories.length === 0
                      }
                      onClick={() => void clearTranscriptAndDerivedOutputs()}
                      type="button"
                    >
                      <Trash2 size={18} />
                      Delete transcript + outputs
                    </button>
                  </div>
                  <details className="workbook-details">
                    <summary>Open editable transcript</summary>
                    <label className="label" htmlFor="transcript-editor">
                      Editable transcript
                    </label>
                    <textarea
                      className="textarea transcript"
                      id="transcript-editor"
                      onChange={(event) => {
                        const nextTranscript = event.target.value;
                        setEditableTranscript(nextTranscript);
                        setTranscriptConfirmed(false);
                        setTranscriptStorageStatus(
                          "Not saved yet — local draft only",
                        );
                        setPrivacyOverrideAccepted(false);
                        setAiPrivacyFindings(
                          extractPrivacyReviewMarkers(nextTranscript),
                        );
                      }}
                      placeholder="Your uploaded audio transcript will appear here after local transcription."
                      ref={transcriptTextAreaRef}
                      value={editableTranscript}
                    />
                  </details>
                  {audioPreviewUrl && (
                    <audio
                      className="audio-player"
                      controls
                      src={audioPreviewUrl}
                    />
                  )}
                </details>
              </div>
            )}

            {activeStep === "understanding" && (
              <div className="section-body grid">
                <div
                  className="analysis-flow-story"
                  aria-label="Understanding and translating flow"
                >
                  <span>Participant Account</span>
                  <em>optional assistant support</em>
                  <span>Meaning Unit</span>
                  <em>optional assistant support</em>
                  <span>Analytic Summary</span>
                </div>
                <div className="analysis-workspace understanding-workspace">
                  <section className="analysis-panel">
                    <span className="flow-step">1 · Raw account</span>
                    <span className="label">Transcript</span>
                    <h3>Participant account</h3>
                    <p className="small">
                      Work from the participant's words. Use this panel to keep
                      the source account visible while delineating meaning units
                      and reviewing summaries.
                    </p>
                    <p className="small panel-note">
                      The transcript remains the reference point. If a later
                      meaning unit looks wrong, return here and correct the
                      source text first.
                    </p>
                    <textarea
                      className="textarea transcript comparison-textarea"
                      onChange={(event) => {
                        const nextTranscript = event.target.value;
                        setEditableTranscript(nextTranscript);
                        setTranscriptConfirmed(false);
                        setTranscriptStorageStatus(
                          "Not saved yet — local draft only",
                        );
                        setPrivacyOverrideAccepted(false);
                        setAiPrivacyFindings(
                          extractPrivacyReviewMarkers(nextTranscript),
                        );
                      }}
                      placeholder="Prepare and confirm a transcript in Step 1."
                      value={editableTranscript}
                    />
                    <div className="button-row">
                      <button
                        className="button"
                        onClick={() => setActiveStep("pre-analysis")}
                        type="button"
                      >
                        Review transcript
                      </button>
                      <StatusBadge
                        label={
                          transcriptConfirmed ? "Confirmed" : "Needs review"
                        }
                      />
                    </div>
                    <details className="workbook-details">
                      <summary>Advanced: speaker / segment handling</summary>
                      <p className="small">
                        Split by line-level speaker labels such as Interviewer:,
                        Moderator:, Participant:, Q:, A:, 访谈者:, or 受访者:.
                        Continuation lines stay with the preceding turn. Correct
                        low-confidence segments before generating meaning units;
                        interviewer-only turns are ignored by default.
                      </p>
                      <div className="button-row">
                        <button
                          className="button"
                          disabled={
                            isSpeakerSplittingTranscript ||
                            !editableTranscript.trim() ||
                            !transcriptConfirmed
                          }
                          onClick={() => void speakerSplitTranscriptSegments()}
                          type="button"
                        >
                          {isSpeakerSplittingTranscript
                            ? "Splitting by speaker..."
                            : "Split transcript by speaker labels"}
                        </button>
                        <select
                          className="select"
                          onChange={(event) =>
                            setSegmentSplitMode(
                              event.target.value as AutoSegmentMode,
                            )
                          }
                          value={segmentSplitMode}
                        >
                          <option value="conservative">
                            Conservative topic split
                          </option>
                          <option value="balanced">Balanced topic split</option>
                          <option value="detailed">Detailed topic split</option>
                        </select>
                        <button
                          className="button"
                          disabled={
                            isAutoSplittingTranscript ||
                            !editableTranscript.trim() ||
                            !transcriptConfirmed
                          }
                          onClick={() => void autoSplitTranscriptSegments()}
                          type="button"
                        >
                          {isAutoSplittingTranscript
                            ? "Auto-delineating..."
                            : "Auto-delineate topic segments"}
                        </button>
                      </div>
                      {displaySegments.length === 0 ? (
                        <EmptyState text="No segments yet. Confirm the transcript, then split by speaker labels or topic boundaries." />
                      ) : (
                        <div className="mini-card soft">
                          <div className="grid two">
                            <label className="label">
                              Segment
                              <select
                                className="select"
                                onChange={(event) =>
                                  setSelectedSegmentId(event.target.value)
                                }
                                value={selectedSegmentId}
                              >
                                {displaySegments.map((segment) => (
                                  <option key={segment.id} value={segment.id}>
                                    {segment.segmentId} ·{" "}
                                    {segment.speakerRole ?? "unclear"} ·{" "}
                                    {segment.topicLabel}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="label">
                              Segment type
                              <select
                                className="select"
                                onChange={(event) =>
                                  setSegmentDraftRole(
                                    event.target.value as SegmentSpeakerRole,
                                  )
                                }
                                value={segmentDraftRole}
                              >
                                <option value="participant">Participant</option>
                                <option value="interviewer">
                                  Interviewer / prompt only
                                </option>
                                <option value="unclear">Unclear / mixed</option>
                              </select>
                            </label>
                          </div>
                          <label className="label" htmlFor="segment-title">
                            Segment label
                          </label>
                          <input
                            className="field"
                            id="segment-title"
                            onChange={(event) =>
                              setSegmentDraftTitle(event.target.value)
                            }
                            value={segmentDraftTitle}
                          />
                          <label className="label" htmlFor="segment-text">
                            Segment text
                          </label>
                          <textarea
                            className="textarea compact-textarea"
                            id="segment-text"
                            onChange={(event) =>
                              setSegmentDraftText(event.target.value)
                            }
                            ref={segmentTextAreaRef}
                            value={segmentDraftText}
                          />
                          <div className="button-row">
                            <button
                              className="button primary"
                              disabled={isSavingSegment || !selectedSegment}
                              onClick={() => void saveSelectedSegment()}
                              type="button"
                            >
                              {isSavingSegment
                                ? "Saving..."
                                : "Save segment edit"}
                            </button>
                            <button
                              className="button"
                              disabled={
                                isSavingSegment ||
                                !selectedSegment ||
                                segmentDraftRole === "interviewer"
                              }
                              onClick={() =>
                                void saveSelectedSegment(
                                  "Ready for MU Analysis",
                                )
                              }
                              type="button"
                            >
                              Mark ready for MU analysis
                            </button>
                            <button
                              className="button"
                              disabled={isSavingSegment || !selectedSegment}
                              onClick={() => void runSegmentAction("split")}
                              type="button"
                            >
                              Split at cursor
                            </button>
                            <button
                              className="button"
                              disabled={!previousSegment || isSavingSegment}
                              onClick={() =>
                                void runSegmentAction("merge", "previous")
                              }
                              type="button"
                            >
                              Merge previous
                            </button>
                            <button
                              className="button"
                              disabled={!nextSegment || isSavingSegment}
                              onClick={() =>
                                void runSegmentAction("merge", "next")
                              }
                              type="button"
                            >
                              Merge next
                            </button>
                            <button
                              className="button danger"
                              disabled={isSavingSegment || !selectedSegment}
                              onClick={() => void deleteSelectedSegment()}
                              type="button"
                            >
                              Delete segment
                            </button>
                          </div>
                          <p className="small panel-note">
                            Current selected segment:{" "}
                            {selectedSegment?.segmentId} · type{" "}
                            {segmentDraftRole}. Facilitator/interviewer speech is
                            retained as traceable context and is not substantive
                            participant data by default.
                          </p>
                        </div>
                      )}
                    </details>
                  </section>

                  <section className="analysis-panel">
                    <span className="flow-step">
                      2 · Meaning unit delineation
                    </span>
                    <span className="label">Meaning Units</span>
                    <h3>Delineate meaning shifts</h3>
                    <p className="small">
                      Default delineation is conservative: keep connected
                      examples, explanations, and consequences together, and
                      split only at a clear shift in participant meaning.
                    </p>
                    <p className="small panel-note">
                      Treat these boundaries as reviewable working decisions,
                      not automatic truth.
                    </p>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={
                          isGeneratingMeaningUnits ||
                          !editableTranscript.trim() ||
                          !transcriptConfirmed
                        }
                        onClick={() => void generateMeaningUnits()}
                        title={
                          transcriptConfirmed
                            ? "Parse roles, retain context, delineate participant meanings, draft summaries, and run safeguards"
                            : "Confirm the transcript before meaning-unit delineation"
                        }
                        type="button"
                      >
                        <Play size={18} />
                        {isGeneratingMeaningUnits
                          ? "Delineating draft MUs..."
                          : generationButtonLabel}
                      </button>
                      {isGeneratingMeaningUnits && (
                        <button
                          className="button danger"
                          onClick={stopMeaningUnitGeneration}
                          type="button"
                        >
                          Stop
                        </button>
                      )}
                      <button
                        className="button"
                        disabled={
                          isGeneratingMeaningUnits ||
                          !editableTranscript.trim() ||
                          !transcriptConfirmed
                        }
                        onClick={() => void generateMeaningUnits(null, true)}
                        type="button"
                      >
                        Generate provisional structural spans
                      </button>
                    </div>
                    <p className="small panel-note">
                      This recovery option creates structural candidate spans only.
                      It does not complete semantic MU delineation or summaries.
                    </p>
                    {(generationProgress || meaningUnitGenerationStage) && (
                      <div className="mini-card warning-card">
                        <strong>
                          {isGeneratingMeaningUnits
                            ? "Meaning-unit generation in progress"
                            : "Meaning-unit generation status"}
                        </strong>
                        <p className="small">
                          {meaningUnitGenerationStage ||
                            "Delineating draft meaning units from the confirmed transcript. This may take a moment."}
                        </p>
                        {meaningUnitGenerationMethod && (
                          <span className="badge blue">
                            {meaningUnitGenerationMethod === "ai_semantic"
                              ? "AI-assisted semantic delineation"
                              : meaningUnitGenerationMethod === "mixed"
                                ? "AI semantic + provisional spans"
                                : "Provisional structural spans"}
                          </span>
                        )}
                      </div>
                    )}
                    <div className="mini-card soft">
                      <span className="label">Meaning-unit generation</span>
                      <h3>
                        {meaningUnitGenerationMethod === "rule_based_fallback"
                          ? `${generationCounts.uncertainSegments} provisional structural spans`
                          : meaningUnitGenerationMethod === "mixed"
                            ? `${generationCounts.substantiveMeaningUnits} semantic MUs + ${generationCounts.uncertainSegments} provisional spans`
                            : `${generationCounts.substantiveMeaningUnits} draft substantive MUs`}
                      </h3>
                      <p className="small">
                        Participant material detected: {generationCounts.participantTurns} turns
                        <br />
                        Context-only segments: {generationCounts.contextOnlySegments}
                        <br />
                        Housekeeping/non-analytic segments: {generationCounts.nonAnalyticSegments}
                        <br />
                        Uncertain segments requiring review: {generationCounts.uncertainSegments}
                        <br />
                        Opening/icebreaker background suggestions (included for your decision): {generationCounts.openingBackgroundCandidates}
                        <br />
                        Researcher accepted substantive MUs: {confirmedMeaningUnits.length}
                      </p>
                      <p className="small panel-note">
                        Context and source line references remain attached for
                        traceability. Structural chunks are preprocessing, not
                        analytic units.
                      </p>
                    </div>
                    {currentMeaningUnits.length === 0 && (
                      <EmptyState text="No draft meaning units yet. Confirm the transcript, then generate draft MUs for researcher review." />
                    )}
                  </section>

                  <section className="analysis-panel">
                    <span className="flow-step">3 · Researcher MU review</span>
                    <span className="label">Draft Meaning Units</span>
                    <h3>Review excerpts and summaries</h3>
                    <p className="small">
                      Each MU is provisional until you edit, accept, or exclude
                      it. Assistant classifications are suggestions only: all
                      participant MU candidates remain visible in transcript
                      order, while interviewer questions are retained separately
                      as interaction context.
                    </p>
                    <p className="small panel-note">
                      Accept only the reviewed summaries that accurately capture
                      the participant meaning.
                    </p>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={
                          reviewableMeaningUnits.length === 0 ||
                          isAcceptingMeaningUnits
                        }
                        onClick={() => void acceptAllReviewedMeaningUnits()}
                        type="button"
                      >
                        <Check size={18} />
                        {isAcceptingMeaningUnits
                          ? "Saving accepted summaries..."
                          : "Accept reviewed summaries"}
                      </button>
                      <button
                        className="button"
                        disabled={
                          isSavingMeaningUnitAction || !transcriptConfirmed
                        }
                        onClick={() => void addManualMeaningUnit()}
                        type="button"
                      >
                        Add manual meaning unit
                      </button>
                    </div>
                    <div className="summary-list">
                      {reviewableMeaningUnits.length === 0 ? (
                        <EmptyState text="No summaries yet. Delineate meaning units, then ask for optional assistant support or write summaries manually." />
                      ) : (
                        <>
                          {reviewableMeaningUnits.map((unit) => (
                              <MeaningUnitReviewCard
                                key={unit.id}
                                onAccept={markAccepted}
                                onEditExclusionReason={updateExclusionReason}
                                onEditExcerpt={updateMeaningUnitExcerpt}
                                onEditSummary={updateHumanSummary}
                                onDelete={deleteMeaningUnitFromWorkspace}
                                onExclude={excludeMeaningUnit}
                                onMergeNext={(targetUnit) =>
                                  void mergeMeaningUnitFromCard(
                                    targetUnit,
                                    "next",
                                  )
                                }
                                onMergePrevious={(targetUnit) =>
                                  void mergeMeaningUnitFromCard(
                                    targetUnit,
                                    "previous",
                                  )
                                }
                                onRestore={restoreMeaningUnit}
                                onReturnToTranscript={returnToTranscriptForUnit}
                                onSaveExcerpt={saveMeaningUnitExcerpt}
                                onSaveSummary={saveMeaningUnitHumanSummary}
                                onSplit={(targetUnit) =>
                                  void splitMeaningUnitFromCard(targetUnit)
                                }
                                unit={unit}
                              />
                            ))}
                          {contextMaterialRecords.length > 0 && (
                            <details className="workbook-details">
                              <summary>
                                Facilitator/interviewer context retained for
                                traceability ({contextMaterialRecords.length})
                              </summary>
                              <div className="summary-list">
                                {contextMaterialRecords.map((unit) => (
                                  <MeaningUnitReviewCard
                                    key={unit.id}
                                    onAccept={markAccepted}
                                    onEditExclusionReason={
                                      updateExclusionReason
                                    }
                                    onEditExcerpt={updateMeaningUnitExcerpt}
                                    onEditSummary={updateHumanSummary}
                                    onDelete={deleteMeaningUnitFromWorkspace}
                                    onExclude={excludeMeaningUnit}
                                    onMergeNext={(targetUnit) =>
                                      void mergeMeaningUnitFromCard(
                                        targetUnit,
                                        "next",
                                      )
                                    }
                                    onMergePrevious={(targetUnit) =>
                                      void mergeMeaningUnitFromCard(
                                        targetUnit,
                                        "previous",
                                      )
                                    }
                                    onRestore={restoreMeaningUnit}
                                    onReturnToTranscript={
                                      returnToTranscriptForUnit
                                    }
                                    onSaveExcerpt={saveMeaningUnitExcerpt}
                                    onSaveSummary={saveMeaningUnitHumanSummary}
                                    onSplit={(targetUnit) =>
                                      void splitMeaningUnitFromCard(targetUnit)
                                    }
                                    unit={unit}
                                  />
                                ))}
                              </div>
                            </details>
                          )}
                        </>
                      )}
                    </div>
                  </section>
                </div>
                <details className="workbook-details">
                  <summary>Meaning Unit Integrity Support</summary>
                  <ReviewerPanel
                    dismissActionLabel="Dismiss with memo"
                    emptyText="Run a lightweight Step 2 review after draft meaning units are available. The assistant will flag possible MU boundary, summary, source, and context issues for researcher judgement."
                    expandedIssueIds={expandedReviewIssueIds}
                    hasRun={muIntegrityReviewRan}
                    issueContextById={meaningUnitIssueContextById}
                    isOpen={muReviewOpen}
                    issues={meaningUnitReviewIssues}
                    isRunning={isRunningReviewer}
                    noActiveText="No major Step 2 integrity issues found. Please still review meaning-unit boundaries and summaries carefully."
                    onAddMemo={(issue) => {
                      const memo = promptWorkspaceText(
                        "Researcher note for this integrity issue:",
                        issue.researcherMemo ?? "",
                      );
                      if (memo !== null) {
                        void updateReviewerIssue(issue.id, { memo });
                      }
                    }}
                    onDismiss={(issue) => {
                      const memo = promptWorkspaceText(
                        "Dismissal memo: why is this not a Step 2 integrity concern?",
                        issue.researcherMemo ?? "",
                      );
                      if (memo !== null) {
                        void updateReviewerIssue(issue.id, {
                          memo,
                          status: "dismissed",
                        });
                      }
                    }}
                    onResolve={(issue) =>
                      void updateReviewerIssue(issue.id, { status: "resolved" })
                    }
                    onRun={() => void runReviewer("meaning-units")}
                    onToggle={() => setMuReviewOpen((value) => !value)}
                    onToggleIssue={(issueId) =>
                      setExpandedReviewIssueIds((current) =>
                        current.includes(issueId)
                          ? current.filter((id) => id !== issueId)
                          : [...current, issueId],
                      )
                    }
                    onView={viewReviewerTarget}
                    panelBadge="Step 2 support"
                    responsibilityText="The assistant flags possible issues only. The researcher decides what needs revision before accepting meaning units."
                    runButtonLabel="Review meaning-unit integrity"
                    showAddMemoAction={false}
                    title="Meaning Unit Integrity Support"
                    viewActionLabel="Edit MU"
                  />
                </details>
              </div>
            )}

            {activeStep === "categorizing" && (
              <div className="section-body grid">
                <div className="mini-card soft">
                  <span className="label">GDI-QR principle</span>
                  <h3>Meaning Units ↔ Categories</h3>
                  <p className="small">
                    Categories emerge from meaning units. Categories are
                    findings; domains are not findings. Categories may be
                    renamed, merged, divided, or reorganised throughout
                    analysis.
                  </p>
                  <div className="button-row">
                    <span
                      className={`badge ${
                        confirmedMeaningUnits.length > 0 ? "" : "warning"
                      }`}
                    >
                      Accepted meaning units: {confirmedMeaningUnits.length} /{" "}
                      {reviewableMeaningUnits.length - excludedMeaningUnits.length}
                    </span>
                    {displayCategories.length > 0 && (
                      <span className="badge blue">
                        Researcher-confirmed categories:{" "}
                        {confirmedCategoryCount} /{" "}
                        {
                          displayCategories.filter(
                            (item) => item.status !== "rejected",
                          ).length
                        }
                      </span>
                    )}
                    {hasFallbackCategoryLabels && (
                      <span className="badge blue">
                        Assistant status available
                      </span>
                    )}
                  </div>
                </div>
                <div className="analysis-workspace categorizing-workspace">
                  <section className="analysis-panel">
                    <span className="label">Meaning Units</span>
                    <h3>Compare participant meanings</h3>
                    <p className="small">
                      Use accepted researcher-reviewed summaries as the evidence
                      base for categorizing. Similar meanings can be grouped,
                      moved, and compared as categories develop.
                    </p>
                    {confirmedMeaningUnits.length === 0 ? (
                      <EmptyState text="No accepted meaning units yet. Return to Understanding & Translating to accept summaries first." />
                    ) : (
                      <div className="summary-list">
                        {confirmedMeaningUnits.map((unit) => (
                          <article className="summary-card" key={unit.id}>
                            <div className="category-header">
                              <strong>MU #{unit.number}</strong>
                              <StatusBadge label={unit.humanStatus} />
                            </div>
                            <p className="small">
                              {unit.humanSummary ||
                                unit.aiSummary ||
                                unit.excerpt}
                            </p>
                            <p className="small">
                              Current categories:{" "}
                              {displayCategories
                                .filter((category) =>
                                  category.includedUnitIds.includes(
                                    unit.number,
                                  ),
                                )
                                .map((category) =>
                                  getCategoryDisplayTitle(category),
                                )
                                .join(", ") || "Unassigned"}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                    <UnassignedMeaningUnits
                      categories={displayCategories}
                      onAssign={assignMeaningUnitToCategory}
                      onCreateCategory={addCategoryDraft}
                      units={unassignedMeaningUnits}
                    />
                  </section>
                  <section className="analysis-panel">
                    <span className="label">Evidence Clusters</span>
                    <h3>Compare, group, then name</h3>
                    <p className="small">
                      Category work is iterative. Rename, merge, split, move
                      meaning units, and reject weak categories as the analysis
                      becomes clearer.
                    </p>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={
                          confirmedMeaningUnits.length === 0 ||
                          isRunningCategories
                        }
                        onClick={() =>
                          void runCategories({ modeOverride: "A" })
                        }
                        type="button"
                      >
                        <Play size={18} />
                        Optional assistant support: suggest possible grouping
                      </button>
                      <button
                        className="button"
                        disabled={
                          displayCategories.length === 0 ||
                          hasTemporaryFallbackCategories ||
                          isRunningCategories
                        }
                        onClick={() =>
                          void runCategories({ modeOverride: "B" })
                        }
                        type="button"
                      >
                        <RefreshCcw size={18} />
                        Optional assistant support: compare similarities
                      </button>
                      <button
                        className="button"
                        disabled={confirmedMeaningUnits.length === 0}
                        onClick={() => void addCategoryDraft()}
                        type="button"
                      >
                        Create empty category
                      </button>
                    </div>
                    {isRunningCategories && (
                      <span className="badge warning">
                        Drafting category suggestions...
                      </span>
                    )}
                    {categoryDraftNotice && (
                      <details className="assistant-status-panel category-generation-status">
                        <summary>Assistant Generation Status</summary>
                        <p className="small">{categoryDraftNotice}</p>
                        {hasTemporaryFallbackCategories && (
                          <div className="button-row">
                            <button
                              className="button"
                              disabled={isRunningCategories}
                              onClick={() =>
                                void runCategories({
                                  allowFallbackRegenerate: true,
                                  modeOverride: displayCategories.length
                                    ? "B"
                                    : "A",
                                })
                              }
                              type="button"
                            >
                              <RefreshCcw size={18} />
                              Redraft category suggestion
                            </button>
                            <button
                              className="button"
                              disabled={isRunningCategories}
                              onClick={() =>
                                void acceptTemporaryCategoryDraft()
                              }
                              type="button"
                            >
                              <Check size={18} />
                              Use as editable starting point
                            </button>
                          </div>
                        )}
                      </details>
                    )}
                    {displayCategories.length === 0 ? (
                      <div className="empty-with-example">
                        <EmptyState text="Start by selecting accepted meaning units that appear to share a common meaning, or request optional assistant support for possible groupings." />
                        <details className="workbook-details category-structure-help">
                          <summary>What is a category?</summary>
                          <p className="small">
                            A category groups related meaning units that appear
                            to share a common meaning.
                          </p>
                          <div
                            className="category-structure-diagram"
                            aria-label="Category structure"
                          >
                            <strong>Category</strong>
                            <span>├─ Meaning Unit 1</span>
                            <span>├─ Meaning Unit 2</span>
                            <span>└─ Meaning Unit 3</span>
                          </div>
                          <p className="small">
                            Categories are provisional and may be renamed,
                            merged, divided, or reorganised as analysis
                            develops.
                          </p>
                        </details>
                      </div>
                    ) : (
                      <div className="grid">
                        {displayCategories.map((category) => (
                          <CategoryBlock
                            categories={displayCategories}
                            category={category}
                            key={category.id}
                            onAssignUnit={assignMeaningUnitToCategory}
                            onConfirm={confirmCategoryDraft}
                            onDelete={deleteCategoryDraft}
                            onMerge={mergeCategoryDraft}
                            onReject={rejectCategoryDraft}
                            onRemoveUnit={removeMeaningUnitFromCategory}
                            onSplit={splitCategoryDraft}
                            onUpdate={updateCategoryDraft}
                            units={confirmedMeaningUnits}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
                <details className="workbook-details">
                  <summary>Methodological integrity support</summary>
                  <ReviewerPanel
                    expandedIssueIds={expandedReviewIssueIds}
                    isOpen={categoryReviewOpen}
                    issues={categoryReviewIssues}
                    isRunning={isRunningReviewer}
                    onAddMemo={(issue) => {
                      const memo = promptWorkspaceText(
                        "Researcher note for this integrity issue:",
                        issue.researcherMemo ?? "",
                      );
                      if (memo !== null) {
                        void updateReviewerIssue(issue.id, { memo });
                      }
                    }}
                    onDismiss={(issue) =>
                      void updateReviewerIssue(issue.id, {
                        status: "dismissed",
                      })
                    }
                    onResolve={(issue) =>
                      void updateReviewerIssue(issue.id, { status: "resolved" })
                    }
                    onRun={() => void runReviewer("categories")}
                    onToggle={() => setCategoryReviewOpen((value) => !value)}
                    onToggleIssue={(issueId) =>
                      setExpandedReviewIssueIds((current) =>
                        current.includes(issueId)
                          ? current.filter((id) => id !== issueId)
                          : [...current, issueId],
                      )
                    }
                    onView={viewReviewerTarget}
                    title="Category Review"
                  />
                </details>
              </div>
            )}

            {activeStep === "integrating" && (
              <div className="section-body grid">
                <div className="mini-card soft relationship-structure-card">
                  <span className="flow-step">1 · Relationship Structure</span>
                  <span className="label">
                    Provisional relationship structure
                  </span>
                  <h3>
                    {integrationStructureTitle ||
                      "Generate or sketch a relationship structure"}
                  </h3>
                  <p className="small">
                    Integration involves identifying how categories relate to
                    one another and developing a coherent summary structure.
                    Summary narratives should explain relationships among
                    categories, not simply list them.
                  </p>
                  <p className="small">
                    The relationship structure is the primary analytic work in
                    this step. Any assistant suggestion is provisional; review
                    it against the meaning-unit evidence.
                  </p>
                  <label className="scope-option">
                    <input
                      checked={allSegmentsProcessedForModeC}
                      onChange={(event) =>
                        setAllSegmentsProcessedForModeC(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>
                      I confirm all meaning units in this transcript have been
                      processed, reviewed, and accepted for integration.
                    </span>
                  </label>
                  <div className="button-row">
                    <button
                      className="button"
                      disabled={
                        !canGenerateIntegrationStructure || isRunningCategories
                      }
                      onClick={() => void generateIntegrationStructureDraft()}
                      type="button"
                    >
                      <GitBranch size={18} />
                      Optional assistant support: suggest relationship structure
                    </button>
                    <button
                      className="button"
                      onClick={addIntegrationRelationship}
                      type="button"
                    >
                      Add relationship
                    </button>
                    <button
                      className="button primary"
                      disabled={isSavingIntegration}
                      onClick={() => void saveIntegrationDraft()}
                      type="button"
                    >
                      {isSavingIntegration
                        ? "Saving integration..."
                        : "Save integration draft"}
                    </button>
                    {integrationSavedAt && (
                      <span className="small">
                        Last saved: {formatTime(integrationSavedAt)}
                      </span>
                    )}
                  </div>
                  {integrationStructureNotice && (
                    <p className="small panel-note">
                      {integrationStructureNotice}
                    </p>
                  )}
                  {integrationStructureExplanation && (
                    <label className="label">
                      Structure explanation
                      <textarea
                        className="textarea compact-textarea"
                        onChange={(event) => {
                          setIntegrationStructureExplanation(
                            event.target.value,
                          );
                          setIntegrationReviewed(false);
                        }}
                        value={integrationStructureExplanation}
                      />
                    </label>
                  )}
                  {integrationRelationships.length === 0 ? (
                    <EmptyState text="No relationships yet. Generate a provisional structure or add a researcher-created relationship." />
                  ) : (
                    <div className="relationship-card-list">
                      {integrationRelationships.map((relationship) => (
                        <IntegrationRelationshipCard
                          categories={reviewedIntegrationCategories}
                          key={relationship.id}
                          onRemove={removeIntegrationRelationship}
                          onUpdate={updateIntegrationRelationship}
                          relationship={relationship}
                          units={confirmedMeaningUnits}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="mini-card relationship-map-card">
                  <span className="flow-step">2 · Category Map</span>
                  <span className="label">Draft category map</span>
                  <h3>How do the reviewed categories connect?</h3>
                  {reviewedIntegrationCategories.length < 2 ? (
                    <div className="relationship-map-placeholder">
                      <EmptyState text="Not enough reviewed categories to generate an integration structure. Please return to Step 3 and accept or revise categories first." />
                      <div
                        className="relationship-example-map"
                        aria-hidden="true"
                      >
                        <div className="example-map-node primary">
                          Reviewed category 1
                        </div>
                        <span className="example-map-link">supports</span>
                        <div className="example-map-node">
                          Reviewed category 2
                        </div>
                        <span className="example-map-link split">while</span>
                        <div className="example-map-node">
                          Reviewed category 3
                        </div>
                      </div>
                      <p className="small">
                        Once categories are reviewed, this area will help you
                        sketch relationships such as sequence, contrast,
                        support, tension, or shared context.
                      </p>
                    </div>
                  ) : integrationRelationships.length === 0 ? (
                    <div className="relationship-map-placeholder">
                      <EmptyState text="No draft relationships yet. Generate a provisional structure or add a relationship to begin mapping how categories may connect." />
                      <p className="small">
                        This map should show possible relationships among
                        categories. Evidence MUs appear only as secondary review
                        references under each relationship.
                      </p>
                    </div>
                  ) : (
                    <div className="relationship-map relationship-network">
                      {integrationRelationships.map((relationship) => (
                        <RelationshipFlowRow
                          categories={reviewedIntegrationCategories}
                          key={relationship.id}
                          relationship={relationship}
                          units={confirmedMeaningUnits}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="integration-narrative-area">
                  <span className="flow-step">3 · Summary Narrative</span>
                  <IntegrationDraftPanel
                    categories={reviewedIntegrationCategories}
                    integrationNote={integrationNote}
                    integrationReviewed={integrationReviewed}
                    narrative={narrative}
                    onChangeNarrative={(value) => {
                      setNarrative(value);
                      setIntegrationReviewed(false);
                    }}
                    onConfirm={() => {
                      if (!narrative.trim()) {
                        setApiStatus(
                          "Write or draft a summary narrative before confirming.",
                        );
                        return;
                      }
                      if (hasSensitivePlaceholder(narrative)) {
                        setApiStatus(
                          "Summary narrative contains sensitive placeholders. Review before confirming.",
                        );
                        return;
                      }
                      setIntegrationReviewed(true);
                      void persistIntegrationWorkspace({
                        action:
                          "Confirmed researcher-reviewed integration narrative",
                        actionType: "relationship_updated",
                        reviewed: true,
                      });
                    }}
                    onNoteChange={setIntegrationNote}
                    units={confirmedMeaningUnits}
                  />
                </div>
              </div>
            )}

            {activeStep === "integrity" && (
              <div className="section-body grid">
                <div className="mini-card soft">
                  <span className="label">Methodological Integrity Review</span>
                  <p className="small">
                    Methodological integrity means making the analytic process
                    transparent, coherent, credible, and respectful of
                    participants. I can flag places for reflection, and you
                    decide what needs revision.
                  </p>
                  <div className="button-row">
                    <button
                      className="button primary"
                      disabled={!canRunReviewer || isRunningReviewer}
                      onClick={() => void runReviewer("meaning-units")}
                      type="button"
                    >
                      <ShieldCheck size={18} />
                      Review meaning-unit integrity
                    </button>
                    <button
                      className="button"
                      disabled={!displayCategories.length || isRunningReviewer}
                      onClick={() => void runReviewer("categories")}
                      type="button"
                    >
                      <ShieldCheck size={18} />
                      Review category and narrative integrity
                    </button>
                    <button
                      className="button"
                      disabled={Boolean(isExportingFormat)}
                      onClick={() => void exportWorkspace("json")}
                      type="button"
                    >
                      <Download size={18} />
                      Export audit trail
                    </button>
                  </div>
                </div>
                <MethodologicalIntegrityChecklist
                  items={integrityChecklistItems}
                  isSaving={isSavingIntegrityReview}
                  lastSavedAt={integritySavedAt}
                  onRefresh={refreshIntegrityChecklistFromProjectState}
                  onSave={() => void saveIntegrityReview()}
                  onUpdate={updateIntegrityReviewItem}
                />
                <AuditTrailPanel auditEvents={displayAuditEvents} />
                <details className="workbook-details reflection-details">
                  <summary>Open detailed reflection panels</summary>
                  <div className="review-layout">
                    <ReviewerPanel
                      dismissActionLabel="Dismiss with memo"
                      emptyText="Run a lightweight Step 2 review after draft meaning units are available. The assistant will flag possible MU boundary, summary, source, and context issues for researcher judgement."
                      expandedIssueIds={expandedReviewIssueIds}
                      hasRun={muIntegrityReviewRan}
                      issueContextById={meaningUnitIssueContextById}
                      isOpen={muReviewOpen}
                      issues={meaningUnitReviewIssues}
                      isRunning={isRunningReviewer}
                      noActiveText="No major Step 2 integrity issues found. Please still review meaning-unit boundaries and summaries carefully."
                      onAddMemo={(issue) => {
                        const memo = promptWorkspaceText(
                          "Researcher note for this integrity issue:",
                          issue.researcherMemo ?? "",
                        );
                        if (memo !== null) {
                          void updateReviewerIssue(issue.id, { memo });
                        }
                      }}
                      onDismiss={(issue) => {
                        const memo = promptWorkspaceText(
                          "Dismissal memo: why is this not a Step 2 integrity concern?",
                          issue.researcherMemo ?? "",
                        );
                        if (memo !== null) {
                          void updateReviewerIssue(issue.id, {
                            memo,
                            status: "dismissed",
                          });
                        }
                      }}
                      onResolve={(issue) =>
                        void updateReviewerIssue(issue.id, {
                          status: "resolved",
                        })
                      }
                      onRun={() => void runReviewer("meaning-units")}
                      onToggle={() => setMuReviewOpen((value) => !value)}
                      onToggleIssue={(issueId) =>
                        setExpandedReviewIssueIds((current) =>
                          current.includes(issueId)
                            ? current.filter((id) => id !== issueId)
                            : [...current, issueId],
                        )
                      }
                      onView={viewReviewerTarget}
                      panelBadge="Step 2 support"
                      responsibilityText="The assistant flags possible issues only. The researcher decides what needs revision before accepting meaning units."
                      runButtonLabel="Review meaning-unit integrity"
                      showAddMemoAction={false}
                      title="Meaning Unit Integrity Support"
                      viewActionLabel="Edit MU"
                    />
                    <ReviewerPanel
                      expandedIssueIds={expandedReviewIssueIds}
                      isOpen={categoryReviewOpen}
                      issues={categoryReviewIssues}
                      isRunning={isRunningReviewer}
                      onAddMemo={(issue) => {
                        const memo = promptWorkspaceText(
                          "Researcher note for this integrity issue:",
                          issue.researcherMemo ?? "",
                        );
                        if (memo !== null) {
                          void updateReviewerIssue(issue.id, { memo });
                        }
                      }}
                      onDismiss={(issue) =>
                        void updateReviewerIssue(issue.id, {
                          status: "dismissed",
                        })
                      }
                      onResolve={(issue) =>
                        void updateReviewerIssue(issue.id, {
                          status: "resolved",
                        })
                      }
                      onRun={() => void runReviewer("categories")}
                      onToggle={() => setCategoryReviewOpen((value) => !value)}
                      onToggleIssue={(issueId) =>
                        setExpandedReviewIssueIds((current) =>
                          current.includes(issueId)
                            ? current.filter((id) => id !== issueId)
                            : [...current, issueId],
                        )
                      }
                      onView={viewReviewerTarget}
                      title="Category and Narrative Integrity Check"
                    />
                  </div>
                </details>
              </div>
            )}

            {activeStep === "export" && (
              <div className="section-body grid">
                <div className="mini-card soft">
                  <span className="label">GDI-QR Analysis Record</span>
                  <p className="small">
                    Future exports should read as a qualitative analysis record:
                    research question, domains of investigation, meaning units,
                    analytic summaries, categories, integration structure,
                    researcher notes, and methodological integrity notes.
                  </p>
                </div>
                <div className="grid three">
                  {[
                    {
                      description:
                        "Current analysis record data for backup or audit.",
                      format: "json" as const,
                      label: "JSON",
                    },
                    {
                      description: "Meaning-unit table for spreadsheet review.",
                      format: "csv" as const,
                      label: "CSV",
                    },
                    {
                      description:
                        "Plain-text analysis record for quick review.",
                      format: "txt" as const,
                      label: "TXT",
                    },
                    {
                      description:
                        "Formatted Word document containing the complete analysis record.",
                      format: "docx" as const,
                      label: "DOCX",
                    },
                    {
                      description:
                        "Open a printable report that can be saved as PDF from the browser print dialog.",
                      format: "pdf" as const,
                      label: "PDF / print",
                    },
                  ].map((item) => (
                    <div className="mini-card" key={item.format}>
                      <Download size={26} />
                      <h3>{item.label} export</h3>
                      <p className="small">{item.description}</p>
                      <button
                        className="button"
                        disabled={!canExport || Boolean(isExportingFormat)}
                        onClick={() => void exportWorkspace(item.format)}
                        type="button"
                      >
                        <Download size={18} />
                        {isExportingFormat === item.format
                          ? "Exporting..."
                          : item.format === "pdf"
                            ? "Open printable report"
                            : `Download ${item.label}`}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mini-card soft">
                  <span className="label">Review trail</span>
                  <p className="small">
                    Exports may contain assistant-supported draft material.
                    Review all outputs against transcript evidence before using
                    them in reports, publications, supervision, or teaching
                    materials.
                  </p>
                  {displayExportRecords.length > 0 && (
                    <div className="mini-card soft">
                      <span className="label">Export history</span>
                      <div className="timeline compact-timeline">
                        {displayExportRecords.slice(0, 6).map((record) => (
                          <div className="timeline-item" key={record.id}>
                            <span className="mono small">
                              {formatDateTime(record.generatedAt)}
                            </span>
                            <div>
                              <strong>
                                {record.format.toUpperCase()} export
                              </strong>
                              <p className="small">
                                {record.storagePath ||
                                  "Downloaded locally / generated from browser"}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {displayAuditEvents.length === 0 ? (
                    <EmptyState text="No review-trail records yet. Upload, save, or ask for optional assistant support to start the trail." />
                  ) : (
                    <div className="timeline">
                      {displayAuditEvents.map((event) => (
                        <div className="timeline-item" key={event.id}>
                          <span className="mono small">{event.timestamp}</span>
                          <div>
                            <strong>
                              {event.actor}: {event.action}
                            </strong>
                            <p className="small">{event.target}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            <GdiqrTips step={activeStep} />
            <div className="workbook-footer">
              <button
                className="button"
                disabled={!canExport || Boolean(isExportingFormat)}
                onClick={() => void exportWorkspace("json")}
                type="button"
              >
                <Archive size={18} />
                Save progress
              </button>
              <button
                className="button primary continue-button"
                onClick={() => setActiveStep(nextStep.id)}
                type="button"
              >
                {nextStep.id === "export"
                  ? "Review export options"
                  : `I’ve reviewed this step · Continue to Step ${Math.min(currentStepIndex + 2, guidedSteps.length)}`}
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
          <RunLogPanel logs={runLogs} onClear={clearFinishedRunLogs} />
        </main>
        <VoiceGuideAvatar
          onSaveGuidanceNote={saveVoiceGuidanceNote}
          projectId={currentProject.id}
          step={activeStep}
          projectState={{
            project: {
              ...currentProject,
              title: projectTitle,
              researchQuestion,
              studyDescription,
              datasetType,
              dataSource: projectDataSource,
              dataSuitabilityConfirmed,
              researcherNotes: projectResearcherNotes,
            },
            preAnalysisNotes: {
              id:
                preAnalysisNotes?.id ??
                `local_pre_analysis_${currentProject.id}`,
              projectId: currentProject.id,
              researchQuestion,
              studyDescription,
              researcherPosition: researcherReflexivityNotes,
              contextualNotes: researcherNotes,
              initialSensitisingConcepts: researcherExpectations,
              dataFamiliarisationNotes,
              createdAt:
                preAnalysisNotes?.createdAt ?? currentProject.updatedAt,
              updatedAt: preAnalysisSavedAt || currentProject.updatedAt,
            },
            transcriptRecords,
            meaningUnits: units,
            categories: displayCategories,
            integrationRelationships: integrationRelationships.map(
              (relationship) => ({
                id: relationship.id,
                projectId: currentProject.id,
                sourceCategoryId: relationship.sourceCategoryId,
                targetCategoryId: relationship.targetCategoryId,
                label: relationship.label,
                memo: relationship.researcherNote || relationship.rationale,
                evidenceUnitNumbers: relationship.evidenceUnitNumbers,
                createdAt: currentProject.updatedAt,
                updatedAt: currentProject.updatedAt,
              }),
            ),
            integrityReviewItems: displayIntegrityItems,
            integratedNarrative: narrative,
          }}
        />
      </div>
    </div>
  );
}
