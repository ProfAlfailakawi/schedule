import { AR, countOf } from "../utils/arabicCount";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, Check, GraduationCap, Layers3, Link2, Search } from "lucide-react";
import type { compareCurriculumReference } from "../utils/curriculumReference";
import type { CurriculumReference } from "../data/technologyEducationCurricula";
import { courseLevelFromCode } from "../utils/curriculumRules";
import { Notice } from "./ui";
import ReferenceApplyPanel from "./ReferenceApplyPanel";

type Reference = Omit<CurriculumReference, "groups"> & { planId: string | null; groups: Array<Omit<ReturnType<typeof compareCurriculumReference>[number], "courses"> & { courses: Array<ReturnType<typeof compareCurriculumReference>[number]["courses"][number] & { ownerSectionId: number; ownerSectionName: string; ownerCollegeId: number }> }> };
type SectionResult = { sectionId: number; collegeId: number; collegeName: string; sectionName: string; references: Reference[] };
type RefCourse = Reference["groups"][number]["courses"][number];
type CourseEntry = { course: RefCourse; groupId: string; groupName: string; category: string; requiredUnits: number; elective: boolean; level: number };
type CatalogAction = { kind: "edit" | "create"; sectionId: number; collegeId: number; courseId?: number; code: string; name: string; credit: number; hours: number };

const statusLabels: Record<string, string> = { matched: "مطابق", different: "يحتاج تصحيحًا", missing: "غير مضاف", ambiguous: "هوية غير محسومة" };
const statusIcon = (state: string) => state === "matched" ? <Check size={14} aria-hidden="true" /> : <AlertCircle size={14} aria-hidden="true" />;
const plainCode = (value: string) => String(value || "").replace(/\s+/g, "").toUpperCase();

