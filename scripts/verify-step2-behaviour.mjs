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

console.log(
  "Step 2 behaviour verification passed: role classification, context-only moderator/facilitator handling, participant-only analysis windows, opening-background review, and category anti-bias safeguards.",
);
