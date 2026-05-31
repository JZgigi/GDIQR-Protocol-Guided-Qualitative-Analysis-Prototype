import { NextResponse } from "next/server";
import { getAiProvider } from "@/lib/ai-provider";
import { getWorkspace } from "@/lib/gdiqr-repository";

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
  const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1";

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
      signal: AbortSignal.timeout(5000)
    });

    return {
      ok: response.ok,
      model: process.env.OLLAMA_MODEL ?? "qwen3:8b",
      status: response.status
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Ollama health failed."
    };
  }
}
