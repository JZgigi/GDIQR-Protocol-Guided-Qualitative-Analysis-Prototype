import { NextRequest, NextResponse } from "next/server";
import { generateCategories } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  saveCategorySystemFromAi
} from "@/lib/gdiqr-repository";
import type { CategoryMode } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: CategoryMode;
    projectId?: string;
  };
  const mode = body.mode ?? "A";
  const projectId = body.projectId ?? defaultProjectId;
  const workspace = await getWorkspace(projectId);

  try {
    const result = await generateCategories({
      mode,
      project: workspace.project,
      units: workspace.meaningUnits
    });

    if (result.provider === "ollama") {
      const saveResult = await saveCategorySystemFromAi({
        categories: result.categories,
        integratedNarrative: result.integratedNarrative,
        mode,
        projectId
      });

      return NextResponse.json({
        ...result,
        categories: saveResult.categories,
        integratedNarrative: saveResult.integratedNarrative,
        persisted: saveResult.saved
      });
    }

    return NextResponse.json({ ...result, persisted: false });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Category generation failed."
      },
      { status: 500 }
    );
  }
}
