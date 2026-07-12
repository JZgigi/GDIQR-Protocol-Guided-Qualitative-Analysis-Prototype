import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const speakerSource = readFileSync(new URL("../src/lib/transcript-speakers.ts", import.meta.url), "utf8");
const boundarySource = readFileSync(new URL("../src/lib/meaning-unit-boundaries.ts", import.meta.url), "utf8");
const aiSource = readFileSync(new URL("../src/lib/ai-provider.ts", import.meta.url), "utf8");

for (const alias of ["Interviewer", "Moderator", "Researcher", "Facilitator", "访谈者", "主持人"]) {
  assert.match(speakerSource, new RegExp(`\\"${alias}\\"`, "i"));
}
for (const alias of ["Participant", "Interviewee", "Student", "受访者", "被访者"]) {
  assert.match(speakerSource, new RegExp(`\\"${alias}\\"`, "i"));
}
assert.match(boundarySource, /<= 280/);
assert.match(boundarySource, /currentWords >= 120/);
assert.match(aiSource, /Do not split at every sentence/);
assert.match(aiSource, /never create filler-only meaning units/);
assert.match(aiSource, /Prefer one coherent participant turn as one draft MU/);
console.log("Batch 2 speaker and MU boundary checks passed.");
