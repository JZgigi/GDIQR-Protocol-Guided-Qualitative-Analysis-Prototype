# Voice Guide privacy and retention

## Batch 4

- The guide API receives a transcribed question, not raw audio.
- The request is transient and is not written to guidance memos, audit logs, or exports.
- In Supabase mode, project state is retrieved server-side.
- In local-only mode, the browser sends only the current project snapshot needed to create context.
- The response exposes a limited context summary rather than echoing full project material.

## Later voice interaction

Raw microphone audio must not be stored. Only a researcher-selected saved guidance note may enter the project record. Unselected interactions must remain transient.
