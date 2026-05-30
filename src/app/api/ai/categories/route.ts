import { NextRequest, NextResponse } from "next/server";
import { runMockCategories } from "@/lib/mock-ai";
import type { CategoryMode } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    mode?: CategoryMode;
  };
  return NextResponse.json(runMockCategories(body.mode ?? "A"));
}
