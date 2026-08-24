import { NextResponse } from "next/server";
import type {
  AuditActionType,
  CategoryMode,
  CategoryNode,
  CategoryUnitDecision,
} from "@/lib/types";
import { saveCategorySystemFromResearcher } from "@/lib/gdiqr-repository";

const allowedActionTypes: AuditActionType[] = [
  "category_created",
  "category_renamed",
  "category_updated",
  "category_deleted",
  "meaning_unit_moved"
];

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      actionType?: AuditActionType;
      categories?: CategoryNode[];
      categoryUnitDecisions?: CategoryUnitDecision[];
      integratedNarrative?: string;
      mode?: CategoryMode;
      previousCategories?: CategoryNode[];
      projectId?: string;
      researcherNote?: string;
    };

    if (!body.projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    if (!Array.isArray(body.categories)) {
      return NextResponse.json(
        { error: "categories must be an array" },
        { status: 400 }
      );
    }

    const requestedActionType = body.actionType;
    const actionType: AuditActionType =
      requestedActionType && allowedActionTypes.includes(requestedActionType)
        ? requestedActionType
        : "category_updated";

    const result = await saveCategorySystemFromResearcher({
      action: body.action ?? "Updated researcher category system",
      actionType,
      categories: body.categories,
      categoryUnitDecisions: body.categoryUnitDecisions,
      integratedNarrative: body.integratedNarrative ?? "",
      mode: body.mode ?? "A",
      previousCategories: body.previousCategories,
      projectId: body.projectId,
      researcherNote: body.researcherNote
    });

    if (!result.saved) {
      return NextResponse.json({ ...result }, { status: 503 });
    }

    return NextResponse.json({ ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Category system could not be saved."
      },
      { status: 500 }
    );
  }
}
