import fs from "node:fs";

const checks = [
  ["src/lib/guidance/voice-guide-conversation.ts", "focused, warm qualitative analysis voice guide"],
  ["src/lib/guidance/voice-guide-conversation.ts", "brief_social_support"],
  ["src/lib/guidance/voice-guide-conversation.ts", "scope_redirect"],
  ["src/lib/guidance/voice-guide-conversation.ts", "keep_alive"],
  ["src/lib/guidance/voice-guide-conversation.ts", "num_predict: 320"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "onPointerDown={beginHoldToTalk}"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "onPointerUp={releaseToSend}"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Press Esc to cancel"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Voice interactions are transient"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Show captions"],
  ["src/components/gdiqr-workspace/voice-guide/mira-avatar.tsx", "/voice-guide/mira-cg.png"],
  ["docs/BATCH_10_FOCUSED_PUSH_TO_TALK_GUIDE_ZH.md", "不需要执行 SQL migration"],
];

for (const [file, needle] of checks) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(needle)) {
    console.error(`FAIL: ${file} does not contain ${needle}`);
    process.exit(1);
  }
  console.log(`PASS: ${file} contains ${needle}`);
}

console.log("Batch 10 focused push-to-talk checks passed.");