export default function CurriculumReferenceReview({ sectionId, onCatalogAction, canApply, onPick, others, onPickOther }: {
  sectionId: number; onCatalogAction?: (action: CatalogAction) => void; canApply?: boolean;
  /** اختيارُ موقعٍ أو نسخةٍ هنا يقود الصفحةَ كلَّها: لا منتقيَ ثانياً فوقها. */
  onPick?: (sectionId: number, referenceId: string, planId: string | null) => void;
  /** أقسامٌ ليس لها مرجع (للانتقال إليها من القائمة نفسها). */
  others?: Array<{ sectionId: number; label: string }>; onPickOther?: (sectionId: number) => void;
}) {
  const [sections, setSections] = useState<SectionResult[]>([]);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("new");
  const [selectedSectionId, setSelectedSectionId] = useState(sectionId);
  const [category, setCategory] = useState("all");
  const [groupKind, setGroupKind] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [focusedCode, setFocusedCode] = useState("");
  const [reload, setReload] = useState(0);

  const loadedAt = useRef(-1);
  useEffect(() => {
    let active = true; setError(""); setFocusedCode("");
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
  /* مقررات القسم وحدها: مقررات الكلية العامة (ثقافة عامة ومتطلبات الكلية) تُصحَّح عند أقسامها، وعرضها هنا يوهم القسم أنها له.
     ما لم تُحسم ملكيته (ownerSectionId = 0) يبقى ظاهراً لأنه يحتاج قراراً. */
  const entries = useMemo<CourseEntry[]>(() => reference ? reference.groups.flatMap(group => group.courses.filter(course => !course.ownerSectionId || course.ownerSectionId === selectedSectionId).map(course => ({
    course, groupId: group.id, groupName: group.name, category: group.category, requiredUnits: group.requiredUnits, elective: group.elective,
    level: courseLevelFromCode(course.code) || 0,
  }))) : [], [reference, selectedSectionId]);
  const categoryOptions = useMemo(() => [...new Set(entries.map(row => row.category))], [entries]);
  const groupOptions = useMemo(() => [...new Map<string, string>(entries.map(row => [row.groupId, row.groupName] as const)).entries()], [entries]);
  const levelOptions = useMemo<number[]>(() => [...new Set<number>(entries.map(row => row.level))].sort((a, b) => a - b), [entries]);
  const focused = entries.find(row => row.course.code === focusedCode);

  const ancestry = useMemo(() => {
    const up = new Set<string>(), down = new Set<string>();
    if (!focusedCode) return { up, down };
    const byCode = new Map<string, CourseEntry>(entries.map(row => [plainCode(row.course.code), row] as const));
    const parents = (code: string) => byCode.get(plainCode(code))?.course.prerequisites || [];
    const visitUp = (code: string) => parents(code).forEach(parent => {
      const key = plainCode(parent);
      if (!byCode.has(key) || up.has(key)) return;
      up.add(key); visitUp(key);
    });
    const visitDown = (code: string) => entries.filter(row => row.course.prerequisites.some(value => plainCode(value) === plainCode(code))).forEach(row => {
      const key = plainCode(row.course.code);
      if (down.has(key)) return;
      down.add(key); visitDown(key);
    });
    visitUp(focusedCode); visitDown(focusedCode);
    return { up, down };
  }, [entries, focusedCode]);

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ar");
    return entries.filter(row => (category === "all" || row.category === category)
      && (groupKind === "all" || row.groupId === groupKind)
      && (levelFilter === "all" || row.level === Number(levelFilter))
      && (statusFilter === "all" || (statusFilter === "attention" ? row.course.state !== "matched" : row.course.state === statusFilter))
      && (!q || `${row.course.name} ${row.course.code}`.toLocaleLowerCase("ar").includes(q)));
  }, [entries, category, groupKind, levelFilter, statusFilter, query]);



  if (error) return <Notice type="error">{error}</Notice>;
  if (!reference) return null;
  const missing = entries.filter(row => row.course.state === "missing").length;
  const review = entries.filter(row => row.course.state === "different" || row.course.state === "ambiguous").length;
  const matches = entries.filter(row => row.course.state === "matched").length;
  const group = focused ? reference.groups.find(row => row.id === focused.groupId) : null;

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
          setSelectedSectionId(id); setFocusedCode("");
          const next = sections.find(row => row.sectionId === id)?.references.find(row => row.id === selected) || sections.find(row => row.sectionId === id)?.references[0];
          onPick?.(id, selected, next?.planId || null);
        }}>
          {sections.map(row => <option key={row.sectionId} value={row.sectionId}>{row.collegeName} · {row.sectionName}</option>)}
          {others?.length ? <optgroup label="أقسام أخرى">{others.map(row => <option key={row.sectionId} value={`other:${row.sectionId}`}>{row.label}</option>)}</optgroup> : null}
        </select></label> : null}
        <div className="curriculum-reference-tabs" role="tablist" aria-label="نسخة الصحيفة">
          {references.map(row => <button key={row.id} type="button" role="tab" aria-selected={row.id === selected} onClick={() => { setSelected(row.id); setFocusedCode(""); onPick?.(selectedSectionId, row.id, row.planId); }} data-guide-ignore="اختيار الصحيفة المصدرية داخل مراجعة الصحيفة">{row.name}</button>)}
        </div>
      </div>
    </header>

    <div className="reference-summary" aria-label="ملخص الصحيفة">
      <div className="reference-summary-item"><span className="reference-summary-icon"><GraduationCap size={17} /></span><span><small>وحدات التخرج</small><b>{countOf(reference.degreeUnits, AR.unit)}</b></span></div>
      <div className="reference-summary-item"><span className="reference-summary-icon"><BookOpen size={17} /></span><span><small>مقررات الصحيفة</small><b>{countOf(entries.length, AR.course)}</b></span></div>
      <div className="reference-summary-item is-ok"><span className="reference-summary-icon"><Check size={17} /></span><span><small>مطابقة</small><b>{countOf(matches, AR.course)}</b></span></div>
      <div className={`reference-summary-item${missing ? " is-missing" : ""}`}><span className="reference-summary-icon"><AlertCircle size={17} /></span><span><small>تحتاج متابعة</small><b>{countOf(missing + review, AR.course)}</b></span></div>
    </div>

    <div className="reference-sections" role="tablist" aria-label="أقسام الصحيفة">
      {["all", ...categoryOptions].map(option => {
        const rows = option === "all" ? entries : entries.filter(row => row.category === option);
        return <button key={option} type="button" role="tab" aria-selected={category === option} className={category === option ? "on" : ""} onClick={() => setCategory(option)} data-guide-ignore="تصفية مقررات الصحيفة بحسب قسمها: ثقافة عامة وتخصصية ومهنية وتدريب ميداني">
          <b>{option === "all" ? "كل الأقسام" : option}</b><small>{countOf(rows.length, AR.course)} · {countOf(rows.reduce((sum, row) => sum + row.course.credit, 0), AR.unit)}</small>
        </button>;
      })}
    </div>

    {canApply ? <ReferenceApplyPanel key={`${selectedSectionId}:${reference.id}`} referenceId={reference.id} referenceName={reference.name} onApplied={() => setReload(n => n + 1)} /> : null}

    <div className="reference-filterbar" aria-label="تصفية المقررات">
      <label className="reference-search"><Search size={16} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="ابحث باسم المقرر أو رمزه" aria-label="ابحث باسم المقرر أو رمزه" /></label>
      <label><Layers3 size={15} aria-hidden="true" /><select aria-label="المجموعة" value={groupKind} onChange={event => setGroupKind(event.target.value)}><option value="all">كل المجموعات</option>{groupOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label><span className="reference-level-mark" aria-hidden="true">١٠٠</span><select aria-label="المستوى" value={levelFilter} onChange={event => setLevelFilter(event.target.value)}><option value="all">كل المستويات</option>{levelOptions.map(value => <option key={value} value={String(value)}>{value ? `المستوى ${value}` : "تمهيدي / غير مصنف"}</option>)}</select></label>
      <label><AlertCircle size={15} aria-hidden="true" /><select aria-label="حالة المطابقة" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="all">كل الحالات</option><option value="attention">تحتاج متابعة</option><option value="matched">مطابقة</option><option value="different">تحتاج تصحيحًا</option><option value="missing">غير مضافة</option><option value="ambiguous">هوية غير محسومة</option></select></label>
    </div>

    <details className="reference-guide"><summary><Link2 size={14} />طريقة قراءة الربط</summary><div className="reference-legend" aria-label="دليل روابط المتطلبات">
      <span><i className="legend-current" />المقرر المحدد</span><span><i className="legend-prereq" />مسبقاتُه</span><span><i className="legend-next" />مقررات يفتحها</span><span className="reference-legend-note">اضغط مقررًا لإظهار تسلسل متطلباته</span>
    </div></details>

    {focused ? <aside className="reference-selected" aria-live="polite">
      <div className="reference-selected-head"><span><bdi dir="ltr">{focused.course.code}</bdi><strong>{focused.course.name}</strong></span><button type="button" onClick={() => setFocusedCode("")} aria-label="إلغاء تحديد المقرر" data-guide-ignore="إلغاء تحديد المقرر في لوحة ربط متطلبات الصحيفة">إلغاء التحديد</button></div>
      <div className="reference-selected-links">
        <span className="reference-link-label">يسبقه</span>
        {focused.course.prerequisites.length ? focused.course.prerequisites.map(code => {
          const parent = entries.find(row => plainCode(row.course.code) === plainCode(code));
          return <button key={code} type="button" className="link-prereq" onClick={() => { setFocusedCode(parent?.course.code || ""); if (!parent) setQuery(code); }} data-guide-ignore="انتقال إلى المقرر السابق ضمن سلسلة المتطلبات الأكاديمية"><bdi dir="ltr">{code}</bdi>{parent ? ` · ${parent.course.name}` : " · شرط خارجي يحتاج توثيقًا"}</button>;
        }) : <span className="reference-no-link">لا توجد متطلبات سابقة مسجلة في المرجع</span>}
        {focused.course.externalAlternative ? <span className="reference-external">بديل خارجي: {focused.course.externalAlternative} · يحتاج توثيق القسم</span> : null}
      </div>
      {group ? <small className="reference-selected-group">{focused.category} · {group.name} · {group.elective ? `اختياري؛ المطلوب ${countOf(group.requiredUnits, AR.unit)}` : "إجباري"}</small> : null}
    </aside> : null}

    {!reference.planId ? <Notice type="info" inline>لا توجد صحيفة تشغيلية مرتبطة بهذه النسخة؛ هذه المقارنة للمرجع فقط.</Notice> : null}
    {!visibleEntries.length ? <div className="reference-empty"><Search size={19} /><b>لا توجد مقررات بهذا الاختيار</b><span>غيّر المرشحات أو امسح البحث لعرض الصحيفة كاملة.</span><button type="button" onClick={() => { setQuery(""); setCategory("all"); setGroupKind("all"); setLevelFilter("all"); setStatusFilter("all"); }} data-guide-ignore="مسح مرشحات صحيفة التخرج وإظهار كل المقررات">مسح المرشحات</button></div> : (
      <div className="reference-flat" aria-label="مقررات القسم مرتبة بالمستوى">
        {[...visibleEntries].sort((x, y) => (x.level || 9999) - (y.level || 9999) || x.course.code.localeCompare(y.course.code)).map(({ course, level, category }) => {
          const key = plainCode(course.code), selectedCourse = focusedCode === course.code;
          const tone = ancestry.up.has(key) ? "prereq" : ancestry.down.has(key) ? "next" : "";
          return <article key={course.code} className={`reference-course-card state-${course.state}${tone ? ` is-${tone}` : ""}${selectedCourse ? " is-selected" : ""}`}>
            <button type="button" className="reference-course-main" aria-pressed={selectedCourse} onClick={() => setFocusedCode(selectedCourse ? "" : course.code)} data-guide-ignore="إظهار روابط المتطلبات للمقرر في الصحيفة">
              <span className="reference-course-top"><bdi dir="ltr">{course.code}</bdi>{level ? <i className="reference-level-pill" title={`المستوى ${level}`}>{level}</i> : null}<span className={`reference-status status-${course.state}`}>{statusIcon(course.state)}{statusLabels[course.state] || "حالة غير معروفة"}</span></span>
              <strong>{course.name}</strong>
              <span className="reference-course-meta">{countOf(course.credit, AR.unit)} <i /> {countOf(course.hours, AR.hour)} · {category}</span>
              {course.prerequisites.length ? <span className="reference-prereq-summary"><Link2 size={13} /> يسبقه {course.prerequisites.length} {course.prerequisites.length === 1 ? "متطلب" : "متطلبات"}</span> : null}
            </button>
            {course.current ? <small className="reference-course-capacity">السعة المسجلة: {course.current.capacity === null ? "غير محددة" : countOf(course.current.capacity, AR.student)}</small> : null}
            {course.current && course.ownerSectionId === selectedSectionId && onCatalogAction ? (
              <button type="button" className="reference-fix" data-guide-ignore="فتح بيانات المقرر المملوك للقسم لتعديل الوحدات والساعات والسعة" onClick={() => onCatalogAction({ kind: "edit", sectionId: selectedSectionId, collegeId: course.ownerCollegeId, courseId: course.current!.id, code: course.code, name: course.name, credit: course.credit, hours: course.hours })}>تعديل الوحدات والساعات والسعة</button>
            ) : null}
            {course.state === "different" && course.current ? <small className="reference-course-diff">المطلوب: {course.differences.map(field => ({ name: "الاسم", credit: "الوحدات", hours: "الساعات", membership: "عضوية الصحيفة" }[field] || field)).join("، " )}.</small> : null}
            {course.state === "different" && course.current && course.ownerSectionId !== selectedSectionId && course.ownerSectionName ? <small className="reference-course-owner">السجل مملوك لقسم {course.ownerSectionName}؛ يتولى القسم المالك تصحيحه.</small> : null}
            {course.state === "missing" ? <small className="reference-course-owner">{course.ownerSectionName ? `غير موجود في كتالوج قسم ${course.ownerSectionName}.` : "لم تُحسم ملكية المقرر بعد."}</small> : null}
            {course.state === "ambiguous" ? <small className="reference-course-owner">الرمز يطابق أكثر من سجل؛ يلزم حسم الهوية قبل التعديل.</small> : null}
            {course.state === "missing" && course.ownerSectionId === selectedSectionId && onCatalogAction ? (
              <button type="button" className="reference-fix" data-guide-ignore="بدء إضافة المقرر الناقص إلى سجل القسم" onClick={() => onCatalogAction({ kind: "create", sectionId: selectedSectionId, collegeId: course.ownerCollegeId, code: course.code, name: course.name, credit: course.credit, hours: course.hours })}>أضف المقرر إلى القسم</button>
            ) : null}
          </article>;
        })}
      </div>
    )}
    <footer className="reference-footer"><span><Layers3 size={14} />{countOf(visibleEntries.length, AR.course)} من {countOf(entries.length, AR.course)}</span><span>المستوى مستنتج من آخر ثلاثة أرقام في رمز المقرر؛ راجع القسم عند اختلاف الرمز عن الصحيفة.</span></footer>
  </section>;
}
