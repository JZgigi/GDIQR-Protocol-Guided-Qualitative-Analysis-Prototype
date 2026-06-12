import type {
  AudioFileRecord,
  AuditEvent,
  CategoryMode,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerComment,
  ReviewerIssueStatus,
  TranscriptionJobRecord,
  TranscriptSegment
} from "@/lib/types";
import { createSupabaseServerClient, hasSupabaseConfig } from "./supabase/server";
import type { Database } from "./supabase/database.types";
import { autoSplitTranscript, type AutoSegmentMode } from "./auto-segmenter";

type AudioFileRow = Database["public"]["Tables"]["audio_files"]["Row"];
type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];
type TranscriptionJobRow =
  Database["public"]["Tables"]["transcription_jobs"]["Row"];

export interface WorkspaceData {
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
}

export function getEmptyWorkspace(reason = "Supabase is not configured."): WorkspaceData {
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
      updatedAt: new Date().toISOString()
    },
    transcript: "",
    segments: [],
    audioFiles: [],
    transcriptionJobs: [],
    meaningUnits: [],
    categories: [],
    reviewerComments: [],
    auditEvents: [],
    integratedNarrative: "",
    dataSource: "unconfigured",
    supabaseConfigured: hasSupabaseConfig()
  };
}

export function getLocalWorkspace(): WorkspaceData {
  return {
    ...getEmptyWorkspace(
      "Local-only mode: transcript data is processed and stored within the local environment."
    ),
    dataSource: "local",
    project: {
      ...getEmptyWorkspace().project,
      status: "Local-only draft workspace",
      studyDescription:
        "Local-only mode: transcript data is processed and stored within the local environment."
    },
    supabaseConfigured: false
  };
}

export async function getWorkspace(
  projectId = defaultProjectId
): Promise<WorkspaceData> {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return getEmptyWorkspace();
  }

  const [
    projectResult,
    transcriptResult,
    segmentsResult,
    audioFilesResult,
    transcriptionJobsResult,
    meaningUnitsResult,
    categorySystemResult,
    reviewerCommentsResult,
    auditEventsResult
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
    supabase
      .from("transcripts")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
      .order("event_timestamp", { ascending: true })
  ]);

  const firstError =
    projectResult.error ??
    transcriptResult.error ??
    segmentsResult.error ??
    audioFilesResult.error ??
    transcriptionJobsResult.error ??
    meaningUnitsResult.error ??
    categorySystemResult.error ??
    reviewerCommentsResult.error ??
    auditEventsResult.error;

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
      supabaseConfigured: true
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

  return {
    project: mapProject(projectResult.data),
    transcript: transcriptResult.data?.content ?? "",
    segments: (segmentsResult.data ?? []).map(mapSegment),
    audioFiles: (audioFilesResult.data ?? []).map(mapAudioFile),
    transcriptionJobs: (transcriptionJobsResult.data ?? []).map(
      mapTranscriptionJob
    ),
    meaningUnits: (meaningUnitsResult.data ?? []).map(mapMeaningUnit),
    categories: buildCategoryTree(categoryRows),
    reviewerComments: (reviewerCommentsResult.data ?? []).map(
      mapReviewerComment
    ),
    auditEvents: (auditEventsResult.data ?? []).map(mapAuditEvent),
    integratedNarrative: categorySystemResult.data?.integrated_narrative ?? "",
    dataSource: "supabase",
    supabaseConfigured: true
  };
}

export async function saveTranscriptVersion({
  anonymisationStatus = "reviewed",
  content,
  projectId = defaultProjectId,
  rawTranscriptRetained = false,
  sensitiveItems = [],
  versionLabel = "Researcher saved version"
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

  const { data, error } = await insertTranscriptWithOptionalPrivacyMetadata({
    anonymisationStatus,
    content,
    projectId,
    rawTranscriptRetained,
    sensitiveItems,
    supabase,
    versionLabel
  });

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: "Saved transcript version",
    target: data.version_label
  });

  return { saved: true, transcript: data };
}

