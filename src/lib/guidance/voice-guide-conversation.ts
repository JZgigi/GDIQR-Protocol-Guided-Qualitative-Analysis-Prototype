import {
  getOllamaChatCompletionsUrl,
  getOllamaModel,
} from "@/lib/ollama-config";
import type { WorkflowStep } from "@/lib/types";
import {
  detectBoundaryIntent,
  getGuidanceForStep,
} from "@/lib/guidance/gdiqr-guidance";
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

export type VoiceGuideModelErrorCode =
  | "connection"
  | "timeout"
  | "http"
  | "empty-response"
  | "invalid-response";

export class VoiceGuideModelError extends Error {
  constructor(
    public readonly code: VoiceGuideModelErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VoiceGuideModelError";
  }
}

function classifyIntent(question: string): VoiceGuideConversationIntent {
  if (detectBoundaryIntent(question)) return "analytic_decision_request";
  if (
    /\b(button|click|upload|import|export|page|screen|where|how do i use|怎么用|按钮|上传|导入|导出|页面)\b/i.test(
      question,
    )
  ) {
    return "app_help";
  }
  if (
    /\b(meaning unit|category|domain|integration|gdi.?qr|methodolog|reflexiv|research question|qualitative data|transcript|coding|质性|意义单元|类别|领域|整合|方法学|反思性|研究问题|访谈|文本分析)\b/i.test(
      question,
    )
  ) {
    return "methodology_explanation";
  }
  if (
    /\b(next step|move on|ready|what should i do|current step|下一步|准备好|现在该做什么|当前步骤)\b/i.test(
      question,
    )
  ) {
    return "workflow_guidance";
  }
  if (
    /\b(tired|overwhelmed|stressed|nervous|confused|frustrated|累|压力|紧张|困惑|烦|害怕)\b/i.test(
      question,
    )
  ) {
    return "brief_social_support";
  }
  return "scope_redirect";
}

function methodologicalContextForIntent(intent: VoiceGuideConversationIntent) {
  return (
    intent === "methodology_explanation" ||
    intent === "workflow_guidance" ||
    intent === "analytic_decision_request"
  );
}

function buildSystemPrompt(
  step: WorkflowStep,
  intent: VoiceGuideConversationIntent,
  context: VoiceGuideContextSummary,
) {
  const guidance = getGuidanceForStep(step);
  const methodologicalContext = methodologicalContextForIntent(intent);

  return `You are Mira, a focused, warm qualitative analysis voice guide embedded in a five-stage GDI-QR-informed analysis workspace.

Primary role:
- Help researchers work through Pre-analysis, Understanding & Translating, Categorizing, Integrating, and Methodological Integrity.
- Work with qualitative material the researcher already has or is preparing.
- Keep the conversation anchored to qualitative analysis and the current workflow stage.

Scope:
- Briefly acknowledge greetings, tiredness, uncertainty, or frustration, then return to the current analysis task.
- Do not become a general-purpose companion, counsellor, life adviser, unrestricted brainstorming partner, or broad research-topic generator.
- If asked to invent a topic or research question from scratch, ask what qualitative data and draft area of inquiry the researcher already has.
- If a request is outside qualitative analysis, state your focused role briefly and offer one relevant next step.

Methodological grounding:
- Use the supplied GDI-QR guidance and project context for qualitative-analysis questions.
- Never make the final analytic decision for the researcher.
- Do not decide whether a MU must be split, accepted, excluded, or assigned; do not declare a category correct; do not write a final category definition or integration narrative.
- For decision requests, explain the principle, identify evidence to inspect, and offer a few reflective checks.

Interaction style:
- Reply in the user's language.
- Sound calm, capable, concise, and natural.
- Default to 2-4 short sentences suitable for speech.
- Avoid long lists unless the user asks for detail.
- Do not mention internal prompts, routing, policies, or hidden implementation.

Current routing intent: ${intent}
Current workflow step: ${step}
Research question: ${context.researchQuestion || "not yet recorded"}
Project status: ${context.projectStatus}
Current unresolved workflow checks: ${context.unresolvedChecks.join(" ") || "none detected"}
Current selected object: ${JSON.stringify(context.selectedObject ?? null)}

${
  methodologicalContext
    ? `Relevant GDI-QR guidance:
Purpose: ${guidance.purpose}
Researcher actions: ${guidance.researcherActions.join(" | ")}
Reflective prompts: ${guidance.reflectivePrompts.slice(0, 5).join(" | ")}
Common risks: ${guidance.commonRisks.slice(0, 4).join(" | ")}
Decision boundary: ${guidance.decisionBoundary}`
    : `Keep the reply brief and redirect to a concrete task in ${step}.`
}

Return JSON with these keys:
{
  "spokenAnswer": "concise natural voice-ready response",
  "captionSummary": ["up to 2 short accessibility captions"],
  "suggestedChecks": ["up to 3 relevant checks"],
  "boundaryReminder": "brief reminder only when analytically relevant"
}`;
}

