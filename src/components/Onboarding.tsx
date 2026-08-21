import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlarmClockOff, CalendarClock, ChevronLeft, History,
  QrCode, Sparkles, UsersRound, Waypoints,
} from "lucide-react";
import { PrimaryButton } from "./ui";

/**
 * ── الترحيب: البرنامج يشتغل أمامك، لا يشرح نفسه ─────────────────────────────
 *
 * Every welcome tour this program has had was a stack of sentences: four cards,
 * four claims, four presses. After ten years of running, that is the wrong
 * register — a scheduling system that can read a conflict before you can should
 * not be introducing itself in prose.
 *
 * So this is a stage, not a slideshow. A miniature week builds itself, collides
 * with a real conflict, repairs it, and then performs the features that answer
 * a coordinator's actual week — each scene NARRATED beside the thing it is
 * doing. The reader learns the product by watching the product.
 *
 * Every act shown here is a feature that is switched ON. A tour that performs
 * something the reader cannot then find is worse than no tour at all.
 *
 * Three rules hold it honest:
 *  - Everything on the stage is drawn from the same vocabulary as the real
 *    board: five day columns, an hour rail, a lecture card with a course, a
 *    teacher and a hall. Nothing here is a shape that does not exist upstairs.
 *  - `prefers-reduced-motion` is not a downgrade. It renders every scene's END
 *    STATE at once as a readable list, so the same facts arrive without a
 *    single moving pixel.
 *  - The stage is decorative to assistive technology; the narration beside it
 *    is the content, and it announces itself politely as the acts advance.
 */

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

/** A lecture on the miniature board. `col` is 0-4 (day), `row` is 0-5 (hour). */
type Chip = {
  id: string;
  col: number;
  row: number;
  span: number;
  title: string;
  who: string;
  hall: string;
  hue: "teal" | "gold" | "plum" | "sky";
};

const BOARD: Chip[] = [
  { id: "cs101", col: 0, row: 0, span: 2, title: "مدخل إلى البرمجة", who: "د. أحمد", hall: "A/101", hue: "teal" },
  { id: "ds110", col: 1, row: 1, span: 2, title: "أساسيات البيانات", who: "د. سارة", hall: "B/205", hue: "sky" },
  { id: "cs220", col: 2, row: 0, span: 2, title: "هياكل البيانات", who: "د. نورة", hall: "A/203", hue: "plum" },
  { id: "cs315", col: 3, row: 2, span: 2, title: "الذكاء الاصطناعي", who: "د. محمد", hall: "B/110", hue: "gold" },
  { id: "ds330", col: 4, row: 1, span: 2, title: "تعلّم الآلة", who: "د. ريم", hall: "C/315", hue: "teal" },
  /* The intruder: same teacher as cs315, same hour — the conflict the second
     act is about, and the card the third act moves. */
  { id: "clash", col: 3, row: 2, span: 2, title: "تحليلات القرار", who: "د. محمد", hall: "C/301", hue: "plum" },
];

/** Where the repair chain puts the intruder. */
const REPAIRED = { col: 3, row: 4 };

type Scene = {
  key: string;
  badge?: "new";
  eyebrow: string;
  title: string;
  copy: string;
  icon: React.ReactNode;
  /** How long this act plays before the next one, in ms. */
  hold: number;
};

