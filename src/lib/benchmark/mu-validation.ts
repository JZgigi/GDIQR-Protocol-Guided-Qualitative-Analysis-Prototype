import type {
  BenchmarkFailureCategory,
  BenchmarkSpeakerRole,
  DraftMeaningUnit,
  FinalMeaningUnit,
  FinalMeaningUnitOutput,
  MeaningUnitReviewFinding,
  MeaningUnitReviewIssueType,
  RemovedDraftMeaningUnit,
  SourceLocation
} from "./types.ts";
import type { MeaningUnitEvidenceBundle } from "./mu-evidence.ts";

export const MU_SCHEMA_VERSION = "benchmark-mu-v1.0.0";

export class MeaningUnitValidationError extends Error {
  readonly category: BenchmarkFailureCategory;

  constructor(
    message: string,
    category: BenchmarkFailureCategory
  ) {
    super(message);
    this.name = "MeaningUnitValidationError";
    this.category = category;
  }
}

const issueTypes = new Set<MeaningUnitReviewIssueType>([
  "substantive_meaning_omitted",
  "over_segmentation",
  "under_segmentation",
  "duplicate_or_overlap",
  "distinct_meanings_combined",
  "facilitator_included",
  "unknown_speaker_included",
  "source_or_speaker_mismatch",
  "summary_inaccurate",
  "summary_over_interpreted",
  "summary_repeats_source"
]);
const recommendationActions = new Set([
  "retain",
  "revise",
  "split",
  "merge",
  "remove",
  "add"
]);
const finalActions = new Set(["unchanged", "revised", "split", "merged", "added"]);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MeaningUnitValidationError(`${label} must be an object.`, "schema_invalid");
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  label: string
) {
  for (const key of required) {
    if (!(key in value)) {
      throw new MeaningUnitValidationError(`${label}.${key} is required.`, "schema_invalid");
    }
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new MeaningUnitValidationError(`${label}.${key} is not allowed.`, "schema_invalid");
    }
  }
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new MeaningUnitValidationError(`${label} must be non-empty text.`, "schema_invalid");
  }
  return value;
}

function stringArray(value: unknown, label: string, allowEmpty = true) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new MeaningUnitValidationError(`${label} must be an array of non-empty strings.`, "schema_invalid");
  }
  if (!allowEmpty && value.length === 0) {
    throw new MeaningUnitValidationError(`${label} cannot be empty.`, "schema_invalid");
  }
  return value as string[];
}

function sourceLocation(value: unknown, label: string): SourceLocation {
  const item = record(value, label);
  exactKeys(item, ["turnIds"], ["start", "end"], label);
  const turnIds = stringArray(item.turnIds, `${label}.turnIds`, false);
  const hasStart = item.start !== undefined;
  const hasEnd = item.end !== undefined;
  if (hasStart !== hasEnd) {
    throw new MeaningUnitValidationError(`${label} must contain both offsets or neither.`, "schema_invalid");
  }
  if (
    hasStart &&
    (!Number.isInteger(item.start) ||
      !Number.isInteger(item.end) ||
      (item.start as number) < 0 ||
      (item.end as number) < (item.start as number))
  ) {
    throw new MeaningUnitValidationError(`${label} offsets are invalid.`, "schema_invalid");
  }
  return {
    turnIds,
    ...(hasStart ? { start: item.start as number, end: item.end as number } : {})
  };
}

function optionalText(value: unknown, label: string) {
  return value === undefined ? undefined : text(value, label);
}

function role(value: unknown, label: string): BenchmarkSpeakerRole {
  if (!new Set(["participant", "facilitator", "unknown"]).has(String(value))) {
    throw new MeaningUnitValidationError(`${label} is invalid.`, "schema_invalid");
  }
  return value as BenchmarkSpeakerRole;
}

function assertEnglishAnalyticText(value: string, label: string) {
  const cjk = value.match(/[\u3400-\u9fff\uf900-\ufaff]/g)?.length ?? 0;
  if (cjk >= 10 && cjk / value.length >= 0.1) {
    throw new MeaningUnitValidationError(`${label} must be English.`, "semantic_validation_failure");
  }
}