export async function updateProjectSettings({
  language,
  lightInterpretation,
  projectId = defaultProjectId,
  researchQuestion,
  studyDescription,
  title
}: {
  language: Project["language"];
  lightInterpretation: boolean;
  projectId?: string;
  researchQuestion: string;
  studyDescription: string;
  title: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const updatedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("projects")
    .upsert({
      id: projectId,
      title: title.trim() || "Untitled GDI-QR project",
      research_question: researchQuestion.trim(),
      study_description: studyDescription.trim(),
      language,
      protocol: "GDIQR",
      light_interpretation: lightInterpretation,
      status: "Ready for local testing",
      updated_at: updatedAt
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: "Updated project setup",
    target: data.title
  });

  return { saved: true, project: mapProject(data) };
}

export async function uploadAudioForTranscription({
  bytes,
  contentType,
  language,
  originalFilename,
  projectId = defaultProjectId,
  sizeBytes
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
      upsert: false
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
      language
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
      language
    })
    .select()
    .single();

  if (jobError) {
    throw new Error(jobError.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: "Uploaded audio for local transcription",
    target: originalFilename
  });

  return {
    uploaded: true,
    audioFile: mapAudioFile(audioRow),
    job: mapTranscriptionJob(jobRow)
  };
}

export async function completeTranscriptionJob({
  jobId,
  language,
  projectId = defaultProjectId,
  transcript,
  versionLabel
}: {
  jobId: string;
  language: Project["language"];
  projectId?: string;
  transcript: string;
  versionLabel: string;
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
      version_label: versionLabel
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
    supabase.from("category_systems").delete().eq("project_id", projectId)
  ]);

  const segmentId = stableId("seg", projectId, Date.now());
  const { error: segmentError } = await supabase.from("segments").insert({
    id: segmentId,
    project_id: projectId,
    case_id: "CASE-001",
    segment_id: "SEG-001",
    speaker_info: "Auto-transcribed audio",
    start_timestamp: "00:00",
    end_timestamp: "00:00",
    starting_mu_number: 1,
    status: "Ready",
    text: transcript
  });

  if (segmentError) {
    throw new Error(segmentError.message);
  }

  const completedAt = new Date().toISOString();
  const { data: jobRow, error: jobError } = await supabase
    .from("transcription_jobs")
    .update({
      status: "completed",
      transcript_id: transcriptRow.id,
      error_message: null,
      completed_at: completedAt
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
        status: "Transcript imported from audio",
        updated_at: completedAt
      })
      .eq("id", projectId),
    supabase.from("audit_events").insert({
      project_id: projectId,
      actor: "AI",
      action: "Completed local audio transcription",
      target: transcriptRow.id
    })
  ]);

  return {
    saved: true,
    transcript: transcriptRow,
    job: mapTranscriptionJob(jobRow)
  };
}

export async function importTranscriptForAnalysis({
  language,
  projectId = defaultProjectId,
  sourceLabel,
  transcript
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
      version_label: sourceLabel
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
    supabase.from("category_systems").delete().eq("project_id", projectId)
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
    text: transcript
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
        updated_at: importedAt
      })
      .eq("id", projectId),
    supabase.from("audit_events").insert({
      project_id: projectId,
      actor: "Researcher",
      action: "Imported transcript for analysis",
      target: transcriptRow.id
    })
  ]);

  return {
    saved: true,
    transcript: transcriptRow
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
      supabase.storage.from(bucket).remove(paths)
    )
  );

  await Promise.all([
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId),
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("transcription_jobs").delete().eq("project_id", projectId),
    supabase.from("audio_files").delete().eq("project_id", projectId),
    supabase.from("transcripts").delete().eq("project_id", projectId),
    supabase.from("audit_events").delete().eq("project_id", projectId)
  ]);

  await supabase
    .from("projects")
    .update({
      status: "Ready for local testing",
      updated_at: new Date().toISOString()
    })
    .eq("id", projectId);

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: "Deleted transcript, uploads, and derived outputs",
    target: "Project data minimisation"
  });

  return { cleared: true };
}

