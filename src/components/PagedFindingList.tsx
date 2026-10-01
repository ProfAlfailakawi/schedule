import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { arabicMatchKey } from "../utils/arabicText";

/**
 * ── كلُّ ما في الملاحظة، في مكانها، صفحةً بعد صفحة ──────────────────────────
 *
 * كانت كلُّ قائمةٍ في مراجعة الاعتماد تعرض اثني عشر ثم تقول «و20 غيرها…»،
 * والقارئ الذي يوقّع لا يعرف من هم العشرون إلا إذا غادر المراجعة إلى الجدول.
 * فصار المعروضُ كلَّه هنا: صفحاتٌ ثابتة الطول، وتنقّلٌ بالسابق/التالي وأرقام
 * الصفحات، وبحثٌ بالاسم أو المقرر حين تطول القائمة.
 *
 * مكوّنٌ واحد لكل قوائم الملاحظات (قاعدة «قاعدة واحدة، مكان واحد»): العناصر
 * كلّها تُرسم وما خرج عن الصفحة مخفيّ — فيبقى ما فتحه القارئ مفتوحاً إذا عاد
 * إلى صفحته، والورقةُ المطبوعة تُظهر الكلّ بلا أزرار.
 */

const n = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/** أرقام الصفحات الظاهرة: الأولى والأخيرة وما حول الحالية، وفجوةٌ «…» بينها. */
export function pageWindow(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const shown = new Set([1, total, current - 1, current, current + 1].filter(page => page >= 1 && page <= total));
  if (current <= 3) [2, 3, 4].forEach(page => shown.add(page));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach(page => shown.add(page));
  const pages = [...shown].sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) out.push("gap");
    out.push(page);
  });
  return out;
}

interface Props<T> {
  items: T[];
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** اسم القائمة لقارئ الشاشة: «أساتذة الملاحظة»، «شعب المانع». */
  label: string;
  pageSize?: number;
  /** سطرُ الملخّص فوق القائمة: «21 أستاذاً · 34 شعبة». */
  summary?: React.ReactNode;
  /** نصُّ البحث لكل عنصر؛ إن غاب فلا بحث. */
  searchText?: (item: T) => string;
  searchPlaceholder?: string;
  /** يظهر البحث حين يزيد العدد عن هذا (افتراضاً: صفحتان). */
  searchThreshold?: number;
  /** صنف حاوية العناصر نفسها — لتبقى شبكتُها أو تباعدُها كما كانت. */
  listClassName?: string;
  className?: string;
}

