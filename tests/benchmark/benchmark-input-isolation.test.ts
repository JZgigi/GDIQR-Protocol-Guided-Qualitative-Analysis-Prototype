import assert from "node:assert/strict";
import test from "node:test";
import { createFrozenBenchmarkInput } from "../../src/lib/benchmark/input.ts";
import type { CreateBenchmarkRunInput } from "../../src/lib/benchmark/types.ts";
import { meaningUnitPromptReferences } from "../../src/lib/benchmark/mu-prompts.ts";

function validInput(): CreateBenchmarkRunInput {
  const prompt = { hash: "sha256:prompt", version: "v1" };
  const facilitatorTurn = "Facilitator: What happened?";
  const participantTurn = "P1: I felt supported.";
  const transcriptContent = `${facilitatorTurn}\n${participantTurn}`;
  return {
    projectId: "project-1",
    researchQuestion: "How do participants describe the experience?",
    studyContext: "Synthetic focus-group study.",
    analyticDataset: {
      originalDataLanguage: "zh-CN",
      benchmarkInputLanguage: "en",
      analyticOutputLanguage: "en",
      translatedTranscriptVersion: "synthetic-v1",
      participantVerified: true
    },
    transcripts: [
      {
        transcriptId: "transcript-1",
        focusGroupId: "fg-1",
        content: transcriptContent,
        turns: [
          {
            turnId: "turn-1",
            speakerId: "facilitator-1",
            start: 0,
            end: facilitatorTurn.length,
            text: facilitatorTurn
          },
          {
            turnId: "turn-2",
            speakerId: "p1",
            start: facilitatorTurn.length + 1,
            end: transcriptContent.length,
            text: participantTurn
          }
        ]
      }
    ],
    speakerRoles: [
      {
        transcriptId: "transcript-1",
        focusGroupId: "fg-1",
        speakerId: "facilitator-1",
        role: "facilitator"
      },
      {
        transcriptId: "transcript-1",
        focusGroupId: "fg-1",
        speakerId: "p1",
        role: "participant"
      }
    ],
    methodologicalProtocol: {
      name: "GDI-QR Autonomous Benchmark Protocol",
      version: "1.0",
      meaningUnitRules: ["Segment by substantive meaning."],
      meaningUnitReviewCriteria: ["Check omissions."],
      categoryRules: ["Stay grounded in MUs."],
      categoryReviewCriteria: ["Check coherence."],
      integrationRules: ["Answer the research question."],
      integrationReviewCriteria: ["Check evidence."],
      reviewPasses: { meaningUnits: 1, categories: 1, integration: 1 }
    },
    computationalConfiguration: {
      version: "1.0",
      provider: "ollama",
      model: "synthetic-model",
      temperature: 0.2,
      requestTimeoutMs: 30000,
      tokenLimits: { default: 1000 },
      chunkingPolicy: {
        strategy: "full_transcript_preferred",
        maxInputCharacters: 50000,
        overlapTurns: 0
      },
      technicalRetryCount: 1,
      jsonRepairEnabled: true,
      jsonRepairPrompt: meaningUnitPromptReferences.jsonRepair,
      schemaVersions: {
        benchmark: "1.0",
        meaningUnits: "benchmark-mu-v1.0.0"
      },
      promptTemplates: {
        meaningUnits: {
          generation: meaningUnitPromptReferences.generation,
          selfReview: meaningUnitPromptReferences.selfReview,
          finalRevision: meaningUnitPromptReferences.finalRevision
        },
        categories: {
          generation: prompt,
          selfReview: prompt,
          finalRevision: prompt
        },
        integration: {
          generation: prompt,
          selfReview: prompt,
          finalRevision: prompt
        }
      }
    }
  };
}

test("creates a deterministic frozen input snapshot", () => {
  const first = createFrozenBenchmarkInput(validInput());
  const second = createFrozenBenchmarkInput(validInput());
  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.methodologicalProtocol.reviewPasses.meaningUnits, 1);
  assert.ok(Object.isFrozen(first));
  assert.equal(first.analyticDataset.benchmarkInputLanguage, "en");
  assert.equal(first.analyticDataset.participantVerified, true);
  assert.match(first.analyticDataset.translatedTranscriptHash, /^[a-f0-9]{64}$/);
});

test("rejects Chinese source content from the analytic EvidenceBundle", () => {
  const invalid = validInput();
  const chinese = "这是原始中文访谈内容，不应进入自动基准分析的证据包。".repeat(3);
  invalid.transcripts[0] = {
    transcriptId: "transcript-1",
    focusGroupId: "fg-1",
    content: chinese,
    turns: [{ turnId: "turn-1", speakerId: "p1", text: chinese }]
  };
  assert.throws(() => createFrozenBenchmarkInput(invalid), /Chinese source data/);
});

test("rejects researcher-led analytic output at the benchmark boundary", () => {
  const contaminated = {
    ...validInput(),
    humanAnalysis: {
      categories: [{ name: "Human category" }]
    }
  };
  assert.throws(
    () => createFrozenBenchmarkInput(contaminated),
    /prohibited/
  );
});

test("rejects nested reviewer comments", () => {
  const contaminated = validInput() as CreateBenchmarkRunInput & {
    metadata?: unknown;
  };
  contaminated.metadata = { reviewerComments: ["Use the human result"] };
  assert.throws(
    () => createFrozenBenchmarkInput(contaminated),
    /prohibited/
  );
});

test("rejects derived output from another autonomous run", () => {
  const contaminated = {
    ...validInput(),
    priorRunOutput: { finalCategories: ["Reused category"] }
  };
  assert.throws(
    () => createFrozenBenchmarkInput(contaminated),
    /prohibited field/
  );
});

test("changes the frozen hash when computational configuration changes", () => {
  const first = validInput();
  const second = validInput();
  second.computationalConfiguration.temperature = 0.3;
  assert.notEqual(
    createFrozenBenchmarkInput(first).inputHash,
    createFrozenBenchmarkInput(second).inputHash
  );
});

test("requires exactly one methodological review pass", () => {
  const invalid = validInput();
  invalid.methodologicalProtocol.reviewPasses.meaningUnits = 2 as 1;
  assert.throws(
    () => createFrozenBenchmarkInput(invalid),
    /exactly one review pass/
  );
});
