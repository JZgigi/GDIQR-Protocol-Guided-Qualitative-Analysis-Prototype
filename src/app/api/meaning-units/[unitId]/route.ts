import { NextRequest, NextResponse } from "next/server";
import {
  deleteMeaningUnit,
  updateMeaningUnit
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";
import type { HumanStatus } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    analysisExcluded?: boolean;
    excerpt?: string;
    exclusionReason?: string | null;
    humanStatus?: HumanStatus;
    humanSummary?: string;
    speaker?: string;
  };

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        saved: false,
        persisted: false,
        reason:
          "Local-only mode stores meaning-unit edits in browser state, not Supabase."
      });
    }

    const result = await updateMeaningUnit({
      analysisExcluded: body.analysisExcluded,
      excerpt: body.excerpt,
      exclusionReason: body.exclusionReason,
      humanStatus: body.humanStatus,
      humanSummary: body.humanSummary,
      speaker: body.speaker,
      unitId
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await context.params;

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        deleted: false,
        persisted: false,
        reason:
          "Local-only mode deletes meaning units from browser state, not Supabase."
      });
    }

    const result = await deleteMeaningUnit({ unitId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed." },
      { status: 500 }
    );
  }
}
