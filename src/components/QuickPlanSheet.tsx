/**
 * ── «قارن شعبك بالمتبقي»: شاشةُ رفعٍ مختصرة ───────────────────────────────────────────
 *
 * تُفتح من الأيقونة الهادئة في شريط الاعتماد حين لا كشف مرفوعاً. زرٌّ واحد للرفع (القراءة والمراجعة والحماية هي نفسها
 * في «تخطيط الشعب»، فلا مسارَ ثانياً للاستيراد)، وما إن يُحفظ الكشف حتى تعرض الشاشةُ نفسها ما يُقترح زيادته أو أنه لا نقص.
 * لا جدولَ ولا تقريرَ ولا بناء: من أراد التخطيط الكامل فله شاشته.
 */
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FileText, FileUp, Layers, X } from "lucide-react";
import SectionPlanning from "./SectionPlanning";
import { type Gap } from "./SectionGapNote";
import { AR, countOf } from "../utils/arabicCount";
import { useDialogDismiss } from "./ui";

const num = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
const TOP = 4;

/** النتيجة: سطرٌ واحد يقول كم مقرراً ينقصه شعب، وأربعةُ أسطرٍ على الأكثر («الموجود» شريطاً و«+الزيادة»)، ثم «تم». */
/** الموجود مربعاتٍ ممتلئة، والمطلوب زيادتُه مربعاتٍ مفرَّغة. فوق عشرة تُقسَم على النسبة فيبقى الرسم بحجمٍ واحد. */
function Cells({ existing, required }: { existing: number; required: number }) {
  const cells = Math.min(required, 10);
  const filled = required > 10 ? Math.round((existing / required) * 10) : Math.min(existing, required);
  return (
    <span className="gap-cells" aria-hidden="true">
      {Array.from({ length: cells }, (_, index) => <i key={index} className={index < filled ? "on" : undefined} />)}
    </span>
  );
}

export function Result({ gap, onClose }: { gap: Gap; onClose: () => void }) {
  if (!gap.ready) return <p className="gap-sheet-hint" role="status">يُحسب المقترح…</p>;
  const total = gap.items.length;
  const top = gap.items.slice(0, TOP);
  return (
    <div className="gap-result" role="status">
      {total ? (
        <>
          <p className="gap-result-head"><Layers aria-hidden="true" /><b>{countOf(total, AR.course)}</b> تحتاج شعباً</p>
          <ul>
            {top.map(item => (
              <li key={item.id} title={`الموجود ${num(item.existing)} والمطلوب ${num(item.required)}`}>
                <span className="gap-result-name"><b>{item.name}</b><small>{item.code}</small></span>
                <Cells existing={item.existing} required={item.required} />
                <span className="gap-result-plus">+{num(item.extra)}</span>
              </li>
            ))}
          </ul>
          {total > TOP ? <small className="gap-result-more">و{countOf(total - TOP, AR.course)} أخرى</small> : null}
        </>
      ) : (
        <p className="gap-sheet-ok"><CheckCircle2 aria-hidden="true" />شعبك تكفي المتبقي، لا زيادة مقترحة.</p>
      )}
      <footer>
        <small>{gap.source ? <><FileText aria-hidden="true" /><bdi dir="ltr">{gap.source}</bdi></> : null}</small>
        <button type="button" className="gap-result-done" onClick={onClose} data-guide-ignore="إغلاق شاشة النتيجة">تم</button>
      </footer>
    </div>
  );
}

export default function QuickPlanSheet({ collegeId, sectionId, termId, gap, onClose }: { collegeId: number; sectionId: number; termId: number; gap: Gap; onClose: () => void }) {
  useDialogDismiss(true, onClose);
  const [saved, setSaved] = useState(false);
  const done = saved && gap.planImported;
  return createPortal(
    <div className="student-qr-backdrop no-print" onClick={onClose}>
      <div className="gap-sheet" role="dialog" aria-modal="true" aria-label="قارن شعبك بكشف المتبقي" onClick={event => event.stopPropagation()}>
        <header>
          <span className="gap-sheet-ic"><FileUp aria-hidden="true" /></span>
          <div><strong>قارن شعبك بالمتبقي</strong><small>اختياري</small></div>
          <button type="button" className="student-qr-close" aria-label="إغلاق" onClick={onClose} data-guide-ignore="إغلاق شاشة رفع الكشف"><X aria-hidden="true" /></button>
        </header>
        {done ? (
          <Result gap={gap} onClose={onClose} />
        ) : (
          <>
            <p className="gap-sheet-hint">ارفع كشف المتبقي من عمادة التسجيل (PDF أو صور)، فتظهر لك الشعب المقترح زيادتها.</p>
            <SectionPlanning collegeId={collegeId} sectionId={sectionId} termId={termId} importOnly onSaved={() => { setSaved(true); gap.reload(); }} />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
