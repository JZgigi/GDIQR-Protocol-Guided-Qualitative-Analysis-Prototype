import type {
  AudioFileRecord,
  AuditActionType,
  AuditActor,
  AuditEvent,
  AuditTargetType,
  CategoryMode,
  CategoryNode,
  DatasetType,
  EditLog,
  ExportRecord,
  IntegrityReviewItem,
  IntegrationRelationship,
  MeaningUnit,
  PreAnalysisNotes,
  Project,
  ProjectDataSource,
  ReviewerComment,
  ReviewerIssueStatus,
  SegmentSpeakerRole,
  TranscriptionJobRecord,
  TranscriptRecord,
  TranscriptSegment,
  WorkflowStep,
} from "@/lib/types";
import {
  createSupabaseServerClient,
  hasSupabaseConfig,
} from "./supabase/server";
import type { Database, Json } from "./supabase/database.types";
import { autoSplitTranscript, type AutoSegmentMode } from "./auto-segmenter";

type AudioFileRow = Database["public"]["Tables"]["audio_files"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type TranscriptionJobRow =
  Database["public"]["Tables"]["transcription_jobs"]["Row"];
type TranscriptRow = Database["public"]["Tables"]["transcripts"]["Row"];
type EditLogRow = Database["public"]["Tables"]["edit_logs"]["Row"];
type ExportRow = Database["public"]["Tables"]["exports"]["Row"];
type IntegrityReviewItemRow =
  Database["public"]["Tables"]["integrity_review_items"]["Row"];
type IntegrationRelationshipRow =
  Database["public"]["Tables"]["integration_relationships"]["Row"];
type PreAnalysisNotesRow =
  Database["public"]["Tables"]["pre_analysis_notes"]["Row"];

const segmentRolePrefixPattern = /^\[(interviewer|participant|unclear)\]\s*/i;

function normalizeSegmentSpeakerRole(value: unknown): SegmentSpeakerRole {
  return value === "interviewer" ||
    value === "participant" ||
    value === "unclear"
    ? value
    : "unclear";
}

function inferSegmentSpeakerRole(labelOrText: string): SegmentSpeakerRole {
  const firstLabel = labelOrText.split(/[:：]/)[0].trim().toLowerCase();

  if (
    /^(interviewer|interview|researcher|moderator|facilitator|q|i|主持人|访谈者|研究者|采访者)$/.test(
      firstLabel,
    )
  ) {
    return "interviewer";
  }

  if (
    /^(participant|interviewee|student|p|a|受访者|参与者|学生)$/.test(
      firstLabel,
    )
  ) {
    return "participant";
  }

  return "unclear";
}

function encodeSegmentSpeakerInfo(label: string, role?: SegmentSpeakerRole) {
  const cleanedLabel = stripSegmentSpeakerRolePrefix(label).trim();
  const normalizedRole = normalizeSegmentSpeakerRole(role);
  const fallbackLabel =
    normalizedRole === "interviewer"
      ? "Interviewer"
      : normalizedRole === "participant"
        ? "Participant"
        : "Unclear speaker";
  return `[${normalizedRole}] ${cleanedLabel || fallbackLabel}`;
}

function stripSegmentSpeakerRolePrefix(value: string) {
  return value.replace(segmentRolePrefixPattern, "").trim();
}

function speakerRoleFromStoredInfo(value: string): SegmentSpeakerRole {
  const explicit = value.match(segmentRolePrefixPattern)?.[1]?.toLowerCase();
  if (
    explicit === "interviewer" ||
    explicit === "participant" ||
    explicit === "unclear"
  ) {
    return explicit;
  }
  return inferSegmentSpeakerRole(value);
}

function splitTranscriptBySpeakerLabels(transcript: string) {
  const lines = transcript
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const turns: Array<{
    label: string;
    role: SegmentSpeakerRole;
    text: string;
  }> = [];

  for (const line of lines) {
    const match = line.match(/^([^:：\n]{1,48})[:：]\s*(.*)$/u);
    if (match) {
      const label = match[1].trim();
      const role = inferSegmentSpeakerRole(label);
      const content = match[2].trim();
      turns.push({
        label,
        role,
        text: content ? `${label}: ${content}` : `${label}:`,
      });
      continue;
    }

    if (turns.length > 0) {
      turns[turns.length - 1].text =
        `${turns[turns.length - 1].text}\n${line}`.trim();
    } else {
      turns.push({ label: "Unclear speaker", role: "unclear", text: line });
    }
  }

  const hasSpeakerLabels =
    turns.length >= 2 && turns.some((turn) => turn.role !== "unclear");
  if (!hasSpeakerLabels) {
    return [
      {
        label: "Unclear speaker segment",
        role: "unclear" as const,
        text: transcript.trim(),
      },
    ].filter((turn) => turn.text);
  }

  return turns.filter((turn) => turn.text.trim());
}

export interface WorkspaceData {
  project: Project;
  transcript: string;
  transcriptRecords: TranscriptRecord[];
  segments: TranscriptSegment[];
  audioFiles: AudioFileRecord[];
  transcriptionJobs: TranscriptionJobRecord[];
  meaningUnits: MeaningUnit[];
  categories: CategoryNode[];
  reviewerComments: ReviewerComment[];
  auditEvents: AuditEvent[];
  editLogs: EditLog[];
  preAnalysisNotes: PreAnalysisNotes;
  integrationRelationships: IntegrationRelationship[];
  integrityReviewItems: IntegrityReviewItem[];
  exportRecords: ExportRecord[];
  integratedNarrative: string;
  integrationMemo: string;
  dataSource: "local" | "supabase" | "unconfigured";
  supabaseConfigured: boolean;
}

export const defaultProjectId =
  process.env.GDIQR_DEFAULT_PROJECT_ID ?? "proj_student_wellbeing";

interface TranscriptPrivacyMetadata {
  anonymisationStatus?: "not_reviewed" | "reviewed" | "confirmed";
  rawTranscriptRetained?: boolean;
  reviewedBy?: string | null;
  sensitiveItems?: unknown[];
  sensitiveItemsReviewedAt?: string | null;
  rawContent?: string | null;
  cleanedContent?: string | null;
  finalContent?: string | null;
  status?: string;
}

function createEmptyPreAnalysisNotes(
  projectId = defaultProjectId,
  project?: Pick<Project, "researchQuestion" | "studyDescription">,
): PreAnalysisNotes {
  const now = new Date().toISOString();
  return {
    id: `pre_${projectId}`,
    projectId,
    researchQuestion: project?.researchQuestion ?? "",
    studyDescription: project?.studyDescription ?? "",
    researcherPosition: "",
    contextualNotes: "",
    initialSensitisingConcepts: "",
    dataFamiliarisationNotes: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function getEmptyWorkspace(
  reason = "Supabase is not configured.",
): WorkspaceData {
  return {
    project: {
      id: defaultProjectId,
      title: "Untitled GDI-QR project",
      researchQuestion: "",
      studyDescription: reason,
      language: "English",
      protocol: "GDIQR",
      lightInterpretation: false,
      status: "Needs Supabase configuration",
      updatedAt: new Date().toISOString(),
      datasetType: "open",
      dataSource: "other",
      dataSuitabilityConfirmed: false,
      researcherNotes: "",
      metadata: {},
    },
    transcript: "",
    transcriptRecords: [],
    segments: [],
    audioFiles: [],
    transcriptionJobs: [],
    meaningUnits: [],
    categories: [],
    reviewerComments: [],
    auditEvents: [],
    editLogs: [],
    preAnalysisNotes: createEmptyPreAnalysisNotes(),
    integrationRelationships: [],
    integrityReviewItems: [],
    exportRecords: [],
    integratedNarrative: "",
    integrationMemo: "",
    dataSource: "unconfigured",
    supabaseConfigured: hasSupabaseConfig(),
  };
}

export function getLocalWorkspace(): WorkspaceData {
  return {
    ...getEmptyWorkspace(
      "Local-only mode: transcript data is processed and stored within the local environment.",
    ),
    dataSource: "local",
    project: {
      ...getEmptyWorkspace().project,
      status: "Local-only draft workspace",
      studyDescription:
        "Local-only mode: transcript data is processed and stored within the local environment.",
    },
    supabaseConfigured: false,
  };
}

export async function getWorkspace(
  projectId = defaultProjectId,
): Promise<WorkspaceData> {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return getEmptyWorkspace();
  }

  const [
    projectResult,
    transcriptsResult,
    segmentsResult,
    audioFilesResult,
    transcriptionJobsResult,
    meaningUnitsResult,
    categorySystemResult,
    reviewerCommentsResult,
    auditEventsResult,
    preAnalysisResult,
    integrationRelationshipsResult,
    integrityReviewItemsResult,
    editLogsResult,
    exportRecordsResult,
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase
      .from("transcripts")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("segments")
      .select("*")
      .eq("project_id", projectId)
      .order("segment_id", { ascending: true }),
    supabase
      .from("audio_files")
      .select("*")
      .eq("project_id", projectId)
      .order("uploaded_at", { ascending: false })
      .limit(10),
    supabase
      .from("transcription_jobs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("meaning_units")
      .select("*")
      .eq("project_id", projectId)
      .order("unit_number", { ascending: true }),
    supabase
      .from("category_systems")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("reviewer_comments")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_events")
      .select("*")
      .eq("project_id", projectId)
      .order("event_timestamp", { ascending: true }),
    supabase
      .from("pre_analysis_notes")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("integration_relationships")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("integrity_review_items")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("edit_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("exports")
      .select("*")
      .eq("project_id", projectId)
      .order("generated_at", { ascending: false }),
  ]);

  const firstError =
    projectResult.error ??
    transcriptsResult.error ??
    segmentsResult.error ??
    audioFilesResult.error ??
    transcriptionJobsResult.error ??
    meaningUnitsResult.error ??
    categorySystemResult.error ??
    reviewerCommentsResult.error ??
    auditEventsResult.error ??
    preAnalysisResult.error ??
    integrationRelationshipsResult.error ??
    integrityReviewItemsResult.error ??
    editLogsResult.error ??
    exportRecordsResult.error;

  if (firstError) {
    console.warn("Could not load Supabase workspace:", firstError.message);
    return getEmptyWorkspace(firstError.message);
  }

  if (!projectResult.data) {
    const createdProject = await createDefaultProject(projectId);
    if (!createdProject) {
      return getEmptyWorkspace("Default project could not be created.");
    }

    return {
      ...getEmptyWorkspace(),
      project: mapProject(createdProject),
      dataSource: "supabase",
      supabaseConfigured: true,
    };
  }

  let categoryRows: CategoryRow[] = [];
  if (categorySystemResult.data) {
    const categoryResult = await supabase
      .from("categories")
      .select("*")
      .eq("category_system_id", categorySystemResult.data.id)
      .order("sort_order", { ascending: true });

    if (categoryResult.error) {
      console.warn("Could not load categories:", categoryResult.error.message);
    } else {
      categoryRows = categoryResult.data ?? [];
    }
  }

  const mappedProject = mapProject(projectResult.data);
  const transcriptRows = (transcriptsResult.data ?? []) as TranscriptRow[];
  const latestTranscript = transcriptRows[0];

  return {
    project: mappedProject,
    transcript: getResearcherVisibleTranscript(latestTranscript),
    transcriptRecords: transcriptRows.map(mapTranscriptRecord),
    segments: (segmentsResult.data ?? []).map(mapSegment),
    audioFiles: (audioFilesResult.data ?? []).map(mapAudioFile),
    transcriptionJobs: (transcriptionJobsResult.data ?? []).map(
      mapTranscriptionJob,
    ),
    meaningUnits: (meaningUnitsResult.data ?? []).map(mapMeaningUnit),
    categories: buildCategoryTree(categoryRows),
    reviewerComments: (reviewerCommentsResult.data ?? []).map(
      mapReviewerComment,
    ),
    auditEvents: (auditEventsResult.data ?? []).map(mapAuditEvent),
    editLogs: (editLogsResult.data ?? []).map(mapEditLog),
    preAnalysisNotes: preAnalysisResult.data
      ? mapPreAnalysisNotes(preAnalysisResult.data)
      : createEmptyPreAnalysisNotes(projectId, mappedProject),
    integrationRelationships: (integrationRelationshipsResult.data ?? []).map(
      mapIntegrationRelationship,
    ),
    integrityReviewItems: (integrityReviewItemsResult.data ?? []).map(
      mapIntegrityReviewItem,
    ),
    exportRecords: (exportRecordsResult.data ?? []).map(mapExportRecord),
    integratedNarrative: categorySystemResult.data?.integrated_narrative ?? "",
    integrationMemo: categorySystemResult.data?.integration_memo ?? "",
    dataSource: "supabase",
    supabaseConfigured: true,
  };
}

export async function saveTranscriptVersion({
  anonymisationStatus = "reviewed",
  content,
  projectId = defaultProjectId,
  rawTranscriptRetained = false,
  sensitiveItems = [],
  versionLabel = "Researcher edited transcript",
}: {
  anonymisationStatus?: TranscriptPrivacyMetadata["anonymisationStatus"];
  content: string;
  projectId?: string;
  rawTranscriptRetained?: boolean;
  sensitiveItems?: unknown[];
  versionLabel?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: previousTranscript } = await supabase
    .from("transcripts")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await insertTranscriptWithOptionalPrivacyMetadata({
    anonymisationStatus,
    cleanedContent: content,
    content,
    finalContent: null,
    projectId,
    rawContent: previousTranscript?.raw_content ?? null,
    rawTranscriptRetained,
    sensitiveItems,
    status: "Reviewed",
    supabase,
    versionLabel,
  });

  if (error) {
    throw new Error(error.message);
  }

  await Promise.all([
    supabase
      .from("projects")
      .update({
        status: "Transcript reviewed — not yet confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId),
    recordEditLog({
      action: "Saved edited transcript for researcher review",
      actionType: "transcript_edited",
      newValue: {
        transcriptId: data.id,
        versionLabel: data.version_label,
        characterCount: content.length,
        status: data.status ?? "Reviewed",
      },
      previousValue: previousTranscript
        ? {
            transcriptId: previousTranscript.id,
            versionLabel: previousTranscript.version_label,
            characterCount:
              getResearcherVisibleTranscript(previousTranscript).length,
            status: previousTranscript.status,
          }
        : undefined,
      projectId,
      step: "pre-analysis",
      targetId: data.id,
      targetType: "transcript",
    }),
  ]);

  return {
    saved: true,
    transcript: mapTranscriptRecord(data as TranscriptRow),
  };
}

export async function saveTranscriptReviewDraft({
  anonymisationStatus = "reviewed",
  language,
  preparedTranscript,
  projectId = defaultProjectId,
  privacyFindings = [],
  rawTranscript,
  sourceLabel = "Uploaded transcript — review draft",
  sourceType = "transcript",
}: {
  anonymisationStatus?: TranscriptPrivacyMetadata["anonymisationStatus"];
  language: Project["language"];
  preparedTranscript: string;
  projectId?: string;
  privacyFindings?: unknown[];
  rawTranscript: string;
  sourceLabel?: string;
  sourceType?: "transcript" | "audio";
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const versionLabel =
    sourceType === "audio"
      ? "Audio transcription draft — review required"
      : sourceLabel;

  const { data, error } = await insertTranscriptWithOptionalPrivacyMetadata({
    anonymisationStatus,
    cleanedContent: preparedTranscript,
    content: preparedTranscript,
    finalContent: null,
    projectId,
    rawContent: rawTranscript,
    rawTranscriptRetained: true,
    sensitiveItems: privacyFindings,
    status: "Needs Review",
    supabase,
    versionLabel,
  });

  if (error) {
    throw new Error(error.message);
  }

  const uploadedAt = new Date().toISOString();
  await Promise.all([
    supabase
      .from("projects")
      .update({
        language,
        status:
          sourceType === "audio"
            ? "Transcript generated from audio — needs researcher review"
            : "Transcript uploaded — needs researcher review",
        updated_at: uploadedAt,
      })
      .eq("id", projectId),
    recordEditLog({
      action:
        sourceType === "audio"
          ? "Generated transcript from uploaded audio for researcher review"
          : "Uploaded transcript and prepared editable review draft",
      actionType:
        sourceType === "audio" ? "transcript_generated" : "transcript_uploaded",
      actor: sourceType === "audio" ? "AI" : "Researcher",
      newValue: {
        transcriptId: data.id,
        versionLabel: data.version_label,
        rawCharacterCount: rawTranscript.length,
        preparedCharacterCount: preparedTranscript.length,
        status: data.status ?? "Needs Review",
      },
      projectId,
      step: "pre-analysis",
      targetId: data.id,
      targetType: "transcript",
    }),
  ]);

  return {
    saved: true,
    transcript: mapTranscriptRecord(data as TranscriptRow),
  };
}

export async function listProjects(): Promise<Project[]> {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Could not list projects:", error.message);
    return [];
  }

  return (data ?? []).map(mapProject);
}

export async function createProject({
  dataSource,
  dataSuitabilityConfirmed,
  datasetType,
  language = "English",
  lightInterpretation = false,
  researcherNotes,
  researchQuestion,
  studyDescription,
  title,
}: {
  dataSource: ProjectDataSource;
  dataSuitabilityConfirmed: boolean;
  datasetType: DatasetType;
  language?: Project["language"];
  lightInterpretation?: boolean;
  researcherNotes: string;
  researchQuestion: string;
  studyDescription: string;
  title: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { created: false, reason: "Supabase is not configured." };
  }

  const createdAt = new Date().toISOString();
  const projectId = `proj_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const { data, error } = await supabase
    .from("projects")
    .insert({
      id: projectId,
      title: title.trim(),
      research_question: researchQuestion.trim(),
      study_description: studyDescription.trim(),
      language,
      protocol: "GDIQR",
      light_interpretation: lightInterpretation,
      status: "Project created — transcript not uploaded",
      updated_at: createdAt,
      dataset_type: datasetType,
      data_source: dataSource,
      data_suitability_confirmed: dataSuitabilityConfirmed,
      data_suitability_confirmed_at: dataSuitabilityConfirmed
        ? createdAt
        : null,
      researcher_notes: researcherNotes.trim(),
      metadata: {
        release: "v1.0 research release",
        data_suitability_notice:
          "This research release is intended for open, public, or anonymised datasets only. Please do not upload identifiable or highly sensitive data unless an approved secure/local deployment is in place.",
      },
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("pre_analysis_notes").upsert(
    {
      project_id: projectId,
      research_question: researchQuestion.trim(),
      study_description: studyDescription.trim(),
      researcher_position: "",
      contextual_notes: "",
      initial_sensitising_concepts: "",
      data_familiarisation_notes: "",
      updated_at: createdAt,
    },
    { onConflict: "project_id" },
  );

  await recordEditLog({
    action: "Created project",
    actionType: "project_created",
    newValue: data,
    projectId,
    researcherNote: researcherNotes.trim() || undefined,
    step: "pre-analysis",
    targetId: projectId,
    targetType: "project",
  });

  if (dataSuitabilityConfirmed) {
    await recordEditLog({
      action: "Confirmed data suitability notice",
      actionType: "data_suitability_confirmed",
      newValue: {
        dataSource,
        datasetType,
        dataSuitabilityConfirmed: true,
        dataSuitabilityConfirmedAt: data.data_suitability_confirmed_at,
      },
      projectId,
      researcherNote: researcherNotes.trim() || undefined,
      step: "pre-analysis",
      targetId: projectId,
      targetType: "project",
    });
  }

  return { created: true, project: mapProject(data) };
}

export async function updateProjectSettings({
  dataSource,
  dataSuitabilityConfirmed,
  datasetType,
  language,
  lightInterpretation,
  projectId = defaultProjectId,
  researcherNotes,
  researchQuestion,
  studyDescription,
  title,
}: {
  dataSource?: ProjectDataSource;
  dataSuitabilityConfirmed?: boolean;
  datasetType?: DatasetType;
  language: Project["language"];
  lightInterpretation: boolean;
  projectId?: string;
  researcherNotes?: string;
  researchQuestion: string;
  studyDescription: string;
  title: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const updatedAt = new Date().toISOString();
  const { data: previousProject } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  const projectUpsert: Database["public"]["Tables"]["projects"]["Insert"] = {
    id: projectId,
    title: title.trim() || "Untitled GDI-QR project",
    research_question: researchQuestion.trim(),
    study_description: studyDescription.trim(),
    language,
    protocol: "GDIQR",
    light_interpretation: lightInterpretation,
    status: "Ready for local testing",
    updated_at: updatedAt,
  };

  if (datasetType !== undefined) {
    projectUpsert.dataset_type = datasetType;
  }
  if (dataSource !== undefined) {
    projectUpsert.data_source = dataSource;
  }
  if (dataSuitabilityConfirmed !== undefined) {
    projectUpsert.data_suitability_confirmed = dataSuitabilityConfirmed;
    projectUpsert.data_suitability_confirmed_at = dataSuitabilityConfirmed
      ? updatedAt
      : null;
  }
  if (researcherNotes !== undefined) {
    projectUpsert.researcher_notes = researcherNotes.trim();
  }

  const { data, error } = await supabase
    .from("projects")
    .upsert(projectUpsert)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await recordEditLog({
    action:
      !previousProject?.data_suitability_confirmed &&
      data.data_suitability_confirmed
        ? "Updated project setup and confirmed data suitability notice"
        : "Updated project setup",
    actionType:
      !previousProject?.data_suitability_confirmed &&
      data.data_suitability_confirmed
        ? "data_suitability_confirmed"
        : "project_updated",
    newValue: data,
    previousValue: previousProject,
    projectId,
    step: "pre-analysis",
    targetId: projectId,
    targetType: "project",
  });

  return { saved: true, project: mapProject(data) };
}

export async function savePreAnalysisNotes({
  contextualNotes,
  dataFamiliarisationNotes,
  initialSensitisingConcepts,
  projectId = defaultProjectId,
  researcherPosition,
  researchQuestion,
  studyDescription,
}: {
  contextualNotes: string;
  dataFamiliarisationNotes: string;
  initialSensitisingConcepts: string;
  projectId?: string;
  researcherPosition: string;
  researchQuestion: string;
  studyDescription: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const updatedAt = new Date().toISOString();
  const { data: before } = await supabase
    .from("pre_analysis_notes")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("pre_analysis_notes")
    .upsert(
      {
        project_id: projectId,
        research_question: researchQuestion.trim(),
        study_description: studyDescription.trim(),
        researcher_position: researcherPosition.trim(),
        contextual_notes: contextualNotes.trim(),
        initial_sensitising_concepts: initialSensitisingConcepts.trim(),
        data_familiarisation_notes: dataFamiliarisationNotes.trim(),
        updated_at: updatedAt,
      },
      { onConflict: "project_id" },
    )
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { data: projectRow } = await supabase
    .from("projects")
    .update({
      research_question: researchQuestion.trim(),
      study_description: studyDescription.trim(),
      status: "Step 1 pre-analysis saved",
      updated_at: updatedAt,
    })
    .eq("id", projectId)
    .select()
    .maybeSingle();

  await recordEditLog({
    action: "Updated Step 1 pre-analysis notes",
    actionType: "pre_analysis_updated",
    newValue: data,
    previousValue: before,
    projectId,
    step: "pre-analysis",
    targetId: data.id,
    targetType: "pre_analysis",
  });

  return {
    saved: true,
    preAnalysisNotes: mapPreAnalysisNotes(data),
    project: projectRow ? mapProject(projectRow) : undefined,
  };
}

export async function recordEditLog({
  action,
  actionType = "other",
  actor = "Researcher",
  newValue,
  previousValue,
  projectId = defaultProjectId,
  researcherNote,
  step,
  targetId,
  targetType,
}: {
  action: string;
  actionType?: AuditActionType;
  actor?: AuditActor;
  newValue?: unknown;
  previousValue?: unknown;
  projectId?: string;
  researcherNote?: string;
  step: WorkflowStep;
  targetId: string;
  targetType: AuditTargetType;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const previousJson = toJsonValue(previousValue);
  const newJson = toJsonValue(newValue);
  const target = `${targetType}:${targetId}`;

  const [{ data: editLog, error: editLogError }, { error: auditError }] =
    await Promise.all([
      supabase
        .from("edit_logs")
        .insert({
          project_id: projectId,
          step,
          target_type: targetType,
          target_id: targetId,
          actor,
          action_type: actionType,
          action,
          previous_value: previousJson,
          new_value: newJson,
          researcher_note: researcherNote ?? null,
          before_value:
            previousValue === undefined ? null : safeStringify(previousValue),
          after_value: newValue === undefined ? null : safeStringify(newValue),
        })
        .select()
        .single(),
      supabase.from("audit_events").insert({
        project_id: projectId,
        actor,
        action,
        target,
        step,
        action_type: actionType,
        target_type: targetType,
        target_id: targetId,
        previous_value: previousJson,
        new_value: newJson,
        researcher_note: researcherNote ?? null,
      }),
    ]);

  if (editLogError) {
    throw new Error(editLogError.message);
  }
  if (auditError) {
    throw new Error(auditError.message);
  }

  return { saved: true, editLog: mapEditLog(editLog) };
}

export async function uploadAudioForTranscription({
  bytes,
  contentType,
  language,
  originalFilename,
  projectId = defaultProjectId,
  sizeBytes,
}: {
  bytes: ArrayBuffer;
  contentType: string;
  language: Project["language"];
  originalFilename: string;
  projectId?: string;
  sizeBytes: number;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { uploaded: false, reason: "Supabase is not configured." };
  }

  const bucket = "interview-audio";
  const safeFilename = sanitizeStorageFilename(originalFilename);
  const storagePath = `${projectId}/${Date.now()}-${safeFilename}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: audioRow, error: audioError } = await supabase
    .from("audio_files")
    .insert({
      project_id: projectId,
      storage_bucket: bucket,
      storage_path: storagePath,
      original_filename: originalFilename,
      content_type: contentType,
      size_bytes: sizeBytes,
      language,
    })
    .select()
    .single();

  if (audioError) {
    throw new Error(audioError.message);
  }

  const { data: jobRow, error: jobError } = await supabase
    .from("transcription_jobs")
    .insert({
      project_id: projectId,
      audio_file_id: audioRow.id,
      status: "processing",
      provider: "local-faster-whisper",
      language,
    })
    .select()
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  await recordEditLog({
    action: "Uploaded audio file for transcription",
    actionType: "audio_uploaded",
    newValue: {
      audioFileId: audioRow.id,
      originalFilename,
      sizeBytes,
      contentType,
      language,
    },
    projectId,
    step: "pre-analysis",
    targetId: audioRow.id,
    targetType: "audio_file",
  });

  return {
    uploaded: true,
    audioFile: mapAudioFile(audioRow),
    job: mapTranscriptionJob(jobRow),
  };
}

export async function completeTranscriptionJob({
  jobId,
  language,
  projectId = defaultProjectId,
  rawTranscript,
  transcript,
  versionLabel,
}: {
  jobId: string;
  language: Project["language"];
  projectId?: string;
  rawTranscript?: string;
  transcript: string;
  versionLabel: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  await Promise.all([
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase
      .from("integrity_review_items")
      .delete()
      .eq("project_id", projectId),
    supabase.from("integrity_reviews").delete().eq("project_id", projectId),
    supabase
      .from("integration_relationships")
      .delete()
      .eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
  ]);

  const { data: transcriptRow, error: transcriptError } =
    await insertTranscriptWithOptionalPrivacyMetadata({
      anonymisationStatus: "reviewed",
      cleanedContent: transcript,
      content: transcript,
      finalContent: null,
      projectId,
      rawContent: rawTranscript ?? transcript,
      rawTranscriptRetained: true,
      sensitiveItems: [],
      status: "Needs Review",
      supabase,
      versionLabel,
    });

  if (transcriptError) {
    throw new Error(transcriptError.message);
  }

  const completedAt = new Date().toISOString();
  const { data: jobRow, error: jobError } = await supabase
    .from("transcription_jobs")
    .update({
      status: "completed",
      transcript_id: transcriptRow.id,
      error_message: null,
      completed_at: completedAt,
    })
    .eq("id", jobId)
    .select()
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  await Promise.all([
    supabase
      .from("projects")
      .update({
        language,
        status: "Transcript generated from audio — needs researcher review",
        updated_at: completedAt,
      })
      .eq("id", projectId),
    recordEditLog({
      action: "Generated transcript from audio and saved editable review draft",
      actionType: "transcript_generated",
      actor: "AI",
      newValue: {
        transcriptId: transcriptRow.id,
        jobId,
        rawCharacterCount: (rawTranscript ?? transcript).length,
        preparedCharacterCount: transcript.length,
        status: transcriptRow.status ?? "Needs Review",
      },
      projectId,
      step: "pre-analysis",
      targetId: transcriptRow.id,
      targetType: "transcript",
    }),
  ]);

  return {
    saved: true,
    transcript: mapTranscriptRecord(transcriptRow as TranscriptRow),
    job: mapTranscriptionJob(jobRow),
  };
}

export async function importTranscriptForAnalysis({
  language,
  projectId = defaultProjectId,
  sourceLabel,
  transcript,
}: {
  language: Project["language"];
  projectId?: string;
  sourceLabel: string;
  transcript: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: transcriptRow, error: transcriptError } = await supabase
    .from("transcripts")
    .insert({
      project_id: projectId,
      content: transcript,
      version_label: sourceLabel,
    })
    .select()
    .single();

  if (transcriptError) {
    throw new Error(transcriptError.message);
  }

  await Promise.all([
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase
      .from("integrity_review_items")
      .delete()
      .eq("project_id", projectId),
    supabase.from("integrity_reviews").delete().eq("project_id", projectId),
    supabase
      .from("integration_relationships")
      .delete()
      .eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
  ]);

  const segmentId = stableId("seg", projectId, Date.now());
  const { error: segmentError } = await supabase.from("segments").insert({
    id: segmentId,
    project_id: projectId,
    case_id: "CASE-001",
    segment_id: "SEG-001",
    speaker_info: "Imported transcript",
    start_timestamp: "00:00",
    end_timestamp: "00:00",
    starting_mu_number: 1,
    status: "Ready",
    text: transcript,
  });

  if (segmentError) {
    throw new Error(segmentError.message);
  }

  const importedAt = new Date().toISOString();
  await Promise.all([
    supabase
      .from("projects")
      .update({
        language,
        status: "Transcript imported",
        updated_at: importedAt,
      })
      .eq("id", projectId),
    supabase.from("audit_events").insert({
      project_id: projectId,
      actor: "Researcher",
      action: "Imported transcript for analysis",
      target: transcriptRow.id,
    }),
  ]);

  return {
    saved: true,
    transcript: mapTranscriptRecord(transcriptRow as TranscriptRow),
  };
}

export async function clearProjectTranscriptData(projectId = defaultProjectId) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { cleared: false, reason: "Supabase is not configured." };
  }

  const { data: audioRows } = await supabase
    .from("audio_files")
    .select("storage_bucket, storage_path")
    .eq("project_id", projectId);

  const storageByBucket = new Map<string, string[]>();
  (audioRows ?? []).forEach((row) => {
    const paths = storageByBucket.get(row.storage_bucket) ?? [];
    paths.push(row.storage_path);
    storageByBucket.set(row.storage_bucket, paths);
  });

  await Promise.all(
    Array.from(storageByBucket.entries()).map(([bucket, paths]) =>
      supabase.storage.from(bucket).remove(paths),
    ),
  );

  await Promise.all([
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase
      .from("integrity_review_items")
      .delete()
      .eq("project_id", projectId),
    supabase.from("integrity_reviews").delete().eq("project_id", projectId),
    supabase.from("exports").delete().eq("project_id", projectId),
    supabase.from("edit_logs").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase
      .from("integration_relationships")
      .delete()
      .eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("transcription_jobs").delete().eq("project_id", projectId),
    supabase.from("audio_files").delete().eq("project_id", projectId),
    supabase.from("transcripts").delete().eq("project_id", projectId),
    supabase.from("audit_events").delete().eq("project_id", projectId),
  ]);

  await supabase
    .from("projects")
    .update({
      status: "Ready for local testing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId);

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: "Deleted transcript, uploads, and derived outputs",
    target: "Project data minimisation",
  });

  return { cleared: true };
}

async function insertTranscriptWithOptionalPrivacyMetadata({
  anonymisationStatus,
  cleanedContent,
  content,
  finalContent,
  projectId,
  rawContent,
  rawTranscriptRetained,
  sensitiveItems,
  status,
  supabase,
  versionLabel,
}: TranscriptPrivacyMetadata & {
  content: string;
  projectId: string;
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>;
  versionLabel: string;
}) {
  const now = new Date().toISOString();
  const baseRow = {
    project_id: projectId,
    content,
    version_label: versionLabel,
  };
  const privacyRow = {
    ...baseRow,
    anonymisation_status: anonymisationStatus ?? "reviewed",
    raw_transcript_retained: rawTranscriptRetained ?? false,
    sensitive_items: sensitiveItems ?? [],
    sensitive_items_reviewed_at: now,
    reviewed_by: null,
  };
  const reviewRow = {
    ...privacyRow,
    raw_content: rawContent ?? null,
    cleaned_content: cleanedContent ?? content,
    final_content: finalContent ?? null,
    status: status ?? "Needs Review",
    updated_at: now,
  };

  const result = await supabase
    .from("transcripts")
    .insert(reviewRow)
    .select()
    .single();

  if (!result.error) {
    return result;
  }

  const missingReviewColumn =
    result.error.message.includes("raw_content") ||
    result.error.message.includes("cleaned_content") ||
    result.error.message.includes("final_content") ||
    result.error.message.includes("status") ||
    result.error.message.includes("updated_at");

  if (missingReviewColumn) {
    const privacyResult = await supabase
      .from("transcripts")
      .insert(privacyRow)
      .select()
      .single();

    if (!privacyResult.error) {
      return privacyResult;
    }

    const missingPrivacyColumn =
      privacyResult.error.message.includes("anonymisation_status") ||
      privacyResult.error.message.includes("raw_transcript_retained") ||
      privacyResult.error.message.includes("sensitive_items") ||
      privacyResult.error.message.includes("sensitive_items_reviewed_at") ||
      privacyResult.error.message.includes("reviewed_by");

    if (!missingPrivacyColumn) {
      return privacyResult;
    }

    return supabase.from("transcripts").insert(baseRow).select().single();
  }

  const missingPrivacyColumn =
    result.error.message.includes("anonymisation_status") ||
    result.error.message.includes("raw_transcript_retained") ||
    result.error.message.includes("sensitive_items") ||
    result.error.message.includes("sensitive_items_reviewed_at") ||
    result.error.message.includes("reviewed_by");

  if (!missingPrivacyColumn) {
    return result;
  }

  return supabase.from("transcripts").insert(baseRow).select().single();
}

export async function confirmTranscriptForAnalysis({
  anonymisationStatus = "confirmed",
  content,
  language,
  projectId = defaultProjectId,
  rawTranscriptRetained = false,
  sensitiveItems = [],
}: {
  anonymisationStatus?: TranscriptPrivacyMetadata["anonymisationStatus"];
  content: string;
  language: Project["language"];
  projectId?: string;
  rawTranscriptRetained?: boolean;
  sensitiveItems?: unknown[];
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: previousTranscript } = await supabase
    .from("transcripts")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: transcriptRow, error: transcriptError } =
    await insertTranscriptWithOptionalPrivacyMetadata({
      anonymisationStatus,
      cleanedContent: previousTranscript?.cleaned_content ?? content,
      content,
      finalContent: content,
      projectId,
      rawContent: previousTranscript?.raw_content ?? null,
      rawTranscriptRetained,
      sensitiveItems,
      status: "Confirmed",
      supabase,
      versionLabel: "Researcher-confirmed transcript",
    });

  if (transcriptError) {
    throw new Error(transcriptError.message);
  }

  await Promise.all([
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase
      .from("integrity_review_items")
      .delete()
      .eq("project_id", projectId),
    supabase.from("integrity_reviews").delete().eq("project_id", projectId),
    supabase
      .from("integration_relationships")
      .delete()
      .eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
  ]);

  const splitResult = autoSplitTranscript(content, {
    mode: "balanced",
    sourceTranscriptId: transcriptRow.id,
  });
  const splitStartedAt = Date.now();
  const segmentRows: Array<Database["public"]["Tables"]["segments"]["Insert"]> =
    (
      splitResult.segments.length > 0
        ? splitResult.segments
        : [
            {
              createdBy: "auto" as const,
              sourceTranscriptId: transcriptRow.id,
              splittingMode: "balanced" as const,
              text: content,
              title: "Researcher-confirmed transcript",
              wordCount: content.length,
            },
          ]
    ).map((segment, index) => ({
      id: stableId("seg", `${projectId}_${splitStartedAt}`, index + 1),
      project_id: projectId,
      case_id: "CASE-001",
      segment_id: `SEG-${String(index + 1).padStart(3, "0")}`,
      transcript_id: transcriptRow.id,
      segment_number: index + 1,
      topic_label: segment.title || `Segment ${index + 1}`,
      speaker_info: encodeSegmentSpeakerInfo(
        segment.title || `Segment ${index + 1}`,
        "unclear",
      ),
      start_timestamp: "00:00",
      end_timestamp: "00:00",
      starting_mu_number: index * 100 + 1,
      status: "Needs review" as const,
      text: segment.text,
    }));

  const { error: segmentError } = await supabase
    .from("segments")
    .insert(segmentRows);

  if (segmentError) {
    throw new Error(segmentError.message);
  }

  const confirmedAt = new Date().toISOString();
  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .update({
      language,
      status: "Transcript confirmed for analysis",
      updated_at: confirmedAt,
    })
    .eq("id", projectId)
    .select()
    .single();

  if (projectError) {
    throw new Error(projectError.message);
  }

  await recordEditLog({
    action: `Confirmed transcript for analysis and created ${segmentRows.length} draft meaning-unit candidate${segmentRows.length === 1 ? "" : "s"}`,
    actionType: "transcript_confirmed",
    newValue: {
      transcriptId: transcriptRow.id,
      segmentCount: segmentRows.length,
      characterCount: content.length,
      status: transcriptRow.status ?? "Confirmed",
    },
    previousValue: previousTranscript
      ? {
          transcriptId: previousTranscript.id,
          versionLabel: previousTranscript.version_label,
          status: previousTranscript.status,
          characterCount:
            getResearcherVisibleTranscript(previousTranscript).length,
        }
      : undefined,
    projectId,
    step: "pre-analysis",
    targetId: transcriptRow.id,
    targetType: "transcript",
  });

  return {
    saved: true,
    project: mapProject(projectRow),
    transcript: mapTranscriptRecord(transcriptRow as TranscriptRow),
  };
}

export async function failTranscriptionJob({
  errorMessage,
  jobId,
  projectId = defaultProjectId,
}: {
  errorMessage: string;
  jobId: string;
  projectId?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("transcription_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "AI",
    action: "Local transcription failed",
    target: errorMessage.slice(0, 180),
  });

  return { saved: true, job: mapTranscriptionJob(data) };
}

export async function createAudioPreviewUrl({
  audioFileId,
  projectId = defaultProjectId,
}: {
  audioFileId: string;
  projectId?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, reason: "Supabase is not configured." };
  }

  const { data: audioFile, error } = await supabase
    .from("audio_files")
    .select("*")
    .eq("id", audioFileId)
    .eq("project_id", projectId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const { data, error: signedUrlError } = await supabase.storage
    .from(audioFile.storage_bucket)
    .createSignedUrl(audioFile.storage_path, 60 * 10);

  if (signedUrlError) {
    throw new Error(signedUrlError.message);
  }

  return {
    ok: true,
    audioFile: mapAudioFile(audioFile),
    signedUrl: data.signedUrl,
  };
}

export async function updateMeaningUnit({
  analysisExcluded,
  excerpt,
  exclusionReason,
  humanStatus,
  humanSummary,
  speaker,
  unitId,
}: {
  analysisExcluded?: boolean;
  excerpt?: string;
  exclusionReason?: string | null;
  humanStatus?: MeaningUnit["humanStatus"];
  humanSummary?: string;
  speaker?: string;
  unitId: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: before, error: loadError } = await supabase
    .from("meaning_units")
    .select("*")
    .eq("id", unitId)
    .single();
  if (loadError) {
    throw new Error(loadError.message);
  }

  const updates: Database["public"]["Tables"]["meaning_units"]["Update"] = {
    updated_at: new Date().toISOString(),
  };
  if (humanStatus) {
    updates.human_status = humanStatus;
  }
  if (excerpt !== undefined) {
    updates.excerpt = excerpt;
  }
  if (humanSummary !== undefined) {
    updates.human_summary = humanSummary;
  }
  if (speaker !== undefined) {
    updates.speaker = speaker;
  }
  if (analysisExcluded !== undefined) {
    updates.analysis_excluded = analysisExcluded;
    updates.human_status = analysisExcluded ? "Excluded" : "Needs review";
    updates.exclusion_reason = analysisExcluded
      ? (exclusionReason ?? "Excluded from analysis by researcher")
      : null;
  } else if (exclusionReason !== undefined) {
    updates.exclusion_reason = exclusionReason;
  }

  const { data, error } = await supabase
    .from("meaning_units")
    .update(updates)
    .eq("id", unitId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const mappedBefore = mapMeaningUnit(before);
  const mappedAfter = mapMeaningUnit(data);
  const actionType: AuditActionType =
    analysisExcluded === true
      ? "meaning_unit_excluded"
      : humanStatus === "Accepted"
        ? "meaning_unit_accepted"
        : "meaning_unit_edited";
  const action =
    analysisExcluded === true
      ? `Excluded MU ${data.unit_number} from analysis`
      : analysisExcluded === false
        ? `Restored MU ${data.unit_number} to researcher review`
        : humanStatus === "Accepted"
          ? `Accepted MU ${data.unit_number}`
          : excerpt !== undefined && humanSummary !== undefined
            ? `Edited MU ${data.unit_number} excerpt and summary`
            : excerpt !== undefined
              ? `Edited MU ${data.unit_number} excerpt`
              : humanSummary !== undefined
                ? `Edited MU ${data.unit_number} summary`
                : speaker !== undefined
                  ? `Edited MU ${data.unit_number} speaker label`
                  : `Updated MU ${data.unit_number}`;

  await recordEditLog({
    action,
    actionType,
    newValue: mappedAfter,
    previousValue: mappedBefore,
    projectId: data.project_id,
    researcherNote: data.exclusion_reason ?? undefined,
    step: "understanding",
    targetId: data.id,
    targetType: "meaning_unit",
  });

  const shouldClearDerivedWork =
    analysisExcluded !== undefined ||
    (humanStatus !== "Accepted" &&
      (excerpt !== undefined ||
        humanSummary !== undefined ||
        speaker !== undefined));

  if (shouldClearDerivedWork) {
    await clearDerivedCategoryWork(data.project_id);
  }

  return { saved: true, meaningUnit: mappedAfter };
}

export async function createManualMeaningUnit({
  caseId = "CASE-001",
  excerpt,
  humanSummary = "",
  projectId = defaultProjectId,
  researcherNote,
  segmentId = "SEG-001",
  speaker = "Participant",
}: {
  caseId?: string;
  excerpt: string;
  humanSummary?: string;
  projectId?: string;
  researcherNote?: string;
  segmentId?: string;
  speaker?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const existingUnits = await loadRawMeaningUnits(projectId);
  const nextNumber =
    existingUnits.reduce((max, unit) => Math.max(max, unit.unit_number), 0) + 1;
  const row: Database["public"]["Tables"]["meaning_units"]["Insert"] = {
    id: stableId("mu", `${projectId}_manual_${Date.now()}`, nextNumber),
    project_id: projectId,
    segment_id: segmentId,
    case_id: caseId,
    speaker,
    unit_number: nextNumber,
    excerpt: excerpt.trim(),
    ai_summary: "",
    human_summary: humanSummary.trim(),
    tentative_interpretation: null,
    uncertainty: researcherNote || "Researcher-created meaning unit",
    human_status: "Needs review",
    reviewer_status: "Not run",
    analysis_excluded: false,
    exclusion_reason: null,
  };

  const { data, error } = await supabase
    .from("meaning_units")
    .insert(row)
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }

  await clearDerivedCategoryWork(projectId);
  await recordEditLog({
    action: `Created manual MU ${data.unit_number}`,
    actionType: "meaning_unit_created",
    newValue: mapMeaningUnit(data),
    projectId,
    researcherNote,
    step: "understanding",
    targetId: data.id,
    targetType: "meaning_unit",
  });

  return {
    saved: true,
    meaningUnit: mapMeaningUnit(data),
    units: await loadMeaningUnits(projectId),
  };
}

export async function splitMeaningUnit({
  firstExcerpt,
  firstSummary = "",
  projectId = defaultProjectId,
  researcherNote,
  secondExcerpt,
  secondSummary = "",
  unitId,
}: {
  firstExcerpt: string;
  firstSummary?: string;
  projectId?: string;
  researcherNote?: string;
  secondExcerpt: string;
  secondSummary?: string;
  unitId: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: before, error: loadError } = await supabase
    .from("meaning_units")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", unitId)
    .single();
  if (loadError) {
    throw new Error(loadError.message);
  }

  const now = new Date().toISOString();
  const secondNumber = before.unit_number + 1;
  const { data: followingUnits, error: followingError } = await supabase
    .from("meaning_units")
    .select("id, unit_number")
    .eq("project_id", projectId)
    .gte("unit_number", secondNumber)
    .order("unit_number", { ascending: false });
  if (followingError) {
    throw new Error(followingError.message);
  }
  await Promise.all(
    (followingUnits ?? []).map((unit) =>
      supabase
        .from("meaning_units")
        .update({ unit_number: unit.unit_number + 10000, updated_at: now })
        .eq("id", unit.id),
    ),
  );
  const secondRow: Database["public"]["Tables"]["meaning_units"]["Insert"] = {
    id: stableId("mu", `${projectId}_split_${Date.now()}`, secondNumber),
    project_id: projectId,
    segment_id: before.segment_id,
    case_id: before.case_id,
    speaker: before.speaker,
    unit_number: secondNumber,
    excerpt: secondExcerpt.trim(),
    ai_summary: "",
    human_summary: secondSummary.trim(),
    tentative_interpretation: null,
    uncertainty: "Researcher split from an existing MU",
    human_status: "Needs review",
    reviewer_status: "Not run",
    analysis_excluded: false,
    exclusion_reason: null,
    updated_at: now,
  };

  const { data: firstRow, error: updateError } = await supabase
    .from("meaning_units")
    .update({
      excerpt: firstExcerpt.trim(),
      human_summary: firstSummary.trim(),
      human_status: "Needs review",
      analysis_excluded: false,
      exclusion_reason: null,
      updated_at: now,
    })
    .eq("id", unitId)
    .select()
    .single();
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data: insertedSecond, error: insertError } = await supabase
    .from("meaning_units")
    .insert(secondRow)
    .select()
    .single();
  if (insertError) {
    throw new Error(insertError.message);
  }

  await renumberMeaningUnits(projectId);
  await clearDerivedCategoryWork(projectId);
  await recordEditLog({
    action: `Split MU ${before.unit_number} into two reviewable meaning units`,
    actionType: "meaning_unit_split",
    newValue: {
      first: mapMeaningUnit(firstRow),
      second: mapMeaningUnit(insertedSecond),
    },
    previousValue: mapMeaningUnit(before),
    projectId,
    researcherNote,
    step: "understanding",
    targetId: before.id,
    targetType: "meaning_unit",
  });

  return { saved: true, units: await loadMeaningUnits(projectId) };
}

export async function mergeMeaningUnits({
  mergedExcerpt,
  mergedSummary,
  projectId = defaultProjectId,
  researcherNote,
  sourceUnitId,
  targetUnitId,
}: {
  mergedExcerpt?: string;
  mergedSummary?: string;
  projectId?: string;
  researcherNote?: string;
  sourceUnitId: string;
  targetUnitId: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: rows, error: loadError } = await supabase
    .from("meaning_units")
    .select("*")
    .eq("project_id", projectId)
    .in("id", [sourceUnitId, targetUnitId]);
  if (loadError) {
    throw new Error(loadError.message);
  }
  if (!rows || rows.length !== 2) {
    return {
      saved: false,
      reason: "Could not find both meaning units to merge.",
    };
  }

  const [first, second] = [...rows].sort(
    (left, right) => left.unit_number - right.unit_number,
  );
  const mergedText =
    mergedExcerpt?.trim() ||
    `${first.excerpt.trim()}\n\n${second.excerpt.trim()}`.trim();
  const firstSummary = first.human_summary || first.ai_summary || "";
  const secondSummary = second.human_summary || second.ai_summary || "";
  const mergedHumanSummary =
    mergedSummary?.trim() ||
    [firstSummary, secondSummary].filter(Boolean).join(" / ");

  const { data: mergedRow, error: updateError } = await supabase
    .from("meaning_units")
    .update({
      excerpt: mergedText,
      human_summary: mergedHumanSummary,
      human_status: "Needs review",
      analysis_excluded: false,
      exclusion_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", first.id)
    .select()
    .single();
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: deleteError } = await supabase
    .from("meaning_units")
    .delete()
    .eq("id", second.id);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await renumberMeaningUnits(projectId);
  await clearDerivedCategoryWork(projectId);
  await recordEditLog({
    action: `Merged MU ${first.unit_number} and MU ${second.unit_number}`,
    actionType: "meaning_unit_merged",
    newValue: mapMeaningUnit(mergedRow),
    previousValue: [mapMeaningUnit(first), mapMeaningUnit(second)],
    projectId,
    researcherNote,
    step: "understanding",
    targetId: mergedRow.id,
    targetType: "meaning_unit",
  });

  return { saved: true, units: await loadMeaningUnits(projectId) };
}

export async function deleteMeaningUnit({ unitId }: { unitId: string }) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { deleted: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("meaning_units")
    .delete()
    .eq("id", unitId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await renumberMeaningUnits(data.project_id);
  await clearDerivedCategoryWork(data.project_id);
  await recordEditLog({
    action: `Deleted MU ${data.unit_number}`,
    actionType: "meaning_unit_deleted",
    previousValue: mapMeaningUnit(data),
    projectId: data.project_id,
    step: "understanding",
    targetId: data.id,
    targetType: "meaning_unit",
  });

  return {
    deleted: true,
    meaningUnit: mapMeaningUnit(data),
    units: await loadMeaningUnits(data.project_id),
  };
}

async function clearDerivedCategoryWork(projectId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return;
  }

  await Promise.all([
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase
      .from("integrity_review_items")
      .delete()
      .eq("project_id", projectId),
    supabase.from("integrity_reviews").delete().eq("project_id", projectId),
    supabase
      .from("integration_relationships")
      .delete()
      .eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
  ]);
}

export async function updateSegment({
  projectId = defaultProjectId,
  segmentId,
  speakerRole,
  status,
  text,
  topicLabel,
}: {
  projectId?: string;
  segmentId: string;
  speakerRole?: SegmentSpeakerRole;
  status?: TranscriptSegment["status"];
  text?: string;
  topicLabel?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const updates: Database["public"]["Tables"]["segments"]["Update"] = {};
  if (text !== undefined) {
    updates.text = text;
  }
  if (topicLabel !== undefined || speakerRole !== undefined) {
    updates.speaker_info = encodeSegmentSpeakerInfo(
      topicLabel ?? "Segment",
      normalizeSegmentSpeakerRole(speakerRole),
    );
  }
  if (status !== undefined) {
    updates.status = toStoredSegmentStatus(status);
  }

  const { data, error } = await supabase
    .from("segments")
    .update(updates)
    .eq("project_id", projectId)
    .eq("id", segmentId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: `Updated segment ${data.segment_id}`,
    target: data.id,
  });
  await recordEditLog({
    action: `Updated segment ${data.segment_id}`,
    actionType: speakerRole
      ? "segment_speaker_role_updated"
      : "segment_updated",
    newValue: mapSegment(data),
    projectId,
    step: "understanding",
    targetId: data.id,
    targetType: "segment",
  });

  return { saved: true, segment: mapSegment(data) };
}

export async function splitSegment({
  afterText,
  beforeText,
  projectId = defaultProjectId,
  segmentId,
}: {
  afterText: string;
  beforeText: string;
  projectId?: string;
  segmentId: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: segment, error: loadError } = await supabase
    .from("segments")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", segmentId)
    .single();
  if (loadError) {
    throw new Error(loadError.message);
  }

  const { data: existingSegments, error: existingError } = await supabase
    .from("segments")
    .select("*")
    .eq("project_id", projectId)
    .order("segment_id", { ascending: true });
  if (existingError) {
    throw new Error(existingError.message);
  }

  const insertIndex =
    (existingSegments ?? []).findIndex((item) => item.id === segmentId) + 1;
  const newSegmentDbId = stableId("seg", projectId, Date.now());
  const newSegment = {
    id: newSegmentDbId,
    project_id: projectId,
    case_id: segment.case_id,
    segment_id: `SEG-${String(insertIndex + 1).padStart(3, "0")}`,
    speaker_info: encodeSegmentSpeakerInfo(
      `${stripSegmentSpeakerRolePrefix(segment.speaker_info || segment.segment_id)} (continued)`,
      speakerRoleFromStoredInfo(segment.speaker_info || ""),
    ),
    start_timestamp: segment.start_timestamp,
    end_timestamp: segment.end_timestamp,
    starting_mu_number: segment.starting_mu_number,
    status: "Needs review" as const,
    text: afterText.trim(),
  };

  const { error: updateError } = await supabase
    .from("segments")
    .update({
      status: "Needs review",
      text: beforeText.trim(),
    })
    .eq("id", segmentId);
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: insertError } = await supabase
    .from("segments")
    .insert(newSegment);
  if (insertError) {
    throw new Error(insertError.message);
  }

  await renumberSegments(projectId);
  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: `Split segment ${segment.segment_id}`,
    target: segment.id,
  });

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function mergeSegment({
  direction,
  projectId = defaultProjectId,
  segmentId,
}: {
  direction: "previous" | "next";
  projectId?: string;
  segmentId: string;
}) {
  const segments = await loadRawSegments(projectId);
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const neighborIndex = direction === "previous" ? index - 1 : index + 1;
  const segment = segments[index];
  const neighbor = segments[neighborIndex];
  if (!segment || !neighbor) {
    return { saved: false, reason: "No segment is available to merge." };
  }

  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const target = direction === "previous" ? neighbor : segment;
  const remove = direction === "previous" ? segment : neighbor;
  const mergedText =
    direction === "previous"
      ? `${neighbor.text.trim()}\n\n${segment.text.trim()}`
      : `${segment.text.trim()}\n\n${neighbor.text.trim()}`;

  const { error: updateError } = await supabase
    .from("segments")
    .update({
      speaker_info: encodeSegmentSpeakerInfo(
        stripSegmentSpeakerRolePrefix(target.speaker_info || target.segment_id),
        speakerRoleFromStoredInfo(target.speaker_info || ""),
      ),
      status: "Needs review",
      text: mergedText,
    })
    .eq("id", target.id);
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: deleteError } = await supabase
    .from("segments")
    .delete()
    .eq("id", remove.id);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

  await renumberSegments(projectId);
  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: `Merged segment ${segment.segment_id}`,
    target: target.id,
  });

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function deleteSegment({
  projectId = defaultProjectId,
  segmentId,
}: {
  projectId?: string;
  segmentId: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from("segments")
    .delete()
    .eq("project_id", projectId)
    .eq("id", segmentId);
  if (error) {
    throw new Error(error.message);
  }

  await renumberSegments(projectId);
  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: "Deleted segment",
    target: segmentId,
  });

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function moveSegment({
  direction,
  projectId = defaultProjectId,
  segmentId,
}: {
  direction: "up" | "down";
  projectId?: string;
  segmentId: string;
}) {
  const segments = await loadRawSegments(projectId);
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= segments.length) {
    return { saved: false, reason: "Segment cannot be moved further." };
  }

  const reordered = [...segments];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moved);
  await renumberSegments(
    projectId,
    reordered.map((segment) => segment.id),
  );

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function autoSplitSegmentsFromTranscript({
  caseId = "CASE-001",
  projectId = defaultProjectId,
  researchQuestion,
  splittingMode = "balanced",
  transcript,
}: {
  caseId?: string;
  projectId?: string;
  researchQuestion?: string;
  splittingMode?: AutoSegmentMode;
  transcript: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      saved: false,
      reason: "Supabase is not configured.",
      segments: [],
    };
  }

  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    return {
      saved: false,
      reason:
        "No transcript text found. Please confirm or edit the transcript before auto-splitting.",
      segments: [],
    };
  }

  const splitResult = autoSplitTranscript(trimmedTranscript, {
    mode: splittingMode,
    researchQuestion,
    sourceTranscriptId: projectId,
  });
  const now = Date.now();

  await Promise.all([
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase
      .from("integrity_review_items")
      .delete()
      .eq("project_id", projectId),
    supabase.from("integrity_reviews").delete().eq("project_id", projectId),
    supabase
      .from("integration_relationships")
      .delete()
      .eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
  ]);

  const rows: Array<Database["public"]["Tables"]["segments"]["Insert"]> =
    splitResult.segments.map((segment, index) => ({
      id: stableId("seg", `${projectId}_${now}`, index + 1),
      project_id: projectId,
      case_id: caseId,
      segment_id: `SEG-${String(index + 1).padStart(3, "0")}`,
      speaker_info: encodeSegmentSpeakerInfo(segment.title, "unclear"),
      start_timestamp: "00:00",
      end_timestamp: "00:00",
      starting_mu_number: index * 100 + 1,
      status: "Needs review" as const,
      text: segment.text,
    }));

  const { error } = await supabase.from("segments").insert(rows);
  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: `Auto-split transcript into ${rows.length} segment${rows.length === 1 ? "" : "s"}`,
    target: "Segment Manager",
  });

  return {
    notice: splitResult.notice,
    saved: true,
    segments: await loadSegments(projectId),
  };
}

