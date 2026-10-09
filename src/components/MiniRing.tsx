import React from "react";

/**
 * A small score ring for a figure that is "x out of 100".
 *
 * Display only: it draws a number that is already on screen. The arc runs
 * counter-clockwise from twelve o'clock so it fills the way the Arabic line
 * reads (the CSS mirrors it; `.mini-ring` carries the geometry and tones).
 * `value` of null draws the empty track (used while a reading loads).
 */
export type MiniRingTone = "good" | "warn" | "bad" | "idle";

export const miniRingTone = (value: number | null | undefined): MiniRingTone =>
  value == null || !Number.isFinite(value) ? "idle" : value >= 85 ? "good" : value >= 70 ? "warn" : "bad";

const R = 15;
const C = 2 * Math.PI * R;

export default function MiniRing({ value, size = 38, label, className, children, decorative }: {
  value: number | null | undefined;
  size?: number;
  /** Spoken name, e.g. «الجودة». The score itself is appended. */
  label?: string;
  className?: string;
  /** Replaces the number in the middle (used by the skeleton). */
  children?: React.ReactNode;
  /** The number is already read out beside it, so the ring stays silent. */
  decorative?: boolean;
}) {
  const known = value != null && Number.isFinite(Number(value));
  const clamped = known ? Math.max(0, Math.min(100, Number(value))) : 0;
  const tone = miniRingTone(known ? Number(value) : null);
  return (
    <span
      className={`mini-ring tone-${tone}${known ? "" : " is-pending"}${className ? ` ${className}` : ""}`}
      style={{ ["--ring-size" as any]: `${size}px` }}
      {...(known && !decorative ? { role: "img", "aria-label": `${label ? `${label} ` : ""}${clamped} من 100` } : { "aria-hidden": true })}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
        <circle className="ring-track" cx="18" cy="18" r={R} />
        {known ? (
          <circle className="ring-fill" cx="18" cy="18" r={R} strokeDasharray={`${(clamped / 100) * C} ${C}`} style={{ ["--ring-dash" as any]: `${(clamped / 100) * C} ${C}` }} />
        ) : null}
      </svg>
      <b>{children ?? (known ? Math.round(clamped) : null)}</b>
    </span>
  );
}

/** `"80/100"` → ring; anything else → null so callers keep their own text. */
export function ringFromScoreText(metric: unknown, label?: string): React.ReactNode {
  const match = /^\s*(\d{1,3}(?:\.\d+)?)\s*\/\s*100\s*$/.exec(String(metric ?? ""));
  return match ? <MiniRing value={Number(match[1])} label={label} /> : null;
}
