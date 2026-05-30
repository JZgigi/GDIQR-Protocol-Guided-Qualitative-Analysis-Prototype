import { NextResponse } from "next/server";
import { runMockReviewer } from "@/lib/mock-ai";

export async function POST() {
  return NextResponse.json(runMockReviewer());
}
