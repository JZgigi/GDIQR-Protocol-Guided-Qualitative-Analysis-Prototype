"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [editableTranscript, setEditableTranscript] = useState(transcript);
  const [transcriptConfirmed, setTranscriptConfirmed] = useState(
    isTranscriptConfirmed(project)
  );
  const [aiPrivacyFindings, setAiPrivacyFindings] = useState<string[]>(
    extractPrivacyReviewMarkers(transcript)
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
  const [categoryDraftNotice, setCategoryDraftNotice] = useState("");
  const [categoryDraftIsFallback, setCategoryDraftIsFallback] = useState(false);
  const [allSegmentsProcessedForModeC, setAllSegmentsProcessedForModeC] =
    useState(false);
  const [apiDataSource, setApiDataSource] = useState(dataSource);
  const [apiStatus, setApiStatus] = useState(
    supabaseConfigured
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
  const segmentTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const meaningUnitAbortControllerRef = useRef<AbortController | null>(null);

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
  const privacyReviewNotes = useMemo(
    () =>
      Array.from(
        new Set([
          ...extractPrivacyReviewMarkers(editableTranscript),
          ...aiPrivacyFindings
        ])
      ),
    [aiPrivacyFindings, editableTranscript]
  );
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
  const hasTemporaryFallbackCategories =
    categoryDraftIsFallback || displayCategories.some(isFallbackCategory);
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
  const generationTargetLabel =
    meaningUnitGenerationScope === "all"
      ? "All Segments"
      : selectedMeaningUnitSegment?.segmentId ?? "Selected Segment";
  const selectedSegmentAlreadyHasUnits = Boolean(
    selectedMeaningUnitSegment &&
      units.some((unit) => unit.segmentId === selectedMeaningUnitSegment.segmentId)
  );
  const generationButtonLabel =
    meaningUnitGenerationScope === "all"
      ? "Generate Meaning Units for All Segments"
      : `${selectedSegmentAlreadyHasUnits ? "Regenerate" : "Generate"} Meaning Units for ${selectedMeaningUnitSegment?.segmentId ?? "Selected Segment"}`;

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
      setApiStatus("Project setup saved to Supabase");
    } catch (error) {
      setApiStatus(
        error instanceof Error ? error.message : "Project setup save failed"
      );
    } finally {
      setIsSavingProject(false);
    }
  }

  async function uploadAndTranscribeAudio() {
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
      const response = await fetchWithTimeout("/api/transcripts/import", {
        body: JSON.stringify({
          language: uploadLanguage,
          projectId: currentProject.id,
          sourceLabel: `${transcriptImportName} + privacy review`,
          transcript: transcriptImportText
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 600000
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        imported?: boolean;
        privacyFindings?: string[];
        workspace?: WorkspaceData;
      };

      if (!response.ok || !result.imported) {
        setApiStatus(result.error ?? "Transcript import failed");
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

      setTranscriptImportText("");
      setApiStatus(
        `Transcript imported. Please review speaker labels, privacy markers, and wording before confirming${
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
    setApiStatus("Saving a transcript version...");
    setTranscriptConfirmed(false);
    const response = await fetch("/api/transcript-versions", {
      body: JSON.stringify({
        content: editableTranscript,
        projectId: currentProject.id
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
        ? "Transcript version saved. Please confirm again before analysis."
        : result.reason ?? result.error ?? "Transcript save failed"
    );
  }

  async function confirmTranscriptForAnalysis() {
    if (!editableTranscript.trim()) {
      setApiStatus("Add or import a transcript before confirming it for analysis.");
      return;
    }

    setIsConfirmingTranscript(true);
    setApiStatus("Confirming transcript. Previous derived analysis will be cleared so the next analysis uses this reviewed text.");

    try {
      const response = await fetch("/api/transcripts/confirm", {
        body: JSON.stringify({
          content: editableTranscript,
          language: projectLanguage,
          projectId: currentProject.id
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

  async function saveSelectedSegment(status?: SegmentStatus) {
    if (!selectedSegment) {
      setApiStatus("Select a segment before saving.");
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

  async function deleteSelectedSegment() {
    if (!selectedSegment) {
      setApiStatus("Select a segment first.");
      return;
    }

    setIsSavingSegment(true);
    setApiStatus("Deleting segment...");

    try {
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
        "This category set is a temporary fallback draft. Regenerate it or explicitly accept it for prototype testing before running Mode B/C."
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
          ? "AI returned empty output. A temporary fallback draft was created to keep the workflow testable. Please review or regenerate. It has not been saved as final project categories."
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
      "This will save the temporary fallback category draft to Supabase for prototype testing. Only continue if you have reviewed it and accept it as a researcher-confirmed draft."
    );
    if (!confirmed) {
      return;
    }

    setIsRunningCategories(true);
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
        ? "Running GDIQR category check..."
        : "Running GDIQR meaning-unit check..."
    );

    try {
      const response = await fetchWithTimeout("/api/ai/reviewer", {
        body: JSON.stringify({
          mode,
          projectId: currentProject.id,
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
        `GDIQR review applied from ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`
      );
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Reviewer API failed");
    } finally {
      setIsRunningReviewer(false);
    }
  }

  async function updateReviewerIssue(
    commentId: string,
    updates: { memo?: string; status?: ReviewerComment["status"] }
  ) {
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
            : "Not relevant for GDIQR analysis"
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
    setApiStatus("Transcript spacing cleaned. Review the text, save a version, then confirm before analysis.");
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
        `gdiqr-workspace-${timestamp}.json`,
        JSON.stringify(buildExportPayload(), null, 2),
        "application/json"
      );
      setApiStatus("JSON export downloaded");
      return;
    }

    if (format === "csv") {
      downloadFile(
        `gdiqr-meaning-units-${timestamp}.csv`,
        buildMeaningUnitCsv(units),
        "text/csv"
      );
      setApiStatus("CSV export downloaded");
      return;
    }

    downloadFile(
      `gdiqr-analysis-report-${timestamp}.txt`,
      buildTextReport(),
      "text/plain"
    );
    setApiStatus("Text report downloaded");
  }

  function buildExportPayload() {
    return {
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
      currentProject.title,
      "",
      `Research question: ${currentProject.researchQuestion || "Not set"}`,
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
      "Integrated Narrative",
      narrative || "No integrated narrative yet."
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
        <div className="brand" aria-label="GDIQR Analysis Assistant">
          <div className="brand-mark">G</div>
          <div>
            <h1 className="brand-title">GDIQR Analysis Assistant</h1>
            <p className="brand-subtitle">
              Qualitative analysis workspace
            </p>
          </div>
        </div>
        <div className="topbar-actions">
          <span className="badge blue">AI provider: {aiProvider}</span>
          <span className="badge">
            Data: {apiDataSource === "supabase" ? "Supabase" : "Not configured"}
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
                ? `Run local AI for ${generationTargetLabel}`
                : "Confirm the transcript before running AI analysis"
            }
          >
            <Bot size={18} />
            {isGeneratingMeaningUnits
              ? "Running AI..."
              : transcriptConfirmed
                ? "Run AI"
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
                    <span className="label">Analysis method</span>
                    <strong>GDIQR</strong>
                  </div>
                  <div className="mini-card soft">
                    <span className="label">Light interpretation</span>
                    <button
                      className={`button ${
                        lightInterpretation ? "primary" : ""
                      }`}
                      onClick={() => setLightInterpretation((value) => !value)}
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
                  </div>
                </div>
              </div>
            )}

            {activeStep === "upload" && (
              <div className="section-body grid">
                <div className="upload-panel">
                  <div className="upload-dropzone">
                    <FileAudio size={32} />
                    <h3>Upload interview audio</h3>
                    <p className="small">
                      Supported audio: MP3, M4A, WAV, MP4, WebM, OGG, AAC.
                      Your file is stored privately, transcribed locally, then
                      shown for review before analysis.
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
                        disabled={isUploadingAudio || !selectedAudioFile}
                        onClick={uploadAndTranscribeAudio}
                        type="button"
                      >
                        <Upload size={18} />
                        {isUploadingAudio
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
                      {apiDataSource === "supabase"
                        ? "Supabase connected"
                        : "Supabase not connected"}
                    </span>
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
                      the text, then ask you to review it before analysis.
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
                        carry into the meaning units.
                      </p>
                    </div>
                    <StatusBadge
                      label={transcriptConfirmed ? "Confirmed" : "Needs review"}
                    />
                  </div>
                  {privacyReviewNotes.length > 0 && (
                    <div className="privacy-review-list">
                      <span className="label">Privacy review items</span>
                      {privacyReviewNotes.slice(0, 8).map((item) => (
                        <p className="small mono" key={item}>
                          {item}
                        </p>
                      ))}
                      {privacyReviewNotes.length > 8 && (
                        <p className="small">
                          +{privacyReviewNotes.length - 8} more item
                          {privacyReviewNotes.length - 8 === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    className="button primary"
                    disabled={
                      isConfirmingTranscript || !editableTranscript.trim()
                    }
                    onClick={confirmTranscriptForAnalysis}
                    type="button"
                  >
                    <Check size={18} />
                    {isConfirmingTranscript
                      ? "Confirming..."
                      : "Confirm transcript for analysis"}
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
                    disabled={!editableTranscript.trim()}
                    onClick={saveTranscriptVersion}
                    type="button"
                  >
                    <Archive size={18} />
                    Save version
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
                    setAiPrivacyFindings(
                      extractPrivacyReviewMarkers(nextTranscript)
                    );
                  }}
                  placeholder="Your uploaded audio transcript will appear here after local transcription."
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
                    Only segments marked Ready for MU Analysis are sent to
                    local AI, one segment at a time.
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
                              title="Run local AI for this segment only"
                            >
                              <Bot size={18} />
                              Run MU for this segment
                            </button>
                          </div>
                          <div className="button-row">
                            <button
                              className="button"
                              disabled={isSavingSegment}
                              onClick={() => void runSegmentAction("split")}
                              type="button"
                            >
                              Split at cursor
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
                    Only segments marked Ready for MU Analysis will run. All
                    segments mode processes ready segments one by one and keeps
                    completed results if you stop later.
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
                        ? `Generate meaning units for ${generationTargetLabel}`
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
                    Run GDIQR check
                  </button>
                  <span className="badge">
                    Light interpretation: {lightInterpretation ? "ON" : "OFF"}
                  </span>
                </div>
                {units.length === 0 ? (
                  <EmptyState
                    text={
                      transcriptConfirmed
                        ? "No meaning units yet. Run local AI to generate draft MUs."
                        : "No meaning units yet. Confirm the transcript, review segment boundaries, mark a segment ready, then run local AI."
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
                    title="GDIQR Review"
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
                    Categories use only accepted or edited meaning-unit
                    summaries. Review each MU first so category construction is
                    based on confirmed participant meaning rather than raw
                    transcript text.
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
                    {hasTemporaryFallbackCategories && (
                      <span className="badge warning">
                        Temporary fallback draft
                      </span>
                    )}
                  </div>
                </div>
                <div className="mode-selector">
                  <ModeButton
                    active={mode === "A"}
                    description="Initial category construction"
                    label="Mode A"
                    onClick={() => setMode("A")}
                  />
                  <ModeButton
                    active={mode === "B"}
                    description="Expansion and refinement"
                    label="Mode B"
                    onClick={() => setMode("B")}
                  />
                  <ModeButton
                    active={mode === "C"}
                    description="Final integration after confirmation"
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
                      batch is complete. It creates the final structure and
                      integrated narrative.
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
                          Accept temporary draft for prototype
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
                    Run category check
                  </button>
                  {mode === "C" && (
                    <span className="badge warning">
                      Confirmation required: transcript batch complete
                    </span>
                  )}
                </div>
                {displayCategories.length === 0 ? (
                  <EmptyState text="No categories yet. Accept or edit meaning-unit summaries first, then run Mode A/B/C." />
                ) : (
                  <div className="grid">
                    {displayCategories.map((category) => (
                      <CategoryBlock category={category} key={category.id} />
                    ))}
                  </div>
                )}
                {mode === "C" && (
                  <div className="mini-card soft">
                    <span className="label">Integrated narrative</span>
                    <p id="integrated-narrative">{narrative}</p>
                  </div>
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
                      description: "Readable transcript and analysis report.",
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
                  <span className="label">Audit trail</span>
                  {displayAuditEvents.length === 0 ? (
                    <EmptyState text="No audit events yet. Upload, save, or run AI to start the trail." />
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
  return project.status === "Transcript confirmed for analysis";
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

function isFallbackCategory(category: CategoryNode): boolean {
  return (
    category.source === "fallback" ||
    category.id.startsWith("cat_fallback") ||
    Boolean(category.subcategories?.some(isFallbackCategory))
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
      return "Add an interview audio file or import an existing transcript. The transcript will be prepared for review before any analysis begins.";
    case "transcript":
      return "Carefully check every speaker label and every sentence. Meaning-unit analysis depends on this transcript being accurate.";
    case "meaning-units":
      return "Review each meaning unit before moving on. If a unit is assigned to the wrong speaker or the excerpt is wrong, return to the transcript, correct it, confirm again, and regenerate.";
    case "categories":
      return "Build categories only after meaning units have been reviewed. Mode A starts construction, Mode B refines it, and Mode C integrates the final structure.";
    case "export":
      return "Download the reviewed transcript, meaning units, categories, reviewer notes, and audit trail.";
    default:
      return "Set up the project and research question before importing data. GDIQR is used as the default analysis method.";
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
          <span className="badge blue">Protocol check</span>
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
            <EmptyState text="Review not yet run. Use this as a lightweight GDIQR audit after AI output is available." />
          ) : activeIssues.length === 0 ? (
            <EmptyState text="No active review issues. Dismissed and resolved items remain in the audit trail." />
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

function CategoryBlock({ category }: { category: CategoryNode }) {
  const isFallback = isFallbackCategory(category);
  return (
    <article
      className={`category ${isFallback ? "temporary-draft" : ""}`}
      id={`category-${category.id}`}
    >
      <div className="category-header">
        <div>
          <h3 className="category-title">{category.name}</h3>
          <p className="small">{category.definition}</p>
        </div>
        <div className="button-row">
          {isFallback && <span className="badge warning">Fallback draft</span>}
          <span className="badge">
            Units {category.includedUnitIds.join(", ")}
          </span>
        </div>
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
