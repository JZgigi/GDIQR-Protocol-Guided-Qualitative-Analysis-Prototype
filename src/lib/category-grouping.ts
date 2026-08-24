import type {
  CategoryGroupingCoverage,
  CategoryNode,
  CategoryUnitDecision,
  MeaningUnit,
} from "@/lib/types";

export interface ProposedUnassignedUnit {
  decision?: "intentionally_unassigned" | "needs_review";
  evidenceRole?: CategoryUnitDecision["evidenceRole"];
  reason?: string;
  unitNumber?: number;
}

export interface CategoryGroupingIntegrityResult {
  categories: CategoryNode[];
  coverage: CategoryGroupingCoverage;
  decisions: CategoryUnitDecision[];
  valid: boolean;
}

export function flattenInitialCategoryHierarchy(
  categories: CategoryNode[],
): CategoryNode[] {
  return categories.flatMap((category) => {
    const children = category.subcategories ?? [];
    if (children.length === 0) {
      return [{ ...category, subcategories: undefined }];
    }
    const promotedChildren = flattenInitialCategoryHierarchy(children);
    const childUnitIds = new Set(
      promotedChildren.flatMap((child) => child.includedUnitIds),
    );
    const parentOnlyUnitIds = category.includedUnitIds.filter(
      (unitNumber) => !childUnitIds.has(unitNumber),
    );
    if (parentOnlyUnitIds.length === 0) {
      return promotedChildren;
    }
    return [
      ...promotedChildren,
      {
        ...category,
        includedUnitIds: parentOnlyUnitIds,
        name: `${category.name} — evidence requiring further comparison`,
        status: "needs_review" as const,
        subcategories: undefined,
      },
    ];
  });
}

export function reconcileCategoryGrouping({
  categories,
  priorDecisions = [],
  units,
}: {
  categories: CategoryNode[];
  priorDecisions?: CategoryUnitDecision[];
  units: MeaningUnit[];
}) {
  const acceptedNumbers = new Set(units.map((unit) => unit.number));
  const priorByUnit = new Map(
    priorDecisions.map((decision) => [decision.unitNumber, decision]),
  );
  const assignments = new Map<number, string[]>();
  for (const category of categories) {
    for (const unitNumber of category.includedUnitIds) {
      if (!acceptedNumbers.has(unitNumber)) {
        continue;
      }
      assignments.set(unitNumber, [
        ...(assignments.get(unitNumber) ?? []),
        category.id,
      ]);
    }
  }
  return units.map((unit): CategoryUnitDecision => {
    const categoryIds = assignments.get(unit.number) ?? [];
    if (categoryIds.length === 1) {
      const prior = priorByUnit.get(unit.number);
      return {
        categoryId: categoryIds[0],
        decision: "assigned",
        evidenceRole: prior?.evidenceRole ?? "core",
        reason:
          prior?.categoryId === categoryIds[0] && prior.reason
            ? prior.reason
            : "Assigned to the category whose shared meaning best fits this MU.",
        source:
          prior?.categoryId === categoryIds[0] ? prior.source : "researcher",
        unitNumber: unit.number,
      };
    }
    if (categoryIds.length > 1) {
      return {
        decision: "needs_review",
        evidenceRole: "qualifying",
        reason:
          "This MU has more than one primary category assignment. Select one primary category and represent other connections during Integration.",
        source: "researcher",
        unitNumber: unit.number,
      };
    }
    const prior = priorByUnit.get(unit.number);
    if (
      prior &&
      (prior.decision === "intentionally_unassigned" ||
        prior.decision === "needs_review")
    ) {
      return { ...prior, categoryId: undefined };
    }
    return {
      decision: "needs_review",
      evidenceRole: "unique_case",
      reason:
        "No category decision has been recorded yet. Compare this MU with existing categories or document why it should remain unassigned.",
      source: "researcher",
      unitNumber: unit.number,
    };
  });
}

