import { AR, countOf } from "../utils/arabicCount";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, Check, GraduationCap } from "lucide-react";
import type { compareCurriculumReference } from "../utils/curriculumReference";
import type { CurriculumReference } from "../data/technologyEducationCurricula";
import { Notice } from "./ui";
import ReferenceApplyPanel from "./ReferenceApplyPanel";

type Reference = Omit<CurriculumReference, "groups"> & { planId: string | null; groups: Array<Omit<ReturnType<typeof compareCurriculumReference>[number], "courses"> & { courses: Array<ReturnType<typeof compareCurriculumReference>[number]["courses"][number] & { ownerSectionId: number; ownerSectionName: string; ownerCollegeId: number }> }> };
type SectionResult = { sectionId: number; collegeId: number; collegeName: string; sectionName: string; references: Reference[] };
type RefCourse = Reference["groups"][number]["courses"][number];
type CourseEntry = { course: RefCourse };


export default function CurriculumReferenceReview({ sectionId, canApply, onPick, others, onPickOther }: {
  sectionId: number; canApply?: boolean;
  /** اختيارُ موقعٍ أو نسخةٍ هنا يقود الصفحةَ كلَّها: لا منتقيَ ثانياً فوقها. */
  onPick?: (sectionId: number, referenceId: string, planId: string | null) => void;
  /** أقسامٌ ليس لها مرجع (للانتقال إليها من القائمة نفسها). */
  others?: Array<{ sectionId: number; label: string }>; onPickOther?: (sectionId: number) => void;
}) {
  const [sections, setSections] = useState<SectionResult[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("new");
  const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
  const [reload, setReload] = useState(0);

  const loadedAt = useRef(-1);
  useEffect(() => {
    let active = true; setError("");
    /* الموقعُ المطلوب ضمن ما حُمّل: لا إعادة جلب (يقود المنتقي الواحد الصفحةَ). */
    if (sections.some(row => row.sectionId === sectionId) && loadedAt.current === reload) { setSelectedSectionId(sectionId); return; }
    loadedAt.current = reload;
    setSections([]); setSelectedSectionId(sectionId);
    if (!sectionId) return;
    fetch(`/api/plan-review/reference?sectionId=${sectionId}`, { cache: "no-store" }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "تعذرت مقارنة الصحيفة");
      if (active) setSections([...new Map((body.sections || []).map((row: SectionResult) => [Number(row.sectionId), row])).values()]);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [sectionId, reload]);

  const references = sections.find(row => row.sectionId === selectedSectionId)?.references || [];
  const reference = references.find(row => row.id === selected);
  /* مقررات القسم المفتوح وحده، حذفاً لا تصفية: مقررات الكلية العامة (ثقافة عامة ومتطلبات الكلية) تُصحَّح عند أقسامها.
     فكلُّ تبويبٍ ومجموعةٍ ومستوىً وعدّادٍ يُشتقّ من هذه القائمة، فلا يظهر ما ليس فيه مقرر للقسم.
     ما لم تُحسم ملكيته (ownerSectionId = 0) لا يُحتسب هنا، وينبَّه إلى عدده في سطرٍ مستقل. */
  const undecided = useMemo(() => reference ? reference.groups.reduce((sum, group) => sum + group.courses.filter(course => !course.ownerSectionId).length, 0) : 0, [reference]);
  const entries = useMemo<CourseEntry[]>(() => reference ? reference.groups.flatMap(group => group.courses.filter(course => course.ownerSectionId === selectedSectionId).map(course => ({ course }))) : [], [reference, selectedSectionId]);
  if (error) return <Notice type="error">{error}</Notice>;
  if (!reference) return null;
  const missing = entries.filter(row => row.course.state === "missing").length;
  const review = entries.filter(row => row.course.state === "different" || row.course.state === "ambiguous").length;
  const matches = entries.filter(row => row.course.state === "matched").length;

  return <section className="curriculum-reference" aria-label="مراجعة صحيفة التخرج ومطابقة المقررات">
    <header className="curriculum-reference-head">
      <div className="curriculum-reference-title"><span className="reference-title-icon"><GraduationCap size={20} /></span><div>
        <h2>صحيفة التخرج</h2><p>{reference.program} · مقارنة مرجعية لا تغيّر البيانات أو تعتمدها.</p>
      </div></div>
      <div className="curriculum-reference-controls">
        {sections.length > 1 || others?.length ? <label>القسم والكلية <select aria-label="القسم والكلية" value={selectedSectionId} onChange={event => {
          const value = event.target.value;
          if (value.startsWith("other:")) { onPickOther?.(Number(value.slice(6))); return; }
          const id = Number(value);
          setSelectedSectionId(id);
          const next = sections.find(row => row.sectionId === id)?.references.find(row => row.id === selected) || sections.find(row => row.sectionId === id)?.references[0];
          onPick?.(id, selected, next?.planId || null);
        }}>
          {sections.map(row => <option key={row.sectionId} value={row.sectionId}>{row.collegeName} · {row.sectionName}</option>)}
          {others?.length ? <optgroup label="أقسام أخرى">{others.map(row => <option key={row.sectionId} value={`other:${row.sectionId}`}>{row.label}</option>)}</optgroup> : null}
        </select></label> : null}
        <div className="curriculum-reference-tabs" role="tablist" aria-label="نسخة الصحيفة">
          {references.map(row => <button key={row.id} type="button" role="tab" aria-selected={row.id === selected} onClick={() => { setSelected(row.id); onPick?.(selectedSectionId, row.id, row.planId); }} data-guide-ignore="اختيار الصحيفة المصدرية داخل مراجعة الصحيفة">{row.name}</button>)}
        </div>
      </div>
    </header>

    <div className="reference-summary" aria-label="ملخص الصحيفة">
      <div className="reference-summary-item"><span className="reference-summary-icon"><GraduationCap size={17} /></span><span><small>وحدات التخرج</small><b>{countOf(reference.degreeUnits, AR.unit)}</b></span></div>
      <div className="reference-summary-item"><span className="reference-summary-icon"><BookOpen size={17} /></span><span><small>مقررات الصحيفة</small><b>{countOf(entries.length, AR.course)}</b></span></div>
      <div className="reference-summary-item is-ok"><span className="reference-summary-icon"><Check size={17} /></span><span><small>مطابقة</small><b>{countOf(matches, AR.course)}</b></span></div>
      <div className={`reference-summary-item${missing ? " is-missing" : ""}`}><span className="reference-summary-icon"><AlertCircle size={17} /></span><span><small>تحتاج متابعة</small><b>{countOf(missing + review, AR.course)}</b></span></div>
    </div>

    {undecided ? <Notice type="info" inline>{countOf(undecided, AR.course)} بلا قسمٍ مالك محسوم، ولا تُحتسب هنا حتى تُحسم ملكيتها.</Notice> : null}

    {canApply ? <ReferenceApplyPanel key={`${selectedSectionId}:${reference.id}`} referenceId={reference.id} referenceName={reference.name} onApplied={() => setReload(n => n + 1)} /> : null}

    {!reference.planId ? <Notice type="info" inline>لا توجد صحيفة تشغيلية مرتبطة بهذه النسخة؛ هذه المقارنة للمرجع فقط.</Notice> : null}
  </section>;
}
