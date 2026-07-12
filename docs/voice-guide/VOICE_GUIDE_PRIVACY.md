# Voice Guide privacy boundary

- Voice Guide interactions are transient unless the researcher explicitly chooses **Save note**.
- The application does not persist raw microphone audio.
- The browser speech-recognition capability converts a short question to text. Browser-vendor implementations may process speech through vendor services; this is outside the application's storage layer.
- For strict local-only or sensitive-data workflows, use captions-only text fallback unless browser speech recognition is explicitly approved in the research environment.
- The transcribed question is sent to `/api/voice-guide` with the minimum workflow context needed to provide methodological guidance.
- The guide API does not save the question, answer, or selected context.
- A saved note contains the transcribed question, answer text, caption summary, boundary reminder, workflow step, and timestamp.
- Saved notes enter the guidance memo record, audit trail, and analysis export.
- Unsaved interactions do not enter the project record.
