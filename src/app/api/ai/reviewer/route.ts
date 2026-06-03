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
import type { CategoryMode, ReviewerWorkspace } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: CategoryMode;
    projectId?: string;
    workspace?: ReviewerWorkspace;
  };
  const reviewerWorkspace: ReviewerWorkspace =
    body.workspace === "categories" ? "categories" : "meaning-units";
  const runId = startRunLog(
    reviewerWorkspace === "categories"
      ? "GDIQR category review"
      : "GDIQR meaning-unit review"
  );
  const projectId = body.projectId ?? defaultProjectId;

  try {
    addRunEvent(runId, "Loading workspace from Supabase");
    const workspace = await getWorkspace(projectId);
    addRunEvent(
      runId,
      reviewerWorkspace === "categories"
        ? `Calling category reviewer (${workspace.categories.length} categories)`
        : `Calling meaning-unit reviewer (${workspace.meaningUnits.length} MUs)`
    );
    const startedAt = Date.now();
    const result = await generateReviewer({
      categoryMode: body.mode,
      categories: workspace.categories,
      integratedNarrative: workspace.integratedNarrative,
      project: workspace.project,
      reviewerWorkspace,
      units: workspace.meaningUnits
    });
    addRunEvent(
      runId,
      `Ollama reviewer generation finished in ${formatDuration(Date.now() - startedAt)}`
    );

    addRunEvent(runId, `Saving ${result.comments.length} reviewer comments`);
    const saveResult = await replaceReviewerCommentsFromAi({
      comments: result.comments,
      projectId,
      workspace: reviewerWorkspace
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
