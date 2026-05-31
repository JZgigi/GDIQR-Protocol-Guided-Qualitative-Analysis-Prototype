import { NextRequest, NextResponse } from "next/server";
import { generateMeaningUnits } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  replaceMeaningUnitsFromAi
} from "@/lib/gdiqr-repository";
import {
  addRunEvent,
  failRunLog,
  finishRunLog,
  startRunLog
} from "@/lib/run-logs";

export async function POST(request: NextRequest) {
  const runId = startRunLog("Meaning-unit generation");
  const body = (await request.json().catch(() => ({}))) as {
    lightInterpretation?: boolean;
    projectId?: string;
    transcript?: string;
  };
  const projectId = body.projectId ?? defaultProjectId;

  try {
    addRunEvent(runId, "Loading workspace from Supabase");
    const workspace = await getWorkspace(projectId);
    const transcript = body.transcript ?? workspace.transcript;
    addRunEvent(runId, `Calling Ollama for meaning units (${transcript.length} chars)`);
    const startedAt = Date.now();
    const result = await generateMeaningUnits({
      lightInterpretation:
        body.lightInterpretation ?? workspace.project.lightInterpretation,
      project: workspace.project,
      runId,
      transcript
    });
    addRunEvent(
      runId,
      `Ollama meaning-unit generation finished in ${formatDuration(Date.now() - startedAt)}`
    );

    addRunEvent(runId, `Saving ${result.meaningUnits.length} meaning units`);
    const saveResult = await replaceMeaningUnitsFromAi({
      projectId,
      units: result.meaningUnits
    });
    finishRunLog(runId);

    return NextResponse.json({
      ...result,
      meaningUnits: saveResult.units,
      persisted: saveResult.saved
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meaning-unit generation failed.";
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
