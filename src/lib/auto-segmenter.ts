export type AutoSegmentMode = "conservative" | "balanced" | "detailed";

export interface AutoSegmentDraft {
  createdBy: "auto";
  endTurnIndex?: number;
  sourceTranscriptId: string;
  splittingMode: AutoSegmentMode;
  startTurnIndex?: number;
  text: string;
  title: string;
  wordCount: number;
}

interface TranscriptTurn {
  content: string;
  index: number;
  raw: string;
  speaker: "interviewer" | "participant" | "other";
}

const modeSettings: Record<
  AutoSegmentMode,
  { maxWords: number; minWords: number; targetWords: number }
> = {
  balanced: { maxWords: 360, minWords: 50, targetWords: 220 },
  conservative: { maxWords: 520, minWords: 80, targetWords: 340 },
  detailed: { maxWords: 260, minWords: 40, targetWords: 150 }
};

const interviewerLabels = new Set([
  "interviewer",
  "researcher",
  "moderator",
  "facilitator",
  "i",
  "q",
  "jiawan"
]);

const participantLabels = new Set([
  "participant",
  "interviewee",
  "student",
  "p",
  "a"
]);

const backchannels = new Set([
  "yeah",
  "yes",
  "okay",
  "ok",
  "mm",
  "mm-hm",
  "mhm",
  "right",
  "sure",
  "thank you",
  "thanks",
  "好",
  "好的",
  "嗯",
  "对",
  "谢谢"
]);

const topicMarkerPattern =
  /\b(first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth(?:ly)?|fifth(?:ly)?|finally|overall|another thing|in terms of|when it comes to|the first part|the second part|the third part|the final part|i would describe this in)\b|(?:第\s*(?:[一二三四五六七八九十百两\d]+)\s*(?:个|点|部分|方面|阶段|张|幅)?(?:照片|相片|图片|主题|部分|方面|经历|问题|挑战)?)/iu;

export function autoSplitTranscript(
  transcript: string,
  options: {
    mode?: AutoSegmentMode;
    researchQuestion?: string;
    sourceTranscriptId?: string;
  } = {}
): {
  notice?: string;
  segments: AutoSegmentDraft[];
} {
  const cleaned = normalizeTranscript(transcript);
  const mode = options.mode ?? "balanced";
  const settings = modeSettings[mode];
  const sourceTranscriptId = options.sourceTranscriptId ?? "active-transcript";
  const totalWords = countWords(cleaned);

  if (!cleaned) {
    return { segments: [] };
  }

  const turnSegments = splitByTurns(cleaned, mode);
  let segments =
    turnSegments.length > 1
      ? turnSegments
      : splitByInlineTopicMarkers(cleaned).map((text, index) => ({
          endTurnIndex: index,
          startTurnIndex: index,
          text
        }));

  if (segments.length <= 1 && totalWords > 500) {
    segments = splitByParagraphWordCount(cleaned, mode).map((text, index) => ({
      endTurnIndex: index,
      startTurnIndex: index,
      text
    }));
  }

  if (segments.length <= 1 && totalWords > settings.maxWords) {
    segments = splitBySentenceApproximation(cleaned, mode).map((text, index) => ({
      endTurnIndex: index,
      startTurnIndex: index,
      text
    }));
  }

  const cleanedSegments = mergeTinySegments(segments, mode)
    .flatMap((segment) =>
      countWords(segment.text) > settings.maxWords
        ? splitByParagraphWordCount(segment.text, mode).map((text) => ({
            ...segment,
            text
          }))
        : [segment]
    )
    .map((segment, index) =>
      buildSegment(segment.text, index, {
        endTurnIndex: segment.endTurnIndex,
        mode,
        sourceTranscriptId,
        startTurnIndex: segment.startTurnIndex
      })
    )
    .filter((segment) => segment.text.trim());

  return {
    notice: buildNotice(
      cleanedSegments.length <= 1
        ? "Only one draft segment was generated. The transcript may not contain clear topic boundaries. Use Split segment here or rerun with Detailed mode if the result is too broad."
        : `Draft segments were created using ${mode} topic/interviewer-turn splitting. Auto-generated segments are draft processing chunks, not meaning units.`,
      options.researchQuestion
    ),
    segments: cleanedSegments
  };
}

