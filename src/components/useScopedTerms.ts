import { useEffect, useMemo, useRef, useState } from "react";

/**
 * قائمةُ الفصل لا تُري القسمَ فصلاً لا بيانات له فيه — خاصةً الفصول السابقة — عدا الفصل الحالي فيبقى ولو فارغاً
 * (قد يريد القسم إنشاءه). القرارُ في الخادم (`/api/terms/scoped`) من صفوف نطاق القارئ نفسه؛ وهنا تُرشَّح القائمةُ بما
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
  const [loaded, setLoaded] = useState<{ scope: string; ids: number[]; current: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/terms/scoped?collegeId=${collegeId || 0}&sectionId=${sectionId || 0}`)
      .then(response => (response.ok ? response.json() : null))
      .then(body => { if (!cancelled && body && Array.isArray(body.termIds)) setLoaded({ scope, ids: body.termIds.map(Number), current: Number(body.currentTermId) || 0 }); })
      .catch(() => { /* تبقى القائمة كاملة: إخفاءُ الفصول تحسينٌ لا شرط */ });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, scope, list.length]);
  const known = loaded && loaded.scope === scope ? loaded : null;
  const visible = useMemo(() => (known ? list.filter(term => known.ids.includes(Number(term.AdTermId))) : [...list]), [list, known]);
  const invalid = useRef(onInvalid);
  invalid.current = onInvalid;
  useEffect(() => {
    if (!known || !termId || known.ids.includes(Number(termId))) return;
    const fallback = known.current && known.ids.includes(known.current) ? known.current : known.ids[0];
    if (fallback) invalid.current?.(fallback);
  }, [known, termId]);
  return visible;
}
