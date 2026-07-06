import { NextRequest, NextResponse } from "next/server";
import {
  createManualMeaningUnit,
  mergeMeaningUnits,
  splitMeaningUnit
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";

export const runtime = "nodejs";

type MeaningUnitAction = "manual_create" | "split" | "merge";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: MeaningUnitAction;
    caseId?: string;
    excerpt?: string;
    firstExcerpt?: string;
    firstSummary?: string;
    humanSummary?: string;
    mergedExcerpt?: string;
    mergedSummary?: string;
    projectId?: string;
    researcherNote?: string;
    secondExcerpt?: string;
    secondSummary?: string;
    segmentId?: string;
    sourceUnitId?: string;
    speaker?: string;
    targetUnitId?: string;
    unitId?: string;
  };

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        persisted: false,
        reason:
          "Local-only mode stores meaning-unit changes in browser state, not Supabase."
      });
    }

    if (body.action === "manual_create") {
      if (!body.projectId || !body.excerpt?.trim()) {
        return NextResponse.json(
          { error: "projectId and excerpt are required for manual MU creation." },
          { status: 400 }
        );
      }

      const result = await createManualMeaningUnit({
        caseId: body.caseId,
        excerpt: body.excerpt,
        humanSummary: body.humanSummary,
        projectId: body.projectId,
        researcherNote: body.researcherNote,
        segmentId: body.segmentId,
        speaker: body.speaker
      });
      return NextResponse.json(result);
    }

    if (body.action === "split") {
      if (
        !body.projectId ||
        !body.unitId ||
        !body.firstExcerpt?.trim() ||
        !body.secondExcerpt?.trim()
      ) {
        return NextResponse.json(
          {
            error:
              "projectId, unitId, firstExcerpt, and secondExcerpt are required for MU split."
          },
          { status: 400 }
        );
      }

      const result = await splitMeaningUnit({
        firstExcerpt: body.firstExcerpt,
        firstSummary: body.firstSummary,
        projectId: body.projectId,
        researcherNote: body.researcherNote,
        secondExcerpt: body.secondExcerpt,
        secondSummary: body.secondSummary,
        unitId: body.unitId
      });
      return NextResponse.json(result);
    }

    if (body.action === "merge") {
      if (!body.projectId || !body.sourceUnitId || !body.targetUnitId) {
        return NextResponse.json(
          {
            error:
              "projectId, sourceUnitId, and targetUnitId are required for MU merge."
          },
          { status: 400 }
        );
      }

      const result = await mergeMeaningUnits({
        mergedExcerpt: body.mergedExcerpt,
        mergedSummary: body.mergedSummary,
        projectId: body.projectId,
        researcherNote: body.researcherNote,
        sourceUnitId: body.sourceUnitId,
        targetUnitId: body.targetUnitId
      });
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Unsupported meaning-unit action." },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meaning-unit action failed." },
      { status: 500 }
    );
  }
}
