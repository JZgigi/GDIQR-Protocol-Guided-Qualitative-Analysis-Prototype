"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  | "recording"
  | "transcribing"
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

export interface VoiceGuidanceNoteDraft {
  step: WorkflowStep;
  transcribedQuestion: string;
  spokenAnswer: string;
  captionSummary: string[];
  boundaryReminder: string;
  createdAt: string;
}

interface VoiceGuideHealthResponse {
  reachable: boolean;
  modelAvailable: boolean;
  model: string;
  error?: string;
}

interface VoiceGuideAvatarProps {
  projectId: string;
  step: WorkflowStep;
  projectState: VoiceGuideProjectState;

  /**
   * Legacy compatibility only.
   *
   * Voice Guide interactions are transient in the current design,
   * so this callback is intentionally not called.
   */
  onSaveGuidanceNote?: (note: VoiceGuidanceNoteDraft) => Promise<void>;
}

const stateLabels: Record<VoiceGuideState, string> = {
  idle: "Ready",
  recording: "Recording — click again to send",
  transcribing: "Transcribing locally",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Needs attention",
  "captions-only": "Captions on",
};

function chooseMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
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
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatus>("unknown");
  const [localAiMessage, setLocalAiMessage] = useState("");
  const [conversationHistory, setConversationHistory] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const busyRef = useRef(false);
  const sessionRef = useRef(0);
  const maxDurationTimerRef = useRef<number | null>(null);

  const visibleState = useMemo<VoiceGuideState>(
    () => (captionsEnabled && state === "idle" ? "captions-only" : state),
    [captionsEnabled, state],
  );

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const clearTimer = useCallback(() => {
    if (maxDurationTimerRef.current !== null) {
      window.clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const resetRecorder = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    chunksRef.current = [];
    stopTracks();
    busyRef.current = false;
  }, [clearTimer, stopTracks]);

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
          `Ollama is running, but model \"${result.model}\" is not installed.`,
        );
        return false;
      }
      setLocalAiStatus("ready");
      setLocalAiMessage(`Local AI ready · ${result.model}`);
      return true;
    } catch (caught) {
      setLocalAiStatus("offline");
      setLocalAiMessage(
        caught instanceof Error ? caught.message : "Ollama is not reachable.",
      );
      return false;
    }
  }, []);

  useEffect(() => {
    if (expanded && localAiStatus === "unknown") void checkLocalAi();
  }, [checkLocalAi, expanded, localAiStatus]);

  useEffect(() => {
    const cancelOnEscape = (event: KeyboardEvent) => {
      const recorder = recorderRef.current;
      if (
        event.key !== "Escape" ||
        !recorder ||
        recorder.state !== "recording"
      ) {
        return;
      }

      cancelledRef.current = true;
      sessionRef.current += 1;
      resetRecorder();
      setError("");
      setState("idle");
    };

    window.addEventListener("keydown", cancelOnEscape);
    return () => {
      window.removeEventListener("keydown", cancelOnEscape);
      sessionRef.current += 1;
      resetRecorder();
      window.speechSynthesis?.cancel();
    };
  }, [resetRecorder]);

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
    if (!normalizedQuestion || busyRef.current) return;
    busyRef.current = true;
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
        throw new Error(
          "error" in result && result.error
            ? result.error
            : "Mira could not respond.",
        );
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
      setError(
        caught instanceof Error ? caught.message : "Mira could not respond.",
      );
      setState("error");
    } finally {
      busyRef.current = false;
    }
  }

  async function transcribeAudio(blob: Blob, sessionId: number) {
    if (sessionId !== sessionRef.current || cancelledRef.current) return;
    setState("transcribing");
    try {
      const form = new FormData();
      const extension = blob.type.includes("ogg")
        ? "ogg"
        : blob.type.includes("mp4")
          ? "m4a"
          : "webm";
      form.append("audio", blob, `voice-question.${extension}`);
      form.append("language", projectState.project.language ?? "");
      const request = await fetch("/api/voice-guide/transcribe", {
        method: "POST",
        body: form,
      });
      const result = (await request.json().catch(() => ({}))) as {
        transcript?: string;
        error?: string;
      };
      if (!request.ok || !result.transcript?.trim()) {
        throw new Error(
          result.error ??
            "No speech was recognised. Click Record and try again.",
        );
      }
      await submitQuestion(result.transcript);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Local transcription failed.",
      );
      setState("error");
    }
  }

  async function startRecording() {
    if (
      busyRef.current ||
      state === "transcribing" ||
      state === "thinking" ||
      state === "speaking"
    )
      return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Audio recording is unavailable in this browser. Use the latest Chrome or Edge.",
      );
      setState("error");
      return;
    }

    sessionRef.current += 1;
    const sessionId = sessionRef.current;
    cancelledRef.current = false;
    chunksRef.current = [];
    setExpanded(true);
    setError("");
    window.speechSynthesis?.cancel();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sessionId !== sessionRef.current || cancelledRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const mimeType = chooseMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        if (sessionId !== sessionRef.current || cancelledRef.current) return;
        resetRecorder();
        setError("The browser could not record audio. Please try again.");
        setState("error");
      };

      recorder.onstop = () => {
        clearTimer();
        const chunks = [...chunksRef.current];
        const outputType = recorder.mimeType || mimeType || "audio/webm";
        recorderRef.current = null;
        chunksRef.current = [];
        stopTracks();
        if (sessionId !== sessionRef.current || cancelledRef.current) {
          setState("idle");
          return;
        }
        const blob = new Blob(chunks, { type: outputType });
        if (blob.size < 256) {
          setError("No usable audio was recorded. Click Record and try again.");
          setState("error");
          return;
        }
        void transcribeAudio(blob, sessionId);
      };

      recorder.start(250);
      setState("recording");
      maxDurationTimerRef.current = window.setTimeout(() => {
        if (recorderRef.current?.state === "recording")
          recorderRef.current.stop();
      }, 90000);
    } catch (caught) {
      resetRecorder();
      const message =
        caught instanceof DOMException && caught.name === "NotAllowedError"
          ? "Microphone permission was denied. Allow microphone access and try again."
          : "The microphone could not start. Please try again.";
      setError(message);
      setState("error");
    }
  }

  function stopRecordingAndSend() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    clearTimer();
    recorder.stop();
  }

  function toggleRecording() {
    if (state === "recording") stopRecordingAndSend();
    else void startRecording();
  }

  function cancelRecording() {
    cancelledRef.current = true;
    sessionRef.current += 1;
    resetRecorder();
    setError("");
    setState("idle");
  }

  function dismissError() {
    cancelRecording();
  }

  function replay() {
    if (response) speakAnswer(response.spokenAnswer);
  }

  const localAiNeedsAttention =
    localAiStatus === "offline" || localAiStatus === "model-missing";

  return (
    <aside className={`${styles.shell} ${styles[visibleState]}`}>
      {expanded && (
        <section
          aria-label="Mira qualitative analysis guide"
          className={styles.panel}
        >
          <header className={styles.header}>
            <div className={styles.identity}>
              <MiraAvatar
                size="panel"
                state={
                  visibleState === "recording" ||
                  visibleState === "transcribing"
                    ? "listening"
                    : visibleState
                }
              />
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
                cancelRecording();
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
            Mira is focused on helping you work with qualitative data through
            the current analysis stage.
          </div>

          {localAiStatus !== "unknown" && (
            <div
              className={
                localAiNeedsAttention ? styles.error : styles.stagePrompt
              }
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
                  onClick={() => void checkLocalAi()}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" size={15} /> Check Ollama again
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
            aria-label={
              state === "recording"
                ? "Stop recording and send to Mira"
                : "Start recording a question for Mira"
            }
            aria-pressed={state === "recording"}
            className={styles.holdButton}
            disabled={
              state === "transcribing" ||
              state === "thinking" ||
              state === "speaking"
            }
            onClick={toggleRecording}
            type="button"
          >
            <Mic aria-hidden="true" size={24} />
            <span>
              <strong>
                {state === "recording"
                  ? "Recording… click to stop and send"
                  : state === "transcribing"
                    ? "Transcribing locally…"
                    : "Record question"}
              </strong>
              <small>
                {state === "recording"
                  ? "Click again to send · Esc cancels"
                  : "Click once to start"}
              </small>
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
            Audio is transcribed locally, deleted immediately, and is not saved
            to the project.
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
        <MiraAvatar
          state={
            visibleState === "recording" || visibleState === "transcribing"
              ? "listening"
              : visibleState
          }
        />
        <span>
          <strong>Mira</strong>
          <small>{stateLabels[visibleState]}</small>
        </span>
      </button>
    </aside>
  );
}
