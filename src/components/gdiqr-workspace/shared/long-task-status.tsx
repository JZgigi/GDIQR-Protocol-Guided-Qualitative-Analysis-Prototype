"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, RefreshCcw } from "lucide-react";

function formatElapsed(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function LongTaskStatus({
  active,
  estimatedRangeSeconds,
  fallbackNotice,
  onRetry,
  phase,
  title,
}: {
  active: boolean;
  estimatedRangeSeconds: readonly [number, number];
  fallbackNotice?: string;
  onRetry?: () => void;
  phase: string;
  title: string;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) {
      setStartedAt(null);
      return;
    }
    setStartedAt((current) => current ?? Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  const elapsedSeconds = useMemo(
    () => (startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0),
    [now, startedAt],
  );

  if (!active) return null;

  const [minimum, maximum] = estimatedRangeSeconds;
  const estimate =
    elapsedSeconds < minimum
      ? `Usually ${formatElapsed(minimum)}–${formatElapsed(maximum)}`
      : elapsedSeconds <= maximum
        ? `Within the usual ${formatElapsed(minimum)}–${formatElapsed(maximum)} range`
        : `Longer than the usual ${formatElapsed(maximum)} range`;

  return (
    <aside className="long-task-status" aria-live="polite" role="status">
      <div className="long-task-status-heading">
        <div>
          <span className="label">Processing</span>
          <strong>{title}</strong>
        </div>
        <span className="long-task-elapsed">
          <Clock3 size={16} /> {formatElapsed(elapsedSeconds)} elapsed
        </span>
      </div>
      <p className="small">{phase}</p>
      <div className="long-task-meter" aria-hidden="true">
        <span />
      </div>
      <div className="long-task-status-footer">
        <span className="small">Estimated time: {estimate}. This is approximate.</span>
        {onRetry && elapsedSeconds > maximum && (
          <button className="button" onClick={onRetry} type="button">
            <RefreshCcw size={16} /> Retry
          </button>
        )}
      </div>
      {fallbackNotice && <p className="small warning-text">{fallbackNotice}</p>}
    </aside>
  );
}
