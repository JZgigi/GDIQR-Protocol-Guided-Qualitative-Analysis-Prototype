import { NextRequest, NextResponse } from "next/server";
import { defaultProjectId, getWorkspace } from "@/lib/gdiqr-repository";

export async function GET(request: NextRequest) {
  const projectId =
    request.nextUrl.searchParams.get("projectId") ?? defaultProjectId;
  const workspace = await getWorkspace(projectId);

  return NextResponse.json(workspace);
}
