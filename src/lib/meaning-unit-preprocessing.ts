import type {
  MeaningUnit,
  MeaningUnitClassification,
  Project,
} from "@/lib/types";
import {
  splitTranscriptIntoSpeakerTurns,
  type ParsedTranscriptTurn,
  type SpeakerRoleAliases,
} from "@/lib/transcript-speakers";
import {
  OPENING_BACKGROUND_REVIEW_WARNING,
} from "@/lib/meaning-unit-review-flags";

export interface ClassifiedTranscriptTurn extends ParsedTranscriptTurn {
  classification: MeaningUnitClassification;
  classificationReason: string;
  id: string;
}

export interface SemanticAnalysisWindow {
  contextTurns: ClassifiedTranscriptTurn[];
  participantTurns: ClassifiedTranscriptTurn[];
  promptText: string;
  turns: ClassifiedTranscriptTurn[];
}

const housekeepingPattern = new RegExp(
  [
    "confidential",
    "consent",
    "record(?:ing)?",
    "ground rules?",
    "housekeeping",
    "zoom",
    "microphone",
    "camera",
    "connection",
    "break arrangements?",
    "take a break",
    "hello everyone",
    "welcome everyone",
    "can (?:you|everyone) hear",
    "保密",
    "同意",
    "录音",
    "麦克风",
    "摄像头",
    "网络",
    "休息",
    "大家好",
    "欢迎",
  ].join("|"),
  "iu",
);

const participantSmallTalkPattern = new RegExp(
  [
    "^(?:hi|hello|hey|thanks?|thank you|good morning|good afternoon)[.! ]*$",
    "^(?:你好|大家好|谢谢|早上好|下午好)[。！ ]*$",
  ].join("|"),
  "iu",
);

const openingPhaseStartPattern = new RegExp(
  [
    "break the ice",
    "ice[ -]?breaker",
    "get to know (?:one another|each other|everyone|you)",
    "introduc(?:e|ing|tion)(?: ourselves| yourselves| yourself| each other)?",
    "share (?:your|their) name",
    "tell us (?:your name|a little about yourself)",
    "before (?:we )?(?:begin|start).{0,50}(?:introduc|name)",
    "warm[ -]?up",
    "破冰",
    "自我介绍",
    "互相认识",
    "先介绍一下",
  ].join("|"),
  "iu",
);

const participantSelfIntroductionPattern = new RegExp(
  [
    "\\bmy name is\\b",
    "\\bi(?:'m| am) .{0,35}(?:student|researcher|studying|from)\\b",
    "\\bi (?:study|studied|come from|am from)\\b",
    "我叫",
    "我的名字",
    "我来自",
    "我是.{0,12}(?:学生|博士|研究生)",
  ].join("|"),
  "iu",
);

const openingPhaseContinuationPattern = new RegExp(
  [
    "introduc",
    "your name",
    "about yourself",
    "your background",
    "where (?:are you|you are) from",
    "what (?:are you|you are) studying",
    "one thing",
    "enjoy",
    "challeng",
    "who (?:would like|wants) to start",
    "would anyone like to start",
    "anyone else",
    "who(?:'s| is) next",
    "thank you",
    "nice to meet",
    "could you say more",
    "what do you mean",
    "自我介绍",
    "你的名字",
    "你的背景",
    "来自哪里",
    "谁先开始",
    "下一位",
    "谢谢",
  ].join("|"),
  "iu",
);

const formalQuestionTransitionPattern = new RegExp(
  [
    "(?:first|next|main|formal|research) (?:question|topic)",
    "(?:move|moving) (?:on|into|to)",
    "now (?:i|we)(?:'d| would) like to (?:ask|discuss|talk)",
    "let(?:'s| us) (?:begin|start) (?:with )?(?:the )?(?:first|main)",
    "turn to (?:the|our) (?:first|main|next)",
    "进入.{0,8}(?:正式|第一个|主要)(?:问题|话题)",
    "第一个正式问题",
    "接下来.{0,8}(?:问题|话题)",
  ].join("|"),
  "iu",
);

