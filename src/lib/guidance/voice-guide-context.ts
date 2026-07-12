import type {
  CategoryNode,
  IntegrationRelationship,
  IntegrityReviewItem,
  MeaningUnit,
  PreAnalysisNotes,
  Project,
  TranscriptRecord,
  WorkflowStep,
} from "@/lib/types";
import { getGuidanceForStep } from "@/lib/guidance/gdiqr-guidance";

export interface VoiceGuideSelectedContext {
  meaningUnitId?: string;
  categoryId?: string;
  relationshipId?: string;
}

export interface VoiceGuideProjectState {
  project: Project;
  preAnalysisNotes?: PreAnalysisNotes;
  transcriptRecords?: TranscriptRecord[];
  meaningUnits?: MeaningUnit[];
  categories?: CategoryNode[];
  integrationRelationships?: IntegrationRelationship[];
  integrityReviewItems?: IntegrityReviewItem[];
  integratedNarrative?: string;
}

export interface VoiceGuideContextSummary {
  projectId: string;
  step: WorkflowStep;
  researchQuestion: string;
  projectStatus: string;
  counts: Record<string, number>;
  readinessChecks: string[];
  unresolvedChecks: string[];
  selectedObject?: Record<string, unknown>;
  guidanceSourceKeys: string[];
}

export function buildVoiceGuideContext(
  state: VoiceGuideProjectState,
  step: WorkflowStep,
  selected: VoiceGuideSelectedContext = {},
): VoiceGuideContextSummary {
  const units = state.meaningUnits ?? [];
  const categories = state.categories ?? [];
  const relationships = state.integrationRelationships ?? [];
  const integrityItems = state.integrityReviewItems ?? [];
  const accepted = units.filter((unit) => !unit.analysisExcluded && ["Accepted", "Edited"].includes(unit.humanStatus));
  const unreviewed = units.filter((unit) => !unit.analysisExcluded && ["Draft", "Needs review"].includes(unit.humanStatus));
  const excludedWithoutReason = units.filter((unit) => unit.analysisExcluded && !unit.exclusionReason?.trim());
  const activeCategories = categories.filter((category) => category.status !== "rejected");
  const assignedIds = new Set(activeCategories.flatMap((category) => category.includedUnitIds));
  const unassignedAccepted = accepted.filter((unit) => !assignedIds.has(unit.number));
  const confirmedCategories = activeCategories.filter((category) => category.status === "confirmed");
  const unresolvedIntegrity = integrityItems.filter((item) => ["not_checked", "issue"].includes(item.status));

  const readinessChecks = getGuidanceForStep(step).criteriaForMovingNext;
  const unresolvedChecks: string[] = [];
  if (!state.project.researchQuestion.trim()) unresolvedChecks.push("Research question is not recorded.");
  if (step === "pre-analysis" && !state.project.dataSuitabilityConfirmed) unresolvedChecks.push("Data suitability is not confirmed.");
  if (step === "understanding" && unreviewed.length > 0) unresolvedChecks.push(`${unreviewed.length} meaning unit(s) remain unreviewed.`);
  if (step === "understanding" && excludedWithoutReason.length > 0) unresolvedChecks.push(`${excludedWithoutReason.length} excluded unit(s) have no reason.`);
  if (step === "categorizing" && unassignedAccepted.length > 0) unresolvedChecks.push(`${unassignedAccepted.length} accepted meaning unit(s) remain unassigned.`);
  if (step === "categorizing" && activeCategories.some((category) => !category.definition.trim())) unresolvedChecks.push("One or more active categories have no definition.");
  if (step === "integrating" && confirmedCategories.length === 0) unresolvedChecks.push("No categories are confirmed yet.");
  if (step === "integrating" && relationships.length === 0) unresolvedChecks.push("No category relationships are recorded.");
  if (step === "integrating" && !state.integratedNarrative?.trim()) unresolvedChecks.push("Integration narrative is empty.");
  if ((step === "integrity" || step === "export") && unresolvedIntegrity.length > 0) unresolvedChecks.push(`${unresolvedIntegrity.length} integrity check(s) remain unresolved.`);

  const selectedUnit = selected.meaningUnitId
    ? units.find((unit) => unit.id === selected.meaningUnitId)
    : undefined;
  const selectedCategory = selected.categoryId
    ? categories.find((category) => category.id === selected.categoryId)
    : undefined;
  const selectedRelationship = selected.relationshipId
    ? relationships.find((relationship) => relationship.id === selected.relationshipId)
    : undefined;

  let selectedObject: Record<string, unknown> | undefined;
  if (selectedUnit) {
    selectedObject = {
      type: "meaning_unit",
      id: selectedUnit.id,
      number: selectedUnit.number,
      excerpt: selectedUnit.excerpt,
      summary: selectedUnit.humanSummary || selectedUnit.aiSummary,
      status: selectedUnit.humanStatus,
      excluded: selectedUnit.analysisExcluded,
    };
  } else if (selectedCategory) {
    selectedObject = {
      type: "category",
      id: selectedCategory.id,
      name: selectedCategory.name,
      definition: selectedCategory.definition,
      status: selectedCategory.status,
      includedUnitIds: selectedCategory.includedUnitIds,
    };
  } else if (selectedRelationship) {
    selectedObject = {
      type: "relationship",
      id: selectedRelationship.id,
      sourceCategoryId: selectedRelationship.sourceCategoryId,
      targetCategoryId: selectedRelationship.targetCategoryId,
      label: selectedRelationship.label,
      memo: selectedRelationship.memo,
    };
  }

  return {
    projectId: state.project.id,
    step,
    researchQuestion: state.project.researchQuestion,
    projectStatus: state.project.status,
    counts: {
      transcriptRecords: state.transcriptRecords?.length ?? 0,
      meaningUnits: units.length,
      acceptedMeaningUnits: accepted.length,
      unreviewedMeaningUnits: unreviewed.length,
      excludedWithoutReason: excludedWithoutReason.length,
      activeCategories: activeCategories.length,
      confirmedCategories: confirmedCategories.length,
      unassignedAcceptedMeaningUnits: unassignedAccepted.length,
      relationships: relationships.length,
      unresolvedIntegrityChecks: unresolvedIntegrity.length,
    },
    readinessChecks,
    unresolvedChecks,
    selectedObject,
    guidanceSourceKeys: [
      `${step}.purpose`,
      `${step}.reflectivePrompts`,
      `${step}.criteriaForMovingNext`,
      `${step}.decisionBoundary`,
      "global.researcherResponsibility",
    ],
  };
}