const SCENES: Scene[] = [
  {
    key: "build",
    eyebrow: "لوحة الجدول",
    title: "ابنِ الأسبوع بالسحب",
    copy: "المحاضرة تنتقل بأيامها كاملة، والتراجع متاح بعد كل حركة.",
    icon: <CalendarClock />,
    hold: 3200,
  },
  {
    key: "clash",
    eyebrow: "قبل أن تقع",
    title: "يرى التعارض قبلك",
    copy: "أستاذ واحد في محاضرتين، أو قاعة محجوزة مرتين — يُكتشف لحظة الإفلات، لا بعد الاعتماد.",
    icon: <AlarmClockOff />,
    hold: 3400,
  },
  {
    key: "repair",
    eyebrow: "سلسلة الإصلاح",
    title: "ويحلّه بأقل حركة ممكنة",
    copy: "يبحث عن أقصر سلسلة نقلات، يشرح سبب كل خطوة، ولا يكتب حرفاً حتى تعتمدها.",
    icon: <Waypoints />,
    hold: 3600,
  },
  {
    key: "meeting",
    badge: "new",
    eyebrow: "متى نلتقي؟",
    title: "موعد الاجتماع يُحسب، لا يُتفاوض عليه",
    copy: "اختر الأساتذة، فيعرض النافذة الأسبوعية التي يتفرّغ فيها الجميع من الجداول نفسها.",
    icon: <UsersRound />,
    hold: 4200,
  },
  {
    key: "memory",
    eyebrow: "ذاكرة عشر سنوات",
    title: "القسم يعرف عاداته أكثر منك",
    copy: "أوقات البدء المعتادة، القاعات المهجورة، والساعة التي لم يُدرَّس فيها من قبل — تُقال لحظة القرار، لا بعده.",
    icon: <History />,
    hold: 4000,
  },
  {
    key: "publish",
    eyebrow: "انشر بلا حسابات",
    title: "رابط واحد… ولكل أستاذ بطاقته",
    copy: "جدول القسم أو بطاقة شخصية بالرقم المدني، مع QR وتقويم يُشترك فيه ويتحدّث وحده.",
    icon: <QrCode />,
    hold: 4200,
  },
];

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** The miniature board. Purely decorative: the narration carries the meaning. */
function Stage({ scene }: { scene: string }) {
  const playing = (keys: string[]) => keys.includes(scene);

  return (
    <div className={`ob-stage ob-scene-${scene}`} aria-hidden="true">
      <div className="ob-stage-frame">
        <div className="ob-stage-days">
          {DAYS.map(day => <span key={day}>{day}</span>)}
        </div>
        <div className="ob-stage-grid">
          {/* The hour rail, so the miniature reads as a week and not a chart. */}
          <div className="ob-stage-rail">
            {["٨", "٩", "١٠", "١١", "١٢", "١"].map(hour => <i key={hour}>{hour}</i>)}
          </div>
          <div className="ob-stage-cells">
            {Array.from({ length: 30 }, (_, index) => <i key={index} />)}

            {BOARD.map((chip, index) => {
              const isIntruder = chip.id === "clash";
              const repaired = isIntruder && playing(["repair", "meeting", "memory", "publish"]);
              const col = repaired ? REPAIRED.col : chip.col;
              const row = repaired ? REPAIRED.row : chip.row;
              /* Act 5 lights the lecture the memory is speaking about. */
              const recalled = chip.id === "cs101" && playing(["memory"]);
              return (
                <article
                  key={chip.id}
                  className={[
                    "ob-chip",
                    `hue-${chip.hue}`,
                    isIntruder && playing(["clash"]) ? "is-clash" : "",
                    repaired ? "is-repaired" : "",
                    recalled ? "is-recalled" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                    ["--col" as any]: col,
                    ["--row" as any]: row,
                    ["--span" as any]: chip.span,
                    ["--i" as any]: index,
                  }}
                >
                  <b>{chip.title}</b>
                  <span>{chip.who}</span>
                  <i>{chip.hall}</i>

                </article>
              );
            })}

            {/* Act 3 — the repair's own trace: where the card came from. */}
            <span className="ob-trace" style={{ ["--col" as any]: 3, ["--row" as any]: 2, ["--span" as any]: 2 }}>
              نُقل من هنا
            </span>

            {/* Act 4 — the window in which every chosen teacher is free. */}
            <span className="ob-window" style={{ ["--row" as any]: 4, ["--span" as any]: 2 }}>
              الجميع متفرّغون
            </span>
          </div>
        </div>
      </div>

      {/* Act 2 — the badge the real board shows above the week. */}
      <span className="ob-badge ob-badge-clash">تداخل واحد</span>
      <span className="ob-badge ob-badge-clean">سليم</span>

      {/* Act 5 — what ten years of the department's own history says, at the
          moment the decision is being made. */}
      <span className="ob-hint">
        <b>هذه الساعة لم تُستخدم منذ ٣ فصول</b>
        <small>٩ فصول شاهدة · قراءة، لا قاعدة</small>
      </span>

      {/* Act 6 — the published link as the reader meets it: a phone, and the
          code that opens it. */}
      <span className="ob-phone">
        <i className="ob-phone-top" />
        <i className="ob-phone-line ob-phone-line-a" />
        <i className="ob-phone-line ob-phone-line-b" />
        <i className="ob-phone-qr" />
      </span>
    </div>
  );
}

