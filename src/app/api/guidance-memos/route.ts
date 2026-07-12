import { NextRequest, NextResponse } from "next/server";
import { defaultProjectId, saveGuidanceMemo } from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";
import type { WorkflowStep } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    answer?: string;
    projectId?: string;
    question?: string;
    source?: "legacy-guidance" | "voice-guide";
    step?: WorkflowStep;
  };

  try {
    if (!body.question?.trim() || !body.answer?.trim() || !body.step) {
      return NextResponse.json(
        { error: "Question, answer, and workflow step are required." },
        { status: 400 },
      );
    }

    if (isLocalStorageMode()) {
      return NextResponse.json({ persisted: false, saved: true });
    }

    const result = await saveGuidanceMemo({
      answer: body.answer,
      projectId: body.projectId ?? defaultProjectId,
      question: body.question,
      source: body.source,
      step: body.step,
    });

    return NextResponse.json(result, { status: result.saved ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Guidance memo could not be saved.",
      },
      { status: 500 },
    );
  }
}
