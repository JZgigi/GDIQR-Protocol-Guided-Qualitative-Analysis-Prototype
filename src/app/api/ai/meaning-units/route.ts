import { NextRequest, NextResponse } from "next/server";
import { generateMeaningUnits } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  replaceMeaningUnitsFromAi
} from "@/lib/gdiqr-repository";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    lightInterpretation?: boolean;
    projectId?: string;
    transcript?: string;
  };
  const projectId = body.projectId ?? defaultProjectId;
  const workspace = await getWorkspace(projectId);

  try {
    const result = await generateMeaningUnits({
      lightInterpretation:
        body.lightInterpretation ?? workspace.project.lightInterpretation,
      project: workspace.project,
      transcript: body.transcript ?? workspace.transcript
    });

    if (result.provider === "ollama") {
      const saveResult = await replaceMeaningUnitsFromAi({
        projectId,
        units: result.meaningUnits
      });

      return NextResponse.json({
        ...result,
        meaningUnits: saveResult.units,
        persisted: saveResult.saved
      });
    }

    return NextResponse.json({ ...result, persisted: false });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Meaning-unit generation failed."
      },
      { status: 500 }
    );
  }
}
