import { NextResponse } from "next/server";
import { buildBenchmarkJsonExport } from "@/lib/benchmark/export";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await context.params;
    const payload = await buildBenchmarkJsonExport(runId);
    if (!payload) {
      return NextResponse.json(
        { error: "Benchmark run was not found." },
        { status: 404 }
      );
    }
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="benchmark-${runId}.json"`,
        "Content-Type": "application/json; charset=utf-8"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Benchmark export failed."
      },
      { status: 500 }
    );
  }
}
