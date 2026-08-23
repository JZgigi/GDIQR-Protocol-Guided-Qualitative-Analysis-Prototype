export type TranscriptSpeakerRole =
  | "facilitator"
  | "interviewer"
  | "participant"
  | "unclear";

export interface ParsedTranscriptTurn {
  content: string;
  endLine: number;
  label: string;
  raw: string;
  role: TranscriptSpeakerRole;
  startLine: number;
  turnIndex: number;
}

export interface SpeakerRoleAliases {
  facilitator?: string[];
  interviewer?: string[];
  participant?: string[];
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
  label: string,
  aliases: SpeakerRoleAliases = {},
): TranscriptSpeakerRole {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
  const base = normalized.replace(/\s+[a-z]?\d+$/i, "").trim();
  const configuredRole = (
    ["facilitator", "interviewer", "participant"] as const
  ).find((role) =>
    (aliases[role] ?? []).some((alias) => {
      const normalizedAlias = alias.trim().toLowerCase();
      return normalized === normalizedAlias || base === normalizedAlias;
    }),
  );
  if (configuredRole) {
    return configuredRole;
  }
  if (
    base === "facilitator" ||
    base === "moderator" ||
    base === "主持人"
  ) {
    return "facilitator";
  }
  if (interviewerAliases.has(base)) {
    return "interviewer";
  }
  if (
    participantAliases.has(base) ||
    /^(?:p|participant|interviewee|respondent|student)\s*[a-z]?\d+$/i.test(
      normalized,
    )
  ) {
    return "participant";
  }
  return "unclear";
}

export function parseSpeakerLine(line: string, aliases: SpeakerRoleAliases = {}) {
  const match = line.match(speakerLabelPattern);
  if (!match) {
    return null;
  }
  const label = (match[1] ?? "").trim();
  return {
    content: match[2] ?? "",
    label,
    role: normalizeTranscriptSpeakerRole(label, aliases)
  };
}

export function splitTranscriptIntoSpeakerTurns(
  transcript: string,
  aliases: SpeakerRoleAliases = {},
): ParsedTranscriptTurn[] {
  const lines = transcript.replace(/\r\n/g, "\n").split("\n");
  const turns: ParsedTranscriptTurn[] = [];
  let pendingSpeaker: ReturnType<typeof parseSpeakerLine> = null;

  for (const [lineIndex, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const parsed = parseSpeakerLine(line, aliases);
    if (parsed) {
      const nestedSpeaker = parseSpeakerLine(parsed.content.trim(), aliases);
      if (nestedSpeaker && nestedSpeaker.role !== "unclear") {
        pendingSpeaker = nestedSpeaker;
        if (!nestedSpeaker.content.trim()) {
          continue;
        }
      }
      const effectiveSpeaker =
        nestedSpeaker && nestedSpeaker.role !== "unclear"
          ? nestedSpeaker
          : pendingSpeaker ?? parsed;
      const effectiveContent =
        nestedSpeaker && nestedSpeaker.role !== "unclear"
          ? nestedSpeaker.content.trim()
          : parsed.content.trim();
      turns.push({
        content: effectiveContent,
        endLine: lineIndex + 1,
        label: effectiveSpeaker.label,
        raw: effectiveContent
          ? `${effectiveSpeaker.label}: ${effectiveContent}`
          : `${effectiveSpeaker.label}:`,
        role: effectiveSpeaker.role,
        startLine: lineIndex + 1,
        turnIndex: turns.length,
      });
      pendingSpeaker = null;
      continue;
    }

    const previous = turns[turns.length - 1];
    if (previous) {
      previous.content = `${previous.content}\n${line}`.trim();
      previous.raw = `${previous.raw}\n${line}`.trim();
      previous.endLine = lineIndex + 1;
    } else {
      turns.push({
        content: line,
        endLine: lineIndex + 1,
        label: "Unclear speaker",
        raw: line,
        role: "unclear",
        startLine: lineIndex + 1,
        turnIndex: turns.length,
      });
    }
  }

  return repairWrappedMidWordContinuations(turns);
}

function repairWrappedMidWordContinuations(turns: ParsedTranscriptTurn[]) {
  const repaired: ParsedTranscriptTurn[] = [];
  for (const turn of turns) {
    const previous = repaired[repaired.length - 1];
    const previousTail = previous?.content.match(/([\p{Ll}]{1,4})$/u)?.[1];
    const currentHead = turn.content.match(/^([\p{Ll}]{2,12})/u)?.[1];
    const isRoleWrappedWordFragment =
      previous?.role === "participant" &&
      (turn.role === "facilitator" || turn.role === "interviewer") &&
      Boolean(previousTail && currentHead);

    if (previous && isRoleWrappedWordFragment) {
      previous.content = `${previous.content}${turn.content}`;
      previous.raw = `${previous.label}: ${previous.content}`;
      previous.endLine = turn.endLine;
      continue;
    }

    repaired.push({ ...turn, turnIndex: repaired.length });
  }
  return repaired;
}

export function stripSpeakerLabel(line: string) {
  const parsed = parseSpeakerLine(line.trim());
  return parsed ? parsed.content.trim() : line.trim();
}
