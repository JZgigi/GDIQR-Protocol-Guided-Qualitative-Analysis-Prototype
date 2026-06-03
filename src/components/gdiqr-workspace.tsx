"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  Ban,
  Bot,
  Check,
  ChevronRight,
  Database,
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
import type { AutoSegmentMode } from "@/lib/auto-segmenter";
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

const steps: Array<{
  id: WorkflowStep;
  label: string;
  icon: typeof FolderKanban;
}> = [
  { id: "setup", label: "Project Setup", icon: Settings2 },
  { id: "upload", label: "Upload", icon: Upload },
  { id: "transcript", label: "Transcript", icon: FileText },
  { id: "segments", label: "Segments", icon: GitBranch },
  { id: "meaning-units", label: "Meaning Units", icon: Layers3 },
  { id: "categories", label: "Categories", icon: FolderKanban },
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
  const [activeStep, setActiveStep] = useState<WorkflowStep>("setup");
  const [currentProject, setCurrentProject] = useState(project);
  const [projectTitle, setProjectTitle] = useState(project.title);
  const [researchQuestion, setResearchQuestion] = useState(
    project.researchQuestion
  );
  const [studyDescription, setStudyDescription] = useState(
    project.studyDescription
  );
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
      const completed = new Set<WorkflowStep>(["setup"]);
      if (displayAudioFiles.length > 0) {
        completed.add("upload");
      }
      if (editableTranscript.trim()) {
        completed.add("transcript");
      }
      if (displaySegments.length > 0) {
        completed.add("segments");
      }
      if (units.length > 0) {
        completed.add("meaning-units");
      }
      if (displayCategories.length > 0) {
        completed.add("categories");
      }
      return completed;
    },
    [
      displayAudioFiles.length,
      displayCategories.length,
      displaySegments.length,
      editableTranscript,
      units.length
    ]
  );

  const selectedTitle = steps.find((step) => step.id === activeStep)?.label;
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
  const confirmedMeaningUnits = useMemo(
    () => units.filter((unit) => isConfirmedMeaningUnit(unit)),
    [units]
  );
  const unconfirmedMeaningUnits = useMemo(
    () => units.filter((unit) => !isConfirmedMeaningUnit(unit)),
    [units]
  );
  const excludedMeaningUnits = useMemo(
    () => units.filter((unit) => unit.analysisExcluded),
    [units]
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
  const canRunReviewer = units.length > 0;
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
  const unresolvedPrivacyMarkerCount =
    countUnresolvedPrivacyMarkers(editableTranscript);
  const dataSafetyItems = [
    {
      label: "Storage mode",
      value: isLocalOnlyMode ? "Local-only" : "Supabase-backed"
    },
    {
      label: "Cloud database writes",
      value: isLocalOnlyMode ? "Off for this session" : "Enabled"
    },
    {
      label: "Raw transcript retained",
      value: "No by default"
    },
    {
      label: "AI processing",
      value:
        aiProvider === "ollama"
          ? "Server-side local Ollama"
          : `Server-side ${aiProvider}`
    },
    {
      label: "Unresolved privacy markers",
      value: String(unresolvedPrivacyMarkerCount)
    },
    {
      label: "Transcript status",
      value: transcriptConfirmed ? "Confirmed for analysis" : transcriptStorageStatus
    }
  ];
  const generationTargetLabel =
    meaningUnitGenerationScope === "all"
      ? "all ready segments"
      : selectedMeaningUnitSegment?.segmentId ?? "Selected Segment";
  const selectedSegmentAlreadyHasUnits = Boolean(
    selectedMeaningUnitSegment &&
      units.some((unit) => unit.segmentId === selectedMeaningUnitSegment.segmentId)
  );
  const generationButtonLabel =
    meaningUnitGenerationScope === "all"
      ? "Generate MUs for all ready segments"
      : `${selectedSegmentAlreadyHasUnits ? "Regenerate" : "Generate"} MUs for ${selectedMeaningUnitSegment?.segmentId ?? "selected segment"}`;

  function applyWorkspace(workspace: WorkspaceData) {
    setCurrentProject(workspace.project);
    setProjectTitle(workspace.project.title);
    setResearchQuestion(workspace.project.researchQuestion);
    setStudyDescription(workspace.project.studyDescription);
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
      const localSegment = buildLocalTranscriptSegment({
        caseId: "CASE-001",
        segmentNumber: 1,
        text: transcriptForStorage
      });
      setDisplaySegments([localSegment]);
      setSelectedSegmentId(localSegment.id);
      setMeaningUnitSegmentId(localSegment.id);
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
      setApiStatus("Reviewed transcript confirmed locally. You can now review or split segments.");
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
      "Delete the current transcript, uploaded audio records, and all derived segments, meaning units, categories, reviewer comments, and review-trail records for this project? This cannot be undone."
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
      setApiStatus(
        status === "Ready for MU Analysis"
          ? "Segment marked ready locally. You can now run meaning-unit analysis for this segment."
          : "Segment saved locally. Existing MUs for this segment were cleared so regenerated analysis uses the edited text."
      );
      return;
    }

    setIsSavingSegment(true);
    setApiStatus("Saving segment changes...");

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
        setApiStatus(result.error ?? "Segment save failed.");
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
          ? "Segment marked ready. You can now run meaning-unit analysis for this segment."
          : "Segment saved."
      );
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Segment save failed.");
    } finally {
      setIsSavingSegment(false);
    }
  }

  async function runSegmentAction(
    action: "split" | "merge" | "move",
    direction?: "previous" | "next" | "up" | "down"
  ) {
    if (!selectedSegment) {
      setApiStatus("Select a segment first.");
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
        setApiStatus("Place the cursor where this segment should split, then try again.");
        return;
      }
    }

    setIsSavingSegment(true);
    setApiStatus(
      action === "split"
        ? "Splitting segment..."
        : action === "merge"
          ? "Merging segments..."
          : "Reordering segment..."
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
            setApiStatus("No adjacent segment is available to merge.");
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
            setApiStatus("Segment cannot move further in that direction.");
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
        setApiStatus("Segment list updated locally. Review boundaries before running meaning-unit analysis.");
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
        setApiStatus(result.error ?? result.reason ?? "Segment action failed.");
        return;
      }
      setDisplaySegments(result.segments);
      const selected =
        result.segments.find((segment) => segment.id === selectedSegment.id) ??
        result.segments[Math.max(0, selectedSegmentIndex)];
      setSelectedSegmentId(selected?.id ?? "");
      setApiStatus("Segment list updated. Review boundaries before running meaning-unit analysis.");
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Segment action failed.");
    } finally {
      setIsSavingSegment(false);
    }
  }

  function createSegmentFromSelection() {
    if (!selectedSegment) {
      setApiStatus("Select a segment first.");
      return;
    }

    const textarea = segmentTextAreaRef.current;
    const selectionStart = textarea?.selectionStart ?? 0;
    const selectionEnd = textarea?.selectionEnd ?? 0;
    if (selectionEnd <= selectionStart) {
      setApiStatus(
        "Select the text that should become its own segment, then click Create new segment from selection."
      );
      return;
    }

    const selectedText = segmentDraftText.slice(selectionStart, selectionEnd).trim();
    const beforeText = segmentDraftText.slice(0, selectionStart).trim();
    const afterText = segmentDraftText.slice(selectionEnd).trim();
    const remainingText = [beforeText, afterText].filter(Boolean).join("\n\n");
    if (!selectedText || !remainingText) {
      setApiStatus(
        "Selection split needs both selected text and remaining text in the current segment."
      );
      return;
    }

    const newTitle =
      window.prompt("Title for the new segment:", "New selected segment")?.trim() ||
      "New selected segment";
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
    setApiStatus(
      "Created a new segment from the selected text. Review both segment boundaries before meaning-unit analysis."
    );
  }

  async function deleteSelectedSegment() {
    if (!selectedSegment) {
      setApiStatus("Select a segment first.");
      return;
    }

    setIsSavingSegment(true);
    setApiStatus("Deleting segment...");

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
        setApiStatus("Segment deleted locally. Related meaning units and categories were cleared.");
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
        setApiStatus(result.error ?? "Segment delete failed.");
        return;
      }
      setDisplaySegments(result.segments);
      setSelectedSegmentId(result.segments[0]?.id ?? "");
      setApiStatus("Segment deleted.");
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Segment delete failed.");
    } finally {
      setIsSavingSegment(false);
    }
  }

  async function autoSplitTranscriptSegments() {
    if (!editableTranscript.trim()) {
      setApiStatus(
        "No transcript text found. Please confirm or edit the transcript before auto-splitting."
      );
      return;
    }
    if (!transcriptConfirmed) {
      setApiStatus("Confirm the transcript before auto-splitting segments.");
      return;
    }
    if (hasUnresolvedPrivacyMarkers(editableTranscript)) {
      setApiStatus(
        "Unresolved privacy review markers remain. Review or anonymise them before splitting and analysis."
      );
      return;
    }

    const confirmed = window.confirm(
      "Auto-splitting will replace the current segment list. Existing meaning units linked to these segments may need to be regenerated. Continue?"
    );
    if (!confirmed) {
      return;
    }

    setIsAutoSplittingTranscript(true);
    setApiStatus("Auto-splitting transcript into draft segments...");

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
          result.error ?? result.reason ?? "Auto-split transcript failed."
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
          `Created ${result.segments.length} draft segment${result.segments.length === 1 ? "" : "s"}. Auto-generated segments must be reviewed before analysis.`
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Auto-split transcript failed."
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
      setUnits((current) =>
        [
          ...current.filter((unit) => unit.segmentId !== segment.segmentId),
          ...newUnits
        ].sort((left, right) => left.number - right.number)
      );
      setDisplaySegments((current) =>
        current.map((item) =>
          item.id === segment.id ? { ...item, status: "Analysed" } : item
        )
      );
    }

    return result;
  }

  async function generateMeaningUnits(segmentOverride?: TranscriptSegment | null) {
    if (displaySegments.length === 0) {
      setApiStatus("Create and review segments before generating meaning units.");
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
          ? "No segments are ready. Mark at least one segment as Ready for MU Analysis first."
          : "Choose a segment and mark it as Ready for MU Analysis before generating meaning units."
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
        `Meaning units already exist for ${segmentsWithExistingUnits
          .map((segment) => segment.segmentId)
          .join(", ")}. Regenerating will replace only those segment-level draft MUs. Continue?`
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
        `${notReadySegment.segmentId} is not ready. Mark it as Ready for MU Analysis before running local AI.`
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
            ? `Generating meaning units for all segments... ${segment.segmentId} (${index + 1} of ${requestedSegments.length})`
            : `Generating meaning units for ${segment.segmentId}...`
        );
        await generateMeaningUnitsForSegment(segment, controller.signal);
      }
      if (!controller.signal.aborted) {
        setApiStatus(
          requestedSegments.length > 1
            ? `Meaning-unit generation completed for ${requestedSegments.length} segment${requestedSegments.length === 1 ? "" : "s"}.`
            : `Meaning-unit generation completed for ${requestedSegments[0].segmentId}.`
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

  async function runCategories(options: { allowFallbackRegenerate?: boolean } = {}) {
    if (confirmedMeaningUnits.length === 0) {
      setApiStatus(
        "Accept or edit meaning-unit summaries before creating categories. Categories only use confirmed summaries."
      );
      return;
    }
    if (mode === "B" && displayCategories.length === 0) {
      setApiStatus("Run Mode A first. Mode B refines an existing category system.");
      return;
    }
    if (
      (mode === "B" || mode === "C") &&
      hasTemporaryFallbackCategories &&
      !options.allowFallbackRegenerate
    ) {
      setApiStatus(
        "This category set is a fallback draft. Regenerate it or use it as an editable starting point before running Mode B/C."
      );
      return;
    }
    if (mode === "C") {
      if (displayCategories.length === 0) {
        setApiStatus("Run Mode A and Mode B before final Mode C integration.");
        return;
      }
      if (!allSegmentsProcessedForModeC) {
        setApiStatus(
          "Confirm that all segments in this transcript have been processed and reviewed before running Mode C."
        );
        return;
      }
    }

    setIsRunningCategories(true);
    setApiStatus(`Running category construction Mode ${mode}. This may take a few minutes.`);

    try {
      const response = await fetchWithTimeout("/api/ai/categories", {
        body: JSON.stringify({
          mode,
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
        setApiStatus(errorResult.error ?? `Category API Mode ${mode} failed`);
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
          ? "AI returned empty output. A fallback draft was created only to keep the workflow testable. Regenerate it or use it as an editable starting point; do not treat it as final analysis."
          : warning
      );
      setApiStatus(
        `${warning ? `${warning} ` : ""}Category API Mode ${mode} applied from ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`
      );
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : `Category API Mode ${mode} failed`
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
      setApiStatus("Generate meaning units before running reviewer checks.");
      return;
    }
    if (reviewerWorkspace === "categories" && displayCategories.length === 0) {
      setApiStatus("Create categories before running the category review.");
      return;
    }

    setIsRunningReviewer(true);
    setApiStatus(
      reviewerWorkspace === "categories"
        ? "Running category reviewer check..."
        : "Running meaning-unit reviewer check..."
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
        setApiStatus(errorResult.error ?? "Reviewer API failed");
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
        `Reviewer check applied from ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`
      );
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Reviewer API failed");
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
      setApiStatus("Reviewer issue updated locally.");
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
      setApiStatus(result.error ?? "Reviewer issue update failed.");
      return;
    }
    setReviewerOutputs((current) =>
      current.map((comment) =>
        comment.id === result.comment?.id ? result.comment : comment
      )
    );
    setApiStatus("Reviewer issue updated.");
  }

  function viewReviewerTarget(comment: ReviewerComment) {
    const targetId =
      comment.targetType === "category" || comment.targetType === "subcategory"
        ? `category-${comment.targetId}`
        : comment.targetType === "integrated_narrative"
          ? "integrated-narrative"
          : comment.targetId.replace(/^MU/i, "mu-");
    const step =
      comment.workspace === "categories" ? "categories" : "meaning-units";
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

  function updateHumanSummary(unitId: string, value: string) {
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId
          ? { ...unit, humanSummary: value, humanStatus: "Edited" }
          : unit
      )
    );
  }

  async function saveMeaningUnitHumanSummary(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    if (!unit) {
      return;
    }

    if (isLocalOnlyMode) {
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
    const includableUnits = units.filter((unit) => !unit.analysisExcluded);
    if (includableUnits.length === 0) {
      setApiStatus("Generate meaning units before accepting summaries.");
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
                  humanStatus: "Accepted",
                  humanSummary: unit.humanSummary || unit.aiSummary
                }
          )
        );
        setApiStatus(
          "Meaning-unit summaries accepted locally. You can now run category Mode A/B/C."
        );
        return;
      }

      const results = await Promise.all(
        includableUnits.map(async (unit) => {
          const response = await fetch(`/api/meaning-units/${unit.id}`, {
            body: JSON.stringify({
              humanStatus: "Accepted",
              humanSummary: unit.humanSummary || unit.aiSummary
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
        "Meaning-unit summaries accepted. You can now run category Mode A/B/C."
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

  async function setMeaningUnitExcluded(unit: MeaningUnit, excluded: boolean) {
    const reason = excluded
      ? window.prompt(
          "Why should this MU be excluded from analysis?",
          unit.speaker === "Interviewer"
            ? "Interviewer opening/question, not participant experience"
            : "Not relevant for this GDI-QR-informed workflow"
        )
      : null;
    if (excluded && reason === null) {
      return;
    }

    setUnits((current) =>
      current.map((item) =>
        item.id === unit.id
          ? {
              ...item,
              analysisExcluded: excluded,
              exclusionReason: excluded ? reason || "Excluded from analysis" : undefined,
              humanStatus: excluded ? "Excluded" : "Needs review"
            }
          : item
      )
    );
    setDisplayCategories([]);
    setNarrative("");
    setCategoryDraftNotice("");
    setCategoryDraftIsFallback(false);
    setApiStatus(excluded ? "Excluding meaning unit..." : "Restoring meaning unit...");

    if (isLocalOnlyMode) {
      setApiStatus(
        excluded
          ? "Meaning unit excluded locally. Existing categories were cleared; rerun categories when ready."
          : "Meaning unit restored locally. Review and accept it before categories."
      );
      return;
    }

    const response = await fetch(`/api/meaning-units/${unit.id}`, {
      body: JSON.stringify({
        analysisExcluded: excluded,
        exclusionReason: excluded ? reason || "Excluded from analysis" : null
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
      excluded
        ? "Meaning unit excluded from category analysis. Existing categories were cleared; rerun categories when ready."
        : "Meaning unit restored for analysis. Review and accept it before categories."
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
    setActiveStep("transcript");
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
    setActiveStep("transcript");
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
        buildMeaningUnitCsv(units),
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
        "This export may contain AI-drafted material. Review all outputs against transcript evidence before use.",
      project: currentProject,
      transcript: editableTranscript,
      segments: displaySegments,
      audioFiles: displayAudioFiles,
      transcriptionJobs: displayTranscriptionJobs,
      meaningUnits: units,
      categories: displayCategories,
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
      "Note: AI-drafted outputs require researcher review against transcript evidence before use.",
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
      "Reviewer Comments",
      reviewerText || "No reviewer comments yet.",
      "",
      "Integration Draft",
      narrative || "No integration draft yet."
    ].join("\n");
  }

  async function markAccepted(unitId: string) {
    const unit = units.find((item) => item.id === unitId);
    setUnits((current) =>
      current.map((unit) =>
        unit.id === unitId ? { ...unit, humanStatus: "Accepted" } : unit
      )
    );
    setApiStatus("Saving meaning-unit decision...");

    if (isLocalOnlyMode) {
      setApiStatus("Meaning-unit decision saved locally.");
      return;
    }

    const response = await fetch(`/api/meaning-units/${unitId}`, {
      body: JSON.stringify({
        humanStatus: "Accepted",
        humanSummary: unit?.humanSummary
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
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label={PRODUCT_TITLE}>
          <div className="brand-mark">G</div>
          <div>
            <h1 className="brand-title">{PRODUCT_SHORT_TITLE}</h1>
            <p className="brand-subtitle">
              Researcher-led qualitative analysis support
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="badge blue">AI provider: {aiProvider}</span>
          <span className="badge">
            Data:{" "}
            {isLocalOnlyMode
              ? "Local-only"
              : apiDataSource === "supabase"
                ? "Supabase"
                : "Not configured"}
          </span>
          <button
            className="button soft"
            onClick={refreshWorkspace}
            type="button"
            title="Reload workspace data"
          >
            <RefreshCcw size={18} />
            Refresh API
          </button>
          <button
            className="button soft"
            disabled={!canGenerateMeaningUnits || isGeneratingMeaningUnits}
            onClick={() => void generateMeaningUnits()}
            type="button"
            title={
              transcriptConfirmed
                ? `Create AI-drafted outputs for ${generationTargetLabel}`
                : "Confirm the transcript before requesting AI draft support"
            }
          >
            <Bot size={18} />
            {isGeneratingMeaningUnits
              ? "Drafting..."
              : transcriptConfirmed
                ? "Run draft support"
                : "Confirm transcript first"}
          </button>
          <button
            className="button primary"
            disabled={!canExport}
            onClick={() => exportWorkspace("json")}
            type="button"
            title="Download JSON export"
          >
            <Download size={18} />
            Export JSON
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Workflow navigation">
          <div className="progress-strip" aria-label="Workflow progress">
            {steps.map((step) => (
              <span
                className={`progress-cell ${
                  completedSteps.has(step.id) ? "complete" : ""
                }`}
                key={step.id}
              />
            ))}
          </div>
          <div style={{ height: 12 }} />
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <button
                className={`nav-button ${
                  activeStep === step.id ? "active" : ""
                } ${completedSteps.has(step.id) ? "complete" : ""}`}
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                type="button"
              >
                <Icon size={18} />
                <span className="nav-label">{step.label}</span>
                <span className="nav-status" />
              </button>
            );
          })}
        </aside>

        <main className="main">
          {isLocalOnlyMode && (
            <div className="local-mode-banner">
              <div>
                <strong>Local-only prototype mode</strong>
                <p className="small">
                  Transcript drafts, segments, meaning units, categories, and
                  reviewer notes stay in this browser session unless you export
                  JSON. Supabase writes and audio upload storage are disabled in
                  this mode.
                </p>
              </div>
              <span className="badge blue">Raw transcript retained: No</span>
            </div>
          )}
          <section className="section">
            <div className="section-header">
              <div>
                <span className="badge">Current view</span>
                <h2 className="section-title">{selectedTitle}</h2>
                <p className="section-copy">
                  {getStepCopy(activeStep)}
                </p>
                <p className="small">{apiStatus}</p>
              </div>
              <button
                className="button"
                onClick={() => {
                  const currentIndex = steps.findIndex(
                    (step) => step.id === activeStep
                  );
                  setActiveStep(steps[(currentIndex + 1) % steps.length].id);
                }}
                type="button"
                title="Go to next workflow step"
              >
                <ChevronRight size={18} />
                Next
              </button>
            </div>

            {activeStep === "setup" && (
              <div className="section-body grid">
                <div className="grid">
                  <div>
                    <label className="label" htmlFor="project-title">
                      Project title
                    </label>
                    <input
                      className="field"
                      id="project-title"
                      onChange={(event) => setProjectTitle(event.target.value)}
                      value={projectTitle}
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="research-question">
                    Research question
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
                    Study description
                  </label>
                  <textarea
                    className="textarea"
                    id="study-description"
                    onChange={(event) => setStudyDescription(event.target.value)}
                    value={studyDescription}
                  />
                </div>
                <div className="grid three">
                  <div className="mini-card soft">
                    <label className="label" htmlFor="project-language">
                      Interview language
                    </label>
                    <select
                      className="select"
                      id="project-language"
                      onChange={(event) =>
                        setProjectLanguage(
                          event.target.value === "Chinese"
                            ? "Chinese"
                            : "English"
                        )
                      }
                      value={projectLanguage}
                    >
                      <option value="English">English</option>
                      <option value="Chinese">Chinese</option>
                    </select>
                  </div>
                  <div className="mini-card soft">
                    <span className="label">Methodological frame</span>
                    <strong>{METHODOLOGICAL_FRAME}</strong>
                    <p className="small">
                      AI outputs are draft material for researcher review, not
                      final analysis.
                    </p>
                  </div>
                  <div className="mini-card soft">
                    <span className="label">Light interpretation</span>
                    <button
                      className={`button ${
                        lightInterpretation ? "primary" : ""
                      }`}
                      onClick={() => toggleLightInterpretation()}
                      type="button"
                    >
                      <Pencil size={16} />
                      {lightInterpretation ? "On" : "Off"}
                    </button>
                  </div>
                  <div className="mini-card soft">
                    <span className="label">Setup action</span>
                    <button
                      className="button primary"
                      disabled={isSavingProject}
                      onClick={saveProjectSetup}
                      type="button"
                    >
                      <Archive size={16} />
                      {isSavingProject ? "Saving..." : "Save setup"}
                    </button>
                    {projectSetupSavedAt && (
                      <p className="small">
                        {isLocalOnlyMode ? "Saved locally" : "Saved"} at{" "}
                        {new Date(projectSetupSavedAt).toLocaleTimeString()}.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeStep === "upload" && (
              <div className="section-body grid">
                <div className="mini-card soft">
                  <span className="label">Before you upload</span>
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
                    In local-only sharing mode, audio upload is disabled; use a
                    short anonymised transcript or test text.
                  </p>
                  {/* TODO: Consider an enforced ethics acknowledgement for non-demo deployments. */}
                </div>
                <div className="upload-panel">
                  <div className="upload-dropzone">
                    <FileAudio size={32} />
                    <h3>Upload interview audio</h3>
                    <p className="small">
                      Supported audio: MP3, M4A, WAV, MP4, WebM, OGG, AAC.
                      {isLocalOnlyMode
                        ? " Audio upload is disabled in local-only sharing mode because raw audio should not be stored before review."
                        : " Your file is stored privately, transcribed locally, then shown for researcher review before any AI-drafted outputs are created."}
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
                          ? "Audio disabled in local-only mode"
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
                  <div className="mini-card upload-summary">
                    <Database size={28} />
                    <h3>Storage target</h3>
                    <p className="small">
                      Each new audio upload or transcript import becomes the
                      active working transcript. Review and confirm it before
                      generating meaning units.
                    </p>
                    <span className="badge blue">
                      {isLocalOnlyMode
                        ? "Local-only session"
                        : apiDataSource === "supabase"
                        ? "Supabase connected"
                        : "Supabase not connected"}
                    </span>
                    <div className="data-safety-grid">
                      {dataSafetyItems.map((item) => (
                        <div className="data-safety-item" key={item.label}>
                          <span className="label">{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    {latestAudioFile && (
                      <div className="upload-status">
                        <span className="label">Latest audio</span>
                        <strong>{latestAudioFile.originalFilename}</strong>
                        <p className="small">
                          {latestAudioFile.language} ·{" "}
                          {formatBytes(latestAudioFile.sizeBytes)}
                        </p>
                      </div>
                    )}
                    {latestTranscriptionJob && (
                      <div className="upload-status">
                        <span className="label">Latest transcription job</span>
                        <StatusBadge label={latestTranscriptionJob.status} />
                        {latestTranscriptionJob.errorMessage && (
                          <p className="small">
                            {latestTranscriptionJob.errorMessage}
                          </p>
                        )}
                      </div>
                    )}
                    {audioPreviewUrl && (
                      <audio
                        className="audio-player"
                        controls
                        src={audioPreviewUrl}
                      />
                    )}
                    {!latestAudioFile && (
                      <EmptyState text="No audio uploaded yet. Choose a file to start your first real test." />
                    )}
                  </div>
                </div>
                <div className="transcript-import-panel">
                  <div>
                    <FileText size={28} />
                    <h3>Import existing transcript</h3>
                    <p className="small">
                      Supported transcript files: TXT, MD, VTT, SRT, DOCX, and
                      PDF. You can also paste text below. The app will prepare
                      the text, then ask you to review it before any AI-drafted
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
                <div className="mini-card">
                  <span className="label">Project interviews/documents</span>
                  <h3>Current project data</h3>
                  <p className="small">
                    This prototype keeps one active working transcript at a
                    time. The Supabase hierarchy migration prepares the app for
                    preserving multiple interview analyses in one project.
                  </p>
                  <div className="grid three">
                    <p className="small">
                      <strong>Stored uploads:</strong>{" "}
                      {displayAudioFiles.length}
                    </p>
                    <p className="small">
                      <strong>Segments:</strong> {displaySegments.length} total,{" "}
                      {
                        displaySegments.filter(
                          (segment) =>
                            segment.status === "Analysed" ||
                            segment.status === "Completed"
                        ).length
                      }{" "}
                      analysed
                    </p>
                    <p className="small">
                      <strong>Confirmed MUs:</strong>{" "}
                      {confirmedMeaningUnits.length}
                    </p>
                  </div>
                  {displayAudioFiles.length === 0 ? (
                    <EmptyState text="No interview uploads yet. Audio uploads and transcript imports will appear in the workflow once they become the active transcript." />
                  ) : (
                    <div className="table-wrap">
                      <table className="table compact-table">
                        <thead>
                          <tr>
                            <th>File</th>
                            <th>Language</th>
                            <th>Size</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayAudioFiles.map((file) => (
                            <tr key={file.id}>
                              <td>{file.originalFilename}</td>
                              <td>{file.language}</td>
                              <td>{formatBytes(file.sizeBytes)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeStep === "transcript" && (
              <div className="section-body grid">
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
                        Before continuing, confirm that every turn is assigned
                        to the correct speaker. Questions and prompts should be
                        labelled Interviewer; interviewee experiences should be
                        labelled Participant. Also correct any missing words,
                        recognition errors, or privacy markers such as
                        {" [[PRIVACY_REVIEW:PERSON:Sam]]"}. Mistakes here will
                        carry into the meaning units and category drafts.
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
                  <div className="button-row">
                    <span className="badge blue">{transcriptStorageStatus}</span>
                    <span className="badge">Raw transcript retained: No</span>
                  </div>
                  {sensitiveReviewItems.length > 0 && (
                    <div className="privacy-review-list">
                      <div className="category-header">
                        <div>
                          <span className="label">Sensitive information review</span>
                          <p className="small">
                            Review each detected placeholder before analysis.
                            High-risk items must be confirmed, edited, or marked
                            as false positives unless you explicitly override.
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
                {audioPreviewUrl && (
                  <audio className="audio-player" controls src={audioPreviewUrl} />
                )}
              </div>
            )}

            {activeStep === "segments" && (
              <div className="section-body grid">
                <div className="mini-card soft">
                  <span className="label">Segment Manager</span>
                  <p className="small">
                    Auto-generated segments are draft processing chunks, not
                    meaning units. Review and adjust boundaries before analysis.
                    Only segments marked "Ready for MU Analysis" can be used for
                    meaning unit generation. You can generate meaning units from
                    one selected segment, or batch-generate them for all ready
                    segments later.
                  </p>
                  <p className="small">
                    Ready segments are processed one by one, even when using
                    "Generate MUs for all ready segments", to keep outputs
                    traceable to transcript evidence.
                  </p>
                  <div className="upload-controls">
                    <label className="label" htmlFor="segment-split-mode">
                      Segmentation mode
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
                        Conservative — fewer, larger segments
                      </option>
                      <option value="balanced">
                        Balanced — topic-based, recommended
                      </option>
                      <option value="detailed">
                        Detailed — more granular topic/question shifts
                      </option>
                    </select>
                  </div>
                  <p className="small">
                    If the auto-split result is too broad, use Split segment
                    here, Create new segment from selection, or rerun with
                    Detailed mode.
                  </p>
                  <div className="button-row">
                    <button
                      className="button primary"
                      disabled={
                        isAutoSplittingTranscript ||
                        !editableTranscript.trim() ||
                        !transcriptConfirmed
                      }
                      onClick={() => void autoSplitTranscriptSegments()}
                      title={
                        transcriptConfirmed
                          ? "Create draft segments from the confirmed transcript"
                          : "Confirm the transcript before auto-splitting"
                      }
                      type="button"
                    >
                      <GitBranch size={18} />
                      {isAutoSplittingTranscript
                        ? "Auto-splitting..."
                        : "Auto-split transcript"}
                    </button>
                    <span className="badge warning">
                      Auto-generated segments must be reviewed before analysis.
                    </span>
                  </div>
                </div>
                {displaySegments.length === 0 && (
                  <EmptyState text="No segments yet. Upload and transcribe audio first; the app will create the first working segment from the transcript." />
                )}
                {selectedSegment && (
                  <div className="segment-manager">
                    <aside className="segment-list">
                      {displaySegments.map((segment) => (
                        <button
                          className={`segment-list-item ${
                            segment.id === selectedSegment.id ? "active" : ""
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
                            <p className="small">
                              {approximateWordCount(segment.text)} words
                            </p>
                          </div>
                          <StatusBadge label={segment.status} />
                        </button>
                      ))}
                    </aside>
                    <div className="segment-detail">
                      <div className="grid two">
                        <div className="mini-card soft">
                          <span className="label">Context</span>
                          <ContextPreview
                            current={selectedSegment}
                            next={nextSegment}
                            previous={previousSegment}
                          />
                        </div>
                        <div className="mini-card">
                          <div className="category-header">
                            <div>
                              <span className="badge">{selectedSegment.caseId}</span>
                              <h3>{selectedSegment.segmentId}</h3>
                            </div>
                            <StatusBadge label={selectedSegment.status} />
                          </div>
                          <div className="grid two">
                            <label className="label">
                              Segment title
                              <input
                                className="field"
                                onChange={(event) =>
                                  setSegmentDraftTitle(event.target.value)
                                }
                                value={segmentDraftTitle}
                              />
                            </label>
                            <label className="label">
                              Status
                              <select
                                className="field"
                                onChange={(event) =>
                                  void saveSelectedSegment(
                                    event.target.value as SegmentStatus
                                  )
                                }
                                value={selectedSegment.status}
                              >
                                {segmentStatuses.map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <p className="small">
                            Starting MU #{selectedSegment.startingMuNumber} ·{" "}
                            {selectedSegment.startTimestamp} to{" "}
                            {selectedSegment.endTimestamp} ·{" "}
                            {approximateWordCount(selectedSegment.text)} words
                          </p>
                          <label className="label" htmlFor="segment-editor">
                            Editable segment text
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
                              className="button primary"
                              disabled={isSavingSegment}
                              onClick={() => void saveSelectedSegment()}
                              type="button"
                            >
                              Save segment
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
                              disabled={
                                isGeneratingMeaningUnits ||
                                !canRunMeaningUnitsForSegment(selectedSegment)
                              }
                              onClick={() => void generateMeaningUnits(selectedSegment)}
                              type="button"
                              title="Create draft meaning units for this ready segment only"
                            >
                              <Bot size={18} />
                              Generate MUs for this segment
                            </button>
                          </div>
                          <div className="button-row">
                            <button
                              className="button"
                              disabled={isSavingSegment}
                              onClick={() => void runSegmentAction("split")}
                              type="button"
                            >
                              Split segment here
                            </button>
                            <button
                              className="button"
                              disabled={isSavingSegment}
                              onClick={createSegmentFromSelection}
                              type="button"
                              title="Select text in the segment editor first"
                            >
                              Create new segment from selection
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
                            <button
                              className="button"
                              disabled={isSavingSegment || !previousSegment}
                              onClick={() => void runSegmentAction("move", "up")}
                              type="button"
                            >
                              Move up
                            </button>
                            <button
                              className="button"
                              disabled={isSavingSegment || !nextSegment}
                              onClick={() => void runSegmentAction("move", "down")}
                              type="button"
                            >
                              Move down
                            </button>
                            <button
                              className="button danger"
                              disabled={isSavingSegment}
                              onClick={() => void deleteSelectedSegment()}
                              type="button"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeStep === "meaning-units" && (
              <div className="section-body">
                <div className="review-layout">
                  <div className="grid">
                <div className="mini-card soft">
                  <span className="label">Before categorising</span>
                  <p className="small">
                    Check that each excerpt represents the Participant's
                    experience, not the Interviewer's question. Edit summaries
                    directly when they are close. If the excerpt or speaker is
                    wrong, use Fix transcript: correct the transcript,
                    confirm it again, and regenerate meaning units so later
                    category work is based on the right text.
                  </p>
                </div>
                <div className="mini-card soft">
                  <span className="label">Meaning Units Generation Scope</span>
                  <div className="scope-options">
                    <label className="scope-option">
                      <input
                        checked={meaningUnitGenerationScope === "all"}
                        disabled={isGeneratingMeaningUnits}
                        name="mu-generation-scope"
                        onChange={() => setMeaningUnitGenerationScope("all")}
                        type="radio"
                      />
                      <span>All segments</span>
                    </label>
                    <label className="scope-option">
                      <input
                        checked={meaningUnitGenerationScope === "selected"}
                        disabled={isGeneratingMeaningUnits}
                        name="mu-generation-scope"
                        onChange={() => setMeaningUnitGenerationScope("selected")}
                        type="radio"
                      />
                      <span>Selected segment only</span>
                    </label>
                  </div>
                  <div className="upload-controls">
                    <label className="label" htmlFor="mu-segment-select">
                      Segment
                    </label>
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
                          {segment.segmentId} — {segment.topicLabel} ({segment.status})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="small">
                    Generate meaning units from one selected ready segment, or
                    from all segments marked "Ready for MU Analysis". The system
                    processes ready segments one at a time to keep outputs
                    traceable to transcript evidence and reduce
                    over-interpretation risk.
                  </p>
                  {generationProgress && (
                    <p className="small">
                      {generationProgress.total > 1
                        ? `Generating meaning units for all segments... ${generationProgress.label ?? ""} (${generationProgress.current} of ${generationProgress.total})`
                        : `Generating meaning units for ${generationProgress.label ?? generationTargetLabel}...`}
                    </p>
                  )}
                </div>
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={!canGenerateMeaningUnits || isGeneratingMeaningUnits}
                    onClick={() => void generateMeaningUnits()}
                    type="button"
                    title={
                      transcriptConfirmed
                        ? `Generate draft meaning units for ${generationTargetLabel}`
                        : "Confirm the transcript before generating meaning units"
                    }
                  >
                    <Bot size={18} />
                    {isGeneratingMeaningUnits
                      ? "Generating MUs..."
                      : transcriptConfirmed
                        ? generationButtonLabel
                        : "Confirm transcript first"}
                  </button>
                  <button
                    className="button soft"
                    disabled={units.length === 0 || isAcceptingMeaningUnits}
                    onClick={() => void acceptAllReviewedMeaningUnits()}
                    title="After reviewing the generated summaries, accept them so categories can use them."
                    type="button"
                  >
                    <Check size={18} />
                    {isAcceptingMeaningUnits
                      ? "Saving accepted MUs..."
                      : "Accept all reviewed summaries"}
                  </button>
                  {isGeneratingMeaningUnits && (
                    <button
                      className="button danger"
                      onClick={stopMeaningUnitGeneration}
                      type="button"
                    >
                      Stop generation
                    </button>
                  )}
                  <button
                    className="button"
                    disabled={!canRunReviewer || isRunningReviewer}
                    onClick={() => void runReviewer("meaning-units")}
                    type="button"
                  >
                    <ShieldCheck size={18} />
                    Run reviewer check
                  </button>
                  <button
                    className={`button ${lightInterpretation ? "primary" : ""}`}
                    disabled={isGeneratingMeaningUnits}
                    onClick={() => toggleLightInterpretation()}
                    title="Toggle whether new MU drafts may include cautious tentative interpretation"
                    type="button"
                  >
                    <Pencil size={18} />
                    Light interpretation: {lightInterpretation ? "ON" : "OFF"}
                  </button>
                </div>
                {units.length === 0 ? (
                  <EmptyState
                    text={
                      transcriptConfirmed
                        ? "No meaning units yet. Generate draft MUs from one ready segment or all ready segments."
                        : "No meaning units yet. Confirm the transcript, review segment boundaries, mark a segment ready, then generate draft MUs."
                    }
                  />
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>MU</th>
                          <th>Speaker</th>
                          <th>Excerpt</th>
                          <th>AI summary</th>
                          <th>Human summary</th>
                          <th>Status</th>
                          <th>Review</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {units.map((unit) => (
                          <tr
                            className={unit.analysisExcluded ? "excluded-row" : ""}
                            id={`mu-${unit.number}`}
                            key={unit.id}
                          >
                            <td className="mono">#{unit.number}</td>
                            <td>
                              <select
                                className="select compact"
                                disabled={unit.analysisExcluded}
                                onChange={(event) =>
                                  void updateMeaningUnitSpeaker(
                                    unit.id,
                                    event.target.value
                                  )
                                }
                                value={unit.speaker}
                              >
                                <option value="Participant">Participant</option>
                                <option value="Interviewer">Interviewer</option>
                                <option value="Unknown">Unknown</option>
                              </select>
                            </td>
                            <td>
                              {unit.excerpt}
                              {unit.analysisExcluded && (
                                <p className="small">
                                  Excluded:{" "}
                                  {unit.exclusionReason ||
                                    "Not used for category analysis"}
                                </p>
                              )}
                            </td>
                            <td>{unit.aiSummary}</td>
                            <td>
                              <textarea
                                className="field"
                                disabled={unit.analysisExcluded}
                                onBlur={() =>
                                  void saveMeaningUnitHumanSummary(unit.id)
                                }
                                onChange={(event) =>
                                  updateHumanSummary(unit.id, event.target.value)
                                }
                                value={unit.humanSummary}
                              />
                              {unit.uncertainty && (
                                <p className="small">{unit.uncertainty}</p>
                              )}
                            </td>
                            <td>
                              <StatusBadge label={unit.humanStatus} />
                            </td>
                            <td>
                              <StatusBadge label={unit.reviewerStatus} />
                            </td>
                            <td>
                              <div className="button-row">
                                {!unit.analysisExcluded && (
                                  <button
                                    className="button icon"
                                    onClick={() => markAccepted(unit.id)}
                                    title="Accept meaning unit"
                                    type="button"
                                  >
                                    <Check size={18} />
                                  </button>
                                )}
                                <button
                                  className="button icon"
                                  disabled={unit.analysisExcluded}
                                  onClick={() => returnToTranscriptForUnit(unit)}
                                  title="Fix source transcript and regenerate"
                                  type="button"
                                >
                                  <Pencil size={18} />
                                </button>
                                <button
                                  className="button icon"
                                  onClick={() =>
                                    void setMeaningUnitExcluded(
                                      unit,
                                      !unit.analysisExcluded
                                    )
                                  }
                                  title={
                                    unit.analysisExcluded
                                      ? "Restore MU to analysis"
                                      : "Exclude MU from category analysis"
                                  }
                                  type="button"
                                >
                                  <Ban size={18} />
                                </button>
                                <button
                                  className="button icon danger"
                                  onClick={() =>
                                    void deleteMeaningUnitFromWorkspace(unit)
                                  }
                                  title="Delete meaning unit"
                                  type="button"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                  </div>
                  <ReviewerPanel
                    expandedIssueIds={expandedReviewIssueIds}
                    isOpen={muReviewOpen}
                    issues={meaningUnitReviewIssues}
                    isRunning={isRunningReviewer}
                    onAddMemo={(issue) => {
                      const memo = window.prompt(
                        "Researcher memo for this reviewer issue:",
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
                </div>
              </div>
            )}

            {activeStep === "categories" && (
              <div className="section-body">
                <div className="review-layout">
                  <div className="grid">
                <div className="mini-card soft">
                  <span className="label">Category readiness</span>
                  <p className="small">
                    Category-level drafts use only accepted or edited
                    meaning-unit summaries. Review each meaning unit (MU) first
                    so category drafting is based on researcher-confirmed
                    participant meaning rather than raw transcript text.
                  </p>
                  <p className="small">
                    Mode B generates provisional analytic groupings that must be
                    reviewed, renamed, merged, edited, or rejected by the
                    researcher. Mode C creates an editable integration aid, not
                    a final report.
                  </p>
                  <div className="button-row">
                    <span
                      className={`badge ${
                        confirmedMeaningUnits.length > 0 ? "" : "warning"
                      }`}
                    >
                      Confirmed summaries: {confirmedMeaningUnits.length} /{" "}
                      {units.length - excludedMeaningUnits.length}
                    </span>
                    {excludedMeaningUnits.length > 0 && (
                      <span className="badge warning">
                        Excluded MUs: {excludedMeaningUnits.length}
                      </span>
                    )}
                    {units.length > 0 && confirmedMeaningUnits.length === 0 && (
                      <button
                        className="button soft"
                        onClick={() => setActiveStep("meaning-units")}
                        type="button"
                      >
                        Review and accept MUs first
                      </button>
                    )}
                    {hasFallbackCategoryLabels && (
                      <span className="badge warning">
                        Fallback draft present
                      </span>
                    )}
                    {displayCategories.length > 0 && (
                      <span className="badge blue">
                        Confirmed categories: {confirmedCategoryCount} /{" "}
                        {displayCategories.filter((item) => item.status !== "rejected").length}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mode-selector">
                  <ModeButton
                    active={mode === "A"}
                    description="Initial category-level drafting"
                    label="Mode A"
                    onClick={() => setMode("A")}
                  />
                  <ModeButton
                    active={mode === "B"}
                    description="Researcher-led expansion and refinement"
                    label="Mode B"
                    onClick={() => setMode("B")}
                  />
                  <ModeButton
                    active={mode === "C"}
                    description="Integration draft after confirmation"
                    label="Mode C"
                    onClick={() => setMode("C")}
                  />
                </div>
                {mode === "C" && (
                  <div className="mini-card soft">
                    <label className="scope-option">
                      <input
                        checked={allSegmentsProcessedForModeC}
                        onChange={(event) =>
                          setAllSegmentsProcessedForModeC(event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        I confirm all segments in this transcript have been
                        processed, reviewed, and accepted for final integration.
                      </span>
                    </label>
                    <p className="small">
                      Mode C should only be used after the single-transcript
                      batch is complete. It creates an integration draft for
                      researcher review, not a final report.
                    </p>
                  </div>
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
                          className="button primary"
                          disabled={isRunningCategories}
                          onClick={() =>
                            void runCategories({ allowFallbackRegenerate: true })
                          }
                          type="button"
                        >
                          <Bot size={18} />
                          Regenerate Mode {mode}
                        </button>
                        <button
                          className="button"
                          disabled={isRunningCategories}
                          onClick={() => void acceptTemporaryCategoryDraft()}
                          type="button"
                        >
                          <Check size={18} />
                          Use fallback draft as editable starting point
                        </button>
                      </div>
                    )}
                  </div>
                )}
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={!canRunCategories || isRunningCategories}
                    onClick={() => void runCategories()}
                    title={
                      canRunCategories
                        ? `Run Mode ${mode} using confirmed MU summaries`
                        : getCategoryRunDisabledReason({
                            allSegmentsProcessedForModeC,
                            confirmedMeaningUnits: confirmedMeaningUnits.length,
                            hasTemporaryFallbackCategories,
                            mode,
                            categoryCount: displayCategories.length
                          })
                    }
                    type="button"
                  >
                    <Bot size={18} />
                    {isRunningCategories
                      ? `Running Mode ${mode}...`
                      : hasTemporaryFallbackCategories
                        ? `Regenerate Mode ${mode}`
                        : `Run Mode ${mode}`}
                  </button>
                  <button
                    className="button"
                    disabled={!displayCategories.length || isRunningReviewer}
                    onClick={() => void runReviewer("categories")}
                    type="button"
                  >
                    <ShieldCheck size={18} />
                    Run reviewer check
                  </button>
                  {mode === "C" && (
                    <span className="badge warning">
                      Confirmation required: transcript batch complete
                    </span>
                  )}
                </div>
                {displayCategories.length === 0 ? (
                  <EmptyState text="No category drafts yet. Accept or edit meaning-unit summaries first, then run Mode A/B/C." />
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
                <UnassignedMeaningUnits
                  categories={displayCategories}
                  onAssign={assignMeaningUnitToCategory}
                  onCreateCategory={addCategoryDraft}
                  units={unassignedMeaningUnits}
                />
                {mode === "C" && (
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
                        setApiStatus("Generate or write an integration draft before confirming.");
                        return;
                      }
                      if (hasSensitivePlaceholder(narrative)) {
                        setApiStatus("Integration draft contains sensitive placeholders. Review before confirming.");
                        return;
                      }
                      setIntegrationReviewed(true);
                      setApiStatus("Integration draft marked as researcher-reviewed provisional synthesis.");
                    }}
                    onNoteChange={setIntegrationNote}
                    units={confirmedMeaningUnits}
                  />
                )}
                  </div>
                  <ReviewerPanel
                    expandedIssueIds={expandedReviewIssueIds}
                    isOpen={categoryReviewOpen}
                    issues={categoryReviewIssues}
                    isRunning={isRunningReviewer}
                    onAddMemo={(issue) => {
                      const memo = window.prompt(
                        "Researcher memo for this reviewer issue:",
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
                </div>
              </div>
            )}

            {activeStep === "export" && (
              <div className="section-body grid">
                <div className="grid three">
                  {[
                    {
                      description: "Full workspace data for backup or audit.",
                      format: "json" as const,
                      label: "JSON"
                    },
                    {
                      description: "Meaning-unit table for spreadsheet review.",
                      format: "csv" as const,
                      label: "CSV"
                    },
                    {
                      description: "Readable transcript and draft-output report.",
                      format: "txt" as const,
                      label: "TXT"
                    }
                  ].map((item) => (
                    <div className="mini-card" key={item.format}>
                      <Download size={26} />
                      <h3>{item.label} export</h3>
                      <p className="small">{item.description}</p>
                      <button
                        className="button"
                        disabled={!canExport}
                        onClick={() => exportWorkspace(item.format)}
                        type="button"
                      >
                        <Download size={18} />
                        Download {item.label}
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mini-card soft">
                  <span className="label">Review trail</span>
                  <p className="small">
                    Exports may contain AI-drafted material. Review all outputs
                    against transcript evidence before using them in reports,
                    publications, supervision, or teaching materials.
                  </p>
                  {displayAuditEvents.length === 0 ? (
                    <EmptyState text="No review-trail records yet. Upload, save, or request AI draft support to start the trail." />
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
  return (
    !unit.analysisExcluded &&
    (unit.humanStatus === "Accepted" || unit.humanStatus === "Edited")
  );
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
    ai_draft: "AI draft",
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
    return "Accept or edit meaning-unit summaries before running categories";
  }
  if (hasTemporaryFallbackCategories && (mode === "B" || mode === "C")) {
    return "Regenerate or explicitly accept the temporary fallback draft before Mode B/C";
  }
  if (mode === "B" && categoryCount === 0) {
    return "Run Mode A first; Mode B refines an existing category system";
  }
  if (mode === "C" && categoryCount === 0) {
    return "Run Mode A and Mode B before final Mode C integration";
  }
  if (mode === "C" && !allSegmentsProcessedForModeC) {
    return "Confirm all segments in this transcript have been processed and reviewed before Mode C";
  }
  return `Run Mode ${mode} using confirmed MU summaries`;
}

function getStepCopy(step: WorkflowStep) {
  switch (step) {
    case "upload":
      return "Add an interview audio file or import an existing transcript. Use anonymised or approved data, then review the prepared transcript before requesting AI draft support.";
    case "transcript":
      return "Carefully check every speaker label and every sentence. Meaning-unit analysis depends on this transcript being accurate.";
    case "meaning-units":
      return "Generate draft meaning units (MUs) from selected ready segments, then review each one. If a speaker or excerpt is wrong, correct the transcript and regenerate.";
    case "categories":
      return "Create category-level drafts only after meaning units have been reviewed. Mode A starts drafting, Mode B refines it, and Mode C creates an integration draft.";
    case "export":
      return "Download the reviewed transcript, meaning units, category drafts, reviewer notes, and review trail. Exports may contain AI-drafted material.";
    default:
      return "Set up the project and research question before importing data. Current workflow: GDI-QR-informed researcher-led analysis support.";
  }
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
          <span className="badge blue">Reviewer check</span>
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
              {isRunning ? "Checking..." : "Run check"}
            </button>
            <span className="badge">
              {activeIssues.length} active · {resolvedCount} resolved
            </span>
            {dismissedCount > 0 && (
              <span className="badge blue">{dismissedCount} dismissed</span>
            )}
          </div>
          {issues.length === 0 ? (
            <EmptyState text="Review not yet run. Reviewer checks flag possible issues; the researcher decides how to resolve them." />
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

function reviewSummaryText(
  issues: ReviewerComment[],
  warningCount: number,
  majorCount: number
) {
  if (issues.length === 0) {
    return "Review not yet run";
  }
  if (majorCount === 0 && warningCount === 0) {
    return "No major issues found";
  }
  return `${warningCount} warning${warningCount === 1 ? "" : "s"}, ${majorCount} major issue${majorCount === 1 ? "" : "s"}`;
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
      : "AI draft";
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
          {isFallback && <span className="badge warning">Requires review</span>}
          <span className="badge">
            Units {category.includedUnitIds.join(", ")}
          </span>
        </div>
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
          This category was created by fallback grouping because the AI returned
          empty output. Please review and rename before using it.
        </p>
      )}
      <details className="evidence-panel" open>
        <summary>View supporting evidence ({includedUnits.length} MU)</summary>
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
          Create category from all unassigned
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
          <span className="label">Mode C integration review workspace</span>
          <h3>Editable provisional integration draft</h3>
          <p className="small">
            Mode C is an integration aid, not a final analysis. Review the
            structure, interpretation, evidence, and limitations before using
            this draft.
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
        placeholder="Add decisions, cautions, or reviewer follow-up notes."
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
        <strong>Mode C caution</strong>
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
