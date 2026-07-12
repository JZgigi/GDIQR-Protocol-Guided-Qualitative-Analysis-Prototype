import fs from "node:fs";
const checks = [
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "MediaRecorder"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "getUserMedia"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "/api/voice-guide/transcribe"],
  ["src/app/api/voice-guide/transcribe/route.ts", "runTranscriber"],
  ["src/app/api/voice-guide/transcribe/route.ts", "await rm(tempPath"],
  ["scripts/transcribe_voice_guide.py", "faster_whisper"],
];
let failed = false;
for (const [file, needle] of checks) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(needle)) { console.error(`FAIL: ${file} missing ${needle}`); failed = true; }
  else console.log(`PASS: ${file} contains ${needle}`);
}
const ui = fs.readFileSync("src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "utf8");
for (const forbidden of ["SpeechRecognition", "webkitSpeechRecognition"]) {
  if (ui.includes(forbidden)) { console.error(`FAIL: browser recognition still contains ${forbidden}`); failed = true; }
  else console.log(`PASS: browser recognition no longer contains ${forbidden}`);
}
if (failed) process.exit(1);
console.log("Batch 13 MediaRecorder and local Whisper checks passed.");
