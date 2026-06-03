import { NextRequest, NextResponse } from "next/server";
import {
  defaultProjectId,
  getLocalWorkspace,
  getWorkspace
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";

export async function GET(request: NextRequest) {
  if (isLocalStorageMode()) {
    return NextResponse.json(getLocalWorkspace());
  }

  const projectId =
    request.nextUrl.searchParams.get("projectId") ?? defaultProjectId;
  const workspace = await getWorkspace(projectId);

  return NextResponse.json(workspace);
}
