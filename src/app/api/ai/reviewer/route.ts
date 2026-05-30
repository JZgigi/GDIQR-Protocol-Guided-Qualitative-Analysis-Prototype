import { NextRequest, NextResponse } from "next/server";
import { generateReviewer } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  replaceReviewerCommentsFromAi
} from "@/lib/gdiqr-repository";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
  };
  const projectId = body.projectId ?? defaultProjectId;
  const workspace = await getWorkspace(projectId);

  try {
    const result = await generateReviewer({
      categories: workspace.categories,
      integratedNarrative: workspace.integratedNarrative,
      project: workspace.project,
      units: workspace.meaningUnits
    });

    if (result.provider === "ollama") {
      const saveResult = await replaceReviewerCommentsFromAi({
        comments: result.comments,
        projectId
      });

      return NextResponse.json({
        ...result,
        comments: saveResult.comments,
        persisted: saveResult.saved
      });
    }

    return NextResponse.json({ ...result, persisted: false });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Reviewer generation failed."
      },
      { status: 500 }
    );
  }
}
