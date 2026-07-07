import { GdiqrWorkspace } from "@/components/gdiqr-workspace";
import {
  getLocalWorkspace,
  getWorkspace,
  listProjects
} from "@/lib/gdiqr-repository";
import { getStorageMode } from "@/lib/storage-mode";

export const dynamic = "force-dynamic";

export default async function Home(props: {
  searchParams?: Promise<{ projectId?: string | string[] }>;
}) {
  const storageMode = getStorageMode();
  const searchParams = (await props.searchParams) ?? {};
  const selectedProjectId =
    typeof searchParams.projectId === "string"
      ? searchParams.projectId
      : undefined;
  const workspace =
    storageMode === "local"
      ? getLocalWorkspace()
      : await getWorkspace(selectedProjectId);
  const projectList =
    storageMode === "local" ? [workspace.project] : await listProjects();

  return (
    <GdiqrWorkspace
      aiProvider="ollama"
      audioFiles={workspace.audioFiles}
      auditEvents={workspace.auditEvents}
      categories={workspace.categories}
      dataSource={workspace.dataSource}
      exportRecords={workspace.exportRecords}
      integratedNarrative={workspace.integratedNarrative}
      integrationMemo={workspace.integrationMemo}
      integrationRelationships={workspace.integrationRelationships}
      integrityReviewItems={workspace.integrityReviewItems}
      meaningUnits={workspace.meaningUnits}
      project={workspace.project}
      preAnalysisNotes={workspace.preAnalysisNotes}
      projectList={projectList}
      reviewerComments={workspace.reviewerComments}
      segments={workspace.segments}
      supabaseConfigured={workspace.supabaseConfigured}
      transcript={workspace.transcript}
      transcriptRecords={workspace.transcriptRecords}
      transcriptionJobs={workspace.transcriptionJobs}
      storageMode={storageMode}
    />
  );
}
