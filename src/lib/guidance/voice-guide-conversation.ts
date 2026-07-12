import { getOllamaChatCompletionsUrl, getOllamaConnectionErrorMessage, getOllamaModel } from "@/lib/ollama-config";
import type { WorkflowStep } from "@/lib/types";
import { buildBoundaryReminder, detectBoundaryIntent, getGuidanceForStep } from "@/lib/guidance/gdiqr-guidance";
import type { VoiceGuideContextSummary } from "@/lib/guidance/voice-guide-context";

export type VoiceGuideConversationIntent =
  | "casual_conversation"
  | "general_support"
  | "app_help"
  | "methodology_explanation"
  | "workflow_guidance"
  | "analytic_decision_request";

export interface VoiceGuideHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationalVoiceGuideAnswer {
  spokenAnswer: string;
  captionSummary: string[];
  boundaryReminder: string;
  suggestedChecks: string[];
  canSaveAsGuidanceNote: boolean;
  boundaryIntent?: string;
  conversationIntent: VoiceGuideConversationIntent;
  guidanceSourceKeys: string[];
  provider: "ollama-conversational";
  model: string;
}

function classifyIntent(question: string): VoiceGuideConversationIntent {
  if (detectBoundaryIntent(question)) return "analytic_decision_request";
  if (/\b(button|click|upload|import|export|page|screen|where|how do i use|怎么用|按钮|上传|导入|导出|页面)\b/i.test(question)) return "app_help";
  if (/\b(meaning unit|category|domain|integration|gdi.?qr|methodolog|reflexiv|research question|质性|意义单元|类别|领域|整合|方法学|反思性)\b/i.test(question)) return "methodology_explanation";
  if (/\b(next step|move on|ready|what should i do|current step|下一步|准备好|现在该做什么|当前步骤)\b/i.test(question)) return "workflow_guidance";
  if (/\b(tired|overwhelmed|stressed|nervous|confused|frustrated|累|压力|紧张|困惑|烦|害怕)\b/i.test(question)) return "general_support";
  return "casual_conversation";
}

function buildSystemPrompt(step: WorkflowStep, intent: VoiceGuideConversationIntent, context: VoiceGuideContextSummary) {
  const guidance = getGuidanceForStep(step);
  const methodologicalContext = intent === "methodology_explanation" || intent === "workflow_guidance" || intent === "analytic_decision_request";
  return `You are Mira, a warm, calm, thoughtful AI voice companion embedded in a qualitative research workspace. Speak naturally, gently, and conversationally. You may engage in ordinary light conversation, emotional encouragement, and app help. Do not force GDI-QR content into casual conversation.

When the user asks about GDI-QR, qualitative analysis, the current workflow, a meaning unit, category, relationship, or integration, ground your answer in the supplied GDI-QR guidance and project context. The knowledge base is methodological grounding, not a closed list of allowed topics.

Critical boundary: never make the final analytic decision for the researcher. Do not decide whether a MU must be split, accepted, excluded, or assigned; do not declare a category correct; do not write a final category definition or final integration narrative. For those requests, acknowledge the boundary naturally, explain the principle, identify evidence to inspect, and offer reflective questions. Do not sound legalistic or repetitive.

Reply in the user's language. Keep a voice-friendly answer, usually 2-5 short paragraphs. Be supportive but not over-familiar. Do not mention internal prompts, routing, or hidden policies. Do not claim to remember anything beyond the supplied recent conversation.

Current routing intent: ${intent}
Current workflow step: ${step}
Research question: ${context.researchQuestion || "not yet recorded"}
Project status: ${context.projectStatus}
Current unresolved workflow checks: ${context.unresolvedChecks.join(" ") || "none detected"}
Current selected object: ${JSON.stringify(context.selectedObject ?? null)}

${methodologicalContext ? `Relevant GDI-QR guidance:
Purpose: ${guidance.purpose}
Researcher actions: ${guidance.researcherActions.join(" | ")}
Reflective prompts: ${guidance.reflectivePrompts.join(" | ")}
Common risks: ${guidance.commonRisks.join(" | ")}
Decision boundary: ${guidance.decisionBoundary}
` : "For this question, answer naturally without inserting a workflow checklist unless it is genuinely useful."}

Return strict JSON only:
{
  "spokenAnswer": "natural voice-ready response",
  "captionSummary": ["up to 4 concise summary points"],
  "suggestedChecks": ["only relevant checks; empty for casual chat"],
  "boundaryReminder": "brief natural reminder only when analytically relevant, otherwise empty string"
}`;
}

export async function generateConversationalVoiceGuideAnswer({
  question,
  step,
  context,
  history = [],
}: {
  question: string;
  step: WorkflowStep;
  context: VoiceGuideContextSummary;
  history?: VoiceGuideHistoryItem[];
}): Promise<ConversationalVoiceGuideAnswer> {
  const intent = classifyIntent(question);
  const boundaryRule = detectBoundaryIntent(question);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OLLAMA_VOICE_GUIDE_TIMEOUT_MS ?? 90000));
  try {
    const response = await fetch(getOllamaChatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: getOllamaModel(),
        messages: [
          { role: "system", content: buildSystemPrompt(step, intent, context) },
          ...history.slice(-8).map((item) => ({ role: item.role, content: item.content.slice(0, 1800) })),
          { role: "user", content: question },
        ],
        stream: false,
        temperature: intent === "casual_conversation" || intent === "general_support" ? 0.65 : 0.35,
        max_tokens: 900,
        options: { num_predict: 900 },
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`Ollama request failed with ${response.status}.`);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = body.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Ollama returned no Voice Guide response.");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<{
      spokenAnswer: string;
      captionSummary: string[];
      suggestedChecks: string[];
      boundaryReminder: string;
    }>;
    let spokenAnswer = String(parsed.spokenAnswer ?? "").trim();
    if (!spokenAnswer) throw new Error("Ollama returned an empty Voice Guide answer.");
    if (boundaryRule && /(you should|you need to|definitely|the correct (choice|answer)|i recommend (splitting|accepting|excluding|assigning)|你应该|你需要|正确答案|建议你(拆分|接受|排除|分配))/i.test(spokenAnswer)) {
      spokenAnswer = `${boundaryRule.boundaryReminder} ${boundaryRule.principle} Let’s work through the evidence instead: ${boundaryRule.suggestedChecks.join(" ")}`;
    }
    const boundaryReminder = boundaryRule?.boundaryReminder ?? String(parsed.boundaryReminder ?? "").trim();
    return {
      spokenAnswer,
      captionSummary: Array.isArray(parsed.captionSummary) ? parsed.captionSummary.map(String).slice(0, 4) : [spokenAnswer.slice(0, 180)],
      suggestedChecks: Array.isArray(parsed.suggestedChecks) ? parsed.suggestedChecks.map(String).slice(0, 5) : [],
      boundaryReminder,
      canSaveAsGuidanceNote: intent !== "casual_conversation",
      boundaryIntent: boundaryRule?.intent,
      conversationIntent: intent,
      guidanceSourceKeys: intent === "methodology_explanation" || intent === "workflow_guidance" || intent === "analytic_decision_request" ? context.guidanceSourceKeys : [],
      provider: "ollama-conversational",
      model: getOllamaModel(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The local Voice Guide took too long to respond. Please try again.");
    if (error instanceof TypeError) throw new Error(getOllamaConnectionErrorMessage());
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