export async function speakerSplitSegmentsFromTranscript({
  caseId = "CASE-001",
  projectId = defaultProjectId,
  transcript,
}: {
  caseId?: string;
  projectId?: string;
  transcript: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      saved: false,
      reason: "Supabase is not configured.",
      segments: [],
    };
  }

  const turns = splitTranscriptBySpeakerLabels(transcript);
  if (turns.length === 0) {
    return {
      saved: false,
      reason:
        "No transcript text found. Confirm or edit a transcript before speaker splitting.",
      segments: [],
    };
  }

  const now = Date.now();
  await Promise.all([
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase
      .from("integrity_review_items")
      .delete()
      .eq("project_id", projectId),
    supabase.from("integrity_reviews").delete().eq("project_id", projectId),
    supabase
      .from("integration_relationships")
      .delete()
      .eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
  ]);

  const rows: Array<Database["public"]["Tables"]["segments"]["Insert"]> =
    turns.map((turn, index) => ({
      id: stableId("seg", `${projectId}_${now}_speaker`, index + 1),
      project_id: projectId,
      case_id: caseId,
      segment_id: `SEG-${String(index + 1).padStart(3, "0")}`,
      speaker_info: encodeSegmentSpeakerInfo(turn.label, turn.role),
      start_timestamp: "00:00",
      end_timestamp: "00:00",
      starting_mu_number: index * 100 + 1,
      status:
        turn.role === "interviewer"
          ? ("Needs review" as const)
          : ("Ready" as const),
      text: turn.text,
    }));

  const { error } = await supabase.from("segments").insert(rows);
  if (error) {
    throw new Error(error.message);
  }

  await recordEditLog({
    action: `Split transcript into ${rows.length} speaker segment${rows.length === 1 ? "" : "s"}`,
    actionType: "segment_updated",
    actor: "Researcher",
    newValue: rows.map((row) => ({
      segmentId: row.segment_id,
      speakerInfo: row.speaker_info,
      status: row.status,
    })),
    projectId,
    step: "understanding",
    targetId: "speaker-segmentation",
    targetType: "segment",
  });

  return {
    notice:
      "Speaker-labelled segments created. Interviewer-only segments are kept for context and ignored by default when generating meaning-unit drafts.",
    saved: true,
    segments: await loadSegments(projectId),
  };
}

