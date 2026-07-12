import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const checks = [];
const check = (condition, label) => {
  if (!condition) throw new Error(`FAIL: ${label}`);
  checks.push(label);
};

const kb = read("src/lib/guidance/gdiqr-guidance.ts");
const context = read("src/lib/guidance/voice-guide-context.ts");
const response = read("src/lib/guidance/voice-guide-response.ts");
const route = read("src/app/api/voice-guide/route.ts");

for (const step of ["pre-analysis", "understanding", "categorizing", "integrating", "integrity", "export"]) {
  check(kb.includes(`${step}:`) || kb.includes(`"${step}":`), `knowledge base contains ${step}`);
}
check(kb.includes("mu_split_decision"), "MU split boundary intent exists");
check(kb.includes("category_definition_request"), "category definition boundary intent exists");
check(kb.includes("integration_narrative_request"), "integration narrative boundary intent exists");
check(kb.includes("I cannot decide whether this meaning unit should be split"), "split decision redirect is explicit");
check(kb.includes("I cannot write the final category definition"), "definition redirect is explicit");
check(kb.includes("I cannot produce the final integration narrative"), "integration redirect is explicit");
check(context.includes("unreviewedMeaningUnits"), "context includes MU review state");
check(context.includes("unassignedAcceptedMeaningUnits"), "context includes category assignment state");
check(context.includes("unresolvedIntegrityChecks"), "context includes integrity state");
check(response.includes("buildDeterministicVoiceGuideAnswer"), "deterministic safety response builder exists");
check(route.includes('POST(request: NextRequest)'), "Voice Guide POST API exists");
check(route.includes("projectState"), "local-only project snapshot is supported");
check(route.includes("persisted: false"), "unsaved guide interaction remains transient");
check(!route.includes("saveGuidanceMemo"), "Voice Guide API does not auto-save interactions");

console.log(checks.map((label) => `PASS: ${label}`).join("\n"));
console.log("Batch 4 Voice Guide foundation checks passed.");
