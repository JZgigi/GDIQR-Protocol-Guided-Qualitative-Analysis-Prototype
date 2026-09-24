import assert from "node:assert/strict";
import test from "node:test";
import { createMeaningUnitEvidenceBundles } from "../../src/lib/benchmark/mu-evidence.ts";
import {
  MeaningUnitValidationError,
  hasConfirmedParticipantSpeech,
  parseDraftMeaningUnitOutput,
  parseFinalMeaningUnitOutput,
  parseMeaningUnitReviewOutput,
  validateDraftMeaningUnits,
  validateFinalMeaningUnits,
  validateReviewFindings
} from "../../src/lib/benchmark/mu-validation.ts";
import { syntheticFrozenInput } from "./fixtures.ts";
import { syntheticBenchmarkInput } from "./fixtures.ts";
import { createFrozenBenchmarkInput } from "../../src/lib/benchmark/input.ts";

const batchId = "TR1:chunk-001";
const source = (turnIds: string[], sourceText: string, speakerId = "F1") => ({
  transcriptId: "TR1",
  focusGroupId: "FG1",
  speakerId,
  speakerRole: "participant" as const,
  sourceLocation: { turnIds },
  sourceText
});

test("frozen anonymised labels retain explicit roles and filler may yield zero MUs", () => {
  const bundle = createMeaningUnitEvidenceBundles(syntheticFrozenInput())[0];
  assert.equal(bundle.turns.find((turn) => turn.speakerId === "F1")?.speakerRole, "participant");
  assert.equal(bundle.turns.find((turn) => turn.speakerId === "M2")?.speakerRole, "participant");
  assert.equal(bundle.turns.find((turn) => turn.speakerId === "U1")?.speakerRole, "unknown");
  assert.equal(hasConfirmedParticipantSpeech(bundle), true);

  const units = parseDraftMeaningUnitOutput({
    draftMeaningUnits: [
      {
        draftMuId: `${batchId}:DRAFT-MU-001`,
        ...source(["T3"], "The group listened without judging me. That made it easier to speak honestly."),
        summary: "Non-judgmental listening enabled honest disclosure."
      },
      {
        draftMuId: `${batchId}:DRAFT-MU-002`,
        ...source(["T4"], "I felt isolated at first.", "M2"),
        summary: "The participant initially felt isolated."
      },
      {
        draftMuId: `${batchId}:DRAFT-MU-003`,
        ...source(["T4"], "Later, meeting peers gave me confidence.", "M2"),
        summary: "Meeting peers later increased confidence."
      }
    ]
  }).draftMeaningUnits;
  assert.doesNotThrow(() => validateDraftMeaningUnits(bundle, units));
  assert.equal(units.filter((unit) => unit.sourceLocation.turnIds.includes("T2")).length, 0);
  assert.equal(units.filter((unit) => unit.sourceLocation.turnIds.includes("T7")).length, 0);
});

test("review findings cover over/under-segmentation, duplicates, omission, and summary correction", () => {
  const bundle = createMeaningUnitEvidenceBundles(syntheticFrozenInput())[0];
  const drafts = parseDraftMeaningUnitOutput({
    draftMeaningUnits: [
      { draftMuId: `${batchId}:D1`, ...source(["T3"], "The group listened without judging me."), summary: "The group listened." },
      { draftMuId: `${batchId}:D2`, ...source(["T3"], "That made it easier to speak honestly."), summary: "Speaking became easier." },
      { draftMuId: `${batchId}:D3`, ...source(["T4"], "I felt isolated at first. Later, meeting peers gave me confidence.", "M2"), summary: "The participant had a mixed experience." },
      { draftMuId: `${batchId}:D4`, ...source(["T3"], "The group listened without judging me."), summary: "The group listened without judgement." },
      { draftMuId: `${batchId}:D5`, ...source(["T8"], "I still worried that support would disappear after the programme ended."), summary: "The participant was certain support would continue." }
    ]
  }).draftMeaningUnits;
  validateDraftMeaningUnits(bundle, drafts);
  const findingData = [
    ["F1", "over_segmentation", [`${batchId}:D1`, `${batchId}:D2`], "merge", "T3", "The group listened without judging me. That made it easier to speak honestly.", "F1"],
    ["F2", "under_segmentation", [`${batchId}:D3`], "split", "T4", "I felt isolated at first. Later, meeting peers gave me confidence.", "M2"],
    ["F3", "duplicate_or_overlap", [`${batchId}:D4`], "remove", "T3", "The group listened without judging me.", "F1"],
    ["F4", "substantive_meaning_omitted", [], "add", "T9", "Travel costs sometimes stopped me from attending the group.", "M2"],
    ["F5", "summary_inaccurate", [`${batchId}:D5`], "revise", "T8", "I still worried that support would disappear after the programme ended.", "F1"]
  ];
  const findings = parseMeaningUnitReviewOutput({
    findings: findingData.map(([id, issueType, affectedDraftMuIds, recommendedAction, turnId, exactSourceText, speakerId]) => ({
      findingId: `${batchId}:${id}`,
      issueType,
      affectedDraftMuIds,
      sourceReferences: [{
        transcriptId: "TR1",
        focusGroupId: "FG1",
        turnIds: [turnId],
        speakerId,
        speakerRole: "participant",
        exactSourceText
      }],
      recommendedAction,
      conciseMethodologicalRationale: "Synthetic methodological finding."
    }))
  }).findings;
  assert.doesNotThrow(() => validateReviewFindings(bundle, drafts, findings));
  assert.deepEqual(
    findings.map((finding) => finding.issueType),
    ["over_segmentation", "under_segmentation", "duplicate_or_overlap", "substantive_meaning_omitted", "summary_inaccurate"]
  );
});

