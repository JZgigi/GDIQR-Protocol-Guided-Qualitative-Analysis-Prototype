import { NextRequest, NextResponse } from "next/server";
import { createBenchmarkRun } from "@/lib/benchmark/repository";
import { validateCreateBenchmarkRunInput } from "@/lib/benchmark/contracts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = validateCreateBenchmarkRunInput(body);
    const run = await createBenchmarkRun(input);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Benchmark run creation failed.";
    const status =
      message.includes("required") ||
      message.includes("prohibited") ||
      message.includes("Invalid") ||
      message.includes("Duplicate") ||
      message.includes("exactly one")
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
