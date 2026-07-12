import fs from "node:fs";

const checks = [
  ["src/lib/guidance/voice-guide-conversation.ts", "ollama-conversational"],
  ["src/lib/guidance/voice-guide-conversation.ts", "casual_conversation"],
  ["src/lib/guidance/voice-guide-conversation.ts", "methodology_explanation"],
  ["src/lib/guidance/voice-guide-conversation.ts", "analytic_decision_request"],
  ["src/lib/guidance/voice-guide-conversation.ts", "The knowledge base is methodological grounding, not a closed list"],
  ["src/lib/guidance/voice-guide-conversation.ts", "history.slice(-8)"],
  ["src/lib/guidance/voice-guide-conversation.ts", "detectBoundaryIntent"],
  ["src/app/api/voice-guide/route.ts", "generateConversationalVoiceGuideAnswer"],
  ["src/app/api/voice-guide/route.ts", "structured-gdiqr-fallback"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "conversationHistory"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Conversational research companion"],
  ["src/components/gdiqr-workspace/voice-guide/voice-guide-avatar.tsx", "Mira"],
];

for (const [file, needle] of checks) {
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(needle)) throw new Error(`FAIL: ${file} is missing ${needle}`);
  console.log(`PASS: ${file} contains ${needle}`);
}
console.log("Batch 8 conversational Voice Guide checks passed.");
