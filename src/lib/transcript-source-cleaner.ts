import type { Project } from "@/lib/types";

const SPEAKER_LINE_PATTERN =
  /^(interviewer|researcher|moderator|facilitator|participant|interviewee|student|therapist|client|[IQPA])\s*[:：]/i;

const NON_TRANSCRIPT_PATTERNS = [
  /\bproject\s+title\b/i,
  /\bresearch\s+question\b/i,
  /\bstudy\s+description\b/i,
  /\bdomains?\s+of\s+investigation\b/i,
  /\bdemo\s+project\b/i,
  /\bgdi-?qr\s+prototype\b/i,
  /\bgdi-?qr\s+guided\s+qualitative\s+analysis\b/i,
  /\bproject\s+setup\b/i,
  /\bupload(ed)?\s+(file|transcript|audio)\b/i,
  /\bfile\s*name\b/i,
  /\.(docx|pdf|txt|rtf|m4a|mp3|wav|mp4)\b/i
];

const METADATA_HEADING_PATTERN =
  /^(project\s+title|research\s+question|study\s+description|domains?\s+of\s+investigation|project\s+setup|demo\s+metadata|upload\s+details|file\s+name)\s*:?$/i;

const TRANSCRIPT_START_PATTERN =
  /^(transcript|interview\s+transcript|interview\s+excerpt|participant\s+account)\s*:?$/i;

export interface CleanTranscriptSourceResult {
  removedLineCount: number;
  transcript: string;
}

export function cleanTranscriptSourceForAnalysis(
  transcript: string,
  project?: Pick<Project, "researchQuestion" | "studyDescription" | "title">
): CleanTranscriptSourceResult {
  const lines = transcript
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const firstSpeakerIndex = lines.findIndex((line) =>
    SPEAKER_LINE_PATTERN.test(line.trim())
  );
  const hasMetadataBeforeSpeaker =
    firstSpeakerIndex > 0 &&
    lines
      .slice(0, firstSpeakerIndex)
      .some((line) => isNonTranscriptLine(line, project));
  const sourceLines = hasMetadataBeforeSpeaker
    ? lines.slice(firstSpeakerIndex)
    : lines;
  let removedLineCount = hasMetadataBeforeSpeaker ? firstSpeakerIndex : 0;
  const cleaned: string[] = [];
  let skippingMetadataBlock = false;

  for (const line of sourceLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      skippingMetadataBlock = false;
      if (cleaned[cleaned.length - 1] !== "") {
        cleaned.push("");
      }
      continue;
    }
    if (SPEAKER_LINE_PATTERN.test(trimmed)) {
      skippingMetadataBlock = false;
    }
    if (TRANSCRIPT_START_PATTERN.test(trimmed)) {
      removedLineCount += 1;
      continue;
    }
    if (METADATA_HEADING_PATTERN.test(trimmed)) {
      skippingMetadataBlock = true;
      removedLineCount += 1;
      continue;
    }
    if (skippingMetadataBlock && !SPEAKER_LINE_PATTERN.test(trimmed)) {
      removedLineCount += 1;
      continue;
    }
    if (isNonTranscriptLine(trimmed, project)) {
      removedLineCount += 1;
      continue;
    }
    cleaned.push(line.trim());
  }

  return {
    removedLineCount,
    transcript: cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim()
  };
}

export function containsNonTranscriptMaterial(
  text: string,
  project?: Pick<Project, "researchQuestion" | "studyDescription" | "title">
) {
  return isNonTranscriptLine(text, project);
}

function isNonTranscriptLine(
  line: string,
  project?: Pick<Project, "researchQuestion" | "studyDescription" | "title">
) {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  if (NON_TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return [project?.title, project?.researchQuestion, project?.studyDescription]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => textLooksLikeMetadataValue(normalized, value));
}

function textLooksLikeMetadataValue(line: string, metadataValue: string) {
  const normalizedLine = normalizeForComparison(line);
  const normalizedValue = normalizeForComparison(metadataValue);
  if (!normalizedLine || !normalizedValue || normalizedValue.length < 16) {
    return false;
  }
  return (
    normalizedLine === normalizedValue ||
    normalizedLine.includes(normalizedValue) ||
    normalizedValue.includes(normalizedLine)
  );
}

function normalizeForComparison(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