export function preprocessTranscriptForMeaningUnits(
  transcript: string,
  project?: Pick<Project, "metadata" | "researchQuestion">,
) {
  const aliases = readSpeakerRoleAliases(project?.metadata?.speakerRoleAliases);
  const classified = splitTranscriptIntoSpeakerTurns(transcript, aliases).map((turn) => {
    const { classification, reason } = classifyTurn(turn);
    return {
      ...turn,
      classification,
      classificationReason: reason,
      id: `TURN-${String(turn.turnIndex + 1).padStart(4, "0")}`,
    } satisfies ClassifiedTranscriptTurn;
  });
  return markOpeningBackgroundCandidates(classified);
}

function readSpeakerRoleAliases(value: unknown): SpeakerRoleAliases {
  if (!value || typeof value !== "object") {
    return {};
  }
  const candidate = value as Record<string, unknown>;
  const values = (key: string) =>
    Array.isArray(candidate[key])
      ? candidate[key].filter((item): item is string => typeof item === "string")
      : undefined;
  return {
    facilitator: values("facilitator"),
    interviewer: values("interviewer"),
    participant: values("participant"),
  };
}

export function buildSemanticAnalysisWindows(
  turns: ClassifiedTranscriptTurn[],
  maxChars = 6000,
) {
  const windows: SemanticAnalysisWindow[] = [];
  let current: ClassifiedTranscriptTurn[] = [];
  let currentParticipant = "";
  let pendingContext: ClassifiedTranscriptTurn[] = [];

  const flush = () => {
    if (!current.some(isParticipantAnalysisCandidate)) {
      return;
    }
    windows.push(toSemanticWindow(current));
    pendingContext = trailingContextTurns(current).slice(-3);
    current = [];
    currentParticipant = "";
  };

  for (const turn of turns) {
    if (turn.role !== "participant" && turn.classification === "non_analytic") {
      continue;
    }
    if (!isParticipantAnalysisCandidate(turn)) {
      if (current.length > 0) {
        current.push(turn);
      } else {
        pendingContext = [...pendingContext, turn].slice(-3);
      }
      continue;
    }

    const participantKey = turn.label.trim().toLocaleLowerCase();
    const candidateLength =
      current.reduce((total, item) => total + item.raw.length, 0) +
      turn.raw.length;
    if (
      current.length > 0 &&
      (participantKey !== currentParticipant || candidateLength > maxChars)
    ) {
      flush();
    }
    if (current.length === 0) {
      current = [...pendingContext];
      pendingContext = [];
      currentParticipant = participantKey;
    }
    current.push(turn);
  }
  flush();
  return windows;
}

function trailingContextTurns(turns: ClassifiedTranscriptTurn[]) {
  const context: ClassifiedTranscriptTurn[] = [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || isParticipantAnalysisCandidate(turn)) {
      break;
    }
    if (turn.classification === "context_only") {
      context.unshift(turn);
    }
  }
  return context;
}

export function contextForSourceTurns(
  sourceTurnIds: string[],
  turns: ClassifiedTranscriptTurn[],
) {
  const indexes = sourceTurnIds
    .map((id) => turns.findIndex((turn) => turn.id === id))
    .filter((index) => index >= 0);
  const firstIndex = indexes.length > 0 ? Math.min(...indexes) : -1;
  const lastIndex = indexes.length > 0 ? Math.max(...indexes) : -1;
  if (firstIndex < 0) {
    return "";
  }
  return turns
    .slice(Math.max(0, firstIndex - 3), lastIndex + 1)
    .filter((turn) => turn.classification === "context_only")
    .slice(-3)
    .map((turn) => `${turn.label}: ${turn.content}`)
    .join("\n");
}

