import { NextRequest, NextResponse } from "next/server";
import {
  confirmTranscriptForAnalysis,
  defaultProjectId,
  getWorkspace
} from "@/lib/gdiqr-repository";
import type { Project } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    language?: Project["language"];
    projectId?: string;
  };
  const content = body.content?.trim() ?? "";

  if (!content) {
    return NextResponse.json(
      { error: "Transcript content is required before confirmation." },
      { status: 400 }
    );
  }

  const projectId = body.projectId ?? defaultProjectId;

  try {
    const result = await confirmTranscriptForAnalysis({
      content,
      language: body.language === "Chinese" ? "Chinese" : "English",
      projectId
    });
    const workspace = await getWorkspace(projectId);

    return NextResponse.json({
      ...result,
      workspace
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcript confirmation failed."
      },
      { status: 500 }
    );
  }
}
