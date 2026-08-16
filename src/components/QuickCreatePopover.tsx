import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clock3, Maximize2, X } from "lucide-react";
import type { AdCourse, AdInstructor } from "../types";
import type { DayKey } from "./scheduleWorkspace";
import {
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_START,
} from "../utils/scheduleTime";
import { sortByName } from "../utils/sorting";

/**
 * The appointment written where it was drawn.
 *
 * A stroke down an empty column already says the day, the hour and the length —
 * three of the eight answers a lecture needs. Sending that stroke to a full-page
 * form threw the other five back at the reader as an empty screen, and the
 * gesture's whole promise («here, this hour») was lost in the journey.
 *
 * So the form comes to the stroke instead: a card that opens on the painted
 * block, asks only for what the stroke could not know — the course, the section
 * number, the instructor, the hall — and keeps every wider door open. «تفاصيل
 * أكثر» hands the half-filled draft to the full editor without losing a
 * keystroke, so nothing here is a smaller version of anything; it is the same
 * form, entered from the side that was already answered.
 */

const minutesOf = (time: string) => {
  const [h, m] = String(time || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const timeOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export type QuickDraft = {
  courseId: number;
  scode: string;
  instructorId: number;
  room: string;
  hall: string;
  start: string;
  end: string;
};

export type QuickSeed = {
  day: DayKey;
  dayLabel: string;
  start: string;
  end: string;
  x: number;
  y: number;
  instructorId: number;
  room: string;
  hall: string;
};

/**
 * One column of a wheel.
 *
 * A native `<input type="time">` is two silent number fields and a stepper the
 * hand has to find; a column of real values is a place to look. The chosen row
 * is scrolled to the middle rather than merely marked, so the eye lands on the
 * answer before it reads any of the alternatives — which is the entire reason
 * a wheel beats a text field for a value with a dozen sensible settings.
 *
 * It is buttons, not a custom control: every row is reachable by Tab, speaks
 * its own value, and needs no keyboard handling of its own.
 */
function Wheel({
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
            onClick={() => onPick(v)}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function QuickCreatePopover({
  seed,
  courses,
  instructors,
  buildings,
  hallsFor,
  conflictOf,
  saving,
  error,
  onCancel,
  onExpand,
  onCreate,
}: {
  seed: QuickSeed;
  courses: AdCourse[];
  instructors: AdInstructor[];
  buildings: string[];
  hallsFor: (building: string) => string[];
  conflictOf: (draft: QuickDraft, day: DayKey) => string | null;
  saving: boolean;
  /** A refusal from the server, said on the card rather than at the top of a
      page the reader is not currently looking at. */
  error?: string | null;
  onCancel: () => void;
  onExpand: (draft: QuickDraft) => void;
  onCreate: (draft: QuickDraft) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const firstField = useRef<HTMLSelectElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const openedStart = minutesOf(seed.start);
  const openedEnd = Math.max(openedStart + 30, minutesOf(seed.end));
  const [draft, setDraft] = useState<QuickDraft>({
    courseId: 0,
    scode: "",
    instructorId: seed.instructorId || 0,
    room: seed.room || "",
    hall: seed.hall || "",
    start: timeOf(openedStart),
    end: timeOf(openedEnd),
  });
  const patch = (values: Partial<QuickDraft>) => setDraft((prev) => ({ ...prev, ...values }));

  const start = minutesOf(draft.start);
  const span = Math.max(30, minutesOf(draft.end) - start);
  const hours = useMemo(
    () => Array.from({ length: 12 }, (_, i) => 8 + i).filter((h) => h * 60 < SCHEDULE_DAY_END),
    [],
  );
  const minuteSteps = useMemo(() => Array.from({ length: 12 }, (_, i) => i * 5), []);
  /* The lengths a timetable actually uses. A free-typed duration was never the
     missing feature — choosing between the six real ones was. */
  const spans = [50, 60, 75, 90, 120, 150, 180];

  const setStart = (minutes: number) => {
    const clamped = Math.min(Math.max(minutes, SCHEDULE_DAY_START), SCHEDULE_DAY_END - 30);
    patch({ start: timeOf(clamped), end: timeOf(Math.min(SCHEDULE_DAY_END, clamped + span)) });
  };
  const setSpan = (length: number) =>
    patch({ end: timeOf(Math.min(SCHEDULE_DAY_END, start + length)) });

  // Measured against the window, never against the column: a card that explains
  // an hour must not be clipped by the day that hour belongs to.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 12;
    let left = seed.x - rect.width / 2;
    let top = seed.y + 14;
    if (top + rect.height > window.innerHeight - margin) top = seed.y - rect.height - 14;
    if (top < margin) top = margin;
    left = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, left));
    setBox({ left, top });
  }, [seed.x, seed.y]);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  // Escape closes; a press anywhere outside closes. Both are the same promise —
  // nothing here is saved until «إنشاء» is pressed, so leaving costs nothing.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onCancel(); }
    };
    const away = (e: PointerEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      onCancel();
    };
    window.addEventListener("keydown", key, true);
    // Registered a beat later so the pointerup that ended the paint stroke does
    // not immediately close the card it just opened.
    const timer = window.setTimeout(() => window.addEventListener("pointerdown", away), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", away);
    };
  }, [onCancel]);

  const halls = hallsFor(draft.room);
  const ready = Boolean(draft.courseId && draft.scode.trim() && draft.instructorId && draft.room.trim() && draft.hall.trim());
  const digitsOk = /^\d*$/.test(draft.scode);
  const clash = ready && digitsOk ? conflictOf(draft, seed.day) : null;

  const orderedCourses = useMemo(() => sortByName(courses, (course: AdCourse) => course.CourseName), [courses]);

  return (
    <div
      className="quick-create"
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-label={`موعد جديد · ${seed.dayLabel}`}
      style={box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header className="qc-head">
        <span className="qc-mark" aria-hidden="true"><Clock3 /></span>
        <div>
          <strong>موعد جديد</strong>
          <small>{seed.dayLabel} · <time dir="ltr">{draft.start}–{draft.end}</time></small>
        </div>
        <button type="button" className="qc-close" onClick={onCancel} aria-label="إغلاق بدون حفظ">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="qc-wheels">
        <Wheel
          label="الساعة"
          values={hours}
          value={Math.floor(start / 60)}
          format={(h) => String(h).padStart(2, "0")}
          onPick={(h) => setStart(h * 60 + (start % 60))}
        />
        <Wheel
          label="الدقيقة"
          values={minuteSteps}
          value={start % 60}
          format={(m) => String(m).padStart(2, "0")}
          onPick={(m) => setStart(Math.floor(start / 60) * 60 + m)}
        />
        <Wheel
          label="المدة (د)"
          values={spans}
          value={spans.includes(span) ? span : spans.reduce((best, s) => (Math.abs(s - span) < Math.abs(best - span) ? s : best), spans[0])}
          /* The unit belongs in the column's name, not glued to each number: an
             Arabic «د» beside a Latin numeral inside an RTL cell renders on the
             wrong side of the value it measures. */
          format={(s) => String(s)}
          onPick={setSpan}
        />
        <div className="qc-until">
          <span>ينتهي</span>
          <b dir="ltr">{draft.end}</b>
        </div>
      </div>

      <div className="qc-fields">
        <label className="qc-field qc-wide">
          <span>المقرر</span>
          <select
            ref={firstField}
            value={draft.courseId || ""}
            onChange={(e) => patch({ courseId: Number(e.target.value) || 0 })}
          >
            <option value="">اختر المقرر…</option>
            {orderedCourses.map((c) => (
              <option key={c.AdCourseId} value={c.AdCourseId}>
                {c.CourseCode} · {c.CourseName}
              </option>
            ))}
          </select>
        </label>
        <label className="qc-field qc-narrow">
          <span>الشعبة</span>
          <input
            value={draft.scode}
            inputMode="numeric"
            dir="ltr"
            placeholder="01"
            onChange={(e) => patch({ scode: e.target.value })}
          />
        </label>
        <label className="qc-field qc-wide">
          <span>الأستاذ</span>
          <select
            value={draft.instructorId || ""}
            onChange={(e) => patch({ instructorId: Number(e.target.value) || 0 })}
          >
            <option value="">اختر الأستاذ…</option>
            {instructors.map((i) => (
              <option key={i.AdInstructorId} value={i.AdInstructorId}>
                {i.AdInstructorName}
              </option>
            ))}
          </select>
        </label>
        <label className="qc-field qc-narrow">
          <span>المبنى</span>
          <input
            value={draft.room}
            list="qc-buildings"
            dir="ltr"
            onChange={(e) => patch({ room: e.target.value, hall: "" })}
          />
          <datalist id="qc-buildings">
            {buildings.map((code) => <option key={code} value={code} />)}
          </datalist>
        </label>
        <label className="qc-field qc-narrow">
          <span>القاعة</span>
          <input
            value={draft.hall}
            list="qc-halls"
            dir="ltr"
            onChange={(e) => patch({ hall: e.target.value })}
          />
          <datalist id="qc-halls">
            {halls.map((hall) => <option key={hall} value={hall} />)}
          </datalist>
        </label>
      </div>

      {error ? (
        <p className="qc-warn qc-warn-hard"><AlertTriangle aria-hidden="true" />{error}</p>
      ) : !digitsOk ? (
        <p className="qc-warn"><AlertTriangle aria-hidden="true" />الرجاء كتابة رقم الشعبة بالأرقام الإنجليزية.</p>
      ) : clash ? (
        <p className="qc-warn"><AlertTriangle aria-hidden="true" />{clash}</p>
      ) : null}

      <footer className="qc-foot">
        <button type="button" className="qc-expand" onClick={() => onExpand(draft)}>
          <Maximize2 aria-hidden="true" />تفاصيل أكثر
        </button>
        <button type="button" className="qc-cancel" onClick={onCancel}>إلغاء</button>
        <button
          type="button"
          className="qc-create"
          disabled={!ready || !digitsOk || saving}
          onClick={() => onCreate(draft)}
          title={ready ? "حفظ الموعد في هذه الخانة" : "أكمل المقرر والشعبة والأستاذ والقاعة"}
        >
          <Check aria-hidden="true" />{saving ? "أحفظ…" : "إنشاء"}
        </button>
      </footer>
    </div>
  );
}
