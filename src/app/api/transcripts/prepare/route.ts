import { NextRequest, NextResponse } from "next/server";
import { processTranscriptForPrivacyAndSpeakers } from "@/lib/ai-provider";
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
    language?: Project["language"];
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
    const processed = await processTranscriptForPrivacyAndSpeakers({
      language,
      runId,
      transcript
    });
    finishRunLog(runId);

    return NextResponse.json({
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
