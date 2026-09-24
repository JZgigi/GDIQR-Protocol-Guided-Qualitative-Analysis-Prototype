import { getOllamaChatCompletionsUrl } from "../ollama-config.ts";
import { sha256 } from "./hash.ts";
import {
  JSON_REPAIR_PROMPT_TEMPLATE,
  MU_SYSTEM_PROMPT,
  meaningUnitPromptReferences
} from "./mu-prompts.ts";
import { MeaningUnitValidationError } from "./mu-validation.ts";
import type {
  BenchmarkFailureCategory,
  BenchmarkModelAttempt,
  BenchmarkStageKind,
  ComputationalConfigurationSnapshot,
  PromptTemplateReference
} from "./types.ts";

export interface BenchmarkMuProviderResponse {
  rawResponse: string;
  providerGenerationId?: string;
  providerResponseModel?: string;
}

export type BenchmarkMuProvider = (input: {
  systemPrompt: string;
  userPrompt: string;
  configuration: ComputationalConfigurationSnapshot;
  stage: BenchmarkStageKind;
}) => Promise<BenchmarkMuProviderResponse>;

export interface StructuredMuRequest<T> {
  stage: "mu_draft" | "mu_review" | "mu_final";
  batchId: string;
  promptReference: PromptTemplateReference;
  userPrompt: string;
  configuration: ComputationalConfigurationSnapshot;
  parseAndValidate: (value: unknown) => T;
  recordAttempt: (attempt: BenchmarkModelAttempt) => Promise<void> | void;
  provider?: BenchmarkMuProvider;
}

function extractJsonObject(raw: string) {
  const stripped = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new MeaningUnitValidationError(
      "Model response did not contain a JSON object.",
      "malformed_json"
    );
  }
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as unknown;
  } catch (error) {
    throw new MeaningUnitValidationError(
      `Model response contained malformed JSON: ${error instanceof Error ? error.message : "parse failed"}`,
      "malformed_json"
    );
  }
}

function failureDetails(error: unknown): {
  category: BenchmarkFailureCategory;
  message: string;
} {
  if (error instanceof MeaningUnitValidationError) {
    return { category: error.category, message: error.message };
  }
  const message = error instanceof Error ? error.message : "Model request failed.";
  return {
    category: /timeout|timed out|abort/i.test(message) ? "timeout" : "transport_failure",
    message
  };
}

export const callLockedOllama: BenchmarkMuProvider = async ({
  systemPrompt,
  userPrompt,
  configuration,
  stage
}) => {
  if (configuration.provider !== "ollama") {
    throw new Error(`Unsupported locked benchmark provider: ${configuration.provider}.`);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), configuration.requestTimeoutMs);
  try {
    const maxTokens =
      configuration.tokenLimits[stage] ??
      configuration.tokenLimits.meaningUnits ??
      configuration.tokenLimits.default;
    if (!Number.isInteger(maxTokens) || maxTokens < 1) {
      throw new Error(`No valid locked token limit exists for ${stage}.`);
    }
    const response = await fetch(getOllamaChatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: configuration.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: configuration.temperature,
        ...(configuration.seed === undefined ? {} : { seed: configuration.seed }),
        options: {
          num_predict: maxTokens,
          ...(configuration.seed === undefined ? {} : { seed: configuration.seed })
        },
        response_format: { type: "json_object" },
        stream: false
      })
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed with HTTP ${response.status}.`);
    }
    const body = (await response.json()) as {
      id?: string;
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawResponse = body.choices?.[0]?.message?.content;
    if (!rawResponse) {
      throw new Error("Ollama returned no response content.");
    }
    return {
      rawResponse,
      providerGenerationId: body.id,
      providerResponseModel: body.model
    };
  } finally {
    clearTimeout(timeout);
  }
};

export async function runStructuredMuRequest<T>(request: StructuredMuRequest<T>): Promise<T> {
  const provider = request.provider ?? callLockedOllama;
  const normalCalls = 1 + request.configuration.technicalRetryCount;
  let attemptNumber = 0;
  let lastError = "Model request failed.";
  let repairUsed = false;

  const execute = async (
    attemptType: BenchmarkModelAttempt["attemptType"],
    promptReference: PromptTemplateReference,
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ value?: T; raw?: string; failure?: BenchmarkFailureCategory }> => {
    attemptNumber += 1;
    const started = Date.now();
    const requestHash = sha256({
      stage: request.stage,
      batchId: request.batchId,
      model: request.configuration.model,
      modelDigest: request.configuration.modelDigest,
      temperature: request.configuration.temperature,
      seed: request.configuration.seed,
      systemPrompt,
      userPrompt
    });
    let response: BenchmarkMuProviderResponse | undefined;
    let parsed: unknown;
    try {
      response = await provider({
        systemPrompt,
        userPrompt,
        configuration: request.configuration,
        stage: request.stage
      });
      parsed = extractJsonObject(response.rawResponse);
      const value = request.parseAndValidate(parsed);
      await request.recordAttempt({
        stage: request.stage,
        batchId: request.batchId,
        attemptNumber,
        attemptType,
        promptTemplateVersion: promptReference.version,
        promptTemplateHash: promptReference.hash,
        requestHash,
        rawResponse: response.rawResponse,
        parsedResponse: parsed,
        validationStatus: "valid",
        durationMs: Date.now() - started,
        providerGenerationId: response.providerGenerationId,
        providerResponseModel: response.providerResponseModel
      });
      return { value, raw: response.rawResponse };
    } catch (error) {
      const failure =
        response && !(error instanceof MeaningUnitValidationError)
          ? {
              category: "schema_invalid" as const,
              message: error instanceof Error ? error.message : "Response validation failed."
            }
          : failureDetails(error);
      lastError = failure.message;
      await request.recordAttempt({
        stage: request.stage,
        batchId: request.batchId,
        attemptNumber,
        attemptType,
        promptTemplateVersion: promptReference.version,
        promptTemplateHash: promptReference.hash,
        requestHash,
        rawResponse: response?.rawResponse,
        parsedResponse: parsed,
        validationStatus: "invalid",
        failureCategory: failure.category,
        error: failure.message,
        durationMs: Date.now() - started,
        providerGenerationId: response?.providerGenerationId,
        providerResponseModel: response?.providerResponseModel
      });
      return { raw: response?.rawResponse, failure: failure.category };
    }
  };

  for (let call = 0; call < normalCalls; call += 1) {
    const result = await execute(
      call === 0 ? "initial" : "technical_retry",
      request.promptReference,
      MU_SYSTEM_PROMPT,
      request.userPrompt
    );
    if (result.value !== undefined) return result.value;

    if (
      result.failure === "malformed_json" &&
      result.raw &&
      request.configuration.jsonRepairEnabled &&
      !repairUsed
    ) {
      repairUsed = true;
      const repair = await execute(
        "json_repair",
        request.configuration.jsonRepairPrompt ?? meaningUnitPromptReferences.jsonRepair,
        MU_SYSTEM_PROMPT,
        `${JSON_REPAIR_PROMPT_TEMPLATE}\n\nREQUESTED TASK AND SCHEMA:\n${request.userPrompt}\n\nINVALID RESPONSE:\n${result.raw}`
      );
      if (repair.value !== undefined) return repair.value;
    }
  }
  throw new MeaningUnitValidationError(
    `Locked technical retry policy exhausted: ${lastError}`,
    "semantic_validation_failure"
  );
}
