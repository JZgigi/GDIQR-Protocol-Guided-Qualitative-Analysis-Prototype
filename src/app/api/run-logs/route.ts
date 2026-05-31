import { NextResponse } from "next/server";
import { listRunLogs } from "@/lib/run-logs";

export async function GET() {
  return NextResponse.json({ logs: listRunLogs() });
}
