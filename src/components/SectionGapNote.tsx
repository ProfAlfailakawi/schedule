/**
 * ── شعبٌ يُفضَّل زيادتها ─────────────────────────────────────────────────────────────
 *
 * شارةٌ هادئة في شريط الاعتماد، اختيارية: تظهر فقط إن كان لمقررٍ شعبٌ أقل مما يطلبه الطلبة أو يقرّره تخطيط القسم.
 * تفتح قائمةً قصيرة («٥ ← ٧») وفي ذيلها دعوةٌ لرفع كشف المتبقي لمقارنةٍ أدق. لا تمنع توقيعاً ولا تكتب شيئاً.
 * الحساب في utils/sectionGap.ts؛ المصدران: /api/schedules/section-gap و/api/registration-stats.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, Layers, Users, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { planGaps, studentGaps, type GapCourse, type GapItem, type GapPlan } from "../utils/sectionGap";
import { sortByName } from "../utils/sorting";

interface GapPayload {
  respondents: number; planImported: boolean; planSource: { fileName: string; importedAt: string } | null;
  accepted: Record<string, number>; remaining: Record<string, number>; courses: GapCourse[];
}
const SHOWN = 5;
const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * القراءتان تُوسمان بنطاقهما: تبدّل القسم أو الفصل لا يُبقي أسماء القسم السابق ولا أرقامه لحظةً (الشريط نفسه يبقى مركّباً).
 * «المختار» يأتي مع القراءة الخفيفة (يتجدد مع كل تعديلٍ في الجدول)، أما التاريخ — وهو الثقيل — فيُجلب مرةً لكل كشفٍ مرفوع.
 */
export const PLAN_SAVED_EVENT = "schedule:plan-saved";

export function useSectionGap(collegeId: number, sectionId: number, termId: number, refreshSignal = 0) {
  const scope = `${collegeId}:${sectionId}:${termId}`;
  const [loaded, setLoaded] = useState<{ scope: string; payload: GapPayload } | null>(null);
  const [past, setPast] = useState<{ scope: string; stamp: string; history: GapPlan["history"] } | null>(null);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    fetch(`/api/schedules/section-gap?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then((body: GapPayload | null) => { if (!cancelled) setLoaded(body ? { scope, payload: body } : null); })
      .catch(() => { if (!cancelled) setLoaded(null); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, refreshSignal, scope, bump]);
  /* تخطيط الشعب يحفظ في السجلّ نفسه: مسحُ الكشف هناك (أو رفعُه) يُحدِّث الشارات والأيقونة هنا دون إعادة فتح الشاشة. */
  useEffect(() => {
    const onSaved = (event: Event) => {
      const at = (event as CustomEvent<{ scope?: string }>).detail?.scope;
      if (!at || at === scope) setBump(n => n + 1);
    };
    window.addEventListener(PLAN_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(PLAN_SAVED_EVENT, onSaved);
  }, [scope]);
  const data = loaded && loaded.scope === scope ? loaded.payload : null;
  const stamp = data?.planImported ? String(data.planSource?.importedAt || "imported") : "";
  useEffect(() => {
    if (!stamp) return;
    let cancelled = false;
    fetch(`/api/registration-stats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (!cancelled && body) setPast({ scope, stamp, history: body.history || {} }); })
      .catch(() => { if (!cancelled) setPast(null); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, stamp, scope]);
  const historyReady = Boolean(stamp) && past?.scope === scope && past.stamp === stamp;
  /* مصدران منفصلان: التخطيط (المختار أو كشف المتبقي) ورغبات الطلبة في «مساري». لا يدخل أحدهما في الآخر. */
  const planItems = useMemo(() => {
    if (!data) return [];
    /* المتبقي بلا تاريخه يقترح «شعبةً واحدة» فيُخفي النقص؛ فلا يُعتدّ به حتى يصل التاريخ. */
    const plan: GapPlan = { accepted: data.accepted || {}, remaining: historyReady ? data.remaining || {} : {}, history: historyReady ? past!.history : {} };
    return planGaps(data.courses, plan);
  }, [data, historyReady, past]);
  const studentItems = useMemo(() => (data ? studentGaps(data.courses) : []), [data]);
  const reload = useCallback(() => setBump(value => value + 1), []);
  /* مع كشفٍ مرفوع لا تكتمل حسبة التخطيط قبل أن يصل تاريخ الفصول (وإلا اقترح «شعبةً واحدة» فأخفى النقص). */
  const ready = data !== null && (!data.planImported || historyReady);
  return { planItems, studentItems, courses: data?.courses || [], planImported: Boolean(data?.planImported), loaded: data !== null, ready, source: data?.planSource?.fileName || "", reload };
}