export function validateCategoryGrouping({
  categories,
  proposedUnassigned = [],
  units,
}: {
  categories: CategoryNode[];
  proposedUnassigned?: ProposedUnassignedUnit[];
  units: MeaningUnit[];
}): CategoryGroupingIntegrityResult {
  const inputNumbers = new Set(units.map((unit) => unit.number));
  const invalidReferences = new Set<number>();
  const assignments = new Map<number, string[]>();
  const cleanedCategories = flattenInitialCategoryHierarchy(categories)
    .map((category) => {
      const includedUnitIds = [
        ...new Set(
          category.includedUnitIds.filter((unitNumber) => {
            if (!inputNumbers.has(unitNumber)) {
              invalidReferences.add(unitNumber);
              return false;
            }
            return true;
          }),
        ),
      ].sort((left, right) => left - right);
      includedUnitIds.forEach((unitNumber) =>
        assignments.set(unitNumber, [
          ...(assignments.get(unitNumber) ?? []),
          category.id,
        ]),
      );
      return { ...category, includedUnitIds, subcategories: undefined };
    })
    .filter((category) => category.includedUnitIds.length > 0);

  const proposedUnassignedByUnit = new Map<number, ProposedUnassignedUnit>();
  for (const item of proposedUnassigned) {
    const unitNumber = Number(item.unitNumber);
    if (!Number.isInteger(unitNumber) || !inputNumbers.has(unitNumber)) {
      if (Number.isFinite(unitNumber)) {
        invalidReferences.add(unitNumber);
      }
      continue;
    }
    proposedUnassignedByUnit.set(unitNumber, item);
  }

  const duplicateAssignments: number[] = [];
  const unaccountedUnits: number[] = [];
  const decisions = units.map((unit): CategoryUnitDecision => {
    const categoryIds = assignments.get(unit.number) ?? [];
    if (categoryIds.length === 1) {
      return {
        categoryId: categoryIds[0],
        decision: "assigned",
        evidenceRole: "core",
        reason:
          "AI-proposed primary fit based on shared substantive meaning; researcher review required.",
        source: "ai",
        unitNumber: unit.number,
      };
    }
    if (categoryIds.length > 1) {
      duplicateAssignments.push(unit.number);
      return {
        decision: "needs_review",
        evidenceRole: "qualifying",
        reason:
          "AI assigned this MU to multiple primary categories. Researcher must select one primary category.",
        source: "ai",
        unitNumber: unit.number,
      };
    }
    const proposed = proposedUnassignedByUnit.get(unit.number);
    if (proposed) {
      return {
        decision:
          proposed.decision === "intentionally_unassigned"
            ? "intentionally_unassigned"
            : "needs_review",
        evidenceRole: proposed.evidenceRole ?? "unique_case",
        reason:
          proposed.reason?.trim() ||
          "AI could not identify a sufficiently coherent category fit; researcher review required.",
        source: "ai",
        unitNumber: unit.number,
      };
    }
    unaccountedUnits.push(unit.number);
    return {
      decision: "needs_review",
      evidenceRole: "unique_case",
      reason:
        "AI output omitted this accepted MU. It remains visible and requires a researcher category decision.",
      source: "ai",
      unitNumber: unit.number,
    };
  });

  if (duplicateAssignments.length > 0) {
    const duplicates = new Set(duplicateAssignments);
    cleanedCategories.forEach((category) => {
      category.includedUnitIds = category.includedUnitIds.filter(
        (unitNumber) => !duplicates.has(unitNumber),
      );
    });
  }

  const coverage: CategoryGroupingCoverage = {
    assigned: decisions.filter((item) => item.decision === "assigned").length,
    duplicateAssignments,
    inputUnits: units.length,
    intentionallyUnassigned: decisions.filter(
      (item) => item.decision === "intentionally_unassigned",
    ).length,
    invalidReferences: [...invalidReferences].sort((a, b) => a - b),
    needsReview: decisions.filter((item) => item.decision === "needs_review")
      .length,
    unaccountedUnits,
  };
  return {
    categories: cleanedCategories.filter(
      (category) => category.includedUnitIds.length > 0,
    ),
    coverage,
    decisions,
    valid:
      coverage.duplicateAssignments.length === 0 &&
      coverage.invalidReferences.length === 0 &&
      coverage.unaccountedUnits.length === 0,
  };
}
