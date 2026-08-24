import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Check, Clock3, MapPin, Pencil, Trash2, UsersRound } from "lucide-react";
import type { AdCourse, AdInstructor } from "../types";
import InstructorPicker from "./InstructorPicker";
import LocationPicker, { BuildingPicker, RoomPicker } from "./LocationPicker";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { expectedMinutesForDay, type DayKey as RegulationDayKey } from "../utils/scheduleRegulations";
import { cleanBuildingCode, cleanHallCode } from "../utils/cleanRoom";
import { roomIdentityKey } from "../utils/locationRegistry";

/**
 * Editable authority-PDF preview.
 *
 * This editor intentionally reuses the same vocabularies as Add/Edit Schedule:
 * department instructors, department room history, and the live conflict gate.
 * Unknown values stay editable, but the system never silently invents one.
 */
export type ImportRow = {
  referenceNumber?: string;
  AdCourseId: number;
  AdCourseName?: string;
  SCode: string;
  fsunday: boolean; fmonday: boolean; ftuesday: boolean; fwednesday: boolean; fthursday: boolean;
  fstarttime: string; fendtime: string;
  AdRoomCode: string; AdRoomHall: string;
  buildingId?: string; roomId?: string; locationStatus?: "VERIFIED" | "PENDING_ROOM" | "LOCATION_REVIEW_REQUIRED" | "INVALID_HISTORICAL";
  sourceBuildingText?: string; sourceRoomText?: string;
  AdInstructorId: number;
  sourceInstructorText?: string;
  [extra: string]: unknown;
};

type DepartmentRoom = { building: string; hall: string };
type ConflictNote = { type?: string; severity?: string; message?: string; detail?: string };

const DAY_CHIPS: Array<{ key: keyof ImportRow & string; label: string }> = [
  { key: "fsunday", label: "ح" },
  { key: "fmonday", label: "ن" },
  { key: "ftuesday", label: "ث" },
  { key: "fwednesday", label: "ر" },
  { key: "fthursday", label: "خ" },
];

