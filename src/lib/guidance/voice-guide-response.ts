import type { WorkflowStep } from "@/lib/types";
import {
  buildBoundaryReminder,
  detectBoundaryIntent,
  getGuidanceForStep,
} from "@/lib/guidance/gdiqr-guidance";
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

export function buildDeterministicVoiceGuideAnswer({
  question,
  step,
  context,
}: {
  question: string;
  step: WorkflowStep;
  context: VoiceGuideContextSummary;
}): VoiceGuideAnswer {
  const guidance = getGuidanceForStep(step);
  const boundaryRule = detectBoundaryIntent(question);

  if (boundaryRule) {
    const contextNote = context.unresolvedChecks.length
      ? `Your workspace currently shows: ${context.unresolvedChecks.join(" ")}`
      : "Your workspace does not show an obvious incomplete item for this check, but you should still inspect the underlying evidence.";
    return {
      spokenAnswer: [
        boundaryRule.boundaryReminder,
        boundaryRule.principle,
        contextNote,
        `Consider these checks: ${boundaryRule.suggestedChecks.join(" ")}`,
        boundaryRule.documentationPrompt,
      ].join(" "),
      captionSummary: [boundaryRule.principle, ...boundaryRule.suggestedChecks.slice(0, 3)],
      boundaryReminder: boundaryRule.boundaryReminder,
      suggestedChecks: boundaryRule.suggestedChecks,
      canSaveAsGuidanceNote: true,
      boundaryIntent: boundaryRule.intent,
      guidanceSourceKeys: [...context.guidanceSourceKeys, `boundary.${boundaryRule.intent}`],
    };
  }

  const checks = context.unresolvedChecks.length
    ? context.unresolvedChecks
    : guidance.reflectivePrompts.slice(0, 3);
  const spokenAnswer = [
    guidance.purpose,
    context.unresolvedChecks.length
      ? `Based on the current project state, check the following: ${context.unresolvedChecks.join(" ")}`
      : `No obvious incomplete state was detected, so review these methodological questions: ${checks.join(" ")}`,
    "You may document the evidence you reviewed, the judgement you made, and any uncertainty or limitation you carry forward.",
    buildBoundaryReminder(step),
  ].join(" ");

  return {
    spokenAnswer,
    captionSummary: checks.slice(0, 4),
    boundaryReminder: buildBoundaryReminder(step),
    suggestedChecks: checks,
    canSaveAsGuidanceNote: true,
    guidanceSourceKeys: context.guidanceSourceKeys,
  };
}
