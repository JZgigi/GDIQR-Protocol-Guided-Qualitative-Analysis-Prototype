import fs from "node:fs";

const knowledge = fs.readFileSync("src/lib/gdiqr-ai-knowledge.ts", "utf8");
const provider = fs.readFileSync("src/lib/ai-provider.ts", "utf8");

const checks = [
  [
    "participant clarification priority",
    /Prioritise participant clarification/,
  ],
  [
    "variation and negative cases",
    /Preserve disagreement, variation, qualifications and negative cases/,
  ],
  [
    "fact/perception boundary",
    /participant perceptions unless separately verified/,
  ],
  [
    "no unsupported theory or diagnosis",
    /Do not import theory, diagnosis, motives, causal explanations/,
  ],
  [
    "domains are not categories",
    /Domains\/interview questions organise inquiry; they are not automatically analytic categories/,
  ],
  ["data-near categorisation", /Prefer participant-near category labels/],
  [
    "integration causal restraint",
    /Do not infer causality from sequence, co-occurrence or thematic association/,
  ],
  ["reviewer does not score", /do not score the analysis/],
  ["provider uses stage system messages", /buildGdiqrSystemMessage/],
  ["provider uses stage knowledge", /buildGdiqrStageKnowledge/],
  ["provider disables Ollama thinking", /think:\s*false/],
];

let failed = false;
for (const [label, pattern] of checks) {
  const haystack = label.startsWith("provider") ? provider : knowledge;
  if (!pattern.test(haystack)) {
    console.error(`FAIL: ${label}`);
    failed = true;
  } else {
    console.log(`PASS: ${label}`);
  }
}

if (failed) process.exit(1);
console.log("GDI-QR AI knowledge architecture checks passed.");
