import { AR, countOf } from "../utils/arabicCount";
import React, { useEffect, useState } from "react";
import type { compareCurriculumReference } from "../utils/curriculumReference";
import type { CurriculumReference } from "../data/technologyEducationCurricula";
import { Notice } from "./ui";

type Reference = Omit<CurriculumReference, "groups"> & { planId: string | null; groups: Array<Omit<ReturnType<typeof compareCurriculumReference>[number], "courses"> & { courses: Array<ReturnType<typeof compareCurriculumReference>[number]["courses"][number] & { ownerSectionId: number; ownerSectionName: string; ownerCollegeId: number }> }> };
type SectionResult = { sectionId: number; collegeId: number; collegeName: string; sectionName: string; references: Reference[] };
const labels: Record<string, string> = { name: "الاسم", credit: "الوحدات", hours: "الساعات", membership: "إضافته إلى الصحيفة" };
type CatalogAction = { kind: "edit" | "create"; sectionId: number; collegeId: number; courseId?: number; code: string; name: string; credit: number; hours: number };
export default function CurriculumReferenceReview({ sectionId, onCatalogAction }: { sectionId: number; onCatalogAction?: (action: CatalogAction) => void }) {
  const [sections, setSections] = useState<SectionResult[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("new");
  const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
  useEffect(() => {
    let active = true; setSections([]); setSelectedSectionId(sectionId); setError("");
    if (!sectionId) return;
    fetch(`/api/plan-review/reference?sectionId=${sectionId}`, { cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "تعذرت مقارنة الصحيفة");
      if (active) setSections(body.sections || []);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [sectionId]);
  if (error) return <Notice type="error">{error}</Notice>;
  const references = sections.find(row => row.sectionId === selectedSectionId)?.references || [];
  const reference = references.find(row => row.id === selected);
  if (!reference) return null;
  const rows = reference.groups.flatMap(group => group.courses);
  const missing = rows.filter(row => row.state === "missing").length;
  const different = rows.filter(row => row.state === "different" || row.state === "ambiguous").length;
  const categories = [...new Set(reference.groups.map(group => group.category))];
  return <section className="curriculum-reference" aria-label="مطابقة الصحف المرفقة">
    <header><div><h2>مطابقة الصحيفتين · تكنولوجيا التعليم</h2><p>مرجع BA-0115 من الصحف المرفقة · المقارنة لا تغيّر البيانات أو تعتمدها.</p></div>
      <div className="curriculum-reference-controls">
        {sections.length > 1 ? <label>القسم والكلية <select aria-label="القسم والكلية" value={selectedSectionId} onChange={event => setSelectedSectionId(Number(event.target.value))}>
          {sections.map(row => <option key={row.sectionId} value={row.sectionId}>{row.collegeName} · {row.sectionName}</option>)}
        </select></label> : null}
        <div role="tablist" aria-label="الصحيفة المرجعية">{references.map(row => <button key={row.id} type="button" role="tab" aria-selected={row.id === selected} onClick={() => setSelected(row.id)} data-guide-ignore="اختيار الصحيفة المصدرية داخل مراجعة الصحيفة">{row.name}</button>)}</div>
      </div>
    </header>
    <p className="curriculum-reference-total"><strong>{sections.find(row => row.sectionId === selectedSectionId)?.collegeName || ""}</strong> · {countOf(reference.degreeUnits, AR.unit)} للتخرج · المقررات غير الموجودة: {missing} · تحتاج مراجعة: {different}{!reference.planId ? " · لا توجد صحيفة تشغيلية مرتبطة بهذه النسخة" : ""}</p>
    {categories.map(category => <details key={category}>
      <summary>{category}<b>{countOf(reference.groups.filter(group => group.category === category).reduce((sum, group) => sum + group.requiredUnits, 0), AR.unit)}</b></summary>
      {reference.groups.filter(group => group.category === category).map(group => <section key={group.id} className="curriculum-reference-group">
        <h3>{group.name}<small>المطلوب: {countOf(group.requiredUnits, AR.unit)}{group.elective ? " من البدائل" : ""}</small></h3>
        {group.courses.map(course => <article key={course.code} className={`reference-course is-${course.state}`}>
          <div><strong>{course.name}</strong><bdi>{course.code}</bdi><span>{countOf(course.credit, AR.unit)} · {countOf(course.hours, AR.hour)}</span></div>
          {course.prerequisites.length ? <small>المسبق: <bdi>{course.prerequisites.join(" + ")}</bdi>{course.externalAlternative ? ` أو ${course.externalAlternative} (شرط خارجي يحتاج توثيقًا)` : ""}</small> : null}
          {course.state === "different" && course.current ? <small>الحالي: {course.current.name} · {countOf(course.current.credit, AR.unit)} · {countOf(course.current.hours, AR.hour)}. المطلوب: {course.differences.map(field => labels[field]).join("، ")}.</small> : null}
          {course.current ? <small>السعة المسجلة: {course.current.capacity === null ? "غير محددة" : countOf(course.current.capacity, AR.student)}.</small> : null}
          {course.state === "different" && course.ownerSectionId !== selectedSectionId && course.ownerSectionName ? <small>السجل مملوك لقسم {course.ownerSectionName}؛ يصححه القسم المالك.</small> : null}
          {course.state === "missing" ? <small>{course.ownerSectionName ? `غير موجود في كتالوج قسم ${course.ownerSectionName}.` : "لم تُحسم هوية القسم المالك من الرمز؛ يلزم التحقق قبل الإضافة."}</small> : null}
          {course.state === "ambiguous" ? <small>الرمز يطابق أكثر من سجل؛ تُحسم الهوية قبل أي تعديل.</small> : null}
          {course.state === "different" && course.current && course.ownerSectionId === selectedSectionId && onCatalogAction && course.differences.some(field => field === "name" || field === "credit" || field === "hours") ? (
            <button type="button" className="reference-fix" data-guide-ignore="فتح سجل المقرر المملوك للقسم لتصحيح الاسم أو الوحدات أو الساعات" onClick={() => onCatalogAction({ kind: "edit", sectionId: selectedSectionId, collegeId: course.ownerCollegeId, courseId: course.current!.id, code: course.code, name: course.name, credit: course.credit, hours: course.hours })}>افتح المقرر لتصحيح البيانات</button>
          ) : null}
          {course.state === "missing" && course.ownerSectionId === selectedSectionId && onCatalogAction ? (
            <button type="button" className="reference-fix" data-guide-ignore="بدء إضافة المقرر الناقص إلى سجل القسم بعد التحقق من سعته" onClick={() => onCatalogAction({ kind: "create", sectionId: selectedSectionId, collegeId: course.ownerCollegeId, code: course.code, name: course.name, credit: course.credit, hours: course.hours })}>أضف المقرر إلى القسم</button>
          ) : null}
        </article>)}
      </section>)}
    </details>)}
  </section>;
}