export async function saveGuidanceMemo({
  answer,
  projectId = defaultProjectId,
  question,
  step,
}: {
  answer: string;
  projectId?: string;
  question: string;
  step: WorkflowStep;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  await recordEditLog({
    action: `Saved methodological guidance memo for ${step}`,
    actionType: "guidance_memo_saved",
    actor: "Researcher",
    newValue: { answer, question, step },
    projectId,
    researcherNote: question,
    step,
    targetId: `guidance_${Date.now()}`,
    targetType: "workspace",
  });

  return { saved: true };
}

export async function replaceMeaningUnitsForSegment({
  projectId = defaultProjectId,
  segmentId,
  units,
}: {
  projectId?: string;
  segmentId: string;
  units: MeaningUnit[];
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured.", units };
  }

  const { data: previousUnits } = await supabase
    .from("meaning_units")
    .select("*")
    .eq("project_id", projectId)
    .eq("segment_id", segmentId);

  await supabase
    .from("meaning_units")
    .delete()
    .eq("project_id", projectId)
    .eq("segment_id", segmentId);

  const rows: Array<Database["public"]["Tables"]["meaning_units"]["Insert"]> =
    units.map((unit) => ({
      id: stableId("mu", `${projectId}_${segmentId}`, unit.number),
      project_id: projectId,
      segment_id: segmentId,
      case_id: unit.caseId,
      speaker: unit.speaker,
      unit_number: unit.number,
      excerpt: unit.excerpt,
      ai_summary: unit.aiSummary,
      human_summary: unit.humanSummary,
      tentative_interpretation: unit.tentativeInterpretation ?? null,
      uncertainty: unit.uncertainty ?? null,
      human_status: unit.humanStatus,
      reviewer_status: unit.reviewerStatus,
      analysis_excluded: unit.analysisExcluded,
      exclusion_reason: unit.exclusionReason ?? null,
    }));

  const { data, error } = await supabase
    .from("meaning_units")
    .insert(rows)
    .select()
    .order("unit_number", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  await supabase
    .from("segments")
    .update({ status: "Processed" })
    .eq("project_id", projectId)
    .eq("segment_id", segmentId);

  await recordEditLog({
    action: `Generated ${units.length} draft meaning units for ${segmentId}`,
    actionType: "meaning_units_generated",
    actor: "AI",
    newValue: (data ?? []).map(mapMeaningUnit),
    previousValue: (previousUnits ?? []).map(mapMeaningUnit),
    projectId,
    step: "understanding",
    targetId: segmentId,
    targetType: "meaning_unit",
  });

  return {
    saved: true,
    units: (data ?? []).map(mapMeaningUnit),
  };
}

export async function replaceMeaningUnitsFromAi({
  projectId = defaultProjectId,
  units,
}: {
  projectId?: string;
  units: MeaningUnit[];
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured.", units };
  }

  const { data: previousUnits } = await supabase
    .from("meaning_units")
    .select("*")
    .eq("project_id", projectId);

  await Promise.all([
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    clearDerivedCategoryWork(projectId),
  ]);

  if (units.length === 0) {
    await recordEditLog({
      action: "Cleared draft meaning units",
      actionType: "meaning_units_generated",
      actor: "AI",
      newValue: [],
      previousValue: (previousUnits ?? []).map(mapMeaningUnit),
      projectId,
      step: "understanding",
      targetId: projectId,
      targetType: "meaning_unit",
    });
    return { saved: true, units: [] };
  }

  const rows: Array<Database["public"]["Tables"]["meaning_units"]["Insert"]> =
    units.map((unit) => ({
      id: stableId("mu", projectId, unit.number),
      project_id: projectId,
      segment_id: unit.segmentId,
      case_id: unit.caseId,
      speaker: unit.speaker,
      unit_number: unit.number,
      excerpt: unit.excerpt,
      ai_summary: unit.aiSummary,
      human_summary: unit.humanSummary,
      tentative_interpretation: unit.tentativeInterpretation ?? null,
      uncertainty: unit.uncertainty ?? null,
      human_status: unit.humanStatus,
      reviewer_status: unit.reviewerStatus,
      analysis_excluded: unit.analysisExcluded,
      exclusion_reason: unit.exclusionReason ?? null,
    }));

  const { data, error } = await supabase
    .from("meaning_units")
    .insert(rows)
    .select()
    .order("unit_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  await recordEditLog({
    action: `Generated ${units.length} draft meaning units from confirmed transcript`,
    actionType: "meaning_units_generated",
    actor: "AI",
    newValue: (data ?? []).map(mapMeaningUnit),
    previousValue: (previousUnits ?? []).map(mapMeaningUnit),
    projectId,
    step: "understanding",
    targetId: projectId,
    targetType: "meaning_unit",
  });

  return {
    saved: true,
    units: (data ?? []).map(mapMeaningUnit),
  };
}

export async function saveCategorySystemFromAi({
  categories,
  integratedNarrative,
  mode,
  projectId = defaultProjectId,
}: {
  categories: CategoryNode[];
  integratedNarrative: string;
  mode: CategoryMode;
  projectId?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      saved: false,
      reason: "Supabase is not configured.",
      categories,
      integratedNarrative,
    };
  }

  const { data: system, error: systemError } = await supabase
    .from("category_systems")
    .insert({
      project_id: projectId,
      mode,
      integrated_narrative: integratedNarrative,
    })
    .select()
    .single();

  if (systemError) {
    throw new Error(systemError.message);
  }

  const rows = flattenCategoryRows(categories, system.id);
  if (rows.length > 0) {
    const { error } = await supabase.from("categories").insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "AI",
    action: `Generated local AI category system Mode ${mode}`,
    target: system.id,
  });

  return {
    saved: true,
    categories,
    integratedNarrative,
  };
}

