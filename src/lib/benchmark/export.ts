import { getBenchmarkRun } from "./repository.ts";

export const benchmarkExportSchemaVersion = "benchmark-v1.0";

export async function buildBenchmarkJsonExport(runId: string) {
  const bundle = await getBenchmarkRun(runId);
  if (!bundle) {
    return null;
  }
  return {
    exportSchemaVersion: benchmarkExportSchemaVersion,
    exportedAt: new Date().toISOString(),
    ...bundle
  };
}
