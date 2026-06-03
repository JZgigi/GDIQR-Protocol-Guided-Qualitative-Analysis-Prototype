import { NextRequest, NextResponse } from "next/server";
import {
  autoSplitSegmentsFromTranscript,
  defaultProjectId
} from "@/lib/gdiqr-repository";
import { autoSplitTranscript } from "@/lib/auto-segmenter";
import { getStorageMode } from "@/lib/storage-mode";
import type { AutoSegmentMode } from "@/lib/auto-segmenter";
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
      const result = autoSplitTranscript(body.transcript ?? "", {
        mode: normalizeSplitMode(body.splittingMode),
        researchQuestion: body.researchQuestion,
        sourceTranscriptId: body.projectId ?? "active-transcript"
      });
      const now = Date.now();
      const segments: TranscriptSegment[] = result.segments.map(
        (segment, index) => ({
          caseId: body.caseId ?? "CASE-001",
          endTimestamp: "00:00",
          endTurnIndex: segment.endTurnIndex,
          id: `local-seg-${now}-${index + 1}`,
          segmentId: `SEG-${String(index + 1).padStart(3, "0")}`,
          segmentNumber: index + 1,
          speakerInfo: "Local draft segment",
          sourceTranscriptId: segment.sourceTranscriptId,
          splittingMode: segment.splittingMode,
          startingMuNumber: index * 100 + 1,
          startTimestamp: "00:00",
          startTurnIndex: segment.startTurnIndex,
          status: "Needs Review",
          text: segment.text,
          topicLabel: segment.title || `Segment ${index + 1}`
        })
      );

      return NextResponse.json(
        {
          notice:
            result.notice ??
            "Draft segments created locally. Review boundaries before analysis.",
          persisted: false,
          saved: true,
          segments
        },
        { status: 200 }
      );
    }

    const result = await autoSplitSegmentsFromTranscript({
      caseId: body.caseId,
      projectId: body.projectId ?? defaultProjectId,
      researchQuestion: body.researchQuestion,
      splittingMode: normalizeSplitMode(body.splittingMode),
      transcript: body.transcript ?? ""
    });

    return NextResponse.json(result, { status: result.saved ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Auto-split transcript failed."
      },
      { status: 500 }
    );
  }
}

function normalizeSplitMode(value: unknown): AutoSegmentMode {
  return value === "conservative" || value === "detailed" ? value : "balanced";
}
