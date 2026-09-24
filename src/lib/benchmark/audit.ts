export function sanitizeBenchmarkAttemptsForResearchExport<
  T extends {
    validation_status: string;
    raw_response?: unknown;
    parsed_response?: unknown;
  }
>(attempts: T[]) {
  return attempts.map((attempt) => {
    if (attempt.validation_status === "valid") return attempt;
    const { raw_response: _rawResponse, parsed_response: _parsedResponse, ...auditMetadata } = attempt;
    return auditMetadata;
  });
}
