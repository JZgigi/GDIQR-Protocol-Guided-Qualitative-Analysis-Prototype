import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const moduleCache = new Map();
const baseRequire = createRequire(import.meta.url);

function resolveLocalModule(request, parentFile) {
  if (request.startsWith("@/")) {
    return path.join(root, "src", request.slice(2)) + ".ts";
  }
  if (request.startsWith(".")) {
    return path.resolve(path.dirname(parentFile), request) + ".ts";
  }
  return null;
}

function loadTypeScriptModule(filePath) {
  const normalizedPath = path.normalize(filePath);
  if (moduleCache.has(normalizedPath)) {
    return moduleCache.get(normalizedPath).exports;
  }

  const source = fs.readFileSync(normalizedPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: normalizedPath,
  }).outputText;
  const module = { exports: {} };
  moduleCache.set(normalizedPath, module);
  const localRequire = (request) => {
    const localPath = resolveLocalModule(request, normalizedPath);
    return localPath ? loadTypeScriptModule(localPath) : baseRequire(request);
  };
  const execute = new Function("require", "module", "exports", output);
  execute(localRequire, module, module.exports);
  return module.exports;
}

const speakers = loadTypeScriptModule(
  path.join(root, "src", "lib", "transcript-speakers.ts"),
);
const preprocessing = loadTypeScriptModule(
  path.join(root, "src", "lib", "meaning-unit-preprocessing.ts"),
);
const provider = loadTypeScriptModule(
  path.join(root, "src", "lib", "ai-provider.ts"),
);

assert.equal(
  speakers.normalizeTranscriptSpeakerRole("Moderator"),
  "facilitator",
  "Moderator must normalize to the non-participant facilitator role.",
);
assert.equal(
  speakers.normalizeTranscriptSpeakerRole("Facilitator 1"),
  "facilitator",
  "Numbered facilitator labels must remain facilitator context.",
);
assert.equal(
  speakers.normalizeTranscriptSpeakerRole("Interviewer"),
  "interviewer",
  "Interviewer must remain a non-participant context role.",
);
assert.equal(
  speakers.normalizeTranscriptSpeakerRole("Participant F1"),
  "participant",
  "Numbered participant labels must normalize to participant.",
);

const transcript = [
  "Moderator: Let's break the ice. Please introduce yourself.",
  "Participant F1: I am a doctoral student and the first year felt exhausting.",
  "Facilitator: What made that period difficult for you?",
  "Participant F1: The workload was unfamiliar, but support from colleagues helped me adjust.",
  "Participant F2: My experience was different because I already knew the department.",
].join("\n");

const turns = preprocessing.preprocessTranscriptForMeaningUnits(transcript);
assert.equal(turns.length, 5, "Every labelled turn should remain traceable.");

const contextTurns = turns.filter((turn) =>
  ["facilitator", "interviewer"].includes(turn.role),
);
assert.equal(contextTurns.length, 2);
assert.ok(
  contextTurns.every((turn) => turn.classification === "context_only"),
  "Moderator/facilitator turns must be classified only as context.",
);

const noSubstantiveWindow = {
  participantTurns: [{ id: "TURN-0002" }, { id: "TURN-0004" }],
};
assert.deepEqual(
  provider.parseJsonObject(
    '{"units":[{"number":1,"summary":"first"}\n{"number":2,"summary":"second"}],}',
  ),
  {
    units: [
      { number: 1, summary: "first" },
      { number: 2, summary: "second" },
    ],
  },
  "A missing comma between array objects and a trailing comma must be repaired without changing field values.",
);
assert.deepEqual(
  provider.parseJsonObject(
    '{"decisionReason":"Keep the literal }{ sequence inside this string.","units":[]}',
  ),
  {
    decisionReason: "Keep the literal }{ sequence inside this string.",
    units: [],
  },
  "JSON punctuation repair must never alter string content.",
);
assert.deepEqual(
  provider.validateNoSubstantiveWindowDecision(
    {
      analysisDecision: "no_substantive_meaning",
      decisionReason: "The participant turns are procedural acknowledgements.",
      meaningUnits: [],
      noSubstantiveSourceTurnIds: ["TURN-0002", "TURN-0004"],
      returnedCandidateCount: 0,
      uncertainties: [],
    },
    noSubstantiveWindow,
  ),
  { sourceTurnIds: ["TURN-0002", "TURN-0004"], valid: true },
  "An explicit, reasoned zero-MU decision covering every participant turn must be accepted.",
);
assert.equal(
  provider.validateNoSubstantiveWindowDecision(
    {
      analysisDecision: "no_substantive_meaning",
      decisionReason: "",
      meaningUnits: [],
      noSubstantiveSourceTurnIds: ["TURN-0002"],
      returnedCandidateCount: 0,
      uncertainties: [],
    },
    noSubstantiveWindow,
  ).valid,
  false,
  "An empty or incomplete zero-MU decision must not be treated as valid model output.",
);

