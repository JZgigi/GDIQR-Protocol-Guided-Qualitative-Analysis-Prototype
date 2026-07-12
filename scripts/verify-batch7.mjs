import { readFileSync } from "node:fs";

const checks = [
  ["docs/RELEASE_1_0_ACCEPTANCE_GUIDE_ZH.md", "Voice Guide 验收"],
  ["docs/RELEASE_1_0_ACCEPTANCE_GUIDE_ZH.md", "Supabase 持久化验收"],
  ["docs/SUPABASE_V1_0_SETUP.md", "do **not** require a new schema migration"],
  ["supabase/verify_v1_0_schema.sql", "guidance_memos"],
  ["docs/README.md", "Historical archive"],
  ["docs/TECHNICAL_DEBT_AND_NEXT_STEPS.md", "Partially completed in Batch 0–6"],
];

for (const [path, expected] of checks) {
  const content = readFileSync(path, "utf8");
  if (!content.includes(expected)) {
    throw new Error(`${path} is missing: ${expected}`);
  }
  console.log(`PASS: ${path} contains ${expected}`);
}

console.log("Batch 7 release-documentation checks passed.");