export async function saveCategorySystemFromResearcher({
  action = "Updated researcher category system",
  actionType = "category_updated",
  categories,
  integratedNarrative = "",
  mode = "A",
  previousCategories,
  projectId = defaultProjectId,
  researcherNote,
}: {
  action?: string;
  actionType?: AuditActionType;
  categories: CategoryNode[];
  integratedNarrative?: string;
  mode?: CategoryMode;
  previousCategories?: CategoryNode[];
  projectId?: string;
  researcherNote?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      saved: false,
      reason: "Supabase is not configured.",
      categories,
      integratedNarrative,
    };
  }

  const { data: system, error: systemError } = await supabase
    .from("category_systems")
    .insert({
      project_id: projectId,
      mode,
      integrated_narrative: integratedNarrative,
    })
    .select()
    .single();

  if (systemError) {
    throw new Error(systemError.message);
  }

  const rows = flattenCategoryRows(categories, system.id);
  if (rows.length > 0) {
    const { error } = await supabase.from("categories").insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }

  await recordEditLog({
    action,
    actionType,
    actor: "Researcher",
    newValue: categories,
    previousValue: previousCategories,
    projectId,
    researcherNote,
    step: "categorizing",
    targetId: system.id,
    targetType: "category_system",
  });

  return {
    saved: true,
    categories,
    integratedNarrative,
  };
}

