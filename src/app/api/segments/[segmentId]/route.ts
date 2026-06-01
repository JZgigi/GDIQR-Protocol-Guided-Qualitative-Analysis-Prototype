import { NextRequest, NextResponse } from "next/server";
import {
  deleteSegment,
  defaultProjectId,
  mergeSegment,
  moveSegment,
  splitSegment,
  updateSegment
} from "@/lib/gdiqr-repository";
import type { SegmentStatus } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ segmentId: string }> }
) {
  const { segmentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    status?: SegmentStatus;
    text?: string;
    topicLabel?: string;
  };

  try {
    const result = await updateSegment({
      projectId: body.projectId ?? defaultProjectId,
      segmentId,
      status: body.status,
      text: body.text,
      topicLabel: body.topicLabel
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Segment update failed." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ segmentId: string }> }
) {
  const { segmentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "split" | "merge" | "move";
    afterText?: string;
    beforeText?: string;
    direction?: "previous" | "next" | "up" | "down";
    projectId?: string;
  };
  const projectId = body.projectId ?? defaultProjectId;

  try {
    if (body.action === "split") {
      const result = await splitSegment({
        afterText: body.afterText ?? "",
        beforeText: body.beforeText ?? "",
        projectId,
        segmentId
      });
      return NextResponse.json(result);
    }

    if (body.action === "merge") {
      const result = await mergeSegment({
        direction: body.direction === "previous" ? "previous" : "next",
        projectId,
        segmentId
      });
      return NextResponse.json(result);
    }

    if (body.action === "move") {
      const result = await moveSegment({
        direction: body.direction === "up" ? "up" : "down",
        projectId,
        segmentId
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown segment action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Segment action failed." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ segmentId: string }> }
) {
  const { segmentId } = await context.params;
  const projectId =
    request.nextUrl.searchParams.get("projectId") ?? defaultProjectId;

  try {
    const result = await deleteSegment({ projectId, segmentId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Segment delete failed." },
      { status: 500 }
    );
  }
}
