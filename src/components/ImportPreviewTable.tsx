import React, { useMemo, useState } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import type { AdCourse, AdInstructor } from "../types";
import InstructorPicker from "./InstructorPicker";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

/**
 * The imported schedule, whole, before anything is written.
 *
 * The first preview showed a count and a wall of notes — the reader learnt
 * that 44 things were wrong but could not see the table those things were
 * wrong IN. This is the opposite: every parsed row in one table, the cells
 * the reader must check painted red, and beside every row — not only the red
 * ones — a quick edit and a delete. Red is a highlighter, not a gate.
 */

export type ImportRow = {
  referenceNumber?: string;
  AdCourseId: number;
  AdCourseName?: string;
  SCode: string;
  fsunday: boolean; fmonday: boolean; ftuesday: boolean; fwednesday: boolean; fthursday: boolean;
  fstarttime: string; fendtime: string;
  AdRoomCode: string; AdRoomHall: string;
  AdInstructorId: number;
  sourceInstructorText?: string;
  [extra: string]: unknown;
};

const DAY_CHIPS: Array<{ key: keyof ImportRow & string; label: string }> = [
  { key: "fsunday", label: "ح" },
  { key: "fmonday", label: "ن" },
  { key: "ftuesday", label: "ث" },
  { key: "fwednesday", label: "ر" },
  { key: "fthursday", label: "خ" },
];

