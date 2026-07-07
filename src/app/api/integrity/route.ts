import { NextResponse } from "next/server";
import { saveIntegrityReviewItems } from "@/lib/gdiqr-repository";
import type { IntegrityReviewItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      items?: IntegrityReviewItem[];
      projectId?: string;
      researcherNote?: string;
    };

    if (!body.projectId) {
      return NextResponse.json(
        { error: "projectId is required." },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "Integrity review items are required." },
        { status: 400 }
      );
    }

    const result = await saveIntegrityReviewItems({
      action: body.action,
      items: body.items,
      projectId: body.projectId,
      researcherNote: body.researcherNote
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
            : "Integrity review could not be saved."
      },
      { status: 500 }
    );
  }
}
