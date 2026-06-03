import { NextRequest, NextResponse } from "next/server";
import {
  confirmTranscriptForAnalysis,
  defaultProjectId,
  getLocalWorkspace,
  getWorkspace
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";
import type { Project } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    anonymisationStatus?: "not_reviewed" | "reviewed" | "confirmed";
    content?: string;
    language?: Project["language"];
    projectId?: string;
    rawTranscriptRetained?: boolean;
    sensitiveItems?: unknown[];
  };
  const content = body.content?.trim() ?? "";

  if (!content) {
    return NextResponse.json(
      { error: "Transcript content is required before confirmation." },
      { status: 400 }
    );
  }

  const projectId = body.projectId ?? defaultProjectId;

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        persisted: false,
        saved: false,
        reason:
          "Local-only mode confirms transcripts in browser state and does not save them to Supabase.",
        workspace: getLocalWorkspace()
      });
    }

    const result = await confirmTranscriptForAnalysis({
      anonymisationStatus: body.anonymisationStatus,
      content,
      language: body.language === "Chinese" ? "Chinese" : "English",
      projectId,
      rawTranscriptRetained: body.rawTranscriptRetained,
      sensitiveItems: body.sensitiveItems
    });
    const workspace = await getWorkspace(projectId);

    return NextResponse.json({
      ...result,
      workspace
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Transcript confirmation failed."
      },
      { status: 500 }
    );
  }
}
