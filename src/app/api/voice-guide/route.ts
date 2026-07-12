import { NextRequest, NextResponse } from "next/server";
import { defaultProjectId, getWorkspace } from "@/lib/gdiqr-repository";
import { getStorageMode } from "@/lib/storage-mode";
import type { WorkflowStep } from "@/lib/types";
import {
  buildVoiceGuideContext,
  type VoiceGuideProjectState,
  type VoiceGuideSelectedContext,
} from "@/lib/guidance/voice-guide-context";
import { buildDeterministicVoiceGuideAnswer } from "@/lib/guidance/voice-guide-response";

const WORKFLOW_STEPS: WorkflowStep[] = [
  "pre-analysis",
  "understanding",
  "categorizing",
  "integrating",
  "integrity",
  "export",
];

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    step?: WorkflowStep;
    spokenQuestionTranscript?: string;
    selectedContext?: VoiceGuideSelectedContext;
    projectState?: VoiceGuideProjectState;
  };

  const question = body.spokenQuestionTranscript?.trim() ?? "";
  if (!question) {
    return NextResponse.json(
      { error: "A transcribed Voice Guide question is required." },
      { status: 400 },
    );
  }

  const step = WORKFLOW_STEPS.includes(body.step as WorkflowStep)
    ? (body.step as WorkflowStep)
    : "pre-analysis";
  const projectId = body.projectId ?? body.projectState?.project.id ?? defaultProjectId;

  try {
    const storageMode = getStorageMode();
    const storedWorkspace = storageMode === "supabase" ? await getWorkspace(projectId) : null;
    const state: VoiceGuideProjectState | undefined = storedWorkspace
      ? {
          project: storedWorkspace.project,
          preAnalysisNotes: storedWorkspace.preAnalysisNotes,
          transcriptRecords: storedWorkspace.transcriptRecords,
          meaningUnits: storedWorkspace.meaningUnits,
          categories: storedWorkspace.categories,
          integrationRelationships: storedWorkspace.integrationRelationships,
          integrityReviewItems: storedWorkspace.integrityReviewItems,
          integratedNarrative: storedWorkspace.integratedNarrative,
        }
      : body.projectState;

    if (!state?.project) {
      return NextResponse.json(
        {
          error:
            "Project state is required in local-only mode. The Voice Guide UI should send the current in-browser project snapshot.",
        },
        { status: 400 },
      );
    }

    const context = buildVoiceGuideContext(state, step, body.selectedContext);
    const answer = buildDeterministicVoiceGuideAnswer({
      question,
      step,
      context,
    });

    return NextResponse.json({
      ...answer,
      contextSummary: {
        counts: context.counts,
        unresolvedChecks: context.unresolvedChecks,
        selectedObjectType: context.selectedObject?.type ?? null,
      },
      persisted: false,
      provider: "structured-gdiqr-guidance",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Voice Guide request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