function parseCommonMeaningUnit(item: Record<string, unknown>, label: string) {
  const parsed = {
    transcriptId: text(item.transcriptId, `${label}.transcriptId`),
    focusGroupId: text(item.focusGroupId, `${label}.focusGroupId`),
    speakerId: text(item.speakerId, `${label}.speakerId`),
    speakerRole: role(item.speakerRole, `${label}.speakerRole`),
    sourceLocation: sourceLocation(item.sourceLocation, `${label}.sourceLocation`),
    sourceText: text(item.sourceText, `${label}.sourceText`),
    summary: text(item.summary, `${label}.summary`),
    uncertainty: optionalText(item.uncertainty, `${label}.uncertainty`)
  };
  assertEnglishAnalyticText(parsed.summary, `${label}.summary`);
  return parsed;
}

export function parseDraftMeaningUnitOutput(value: unknown): { draftMeaningUnits: DraftMeaningUnit[] } {
  const output = record(value, "draft output");
  exactKeys(output, ["draftMeaningUnits"], [], "draft output");
  if (!Array.isArray(output.draftMeaningUnits)) {
    throw new MeaningUnitValidationError("draftMeaningUnits must be an array.", "schema_invalid");
  }
  const draftMeaningUnits = output.draftMeaningUnits.map((value, index) => {
    const label = `draftMeaningUnits[${index}]`;
    const item = record(value, label);
    exactKeys(
      item,
      ["draftMuId", "transcriptId", "focusGroupId", "speakerId", "speakerRole", "sourceLocation", "sourceText", "summary"],
      ["uncertainty"],
      label
    );
    return {
      draftMuId: text(item.draftMuId, `${label}.draftMuId`),
      ...parseCommonMeaningUnit(item, label)
    };
  });
  return { draftMeaningUnits };
}

export function parseMeaningUnitReviewOutput(value: unknown): { findings: MeaningUnitReviewFinding[] } {
  const output = record(value, "review output");
  exactKeys(output, ["findings"], [], "review output");
  if (!Array.isArray(output.findings)) {
    throw new MeaningUnitValidationError("findings must be an array.", "schema_invalid");
  }
  return {
    findings: output.findings.map((value, index) => {
      const label = `findings[${index}]`;
      const item = record(value, label);
      exactKeys(
        item,
        ["findingId", "issueType", "affectedDraftMuIds", "sourceReferences", "recommendedAction", "conciseMethodologicalRationale"],
        [],
        label
      );
      if (!issueTypes.has(item.issueType as MeaningUnitReviewIssueType)) {
        throw new MeaningUnitValidationError(`${label}.issueType is invalid.`, "schema_invalid");
      }
      if (!recommendationActions.has(String(item.recommendedAction))) {
        throw new MeaningUnitValidationError(`${label}.recommendedAction is invalid.`, "schema_invalid");
      }
      if (!Array.isArray(item.sourceReferences)) {
        throw new MeaningUnitValidationError(`${label}.sourceReferences must be an array.`, "schema_invalid");
      }
      if (item.sourceReferences.length === 0) {
        throw new MeaningUnitValidationError(`${label}.sourceReferences cannot be empty.`, "schema_invalid");
      }
      const sourceReferences = item.sourceReferences.map((value, referenceIndex) => {
        const referenceLabel = `${label}.sourceReferences[${referenceIndex}]`;
        const source = record(value, referenceLabel);
        exactKeys(
          source,
          ["transcriptId", "focusGroupId", "turnIds", "speakerId", "speakerRole", "exactSourceText"],
          ["start", "end"],
          referenceLabel
        );
        const location = sourceLocation(
          { turnIds: source.turnIds, ...(source.start === undefined ? {} : { start: source.start, end: source.end }) },
          referenceLabel
        );
        return {
          transcriptId: text(source.transcriptId, `${referenceLabel}.transcriptId`),
          focusGroupId: text(source.focusGroupId, `${referenceLabel}.focusGroupId`),
          turnIds: location.turnIds,
          speakerId: text(source.speakerId, `${referenceLabel}.speakerId`),
          speakerRole: role(source.speakerRole, `${referenceLabel}.speakerRole`),
          exactSourceText: text(source.exactSourceText, `${referenceLabel}.exactSourceText`),
          ...(location.start === undefined ? {} : { start: location.start, end: location.end })
        };
      });
      const affectedDraftMuIds = stringArray(item.affectedDraftMuIds, `${label}.affectedDraftMuIds`);
      if (item.issueType === "substantive_meaning_omitted") {
        if (affectedDraftMuIds.length !== 0 || item.recommendedAction !== "add") {
          throw new MeaningUnitValidationError(`${label} omission findings must add evidence without a draft MU reference.`, "schema_invalid");
        }
      } else if (affectedDraftMuIds.length === 0) {
        throw new MeaningUnitValidationError(`${label} must reference an affected draft MU.`, "schema_invalid");
      }
      return {
        findingId: text(item.findingId, `${label}.findingId`),
        issueType: item.issueType as MeaningUnitReviewIssueType,
        affectedDraftMuIds,
        sourceReferences,
        recommendedAction: item.recommendedAction as MeaningUnitReviewFinding["recommendedAction"],
        conciseMethodologicalRationale: text(item.conciseMethodologicalRationale, `${label}.conciseMethodologicalRationale`)
      };
    })
  };
}

