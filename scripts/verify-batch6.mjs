import fs from "node:fs";

const checks = [
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "SpeechRecognition"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "webkitSpeechRecognition"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "speechSynthesis"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Save note"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "This interaction is transient"],
  ["src/components/gdiqr-workspace.tsx", "saveVoiceGuidanceNote"],
  ["src/lib/gdiqr-repository.ts", "voice_guidance_note_saved"],
  ["src/app/api/guidance-memos/route.ts", 'source?: "legacy-guidance" | "voice-guide"'],
  ["src/app/globals.css", ".voice-guide-text-fallback"],
];

for (const [file, expected] of checks) {
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(expected)) {
    throw new Error(`FAIL: ${file} does not contain ${expected}`);
  }
  console.log(`PASS: ${file} contains ${expected}`);
}

console.log("Batch 6 voice interaction and saved-note checks passed.");
