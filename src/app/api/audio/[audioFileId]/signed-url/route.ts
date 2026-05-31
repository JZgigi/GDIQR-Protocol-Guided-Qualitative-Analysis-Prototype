import { NextRequest, NextResponse } from "next/server";
import {
  createAudioPreviewUrl,
  defaultProjectId
} from "@/lib/gdiqr-repository";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ audioFileId: string }> }
) {
  const { audioFileId } = await params;
  const projectId =
    request.nextUrl.searchParams.get("projectId") ?? defaultProjectId;

  try {
    const result = await createAudioPreviewUrl({ audioFileId, projectId });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason ?? "Audio preview unavailable." },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Audio preview failed."
      },
      { status: 500 }
    );
  }
}
