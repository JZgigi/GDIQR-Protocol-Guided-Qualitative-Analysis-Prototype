import { NextRequest, NextResponse } from "next/server";
import {
  defaultProjectId,
  updateReviewerComment
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";
import type { ReviewerIssueStatus } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ commentId: string }> }
) {
  const { commentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    memo?: string;
    projectId?: string;
    status?: ReviewerIssueStatus;
  };

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        saved: false,
        persisted: false,
        reason:
          "Local-only mode stores reviewer issue edits in browser state, not Supabase."
      });
    }

    const result = await updateReviewerComment({
      commentId,
      memo: body.memo,
      projectId: body.projectId ?? defaultProjectId,
      status: body.status
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Reviewer issue update failed."
      },
      { status: 500 }
    );
  }
}
