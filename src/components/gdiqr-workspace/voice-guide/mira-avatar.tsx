interface MiraAvatarProps {
  state: "idle" | "listening" | "thinking" | "speaking" | "error" | "captions-only";
  size?: "compact" | "panel";
}

export function MiraAvatar({ state, size = "compact" }: MiraAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`mira-avatar mira-avatar-${size} mira-avatar-${state}`}
    >
      <span className="mira-avatar-halo" />
      <span className="mira-avatar-hair mira-avatar-hair-back" />
      <span className="mira-avatar-neck" />
      <span className="mira-avatar-shoulders" />
      <span className="mira-avatar-face-shape">
        <span className="mira-avatar-hair mira-avatar-fringe" />
        <span className="mira-avatar-brow mira-avatar-brow-left" />
        <span className="mira-avatar-brow mira-avatar-brow-right" />
        <span className="mira-avatar-eye mira-avatar-eye-left" />
        <span className="mira-avatar-eye mira-avatar-eye-right" />
        <span className="mira-avatar-nose" />
        <span className="mira-avatar-mouth" />
        <span className="mira-avatar-cheek mira-avatar-cheek-left" />
        <span className="mira-avatar-cheek mira-avatar-cheek-right" />
      </span>
      <span className="mira-avatar-state-ring" />
    </span>
  );
}
