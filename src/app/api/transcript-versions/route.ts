import { NextRequest, NextResponse } from "next/server";
import {
  defaultProjectId,
  saveTranscriptVersion
} from "@/lib/gdiqr-repository";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    content?: string;
    projectId?: string;
    versionLabel?: string;
  };

  if (!body.content?.trim()) {
    return NextResponse.json(
      { error: "Transcript content is required." },
      { status: 400 }
    );
  }

  try {
    const result = await saveTranscriptVersion({
      content: body.content,
      projectId: body.projectId ?? defaultProjectId,
      versionLabel: body.versionLabel
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed." },
      { status: 500 }
    );
  }
}
