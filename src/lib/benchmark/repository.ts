import { createFrozenBenchmarkInput } from "./input.ts";
import { sanitizeBenchmarkAttemptsForResearchExport } from "./audit.ts";
import { sha256 } from "./hash.ts";
import { benchmarkStageSequence } from "./types.ts";
import type {
  BenchmarkModelAttempt,
  BenchmarkStageKind,
  BenchmarkStageOutput,
  CreateBenchmarkRunInput,
  FinalCategory,
  FinalIntegratedAnalysis,
  FinalMeaningUnit,
  FrozenBenchmarkInput
} from "./types.ts";
import { createSupabaseServerClient } from "../supabase/server";
import type { Json } from "../supabase/database.types";

function requireSupabase() {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    throw new Error(
      "Benchmark runs require Supabase-backed storage. Configure Supabase before starting a run."
    );
  }
  return supabase;
}

function asJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

async function requireWritableRun(runId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("benchmark_runs")
    .select("id,status,current_stage")
    .eq("id", runId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Benchmark run was not found.");
  }
  if (data.status !== "running") {
    throw new Error("Completed or failed benchmark runs are read-only.");
  }
  return { run: data, supabase };
}

export async function createBenchmarkRun(rawInput: CreateBenchmarkRunInput) {
  const supabase = requireSupabase();
  const frozen = createFrozenBenchmarkInput(rawInput);
  const { data, error } = await supabase
    .from("benchmark_runs")
    .insert({
      project_id: frozen.projectId,
      status: "running",
      current_stage: "mu_draft",
      research_question: frozen.researchQuestion,
      study_context: frozen.studyContext,
      analytic_dataset_metadata: asJson(frozen.analyticDataset),
      transcript_snapshot: asJson(frozen.transcripts),
      speaker_roles_snapshot: asJson(frozen.speakerRoles),
      transcript_hash: frozen.transcriptHash,
      translated_transcript_hash: frozen.analyticDataset.translatedTranscriptHash,
      methodological_protocol_version: frozen.methodologicalProtocol.version,
      methodological_protocol_snapshot: asJson(frozen.methodologicalProtocol),
      methodological_protocol_hash: frozen.methodologicalProtocolHash,
      computational_config_version: frozen.computationalConfiguration.version,
      computational_config_snapshot: asJson(frozen.computationalConfiguration),
      computational_config_hash: frozen.computationalConfigurationHash,
      input_hash: frozen.inputHash,
      application_version: rawInput.applicationVersion ?? null,
      git_commit: rawInput.gitCommit ?? null
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function claimMeaningUnitExecution(runId: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("benchmark_runs")
    .update({ mu_execution_started_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running")
    .eq("current_stage", "mu_draft")
    .is("mu_execution_started_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("The Meaning Unit phase has already started and cannot be rerun in this benchmark run.");
  }
}

export async function recordBenchmarkStageOutput<T>(
  runId: string,
  stageSequence: number,
  record: BenchmarkStageOutput<T>,
  status: "completed" | "failed" = "completed",
  errorMessage?: string
) {
  const { run, supabase } = await requireWritableRun(runId);
  if (run.current_stage !== record.stage) {
    throw new Error(
      `Run is at ${run.current_stage}; it cannot record ${record.stage}.`
    );
  }
  if (benchmarkStageSequence[record.stage] !== stageSequence) {
    throw new Error(
      `Stage ${record.stage} must use sequence ${benchmarkStageSequence[record.stage]}.`
    );
  }
  const structuredOutput = asJson(record.output);
  const { data, error } = await supabase
    .from("benchmark_stage_outputs")
    .insert({
      run_id: runId,
      stage: record.stage,
      stage_sequence: stageSequence,
      status,
      schema_version: record.schemaVersion,
      input_reference_hash: record.inputReferenceHash,
      structured_output: structuredOutput,
      output_hash: status === "completed" ? sha256(record.output) : null,
      validation_result: asJson(record.validationResult),
      error: errorMessage ?? null,
      completed_at: new Date().toISOString()
    })
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function recordBenchmarkModelAttempt(
  runId: string,
  attempt: BenchmarkModelAttempt
) {
  const { run, supabase } = await requireWritableRun(runId);
  const config = run.current_stage;
  if (attempt.stage !== run.current_stage) {
    throw new Error(
      `Run is at ${run.current_stage}; it cannot record an attempt for ${attempt.stage}.`
    );
  }
  const { data: fullRun, error: runError } = await supabase
    .from("benchmark_runs")
    .select("computational_config_snapshot")
    .eq("id", runId)
    .single();
  if (runError) {
    throw new Error(runError.message);
  }
  const snapshot = fullRun.computational_config_snapshot as unknown as Record<
    string,
    unknown
  >;
  const permittedAttempts =
    1 +
    (typeof snapshot.technicalRetryCount === "number"
      ? snapshot.technicalRetryCount
      : 0) +
    (snapshot.jsonRepairEnabled === true ? 1 : 0);
  if (attempt.attemptNumber > permittedAttempts) {
    throw new Error(
      `Attempt ${attempt.attemptNumber} exceeds the locked retry/repair policy.`
    );
  }
  const phase = attempt.stage.startsWith("mu_")
    ? "meaningUnits"
    : attempt.stage.startsWith("category_")
      ? "categories"
      : attempt.stage.startsWith("integration_")
        ? "integration"
        : null;
  const promptKind = attempt.stage.endsWith("_draft")
    ? "generation"
    : attempt.stage.endsWith("_review")
      ? "selfReview"
      : attempt.stage.endsWith("_final")
        ? "finalRevision"
        : null;
  if (!phase || !promptKind) {
    throw new Error(`Stage ${attempt.stage} does not permit a model attempt.`);
  }
  const promptTemplates = snapshot.promptTemplates as
    | Record<string, Record<string, { version?: unknown; hash?: unknown }>>
    | undefined;
  const expectedPrompt =
    attempt.attemptType === "json_repair"
      ? (snapshot.jsonRepairPrompt as { version?: unknown; hash?: unknown } | undefined)
      : promptTemplates?.[phase]?.[promptKind];
  if (
    expectedPrompt?.version !== attempt.promptTemplateVersion ||
    expectedPrompt?.hash !== attempt.promptTemplateHash
  ) {
    throw new Error(
      `Attempt prompt metadata does not match the locked ${attempt.stage} template.`
    );
  }
  const { data, error } = await supabase
    .from("benchmark_model_attempts")
    .insert({
      run_id: runId,
      stage_output_id: attempt.stageOutputId ?? null,
      stage: attempt.stage,
      batch_id: attempt.batchId,
      attempt_number: attempt.attemptNumber,
      attempt_type: attempt.attemptType,
      provider: String(snapshot.provider ?? "unknown"),
      model: String(snapshot.model ?? "unknown"),
      model_digest:
        typeof snapshot.modelDigest === "string" ? snapshot.modelDigest : null,
      parameter_snapshot: asJson(snapshot),
      prompt_template_version: attempt.promptTemplateVersion,
      prompt_template_hash: attempt.promptTemplateHash,
      request_hash: attempt.requestHash,
      raw_response: attempt.rawResponse ?? null,
      parsed_response:
        attempt.parsedResponse === undefined
          ? null
          : asJson(attempt.parsedResponse),
      validation_status: attempt.validationStatus,
      failure_category: attempt.failureCategory ?? null,
      error: attempt.error ?? null,
      duration_ms: attempt.durationMs ?? null,
      provider_generation_id: attempt.providerGenerationId ?? null,
      provider_response_model: attempt.providerResponseModel ?? null
    })
    .select()
    .single();
  if (error) {
    throw new Error(`${config}: ${error.message}`);
  }
  return data;
}

export async function saveFinalMeaningUnits(
  runId: string,
  meaningUnits: FinalMeaningUnit[]
) {
  const { supabase } = await requireWritableRun(runId);
  const { data: runSnapshot, error: runSnapshotError } = await supabase
    .from("benchmark_runs")
    .select("transcript_snapshot,speaker_roles_snapshot")
    .eq("id", runId)
    .single();
  if (runSnapshotError) {
    throw new Error(runSnapshotError.message);
  }
  const transcripts = runSnapshot.transcript_snapshot as unknown as Array<{
    transcriptId: string;
    focusGroupId: string;
    content: string;
    turns: Array<{ turnId: string; speakerId: string; text: string; start?: number; end?: number }>;
  }>;
  const roles = runSnapshot.speaker_roles_snapshot as unknown as Array<{
    transcriptId: string;
    speakerId: string;
    role: string;
  }>;
  const seenMuIds = new Set<string>();
  for (const unit of meaningUnits) {
    if (seenMuIds.has(unit.muId)) {
      throw new Error(`Duplicate final MU ID: ${unit.muId}.`);
    }
    seenMuIds.add(unit.muId);
    const transcript = transcripts.find(
      (item) => item.transcriptId === unit.transcriptId
    );
    if (!transcript || transcript.focusGroupId !== unit.focusGroupId) {
      throw new Error(`MU ${unit.muId} has an invalid transcript/focus-group reference.`);
    }
    const referencedTurns = unit.sourceLocation.turnIds.map((turnId) =>
      transcript.turns.find((turn) => turn.turnId === turnId)
    );
    if (referencedTurns.some((turn) => !turn)) {
      throw new Error(`MU ${unit.muId} references an unknown transcript turn.`);
    }
    const frozenTurns = referencedTurns as typeof transcript.turns;
    if (
      frozenTurns.some((turn) => turn.speakerId !== unit.speakerId) ||
      !frozenTurns.map((turn) => turn.text).join("\n").includes(unit.sourceText)
    ) {
      throw new Error(`MU ${unit.muId} does not match its exact frozen turn evidence.`);
    }
    if (unit.sourceLocation.start !== undefined) {
      if (
        unit.sourceLocation.end === undefined ||
        transcript.content.slice(unit.sourceLocation.start, unit.sourceLocation.end) !== unit.sourceText
      ) {
        throw new Error(`MU ${unit.muId} does not match its optional frozen transcript span.`);
      }
    }
    const frozenRole = roles.find(
      (role) =>
        role.transcriptId === unit.transcriptId &&
        role.speakerId === unit.speakerId
    )?.role;
    if (frozenRole !== unit.speakerRole) {
      throw new Error(`MU ${unit.muId} does not match its frozen speaker role.`);
    }
    if (unit.speakerRole !== "participant") {
      throw new Error(`MU ${unit.muId} is not confirmed participant material.`);
    }
  }
  if (meaningUnits.length === 0) {
    return [];
  }
  const rows = meaningUnits.map((unit, index) => ({
    run_id: runId,
    mu_id: unit.muId,
    transcript_id: unit.transcriptId,
    focus_group_id: unit.focusGroupId,
    speaker_id: unit.speakerId,
    speaker_role: unit.speakerRole,
    turn_ids: unit.sourceLocation.turnIds,
    source_start: unit.sourceLocation.start ?? null,
    source_end: unit.sourceLocation.end ?? null,
    source_text: unit.sourceText,
    source_span_hash: sha256({
      transcriptId: unit.transcriptId,
      turnIds: unit.sourceLocation.turnIds,
      start: unit.sourceLocation.start ?? null,
      end: unit.sourceLocation.end ?? null,
      text: unit.sourceText
    }),
    summary: unit.summary,
    uncertainty: unit.uncertainty ?? null,
    source_draft_mu_ids: unit.sourceDraftMuIds,
    applied_review_finding_ids: unit.appliedReviewFindingIds,
    review_action: unit.reviewAction,
    sort_order: index + 1
  }));
  const { data, error } = await supabase
    .from("benchmark_meaning_units")
    .insert(rows)
    .select();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function saveFinalCategories(
  runId: string,
  categories: FinalCategory[]
) {
  const { supabase } = await requireWritableRun(runId);
  const { data: storedUnits, error: unitError } = await supabase
    .from("benchmark_meaning_units")
    .select("mu_id")
    .eq("run_id", runId);
  if (unitError) {
    throw new Error(unitError.message);
  }
  const validMuIds = new Set((storedUnits ?? []).map((unit) => unit.mu_id));
  const categoryIds = new Set<string>();
  for (const category of categories) {
    if (categoryIds.has(category.categoryId)) {
      throw new Error(`Duplicate final category ID: ${category.categoryId}.`);
    }
    categoryIds.add(category.categoryId);
    const invalidMuId = category.includedMuIds.find(
      (muId) => !validMuIds.has(muId)
    );
    if (invalidMuId) {
      throw new Error(
        `Category ${category.categoryId} references unknown MU ${invalidMuId}.`
      );
    }
  }
  if (categories.length === 0) {
    return [];
  }
  const categoryRows = categories.map((category, index) => ({
    run_id: runId,
    category_id: category.categoryId,
    name: category.name,
    description: category.description,
    rationale: category.rationale,
    source_draft_category_ids: category.sourceDraftCategoryIds,
    applied_review_finding_ids: category.appliedReviewFindingIds,
    sort_order: index + 1
  }));
  const membershipRows = categories.flatMap((category) =>
    category.includedMuIds.map((muId) => ({
      run_id: runId,
      category_id: category.categoryId,
      meaning_unit_id: muId
    }))
  );
  const { data, error } = await supabase
    .from("benchmark_categories")
    .insert(categoryRows)
    .select();
  if (error) {
    throw new Error(error.message);
  }
  if (membershipRows.length > 0) {
    const { error: membershipError } = await supabase
      .from("benchmark_category_memberships")
      .insert(membershipRows);
    if (membershipError) {
      throw new Error(membershipError.message);
    }
  }
  return data;
}

export async function saveFinalIntegratedAnalysis(
  runId: string,
  analysis: FinalIntegratedAnalysis,
  evidenceValidation: Record<string, unknown>
) {
  const { supabase } = await requireWritableRun(runId);
  const [categories, meaningUnits] = await Promise.all([
    supabase
      .from("benchmark_categories")
      .select("category_id")
      .eq("run_id", runId),
    supabase
      .from("benchmark_meaning_units")
      .select("mu_id")
      .eq("run_id", runId)
  ]);
  const referenceError = categories.error ?? meaningUnits.error;
  if (referenceError) {
    throw new Error(referenceError.message);
  }
  const categoryIds = new Set(
    (categories.data ?? []).map((category) => category.category_id)
  );
  const muIds = new Set((meaningUnits.data ?? []).map((unit) => unit.mu_id));
  for (const claim of analysis.claims) {
    if (claim.categoryIds.some((categoryId) => !categoryIds.has(categoryId))) {
      throw new Error(`Integrated claim ${claim.claimId} references an unknown category.`);
    }
    if (claim.muIds.some((muId) => !muIds.has(muId))) {
      throw new Error(`Integrated claim ${claim.claimId} references an unknown MU.`);
    }
    if (claim.categoryIds.length === 0 || claim.muIds.length === 0) {
      throw new Error(
        `Integrated claim ${claim.claimId} must link category and MU evidence.`
      );
    }
  }
  const { data, error } = await supabase
    .from("benchmark_integrated_narratives")
    .insert({
      run_id: runId,
      narrative: analysis.narrative,
      claims: asJson(analysis.claims),
      applied_review_finding_ids: analysis.appliedReviewFindingIds,
      evidence_validation: asJson(evidenceValidation)
    })
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function advanceBenchmarkRun(
  runId: string,
  nextStage: BenchmarkStageKind
) {
  const { run, supabase } = await requireWritableRun(runId);
  const currentStage = run.current_stage as BenchmarkStageKind;
  if (benchmarkStageSequence[nextStage] !== benchmarkStageSequence[currentStage] + 1) {
    throw new Error(
      `Benchmark stages cannot skip from ${currentStage} to ${nextStage}.`
    );
  }
  const { data, error } = await supabase
    .from("benchmark_runs")
    .update({ current_stage: nextStage })
    .eq("id", runId)
    .eq("status", "running")
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function freezeBenchmarkRun(runId: string) {
  const bundle = await getBenchmarkRun(runId);
  if (!bundle) {
    throw new Error("Benchmark run was not found.");
  }
  if (bundle.run.status !== "running") {
    throw new Error("Only a running benchmark run can be frozen.");
  }
  const requiredFinalStages = new Set([
    "mu_final",
    "category_final",
    "integration_final",
    "final_validation"
  ]);
  const completedFinalStages = new Set(
    bundle.stages
      .filter((stage) => stage.status === "completed")
      .map((stage) => stage.stage)
  );
  if (
    [...requiredFinalStages].some((stage) => !completedFinalStages.has(stage)) ||
    !bundle.integratedNarrative
  ) {
    throw new Error("The benchmark run is incomplete and cannot be frozen.");
  }
  const finalOutputHash = sha256({
    meaningUnits: bundle.meaningUnits,
    categories: bundle.categories,
    categoryMemberships: bundle.categoryMemberships,
    integratedNarrative: bundle.integratedNarrative
  });
  const now = new Date().toISOString();
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("benchmark_runs")
    .update({
      status: "completed_frozen",
      current_stage: "final_validation",
      final_output_hash: finalOutputHash,
      completed_at: now,
      frozen_at: now
    })
    .eq("id", runId)
    .eq("status", "running")
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function failBenchmarkRun(runId: string, failureSummary: string) {
  const { supabase } = await requireWritableRun(runId);
  const { data, error } = await supabase
    .from("benchmark_runs")
    .update({
      status: "failed",
      failure_summary: failureSummary,
      completed_at: new Date().toISOString()
    })
    .eq("id", runId)
    .eq("status", "running")
    .select()
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export async function getBenchmarkRun(runId: string) {
  const supabase = requireSupabase();
  const [run, stages, attempts, meaningUnits, categories, memberships, narrative] =
    await Promise.all([
      supabase.from("benchmark_runs").select("*").eq("id", runId).maybeSingle(),
      supabase
        .from("benchmark_stage_outputs")
        .select("*")
        .eq("run_id", runId)
        .order("stage_sequence", { ascending: true }),
      supabase
        .from("benchmark_model_attempts")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: true }),
      supabase
        .from("benchmark_meaning_units")
        .select("*")
        .eq("run_id", runId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("benchmark_categories")
        .select("*")
        .eq("run_id", runId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("benchmark_category_memberships")
        .select("*")
        .eq("run_id", runId),
      supabase
        .from("benchmark_integrated_narratives")
        .select("*")
        .eq("run_id", runId)
        .maybeSingle()
    ]);

  const error =
    run.error ??
    stages.error ??
    attempts.error ??
    meaningUnits.error ??
    categories.error ??
    memberships.error ??
    narrative.error;
  if (error) {
    throw new Error(error.message);
  }
  if (!run.data) {
    return null;
  }
  const safeAttempts = sanitizeBenchmarkAttemptsForResearchExport(attempts.data ?? []);
  return {
    run: run.data,
    stages: stages.data ?? [],
    modelAttempts: safeAttempts,
    meaningUnits: meaningUnits.data ?? [],
    categories: categories.data ?? [],
    categoryMemberships: memberships.data ?? [],
    integratedNarrative: narrative.data ?? null
  };
}

export async function getFrozenBenchmarkInput(runId: string): Promise<FrozenBenchmarkInput> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("benchmark_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Benchmark run was not found.");
  if (data.status !== "running") {
    throw new Error("Completed or failed benchmark runs are read-only.");
  }
  return {
    projectId: data.project_id,
    researchQuestion: data.research_question,
    studyContext: data.study_context,
    analyticDataset: data.analytic_dataset_metadata as unknown as FrozenBenchmarkInput["analyticDataset"],
    transcripts: data.transcript_snapshot as unknown as FrozenBenchmarkInput["transcripts"],
    speakerRoles: data.speaker_roles_snapshot as unknown as FrozenBenchmarkInput["speakerRoles"],
    methodologicalProtocol: data.methodological_protocol_snapshot as unknown as FrozenBenchmarkInput["methodologicalProtocol"],
    computationalConfiguration: data.computational_config_snapshot as unknown as FrozenBenchmarkInput["computationalConfiguration"],
    transcriptHash: data.transcript_hash,
    methodologicalProtocolHash: data.methodological_protocol_hash,
    computationalConfigurationHash: data.computational_config_hash,
    inputHash: data.input_hash
  };
}
