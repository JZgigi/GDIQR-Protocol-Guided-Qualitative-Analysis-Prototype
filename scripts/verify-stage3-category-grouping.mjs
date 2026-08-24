import assert from "node:assert/strict";
import {
  flattenInitialCategoryHierarchy,
  reconcileCategoryGrouping,
  validateCategoryGrouping,
} from "../src/lib/category-grouping.ts";

const units = [1, 2, 3, 4].map((number) => ({
  id: `mu-${number}`,
  number,
}));
const category = (id, includedUnitIds, subcategories) => ({
  definition: `Definition ${id}`,
  id,
  includedUnitIds,
  name: `Category ${id}`,
  subcategories,
});

const duplicateResult = validateCategoryGrouping({
  categories: [category("a", [1, 2]), category("b", [2, 3])],
  proposedUnassigned: [
    {
      decision: "intentionally_unassigned",
      reason: "Distinct case",
      unitNumber: 4,
    },
  ],
  units,
});
assert.deepEqual(duplicateResult.coverage.duplicateAssignments, [2]);
assert.equal(
  duplicateResult.decisions.find((item) => item.unitNumber === 2)?.decision,
  "needs_review",
);
assert.ok(
  duplicateResult.categories.every(
    (item) => !item.includedUnitIds.includes(2),
  ),
  "A duplicated primary MU must be removed from competing categories until a researcher decides.",
);

const completeResult = validateCategoryGrouping({
  categories: [category("a", [1, 2]), category("b", [3])],
  proposedUnassigned: [
    {
      decision: "intentionally_unassigned",
      evidenceRole: "unique_case",
      reason: "Distinct case",
      unitNumber: 4,
    },
  ],
  units,
});
assert.equal(completeResult.valid, true);
assert.equal(completeResult.coverage.assigned, 3);
assert.equal(completeResult.coverage.intentionallyUnassigned, 1);
assert.equal(completeResult.coverage.unaccountedUnits.length, 0);

const missingResult = validateCategoryGrouping({
  categories: [category("a", [1])],
  units,
});
assert.deepEqual(missingResult.coverage.unaccountedUnits, [2, 3, 4]);
assert.equal(missingResult.valid, false);

const flattened = flattenInitialCategoryHierarchy([
  category("parent", [1, 2, 3], [
    category("child-a", [1, 2]),
    category("child-b", [3]),
  ]),
]);
assert.deepEqual(
  flattened.map((item) => item.id),
  ["child-a", "child-b"],
  "Read-only AI subcategories must be promoted into editable peer categories without duplicating parent evidence.",
);

const reconciled = reconcileCategoryGrouping({
  categories: [category("a", [1])],
  priorDecisions: [
    {
      decision: "intentionally_unassigned",
      evidenceRole: "unique_case",
      reason: "Researcher documented a distinct case",
      source: "researcher",
      unitNumber: 2,
    },
  ],
  units: units.slice(0, 2),
});
assert.equal(reconciled[1].decision, "intentionally_unassigned");
assert.equal(reconciled[1].source, "researcher");

console.log("Stage 3 category grouping integrity checks passed.");
