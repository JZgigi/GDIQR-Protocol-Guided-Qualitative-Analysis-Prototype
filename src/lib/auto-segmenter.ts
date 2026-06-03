export interface AutoSegmentDraft {
  text: string;
  title: string;
  wordCount: number;
}

const targetWords = 900;
const minWords = 250;
const maxWords = 1200;
const shortTranscriptWords = 700;

const interviewerLabels = new Set([
  "interviewer",
  "researcher",
  "moderator",
  "i",
  "q",
  "jiawan"
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

export function autoSplitTranscript(
  transcript: string,
  options: { researchQuestion?: string } = {}
): {
  notice?: string;
  segments: AutoSegmentDraft[];
} {
  const cleaned = normalizeTranscript(transcript);
  const totalWords = countWords(cleaned);
  const topicMarkerSplit = splitByTopicMarkers(cleaned);

  if (topicMarkerSplit.length > 1) {
    return {
      notice: buildNotice(
        `Draft segments were created from explicit topic markers such as photo/order labels.`,
        options.researchQuestion
      ),
      segments: topicMarkerSplit.map(buildSegment).filter((segment) => segment.text.trim())
    };
  }

  if (totalWords < shortTranscriptWords) {
    return {
      notice: buildNotice(
        "This transcript is short and no clear topic markers were found, so it has been kept as one segment. You can still split it manually if needed.",
        options.researchQuestion
      ),
      segments: [buildSegment(cleaned, 0)]
    };
  }

  const speakerSplit = splitByInterviewerQuestions(cleaned);
  const roughSegments =
    speakerSplit.length > 1 ? speakerSplit : splitByParagraphWordCount(cleaned);
  const segments = roughSegments
    .flatMap((segment) =>
      countWords(segment) > maxWords
        ? splitByParagraphWordCount(segment)
        : [segment]
    )
    .map(buildSegment)
    .filter((segment) => segment.text.trim());

  return {
    notice:
      segments.length <= 1
        ? buildNotice(
            "Only one segment was generated. The transcript may not contain clear split points. You can manually split the segment if needed.",
            options.researchQuestion
          )
        : undefined,
    segments
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

function splitByInterviewerQuestions(transcript: string) {
  const lines = transcript.split("\n").map((line) => line.trim()).filter(Boolean);
  const segments: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (isSubstantialInterviewerQuestion(line) && current.length > 0) {
      segments.push(current.join("\n").trim());
      current = [line];
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    segments.push(current.join("\n").trim());
  }

  return mergeVeryShortSegments(segments);
}

function splitByTopicMarkers(transcript: string) {
  const markerPattern =
    /((?:第\s*(?:[一二三四五六七八九十百两\d]+)\s*(?:张|幅|个|组|段|部分)?\s*(?:照片|相片|图片|图像|图|主题|部分|片段|故事|经历|事件))|(?:(?:photo|picture|image|segment|part|topic)\s*(?:#?\s*)?\d+)|(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:photo|picture|image|segment|part|topic)))/giu;
  const matches = [...transcript.matchAll(markerPattern)]
    .map((match) => {
      const fullMatch = match[0] ?? "";
      const marker = match[1] ?? "";
      const markerOffset = fullMatch.indexOf(marker);
      return {
        index: match.index === undefined ? -1 : match.index + Math.max(markerOffset, 0),
        marker
      };
    })
    .filter((match) => match.index >= 0);

  if (matches.length < 2) {
    return [];
  }

  const intro = transcript.slice(0, matches[0].index).trim();
  const segments: string[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? transcript.length;
    const text = transcript.slice(start, end).trim();
    if (text) {
      if (index === 0 && intro && countWords(intro) <= 120) {
        segments.push(`${intro}\n\n${text}`.trim());
      } else {
        segments.push(text);
      }
    }
  }

  return segments;
}

function splitByParagraphWordCount(transcript: string) {
  const paragraphs = transcript
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    return splitBySentenceApproximation(transcript);
  }

  const segments: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph);
    const shouldSplit =
      current.length > 0 &&
      currentWords >= minWords &&
      currentWords + paragraphWords > targetWords;

    if (shouldSplit) {
      segments.push(current.join("\n\n").trim());
      current = [];
      currentWords = 0;
    }

    current.push(paragraph);
    currentWords += paragraphWords;
  }

  if (current.length > 0) {
    segments.push(current.join("\n\n").trim());
  }

  return mergeVeryShortSegments(segments);
}

function splitBySentenceApproximation(transcript: string) {
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

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence);
    if (currentWords >= minWords && currentWords + sentenceWords > targetWords) {
      segments.push(current.join(" ").trim());
      current = [];
      currentWords = 0;
    }
    current.push(sentence);
    currentWords += sentenceWords;
  }

  if (current.length > 0) {
    segments.push(current.join(" ").trim());
  }

  return mergeVeryShortSegments(segments);
}

function mergeVeryShortSegments(segments: string[]) {
  const merged: string[] = [];

  for (const segment of segments.filter(Boolean)) {
    const last = merged[merged.length - 1];
    if (last && countWords(segment) < minWords) {
      merged[merged.length - 1] = `${last}\n\n${segment}`.trim();
    } else {
      merged.push(segment);
    }
  }

  return merged;
}

function buildSegment(text: string, index: number): AutoSegmentDraft {
  return {
    text: text.trim(),
    title: buildTitle(text, index),
    wordCount: countWords(text)
  };
}

function buildTitle(text: string, index: number) {
  const topicMarkerTitle = extractTopicMarkerTitle(text);
  if (topicMarkerTitle) {
    return topicMarkerTitle;
  }

  const questionLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => isSubstantialInterviewerQuestion(line));
  const source = stripSpeakerLabel(questionLine ?? firstMeaningfulLine(text));
  const title = source
    .replace(/[?？。.!！]+$/g, "")
    .split(/\s+/)
    .slice(0, 10)
    .join(" ")
    .slice(0, 90)
    .trim();

  return title || `Auto-generated segment ${index + 1}`;
}

function extractTopicMarkerTitle(text: string) {
  const match = text.match(
    /((?:第\s*(?:[一二三四五六七八九十百两\d]+)\s*(?:张|幅|个|组|段|部分)?\s*(?:照片|相片|图片|图像|图|主题|部分|片段|故事|经历|事件))|(?:(?:photo|picture|image|segment|part|topic)\s*(?:#?\s*)?\d+)|(?:(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:photo|picture|image|segment|part|topic)))/iu
  );
  return match?.[1]?.replace(/\s+/g, "").slice(0, 90) ?? "";
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
  const match = line.match(/^([\p{L}][\p{L}\s.'-]{0,24}|[IQPA])\s*[:：]\s*(.*)$/u);
  if (!match) {
    return null;
  }
  return {
    content: match[2] ?? "",
    label: (match[1] ?? "").trim().toLowerCase()
  };
}

function stripSpeakerLabel(line: string) {
  return line.replace(/^([\p{L}][\p{L}\s.'-]{0,24}|[IQPA])\s*[:：]\s*/u, "").trim();
}

function normalizeTranscript(transcript: string) {
  return transcript.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildNotice(notice: string, researchQuestion?: string) {
  const question = researchQuestion?.trim();
  if (!question) {
    return notice;
  }

  return `${notice} Review the draft boundaries against the research question: ${question}`;
}
