"use client";

import { useMemo, useState } from "react";
import { Bot, Captions, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import type { WorkflowStep } from "@/lib/types";
import type { VoiceGuideProjectState } from "@/lib/guidance/voice-guide-context";

type VoiceGuideState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "captions-only";

interface VoiceGuideResponse {
  spokenAnswer: string;
  captionSummary: string[];
  boundaryReminder: string;
  suggestedChecks: string[];
  canSaveAsGuidanceNote: boolean;
  persisted: boolean;
  provider: string;
}

interface VoiceGuideAvatarProps {
  projectId: string;
  step: WorkflowStep;
  projectState: VoiceGuideProjectState;
}

const stateLabels: Record<VoiceGuideState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Needs attention",
  "captions-only": "Captions only",
};

export function VoiceGuideAvatar({
  projectId,
  step,
  projectState,
}: VoiceGuideAvatarProps) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<VoiceGuideState>("idle");
  const [response, setResponse] = useState<VoiceGuideResponse | null>(null);
  const [error, setError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [captionsOnly, setCaptionsOnly] = useState(false);

  const visibleState = useMemo<VoiceGuideState>(
    () => (captionsOnly && state === "idle" ? "captions-only" : state),
    [captionsOnly, state],
  );

  async function askGuide() {
    setExpanded(true);
    setError("");
    setState("listening");

    const question = window.prompt(
      "Voice input arrives in the next batch. For this UI test, type the methodological question you would ask aloud.",
      lastQuestion,
    );

    if (!question?.trim()) {
      setState("idle");
      return;
    }

    setLastQuestion(question.trim());
    setState("thinking");

    try {
      const request = await fetch("/api/voice-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          step,
          spokenQuestionTranscript: question.trim(),
          projectState,
        }),
      });
      const result = (await request.json().catch(() => ({}))) as
        | VoiceGuideResponse
        | { error?: string };
      if (!request.ok || !("spokenAnswer" in result)) {
        const message = "error" in result ? result.error : undefined;
        throw new Error(message ?? "Voice Guide could not respond.");
      }

      setResponse(result);
      setState("speaking");
      window.setTimeout(() => setState("idle"), 700);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Voice Guide could not respond.",
      );
      setState("error");
    }
  }

  function retry() {
    void askGuide();
  }

  return (
    <aside className={`voice-guide-avatar voice-guide-state-${visibleState}`}>
      {expanded && (
        <section
          aria-label="Voice Guide"
          aria-live="polite"
          className="voice-guide-popover"
        >
          <header className="voice-guide-popover-header">
            <div>
              <span className="voice-guide-eyebrow">Methodological reflection</span>
              <h2>Voice Guide</h2>
            </div>
            <button
              aria-label="Close Voice Guide"
              className="icon-button"
              onClick={() => setExpanded(false)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div className="voice-guide-status-line">
            <span className="voice-guide-status-dot" aria-hidden="true" />
            <strong>{stateLabels[visibleState]}</strong>
            <span>· {step.replace("-", " ")}</span>
          </div>

          {state === "thinking" && (
            <p className="voice-guide-thinking">
              Checking the current workflow state and GDI-QR guidance…
            </p>
          )}

          {error && (
            <div className="voice-guide-error" role="alert">
              <p>{error}</p>
              <button className="secondary-button" onClick={retry} type="button">
                <RotateCcw aria-hidden="true" size={16} /> Retry
              </button>
            </div>
          )}

          {response && !error && (
            <div className="voice-guide-latest-response">
              <span className="label">Latest guide summary</span>
              <ol>
                {response.captionSummary.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              <p className="voice-guide-boundary">{response.boundaryReminder}</p>
              <small>
                This interaction is transient and has not been added to the audit
                record.
              </small>
            </div>
          )}

          {!response && !error && state !== "thinking" && (
            <p className="small">
              Ask about the purpose of this step, what evidence to inspect, or a
              methodological checklist. The guide will not make the analytic
              decision for you.
            </p>
          )}

          <div className="voice-guide-actions">
            <button
              className="primary-button"
              disabled={state === "thinking" || state === "listening"}
              onClick={() => void askGuide()}
              type="button"
            >
              <Sparkles aria-hidden="true" size={16} />
              {response ? "Ask again" : "Ask guidance"}
            </button>
            <button
              aria-pressed={captionsOnly}
              className="secondary-button"
              onClick={() => setCaptionsOnly((current) => !current)}
              type="button"
            >
              <Captions aria-hidden="true" size={16} />
              {captionsOnly ? "Captions on" : "Captions only"}
            </button>
            <button
              className="secondary-button"
              disabled={!response}
              title="Audio replay is enabled in the next voice-interaction batch."
              type="button"
            >
              <Volume2 aria-hidden="true" size={16} /> Replay
            </button>
          </div>
        </section>
      )}

      <button
        aria-expanded={expanded}
        aria-label={expanded ? "Voice Guide is open" : "Open Voice Guide"}
        className="voice-guide-avatar-button"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <span className="voice-guide-avatar-face" aria-hidden="true">
          <Bot size={30} />
        </span>
        <span className="voice-guide-avatar-copy">
          <strong>AI Guide</strong>
          <small>{stateLabels[visibleState]}</small>
        </span>
      </button>
    </aside>
  );
}
