import { NextRequest, NextResponse } from "next/server";
import { generateCategories } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  saveCategorySystemFromAi
} from "@/lib/gdiqr-repository";
import {
  addRunEvent,
  failRunLog,
  finishRunLog,
  startRunLog
} from "@/lib/run-logs";
import { getStorageMode } from "@/lib/storage-mode";
import type { CategoryMode, CategoryNode, MeaningUnit, Project } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    acceptFallbackDraft?: boolean;
    allBatchesProcessed?: boolean;
    categories?: CategoryNode[];
    integratedNarrative?: string;
    mode?: CategoryMode;
    projectId?: string;
    project?: Project;
    units?: MeaningUnit[];
  };
  const mode: CategoryMode =
    body.mode === "B" || body.mode === "C" ? body.mode : "A";
  const runId = startRunLog(`Category generation · Mode ${mode}`);
  const projectId = body.projectId ?? defaultProjectId;

  try {
    const storageMode = getStorageMode();
    const workspace =
      storageMode === "supabase" ? await getWorkspace(projectId) : null;
    addRunEvent(
      runId,
      storageMode === "supabase"
        ? "Loaded workspace from Supabase"
        : "Using reviewed meaning units from request body in local-only mode"
    );

    if (body.acceptFallbackDraft) {
      if (!body.categories || body.categories.length === 0) {
        throw new Error("No temporary category draft was provided to save.");
      }
      if (storageMode !== "supabase") {
        addRunEvent(
          runId,
          "Temporary category draft confirmed in browser state only"
        );
        finishRunLog(runId);
        return NextResponse.json({
          categories: markResearcherConfirmed(body.categories),
          integratedNarrative: body.integratedNarrative ?? "",
          isFallbackDraft: false,
          persisted: false,
          provider: "researcher_confirmed",
          warnings: [
            "Temporary fallback draft was confirmed for prototype testing in local-only mode."
          ]
        });
      }
      addRunEvent(runId, "Saving researcher-confirmed temporary category draft");
      const saveResult = await saveCategorySystemFromAi({
        categories: markResearcherConfirmed(body.categories),
        integratedNarrative: body.integratedNarrative ?? "",
        mode,
        projectId
      });
      finishRunLog(runId);
      return NextResponse.json({
        categories: saveResult.categories,
        integratedNarrative: saveResult.integratedNarrative,
        isFallbackDraft: false,
        persisted: saveResult.saved,
        provider: "researcher_confirmed",
        warnings: [
          "Temporary fallback draft was saved only after explicit researcher confirmation."
        ]
      });
    }

    const sourceUnits = workspace?.meaningUnits ?? body.units ?? [];
    const confirmedUnits = sourceUnits.filter(
      (unit) =>
        !unit.analysisExcluded &&
        (unit.humanStatus === "Accepted" || unit.humanStatus === "Edited")
    );
    if (confirmedUnits.length === 0) {
      throw new Error(
        "No accepted or edited meaning-unit summaries are available yet."
      );
    }
    addRunEvent(runId, `Calling Ollama for Mode ${mode} categories (${confirmedUnits.length} confirmed MUs)`);
    const startedAt = Date.now();
    const project: Project =
      workspace?.project ?? body.project ?? {
        id: projectId,
        language: "English",
        lightInterpretation: false,
        protocol: "GDIQR",
        researchQuestion: "",
        status: "Local-only draft workspace",
        studyDescription: "",
        title: "Local-only prototype workspace",
        updatedAt: new Date().toISOString()
      };
    const existingCategories = workspace?.categories ?? body.categories ?? [];
    const result = await generateCategories({
      allBatchesProcessed: body.allBatchesProcessed,
      existingCategories,
      mode,
      project,
      units: confirmedUnits
    });
    if (result.uncertainties.length > 0) {
      addRunEvent(runId, result.uncertainties[0]);
    }
    addRunEvent(
      runId,
      `Category generation finished in ${formatDuration(Date.now() - startedAt)}`
    );

    if (result.isFallbackDraft) {
      addRunEvent(
        runId,
        "AI returned empty output. A temporary fallback draft was created but not saved."
      );
      finishRunLog(runId);
      return NextResponse.json({
        ...result,
        persisted: false
      });
    }

    if (storageMode !== "supabase") {
      addRunEvent(runId, "Category draft returned to browser state only");
      finishRunLog(runId);
      return NextResponse.json({
        ...result,
        persisted: false
      });
    }

    addRunEvent(runId, `Saving ${result.categories.length} top-level categories`);
    const saveResult = await saveCategorySystemFromAi({
      categories: result.categories,
      integratedNarrative: result.integratedNarrative,
      mode,
      projectId
    });
    finishRunLog(runId);

    return NextResponse.json({
      ...result,
      categories: saveResult.categories,
      integratedNarrative: saveResult.integratedNarrative,
      persisted: saveResult.saved
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Category generation failed.";
    const message = `Mode ${mode} could not finish because the local AI did not return a usable category result. Review accepted meaning units, try Mode A first, or retry with a smaller/faster model. Details: ${detail}`;
    failRunLog(runId, message);
    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}

function markResearcherConfirmed(
  categories: CategoryNode[]
): CategoryNode[] {
  return categories.map((category) => ({
    ...category,
    source: "researcher_confirmed" as const,
    subcategories: category.subcategories
      ? markResearcherConfirmed(category.subcategories)
      : undefined
  }));
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
