import assert from "node:assert/strict";
import test from "node:test";
import { createMeaningUnitEvidenceBundles } from "../../src/lib/benchmark/mu-evidence.ts";
import { runStructuredMuRequest } from "../../src/lib/benchmark/mu-model.ts";
import { meaningUnitPromptReferences } from "../../src/lib/benchmark/mu-prompts.ts";
import {
  MU_DRAFT_PROMPT_TEMPLATE,
  MU_PROMPT_VERSION,
  MU_REVIEW_PROMPT_TEMPLATE
} from "../../src/lib/benchmark/mu-prompts.ts";
import type { BenchmarkModelAttempt } from "../../src/lib/benchmark/types.ts";
import { syntheticFrozenInput } from "./fixtures.ts";
import { sanitizeBenchmarkAttemptsForResearchExport } from "../../src/lib/benchmark/audit.ts";

test("uses a whole focus-group transcript when it fits and deterministic turn chunks otherwise", () => {
  const whole = createMeaningUnitEvidenceBundles(syntheticFrozenInput(50000));
  assert.equal(whole.length, 1);
  assert.equal(whole[0].chunkingApplied, false);
  assert.equal(whole[0].turns.length, 9);

  const chunks = createMeaningUnitEvidenceBundles(syntheticFrozenInput(85));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.chunkingApplied));
  assert.equal(chunks[1].turns[0].turnId, chunks[0].turns.at(-1)?.turnId);
  assert.equal(chunks[1].analysisTurnIds.includes(chunks[1].turns[0].turnId), false);
});

test("locks the v1.0.1 methodological prompt refinements", () => {
  assert.equal(MU_PROMPT_VERSION, "benchmark-mu-v1.0.1");
  assert.match(MU_DRAFT_PROMPT_TEMPLATE, /Multiple clauses, changes in example, internal contrast, temporal development/);
  assert.match(MU_DRAFT_PROMPT_TEMPLATE, /Multiple turns from the same participant may support one MU only when a later turn directly completes or elaborates/);
  assert.match(MU_DRAFT_PROMPT_TEMPLATE, /Close wording is acceptable/);
  assert.match(MU_REVIEW_PROMPT_TEMPLATE, /return an empty findings array/);
  assert.match(MU_REVIEW_PROMPT_TEMPLATE, /Prefer retaining an adequately coherent MU/);
  assert.match(MU_REVIEW_PROMPT_TEMPLATE, /useful condensation is genuinely possible/);
});

test("accepts the first valid response and performs no quality-selection calls", async () => {
  const configuration = syntheticFrozenInput().computationalConfiguration;
  const attempts: BenchmarkModelAttempt[] = [];
  let calls = 0;
  const result = await runStructuredMuRequest({
    stage: "mu_draft",
    batchId: "batch-1",
    promptReference: meaningUnitPromptReferences.generation,
    userPrompt: "synthetic",
    configuration,
    provider: async () => {
      calls += 1;
      return { rawResponse: '{"value":"first valid"}', providerGenerationId: "gen-1" };
    },
    parseAndValidate(value) {
      const parsed = value as { value?: unknown };
      if (typeof parsed.value !== "string") throw new Error("invalid");
      return parsed.value;
    },
    recordAttempt(attempt) {
      attempts.push(attempt);
    }
  });
  assert.equal(result, "first valid");
  assert.equal(calls, 1);
  assert.equal(attempts[0].validationStatus, "valid");
  assert.equal(attempts[0].providerGenerationId, "gen-1");
});

test("records malformed JSON, makes one locked repair, and accepts its first valid result", async () => {
  const configuration = syntheticFrozenInput().computationalConfiguration;
  const attempts: BenchmarkModelAttempt[] = [];
  const responses = ["not json", '{"value":"repaired"}'];
  const result = await runStructuredMuRequest({
    stage: "mu_review",
    batchId: "batch-1",
    promptReference: meaningUnitPromptReferences.selfReview,
    userPrompt: "synthetic",
    configuration,
    provider: async () => ({ rawResponse: responses.shift()! }),
    parseAndValidate(value) {
      return (value as { value: string }).value;
    },
    recordAttempt(attempt) {
      attempts.push(attempt);
    }
  });
  assert.equal(result, "repaired");
  assert.deepEqual(attempts.map((attempt) => attempt.attemptType), ["initial", "json_repair"]);
  assert.equal(attempts[0].failureCategory, "malformed_json");
  assert.equal(attempts[1].validationStatus, "valid");
});

test("research-facing audit output omits raw and parsed failed responses", () => {
  const [failed, valid] = sanitizeBenchmarkAttemptsForResearchExport([
    {
      validation_status: "invalid",
      raw_response: "sensitive failed response",
      parsed_response: { partial: true },
      failure_category: "schema_invalid",
      attempt_number: 1
    },
    {
      validation_status: "valid",
      raw_response: '{"ok":true}',
      parsed_response: { ok: true },
      attempt_number: 2
    }
  ]);
  assert.equal("raw_response" in failed, false);
  assert.equal("parsed_response" in failed, false);
  assert.equal(failed.failure_category, "schema_invalid");
  assert.equal((valid as { raw_response?: string }).raw_response, '{"ok":true}');
});
