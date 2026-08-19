import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, CalendarDays, Layers, ShieldCheck, Sparkles, X } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";

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

function Counted({ value, duration = 900, play = true }: { value: number; duration?: number; play?: boolean }) {
  const [shown, setShown] = useState(play ? value : 0);
  const animated = useRef(false);

  useEffect(() => {
    if (!play) {
      setShown(0);
      return;
    }
    if (animated.current) {
      setShown(value);
      return;
    }
    animated.current = true;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value <= 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const from = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - from) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, play]);

  return <>{ar(shown)}</>;
}

function useRevealOnce<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed || !ref.current) return;
    const node = ref.current;
    if (typeof IntersectionObserver === "undefined") {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -10% 0px",
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed, threshold]);

  return { ref, revealed };
}

function readingSentence(terms: number): string {
  if (terms <= 0) return "الرحلة تبدأ من هنا.";
  if (terms < 10) return "ذاكرة تتشكّل، فصلاً بعد فصل.";
  if (terms < 25) return "قرارات متراكمة صنعت ذاكرة تشغيلية واضحة.";
  if (terms < 50) return "مسار طويل من الجداول والقرارات الأكاديمية.";
  return `${countOf(terms, AR.term)} من القرارات والجداول والذاكرة.`;
}

function milestone(terms: number, schedules: number | null): string | null {
  if (terms >= 10) return `${ar(terms)} فصلاً أصبحت جزءاً من ذاكرة SCHEDULE.`;
  if (schedules && schedules > 0) return `${ar(schedules)} موعداً أكاديمياً أصبح جزءاً من ذاكرة SCHEDULE.`;
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

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("button")?.focus();
  }, [reading, failed]);

  const life = reading?.lifetime;
  const now = reading?.current;
  const headline = useMemo(() => readingSentence(life?.terms || 0), [life]);
  const note = useMemo(() => milestone(life?.terms || 0, life?.schedules ?? null), [life]);
  const metricsReveal = useRevealOnce<HTMLElement>(0.28);
  const currentReveal = useRevealOnce<HTMLElement>(0.32);
  const empty = Boolean(reading && (life?.terms || 0) === 0);
  const termCount = life?.terms || 0;
  const heroValue = life?.schedules ?? now?.schedules ?? termCount;
  const heroLabel = "مواعيد أكاديمية";
  const heroCaption = reading?.scoped ? "ضمن نطاق صلاحياتك" : "أثرٌ متراكم";

  const steps = [
    { title: "البداية", detail: "من مهمة معقدة: بناء جدول أكاديمي قابل للعمل.", Icon: Sparkles },
    { title: "الترابط", detail: "مقررات وأعضاء هيئة تدريس وأقسام وكليات داخل سياق واحد.", Icon: Layers },
    { title: "الضبط", detail: "تعارضات ومراجعة واعتماد؛ قبل أن تتحول المشكلة إلى واقع.", Icon: ShieldCheck },
    { title: "القرار", detail: "المعلومة تظهر في اللحظة التي يحتاجها فيها المستخدم.", Icon: BrainCircuit },
    { title: "القادم", detail: "كل فصل يضيف معرفة جديدة من دون أن يزيد ضوضاء الواجهة.", Icon: CalendarDays },
  ];

  return (
    <div className="journey-backdrop journey-backdrop-v2 no-print" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="journey journey-v2 visual-minimal" role="dialog" aria-modal="true" aria-label="رحلة SCHEDULE" ref={sheet}>
        <button type="button" className="journey-close journey-close-v2" onClick={onClose} aria-label="إغلاق" data-guide-ignore="زر إغلاق نافذة رحلة SCHEDULE ولا ينفذ إجراءً داخل النظام"><X aria-hidden="true" /></button>

        <header className="journey-hero journey-hero-v2">
          <div className="journey-hero-copy">
            <span className="journey-eyebrow journey-eyebrow-v2"><i aria-hidden="true" /> ذاكرة SCHEDULE</span>
            <h2><span className="journey-title-line">كل فصل</span><span className="journey-title-line journey-title-line-combo"><span>يترك</span><em>أثراً.</em></span></h2>
            <p>هذه ليست صفحة تعريفية. إنها لقطة حيّة لما مرّ عبر النظام: جداول، مقررات، أعضاء هيئة تدريس، وقرارات تراكمت حتى أصبحت ذاكرة عمل.</p>
            <div className="journey-signature" aria-hidden="true"><b>SCHEDULE</b><i /><small>ACADEMIC DECISION SYSTEM</small></div>
          </div>

          <div className="journey-memory-core" aria-label={termCount ? `${ar(termCount)} فصلاً في ذاكرة النظام` : "ذاكرة النظام تبدأ من هنا"}>
            <span className="journey-core-halo" aria-hidden="true" />
            <span className="journey-core-orbit journey-core-orbit-a" aria-hidden="true"><i /></span>
            <span className="journey-core-orbit journey-core-orbit-b" aria-hidden="true"><i /></span>
            <span className="journey-core-grid" aria-hidden="true" />
            <div className="journey-core-center">
              <Sparkles aria-hidden="true" />
              <b>{reading ? <Counted value={heroValue} duration={760} /> : "—"}</b>
              <small>{heroLabel}</small>
              <span>{heroCaption}</span>
            </div>
          </div>
        </header>

        {failed ? (
          <section className="journey-state journey-state-error">
            <span>تعذّرت قراءة الذاكرة الآن</span>
            <small>تصميم الرحلة يعمل، لكن أرقام النظام لم تصل من الخادم.</small>
          </section>
        ) : !reading ? (
          <section className="journey-state journey-state-loading">
            <span className="journey-state-pulse" aria-hidden="true" />
            <div><strong>يقرأ ذاكرة النظام…</strong><small>يجمع الأثر الفعلي من بيانات SCHEDULE.</small></div>
          </section>
        ) : empty ? (
          <section className="journey-first journey-first-v2">
            <span className="journey-first-index">01</span>
            <div><strong>الرحلة تبدأ من هنا.</strong><span>مع أول فصل دراسي، يبدأ SCHEDULE ببناء ذاكرته الفعلية.</span></div>
          </section>
        ) : (
          <>
            <section className="journey-lifetime journey-lifetime-v2" ref={metricsReveal.ref}>
              <header className="journey-section-head">
                <div><span>الأثر المتراكم</span><h3>{headline}</h3></div>
                {reading.scoped ? <small className="journey-scope-v2">الأرقام وفق نطاق صلاحياتك</small> : <small className="journey-scope-v2">ذاكرة النظام الكاملة</small>}
              </header>

              <div className="journey-metrics">
                <article className="journey-metric journey-metric-primary">
                  <span>مواعيد أكاديمية</span>
                  <b><Counted value={life!.schedules || 0} duration={920} play={metricsReveal.revealed} /></b>
                  <small>كل رقم هنا مرّ فعلياً عبر النظام</small>
                </article>
                <article className="journey-metric"><span>فصول</span><b><Counted value={life!.terms} duration={720} play={metricsReveal.revealed} /></b><small>طبقات من الذاكرة</small></article>
                <article className="journey-metric"><span>مقررات</span><b><Counted value={life!.courses} duration={720} play={metricsReveal.revealed} /></b><small>هوية أكاديمية محفوظة</small></article>
                <article className="journey-metric"><span>أعضاء هيئة تدريس</span><b><Counted value={life!.instructors} duration={720} play={metricsReveal.revealed} /></b><small>داخل قصة الجدول</small></article>
                <article className="journey-metric"><span>أقسام علمية</span><b><Counted value={life!.sections} duration={720} play={metricsReveal.revealed} /></b><small>تتقاطع داخل مساحة واحدة</small></article>
                <article className="journey-metric"><span>كليات</span><b><Counted value={life!.colleges} duration={720} play={metricsReveal.revealed} /></b><small>مرتبطة بقرار واحد</small></article>
              </div>
              {note ? <p className="journey-milestone journey-milestone-v2"><i aria-hidden="true" />{note}</p> : null}
            </section>

            <section className="journey-current journey-current-v2" ref={currentReveal.ref}>
              <div className="journey-current-intro">
                <span className="journey-current-kicker">الآن · هذا الفصل</span>
                <strong>{now!.termName || "—"}</strong>
                <p>صورة لحظية لما يتحرك الآن داخل مساحة العمل.</p>
                <div className="journey-current-signal"><i aria-hidden="true" /><span>فصل فعّال داخل الذاكرة</span></div>
              </div>
              <div className="journey-current-grid">
                <article><b><Counted value={now!.schedules} duration={720} play={currentReveal.revealed} /></b><span>موعداً أكاديمياً</span></article>
                <article><b><Counted value={now!.courses} duration={720} play={currentReveal.revealed} /></b><span>مقرراً</span></article>
                <article><b><Counted value={now!.instructors} duration={720} play={currentReveal.revealed} /></b><span>عضو هيئة تدريس</span></article>
                <article><b><Counted value={now!.rooms} duration={720} play={currentReveal.revealed} /></b><span>قاعة مستخدمة</span></article>
              </div>
            </section>
          </>
        )}

        <section className="journey-timeline journey-timeline-v2">
          <header className="journey-section-head">
            <div><span>كيف تطوّر النظام</span><h3>من بناء الجدول… إلى بناء القرار.</h3></div>
            <small>خمس محطات، وفكرة واحدة: أقل ضوضاء، أكثر وضوحاً.</small>
          </header>
          <div className="journey-stages journey-stages-v2" role="list">
            {steps.map(({ title, detail, Icon }, index) => (
              <article key={title} className="journey-stage journey-stage-v2" role="listitem">
                <span className="journey-stage-no">0{index + 1}</span>
                <span className="journey-stage-mark" aria-hidden="true"><Icon /></span>
                <div className="journey-stage-copy"><strong>{title}</strong><p>{detail}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="journey-philosophy journey-philosophy-v2">
          <span className="journey-philosophy-mark" aria-hidden="true">“</span>
          <div>
            <span>فلسفة SCHEDULE</span>
            <h3>البساطة أمام المستخدم.<br /><em>والتعقيد خلفها.</em></h3>
            <p>القيمة ليست في عدد الشاشات؛ بل في أن يصل المستخدم إلى القرار الصحيح، في الوقت الصحيح، بأقل احتكاك ممكن.</p>
          </div>
        </section>

        <footer className="journey-foot journey-foot-v2">
          <div><span>التأسيس والتطوير</span><strong>د. أحمد حسين الفيلكاوي · د. عبدالعزيز دخيل العنزي</strong></div>
          <small>SCHEDULE{version ? ` · الإصدار ${version}` : ""}</small>
        </footer>
      </div>
    </div>
  );
}
