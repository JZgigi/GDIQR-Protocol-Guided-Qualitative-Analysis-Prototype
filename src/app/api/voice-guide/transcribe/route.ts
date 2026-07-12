import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const TRANSCRIPTION_TIMEOUT_MS = 120000;

function pythonCommand() {
  const configured = process.env.VOICE_GUIDE_PYTHON?.trim();
  if (configured) return configured;
  const windowsVenv = join(process.cwd(), ".venv", "Scripts", "python.exe");
  if (existsSync(windowsVenv)) return windowsVenv;
  const posixVenv = join(process.cwd(), ".venv", "bin", "python");
  if (existsSync(posixVenv)) return posixVenv;
  return process.platform === "win32" ? "python" : "python3";
}

function runTranscriber(audioPath: string, language: string) {
  return new Promise<string>((resolve, reject) => {
    const script = join(process.cwd(), "scripts", "transcribe_voice_guide.py");
    const args = [script, audioPath, language];
    const child = spawn(pythonCommand(), args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Local transcription timed out."));
    }, TRANSCRIPTION_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Could not start local transcription: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Local transcription exited with code ${code}.`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim()) as { transcript?: string; error?: string };
        if (!parsed.transcript?.trim()) throw new Error(parsed.error ?? "No speech was recognised.");
        resolve(parsed.transcript.trim());
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not read transcription output."));
      }
    });
  });
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const audio = form.get("audio");
  const language = String(form.get("language") ?? "");
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "An audio recording is required." }, { status: 400 });
  }
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "The recording is empty or too large." }, { status: 400 });
  }

  const workDir = join(tmpdir(), "gdiqr-voice-guide");
  await mkdir(workDir, { recursive: true });
  const safeExtension = audio.name.toLowerCase().endsWith(".ogg") ? ".ogg" : audio.name.toLowerCase().endsWith(".m4a") ? ".m4a" : ".webm";
  const tempPath = join(workDir, `${randomUUID()}${safeExtension}`);
  try {
    await writeFile(tempPath, Buffer.from(await audio.arrayBuffer()));
    const transcript = await runTranscriber(tempPath, language);
    return NextResponse.json({ transcript, persisted: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Local transcription failed." }, { status: 500 });
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}
