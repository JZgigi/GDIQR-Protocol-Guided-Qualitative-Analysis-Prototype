import fs from "node:fs";

const workspace = fs.readFileSync("src/components/gdiqr-workspace.tsx", "utf8");
const status = fs.readFileSync("src/components/gdiqr-workspace/shared/long-task-status.tsx", "utf8");
const css = fs.readFileSync("src/app/globals.css", "utf8");

const checks = [
  [status.includes("elapsed"), "elapsed time is shown"],
  [status.includes("Estimated time"), "approximate estimate is shown"],
  [status.includes("aria-live=\"polite\""), "status is announced accessibly"],
  [workspace.includes("if (isExportingFormat) return"), "duplicate export guard exists"],
  [workspace.includes("Meaning-unit generation"), "MU task status is wired"],
  [workspace.includes("Category generation"), "category task status is wired"],
  [workspace.includes("Transcript preparation"), "transcript task status is wired"],
  [css.includes("prefers-reduced-motion"), "reduced-motion fallback exists"],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, label] of failed) console.error(`FAIL: ${label}`);
  process.exit(1);
}
for (const [, label] of checks) console.log(`PASS: ${label}`);
console.log("Batch 3 long-task feedback checks passed.");