test("final revision validates merge, split, revised, added, and removed lineage", () => {
  const bundle = createMeaningUnitEvidenceBundles(syntheticFrozenInput())[0];
  const drafts = parseDraftMeaningUnitOutput({ draftMeaningUnits: [
    { draftMuId: `${batchId}:D1`, ...source(["T3"], "The group listened without judging me."), summary: "The group listened." },
    { draftMuId: `${batchId}:D2`, ...source(["T3"], "That made it easier to speak honestly."), summary: "Speaking became easier." },
    { draftMuId: `${batchId}:D3`, ...source(["T4"], "I felt isolated at first. Later, meeting peers gave me confidence.", "M2"), summary: "A mixed experience." },
    { draftMuId: `${batchId}:D4`, ...source(["T3"], "The group listened without judging me."), summary: "Duplicate." },
    { draftMuId: `${batchId}:D5`, ...source(["T8"], "I still worried that support would disappear after the programme ended."), summary: "The participant was certain support would continue." }
  ] }).draftMeaningUnits;
  const findings = parseMeaningUnitReviewOutput({ findings: [
    { findingId: `${batchId}:F1`, issueType: "over_segmentation", affectedDraftMuIds: [`${batchId}:D1`, `${batchId}:D2`], sourceReferences: [{ transcriptId: "TR1", focusGroupId: "FG1", turnIds: ["T3"], speakerId: "F1", speakerRole: "participant", exactSourceText: "The group listened without judging me. That made it easier to speak honestly." }], recommendedAction: "merge", conciseMethodologicalRationale: "One coherent meaning." },
    { findingId: `${batchId}:F2`, issueType: "under_segmentation", affectedDraftMuIds: [`${batchId}:D3`], sourceReferences: [{ transcriptId: "TR1", focusGroupId: "FG1", turnIds: ["T4"], speakerId: "M2", speakerRole: "participant", exactSourceText: "I felt isolated at first. Later, meeting peers gave me confidence." }], recommendedAction: "split", conciseMethodologicalRationale: "Two distinct meanings." },
    { findingId: `${batchId}:F3`, issueType: "duplicate_or_overlap", affectedDraftMuIds: [`${batchId}:D4`], sourceReferences: [{ transcriptId: "TR1", focusGroupId: "FG1", turnIds: ["T3"], speakerId: "F1", speakerRole: "participant", exactSourceText: "The group listened without judging me." }], recommendedAction: "remove", conciseMethodologicalRationale: "Duplicate evidence." },
    { findingId: `${batchId}:F4`, issueType: "substantive_meaning_omitted", affectedDraftMuIds: [], sourceReferences: [{ transcriptId: "TR1", focusGroupId: "FG1", turnIds: ["T9"], speakerId: "M2", speakerRole: "participant", exactSourceText: "Travel costs sometimes stopped me from attending the group." }], recommendedAction: "add", conciseMethodologicalRationale: "Substantive omission." },
    { findingId: `${batchId}:F5`, issueType: "summary_inaccurate", affectedDraftMuIds: [`${batchId}:D5`], sourceReferences: [{ transcriptId: "TR1", focusGroupId: "FG1", turnIds: ["T8"], speakerId: "F1", speakerRole: "participant", exactSourceText: "I still worried that support would disappear after the programme ended." }], recommendedAction: "revise", conciseMethodologicalRationale: "Summary was unsupported." }
  ] }).findings;
  const output = parseFinalMeaningUnitOutput({
    finalMeaningUnits: [
      { muId: `${batchId}:MU1`, ...source(["T3"], "The group listened without judging me. That made it easier to speak honestly."), summary: "Non-judgmental listening enabled honest disclosure.", sourceDraftMuIds: [`${batchId}:D1`, `${batchId}:D2`], appliedReviewFindingIds: [`${batchId}:F1`], reviewAction: "merged" },
      { muId: `${batchId}:MU2`, ...source(["T4"], "I felt isolated at first.", "M2"), summary: "The participant initially felt isolated.", sourceDraftMuIds: [`${batchId}:D3`], appliedReviewFindingIds: [`${batchId}:F2`], reviewAction: "split" },
      { muId: `${batchId}:MU3`, ...source(["T4"], "Later, meeting peers gave me confidence.", "M2"), summary: "Meeting peers later increased confidence.", sourceDraftMuIds: [`${batchId}:D3`], appliedReviewFindingIds: [`${batchId}:F2`], reviewAction: "split" },
      { muId: `${batchId}:MU4`, ...source(["T8"], "I still worried that support would disappear after the programme ended."), summary: "The participant worried that support would end with the programme.", sourceDraftMuIds: [`${batchId}:D5`], appliedReviewFindingIds: [`${batchId}:F5`], reviewAction: "revised" },
      { muId: `${batchId}:MU5`, ...source(["T9"], "Travel costs sometimes stopped me from attending the group.", "M2"), summary: "Travel costs sometimes prevented attendance.", sourceDraftMuIds: [], appliedReviewFindingIds: [`${batchId}:F4`], reviewAction: "added" }
    ],
    removedDraftMeaningUnits: [{ draftMuId: `${batchId}:D4`, reviewAction: "removed", appliedReviewFindingIds: [`${batchId}:F3`], conciseMethodologicalRationale: "Duplicate removed." }]
  });
  assert.doesNotThrow(() => validateFinalMeaningUnits(bundle, drafts, findings, output));
  assert.equal(output.finalMeaningUnits.filter((unit) => unit.reviewAction === "split").length, 2);
  assert.equal(output.removedDraftMeaningUnits[0].reviewAction, "removed");
});

