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
import { getStorageMode } from "@/lib/storage-mode";
import type {
  CategoryMode,
  CategoryNode,
  MeaningUnit,
  Project,
  ReviewerWorkspace
} from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: CategoryMode;
    projectId?: string;
    categories?: CategoryNode[];
    integratedNarrative?: string;
    project?: Project;
    units?: MeaningUnit[];
    workspace?: ReviewerWorkspace;
  };
  const reviewerWorkspace: ReviewerWorkspace =
    body.workspace === "categories" ? "categories" : "meaning-units";
  const runId = startRunLog(
    reviewerWorkspace === "categories"
      ? "Category reviewer check"
      : "Meaning-unit reviewer check"
  );
  const projectId = body.projectId ?? defaultProjectId;

  try {
    const storageMode = getStorageMode();
    const workspace =
      storageMode === "supabase" ? await getWorkspace(projectId) : null;
    const units = workspace?.meaningUnits ?? body.units ?? [];
    const categories = workspace?.categories ?? body.categories ?? [];
    const integratedNarrative =
      workspace?.integratedNarrative ?? body.integratedNarrative ?? "";
    const project: Project =
      workspace?.project ?? body.project ?? {
        id: projectId,
        language: "English",
        lightInterpretation: false,
        protocol: "GDIQR",
        researchQuestion: "",
        status: "Local-only draft workspace",
        studyDescription: "",
        title: "Local-only prototype workspace",
        updatedAt: new Date().toISOString()
      };
    addRunEvent(
      runId,
      reviewerWorkspace === "categories"
        ? `Calling category reviewer (${categories.length} categories)`
        : `Calling meaning-unit reviewer (${units.length} MUs)`
    );
    const startedAt = Date.now();
    const result = await generateReviewer({
      categoryMode: body.mode,
      categories,
      integratedNarrative,
      project,
      reviewerWorkspace,
      units
    });
    addRunEvent(
      runId,
      `Ollama reviewer generation finished in ${formatDuration(Date.now() - startedAt)}`
    );

    if (storageMode !== "supabase") {
      addRunEvent(runId, "Reviewer comments returned to browser state only");
      finishRunLog(runId);
      return NextResponse.json({
        ...result,
        persisted: false
      });
    }

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
