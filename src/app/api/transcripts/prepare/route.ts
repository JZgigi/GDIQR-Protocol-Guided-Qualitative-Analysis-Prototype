import { NextRequest, NextResponse } from "next/server";
import {
  prepareTranscriptWithLocalRules,
  processTranscriptForPrivacyAndSpeakers
} from "@/lib/ai-provider";
import {
  addRunEvent,
  failRunLog,
  finishRunLog,
  startRunLog
} from "@/lib/run-logs";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const runId = startRunLog("Transcript preparation");
  const body = (await request.json().catch(() => ({}))) as {
    forceRuleBased?: boolean;
    language?: Project["language"];
    timeoutMs?: number;
    transcript?: string;
  };
  const transcript = body.transcript?.trim() ?? "";
  const language = body.language === "Chinese" ? "Chinese" : "English";

  if (!transcript) {
    failRunLog(runId, "Transcript content is required.");
    return NextResponse.json(
      { error: "Transcript content is required." },
      { status: 400 }
    );
  }

  try {
    addRunEvent(
      runId,
      `Preparing local transcript draft (${transcript.length} chars); raw text is not saved to Supabase`
    );
    console.info("[gdiqr:transcript-prepare] start", {
      forceRuleBased: Boolean(body.forceRuleBased),
      transcriptChars: transcript.length
    });
    const startedAt = Date.now();
    let fallbackUsed = Boolean(body.forceRuleBased);
    let processed = body.forceRuleBased
      ? prepareTranscriptWithLocalRules(
          { language, runId, transcript },
          "Quick local preparation was requested."
        )
      : null;
    if (!processed) {
      const timeoutMs = getTranscriptPrepareTimeoutMs(body.timeoutMs);
      const controller = new AbortController();
      try {
        processed = await withTimeout(
          processTranscriptForPrivacyAndSpeakers({
            abortSignal: controller.signal,
            language,
            runId,
            transcript
          }),
          timeoutMs,
          () => controller.abort()
        );
      } catch (error) {
        fallbackUsed = true;
        const message =
          error instanceof Error
            ? error.message
            : "AI transcript preparation did not finish.";
        addRunEvent(
          runId,
          `AI transcript preparation did not finish quickly enough; using local rule-based fallback. ${message}`
        );
        console.warn("[gdiqr:transcript-prepare] fallback triggered", {
          message,
          timeoutMs,
          transcriptChars: transcript.length
        });
        processed = prepareTranscriptWithLocalRules(
          { language, runId, transcript },
          `AI transcript preparation did not finish within ${formatDuration(timeoutMs)}.`
        );
      }
    }
    addRunEvent(
      runId,
      `${fallbackUsed ? "Local rule-based" : "AI-assisted"} transcript preparation finished in ${formatDuration(Date.now() - startedAt)}`
    );
    console.info("[gdiqr:transcript-prepare] finished", {
      fallbackUsed,
      ms: Date.now() - startedAt,
      transcriptChars: processed.sanitizedTranscript.length
    });
    finishRunLog(runId);

    return NextResponse.json({
      fallbackUsed,
      model: processed.model,
      prepared: true,
      privacyFindings: processed.privacyFindings,
      speakerNotes: processed.speakerNotes,
      transcript: processed.sanitizedTranscript
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcript preparation failed.";
    failRunLog(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getTranscriptPrepareTimeoutMs(requestedTimeoutMs?: number) {
  const configured = Number(
    requestedTimeoutMs ?? process.env.TRANSCRIPT_PREPARE_DEMO_TIMEOUT_MS ?? 45000
  );
  if (!Number.isFinite(configured)) {
    return 45000;
  }
  return Math.max(10000, Math.min(configured, 90000));
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
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
              `Transcript preparation exceeded ${formatDuration(timeoutMs)}.`
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