test("invalid source, unknown speaker, and inappropriate empty output are rejected", () => {
  const bundle = createMeaningUnitEvidenceBundles(syntheticFrozenInput())[0];
  assert.throws(
    () => validateDraftMeaningUnits(bundle, parseDraftMeaningUnitOutput({ draftMeaningUnits: [{ draftMuId: `${batchId}:BAD`, ...source(["missing"], "Invented text"), summary: "Invented." }] }).draftMeaningUnits),
    (error) => error instanceof MeaningUnitValidationError && error.category === "invalid_reference"
  );
  assert.throws(
    () => validateDraftMeaningUnits(bundle, []),
    (error) => error instanceof MeaningUnitValidationError && error.category === "semantic_validation_failure"
  );
  const unknownDraft = parseDraftMeaningUnitOutput({ draftMeaningUnits: [{
    draftMuId: `${batchId}:UNKNOWN`,
    transcriptId: "TR1",
    focusGroupId: "FG1",
    speakerId: "U1",
    speakerRole: "unknown",
    sourceLocation: { turnIds: ["T5"] },
    sourceText: "Perhaps the timetable also mattered.",
    summary: "The timetable may have mattered."
  }] }).draftMeaningUnits;
  assert.doesNotThrow(() => validateDraftMeaningUnits(bundle, unknownDraft));
  const unknownFinding = parseMeaningUnitReviewOutput({ findings: [{
    findingId: `${batchId}:UNKNOWN-FINDING`,
    issueType: "unknown_speaker_included",
    affectedDraftMuIds: [`${batchId}:UNKNOWN`],
    sourceReferences: [{
      transcriptId: "TR1",
      focusGroupId: "FG1",
      turnIds: ["T5"],
      speakerId: "U1",
      speakerRole: "unknown",
      exactSourceText: "Perhaps the timetable also mattered."
    }],
    recommendedAction: "remove",
    conciseMethodologicalRationale: "Unknown speakers cannot become final participant MUs."
  }] }).findings;
  const invalidFinal = parseFinalMeaningUnitOutput({
    finalMeaningUnits: [{
      muId: `${batchId}:UNKNOWN-FINAL`,
      transcriptId: "TR1",
      focusGroupId: "FG1",
      speakerId: "U1",
      speakerRole: "unknown",
      sourceLocation: { turnIds: ["T5"] },
      sourceText: "Perhaps the timetable also mattered.",
      summary: "The timetable may have mattered.",
      sourceDraftMuIds: [`${batchId}:UNKNOWN`],
      appliedReviewFindingIds: [`${batchId}:UNKNOWN-FINDING`],
      reviewAction: "revised"
    }],
    removedDraftMeaningUnits: []
  });
  assert.throws(
    () => validateFinalMeaningUnits(bundle, unknownDraft, unknownFinding, invalidFinal),
    /not confirmed participant/
  );
});