export default function Onboarding({ isPowerAdmin, onFinish }: {
  isPowerAdmin: boolean;
  onFinish: () => void;
}) {
  const still = useMemo(prefersReducedMotion, []);
  const [act, setAct] = useState(0);
  const [manual, setManual] = useState(false);
  const card = useRef<HTMLDivElement | null>(null);

  /* Auto-play, until the reader takes the wheel. The last act stays put: the
     welcome should end on a press, not by wandering off. */
  useEffect(() => {
    if (still || manual || act >= SCENES.length - 1) return;
    const timer = window.setTimeout(() => setAct(current => current + 1), SCENES[act].hold);
    return () => window.clearTimeout(timer);
  }, [act, manual, still]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onFinish(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onFinish]);

  const go = useCallback((next: number) => {
    setManual(true);
    setAct(Math.max(0, Math.min(SCENES.length - 1, next)));
  }, []);

  const scene = SCENES[act];
  const last = act === SCENES.length - 1;

  const body = (
    <div className="ob-root no-print" role="dialog" aria-modal="true" aria-label="جولة تعريفية">
      <section className={`ob-card ${still ? "is-still" : ""}`} ref={card}>
        <header className="ob-head">
          <span className="ob-brand">SCHEDULE</span>
          <p>
            عشر سنوات تشغيل… وهذه أحدث إضافاتها.
            <b>{isPowerAdmin ? " مساحة التحكم الأكاديمي كاملةً بين يديك." : " مساحة قسمك جاهزة."}</b>
          </p>
        </header>

        {still ? (
          /* No motion: the same six facts, all present, none animated. */
          <ul className="ob-list">
            {SCENES.map(item => (
              <li key={item.key}>
                <span className="ob-list-icon">{item.icon}</span>
                <div>
                  <small>{item.eyebrow}{item.badge === "new" ? " · جديد" : ""}</small>
                  <strong>{item.title}</strong>
                  <p>{item.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ob-body">
            <Stage scene={scene.key} />

            <div className="ob-say" aria-live="polite">
              <span className="ob-say-icon" aria-hidden="true">{scene.icon}</span>
              <small>
                {scene.eyebrow}
                {scene.badge === "new" ? <b className="ob-new"><Sparkles aria-hidden="true" />جديد</b> : null}
              </small>
              <strong key={`${scene.key}-t`}>{scene.title}</strong>
              <p key={`${scene.key}-c`}>{scene.copy}</p>
            </div>
          </div>
        )}

        <footer className="ob-foot">
          {!still ? (
            <div className="ob-dots" role="tablist" aria-label="فصول الجولة">
              {SCENES.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={index === act}
                  aria-label={item.title}
                  className={index === act ? "on" : index < act ? "done" : ""}
                  data-guide-ignore="تنقّل داخل الجولة التعريفية فقط ولا ينفذ إجراءً في النظام"
                  onClick={() => go(index)}
                />
              ))}
            </div>
          ) : <span />}

          <div className="ob-acts">
            {!still && !last ? (
              <button
                type="button"
                className="ob-skip"
                data-guide-ignore="إنهاء الجولة التعريفية فقط"
                onClick={onFinish}
              >
                تخطّي
              </button>
            ) : null}
            <PrimaryButton
              onClick={() => (still || last ? onFinish() : go(act + 1))}
              data-guide-ignore="يتابع الجولة التعريفية أو يغلقها ولا ينفذ إجراءً في النظام"
            >
              {still || last ? "ابدأ العمل" : "التالي"}
              <ChevronLeft />
            </PrimaryButton>
          </div>
        </footer>
      </section>
    </div>
  );

  return typeof document === "undefined" ? body : createPortal(body, document.body);
}
