import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, CalendarDays, Layers, ShieldCheck, Sparkles, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";

/**
 * ── رحلة SCHEDULE ─────────────────────────────────────────────────────────
 *
 * Not a page about who made this. A page about what it has carried.
 *
 * Every number on it is counted from the database when the sheet opens, so the
 * screen cannot be wrong and cannot be flattered: add a term and it says one
 * more term, with nothing edited. That is the difference between a system that
 * has a memory and a system with a nice paragraph about having one.
 *
 * It opens over the work rather than replacing it, because it is a thing you
 * glance at, not a place you go.
 */

export type JourneyReading = {
  scoped: boolean;
  lifetime: {
    terms: number;
    schedules: number | null;
    courses: number;
    instructors: number;
    sections: number;
    colleges: number;
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

const ar = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * A number that arrives rather than appears.
 *
 * Short, once, and never on scroll — the count is the sentence's subject, and a
 * subject that keeps re-announcing itself is a distraction. A reader who has
 * asked for less motion is simply given the number.
 */
function Counted({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) { setShown(value); return; }
    started.current = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value <= 0) { setShown(value); return; }
    let frame = 0;
    const from = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - from) / duration);
      // Fast at first, settling at the end — a number arriving, not a slot machine.
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{ar(shown)}</>;
}

/**
 * One line the system writes about itself, from the numbers alone.
 *
 * Rules, not rhetoric: no claim here can outrun the data behind it, and an
 * installation on its first day is told the truth about its first day instead
 * of being handed a decade it has not lived.
 */
function readingSentence(terms: number, schedules: number | null): string {
  if (terms <= 0) return "الرحلة تبدأ من هنا.";
  if (terms < 10) return "رحلة ما زالت في بدايتها.";
  if (terms < 25) return "سنوات من الجداول والقرارات الأكاديمية.";
  if (terms < 50) return "أكثر من عقد من الذاكرة الأكاديمية.";
  return `${countOf(terms, AR.term)} من القرارات والجداول والذاكرة.`;
}

/** An institutional milestone, said once and quietly — never a badge. */
function milestone(terms: number, schedules: number | null): string | null {
  if (schedules && schedules >= 50_000) return `أكثر من ${countOf(50_000, AR.appointment)} أكاديمي مرّ من هنا.`;
  if (schedules && schedules >= 25_000) return `أكثر من ${ar(25_000)} موعد أكاديمي مرّ من هنا.`;
  if (schedules && schedules >= 10_000) return `أكثر من ${ar(10_000)} موعد أكاديمي مرّ من هنا.`;
  if (terms >= 100) return `${countOf(100, AR.term)} أصبح جزءاً من ذاكرة SCHEDULE.`;
  if (terms >= 50) return `${ar(50)} فصلاً أصبحت جزءاً من ذاكرة SCHEDULE.`;
  if (terms >= 25) return `${ar(25)} فصلاً أصبحت جزءاً من ذاكرة SCHEDULE.`;
  return null;
}