export function reviewerWarningsForMeaningUnit(unit: MeaningUnit) {
  const warnings = new Set(unit.reviewerWarnings ?? []);
  const excerpt = unit.excerpt.trim();
  const summary = (unit.humanSummary || unit.aiSummary).trim();
  const words = approximateWords(excerpt);
  const facilitatorLabel =
    /(?:^|\n)\s*(?:facilitator|moderator|interviewer|researcher)(?:\s+[a-z]?\d+)?\s*[:：]/iu;

  if (
    unit.classification === "substantive_participant" &&
    unit.speakerRole !== "participant"
  ) {
    warnings.add(
      "Speaker-role error: this item is not clearly participant speech and may not represent participant meaning.",
    );
  }
  if (unit.classification === "substantive_participant" && !summary) {
    warnings.add(
      "Summary missing: the AI did not produce a safe concise summary; researcher wording is required before acceptance.",
    );
  }
  if (facilitatorLabel.test(excerpt)) {
    warnings.add(
      "Mixed-role contamination: facilitator wording may be combined with participant data.",
    );
  }
  if (summary && summaryIsExtractive(summary, excerpt)) {
    warnings.add(
      "Summary too extractive: the summary appears too close to the source excerpt.",
    );
  }
  if (summary && summaryMayBeInterpretive(summary, excerpt)) {
    warnings.add(
      "Summary too interpretive: the summary may introduce concepts not clearly supported by the source excerpt.",
    );
  }
  if (
    words > 100 ||
    (words > 42 &&
      /\b(?:also|but|however|although|another thing|on the other hand|separately|secondly|finally|at first|initially|later|now|still|used to|i (?:also )?(?:want|wish|hope))\b|(?:另外|但是|不过|虽然|另一方面|其次|最后|起初|后来|现在|仍然|我希望|我想)/iu.test(
        excerpt,
      ))
  ) {
    warnings.add(
      "Possible multiple meanings: review whether this item needs splitting.",
    );
  }
  if (words > 0 && words < 6) {
    warnings.add(
      "Possible fragmentation: this item may need merging with adjacent participant material.",
    );
  }
  if (
    !unit.contextExcerpt &&
    /^(?:yes|no|maybe|because|and|but|it|that|this|是的|不是|因为|但是|这个|那个)\b/iu.test(
      excerpt,
    )
  ) {
    warnings.add(
      "Missing context: the response may require the preceding question or probe for interpretation.",
    );
  }
  return [...warnings];
}

export function addCrossUnitBoundaryWarnings(
  units: MeaningUnit[],
  turns: ClassifiedTranscriptTurn[],
) {
  const turnOrder = new Map(turns.map((turn, index) => [turn.id, index]));
  const ordered = units
    .filter((unit) => unit.classification === "substantive_participant")
    .map((unit) => ({
      first: Math.min(
        ...(unit.sourceTurnIds ?? []).map(
          (id) => turnOrder.get(id) ?? Number.MAX_SAFE_INTEGER,
        ),
      ),
      last: Math.max(
        ...(unit.sourceTurnIds ?? []).map((id) => turnOrder.get(id) ?? -1),
      ),
      unit,
    }))
    .sort((left, right) => left.first - right.first || left.unit.number - right.unit.number);

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const differentSourceTurns =
      !(previous.unit.sourceTurnIds ?? []).some((id) =>
        (current.unit.sourceTurnIds ?? []).includes(id),
      );
    const sameParticipant =
      previous.unit.speaker.trim().toLowerCase() ===
      current.unit.speaker.trim().toLowerCase();
    const shortProbeGap =
      current.first > previous.last && current.first - previous.last <= 2;
    if (!differentSourceTurns || !sameParticipant || !shortProbeGap) {
      continue;
    }
    const warning =
      "Possible fragmentation: adjacent units from the same participant are separated by only a short facilitator probe; review whether the later turn elaborates the earlier meaning.";
    previous.unit.reviewerWarnings = [
      ...new Set([...(previous.unit.reviewerWarnings ?? []), warning]),
    ];
    current.unit.reviewerWarnings = [
      ...new Set([...(current.unit.reviewerWarnings ?? []), warning]),
    ];
    previous.unit.reviewerStatus = "Warning";
    current.unit.reviewerStatus = "Warning";
  }
  return units;
}

function classifyTurn(turn: ParsedTranscriptTurn) {
  const content = turn.content.trim();
  if (turn.role === "participant") {
    if (!content || participantSmallTalkPattern.test(content)) {
      return {
        classification: "non_analytic" as const,
        reason: "Participant greeting, acknowledgement, or non-analytic small talk.",
      };
    }
    return {
      classification: "substantive_participant" as const,
      reason: "Participant material eligible for research-question-guided semantic delineation.",
    };
  }
  if (turn.role === "facilitator" || turn.role === "interviewer") {
    if (housekeepingPattern.test(content)) {
      return {
        classification: "non_analytic" as const,
        reason: "Facilitator/interviewer housekeeping or procedural material.",
      };
    }
    return {
      classification: "context_only" as const,
      reason: "Facilitator/interviewer question, probe, paraphrase, or transition retained as context.",
    };
  }
  return {
    classification: "uncertain" as const,
    reason: "Speaker role is unclear; researcher confirmation is required.",
  };
}

