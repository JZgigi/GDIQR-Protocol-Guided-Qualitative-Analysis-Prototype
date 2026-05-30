import { NextRequest, NextResponse } from "next/server";
import { updateMeaningUnit } from "@/lib/gdiqr-repository";
import type { HumanStatus } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    humanStatus?: HumanStatus;
    humanSummary?: string;
  };

  try {
    const result = await updateMeaningUnit({
      humanStatus: body.humanStatus,
      humanSummary: body.humanSummary,
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
