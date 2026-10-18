import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { foldInstructorText } from "../utils/instructorIdentity";
import { toEnglishDigits } from "../utils/digits";

/**
 * قائمةٌ يُبحث فيها بالكتابة، على نهج «أستاذ المقرر»: تفتح على الخيارات كلها، وما إن يُكتب حرفٌ حتى تضيق.
 *
 * البحث يسامح ما تختلف به الكتابة العربية (الهمزات، التاء المربوطة، الألف المقصورة، التشكيل، «ال» التعريف
 * لا تُشترط) ويقبل الأرقام العربية والهندية، ويطابق كلماتٍ متفرقة («برمجه 112» يجد «CS112 — مقدمة في البرمجة»).
 * ومن كان له خيارٌ واحد (`autoSingle`: مقررٌ برمزٍ واحد) يُعرض مباشرةً بلا قائمة ويُختار وحده — الاختيار بين
 * واحدٍ ولا شيء عملٌ بلا قرار.
 *
 * يحلّ محلّ <select> في كل شاشةٍ تختار مقرراً: لا تغيّر قيمتَه ولا حدثَه، فتستبدل بها بقيةَ الشاشة كما هي.
 */

export interface SelectOption {
  value: string | number;
  label: string;
  /** سطرٌ ثانٍ خافت تحت الاسم (الرمز مثلاً). */
  hint?: string;
  /** نصٌّ إضافيٌّ للبحث وحده (لا يُعرض). */
  keywords?: string;
}

interface Props {
  value: string | number;
  onChange: (value: string | number) => void;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
  /** يظهر مربع البحث حين تزيد الخيارات على هذا العدد؛ فالقائمة القصيرة تُقرأ بالعين. */
  searchAbove?: number;
  searchPlaceholder?: string;
  emptyText?: string;
  /** خيارٌ واحد وبلا قيمةٍ مختارة: يُختار تلقائياً ويُعرض ثابتاً بلا قائمة. */
  autoSingle?: boolean;
  /** يُمرَّر إلى الزر ليجده مرشدُ الاستخدام (data-guide-editor-field). */
  guideField?: string;
  guideIgnore?: string;
  title?: string;
  /** يُركَّز الزر من الخارج (نافذةٌ تفتح على حقلها الأول). */
  triggerRef?: React.MutableRefObject<HTMLButtonElement | null>;
  /** داخل جدولٍ أو حاوٍ يقصّ ما يخرج عنه: تُرسم القائمة ثابتةً فوق الصفحة وتُغلق بالتمرير. */
  fixed?: boolean;
}

const fold = (value: string) => foldInstructorText(toEnglishDigits(value)).toLowerCase().replace(/\s+/g, " ").trim();
const spaceless = (value: string) => value.replace(/ /g, "");

/** تصفيةُ الخيارات بما يُكتب: البدايةُ أولاً، ثم الاحتواء، ثم بلا مسافات، ثم كلماتٌ متفرقة. تُختبر وحدها. */
export function filterOptions(options: readonly SelectOption[], query: string): readonly SelectOption[] {
  const needle = fold(query);
  if (!needle) return options;
  const parts = needle.split(" ").filter(Boolean);
  const scored: Array<{ option: SelectOption; score: number; at: number }> = [];
  options.forEach((option, at) => {
    const text = fold(`${option.label} ${option.hint || ""} ${option.keywords || ""}`);
    const label = fold(option.label);
    let score = -1;
    if (label.startsWith(needle) || fold(option.hint || "").startsWith(needle)) score = 0;
    else if (text.includes(needle)) score = 1;
    else if (spaceless(text).includes(spaceless(needle))) score = 2;
    else if (parts.every(part => text.includes(part))) score = 3;
    if (score >= 0) scored.push({ option, score, at });
  });
  return scored.sort((a, b) => a.score - b.score || a.at - b.at).map(item => item.option);
}