export function parseFinalMeaningUnitOutput(value: unknown): FinalMeaningUnitOutput {
  const output = record(value, "final output");
  exactKeys(output, ["finalMeaningUnits", "removedDraftMeaningUnits"], [], "final output");
  if (!Array.isArray(output.finalMeaningUnits) || !Array.isArray(output.removedDraftMeaningUnits)) {
    throw new MeaningUnitValidationError("Final MU arrays are required.", "schema_invalid");
  }
  const finalMeaningUnits: FinalMeaningUnit[] = output.finalMeaningUnits.map((value, index) => {
    const label = `finalMeaningUnits[${index}]`;
    const item = record(value, label);
    exactKeys(
      item,
      ["muId", "transcriptId", "focusGroupId", "speakerId", "speakerRole", "sourceLocation", "sourceText", "summary", "sourceDraftMuIds", "appliedReviewFindingIds", "reviewAction"],
      ["uncertainty"],
      label
    );
    if (!finalActions.has(String(item.reviewAction))) {
      throw new MeaningUnitValidationError(`${label}.reviewAction is invalid.`, "schema_invalid");
    }
    return {
      muId: text(item.muId, `${label}.muId`),
      ...parseCommonMeaningUnit(item, label),
      sourceDraftMuIds: stringArray(item.sourceDraftMuIds, `${label}.sourceDraftMuIds`),
      appliedReviewFindingIds: stringArray(item.appliedReviewFindingIds, `${label}.appliedReviewFindingIds`),
      reviewAction: item.reviewAction as FinalMeaningUnit["reviewAction"]
    };
  });
  const removedDraftMeaningUnits: RemovedDraftMeaningUnit[] = output.removedDraftMeaningUnits.map((value, index) => {
    const label = `removedDraftMeaningUnits[${index}]`;
    const item = record(value, label);
    exactKeys(item, ["draftMuId", "reviewAction", "appliedReviewFindingIds", "conciseMethodologicalRationale"], [], label);
    if (item.reviewAction !== "removed") {
      throw new MeaningUnitValidationError(`${label}.reviewAction must be removed.`, "schema_invalid");
    }
    return {
      draftMuId: text(item.draftMuId, `${label}.draftMuId`),
      reviewAction: "removed",
      appliedReviewFindingIds: stringArray(item.appliedReviewFindingIds, `${label}.appliedReviewFindingIds`, false),
      conciseMethodologicalRationale: text(item.conciseMethodologicalRationale, `${label}.conciseMethodologicalRationale`)
    };
  });
  return { finalMeaningUnits, removedDraftMeaningUnits };
}

function findTurn(bundle: MeaningUnitEvidenceBundle, turnId: string) {
  return bundle.turns.find((turn) => turn.turnId === turnId);
}

