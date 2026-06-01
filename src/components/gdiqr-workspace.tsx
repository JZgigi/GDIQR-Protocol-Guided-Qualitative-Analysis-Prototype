"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
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
  SearchCheck,
  Settings2,
  ShieldCheck,
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
  { id: "reviewers", label: "Reviewers", icon: SearchCheck },
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
  const [apiDataSource, setApiDataSource] = useState(dataSource);
  const [apiStatus, setApiStatus] = useState(
    supabaseConfigured
      ? "Workspace ready. Start by uploading audio or importing a transcript."
      : "Supabase is not connected yet. Add your Supabase settings before testing with real data."
  );
  const [reviewerHasRun, setReviewerHasRun] = useState(true);
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [uploadLanguage, setUploadLanguage] =
    useState<Project["language"]>(project.language);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isGeneratingMeaningUnits, setIsGeneratingMeaningUnits] =
    useState(false);
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
  }, [displaySegments, selectedSegmentId]);

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
      if (reviewerOutputs.length > 0) {
        completed.add("reviewers");
      }
      return completed;
    },
    [
      displayAudioFiles.length,
      displayCategories.length,
      displaySegments.length,
      editableTranscript,
      reviewerOutputs.length,
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
  const activeMeaningUnitSegment =
    selectedSegment && canRunMeaningUnitsForSegment(selectedSegment)
      ? selectedSegment
      : readySegments[0];
  const canGenerateMeaningUnits = Boolean(
    transcriptConfirmed && readySegments.length > 0
  );
  const confirmedMeaningUnits = useMemo(
    () => units.filter((unit) => isConfirmedMeaningUnit(unit)),
    [units]
  );
  const canRunCategories = confirmedMeaningUnits.length > 0;
  const canRunReviewer = units.length > 0;
  const canExport = Boolean(
    editableTranscript.trim() ||
      units.length ||
      displayCategories.length ||
      reviewerOutputs.length
  );

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

  async function generateMeaningUnits(segment = selectedSegment) {
    if (!segment) {
      setApiStatus("Create and review a segment before generating meaning units.");
      return;
    }
    if (!transcriptConfirmed) {
      setApiStatus(
        "Review and confirm the transcript before generating meaning units."
      );
      return;
    }
    if (!canRunMeaningUnitsForSegment(segment)) {
      setApiStatus(
        "Mark this segment as Ready for MU Analysis before running local AI."
      );
      return;
    }

    setIsGeneratingMeaningUnits(true);
    setApiStatus(
      `Generating meaning units for ${segment.segmentId}. The activity panel will show each chunk.`
    );

    try {
      const response = await fetchWithTimeout("/api/ai/meaning-units", {
        body: JSON.stringify({
          caseId: segment.caseId,
          lightInterpretation,
          projectId: currentProject.id,
          segmentId: segment.segmentId,
          startingNumber: segment.startingMuNumber,
          transcript: segment.text
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        timeoutMs: 30000
      });
      if (!response.ok) {
        const errorResult = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setApiStatus(errorResult.error ?? "Meaning-unit API failed");
        return;
      }
      const result = (await response.json()) as {
        meaningUnits?: MeaningUnit[];
        persisted?: boolean;
        provider?: string;
        runId?: string;
        started?: boolean;
      };
      if (result.started && result.runId) {
        setActiveMeaningUnitRunId(result.runId);
        setApiStatus(
          `Meaning-unit generation started for ${segment.segmentId}. Leave this page open and watch the activity panel for progress.`
        );
        return;
      }
      if (result.meaningUnits) {
        setUnits(result.meaningUnits);
        setIsGeneratingMeaningUnits(false);
        setApiStatus(
          `Meaning-unit API applied from ${result.provider ?? aiProvider}${
            result.persisted ? " and saved to Supabase" : ""
          }`
        );
      }
    } catch (error) {
      setIsGeneratingMeaningUnits(false);
      setApiStatus(
        error instanceof Error ? error.message : "Meaning-unit API failed"
      );
    }
  }

  async function runCategories() {
    if (confirmedMeaningUnits.length === 0) {
      setApiStatus(
        "Accept or edit meaning-unit summaries before creating categories. Categories only use confirmed summaries."
      );
      return;
    }

    setIsRunningCategories(true);
    setApiStatus(`Running category construction Mode ${mode}. This may take a few minutes.`);

    try {
      const response = await fetchWithTimeout("/api/ai/categories", {
        body: JSON.stringify({
          mode,
          projectId: currentProject.id,
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
        integratedNarrative?: string;
        persisted?: boolean;
        provider?: string;
      };
      if (result.categories) {
        setDisplayCategories(result.categories);
      }
      setNarrative(result.integratedNarrative ?? "");
      setApiStatus(
        `Category API Mode ${mode} applied from ${result.provider ?? aiProvider}${
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

  async function runReviewer() {
    if (units.length === 0) {
      setApiStatus("Generate meaning units before running reviewer checks.");
      return;
    }

    setIsRunningReviewer(true);
    setApiStatus("Running reviewer checks on the current analysis...");

    try {
      const response = await fetchWithTimeout("/api/ai/reviewer", {
        body: JSON.stringify({ projectId: currentProject.id, units }),
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
      setReviewerOutputs(result.comments ?? []);
      setReviewerHasRun(true);
      setApiStatus(
        `Reviewer API applied from ${result.provider ?? aiProvider}${
          result.persisted ? " and saved to Supabase" : ""
        }`
      );
    } catch (error) {
      setApiStatus(error instanceof Error ? error.message : "Reviewer API failed");
    } finally {
      setIsRunningReviewer(false);
    }
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
            onClick={() => void generateMeaningUnits(activeMeaningUnitSegment)}
            type="button"
            title={
              transcriptConfirmed
                ? "Run local AI for the selected ready segment"
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
                    Review and adjust segment boundaries before analysis. Only
                    segments marked Ready for MU Analysis are sent to local AI,
                    one segment at a time.
                  </p>
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
                            {selectedSegment.endTimestamp}
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
              <div className="section-body grid">
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
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={!canGenerateMeaningUnits || isGeneratingMeaningUnits}
                    onClick={() => void generateMeaningUnits(activeMeaningUnitSegment)}
                    type="button"
                    title={
                      transcriptConfirmed
                        ? "Generate meaning units from a ready segment"
                        : "Confirm the transcript before generating meaning units"
                    }
                  >
                    <Bot size={18} />
                    {isGeneratingMeaningUnits
                      ? "Generating MUs..."
                      : transcriptConfirmed
                        ? "Generate draft MUs for ready segment"
                        : "Confirm transcript first"}
                  </button>
                  <button
                    className="button"
                    disabled={!canRunReviewer || isRunningReviewer}
                    onClick={runReviewer}
                    type="button"
                  >
                    <ShieldCheck size={18} />
                    Run reviewer
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
                          <tr key={unit.id}>
                            <td className="mono">#{unit.number}</td>
                            <td>
                              <select
                                className="select compact"
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
                            <td>{unit.excerpt}</td>
                            <td>{unit.aiSummary}</td>
                            <td>
                              <textarea
                                className="field"
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
                                <button
                                  className="button icon"
                                  onClick={() => markAccepted(unit.id)}
                                  title="Accept meaning unit"
                                  type="button"
                                >
                                  <Check size={18} />
                                </button>
                                <button
                                  className="button icon"
                                  onClick={() => returnToTranscriptForUnit(unit)}
                                  title="Fix source transcript and regenerate"
                                  type="button"
                                >
                                  <Pencil size={18} />
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
            )}

            {activeStep === "categories" && (
              <div className="section-body grid">
                <div className="mini-card soft">
                  <span className="label">Category readiness</span>
                  <p className="small">
                    Categories use only accepted or edited meaning-unit
                    summaries. Review each MU first so category construction is
                    based on confirmed participant meaning rather than raw
                    transcript text.
                  </p>
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
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={!canRunCategories || isRunningCategories}
                    onClick={runCategories}
                    type="button"
                  >
                    <Bot size={18} />
                    {isRunningCategories ? `Running Mode ${mode}...` : `Run Mode ${mode}`}
                  </button>
                  {mode === "C" && (
                    <span className="badge warning">
                      Confirmation required: all batches processed
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
                    <p>{narrative}</p>
                  </div>
                )}
              </div>
            )}

            {activeStep === "reviewers" && (
              <div className="section-body grid">
                <div className="button-row">
                  <button
                    className="button primary"
                    disabled={!canRunReviewer || isRunningReviewer}
                    onClick={runReviewer}
                    type="button"
                  >
                    <SearchCheck size={18} />
                    {isRunningReviewer ? "Running reviewers..." : "Run reviewer agents"}
                  </button>
                  <span className="badge">
                    {reviewerHasRun ? "Reviewer output ready" : "Not run"}
                  </span>
                </div>
                {reviewerOutputs.length === 0 ? (
                  <EmptyState text="No reviewer comments yet. Run reviewer agents after meaning units are available." />
                ) : (
                  <div className="grid two">
                    {reviewerOutputs.map((comment) => (
                      <div className="mini-card" key={comment.id}>
                      <div className="category-header">
                        <div>
                          <span className="label">{comment.agent}</span>
                          <h3>{comment.target}</h3>
                        </div>
                        <StatusBadge label={comment.severity} />
                      </div>
                      <p>{comment.comment}</p>
                      <p className="small">{comment.suggestedAction}</p>
                      </div>
                    ))}
                  </div>
                )}
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
        lowered.includes("failed")
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
  return unit.humanStatus === "Accepted" || unit.humanStatus === "Edited";
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
    case "reviewers":
      return "Run checks for coverage, coherence, GDIQR discipline, and unresolved uncertainty.";
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
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const { timeoutMs: _timeoutMs, ...fetchOptions } = options;
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
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

function CategoryBlock({ category }: { category: CategoryNode }) {
  return (
    <article className="category">
      <div className="category-header">
        <div>
          <h3 className="category-title">{category.name}</h3>
          <p className="small">{category.definition}</p>
        </div>
        <span className="badge">
          Units {category.includedUnitIds.join(", ")}
        </span>
      </div>
      {category.subcategories && category.subcategories.length > 0 && (
        <div className="subcategories">
          {category.subcategories.map((subcategory) => (
            <div key={subcategory.id}>
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
