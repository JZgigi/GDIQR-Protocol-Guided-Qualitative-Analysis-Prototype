import { NextResponse } from "next/server";
import { runMockMeaningUnits } from "@/lib/mock-ai";

export async function POST() {
  return NextResponse.json(runMockMeaningUnits());
}