async function insertTranscriptWithOptionalPrivacyMetadata({
  anonymisationStatus,
  content,
  projectId,
  rawTranscriptRetained,
  sensitiveItems,
  supabase,
  versionLabel
}: TranscriptPrivacyMetadata & {
  content: string;
  projectId: string;
  supabase: NonNullable<ReturnType<typeof createSupabaseServerClient>>;
  versionLabel: string;
}) {
  const baseRow = {
    project_id: projectId,
    content,
    version_label: versionLabel
  };
  const privacyRow = {
    ...baseRow,
    anonymisation_status: anonymisationStatus ?? "reviewed",
    raw_transcript_retained: rawTranscriptRetained ?? false,
    sensitive_items: sensitiveItems ?? [],
    sensitive_items_reviewed_at: new Date().toISOString(),
    reviewed_by: null
  };

  const result = await supabase
    .from("transcripts")
    .insert(privacyRow)
    .select()
    .single();

  if (!result.error) {
    return result;
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
  sensitiveItems = []
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

  const { data: transcriptRow, error: transcriptError } =
    await insertTranscriptWithOptionalPrivacyMetadata({
      anonymisationStatus,
      content,
      projectId,
      rawTranscriptRetained,
      sensitiveItems,
      supabase,
      versionLabel: "Researcher-confirmed transcript"
    });

  if (transcriptError) {
    throw new Error(transcriptError.message);
  }

  await Promise.all([
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId)
  ]);

  const segmentId = stableId("seg", projectId, Date.now());
  const { error: segmentError } = await supabase.from("segments").insert({
    id: segmentId,
    project_id: projectId,
    case_id: "CASE-001",
    segment_id: "SEG-001",
    speaker_info: "Researcher-confirmed transcript",
    start_timestamp: "00:00",
    end_timestamp: "00:00",
    starting_mu_number: 1,
    status: "Ready",
    text: content
  });

  if (segmentError) {
    throw new Error(segmentError.message);
  }

  const confirmedAt = new Date().toISOString();
  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .update({
      language,
      status: "Transcript confirmed for analysis",
      updated_at: confirmedAt
    })
    .eq("id", projectId)
    .select()
    .single();

  if (projectError) {
    throw new Error(projectError.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: "Confirmed transcript for analysis",
    target: transcriptRow.id
  });

  return {
    saved: true,
    project: mapProject(projectRow),
    transcript: transcriptRow
  };
}

export async function failTranscriptionJob({
  errorMessage,
  jobId,
  projectId = defaultProjectId
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
      completed_at: new Date().toISOString()
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
    target: errorMessage.slice(0, 180)
  });

  return { saved: true, job: mapTranscriptionJob(data) };
}

export async function createAudioPreviewUrl({
  audioFileId,
  projectId = defaultProjectId
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
    signedUrl: data.signedUrl
  };
}