function validateSource(
  bundle: MeaningUnitEvidenceBundle,
  source: {
    transcriptId: string;
    focusGroupId: string;
    speakerId: string;
    speakerRole: BenchmarkSpeakerRole;
    sourceLocation: SourceLocation;
    sourceText: string;
  },
  label: string
) {
  if (source.transcriptId !== bundle.transcriptId || source.focusGroupId !== bundle.focusGroupId) {
    throw new MeaningUnitValidationError(`${label} references the wrong transcript or focus group.`, "invalid_reference");
  }
  const turns = source.sourceLocation.turnIds.map((turnId) => findTurn(bundle, turnId));
  if (turns.some((turn) => !turn)) {
    throw new MeaningUnitValidationError(`${label} references an unknown turn.`, "invalid_reference");
  }
  if (!source.sourceLocation.turnIds.some((turnId) => bundle.analysisTurnIds.includes(turnId))) {
    throw new MeaningUnitValidationError(`${label} cites overlap context without an analysis turn.`, "invalid_reference");
  }
  const knownTurns = turns as MeaningUnitEvidenceBundle["turns"];
  if (knownTurns.some((turn) => turn.speakerId !== source.speakerId || turn.speakerRole !== source.speakerRole)) {
    throw new MeaningUnitValidationError(`${label} does not match the frozen speaker mapping.`, "invalid_reference");
  }
  if (knownTurns.length > 1) {
    if (source.speakerRole !== "participant") {
      throw new MeaningUnitValidationError(`${label} uses multiple turns that are not confirmed participant material.`, "invalid_reference");
    }
    const indices = source.sourceLocation.turnIds.map((turnId) =>
      bundle.turns.findIndex((turn) => turn.turnId === turnId)
    );
    for (let index = 1; index < indices.length; index += 1) {
      const previous = indices[index - 1];
      const current = indices[index];
      const directlyAdjacent = current === previous + 1;
      const followsOneFacilitatorProbe =
        current === previous + 2 &&
        bundle.turns[previous + 1]?.speakerRole === "facilitator";
      if (!directlyAdjacent && !followsOneFacilitatorProbe) {
        throw new MeaningUnitValidationError(
          `${label} multi-turn references must be in transcript order and directly connected, optionally by one facilitator probe.`,
          "invalid_reference"
        );
      }
    }
  }
  const selectedText = knownTurns.map((turn) => turn.text).join("\n");
  if (!selectedText.includes(source.sourceText)) {
    throw new MeaningUnitValidationError(`${label} source text is not exact frozen turn text.`, "invalid_reference");
  }
  if (source.sourceLocation.start !== undefined) {
    const first = knownTurns[0];
    const last = knownTurns[knownTurns.length - 1];
    if (first.start === undefined || last.end === undefined) {
      throw new MeaningUnitValidationError(`${label} supplied offsets where the frozen transcript has none.`, "invalid_reference");
    }
    const relativeStart = source.sourceLocation.start - first.start;
    const relativeEnd = source.sourceLocation.end! - first.start;
    if (relativeStart < 0 || source.sourceLocation.end! > last.end || selectedText.slice(relativeStart, relativeEnd) !== source.sourceText) {
      throw new MeaningUnitValidationError(`${label} offsets do not match the exact source text.`, "invalid_reference");
    }
  }
}

export function hasConfirmedParticipantSpeech(bundle: MeaningUnitEvidenceBundle) {
  return bundle.turns.some(
    (turn) => turn.speakerRole === "participant" && turn.text.trim().length > 0
  );
}

function uniqueIds(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) {
    throw new MeaningUnitValidationError(`${label} contains duplicate IDs.`, "invalid_reference");
  }
}

export function validateDraftMeaningUnits(bundle: MeaningUnitEvidenceBundle, units: DraftMeaningUnit[]) {
  uniqueIds(units.map((unit) => unit.draftMuId), "Draft MU output");
  if (units.length === 0 && hasConfirmedParticipantSpeech(bundle)) {
    throw new MeaningUnitValidationError("An empty MU set is invalid because confirmed participant speech is present.", "semantic_validation_failure");
  }
  for (const unit of units) {
    if (!unit.draftMuId.startsWith(`${bundle.batchId}:`)) {
      throw new MeaningUnitValidationError(`Draft MU ${unit.draftMuId} does not use the locked batch ID prefix.`, "invalid_reference");
    }
    validateSource(bundle, unit, `Draft MU ${unit.draftMuId}`);
  }
  return units;
}

export function validateReviewFindings(
  bundle: MeaningUnitEvidenceBundle,
  drafts: DraftMeaningUnit[],
  findings: MeaningUnitReviewFinding[]
) {
  uniqueIds(findings.map((finding) => finding.findingId), "MU review");
  const draftIds = new Set(drafts.map((draft) => draft.draftMuId));
  for (const finding of findings) {
    if (!finding.findingId.startsWith(`${bundle.batchId}:`)) {
      throw new MeaningUnitValidationError(`Review finding ${finding.findingId} does not use the locked batch ID prefix.`, "invalid_reference");
    }
    if (finding.affectedDraftMuIds.some((id) => !draftIds.has(id))) {
      throw new MeaningUnitValidationError(`Review finding ${finding.findingId} references an unknown draft MU.`, "invalid_reference");
    }
    for (const reference of finding.sourceReferences) {
      validateSource(
        bundle,
        {
          ...reference,
          sourceLocation: { turnIds: reference.turnIds, start: reference.start, end: reference.end },
          sourceText: reference.exactSourceText
        },
        `Review finding ${finding.findingId}`
      );
    }
  }
  return findings;
}

