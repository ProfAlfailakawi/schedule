import React, { createContext, useContext, useMemo } from "react";
import { History, Lock } from "lucide-react";
import { currentTermId, termIsFrozen, TERM_FROZEN_LABEL } from "../utils/termSequence";

/**
 * ── شريطُ «فصل سابق · للعرض فقط» ─────────────────────────────────────────────
 * القاعدةُ في `termIsFrozen` (termSequence.ts) وهي نفسُها التي يحرس بها الخادم:
 * هذا الشريطُ يُخبر، والخادمُ يمنع. الشاشاتُ الثلاث (كشف التسجيل، رغبات الأساتذة،
 * تغييرات الجدول) تستعمله ولا ترسم نسخةً ثانية.
 */
/** يقرؤه كلُّ زرِّ كتابةٍ في الشاشة دون تمرير الخاصية عبر خمس طبقات: معطَّلٌ لا محذوف. */
export const TermFrozenContext = createContext(false);
export const useFrozenScreen = () => useContext(TermFrozenContext);

export function useTermFrozen(termId: number, terms: ReadonlyArray<any> | null | undefined): boolean {
  return useMemo(() => Boolean(terms && termId && termIsFrozen(termId, terms as any)), [termId, terms]);
}

export default function TermFrozenRibbon({ termId, terms, onGoCurrent }: {
  termId: number; terms: ReadonlyArray<any> | null | undefined; onGoCurrent?: (termId: number) => void;
}) {
  const frozen = useTermFrozen(termId, terms);
  const current = useMemo(() => {
    const id = terms ? currentTermId(terms as any) : 0;
    return (terms || []).find(term => Number(term.AdTermId) === id) || null;
  }, [terms]);
  if (!frozen) return null;
  const term = (terms || []).find(item => Number(item.AdTermId) === Number(termId));
  return (
    <div className="term-frozen-ribbon" role="status" data-term-frozen="true">
      <span className="tfr-lock" aria-hidden="true"><Lock /></span>
      <b>{TERM_FROZEN_LABEL}</b>
      {term?.AdTermName ? <small><History aria-hidden="true" />{term.AdTermName}</small> : null}
      {current && onGoCurrent && Number(current.AdTermId) !== Number(termId)
        ? <button type="button" className="tfr-go" onClick={() => onGoCurrent(Number(current.AdTermId))} data-guide-ignore="تبديل الفصل المعروض إلى الجاري — لا يكتب شيئاً">إلى {current.AdTermName}</button>
        : null}
    </div>
  );
}
