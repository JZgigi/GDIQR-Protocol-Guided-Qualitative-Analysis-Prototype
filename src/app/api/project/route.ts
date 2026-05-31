import { NextRequest, NextResponse } from "next/server";
import {
  defaultProjectId,
  updateProjectSettings
} from "@/lib/gdiqr-repository";
import type { Project } from "@/lib/types";

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    language?: Project["language"];
    lightInterpretation?: boolean;
    projectId?: string;
    researchQuestion?: string;
    studyDescription?: string;
    title?: string;
  };

  try {
    const result = await updateProjectSettings({
      language: body.language === "Chinese" ? "Chinese" : "English",
      lightInterpretation: Boolean(body.lightInterpretation),
      projectId: body.projectId ?? defaultProjectId,
      researchQuestion: body.researchQuestion ?? "",
      studyDescription: body.studyDescription ?? "",
      title: body.title ?? ""
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Project update failed."
      },
      { status: 500 }
    );
  }
}
