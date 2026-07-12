import fs from "node:fs";

const checks = [
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "type VoiceGuideState"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", '"listening"'],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", '"thinking"'],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", '"speaking"'],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", '"captions-only"'],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "captionSummary.slice"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "This interaction is transient"],
  ["src/components/gdiqr-workspace.tsx", "<VoiceGuideAvatar"],
  ["src/app/globals.css", "prefers-reduced-motion"],
];

for (const [file, fragment] of checks) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(fragment)) {
    throw new Error(`Missing ${fragment} in ${file}`);
  }
  console.log(`PASS: ${file} contains ${fragment}`);
}
console.log("Batch 5 floating Voice Guide checks passed.");
