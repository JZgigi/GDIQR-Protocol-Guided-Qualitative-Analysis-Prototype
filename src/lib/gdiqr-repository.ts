import {
  integratedNarrative,
  mockAuditEvents,
  mockCategories,
  mockMeaningUnits,
  mockProject,
  mockReviewerComments,
  mockSegments,
  mockTranscript
} from "@/lib/mock-data";
import type {
  AuditEvent,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerComment,
  TranscriptSegment
} from "@/lib/types";
import { createSupabaseServerClient, hasSupabaseConfig } from "./supabase/server";
import type { Database } from "./supabase/database.types";

type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export interface WorkspaceData {
  project: Project;
  transcript: string;
  segments: TranscriptSegment[];
  meaningUnits: MeaningUnit[];
  categories: CategoryNode[];
  reviewerComments: ReviewerComment[];
  auditEvents: AuditEvent[];
  integratedNarrative: string;
  dataSource: "mock" | "supabase";
  supabaseConfigured: boolean;
}

export const defaultProjectId =
  process.env.GDIQR_DEFAULT_PROJECT_ID ?? "proj_student_wellbeing";

export function getMockWorkspace(): WorkspaceData {
  return {
    project: mockProject,
    transcript: mockTranscript,
    segments: mockSegments,
    meaningUnits: mockMeaningUnits,
    categories: mockCategories,
    reviewerComments: mockReviewerComments,
    auditEvents: mockAuditEvents,
    integratedNarrative,
    dataSource: "mock",
    supabaseConfigured: hasSupabaseConfig()
  };
}

export async function getWorkspace(
  projectId = defaultProjectId
): Promise<WorkspaceData> {
  const supabase = createSupabaseServerClient();

  if (!supabase) {
    return getMockWorkspace();
  }

  const [
    projectResult,
    transcriptResult,
    segmentsResult,
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
    meaningUnitsResult.error ??
    categorySystemResult.error ??
    reviewerCommentsResult.error ??
    auditEventsResult.error;

  if (firstError || !projectResult.data) {
    console.warn("Falling back to mock workspace:", firstError?.message);
    return getMockWorkspace();
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
  content,
  projectId = defaultProjectId,
  versionLabel = "Researcher saved version"
}: {
  content: string;
  projectId?: string;
  versionLabel?: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("transcripts")
    .insert({
      project_id: projectId,
      content,
      version_label: versionLabel
    })
    .select()
    .single();

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

export async function updateMeaningUnit({
  humanStatus,
  humanSummary,
  unitId
}: {
  humanStatus?: MeaningUnit["humanStatus"];
  humanSummary?: string;
  unitId: string;
}) {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from("meaning_units")
    .update({
      human_status: humanStatus,
      human_summary: humanSummary,
      updated_at: new Date().toISOString()
    })
    .eq("id", unitId)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("audit_events").insert({
    project_id: data.project_id,
    actor: "Researcher",
    action: `Updated MU ${data.unit_number}`,
    target: data.id
  });

  return { saved: true, meaningUnit: mapMeaningUnit(data) };
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

function mapSegment(row: Database["public"]["Tables"]["segments"]["Row"]) {
  return {
    id: row.id,
    caseId: row.case_id,
    segmentId: row.segment_id,
    speakerInfo: row.speaker_info,
    startTimestamp: row.start_timestamp,
    endTimestamp: row.end_timestamp,
    startingMuNumber: row.starting_mu_number,
    status: row.status,
    text: row.text
  } satisfies TranscriptSegment;
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
    excerpt: row.excerpt,
    aiSummary: row.ai_summary,
    humanSummary: row.human_summary,
    tentativeInterpretation: row.tentative_interpretation ?? undefined,
    uncertainty: row.uncertainty ?? undefined,
    humanStatus: row.human_status,
    reviewerStatus: row.reviewer_status
  } satisfies MeaningUnit;
}

function mapReviewerComment(
  row: Database["public"]["Tables"]["reviewer_comments"]["Row"]
) {
  return {
    id: row.id,
    agent: row.agent,
    target: row.target,
    severity: row.severity,
    comment: row.comment,
    suggestedAction: row.suggested_action,
    resolved: row.resolved
  } satisfies ReviewerComment;
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
