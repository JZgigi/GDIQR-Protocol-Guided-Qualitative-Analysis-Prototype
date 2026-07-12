# Batch 8 — Conversational Ollama Voice Agent

## Purpose

Batch 8 changes the Voice Guide from a fixed readiness-check responder into a conversational local AI companion. Ollama is now the normal response engine. The structured GDI-QR knowledge base remains the methodological grounding and analytic-decision boundary, rather than the only set of topics the user may discuss.

## Conversation modes

The server routes each question into one of these broad modes:

- casual conversation
- general support
- app help
- methodology explanation
- workflow guidance
- analytic decision request

Casual conversation is answered naturally without forcing workflow checks into the response. Methodology and workflow questions receive the relevant GDI-QR guidance and current project context. Analytic-decision requests retain deterministic safeguards: the assistant may help the researcher inspect evidence but must not make the final judgement.

## Short-term context

The browser sends only the latest eight user/assistant messages to support natural follow-up questions. This history is transient and is not written to Supabase, audit logs, or exports. Only an explicitly saved guidance note is persisted.

## Provider and fallback

Successful responses report `provider: ollama-conversational`. When Ollama is unavailable or returns unusable output, the API reports `provider: structured-gdiqr-fallback` and includes a fallback reason. The fallback is intentionally less conversational but keeps the methodological boundary available.

## Privacy

- The local Ollama endpoint is used for response generation.
- Raw microphone audio is not stored by the app.
- Short-term conversation history remains browser memory only.
- Saved notes continue to use the existing researcher-selected guidance memo pathway.
- Browser speech recognition may still involve browser-vendor processing and should not be used for sensitive data unless approved.
