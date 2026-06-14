import { NextRequest, NextResponse } from "next/server";
import {
  addRunEvent,
  failRunLog,
  finishRunLog,
  startRunLog
} from "@/lib/run-logs";
import { getStorageMode } from "@/lib/storage-mode";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    background?: boolean;
    caseId?: string;
    lightInterpretation?: boolean;
    projectId?: string;
    forceRuleBased?: boolean;
    segmentId?: string;
    startingNumber?: number;
    timeoutMs?: number;
    transcript?: string;
  };
  const runId = startRunLog(
    body.segmentId
      ? `Meaning-unit generation · ${body.segmentId}`
      : "Meaning-unit generation"
  );
  const projectId =
    body.projectId ?? process.env.GDIQR_DEFAULT_PROJECT_ID ?? "proj_student_wellbeing";

  if (body.background === false) {
    try {
      addRunEvent(runId, "Starting meaning-unit job");
      const result = await runMeaningUnitGeneration({
        abortSignal: request.signal,
        caseId: body.caseId,
        lightInterpretation: body.lightInterpretation,
        projectId,
        forceRuleBased: body.forceRuleBased,
        runId,
        segmentId: body.segmentId,
        startingNumber: body.startingNumber,
        timeoutMs: body.timeoutMs,
        transcript: body.transcript
      });

      return NextResponse.json({
        ...result,
        runId,
        started: false
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Meaning-unit generation failed."
        },
        { status: request.signal.aborted ? 499 : 500 }
      );
    }
  }

  addRunEvent(runId, "Queued background meaning-unit job");
  setTimeout(() => {
    void runMeaningUnitGeneration({
      caseId: body.caseId,
      lightInterpretation: body.lightInterpretation,
      projectId,
      forceRuleBased: body.forceRuleBased,
      runId,
      segmentId: body.segmentId,
      startingNumber: body.startingNumber,
      timeoutMs: body.timeoutMs,
      transcript: body.transcript
    }).catch(() => undefined);
  }, 0);

  return NextResponse.json(
    {
      runId,
      started: true
    },
    { status: 202 }
  );
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