export type Gap = ReturnType<typeof useSectionGap>;

/** The quick comparison duplicates planning's entry point whenever its badge is shown.
 * Keep the decision tied to the very same planItems used by SectionGapBadge,
 * not only to whether a remaining-students file has been uploaded. */
export function showQuickCompareBadge(gap: Pick<Gap, "loaded" | "planImported" | "planItems">): boolean {
  return gap.loaded && !gap.planImported && gap.planItems.length === 0;
}

export type GapKind = "plan" | "students";
const KIND = {
  plan: { Icon: ClipboardList, word: "التخطيط", title: "شعبٌ يُفضَّل زيادتها بحسب تخطيطك", hint: "من تخطيط الشعب: المختار أو كشف المتبقي · اختياري ولا يمنع التوقيع" },
  students: { Icon: Users, word: "مساري", title: "شعبٌ يطلبها الطلبة في «مساري»", hint: "من رغبات الطلبة في «مساري» · اختياري ولا يمنع التوقيع" },
} as const;

/** الشارة: عددُ المقررات التي تنقصها شعب بحسب هذا المصدر. شارتان منفصلتان: التخطيط، ومساري. */
export function SectionGapBadge({ items, kind, open, onToggle }: { items: GapItem[]; kind: GapKind; open: boolean; onToggle: () => void }) {
  if (!items.length) return null;
  const { Icon, word, hint } = KIND[kind];
  return (
    <button type="button" className="apb-badge apb-data-btn" data-tone="info" aria-expanded={open} onClick={onToggle} title={hint}
      data-guide-ignore="قائمة الشعب المقترح زيادتها — اختيارية، تعرض مقرراتٍ ينقصها شعب">
      <Icon aria-hidden="true" /><span>{word}</span><b>{num(items.length)}</b><ChevronDown aria-hidden="true" className="apb-data-chev" />
    </button>
  );
}

/** قائمةٌ قصيرة: اسم المقرر، وما بُني عليه الرقم، و«الموجود ← المطلوب». لا روابط ولا إدخال. */
export function SectionGapPanel({ items, kind, onClose }: { items: GapItem[]; kind: GapKind; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const ordered = useMemo(() => sortByName(items, item => item.name), [items]);
  const list = all ? ordered : ordered.slice(0, SHOWN);
  const { Icon, title } = KIND[kind];
  return (
    <section className="apb-gap" aria-label={title}>
      <header>
        <span className="apb-gap-ic"><Icon aria-hidden="true" /></span>
        <strong>{title}</strong>
        <small>اختياري</small>
        <button type="button" className="apb-dr-close" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاق قائمة الشعب المقترحة"><X aria-hidden="true" /></button>
      </header>
      <ul className="apb-gap-list">
        {list.map(item => (
          <li key={item.id}>
            <span className="apb-gap-name"><b>{item.name}</b><small>{item.code}</small></span>
            {kind === "students"
              ? <span className="apb-gap-why"><Users aria-hidden="true" />{countOf(item.demand, AR.student)}</span>
              : item.demand > 0 ? <span className="apb-gap-why">المتبقي {num(item.demand)}</span> : null}
            <span className="apb-gap-pill" title={`الموجود ${num(item.existing)} والمطلوب ${num(item.required)}`}>
              <i>{num(item.existing)}</i><em aria-hidden="true">←</em><b>{num(item.required)}</b>
            </span>
          </li>
        ))}
      </ul>
      {items.length > SHOWN ? (
        <footer>
          <button type="button" className="apb-gap-link" onClick={() => setAll(value => !value)} data-guide-ignore="عرض كل المقررات المقترحة أو إخفاؤها">
            {all ? "أقل" : `الكل (${num(items.length)})`}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