test("an empty MU output is rejected whenever confirmed participant speech is present", () => {
  const input = syntheticBenchmarkInput();
  const fillerTurns = [
    { turnId: "T2", speakerId: "F1", text: "Okay." },
    { turnId: "T7", speakerId: "M2", text: "Thanks." }
  ];
  input.transcripts[0] = {
    transcriptId: "TR1",
    focusGroupId: "FG1",
    content: fillerTurns.map((turn) => turn.text).join("\n"),
    turns: fillerTurns
  };
  const bundle = createMeaningUnitEvidenceBundles(createFrozenBenchmarkInput(input))[0];
  assert.equal(hasConfirmedParticipantSpeech(bundle), true);
  assert.throws(
    () => validateDraftMeaningUnits(bundle, []),
    /confirmed participant speech is present/
  );
});

test("short participant responses are not classified as meaningless by a lexical filler rule", () => {
  for (const response of ["yes", "no", "exactly", "right", "I agree", "not really", "mm"]) {
    const input = syntheticBenchmarkInput();
    input.transcripts[0] = {
      transcriptId: "TR1",
      focusGroupId: "FG1",
      content: response,
      turns: [{ turnId: "SHORT", speakerId: "F1", text: response }]
    };
    const bundle = createMeaningUnitEvidenceBundles(createFrozenBenchmarkInput(input))[0];
    assert.equal(hasConfirmedParticipantSpeech(bundle), true);
    assert.throws(() => validateDraftMeaningUnits(bundle, []));
  }
});

test("multi-turn MU references must be same-participant, ordered, and directly connected", () => {
  const input = syntheticBenchmarkInput();
  const turns = [
    { turnId: "A1", speakerId: "F1", text: "I gradually felt able to speak." },
    { turnId: "A2", speakerId: "MOD", text: "Could you explain what changed?" },
    { turnId: "A3", speakerId: "F1", text: "People remembered what I had said before." },
    { turnId: "A4", speakerId: "M2", text: "I had a different experience." },
    { turnId: "A5", speakerId: "F1", text: "I gradually felt able to speak in later sessions too." }
  ];
  input.transcripts[0] = {
    transcriptId: "TR1",
    focusGroupId: "FG1",
    content: turns.map((turn) => turn.text).join("\n"),
    turns
  };
  const bundle = createMeaningUnitEvidenceBundles(createFrozenBenchmarkInput(input))[0];
  const unit = (turnIds: string[], sourceText: string) => parseDraftMeaningUnitOutput({
    draftMeaningUnits: [{
      draftMuId: `${batchId}:CROSS-TURN`,
      ...source(turnIds, sourceText),
      summary: "Remembered prior disclosures made speaking easier."
    }]
  }).draftMeaningUnits;

  assert.doesNotThrow(() =>
    validateDraftMeaningUnits(
      bundle,
      unit(["A1", "A3"], "I gradually felt able to speak.\nPeople remembered what I had said before.")
    )
  );
  assert.throws(
    () => validateDraftMeaningUnits(bundle, unit(["A3", "A1"], "People remembered what I had said before.\nI gradually felt able to speak.")),
    /transcript order and directly connected/
  );
  assert.throws(
    () => validateDraftMeaningUnits(bundle, unit(["A1", "A5"], "I gradually felt able to speak.\nI gradually felt able to speak in later sessions too.")),
    /transcript order and directly connected/
  );
});
