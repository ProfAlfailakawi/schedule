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

/** فصول نطاق القارئ ذات البيانات، والحالي دائمًا. لا تُعرض القائمة الخام قبل التحقق من النطاق. */
export function useScopedTerms<T extends { AdTermId: number }>(
  terms: readonly T[] | null | undefined,
  collegeId: number,
  sectionId: number,
  termId = 0,
  onInvalid?: (fallbackTermId: number) => void,
  analysisScope: "college" | "department" = "college",
): T[] {
  const list: readonly T[] = terms || [];
  const scope = `${collegeId}:${sectionId}:${analysisScope}`;
  const [loaded, setLoaded] = useState<{ scope: string; ids: number[]; current: number; newest: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchScoped(`/api/terms/scoped?collegeId=${collegeId || 0}&sectionId=${sectionId || 0}&analysisScope=${analysisScope}`)
      .then(body => { if (!cancelled && body && Array.isArray(body.termIds)) setLoaded({ scope, ids: body.termIds.map(Number), current: Number(body.currentTermId) || 0, newest: Number(body.newestTermId) || 0 }); })
      .catch(() => { /* لا تصبح الفصول غير المتحقق منها خيارات عند فشل القراءة. */ });
    return () => { cancelled = true; };
  }, [collegeId, sectionId, scope, list.length, analysisScope]);
  const known = loaded && loaded.scope === scope ? loaded : null;
  const visible = useMemo(() => (known ? list.filter(term => known.ids.includes(Number(term.AdTermId))) : []), [list, known]);
  const invalid = useRef(onInvalid);
  invalid.current = onInvalid;
  useEffect(() => {
    if (!known || !termId || known.ids.includes(Number(termId))) return;
    const fallback = [known.current, known.newest].find(id => id && known.ids.includes(id)) || known.ids[0];
    if (fallback) invalid.current?.(fallback);
  }, [known, termId]);
  return visible;
}
