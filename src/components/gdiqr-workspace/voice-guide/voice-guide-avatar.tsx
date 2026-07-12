"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Captions,
  Mic,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
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

export interface VoiceGuidanceNoteDraft {
  step: WorkflowStep;
  transcribedQuestion: string;
  spokenAnswer: string;
  captionSummary: string[];
  boundaryReminder: string;
  createdAt: string;
}

interface VoiceGuideAvatarProps {
  projectId: string;
  step: WorkflowStep;
  projectState: VoiceGuideProjectState;
  onSaveGuidanceNote: (note: VoiceGuidanceNoteDraft) => Promise<void>;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
  }>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const stateLabels: Record<VoiceGuideState, string> = {
  idle: "Ready",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Needs attention",
  "captions-only": "Captions only",
};

function getRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function VoiceGuideAvatar({
  projectId,
  step,
  projectState,
  onSaveGuidanceNote,
}: VoiceGuideAvatarProps) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<VoiceGuideState>("idle");
  const [response, setResponse] = useState<VoiceGuideResponse | null>(null);
  const [error, setError] = useState("");
  const [lastQuestion, setLastQuestion] = useState("");
  const [captionsOnly, setCaptionsOnly] = useState(false);
  const [fallbackQuestion, setFallbackQuestion] = useState("");
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const visibleState = useMemo<VoiceGuideState>(
    () => (captionsOnly && state === "idle" ? "captions-only" : state),
    [captionsOnly, state],
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speakAnswer(answer: string) {
    if (captionsOnly || !("speechSynthesis" in window)) {
      setState("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = projectState.project.language?.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en-GB";
    utterance.onstart = () => setState("speaking");
    utterance.onend = () => setState("idle");
    utterance.onerror = () => {
      setCaptionsOnly(true);
      setState("captions-only");
      setError("Audio playback was unavailable. The guidance remains available as captions.");
    };
    window.speechSynthesis.speak(utterance);
  }

  async function submitQuestion(question: string) {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) return;

    setExpanded(true);
    setError("");
    setSaved(false);
    setLastQuestion(normalizedQuestion);
    setState("thinking");

    try {
      const request = await fetch("/api/voice-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          step,
          spokenQuestionTranscript: normalizedQuestion,
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
      speakAnswer(result.spokenAnswer);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Voice Guide could not respond.",
      );
      setState("error");
    }
  }

  function startListening() {
    setExpanded(true);
    setError("");
    setShowTextFallback(false);

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setState("error");
      setShowTextFallback(true);
      setError(
        "Speech recognition is not available in this browser. Use the captions-only text fallback or try the latest Chrome or Edge.",
      );
      return;
    }

    window.speechSynthesis?.cancel();
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = projectState.project.language?.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en-GB";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      recognitionRef.current = null;
      if (!transcript) {
        setState("error");
        setShowTextFallback(true);
        setError("No speech was recognised. Try again or use the text fallback.");
        return;
      }
      void submitQuestion(transcript);
    };

    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setState("error");
      setShowTextFallback(true);
      const permissionMessage =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied. Allow microphone access in the browser, or use the text fallback."
          : `Speech recognition stopped (${event.error}). Try again or use the text fallback.`;
      setError(permissionMessage);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setState((current) => (current === "listening" ? "idle" : current));
    };

    try {
      recognition.start();
      setState("listening");
    } catch {
      recognitionRef.current = null;
      setState("error");
      setShowTextFallback(true);
      setError("The microphone could not start. Try again or use the text fallback.");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setState("idle");
  }

  function replay() {
    if (response) speakAnswer(response.spokenAnswer);
  }

  async function saveNote() {
    if (!response || !lastQuestion || saved || isSaving) return;
    setIsSaving(true);
    setError("");
    try {
      await onSaveGuidanceNote({
        step,
        transcribedQuestion: lastQuestion,
        spokenAnswer: response.spokenAnswer,
        captionSummary: response.captionSummary,
        boundaryReminder: response.boundaryReminder,
        createdAt: new Date().toISOString(),
      });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Guidance note could not be saved.");
      setState("error");
    } finally {
      setIsSaving(false);
    }
  }

  function retry() {
    if (lastQuestion) void submitQuestion(lastQuestion);
    else startListening();
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
              onClick={() => {
                stopListening();
                window.speechSynthesis?.cancel();
                setExpanded(false);
              }}
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

          {state === "listening" && (
            <p className="voice-guide-thinking">Listening for one methodological question…</p>
          )}
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

          {showTextFallback && (
            <form
              className="voice-guide-text-fallback"
              onSubmit={(event) => {
                event.preventDefault();
                void submitQuestion(fallbackQuestion);
              }}
            >
              <label htmlFor="voice-guide-fallback-question">
                Captions-only question fallback
              </label>
              <input
                id="voice-guide-fallback-question"
                onChange={(event) => setFallbackQuestion(event.target.value)}
                placeholder="Type one methodological question"
                value={fallbackQuestion}
              />
              <button
                className="secondary-button"
                disabled={!fallbackQuestion.trim() || state === "thinking"}
                type="submit"
              >
                <Sparkles aria-hidden="true" size={16} /> Ask with captions
              </button>
            </form>
          )}

          {response && (
            <div className="voice-guide-latest-response">
              <span className="label">Latest guide summary</span>
              <ol>
                {response.captionSummary.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              <p className="voice-guide-boundary">{response.boundaryReminder}</p>
              <small>
                {saved
                  ? "Saved as a researcher-selected guidance note."
                  : "This interaction is transient and has not been added to the audit record."}
              </small>
            </div>
          )}

          {!response && !error && state !== "thinking" && state !== "listening" && (
            <p className="small">
              Ask about the purpose of this step, what evidence to inspect, or a
              methodological checklist. The guide will not make the analytic decision
              for you.
            </p>
          )}

          <div className="voice-guide-actions">
            {state === "listening" ? (
              <button className="primary-button" onClick={stopListening} type="button">
                <Square aria-hidden="true" size={16} /> Stop listening
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={state === "thinking" || isSaving}
                onClick={startListening}
                type="button"
              >
                <Mic aria-hidden="true" size={16} />
                {response ? "Ask again" : "Ask guidance"}
              </button>
            )}
            <button
              aria-pressed={captionsOnly}
              className="secondary-button"
              onClick={() => {
                window.speechSynthesis?.cancel();
                setCaptionsOnly((current) => !current);
                setState("idle");
              }}
              type="button"
            >
              <Captions aria-hidden="true" size={16} />
              {captionsOnly ? "Captions on" : "Captions only"}
            </button>
            <button
              className="secondary-button"
              disabled={!response || captionsOnly || state === "thinking"}
              onClick={replay}
              type="button"
            >
              <Volume2 aria-hidden="true" size={16} /> Replay
            </button>
            <button
              className="secondary-button"
              disabled={!response?.canSaveAsGuidanceNote || saved || isSaving}
              onClick={() => void saveNote()}
              type="button"
            >
              <Save aria-hidden="true" size={16} />
              {saved ? "Saved" : isSaving ? "Saving…" : "Save note"}
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