export function countWords(text: string) {
  const latinWords = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g);
  if (latinWords && latinWords.length > 0) {
    return latinWords.length;
  }

  const cjkCharacters = text.match(/[\u3400-\u9fff]/g);
  if (cjkCharacters && cjkCharacters.length > 0) {
    return Math.ceil(cjkCharacters.length / 2);
  }

  return text.trim() ? 1 : 0;
}

function splitByTurns(transcript: string, mode: AutoSegmentMode) {
  const turns = parseTurns(transcript);
  if (turns.length < 3 || turns.every((turn) => turn.speaker === "other")) {
    return [];
  }

  const segments: Array<{
    endTurnIndex?: number;
    startTurnIndex?: number;
    text: string;
  }> = [];
  let current: TranscriptTurn[] = [];

  turns.forEach((turn, index) => {
    const previous = turns[index - 1];
    const next = turns[index + 1];
    const currentWords = countWords(turnsToText(current));
    const startsTopic =
      isParticipantTopicShift(turn) ||
      (turn.speaker === "interviewer" &&
        isSubstantialInterviewerQuestion(turn.raw) &&
        shouldSplitAtInterviewerTurn(turn, next, currentWords, mode));

    if (current.length > 0 && startsTopic) {
      if (
        turn.speaker === "participant" &&
        previous?.speaker === "interviewer" &&
        current[current.length - 1]?.index === previous.index
      ) {
        const question = current.pop();
        pushTurnSegment(segments, current);
        current = question ? [question, turn] : [turn];
        return;
      }

      pushTurnSegment(segments, current);
      current = [turn];
      return;
    }

    current.push(turn);
  });

  pushTurnSegment(segments, current);
  return segments.filter((segment) => segment.text.trim());
}

function shouldSplitAtInterviewerTurn(
  turn: TranscriptTurn,
  next: TranscriptTurn | undefined,
  currentWords: number,
  mode: AutoSegmentMode
) {
  if (mode === "detailed") {
    return currentWords >= modeSettings.detailed.minWords;
  }

  const questionHasTopicCue = hasTopicCue(turn.content);
  const nextHasTopicCue = next ? hasTopicCue(next.content) : false;
  if (questionHasTopicCue || nextHasTopicCue) {
    return currentWords >= 30;
  }

  return mode === "balanced"
    ? currentWords >= modeSettings.balanced.targetWords
    : currentWords >= modeSettings.conservative.targetWords;
}

function splitByInlineTopicMarkers(transcript: string) {
  const matches = [...transcript.matchAll(new RegExp(topicMarkerPattern, "giu"))]
    .map((match) => ({
      index: match.index ?? -1,
      marker: match[0]
    }))
    .filter((match) => match.index >= 0);

  if (matches.length < 2) {
    return [];
  }

  const segments: string[] = [];
  const intro = transcript.slice(0, matches[0].index).trim();
  if (intro && countWords(intro) >= 30) {
    segments.push(intro);
  }

  matches.forEach((match, index) => {
    const end = matches[index + 1]?.index ?? transcript.length;
    const text = transcript.slice(match.index, end).trim();
    if (text) {
      segments.push(text);
    }
  });

  return segments;
}

function splitByParagraphWordCount(transcript: string, mode: AutoSegmentMode) {
  const settings = modeSettings[mode];
  const paragraphs = transcript
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    return splitBySentenceApproximation(transcript, mode);
  }

  const segments: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  paragraphs.forEach((paragraph) => {
    const paragraphWords = countWords(paragraph);
    const shouldSplit =
      current.length > 0 &&
      currentWords >= settings.minWords &&
      currentWords + paragraphWords > settings.targetWords;

    if (shouldSplit) {
      segments.push(current.join("\n\n").trim());
      current = [];
      currentWords = 0;
    }

    current.push(paragraph);
    currentWords += paragraphWords;
  });

  if (current.length > 0) {
    segments.push(current.join("\n\n").trim());
  }

  return segments;
}

function splitBySentenceApproximation(transcript: string, mode: AutoSegmentMode) {
  const settings = modeSettings[mode];
  const sentences = transcript
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [transcript.trim()];
  }

  const segments: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  sentences.forEach((sentence) => {
    const sentenceWords = countWords(sentence);
    if (
      current.length > 0 &&
      currentWords >= settings.minWords &&
      currentWords + sentenceWords > settings.targetWords
    ) {
      segments.push(current.join(" ").trim());
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += sentenceWords;
  });

  if (current.length > 0) {
    segments.push(current.join(" ").trim());
  }

  return segments;
}

