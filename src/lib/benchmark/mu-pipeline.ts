import { sha256 } from "./hash.ts";
import { createMeaningUnitEvidenceBundles } from "./mu-evidence.ts";
import { runStructuredMuRequest, type BenchmarkMuProvider } from "./mu-model.ts";
import {
  buildDraftMuPrompt,
  buildFinalMuPrompt,
  buildReviewMuPrompt,
  meaningUnitPromptReferences
} from "./mu-prompts.ts";
import {
  parseDraftMeaningUnitOutput,
  parseFinalMeaningUnitOutput,
  parseMeaningUnitReviewOutput,
  MU_SCHEMA_VERSION,
  validateDraftMeaningUnits,
  validateFinalMeaningUnits,
  validateReviewFindings
} from "./mu-validation.ts";
import {
  advanceBenchmarkRun,
  claimMeaningUnitExecution,
  failBenchmarkRun,
  getFrozenBenchmarkInput,
  recordBenchmarkModelAttempt,
  recordBenchmarkStageOutput,
  saveFinalMeaningUnits
} from "./repository.ts";
import type {
  BenchmarkStageKind,
  DraftMeaningUnit,
  FinalMeaningUnitOutput,
  MeaningUnitReviewFinding,
  PromptTemplateReference
} from "./types.ts";

function samePromptReference(actual: PromptTemplateReference | undefined, expected: PromptTemplateReference) {
  return actual?.version === expected.version && actual.hash === expected.hash;
}

function assertLockedMuPrompts(configuration: Awaited<ReturnType<typeof getFrozenBenchmarkInput>>["computationalConfiguration"]) {
  const prompts = configuration.promptTemplates.meaningUnits;
  if (
    !samePromptReference(prompts.generation, meaningUnitPromptReferences.generation) ||
    !samePromptReference(prompts.selfReview, meaningUnitPromptReferences.selfReview) ||
    !samePromptReference(prompts.finalRevision, meaningUnitPromptReferences.finalRevision) ||
    (configuration.jsonRepairEnabled &&
      !samePromptReference(configuration.jsonRepairPrompt, meaningUnitPromptReferences.jsonRepair))
  ) {
    throw new Error("The locked MU prompt references do not match the Benchmark v1 implementation.");
  }
}

export interface RunMeaningUnitPhaseOptions {
  provider?: BenchmarkMuProvider;
}

