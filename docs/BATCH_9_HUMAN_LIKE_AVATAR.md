# Batch 9 — Human-like Mira avatar experience

## Scope

This batch changes the floating Voice Guide from a generic robot icon into an original, human-like 2D research companion named Mira. It does not change the GDI-QR knowledge base, analytic boundaries, persistence, or Supabase schema.

## Experience changes

- Original CSS-drawn human-like avatar; no third-party image or biometric likeness.
- Separate compact and panel avatar sizes.
- Visual states for idle, listening, thinking, speaking, error, and captions-only.
- Subtle listening ring, thinking glance, and speaking mouth movement.
- Reduced-motion mode disables non-essential animation.
- Browser TTS voice selector, with a language-aware default when a compatible voice is available.
- Slightly slower, warmer speech rate and pitch settings.

## Privacy and accessibility

The avatar is decorative and marked `aria-hidden`; all state information remains available as text. Voice selection is local browser state and is not persisted. This batch stores no image, video, raw audio, or additional user data.

## Acceptance checks

1. Mira appears as a human-like illustrated character rather than a robot glyph.
2. Listening, thinking, and speaking are visually distinguishable.
3. The mouth changes only while TTS is speaking.
4. A browser voice can be selected and replay uses the selected voice.
5. Captions-only remains functional.
6. With reduced motion enabled, the avatar remains usable without continuous animation.
7. The floating control and popover remain usable at mobile widths.