export interface IntegrationRelationshipDraftForSave {
  evidenceUnitNumbers?: number[];
  id?: string;
  label: IntegrationRelationship["label"];
  memo?: string;
  rationale?: string;
  researcherNote?: string;
  sourceCategoryId: string;
  targetCategoryId: string;
}

function encodeIntegrationRelationshipMemo(
  relationship: IntegrationRelationshipDraftForSave,
) {
  if (relationship.memo) {
    return relationship.memo;
  }

  return JSON.stringify({
    evidenceUnitNumbers: relationship.evidenceUnitNumbers ?? [],
    rationale: relationship.rationale ?? "",
    researcherNote: relationship.researcherNote ?? "",
  });
}

export async function saveIntegrationWorkspace({
  action = "Updated Step 4 integration workspace",
  actionType = "relationship_updated",
  integratedNarrative = "",
  integrationMemo = "",
  projectId = defaultProjectId,
  relationships,
  reviewed = false,
}: {
  action?: string;
  actionType?: AuditActionType;
  integratedNarrative?: string;
  integrationMemo?: string;
  projectId?: string;
  relationships: IntegrationRelationshipDraftForSave[];
  reviewed?: boolean;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return {
      saved: false,
      reason: "Supabase is not configured.",
      integratedNarrative,
      integrationMemo,
      relationships: [] as IntegrationRelationship[],
    };
  }

  const { data: previousSystem, error: previousSystemError } = await supabase
    .from("category_systems")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousSystemError) {
    throw new Error(previousSystemError.message);
  }

  const { data: previousRelationships, error: previousRelationshipsError } =
    await supabase
      .from("integration_relationships")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

  if (previousRelationshipsError) {
    throw new Error(previousRelationshipsError.message);
  }

  let categorySystemId = previousSystem?.id;
  if (categorySystemId) {
    const { error } = await supabase
      .from("category_systems")
      .update({
        integrated_narrative: integratedNarrative,
        integration_memo: integrationMemo,
      })
      .eq("id", categorySystemId);

    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { data: createdSystem, error } = await supabase
      .from("category_systems")
      .insert({
        project_id: projectId,
        mode: "A",
        integrated_narrative: integratedNarrative,
        integration_memo: integrationMemo,
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    categorySystemId = createdSystem.id;
  }

  const { error: deleteError } = await supabase
    .from("integration_relationships")
    .delete()
    .eq("project_id", projectId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  let savedRelationships: IntegrationRelationship[] = [];
  if (relationships.length > 0) {
    const rows: Array<
      Database["public"]["Tables"]["integration_relationships"]["Insert"]
    > = relationships.map((relationship, index) => ({
      id: stableId(
        "rel",
        `${projectId}_${relationship.sourceCategoryId}_${relationship.targetCategoryId}_${index}`,
        index + 1,
      ),
      project_id: projectId,
      category_system_id: categorySystemId ?? null,
      source_category_id: relationship.sourceCategoryId,
      target_category_id: relationship.targetCategoryId,
      relationship_label: relationship.label,
      memo: encodeIntegrationRelationshipMemo(relationship),
    }));

    const { data, error } = await supabase
      .from("integration_relationships")
      .insert(rows)
      .select()
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }
    savedRelationships = (data ?? []).map(mapIntegrationRelationship);
  }

  await recordEditLog({
    action,
    actionType: reviewed ? "relationship_updated" : actionType,
    actor: "Researcher",
    newValue: {
      integratedNarrative,
      integrationMemo,
      relationships: savedRelationships,
      reviewed,
    },
    previousValue: {
      integratedNarrative: previousSystem?.integrated_narrative ?? "",
      integrationMemo: previousSystem?.integration_memo ?? "",
      relationships: (previousRelationships ?? []).map(
        mapIntegrationRelationship,
      ),
    },
    projectId,
    step: "integrating",
    targetId: categorySystemId ?? projectId,
    targetType: "integration_relationship",
  });

  return {
    saved: true,
    integratedNarrative,
    integrationMemo,
    relationships: savedRelationships,
  };
}

export async function saveIntegrityReviewItems({
  action = "Updated methodological integrity review",
  items,
  projectId = defaultProjectId,
  researcherNote,
}: {
  action?: string;
  items: IntegrityReviewItem[];
  projectId?: string;
  researcherNote?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured.", items };
  }

  const { data: previousRows, error: previousError } = await supabase
    .from("integrity_review_items")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (previousError) {
    throw new Error(previousError.message);
  }

  const previousItems = (previousRows ?? []).map(mapIntegrityReviewItem);

  const rows: Array<
    Database["public"]["Tables"]["integrity_review_items"]["Insert"]
  > = items.map((item, index) => ({
    id:
      item.id ||
      stableId("integrity", `${projectId}_${item.checkKey}`, index + 1),
    project_id: projectId,
    check_key: item.checkKey,
    prompt: item.prompt,
    status: item.status,
    response: item.response,
    researcher_note: item.researcherNote,
    generated_from_state: item.generatedFromState,
  }));

  const { data, error } = await supabase
    .from("integrity_review_items")
    .upsert(rows, { onConflict: "id" })
    .select()
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  const savedItems = (data ?? []).map(mapIntegrityReviewItem);

  await recordEditLog({
    action,
    actionType: "integrity_review_updated",
    newValue: savedItems,
    previousValue: previousItems,
    projectId,
    researcherNote,
    step: "integrity",
    targetId: projectId,
    targetType: "integrity_review",
  });

  return { saved: true, items: savedItems };
}

export async function recordExportGenerated({
  format,
  projectId = defaultProjectId,
}: {
  format: "json" | "csv" | "txt" | "docx" | "pdf";
  projectId?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  let exportRecord: ExportRecord | undefined;
  if (format === "json" || format === "docx" || format === "pdf") {
    const { data, error } = await supabase
      .from("exports")
      .insert({
        project_id: projectId,
        format,
        storage_bucket: null,
        storage_path: null,
      })
      .select()
      .single();
    if (error) {
      throw new Error(error.message);
    }
    exportRecord = mapExportRecord(data);
  }

  await recordEditLog({
    action: `Generated ${format.toUpperCase()} export`,
    actionType: "export_generated",
    actor: "Researcher",
    newValue: {
      exportRecord,
      format,
    },
    projectId,
    step: "export",
    targetId: exportRecord?.id ?? `${projectId}-${format}-${Date.now()}`,
    targetType: "export",
  });

  return { saved: true, exportRecord };
}

export async function replaceReviewerCommentsFromAi({
  comments,
  projectId = defaultProjectId,
  workspace,
}: {
  comments: ReviewerComment[];
  projectId?: string;
  workspace?: ReviewerComment["workspace"];
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured.", comments };
  }

  await supabase
    .from("reviewer_comments")
    .delete()
    .eq("project_id", projectId)
    .in(
      "agent",
      workspace === "categories"
        ? ["GDIQR Category Review", "GDI-QR Category Review"]
        : ["GDIQR Meaning Units Review", "GDI-QR Meaning Units Review"],
    );

  if (comments.length === 0) {
    return { saved: true, comments: [] };
  }

  const rows: Array<
    Database["public"]["Tables"]["reviewer_comments"]["Insert"]
  > = comments.map((comment, index) => ({
    id: stableId(
      "rev",
      `${projectId}_${comment.workspace}_${Date.now()}`,
      index + 1,
    ),
    project_id: projectId,
    agent: comment.agent,
    target: comment.target,
    severity: toStoredReviewerSeverity(comment.severity),
    comment: comment.comment,
    suggested_action: encodeReviewerPayload(comment),
    resolved: comment.resolved,
  }));

  const { data, error } = await supabase
    .from("reviewer_comments")
    .insert(rows)
    .select()
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  await recordEditLog({
    action: `Generated ${comments.length} ${workspace ?? "GDI-QR-informed"} reviewer issues`,
    actionType: "reviewer_issue_generated",
    actor: "Reviewer",
    newValue: (data ?? []).map(mapReviewerComment),
    projectId,
    step: "integrity",
    targetId: workspace ?? "reviewer-checks",
    targetType: "reviewer_comment",
  });

  return {
    saved: true,
    comments: (data ?? []).map(mapReviewerComment),
  };
}

export async function updateReviewerComment({
  commentId,
  memo,
  projectId = defaultProjectId,
  status,
}: {
  commentId: string;
  memo?: string;
  projectId?: string;
  status?: ReviewerIssueStatus;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data: current, error: loadError } = await supabase
    .from("reviewer_comments")
    .select("*")
    .eq("project_id", projectId)
    .eq("id", commentId)
    .single();
  if (loadError) {
    throw new Error(loadError.message);
  }

  const mapped = mapReviewerComment(current);
  const nextStatus = status ?? mapped.status;
  const nextComment: ReviewerComment = {
    ...mapped,
    researcherMemo: memo ?? mapped.researcherMemo,
    resolved: nextStatus === "resolved" || nextStatus === "dismissed",
    resolvedAt:
      nextStatus === "resolved" || nextStatus === "dismissed"
        ? new Date().toISOString()
        : undefined,
    status: nextStatus,
  };

  const { data, error } = await supabase
    .from("reviewer_comments")
    .update({
      resolved: nextComment.resolved,
      suggested_action: encodeReviewerPayload(nextComment),
    })
    .eq("project_id", projectId)
    .eq("id", commentId)
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }

  await recordEditLog({
    action: `Updated reviewer issue: ${nextStatus}`,
    actionType: "reviewer_issue_resolved",
    actor: "Researcher",
    newValue: mapReviewerComment(data),
    previousValue: mapped,
    projectId,
    researcherNote: memo,
    step: "integrity",
    targetId: commentId,
    targetType: "reviewer_comment",
  });

  return { saved: true, comment: mapReviewerComment(data) };
}

function mapProject(row: Database["public"]["Tables"]["projects"]["Row"]) {
  return {
    id: row.id,
    title: row.title,
    researchQuestion: row.research_question,
    studyDescription: row.study_description,
    language: row.language,
    protocol: row.protocol,
    lightInterpretation: row.light_interpretation,
    status: row.status,
    updatedAt: row.updated_at,
    datasetType: row.dataset_type,
    dataSource: row.data_source,
    dataSuitabilityConfirmed: row.data_suitability_confirmed,
    dataSuitabilityConfirmedAt: row.data_suitability_confirmed_at ?? undefined,
    researcherNotes: row.researcher_notes,
    metadata: isRecord(row.metadata) ? row.metadata : {},
  } satisfies Project;
}

function flattenCategoryRows(
  categories: CategoryNode[],
  categorySystemId: string,
  parentId: string | null = null,
  offset = 0,
): Array<Database["public"]["Tables"]["categories"]["Insert"]> {
  return categories.flatMap((category, index) => {
    const sortOrder = offset + index + 1;
    const id = stableId("cat", categorySystemId, sortOrder);
    const row: Database["public"]["Tables"]["categories"]["Insert"] = {
      id,
      category_system_id: categorySystemId,
      parent_category_id: parentId,
      name: category.name,
      definition: category.definition,
      included_unit_numbers: category.includedUnitIds,
      sort_order: sortOrder,
      memo: category.memo ?? category.rationale ?? "",
      source: category.source ?? "ai",
      status: category.status ?? "ai_draft",
      intentionally_uncategorised_unit_numbers:
        category.intentionallyUncategorisedUnitIds ?? [],
    };

    return [
      row,
      ...flattenCategoryRows(
        category.subcategories ?? [],
        categorySystemId,
        id,
        sortOrder * 100,
      ),
    ];
  });
}

function stableId(prefix: string, scope: string, number: number) {
  return `${prefix}_${scope.replace(/[^a-zA-Z0-9]/g, "_")}_${String(
    number,
  ).padStart(3, "0")}`;
}

async function loadRawSegments(projectId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("project_id", projectId)
    .order("segment_id", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function loadSegments(projectId: string) {
  return (await loadRawSegments(projectId)).map(mapSegment);
}

async function loadRawMeaningUnits(projectId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("meaning_units")
    .select("*")
    .eq("project_id", projectId)
    .order("unit_number", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function loadMeaningUnits(projectId: string) {
  return (await loadRawMeaningUnits(projectId)).map(mapMeaningUnit);
}

async function renumberMeaningUnits(projectId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return;
  }

  const units = await loadRawMeaningUnits(projectId);
  await Promise.all(
    units.map((unit, index) =>
      supabase
        .from("meaning_units")
        .update({
          unit_number: index + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", unit.id),
    ),
  );
}

async function renumberSegments(projectId: string, orderedIds?: string[]) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return;
  }

  const segments = await loadRawSegments(projectId);
  const ordered = orderedIds
    ? orderedIds
        .map((id) => segments.find((segment) => segment.id === id))
        .filter((segment): segment is NonNullable<typeof segment> =>
          Boolean(segment),
        )
    : segments;

  await Promise.all(
    ordered.map((segment, index) =>
      supabase
        .from("segments")
        .update({
          segment_id: `SEG-${String(index + 1).padStart(3, "0")}`,
          starting_mu_number: index * 100 + 1,
        })
        .eq("id", segment.id),
    ),
  );
}

async function createDefaultProject(projectId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      id: projectId,
      title: "Untitled GDI-QR project",
      research_question: "",
      study_description: "",
      language: "English",
      protocol: "GDIQR",
      light_interpretation: false,
      status: "Ready for local testing",
      dataset_type: "open",
      data_source: "other",
      data_suitability_confirmed: false,
      researcher_notes: "",
      metadata: {},
    })
    .select()
    .single();

  if (error) {
    console.warn("Could not create default project:", error.message);
    return null;
  }

  return data;
}

function sanitizeStorageFilename(filename: string) {
  const cleaned = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

  return cleaned.length > 0 ? cleaned : "audio-upload";
}

function mapTranscriptRecord(row: TranscriptRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    content: row.content,
    versionLabel: row.version_label,
    anonymisationStatus: row.anonymisation_status,
    rawTranscriptRetained: row.raw_transcript_retained,
    sensitiveItems: row.sensitive_items ?? [],
    sensitiveItemsReviewedAt: row.sensitive_items_reviewed_at ?? null,
    reviewedBy: row.reviewed_by ?? null,
    createdAt: row.created_at,
    interviewId: row.interview_id ?? null,
    status: row.status ?? undefined,
    rawContent: row.raw_content ?? null,
    cleanedContent: row.cleaned_content ?? null,
    finalContent: row.final_content ?? null,
    updatedAt: row.updated_at ?? undefined,
  } satisfies TranscriptRecord;
}

function getResearcherVisibleTranscript(row?: TranscriptRow | null) {
  if (!row) {
    return "";
  }
  return row.final_content ?? row.cleaned_content ?? row.content ?? "";
}

function mapAudioFile(row: AudioFileRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    language: row.language,
    uploadedAt: row.uploaded_at,
  } satisfies AudioFileRecord;
}

