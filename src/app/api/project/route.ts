import { NextRequest, NextResponse } from "next/server";
import {
  createProject,
  defaultProjectId,
  listProjects,
  updateProjectSettings
} from "@/lib/gdiqr-repository";
import { isLocalStorageMode } from "@/lib/storage-mode";
import type { Project } from "@/lib/types";

export async function GET() {
  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({ projects: [] });
    }

    return NextResponse.json({ projects: await listProjects() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Project list failed."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    dataSource?: Project["dataSource"];
    dataSuitabilityConfirmed?: boolean;
    datasetType?: Project["datasetType"];
    language?: Project["language"];
    lightInterpretation?: boolean;
    researcherNotes?: string;
    researchQuestion?: string;
    studyDescription?: string;
    title?: string;
  };

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json(
        {
          created: false,
          persisted: false,
          reason:
            "Local-only mode stores project setup in browser state, not Supabase."
        },
        { status: 400 }
      );
    }

    const title = body.title?.trim() ?? "";
    const researchQuestion = body.researchQuestion?.trim() ?? "";
    const studyDescription = body.studyDescription?.trim() ?? "";
    const researcherNotes = body.researcherNotes?.trim() ?? "";
    const datasetType = body.datasetType ?? "open";
    const dataSource = body.dataSource ?? "other";

    if (!title || !researchQuestion || !studyDescription || !researcherNotes) {
      return NextResponse.json(
        {
          error:
            "Project title, research question, study description, and researcher notes are required."
        },
        { status: 400 }
      );
    }

    if (!body.dataSuitabilityConfirmed) {
      return NextResponse.json(
        {
          error:
            "Confirm that the dataset is open, public, or anonymised before creating a v1.0 research-release project."
        },
        { status: 400 }
      );
    }

    if (datasetType === "identifiable_sensitive") {
      return NextResponse.json(
        {
          error:
            "Identifiable sensitive data is not supported in the cloud-assisted v1.0 research release. Use an approved secure/local deployment before uploading that data."
        },
        { status: 400 }
      );
    }

    const result = await createProject({
      dataSource,
      dataSuitabilityConfirmed: true,
      datasetType,
      language: body.language === "Chinese" ? "Chinese" : "English",
      lightInterpretation: Boolean(body.lightInterpretation),
      researcherNotes,
      researchQuestion,
      studyDescription,
      title
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Project creation failed."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    dataSource?: Project["dataSource"];
    dataSuitabilityConfirmed?: boolean;
    datasetType?: Project["datasetType"];
    language?: Project["language"];
    lightInterpretation?: boolean;
    projectId?: string;
    researcherNotes?: string;
    researchQuestion?: string;
    studyDescription?: string;
    title?: string;
  };

  try {
    if (isLocalStorageMode()) {
      return NextResponse.json({
        saved: false,
        persisted: false,
        reason:
          "Local-only mode stores project setup in browser state, not Supabase."
      });
    }

    if (
      body.dataSuitabilityConfirmed &&
      body.datasetType === "identifiable_sensitive"
    ) {
      return NextResponse.json(
        {
          error:
            "Identifiable sensitive data is not supported in the cloud-assisted v1.0 research release. Use an approved secure/local deployment before uploading that data."
        },
        { status: 400 }
      );
    }

    const result = await updateProjectSettings({
      dataSource: body.dataSource,
      dataSuitabilityConfirmed: body.dataSuitabilityConfirmed,
      datasetType: body.datasetType,
      language: body.language === "Chinese" ? "Chinese" : "English",
      lightInterpretation: Boolean(body.lightInterpretation),
      projectId: body.projectId ?? defaultProjectId,
      researcherNotes: body.researcherNotes,
      researchQuestion: body.researchQuestion ?? "",
      studyDescription: body.studyDescription ?? "",
      title: body.title ?? ""
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Project update failed."
      },
      { status: 500 }
    );
  }
}
