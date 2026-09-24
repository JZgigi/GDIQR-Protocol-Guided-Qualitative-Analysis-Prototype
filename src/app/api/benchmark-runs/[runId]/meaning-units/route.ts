import { NextResponse } from "next/server";
import { runMeaningUnitPhase } from "@/lib/benchmark/mu-pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const result = await runMeaningUnitPhase(runId);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meaning Unit phase failed.";
    const status = message.includes("not found")
      ? 404
      : message.includes("already started") || message.includes("read-only")
        ? 409
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
