import fs from "node:fs";
import path from "node:path";
import type {
  MeaningUnit,
  MeaningUnitGenerationCounts,
  MeaningUnitGenerationMethod,
} from "@/lib/types";

export interface MeaningUnitJobResult {
  counts: MeaningUnitGenerationCounts;
  fallbackUsed: boolean;
  generationMethod: MeaningUnitGenerationMethod | "mixed";
  meaningUnits: MeaningUnit[];
  model?: string;
  persisted: boolean;
  provider: string;
}

export interface MeaningUnitJobRecord {
  error?: string;
  result?: MeaningUnitJobResult;
  runId: string;
  status: "running" | "completed" | "failed";
  updatedAt: string;
}

interface MeaningUnitJobStore {
  jobs: MeaningUnitJobRecord[];
}

const globalWithMeaningUnitJobs = globalThis as typeof globalThis & {
  __gdiqrMeaningUnitJobControllers?: Map<string, AbortController>;
  __gdiqrMeaningUnitJobStore?: MeaningUnitJobStore;
};

function getJobFilePath() {
  return path.join(process.cwd(), ".next", "gdiqr-meaning-unit-jobs.json");
}

function readStoreFromDisk(): MeaningUnitJobStore | undefined {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(getJobFilePath(), "utf8"),
    ) as MeaningUnitJobStore;
    return Array.isArray(parsed.jobs) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function persistStore(store: MeaningUnitJobStore) {
  try {
    const filePath = getJobFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(store));
  } catch {
    // Job persistence is a local recovery aid; run-log failure handling remains authoritative.
  }
}

function getStore({ reload = false }: { reload?: boolean } = {}) {
  if (reload) {
    const diskStore = readStoreFromDisk();
    if (diskStore) {
      globalWithMeaningUnitJobs.__gdiqrMeaningUnitJobStore = diskStore;
    }
  }
  if (!globalWithMeaningUnitJobs.__gdiqrMeaningUnitJobStore) {
    globalWithMeaningUnitJobs.__gdiqrMeaningUnitJobStore =
      readStoreFromDisk() ?? { jobs: [] };
  }
  return globalWithMeaningUnitJobs.__gdiqrMeaningUnitJobStore;
}

function getControllers() {
  globalWithMeaningUnitJobs.__gdiqrMeaningUnitJobControllers ??= new Map();
  return globalWithMeaningUnitJobs.__gdiqrMeaningUnitJobControllers;
}

export function startMeaningUnitJob(
  runId: string,
  controller: AbortController,
) {
  const store = getStore({ reload: true });
  const job: MeaningUnitJobRecord = {
    runId,
    status: "running",
    updatedAt: new Date().toISOString(),
  };
  store.jobs = [
    job,
    ...store.jobs.filter((job) => job.runId !== runId),
  ].slice(0, 8);
  getControllers().set(runId, controller);
  persistStore(store);
}

export function completeMeaningUnitJob(
  runId: string,
  result: MeaningUnitJobResult,
) {
  updateMeaningUnitJob(runId, {
    result,
    status: "completed",
  });
}

export function failMeaningUnitJob(runId: string, error: string) {
  updateMeaningUnitJob(runId, { error, status: "failed" });
}

export function getMeaningUnitJob(runId: string) {
  return getStore({ reload: true }).jobs.find((job) => job.runId === runId);
}

export function cancelMeaningUnitJob(runId: string) {
  const controller = getControllers().get(runId);
  if (!controller) {
    return false;
  }
  controller.abort();
  return true;
}

function updateMeaningUnitJob(
  runId: string,
  update: Pick<MeaningUnitJobRecord, "status"> &
    Partial<Pick<MeaningUnitJobRecord, "error" | "result">>,
) {
  const store = getStore({ reload: true });
  const job = store.jobs.find((item) => item.runId === runId);
  if (!job) {
    return;
  }
  Object.assign(job, update, { updatedAt: new Date().toISOString() });
  getControllers().delete(runId);
  persistStore(store);
}
