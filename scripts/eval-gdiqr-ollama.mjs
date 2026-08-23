const base = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(
  /\/$/,
  "",
);
const model = process.env.OLLAMA_MODEL || "qwen3:8b";
const url = `${base}/api/chat`;

const globalRules = `You are an AI-assisted qualitative analyst in a GDI-QR-informed workflow. Preserve source meaning and qualifications; prioritise participant clarification over facilitator paraphrase; preserve disagreement and negative cases; treat participant external-world claims as perceptions unless verified; do not invent theory, diagnosis, motives, causality, or psychological constructs; keep categories participant-near and reserve higher-order explanation primarily for integration. Return JSON only. Do not output chain-of-thought.`;

const cases = [
  {
    id: "EV01",
    prompt: `Summarise without adding theory: "MBCT is like a good excuse to relax when I feel negative; normally I tell myself I should keep studying because I need to find a job." Return {"output":"..."}.`,
    requireAny: [
      ["rest", "break", "relax", "permission", "legitim"],
      ["study", "academic", "job", "work", "pressure"],
    ],
    forbid: ["perfectionism", "clinical effectiveness", "diagnos"],
  },
  {
    id: "EV02",
    prompt: `Summarise while preserving qualification: "We are all Chinese and some difficulties have Chinese characteristics, but each student has their own personalised issues." Return {"output":"..."}.`,
    requireAny: [
      ["cultur", "Chinese", "shared"],
      ["individual", "personal", "different", "heterogen"],
    ],
    forbid: ["all Chinese students have", "homogeneous"],
  },
  {
    id: "EV03",
    prompt: `Resolve the interaction according to participant priority. Facilitator: "So this is preventative support before students arrive?" Participant: "No, not exactly... Chinese universities could help us spread the information to students who may later study in the UK." Return {"output":"..."}.`,
    requireAny: [
      ["disseminat", "spread", "awareness", "information"],
      ["universit", "partner"],
    ],
    forbid: ["preventative intervention", "preventive intervention"],
  },
  {
    id: "EV04",
    prompt: `Create one participant-near category from: (1) Recommend MBCT to people who are struggling. (2) Recommend MBCT to everyone as useful psychological knowledge. (3) People may need desire, patience and trust before engaging. Return {"output":"..."}.`,
    requireAny: [
      ["who", "people", "for"],
      ["ready", "readiness", "willing", "different", "vary"],
    ],
    forbid: [
      "determinants of uptake",
      "determines uptake",
      "readiness mechanism",
    ],
  },
  {
    id: "EV05",
    prompt: `Create one participant-near category preserving contradiction from: in-person helps engagement/group energy; face-to-face can feel awkward for self-disclosure; online helps access/replay; some experiential activities may work better in person. Return {"output":"..."}.`,
    requireAny: [
      [
        "benefit",
        "advantage",
        "difficulty",
        "disadvantage",
        "different",
        "enhance",
        "engagement",
        "awkward",
        "discomfort",
        "access",
        "flexibility",
        "replay",
        "effective",
      ],
      ["mode", "delivery", "online", "in-person", "face-to-face"],
    ],
    forbid: [
      "participants preferred face-to-face",
      "participants preferred in-person",
      "participants unanimously preferred",
      "everyone preferred face-to-face",
      "face-to-face was preferred by all",
    ],
  },
  {
    id: "EV06",
    prompt: `Review this claim only; do not score it. Source: participant says a friend told them MBCT is recognised by the NHS and that this may help students trust it. AI output: "MBCT is credible because it is NHS recognised." Return {"flag":"...","revision":"..."}.`,
    requireAny: [
      [
        "perception",
        "belief",
        "reported",
        "report",
        "friend",
        "according to",
        "verification",
        "verify",
      ],
      ["trust", "credible", "credibility", "perceiv", "influence"],
    ],
    forbid: [
      "mbct is credible because it is nhs recognised",
      "mbct is credible because it is nhs recognized",
      "mbct is nhs recognised and therefore credible",
      "mbct is nhs recognized and therefore credible",
    ],
  },
];

async function runCase(testCase) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: globalRules },
        { role: "user", content: testCase.prompt },
      ],
      stream: false,
      think: false,
      format: "json",
      options: {
        temperature: 0.1,
        num_predict: 500,
      },
    }),
  });
  if (!response.ok)
    throw new Error(`${response.status} ${await response.text()}`);
  const data = await response.json();
  const text = String(data?.message?.content || "").toLowerCase();
  if (!text.trim()) {
    return {
      pass: false,
      text: "",
      missing: [["non-empty model response"]],
      forbidden: [],
    };
  }
  const missing = testCase.requireAny.filter(
    (group) => !group.some((term) => text.includes(term.toLowerCase())),
  );
  const forbidden = testCase.forbid.filter((term) =>
    text.includes(term.toLowerCase()),
  );
  return {
    pass: missing.length === 0 && forbidden.length === 0,
    text,
    missing,
    forbidden,
  };
}

let failed = false;
for (const testCase of cases) {
  try {
    const result = await runCase(testCase);
    console.log(`${result.pass ? "PASS" : "REVIEW"}: ${testCase.id}`);
    if (!result.pass) {
      failed = true;
      if (result.missing.length)
        console.log(
          `  Missing concept groups: ${JSON.stringify(result.missing)}`,
        );
      if (result.forbidden.length)
        console.log(
          `  Forbidden wording found: ${result.forbidden.join(", ")}`,
        );
      console.log(`  Model output: ${result.text}`);
    }
  } catch (error) {
    failed = true;
    console.error(
      `ERROR: ${testCase.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (failed) {
  console.error(
    "One or more GDI-QR Ollama cases need researcher/developer review. No numerical quality score is produced.",
  );
  process.exit(1);
}
console.log(
  "All GDI-QR Ollama regression cases passed. No numerical quality score is produced.",
);
