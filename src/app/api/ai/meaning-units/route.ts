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

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const runId = startRunLog("Meaning-unit generation");
  const body = (await request.json().catch(() => ({}))) as {
    lightInterpretation?: boolean;
    projectId?: string;
    transcript?: string;
  };
  const projectId = body.projectId ?? defaultProjectId;

  void runMeaningUnitGeneration({
    lightInterpretation: body.lightInterpretation,
    projectId,
    runId,
    transcript: body.transcript
  });

  return NextResponse.json(
    {
      runId,
      started: true
    },
    { status: 202 }
  );
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function runMeaningUnitGeneration({
  lightInterpretation,
  projectId,
  runId,
  transcript
}: {
  lightInterpretation?: boolean;
  projectId: string;
  runId: string;
  transcript?: string;
}) {
  try {
    addRunEvent(runId, "Loading workspace from Supabase");
    const workspace = await getWorkspace(projectId);
    const sourceTranscript = transcript ?? workspace.transcript;
    addRunEvent(
      runId,
      `Starting background meaning-unit job (${sourceTranscript.length} chars)`
    );
    const startedAt = Date.now();
    const result = await generateMeaningUnits({
      lightInterpretation:
        lightInterpretation ?? workspace.project.lightInterpretation,
      project: workspace.project,
      runId,
      transcript: sourceTranscript
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
    addRunEvent(
      runId,
      saveResult.saved
        ? "Meaning units saved to Supabase"
        : saveResult.reason ?? "Meaning units were generated but not persisted"
    );
    finishRunLog(runId);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meaning-unit generation failed.";
    failRunLog(runId, message);
  }
}