function mergeTinySegments(
  segments: Array<{
    endTurnIndex?: number;
    startTurnIndex?: number;
    text: string;
  }>,
  mode: AutoSegmentMode
) {
  const minWords = modeSettings[mode].minWords;
  const merged: typeof segments = [];

  segments.forEach((segment, index) => {
    const text = segment.text.trim();
    if (!text) {
      return;
    }

    const last = merged[merged.length - 1];
    if (
      last &&
      index > 0 &&
      index < segments.length - 1 &&
      countWords(text) < minWords &&
      !segmentHasBoundaryCue(text)
    ) {
      merged[merged.length - 1] = {
        endTurnIndex: segment.endTurnIndex ?? last.endTurnIndex,
        startTurnIndex: last.startTurnIndex,
        text: `${last.text}\n\n${text}`.trim()
      };
      return;
    }

    merged.push({ ...segment, text });
  });

  return merged;
}

function segmentHasBoundaryCue(text: string) {
  if (hasTopicCue(text)) {
    return true;
  }

  const turns = parseTurns(text);
  return turns.some(
    (turn, index) =>
      turn.speaker === "interviewer" &&
      isSubstantialInterviewerQuestion(turn.raw) &&
      Boolean(turns[index + 1] && hasTopicCue(turns[index + 1].content))
  );
}

function buildSegment(
  text: string,
  index: number,
  options: {
    endTurnIndex?: number;
    mode: AutoSegmentMode;
    sourceTranscriptId: string;
    startTurnIndex?: number;
  }
): AutoSegmentDraft {
  return {
    createdBy: "auto",
    endTurnIndex: options.endTurnIndex,
    sourceTranscriptId: options.sourceTranscriptId,
    splittingMode: options.mode,
    startTurnIndex: options.startTurnIndex,
    text: text.trim(),
    title: buildTitle(text, index),
    wordCount: countWords(text)
  };
}

function buildTitle(text: string, index: number) {
  if (isOverviewSegment(text)) {
    return "Introduction and overview";
  }

  const participantTopicLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => {
      const parsed = parseSpeakerLine(line);
      return parsed && normalizeSpeaker(parsed.label) === "participant" && hasTopicCue(parsed.content);
    });
  const titleSource = participantTopicLine ?? text;
  const keywordTitle = inferTitleFromKeywords(titleSource);
  if (keywordTitle) {
    return keywordTitle;
  }

  const cleaned = stripSpeakerLabel(firstMeaningfulLine(text));
  const topicTitle = extractTopicTitle(titleSource);
  if (topicTitle) {
    return topicTitle;
  }

  const title = cleaned
    .replace(/[?？。.!！]+$/g, "")
    .replace(/^((can|could|would)\s+you\s+)?(tell|say|talk)\s+(me\s+)?(more\s+)?(about\s+)?/i, "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ")
    .slice(0, 80)
    .trim();

  return title || (index === 0 ? "Introduction and overview" : `Segment ${index + 1}`);
}

function isOverviewSegment(text: string) {
  const lower = text.toLowerCase();
  const markerCount = [...lower.matchAll(new RegExp(topicMarkerPattern, "giu"))]
    .length;
  return (
    markerCount >= 3 &&
    /\boverview\b|\boverall\b|four parts|several parts|几个方面|整体/.test(lower)
  );
}

