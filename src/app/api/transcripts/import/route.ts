import { NextRequest, NextResponse } from "next/server";
import { processTranscriptForPrivacyAndSpeakers } from "@/lib/ai-provider";
import {
  defaultProjectId,
  getWorkspace,
  importTranscriptForAnalysis
} from "@/lib/gdiqr-repository";
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
  const runId = startRunLog("Transcript import");
  const body = (await request.json().catch(() => ({}))) as {
    language?: Project["language"];
    projectId?: string;
    sourceLabel?: string;
    transcript?: string;
  };
  const transcript = body.transcript?.trim() ?? "";
  const projectId = body.projectId ?? defaultProjectId;
  const language = body.language === "Chinese" ? "Chinese" : "English";

  if (!transcript) {
    failRunLog(runId, "Transcript content is required.");
    return NextResponse.json(
      { error: "Transcript content is required." },
      { status: 400 }
    );
  }

  try {
    addRunEvent(runId, `Received transcript import (${transcript.length} chars)`);
    const processed = await processTranscriptForPrivacyAndSpeakers({
      language,
      runId,
      transcript
    });
    addRunEvent(runId, "Saving prepared transcript to Supabase");
    const saveResult = await importTranscriptForAnalysis({
      language,
      projectId,
      sourceLabel: body.sourceLabel ?? "Imported transcript + privacy review",
      transcript: processed.sanitizedTranscript
    });
    const workspace = await getWorkspace(projectId);
    finishRunLog(runId);

    return NextResponse.json({
      imported: saveResult.saved,
      privacyFindings: processed.privacyFindings,
      speakerNotes: processed.speakerNotes,
      workspace
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcript import failed.";
    failRunLog(runId, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
