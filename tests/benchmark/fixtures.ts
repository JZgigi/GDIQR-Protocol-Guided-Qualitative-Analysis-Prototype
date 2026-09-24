import { createFrozenBenchmarkInput } from "../../src/lib/benchmark/input.ts";
import { meaningUnitPromptReferences } from "../../src/lib/benchmark/mu-prompts.ts";
import type { CreateBenchmarkRunInput } from "../../src/lib/benchmark/types.ts";

export function syntheticBenchmarkInput(maxInputCharacters = 50000): CreateBenchmarkRunInput {
  const turns = [
    { turnId: "T1", speakerId: "MOD", text: "What was the experience like?" },
    { turnId: "T2", speakerId: "F1", text: "Okay." },
    {
      turnId: "T3",
      speakerId: "F1",
      text: "The group listened without judging me. That made it easier to speak honestly."
    },
    {
      turnId: "T4",
      speakerId: "M2",
      text: "I felt isolated at first. Later, meeting peers gave me confidence."
    },
    { turnId: "T5", speakerId: "U1", text: "Perhaps the timetable also mattered." },
    { turnId: "T6", speakerId: "MOD", text: "Thank you. Who would like to continue?" },
    { turnId: "T7", speakerId: "M2", text: "Thanks." },
    {
      turnId: "T8",
      speakerId: "F1",
      text: "I still worried that support would disappear after the programme ended."
    },
    {
      turnId: "T9",
      speakerId: "M2",
      text: "Travel costs sometimes stopped me from attending the group."
    }
  ];
  return {
    projectId: "synthetic-project",
    researchQuestion: "How do participants experience peer support?",
    studyContext: "Synthetic focus group used only for benchmark tests.",
    analyticDataset: {
      originalDataLanguage: "zh-CN",
      benchmarkInputLanguage: "en",
      analyticOutputLanguage: "en",
      translatedTranscriptVersion: "synthetic-verified-en-v1",
      participantVerified: true
    },
    transcripts: [
      {
        transcriptId: "TR1",
        focusGroupId: "FG1",
        content: turns.map((turn) => turn.text).join("\n"),
        turns
      }
    ],
    speakerRoles: [
      { transcriptId: "TR1", focusGroupId: "FG1", speakerId: "MOD", role: "facilitator" },
      { transcriptId: "TR1", focusGroupId: "FG1", speakerId: "F1", role: "participant" },
      { transcriptId: "TR1", focusGroupId: "FG1", speakerId: "M2", role: "participant" },
      { transcriptId: "TR1", focusGroupId: "FG1", speakerId: "U1", role: "unknown" }
    ],
    methodologicalProtocol: {
      name: "GDI-QR Autonomous Benchmark Protocol",
      version: "1.0",
      meaningUnitRules: ["Segment by coherent substantive participant meaning."],
      meaningUnitReviewCriteria: ["Review once for the locked high-value MU errors."],
      categoryRules: [],
      categoryReviewCriteria: [],
      integrationRules: [],
      integrationReviewCriteria: [],
      reviewPasses: { meaningUnits: 1, categories: 1, integration: 1 }
    },
    computationalConfiguration: {
      version: "benchmark-compute-v1",
      provider: "ollama",
      model: "synthetic-model",
      temperature: 0.2,
      requestTimeoutMs: 30000,
      tokenLimits: { default: 2000 },
      chunkingPolicy: {
        strategy: "full_transcript_preferred",
        maxInputCharacters,
        overlapTurns: 1
      },
      technicalRetryCount: 1,
      jsonRepairEnabled: true,
      jsonRepairPrompt: meaningUnitPromptReferences.jsonRepair,
      schemaVersions: { meaningUnits: "benchmark-mu-v1.0.0" },
      promptTemplates: {
        meaningUnits: {
          generation: meaningUnitPromptReferences.generation,
          selfReview: meaningUnitPromptReferences.selfReview,
          finalRevision: meaningUnitPromptReferences.finalRevision
        },
        categories: {
          generation: { version: "deferred", hash: "deferred" },
          selfReview: { version: "deferred", hash: "deferred" },
          finalRevision: { version: "deferred", hash: "deferred" }
        },
        integration: {
          generation: { version: "deferred", hash: "deferred" },
          selfReview: { version: "deferred", hash: "deferred" },
          finalRevision: { version: "deferred", hash: "deferred" }
        }
      }
    }
  };
}

export function syntheticFrozenInput(maxInputCharacters = 50000) {
  return createFrozenBenchmarkInput(syntheticBenchmarkInput(maxInputCharacters));
}
