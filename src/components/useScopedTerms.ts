import { useEffect, useMemo, useRef, useState } from "react";

/* الطلبات المتطابقة المتزامنة (القائمة الرئيسية ونموذجا النسخ والإضافة على النطاق نفسه) تتشارك جواباً واحداً. */
const inflight = new Map<string, Promise<any>>();
function fetchScoped(url: string): Promise<any> {
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetch(url).then(response => (response.ok ? response.json() : null)).finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return pending;
}

/**
 * قائمةُ الفصل لا تُري القسمَ فصلاً لا بيانات له فيه — خاصةً الفصول السابقة — عدا أحدثَ فصلٍ فيبقى ولو فارغاً
 * (قد يريد القسم إنشاءه، فإن جاء بعده أحدثُ منه صار قديماً واختفى). القرارُ في الخادم (`/api/terms/scoped`) من صفوف نطاق القارئ نفسه؛ وهنا تُرشَّح القائمةُ بما
 * عاد. وقبل أن يعود الجواب تبقى القائمة كما هي فلا تومض. وإن كان الفصل المختار خارج ما ظهر انتقل إلى الحالي (`onInvalid`).
 */
export function useScopedTerms<T extends { AdTermId: number }>(
  terms: readonly T[] | null | undefined,
  collegeId: number,
  sectionId: number,
  termId = 0,
  onInvalid?: (fallbackTermId: number) => void,
): T[] {
  const list: readonly T[] = terms || [];
  const scope = `${collegeId}:${sectionId}`;
  const [loaded, setLoaded] = useState<{ scope: string; ids: number[]; current: number; newest: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchScoped(`/api/terms/scoped?collegeId=${collegeId || 0}&sectionId=${sectionId || 0}`)
      .then(body => { if (!cancelled && body && Array.isArray(body.termIds)) setLoaded({ scope, ids: body.termIds.map(Number), current: Number(body.currentTermId) || 0, newest: Number(body.newestTermId) || 0 }); })
      .catch(() => { /* تبقى القائمة كاملة: إخفاءُ الفصول تحسينٌ لا شرط */ });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, scope, list.length]);
  const known = loaded && loaded.scope === scope ? loaded : null;
  const visible = useMemo(() => (known ? list.filter(term => known.ids.includes(Number(term.AdTermId))) : [...list]), [list, known]);
  const invalid = useRef(onInvalid);
  invalid.current = onInvalid;
  useEffect(() => {
    if (!known || !termId || known.ids.includes(Number(termId))) return;
    const fallback = [known.current, known.newest].find(id => id && known.ids.includes(id)) || known.ids[0];
    if (fallback) invalid.current?.(fallback);
  }, [known, termId]);
  return visible;
}
