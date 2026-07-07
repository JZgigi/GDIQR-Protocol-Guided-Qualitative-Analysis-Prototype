import { NextRequest, NextResponse } from "next/server";
import { autoSplitTranscript, type AutoSegmentMode } from "@/lib/auto-segmenter";
import {
  autoSplitSegmentsFromTranscript,
  defaultProjectId,
} from "@/lib/gdiqr-repository";
import { getStorageMode } from "@/lib/storage-mode";
import type { TranscriptSegment } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string;
    projectId?: string;
    researchQuestion?: string;
    splittingMode?: AutoSegmentMode;
    transcript?: string;
  };

  try {
    if (getStorageMode() === "local") {
      const splitResult = autoSplitTranscript(body.transcript ?? "", {
        mode: normalizeSplitMode(body.splittingMode),
        researchQuestion: body.researchQuestion,
        sourceTranscriptId: body.projectId ?? defaultProjectId,
      });
      const segments = splitResult.segments.map((segment, index) =>
        buildLocalSegment(segment.text, segment.title, index + 1, body.caseId),
      );

      return NextResponse.json(
        {
          notice: splitResult.notice,
          persisted: false,
          saved: true,
          segments,
        },
        { status: 200 },
      );
    }

    const result = await autoSplitSegmentsFromTranscript({
      caseId: body.caseId,
      projectId: body.projectId ?? defaultProjectId,
      researchQuestion: body.researchQuestion,
      splittingMode: normalizeSplitMode(body.splittingMode),
      transcript: body.transcript ?? "",
    });

    return NextResponse.json(result, { status: result.saved ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Auto-delineation failed.",
      },
      { status: 500 },
    );
  }
}

function buildLocalSegment(
  text: string,
  title: string,
  segmentNumber: number,
  caseId = "CASE-001",
): TranscriptSegment {
  return {
    caseId,
    endTimestamp: "00:00",
    id: `local-auto-seg-${Date.now()}-${segmentNumber}`,
    segmentId: `SEG-${String(segmentNumber).padStart(3, "0")}`,
    segmentNumber,
    speakerInfo: title,
    speakerRole: "unclear",
    sourceTranscriptId: "active-transcript",
    startingMuNumber: (segmentNumber - 1) * 100 + 1,
    startTimestamp: "00:00",
    status: "Needs Review",
    text,
    topicLabel: title,
  };
}

function normalizeSplitMode(value: unknown): AutoSegmentMode {
  return value === "conservative" || value === "detailed" || value === "balanced"
    ? value
    : "balanced";
}