export async function updateMeaningUnit({
  analysisExcluded,
  excerpt,
  exclusionReason,
  humanStatus,
  humanSummary,
  speaker,
  unitId
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

  const updates: Database["public"]["Tables"]["meaning_units"]["Update"] = {
    updated_at: new Date().toISOString()
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
      ? exclusionReason ?? "Excluded from analysis by researcher"
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

  await supabase.from("audit_events").insert({
    project_id: data.project_id,
    actor: "Researcher",
    action:
      analysisExcluded === undefined
        ? humanStatus === "Accepted"
          ? `Accepted MU ${data.unit_number}`
          : excerpt !== undefined && humanSummary !== undefined
            ? `Updated MU ${data.unit_number} excerpt and summary`
            : excerpt !== undefined
              ? `Updated MU ${data.unit_number} excerpt`
              : humanSummary !== undefined
                ? `Updated MU ${data.unit_number} summary`
                : `Updated MU ${data.unit_number}`
        : analysisExcluded
          ? `Excluded MU ${data.unit_number} from analysis`
          : `Restored MU ${data.unit_number} to analysis`,
    target: data.id
  });

  const shouldClearDerivedWork =
    analysisExcluded !== undefined ||
    (humanStatus !== "Accepted" &&
      (excerpt !== undefined || humanSummary !== undefined));

  if (shouldClearDerivedWork) {
    await clearDerivedCategoryWork(data.project_id);
  }

  return { saved: true, meaningUnit: mapMeaningUnit(data) };
}

export async function deleteMeaningUnit({
  unitId
}: {
  unitId: string;
}) {
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

  await Promise.all([
    supabase.from("audit_events").insert({
      project_id: data.project_id,
      actor: "Researcher",
      action: `Deleted MU ${data.unit_number}`,
      target: data.id
    }),
    clearDerivedCategoryWork(data.project_id)
  ]);

  return {
    deleted: true,
    meaningUnit: mapMeaningUnit(data)
  };
}

async function clearDerivedCategoryWork(projectId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return;
  }

  await supabase.from("category_systems").delete().eq("project_id", projectId);
}

export async function updateSegment({
  projectId = defaultProjectId,
  segmentId,
  status,
  text,
  topicLabel
}: {
  projectId?: string;
  segmentId: string;
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
  if (topicLabel !== undefined) {
    updates.speaker_info = topicLabel;
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
    target: data.id
  });

  return { saved: true, segment: mapSegment(data) };
}

export async function splitSegment({
  afterText,
  beforeText,
  projectId = defaultProjectId,
  segmentId
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
    speaker_info: `${segment.speaker_info || segment.segment_id} (continued)`,
    start_timestamp: segment.start_timestamp,
    end_timestamp: segment.end_timestamp,
    starting_mu_number: segment.starting_mu_number,
    status: "Needs review" as const,
    text: afterText.trim()
  };

  const { error: updateError } = await supabase
    .from("segments")
    .update({
      status: "Needs review",
      text: beforeText.trim()
    })
    .eq("id", segmentId);
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: insertError } = await supabase.from("segments").insert(newSegment);
  if (insertError) {
    throw new Error(insertError.message);
  }

  await renumberSegments(projectId);
  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: `Split segment ${segment.segment_id}`,
    target: segment.id
  });

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function mergeSegment({
  direction,
  projectId = defaultProjectId,
  segmentId
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
      speaker_info: target.speaker_info || target.segment_id,
      status: "Needs review",
      text: mergedText
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
    target: target.id
  });

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function deleteSegment({
  projectId = defaultProjectId,
  segmentId
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
    target: segmentId
  });

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function moveSegment({
  direction,
  projectId = defaultProjectId,
  segmentId
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
  await renumberSegments(projectId, reordered.map((segment) => segment.id));

  return { saved: true, segments: await loadSegments(projectId) };
}

export async function autoSplitSegmentsFromTranscript({
  caseId = "CASE-001",
  projectId = defaultProjectId,
  researchQuestion,
  splittingMode = "balanced",
  transcript
}: {
  caseId?: string;
  projectId?: string;
  researchQuestion?: string;
  splittingMode?: AutoSegmentMode;
  transcript: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured.", segments: [] };
  }

  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    return {
      saved: false,
      reason:
        "No transcript text found. Please confirm or edit the transcript before auto-splitting.",
      segments: []
    };
  }

  const splitResult = autoSplitTranscript(trimmedTranscript, {
    mode: splittingMode,
    researchQuestion,
    sourceTranscriptId: projectId
  });
  const now = Date.now();

  await Promise.all([
    supabase.from("segments").delete().eq("project_id", projectId),
    supabase.from("meaning_units").delete().eq("project_id", projectId),
    supabase.from("reviewer_comments").delete().eq("project_id", projectId),
    supabase.from("category_systems").delete().eq("project_id", projectId)
  ]);

  const rows: Array<Database["public"]["Tables"]["segments"]["Insert"]> =
    splitResult.segments.map((segment, index) => ({
      id: stableId("seg", `${projectId}_${now}`, index + 1),
      project_id: projectId,
      case_id: caseId,
      segment_id: `SEG-${String(index + 1).padStart(3, "0")}`,
      speaker_info: segment.title,
      start_timestamp: "00:00",
      end_timestamp: "00:00",
      starting_mu_number: index * 100 + 1,
      status: "Needs review",
      text: segment.text
    }));

  const { error } = await supabase.from("segments").insert(rows);
  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: `Auto-split transcript into ${rows.length} segment${rows.length === 1 ? "" : "s"}`,
    target: "Segment Manager"
  });

  return {
    notice: splitResult.notice,
    saved: true,
    segments: await loadSegments(projectId)
  };
}