const minutes = (value: string) => {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
};
const clockFromMinutes = (value:number) => `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
const daysOverlap = (a: ImportRow, b: ImportRow) => DAY_CHIPS.some(day => Boolean(a[day.key]) && Boolean(b[day.key]));
const timeOverlap = (a: ImportRow, b: ImportRow) => {
  const a0 = minutes(a.fstarttime), a1 = minutes(a.fendtime), b0 = minutes(b.fstarttime), b1 = minutes(b.fendtime);
  return a0 >= 0 && a1 > a0 && b0 >= 0 && b1 > b0 && a0 < b1 && b0 < a1;
};

const cleanRoom = (value: unknown) => String(value || "").trim().toLocaleUpperCase();

export default function ImportPreviewTable({
  rows, courses, instructors, departmentIds = [], visitingIds = [], departmentRooms = [],
  collegeId = 0, sectionId = 0, termId = 0, onRows,
}: {
  rows: ImportRow[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  departmentIds?: number[];
  visitingIds?: Iterable<number>;
  departmentRooms?: DepartmentRoom[];
  collegeId?: number;
  sectionId?: number;
  termId?: number;
  onRows: (next: ImportRow[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [extraInstructors, setExtraInstructors] = useState<AdInstructor[]>([]);
  const [serverConflicts, setServerConflicts] = useState<ConflictNote[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [roomOwner, setRoomOwner] = useState<any>(null);

  const courseById = useMemo(() => new Map(courses.map(course => [Number(course.AdCourseId), course])), [courses]);
  const pickerInstructors = useMemo(() => [...new Map(
    [...instructors, ...extraInstructors].map(person => [Number(person.AdInstructorId), person] as const),
  ).values()], [instructors, extraInstructors]);
  const instructorById = useMemo(() => new Map(pickerInstructors.map(person => [Number(person.AdInstructorId), person])), [pickerInstructors]);

  const normalizedRooms = useMemo(() => [...new Map(departmentRooms
    .filter(room => cleanRoom(room.building) && cleanRoom(room.hall))
    .map(room => [`${cleanRoom(room.building)}|${cleanRoom(room.hall)}`, { building: cleanRoom(room.building), hall: cleanRoom(room.hall) }] as const)).values()], [departmentRooms]);
  const buildings = useMemo(() => [...new Set(normalizedRooms.map(room => room.building))].sort(), [normalizedRooms]);
  const hallsFor = (building: string) => normalizedRooms.filter(room => room.building === cleanRoom(building)).map(room => room.hall).sort();
  const roomKnown = (building: string, hall: string) => normalizedRooms.some(room => room.building === cleanRoom(building) && room.hall === cleanRoom(hall));

  const patch = (index: number, values: Partial<ImportRow>) => onRows(rows.map((row, at) => at === index ? { ...row, ...values } : row));
  const remove = (index: number) => {
    if (editing === index) setEditing(null);
    onRows(rows.filter((_, at) => at !== index));
  };

  const sectionNumberFor = (index:number, courseId:number) => {
    if(!courseId)return "";
    let order=0;
    for(let at=0;at<=index;at+=1) if(Number(rows[at]?.AdCourseId)===Number(courseId)) order+=1;
    return String(500+order);
  };
  const renumberCourseSeries = (nextRows:ImportRow[]) => {
    const counters=new Map<number,number>();
    return nextRows.map(item=>{
      const courseId=Number(item.AdCourseId||0);
      if(!courseId)return{...item,SCode:""};
      const next=(counters.get(courseId)||500)+1;counters.set(courseId,next);
      return{...item,SCode:String(next)};
    });
  };
  const patchAndRenumber = (index:number, values:Partial<ImportRow>) =>
    onRows(renumberCourseSeries(rows.map((row,at)=>at===index?{...row,...values}:row)));

  const beginEdit = (index: number) => {
    const row = rows[index];
    const expected=sectionNumberFor(index,Number(row?.AdCourseId)||0);
    if(expected&&String(row?.SCode||"")!==expected) patchAndRenumber(index, {});
    setServerConflicts([]);
    setRoomOwner(null);
    setEditing(index);
  };

  const hasDays = (row: ImportRow) => DAY_CHIPS.some(day => Boolean(row[day.key]));
  const missing = {
    course: (row: ImportRow) => !Number(row.AdCourseId),
    scode: (row: ImportRow) => !String(row.SCode || "").trim(),
    days: (row: ImportRow) => !hasDays(row),
    time: (row: ImportRow) => !row.fstarttime || !row.fendtime || minutes(row.fendtime) <= minutes(row.fstarttime),
    building: (row: ImportRow) => !row.buildingId,
    room: (row: ImportRow) => row.locationStatus !== "PENDING_ROOM" && !row.roomId,
    instructor: (row: ImportRow) => !Number(row.AdInstructorId) || !instructorById.has(Number(row.AdInstructorId)),
  };
  const red = (bad: boolean) => bad ? "import-cell-missing" : "";

  const autoEndForRow = (row:ImportRow, start:string) => {
    if(!start)return "";
    const active=DAY_CHIPS.filter(day=>Boolean(row[day.key])).map(day=>day.key as RegulationDayKey);
    if(!active.length)return row.fendtime||"";
    const durations=[...new Set(active.map(day=>expectedMinutesForDay(day)))];
    if(durations.length!==1)return row.fendtime||"";
    return clockFromMinutes(Math.min(23*60+59,minutes(start)+durations[0]));
  };

  useEffect(()=>{
    if(editing===null||!rows[editing]||!collegeId||!sectionId){setRoomOwner(null);return;}
    const row=rows[editing],room=String(row.AdRoomCode||"").trim(),hall=String(row.AdRoomHall||"").trim();
    if(!room||!hall){setRoomOwner(null);return;}
    const controller=new AbortController();
    const timer=window.setTimeout(async()=>{
      try{
        const query=new URLSearchParams({room,hall,collegeId:String(collegeId),sectionId:String(sectionId)});
        const response=await fetch(`/api/rooms/owner?${query}`,{signal:controller.signal});
        if(response.ok){const data=await response.json();setRoomOwner(data?.owner||null);}
      }catch{}
    },280);
    return()=>{window.clearTimeout(timer);controller.abort();};
  },[editing,rows,collegeId,sectionId]);

  const localConflicts = useMemo(() => {
    if (editing === null || !rows[editing]) return [] as ConflictNote[];
    const row = rows[editing];
    const notes: ConflictNote[] = [];
    rows.forEach((other, at) => {
      if (at === editing || !daysOverlap(row, other) || !timeOverlap(row, other)) return;
      if (row.AdInstructorId && Number(row.AdInstructorId) === Number(other.AdInstructorId)) {
        notes.push({ type: "instructor", severity: "high", message: "تعارض أستاذ", detail: `${instructorById.get(Number(row.AdInstructorId))?.AdInstructorName || "الأستاذ"} مرتبط أيضاً بالصف ${(at + 1).toLocaleString("ar-KW-u-nu-latn")} · ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}.` });
      }
      if (roomIdentityKey(row as any) && roomIdentityKey(row as any) === roomIdentityKey(other as any)) {
        notes.push({ type: "room", severity: "high", message: "تعارض قاعة", detail: `${cleanRoom(row.AdRoomCode)}/${cleanRoom(row.AdRoomHall)} مستخدمة أيضاً في الصف ${(at + 1).toLocaleString("ar-KW-u-nu-latn")} · ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}.` });
      }
    });
    return notes;
  }, [editing, rows, instructorById]);

  useEffect(() => {
    if (editing === null || !rows[editing] || !collegeId || !sectionId || !termId) { setServerConflicts([]); return; }
    const row = rows[editing];
    if (!hasDays(row) || !row.fstarttime || !row.fendtime || minutes(row.fendtime) <= minutes(row.fstarttime)) { setServerConflicts([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCheckingConflicts(true);
      try {
        const response = await fetch("/api/schedules/check-conflicts", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({
            ...row,
            AdCollegeId: collegeId,
            AdSectionId: sectionId,
            AdTermId: termId,
            id: 0,
            excludeId: 0,
          }),
        });
        const data = await response.json().catch(() => ({}));
        setServerConflicts(Array.isArray(data?.conflicts) ? data.conflicts : []);
      } catch (error: any) {
        if (error?.name !== "AbortError") setServerConflicts([]);
      } finally { if (!controller.signal.aborted) setCheckingConflicts(false); }
    }, 260);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [editing, rows, collegeId, sectionId, termId]);

  const conflictNotes = useMemo(() => {
    const all = [...localConflicts, ...serverConflicts];
    const seen = new Set<string>();
    return all.filter(note => {
      const key = `${note.type || ""}|${note.message || ""}|${note.detail || ""}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [localConflicts, serverConflicts]);

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
              <React.Fragment key={`${row.referenceNumber || "row"}-${index}`}>
                <tr className={open ? "is-editing" : ""}>
                  <td className="num">{(index + 1).toLocaleString("ar-KW-u-nu-latn")}</td>
                  <td className={`import-cell-course ${red(missing.course(row))}`}>
                    {open ? (
                      <div className="import-course-editor">
                        <select
                          value={Number(row.AdCourseId) || ""}
                          onChange={e => {
                            const cid = Number(e.target.value) || 0;
                            const sel = courseById.get(cid);
                            patch(index, {
                              AdCourseId: cid,
                              AdCourseName: sel?.CourseName || row.AdCourseName,
                              CourseHours: sel?.CourseHours || row.CourseHours,
                              CourseCredit: sel?.CourseCredit || row.CourseCredit,
                              fcontacthours: sel?.CourseHours || row.fcontacthours,
                              fcredithours: sel?.CourseCredit || row.fcredithours,
                            });
                          }}
                        >
                          <option value="">-- اختر المقرر من كتالوج القسم --</option>
                          {courses.map(c => (
                            <option key={c.AdCourseId} value={c.AdCourseId}>
                              {c.CourseName} ({c.CourseCode || "بلا رمز"})
                            </option>
                          ))}
                        </select>
                        {row.AdCourseName && !course ? (
                          <small className="muted">قرأ الملف: {row.AdCourseName}</small>
                        ) : null}
                        {row.scopeMismatchType === "CROSS_BRANCH" ? (
                          <span className="import-course-scope-note" title={String(row.scopeMismatchMessage || "")}><AlertTriangle />{String(row.scopeMismatchLabel || "تابع لفرع آخر")}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="import-locked-course">
                        <span className="import-course-title-line"><strong>{course?.CourseName || row.AdCourseName || "—"}</strong>{row.scopeMismatchType === "CROSS_BRANCH" ? <span className="import-course-scope-note" title={String(row.scopeMismatchMessage || "")}><AlertTriangle />{String(row.scopeMismatchLabel || "تابع لفرع آخر")}</span> : null}</span>
                        {course?.CourseCode ? <small dir="ltr">{course.CourseCode}</small> : null}
                      </div>
                    )}
                  </td>
                  <td className={red(missing.scode(row))}>
                    {open ? <div className="import-section-editor"><input inputMode="numeric" value={String(row.SCode || "")} readOnly aria-readonly="true" /><small>تلقائي حسب ظهورها</small></div> : (String(row.SCode || "").trim() || "—")}
                  </td>
                  <td className={red(missing.days(row))}>
                    <span className="import-day-chips">{DAY_CHIPS.map(day => <button key={day.key} type="button" disabled={!open} data-guide-ignore="تبديل يوم داخل معاينة الاستيراد قبل أي حفظ" className={row[day.key] ? "on" : ""} onClick={() => patch(index, { [day.key]: !row[day.key] } as Partial<ImportRow>)}>{day.label}</button>)}</span>
                  </td>
                  <td className={red(missing.time(row))} dir="ltr">
                    {open ? <div className="import-time-editor"><label><small>بداية الوقت</small><input type="time" value={row.fstarttime || ""} onChange={event => { const start=event.target.value; patch(index, { fstarttime:start, fendtime:autoEndForRow(row,start) }); }} /></label><span>—</span><label><small>نهاية الوقت</small><input type="time" value={row.fendtime || ""} onChange={event => patch(index, { fendtime: event.target.value })} /></label></div> : (row.fstarttime && row.fendtime ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : "—")}
                  </td>
                  <td className={red(missing.building(row) || row.locationStatus === "LOCATION_REVIEW_REQUIRED" || row.locationStatus === "INVALID_HISTORICAL")}>
                    {open ? (
                      <BuildingPicker
                        collegeId={collegeId}
                        sectionId={sectionId}
                        termId={termId}
                        value={row.buildingId || ""}
                        onChange={b => patch(index, {
                          buildingId: b?.id,
                          roomId: undefined,
                          AdRoomCode: b?.officialCode || "",
                          AdRoomHall: "",
                          locationStatus: undefined,
                          sourceSitePrefix: undefined,
                          scopeMismatchType: undefined,
                          scopeMismatchLabel: undefined,
                          scopeMismatchMessage: undefined,
                        })}
                      />
                    ) : (
                      <span dir="ltr">{row.AdRoomCode || "—"}</span>
                    )}
                  </td>
                  <td className={red(missing.room(row) || row.locationStatus === "LOCATION_REVIEW_REQUIRED" || row.locationStatus === "INVALID_HISTORICAL")}>
                    {open ? (
                      <RoomPicker
                        collegeId={collegeId}
                        sectionId={sectionId}
                        termId={termId}
                        buildingId={row.buildingId}
                        roomId={row.roomId}
                        locationStatus={row.locationStatus}
                        onChange={({ roomId, canonicalCode, locationStatus }) => patch(index, {
                          roomId,
                          AdRoomHall: canonicalCode,
                          locationStatus,
                        })}
                      />
                    ) : (
                      <span dir="ltr">{row.locationStatus === "PENDING_ROOM" ? "بانتظار تثبيت القاعة" : (row.AdRoomHall || "—")}</span>
                    )}
                  </td>
                  <td className={red(missing.instructor(row))}>
                    {open ? <span className="import-instructor-editor">{String(row.sourceInstructorText || "").trim() ? <small>قرأ الملف: {String(row.sourceInstructorText).trim()}</small> : null}<InstructorPicker value={Number(row.AdInstructorId) || 0} onChange={id => patch(index, { AdInstructorId: id })} instructors={pickerInstructors as any} departmentIds={departmentIds.length ? departmentIds : pickerInstructors.map(person => Number(person.AdInstructorId)).filter(Boolean)} visitingIds={visitingIds} collegeId={collegeId} sectionId={sectionId} termId={termId} onCreated={person => setExtraInstructors(current => [...new Map([...current, person as AdInstructor].map(item => [Number(item.AdInstructorId), item] as const)).values()])} onSelected={person => setExtraInstructors(current => [...new Map([...current, person as AdInstructor].map(item => [Number(item.AdInstructorId), item] as const)).values()])} /></span> : (person?.AdInstructorName || String(row.sourceInstructorText || "").trim() || "—")}
                  </td>
                  <td className="import-row-tools">
                    <button type="button" data-guide-ignore="تحرير صف داخل معاينة الاستيراد قبل أي حفظ" className={open ? "confirm" : ""} title={open ? "تم" : "تعديل سريع"} onClick={() => open ? setEditing(null) : beginEdit(index)}>{open ? <Check /> : <Pencil />}</button>
                    <button type="button" data-guide-ignore="حذف صف من معاينة الاستيراد قبل أي حفظ" className="danger" title="حذف المقرر كاملاً" onClick={() => remove(index)}><Trash2 /></button>
                  </td>
                </tr>
                {open && (roomOwner || checkingConflicts || conflictNotes.length) ? <tr className="import-row-review"><td colSpan={9}>
                  <div className="import-row-review-grid">
                    {roomOwner ? <article className="import-review-card room-owner"><Building2/><div><strong><bdi dir="ltr">{roomOwner.room}/{roomOwner.hall}</bdi> قاعة {roomOwner.section || "قسم آخر"}</strong><p>{roomOwner.college ? `${roomOwner.college} · ` : ""}{roomOwner.share ? `${roomOwner.share}٪ من حجوزاتها المسجلة لهذا القسم.` : "القاعة مرتبطة بنطاق آخر."} يمكنك المتابعة إذا كان الاستخدام متفقاً عليه.</p></div></article> : null}
                    {checkingConflicts ? <article className="import-review-card checking"><Clock3 /><div><strong>جاري فحص التعارضات…</strong><p>نفحص الوقت والقاعة والأستاذ قبل اعتماد هذا الصف.</p></div></article> : null}
                    {conflictNotes.map((note, at) => { const room = note.type === "room" || String(note.message || "").includes("قاعة"); const instructor = note.type === "instructor" || String(note.message || "").includes("أستاذ"); const Icon = room ? Building2 : instructor ? UsersRound : AlertTriangle; return <article key={`${note.type || "note"}-${at}`} className={`import-review-card conflict ${room ? "room" : instructor ? "instructor" : "generic"}`}><Icon /><div><strong>{note.message || (room ? "تعارض قاعة" : instructor ? "تعارض أستاذ" : "تعارض")}</strong>{note.detail ? <p>{note.detail}</p> : null}</div></article>; })}
                  </div>
                </td></tr> : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
