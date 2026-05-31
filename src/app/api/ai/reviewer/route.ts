import { NextRequest, NextResponse } from "next/server";
import { generateReviewer } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  replaceReviewerCommentsFromAi
} from "@/lib/gdiqr-repository";
import {
  addRunEvent,
  failRunLog,
  finishRunLog,
  startRunLog
} from "@/lib/run-logs";

export async function POST(request: NextRequest) {
  const runId = startRunLog("Reviewer generation");
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
  };
  const projectId = body.projectId ?? defaultProjectId;

  try {
    addRunEvent(runId, "Loading workspace from Supabase");
    const workspace = await getWorkspace(projectId);
    addRunEvent(runId, `Calling Ollama reviewer (${workspace.meaningUnits.length} MUs)`);
    const startedAt = Date.now();
    const result = await generateReviewer({
      categories: workspace.categories,
      integratedNarrative: workspace.integratedNarrative,
      project: workspace.project,
      units: workspace.meaningUnits
    });
    addRunEvent(
      runId,
      `Ollama reviewer generation finished in ${formatDuration(Date.now() - startedAt)}`
    );

    addRunEvent(runId, `Saving ${result.comments.length} reviewer comments`);
    const saveResult = await replaceReviewerCommentsFromAi({
      comments: result.comments,
      projectId
    });
    finishRunLog(runId);

    return NextResponse.json({
      ...result,
      comments: saveResult.comments,
      persisted: saveResult.saved
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Reviewer generation failed.";
    failRunLog(runId, message);
    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
