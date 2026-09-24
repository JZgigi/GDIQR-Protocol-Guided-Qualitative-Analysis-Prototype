import type {
  BenchmarkChunkingPolicy,
  BenchmarkSpeakerRole,
  BenchmarkTranscriptInput,
  FrozenBenchmarkInput
} from "./types.ts";

export interface MeaningUnitEvidenceTurn {
  turnId: string;
  speakerId: string;
  speakerRole: BenchmarkSpeakerRole;
  text: string;
  start?: number;
  end?: number;
}

export interface MeaningUnitEvidenceBundle {
  batchId: string;
  transcriptId: string;
  focusGroupId: string;
  chunkIndex: number;
  chunkCount: number;
  chunkingApplied: boolean;
  researchQuestion: string;
  studyContext: string;
  analyticDataset: FrozenBenchmarkInput["analyticDataset"];
  turns: MeaningUnitEvidenceTurn[];
  analysisTurnIds: string[];
}

function turnsForTranscript(
  frozen: FrozenBenchmarkInput,
  transcript: BenchmarkTranscriptInput
): MeaningUnitEvidenceTurn[] {
  const roleBySpeaker = new Map(
    frozen.speakerRoles
      .filter((role) => role.transcriptId === transcript.transcriptId)
      .map((role) => [role.speakerId, role.role])
  );
  return transcript.turns.map((turn) => ({
    ...turn,
    speakerRole: roleBySpeaker.get(turn.speakerId) ?? "unknown"
  }));
}

function deterministicTurnChunks(
  turns: MeaningUnitEvidenceTurn[],
  policy: BenchmarkChunkingPolicy
) {
  const chunks: MeaningUnitEvidenceTurn[][] = [];
  let cursor = 0;
  while (cursor < turns.length) {
    const chunk: MeaningUnitEvidenceTurn[] = [];
    let characters = 0;
    let next = cursor;
    while (next < turns.length) {
      const addition = turns[next].text.length + (chunk.length === 0 ? 0 : 1);
      if (chunk.length > 0 && characters + addition > policy.maxInputCharacters) {
        break;
      }
      chunk.push(turns[next]);
      characters += addition;
      next += 1;
    }
    chunks.push(chunk);
    if (next >= turns.length) break;
    const retainedOverlap = Math.min(policy.overlapTurns, Math.max(0, chunk.length - 1));
    cursor = next - retainedOverlap;
  }
  return chunks;
}

export function createMeaningUnitEvidenceBundles(
  frozen: FrozenBenchmarkInput
): MeaningUnitEvidenceBundle[] {
  return frozen.transcripts.flatMap((transcript) => {
    const turns = turnsForTranscript(frozen, transcript);
    const chunks =
      transcript.content.length <=
      frozen.computationalConfiguration.chunkingPolicy.maxInputCharacters
        ? [turns]
        : deterministicTurnChunks(
            turns,
            frozen.computationalConfiguration.chunkingPolicy
          );
    return chunks.map((chunkTurns, index) => ({
      batchId: `${transcript.transcriptId}:chunk-${String(index + 1).padStart(3, "0")}`,
      transcriptId: transcript.transcriptId,
      focusGroupId: transcript.focusGroupId,
      chunkIndex: index + 1,
      chunkCount: chunks.length,
      chunkingApplied: chunks.length > 1,
      researchQuestion: frozen.researchQuestion,
      studyContext: frozen.studyContext,
      analyticDataset: frozen.analyticDataset,
      turns: chunkTurns,
      analysisTurnIds: chunkTurns
        .slice(index === 0 ? 0 : Math.min(frozen.computationalConfiguration.chunkingPolicy.overlapTurns, chunkTurns.length))
        .map((turn) => turn.turnId)
    }));
  });
}
