import { NextResponse } from "next/server";
import type {
  AuditActionType,
  IntegrationRelationship
} from "@/lib/types";
import {
  saveIntegrationWorkspace,
  type IntegrationRelationshipDraftForSave
} from "@/lib/gdiqr-repository";

function isIntegrationLabel(value: unknown): value is IntegrationRelationship["label"] {
  return (
    value === "contributes to" ||
    value === "contrasts with" ||
    value === "supports" ||
    value === "explains" ||
    value === "is part of" ||
    value === "leads to" ||
    value === "contextualises" ||
    value === "unclear relationship"
  );
}

function toIntegrationLabel(value: unknown): IntegrationRelationship["label"] {
  if (isIntegrationLabel(value)) {
    return value;
  }
  if (value === "develops into") {
    return "leads to";
  }
  if (value === "part of / contains") {
    return "is part of";
  }
  if (value === "overlaps with" || value === "co-occurs with") {
    return "contributes to";
  }
  if (value === "tensions with") {
    return "contrasts with";
  }
  return "unclear relationship";
}

function normaliseRelationships(value: unknown): IntegrationRelationshipDraftForSave[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const record = item as Record<string, unknown>;
    const sourceCategoryId = String(record.sourceCategoryId ?? "").trim();
    const targetCategoryId = String(record.targetCategoryId ?? "").trim();
    if (!sourceCategoryId || !targetCategoryId || sourceCategoryId === targetCategoryId) {
      return [];
    }

    return [
      {
        evidenceUnitNumbers: Array.isArray(record.evidenceUnitNumbers)
          ? record.evidenceUnitNumbers.filter(
              (unitNumber): unitNumber is number => typeof unitNumber === "number"
            )
          : [],
        id: typeof record.id === "string" ? record.id : undefined,
        label: toIntegrationLabel(record.label ?? record.type),
        memo: typeof record.memo === "string" ? record.memo : undefined,
        rationale:
          typeof record.rationale === "string" ? record.rationale : undefined,
        researcherNote:
          typeof record.researcherNote === "string"
            ? record.researcherNote
            : undefined,
        sourceCategoryId,
        targetCategoryId
      }
    ];
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    actionType?: AuditActionType;
    integratedNarrative?: string;
    integrationMemo?: string;
    projectId?: string;
    relationships?: unknown;
    reviewed?: boolean;
  };

  const projectId = body.projectId?.trim();
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId is required." },
      { status: 400 }
    );
  }

  const relationships = normaliseRelationships(body.relationships);
  const result = await saveIntegrationWorkspace({
    action: body.action ?? "Updated Step 4 integration workspace",
    actionType: body.actionType ?? "relationship_updated",
    integratedNarrative: body.integratedNarrative ?? "",
    integrationMemo: body.integrationMemo ?? "",
    projectId,
    relationships,
    reviewed: Boolean(body.reviewed)
  });

  return NextResponse.json(result, { status: result.saved ? 200 : 400 });
}