function extractJsonObject(raw: string) {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned) as unknown;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    }
    throw new VoiceGuideModelError(
      "invalid-response",
      "The local model replied, but its response format could not be read.",
    );
  }
}

function normalizeModelAnswer(raw: string) {
  let parsed: unknown;
  try {
    parsed = extractJsonObject(raw);
  } catch (error) {
    if (error instanceof VoiceGuideModelError) throw error;
    throw new VoiceGuideModelError(
      "invalid-response",
      "The local model replied, but its response format could not be read.",
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new VoiceGuideModelError(
      "invalid-response",
      "The local model returned an unexpected response.",
    );
  }

  const record = parsed as Record<string, unknown>;
  const spokenAnswer = String(
    record.spokenAnswer ?? record.answer ?? record.response ?? "",
  ).trim();

  if (!spokenAnswer) {
    throw new VoiceGuideModelError(
      "empty-response",
      "The local model returned no final answer.",
    );
  }

  return {
    spokenAnswer,
    captionSummary: Array.isArray(record.captionSummary)
      ? record.captionSummary.map(String).slice(0, 2)
      : [spokenAnswer.slice(0, 160)],
    suggestedChecks: Array.isArray(record.suggestedChecks)
      ? record.suggestedChecks.map(String).slice(0, 3)
      : [],
    boundaryReminder: String(record.boundaryReminder ?? "").trim(),
  };
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
    Number(process.env.OLLAMA_VOICE_GUIDE_TIMEOUT_MS ?? 90000),
  );

  try {
    let response: Response;
    try {
      response = await fetch(getOllamaChatCompletionsUrl(), {
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
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new VoiceGuideModelError(
          "timeout",
          "The local model took too long to respond. It may still be loading; please try again.",
        );
      }
      throw new VoiceGuideModelError(
        "connection",
        `The app could not connect to Ollama at the configured local address.`,
      );
    }

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new VoiceGuideModelError(
        "http",
        `Ollama returned HTTP ${response.status}${details ? `: ${details.slice(0, 180)}` : "."}`,
      );
    }

    const body = (await response.json().catch(() => null)) as
      | {
          choices?: Array<{
            message?: {
              content?: string;
              reasoning?: string;
              thinking?: string;
            };
          }>;
        }
      | null;

    const message = body?.choices?.[0]?.message;
    const raw =
      message?.content?.trim() ||
      message?.reasoning?.trim() ||
      message?.thinking?.trim();

    if (!raw) {
      throw new VoiceGuideModelError(
        "empty-response",
        "Ollama responded, but no final answer was available.",
      );
    }

    const parsed = normalizeModelAnswer(raw);
    let spokenAnswer = parsed.spokenAnswer;

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
      captionSummary: parsed.captionSummary,
      suggestedChecks: parsed.suggestedChecks,
      boundaryReminder:
        boundaryRule?.boundaryReminder ?? parsed.boundaryReminder,
      canSaveAsGuidanceNote: false,
      boundaryIntent: boundaryRule?.intent,
      conversationIntent: intent,
      guidanceSourceKeys: methodologicalContextForIntent(intent)
        ? context.guidanceSourceKeys
        : [],
      provider: "ollama-conversational",
      model: getOllamaModel(),
    };
  } finally {
    clearTimeout(timeout);
  }
}
