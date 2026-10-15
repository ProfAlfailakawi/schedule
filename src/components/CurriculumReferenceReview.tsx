import { AR, countOf } from "../utils/arabicCount";
import React, { useEffect, useState } from "react";
import type { compareCurriculumReference } from "../utils/curriculumReference";
import type { CurriculumReference } from "../data/technologyEducationCurricula";
import { Notice } from "./ui";

type Reference = Omit<CurriculumReference, "groups"> & { planId: string | null; groups: ReturnType<typeof compareCurriculumReference> };
const labels: Record<string, string> = { name: "الاسم", credit: "الوحدات", hours: "الساعات", membership: "إضافته إلى الصحيفة" };
export default function CurriculumReferenceReview({ sectionId }: { sectionId: number }) {
  const [references, setReferences] = useState<Reference[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("new");
  useEffect(() => {
    let active = true; setReferences([]); setError("");
    if (!sectionId) return;
    fetch(`/api/plan-review/reference?sectionId=${sectionId}`, { cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "تعذرت مقارنة الصحيفة");
      if (active) setReferences(body.references || []);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [sectionId]);
  if (error) return <Notice type="error">{error}</Notice>;
  const reference = references.find(row => row.id === selected);
  if (!reference) return null;
  const rows = reference.groups.flatMap(group => group.courses);
  const missing = rows.filter(row => row.state === "missing").length;
  const different = rows.filter(row => row.state === "different" || row.state === "ambiguous").length;
  const categories = [...new Set(reference.groups.map(group => group.category))];
  return <section className="curriculum-reference" aria-label="مطابقة الصحف المرفقة">
    <header><div><h2>مطابقة الصحيفتين · تكنولوجيا التعليم</h2><p>مرجع BA-0115 من الصحف المرفقة · المقارنة لا تغيّر البيانات أو تعتمدها.</p></div>
      <div role="tablist" aria-label="الصحيفة المرجعية">{references.map(row => <button key={row.id} type="button" role="tab" aria-selected={row.id === selected} onClick={() => setSelected(row.id)} data-guide-ignore="اختيار الصحيفة المصدرية داخل مراجعة الصحيفة">{row.name}</button>)}</div>
    </header>
    <p className="curriculum-reference-total"><strong>{countOf(reference.degreeUnits, AR.unit)}</strong> للتخرج · المقررات غير الموجودة: {missing} · تحتاج مراجعة: {different}{!reference.planId ? " · لم تُربط صحيفة تشغيلية واحدة بهذه النسخة" : ""}</p>
    {categories.map(category => <details key={category}>
      <summary>{category}<b>{countOf(reference.groups.filter(group => group.category === category).reduce((sum, group) => sum + group.requiredUnits, 0), AR.unit)}</b></summary>
      {reference.groups.filter(group => group.category === category).map(group => <section key={group.id} className="curriculum-reference-group">
        <h3>{group.name}<small>المطلوب: {countOf(group.requiredUnits, AR.unit)}{group.elective ? " من البدائل" : ""}</small></h3>
        {group.courses.map(course => <article key={course.code} className={`reference-course is-${course.state}`}>
          <div><strong>{course.name}</strong><bdi>{course.code}</bdi><span>{countOf(course.credit, AR.unit)} · {countOf(course.hours, AR.hour)}</span></div>
          {course.prerequisites.length ? <small>المسبق: <bdi>{course.prerequisites.join(" + ")}</bdi>{course.externalAlternative ? ` أو ${course.externalAlternative} (شرط خارجي يحتاج توثيقًا)` : ""}</small> : null}
          {course.state === "different" && course.current ? <small>الحالي: {course.current.name} · {countOf(course.current.credit, AR.unit)} · {countOf(course.current.hours, AR.hour)}. المطلوب: {course.differences.map(field => labels[field]).join("، ")}.</small> : null}
          {course.state === "missing" ? <small>غير موجود في كتالوج الكلية بهذه الهوية؛ يلزم استكماله لدى القسم المالك.</small> : null}
          {course.state === "ambiguous" ? <small>الرمز يطابق أكثر من سجل؛ تُحسم الهوية قبل أي تعديل.</small> : null}
        </article>)}
      </section>)}
    </details>)}
  </section>;
}