function extractTopicTitle(text: string) {
  const lower = text.toLowerCase();
  const markerMatch = lower.match(topicMarkerPattern);
  if (!markerMatch) {
    return null;
  }

  if (/\boverall\b|\bfinally\b|\bfinal part\b/.test(lower)) {
    return inferTitleFromKeywords(text) ?? "Overall reflection";
  }

  const afterMarker = stripSpeakerLabel(
    text.slice((markerMatch.index ?? 0) + markerMatch[0].length)
  )
    .replace(/^[:,，、.\-\s]+/, "")
    .split(/[.!?。！？\n]/)[0]
    .trim();
  const concise = afterMarker
    .replace(/^(it'?s|this is|this was|i think|i would say)\s+/i, "")
    .split(/\s+/)
    .slice(0, 8)
    .join(" ")
    .replace(/[,:;，；]+$/g, "")
    .trim();

  return titleCase(concise) || inferTitleFromKeywords(text);
}

function inferTitleFromKeywords(text: string) {
  const lower = text.toLowerCase();
  if (/stress|anxiety|worry|react|calm|压力|焦虑|紧张/.test(lower)) {
    return "Stress and anxiety";
  }
  if (/concentration|focus|study|reading|task|distraction|注意|学习|专注|阅读/.test(lower)) {
    return "Concentration and study habits";
  }
  if (/self-awareness|self awareness|self-compassion|self compassion|self-critic|ask for help|自我觉察|自我关怀|自责/.test(lower)) {
    return "Self-awareness and self-compassion";
  }
  if (/limit|challenge|difficult|recommend|magic solution|uncomfortable|impatient|限制|挑战|困难|建议/.test(lower)) {
    return "Limits and challenges";
  }
  if (/overall|summary|in general|总的|总体|整体/.test(lower)) {
    return "Overall reflection";
  }
  if (/introduc|overview|first started|开始|整体/.test(lower)) {
    return "Introduction and overview";
  }
  return null;
}

function parseTurns(transcript: string): TranscriptTurn[] {
  return transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parsed = parseSpeakerLine(line);
      if (!parsed) {
        return {
          content: line,
          index,
          raw: line,
          speaker: "other" as const
        };
      }

      return {
        content: parsed.content,
        index,
        raw: line,
        speaker: normalizeSpeaker(parsed.label)
      };
    });
}

function pushTurnSegment(
  segments: Array<{
    endTurnIndex?: number;
    startTurnIndex?: number;
    text: string;
  }>,
  turns: TranscriptTurn[]
) {
  if (turns.length === 0) {
    return;
  }
  segments.push({
    endTurnIndex: turns[turns.length - 1].index,
    startTurnIndex: turns[0].index,
    text: turnsToText(turns)
  });
}

function turnsToText(turns: TranscriptTurn[]) {
  return turns.map((turn) => turn.raw).join("\n").trim();
}

function normalizeSpeaker(label: string): TranscriptTurn["speaker"] {
  const normalized = label.trim().toLowerCase();
  if (interviewerLabels.has(normalized)) {
    return "interviewer";
  }
  if (participantLabels.has(normalized)) {
    return "participant";
  }
  return "other";
}

function isParticipantTopicShift(turn: TranscriptTurn) {
  return turn.speaker !== "interviewer" && hasTopicCue(turn.content);
}

function hasTopicCue(text: string) {
  return topicMarkerPattern.test(text);
}

function firstMeaningfulLine(text: string) {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => stripSpeakerLabel(line).length > 0) ?? ""
  );
}

function isSubstantialInterviewerQuestion(line: string) {
  const parsed = parseSpeakerLine(line);
  if (!parsed || !interviewerLabels.has(parsed.label)) {
    return false;
  }

  const content = parsed.content.toLowerCase().trim();
  if (!content || backchannels.has(content.replace(/[.!?。！？]/g, ""))) {
    return false;
  }

  return /[?？]/.test(content) || countWords(content) >= 5;
}

function parseSpeakerLine(line: string) {
  const match = line.match(/^([\p{L}][\p{L}\s.'-]{0,32}|[IQPA])\s*[:：]\s*(.*)$/u);
  if (!match) {
    return null;
  }
  return {
    content: match[2] ?? "",
    label: (match[1] ?? "").trim().toLowerCase()
  };
}

function stripSpeakerLabel(line: string) {
  return line.replace(/^([\p{L}][\p{L}\s.'-]{0,32}|[IQPA])\s*[:：]\s*/u, "").trim();
}

function normalizeTranscript(transcript: string) {
  return transcript.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function titleCase(value: string) {
  if (!value) {
    return "";
  }
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (letter) => letter.toUpperCase())
    .slice(0, 80);
}

function buildNotice(notice: string, researchQuestion?: string) {
  const question = researchQuestion?.trim();
  if (!question) {
    return `${notice} If the auto-split result is too broad, use Split segment here or rerun with Detailed mode.`;
  }

  return `${notice} Review the draft boundaries against the research question: ${question}. If the auto-split result is too broad, use Split segment here or rerun with Detailed mode.`;
}
