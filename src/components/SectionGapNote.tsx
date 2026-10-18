/**
 * ── شعبٌ يُفضَّل زيادتها ─────────────────────────────────────────────────────────────
 *
 * شارةٌ هادئة في شريط الاعتماد، اختيارية: تظهر فقط إن كان لمقررٍ شعبٌ أقل مما يطلبه الطلبة أو يقرّره تخطيط القسم.
 * تفتح قائمةً قصيرة («٥ ← ٧») وفي ذيلها دعوةٌ لرفع كشف المتبقي لمقارنةٍ أدق. لا تمنع توقيعاً ولا تكتب شيئاً.
 * الحساب في utils/sectionGap.ts؛ المصدران: /api/schedules/section-gap و/api/registration-stats.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, FileUp, Layers, X } from "lucide-react";
import { sectionGaps, type GapCourse, type GapPlan } from "../utils/sectionGap";

interface GapPayload { respondents: number; planImported: boolean; planSource: { fileName: string; importedAt: string } | null; courses: GapCourse[] }
const SHOWN = 5;
const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

export function useSectionGap(collegeId: number, sectionId: number, termId: number, refreshSignal = 0) {
  const [data, setData] = useState<GapPayload | null>(null);
  const [plan, setPlan] = useState<GapPlan | null>(null);
  useEffect(() => {
    if (!collegeId || !sectionId || !termId) return;
    let cancelled = false;
    fetch(`/api/schedules/section-gap?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then((body: GapPayload | null) => { if (!cancelled) setData(body); })
      .catch(() => { if (!cancelled) setData(null); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, refreshSignal]);
  const planImported = Boolean(data?.planImported);
  useEffect(() => {
    setPlan(null);
    if (!planImported) return;
    let cancelled = false;
    fetch(`/api/registration-stats?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`)
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (!cancelled && body) setPlan({ remaining: body.remaining || {}, accepted: body.accepted || {}, history: body.history || {} }); })
      .catch(() => { if (!cancelled) setPlan(null); });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, termId, planImported]);
  const items = useMemo(() => (data ? sectionGaps(data.courses, plan) : []), [data, plan]);
  return { items, planImported, loaded: data !== null };
}

type Gap = ReturnType<typeof useSectionGap>;

/** الشارة: عددُ المقررات التي تنقصها شعب. وإن لم يُرفع كشفٌ بعد ولم يبقَ ما يقال، دعوةٌ خافتة إليه عند حلول وقت التوقيع. */
export function SectionGapBadge({ gap, open, onToggle, inviteImport, onOpenPlanning }: { gap: Gap; open: boolean; onToggle: () => void; inviteImport: boolean; onOpenPlanning?: () => void }) {
  if (gap.items.length) {
    return (
      <button type="button" className="apb-badge apb-data-btn" data-tone="info" aria-expanded={open} onClick={onToggle}
        title="شعبٌ يُفضَّل زيادتها · اختياري ولا يمنع التوقيع"
        data-guide-ignore="قائمة الشعب المقترح زيادتها — اختيارية، تعرض مقرراتٍ ينقصها شعب">
        <Layers aria-hidden="true" /><span>شعب</span><b>{num(gap.items.length)}</b><ChevronDown aria-hidden="true" className="apb-data-chev" />
      </button>
    );
  }
  if (inviteImport && gap.loaded && !gap.planImported && onOpenPlanning) {
    return (
      <button type="button" className="apb-badge apb-data-btn apb-gap-ghost" onClick={onOpenPlanning}
        title="لم يُرفع كشف المتبقي بعد. بالرفع نقارن شعبك بالمتبقي من التسجيل ونقترح الزيادة بدقة أكبر من طلب الطلبة وحدهم."
        data-guide-ignore="دعوةٌ اختيارية لرفع كشف المتبقي من عمادة التسجيل">
        <FileUp aria-hidden="true" /><span>قارن بكشف المتبقي</span>
      </button>
    );
  }
  return null;
}

export function SectionGapPanel({ gap, onClose, onOpenPlanning }: { gap: Gap; onClose: () => void; onOpenPlanning?: () => void }) {
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
            <span className="apb-gap-why">{item.basis === "plan" ? "حسب تخطيطك" : `طلبه ${num(item.demand)}`}</span>
            <span className="apb-gap-pill" title={`الموجود ${num(item.existing)} والمطلوب ${num(item.required)}`}>
              <i>{num(item.existing)}</i><em aria-hidden="true">←</em><b>{num(item.required)}</b>
            </span>
          </li>
        ))}
      </ul>
      {!gap.planImported ? (
        <p className="apb-gap-note">الأرقام هنا من طلب الطلبة وحدهم. ارفع كشف المتبقي لنقارن شعبك بالمتبقي من التسجيل وتصير الزيادة أدق.</p>
      ) : null}
      <footer>
        {gap.items.length > SHOWN ? (
          <button type="button" className="apb-gap-link" onClick={() => setAll(value => !value)} data-guide-ignore="عرض كل المقررات المقترحة أو إخفاؤها">
            {all ? "أقل" : `الكل (${num(gap.items.length)})`}
          </button>
        ) : <span />}
        {onOpenPlanning ? (
          <button type="button" className="apb-gap-link" onClick={onOpenPlanning} data-guide-ignore="يفتح تخطيط الشعب لرفع كشف المتبقي">
            <FileUp aria-hidden="true" />{gap.planImported ? "تخطيط الشعب" : "قارن بكشف المتبقي"}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
