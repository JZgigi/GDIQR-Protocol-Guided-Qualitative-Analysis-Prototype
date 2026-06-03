import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai-provider";
import { getWorkspace } from "@/lib/gdiqr-repository";
import {
  getOllamaConnectionErrorMessage,
  getOllamaModel,
  getOllamaModelsUrl
} from "@/lib/ollama-config";

export async function GET() {
  const provider = getAiProvider();
  const workspace = await getWorkspace();
  const ollama = await checkOllamaHealth();

  return NextResponse.json({
    aiProvider: provider,
    ollama,
    supabase: {
      configured: workspace.supabaseConfigured,
      dataSource: workspace.dataSource,
      projectId: workspace.project.id,
      meaningUnits: workspace.meaningUnits.length,
      categories: workspace.categories.length,
      reviewerComments: workspace.reviewerComments.length
    }
  });
}

async function checkOllamaHealth() {
  try {
    const response = await fetch(getOllamaModelsUrl(), {
      signal: AbortSignal.timeout(5000)
    });

    return {
      ok: response.ok,
      model: getOllamaModel(),
      status: response.status
    };
  } catch {
    return {
      ok: false,
      error: getOllamaConnectionErrorMessage()
    };
  }
}
