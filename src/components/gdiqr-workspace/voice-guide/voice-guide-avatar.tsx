"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Captions, Mic, RotateCcw, Volume2, VolumeX, X } from "lucide-react";
import type { WorkflowStep } from "@/lib/types";
import type { VoiceGuideProjectState } from "@/lib/guidance/voice-guide-context";
import { MiraAvatar } from "./mira-avatar";
import styles from "./voice-guide-focused.module.css";

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
  conversationIntent?: string;
  model?: string;
  fallbackReason?: string;
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
  onSaveGuidanceNote?: (note: VoiceGuidanceNoteDraft) => Promise<void>;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
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
  abort?: () => void;
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
  listening: "Listening — release to send",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Needs attention",
  "captions-only": "Captions on",
};

function getRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function VoiceGuideAvatar({
  projectId,
  step,
  projectState,
}: VoiceGuideAvatarProps) {
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<VoiceGuideState>("idle");
  const [response, setResponse] = useState<VoiceGuideResponse | null>(null);
  const [error, setError] = useState("");
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  const holdingRef = useRef(false);
  const cancelledRef = useRef(false);

  const visibleState = useMemo<VoiceGuideState>(
    () => (captionsEnabled && state === "idle" ? "captions-only" : state),
    [captionsEnabled, state],
  );

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !holdingRef.current) return;
      cancelledRef.current = true;
      holdingRef.current = false;
      recognitionRef.current?.abort?.();
      recognitionRef.current = null;
      transcriptRef.current = "";
      setState("idle");
    };

    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape);
      recognitionRef.current?.abort?.();
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speakAnswer(answer: string) {
    if (muted || !("speechSynthesis" in window)) {
      setState("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = projectState.project.language?.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en-GB";
    utterance.rate = 1.02;
    utterance.pitch = 1;
    utterance.onstart = () => setState("speaking");
    utterance.onend = () => setState("idle");
    utterance.onerror = () => {
      setMuted(true);
      setState("idle");
      setError("Voice playback was unavailable. You can turn on captions.");
    };
    window.speechSynthesis.speak(utterance);
  }

  async function submitQuestion(question: string) {
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion) {
      setError("No speech was recognised. Hold the button and try again.");
      setState("error");
      return;
    }

    setExpanded(true);
    setError("");
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
          conversationHistory,
        }),
      });
      const result = (await request.json().catch(() => ({}))) as
        | VoiceGuideResponse
        | { error?: string };

      if (!request.ok || !("spokenAnswer" in result)) {
        const message = "error" in result ? result.error : undefined;
        throw new Error(message ?? "Mira could not respond.");
      }

      setResponse(result);
      setConversationHistory((current) =>
        [
          ...current,
          { role: "user" as const, content: normalizedQuestion },
          { role: "assistant" as const, content: result.spokenAnswer },
        ].slice(-4),
      );
      speakAnswer(result.spokenAnswer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mira could not respond.");
      setState("error");
    }
  }

  function createRecognition() {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setError(
        "Hold-to-talk speech recognition is unavailable in this browser. Use the latest Chrome or Edge.",
      );
      setState("error");
      return null;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = projectState.project.language?.toLowerCase().startsWith("zh")
      ? "zh-CN"
      : "en-GB";

    recognition.onresult = (event) => {
      transcriptRef.current = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };

    recognition.onerror = (event) => {
      if (cancelledRef.current) return;
      holdingRef.current = false;
      recognitionRef.current = null;
      setState("error");
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied. Allow microphone access and try again."
          : `Speech recognition stopped (${event.error}). Hold to talk and try again.`,
      );
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (cancelledRef.current) {
        cancelledRef.current = false;
        transcriptRef.current = "";
        setState("idle");
        return;
      }

      if (holdingRef.current) {
        try {
          recognition.start();
          recognitionRef.current = recognition;
          return;
        } catch {
          holdingRef.current = false;
        }
      }

      const transcript = transcriptRef.current;
      transcriptRef.current = "";
      void submitQuestion(transcript);
    };

    return recognition;
  }

  function beginHoldToTalk(event: React.PointerEvent<HTMLButtonElement>) {
    if (state === "thinking" || state === "speaking") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setExpanded(true);
    setError("");
    window.speechSynthesis?.cancel();
    transcriptRef.current = "";
    cancelledRef.current = false;
    holdingRef.current = true;

    const recognition = createRecognition();
    if (!recognition) {
      holdingRef.current = false;
      return;
    }

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState("listening");
    } catch {
      recognitionRef.current = null;
      holdingRef.current = false;
      setState("error");
      setError("The microphone could not start. Please try again.");
    }
  }

  function releaseToSend() {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    recognitionRef.current?.stop();
  }

  function cancelListening() {
    if (!holdingRef.current) return;
    cancelledRef.current = true;
    holdingRef.current = false;
    recognitionRef.current?.abort?.();
    recognitionRef.current = null;
    transcriptRef.current = "";
    setState("idle");
  }

  function replay() {
    if (response) speakAnswer(response.spokenAnswer);
  }

  return (
    <aside className={`${styles.shell} ${styles[visibleState]}`}>
      {expanded && (
        <section aria-label="Mira qualitative analysis guide" className={styles.panel}>
          <header className={styles.header}>
            <div className={styles.identity}>
              <MiraAvatar size="panel" state={visibleState} />
              <div>
                <span>Focused qualitative analysis guide</span>
                <h2>Mira</h2>
                <p>Five-stage GDI-QR-informed support</p>
              </div>
            </div>
            <button
              aria-label="Close Mira"
              className={styles.iconButton}
              onClick={() => {
                cancelListening();
                window.speechSynthesis?.cancel();
                setExpanded(false);
              }}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div className={styles.status} aria-live="polite">
            <span aria-hidden="true" />
            <strong>{stateLabels[visibleState]}</strong>
            <small>{step.replace("-", " ")}</small>
          </div>

          <div className={styles.stagePrompt}>
            Mira is focused on helping you work with qualitative data through the
            current analysis stage.
          </div>

          {error && (
            <div className={styles.error} role="alert">
              <p>{error}</p>
              <button
                className={styles.secondaryButton}
                onClick={() => setError("")}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={15} /> Dismiss
              </button>
            </div>
          )}

          {captionsEnabled && response && (
            <div className={styles.captionBox}>
              <span>Mira</span>
              <p>{response.spokenAnswer}</p>
              {response.fallbackReason && (
                <small>
                  Structured fallback used because Ollama was unavailable.
                </small>
              )}
            </div>
          )}

          <button
            aria-label="Hold to talk to Mira"
            className={styles.holdButton}
            disabled={state === "thinking" || state === "speaking"}
            onPointerCancel={cancelListening}
            onPointerDown={beginHoldToTalk}
            onPointerLeave={(event) => {
              if (event.buttons === 0) releaseToSend();
            }}
            onPointerUp={releaseToSend}
            type="button"
          >
            <Mic aria-hidden="true" size={24} />
            <span>
              <strong>
                {state === "listening" ? "Listening… release to send" : "Hold to talk"}
              </strong>
              <small>Press Esc to cancel</small>
            </span>
          </button>

          <div className={styles.controls}>
            <button
              aria-pressed={muted}
              className={styles.secondaryButton}
              onClick={() => {
                window.speechSynthesis?.cancel();
                setMuted((current) => !current);
                setState("idle");
              }}
              type="button"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              {muted ? "Unmute" : "Mute"}
            </button>

            <button
              aria-pressed={captionsEnabled}
              className={styles.secondaryButton}
              onClick={() => setCaptionsEnabled((current) => !current)}
              type="button"
            >
              <Captions size={16} />
              {captionsEnabled ? "Hide captions" : "Show captions"}
            </button>

            <button
              className={styles.secondaryButton}
              disabled={!response || muted || state === "thinking"}
              onClick={replay}
              type="button"
            >
              <Volume2 size={16} /> Replay
            </button>
          </div>

          <small className={styles.privacyNote}>
            Voice interactions are transient and are not saved to the project.
          </small>
        </section>
      )}

      <button
        aria-expanded={expanded}
        aria-label={expanded ? "Mira is open" : "Open Mira"}
        className={styles.launcher}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <MiraAvatar state={visibleState} />
        <span>
          <strong>Mira</strong>
          <small>{stateLabels[visibleState]}</small>
        </span>
      </button>
    </aside>
  );
}