export async function replaceMeaningUnitsForSegment({
  projectId = defaultProjectId,
  segmentId,
  units
}: {
  projectId?: string;
  segmentId: string;
  units: MeaningUnit[];
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured.", units };
  }

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
      exclusion_reason: unit.exclusionReason ?? null
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

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "AI",
    action: `Generated ${units.length} meaning units for ${segmentId}`,
    target: segmentId
  });

  return {
    saved: true,
    units: (data ?? []).map(mapMeaningUnit)
  };
}

export async function replaceMeaningUnitsFromAi({
  projectId = defaultProjectId,
  units
}: {
  projectId?: string;
  units: MeaningUnit[];
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured.", units };
  }

  await supabase.from("meaning_units").delete().eq("project_id", projectId);

  if (units.length === 0) {
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
      exclusion_reason: unit.exclusionReason ?? null
    }));

  const { data, error } = await supabase
    .from("meaning_units")
    .insert(rows)
    .select()
    .order("unit_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "AI",
    action: `Generated ${units.length} local AI meaning units`,
    target: "Meaning Units"
  });

  return {
    saved: true,
    units: (data ?? []).map(mapMeaningUnit)
  };
}

export async function saveCategorySystemFromAi({
  categories,
  integratedNarrative,
  mode,
  projectId = defaultProjectId
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
      integratedNarrative
    };
  }

  const { data: system, error: systemError } = await supabase
    .from("category_systems")
    .insert({
      project_id: projectId,
      mode,
      integrated_narrative: integratedNarrative
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
    target: system.id
  });

  return {
    saved: true,
    categories,
    integratedNarrative
  };
}

export async function replaceReviewerCommentsFromAi({
  comments,
  projectId = defaultProjectId,
  workspace
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
        : ["GDIQR Meaning Units Review", "GDI-QR Meaning Units Review"]
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
      index + 1
    ),
    project_id: projectId,
    agent: comment.agent,
    target: comment.target,
    severity: toStoredReviewerSeverity(comment.severity),
    comment: comment.comment,
    suggested_action: encodeReviewerPayload(comment),
    resolved: comment.resolved
  }));

  const { data, error } = await supabase
    .from("reviewer_comments")
    .insert(rows)
    .select()
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Reviewer",
    action: `Generated ${comments.length} ${workspace ?? "GDI-QR-informed"} reviewer issues`,
    target: workspace ?? "Reviewer checks"
  });

  return {
    saved: true,
    comments: (data ?? []).map(mapReviewerComment)
  };
}

export async function updateReviewerComment({
  commentId,
  memo,
  projectId = defaultProjectId,
  status
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
    status: nextStatus
  };

  const { data, error } = await supabase
    .from("reviewer_comments")
    .update({
      resolved: nextComment.resolved,
      suggested_action: encodeReviewerPayload(nextComment)
    })
    .eq("project_id", projectId)
    .eq("id", commentId)
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: projectId,
    actor: "Researcher",
    action: `Updated reviewer issue: ${nextStatus}`,
    target: commentId
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
    updatedAt: row.updated_at
  } satisfies Project;
}

