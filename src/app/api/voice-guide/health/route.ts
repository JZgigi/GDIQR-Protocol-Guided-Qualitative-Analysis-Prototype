import { NextResponse } from "next/server";
import {
  getOllamaModel,
  getOllamaModelsUrl,
} from "@/lib/ollama-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const model = getOllamaModel();

  try {
    const response = await fetch(getOllamaModelsUrl(), {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          reachable: false,
          modelAvailable: false,
          model,
          error: `Ollama health check returned HTTP ${response.status}.`,
        },
        { status: 503 },
      );
    }

    const body = (await response.json().catch(() => ({}))) as {
      data?: Array<{ id?: string }>;
      models?: Array<{ name?: string; model?: string }>;
    };

    const installedModels = [
      ...(body.data ?? []).map((item) => item.id ?? ""),
      ...(body.models ?? []).flatMap((item) => [
        item.name ?? "",
        item.model ?? "",
      ]),
    ].filter(Boolean);

    const modelAvailable = installedModels.some(
      (installed) =>
        installed === model ||
        installed.startsWith(`${model}:`) ||
        model.startsWith(`${installed}:`),
    );

    return NextResponse.json({
      reachable: true,
      modelAvailable,
      model,
      installedModels,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Ollama health check timed out."
        : "Ollama is not reachable from the Next.js server.";

    return NextResponse.json(
      {
        reachable: false,
        modelAvailable: false,
        model,
        error: message,
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
