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
  Upload
} from "lucide-react";
import type {
  AudioFileRecord,
  AuditEvent,
  CategoryMode,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerComment,
  ReviewerWorkspace,
  SegmentStatus,
  TranscriptionJobRecord,
  TranscriptSegment,
  WorkflowStep
} from "@/lib/types";
import type { WorkspaceData } from "@/lib/gdiqr-repository";
import type { RunLog } from "@/lib/run-logs";
import { autoSplitTranscript, type AutoSegmentMode } from "@/lib/auto-segmenter";
import type { StorageMode } from "@/lib/storage-mode";

const PRODUCT_TITLE =
  "GDI-QR-informed AI-Assisted Qualitative Analysis Prototype";
const PRODUCT_SHORT_TITLE = "GDI-QR x AI Prototype";
const METHODOLOGICAL_FRAME = "GDI-QR-informed";

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
  { id: "export", label: "Export", icon: Download }
];

interface GdiqrWorkspaceProps {
  aiProvider?: string;
  project: Project;
  transcript: string;
  segments: TranscriptSegment[];
  audioFiles: AudioFileRecord[];
  transcriptionJobs: TranscriptionJobRecord[];
  meaningUnits: MeaningUnit[];
  categories: CategoryNode[];
  reviewerComments: ReviewerComment[];
  auditEvents: AuditEvent[];
  integratedNarrative: string;
  dataSource?: WorkspaceData["dataSource"];
  storageMode?: StorageMode;
  supabaseConfigured?: boolean;
}

