import fs from "node:fs";

const checks = [
  ["src/components/gdiqr-workspace/voice-guide/mira-avatar.tsx", "export function MiraAvatar"],
  ["src/components/gdiqr-workspace/voice-guide/mira-avatar.tsx", "mira-avatar-mouth"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "<MiraAvatar"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Speaking voice"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "getVoices"],
  ["src/app/globals.css", "@keyframes mira-speaking-mouth"],
  ["src/app/globals.css", "@keyframes mira-listening-ring"],
  ["src/app/globals.css", "prefers-reduced-motion"],
  ["docs/BATCH_9_HUMAN_LIKE_AVATAR.md", "Mira"],
];

let failed = false;
for (const [file, needle] of checks) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(needle)) {
    console.error(`FAIL: ${file} missing ${needle}`);
    failed = true;
  } else {
    console.log(`PASS: ${file} contains ${needle}`);
  }
}

if (failed) process.exit(1);
console.log("Batch 9 human-like avatar checks passed.");
