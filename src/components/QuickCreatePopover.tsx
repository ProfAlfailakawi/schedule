import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clock3, Maximize2, X } from "lucide-react";
import type { AdCourse, AdInstructor } from "../types";
import LocationPicker from "./LocationPicker";
import { TimeWheels } from "./TimeCounter";
import type { DayKey } from "./scheduleWorkspace";
import {
  formatScheduleTimeRange,
  SCHEDULE_DAY_END,
} from "../utils/scheduleTime";
import { sortByName } from "../utils/sorting";
import { toEnglishDigits } from "../utils/digits";

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
  buildingId?: string;
  roomId?: string;
  locationStatus?: "VERIFIED" | "PENDING_ROOM";
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

export default function QuickCreatePopover({
  seed,
  courses,
  instructors,
  collegeId,
  sectionId,
  termId,
  durationForDay,
  conflictOf,
  nextSectionCode,
  saving,
  error,
  onCancel,
  onExpand,
  onCreate,
}: {
  seed: QuickSeed;
  courses: AdCourse[];
  instructors: AdInstructor[];
  collegeId: number;
  sectionId: number;
  termId: number;
  /** The department's learned duration for the chosen day, with the
      institutional 50/80-minute rhythm supplied by the parent as fallback. */
  durationForDay?: (day: DayKey) => number;
  conflictOf: (draft: QuickDraft, day: DayKey) => string | null;
  /** The next free section number for a course, so the field fills itself the
      same way the full editor's does. */
  nextSectionCode?: (courseId: number) => string;
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
    room: "",
    hall: "",
    buildingId: undefined, roomId: undefined, locationStatus: undefined,
    start: timeOf(openedStart),
    end: timeOf(openedEnd),
  });
  const patch = (values: Partial<QuickDraft>) => setDraft((prev) => ({ ...prev, ...values }));
  /* Typing 101, 102, 103 by hand is work nobody should be doing, and the full
     editor already stopped asking for it. Anything typed by hand wins; the
     suggestion only refills while the field is still untouched. */
  const sectionTyped = useRef(false);
  const chooseCourse = (courseId: number) => {
    const next: Partial<QuickDraft> = { courseId };
    if (courseId && nextSectionCode && (!draft.scode.trim() || !sectionTyped.current)) {
      next.scode = nextSectionCode(courseId);
    }
    patch(next);
  };

  useEffect(() => {
    const learned = Number(durationForDay?.(seed.day) || 0);
    if (!learned) return;
    setDraft(current => {
      const from = minutesOf(current.start);
      const end = timeOf(Math.min(SCHEDULE_DAY_END, from + learned));
      return current.end === end ? current : { ...current, end };
    });
  }, [durationForDay, seed.day]);

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

  const ready = Boolean(draft.courseId && draft.scode.trim() && draft.instructorId && draft.buildingId && (draft.roomId || draft.locationStatus === "PENDING_ROOM"));
  const digitsOk = /^\d*$/.test(toEnglishDigits(draft.scode));
  const clash = ready && digitsOk ? conflictOf(draft, seed.day) : null;

  const orderedCourses = useMemo(() => sortByName(courses, (course: AdCourse) => course.CourseName), [courses]);

  return (
    <div
      className="quick-create visual-minimal"
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
          <small>{seed.dayLabel} · <time dir="ltr">{formatScheduleTimeRange(draft.start, draft.end)}</time></small>
        </div>
        <button type="button" className="qc-close" onClick={onCancel} aria-label="إغلاق بدون حفظ">
          <X aria-hidden="true" />
        </button>
      </header>

      <TimeWheels
        start={draft.start}
        end={draft.end}
        onChange={(next) => patch({ start: next.start, end: next.end })}
        preferredDuration={Number(durationForDay?.(seed.day) || 0)}
      />

      <div className="qc-fields">
        <label className="qc-field qc-wide">
          <span>المقرر</span>
          <select
            ref={firstField}
            value={draft.courseId || ""}
            onChange={(e) => chooseCourse(Number(e.target.value) || 0)}
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
            onChange={(e) => { sectionTyped.current = true; patch({ scode: toEnglishDigits(e.target.value) }); }}
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
        <div className="qc-location">
          <LocationPicker
            collegeId={collegeId}
            sectionId={sectionId}
            termId={termId}
            value={{AdRoomCode:draft.room,AdRoomHall:draft.hall,buildingId:draft.buildingId,roomId:draft.roomId,locationStatus:draft.locationStatus}}
            onChange={(location)=>patch({room:String(location.AdRoomCode||""),hall:String(location.AdRoomHall||""),buildingId:location.buildingId,roomId:location.roomId,locationStatus:location.locationStatus as any})}
          />
        </div>
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
