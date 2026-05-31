import fs from "node:fs";
import path from "node:path";

export type RunLogStatus = "running" | "completed" | "failed";

export interface RunLogEvent {
  id: string;
  message: string;
  timestamp: string;
}

export interface RunLog {
  id: string;
  label: string;
  status: RunLogStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  events: RunLogEvent[];
  error?: string;
}

type RunLogStore = {
  logs: RunLog[];
};

const globalWithLogs = globalThis as typeof globalThis & {
  __gdiqrRunLogStore?: RunLogStore;
};

function getLogFilePath() {
  return path.join(process.cwd(), ".next", "gdiqr-run-logs.json");
}

function readStoreFromDisk(): RunLogStore | undefined {
  try {
    const content = fs.readFileSync(getLogFilePath(), "utf8");
    const parsed = JSON.parse(content) as RunLogStore;
    return Array.isArray(parsed.logs) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function persistStore(store: RunLogStore) {
  try {
    const logFilePath = getLogFilePath();
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.writeFileSync(logFilePath, JSON.stringify(store, null, 2));
  } catch {
    // Logs are diagnostic only; never fail the analysis flow because logging failed.
  }
}

function getStore({ reload = false }: { reload?: boolean } = {}) {
  if (reload) {
    const diskStore = readStoreFromDisk();
    if (diskStore) {
      globalWithLogs.__gdiqrRunLogStore = diskStore;
    }
  }

  if (!globalWithLogs.__gdiqrRunLogStore) {
    globalWithLogs.__gdiqrRunLogStore = readStoreFromDisk() ?? { logs: [] };
  }

  return globalWithLogs.__gdiqrRunLogStore;
}

export function startRunLog(label: string) {
  const now = new Date().toISOString();
  const log: RunLog = {
    id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    label,
    status: "running",
    startedAt: now,
    events: [
      {
        id: `event_${Date.now()}`,
        message: "Started",
        timestamp: now
      }
    ]
  };

  const store = getStore({ reload: true });
  store.logs = [log, ...store.logs].slice(0, 40);
  persistStore(store);
  return log.id;
}

export function addRunEvent(runId: string | undefined, message: string) {
  if (!runId) {
    return;
  }

  const store = getStore({ reload: true });
  const log = store.logs.find((item) => item.id === runId);
  if (!log) {
    return;
  }

  log.events.push({
    id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    message,
    timestamp: new Date().toISOString()
  });
  persistStore(store);
}

export function finishRunLog(runId: string | undefined) {
  updateRunLogStatus(runId, "completed");
}

export function failRunLog(runId: string | undefined, error: string) {
  updateRunLogStatus(runId, "failed", error);
}

export function listRunLogs() {
  return getStore({ reload: true }).logs;
}

function updateRunLogStatus(
  runId: string | undefined,
  status: RunLogStatus,
  error?: string
) {
  if (!runId) {
    return;
  }

  const store = getStore({ reload: true });
  const log = store.logs.find((item) => item.id === runId);
  if (!log) {
    return;
  }

  const endedAt = new Date().toISOString();
  log.status = status;
  log.endedAt = endedAt;
  log.durationMs =
    new Date(endedAt).getTime() - new Date(log.startedAt).getTime();
  log.error = error;
  log.events.push({
    id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    message: error ?? `Finished with status: ${status}`,
    timestamp: endedAt
  });
  persistStore(store);
}
