import { NextResponse } from "next/server";
import { getBenchmarkRun } from "@/lib/benchmark/repository";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const bundle = await getBenchmarkRun(runId);
    if (!bundle) {
      return NextResponse.json(
        { error: "Benchmark run was not found." },
        { status: 404 }
      );
    }
    return NextResponse.json(bundle, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Benchmark run load failed."
      },
      { status: 500 }
    );
  }
}
