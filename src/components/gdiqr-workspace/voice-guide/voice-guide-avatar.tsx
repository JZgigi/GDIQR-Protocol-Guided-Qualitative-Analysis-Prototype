"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Captions,
  Mic,
  RefreshCw,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { WorkflowStep } from "@/lib/types";
import type { VoiceGuideProjectState } from "@/lib/guidance/voice-guide-context";
import { MiraAvatar } from "./mira-avatar";
import styles from "./voice-guide-focused.module.css";

type VoiceGuideState =
  | "idle"
  | "listening"
  | "stopping"
  | "thinking"
  | "speaking"
  | "error"
  | "captions-only";

type LocalAiStatus =
  | "unknown"
  | "checking"
  | "ready"
  | "offline"
  | "model-missing";

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

interface VoiceGuideHealthResponse {
  reachable: boolean;
  modelAvailable: boolean;
  model: string;
  error?: string;
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
  resultIndex?: number;
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
  stopping: "Finishing your question",
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
  const [localAiStatus, setLocalAiStatus] =
    useState<LocalAiStatus>("unknown");
  const [localAiMessage, setLocalAiMessage] = useState("");
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");
  const holdingRef = useRef(false);
  const releaseRequestedRef = useRef(false);
  const cancelledRef = useRef(false);
  const sessionRef = useRef(0);
  const submittingRef = useRef(false);

  const visibleState = useMemo<VoiceGuideState>(
    () => (captionsEnabled && state === "idle" ? "captions-only" : state),
    [captionsEnabled, state],
  );

  const detachRecognition = useCallback(
    (recognition: SpeechRecognitionLike | null) => {
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    },
    [],
  );

