import { NextRequest, NextResponse } from "next/server";
import { processTranscriptForPrivacyAndSpeakers } from "@/lib/ai-provider";
import {
  completeTranscriptionJob,
  defaultProjectId,
  failTranscriptionJob,
  getWorkspace,
  uploadAudioForTranscription
} from "@/lib/gdiqr-repository";
import { transcribeAudioLocally } from "@/lib/local-transcription";
import {
  addRunEvent,
  failRunLog,
  finishRunLog,
  startRunLog
} from "@/lib/run-logs";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const maxAudioBytes = 500 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const runId = startRunLog("Audio upload + transcription");
  const formData = await request.formData();
  const file = formData.get("file");
  const projectId = String(formData.get("projectId") ?? defaultProjectId);
  const language = normalizeLanguage(formData.get("language"));

  if (!(file instanceof File)) {
    failRunLog(runId, "Missing audio file.");
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }

  if (file.size <= 0) {
    failRunLog(runId, "Audio file is empty.");
    return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
  }

  if (file.size > maxAudioBytes) {
    failRunLog(runId, "Audio file is larger than the 500 MB local test limit.");
    return NextResponse.json(
      { error: "Audio file is larger than the 500 MB local test limit." },
      { status: 400 }
    );
  }

  const contentType = file.type || "application/octet-stream";
  if (!isAllowedAudioUpload(file.name, contentType)) {
    failRunLog(runId, "Unsupported audio format.");
    return NextResponse.json(
      {
        error:
          "Unsupported audio format. Please use mp3, m4a, wav, mp4, webm, ogg, or aac."
      },
      { status: 400 }
    );
  }

  addRunEvent(runId, `Received ${file.name} (${formatBytes(file.size)})`);
  const bytes = await file.arrayBuffer();
  addRunEvent(runId, "Uploading audio to Supabase Storage");
  const uploadResult = await uploadAudioForTranscription({
    bytes,
    contentType,
    language,
    originalFilename: file.name,
    projectId,
    sizeBytes: file.size
  });

  if (!uploadResult.uploaded || !uploadResult.job) {
    failRunLog(runId, uploadResult.reason ?? "Supabase upload failed.");
    return NextResponse.json(
      { error: uploadResult.reason ?? "Supabase upload failed." },
      { status: 500 }
    );
  }

  try {
    const whisperStartedAt = Date.now();
    addRunEvent(
      runId,
      `Starting faster-whisper transcription with ${process.env.WHISPER_MODEL ?? "small"}`
    );
    const transcription = await transcribeAudioLocally({
      bytes,
      language,
      originalFilename: file.name
    });
    addRunEvent(
      runId,
      `faster-whisper completed in ${formatDuration(Date.now() - whisperStartedAt)} (${transcription.text.length} chars)`
    );
    const privacyStartedAt = Date.now();
    addRunEvent(runId, "Starting Ollama privacy/speaker transcript processing");
    const preparedTranscript = await processTranscriptForPrivacyAndSpeakers({
      language,
      runId,
      transcript: transcription.text,
      transcriptionSegments: transcription.segments
    });
    addRunEvent(
      runId,
      `Privacy/speaker processing completed in ${formatDuration(Date.now() - privacyStartedAt)}`
    );
    addRunEvent(runId, "Saving prepared transcript to Supabase");
    const result = await completeTranscriptionJob({
      jobId: uploadResult.job.id,
      language,
      projectId,
      transcript: preparedTranscript.sanitizedTranscript,
      versionLabel: `Local transcription + privacy review: ${file.name}`
    });
    const workspace = await getWorkspace(projectId);
    finishRunLog(runId);

    return NextResponse.json({
      uploaded: true,
      transcribed: true,
      audioFile: uploadResult.audioFile,
      job: result.job,
      privacyFindings: preparedTranscript.privacyFindings,
      speakerNotes: preparedTranscript.speakerNotes,
      workspace
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local transcription failed.";
    failRunLog(runId, message);
    const failedJob = await failTranscriptionJob({
      errorMessage: message,
      jobId: uploadResult.job.id,
      projectId
    });
    const workspace = await getWorkspace(projectId);

    return NextResponse.json({
      uploaded: true,
      transcribed: false,
      audioFile: uploadResult.audioFile,
      job: failedJob.job,
      error: message,
      workspace
    });
  }
}

function normalizeLanguage(value: FormDataEntryValue | null) {
  return value === "Chinese" ? "Chinese" : "English";
}

function isAllowedAudioUpload(filename: string, contentType: string) {
  if (contentType.startsWith("audio/")) {
    return true;
  }

  if (contentType === "video/mp4" || contentType === "application/octet-stream") {
    return /\.(mp3|m4a|wav|mp4|webm|ogg|aac)$/i.test(filename);
  }

  return false;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
