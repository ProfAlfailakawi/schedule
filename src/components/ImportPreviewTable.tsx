import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Check, Clock3, MapPin, Pencil, Pin, Search, Trash2, UsersRound } from "lucide-react";
import type { AdCourse, AdInstructor } from "../types";
import InstructorPicker from "./InstructorPicker";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { expectedMinutesForDay, type DayKey as RegulationDayKey } from "../utils/scheduleRegulations";

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
  collegeId = 0, sectionId = 0, termId = 0, onPinRoom, onRows,
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
  onPinRoom?: (building: string, hall: string) => Promise<boolean> | boolean;
  onRows: (next: ImportRow[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [extraInstructors, setExtraInstructors] = useState<AdInstructor[]>([]);
  const [courseQuery, setCourseQuery] = useState("");
  const [serverConflicts, setServerConflicts] = useState<ConflictNote[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
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
    setCourseQuery("");
    setServerConflicts([]);
    setRoomOwner(null);
    setEditing(index);
  };

  const hasDays = (row: ImportRow) => DAY_CHIPS.some(day => Boolean(row[day.key]));
  const missing = {
    scode: (row: ImportRow) => !String(row.SCode || "").trim(),
    days: (row: ImportRow) => !hasDays(row),
    time: (row: ImportRow) => !row.fstarttime || !row.fendtime || minutes(row.fendtime) <= minutes(row.fstarttime),
    room: (row: ImportRow) => !String(row.AdRoomCode || "").trim() || !String(row.AdRoomHall || "").trim(),
    instructor: (row: ImportRow) => !Number(row.AdInstructorId),
  };
  const red = (bad: boolean) => bad ? "import-cell-missing" : "";

  const filteredCourses = useMemo(() => {
    const q = courseQuery.trim().toLocaleLowerCase();
    if (!q) return courses;
    return courses.filter(course => `${course.CourseCode || ""} ${course.CourseName || ""}`.toLocaleLowerCase().includes(q));
  }, [courses, courseQuery]);

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
      if (cleanRoom(row.AdRoomCode) && cleanRoom(row.AdRoomHall) && cleanRoom(row.AdRoomCode) === cleanRoom(other.AdRoomCode) && cleanRoom(row.AdRoomHall) === cleanRoom(other.AdRoomHall)) {
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
            const newRoom = open && Boolean(cleanRoom(row.AdRoomCode) && cleanRoom(row.AdRoomHall)) && !roomKnown(row.AdRoomCode, row.AdRoomHall);
            const halls = hallsFor(row.AdRoomCode);
            return (
              <React.Fragment key={`${row.referenceNumber || "row"}-${index}`}>
                <tr className={open ? "is-editing" : ""}>
                  <td className="num">{(index + 1).toLocaleString("ar-KW-u-nu-latn")}</td>
                  <td className="import-cell-course">
                    {open ? (
                      <div className="import-course-picker">
                        <label><Search aria-hidden="true" /><input value={courseQuery} onChange={event => setCourseQuery(event.target.value)} placeholder="ابحث برمز أو اسم المقرر" aria-label="بحث سريع عن مقرر" /></label>
                        <select value={row.AdCourseId || ""} onChange={event => {
                          const id = Number(event.target.value) || 0;
                          patchAndRenumber(index, { AdCourseId: id, AdCourseName: courseById.get(id)?.CourseName || "" });
                        }}>
                          <option value="">اختر المقرر…</option>
                          {filteredCourses.map(item => <option key={item.AdCourseId} value={item.AdCourseId}>{item.CourseCode} · {item.CourseName}</option>)}
                        </select>
                        <small>{filteredCourses.length.toLocaleString("ar-KW-u-nu-latn")} نتيجة · اسم المقرر الرسمي ثابت من النظام ولا يُكتب يدوياً</small>
                      </div>
                    ) : (
                      <><strong>{course?.CourseName || row.AdCourseName || "—"}</strong><small dir="ltr">{course?.CourseCode || ""}</small></>
                    )}
                  </td>
                  <td className={red(missing.scode(row))}>
                    {open ? <div className="import-section-editor"><input inputMode="numeric" value={String(row.SCode || "")} readOnly aria-readonly="true" /><small>تلقائي حسب ظهور هذا المقرر: 501 ثم 502 ثم 503…</small></div> : (String(row.SCode || "").trim() || "—")}
                  </td>
                  <td className={red(missing.days(row))}>
                    <span className="import-day-chips">{DAY_CHIPS.map(day => <button key={day.key} type="button" disabled={!open} data-guide-ignore="تبديل يوم داخل معاينة الاستيراد قبل أي حفظ" className={row[day.key] ? "on" : ""} onClick={() => patch(index, { [day.key]: !row[day.key] } as Partial<ImportRow>)}>{day.label}</button>)}</span>
                  </td>
                  <td className={red(missing.time(row))} dir="ltr">
                    {open ? <div className="import-time-editor"><label><small>بداية الوقت</small><input type="time" value={row.fstarttime || ""} onChange={event => { const start=event.target.value; patch(index, { fstarttime:start, fendtime:autoEndForRow(row,start) }); }} /></label><span>—</span><label><small>نهاية الوقت</small><input type="time" value={row.fendtime || ""} onChange={event => patch(index, { fendtime: event.target.value })} /></label></div> : (row.fstarttime && row.fendtime ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : "—")}
                  </td>
                  <td className={red(missing.room(row))} dir="ltr">
                    {open ? <div className="import-room-editor"><input list={`import-buildings-${index}`} value={String(row.AdRoomCode || "")} onChange={event => patch(index, { AdRoomCode: event.target.value.toUpperCase().slice(0, 12), AdRoomHall: "" })} placeholder="اختر أو اكتب المبنى" /><datalist id={`import-buildings-${index}`}>{buildings.map(item => <option key={item} value={item} />)}</datalist>{buildings.length?<small>{buildings.length.toLocaleString("ar-KW-u-nu-latn")} مبنى من تاريخ القسم</small>:null}</div> : (String(row.AdRoomCode || "").trim() || "—")}
                  </td>
                  <td className={red(missing.room(row))} dir="ltr">
                    {open ? <div className="import-room-editor"><div className="import-hall-input-row"><input list={`import-halls-${index}`} value={String(row.AdRoomHall || "")} onChange={event => patch(index, { AdRoomHall: event.target.value.toUpperCase().slice(0, 12) })} placeholder="اختر أو اكتب القاعة" />{halls.length?<details className="import-hall-picker"><summary data-guide-ignore="اختيار سريع لقاعة داخل محرر الاستيراد"><MapPin/><span>{halls.length.toLocaleString("ar-KW-u-nu-latn")}</span></summary><div>{halls.map(hall=><button type="button" key={hall} data-guide-ignore="اختيار قاعة محفوظة داخل الاستيراد" className={cleanRoom(row.AdRoomHall)===hall?"active":""} onClick={event=>{patch(index,{AdRoomHall:hall});event.currentTarget.closest("details")?.removeAttribute("open");}}><MapPin/><bdi dir="ltr">{hall}</bdi></button>)}</div></details>:null}</div><datalist id={`import-halls-${index}`}>{halls.map(item => <option key={item} value={item} />)}</datalist>{halls.length ? <small>{halls.length.toLocaleString("ar-KW-u-nu-latn")} قاعة محفوظة في هذا المبنى</small> : null}</div> : (String(row.AdRoomHall || "").trim() || "—")}
                  </td>
                  <td className={red(missing.instructor(row))}>
                    {open ? <span className="import-instructor-editor">{String(row.sourceInstructorText || "").trim() ? <small>قرأ الملف: {String(row.sourceInstructorText).trim()}</small> : null}<InstructorPicker value={Number(row.AdInstructorId) || 0} onChange={id => patch(index, { AdInstructorId: id })} instructors={pickerInstructors as any} departmentIds={departmentIds.length ? departmentIds : pickerInstructors.map(person => Number(person.AdInstructorId)).filter(Boolean)} visitingIds={visitingIds} collegeId={collegeId} termId={termId} onCreated={person => setExtraInstructors(current => [...new Map([...current, person as AdInstructor].map(item => [Number(item.AdInstructorId), item] as const)).values()])} onSelected={person => setExtraInstructors(current => [...new Map([...current, person as AdInstructor].map(item => [Number(item.AdInstructorId), item] as const)).values()])} /></span> : (person?.AdInstructorName || "—")}
                  </td>
                  <td className="import-row-tools">
                    <button type="button" data-guide-ignore="تحرير صف داخل معاينة الاستيراد قبل أي حفظ" className={open ? "confirm" : ""} title={open ? "تم" : "تعديل سريع"} onClick={() => open ? setEditing(null) : beginEdit(index)}>{open ? <Check /> : <Pencil />}</button>
                    <button type="button" data-guide-ignore="حذف صف من معاينة الاستيراد قبل أي حفظ" className="danger" title="حذف المقرر كاملاً" onClick={() => remove(index)}><Trash2 /></button>
                  </td>
                </tr>
                {open && (newRoom || roomOwner || checkingConflicts || conflictNotes.length) ? <tr className="import-row-review"><td colSpan={9}>
                  <div className="import-row-review-grid">
                    {newRoom ? <article className="import-review-card room-new"><Building2 /><div><strong>هذه قاعة جديدة لم تكن موجودة في تاريخ القسم.</strong><span dir="ltr">{cleanRoom(row.AdRoomCode)}/{cleanRoom(row.AdRoomHall)}</span><p>يمكنك استخدامها الآن، أو تثبيتها لتظهر مباشرة ضمن اختيارات القسم لاحقاً.</p></div>{onPinRoom ? <button type="button" data-guide-ignore="تثبيت قاعة جديدة من معاينة الاستيراد" disabled={pinBusy} onClick={async () => { setPinBusy(true); try { await onPinRoom(row.AdRoomCode, row.AdRoomHall); } finally { setPinBusy(false); } }}><Pin />{pinBusy ? "يثبت…" : "ثبّت القاعة"}</button> : null}</article> : null}
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