  const abortRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    detachRecognition(recognition);
    try {
      recognition.abort?.();
    } catch {
      // The browser may already have ended the recognition session.
    }
  }, [detachRecognition]);

  const resetRecognitionSession = useCallback(() => {
    abortRecognition();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    holdingRef.current = false;
    releaseRequestedRef.current = false;
    cancelledRef.current = false;
    submittingRef.current = false;
  }, [abortRecognition]);

  const checkLocalAi = useCallback(async () => {
    setLocalAiStatus("checking");
    setLocalAiMessage("");
    try {
      const request = await fetch("/api/voice-guide/health", {
        cache: "no-store",
      });
      const result = (await request.json().catch(() => ({}))) as
        | VoiceGuideHealthResponse
        | { error?: string };

      if (!request.ok || !("reachable" in result)) {
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "Local AI health check failed.",
        );
      }

      if (!result.reachable) {
        setLocalAiStatus("offline");
        setLocalAiMessage(
          result.error ??
            "Ollama is not reachable. Start Ollama, then check again.",
        );
        return false;
      }

      if (!result.modelAvailable) {
        setLocalAiStatus("model-missing");
        setLocalAiMessage(
          `Ollama is running, but model "${result.model}" is not installed.`,
        );
        return false;
      }

      setLocalAiStatus("ready");
      setLocalAiMessage(`Local AI ready · ${result.model}`);
      return true;
    } catch (caught) {
      setLocalAiStatus("offline");
      setLocalAiMessage(
        caught instanceof Error
          ? caught.message
          : "Ollama is not reachable. Start Ollama and check again.",
      );
      return false;
    }
  }, []);

  useEffect(() => {
    if (expanded && localAiStatus === "unknown") {
      void checkLocalAi();
    }
  }, [checkLocalAi, expanded, localAiStatus]);

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!holdingRef.current && state !== "stopping") return;

      sessionRef.current += 1;
      cancelledRef.current = true;
      resetRecognitionSession();
      setError("");
      setState("idle");
    };

    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape);
      sessionRef.current += 1;
      resetRecognitionSession();
      window.speechSynthesis?.cancel();
    };
  }, [resetRecognitionSession, state]);

  function speakAnswer(answer: string) {
    if (muted || !("speechSynthesis" in window)) {
      setState("idle");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(answer);
    utterance.lang = projectState.project.language
      ?.toLowerCase()
      .startsWith("zh")
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
    if (submittingRef.current) return;

    submittingRef.current = true;
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

      if (result.provider === "ollama-conversational") {
        setLocalAiStatus("ready");
        setLocalAiMessage(`Local AI ready · ${result.model ?? "Ollama"}`);
      } else if (result.fallbackReason) {
        setLocalAiStatus("offline");
        setLocalAiMessage(result.fallbackReason);
      }

      speakAnswer(result.spokenAnswer);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mira could not respond.");
      setState("error");
    } finally {
      submittingRef.current = false;
    }
  }

  function collectedTranscript() {
    return `${finalTranscriptRef.current} ${interimTranscriptRef.current}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function finishSession(sessionId: number) {
    if (sessionId !== sessionRef.current || cancelledRef.current) return;
    const transcript = collectedTranscript();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    releaseRequestedRef.current = false;
    recognitionRef.current = null;

    if (!transcript) {
      setError("No speech was recognised. Hold the button and try again.");
      setState("error");
      return;
    }

    void submitQuestion(transcript);
  }

  function startRecognitionCycle(sessionId: number) {
    if (
      sessionId !== sessionRef.current ||
      cancelledRef.current ||
      !holdingRef.current
    ) {
      return;
    }

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      holdingRef.current = false;
      setError(
        "Hold-to-talk speech recognition is unavailable in this browser. Use the latest Chrome or Edge.",
      );
      setState("error");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = projectState.project.language
      ?.toLowerCase()
      .startsWith("zh")
      ? "zh-CN"
      : "en-GB";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      if (sessionId !== sessionRef.current || cancelledRef.current) return;

      let interim = "";
      const startIndex = event.resultIndex ?? 0;
      for (let index = startIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim() ?? "";
        if (!transcript) continue;
        if (result.isFinal) {
          finalTranscriptRef.current = `${finalTranscriptRef.current} ${transcript}`
            .replace(/\s+/g, " ")
            .trim();
        } else {
          interim = `${interim} ${transcript}`.trim();
        }
      }
      interimTranscriptRef.current = interim;
    };

    recognition.onerror = (event) => {
      if (sessionId !== sessionRef.current || cancelledRef.current) return;

      const recoverable =
        event.error === "no-speech" ||
        event.error === "aborted" ||
        event.error === "audio-capture";

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        holdingRef.current = false;
        releaseRequestedRef.current = false;
        recognitionRef.current = null;
        setError(
          "Microphone permission was denied. Allow microphone access and try again.",
        );
        setState("error");
        return;
      }

      if (!recoverable) {
        holdingRef.current = false;
        releaseRequestedRef.current = false;
        recognitionRef.current = null;
        setError(
          `Speech recognition stopped (${event.error}). Hold to talk and try again.`,
        );
        setState("error");
      }
    };

    recognition.onend = () => {
      detachRecognition(recognition);
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      if (sessionId !== sessionRef.current || cancelledRef.current) return;

      if (holdingRef.current && !releaseRequestedRef.current) {
        window.setTimeout(() => startRecognitionCycle(sessionId), 60);
        return;
      }

      finishSession(sessionId);
    };

    try {
      recognition.start();
      setState("listening");
    } catch {
      detachRecognition(recognition);
      recognitionRef.current = null;
      holdingRef.current = false;
      releaseRequestedRef.current = false;
      setError("The microphone could not start. Hold the button and try again.");
      setState("error");
    }
  }

  function beginHoldToTalk(event: ReactPointerEvent<HTMLButtonElement>) {
    if (
      state === "thinking" ||
      state === "speaking" ||
      state === "stopping"
    ) {
      return;
    }

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort on older browsers.
    }

    sessionRef.current += 1;
    resetRecognitionSession();
    const sessionId = sessionRef.current;

    setExpanded(true);
    setError("");
    window.speechSynthesis?.cancel();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    cancelledRef.current = false;
    releaseRequestedRef.current = false;
    holdingRef.current = true;
    startRecognitionCycle(sessionId);
  }

  function releaseToSend(event?: ReactPointerEvent<HTMLButtonElement>) {
    if (!holdingRef.current || releaseRequestedRef.current) return;

    if (event) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already have been released.
      }
    }

    holdingRef.current = false;
    releaseRequestedRef.current = true;
    setState("stopping");

    const recognition = recognitionRef.current;
    if (!recognition) {
      finishSession(sessionRef.current);
      return;
    }

    try {
      recognition.stop();
    } catch {
      finishSession(sessionRef.current);
    }
  }

  function cancelListening() {
    sessionRef.current += 1;
    cancelledRef.current = true;
    resetRecognitionSession();
    setError("");
    setState("idle");
  }

  function dismissError() {
    sessionRef.current += 1;
    resetRecognitionSession();
    setError("");
    setState("idle");
  }

  function replay() {
    if (response) speakAnswer(response.spokenAnswer);
  }

  const localAiNeedsAttention =
    localAiStatus === "offline" || localAiStatus === "model-missing";

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

          {localAiStatus !== "unknown" && (
            <div
              className={localAiNeedsAttention ? styles.error : styles.stagePrompt}
              role={localAiNeedsAttention ? "alert" : undefined}
            >
              <p>
                {localAiStatus === "checking"
                  ? "Checking local AI…"
                  : localAiMessage}
              </p>
              {localAiNeedsAttention && (
                <button
                  className={styles.secondaryButton}
                  disabled={localAiStatus === "checking"}
                  onClick={() => void checkLocalAi()}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  Check Ollama again
                </button>
              )}
            </div>
          )}

          {error && (
            <div className={styles.error} role="alert">
              <p>{error}</p>
              <button
                className={styles.secondaryButton}
                onClick={dismissError}
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
                <small>{response.fallbackReason}</small>
              )}
            </div>
          )}

          <button
            aria-label="Hold to talk to Mira"
            className={styles.holdButton}
            disabled={
              state === "thinking" ||
              state === "speaking" ||
              state === "stopping"
            }
            onLostPointerCapture={() => {
              if (holdingRef.current) releaseToSend();
            }}
            onPointerCancel={() => cancelListening()}
            onPointerDown={beginHoldToTalk}
            onPointerUp={releaseToSend}
            type="button"
          >
            <Mic aria-hidden="true" size={24} />
            <span>
              <strong>
                {state === "listening"
                  ? "Listening… release to send"
                  : state === "stopping"
                    ? "Finishing your question…"
                    : "Hold to talk"}
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
