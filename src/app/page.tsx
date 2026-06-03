import { GdiqrWorkspace } from "@/components/gdiqr-workspace";
import { getLocalWorkspace, getWorkspace } from "@/lib/gdiqr-repository";
import { getStorageMode } from "@/lib/storage-mode";

export const dynamic = "force-dynamic";

export default async function Home() {
  const storageMode = getStorageMode();
  const workspace =
    storageMode === "local" ? getLocalWorkspace() : await getWorkspace();

  return (
    <GdiqrWorkspace
      aiProvider="ollama"
      audioFiles={workspace.audioFiles}
      auditEvents={workspace.auditEvents}
      categories={workspace.categories}
      dataSource={workspace.dataSource}
      integratedNarrative={workspace.integratedNarrative}
      meaningUnits={workspace.meaningUnits}
      project={workspace.project}
      reviewerComments={workspace.reviewerComments}
      segments={workspace.segments}
      supabaseConfigured={workspace.supabaseConfigured}
      transcript={workspace.transcript}
      transcriptionJobs={workspace.transcriptionJobs}
      storageMode={storageMode}
    />
  );
}