async function runMeaningUnitGeneration({
  abortSignal,
  lightInterpretation,
  projectId,
  forceRuleBased,
  runId,
  caseId,
  segmentId,
  startingNumber,
  timeoutMs,
  transcript
}: {
  abortSignal?: AbortSignal;
  caseId?: string;
  forceRuleBased?: boolean;
  lightInterpretation?: boolean;
  projectId: string;
  runId: string;
  segmentId?: string;
  startingNumber?: number;
  timeoutMs?: number;
  transcript?: string;
}) {
  try {
    const [{ generateMeaningUnits, generateRuleBasedMeaningUnits }, repository] =
      await Promise.all([
      import("@/lib/ai-provider"),
      import("@/lib/gdiqr-repository")
    ]);
    const storageMode = getStorageMode();
    const workspace =
      storageMode === "supabase" ? await repository.getWorkspace(projectId) : null;
    const sourceTranscript = transcript ?? workspace?.transcript ?? "";
    if (!sourceTranscript.trim()) {
      throw new Error("No transcript text was provided for meaning-unit generation.");
    }
    const project: Project =
      workspace?.project ?? {
        id: projectId,
        language: "English",
        lightInterpretation: Boolean(lightInterpretation),
        protocol: "GDIQR",
        researchQuestion: "",
        status: "Local-only draft workspace",
        studyDescription: "",
        title: "Local-only prototype workspace",
        updatedAt: new Date().toISOString()
      };
    addRunEvent(
      runId,
      storageMode === "supabase"
        ? "Loaded workspace from Supabase"
        : "Using request transcript in local-only mode; no Supabase write will be made"
    );
    addRunEvent(
      runId,
      segmentId
        ? `Using internal source reference ${segmentId} for MU generation`
        : "Using confirmed transcript as source; transcript segments remain internal"
    );
    addRunEvent(
      runId,
      `Starting background meaning-unit job (${sourceTranscript.length} chars)`
    );
    const startedAt = Date.now();
    console.info("[gdiqr:mu-api] generation start", {
      forceRuleBased: Boolean(forceRuleBased),
      provider: "ollama",
      transcriptChars: sourceTranscript.length
    });
    const generationInput = {
      lightInterpretation:
        lightInterpretation ?? project.lightInterpretation,
      project,
      runId,
      caseId,
      segmentId,
      startingNumber,
      transcript: sourceTranscript
    };
    let fallbackUsed = Boolean(forceRuleBased);
    let result = forceRuleBased
      ? generateRuleBasedMeaningUnits(
          generationInput,
          "Rule-based draft — for researcher review. Requested directly from the Step 2 fallback button."
        )
      : null;
    if (!result) {
      const demoTimeoutMs = getMeaningUnitDemoTimeoutMs(timeoutMs);
      const controller = new AbortController();
      const onAbort = () => controller.abort();
      abortSignal?.addEventListener("abort", onAbort, { once: true });
      try {
        result = await withTimeout(
          generateMeaningUnits({
            ...generationInput,
            abortSignal: controller.signal
          }),
          demoTimeoutMs,
          () => {
            controller.abort();
          }
        );
      } catch (error) {
        if (abortSignal?.aborted) {
          throw error;
        }
        fallbackUsed = true;
        const message =
          error instanceof Error ? error.message : "AI generation did not finish.";
        addRunEvent(
          runId,
          `AI generation did not finish quickly enough; using rule-based fallback. ${message}`
        );
        console.warn("[gdiqr:mu-api] fallback triggered", {
          message,
          timeoutMs: demoTimeoutMs,
          transcriptChars: sourceTranscript.length
        });
        result = generateRuleBasedMeaningUnits(
          generationInput,
          `Rule-based draft — for researcher review. Fallback used because AI generation did not finish within ${formatDuration(demoTimeoutMs)} or returned unusable output.`
        );
      } finally {
        abortSignal?.removeEventListener("abort", onAbort);
      }
    }
    addRunEvent(
      runId,
      `${fallbackUsed ? "Rule-based fallback" : "Ollama meaning-unit generation"} finished in ${formatDuration(Date.now() - startedAt)} with ${result.meaningUnits.length} MU${result.meaningUnits.length === 1 ? "" : "s"}`
    );
    console.info("[gdiqr:mu-api] generation finished", {
      fallbackUsed,
      meaningUnits: result.meaningUnits.length,
      ms: Date.now() - startedAt
    });

    if (storageMode !== "supabase") {
      addRunEvent(runId, "Meaning units returned to browser state only");
      finishRunLog(runId);
      return {
        meaningUnits: result.meaningUnits,
        fallbackUsed,
        model: result.model,
        persisted: false,
        provider: result.provider
      };
    }

    addRunEvent(runId, `Saving ${result.meaningUnits.length} meaning units`);
    const saveResult = segmentId
      ? await repository.replaceMeaningUnitsForSegment({
          projectId,
          segmentId,
          units: result.meaningUnits
        })
      : await repository.replaceMeaningUnitsFromAi({
          projectId,
          units: result.meaningUnits
        });
    addRunEvent(
      runId,
      saveResult.saved
        ? "Meaning units saved to Supabase"
        : saveResult.reason ?? "Meaning units were generated but not persisted"
    );
    finishRunLog(runId);
    return {
      meaningUnits: saveResult.units ?? result.meaningUnits,
      fallbackUsed,
      model: result.model,
      persisted: saveResult.saved,
      provider: result.provider
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Meaning-unit generation failed.";
    failRunLog(runId, message);
    throw error;
  }
}

function getMeaningUnitDemoTimeoutMs(requestedTimeoutMs?: number) {
  const configured = Number(
    requestedTimeoutMs ?? process.env.MU_DEMO_AI_TIMEOUT_MS ?? 45000
  );
  if (!Number.isFinite(configured)) {
    return 45000;
  }
  return Math.max(15000, Math.min(configured, 90000));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void
) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          onTimeout();
          reject(
            new Error(
              `Meaning-unit AI generation exceeded ${formatDuration(timeoutMs)}.`
            )
          );
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
