import { NextResponse } from "next/server";
import { clearRunLogs, listRunLogs } from "@/lib/run-logs";

export async function GET() {
  return NextResponse.json({ logs: listRunLogs() });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const includeRunning = url.searchParams.get("all") === "true";
  return NextResponse.json({
    logs: clearRunLogs({ includeRunning })
  });
}
