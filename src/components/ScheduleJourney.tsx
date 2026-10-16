import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrainCircuit, CalendarDays, Layers, ShieldCheck, Sparkles, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { Counted } from "./dna/Counted";

export type JourneyReading = {
  scoped: boolean;
  lifetime: {
    terms: number;
    schedules: number | null;
    courses: number;
    instructors: number;
    sections: number;
    colleges: number;
    since?: number | null;
  };
  current: {
    termId: number | null;
    termName: string | null;
    schedules: number;
    courses: number;
    instructors: number;
    rooms: number;
    sections: number;
  };
};

/*
 * رحلة SCHEDULE — the one screen that is pure narrative.
 *
 * Everything else in this application is an instrument. This is the exception:
 * it exists to be read, and to be read by people who did not build it. So it is
 * written as four acts on one dark canvas rather than as a dashboard.
 *
 *   ١ — الأثر    one number large enough to stop a reader
 *   ٢ — المقياس  the five lifetime figures, given typographic weight
 *   ٣ — المسار   five stations on a single rail
 *   ٤ — الفلسفة  the sentence the whole system is an argument for
 *
 * Two rules govern the styling, both learned the hard way in this file:
 *  - Every numeral is isolated `dir="ltr"`. Arabic text around a Latin numeral
 *    reorders the thousands separator, so 9,418 was rendering as "9 ,418".
 *  - The palette is fixed, not themed. A marketing surface has to look the same
 *    for everyone who is sent the link.
 */

/** Latin digits with Arabic grouping, isolated so bidi cannot rearrange them. */
const ar = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");
const Num = ({ children }: { children: React.ReactNode }) => (
  <span className="jr-num" dir="ltr">{children}</span>
);

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/*
 * Reveal-on-scroll that cannot strand content.
 *
 * The failure mode this guards against is the one the interface-polish notes
 * describe: an observer that never fires leaves a section at opacity 0 forever.
 * So the hidden state lives only in a class that is added, the element is
 * checked synchronously on mount, and a scroll/resize fallback runs beside the
 * observer. Reduced motion skips the whole mechanism and reveals immediately.
 */
function useRevealOnce<T extends HTMLElement>(
  rootRef: React.RefObject<HTMLElement | null>,
  enabled = true,
) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (revealed) return;
    if (prefersReducedMotion()) { setRevealed(true); return; }
    const node = ref.current;
    if (!node) return;
    const root = rootRef.current;
    let frame = 0;

    const visible = () => {
      if (!node.isConnected) return false;
      const rect = node.getBoundingClientRect();
      const bounds = root?.getBoundingClientRect();
      /* Clamp to the window too: before the sheet's styles apply it is not yet a
         scroller, and its own bounds would reach far below the screen. */
      const top = Math.max(bounds ? bounds.top : 0, 0);
      const bottom = Math.min(bounds ? bounds.bottom : window.innerHeight, window.innerHeight);
      return Math.min(rect.bottom, bottom) - Math.max(rect.top, top) > 40;
    };

    const check = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => { if (visible()) setRevealed(true); });
    };

    /* Measure only once the sheet has settled: on the first frames the hero has not
       taken its full height yet, so sections that will sit far below the fold read
       as "visible" and their animation plays unseen (phones, where the figures are
       several screens down). */
    let observer: IntersectionObserver | null = null;
    let failsafe = 0;
    const target: EventTarget = root || window;
    const start = window.setTimeout(() => {
      if (visible()) { setRevealed(true); return; }
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver(
          entries => {
            if (entries.some(entry => entry.isIntersecting)) { setRevealed(true); observer?.disconnect(); }
          },
          { root: root || null, threshold: 0, rootMargin: "0px 0px -8% 0px" },
        );
        observer.observe(node);
      }
      target.addEventListener("scroll", check, { passive: true });
      window.addEventListener("resize", check, { passive: true });
      /* Last resort, only where nothing can watch the scroll. */
      if (!observer) failsafe = window.setTimeout(() => setRevealed(true), 2500);
    }, 450);

    return () => {
      window.clearTimeout(start);
      observer?.disconnect();
      target.removeEventListener("scroll", check as EventListener);
      window.removeEventListener("resize", check as EventListener);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(failsafe);
    };
  }, [enabled, revealed, rootRef]);

  return { ref, revealed };
}

/** The reading of the accumulated memory, in one sentence. */
function memorySentence(terms: number): string {
  if (terms <= 0) return "الرحلة تبدأ من هنا.";
  if (terms < 10) return "ذاكرة تتشكّل، فصلاً بعد فصل.";
  if (terms < 25) return "قرارات متراكمة صنعت ذاكرة تشغيلية واضحة.";
  if (terms < 50) return "مسار طويل من الجداول والقرارات الأكاديمية.";
  return "ذاكرة واسعة من الجداول والقرارات الأكاديمية المتراكمة.";
}

