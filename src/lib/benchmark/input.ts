import { validateCreateBenchmarkRunInput } from "./contracts.ts";
import { sha256 } from "./hash.ts";
import type {
  CreateBenchmarkRunInput,
  FrozenBenchmarkInput
} from "./types.ts";

export function createFrozenBenchmarkInput(
  rawInput: unknown
): FrozenBenchmarkInput {
  const input: CreateBenchmarkRunInput = validateCreateBenchmarkRunInput(rawInput);
  const transcriptSnapshot = input.transcripts.map((transcript) => ({
    ...transcript,
    turns: transcript.turns.map((turn) => ({ ...turn }))
  }));
  const speakerRoles = input.speakerRoles.map((speaker) => ({ ...speaker }));
  const methodologicalProtocol = structuredClone(input.methodologicalProtocol);
  const computationalConfiguration = structuredClone(
    input.computationalConfiguration
  );

  const transcriptHash = sha256({
    transcripts: transcriptSnapshot,
    speakerRoles
  });
  const translatedTranscriptHash = sha256(transcriptSnapshot);
  if (
    input.analyticDataset.translatedTranscriptHash &&
    input.analyticDataset.translatedTranscriptHash !== translatedTranscriptHash
  ) {
    throw new Error(
      "Translated transcript hash does not match the frozen transcript and speaker-role snapshot."
    );
  }
  const analyticDataset = {
    ...structuredClone(input.analyticDataset),
    translatedTranscriptHash
  };
  const methodologicalProtocolHash = sha256(methodologicalProtocol);
  const computationalConfigurationHash = sha256(computationalConfiguration);
  const frozenInput = {
    projectId: input.projectId.trim(),
    researchQuestion: input.researchQuestion.trim(),
    studyContext: input.studyContext.trim(),
    analyticDataset,
    transcripts: transcriptSnapshot,
    speakerRoles,
    methodologicalProtocol,
    computationalConfiguration,
    transcriptHash,
    methodologicalProtocolHash,
    computationalConfigurationHash
  };

  return Object.freeze({
    ...frozenInput,
    inputHash: sha256(frozenInput)
  });
}