function mapTranscriptionJob(row: TranscriptionJobRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    audioFileId: row.audio_file_id,
    status: row.status,
    provider: row.provider,
    language: row.language,
    transcriptId: row.transcript_id ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  } satisfies TranscriptionJobRecord;
}

function mapSegment(row: Database["public"]["Tables"]["segments"]["Row"]) {
  const speakerRole = speakerRoleFromStoredInfo(row.speaker_info ?? "");
  const speakerInfo = stripSegmentSpeakerRolePrefix(row.speaker_info ?? "");

  return {
    id: row.id,
    caseId: row.case_id,
    segmentId: row.segment_id,
    segmentNumber: row.segment_number ?? segmentNumberFromId(row.segment_id),
    sourceTranscriptId: row.transcript_id ?? undefined,
    topicLabel: row.topic_label || speakerInfo || row.segment_id,
    speakerInfo: speakerInfo || row.segment_id,
    speakerRole,
    startTimestamp: row.start_timestamp,
    endTimestamp: row.end_timestamp,
    startingMuNumber: row.starting_mu_number,
    status: mapStoredSegmentStatus(row.status),
    text: row.text,
  } satisfies TranscriptSegment;
}

function segmentNumberFromId(segmentId: string) {
  const match = segmentId.match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function mapStoredSegmentStatus(
  status: Database["public"]["Tables"]["segments"]["Row"]["status"],
): TranscriptSegment["status"] {
  if (status === "Processed") {
    return "Analysed";
  }
  if (status === "Needs review") {
    return "Needs Review";
  }
  return "Ready for MU Analysis";
}

function toStoredSegmentStatus(
  status: TranscriptSegment["status"],
): Database["public"]["Tables"]["segments"]["Row"]["status"] {
  if (status === "Analysed" || status === "Completed") {
    return "Processed";
  }
  if (
    status === "Draft" ||
    status === "Needs Review" ||
    status === "Needs Revision"
  ) {
    return "Needs review";
  }
  return "Ready";
}

function mapMeaningUnit(
  row: Database["public"]["Tables"]["meaning_units"]["Row"],
) {
  return {
    id: row.id,
    segmentId: row.segment_id,
    caseId: row.case_id,
    speaker: row.speaker,
    number: row.unit_number,
    aiExcerpt: row.excerpt,
    excerpt: row.excerpt,
    aiSummary: row.ai_summary,
    humanSummary: row.human_summary,
    tentativeInterpretation: row.tentative_interpretation ?? undefined,
    uncertainty: row.uncertainty ?? undefined,
    humanStatus: row.human_status,
    reviewerStatus: row.reviewer_status,
    analysisExcluded: row.analysis_excluded ?? false,
    exclusionReason: row.exclusion_reason ?? undefined,
  } satisfies MeaningUnit;
}

function mapReviewerComment(
  row: Database["public"]["Tables"]["reviewer_comments"]["Row"],
) {
  const payload = parseReviewerPayload(row.suggested_action);
  const status = payload.status ?? (row.resolved ? "resolved" : "unresolved");
  const targetType = payload.targetType ?? targetTypeFromTarget(row.target);
  const targetId = payload.targetId ?? targetIdFromTarget(row.target);

  return {
    id: row.id,
    agent: row.agent,
    target: row.target,
    targetType,
    targetId,
    issueType: payload.issueType ?? row.agent,
    workspace:
      payload.workspace ??
      (row.agent.toLowerCase().includes("category")
        ? "categories"
        : "meaning-units"),
    severity: payload.severity ?? fromStoredReviewerSeverity(row.severity),
    status,
    comment: row.comment,
    suggestedAction: payload.suggestedAction ?? row.suggested_action,
    resolved: status === "resolved" || status === "dismissed",
    createdAt: row.created_at,
    resolvedAt: payload.resolvedAt,
    researcherMemo: payload.researcherMemo,
  } satisfies ReviewerComment;
}

function encodeReviewerPayload(comment: ReviewerComment) {
  return JSON.stringify({
    issueType: comment.issueType,
    researcherMemo: comment.researcherMemo,
    resolvedAt: comment.resolvedAt,
    severity: comment.severity,
    status: comment.status,
    suggestedAction: comment.suggestedAction,
    targetId: comment.targetId,
    targetType: comment.targetType,
    workspace: comment.workspace,
  });
}

function parseReviewerPayload(value: string) {
  try {
    const parsed = JSON.parse(value) as Partial<ReviewerComment>;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Older rows store plain suggested action text.
  }
  return {};
}

function toStoredReviewerSeverity(severity: ReviewerComment["severity"]) {
  if (severity === "major") {
    return "Major issue";
  }
  if (severity === "warning") {
    return "Warning";
  }
  return "Pass";
}

function fromStoredReviewerSeverity(
  severity: string,
): ReviewerComment["severity"] {
  if (severity === "Major issue") {
    return "major";
  }
  if (severity === "Warning") {
    return "warning";
  }
  return "info";
}

function targetTypeFromTarget(target: string): ReviewerComment["targetType"] {
  const [type] = target.split(":");
  if (
    type === "meaning_unit" ||
    type === "summary" ||
    type === "segment" ||
    type === "category" ||
    type === "subcategory" ||
    type === "integrated_narrative" ||
    type === "mode_output"
  ) {
    return type;
  }
  return "mode_output";
}

function targetIdFromTarget(target: string) {
  return target.includes(":") ? target.split(":").slice(1).join(":") : target;
}

function mapAuditEvent(
  row: Database["public"]["Tables"]["audit_events"]["Row"],
) {
  return {
    id: row.id,
    timestamp: new Date(row.event_timestamp).toLocaleString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    actor: row.actor,
    action: row.action,
    target: row.target,
    step: toWorkflowStep(row.step),
    actionType: toAuditActionType(row.action_type),
    targetType: toAuditTargetType(row.target_type),
    targetId: row.target_id ?? undefined,
    previousValue: row.previous_value ?? undefined,
    newValue: row.new_value ?? undefined,
    researcherNote: row.researcher_note ?? undefined,
  } satisfies AuditEvent;
}

function mapEditLog(row: EditLogRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    step: toWorkflowStep(row.step) ?? "pre-analysis",
    actor: row.actor,
    actionType: toAuditActionType(row.action_type) ?? "other",
    action: row.action,
    targetType: toAuditTargetType(row.target_type) ?? "workspace",
    targetId: row.target_id,
    previousValue: row.previous_value ?? parseMaybeJson(row.before_value),
    newValue: row.new_value ?? parseMaybeJson(row.after_value),
    researcherNote: row.researcher_note ?? undefined,
    createdAt: row.created_at,
  } satisfies EditLog;
}

