import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const speakerSource = readFileSync(new URL("../src/lib/transcript-speakers.ts", import.meta.url), "utf8");
const boundarySource = readFileSync(new URL("../src/lib/meaning-unit-boundaries.ts", import.meta.url), "utf8");
const aiSource = readFileSync(new URL("../src/lib/ai-provider.ts", import.meta.url), "utf8");
const preprocessingSource = readFileSync(new URL("../src/lib/meaning-unit-preprocessing.ts", import.meta.url), "utf8");

for (const alias of ["Interviewer", "Moderator", "Researcher", "Facilitator", "访谈者", "主持人"]) {
  assert.match(speakerSource, new RegExp(`\\"${alias}\\"`, "i"));
}
for (const alias of ["Participant", "Interviewee", "Student", "受访者", "被访者"]) {
  assert.match(speakerSource, new RegExp(`\\"${alias}\\"`, "i"));
}
assert.match(boundarySource, /<= 280/);
assert.match(boundarySource, /currentWords >= 120/);
assert.match(aiSource, /Sentence punctuation and speaker turns are not MU boundaries/);
assert.match(aiSource, /one concise summary cannot accurately cover the full span/);
assert.match(aiSource, /Split at a substantial shift in experience/);
assert.match(aiSource, /Classification is assistance only/);
assert.match(preprocessingSource, /participantKey !== currentParticipant/);
assert.match(preprocessingSource, /trailingContextTurns/);
console.log("Batch 2 speaker and MU boundary checks passed.");
