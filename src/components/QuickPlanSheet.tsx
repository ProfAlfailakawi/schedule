/**
 * ── «قارن شعبك بالمتبقي»: شاشةُ رفعٍ مختصرة ───────────────────────────────────────────
 *
 * تُفتح من الأيقونة الهادئة في شريط الاعتماد حين لا كشف مرفوعاً. زرٌّ واحد للرفع (القراءة والمراجعة والحماية هي نفسها
 * في «تخطيط الشعب»، فلا مسارَ ثانياً للاستيراد)، وما إن يُحفظ الكشف حتى تعرض الشاشةُ نفسها ما يُقترح زيادته أو أنه لا نقص.
 * لا جدولَ ولا تقريرَ ولا بناء: من أراد التخطيط الكامل فله شاشته.
 */
import React, { useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FileUp, X } from "lucide-react";
import SectionPlanning from "./SectionPlanning";
import { SectionGapPanel, type Gap } from "./SectionGapNote";
import { useDialogDismiss } from "./ui";

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
          gap.items.length ? <SectionGapPanel gap={gap} onClose={onClose} />
          : <p className="gap-sheet-ok"><CheckCircle2 aria-hidden="true" />شعبك تكفي المتبقي، لا زيادة مقترحة.</p>
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