function mapPreAnalysisNotes(row: PreAnalysisNotesRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    researchQuestion: row.research_question,
    studyDescription: row.study_description,
    researcherPosition: row.researcher_position,
    contextualNotes: row.contextual_notes,
    initialSensitisingConcepts: row.initial_sensitising_concepts,
    dataFamiliarisationNotes: row.data_familiarisation_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies PreAnalysisNotes;
}

function mapIntegrationRelationship(row: IntegrationRelationshipRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    categorySystemId: row.category_system_id ?? undefined,
    sourceCategoryId: row.source_category_id,
    targetCategoryId: row.target_category_id,
    label: row.relationship_label,
    memo: row.memo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies IntegrationRelationship;
}

function mapIntegrityReviewItem(row: IntegrityReviewItemRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    checkKey: row.check_key,
    prompt: row.prompt,
    status: row.status,
    response: row.response,
    researcherNote: row.researcher_note,
    generatedFromState: row.generated_from_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies IntegrityReviewItem;
}

function mapExportRecord(row: ExportRow) {
  return {
    id: row.id,
    projectId: row.project_id,
    format: row.format,
    storageBucket: row.storage_bucket ?? undefined,
    storagePath: row.storage_path ?? undefined,
    generatedAt: row.generated_at,
  } satisfies ExportRecord;
}

