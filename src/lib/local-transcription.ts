import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Project } from "@/lib/types";

const execFileAsync = promisify(execFile);

export interface LocalTranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

export async function transcribeAudioLocally({
  bytes,
  language,
  originalFilename
}: {
  bytes: ArrayBuffer;
  language: Project["language"];
  originalFilename: string;
}): Promise<LocalTranscriptionResult> {
  const tempDir = path.join(os.tmpdir(), "gdiqr-transcription");
  await mkdir(tempDir, { recursive: true });

  const tempPath = path.join(
    tempDir,
    `${Date.now()}-${sanitizeTempFilename(originalFilename)}`
  );

  await writeFile(tempPath, Buffer.from(bytes));

  try {
    const pythonBin = process.env.PYTHON_BIN || "python3";
    const scriptPath = path.join(process.cwd(), "scripts", "transcribe_audio.py");
    const languageCode = language === "Chinese" ? "zh" : "en";

    const { stdout } = await execFileAsync(
      pythonBin,
      [scriptPath, tempPath, languageCode],
      {
        maxBuffer: 1024 * 1024 * 64,
        timeout: Number(process.env.TRANSCRIPTION_TIMEOUT_MS ?? 1800000)
      }
    );

    const parsed = JSON.parse(stdout) as LocalTranscriptionResult;
    if (!parsed.text?.trim()) {
      throw new Error("Local transcription returned an empty transcript.");
    }

    return {
      text: parsed.text.trim(),
      segments: parsed.segments ?? []
    };
  } catch (error) {
    throw new Error(formatTranscriptionError(error));
  } finally {
    await rm(tempPath, { force: true });
  }
}

function sanitizeTempFilename(filename: string) {
  const cleaned = filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");

  return cleaned.length > 0 ? cleaned : "audio-upload";
}

function formatTranscriptionError(error: unknown) {
  const maybeProcessError = error as {
    message?: string;
    stderr?: string;
    stdout?: string;
  };
  const details = [
    maybeProcessError.stderr,
    maybeProcessError.stdout,
    maybeProcessError.message
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  if (details.includes("No module named 'faster_whisper'")) {
    return [
      "Local transcription dependency is missing.",
      "Install it with: python3 -m venv .venv && source .venv/bin/activate && pip install faster-whisper",
      "Then set PYTHON_BIN=.venv/bin/python in .env.local and restart npm run dev."
    ].join(" ");
  }

  return details || "Local transcription failed.";
}
