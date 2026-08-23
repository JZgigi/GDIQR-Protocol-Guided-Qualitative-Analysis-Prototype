import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const ai = read("../src/lib/ai-provider.ts");
const route = read("../src/app/api/ai/meaning-units/route.ts");
const preprocessing = read("../src/lib/meaning-unit-preprocessing.ts");
const reviewFlags = read("../src/lib/meaning-unit-review-flags.ts");
const support = read("../src/components/gdiqr-workspace-support.tsx");
const workspace = read("../src/components/gdiqr-workspace.tsx");

assert.match(ai, /think: false/);
assert.match(ai, /body\.message\?\.content/);
assert.match(ai, /readOllamaJsonResponse/);
assert.match(ai, /startQuote/);
assert.match(ai, /endQuote/);
assert.match(ai, /temperature: 0/);
assert.match(ai, /"ai_semantic" \| "mixed" \| "rule_based_fallback"/);
assert.match(ai, /classification: "uncertain"/);
assert.match(ai, /analysisExcluded: true/);
assert.match(ai, /semanticBoundaryConcerns/);
assert.match(ai, /markUnresolvedSemanticBoundaries/);
assert.match(ai, /Treat each participant turn only as a source container/);
assert.match(ai, /Unresolved semantic boundary/);
assert.match(ai, /Classification is assistance only/);
assert.match(ai, /return ordered\.map/);
assert.match(ai, /contextOnlySegments: turns\.filter/);
assert.doesNotMatch(ai, /buildContextRecords/);
assert.doesNotMatch(preprocessing, /export function buildContextRecords/);

assert.match(preprocessing, /participantKey !== currentParticipant/);
assert.match(preprocessing, /CONTEXT — DO NOT ANALYSE AS PARTICIPANT SPEECH/);
assert.match(preprocessing, /PARTICIPANT MATERIAL TO ANALYSE — OPENING\/BACKGROUND SUGGESTION/);
assert.match(preprocessing, /isParticipantAnalysisCandidate/);
assert.match(reviewFlags, /OPENING_BACKGROUND_REVIEW_WARNING/);
assert.match(reviewFlags, /isOpeningBackgroundCandidate/);
assert.match(reviewFlags, /researcher decides whether to include or exclude it/);
assert.match(preprocessing, /markOpeningBackgroundCandidates/);
assert.match(preprocessing, /first formal research question/);
assert.doesNotMatch(route, /getMeaningUnitDemoTimeoutMs|withTimeout/);

const participantEvidence = support.indexOf("Participant excerpt");
const interactionContext = support.indexOf("Interaction context — not participant evidence");
assert.ok(participantEvidence >= 0, "MU card must label participant evidence.");
assert.ok(interactionContext > participantEvidence, "Context must follow participant evidence.");
assert.match(support, /Opening\/background candidate — researcher decision/);
assert.match(support, /Assistant inclusion suggestion/);
assert.match(support, /Include as substantive/);
assert.match(support, /const reviewableMeaningUnits = ordered\.filter/);
assert.match(workspace, /Generate provisional structural spans/);
assert.match(workspace, /Opening\/icebreaker background suggestions/);
assert.match(workspace, /all\s+participant MU candidates remain visible/i);
assert.match(workspace, /semantic MU delineation and summaries have not been completed/i);
assert.match(workspace, /splitMeaningUnit|handleSplitMeaningUnit/);
assert.match(workspace, /mergeMeaningUnit|handleMergeMeaningUnit/);
assert.match(workspace, /deleteMeaningUnit|handleDeleteMeaningUnit/);

console.log("Step 2 semantic MU pipeline checks passed.");