const participantTurns = turns.filter((turn) => turn.role === "participant");
assert.equal(participantTurns.length, 3);
assert.ok(
  participantTurns.every(
    (turn) => turn.classification === "substantive_participant",
  ),
  "Substantive participant turns must remain eligible for semantic delineation.",
);
assert.ok(
  preprocessing.isOpeningBackgroundTurn(participantTurns[0]),
  "Opening participant background must remain reviewable rather than being silently excluded.",
);
assert.equal(
  provider.reconstructAnchoredParticipantExcerpt(
    "I'm uncertain,",
    "peer support helped",
    [
      {
        content: "I’m uncertain — but peer support helped.",
        turnIndex: 0,
      },
    ],
  ),
  "I’m uncertain — but peer support helped",
  "Anchor recovery may tolerate quote, whitespace, and punctuation differences, but must reconstruct the verbatim excerpt from participant source text.",
);

const overlapSourceTurn = participantTurns[1];
const makeSemanticUnit = (number, excerpt) => ({
  aiExcerpt: excerpt,
  aiSummary: `Draft summary ${number}`,
  analysisExcluded: false,
  caseId: "CASE-001",
  classification: "substantive_participant",
  excerpt,
  generationMethod: "ai_semantic",
  humanStatus: "Draft",
  humanSummary: `Draft summary ${number}`,
  id: `test-mu-${number}`,
  number,
  reviewerStatus: "Not run",
  segmentId: "SEG-001",
  sourceEndLine: overlapSourceTurn.endLine,
  sourceStartLine: overlapSourceTurn.startLine,
  sourceTurnIds: [overlapSourceTurn.id],
  speaker: overlapSourceTurn.label,
  speakerRole: "participant",
});
const nestedOverlapResult =
  provider.consolidateOverlappingSemanticMeaningUnits(
    [
      makeSemanticUnit(1, overlapSourceTurn.content),
      makeSemanticUnit(
        2,
        "The workload was unfamiliar, but support from colleagues helped me adjust.",
      ),
      makeSemanticUnit(3, "support from colleagues helped me adjust."),
    ],
    turns,
  );
assert.equal(
  nestedOverlapResult.meaningUnits.length,
  1,
  "A whole-span MU and its nested child MUs must not all survive as duplicate evidence.",
);
assert.equal(
  nestedOverlapResult.meaningUnits[0].classification,
  "uncertain",
  "An unresolved overlapping group must become one reviewable uncertain span rather than a silently chosen AI boundary.",
);
assert.equal(
  nestedOverlapResult.meaningUnits[0].aiSummary,
  "",
  "A collapsed overlap must not retain a summary that implies one disputed boundary was accepted.",
);
assert.match(
  nestedOverlapResult.meaningUnits[0].reviewerWarnings.join(" "),
  /overlapping AI boundaries/i,
);

const disjointBoundaryResult =
  provider.consolidateOverlappingSemanticMeaningUnits(
    [
      makeSemanticUnit(1, "The workload was unfamiliar"),
      makeSemanticUnit(2, "support from colleagues helped me adjust."),
    ],
    turns,
  );
assert.equal(
  disjointBoundaryResult.meaningUnits.length,
  2,
  "Distinct non-overlapping semantic spans must remain separate.",
);

const partialOverlapResult =
  provider.consolidateOverlappingSemanticMeaningUnits(
    [
      makeSemanticUnit(
        1,
        "The workload was unfamiliar, but support from colleagues",
      ),
      makeSemanticUnit(2, "support from colleagues helped me adjust."),
    ],
    turns,
  );
assert.equal(
  partialOverlapResult.meaningUnits.length,
  1,
  "Materially overlapping source spans must be consolidated even when neither fully contains the other.",
);

