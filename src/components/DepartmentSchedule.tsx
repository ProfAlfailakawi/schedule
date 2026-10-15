import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Printer } from "lucide-react";
import { EmptyState, MicroLoader, Notice, PageTitle, SecondaryButton } from "./ui";
import { currentTermId } from "../utils/termSequence";
import { singleDepartmentOf, type ScopeAssignmentLike } from "../utils/scopeContext";

type Row = {
  id: number; courseId: number; courseName: string; courseCode: string; section: string;
  instructor: string; days: string; time: string; room: string;
};
const DAYS = [["fsunday", "الأحد"], ["fmonday", "الاثنين"], ["ftuesday", "الثلاثاء"], ["fwednesday", "الأربعاء"], ["fthursday", "الخميس"]] as const;
const read = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذّر تحميل الجدول");
  return data;
};

/** Read-only department view. The API applies the signed-in user's section scope and final-schedule policy. */
export default function DepartmentSchedule({ scopes, onBack }: { scopes: ScopeAssignmentLike[]; onBack: () => void }) {
  const sectionId = singleDepartmentOf(scopes, 0, false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [termName, setTermName] = useState("");
  const [sectionName, setSectionName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (!sectionId) { setError("هذا الحساب لا يملك نطاق قسم واحد لعرض جدوله."); setRows([]); return; }
    (async () => {
      try {
        const [terms, courses, instructors, schedules, sections] = await Promise.all([
          read("/api/terms"), read(`/api/courses?sectionId=${sectionId}`),
          read(`/api/instructors?sectionId=${sectionId}`), read(`/api/schedules?sectionId=${sectionId}`), read("/api/sections"),
        ]);
        const list = Array.isArray(terms) ? terms : terms.terms || [];
        const termId = currentTermId(list) || Number(list[0]?.AdTermId || 0);
        const term = list.find((item: any) => Number(item.AdTermId) === termId) || list[0];
        const courseMap = new Map((Array.isArray(courses) ? courses : []).map((course: any) => [Number(course.AdCourseId), course]));
        const instructorMap = new Map((Array.isArray(instructors) ? instructors : []).map((person: any) => [Number(person.AdInstructorId), person]));
        const section = (Array.isArray(sections) ? sections : []).find((item: any) => Number(item.AdSectionId) === sectionId);
        const appointments = (Array.isArray(schedules) ? schedules : []).filter((item: any) => Number(item.AdTermId) === Number(term?.AdTermId));
        const mapped = appointments.map((item: any) => {
          const course: any = courseMap.get(Number(item.AdCourseId));
          const instructor: any = instructorMap.get(Number(item.AdInstructorId));
          return {
            id: Number(item.id), courseId: Number(item.AdCourseId), courseName: course?.CourseName || item.AdCourseName || "مقرر غير معرّف",
            courseCode: course?.CourseCode || item.CourseCodeSnapshot || "—", section: item.SCode || "—",
            instructor: instructor?.AdInstructorName || "—", days: DAYS.filter(([key]) => Boolean(item[key])).map(([, label]) => label).join("، ") || "—",
            time: [item.fstarttime, item.fendtime].filter(Boolean).join(" – ") || "—",
            room: [item.AdRoomCode, item.AdRoomHall].filter(Boolean).join(" · ") || "—",
          };
        }).sort((a: Row, b: Row) => a.days.localeCompare(b.days, "ar") || a.time.localeCompare(b.time));
        if (!active) return;
        setRows(mapped); setTermName(String(term?.AdTermName || "")); setSectionName(String(section?.AdSectionName || "القسم"));
      } catch (cause: any) { if (active) { setError(cause.message || "تعذّر تحميل الجدول"); setRows([]); } }
    })();
    return () => { active = false; };
  }, [sectionId]);
  const grouped = useMemo(() => rows || [], [rows]);
  if (rows === null) return <MicroLoader label="يُحمّل جدول القسم…" />;
  return <main className="department-schedule-page">
    <PageTitle eyebrow="الجدول الأكاديمي" subtitle={`${sectionName}${termName ? ` · ${termName}` : ""}`} action={<div className="department-schedule-actions"><SecondaryButton onClick={() => window.print()} data-guide-ignore="طباعة جدول القسم"><Printer size={16} /> طباعة</SecondaryButton><SecondaryButton onClick={onBack} data-guide-ignore="العودة إلى التغييرات"><ArrowRight size={16} /> العودة</SecondaryButton></div>}>
      <CalendarDays aria-hidden="true" /> جدول القسم
    </PageTitle>
    {error ? <Notice type="error">{error}</Notice> : null}
    <p className="department-schedule-readonly">عرض للقراءة فقط · يعرض الجدول المعتمد المتاح لهذا الحساب.</p>
    {grouped.length ? <div className="department-schedule-table-wrap"><table className="department-schedule-table"><thead><tr><th>المقرر</th><th>الشعبة</th><th>الأستاذ</th><th>الأيام</th><th>الوقت</th><th>القاعة</th></tr></thead><tbody>{grouped.map(row => <tr key={row.id}><td><strong>{row.courseName}</strong><small dir="ltr">{row.courseCode}</small></td><td>{row.section}</td><td>{row.instructor}</td><td>{row.days}</td><td><bdi dir="ltr">{row.time}</bdi></td><td>{row.room}</td></tr>)}</tbody></table>
      <div className="department-schedule-cards">{grouped.map(row => <article key={row.id} className="department-schedule-card"><strong>{row.courseName}</strong><small dir="ltr">{row.courseCode} · {row.section}</small><span>{row.days} · <bdi dir="ltr">{row.time}</bdi></span><span>{row.instructor} · {row.room}</span></article>)}</div>
    </div> : <EmptyState title="لا توجد شعب معتمدة لهذا الفصل" detail="تظهر هنا الشعب بعد اعتمادها ضمن صلاحية هذا القسم." />}
  </main>;
}
