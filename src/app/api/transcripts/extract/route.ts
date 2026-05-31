import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { NextRequest, NextResponse } from "next/server";

const execFileAsync = promisify(execFile);
const supportedExtensions = new Set([
  ".docx",
  ".md",
  ".pdf",
  ".srt",
  ".txt",
  ".vtt"
]);

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Transcript file is required." },
      { status: 400 }
    );
  }

  const extension = path.extname(file.name).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    return NextResponse.json(
      {
        error:
          "Unsupported transcript file type. Use .txt, .md, .vtt, .srt, .docx, or .pdf."
      },
      { status: 400 }
    );
  }

  const tempPath = path.join(
    os.tmpdir(),
    `gdiqr-transcript-${randomUUID()}${extension}`
  );

  try {
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
    const { stdout } = await execFileAsync(
      process.env.PYTHON_BIN ?? "python3",
      [path.join(process.cwd(), "scripts", "extract_transcript_file.py"), tempPath],
      {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120000
      }
    );

    const transcript = stdout.trim();
    if (!transcript) {
      return NextResponse.json(
        { error: "No readable transcript text was found in this file." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      filename: file.name,
      transcript
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Transcript file extraction failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined);
  }
}
