export type TranscriptSpeakerRole = "interviewer" | "participant" | "unclear";

export interface ParsedTranscriptTurn {
  content: string;
  label: string;
  raw: string;
  role: TranscriptSpeakerRole;
}

const interviewerAliases = new Set([
  "interviewer",
  "interview",
  "researcher",
  "moderator",
  "facilitator",
  "q",
  "i",
  "主持人",
  "访谈者",
  "研究者",
  "采访者"
]);

const participantAliases = new Set([
  "participant",
  "interviewee",
  "student",
  "respondent",
  "p",
  "a",
  "受访者",
  "被访者",
  "参与者",
  "学生"
]);

const speakerLabelPattern =
  /^([\p{L}][\p{L}\p{N}\s.'_-]{0,47}|[IQPA])\s*[:：]\s*(.*)$/u;

export function normalizeTranscriptSpeakerRole(
  label: string
): TranscriptSpeakerRole {
  const normalized = label.trim().toLowerCase();
  if (interviewerAliases.has(normalized)) {
    return "interviewer";
  }
  if (participantAliases.has(normalized)) {
    return "participant";
  }
  return "unclear";
}

export function parseSpeakerLine(line: string) {
  const match = line.match(speakerLabelPattern);
  if (!match) {
    return null;
  }
  const label = (match[1] ?? "").trim();
  return {
    content: match[2] ?? "",
    label,
    role: normalizeTranscriptSpeakerRole(label)
  };
}

export function splitTranscriptIntoSpeakerTurns(
  transcript: string
): ParsedTranscriptTurn[] {
  const lines = transcript.replace(/\r\n/g, "\n").split("\n");
  const turns: ParsedTranscriptTurn[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const parsed = parseSpeakerLine(line);
    if (parsed) {
      turns.push({
        content: parsed.content.trim(),
        label: parsed.label,
        raw: parsed.content.trim()
          ? `${parsed.label}: ${parsed.content.trim()}`
          : `${parsed.label}:`,
        role: parsed.role
      });
      continue;
    }

    const previous = turns[turns.length - 1];
    if (previous) {
      previous.content = `${previous.content}\n${line}`.trim();
      previous.raw = `${previous.raw}\n${line}`.trim();
    } else {
      turns.push({
        content: line,
        label: "Unclear speaker",
        raw: line,
        role: "unclear"
      });
    }
  }

  return turns;
}

export function stripSpeakerLabel(line: string) {
  const parsed = parseSpeakerLine(line.trim());
  return parsed ? parsed.content.trim() : line.trim();
}
