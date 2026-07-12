import fs from "node:fs";

const checks = [
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "onLostPointerCapture"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "releaseRequestedRef"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "abortRecognition"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Check Ollama again"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "/api/voice-guide/health"],
  ["src/app/api/voice-guide/health/route.ts", "modelAvailable"],
  ["src/lib/guidance/voice-guide-conversation.ts", "VoiceGuideModelError"],
  ["src/lib/guidance/voice-guide-conversation.ts", "invalid-response"],
  ["src/app/api/voice-guide/route.ts", "fallbackCode"],
];

let failed = false;
for (const [file, needle] of checks) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(needle)) {
    console.error(`FAIL: ${file} does not contain ${needle}`);
    failed = true;
  } else {
    console.log(`PASS: ${file} contains ${needle}`);
  }
}
if (failed) process.exit(1);
console.log("Batch 11 Voice Guide reliability checks passed.");
