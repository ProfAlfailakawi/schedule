/**
 * ── شعبٌ يُفضَّل زيادتها ─────────────────────────────────────────────────────────────
 *
 * شارةٌ هادئة في شريط الاعتماد، اختيارية: تظهر فقط إن كان لمقررٍ شعبٌ أقل مما يطلبه الطلبة أو يقرّره تخطيط القسم.
 * تفتح قائمةً قصيرة («٥ ← ٧») وفي ذيلها دعوةٌ لرفع كشف المتبقي لمقارنةٍ أدق. لا تمنع توقيعاً ولا تكتب شيئاً.
 * الحساب في utils/sectionGap.ts؛ المصدران: /api/schedules/section-gap و/api/registration-stats.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ClipboardList, Layers, Users, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { sectionGaps, type GapCourse, type GapPlan } from "../utils/sectionGap";

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
export function useSectionGap(collegeId: number, sectionId: number, termId: number, refreshSignal = 0) {
  const scope = `${collegeId}:${sectionId}:${termId}`;
  const [loaded, setLoaded] = useState<{ scope: string; payload: GapPayload } | null>(null);
  const [past, setPast] = useState<{ scope: string; stamp: string; history: GapPlan["history"] } | null>(null);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    fetch(`/api/schedules/section-gap?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then((body: GapPayload | null) => { if (!cancelled) setLoaded(body ? { scope, payload: body } : null); })
      .catch(() => { if (!cancelled) setLoaded(null); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, refreshSignal, scope]);
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
  const items = useMemo(() => {
    if (!data) return [];
    /* المتبقي بلا تاريخه يقترح «شعبةً واحدة» فيُخفي النقص؛ فلا يُعتدّ به حتى يصل التاريخ. */
    const plan: GapPlan = { accepted: data.accepted || {}, remaining: historyReady ? data.remaining || {} : {}, history: historyReady ? past!.history : {} };
    return sectionGaps(data.courses, plan);
  }, [data, historyReady, past]);
  return { items, planImported: Boolean(data?.planImported), loaded: data !== null };
}

type Gap = ReturnType<typeof useSectionGap>;

/** الشارة: عددُ المقررات التي تنقصها شعب. */
export function SectionGapBadge({ gap, open, onToggle }: { gap: Gap; open: boolean; onToggle: () => void }) {
  if (!gap.items.length) return null;
  return (
    <button type="button" className="apb-badge apb-data-btn" data-tone="info" aria-expanded={open} onClick={onToggle}
      title="شعبٌ يُفضَّل زيادتها · اختياري ولا يمنع التوقيع"
      data-guide-ignore="قائمة الشعب المقترح زيادتها — اختيارية، تعرض مقرراتٍ ينقصها شعب">
      <Layers aria-hidden="true" /><span>شعب</span><b>{num(gap.items.length)}</b><ChevronDown aria-hidden="true" className="apb-data-chev" />
    </button>
  );
}

/** قائمةٌ قصيرة: اسم المقرر، ومن أين جاء الرقم (طلبةٌ أم تخطيطك)، و«الموجود ← المطلوب». لا روابط ولا إدخال. */
export function SectionGapPanel({ gap, onClose }: { gap: Gap; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const list = all ? gap.items : gap.items.slice(0, SHOWN);
  return (
    <section className="apb-gap" aria-label="شعبٌ يُفضَّل زيادتها">
      <header>
        <span className="apb-gap-ic"><Layers aria-hidden="true" /></span>
        <strong>شعبٌ يُفضَّل زيادتها</strong>
        <small>اختياري</small>
        <button type="button" className="apb-dr-close" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاق قائمة الشعب المقترحة"><X aria-hidden="true" /></button>
      </header>
      <ul className="apb-gap-list">
        {list.map(item => (
          <li key={item.id}>
            <span className="apb-gap-name"><b>{item.name}</b><small>{item.code}</small></span>
            {item.basis === "plan"
              ? <span className="apb-gap-why"><ClipboardList aria-hidden="true" />تخطيطك</span>
              : <span className="apb-gap-why"><Users aria-hidden="true" />{countOf(item.demand, AR.student)} طلبوه</span>}
            <span className="apb-gap-pill" title={`الموجود ${num(item.existing)} والمطلوب ${num(item.required)}`}>
              <i>{num(item.existing)}</i><em aria-hidden="true">←</em><b>{num(item.required)}</b>
            </span>
          </li>
        ))}
      </ul>
      {gap.items.length > SHOWN ? (
        <footer>
          <button type="button" className="apb-gap-link" onClick={() => setAll(value => !value)} data-guide-ignore="عرض كل المقررات المقترحة أو إخفاؤها">
            {all ? "أقل" : `الكل (${num(gap.items.length)})`}
          </button>
        </footer>
      ) : null}
    </section>
  );
}