function markOpeningBackgroundCandidates(turns: ClassifiedTranscriptTurn[]) {
  let inOpeningPhase = false;
  let openingPhaseCompleted = false;
  let openingParticipantSeen = false;
  const startSearchLimit = Math.max(12, Math.ceil(turns.length * 0.25));

  return turns.map((turn) => {
    const content = turn.content.trim();
    const eligibleForOpeningStart = turn.turnIndex < startSearchLimit;
    if (
      !inOpeningPhase &&
      !openingPhaseCompleted &&
      eligibleForOpeningStart &&
      (((turn.role === "facilitator" || turn.role === "interviewer") &&
        openingPhaseStartPattern.test(content)) ||
        (turn.role === "participant" &&
          participantSelfIntroductionPattern.test(content)))
    ) {
      inOpeningPhase = true;
    }

    if (
      inOpeningPhase &&
      openingParticipantSeen &&
      (turn.role === "facilitator" || turn.role === "interviewer") &&
      (formalQuestionTransitionPattern.test(content) ||
        (!openingPhaseContinuationPattern.test(content) &&
          looksLikeQuestion(content)))
    ) {
      inOpeningPhase = false;
      openingPhaseCompleted = true;
    }

    if (inOpeningPhase && turn.role === "participant" && content) {
      openingParticipantSeen = true;
      return {
        ...turn,
        classificationReason:
          "Participant material from a likely opening/icebreaker phase before the first formal research question; retain as a reviewable MU candidate and suggest researcher relevance review.",
      };
    }
    return turn;
  });
}

export function isOpeningBackgroundTurn(turn: ClassifiedTranscriptTurn) {
  return turn.classificationReason.startsWith(
    "Participant material from a likely opening/icebreaker phase",
  );
}

function looksLikeQuestion(content: string) {
  return (
    /[?？]\s*$/u.test(content) ||
    /^(?:what|how|why|when|where|which|could you|can you|would you|tell (?:me|us)|thinking about)\b|^(?:什么|如何|为什么|何时|哪里|哪一个|能否|可以|请谈谈)/iu.test(
      content.trim(),
    )
  );
}

function isParticipantAnalysisCandidate(turn: ClassifiedTranscriptTurn) {
  return turn.role === "participant" && Boolean(turn.content.trim());
}

function toSemanticWindow(turns: ClassifiedTranscriptTurn[]) {
  const participantTurns = turns.filter(isParticipantAnalysisCandidate);
  const contextTurns = turns.filter(
    (turn) => turn.classification === "context_only",
  );
  const promptText = turns
    .map((turn) => {
      const section = isParticipantAnalysisCandidate(turn)
        ? isOpeningBackgroundTurn(turn)
          ? "PARTICIPANT MATERIAL TO ANALYSE — OPENING/BACKGROUND SUGGESTION"
          : "PARTICIPANT MATERIAL TO ANALYSE"
        : "CONTEXT — DO NOT ANALYSE AS PARTICIPANT SPEECH";
      return `${turn.id} [${section}] [${turn.label}]\n${turn.content}`;
    })
    .join("\n\n");
  return { contextTurns, participantTurns, promptText, turns };
}

function approximateWords(text: string) {
  const latin = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)?/g);
  if (latin?.length) {
    return latin.length;
  }
  const cjk = text.match(/[\u3400-\u9fff]/g);
  return cjk?.length ? Math.ceil(cjk.length / 2) : 0;
}

function summaryIsExtractive(summary: string, excerpt: string) {
  const summaryTokens = new Set(normalize(summary).split(" ").filter(Boolean));
  const excerptTokens = new Set(normalize(excerpt).split(" ").filter(Boolean));
  if (summaryTokens.size < 7) {
    return false;
  }
  const overlap = [...summaryTokens].filter((token) =>
    excerptTokens.has(token),
  ).length;
  return overlap / summaryTokens.size > 0.85;
}

function summaryMayBeInterpretive(summary: string, excerpt: string) {
  const unsupportedConcepts = [
    "causes",
    "clinical",
    "diagnosis",
    "metacognitive",
    "psychological mechanism",
    "self regulation",
    "therapeutic",
    "trauma",
  ];
  const normalizedSummary = normalize(summary);
  const normalizedExcerpt = normalize(excerpt);
  return unsupportedConcepts.some(
    (term) =>
      normalizedSummary.includes(term) && !normalizedExcerpt.includes(term),
  );
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