export function validateFinalMeaningUnits(
  bundle: MeaningUnitEvidenceBundle,
  drafts: DraftMeaningUnit[],
  findings: MeaningUnitReviewFinding[],
  output: FinalMeaningUnitOutput
) {
  const units = output.finalMeaningUnits;
  uniqueIds(units.map((unit) => unit.muId), "Final MU output");
  if (units.length === 0 && hasConfirmedParticipantSpeech(bundle)) {
    throw new MeaningUnitValidationError("An empty final MU set is invalid because confirmed participant speech is present.", "semantic_validation_failure");
  }
  const draftIds = new Set(drafts.map((draft) => draft.draftMuId));
  const findingIds = new Set(findings.map((finding) => finding.findingId));
  const derivedIds = new Set<string>();
  for (const unit of units) {
    if (!unit.muId.startsWith(`${bundle.batchId}:`)) {
      throw new MeaningUnitValidationError(`Final MU ${unit.muId} does not use the locked batch ID prefix.`, "invalid_reference");
    }
    validateSource(bundle, unit, `Final MU ${unit.muId}`);
    if (unit.speakerRole !== "participant") {
      throw new MeaningUnitValidationError(`Final MU ${unit.muId} is not confirmed participant material.`, "invalid_reference");
    }
    if (unit.sourceDraftMuIds.some((id) => !draftIds.has(id)) || unit.appliedReviewFindingIds.some((id) => !findingIds.has(id))) {
      throw new MeaningUnitValidationError(`Final MU ${unit.muId} has invalid lineage references.`, "invalid_reference");
    }
    if (unit.reviewAction === "added" && (unit.sourceDraftMuIds.length !== 0 || unit.appliedReviewFindingIds.length === 0)) {
      throw new MeaningUnitValidationError(`Added MU ${unit.muId} requires no draft parent and at least one review finding.`, "invalid_reference");
    }
    if (["unchanged", "revised", "split"].includes(unit.reviewAction) && unit.sourceDraftMuIds.length !== 1) {
      throw new MeaningUnitValidationError(`${unit.reviewAction} MU ${unit.muId} requires exactly one draft parent.`, "invalid_reference");
    }
    if (unit.reviewAction === "merged" && unit.sourceDraftMuIds.length < 2) {
      throw new MeaningUnitValidationError(`Merged MU ${unit.muId} requires at least two draft parents.`, "invalid_reference");
    }
    if (unit.reviewAction !== "unchanged" && unit.appliedReviewFindingIds.length === 0) {
      throw new MeaningUnitValidationError(`${unit.reviewAction} MU ${unit.muId} requires a review finding.`, "invalid_reference");
    }
    unit.sourceDraftMuIds.forEach((id) => derivedIds.add(id));
  }
  uniqueIds(output.removedDraftMeaningUnits.map((removed) => removed.draftMuId), "Removed draft MU output");
  const removedIds = new Set<string>();
  for (const removed of output.removedDraftMeaningUnits) {
    if (!draftIds.has(removed.draftMuId) || derivedIds.has(removed.draftMuId)) {
      throw new MeaningUnitValidationError(`Removed draft MU ${removed.draftMuId} has invalid lineage.`, "invalid_reference");
    }
    if (removed.appliedReviewFindingIds.some((id) => !findingIds.has(id))) {
      throw new MeaningUnitValidationError(`Removed draft MU ${removed.draftMuId} references an unknown finding.`, "invalid_reference");
    }
    removedIds.add(removed.draftMuId);
  }
  const unaccounted = [...draftIds].filter((id) => !derivedIds.has(id) && !removedIds.has(id));
  if (unaccounted.length > 0) {
    throw new MeaningUnitValidationError(`Final lineage does not account for draft MU(s): ${unaccounted.join(", ")}.`, "invalid_reference");
  }
  return output;
}
