import { NextRequest, NextResponse } from "next/server";
import {
  autoSplitSegmentsFromTranscript,
  defaultProjectId
} from "@/lib/gdiqr-repository";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string;
    projectId?: string;
    researchQuestion?: string;
    transcript?: string;
  };

  try {
    const result = await autoSplitSegmentsFromTranscript({
      caseId: body.caseId,
      projectId: body.projectId ?? defaultProjectId,
      researchQuestion: body.researchQuestion,
      transcript: body.transcript ?? ""
    });

    return NextResponse.json(result, { status: result.saved ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Auto-split transcript failed."
      },
      { status: 500 }
    );
  }
}