function toWorkflowStep(
  value: string | null | undefined,
): WorkflowStep | undefined {
  if (
    value === "pre-analysis" ||
    value === "understanding" ||
    value === "categorizing" ||
    value === "integrating" ||
    value === "integrity" ||
    value === "export"
  ) {
    return value;
  }
  return undefined;
}

function toAuditActionType(
  value: string | null | undefined,
): AuditActionType | undefined {
  const allowed: AuditActionType[] = [
    "project_created",
    "project_updated",
    "data_suitability_confirmed",
    "transcript_uploaded",
    "audio_uploaded",
    "transcript_generated",
    "transcript_edited",
    "transcript_confirmed",
    "pre_analysis_updated",
    "meaning_units_generated",
    "meaning_unit_created",
    "meaning_unit_edited",
    "meaning_unit_accepted",
    "meaning_unit_excluded",
    "meaning_unit_split",
    "meaning_unit_merged",
    "meaning_unit_deleted",
    "category_system_generated",
    "category_created",
    "category_renamed",
    "category_updated",
    "category_deleted",
    "meaning_unit_moved",
    "relationship_created",
    "relationship_updated",
    "relationship_deleted",
    "reviewer_issue_generated",
    "reviewer_issue_resolved",
    "integrity_review_updated",
    "export_generated",
    "workspace_cleared",
    "other",
  ];

  return allowed.find((item) => item === value);
}

function toAuditTargetType(
  value: string | null | undefined,
): AuditTargetType | undefined {
  const allowed: AuditTargetType[] = [
    "project",
    "transcript",
    "audio_file",
    "transcription_job",
    "pre_analysis",
    "segment",
    "meaning_unit",
    "category",
    "category_system",
    "integration_relationship",
    "integrity_review",
    "integrity_review_item",
    "reviewer_comment",
    "export",
    "workspace",
  ];

  return allowed.find((item) => item === value);
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toJsonValue(value: unknown): Json | null {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return String(value);
  }
}

function parseMaybeJson(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildCategoryTree(rows: CategoryRow[]) {
  const nodes = new Map<string, CategoryNode>();

  rows.forEach((row) => {
    nodes.set(row.id, {
      id: row.id,
      name: row.name,
      definition: row.definition,
      includedUnitIds: row.included_unit_numbers,
      intentionallyUncategorisedUnitIds:
        row.intentionally_uncategorised_unit_numbers,
      memo: row.memo,
      source: row.source,
      status: row.status,
      subcategories: [],
    });
  });

  const roots: CategoryNode[] = [];
  rows.forEach((row) => {
    const node = nodes.get(row.id);
    if (!node) {
      return;
    }

    if (row.parent_category_id) {
      nodes.get(row.parent_category_id)?.subcategories?.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots.map((node) =>
    node.subcategories?.length ? node : { ...node, subcategories: undefined },
  );
}