export default function PagedFindingList<T>({
  items, getKey, renderItem, label, pageSize = 8, summary, searchText,
  searchPlaceholder = "ابحث بالاسم أو المقرر أو الشعبة", searchThreshold, listClassName = "", className = "",
}: Props<T>) {
  const size = Math.max(1, Math.floor(pageSize));
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const listId = useId();

  const searchable = Boolean(searchText) && items.length > (searchThreshold ?? size * 2);
  const needle = searchable ? arabicMatchKey(query) : "";
  /* المطابِق لكل عنصر بمؤشره الأصلي، فيبقى المفتاحُ والترقيمُ ثابتين مهما بُحث. */
  const matched = useMemo(() => {
    const all = items.map((item, index) => ({ item, index }));
    if (!needle || !searchText) return all;
    return all.filter(({ item }) => arabicMatchKey(searchText(item)).includes(needle));
  }, [items, needle, searchText]);

  const pages = Math.max(1, Math.ceil(matched.length / size));
  const current = Math.min(page, pages);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  useEffect(() => { setPage(1); }, [needle]);

  const from = (current - 1) * size;
  const visible = new Set(matched.slice(from, from + size).map(entry => entry.index));
  const paged = pages > 1;

  /* بعد تقليب الصفحة يعود رأسُ القائمة إلى النظر إن كان قد صعد خارجها —
     الزرّ في أسفلها، والصفحةُ الجديدة تبدأ من أعلاها. */
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const top = topRef.current;
    if (!top) return;
    const behavior: ScrollBehavior = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    /* نافذةُ المراجعة تمرّر جسمَها لا الصفحة: يُحرَّك أقربُ حاويةٍ تمرَّر، ولا
       تُمسّ الصفحةُ التي خلف النافذة. */
    let scroller: HTMLElement | null = top.parentElement;
    while (scroller) {
      const overflow = getComputedStyle(scroller).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    const offset = top.getBoundingClientRect().top - (scroller ? scroller.getBoundingClientRect().top + 12 : 80);
    if (offset >= 0) return;
    if (scroller) scroller.scrollBy({ top: offset, behavior });
    else window.scrollBy({ top: offset, behavior });
  }, [current]);

  const go = (target: number) => {
    const next = Math.min(pages, Math.max(1, target));
    if (next === current) return;
    moved.current = true;
    setPage(next);
  };

  /* الأسهم تتبع اتجاه القراءة: في العربية «التالي» إلى اليسار. */
  const onPagerKey = (event: React.KeyboardEvent<HTMLElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction !== "ltr";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    let target: number | null = null;
    if (event.key === forward) target = current + 1;
    else if (event.key === back) target = current - 1;
    else if (event.key === "Home") target = 1;
    else if (event.key === "End") target = pages;
    if (target === null) return;
    event.preventDefault();
    go(target);
  };

  /* «1–8» عددان باتجاه اليسار؛ في سطرٍ عربي يُقلبان «8–1» ما لم يُعزلا. */
  const rangeSpan = `${n(from + 1)}–${n(Math.min(from + size, matched.length))}`;
  const rangeLine = matched.length ? `${n(from + 1)} إلى ${n(Math.min(from + size, matched.length))} من ${n(matched.length)}` : "";

  return (
    <div className={`pfl ${paged ? "is-paged" : ""} ${className}`.trim()} role="group" aria-label={label}>
      <div ref={topRef} className="pfl-anchor" aria-hidden="true" />
      {summary || searchable || paged ? (
        <div className="pfl-head">
          {summary ? <div className="pfl-summary">{summary}</div> : null}
          {searchable ? (
            <label className="pfl-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => { if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); setQuery(""); } }}
                placeholder={searchPlaceholder}
                aria-label={`بحث في ${label}`}
                aria-controls={listId}
              />
              {needle ? <span className="pfl-hits" aria-hidden="true">{n(matched.length)} / {n(items.length)}</span> : null}
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label="مسح البحث" data-guide-ignore="مسح البحث داخل قائمة ملاحظة المراجعة — عرض فقط">
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </label>
          ) : null}
        </div>
      ) : null}

      <div id={listId} className={`pfl-list ${listClassName}`.trim()}>
        {items.map((item, index) => (
          <div key={getKey(item, index)} className="pfl-item" hidden={!visible.has(index)}>
            {renderItem(item, index)}
          </div>
        ))}
        {!matched.length ? <p className="pfl-empty">لا نتيجة لـ«{query.trim()}» — جرّب اسماً آخر أو رمز مقرر.</p> : null}
      </div>

      {paged ? (
        <nav className="pfl-pager" aria-label={`صفحات ${label}`} onKeyDown={onPagerKey}>
          <button
            type="button"
            className="pfl-step pfl-prev"
            onClick={() => go(current - 1)}
            disabled={current <= 1}
            aria-label={`الصفحة السابقة من ${label}`}
            data-guide-ignore="تقليب قائمة ملاحظة داخل مراجعة الاعتماد — عرض فقط، لا يغيّر الجدول"
          >
            <ChevronRight aria-hidden="true" /><span>السابق</span>
          </button>
          <div className="pfl-middle">
            <ol className="pfl-pages">
              {pageWindow(current, pages).map((entry, index) => entry === "gap" ? (
                <li key={`gap-${index}`} className="pfl-gap" aria-hidden="true">…</li>
              ) : (
                <li key={entry}>
                  <button
                    type="button"
                    className={entry === current ? "active" : ""}
                    aria-current={entry === current ? "page" : undefined}
                    aria-label={`الصفحة ${n(entry)} من ${n(pages)}`}
                    onClick={() => go(entry)}
                    data-guide-ignore="الانتقال إلى صفحة من قائمة ملاحظة داخل مراجعة الاعتماد — عرض فقط"
                  >
                    {n(entry)}
                  </button>
                </li>
              ))}
            </ol>
            <span className="pfl-status">صفحة {n(current)} من {n(pages)}<small> · <bdi dir="ltr">{rangeSpan}</bdi> من {n(matched.length)}</small></span>
          </div>
          <button
            type="button"
            className="pfl-step pfl-next"
            onClick={() => go(current + 1)}
            disabled={current >= pages}
            aria-label={`الصفحة التالية من ${label}`}
            data-guide-ignore="تقليب قائمة ملاحظة داخل مراجعة الاعتماد — عرض فقط، لا يغيّر الجدول"
          >
            <span>التالي</span><ChevronLeft aria-hidden="true" />
          </button>
        </nav>
      ) : null}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {needle ? `مطابقة البحث: ${n(matched.length)} من ${n(items.length)}. ` : ""}
        {paged ? `صفحة ${n(current)} من ${n(pages)}، ${rangeLine}.` : ""}
      </p>
    </div>
  );
}