export default function ScheduleJourney({ version, onClose }: { version?: string; onClose: () => void }) {
  const [reading, setReading] = useState<JourneyReading | null>(null);
  const [failed, setFailed] = useState(false);
  const sheet = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

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
      // The reader is returned to the thing they pressed, not to the top of the page.
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  /* Escape closes; focus stays inside while it is open. */
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

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("button")?.focus();
  }, [reading, failed]);

  const life = reading?.lifetime;
  const now = reading?.current;
  const headline = useMemo(() => readingSentence(life?.terms || 0, life?.schedules ?? null), [life]);
  const note = useMemo(() => milestone(life?.terms || 0, life?.schedules ?? null), [life]);

  const steps = [
    { title: "البداية", detail: "حلّ مشكلة إعداد الجدول.", Icon: Sparkles },
    { title: "النمو", detail: "المقررات وأعضاء هيئة التدريس والأقسام والكليات في مكان واحد.", Icon: Layers },
    { title: "النضج", detail: "مراجعة واعتماد، واكتشاف التعارضات، وتقارير تُطبع كوثائق.", Icon: ShieldCheck },
    { title: "اليوم", detail: "منظومة تساعد على بناء القرار، لا بناء الجدول فقط.", Icon: BrainCircuit },
    { title: "القادم", detail: "تتطوّر مع كل فصل، دون أن تفقد بساطة العمل التي اعتادها المستخدم.", Icon: CalendarDays },
  ];
  /* An installation with no history is told so, rather than shown a wall of zeroes. */
  const empty = Boolean(reading && (life?.terms || 0) === 0);

  return (
    <div className="journey-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="journey visual-minimal" role="dialog" aria-modal="true" aria-label="رحلة SCHEDULE" ref={sheet}>
        <button type="button" className="journey-close" onClick={onClose} aria-label="إغلاق"><X aria-hidden="true" /></button>

        <header className="journey-hero">
          <span className="journey-eyebrow">The SCHEDULE Journey</span>
          <h2>رحلة SCHEDULE</h2>
          <p>
            أكثر من عقد من العمل الأكاديمي، تحوّل فيه SCHEDULE من أداة لبناء الجدول
            إلى مساحة يُتَّخذ فيها القرار.
          </p>
          {/* A quiet suggestion of accumulated terms — lines, not illustration. */}
          <div className="journey-strata" aria-hidden="true">
            {Array.from({ length: 14 }).map((_, index) => <i key={index} style={{ ["--i" as any]: index }} />)}
          </div>
        </header>

        {failed ? (
          <p className="journey-empty">تعذّرت قراءة أرقام النظام الآن.</p>
        ) : !reading ? (
          <p className="journey-empty">يقرأ ذاكرة النظام…</p>
        ) : empty ? (
          <section className="journey-first">
            <strong>الرحلة تبدأ من هنا</strong>
            <span>مع أول فصل دراسي، تبدأ ذاكرة SCHEDULE في التكوّن.</span>
          </section>
        ) : (
          <>
            <section className="journey-lifetime">
              <p className="journey-reading">{headline}</p>
              {life!.schedules != null ? (
                <div className="journey-figure">
                  <strong><Counted value={life!.schedules!} /></strong>
                  <span>موعداً أكاديمياً مرّ من هنا</span>
                </div>
              ) : null}
              <div className="journey-grid">
                <article><b><Counted value={life!.terms} duration={700} /></b><span>فصلاً أصبح جزءاً من ذاكرة SCHEDULE</span></article>
                <article><b><Counted value={life!.courses} duration={700} /></b><span>مقرراً مسجّلاً في النظام</span></article>
                <article><b><Counted value={life!.instructors} duration={700} /></b><span>عضو هيئة تدريس دخل قصة الجدول</span></article>
                <article><b><Counted value={life!.sections} duration={700} /></b><span>قسماً علمياً</span></article>
                <article><b><Counted value={life!.colleges} duration={700} /></b><span>كلية</span></article>
              </div>
              {note ? <p className="journey-milestone">{note}</p> : null}
              {reading.scoped ? (
                <p className="journey-scope">هذه القراءة ضمن نطاقك الأكاديمي.</p>
              ) : null}
            </section>

            <section className="journey-current">
              <header>
                <span>هذا الفصل</span>
                <strong>{now!.termName || "—"}</strong>
              </header>
              <div className="journey-grid journey-grid-small">
                <article><b>{ar(now!.schedules)}</b><span>موعداً أكاديمياً</span></article>
                <article><b>{ar(now!.courses)}</b><span>مقرراً</span></article>
                <article><b>{ar(now!.instructors)}</b><span>عضو هيئة تدريس</span></article>
                <article><b>{ar(now!.rooms)}</b><span>قاعة مستخدمة</span></article>
              </div>
              <p className="journey-reading-small">فصل جديد، وذاكرة أطول.</p>
            </section>
          </>
        )}

        <section className="journey-timeline">
          <h3>من البداية إلى اليوم</h3>
          <div className="journey-stages" role="list">
            {steps.map(({ title, detail, Icon }, index) => (
              <article key={title} className="journey-stage" role="listitem">
                <span className="journey-stage-mark" aria-hidden="true"><Icon /></span>
                <div className="journey-stage-copy">
                  <small>المحطة {ar(index + 1)}</small>
                  <strong>{title}</strong>
                  <p>{detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="journey-philosophy">
          <h3>فلسفة SCHEDULE</h3>
          <p className="journey-motto">البساطة أمام المستخدم، والتعقيد خلفها.</p>
          <p>بناء الجدول، ومراجعته، واكتشاف التعارضات، والبحث، والتقارير، واتخاذ القرار — داخل مساحة واحدة.</p>
        </section>

        <footer className="journey-foot">
          <div>
            <span>التأسيس والتطوير</span>
            <strong>د. أحمد حسين الفيلكاوي · د. عبدالعزيز دخيل العنزي</strong>
          </div>
          <small>SCHEDULE{version ? ` · الإصدار ${version}` : ""}</small>
        </footer>
      </div>
    </div>
  );
}
