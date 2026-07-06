import { NextRequest, NextResponse } from "next/server";
import {
  defaultProjectId,
  getWorkspace,
  saveTranscriptVersion
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    anonymisationStatus?: "not_reviewed" | "reviewed" | "confirmed";
    content?: string;
    projectId?: string;
    rawTranscriptRetained?: boolean;
    sensitiveItems?: unknown[];
    versionLabel?: string;
  };

  if (!body.content?.trim()) {
    return NextResponse.json(
      { error: "Transcript content is required." },
      { status: 400 }
    );
  }

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        saved: false,
        persisted: false,
        reason:
          "Local-only mode does not save reviewed transcripts to Supabase. The browser session state is the working copy; export JSON to keep a copy."
      });
    }

    const projectId = body.projectId ?? defaultProjectId;
    const result = await saveTranscriptVersion({
      anonymisationStatus: body.anonymisationStatus,
      content: body.content,
      projectId,
      rawTranscriptRetained: body.rawTranscriptRetained,
      sensitiveItems: body.sensitiveItems,
      versionLabel: body.versionLabel
    });
    const workspace = await getWorkspace(projectId);

    return NextResponse.json({ ...result, workspace });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed." },
      { status: 500 }
    );
  }
}