const STATIONS = [
  { key: "start", title: "البداية", detail: "جدول قابل للعمل", Icon: Sparkles },
  { key: "link", title: "الترابط", detail: "سياق واحد", Icon: Layers },
  { key: "guard", title: "الضبط", detail: "تعارض مكشوف", Icon: ShieldCheck },
  { key: "decide", title: "القرار", detail: "معلومة في وقتها", Icon: BrainCircuit },
  { key: "next", title: "القادم", detail: "معرفة بلا ضوضاء", Icon: CalendarDays },
] as const;

export default function ScheduleJourney({ version, onClose }: { version?: string; onClose: () => void }) {
  const [reading, setReading] = useState<JourneyReading | null>(null);
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    document.documentElement.dataset.journeyOpen = "true";
    return () => { delete document.documentElement.dataset.journeyOpen; };
  }, []);

  useEffect(() => {
    opener.current = document.activeElement;
    let alive = true;
    (async () => {
      try {
        const response = await fetch("/api/journey", { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const data = await response.json();
        if (alive) setReading(data);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab" || !sheet.current) return;
      const focusables = sheet.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  useEffect(() => { sheet.current?.querySelector<HTMLElement>("button")?.focus(); }, [reading, failed]);

  /* The rail runs from the centre of the first station's node to the centre of the
     last one — never past them into the margin or the last station's text. CSS
     alone cannot know where those centres land, so measure them and hand the
     insets back as custom properties (row on wide screens, column on phones). */
  useEffect(() => {
    const rail = sheet.current?.querySelector<HTMLElement>(".jr-rail");
    if (!rail || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const nodes = rail.querySelectorAll<HTMLElement>(".jr-station-node");
      if (nodes.length < 2) return;
      const box = rail.getBoundingClientRect();
      const a = nodes[0].getBoundingClientRect(), b = nodes[nodes.length - 1].getBoundingClientRect();
      const column = Math.abs(a.left - b.left) < 2;
      const rtl = getComputedStyle(rail).direction === "rtl";
      let start: number, end: number;
      if (column) { start = a.top + a.height / 2 - box.top; end = box.bottom - (b.top + b.height / 2); }
      else if (rtl) { start = box.right - (a.left + a.width / 2); end = (b.left + b.width / 2) - box.left; }
      else { start = a.left + a.width / 2 - box.left; end = box.right - (b.left + b.width / 2); }
      rail.style.setProperty("--jr-rail-s", `${start}px`);
      rail.style.setProperty("--jr-rail-e", `${end}px`);
      rail.style.setProperty("--jr-rail-dir", column ? "to bottom" : rtl ? "to left" : "to right");
      /* An attribute, not a class: React owns className and rewrites it on reveal. */
      rail.dataset.fit = column ? "col" : "row";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(rail);
    return () => observer.disconnect();
  }, []);

  const life = reading?.lifetime;
  const empty = Boolean(reading && (life?.terms || 0) === 0);
  const scale = useRevealOnce<HTMLElement>(sheet, Boolean(reading && !empty));
  const path = useRevealOnce<HTMLElement>(sheet, true);

  const headline = useMemo(() => memorySentence(life?.terms || 0), [life]);
  const heroValue = life?.schedules ?? reading?.current?.schedules ?? 0;

  /* Five readings, each carrying a meaning the others do not. */
  const figures = life ? [
    { key: "courses", label: "مقرر", value: life.courses, note: "هوية أكاديمية محفوظة" },
    { key: "instructors", label: "عضو هيئة تدريس", value: life.instructors, note: "داخل قصة الجدول" },
    { key: "sections", label: "قسم علمي", value: life.sections, note: "تتقاطع في مساحة واحدة" },
    { key: "colleges", label: "كلية", value: life.colleges, note: "مرتبطة بقرار واحد" },
    { key: "terms", label: "فصل دراسي", value: life.terms, note: "طبقات من الذاكرة" },
  ] : [];

  /*
   * Rendered into <body>, never where it was invoked.
   *
   * The rail opens this screen, so it used to render inside `.sidebar` — a
   * fixed element with `z-index: 61`. That is a stacking context, and a context
   * caps everything inside it: the sheet's own `z-index: 3000` counted only
   * against its siblings in the rail, so the schedule's sticky hour ruler (320)
   * painted straight through the story. A full-screen surface cannot depend on
   * which button happened to open it, and a portal is the only thing that makes
   * that true. React context and event bubbling follow the React tree, so
   * nothing else about the component changes.
   */
  const sheet_ = (
    <div
      /* Deliberately NOT `.journey-backdrop`: the previous design left ~900 lines
         of rules on that class across two stylesheets, and inheriting any of it
         here would only reintroduce the padding, flex and stacking it assumed.
         `no-print` is the one shared behaviour this surface still wants. */
      className="jr-root no-print"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="jr-sheet" role="dialog" aria-modal="true" aria-label="رحلة SCHEDULE" ref={sheet}>
        <div className="jr-weather" aria-hidden="true"><i /><i /><i /></div>

        <button
          type="button"
          className="jr-close"
          onClick={onClose}
          aria-label="إغلاق رحلة SCHEDULE"
          data-guide-ignore="زر إغلاق نافذة رحلة SCHEDULE ولا ينفذ إجراءً داخل النظام"
        >
          <X aria-hidden="true" />
        </button>

        {/* ── ١ · الأثر ─────────────────────────────────────────────────── */}
        <header className="jr-act jr-hero">
          <span className="jr-eyebrow"><i aria-hidden="true" />ذاكرة SCHEDULE</span>

          <h2 className="jr-headline">
            كل فصل<br />
            <em>يترك أثراً.</em>
          </h2>

          <p className="jr-lede">
            ليست صفحة تعريفية. هذه قراءة حيّة لما مرّ فعلاً عبر النظام:
            جداول ومقررات وأعضاء هيئة تدريس وقرارات تراكمت حتى صارت ذاكرة عمل.
          </p>

          <div className="jr-headnum" aria-label={reading ? `${countOf(heroValue, AR.academicRecord)} في ذاكرة النظام` : "تُقرأ ذاكرة النظام"}>
            <b><Num>{reading ? <Counted value={heroValue} duration={900} /> : "—"}</Num></b>
            <span>موعد أكاديمي مرّ عبر SCHEDULE</span>
            <small>{reading?.scoped ? "ضمن نطاق صلاحياتك" : "ذاكرة النظام الكاملة"}</small>
          </div>

          {/* The hero fills the screen, so it has to say that it is not the end. */}
          <span className="jr-scroll-cue" aria-hidden="true"><i />تابع القراءة</span>

          <div className="jr-mark" aria-hidden="true">
            <b>SCHEDULE</b><i /><small>نظام القرار الأكاديمي</small>
          </div>
        </header>

        {/* ── ٢ · المقياس ───────────────────────────────────────────────── */}
        {failed ? (
          <section className="jr-act jr-state">
            <strong>تعذّرت قراءة الذاكرة الآن</strong>
            <span>الرحلة تعمل، لكن أرقام النظام لم تصل من الخادم.</span>
          </section>
        ) : !reading ? (
          <section className="jr-act jr-state">
            <span className="jr-state-pulse" aria-hidden="true" />
            <strong>تُقرأ ذاكرة النظام…</strong>
            <span>يُجمع الأثر الفعلي من بيانات SCHEDULE.</span>
          </section>
        ) : empty ? (
          <section className="jr-act jr-state">
            <strong>الرحلة تبدأ من هنا.</strong>
            <span>مع أول فصل دراسي يبدأ SCHEDULE ببناء ذاكرته الفعلية.</span>
          </section>
        ) : (
          <section className="jr-act jr-scale" ref={scale.ref}>
            <div className="jr-act-head">
              <span>الأثر المتراكم</span>
              <h3>{headline}</h3>
            </div>
            <div className={`jr-figures ${scale.revealed ? "is-in" : ""}`}>
              {figures.map((figure, index) => (
                <article className="jr-figure" key={figure.key} style={{ ["--i" as any]: index }}>
                  <b><Num><Counted value={figure.value} duration={780} play={scale.revealed} /></Num></b>
                  <strong>{figure.label}</strong>
                  <small>{figure.note}</small>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── ٣ · المسار ────────────────────────────────────────────────── */}
        <section className="jr-act jr-path" ref={path.ref}>
          <div className="jr-act-head">
            <span>كيف تطوّر النظام</span>
            <h3>من بناء الجدول… إلى بناء القرار.</h3>
            <p>خمس محطات، وفكرة واحدة: أقل ضوضاء، أوضح قرار.</p>
          </div>
          <ol className={`jr-rail ${path.revealed ? "is-in" : ""}`}>
            {STATIONS.map(({ key, title, detail, Icon }, index) => (
              <li className="jr-station" key={key} style={{ ["--i" as any]: index }}>
                <span className="jr-station-node" aria-hidden="true"><Icon /></span>
                <span className="jr-station-no" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <strong>{title}</strong>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── ٤ · الفلسفة ───────────────────────────────────────────────── */}
        <section className="jr-act jr-creed">
          <span className="jr-creed-eyebrow">فلسفة SCHEDULE</span>
          <blockquote>
            البساطة أمام المستخدم.<br /><em>والتعقيد خلفها.</em>
          </blockquote>
          <p>
            القيمة ليست في عدد الشاشات، بل في أن يصل المستخدم إلى القرار الصحيح
            في الوقت الصحيح، بأقل احتكاك ممكن.
          </p>
        </section>

        {/* The journey closes on the system's own name and nothing else. The
            college's emblem belongs on the official printed sheets, and only
            there. */}
        <footer className="jr-foot">
          <div>
            <span>التأسيس والتطوير</span>
            <strong>{life?.since ? `تشغيل أكاديمي متصل منذ ${life.since}` : "تشغيل أكاديمي متصل"}</strong>
            <em className="jr-foot-authors">د. أحمد حسين الفيلكاوي · د. عبدالعزيز دخيل العنزي</em>
          </div>
          <small dir="ltr">SCHEDULE{version ? ` · ${version}` : ""}</small>
        </footer>
      </div>
    </div>
  );
  return typeof document === "undefined" ? sheet_ : createPortal(sheet_, document.body);
}
