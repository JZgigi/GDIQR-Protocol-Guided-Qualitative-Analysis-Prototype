import styles from "./voice-guide-focused.module.css";

interface MiraAvatarProps {
  state: "idle" | "listening" | "thinking" | "speaking" | "error" | "captions-only";
  size?: "compact" | "panel";
}

export function MiraAvatar({ state, size = "compact" }: MiraAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.cgAvatar} ${styles[size]} ${styles[state]}`}
    >
      <img alt="" src="/voice-guide/mira-cg.png" />
      <span className={styles.cgOverlay} />
      <span className={styles.cgRing} />
      {state === "speaking" && <span className={styles.speakingPulse} />}
    </span>
  );
}
