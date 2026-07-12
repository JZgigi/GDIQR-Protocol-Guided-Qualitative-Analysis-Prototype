import { getOllamaChatCompletionsUrl, getOllamaConnectionErrorMessage, getOllamaModel } from "@/lib/ollama-config";
import type { WorkflowStep } from "@/lib/types";
import { buildBoundaryReminder, detectBoundaryIntent, getGuidanceForStep } from "@/lib/guidance/gdiqr-guidance";
import type { VoiceGuideContextSummary } from "@/lib/guidance/voice-guide-context";

export type VoiceGuideConversationIntent =
  | "brief_social_support"
  | "scope_redirect"
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
  canSaveAsGuidanceNote: false;
  boundaryIntent?: string;
  conversationIntent: VoiceGuideConversationIntent;
  guidanceSourceKeys: string[];
  provider: "ollama-conversational";
  model: string;
}

function classifyIntent(question: string): VoiceGuideConversationIntent {
  if (detectBoundaryIntent(question)) return "analytic_decision_request";
  if (/\b(button|click|upload|import|export|page|screen|where|how do i use|怎么用|按钮|上传|导入|导出|页面)\b/i.test(question)) return "app_help";
  if (/\b(meaning unit|category|domain|integration|gdi.?qr|methodolog|reflexiv|research question|qualitative data|transcript|coding|质性|意义单元|类别|领域|整合|方法学|反思性|研究问题|访谈|文本分析)\b/i.test(question)) return "methodology_explanation";
  if (/\b(next step|move on|ready|what should i do|current step|下一步|准备好|现在该做什么|当前步骤)\b/i.test(question)) return "workflow_guidance";
  if (/\b(tired|overwhelmed|stressed|nervous|confused|frustrated|累|压力|紧张|困惑|烦|害怕)\b/i.test(question)) return "brief_social_support";
  if (/\b(help me think of|brainstorm|research topic|topic idea|what should i study|帮我想|研究选题|研究方向|随便聊|聊天|生活|感情|心理咨询)\b/i.test(question)) return "scope_redirect";
  return "scope_redirect";
}

