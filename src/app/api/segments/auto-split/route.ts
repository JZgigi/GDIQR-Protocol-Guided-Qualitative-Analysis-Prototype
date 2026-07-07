import { NextRequest, NextResponse } from "next/server";
import {
  defaultProjectId,
  speakerSplitSegmentsFromTranscript,
} from "@/lib/gdiqr-repository";
import { getStorageMode } from "@/lib/storage-mode";
import type { SegmentSpeakerRole, TranscriptSegment } from "@/lib/types";

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
            "Speaker-labelled segments created locally. Interviewer-only segments are kept for context and ignored by default when generating meaning-unit drafts.",
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
      turn.role === "interviewer" ? "Needs Review" : "Ready for MU Analysis",
    text: turn.text,
    topicLabel: turn.label,
  }));
}

function splitTranscriptBySpeakerLabels(transcript: string) {
  const lines = transcript
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const turns: Array<{
    label: string;
    role: SegmentSpeakerRole;
    text: string;
  }> = [];

  for (const line of lines) {
    const match = line.match(/^([^:：\n]{1,48})[:：]\s*(.*)$/u);
    if (match) {
      const label = match[1].trim();
      const content = match[2].trim();
      turns.push({
        label,
        role: inferRole(label),
        text: content ? `${label}: ${content}` : `${label}:`,
      });
      continue;
    }

    if (turns.length > 0) {
      turns[turns.length - 1].text =
        `${turns[turns.length - 1].text}\n${line}`.trim();
    } else {
      turns.push({ label: "Unclear speaker", role: "unclear", text: line });
    }
  }

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

function inferRole(label: string): SegmentSpeakerRole {
  const value = label.trim().toLowerCase();
  if (
    /^(interviewer|interview|researcher|moderator|facilitator|q|i|主持人|访谈者|研究者|采访者)$/.test(
      value,
    )
  ) {
    return "interviewer";
  }
  if (
    /^(participant|interviewee|student|p|a|受访者|参与者|学生)$/.test(value)
  ) {
    return "participant";
  }
  return "unclear";
}
