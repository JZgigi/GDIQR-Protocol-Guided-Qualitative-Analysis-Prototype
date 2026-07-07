import { NextResponse } from "next/server";
import { recordExportGenerated } from "@/lib/gdiqr-repository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      format?: "json" | "csv" | "txt" | "docx" | "pdf";
      projectId?: string;
    };

    if (!body.projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 }
      );
    }

    if (!body.format) {
      return NextResponse.json(
        { error: "Export format is required." },
        { status: 400 }
      );
    }

    const result = await recordExportGenerated({
      format: body.format,
      projectId: body.projectId
    });

    if (!result.saved) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Export event could not be recorded."
      },
      { status: 500 }
    );
  }
}