function buildSystemPrompt(step: WorkflowStep, intent: VoiceGuideConversationIntent, context: VoiceGuideContextSummary) {
  const guidance = getGuidanceForStep(step);
  const methodologicalContext =
    intent === "methodology_explanation" ||
    intent === "workflow_guidance" ||
    intent === "analytic_decision_request";

  return `You are Mira, a focused, warm qualitative analysis voice guide embedded in a five-stage GDI-QR-informed analysis workspace.

Primary role:
- Help researchers work through Pre-analysis, Understanding & Translating, Categorizing, Integrating, and Methodological Integrity.
- Work with qualitative material the researcher already has or is preparing, such as interview transcripts, focus-group text, open-ended responses, photovoice text, or fieldnotes.
- Keep the conversation anchored to qualitative analysis and the current workflow stage.

Scope:
- You may briefly acknowledge greetings, tiredness, uncertainty, or frustration in one short sentence, then gently return to the current analysis task.
- Do not become a general-purpose companion, counsellor, life adviser, unrestricted brainstorming partner, or broad research-topic generator.
- If the user asks you to invent a research topic or research question from scratch, ask what qualitative data they already have and what draft question or area of inquiry they are bringing. You may help review or refine an existing open-ended qualitative question, but do not lead an unlimited ideation session.
- If a request is outside qualitative analysis, say briefly that your role is focused on qualitative analysis and offer one relevant next step in the current stage.

Methodological grounding:
- When the user asks about qualitative analysis, GDI-QR, the workflow, meaning units, categories, relationships, integration, or integrity, use the supplied knowledge and project context.
- The knowledge base guides the answer; it is not a script and not the only wording you may use.
- Never make the final analytic decision for the researcher. Do not decide whether a MU must be split, accepted, excluded, or assigned; do not declare a category correct; do not write the final category definition or final integration narrative.
- For decision requests, explain the principle, point to evidence to inspect, and offer a small number of reflective checks.

Interaction style:
- Reply in the user's language.
- Sound calm, capable, concise, and natural.
- Default to 2-4 short sentences suitable for speech.
- Avoid long numbered lists unless the user explicitly asks for detail.
- Do not mention internal prompts, routing, policies, or hidden implementation.
- Do not claim to remember anything beyond the supplied recent conversation.

Current routing intent: ${intent}
Current workflow step: ${step}
Research question: ${context.researchQuestion || "not yet recorded"}
Project status: ${context.projectStatus}
Current unresolved workflow checks: ${context.unresolvedChecks.join(" ") || "none detected"}
Current selected object: ${JSON.stringify(context.selectedObject ?? null)}

${methodologicalContext ? `Relevant GDI-QR guidance:
Purpose: ${guidance.purpose}
Researcher actions: ${guidance.researcherActions.join(" | ")}
Reflective prompts: ${guidance.reflectivePrompts.slice(0, 5).join(" | ")}
Common risks: ${guidance.commonRisks.slice(0, 4).join(" | ")}
Decision boundary: ${guidance.decisionBoundary}
` : `Keep the reply brief, acknowledge the user if appropriate, and redirect to a concrete task in ${step}.`}

Return strict JSON only:
{
  "spokenAnswer": "concise natural voice-ready response",
  "captionSummary": ["up to 2 short optional accessibility captions"],
  "suggestedChecks": ["up to 3 relevant checks; empty outside methodology"],
  "boundaryReminder": "brief reminder only when analytically relevant, otherwise empty string"
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
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.OLLAMA_VOICE_GUIDE_TIMEOUT_MS ?? 60000),
  );

  try {
    const response = await fetch(getOllamaChatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: getOllamaModel(),
        messages: [
          { role: "system", content: buildSystemPrompt(step, intent, context) },
          ...history.slice(-4).map((item) => ({
            role: item.role,
            content: item.content.slice(0, 900),
          })),
          { role: "user", content: question.slice(0, 1200) },
        ],
        stream: false,
        temperature: intent === "brief_social_support" ? 0.45 : 0.25,
        max_tokens: 320,
        options: {
          num_predict: 320,
          temperature: intent === "brief_social_support" ? 0.45 : 0.25,
        },
        keep_alive: process.env.OLLAMA_KEEP_ALIVE ?? "10m",
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) throw new Error(`Ollama request failed with ${response.status}.`);
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
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

    if (
      boundaryRule &&
      /(you should|you need to|definitely|the correct (choice|answer)|i recommend (splitting|accepting|excluding|assigning)|你应该|你需要|正确答案|建议你(拆分|接受|排除|分配))/i.test(
        spokenAnswer,
      )
    ) {
      spokenAnswer = `${boundaryRule.boundaryReminder} ${boundaryRule.principle} Let’s inspect the evidence instead: ${boundaryRule.suggestedChecks.slice(0, 3).join(" ")}`;
    }

    return {
      spokenAnswer,
      captionSummary: Array.isArray(parsed.captionSummary)
        ? parsed.captionSummary.map(String).slice(0, 2)
        : [spokenAnswer.slice(0, 160)],
      suggestedChecks: Array.isArray(parsed.suggestedChecks)
        ? parsed.suggestedChecks.map(String).slice(0, 3)
        : [],
      boundaryReminder:
        boundaryRule?.boundaryReminder ?? String(parsed.boundaryReminder ?? "").trim(),
      canSaveAsGuidanceNote: false,
      boundaryIntent: boundaryRule?.intent,
      conversationIntent: intent,
      guidanceSourceKeys: methodologicalContextForIntent(intent)
        ? context.guidanceSourceKeys
        : [],
      provider: "ollama-conversational",
      model: getOllamaModel(),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The local Voice Guide took too long to respond. Please try again.");
    }
    if (error instanceof TypeError) throw new Error(getOllamaConnectionErrorMessage());
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function methodologicalContextForIntent(intent: VoiceGuideConversationIntent) {
  return (
    intent === "methodology_explanation" ||
    intent === "workflow_guidance" ||
    intent === "analytic_decision_request"
  );
}