function flattenCategoryRows(
  categories: CategoryNode[],
  categorySystemId: string,
  parentId: string | null = null,
  offset = 0
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
      sort_order: sortOrder
    };

    return [
      row,
      ...flattenCategoryRows(
        category.subcategories ?? [],
        categorySystemId,
        id,
        sortOrder * 100
      )
    ];
  });
}

function stableId(prefix: string, scope: string, number: number) {
  return `${prefix}_${scope.replace(/[^a-zA-Z0-9]/g, "_")}_${String(
    number
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

async function renumberSegments(projectId: string, orderedIds?: string[]) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return;
  }

  const segments = await loadRawSegments(projectId);
  const ordered = orderedIds
    ? orderedIds
        .map((id) => segments.find((segment) => segment.id === id))
        .filter((segment): segment is NonNullable<typeof segment> => Boolean(segment))
    : segments;

  await Promise.all(
    ordered.map((segment, index) =>
      supabase
        .from("segments")
        .update({
          segment_id: `SEG-${String(index + 1).padStart(3, "0")}`,
          starting_mu_number: index * 100 + 1
        })
        .eq("id", segment.id)
    )
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
      status: "Ready for local testing"
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
    uploadedAt: row.uploaded_at
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
    completedAt: row.completed_at ?? undefined
  } satisfies TranscriptionJobRecord;
}

function mapSegment(row: Database["public"]["Tables"]["segments"]["Row"]) {
  return {
    id: row.id,
    caseId: row.case_id,
    segmentId: row.segment_id,
    segmentNumber: segmentNumberFromId(row.segment_id),
    topicLabel: row.speaker_info || row.segment_id,
    speakerInfo: row.speaker_info,
    startTimestamp: row.start_timestamp,
    endTimestamp: row.end_timestamp,
    startingMuNumber: row.starting_mu_number,
    status: mapStoredSegmentStatus(row.status),
    text: row.text
  } satisfies TranscriptSegment;
}

function segmentNumberFromId(segmentId: string) {
  const match = segmentId.match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function mapStoredSegmentStatus(
  status: Database["public"]["Tables"]["segments"]["Row"]["status"]
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
  status: TranscriptSegment["status"]
): Database["public"]["Tables"]["segments"]["Row"]["status"] {
  if (status === "Analysed" || status === "Completed") {
    return "Processed";
  }
  if (status === "Draft" || status === "Needs Review" || status === "Needs Revision") {
    return "Needs review";
  }
  return "Ready";
}

function mapMeaningUnit(
  row: Database["public"]["Tables"]["meaning_units"]["Row"]
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
    exclusionReason: row.exclusion_reason ?? undefined
  } satisfies MeaningUnit;
}

function mapReviewerComment(
  row: Database["public"]["Tables"]["reviewer_comments"]["Row"]
) {
  const payload = parseReviewerPayload(row.suggested_action);
  const status =
    payload.status ??
    (row.resolved ? "resolved" : "unresolved");
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
    researcherMemo: payload.researcherMemo
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
    workspace: comment.workspace
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

function fromStoredReviewerSeverity(severity: string): ReviewerComment["severity"] {
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

function mapAuditEvent(row: Database["public"]["Tables"]["audit_events"]["Row"]) {
  return {
    id: row.id,
    timestamp: new Date(row.event_timestamp).toLocaleString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }),
    actor: row.actor,
    action: row.action,
    target: row.target
  } satisfies AuditEvent;
}

function buildCategoryTree(rows: CategoryRow[]) {
  const nodes = new Map<string, CategoryNode>();

  rows.forEach((row) => {
    nodes.set(row.id, {
      id: row.id,
      name: row.name,
      definition: row.definition,
      includedUnitIds: row.included_unit_numbers,
      subcategories: []
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
    node.subcategories?.length ? node : { ...node, subcategories: undefined }
  );
}