export async function runMeaningUnitPhase(
  runId: string,
  options: RunMeaningUnitPhaseOptions = {}
) {
  const frozen = await getFrozenBenchmarkInput(runId);
  await claimMeaningUnitExecution(runId);
  let activeStage: BenchmarkStageKind = "mu_draft";

  try {
    assertLockedMuPrompts(frozen.computationalConfiguration);
    const bundles = createMeaningUnitEvidenceBundles(frozen);
    const draftBatches: Array<{
      batchId: string;
      draftMeaningUnits: DraftMeaningUnit[];
    }> = [];
    for (const bundle of bundles) {
      const result = await runStructuredMuRequest({
        stage: "mu_draft",
        batchId: bundle.batchId,
        promptReference: meaningUnitPromptReferences.generation,
        userPrompt: buildDraftMuPrompt(bundle),
        configuration: frozen.computationalConfiguration,
        provider: options.provider,
        parseAndValidate(value) {
          const parsed = parseDraftMeaningUnitOutput(value);
          validateDraftMeaningUnits(bundle, parsed.draftMeaningUnits);
          return parsed;
        },
        recordAttempt: (attempt) => recordBenchmarkModelAttempt(runId, attempt).then(() => undefined)
      });
      draftBatches.push({ batchId: bundle.batchId, ...result });
    }
    const draftOutput = {
      chunkingPolicy: frozen.computationalConfiguration.chunkingPolicy,
      batches: draftBatches
    };
    await recordBenchmarkStageOutput(runId, 1, {
      stage: "mu_draft",
      schemaVersion: MU_SCHEMA_VERSION,
      output: draftOutput,
      inputReferenceHash: frozen.inputHash,
      validationResult: { valid: true, batchCount: bundles.length }
    });
    await advanceBenchmarkRun(runId, "mu_review");
    activeStage = "mu_review";

    const reviewBatches: Array<{
      batchId: string;
      findings: MeaningUnitReviewFinding[];
    }> = [];
    for (const bundle of bundles) {
      const drafts = draftBatches.find((batch) => batch.batchId === bundle.batchId)!.draftMeaningUnits;
      const result = await runStructuredMuRequest({
        stage: "mu_review",
        batchId: bundle.batchId,
        promptReference: meaningUnitPromptReferences.selfReview,
        userPrompt: buildReviewMuPrompt(bundle, drafts),
        configuration: frozen.computationalConfiguration,
        provider: options.provider,
        parseAndValidate(value) {
          const parsed = parseMeaningUnitReviewOutput(value);
          validateReviewFindings(bundle, drafts, parsed.findings);
          return parsed;
        },
        recordAttempt: (attempt) => recordBenchmarkModelAttempt(runId, attempt).then(() => undefined)
      });
      reviewBatches.push({ batchId: bundle.batchId, ...result });
    }
    const reviewOutput = { reviewPass: 1, batches: reviewBatches };
    const reviewInputHash = sha256({ frozenInput: frozen.inputHash, draftOutput });
    await recordBenchmarkStageOutput(runId, 2, {
      stage: "mu_review",
      schemaVersion: MU_SCHEMA_VERSION,
      output: reviewOutput,
      inputReferenceHash: reviewInputHash,
      validationResult: { valid: true, reviewPasses: 1, batchCount: bundles.length }
    });
    await advanceBenchmarkRun(runId, "mu_final");
    activeStage = "mu_final";

    const finalBatches: Array<{ batchId: string } & FinalMeaningUnitOutput> = [];
    for (const bundle of bundles) {
      const drafts = draftBatches.find((batch) => batch.batchId === bundle.batchId)!.draftMeaningUnits;
      const findings = reviewBatches.find((batch) => batch.batchId === bundle.batchId)!.findings;
      const result = await runStructuredMuRequest({
        stage: "mu_final",
        batchId: bundle.batchId,
        promptReference: meaningUnitPromptReferences.finalRevision,
        userPrompt: buildFinalMuPrompt(bundle, drafts, findings),
        configuration: frozen.computationalConfiguration,
        provider: options.provider,
        parseAndValidate(value) {
          const parsed = parseFinalMeaningUnitOutput(value);
          return validateFinalMeaningUnits(bundle, drafts, findings, parsed);
        },
        recordAttempt: (attempt) => recordBenchmarkModelAttempt(runId, attempt).then(() => undefined)
      });
      finalBatches.push({ batchId: bundle.batchId, ...result });
    }
    const finalOutput = { batches: finalBatches };
    const allFinalMeaningUnits = finalBatches.flatMap((batch) => batch.finalMeaningUnits);
    await saveFinalMeaningUnits(runId, allFinalMeaningUnits);
    await recordBenchmarkStageOutput(runId, 3, {
      stage: "mu_final",
      schemaVersion: MU_SCHEMA_VERSION,
      output: finalOutput,
      inputReferenceHash: sha256({ frozenInput: frozen.inputHash, draftOutput, reviewOutput }),
      validationResult: {
        valid: true,
        batchCount: bundles.length,
        finalMeaningUnitCount: allFinalMeaningUnits.length,
        removedDraftMeaningUnitCount: finalBatches.reduce(
          (count, batch) => count + batch.removedDraftMeaningUnits.length,
          0
        )
      }
    });
    await advanceBenchmarkRun(runId, "category_draft");
    return {
      runId,
      nextStage: "category_draft" as const,
      draft: draftOutput,
      review: reviewOutput,
      final: finalOutput
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meaning Unit phase failed.";
    try {
      await recordBenchmarkStageOutput(
        runId,
        { mu_draft: 1, mu_review: 2, mu_final: 3 }[activeStage as "mu_draft" | "mu_review" | "mu_final"],
        {
          stage: activeStage,
          schemaVersion: MU_SCHEMA_VERSION,
          output: {},
          inputReferenceHash: frozen.inputHash,
          validationResult: { valid: false, error: message }
        },
        "failed",
        message
      );
    } catch {
      // Preserve the original stage failure if audit persistence itself fails.
    }
    await failBenchmarkRun(runId, `${activeStage}: ${message}`);
    throw error;
  }
}
