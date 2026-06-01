import { NextRequest, NextResponse } from "next/server";
import { generateCategories } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  saveCategorySystemFromAi
} from "@/lib/gdiqr-repository";
import {
  addRunEvent,
  failRunLog,
  finishRunLog,
  startRunLog
} from "@/lib/run-logs";
import type { CategoryMode } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: CategoryMode;
    projectId?: string;
  };
  const mode: CategoryMode =
    body.mode === "B" || body.mode === "C" ? body.mode : "A";
  const runId = startRunLog(`Category generation · Mode ${mode}`);
  const projectId = body.projectId ?? defaultProjectId;

  try {
    addRunEvent(runId, "Loading workspace from Supabase");
    const workspace = await getWorkspace(projectId);
    const confirmedUnits = workspace.meaningUnits.filter(
      (unit) => unit.humanStatus === "Accepted" || unit.humanStatus === "Edited"
    );
    if (confirmedUnits.length === 0) {
      throw new Error(
        "No accepted or edited meaning-unit summaries are available yet."
      );
    }
    addRunEvent(runId, `Calling Ollama for Mode ${mode} categories (${confirmedUnits.length} confirmed MUs)`);
    const startedAt = Date.now();
    const result = await generateCategories({
      mode,
      project: workspace.project,
      units: confirmedUnits
    });
    addRunEvent(
      runId,
      `Ollama category generation finished in ${formatDuration(Date.now() - startedAt)}`
    );

    addRunEvent(runId, `Saving ${result.categories.length} top-level categories`);
    const saveResult = await saveCategorySystemFromAi({
      categories: result.categories,
      integratedNarrative: result.integratedNarrative,
      mode,
      projectId
    });
    finishRunLog(runId);

    return NextResponse.json({
      ...result,
      categories: saveResult.categories,
      integratedNarrative: saveResult.integratedNarrative,
      persisted: saveResult.saved
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Category generation failed.";
    const message = `Mode ${mode} could not finish because the local AI did not return a usable category result. Review accepted meaning units, try Mode A first, or retry with a smaller/faster model. Details: ${detail}`;
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
