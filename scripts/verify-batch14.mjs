import fs from "node:fs";
const file = "src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx";
const source = fs.readFileSync(file, "utf8");
const required = [
  'recorder.state !== "recording"',
  '}, [resetRecorder]);',
  'window.addEventListener("keydown", cancelOnEscape)',
];
let failed = false;
for (const needle of required) {
  if (!source.includes(needle)) { console.error(`FAIL: missing ${needle}`); failed = true; }
  else console.log(`PASS: contains ${needle}`);
}
if (source.includes('}, [resetRecorder, state]);')) {
  console.error('FAIL: recording cleanup still reruns on every state change');
  failed = true;
} else {
  console.log('PASS: recording cleanup no longer depends on state');
}
if (failed) process.exit(1);
console.log('Batch 14 MediaRecorder lifecycle checks passed.');
