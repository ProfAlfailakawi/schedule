import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_START,
  scheduleClockForDisplay,
} from "../utils/scheduleTime";

/**
 * ── عدّاد الوقت المشترك ─────────────────────────────────────────────────────
 *
 * The wheel counter the quick-add card opens on — three columns of real values
 * (the hour, the minute, the length) with the end time read back live — is the
 * one time control this product is proud of. It used to live inside the
 * quick-add file alone, so the full editor fell back to a bare `<input
 * type="time">` and lost the counter entirely. It lives here now so both the
 * card and the editor open the same wheel from the same code.
 */

const minutesOf = (time: string) => {
  const [h, m] = String(time || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * One column of a wheel.
 *
 * A native `<input type="time">` is two silent number fields and a stepper the
 * hand has to find; a column of real values is a place to look. The chosen row
 * is scrolled to the middle rather than merely marked, so the eye lands on the
 * answer before it reads any of the alternatives.
 *
 * It is buttons, not a custom control: every row is reachable by Tab, speaks
 * its own value, and needs no keyboard handling of its own.
 */
export function Wheel({
  label,
  values,
  value,
  format,
  onPick,
}: {
  label: string;
  values: number[];
  value: number;
  format: (v: number) => string;
  onPick: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const chosen = box.querySelector<HTMLElement>("[data-on='true']");
    if (!chosen) return;
    // Centring by arithmetic rather than scrollIntoView, which would also drag
    // the page itself to the popover on some engines.
    box.scrollTop = chosen.offsetTop - box.clientHeight / 2 + chosen.clientHeight / 2;
  }, [value, values.length]);
  return (
    <div className="qc-wheel">
      <span className="qc-wheel-cap">{label}</span>
      <div className="qc-wheel-track" ref={ref} role="listbox" aria-label={label}>
        {values.map((v) => (
          <button
            key={v}
            type="button"
            role="option"
            aria-selected={v === value}
            data-on={v === value ? "true" : undefined}
            className="qc-wheel-cell"
            data-guide-ignore="خانة قيمة داخل عجلة الوقت: عنصر داخلي متكرر للاختيار، ليس ميزة يقودها المرشد"
            onClick={() => onPick(v)}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The wheel block: hour, minute, length, and the end time read back live.
 *
 * `start` and `end` are the two "HH:MM" clocks the caller owns; every turn of a
 * wheel hands back a fresh pair through `onChange`. Turning the hour or minute
 * keeps the current length so the block never silently stretches; turning the
 * length moves only the end. `preferredDuration`, when given, is the length a
 * fresh start should assume — the department's learned rhythm — so the first
 * touch of the hour lands on a sensible end.
 */
export function TimeWheels({
  start,
  end,
  onChange,
  preferredDuration,
}: {
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  preferredDuration?: number;
}) {
  const from = minutesOf(start);
  const span = Math.max(30, minutesOf(end) - from);
  const hours = useMemo(
    () => Array.from({ length: 12 }, (_, i) => 8 + i).filter((h) => h * 60 < SCHEDULE_DAY_END),
    [],
  );
  const minuteSteps = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);
  /* The lengths the regulation actually gives: 50 minutes on Sun/Tue/Thu and 80
     on Mon/Wed, plus the longer blocks a lab or a seminar uses. */
  const spans = [50, 80, 100, 120, 150, 180];

  const setStart = (minutes: number) => {
    const clamped = Math.min(Math.max(minutes, SCHEDULE_DAY_START), SCHEDULE_DAY_END - 30);
    const learned = Number(preferredDuration || 0);
    const duration = learned > 0 ? learned : span;
    onChange({ start: timeOf(clamped), end: timeOf(Math.min(SCHEDULE_DAY_END, clamped + duration)) });
  };
  const setSpan = (length: number) =>
    onChange({ start: timeOf(from), end: timeOf(Math.min(SCHEDULE_DAY_END, from + length)) });

  return (
    <div className="qc-wheels">
      <Wheel
        label="الساعة"
        values={hours}
        value={Math.floor(from / 60)}
        format={(h) => String(h).padStart(2, "0")}
        onPick={(h) => setStart(h * 60 + (from % 60))}
      />
      <Wheel
        label="الدقيقة"
        values={minuteSteps}
        value={from % 60}
        format={(m) => String(m).padStart(2, "0")}
        onPick={(m) => setStart(Math.floor(from / 60) * 60 + m)}
      />
      <Wheel
        label="المدة (د)"
        values={spans}
        value={spans.includes(span) ? span : spans.reduce((best, s) => (Math.abs(s - span) < Math.abs(best - span) ? s : best), spans[0])}
        format={(s) => String(s)}
        onPick={setSpan}
      />
      <div className="qc-until">
        <span>ينتهي</span>
        <b dir="ltr">{scheduleClockForDisplay(end)}</b>
      </div>
    </div>
  );
}

/**
 * The same wheel, opened as a small pop-down on the field that was clicked.
 *
 * The full editor keeps its labelled start/end fields; clicking the start field
 * brings the counter to it — anchored under the control, closing on Escape or a
 * press anywhere outside, saving nothing that the wheels did not already write
 * straight through `onChange`.
 */
export function TimeCounterPopover({
  anchor,
  start,
  end,
  onChange,
  onClose,
  preferredDuration,
}: {
  anchor: HTMLElement | null;
  start: string;
  end: string;
  onChange: (next: { start: string; end: string }) => void;
  onClose: () => void;
  preferredDuration?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const margin = 12;
    let left = a.left + a.width / 2 - rect.width / 2;
    let top = a.bottom + 8;
    if (top + rect.height > window.innerHeight - margin) top = a.top - rect.height - 8;
    if (top < margin) top = margin;
    left = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, left));
    setBox({ left, top });
  }, [anchor, start, end]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", key, true);
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", away), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", away);
    };
  }, [anchor, onClose]);

  return (
    <div
      className="time-counter-pop visual-minimal"
      ref={ref}
      role="dialog"
      aria-label="عدّاد الوقت"
      style={box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <TimeWheels start={start} end={end} onChange={onChange} preferredDuration={preferredDuration} />
    </div>
  );
}
