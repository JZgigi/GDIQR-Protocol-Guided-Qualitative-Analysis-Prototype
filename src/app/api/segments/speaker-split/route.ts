import { NextRequest, NextResponse } from "next/server";
import {
  defaultProjectId,
  speakerSplitSegmentsFromTranscript,
} from "@/lib/gdiqr-repository";
import { getStorageMode } from "@/lib/storage-mode";
import type { SegmentSpeakerRole, TranscriptSegment } from "@/lib/types";
import { splitTranscriptIntoSpeakerTurns } from "@/lib/transcript-speakers";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    caseId?: string;
    projectId?: string;
    transcript?: string;
  };

  try {
    if (getStorageMode() === "local") {
      const segments = buildLocalSpeakerSegments(
        body.transcript ?? "",
        body.caseId,
      );

      return NextResponse.json(
        {
          notice:
            "Speaker-labelled segments created locally. Facilitator/interviewer segments are retained as context and excluded from substantive meaning-unit analysis by default.",
          persisted: false,
          saved: true,
          segments,
        },
        { status: 200 },
      );
    }

    const result = await speakerSplitSegmentsFromTranscript({
      caseId: body.caseId,
      projectId: body.projectId ?? defaultProjectId,
      transcript: body.transcript ?? "",
    });

    return NextResponse.json(result, { status: result.saved ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Speaker segmentation failed.",
      },
      { status: 500 },
    );
  }
}

function buildLocalSpeakerSegments(
  transcript: string,
  caseId = "CASE-001",
): TranscriptSegment[] {
  const turns = splitTranscriptBySpeakerLabels(transcript);
  const now = Date.now();
  return turns.map((turn, index) => ({
    caseId,
    endTimestamp: "00:00",
    id: `local-speaker-seg-${now}-${index + 1}`,
    segmentId: `SEG-${String(index + 1).padStart(3, "0")}`,
    segmentNumber: index + 1,
    speakerInfo: turn.label,
    speakerRole: turn.role,
    sourceTranscriptId: "active-transcript",
    startingMuNumber: index * 100 + 1,
    startTimestamp: "00:00",
    status:
      turn.role === "interviewer" || turn.role === "facilitator"
        ? "Needs Review"
        : "Ready for MU Analysis",
    text: turn.text,
    topicLabel: turn.label,
  }));
}

function splitTranscriptBySpeakerLabels(transcript: string) {
  const turns = splitTranscriptIntoSpeakerTurns(transcript).map((turn) => ({
    label: turn.label,
    role: turn.role satisfies SegmentSpeakerRole,
    text: turn.raw,
  }));

  if (turns.length < 2 || turns.every((turn) => turn.role === "unclear")) {
    return [
      {
        label: "Unclear speaker segment",
        role: "unclear" as const,
        text: transcript.trim(),
      },
    ].filter((turn) => turn.text);
  }

  return turns.filter((turn) => turn.text.trim());
}
