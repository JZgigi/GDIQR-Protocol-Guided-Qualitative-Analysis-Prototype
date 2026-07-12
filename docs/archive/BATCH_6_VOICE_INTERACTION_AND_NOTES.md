# Batch 6 — Voice interaction and saved guidance notes

This batch completes Tickets 26–27.

## Delivered

- Browser speech recognition for short Voice Guide questions, using `SpeechRecognition` / `webkitSpeechRecognition` when available.
- Browser text-to-speech through `speechSynthesis`, with replay and captions-only controls.
- Permission, recognition, and TTS fallbacks. A compact text input is shown only when voice recognition is unavailable or fails.
- Raw microphone audio is not uploaded or stored by the application.
- Unsaved interactions remain transient.
- Researchers may explicitly save the latest response as a guidance note.
- Saved notes reuse the existing guidance memo record and therefore appear in JSON, TXT, DOCX, PDF-oriented text output, and the audit trail.
- Voice-selected saves use the audit action type `voice_guidance_note_saved`.

## Browser scope

The voice-first path is intended for current desktop Chrome and Edge. Other browsers retain the captions-only fallback. Browser speech-recognition implementations may use browser-vendor services; the app itself does not persist raw audio. Researchers working under strict local-only governance should use captions-only mode unless their approved environment permits browser speech recognition.

## Manual checks

1. Permit microphone access and ask a short methodological question.
2. Confirm the recognised transcript receives a boundary-aware response.
3. Confirm speech playback, replay, mute/captions-only, and close/stop behaviour.
4. Deny microphone access and confirm the text fallback appears.
5. Save one response and confirm the audit trail and export include it.
6. Ask another question without saving and confirm it does not enter the audit/export record.