export function GdiqrWorkspace({
  aiProvider = "ollama",
  project,
  transcript,
  segments,
  audioFiles,
  transcriptionJobs,
  meaningUnits,
  categories,
  reviewerComments,
  auditEvents,
  integratedNarrative,
  dataSource = "unconfigured",
  storageMode = "local",
  supabaseConfigured = false
}: GdiqrWorkspaceProps) {
  const [activeStep, setActiveStep] = useState<WorkflowStep>("pre-analysis");
  const [currentProject, setCurrentProject] = useState(project);
  const [projectTitle, setProjectTitle] = useState(project.title);
  const [researchQuestion, setResearchQuestion] = useState(
    project.researchQuestion
  );
  const [studyDescription, setStudyDescription] = useState(
    normaliseResearcherFacingText(project.studyDescription)
  );
  const [researcherExpectations, setResearcherExpectations] = useState("");
  const [researcherNotes, setResearcherNotes] = useState("");
  const [researcherReflexivityNotes, setResearcherReflexivityNotes] =
    useState("");
  const [relevanceGuideline, setRelevanceGuideline] = useState("");
  const [theoreticalFramework, setTheoreticalFramework] = useState("");
  const [projectLanguage, setProjectLanguage] =
    useState<Project["language"]>(project.language);
  const [mode, setMode] = useState<CategoryMode>("A");
  const [lightInterpretation, setLightInterpretation] = useState(
    project.lightInterpretation
  );
  const [projectSetupSavedAt, setProjectSetupSavedAt] = useState("");
  const [editableTranscript, setEditableTranscript] = useState(transcript);
  const [transcriptConfirmed, setTranscriptConfirmed] = useState(
    isTranscriptConfirmed(project)
  );
  const [aiPrivacyFindings, setAiPrivacyFindings] = useState<string[]>(
    extractPrivacyReviewMarkers(transcript)
  );
  const [sensitiveReviewItems, setSensitiveReviewItems] = useState<
    SensitiveReviewItem[]
  >(() => buildSensitiveReviewItems(transcript, extractPrivacyReviewMarkers(transcript)));
  const [privacyReviewExpanded, setPrivacyReviewExpanded] = useState(true);
  const [activeSensitiveItemId, setActiveSensitiveItemId] = useState("");
  const [privacyOverrideAccepted, setPrivacyOverrideAccepted] = useState(false);
  const [transcriptStorageStatus, setTranscriptStorageStatus] = useState(
    transcript.trim()
      ? "Anonymised version saved"
      : "Not saved yet — local draft only"
  );
  const [displaySegments, setDisplaySegments] = useState(segments);
  const [displayAudioFiles, setDisplayAudioFiles] = useState(audioFiles);
  const [displayTranscriptionJobs, setDisplayTranscriptionJobs] =
    useState(transcriptionJobs);
  const [units, setUnits] = useState(meaningUnits);
  const [displayCategories, setDisplayCategories] = useState(categories);
  const [reviewerOutputs, setReviewerOutputs] = useState(reviewerComments);
  const [displayAuditEvents, setDisplayAuditEvents] = useState(auditEvents);
  const [narrative, setNarrative] = useState(integratedNarrative);
  const [integrationReviewed, setIntegrationReviewed] = useState(false);
  const [integrationNote, setIntegrationNote] = useState("");
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
      : "Supabase is not connected yet. Add your Supabase settings before testing with real data."
  );
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [uploadLanguage, setUploadLanguage] =
    useState<Project["language"]>(project.language);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isAutoSplittingTranscript, setIsAutoSplittingTranscript] =
    useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isGeneratingMeaningUnits, setIsGeneratingMeaningUnits] =
    useState(false);
  const [isAcceptingMeaningUnits, setIsAcceptingMeaningUnits] = useState(false);
  const [meaningUnitGenerationScope, setMeaningUnitGenerationScope] =
    useState<"all" | "selected">("selected");
  const [meaningUnitSegmentId, setMeaningUnitSegmentId] = useState(
    segments[0]?.id ?? ""
  );
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    label?: string;
    total: number;
  } | null>(null);
  const [isRunningCategories, setIsRunningCategories] = useState(false);
  const [isRunningReviewer, setIsRunningReviewer] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState("");
  const [transcriptImportText, setTranscriptImportText] = useState("");
  const [transcriptImportName, setTranscriptImportName] = useState(
    "Imported transcript"
  );
  const [isImportingTranscript, setIsImportingTranscript] = useState(false);
  const [isConfirmingTranscript, setIsConfirmingTranscript] = useState(false);
  const [activeMeaningUnitRunId, setActiveMeaningUnitRunId] = useState("");
  const [runLogs, setRunLogs] = useState<RunLog[]>([]);
  const [muReviewOpen, setMuReviewOpen] = useState(true);
  const [categoryReviewOpen, setCategoryReviewOpen] = useState(true);
  const [expandedReviewIssueIds, setExpandedReviewIssueIds] = useState<
    string[]
  >([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState(
    segments[0]?.id ?? ""
  );
  const [segmentDraftTitle, setSegmentDraftTitle] = useState(
    segments[0]?.topicLabel ?? ""
  );
  const [segmentDraftText, setSegmentDraftText] = useState(
    segments[0]?.text ?? ""
  );
  const [isSavingSegment, setIsSavingSegment] = useState(false);
  const [segmentSplitMode, setSegmentSplitMode] =
    useState<AutoSegmentMode>("balanced");
  const transcriptTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const segmentTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const meaningUnitAbortControllerRef = useRef<AbortController | null>(null);
  const isLocalOnlyMode = storageMode === "local";

  async function loadRunLogs() {
    const response = await fetch("/api/run-logs", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const result = (await response.json().catch(() => ({}))) as {
      logs?: RunLog[];
    };
    setRunLogs(result.logs ?? []);
  }

  async function clearFinishedRunLogs() {
    const response = await fetch("/api/run-logs", {
      method: "DELETE"
    });
    const result = (await response.json().catch(() => ({}))) as {
      logs?: RunLog[];
    };
    if (response.ok) {
      setRunLogs(result.logs ?? []);
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
      setApiStatus("Meaning-unit job completed; refreshing Supabase workspace...");
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
      buildSensitiveReviewItems(editableTranscript, aiPrivacyFindings, current)
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
    if (!displaySegments.some((item) => item.id === meaningUnitSegmentId)) {
      const readySegment =
        displaySegments.find((item) => canRunMeaningUnitsForSegment(item)) ??
        displaySegments[0];
      setMeaningUnitSegmentId(readySegment.id);
    }
  }, [displaySegments, meaningUnitSegmentId, selectedSegmentId]);

  const completedSteps = useMemo(
    () => {
      const completed = new Set<WorkflowStep>(["pre-analysis"]);
      if (displaySegments.length > 0 || units.length > 0) {
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
    },
    [
      displayCategories.length,
      displaySegments.length,
      editableTranscript,
      integrationReviewed,
      narrative,
      reviewerOutputs.length,
      units.length
    ]
  );

  const selectedTitle = steps.find((step) => step.id === activeStep)?.label;
  const guidedSteps = steps.filter((step) => step.id !== "export");
  const currentStepIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === activeStep)
  );
  const nextStep = steps[(currentStepIndex + 1) % steps.length];
  const latestAudioFile = displayAudioFiles[0];
  const latestTranscriptionJob = displayTranscriptionJobs[0];
  const pendingHighRiskItems = useMemo(
    () =>
      sensitiveReviewItems.filter(
        (item) => item.riskLevel === "high" && item.status === "pending"
      ),
    [sensitiveReviewItems]
  );
  const unresolvedHighRiskCount = pendingHighRiskItems.length;
  const canProceedWithTranscript =
    unresolvedHighRiskCount === 0 || privacyOverrideAccepted;
  const activeSensitiveItem =
    sensitiveReviewItems.find((item) => item.id === activeSensitiveItemId) ??
    null;
  const selectedSegment = useMemo(
    () =>
      displaySegments.find((segment) => segment.id === selectedSegmentId) ??
      displaySegments[0],
    [displaySegments, selectedSegmentId]
  );
  const selectedSegmentIndex = selectedSegment
    ? displaySegments.findIndex((segment) => segment.id === selectedSegment.id)
    : -1;
  const previousSegment =
    selectedSegmentIndex > 0 ? displaySegments[selectedSegmentIndex - 1] : null;
  const nextSegment =
    selectedSegmentIndex >= 0 && selectedSegmentIndex < displaySegments.length - 1
      ? displaySegments[selectedSegmentIndex + 1]
      : null;
  const readySegments = useMemo(
    () =>
      displaySegments.filter((segment) =>
        canRunMeaningUnitsForSegment(segment)
      ),
    [displaySegments]
  );
  const selectedMeaningUnitSegment = useMemo(
    () =>
      displaySegments.find((segment) => segment.id === meaningUnitSegmentId) ??
      null,
    [displaySegments, meaningUnitSegmentId]
  );
  const canGenerateMeaningUnits = Boolean(
    transcriptConfirmed &&
      (meaningUnitGenerationScope === "all"
        ? readySegments.length > 0
        : selectedMeaningUnitSegment &&
          canRunMeaningUnitsForSegment(selectedMeaningUnitSegment))
  );
  const currentMeaningUnits = useMemo(
    () => normalizeMeaningUnitNumbersForSegments(units, displaySegments),
    [displaySegments, units]
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
        total: 0
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
    [currentMeaningUnits]
  );
  const unconfirmedMeaningUnits = useMemo(
    () => currentMeaningUnits.filter((unit) => !isConfirmedMeaningUnit(unit)),
    [currentMeaningUnits]
  );
  const excludedMeaningUnits = useMemo(
    () => currentMeaningUnits.filter((unit) => unit.analysisExcluded),
    [currentMeaningUnits]
  );
  const hasFallbackCategoryLabels = displayCategories.some(isFallbackCategory);
  const hasTemporaryFallbackCategories = categoryDraftIsFallback;
  const assignedMeaningUnitNumbers = useMemo(
    () =>
      new Set(
        displayCategories
          .filter((category) => category.status !== "rejected")
          .flatMap((category) => category.includedUnitIds)
      ),
    [displayCategories]
  );
  const unassignedMeaningUnits = useMemo(
    () =>
      confirmedMeaningUnits.filter(
        (unit) => !assignedMeaningUnitNumbers.has(unit.number)
      ),
    [assignedMeaningUnitNumbers, confirmedMeaningUnits]
  );
  const confirmedCategoryCount = displayCategories.filter(
    (category) => category.status === "confirmed"
  ).length;
  const canRunCategories =
    confirmedMeaningUnits.length > 0 &&
    (mode === "A" ||
      (mode === "B" && displayCategories.length > 0 && !hasTemporaryFallbackCategories) ||
      (mode === "C" &&
        displayCategories.length > 0 &&
        !hasTemporaryFallbackCategories &&
        allSegmentsProcessedForModeC));
  const canRunReviewer = currentMeaningUnits.length > 0;
  const meaningUnitReviewIssues = useMemo(
    () => reviewerOutputs.filter((comment) => comment.workspace === "meaning-units"),
    [reviewerOutputs]
  );
  const categoryReviewIssues = useMemo(
    () => reviewerOutputs.filter((comment) => comment.workspace === "categories"),
    [reviewerOutputs]
  );
  const canExport = Boolean(
    editableTranscript.trim() ||
      units.length ||
      displayCategories.length ||
      reviewerOutputs.length
  );
  const generationTargetLabel =
    meaningUnitGenerationScope === "all"
      ? "all ready meaning units"
      : selectedMeaningUnitSegment?.segmentId ?? "Selected Meaning Unit";
  const selectedSegmentAlreadyHasUnits = Boolean(
    selectedMeaningUnitSegment &&
      currentMeaningUnits.some(
        (unit) => unit.segmentId === selectedMeaningUnitSegment.segmentId
      )
  );
  const generationButtonLabel =
    meaningUnitGenerationScope === "all"
      ? "Assistant support: draft summaries for all ready meaning units"
      : `${selectedSegmentAlreadyHasUnits ? "Assistant support: redraft" : "Assistant support: draft"} summary for ${selectedMeaningUnitSegment?.segmentId ?? "selected meaning unit"}`;
  const acceptedMeaningUnitNumberKey = confirmedMeaningUnits
    .map((unit) => unit.number)
    .join(",");

  useEffect(() => {
    const acceptedNumbers = new Set(
      acceptedMeaningUnitNumberKey
        .split(",")
        .map((value) => Number(value))
        .filter(Number.isFinite)
    );
    setDisplayCategories((current) => {
      let changed = false;
      const next = current.map((category) => {
        const includedUnitIds = category.includedUnitIds.filter((number) =>
          acceptedNumbers.has(number)
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
    setResearchQuestion(workspace.project.researchQuestion);
    setStudyDescription(normaliseResearcherFacingText(workspace.project.studyDescription));
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
        : "Not saved yet — local draft only"
    );
    setDisplaySegments(workspace.segments);
    setDisplayAudioFiles(workspace.audioFiles);
    setDisplayTranscriptionJobs(workspace.transcriptionJobs);
    setUnits(workspace.meaningUnits);
    setDisplayCategories(workspace.categories);
    setReviewerOutputs(workspace.reviewerComments);
    setDisplayAuditEvents(workspace.auditEvents);
    setNarrative(workspace.integratedNarrative);
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
    setApiDataSource(workspace.dataSource);
    setApiStatus("Workspace refreshed.");
  }

  async function saveProjectSetup() {
    setIsSavingProject(true);
    if (isLocalOnlyMode) {
      const now = new Date().toISOString();
      setCurrentProject((current) => ({
        ...current,
        language: projectLanguage,
        lightInterpretation,
        researchQuestion,
        studyDescription,
        title: projectTitle,
        updatedAt: now
      }));
      setUploadLanguage(projectLanguage);
      setProjectSetupSavedAt(now);
      setApiStatus(
        `Project setup saved locally at ${new Date(now).toLocaleTimeString()}. Nothing was saved to Supabase.`
      );
      setIsSavingProject(false);
      return;
    }

    setApiStatus("Saving project setup...");

    try {
      const response = await fetch("/api/project", {
        body: JSON.stringify({
          language: projectLanguage,
          lightInterpretation,
          projectId: currentProject.id,
          researchQuestion,
          studyDescription,
          title: projectTitle
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
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
        setCurrentProject(result.project);
      }
      setProjectSetupSavedAt(new Date().toISOString());
      setApiStatus("Project setup saved to Supabase");
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Project setup save failed"
      );
    } finally {
      setIsSavingProject(false);
    }
  }

  function toggleLightInterpretation(nextValue?: boolean) {
    const value = nextValue ?? !lightInterpretation;
    setLightInterpretation(value);
    setCurrentProject((current) => ({
      ...current,
      lightInterpretation: value,
      updatedAt: new Date().toISOString()
    }));
    setApiStatus(
      value
        ? "Light interpretation is ON. New meaning-unit drafts may include cautious tentative interpretation."
        : "Light interpretation is OFF. New meaning-unit drafts will stay closer to descriptive summaries."
    );
  }

  async function uploadAndTranscribeAudio() {
    if (isLocalOnlyMode) {
      setApiStatus(
        "Audio upload is disabled in local-only sharing mode because raw audio would need special temporary handling. Please import an anonymised transcript for this prototype test."
      );
      return;
    }

    if (!selectedAudioFile) {
      setApiStatus("Choose an audio file before starting transcription.");
      return;
    }

    setIsUploadingAudio(true);
    setApiStatus("Uploading and transcribing. You can follow progress in the activity panel below.");

    const formData = new FormData();
    formData.append("file", selectedAudioFile);
    formData.append("projectId", currentProject.id);
    formData.append("language", uploadLanguage);

    try {
      const response = await fetch("/api/audio/transcribe", {
        body: formData,
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        privacyFindings?: string[];
        speakerNotes?: string[];
        transcribed?: boolean;
        workspace?: WorkspaceData;
      };

      if (!response.ok) {
        setApiStatus(result.error ?? "Audio upload failed");
        return;
      }

      if (result.workspace) {
        applyWorkspace(result.workspace);
      }
      setTranscriptConfirmed(false);
      setAiPrivacyFindings(
        result.privacyFindings?.length
          ? result.privacyFindings
          : extractPrivacyReviewMarkers(result.workspace?.transcript ?? "")
      );

      setApiStatus(
        result.transcribed
          ? `Transcript prepared and saved. Please review the transcript before analysis${
              result.privacyFindings?.length
                ? ` (${result.privacyFindings.length} privacy finding${result.privacyFindings.length === 1 ? "" : "s"})`
                : ""
            }`
          : result.error ??
              "Audio uploaded to Supabase, but local transcription failed"
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Audio upload failed"
      );
    } finally {
      setIsUploadingAudio(false);
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
        method: "POST"
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
      setApiStatus(`Transcript loaded from ${result.filename ?? file.name}. Review it before importing.`);
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Transcript file extraction failed"
      );
    }
  }

  async function importTranscript() {
    if (!transcriptImportText.trim()) {
      setApiStatus("Paste text or choose a transcript file before importing.");
      return;
    }

    setIsImportingTranscript(true);
    setApiStatus(
      "Preparing transcript. The app will label speakers and flag possible private details for your review."
    );

    try {
      const response = await fetchWithTimeout("/api/transcripts/prepare", {
        body: JSON.stringify({
          language: uploadLanguage,
          transcript: transcriptImportText
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 600000
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        prepared?: boolean;
        privacyFindings?: string[];
        speakerNotes?: string[];
        transcript?: string;
      };

      if (!response.ok || !result.prepared || !result.transcript) {
        setApiStatus(result.error ?? "Transcript preparation failed");
        return;
      }

      const safePreparedTranscript = prepareTranscriptForStorage(result.transcript);
      setEditableTranscript(safePreparedTranscript);
      setTranscriptConfirmed(false);
      setTranscriptStorageStatus("Not saved yet — local draft only");
      setPrivacyOverrideAccepted(false);
      setAiPrivacyFindings(
        result.privacyFindings?.length
          ? result.privacyFindings
          : extractPrivacyReviewMarkers(result.transcript)
      );

      setTranscriptImportText("");
      setApiStatus(
        `Transcript prepared locally and not saved yet. Please review speaker labels, sensitive-information items, and wording before saving or confirming${
          result.privacyFindings?.length
            ? ` (${result.privacyFindings.length} privacy finding${result.privacyFindings.length === 1 ? "" : "s"})`
            : ""
        }`
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Transcript import failed"
      );
    } finally {
      setIsImportingTranscript(false);
    }
  }

  async function refreshWorkspace() {
    if (isLocalOnlyMode) {
      setApiStatus("Local-only mode keeps the current workspace in browser state. Export project JSON to keep a copy.");
      return;
    }
    setApiStatus("Refreshing workspace...");
    const response = await fetch(`/api/workspace?projectId=${currentProject.id}`, {
      cache: "no-store"
    });
    if (!response.ok) {
      setApiStatus("Could not refresh the workspace. Check Supabase connection and try again.");
      return;
    }
    const workspace = (await response.json()) as WorkspaceData;
    applyWorkspace(workspace);
  }

  async function saveTranscriptVersion() {
    if (!canProceedWithTranscript) {
      setApiStatus(
        "This transcript may still contain identifiable or sensitive information. Please review high-risk items before saving."
      );
      return;
    }

    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain in this transcript. Please review or anonymise them before saving or analysis."
      );
      return;
    }
    const transcriptForStorage = prepareTranscriptForStorage(editableTranscript);
    if (isLocalOnlyMode) {
      setEditableTranscript(transcriptForStorage);
      setTranscriptConfirmed(false);
      setTranscriptStorageStatus("Reviewed transcript saved locally");
      setApiStatus("Reviewed transcript saved locally in this browser session. Export project JSON to keep a copy.");
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
        rawTranscriptRetained: false
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
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
    };
    setApiStatus(
      result.saved
        ? "Reviewed transcript saved. Please confirm again before analysis."
        : result.reason ?? result.error ?? "Transcript save failed"
    );
    if (result.saved) {
      setEditableTranscript(transcriptForStorage);
      setTranscriptStorageStatus("Anonymised version saved");
    }
  }

  async function confirmTranscriptForAnalysis() {
    if (!editableTranscript.trim()) {
      setApiStatus("Add or import a transcript before confirming it for analysis.");
      return;
    }
    if (!canProceedWithTranscript) {
      setApiStatus(
        "This transcript may still contain identifiable or sensitive information. Please review high-risk items before analysis."
      );
      return;
    }

    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain in this transcript. Please review or anonymise them before saving or analysis."
      );
      return;
    }
    const transcriptForStorage = prepareTranscriptForStorage(editableTranscript);
    if (isLocalOnlyMode) {
      const now = new Date().toISOString();
      setEditableTranscript(transcriptForStorage);
      setTranscriptConfirmed(true);
      setTranscriptStorageStatus("Reviewed transcript saved locally");
      setCurrentProject((current) => ({
        ...current,
        status: "Transcript confirmed for local analysis",
        updatedAt: now
      }));
      const splitResult = autoSplitTranscript(transcriptForStorage, {
        mode: segmentSplitMode,
        researchQuestion,
        sourceTranscriptId: "active-transcript"
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
                topicLabel: segment.title || `Segment ${index + 1}`
              })
            )
          : [
              buildLocalTranscriptSegment({
                caseId: "CASE-001",
                segmentNumber: 1,
                text: transcriptForStorage
              })
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
          timestamp: now
        },
        ...current
      ]);
      setApiStatus(
        `Reviewed transcript confirmed locally. ${localSegments.length} draft meaning-unit candidate${localSegments.length === 1 ? "" : "s"} created for researcher boundary review.`
      );
      return;
    }
    setIsConfirmingTranscript(true);
    setApiStatus("Confirming transcript. Previous derived analysis will be cleared so the next analysis uses this reviewed text.");

    try {
      const response = await fetch("/api/transcripts/confirm", {
        body: JSON.stringify({
          content: transcriptForStorage,
        language: projectLanguage,
        projectId: currentProject.id,
        sensitiveItems: serialiseSensitiveItemsForStorage(sensitiveReviewItems),
        anonymisationStatus:
          unresolvedHighRiskCount === 0 ? "confirmed" : "not_reviewed",
        rawTranscriptRetained: false
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
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
        "Transcript confirmed. You can now generate meaning units from the reviewed text."
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Transcript confirmation failed"
      );
    } finally {
      setIsConfirmingTranscript(false);
    }
  }

  async function clearTranscriptAndDerivedOutputs() {
    const confirmed = window.confirm(
      "Delete the current transcript, uploaded audio records, and all derived meaning units, categories, methodological integrity issues, and audit records for this project? This cannot be undone."
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
      setApiStatus("Local transcript and derived outputs cleared from this browser session.");
      return;
    }

    setApiStatus("Deleting transcript and derived outputs...");
    const response = await fetch("/api/project/clear-data", {
      body: JSON.stringify({ projectId: currentProject.id }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    const result = (await response.json().catch(() => ({}))) as {
      cleared?: boolean;
      error?: string;
      reason?: string;
      workspace?: WorkspaceData;
    };

    if (!response.ok || !result.cleared) {
      setApiStatus(result.error ?? result.reason ?? "Project data clear failed.");
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
        status: status ?? selectedSegment.status,
        text: segmentDraftText,
        topicLabel: segmentDraftTitle
      };
      setDisplaySegments((current) =>
        current.map((segment) =>
          segment.id === selectedSegment.id ? updatedSegment : segment
        )
      );
      setSelectedSegmentId(updatedSegment.id);
      setUnits((current) =>
        current.filter((unit) => unit.segmentId !== updatedSegment.segmentId)
      );
      setDisplayCategories([]);
      setReviewerOutputs([]);
      setNarrative("");
      recordLocalAuditEvent({
        action:
          status === "Ready for MU Analysis"
            ? `Marked ${updatedSegment.segmentId} ready for MU analysis`
            : `Edited ${updatedSegment.segmentId} boundary/excerpt text`,
        target: updatedSegment.segmentId
      });
      setApiStatus(
        status === "Ready for MU Analysis"
          ? "Meaning unit marked ready locally. You can now generate its summary."
          : "Meaning unit saved locally. Existing summaries for this unit were cleared so regenerated analysis uses the edited text."
      );
      return;
    }

    setIsSavingSegment(true);
    setApiStatus("Saving meaning unit changes...");

    try {
      const response = await fetch(`/api/segments/${selectedSegment.id}`, {
        body: JSON.stringify({
          projectId: currentProject.id,
          status,
          text: segmentDraftText,
          topicLabel: segmentDraftTitle
        }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH"
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
          segment.id === result.segment?.id ? result.segment : segment
        )
      );
      setSelectedSegmentId(result.segment.id);
      setApiStatus(
        status === "Ready for MU Analysis"
          ? "Meaning unit marked ready. You can now generate its summary."
          : "Meaning unit saved."
      );
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Meaning unit save failed.");
    } finally {
      setIsSavingSegment(false);
    }
  }

  async function runSegmentAction(
    action: "split" | "merge" | "move",
    direction?: "previous" | "next" | "up" | "down"
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
        segmentTextAreaRef.current?.selectionStart
      );
      beforeText = segmentDraftText.slice(0, splitIndex).trim();
      afterText = segmentDraftText.slice(splitIndex).trim();
      if (!beforeText || !afterText) {
        setApiStatus("Place the cursor where this meaning unit should split, then try again.");
        return;
      }
    }

    setIsSavingSegment(true);
    setApiStatus(
      action === "split"
        ? "Splitting meaning unit..."
        : action === "merge"
          ? "Merging meaning units..."
          : "Reordering meaning unit..."
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
            status: "Needs Review"
          };
          const afterSegment = buildLocalTranscriptSegment({
            caseId: selectedSegment.caseId,
            segmentNumber: nextNumber,
            text: afterText,
            topicLabel: `Split from ${selectedSegment.segmentId}`
          });
          nextSegments.splice(selectedSegmentIndex, 1, beforeSegment, afterSegment);
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
            status: "Needs Review"
          };
          nextSegments = nextSegments.filter((segment) => segment.id !== selectedSegment.id);
          nextSegments[targetIndex > selectedSegmentIndex ? selectedSegmentIndex : targetIndex] = merged;
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
          target: selectedSegment.segmentId
        });
        setApiStatus("Meaning unit list updated locally. Review boundaries before generating summaries.");
        return;
      }

      const response = await fetch(`/api/segments/${selectedSegment.id}`, {
        body: JSON.stringify({
          action,
          afterText,
          beforeText,
          direction,
          projectId: currentProject.id
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        saved?: boolean;
        segments?: TranscriptSegment[];
      };
      if (!response.ok || !result.saved || !result.segments) {
        setApiStatus(result.error ?? result.reason ?? "Meaning unit action failed.");
        return;
      }
      setDisplaySegments(result.segments);
      const selected =
        result.segments.find((segment) => segment.id === selectedSegment.id) ??
        result.segments[Math.max(0, selectedSegmentIndex)];
      setSelectedSegmentId(selected?.id ?? "");
      setApiStatus("Meaning unit list updated. Review boundaries before generating summaries.");
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Meaning unit action failed.");
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
        "Select the text that should become its own meaning unit, then click Create new meaning unit from selection."
      );
      return;
    }

    const selectedText = segmentDraftText.slice(selectionStart, selectionEnd).trim();
    const beforeText = segmentDraftText.slice(0, selectionStart).trim();
    const afterText = segmentDraftText.slice(selectionEnd).trim();
    const remainingText = [beforeText, afterText].filter(Boolean).join("\n\n");
    if (!selectedText || !remainingText) {
      setApiStatus(
        "Selection split needs both selected text and remaining text in the current meaning unit."
      );
      return;
    }

    const newTitle =
      window.prompt("Title for the new meaning unit:", "New selected meaning unit")?.trim() ||
      "New selected meaning unit";
    const selectedSegmentDraft = buildLocalTranscriptSegment({
      caseId: selectedSegment.caseId,
      createdBy: "manual",
      segmentNumber: selectedSegment.segmentNumber + 1,
      splittingMode: segmentSplitMode,
      text: selectedText,
      topicLabel: newTitle
    });
    const updatedOriginal: TranscriptSegment = {
      ...selectedSegment,
      createdBy: selectedSegment.createdBy ?? "manual",
      splittingMode: selectedSegment.splittingMode ?? segmentSplitMode,
      status: "Needs Review",
      text: remainingText
    };
    const nextSegments = renumberLocalSegments([
      ...displaySegments.slice(0, selectedSegmentIndex),
      updatedOriginal,
      selectedSegmentDraft,
      ...displaySegments.slice(selectedSegmentIndex + 1)
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
      target: selectedSegmentDraft.segmentId
    });
    setApiStatus(
      "Created a new meaning unit from the selected text. Review both boundaries before generating summaries."
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
          displaySegments.filter((segment) => segment.id !== selectedSegment.id)
        );
        setDisplaySegments(nextSegments);
        setSelectedSegmentId(nextSegments[0]?.id ?? "");
        setMeaningUnitSegmentId(nextSegments[0]?.id ?? "");
        setUnits((current) =>
          current.filter((unit) => unit.segmentId !== selectedSegment.segmentId)
        );
        setDisplayCategories([]);
        setReviewerOutputs([]);
        setNarrative("");
        setApiStatus("Meaning unit deleted locally. Related summaries and categories were cleared.");
        return;
      }

      const response = await fetch(
        `/api/segments/${selectedSegment.id}?projectId=${currentProject.id}`,
        { method: "DELETE" }
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
      setApiStatus(error instanceof Error ? error.message : "Meaning unit delete failed.");
    } finally {
      setIsSavingSegment(false);
    }
  }

  async function autoSplitTranscriptSegments() {
    if (!editableTranscript.trim()) {
      setApiStatus(
        "No transcript text found. Please confirm or edit the transcript before auto-delineation."
      );
      return;
    }
    if (!transcriptConfirmed) {
      setApiStatus("Confirm the transcript before auto-delineating meaning units.");
      return;
    }
    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain. Review or anonymise them before delineation and analysis."
      );
      return;
    }

    const confirmed = window.confirm(
      "Auto-delineation will replace the current meaning unit list. Existing summaries linked to these units may need to be regenerated. Continue?"
    );
    if (!confirmed) {
      return;
    }

    setIsAutoSplittingTranscript(true);
    setApiStatus("Auto-delineating transcript into draft meaning units...");

    try {
      const response = await fetch("/api/segments/auto-split", {
        body: JSON.stringify({
          caseId: selectedSegment?.caseId ?? "CASE-001",
          projectId: currentProject.id,
          researchQuestion: currentProject.researchQuestion,
          splittingMode: segmentSplitMode,
          transcript: editableTranscript
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
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
          result.error ?? result.reason ?? "Auto-delineation failed."
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
          `Created ${result.segments.length} draft meaning unit${result.segments.length === 1 ? "" : "s"}. Please review the suggested boundaries before analysis.`
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Auto-delineation failed."
      );
    } finally {
      setIsAutoSplittingTranscript(false);
    }
  }

  async function generateMeaningUnitsForSegment(
    segment: TranscriptSegment,
    signal: AbortSignal
  ) {
    const response = await fetchWithTimeout("/api/ai/meaning-units", {
      body: JSON.stringify({
        background: false,
        caseId: segment.caseId,
        lightInterpretation,
        projectId: currentProject.id,
        segmentId: segment.segmentId,
        startingNumber: segment.startingMuNumber,
        transcript: segment.text
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
      timeoutMs: 900000
    });

    if (!response.ok) {
      const errorResult = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(errorResult.error ?? "Meaning-unit API failed");
    }

    const result = (await response.json()) as {
      meaningUnits?: MeaningUnit[];
      persisted?: boolean;
      provider?: string;
    };

    const newUnits = result.meaningUnits;
    if (newUnits) {
      const draftUnits: MeaningUnit[] = newUnits.map((unit): MeaningUnit => ({
        ...unit,
        aiExcerpt: unit.aiExcerpt ?? unit.excerpt,
        humanStatus:
          unit.analysisExcluded || unit.humanStatus === "Excluded"
            ? "Excluded"
            : "Draft"
      }));
      setUnits((current) =>
        [
          ...current.filter((unit) => unit.segmentId !== segment.segmentId),
          ...draftUnits
        ].sort((left, right) => left.number - right.number)
      );
      setDisplaySegments((current) =>
        current.map((item) =>
          item.id === segment.id ? { ...item, status: "Analysed" } : item
        )
      );
      recordLocalAuditEvent({
        actor: "AI",
        action: `Drafted ${draftUnits.length} meaning-unit summary${draftUnits.length === 1 ? "" : "ies"} for ${segment.segmentId}`,
        target: segment.segmentId
      });
    }

    return result;
  }

  async function generateMeaningUnits(segmentOverride?: TranscriptSegment | null) {
    if (displaySegments.length === 0) {
      setApiStatus("Create and review meaning units before generating summaries.");
      return;
    }
    if (!transcriptConfirmed) {
      setApiStatus(
        "Review and confirm the transcript before generating meaning units."
      );
      return;
    }
    const requestedSegments = segmentOverride
      ? [segmentOverride]
      : meaningUnitGenerationScope === "all"
        ? readySegments
        : selectedMeaningUnitSegment
          ? [selectedMeaningUnitSegment]
          : [];

    if (requestedSegments.length === 0) {
      setApiStatus(
        meaningUnitGenerationScope === "all"
          ? "No meaning units are ready. Mark at least one meaning unit as ready first."
          : "Choose a meaning unit and mark it as ready before generating a summary."
      );
      return;
    }
    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain. Review or anonymise them before requesting AI analysis."
      );
      return;
    }
    const segmentsWithExistingUnits = requestedSegments.filter((segment) =>
      units.some((unit) => unit.segmentId === segment.segmentId)
    );
    if (segmentsWithExistingUnits.length > 0) {
      const confirmed = window.confirm(
        `Summaries already exist for ${segmentsWithExistingUnits
          .map((segment) => segment.segmentId)
          .join(", ")}. Regenerating will replace only those unit-level drafts. Continue?`
      );
      if (!confirmed) {
        return;
      }
    }

    const notReadySegment = requestedSegments.find(
      (item) => !canRunMeaningUnitsForSegment(item)
    );
    if (notReadySegment) {
      setApiStatus(
        `${notReadySegment.segmentId} is not ready. Mark it ready before requesting AI assistance.`
      );
      return;
    }

    const controller = new AbortController();
    meaningUnitAbortControllerRef.current = controller;
    setIsGeneratingMeaningUnits(true);
    setGenerationProgress(
      requestedSegments.length > 1
        ? { current: 0, total: requestedSegments.length }
        : { current: 1, label: requestedSegments[0].segmentId, total: 1 }
    );

    try {
      for (const [index, segment] of requestedSegments.entries()) {
        if (controller.signal.aborted) {
          break;
        }
        setGenerationProgress({
          current: index + 1,
          label: segment.segmentId,
          total: requestedSegments.length
        });
        setApiStatus(
          requestedSegments.length > 1
            ? `Generating summaries for all meaning units... ${segment.segmentId} (${index + 1} of ${requestedSegments.length})`
            : `Generating summary for ${segment.segmentId}...`
        );
        await generateMeaningUnitsForSegment(segment, controller.signal);
      }
      if (!controller.signal.aborted) {
        setApiStatus(
          requestedSegments.length > 1
            ? `Summary generation completed for ${requestedSegments.length} meaning unit${requestedSegments.length === 1 ? "" : "s"}.`
            : `Summary generation completed for ${requestedSegments[0].segmentId}.`
        );
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setApiStatus("Generation stopped by user.");
        return;
      }
      setApiStatus(
        error instanceof Error ? error.message : "Meaning-unit API failed"
      );
    } finally {
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
    setApiStatus("Generation stopped by user.");
  }

  async function runCategories(
    options: {
      allowFallbackRegenerate?: boolean;
      modeOverride?: CategoryMode;
    } = {}
  ) {
    const requestedMode = options.modeOverride ?? mode;
    if (confirmedMeaningUnits.length === 0) {
      setApiStatus(
        "Accept meaning units before creating categories. Categories only use researcher-accepted, non-excluded meaning units."
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
        "This category set is a fallback draft. Regenerate it or use it as an editable starting point before continuing."
      );
      return;
    }
    if (requestedMode === "C") {
      if (displayCategories.length === 0) {
        setApiStatus("Construct and review categories before integrating findings.");
        return;
      }
      if (!allSegmentsProcessedForModeC) {
        setApiStatus(
          "Confirm that all meaning units in this transcript have been processed and reviewed before integrating findings."
        );
        return;
      }
    }

    setMode(requestedMode);
    setIsRunningCategories(true);
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
          units: confirmedMeaningUnits
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 900000
      });
      if (!response.ok) {
        const errorResult = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setApiStatus(
          errorResult.error ?? `${getCategoryRunLabel(requestedMode)} failed`
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
          : warning
      );
      setApiStatus(
        `${warning ? `${warning} ` : ""}${getCategoryRunLabel(requestedMode)} completed using ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : `${getCategoryRunLabel(requestedMode)} failed`
      );
    } finally {
      setIsRunningCategories(false);
    }
  }

  async function acceptTemporaryCategoryDraft() {
    if (!hasTemporaryFallbackCategories || displayCategories.length === 0) {
      setApiStatus("No temporary fallback category draft is available to accept.");
      return;
    }

    const confirmed = window.confirm(
      isLocalOnlyMode
        ? "This will mark the temporary fallback category draft as researcher-confirmed in this local browser session. Only continue if you have reviewed it and accept it for prototype testing."
        : "This will save the temporary fallback category draft to Supabase for prototype testing. Only continue if you have reviewed it and accept it as a researcher-confirmed draft."
    );
    if (!confirmed) {
      return;
    }

    setIsRunningCategories(true);
    if (isLocalOnlyMode) {
      setDisplayCategories(markCategoriesEditableDraft(displayCategories));
      setCategoryDraftIsFallback(false);
      setCategoryDraftNotice(
        "Fallback draft is now an editable starting point. It still requires review, renaming, evidence checks, and confirmation."
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
          projectId: currentProject.id
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 120000
      });
      const result = (await response.json().catch(() => ({}))) as {
        categories?: CategoryNode[];
        error?: string;
        integratedNarrative?: string;
        persisted?: boolean;
      };
      if (!response.ok || !result.persisted) {
        setApiStatus(result.error ?? "Temporary category draft could not be saved.");
        return;
      }
      setDisplayCategories(result.categories ?? displayCategories);
      setNarrative(result.integratedNarrative ?? narrative);
      setCategoryDraftIsFallback(false);
      setCategoryDraftNotice(
        "Temporary fallback draft saved after explicit researcher confirmation. Review/refine it before using it as final analysis."
      );
      setApiStatus("Temporary category draft saved to Supabase after researcher confirmation.");
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Temporary category draft could not be saved."
      );
    } finally {
      setIsRunningCategories(false);
    }
  }

  async function runReviewer(reviewerWorkspace: ReviewerWorkspace) {
    if (units.length === 0) {
      setApiStatus("Generate meaning units before running methodological integrity checks.");
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
        : "Running meaning-unit methodological integrity check..."
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
          workspace: reviewerWorkspace
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 900000
      });
      if (!response.ok) {
        const errorResult = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setApiStatus(errorResult.error ?? "Methodological integrity check failed");
        return;
      }
      const result = (await response.json()) as {
        comments?: ReviewerComment[];
        persisted?: boolean;
        provider?: string;
      };
      setReviewerOutputs((current) => [
        ...current.filter((comment) => comment.workspace !== reviewerWorkspace),
        ...(result.comments ?? [])
      ]);
      setApiStatus(
        `Methodological integrity check applied from ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`
      );
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Methodological integrity check failed");
    } finally {
      setIsRunningReviewer(false);
    }
  }

  function updateCategoryDraft(
    categoryId: string,
    updates: Partial<CategoryNode>
  ) {
    setDisplayCategories((current) =>
      current.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              ...updates,
              status:
                updates.status ??
                (category.status === "confirmed" ? "confirmed" : "edited")
            }
          : category
      )
    );
    setCategoryDraftNotice(
      "Category draft edited. Review the included meaning units and evidence before confirming."
    );
  }

  function addCategoryDraft(unitNumbers: number[] = []) {
    const name =
      window.prompt("New category title:", "New draft category")?.trim() ||
      "New draft category";
    const nextCategory: CategoryNode = {
      definition: "Researcher-created draft category. Add a short analytic definition.",
      id: `cat_manual_${Date.now()}`,
      includedUnitIds: unitNumbers,
      name,
      source: "researcher_confirmed",
      status: "edited"
    };
    setDisplayCategories((current) => [...current, nextCategory]);
    setCategoryDraftNotice(
      "New editable category created. Add or move meaning units into it before confirming."
    );
  }

  function removeMeaningUnitFromCategory(categoryId: string, unitNumber: number) {
    updateCategoryDraft(categoryId, {
      includedUnitIds:
        displayCategories
          .find((category) => category.id === categoryId)
          ?.includedUnitIds.filter((number) => number !== unitNumber) ?? []
    });
  }

  function assignMeaningUnitToCategory(unitNumber: number, categoryId: string) {
    setDisplayCategories((current) =>
      current.map((category) => {
        const withoutUnit = category.includedUnitIds.filter(
          (number) => number !== unitNumber
        );
        if (category.id !== categoryId) {
          return { ...category, includedUnitIds: withoutUnit };
        }
        return {
          ...category,
          includedUnitIds: Array.from(new Set([...withoutUnit, unitNumber])).sort(
            (left, right) => left - right
          ),
          status: category.status === "confirmed" ? "confirmed" : "edited"
        };
      })
    );
    setCategoryDraftNotice(
      `MU #${unitNumber} assigned. Review category fit before confirmation.`
    );
  }

  function deleteCategoryDraft(category: CategoryNode) {
    if (
      category.includedUnitIds.length > 0 &&
      !window.confirm(
        `${category.name} contains ${category.includedUnitIds.length} MU(s). Delete it and move those MUs to Unassigned?`
      )
    ) {
      return;
    }

    setDisplayCategories((current) =>
      current.filter((item) => item.id !== category.id)
    );
    setCategoryDraftNotice(
      "Category deleted. Its meaning units are now shown under Unassigned meaning units."
    );
  }

  function mergeCategoryDraft(category: CategoryNode) {
    const targetId = window.prompt(
      `Merge "${category.name}" into which category ID? Available: ${displayCategories
        .filter((item) => item.id !== category.id)
        .map((item) => item.id)
        .join(", ")}`
    );
    const target = displayCategories.find((item) => item.id === targetId);
    if (!target) {
      setApiStatus("Choose a valid target category ID to merge.");
      return;
    }

    const mergedName =
      window.prompt("Merged category title:", target.name)?.trim() || target.name;
    setDisplayCategories((current) =>
      current
        .filter((item) => item.id !== category.id)
        .map((item) =>
          item.id === target.id
            ? {
                ...item,
                definition: `${item.definition}\n\nMerged note: ${category.definition}`.trim(),
                includedUnitIds: Array.from(
                  new Set([...item.includedUnitIds, ...category.includedUnitIds])
                ).sort((left, right) => left - right),
                name: mergedName,
                status: "edited"
              }
            : item
        )
    );
    setCategoryDraftNotice("Categories merged. Review the merged title, definition, and evidence.");
  }

  function confirmCategoryDraft(categoryId: string) {
    const category = displayCategories.find((item) => item.id === categoryId);
    if (!category) {
      return;
    }
    if (!category.name.trim() || category.includedUnitIds.length === 0) {
      setApiStatus(
        "A category needs a title and at least one included MU before it can be confirmed."
      );
      return;
    }
    if (hasSensitivePlaceholder(category.name)) {
      setApiStatus(
        "Category title contains a sensitive placeholder. Rename it before confirming."
      );
      return;
    }
    updateCategoryDraft(categoryId, { status: "confirmed" });
    setApiStatus("Category confirmed as researcher-reviewed draft.");
  }

  function rejectCategoryDraft(category: CategoryNode) {
    if (
      !window.confirm(
        `Reject "${category.name}"? Its meaning units will move to Unassigned.`
      )
    ) {
      return;
    }
    updateCategoryDraft(category.id, {
      includedUnitIds: [],
      status: "rejected"
    });
  }

  async function updateReviewerIssue(
    commentId: string,
    updates: { memo?: string; status?: ReviewerComment["status"] }
  ) {
    if (isLocalOnlyMode) {
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
                status: updates.status ?? comment.status
              }
            : comment
        )
      );
      setApiStatus("Integrity issue updated locally.");
      return;
    }

    const response = await fetch(`/api/reviewer-comments/${commentId}`, {
      body: JSON.stringify({
        ...updates,
        projectId: currentProject.id
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
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
        comment.id === result.comment?.id ? result.comment : comment
      )
    );
    setApiStatus("Integrity issue updated.");
  }

  function viewReviewerTarget(comment: ReviewerComment) {
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
        block: "center"
      });
      document.getElementById(targetId)?.classList.add("target-highlight");
      window.setTimeout(
        () => document.getElementById(targetId)?.classList.remove("target-highlight"),
        1800
      );
    }, 80);
  }

  function clearDerivedAnalysisAfterMeaningUnitChange() {
    setDisplayCategories([]);
    setNarrative("");
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
  }

  function recordLocalAuditEvent({
    action,
    actor = "Researcher",
    target = "Step 2 meaning-unit pipeline"
  }: {
    action: string;
    actor?: AuditEvent["actor"];
    target?: string;
  }) {
    if (!isLocalOnlyMode) {
      return;
    }
    const now = new Date().toISOString();
    setDisplayAuditEvents((current) => [
      {
        actor,
        action,
        id: `audit_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        target,
        timestamp: now
      },
      ...current
    ]);
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
                unit.humanStatus === "Accepted" || unit.humanStatus === "Excluded"
                  ? "Needs review"
                  : "Edited"
            }
          : unit
      )
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
        target: unit.id
      });
      setApiStatus("Meaning-unit excerpt edit saved locally.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        excerpt: unit.excerpt,
        humanStatus: unit.humanStatus === "Accepted" ? "Needs review" : unit.humanStatus
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
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
              exclusionReason: value
            }
          : unit
      )
    );
  }

  function updateHumanSummary(unitId: string, value: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? { ...unit, humanSummary: value, humanStatus: "Edited" }
          : unit
      )
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
        target: unit.id
      });
      setApiStatus("Meaning-unit summary edit saved locally.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        humanStatus: unit.humanStatus,
        humanSummary: unit.humanSummary
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    if (!response.ok) {
      setApiStatus("Meaning-unit summary edit could not be saved. Try again.");
      return;
    }
    setApiStatus("Meaning-unit summary edit saved.");
  }

  async function acceptAllReviewedMeaningUnits() {
    const includableUnits = currentMeaningUnits.filter(
      (unit) => !unit.analysisExcluded
    );
    if (includableUnits.length === 0) {
      setApiStatus("Generate meaning units before accepting summaries.");
      return;
    }
    const incompleteUnit = includableUnits.find(
      (unit) => !unit.excerpt.trim() || !(unit.humanSummary || unit.aiSummary).trim()
    );
    if (incompleteUnit) {
      setApiStatus(
        `Review MU #${incompleteUnit.number} before accepting all summaries. Each MU needs an excerpt and researcher summary.`
      );
      return;
    }
    const confirmed = window.confirm(
      "Accept all visible, non-excluded meaning units? This records the current researcher-reviewed excerpts and summaries as accepted analytic material."
    );
    if (!confirmed) {
      return;
    }

    setIsAcceptingMeaningUnits(true);
    setApiStatus("Saving accepted meaning-unit summaries...");

    try {
      if (isLocalOnlyMode) {
        setUnits((current) =>
          current.map((unit) =>
            unit.analysisExcluded
              ? unit
              : {
                  ...unit,
                  excerpt: unit.excerpt.trim(),
                  humanStatus: "Accepted",
                  humanSummary: (unit.humanSummary || unit.aiSummary).trim()
              }
          )
        );
        recordLocalAuditEvent({
          action: `Accepted ${includableUnits.length} reviewed meaning unit${includableUnits.length === 1 ? "" : "s"} in bulk`,
          target: "Step 2 meaning-unit review"
        });
        setApiStatus(
          "Meaning-unit summaries accepted locally. You can now create and refine provisional categories."
        );
        return;
      }

      const results = await Promise.all(
        includableUnits.map(async (unit) => {
          const response = await fetch(`/api/meaning-units/${unit.id}`, {
            body: JSON.stringify({
              excerpt: unit.excerpt.trim(),
              humanStatus: "Accepted",
              humanSummary: (unit.humanSummary || unit.aiSummary).trim()
            }),
            headers: { "Content-Type": "application/json" },
            method: "PATCH"
          });
          if (!response.ok) {
            throw new Error(`Could not save MU #${unit.number}.`);
          }
          return (await response.json()) as {
            meaningUnit?: MeaningUnit;
          };
        })
      );

      const savedUnits = results
        .map((result) => result.meaningUnit)
        .filter((unit): unit is MeaningUnit => Boolean(unit));
      setUnits((current) =>
        current.map(
          (unit) =>
            savedUnits.find((savedUnit) => savedUnit.id === unit.id) ?? {
              ...unit,
              humanStatus: "Accepted"
            }
        )
      );
      setApiStatus(
        "Meaning-unit summaries accepted. You can now create and refine provisional categories."
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error
          ? error.message
          : "Could not accept meaning-unit summaries."
      );
    } finally {
      setIsAcceptingMeaningUnits(false);
    }
  }

  async function updateMeaningUnitSpeaker(unitId: string, speaker: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? { ...unit, speaker, humanStatus: "Edited" }
          : unit
      )
    );

    if (isLocalOnlyMode) {
      setApiStatus("Speaker correction saved locally for this meaning unit.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        humanStatus: "Edited",
        speaker
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
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
        `Add a short reason before excluding MU #${unit.number}. This keeps the researcher decision audit-visible.`
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
              humanStatus: "Excluded"
            }
          : item
      )
    );
    setDisplayCategories([]);
    setNarrative("");
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
    setApiStatus("Excluding meaning unit...");

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Excluded MU #${unit.number}: ${reason}`,
        target: unit.id
      });
      setApiStatus(
        "Meaning unit excluded locally. Existing categories were cleared; rerun categories when ready."
      );
      return;
    }

    const response = await fetch(`/api/meaning-units/${unit.id}`, {
      body: JSON.stringify({
        analysisExcluded: true,
        exclusionReason: reason
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: string;
      meaningUnit?: MeaningUnit;
      saved?: boolean;
    };
    if (!response.ok || !result.saved) {
      setApiStatus(result.error ?? "Meaning-unit exclusion could not be saved.");
      return;
    }
    if (result.meaningUnit) {
      setUnits((current) =>
        current.map((item) =>
          item.id === result.meaningUnit?.id ? result.meaningUnit : item
        )
      );
    }
    setApiStatus(
      "Meaning unit excluded from category analysis. Existing categories were cleared; rerun categories when ready."
    );
  }

  async function restoreMeaningUnit(unit: MeaningUnit) {
    setUnits((current) =>
      current.map((item) =>
        item.id === unit.id
          ? {
              ...item,
              analysisExcluded: false,
              humanStatus: "Needs review"
            }
          : item
      )
    );
    clearDerivedAnalysisAfterMeaningUnitChange();
    setApiStatus("Restoring meaning unit...");

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Restored MU #${unit.number} for review`,
        target: unit.id
      });
      setApiStatus(
        "Meaning unit restored locally. Review and accept it before categories."
      );
      return;
    }

    const response = await fetch(`/api/meaning-units/${unit.id}`, {
      body: JSON.stringify({
        analysisExcluded: false,
        exclusionReason: null
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
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
          item.id === result.meaningUnit?.id ? result.meaningUnit : item
        )
      );
    }
    setApiStatus(
      "Meaning unit restored for analysis. Review and accept it before categories."
    );
  }

  async function deleteMeaningUnitFromWorkspace(unit: MeaningUnit) {
    const confirmed = window.confirm(
      `Delete MU #${unit.number}? This removes it from the workspace and clears existing categories because category results may reference it. Use Exclude instead if you want to keep an audit-visible record.`
    );
    if (!confirmed) {
      return;
    }

    setApiStatus(`Deleting MU #${unit.number}...`);
    if (isLocalOnlyMode) {
      setUnits((current) => current.filter((item) => item.id !== unit.id));
      setDisplayCategories([]);
      setNarrative("");
      setCategoryDraftNotice("");
      setCategoryDraftIsFallback(false);
      setApiStatus(
        `MU #${unit.number} deleted locally. Existing categories were cleared; rerun categories when ready.`
      );
      return;
    }

    const response = await fetch(`/api/meaning-units/${unit.id}`, {
      method: "DELETE"
    });
    const result = (await response.json().catch(() => ({}))) as {
      deleted?: boolean;
      error?: string;
    };
    if (!response.ok || !result.deleted) {
      setApiStatus(result.error ?? "Meaning unit could not be deleted.");
      return;
    }
    setUnits((current) => current.filter((item) => item.id !== unit.id));
    setDisplayCategories([]);
    setNarrative("");
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
    setApiStatus(
      `MU #${unit.number} deleted. Existing categories were cleared; rerun categories when ready.`
    );
  }

  function returnToTranscriptForUnit(unit: MeaningUnit) {
    setActiveStep("pre-analysis");
    setTranscriptConfirmed(false);
    setApiStatus(
      `Check the transcript around MU #${unit.number}. After editing, save/confirm the transcript and regenerate meaning units.`
    );
  }

  function cleanTranscript() {
    const cleaned = editableTranscript
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    setEditableTranscript(cleaned);
    setTranscriptConfirmed(false);
    setAiPrivacyFindings(extractPrivacyReviewMarkers(cleaned));
    setPrivacyOverrideAccepted(false);
    setTranscriptStorageStatus("Not saved yet — local draft only");
    setApiStatus("Transcript spacing cleaned. Review the text, save a reviewed transcript, then confirm before analysis.");
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
        item.endOffset ?? item.startOffset + item.placeholder.length
      );
    }, 0);
  }

  function updateSensitiveItemStatus(
    itemId: string,
    status: SensitiveReviewStatus
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
      current.map((item) => (item.id === itemId ? { ...item, status } : item))
    );
  }

  function editSensitiveReplacement(item: SensitiveReviewItem) {
    const replacement = window.prompt(
      "Edit the anonymised replacement label:",
      item.replacementText
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
              status: "edited"
            }
          : currentItem
      )
    );
  }

  function applyConsistentReplacement(item: SensitiveReviewItem) {
    const replacement = item.replacementText || item.placeholder;
    const sourceText = item.matchedText ?? item.placeholder;
    setEditableTranscript((current) =>
      current.split(sourceText).join(replacement)
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
              status: currentItem.status === "ignored" ? "ignored" : "confirmed"
            }
          : currentItem
      )
    );
    setApiStatus(`Applied ${replacement} consistently across the transcript.`);
  }

  function replaceSensitiveItemText(
    item: SensitiveReviewItem,
    replacement: string
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
      { cache: "no-store" }
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

  function exportWorkspace(format: "json" | "csv" | "txt") {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "json") {
      downloadFile(
        `gdi-qr-workspace-${timestamp}.json`,
        JSON.stringify(buildExportPayload(), null, 2),
        "application/json"
      );
      setApiStatus("JSON export downloaded");
      return;
    }

    if (format === "csv") {
      downloadFile(
        `gdi-qr-meaning-units-${timestamp}.csv`,
        buildMeaningUnitCsv(currentMeaningUnits),
        "text/csv"
      );
      setApiStatus("CSV export downloaded");
      return;
    }

    downloadFile(
      `gdi-qr-draft-report-${timestamp}.txt`,
      buildTextReport(),
      "text/plain"
    );
    setApiStatus("Text report downloaded");
  }

  function buildExportPayload() {
    return {
      exportNote:
        "This export may contain draft assistant-supported material. Review all outputs against transcript evidence before use.",
      project: currentProject,
      transcript: editableTranscript,
      segments: displaySegments,
      audioFiles: displayAudioFiles,
      transcriptionJobs: displayTranscriptionJobs,
      meaningUnits: currentMeaningUnits,
      categories: displayCategories,
      methodologicalIntegrityIssues: reviewerOutputs,
      reviewerComments: reviewerOutputs,
      integratedNarrative: narrative,
      auditEvents: displayAuditEvents
    };
  }

  function buildTextReport() {
    const categoryText = displayCategories
      .map((category) => `- ${category.name}: ${category.definition}`)
      .join("\n");
    const reviewerText = reviewerOutputs
      .map(
        (comment) =>
          `- [${comment.severity}] ${comment.agent} on ${comment.target}: ${comment.comment}`
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
      "",
      "Transcript",
      editableTranscript || "No transcript yet.",
      "",
      "Meaning Units",
      units.length
        ? units
            .map(
              (unit) =>
                `${unit.number}. ${unit.humanSummary || unit.aiSummary} (${unit.excerpt})`
            )
            .join("\n")
        : "No meaning units yet.",
      "",
      "Categories",
      categoryText || "No categories yet.",
      "",
      "Methodological Integrity Checklist and Issues",
      reviewerText || "No methodological integrity issues yet.",
      "",
      "Summary Narrative",
      narrative || "No summary narrative yet."
    ].join("\n");
  }

  async function markAccepted(unitId: string) {
    const unit = currentMeaningUnits.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }
    const reviewedExcerpt = unit.excerpt.trim();
    const reviewedSummary = (unit.humanSummary || unit.aiSummary).trim();
    if (!reviewedExcerpt || !reviewedSummary) {
      setApiStatus(
        `Review the excerpt and summary before accepting MU #${unit.number}.`
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
              humanStatus: "Accepted"
            }
          : unit
      )
    );
    setApiStatus("Saving meaning-unit decision...");

    if (isLocalOnlyMode) {
      recordLocalAuditEvent({
        action: `Accepted MU #${unit.number}`,
        target: unit.id
      });
      setApiStatus("Meaning-unit decision saved locally.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        excerpt: reviewedExcerpt,
        humanStatus: "Accepted",
        humanSummary: reviewedSummary
      }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
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
          item.id === result.meaningUnit?.id ? result.meaningUnit : item
        )
      );
    }

    setApiStatus(
      result.saved
        ? "Meaning-unit decision saved"
        : result.reason ?? result.error ?? "Meaning-unit save skipped"
    );
  }

  return (
    <div className="app-shell workbook-shell">
      <header className="topbar">
        <div className="brand" aria-label={PRODUCT_TITLE}>
          <div className="brand-mark">GDI-QR</div>
          <div>
            <h1 className="brand-title">
              GDI-QR Guided Qualitative Analysis
            </h1>
            <p className="brand-subtitle">
              A step-by-step workspace based on A Generic Approach to Descriptive-Interpretive Qualitative Research
            </p>
          </div>
        </div>
      </header>

      <div className="layout">
        <main className="main">
          <div className="top-stepper" aria-label="GDI-QR workflow progress">
            {guidedSteps.map((step, index) => (
              <button
                className={`top-step ${
                  activeStep === step.id ? "active" : ""
                } ${completedSteps.has(step.id) ? "complete" : ""}`}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <span className="top-step-number">{index + 1}</span>
                <span>{step.label}</span>
              </button>
            ))}
          </div>
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
            <StepGuidance step={activeStep} />
            <div className="workbook-task-heading">
              <span className="label">What you’ll work on</span>
              <p>
                {activeStep === "pre-analysis"
                  ? "You can move back and forth between domains, data preparation, and relevance judgement as your understanding develops."
                  : "Use the workspace below to review, revise, and record your analytic decisions for this step."}
              </p>
            </div>
            {activeStep === "pre-analysis" && (
              <div className="overlap-strip" aria-label="Pre-analysis activities overlap">
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
                    onChange={(event) => setResearchQuestion(event.target.value)}
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
                    onChange={(event) => setStudyDescription(event.target.value)}
                    placeholder="Initial areas that organise the data in relation to the research question. These are not findings or categories."
                    value={studyDescription}
                  />
                </div>
                <details className="workbook-details">
                  <summary>Optional researcher notes</summary>
                  <div className="grid">
                    <div>
                      <label className="label" htmlFor="researcher-expectations">
                        Researcher Expectations / Preunderstandings
                      </label>
                      <textarea
                        className="textarea compact-textarea"
                        id="researcher-expectations"
                        onChange={(event) =>
                          setResearcherExpectations(event.target.value)
                        }
                        placeholder="Record assumptions, expectations, and prior understandings before detailed analysis."
                        value={researcherExpectations}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="researcher-notes">
                        Researcher Notes
                      </label>
                      <textarea
                        className="textarea compact-textarea"
                        id="researcher-notes"
                        onChange={(event) => setResearcherNotes(event.target.value)}
                        placeholder="Add early decisions, questions, and methodological notes."
                        value={researcherNotes}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="researcher-reflexivity">
                        Researcher Reflexivity Notes
                      </label>
                      <textarea
                        className="textarea compact-textarea"
                        id="researcher-reflexivity"
                        onChange={(event) =>
                          setResearcherReflexivityNotes(event.target.value)
                        }
                        placeholder="What assumptions, experiences, expectations, or theoretical perspectives might influence your analysis?"
                        value={researcherReflexivityNotes}
                      />
                    </div>
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
                    ensuring the material is readable,
                    anonymised, and appropriate for analysis.
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
                      status={editableTranscript.trim() ? "Passed" : "Not addressed"}
                    />
                    <StatusLine
                      label="Readable format"
                      status={transcriptImportText.trim() || editableTranscript.trim() ? "Passed" : "Not addressed"}
                    />
                    <StatusLine
                      label="Anonymisation completed"
                      status={unresolvedHighRiskCount === 0 ? "Passed" : "Needs review"}
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
                    For shared demonstrations, use a short anonymised
                    transcript or test text.
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
                                : "English"
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
                          disabled={isLocalOnlyMode}
                          id="audio-file"
                          onChange={(event) =>
                            setSelectedAudioFile(event.target.files?.[0] ?? null)
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
                          isLocalOnlyMode || isUploadingAudio || !selectedAudioFile
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
                        outputs are created.
                        For shared-link demos, use a short anonymised transcript
                        or test text only. Files over 5 MB are not accepted.
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
                                : "English"
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
                          id="transcript-file"
                          onChange={(event) =>
                            void loadTranscriptFile(event.target.files?.[0] ?? null)
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
                      disabled={isImportingTranscript || !transcriptImportText.trim()}
                      onClick={importTranscript}
                      type="button"
                    >
                      <Upload size={18} />
                      {isImportingTranscript
                        ? "Preparing transcript..."
                        : "Prepare transcript"}
                    </button>
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
                    onChange={(event) => setRelevanceGuideline(event.target.value)}
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
                  <summary>Review prepared transcript and anonymisation</summary>
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
                        Before continuing, check that every turn is assigned to
                        the correct speaker. Questions and prompts can be
                        labelled Interviewer; interviewee experiences can be
                        labelled Participant. Also correct any missing words,
                        recognition errors, or anonymisation issues. Mistakes
                        here will carry into the meaning units and category
                        drafts.
                      </p>
                      <p className="small">
                        Please ensure that all personal identifiers and
                        sensitive information have been removed or appropriately
                        anonymised before analysis. This may include names,
                        addresses, contact details, institutions, health
                        information, immigration status, financial details, and
                        third-party identifiers.
                      </p>
                    </div>
                    <StatusBadge
                      label={transcriptConfirmed ? "Confirmed" : "Needs review"}
                    />
                  </div>
                  {sensitiveReviewItems.length > 0 && (
                    <div className="privacy-review-list">
                      <div className="category-header">
                        <div>
                          <span className="label">Sensitive information review</span>
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
                                updateSensitiveItemStatus(target.id, "confirmed")
                              }
                              onEdit={editSensitiveReplacement}
                              onFocus={focusSensitiveItem}
                              onIgnore={(target) =>
                                updateSensitiveItemStatus(target.id, "ignored")
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
                        I confirm that I have reviewed the transcript and accept
                        responsibility for proceeding.
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
                      <p className="small">{activeSensitiveItem.explanation}</p>
                      <div className="button-row">
                        <button
                          className="button"
                          onClick={() =>
                            updateSensitiveItemStatus(
                              activeSensitiveItem.id,
                              "confirmed"
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
                              "ignored"
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
                      <span className="label">Highlighted transcript review</span>
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
                  {unresolvedHighRiskCount > 0 && !privacyOverrideAccepted && (
                    <div className="mini-card warning-card">
                      <strong>Analysis is paused for privacy review.</strong>
                      <p className="small">
                        Confirm, edit, or ignore all high-risk sensitive items
                        before confirming this transcript for analysis.
                      </p>
                    </div>
                  )}
                  {editableTranscript.trim() && (
                    <div className="mini-card soft">
                      <span className="label">Before saving</span>
                      <p className="small">
                        Raw transcripts may contain identifiable or sensitive
                        information. Please review and anonymise the transcript
                        before saving it for analysis.
                      </p>
                    </div>
                  )}
                  <button
                    className="button primary"
                    disabled={
                      isConfirmingTranscript ||
                      !editableTranscript.trim() ||
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
                    disabled={!editableTranscript.trim() || !canProceedWithTranscript}
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
                      setTranscriptStorageStatus("Not saved yet — local draft only");
                      setPrivacyOverrideAccepted(false);
                      setAiPrivacyFindings(
                        extractPrivacyReviewMarkers(nextTranscript)
                      );
                    }}
                    placeholder="Your uploaded audio transcript will appear here after local transcription."
                    ref={transcriptTextAreaRef}
                    value={editableTranscript}
                  />
                </details>
                {audioPreviewUrl && (
                  <audio className="audio-player" controls src={audioPreviewUrl} />
                )}
                </details>
              </div>
            )}

            {activeStep === "understanding" && (
              <div className="section-body grid">
                <div className="analysis-flow-story" aria-label="Understanding and translating flow">
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
                        setTranscriptStorageStatus("Not saved yet — local draft only");
                        setPrivacyOverrideAccepted(false);
                        setAiPrivacyFindings(
                          extractPrivacyReviewMarkers(nextTranscript)
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
                        label={transcriptConfirmed ? "Confirmed" : "Needs review"}
                      />
                    </div>
                  </section>

                  <section className="analysis-panel">
                    <span className="flow-step">2 · Meaning unit delineation</span>
                    <span className="label">Meaning Units</span>
                    <h3>Delineate meaning shifts</h3>
                    <p className="small">
                      A meaning unit should be large enough to communicate a
                      clear message but small enough to remain analytically
                      manageable.
                    </p>
                    <p className="small panel-note">
                      Treat these boundaries as reviewable working decisions,
                      not automatic truth.
                    </p>
                    <div className="upload-controls">
                      <label className="label" htmlFor="segment-split-mode">
                        Delineation mode
                      </label>
                      <select
                        className="field"
                        disabled={isAutoSplittingTranscript}
                        id="segment-split-mode"
                        onChange={(event) =>
                          setSegmentSplitMode(event.target.value as AutoSegmentMode)
                        }
                        value={segmentSplitMode}
                      >
                        <option value="conservative">
                          Conservative — fewer, larger meaning units
                        </option>
                        <option value="balanced">
                          Balanced — meaning-shift based, recommended
                        </option>
                        <option value="detailed">
                          Detailed — more granular meaning shifts
                        </option>
                      </select>
                    </div>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={
                          isAutoSplittingTranscript ||
                          !editableTranscript.trim() ||
                          !transcriptConfirmed
                        }
                        onClick={() => void autoSplitTranscriptSegments()}
                        title={
                          transcriptConfirmed
                            ? "Optional support for draft meaning-unit boundaries"
                            : "Confirm the transcript before auto-delineation"
                        }
                        type="button"
                      >
                        <GitBranch size={18} />
                        {isAutoSplittingTranscript
                          ? "Delineating..."
                          : "Optional assistant support: delineate"}
                      </button>
                    </div>
                    {displaySegments.length === 0 ? (
                      <EmptyState text="No meaning units yet. Confirm the transcript, then delineate meaning shifts for review." />
                    ) : (
                      <div className="segment-list compact-list-panel">
                        {displaySegments.map((segment) => (
                          <button
                            className={`segment-list-item ${
                              segment.id === selectedSegment?.id ? "active" : ""
                            }`}
                            key={segment.id}
                            onClick={() => setSelectedSegmentId(segment.id)}
                            type="button"
                          >
                            <div>
                              <strong>
                                {segment.segmentId}: {segment.topicLabel}
                              </strong>
                              <p className="small">
                                {segment.text.slice(0, 120)}
                                {segment.text.length > 120 ? "..." : ""}
                              </p>
                              {(() => {
                                const counts = segmentMeaningUnitCounts.get(
                                  segment.segmentId
                                ) ?? {
                                  accepted: 0,
                                  excluded: 0,
                                  total: 0
                                };
                                return (
                                  <p className="small">
                                    {counts.total} meaning unit
                                    {counts.total === 1 ? "" : "s"} ·{" "}
                                    {counts.accepted} accepted ·{" "}
                                    {counts.excluded} excluded/context
                                  </p>
                                );
                              })()}
                            </div>
                            <StatusBadge
                              label={getSegmentDisplayStatus(
                                segment,
                                segmentMeaningUnitCounts.get(segment.segmentId)
                              )}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedSegment && (
                      <div className="mini-card soft">
                        <div className="category-header">
                          <div>
                            <span className="label">Selected meaning unit</span>
                            <h3>{selectedSegment.segmentId}</h3>
                          </div>
                          <StatusBadge
                            label={getSegmentDisplayStatus(
                              selectedSegment,
                              segmentMeaningUnitCounts.get(selectedSegment.segmentId)
                            )}
                          />
                        </div>
                        <label className="label">
                          Meaning Unit ID / Topic
                          <input
                            className="field"
                            onChange={(event) =>
                              setSegmentDraftTitle(event.target.value)
                            }
                            value={segmentDraftTitle}
                          />
                        </label>
                        <textarea
                          className="textarea segment-textarea"
                          id="segment-editor"
                          onChange={(event) =>
                            setSegmentDraftText(event.target.value)
                          }
                          ref={segmentTextAreaRef}
                          value={segmentDraftText}
                        />
                        <div className="button-row">
                          <button
                            className="button"
                            disabled={isSavingSegment}
                            onClick={() => void saveSelectedSegment()}
                            type="button"
                          >
                            Save meaning unit
                          </button>
                          <button
                            className="button"
                            disabled={isSavingSegment}
                            onClick={() =>
                              void saveSelectedSegment("Ready for MU Analysis")
                            }
                            type="button"
                          >
                            Mark ready
                          </button>
                          <button
                            className="button"
                            disabled={isSavingSegment}
                            onClick={() => void runSegmentAction("split")}
                            type="button"
                          >
                            Split
                          </button>
                          <button
                            className="button"
                            disabled={isSavingSegment}
                            onClick={createSegmentFromSelection}
                            type="button"
                          >
                            New unit from selection
                          </button>
                          <button
                            className="button"
                            disabled={isSavingSegment || !previousSegment}
                            onClick={() =>
                              void runSegmentAction("merge", "previous")
                            }
                            type="button"
                          >
                            Merge previous
                          </button>
                          <button
                            className="button"
                            disabled={isSavingSegment || !nextSegment}
                            onClick={() => void runSegmentAction("merge", "next")}
                            type="button"
                          >
                            Merge next
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  <section className="analysis-panel">
                    <span className="flow-step">3 · Analytic summary</span>
                    <span className="label">Analytic Summaries</span>
                    <h3>Translate into concise summaries</h3>
                    <p className="small">
                      Summaries should remain close to the participant's
                      account. Any assistant suggestion is provisional and for
                      researcher review.
                    </p>
                    <p className="small panel-note">
                      Accept only the reviewed summaries that accurately
                      capture the participant meaning.
                    </p>
                    <div className="scope-options">
                      <label className="scope-option">
                        <input
                          checked={meaningUnitGenerationScope === "all"}
                          disabled={isGeneratingMeaningUnits}
                          name="mu-generation-scope"
                          onChange={() => setMeaningUnitGenerationScope("all")}
                          type="radio"
                        />
                        <span>All meaning units</span>
                      </label>
                      <label className="scope-option">
                        <input
                          checked={meaningUnitGenerationScope === "selected"}
                          disabled={isGeneratingMeaningUnits}
                          name="mu-generation-scope"
                          onChange={() => setMeaningUnitGenerationScope("selected")}
                          type="radio"
                        />
                        <span>Selected meaning unit only</span>
                      </label>
                    </div>
                    <select
                      className="field"
                      disabled={
                        isGeneratingMeaningUnits ||
                        meaningUnitGenerationScope === "all"
                      }
                      id="mu-segment-select"
                      onChange={(event) =>
                        setMeaningUnitSegmentId(event.target.value)
                      }
                      value={meaningUnitSegmentId}
                    >
                      {displaySegments.map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {segment.segmentId} — {segment.topicLabel}
                        </option>
                      ))}
                    </select>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={!canGenerateMeaningUnits || isGeneratingMeaningUnits}
                        onClick={() => void generateMeaningUnits()}
                        type="button"
                      >
                        <Play size={18} />
                        {isGeneratingMeaningUnits
                          ? "Drafting summaries..."
                          : transcriptConfirmed
                            ? generationButtonLabel
                            : "Confirm transcript first"}
                      </button>
                      <button
                        className="button"
                        disabled={
                          currentMeaningUnits.length === 0 ||
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
                      {isGeneratingMeaningUnits && (
                        <button
                          className="button danger"
                          onClick={stopMeaningUnitGeneration}
                          type="button"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                    {generationProgress && (
                      <p className="small">
                        {generationProgress.total > 1
                          ? `Drafting summaries... ${generationProgress.label ?? ""} (${generationProgress.current} of ${generationProgress.total})`
                          : `Drafting summary for ${generationProgress.label ?? generationTargetLabel}...`}
                      </p>
                    )}
                    <div className="summary-list">
                      {currentMeaningUnits.length === 0 ? (
                        <EmptyState text="No summaries yet. Delineate meaning units, then ask for optional assistant support or write summaries manually." />
                      ) : (
                        <>
                          {currentMeaningUnits
                            .filter((unit) => !unit.analysisExcluded)
                            .map((unit) => (
                              <MeaningUnitReviewCard
                                key={unit.id}
                                onAccept={markAccepted}
                                onEditExclusionReason={updateExclusionReason}
                                onEditExcerpt={updateMeaningUnitExcerpt}
                                onEditSummary={updateHumanSummary}
                                onExclude={excludeMeaningUnit}
                                onRestore={restoreMeaningUnit}
                                onReturnToTranscript={returnToTranscriptForUnit}
                                onSaveExcerpt={saveMeaningUnitExcerpt}
                                onSaveSummary={saveMeaningUnitHumanSummary}
                                unit={unit}
                              />
                            ))}
                          {excludedMeaningUnits.length > 0 && (
                            <details className="workbook-details">
                              <summary>
                                Context/excluded candidates ({excludedMeaningUnits.length})
                              </summary>
                              <div className="summary-list">
                                {excludedMeaningUnits.map((unit) => (
                                  <MeaningUnitReviewCard
                                    key={unit.id}
                                    onAccept={markAccepted}
                                    onEditExclusionReason={updateExclusionReason}
                                    onEditExcerpt={updateMeaningUnitExcerpt}
                                    onEditSummary={updateHumanSummary}
                                    onExclude={excludeMeaningUnit}
                                    onRestore={restoreMeaningUnit}
                                    onReturnToTranscript={returnToTranscriptForUnit}
                                    onSaveExcerpt={saveMeaningUnitExcerpt}
                                    onSaveSummary={saveMeaningUnitHumanSummary}
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
                  <summary>Methodological integrity support</summary>
                  <ReviewerPanel
                    expandedIssueIds={expandedReviewIssueIds}
                    isOpen={muReviewOpen}
                    issues={meaningUnitReviewIssues}
                    isRunning={isRunningReviewer}
                    onAddMemo={(issue) => {
                      const memo = window.prompt(
                        "Researcher note for this integrity issue:",
                        issue.researcherMemo ?? ""
                      );
                      if (memo !== null) {
                        void updateReviewerIssue(issue.id, { memo });
                      }
                    }}
                    onDismiss={(issue) =>
                      void updateReviewerIssue(issue.id, { status: "dismissed" })
                    }
                    onResolve={(issue) =>
                      void updateReviewerIssue(issue.id, { status: "resolved" })
                    }
                    onRun={() => void runReviewer("meaning-units")}
                    onToggle={() => setMuReviewOpen((value) => !value)}
                    onToggleIssue={(issueId) =>
                      setExpandedReviewIssueIds((current) =>
                        current.includes(issueId)
                          ? current.filter((id) => id !== issueId)
                          : [...current, issueId]
                      )
                    }
                    onView={viewReviewerTarget}
                    title="GDI-QR-informed Review"
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
                      {currentMeaningUnits.length - excludedMeaningUnits.length}
                    </span>
                    {displayCategories.length > 0 && (
                      <span className="badge blue">
                        Researcher-confirmed categories: {confirmedCategoryCount} /{" "}
                        {displayCategories.filter((item) => item.status !== "rejected").length}
                      </span>
                    )}
                    {hasFallbackCategoryLabels && (
                      <span className="badge warning">
                        Temporary draft requires review
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
                              {unit.humanSummary || unit.aiSummary || unit.excerpt}
                            </p>
                            <p className="small">
                              Current categories:{" "}
                              {displayCategories
                                .filter((category) =>
                                  category.includedUnitIds.includes(unit.number)
                                )
                                .map((category) => category.name)
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
                    <span className="label">Provisional Categories</span>
                    <h3>Group, name, and revise</h3>
                    <p className="small">
                      Category work is iterative. Rename, merge, split, move
                      meaning units, and reject weak categories as the analysis
                      becomes clearer.
                    </p>
                    <div className="button-row">
                      <button
                        className="button"
                        disabled={
                          confirmedMeaningUnits.length === 0 || isRunningCategories
                        }
                        onClick={() => void runCategories({ modeOverride: "A" })}
                        type="button"
                      >
                        <Play size={18} />
                        Optional assistant suggestion: provisional categories
                      </button>
                      <button
                        className="button"
                        disabled={
                          displayCategories.length === 0 ||
                          hasTemporaryFallbackCategories ||
                          isRunningCategories
                        }
                        onClick={() => void runCategories({ modeOverride: "B" })}
                        type="button"
                      >
                        <RefreshCcw size={18} />
                        Refine category grouping
                      </button>
                    </div>
                    {isRunningCategories && (
                      <span className="badge warning">
                        Drafting category suggestions...
                      </span>
                    )}
                    {categoryDraftNotice && (
                      <div
                        className={`mini-card ${
                          hasTemporaryFallbackCategories ? "warning-card" : "soft"
                        }`}
                      >
                        <span className="label">
                          {hasTemporaryFallbackCategories
                            ? "Temporary fallback draft"
                            : "Category note"}
                        </span>
                        <p className="small">{categoryDraftNotice}</p>
                        {hasTemporaryFallbackCategories && (
                          <div className="button-row">
                            <button
                              className="button"
                              disabled={isRunningCategories}
                              onClick={() =>
                                void runCategories({
                                  allowFallbackRegenerate: true,
                                  modeOverride: displayCategories.length ? "B" : "A"
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
                              onClick={() => void acceptTemporaryCategoryDraft()}
                              type="button"
                            >
                              <Check size={18} />
                              Use as editable starting point
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {displayCategories.length === 0 ? (
                      <div className="empty-with-example">
                        <EmptyState text="No provisional categories yet. Review meaning-unit summaries, then create your first category or request assistant suggestions." />
                        <details className="workbook-details category-structure-help">
                          <summary>What is a category?</summary>
                          <p className="small">
                            A category groups related meaning units that appear
                            to share a common meaning.
                          </p>
                          <div className="category-structure-diagram" aria-label="Category structure">
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
                      const memo = window.prompt(
                        "Researcher note for this integrity issue:",
                        issue.researcherMemo ?? ""
                      );
                      if (memo !== null) {
                        void updateReviewerIssue(issue.id, { memo });
                      }
                    }}
                    onDismiss={(issue) =>
                      void updateReviewerIssue(issue.id, { status: "dismissed" })
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
                          : [...current, issueId]
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
                  <span className="label">Developing Structure</span>
                  <p className="small">
                    Integration involves identifying how categories relate to one
                    another and developing a coherent summary structure. Summary
                    narratives should explain relationships among categories,
                    not simply list them.
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
                        displayCategories.length === 0 ||
                        !allSegmentsProcessedForModeC ||
                        isRunningCategories
                      }
                      onClick={() => void runCategories({ modeOverride: "C" })}
                      type="button"
                    >
                      <GitBranch size={18} />
                      Optional assistant support: suggest structure
                    </button>
                    <button className="button" type="button">
                      Add relationship
                    </button>
                    <button className="button" type="button">
                      Edit relationship
                    </button>
                    <button className="button" type="button">
                      Reorder categories
                    </button>
                  </div>
                </div>
                <div className="mini-card relationship-map-card">
                  <span className="flow-step">2 · Category Map</span>
                  <span className="label">Category Relationship Map</span>
                  <h3>How do the provisional categories connect?</h3>
                  {displayCategories.length === 0 ? (
                    <div className="relationship-map-placeholder">
                      <EmptyState text="No categories yet. Review provisional categories before integrating." />
                      <div className="relationship-example-map" aria-hidden="true">
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
                  ) : (
                    <div className="relationship-map">
                      {displayCategories
                        .filter((category) => category.status !== "rejected")
                        .map((category, index) => (
                          <div className="relationship-node" key={category.id}>
                            <span className="relationship-index">{index + 1}</span>
                            <strong>{category.name}</strong>
                            <p className="small">{category.definition}</p>
                            <p className="small">
                              Evidence: {category.includedUnitIds.length} meaning
                              unit{category.includedUnitIds.length === 1 ? "" : "s"}
                            </p>
                            <StatusBadge
                              label={category.status ? formatCategoryStatus(category.status) : "Needs review"}
                            />
                            {index <
                              displayCategories.filter(
                                (item) => item.status !== "rejected"
                              ).length -
                                1 && (
                              <span
                                aria-hidden="true"
                                className="relationship-arrow"
                              >
                                ↓
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <div className="integration-narrative-area">
                  <span className="flow-step">3 · Summary Narrative</span>
                  <IntegrationDraftPanel
                    categories={displayCategories}
                    integrationNote={integrationNote}
                    integrationReviewed={integrationReviewed}
                    narrative={narrative}
                    onChangeNarrative={(value) => {
                      setNarrative(value);
                      setIntegrationReviewed(false);
                    }}
                    onConfirm={() => {
                      if (!narrative.trim()) {
                        setApiStatus("Write or draft a summary narrative before confirming.");
                        return;
                      }
                      if (hasSensitivePlaceholder(narrative)) {
                        setApiStatus("Summary narrative contains sensitive placeholders. Review before confirming.");
                        return;
                      }
                      setIntegrationReviewed(true);
                      setApiStatus("Integrated findings marked as researcher-reviewed provisional synthesis.");
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
                    <button className="button" onClick={() => exportWorkspace("json")} type="button">
                      <Download size={18} />
                      Export audit trail
                    </button>
                  </div>
                </div>
                <MethodologicalIntegrityChecklist
                  categoryCount={displayCategories.length}
                  issueCount={reviewerOutputs.filter((issue) => issue.status !== "dismissed").length}
                  meaningUnitCount={currentMeaningUnits.length}
                  narrativeReviewed={integrationReviewed}
                  transcriptConfirmed={transcriptConfirmed}
                />
                <details className="workbook-details reflection-details">
                  <summary>Open detailed reflection panels</summary>
                  <div className="review-layout">
                    <ReviewerPanel
                      expandedIssueIds={expandedReviewIssueIds}
                      isOpen={muReviewOpen}
                      issues={meaningUnitReviewIssues}
                      isRunning={isRunningReviewer}
                      onAddMemo={(issue) => {
                        const memo = window.prompt(
                          "Researcher note for this integrity issue:",
                          issue.researcherMemo ?? ""
                        );
                        if (memo !== null) {
                          void updateReviewerIssue(issue.id, { memo });
                        }
                      }}
                      onDismiss={(issue) =>
                        void updateReviewerIssue(issue.id, { status: "dismissed" })
                      }
                      onResolve={(issue) =>
                        void updateReviewerIssue(issue.id, { status: "resolved" })
                      }
                      onRun={() => void runReviewer("meaning-units")}
                      onToggle={() => setMuReviewOpen((value) => !value)}
                      onToggleIssue={(issueId) =>
                        setExpandedReviewIssueIds((current) =>
                          current.includes(issueId)
                            ? current.filter((id) => id !== issueId)
                            : [...current, issueId]
                        )
                      }
                      onView={viewReviewerTarget}
                      title="Meaning Unit Integrity Check"
                    />
                    <ReviewerPanel
                      expandedIssueIds={expandedReviewIssueIds}
                      isOpen={categoryReviewOpen}
                      issues={categoryReviewIssues}
                      isRunning={isRunningReviewer}
                      onAddMemo={(issue) => {
                        const memo = window.prompt(
                          "Researcher note for this integrity issue:",
                          issue.researcherMemo ?? ""
                        );
                        if (memo !== null) {
                          void updateReviewerIssue(issue.id, { memo });
                        }
                      }}
                      onDismiss={(issue) =>
                        void updateReviewerIssue(issue.id, { status: "dismissed" })
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
                            : [...current, issueId]
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
                      description: "Current analysis record data for backup or audit.",
                      format: "json" as const,
                      label: "JSON"
                    },
                    {
                      description: "Meaning-unit table for spreadsheet review.",
                      format: "csv" as const,
                      label: "CSV"
                    },
                    {
                      description: "Readable analysis record for supervision.",
                      format: "txt" as const,
                      label: "DOCX-style text"
                    },
                    {
                      description: "Formatted document export placeholder.",
                      format: "docx" as const,
                      label: "DOCX"
                    },
                    {
                      description: "PDF export placeholder for later version.",
                      format: "pdf" as const,
                      label: "PDF"
                    }
                  ].map((item) => (
                    <div className="mini-card" key={item.format}>
                      <Download size={26} />
                      <h3>{item.label} export</h3>
                      <p className="small">{item.description}</p>
                      <button
                        className="button"
                        disabled={
                          !canExport ||
                          item.format === "docx" ||
                          item.format === "pdf"
                        }
                        onClick={() =>
                          item.format === "json" ||
                          item.format === "csv" ||
                          item.format === "txt"
                            ? exportWorkspace(item.format)
                            : undefined
                        }
                        type="button"
                      >
                        <Download size={18} />
                        {item.format === "docx" || item.format === "pdf"
                          ? "Coming next"
                          : `Download ${item.label}`}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mini-card soft">
                  <span className="label">Review trail</span>
                  <p className="small">
                    Exports may contain assistant-supported draft material. Review all outputs
                    against transcript evidence before using them in reports,
                    publications, supervision, or teaching materials.
                  </p>
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
                disabled={!canExport}
                onClick={() => exportWorkspace("json")}
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
      </div>
    </div>
  );
}

function StatusBadge({ label }: { label: string }) {
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

function getSegmentDisplayStatus(
  segment: TranscriptSegment,
  counts?: { accepted: number; excluded: number; total: number }
) {
  if ((counts?.total ?? 0) === 0 && segment.status === "Needs Review") {
    return "Ready for delineation";
  }
  return segment.status;
}

function StepGuidance({ step }: { step: WorkflowStep }) {
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

function GdiqrTips({ step }: { step: WorkflowStep }) {
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

function GuidanceCard({
  emphasis = false,
  text,
  title
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

function MethodologicalIntegrityGuide({
  activeStep,
  categoryCount,
  issueCount,
  meaningUnitCount,
  transcriptConfirmed
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

function MethodologicalIntegrityChecklist({
  categoryCount,
  issueCount,
  meaningUnitCount,
  narrativeReviewed,
  transcriptConfirmed
}: {
  categoryCount: number;
  issueCount: number;
  meaningUnitCount: number;
  narrativeReviewed: boolean;
  transcriptConfirmed: boolean;
}) {
  const items: Array<{
    label: string;
    status: "Passed" | "Needs review" | "Not addressed";
  }> = [
    { label: "Respect for participants", status: transcriptConfirmed ? "Passed" : "Needs review" },
    { label: "Clarity of presentation", status: narrativeReviewed ? "Passed" : "Needs review" },
    { label: "Contextual information", status: meaningUnitCount > 0 ? "Passed" : "Not addressed" },
    { label: "Coherence", status: categoryCount > 0 ? "Needs review" : "Not addressed" },
    { label: "Credibility checks", status: issueCount > 0 ? "Needs review" : "Not addressed" },
    { label: "Researcher expectations", status: "Needs review" },
    { label: "Audit trail", status: "Needs review" },
    { label: "Negative or contradictory cases", status: "Needs review" },
    { label: "Category overlap", status: categoryCount > 1 ? "Needs review" : "Not addressed" },
    { label: "Category overload", status: categoryCount > 8 ? "Needs review" : "Passed" },
    { label: "Evidence support", status: meaningUnitCount > 0 ? "Needs review" : "Not addressed" }
  ];

  return (
    <div className="mini-card">
      <span className="label">Checklist</span>
      <p className="small checklist-explanation">
        Use this checklist as a review guide, not as an automatic pass/fail
        score. Items marked "Needs review" are prompts for researcher judgement,
        memo-writing, and revision before export.
      </p>
      <div className="integrity-checklist">
        {items.map((item) => (
          <StatusLine key={item.label} label={item.label} status={item.status} />
        ))}
      </div>
    </div>
  );
}

function StatusLine({
  label,
  status
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
  "Completed"
];

function ContextPreview({
  current,
  next,
  previous
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

function ContextItem({
  current = false,
  label,
  segment
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

function isTranscriptConfirmed(project: Project) {
  return (
    project.status === "Transcript confirmed for analysis" ||
    project.status === "Transcript confirmed for local analysis"
  );
}

function normaliseResearcherFacingText(value: string) {
  return value
    .replace(
      /Local-only mode:\s*transcript data is processed and stored within the local environment\.?/gi,
      ""
    )
    .trim();
}

function buildLocalTranscriptSegment({
  caseId,
  createdBy = "manual",
  segmentNumber,
  splittingMode,
  text,
  topicLabel
}: {
  caseId: string;
  createdBy?: "auto" | "manual";
  segmentNumber: number;
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
    speakerInfo: "Local draft segment",
    sourceTranscriptId: "active-transcript",
    splittingMode,
    startingMuNumber: (segmentNumber - 1) * 100 + 1,
    startTimestamp: "00:00",
    status: "Needs Review",
    text,
    topicLabel: topicLabel ?? `Segment ${segmentNumber}`
  };
}

function renumberLocalSegments(segments: TranscriptSegment[]) {
  return segments.map((segment, index) => ({
    ...segment,
    segmentId: `SEG-${String(index + 1).padStart(3, "0")}`,
    segmentNumber: index + 1,
    startingMuNumber: index * 100 + 1
  }));
}

function canRunMeaningUnitsForSegment(segment: TranscriptSegment) {
  return (
    segment.text.trim().length > 0 &&
    (segment.status === "Ready for MU Analysis" ||
      segment.status === "Analysed" ||
      segment.status === "Completed")
  );
}

function isConfirmedMeaningUnit(unit: MeaningUnit) {
  return !unit.analysisExcluded && unit.humanStatus === "Accepted";
}

function normalizeMeaningUnitNumbersForSegments(
  units: MeaningUnit[],
  segments: TranscriptSegment[]
) {
  const segmentOrder = new Map(
    segments.map((segment, index) => [segment.segmentId, index])
  );
  const validCaseIds = new Set(segments.map((segment) => segment.caseId));

  return units
    .filter(
      (unit) =>
        segmentOrder.has(unit.segmentId) &&
        (!unit.caseId || validCaseIds.has(unit.caseId))
    )
    .sort((left, right) => {
      const leftSegment = segmentOrder.get(left.segmentId) ?? 0;
      const rightSegment = segmentOrder.get(right.segmentId) ?? 0;
      if (leftSegment !== rightSegment) {
        return leftSegment - rightSegment;
      }
      return left.number - right.number;
    })
    .map((unit, index) => ({
      ...unit,
      number: index + 1
    }));
}

function getMeaningUnitValidationFlags(
  unit: MeaningUnit
): MeaningUnitValidationFlag[] {
  const flags: MeaningUnitValidationFlag[] = [];
  const reviewedSummary = (unit.humanSummary || "").trim();
  const excerpt = unit.excerpt.trim();
  const wordCount = approximateWordCount(excerpt);
  const speaker = unit.speaker.toLowerCase();

  if (!reviewedSummary) {
    flags.push({ label: "Researcher summary missing", tone: "warning" });
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

  return flags;
}

function approximateWordCount(text: string) {
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

function getSegmentSplitIndex(text: string, cursorPosition?: number | null) {
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

function extractPrivacyReviewMarkers(transcript: string) {
  return Array.from(
    new Set(
      transcript.match(/\[\[PRIVACY_REVIEW:[^\]]+\]\]/g)?.map((item) =>
        item.trim()
      ) ?? []
    )
  );
}

function hasUnresolvedPrivacyMarkers(transcript: string) {
  return countUnresolvedPrivacyMarkers(transcript) > 0;
}

function countUnresolvedPrivacyMarkers(transcript: string) {
  return transcript.match(/\[\[PRIVACY_REVIEW:[^\]]+\]\]/g)?.length ?? 0;
}

function buildSensitiveReviewItems(
  transcript: string,
  findings: string[],
  existingItems: SensitiveReviewItem[] = []
): SensitiveReviewItem[] {
  const existingByKey = new Map(
    existingItems.map((item) => [sensitiveItemKey(item), item])
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
      markerCategory ?? match[4] ?? "OTHER_PRIVATE_DETAIL"
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
        metadata.explanation
    };
    const existing =
      existingByKey.get(sensitiveItemKey(base)) ??
      existingItems.find(
        (item) =>
          item.placeholder === base.placeholder &&
          item.startOffset === base.startOffset
      );
    items.push(
      existing
        ? {
            ...base,
            ...existing,
            matchedText: base.matchedText,
            startOffset,
            endOffset
          }
        : base
    );
  }

  return items;
}

function safePlaceholderCategoryName(categoryKey: string) {
  if (categoryKey === "IMMIGRATION_LEGAL") {
    return "LEGAL_STATUS";
  }
  return categoryKey;
}

function prepareTranscriptForStorage(transcript: string) {
  const markerCounters = new Map<string, number>();
  return transcript.replace(
    /\[\[PRIVACY_REVIEW:([A-Z_ -]+):[^\]]+\]\]/g,
    (_marker, rawCategory: string) => {
      const category = safePlaceholderCategoryName(
        normaliseSensitiveCategory(rawCategory)
      );
      const nextNumber = (markerCounters.get(category) ?? 0) + 1;
      markerCounters.set(category, nextNumber);
      return `[${category}_${nextNumber}]`;
    }
  );
}

function serialiseSensitiveItemsForStorage(items: SensitiveReviewItem[]) {
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
      status
    }) => ({
      category,
      endOffset,
      explanation,
      id,
      placeholder,
      replacementText,
      riskLevel,
      startOffset,
      status
    })
  );
}

function sensitiveItemKey(item: SensitiveReviewItem) {
  return `${item.placeholder}:${item.startOffset ?? ""}:${item.category}`;
}

function findMatchingPrivacyFinding(
  findings: string[],
  rawMarker: string,
  placeholder: string
) {
  const finding = findings.find(
    (finding) => finding.includes(rawMarker) || finding.includes(placeholder)
  );
  if (!finding) {
    return undefined;
  }
  return finding.replace(/\[\[PRIVACY_REVIEW:[^\]]+\]\]/g, placeholder);
}

function normaliseSensitiveCategory(category: string) {
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
  if (upper.includes("CONTACT") || upper.includes("EMAIL") || upper.includes("PHONE")) {
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

function sensitiveCategoryMetadata(categoryKey: string): {
  explanation: string;
  label: string;
  riskLevel: SensitiveRiskLevel;
} {
  const map: Record<
    string,
    { explanation: string; label: string; riskLevel: SensitiveRiskLevel }
  > = {
    PERSON: {
      explanation: "May identify a participant, interviewer, or third-party person.",
      label: "person name or third-party identifier",
      riskLevel: "high"
    },
    LOCATION: {
      explanation: "May reveal a specific location or institution.",
      label: "location or institution",
      riskLevel: "medium"
    },
    ADDRESS: {
      explanation: "May reveal a specific address.",
      label: "address",
      riskLevel: "high"
    },
    POSTCODE: {
      explanation: "May reveal a precise geographic area.",
      label: "postcode",
      riskLevel: "high"
    },
    ORGANIZATION: {
      explanation: "May identify a workplace, school, service, or organisation.",
      label: "organisation or institution",
      riskLevel: "medium"
    },
    CONTACT: {
      explanation: "May reveal direct contact details.",
      label: "contact detail",
      riskLevel: "high"
    },
    HEALTH: {
      explanation: "May reveal sensitive health-related information.",
      label: "health-related disclosure",
      riskLevel: "high"
    },
    FINANCIAL: {
      explanation: "May reveal sensitive financial detail.",
      label: "financial detail",
      riskLevel: "high"
    },
    IMMIGRATION_LEGAL: {
      explanation: "May reveal immigration, legal, or status-related information.",
      label: "immigration/legal detail",
      riskLevel: "high"
    },
    IDENTIFIER: {
      explanation: "May reveal an ID, account, social handle, or unique identifier.",
      label: "identifier",
      riskLevel: "high"
    },
    OTHER_PRIVATE_DETAIL: {
      explanation: "May contain identifying or sensitive contextual detail.",
      label: "other private detail",
      riskLevel: "medium"
    }
  };

  return map[categoryKey] ?? map.OTHER_PRIVATE_DETAIL;
}

function isFallbackCategory(category: CategoryNode): boolean {
  return (
    category.source === "fallback" ||
    category.id.startsWith("cat_fallback") ||
    Boolean(category.subcategories?.some(isFallbackCategory))
  );
}

function markCategoriesResearcherConfirmed(
  categories: CategoryNode[]
): CategoryNode[] {
  return categories.map((category) => ({
    ...category,
    source: "researcher_confirmed" as const,
    subcategories: category.subcategories
      ? markCategoriesResearcherConfirmed(category.subcategories)
      : undefined
  }));
}

function markCategoriesEditableDraft(categories: CategoryNode[]): CategoryNode[] {
  return categories.map((category) => ({
    ...category,
    status: isFallbackCategory(category) ? "fallback_draft" : "needs_review",
    subcategories: category.subcategories
      ? markCategoriesEditableDraft(category.subcategories)
      : undefined
  }));
}

function formatCategoryStatus(status: NonNullable<CategoryNode["status"]>) {
  const labels: Record<NonNullable<CategoryNode["status"]>, string> = {
    ai_draft: "Suggested draft",
    edited: "Edited",
    confirmed: "Confirmed",
    fallback_draft: "Fallback draft",
    needs_review: "Needs review",
    rejected: "Rejected"
  };
  return labels[status] ?? "Needs review";
}

function hasSensitivePlaceholder(text: string) {
  return /\[(PERSON|CONTACT|LOCATION|POSTCODE|ADDRESS|IDENTIFIER|HEALTH|FINANCIAL|LEGAL_STATUS)_\d+\]/i.test(
    text
  );
}

function getCategoryRunDisabledReason({
  allSegmentsProcessedForModeC,
  categoryCount,
  confirmedMeaningUnits,
  hasTemporaryFallbackCategories,
  mode
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

function getCategoryRunLabel(mode: CategoryMode, running = false) {
  const labels: Record<CategoryMode, string> = {
    A: "Optional assistant suggestion: provisional categories",
    B: "Refine categories",
    C: "Optional assistant suggestion: structure and summary narrative"
  };
  return running ? `${labels[mode]}...` : labels[mode];
}

function getStepCopy(step: WorkflowStep) {
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

function getStepGuidance(step: WorkflowStep) {
  const guidance: Record<
    WorkflowStep,
    { ai: string; judgment: string; meaning: string; task: string }
  > = {
    "pre-analysis": {
      meaning:
        "Pre-analysis helps you prepare your material before detailed analysis begins. You will organise data into domains of investigation, prepare your transcript, and make initial judgements about relevance.",
      task:
        "Define the research question, domains of investigation, researcher expectations, notes, and relevance guideline. Upload or paste a transcript and review it before analysis.",
      ai:
        "I can help you structure your domains, prepare transcript material, and flag sections that may need your attention. You remain the final decision-maker.",
      judgment:
        "You decide how to define your domains, what counts as relevant study data, and what preparation decisions are appropriate for your research question."
    },
    understanding: {
      meaning:
        "In this step, you work closely with meaning units. The aim is to understand what each meaning unit says and translate it into a more manageable analytic form.",
      task:
        "Review, split, merge, delete, and confirm meaning units. Edit summaries and implicit meaning notes before accepting them.",
      ai:
        "I can help suggest possible meaning unit boundaries, concise summaries, and context-based implicit meanings. These are draft suggestions for your review.",
      judgment:
        "You decide whether each meaning unit is clear, whether the summary stays close to the participant’s account, and whether any implicit meaning is justified by the context."
    },
    categorizing: {
      meaning:
        "Categorizing involves comparing meaning units, grouping similar meanings, naming categories, and revising them as the analysis develops.",
      task:
        "Review category names, descriptions, linked meaning units, participant count, supporting quotes, and researcher notes.",
      ai:
        "I can help notice possible similarities across meaning units and suggest provisional category names. You can rename, merge, split, or reject any suggestion.",
      judgment:
        "You decide whether a category captures the shared meaning across meaning units, whether it needs to be revised, and how it should be named."
    },
    integrating: {
      meaning:
        "Integrating means moving beyond a list of categories. The aim is to depict the structure of your findings and develop a coherent summary narrative.",
      task:
        "Review the category relationship map, edit relationships, reorder categories, and confirm the summary narrative.",
      ai:
        "I can help sketch possible relationships among categories and draft a provisional summary narrative. You decide whether the structure is convincing and grounded in the data.",
      judgment:
        "You decide how categories relate to one another, what structure best represents your findings, and which claims are supported by the evidence."
    },
    integrity: {
      meaning:
        "Methodological integrity helps you review whether the analysis is transparent, coherent, credible, and respectful of participants.",
      task:
        "Review checklist items, address flagged issues, add researcher notes, and export the audit trail.",
      ai:
        "I can help flag places where the analysis may need more evidence, clearer context, or closer attention to contradictory cases. These flags are prompts for reflection, not final judgements.",
      judgment:
        "You decide how to address each issue, what needs revision, and how to make the analysis more transparent and credible."
    },
    export: {
      meaning:
        "Export preserves the analysis record and audit trail for review, supervision, and reporting.",
      task:
        "Export the research question, domains, expectations, relevance guideline, meaning units, summaries, categories, structure, narrative, checklist, and audit trail.",
      ai:
        "I can help package the current analysis record into export formats.",
      judgment:
        "Take a final look before using exported material in reports, publications, supervision, or teaching."
    }
  };
  return guidance[step];
}

function getGdiqrTips(step: WorkflowStep) {
  const tips: Record<WorkflowStep, string[]> = {
    "pre-analysis": [
      "Domains of investigation help organise the data, but they are not findings.",
      "Data preparation should preserve participants’ meaning and context.",
      "Judgement of relevance is guided by the research problem and research questions."
    ],
    understanding: [
      "Meaning units should be large enough to communicate a clear message and small enough to remain manageable.",
      "Summaries should stay close to the participant's account.",
      "Implicit meaning should clarify context-based meaning, not become speculation."
    ],
    categorizing: [
      "Categories are provisional and may be renamed, merged, divided, or reorganised.",
      "Categories emerge from meaning units.",
      "Domains are not findings; categories are analytic findings developed from the data."
    ],
    integrating: [
      "Integration shows how categories relate to one another.",
      "Summary narratives help readers understand the structure of the findings.",
      "Narrative claims should remain linked to category and meaning-unit evidence."
    ],
    integrity: [
      "The analytic process should be transparent and traceable.",
      "Coherence matters: findings should fit together while preserving complexity.",
      "Contradictory or negative cases should be considered rather than smoothed over."
    ],
    export: [
      "The analysis record should preserve decisions, evidence, and revisions.",
      "Audit trails support transparency and supervision.",
      "Exported material should be reviewed before use in reporting."
    ]
  };
  return tips[step];
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function RunLogPanel({
  logs,
  onClear
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
                    Started {new Date(log.startedAt).toLocaleTimeString()}
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
                      {new Date(event.timestamp).toLocaleTimeString()}
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

function formatMs(ms: number) {
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatRunStatus(status: RunLog["status"]) {
  return status === "failed"
    ? "Needs attention"
    : status === "completed"
      ? "Completed"
      : "Running";
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs: number }
) {
  const controller = new AbortController();
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), {
        once: true
      });
    }
  }
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (options.signal?.aborted) {
        throw new Error("Generation stopped by user.");
      }
      throw new Error(
        "Local AI request timed out in the browser. Check the live log panel to see whether the server is still processing chunks, or increase OLLAMA_API_TIMEOUT_MS / reduce TRANSCRIPT_MU_CHUNK_CHARS."
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function downloadFile(filename: string, content: string, type: string) {
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

function buildMeaningUnitCsv(units: MeaningUnit[]) {
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
      "uncertainty"
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
      unit.uncertainty ?? ""
    ])
  ];

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function SensitiveReviewCard({
  isActive,
  item,
  onApplyConsistent,
  onConfirm,
  onEdit,
  onFocus,
  onIgnore
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
        <button className="button" onClick={() => onConfirm(item)} type="button">
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

function SensitiveTranscriptPreview({
  activeItemId,
  items,
  onSelect,
  transcript
}: {
  activeItemId: string;
  items: SensitiveReviewItem[];
  onSelect: (item: SensitiveReviewItem) => void;
  transcript: string;
}) {
  if (!items.length) {
    return (
      <div className="transcript-highlight-preview">
        <p className="small">No detected placeholders in the current transcript.</p>
      </div>
    );
  }

  const sortedItems = [...items]
    .filter(
      (item) =>
        typeof item.startOffset === "number" &&
        typeof item.endOffset === "number"
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
        <span key={`${item.id}-text-before`}>{transcript.slice(cursor, start)}</span>
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
      </button>
    );
    cursor = end;
  });

  if (cursor < transcript.length) {
    parts.push(<span key="tail">{transcript.slice(cursor)}</span>);
  }

  return <div className="transcript-highlight-preview">{parts}</div>;
}

function riskClass(riskLevel: SensitiveRiskLevel) {
  return `risk-${riskLevel}`;
}

function formatBytes(bytes: number) {
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

function ModeButton({
  active,
  description,
  label,
  onClick
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

function ReviewerPanel({
  expandedIssueIds,
  isOpen,
  issues,
  isRunning,
  onAddMemo,
  onDismiss,
  onResolve,
  onRun,
  onToggle,
  onToggleIssue,
  onView,
  title
}: {
  expandedIssueIds: string[];
  isOpen: boolean;
  issues: ReviewerComment[];
  isRunning: boolean;
  onAddMemo: (issue: ReviewerComment) => void;
  onDismiss: (issue: ReviewerComment) => void;
  onResolve: (issue: ReviewerComment) => void;
  onRun: () => void;
  onToggle: () => void;
  onToggleIssue: (issueId: string) => void;
  onView: (issue: ReviewerComment) => void;
  title: string;
}) {
  const activeIssues = issues.filter((issue) => issue.status !== "dismissed");
  const warningCount = activeIssues.filter(
    (issue) => issue.severity === "warning"
  ).length;
  const majorCount = activeIssues.filter((issue) => issue.severity === "major")
    .length;
  const resolvedCount = issues.filter((issue) => issue.status === "resolved")
    .length;
  const dismissedCount = issues.filter((issue) => issue.status === "dismissed")
    .length;
  const groupedIssues = groupReviewerIssues(activeIssues);

  return (
    <aside className={`review-panel ${isOpen ? "" : "collapsed"}`}>
      <div className="category-header">
        <div>
          <span className="badge blue">Methodological Integrity Review</span>
          <h3>{title}</h3>
          <p className="small">{reviewSummaryText(issues, warningCount, majorCount)}</p>
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
              {isRunning ? "Reviewing..." : "Review methodological integrity"}
            </button>
            <span className="badge">
              {activeIssues.length} active · {resolvedCount} resolved
            </span>
            {dismissedCount > 0 && (
              <span className="badge blue">{dismissedCount} dismissed</span>
            )}
          </div>
          {issues.length === 0 ? (
            <EmptyState text="Integrity check not yet run. The system flags possible issues; the researcher decides how to address them." />
          ) : activeIssues.length === 0 ? (
            <EmptyState text="No active review issues. Dismissed and resolved items remain in the review trail." />
          ) : (
            Object.entries(groupedIssues).map(([group, groupIssues]) => (
              <div className="review-group" key={group}>
                <span className="label">{group}</span>
                {groupIssues.map((issue) => {
                  const expanded = expandedIssueIds.includes(issue.id);
                  return (
                    <article className="review-issue" key={issue.id}>
                      <button
                        className="review-issue-header"
                        onClick={() => onToggleIssue(issue.id)}
                        type="button"
                      >
                        <div>
                          <strong>{issue.issueType}</strong>
                          <p className="small">{issue.target}</p>
                        </div>
                        <StatusBadge label={issue.severity} />
                      </button>
                      {expanded && (
                        <div className="review-issue-body">
                          <p>{issue.comment}</p>
                          <p className="small">
                            <strong>Suggested action:</strong>{" "}
                            {issue.suggestedAction || "Researcher review needed."}
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
                              View target
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
                              Dismiss
                            </button>
                            <button
                              className="button"
                              onClick={() => onAddMemo(issue)}
                              type="button"
                            >
                              Add memo
                            </button>
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

function MeaningUnitReviewCard({
  onAccept,
  onEditExclusionReason,
  onEditExcerpt,
  onEditSummary,
  onExclude,
  onRestore,
  onReturnToTranscript,
  onSaveExcerpt,
  onSaveSummary,
  unit
}: {
  onAccept: (unitId: string) => void;
  onEditExclusionReason: (unitId: string, value: string) => void;
  onEditExcerpt: (unitId: string, value: string) => void;
  onEditSummary: (unitId: string, value: string) => void;
  onExclude: (unit: MeaningUnit) => void;
  onRestore: (unit: MeaningUnit) => void;
  onReturnToTranscript: (unit: MeaningUnit) => void;
  onSaveExcerpt: (unitId: string) => void;
  onSaveSummary: (unitId: string) => void;
  unit: MeaningUnit;
}) {
  const validationFlags = getMeaningUnitValidationFlags(unit);

  return (
    <article
      className={`summary-card ${unit.analysisExcluded ? "excluded-row" : ""}`}
      id={`mu-${unit.number}`}
    >
      <div className="category-header">
        <strong>MU #{unit.number}</strong>
        <StatusBadge label={unit.humanStatus} />
      </div>
      <p className="small">
        Source: {unit.caseId || "No case"} · {unit.segmentId || "No segment"} ·
        Speaker: {unit.speaker || "Unspecified"}
      </p>
      {validationFlags.length > 0 && (
        <div className="button-row">
          {validationFlags.map((flag) => (
            <span className={`badge ${flag.tone ?? ""}`.trim()} key={flag.label}>
              {flag.label}
            </span>
          ))}
        </div>
      )}
      <span className="label">AI draft excerpt</span>
      <p className="small">{unit.aiExcerpt ?? unit.excerpt}</p>
      <label className="label">
        Researcher-reviewed excerpt
        <textarea
          className="field"
          disabled={unit.analysisExcluded}
          onBlur={() => void onSaveExcerpt(unit.id)}
          onChange={(event) => onEditExcerpt(unit.id, event.target.value)}
          value={unit.excerpt}
        />
      </label>
      <span className="label">Suggested summary</span>
      <p className="small">{unit.aiSummary || "No draft yet."}</p>
      <label className="label">
        Researcher summary
        <textarea
          className="field"
          disabled={unit.analysisExcluded}
          onBlur={() => void onSaveSummary(unit.id)}
          onChange={(event) => onEditSummary(unit.id, event.target.value)}
          value={unit.humanSummary}
        />
      </label>
      <label className="label">
        Exclusion reason
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
          value={unit.exclusionReason ?? ""}
        />
      </label>
      <div className="button-row">
        {!unit.analysisExcluded && (
          <button
            className="button icon"
            onClick={() => onAccept(unit.id)}
            title="Accept meaning unit"
            type="button"
          >
            <Check size={18} />
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
          <button
            className="button"
            onClick={() => void onExclude(unit)}
            type="button"
          >
            Exclude
          </button>
        )}
        <button
          className="button icon"
          disabled={unit.analysisExcluded}
          onClick={() => onReturnToTranscript(unit)}
          title="Fix source transcript and redraft"
          type="button"
        >
          <Pencil size={18} />
        </button>
      </div>
    </article>
  );
}

function reviewSummaryText(
  issues: ReviewerComment[],
  warningCount: number,
  majorCount: number
) {
  if (issues.length === 0) {
    return "No integrity review yet";
  }
  if (majorCount === 0 && warningCount === 0) {
    return "No major concerns found";
  }
  return `${warningCount} point${warningCount === 1 ? "" : "s"} to consider, ${majorCount} major concern${majorCount === 1 ? "" : "s"}`;
}

function groupReviewerIssues(issues: ReviewerComment[]) {
  return issues.reduce<Record<string, ReviewerComment[]>>((groups, issue) => {
    const group = reviewerGroupLabel(issue.issueType);
    groups[group] = [...(groups[group] ?? []), issue];
    return groups;
  }, {});
}

function reviewerGroupLabel(issueType: string) {
  const normalized = issueType.toLowerCase();
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
  return "Rule compliance";
}

function CategoryBlock({
  categories,
  category,
  onAssignUnit,
  onConfirm,
  onDelete,
  onMerge,
  onReject,
  onRemoveUnit,
  onUpdate,
  units
}: {
  categories: CategoryNode[];
  category: CategoryNode;
  onAssignUnit: (unitNumber: number, categoryId: string) => void;
  onConfirm: (categoryId: string) => void;
  onDelete: (category: CategoryNode) => void;
  onMerge: (category: CategoryNode) => void;
  onReject: (category: CategoryNode) => void;
  onRemoveUnit: (categoryId: string, unitNumber: number) => void;
  onUpdate: (categoryId: string, updates: Partial<CategoryNode>) => void;
  units: MeaningUnit[];
}) {
  const isFallback = isFallbackCategory(category);
  const includedUnits = units.filter((unit) =>
    category.includedUnitIds.includes(unit.number)
  );
  const statusLabel = category.status
    ? formatCategoryStatus(category.status)
    : isFallback
      ? "Fallback draft"
      : "Suggested draft";
  return (
    <article
      className={`category ${isFallback ? "temporary-draft" : ""}`}
      id={`category-${category.id}`}
    >
      <div className="category-header">
        <div>
          <label className="label" htmlFor={`${category.id}-name`}>
            Category title
          </label>
          <input
            className="field category-title-input"
            id={`${category.id}-name`}
            onChange={(event) =>
              onUpdate(category.id, { name: event.target.value })
            }
            value={category.name}
          />
        </div>
        <div className="button-row">
          <StatusBadge label={statusLabel} />
          {isFallback && <span className="badge warning">Please review</span>}
          <span className="badge">
            Units {includedUnits.map((unit) => unit.number).join(", ") || "None"}
          </span>
        </div>
      </div>
      <div className="assigned-mu-list">
        <span className="label">Assigned Meaning Units</span>
        {includedUnits.length === 0 ? (
          <p className="small">No meaning units assigned yet.</p>
        ) : (
          <div className="assigned-mu-chips">
            {includedUnits.map((unit) => (
              <span className="assigned-mu-chip" key={unit.id}>
                MU {unit.number}
              </span>
            ))}
          </div>
        )}
      </div>
      <label className="label" htmlFor={`${category.id}-definition`}>
        Category description
      </label>
      <textarea
        className="textarea compact-textarea"
        id={`${category.id}-definition`}
        onChange={(event) =>
          onUpdate(category.id, { definition: event.target.value })
        }
        value={category.definition}
      />
      {category.rationale && (
        <p className="small">
          <strong>Draft rationale:</strong> {category.rationale}
        </p>
      )}
      {isFallback && (
        <p className="small">
          This category was created as a temporary fallback when the assistant
          could not draft a response. Please review and rename it before use.
        </p>
      )}
      <details className="evidence-panel" open>
        <summary>Review assigned meaning-unit evidence ({includedUnits.length} MU)</summary>
        {includedUnits.length === 0 ? (
          <EmptyState text="No meaning units assigned. Assign at least one MU before confirming this category." />
        ) : (
          <div className="evidence-list">
            {includedUnits.map((unit) => (
              <div className="evidence-item" key={unit.id}>
                <div>
                  <strong>MU #{unit.number}</strong>{" "}
                  <span className="badge blue">{unit.segmentId}</span>
                  <p className="small">{unit.humanSummary || unit.aiSummary}</p>
                  <p className="small">Evidence: {unit.excerpt}</p>
                </div>
                <div className="button-row">
                  <button
                    className="button"
                    onClick={() => onRemoveUnit(category.id, unit.number)}
                    type="button"
                  >
                    Remove from category
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
                          {item.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </details>
      <div className="button-row">
        <button
          className="button primary"
          onClick={() => onConfirm(category.id)}
          type="button"
        >
          Confirm category
        </button>
        <button className="button" onClick={() => onMerge(category)} type="button">
          Merge category
        </button>
        <button className="button" onClick={() => onReject(category)} type="button">
          Reject
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

function UnassignedMeaningUnits({
  categories,
  onAssign,
  onCreateCategory,
  units
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

function IntegrationDraftPanel({
  categories,
  integrationNote,
  integrationReviewed,
  narrative,
  onChangeNarrative,
  onConfirm,
  onNoteChange,
  units
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
    categories.some((category) => category.includedUnitIds.includes(unit.number))
  );
  return (
    <div className="mini-card soft">
      <div className="category-header">
        <div>
          <span className="label">Provisional summary of the category structure</span>
          <h3>Editable summary narrative</h3>
          <p className="small">
            This narrative should explain the relationships among categories.
            Treat it as a provisional summary of the category structure, not as
            the main analytic product.
          </p>
        </div>
        <StatusBadge
          label={integrationReviewed ? "Confirmed by researcher" : "Needs review"}
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
