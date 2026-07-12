"use client";

import type { WorkflowStep } from "@/lib/types";

interface GuidedStep {
  id: WorkflowStep;
  label: string;
}

interface WorkflowNavigationProps {
  activeStep: WorkflowStep;
  completedSteps: Set<WorkflowStep>;
  dataSuitabilityBlocksAnalysis: boolean;
  guidedSteps: GuidedStep[];
  onBlockedNavigation: () => void;
  onSelectStep: (step: WorkflowStep) => void;
}

export function WorkflowNavigation({
  activeStep,
  completedSteps,
  dataSuitabilityBlocksAnalysis,
  guidedSteps,
  onBlockedNavigation,
  onSelectStep,
}: WorkflowNavigationProps) {
  return (
    <div className="top-stepper" aria-label="GDI-QR workflow progress">
      {guidedSteps.map((step, index) => (
        <button
          className={`top-step ${activeStep === step.id ? "active" : ""} ${completedSteps.has(step.id) ? "complete" : ""}`}
          key={step.id}
          disabled={dataSuitabilityBlocksAnalysis && step.id !== "pre-analysis"}
          onClick={() => {
            if (dataSuitabilityBlocksAnalysis && step.id !== "pre-analysis") {
              onBlockedNavigation();
              return;
            }
            onSelectStep(step.id);
          }}
          type="button"
        >
          <span className="top-step-number">{index + 1}</span>
          <span>{step.label}</span>
        </button>
      ))}
    </div>
  );
}