export default function ImportPreviewTable({ rows, courses, instructors, departmentIds = [], visitingIds = [], collegeId = 0, termId = 0, onRows }: {
  rows: ImportRow[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  departmentIds?: number[];
  visitingIds?: Iterable<number>;
  collegeId?: number;
  termId?: number;
  onRows: (next: ImportRow[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [extraInstructors, setExtraInstructors] = useState<AdInstructor[]>([]);
  const courseById = useMemo(() => new Map(courses.map(course => [Number(course.AdCourseId), course])), [courses]);
  const pickerInstructors = useMemo(() => [...new Map(
    [...instructors, ...extraInstructors].map(person => [Number(person.AdInstructorId), person] as const),
  ).values()], [instructors, extraInstructors]);
  const instructorById = useMemo(() => new Map(pickerInstructors.map(person => [Number(person.AdInstructorId), person])), [pickerInstructors]);

  const patch = (index: number, values: Partial<ImportRow>) =>
    onRows(rows.map((row, at) => at === index ? { ...row, ...values } : row));
  const remove = (index: number) => {
    if (editing === index) setEditing(null);
    onRows(rows.filter((_, at) => at !== index));
  };

  const hasDays = (row: ImportRow) => DAY_CHIPS.some(day => Boolean(row[day.key]));
  const missing = {
    scode: (row: ImportRow) => !String(row.SCode || "").trim(),
    days: (row: ImportRow) => !hasDays(row),
    time: (row: ImportRow) => !row.fstarttime || !row.fendtime,
    room: (row: ImportRow) => !String(row.AdRoomCode || "").trim() || !String(row.AdRoomHall || "").trim(),
    instructor: (row: ImportRow) => !Number(row.AdInstructorId),
  };
  const red = (bad: boolean) => bad ? "import-cell-missing" : "";

  return (
    <div className="import-preview-table-wrap">
      <table className="import-preview-table">
        <thead><tr>
          <th>م</th><th>المقرر</th><th>الشعبة</th><th>الأيام</th><th>الوقت</th>
          <th>المبنى</th><th>القاعة</th><th>أستاذ المقرر</th><th>الأدوات</th>
        </tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const course = courseById.get(Number(row.AdCourseId));
            const person = instructorById.get(Number(row.AdInstructorId));
            const open = editing === index;
            return (
              <tr key={`${row.referenceNumber || "row"}-${index}`} className={open ? "is-editing" : ""}>
                <td className="num">{(index + 1).toLocaleString("ar-KW-u-nu-latn")}</td>
                <td className="import-cell-course">
                  {open ? (
                    <select value={row.AdCourseId || ""} onChange={event => {
                      const id = Number(event.target.value) || 0;
                      patch(index, { AdCourseId: id, AdCourseName: courseById.get(id)?.CourseName || "" });
                    }}>
                      {courses.map(item => <option key={item.AdCourseId} value={item.AdCourseId}>{item.CourseCode} · {item.CourseName}</option>)}
                    </select>
                  ) : (
                    <><strong>{course?.CourseName || row.AdCourseName || "—"}</strong><small dir="ltr">{course?.CourseCode || ""}</small></>
                  )}
                </td>
                <td className={red(missing.scode(row))}>
                  {open
                    ? <input inputMode="numeric" value={String(row.SCode || "")} onChange={event => patch(index, { SCode: event.target.value.replace(/\D/g, "").slice(0, 4) })} />
                    : (String(row.SCode || "").trim() || "—")}
                </td>
                <td className={red(missing.days(row))}>
                  <span className="import-day-chips">
                    {DAY_CHIPS.map(day => (
                      <button
                        key={day.key} type="button" disabled={!open}
                        data-guide-ignore="تبديل يوم داخل معاينة الاستيراد قبل أي حفظ"
                        className={row[day.key] ? "on" : ""}
                        onClick={() => patch(index, { [day.key]: !row[day.key] } as Partial<ImportRow>)}
                      >{day.label}</button>
                    ))}
                  </span>
                </td>
                <td className={red(missing.time(row))} dir="ltr">
                  {open ? (
                    <span className="import-time-pair">
                      {/* The Authority sheet prints END - START. Internal storage
                          stays chronological start/end, but the editor must read
                          in the exact same visual order as the source document. */}
                      <input type="time" value={row.fendtime || ""} onChange={event => patch(index, { fendtime: event.target.value })} aria-label="وقت النهاية كما يظهر أولاً في ملف PDF" />
                      <i>—</i>
                      <input type="time" value={row.fstarttime || ""} onChange={event => patch(index, { fstarttime: event.target.value })} aria-label="وقت البداية كما يظهر ثانياً في ملف PDF" />
                    </span>
                  ) : (row.fstarttime && row.fendtime ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : "—")}
                </td>
                <td className={red(missing.room(row))} dir="ltr">
                  {open
                    ? <input value={String(row.AdRoomCode || "")} onChange={event => patch(index, { AdRoomCode: event.target.value.toUpperCase().slice(0, 8) })} />
                    : (String(row.AdRoomCode || "").trim() || "—")}
                </td>
                <td className={red(missing.room(row))} dir="ltr">
                  {open
                    ? <input value={String(row.AdRoomHall || "")} onChange={event => patch(index, { AdRoomHall: event.target.value.toUpperCase().slice(0, 6) })} />
                    : (String(row.AdRoomHall || "").trim() || "—")}
                </td>
                <td className={red(missing.instructor(row))}>
                  {open ? (
                    <span className="import-instructor-editor">
                      {String(row.sourceInstructorText || "").trim() ? <small>قرأ الملف: {String(row.sourceInstructorText).trim()}</small> : null}
                      <InstructorPicker
                        value={Number(row.AdInstructorId) || 0}
                        onChange={id => patch(index, { AdInstructorId: id })}
                        instructors={pickerInstructors as any}
                        departmentIds={departmentIds.length ? departmentIds : pickerInstructors.map(person => Number(person.AdInstructorId))}
                        visitingIds={visitingIds}
                        collegeId={collegeId}
                        termId={termId}
                        onCreated={person => setExtraInstructors(current => [...new Map([...current, person as AdInstructor].map(item => [Number(item.AdInstructorId), item] as const)).values()])}
                        onSelected={person => setExtraInstructors(current => [...new Map([...current, person as AdInstructor].map(item => [Number(item.AdInstructorId), item] as const)).values()])}
                      />
                    </span>
                  ) : (person?.AdInstructorName || "—")}
                </td>
                <td className="import-row-tools">
                  <button
                    type="button" data-guide-ignore="تحرير صف داخل معاينة الاستيراد قبل أي حفظ"
                    className={open ? "confirm" : ""} title={open ? "تم" : "تعديل سريع"}
                    onClick={() => setEditing(open ? null : index)}
                  >{open ? <Check /> : <Pencil />}</button>
                  <button
                    type="button" data-guide-ignore="حذف صف من معاينة الاستيراد قبل أي حفظ"
                    className="danger" title="حذف المقرر كاملاً"
                    onClick={() => remove(index)}
                  ><Trash2 /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
