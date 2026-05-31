import { NextRequest, NextResponse } from "next/server";
import {
  completeTranscriptionJob,
  defaultProjectId,
  failTranscriptionJob,
  getWorkspace,
  uploadAudioForTranscription
} from "@/lib/gdiqr-repository";
import { transcribeAudioLocally } from "@/lib/local-transcription";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const maxAudioBytes = 500 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const projectId = String(formData.get("projectId") ?? defaultProjectId);
  const language = normalizeLanguage(formData.get("language"));

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "Audio file is empty." }, { status: 400 });
  }

  if (file.size > maxAudioBytes) {
    return NextResponse.json(
      { error: "Audio file is larger than the 500 MB local test limit." },
      { status: 400 }
    );
  }

  const contentType = file.type || "application/octet-stream";
  if (!isAllowedAudioUpload(file.name, contentType)) {
    return NextResponse.json(
      {
        error:
          "Unsupported audio format. Please use mp3, m4a, wav, mp4, webm, ogg, or aac."
      },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const uploadResult = await uploadAudioForTranscription({
    bytes,
    contentType,
    language,
    originalFilename: file.name,
    projectId,
    sizeBytes: file.size
  });

  if (!uploadResult.uploaded || !uploadResult.job) {
    return NextResponse.json(
      { error: uploadResult.reason ?? "Supabase upload failed." },
      { status: 500 }
    );
  }

  try {
    const transcription = await transcribeAudioLocally({
      bytes,
      language,
      originalFilename: file.name
    });
    const result = await completeTranscriptionJob({
      jobId: uploadResult.job.id,
      language,
      projectId,
      transcript: transcription.text,
      versionLabel: `Local transcription: ${file.name}`
    });
    const workspace = await getWorkspace(projectId);

    return NextResponse.json({
      uploaded: true,
      transcribed: true,
      audioFile: uploadResult.audioFile,
      job: result.job,
      workspace
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local transcription failed.";
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