const windows = preprocessing.buildSemanticAnalysisWindows(turns, 6000);
assert.equal(
  windows.length,
  2,
  "A participant change may create a new conversational window without defining an MU boundary.",
);
assert.ok(
  windows.every((window) =>
    window.participantTurns.every((turn) => turn.role === "participant"),
  ),
  "Only participant turns may be analysis candidates.",
);
assert.ok(
  windows[0].contextTurns.every((turn) => turn.role !== "participant"),
  "Participant speech must not be relabelled as context.",
);
assert.match(
  windows[0].promptText,
  /CONTEXT — DO NOT ANALYSE AS PARTICIPANT SPEECH/,
  "The model prompt must visibly distinguish context from participant evidence.",
);
assert.match(
  windows[0].promptText,
  /PARTICIPANT MATERIAL TO ANALYSE/,
  "The model prompt must visibly identify participant evidence.",
);

const secondF1 = participantTurns[1];
const sourceContext = preprocessing.contextForSourceTurns(
  [secondF1.id],
  turns,
);
assert.match(sourceContext, /Moderator:/);
assert.match(sourceContext, /Facilitator:/);
assert.doesNotMatch(
  sourceContext,
  /Participant F1:/,
  "Context metadata must not duplicate participant evidence.",
);

const providerSource = fs.readFileSync(
  path.join(root, "src", "lib", "ai-provider.ts"),
  "utf8",
);
const meaningUnitRouteSource = fs.readFileSync(
  path.join(root, "src", "app", "api", "ai", "meaning-units", "route.ts"),
  "utf8",
);
const workspaceSource = fs.readFileSync(
  path.join(root, "src", "components", "gdiqr-workspace.tsx"),
  "utf8",
);
const workspaceSupportSource = fs.readFileSync(
  path.join(root, "src", "components", "gdiqr-workspace-support.tsx"),
  "utf8",
);
const globalStylesSource = fs.readFileSync(
  path.join(root, "src", "app", "globals.css"),
  "utf8",
);
assert.match(
  meaningUnitRouteSource,
  /backgroundController\.signal/,
  "A background MU job must use a server-owned abort signal rather than the page request signal.",
);
assert.match(
  meaningUnitRouteSource,
  /completeMeaningUnitJob\(runId, result\)/,
  "Completed local-only MU results must remain retrievable after a page reload.",
);
assert.doesNotMatch(
  providerSource,
  /fallbackCategoriesFromUnits|inferFallbackThemeGroups|Stress and anxiety management/,
  "Category failure handling must not inject hard-coded thematic categories.",
);
assert.match(
  providerSource,
  /No fallback categories were created or saved/,
  "Category generation failure must preserve the evidence instead of creating fake categories.",
);
assert.match(
  providerSource,
  /analysisDecision "no_substantive_meaning"/,
  "The model must explicitly distinguish a valid zero-MU decision from an output failure.",
);
assert.match(
  providerSource,
  /neither valid meaning units nor an explicit, traceable no-substantive-meaning decision/,
  "An ambiguous empty response must still fail safely after one clarification attempt.",
);
assert.match(
  providerSource,
  /requesting one focused anchor correction/,
  "Invalid model anchors must receive a focused per-window correction before the whole run fails.",
);
assert.match(
  workspaceSource,
  /role="dialog"/,
  "Manual, split, merge, delete, and accept-all MU actions must use a visible in-page interaction surface.",
);
assert.doesNotMatch(
  workspaceSource,
  /First part for MU|Merged MU excerpt|New meaning-unit excerpt/,
  "Core MU review actions must not fall back to browser-native prompt dialogs.",
);
assert.match(
  workspaceSource,
  /Latest meaning-unit action/,
  "MU validation and save feedback must remain visible beside the review cards.",
);
assert.match(
  workspaceSupportSource,
  />\s*Accept\s*</,
  "The per-card accept action must have a visible text label rather than an icon alone.",
);
assert.match(
  workspaceSupportSource,
  /mu-card-action-feedback/,
  "Blocked and completed MU actions must report their result inside the active card.",
);
assert.match(
  globalStylesSource,
  /\.mu-action-overlay\s*\{[\s\S]*?position:\s*fixed/,
  "Split, merge, delete, and manual-MU forms must remain visible above long independently scrolling MU lists.",
);

console.log(
  "Step 2 behaviour verification passed: role classification, context-only moderator/facilitator handling, participant-only analysis windows, opening-background review, and category anti-bias safeguards.",
);
