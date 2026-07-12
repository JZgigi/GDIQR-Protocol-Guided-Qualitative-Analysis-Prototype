import type { WorkflowStep } from "@/lib/types";
import { buildBoundaryReminder, detectBoundaryIntent, getGuidanceForStep } from "@/lib/guidance/gdiqr-guidance";
import type { VoiceGuideContextSummary } from "@/lib/guidance/voice-guide-context";

export interface VoiceGuideAnswer {
  spokenAnswer: string;
  captionSummary: string[];
  boundaryReminder: string;
  suggestedChecks: string[];
  canSaveAsGuidanceNote: boolean;
  boundaryIntent?: string;
  guidanceSourceKeys: string[];
}

export function buildDeterministicVoiceGuideAnswer({ question, step, context }: { question: string; step: WorkflowStep; context: VoiceGuideContextSummary }): VoiceGuideAnswer {
  const guidance = getGuidanceForStep(step);
  const boundaryRule = detectBoundaryIntent(question);
  if (boundaryRule) {
    return {
      spokenAnswer: `${boundaryRule.boundaryReminder} ${boundaryRule.principle} You might look at the evidence together with these questions: ${boundaryRule.suggestedChecks.join(" ")} ${boundaryRule.documentationPrompt}`,
      captionSummary: [boundaryRule.principle, ...boundaryRule.suggestedChecks.slice(0, 3)],
      boundaryReminder: boundaryRule.boundaryReminder,
      suggestedChecks: boundaryRule.suggestedChecks,
      canSaveAsGuidanceNote: true,
      boundaryIntent: boundaryRule.intent,
      guidanceSourceKeys: [...context.guidanceSourceKeys, `boundary.${boundaryRule.intent}`],
    };
  }
  const checks = context.unresolvedChecks.length ? context.unresolvedChecks : guidance.reflectivePrompts.slice(0, 3);
  return {
    spokenAnswer: `I could not reach the local conversational model, so here is a structured fallback. ${guidance.purpose} ${checks.join(" ")} ${buildBoundaryReminder(step)}`,
    captionSummary: checks.slice(0, 4),
    boundaryReminder: buildBoundaryReminder(step),
    suggestedChecks: checks,
    canSaveAsGuidanceNote: true,
    guidanceSourceKeys: context.guidanceSourceKeys,
  };
}