export default function SearchableSelect({
  value, onChange, options, placeholder = "اختر ...", disabled, required, ariaLabel, className = "",
  searchAbove = 6, searchPlaceholder = "اكتب للبحث", emptyText = "لا نتيجة", autoSingle = false, guideField, guideIgnore, title, triggerRef, fixed = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const [place, setPlace] = useState<React.CSSProperties | undefined>(undefined);
  const box = useRef<HTMLDivElement | null>(null);
  const search = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selected = options.find(option => String(option.value) === String(value)) || null;
  const single = autoSingle && options.length === 1 ? options[0] : null;

  /* خيارٌ وحيد: يُختار وحده، ويعاد اختياره إن تبدّل المقرر فصار له خيارٌ وحيدٌ آخر. */
  useEffect(() => {
    if (single && !disabled && String(value) !== String(single.value)) onChange(single.value);
  }, [single?.value, value, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = fold(query);
  const shown = useMemo(() => filterOptions(options, query), [options, query]);

  const close = () => { setOpen(false); setQuery(""); };
  const choose = (option: SelectOption) => { onChange(option.value); close(); };

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) close(); };
    /* Escape يغلق القائمة وحدها: النافذة التي تحوي الحقل لا تُغلق معها. */
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close(); } };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", escape, true);
    /* تُغلق القائمة الثابتة بحركة الصفحة لا بتمرير قائمتها نفسها. */
    const drift = (event: Event) => { if (fixed && !(event.target instanceof Node && box.current?.contains(event.target))) close(); };
    window.addEventListener("scroll", drift, true);
    window.addEventListener("resize", drift);
    return () => {
      document.removeEventListener("mousedown", away); window.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", drift, true); window.removeEventListener("resize", drift);
    };
  }, [open]);

  /* تُفتح للأعلى إن لم يتّسع تحتها. */
  useEffect(() => {
    if (!open || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    const goUp = window.innerHeight - rect.bottom < 280 && rect.top > window.innerHeight - rect.bottom;
    setUp(goUp);
    if (fixed) {
      const rtl = getComputedStyle(box.current).direction === "rtl", width = Math.max(rect.width, 280);
      setPlace({
        position: "fixed", width, minWidth: 0, insetInlineStart: "auto",
        ...(goUp ? { bottom: window.innerHeight - rect.top + 6, top: "auto" } : { top: rect.bottom + 6, bottom: "auto" }),
        ...(rtl ? { right: Math.max(8, window.innerWidth - rect.right), left: "auto" } : { left: Math.max(8, rect.left), right: "auto" }),
      });
    }
    const at = Math.max(0, shown.findIndex(option => String(option.value) === String(value)));
    setActive(at);
    window.setTimeout(() => (options.length > searchAbove ? search.current : list.current)?.focus({ preventScroll: true }), 20);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setActive(0); }, [needle]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-ss-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeys = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setActive(at => Math.min(shown.length - 1, at + 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(at => Math.max(0, at - 1)); }
    else if (event.key === "Enter") { event.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (event.key === "Tab") close();
  };

  if (single) {
    return (
      <div className={`ss-select ss-single ${className}`} title={title}>
        <span className="ss-static" dir="auto" data-guide-editor-field={guideField}>{single.label}</span>
        {required ? <input className="ss-required" tabIndex={-1} aria-hidden="true" required value={String(single.value)} readOnly /> : null}
      </div>
    );
  }

  return (
    <div className={`ss-select ${open ? "is-open" : ""} ${className}`} ref={box} title={title}>
      <button
        type="button"
        ref={node => { if (triggerRef) triggerRef.current = node; }}
        className="ss-trigger"
        disabled={disabled}
        onClick={() => setOpen(current => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        data-guide-editor-field={guideField}
        data-guide-ignore="فتح قائمة اختيار قابلة للبحث؛ الاختيار نفسه داخل خيارات القائمة"
        {...(guideIgnore ? { "data-guide-ignore": guideIgnore } : {})}
      >
        <span className={selected ? "" : "ss-placeholder"}>{selected ? selected.label : placeholder}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {required ? <input className="ss-required" tabIndex={-1} aria-hidden="true" required value={selected ? String(selected.value) : ""} readOnly /> : null}
      {open ? (
        /* داخل <label> يعيد المتصفح النقرة إلى الزر فتُغلق القائمة من فورها: يُمنع هذا للنقرات الواقعة داخلها. */
        <div className={`ss-pop ${up ? "is-up" : ""}`} style={place} onKeyDown={onKeys} onClick={event => event.preventDefault()}>
          {options.length > searchAbove ? (
            <label className="ss-search">
              <Search aria-hidden="true" />
              <input
                ref={search}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
                data-guide-ignore="مربع بحث داخل قائمة اختيار؛ لا يحفظ شيئاً"
              />
              {query ? <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="مسح" data-guide-ignore="مسح نص البحث داخل القائمة"><X aria-hidden="true" /></button> : null}
            </label>
          ) : null}
          <div className="ss-list" id={listId} role="listbox" tabIndex={-1} ref={list} aria-label={ariaLabel}>
            {shown.length ? shown.map((option, index) => (
              <button
                type="button"
                key={String(option.value)}
                role="option"
                aria-selected={String(option.value) === String(value)}
                data-ss-index={index}
                className={`${String(option.value) === String(value) ? "chosen" : ""} ${index === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                data-guide-ignore="خيار داخل قائمة اختيار قابلة للبحث"
              >
                <span><b>{option.label}</b>{option.hint ? <small dir="auto">{option.hint}</small> : null}</span>
                {String(option.value) === String(value) ? <Check aria-hidden="true" /> : null}
              </button>
            )) : <p className="ss-empty">{emptyText}</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
