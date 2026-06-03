import { NextRequest, NextResponse } from "next/server";
import {
  clearProjectTranscriptData,
  defaultProjectId,
  getLocalWorkspace,
  getWorkspace
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
  };
  const projectId = body.projectId ?? defaultProjectId;

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        cleared: true,
        persisted: false,
        reason: "Local-only mode keeps project data in browser state; no Supabase data was changed.",
        workspace: getLocalWorkspace()
      });
    }

    const result = await clearProjectTranscriptData(projectId);
    const workspace = await getWorkspace(projectId);

    return NextResponse.json({
      ...result,
      workspace
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Project data clear failed."
      },
      { status: 500 }
    );
  }
}
