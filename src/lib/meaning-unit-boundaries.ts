import { parseSpeakerLine } from "./transcript-speakers";

export function countMeaningWords(text: string) {
  const latinWords = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g);
  if (latinWords?.length) {
    return latinWords.length;
  }
  const cjkCharacters = text.match(/[\u3400-\u9fff]/g);
  if (cjkCharacters?.length) {
    return Math.ceil(cjkCharacters.length / 2);
  }
  return text.trim() ? 1 : 0;
}

export function splitParticipantTurnConservatively(
  turn: string,
  maxChars = 1800
) {
  const lines = turn.split("\n");
  const parsed = parseSpeakerLine(lines[0] ?? turn);
  const label = parsed?.label || "Participant";
  const content = parsed
    ? [parsed.content, ...lines.slice(1)].join("\n").trim()
    : turn.trim();

  if (
    countMeaningWords(content) <= 280 &&
    turn.length <= Math.max(maxChars, 1800)
  ) {
    return [turn.trim()];
  }

  const paragraphs = content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const source = paragraphs.length > 1 ? paragraphs : splitSentences(content);
  const explicitShift =
    /^(first(?:ly)?|second(?:ly)?|third(?:ly)?|finally|another thing|in terms of|when it comes to|第[一二三四五六七八九十\d]+|另外|然后说到|至于)/iu;
  const groups: string[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const item of source) {
    const itemWords = countMeaningWords(item);
    const clearShift = explicitShift.test(item.trim());
    if (
      current.length > 0 &&
      currentWords >= 120 &&
      (clearShift || currentWords + itemWords > 240)
    ) {
      groups.push(current.join(" ").trim());
      current = [];
      currentWords = 0;
    }
    current.push(item);
    currentWords += itemWords;
  }

  if (current.length > 0) {
    groups.push(current.join(" ").trim());
  }

  return groups.filter(Boolean).map((text) => `${label}: ${text}`);
}

function splitSentences(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length > 1 ? sentences : [normalized];
}
