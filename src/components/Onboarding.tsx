import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlarmClockOff, CalendarClock, ChevronLeft, History,
  QrCode, Sparkles, UsersRound, Waypoints,
} from "lucide-react";
import { PrimaryButton } from "./ui";
import { courseHue, courseTexture, firstLast } from "../utils/weekVisual";
import { scheduleDays, scheduleMinutes } from "./scheduleWorkspace";
import type { FSchedule } from "../types";

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
 *    teacher and a hall. Nothing here is a shape that does not exist upstairs —
 *    and, since 2026-09-03, no colour either. The chips used to carry four hex
 *    literals that were near-misses of four hues the board already exports
 *    (163.8° for 158, 208.2° for 200, 291.8° for 288, 38.9° for 38): the wheel
 *    written a second time, from memory, wrong. They now call `courseHue()` on
 *    the same course code and name they print, so a lecture on this stage is
 *    the colour it would actually be upstairs — and it stays true on its own
 *    the day a hue moves. The colour-blind weave comes along with it.
 *  - `prefers-reduced-motion` is not a downgrade. It renders every scene's END
 *    STATE at once as a readable list, so the same facts arrive without a
 *    single moving pixel.
 *  - The stage is decorative to assistive technology; the narration beside it
 *    is the content, and it announces itself politely as the acts advance.
 */

const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

/**
 * A lecture on the miniature board. `col` is 0-4 (day), `row` is 0-5 (hour).
 *
 * `code` is not printed — an 8.5px chip cannot afford a fourth line — but it is
 * carried because it is half of what decides the colour. `courseHue(code,
 * title)` is the exact call the board makes, so these chips land on the same
 * wheel positions real lectures do rather than on a hand-picked approximation.
 */
type Chip = {
  id: string;
  code: string;
  col: number;
  row: number;
  span: number;
  title: string;
  who: string;
  hall: string;
};

/*
 * The six codes are CAST, not arbitrary. `courseHue` is the single source of a
 * card's colour and nothing here overrides it — but which colour each lecture
 * lands on is decided by the code and title it is given, and those are ours to
 * choose, exactly as the fictional names are. These six were picked so the hues
 * fall in six DIFFERENT sixths of the wheel (18 · 96 · 158 · 226 · 288 · 320).
 *
 * Two reasons. Colour is identity on this stage, and an earlier cast put three
 * of the six lectures on the same green — a tour arguing that colour tells
 * courses apart while showing three that look alike. And because the weave a
 * card gets under [data-colorblind] is chosen by the sixth its hue sits in, one
 * hue per sixth means all six textures differ too. A reader with a colour
 * vision deficiency sees six distinct cards, not three.
 */
const SAMPLE_BOARD: Chip[] = [
  { id: "cs101", code: "1710103", col: 0, row: 0, span: 2, title: "مدخل إلى البرمجة", who: "د. سالم", hall: "A/101" },
  { id: "ds110", code: "1710110", col: 1, row: 1, span: 2, title: "أساسيات البيانات", who: "د. سارة", hall: "B/205" },
  { id: "cs220", code: "1710108", col: 2, row: 0, span: 2, title: "هياكل البيانات", who: "د. نورة", hall: "A/203" },
  { id: "cs315", code: "1710123", col: 3, row: 2, span: 2, title: "الذكاء الاصطناعي", who: "د. محمد", hall: "B/110" },
  { id: "ds330", code: "1710107", col: 4, row: 1, span: 2, title: "تعلّم الآلة", who: "د. ريم", hall: "C/315" },
  /* The intruder: same teacher as cs315, same hour — the conflict the second
     act is about, and the card the third act moves. */
  { id: "clash", code: "1710143", col: 3, row: 2, span: 2, title: "تحليلات القرار", who: "د. محمد", hall: "C/301" },
];

/** Where the repair chain puts the intruder on the sample board. */
const SAMPLE_REPAIRED = { col: 3, row: 4 };

/* ── المسرح على أسبوع القسم ───────────────────────────────────────────────
 *
 * المسرح يقرأ الأسبوع الحقيقي من `/api/schedules/workspace` — وهو العنوان
 * نفسه الذي يُسخّنه App.tsx مبكراً، فالجواب غالباً جاهز ولا يكلّف شيئاً.
 *
 * المحاضرة المتصادمة وحدها مُصطنعة، وعمداً: رسم محاضرتين حقيقيتين فوق بعضهما
 * يُقرأ نتيجةً عن بيانات القسم، فيبحث المنسّق عن تعارض لا وجود له. هي محاضرة
 * مضافة باسم «محاضرة مثال»، تحمل أستاذ المحاضرة التي تسقط عليها ليكون
 * التصادم متماسكاً، والمسرح يقول ذلك في زاويته.
 *
 * وإن لم يتوفّر أسبوع صالح — تنصيب جديد، فصل فارغ، حساب بلا صلاحية — تعمل
 * العيّنة كما كانت. شاشة الترحيب لا يصحّ أن تكون الشاشة التي تفشل.
 */
const STAGE_ROWS = 6;
const DAY_OPENS = 8;
const DAY_CLOSES = 20;

type StageBoard = {
  chips: Chip[];
  repaired: { col: number; row: number };
  /** The six hours this miniature is showing, as 24-hour numbers. */
  hours: number[];
  live: boolean;
};

const SAMPLE_STAGE: StageBoard = {
  chips: SAMPLE_BOARD,
  repaired: SAMPLE_REPAIRED,
  hours: [8, 9, 10, 11, 12, 13],
  live: false,
};

/**
 * Every column a lecture occupies, not just the first.
 *
 * A lecture here runs on a rhythm — Sunday-Tuesday-Thursday, or Monday-
 * Wednesday — so reading only its first true day put four of one department's
 * five lectures in the Sunday column, where all but one were then discarded for
 * being on an occupied day. The miniature holds one card per column, so it asks
 * for every day the lecture has and takes whichever is still free.
 */
function columnsOf(row: FSchedule): number[] {
  const flags = row as unknown as Record<string, unknown>;
  return scheduleDays.map((day, index) => (flags[day.key] ? index : -1)).filter(index => index >= 0);
}

function spanOf(row: FSchedule): number {
  const start = scheduleMinutes(String(row.fstarttime || ""));
  const end = scheduleMinutes(String(row.fendtime || ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.min(2, Math.max(1, Math.round((end - start) / 60)));
}

/**
 * Where the repair puts the example lecture: the lowest free pair of rows in
 * its own column, searched from the bottom so the card visibly moves DOWN —
 * the same direction the brass column travels in the product's mark.
 */
function repairSlot(chips: Chip[], intruder: Chip): { col: number; row: number } {
  const taken = new Set(
    chips
      .filter(chip => chip.col === intruder.col && chip.id !== intruder.id)
      .flatMap(chip => Array.from({ length: chip.span }, (_, k) => chip.row + k)),
  );
  for (let row = STAGE_ROWS - intruder.span; row >= 0; row--) {
    if (row === intruder.row) continue;
    const clear = Array.from({ length: intruder.span }, (_, k) => row + k).every(r => !taken.has(r));
    if (clear) return { col: intruder.col, row };
  }
  return { col: intruder.col, row: Math.min(STAGE_ROWS - intruder.span, intruder.row + 2) };
}

/** The reader's own week, cut down to what a five-by-six miniature can hold. */
function stageFromWorkspace(payload: unknown): StageBoard | null {
  const data = payload as {
    rows?: FSchedule[];
    courses?: Array<{ AdCourseId: number; CourseCode?: string; CourseName?: string }>;
    instructors?: Array<{ AdInstructorId: number; AdInstructorName?: string }>;
  } | null;
  const rows = Array.isArray(data?.rows) ? data!.rows : [];
  if (rows.length < 3) return null;

  const courseById = new Map((data?.courses || []).map(course => [Number(course.AdCourseId), course]));
  const personById = new Map((data?.instructors || []).map(person => [Number(person.AdInstructorId), person]));

  const usable = rows.filter(row =>
    columnsOf(row).length > 0
    && Number.isFinite(scheduleMinutes(String(row.fstarttime || "")))
    && String(row.AdCourseName || courseById.get(Number(row.AdCourseId))?.CourseName || "").trim(),
  );
  if (usable.length < 3) return null;

  /* Which six hours to show.
   *
   * The teaching day runs 08:00–20:00, and this miniature has room for six of
   * those twelve hours. Pinning it to 08:00 threw away every afternoon lecture
   * — a department that starts at eleven saw an empty stage and fell back to
   * the invented week. The six hours start at the reader's own earliest
   * lecture instead, so the rail beside the grid is their morning, not a
   * decoration. */
  const earliest = Math.min(...usable.map(row => scheduleMinutes(String(row.fstarttime || ""))));
  const baseHour = Math.min(Math.max(Math.floor(earliest / 60), DAY_OPENS), DAY_CLOSES - STAGE_ROWS);
  const base = baseHour * 60;

  /* One lecture per day column, so the miniature reads as a week rather than a
     pile. Earlier hours first: they sit higher and leave room for the repair.
     
     Two passes, and the first one insists on a course the stage has not shown
     yet. A department commonly teaches the same course to several sections, and
     taking whatever came first put «مدخل إلى البرمجة» in two columns and
     «هياكل البيانات» in two more — four of five columns carrying two titles.
     Colour made it worse: hue is a function of the course, so duplicated
     courses collapse the stage onto two or three hues, which is exactly the
     flaw the sample board was recast to avoid. The second pass fills whatever
     is still empty, so a department that really does teach one course all week
     still gets a full stage. */
  const perColumn = new Map<number, Chip>();
  const shownCourses = new Set<string>();
  const byHour = [...usable].sort((a, b) =>
    scheduleMinutes(String(a.fstarttime || "")) - scheduleMinutes(String(b.fstarttime || "")));

  const place = (row: FSchedule, freshOnly: boolean) => {
    const slot = Math.round((scheduleMinutes(String(row.fstarttime || "")) - base) / 60);
    if (slot < 0 || slot >= STAGE_ROWS) return;
    const course = courseById.get(Number(row.AdCourseId));
    const title = String(row.AdCourseName || course?.CourseName || "").trim();
    if (freshOnly && shownCourses.has(title)) return;
    const col = columnsOf(row).find(candidate => !perColumn.has(candidate));
    if (col === undefined) return;
    const person = personById.get(Number(row.AdInstructorId));
    shownCourses.add(title);
    perColumn.set(col, {
      id: `live-${row.id}-${col}`,
      code: String(course?.CourseCode || row.SCode || title),
      col,
      row: Math.min(slot, STAGE_ROWS - spanOf(row)),
      span: spanOf(row),
      title,
      who: firstLast(String(person?.AdInstructorName || "")) || "بدون أستاذ",
      hall: [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") || "بدون قاعة",
    });
  };

  for (const row of byHour) place(row, true);
  for (const row of byHour) place(row, false);

  const chips = [...perColumn.values()];
  if (chips.length < 3) return null;

  /* The example lands on the busiest-looking real lecture and borrows its
     instructor, which is what makes the collision mean anything. */
  const host = chips.reduce((a, b) => (b.row <= a.row ? b : a));
  const example: Chip = {
    id: "clash",
    code: "مثال",
    col: host.col,
    row: host.row,
    span: host.span,
    title: "محاضرة مثال",
    who: host.who,
    hall: "قاعة مثال",
  };
  const all = [...chips, example];
  return {
    chips: all,
    repaired: repairSlot(all, example),
    hours: Array.from({ length: STAGE_ROWS }, (_, index) => baseHour + index),
    live: true,
  };
}

type Scene = {
  key: string;
  badge?: "new";
  eyebrow: string;
  title: string;
  copy: string;
  icon: React.ReactNode;
};

/**
 * مُهلة الفصل = زمن قراءة نصّه، بحدّ أدنى وأعلى — لا رقم مختار باليد.
 * والتشغيل التلقائي يقف بعد الفصل الثالث: هناك ينتهي العرض (بناء، تعارض،
 * إصلاح)، وما بعده مزايا منفصلة تُقرأ بإيقاع القارئ لا بإيقاع مؤقّت.
 */
const AUTOPLAY_THROUGH = 2;

function holdFor(scene: Scene): number {
  const words = `${scene.title} ${scene.copy}`.trim().split(/\s+/).length;
  return Math.round(Math.min(5000, Math.max(3200, 900 + (words / 4) * 1000)));
}

const SCENES: Scene[] = [
  {
    key: "build",
    eyebrow: "لوحة الجدول",
    title: "ابنِ الأسبوع بالسحب",
    copy: "المحاضرة تنتقل بأيامها كاملة، والتراجع متاح بعد كل حركة.",
    icon: <CalendarClock />,
  },
  {
    key: "clash",
    eyebrow: "قبل أن تقع",
    title: "يرى التعارض قبلك",
    copy: "أستاذ واحد في محاضرتين، أو قاعة محجوزة مرتين — يُكتشف لحظة الإفلات، لا بعد الاعتماد.",
    icon: <AlarmClockOff />,
  },
  {
    key: "repair",
    eyebrow: "سلسلة الإصلاح",
    title: "ويحلّه بأقل حركة ممكنة",
    copy: "يبحث عن أقصر سلسلة نقلات، يشرح سبب كل خطوة، ولا يكتب حرفاً حتى تعتمدها.",
    icon: <Waypoints />,
  },
  {
    key: "meeting",
    badge: "new",
    eyebrow: "متى نلتقي؟",
    title: "موعد الاجتماع يُحسب، لا يُتفاوض عليه",
    copy: "اختر الأساتذة، فيعرض النافذة الأسبوعية التي يتفرّغ فيها الجميع من الجداول نفسها.",
    icon: <UsersRound />,
  },
  {
    key: "memory",
    eyebrow: "ذاكرة عشر سنوات",
    title: "القسم يعرف عاداته أكثر منك",
    copy: "أوقات البدء المعتادة، القاعات المهجورة، والساعة التي لم يُدرَّس فيها من قبل — تُقال لحظة القرار، لا بعده.",
    icon: <History />,
  },
  {
    key: "publish",
    eyebrow: "انشر بلا حسابات",
    title: "رابط واحد… ولكل أستاذ بطاقته",
    copy: "جدول القسم أو بطاقة شخصية بالرقم المدني، مع QR وتقويم يُشترك فيه ويتحدّث وحده.",
    icon: <QrCode />,
  },
];

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** The miniature board. Purely decorative: the narration carries the meaning. */
function Stage({ scene, board }: { scene: string; board: StageBoard }) {
  const playing = (keys: string[]) => keys.includes(scene);
  const { chips, repaired: REPAIRED } = board;
  const intruder = chips.find(chip => chip.id === "clash");

  return (
    <div className={`ob-stage ob-scene-${scene}`} aria-hidden="true">
      <div className="ob-stage-frame">
        <div className="ob-stage-days">
          {DAYS.map(day => <span key={day}>{day}</span>)}
        </div>
        <div className="ob-stage-grid">
          {/* The hour rail, so the miniature reads as a week and not a chart.
              It used to be six frozen Arabic-Indic numerals — ٨ ٩ ١٠ ١١ ١٢ ١ —
              which was wrong twice over: they described a morning the board
              might not be showing, and the real week rail sets its times in
              Latin digits, which is the numeral rule this whole product keeps.
              Now it is the hours actually on the grid, written the way the
              board writes them. */}
          <div className="ob-stage-rail">
            {board.hours.map(hour => (
              <i key={hour}>{hour > 12 ? hour - 12 : hour}</i>
            ))}
          </div>
          <div className="ob-stage-cells">
            {Array.from({ length: 30 }, (_, index) => <i key={index} />)}

            {chips.map((chip, index) => {
              const isIntruder = chip.id === "clash";
              const repaired = isIntruder && playing(["repair", "meeting", "memory", "publish"]);
              const col = repaired ? REPAIRED.col : chip.col;
              const row = repaired ? REPAIRED.row : chip.row;
              /* Act 5 lights the lecture the memory is speaking about. */
              const recalled = chip.id === chips[0]?.id && playing(["memory"]);
              const hue = courseHue(chip.code, chip.title);
              return (
                <article
                  key={chip.id}
                  className={[
                    "ob-chip",
                    isIntruder && playing(["clash"]) ? "is-clash" : "",
                    repaired ? "is-repaired" : "",
                    recalled ? "is-recalled" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                    ["--col" as any]: col,
                    ["--row" as any]: row,
                    ["--span" as any]: chip.span,
                    ["--i" as any]: index,
                    ["--hue" as any]: hue,
                    ...courseTexture(hue),
                  }}
                >
                  <b>{chip.title}</b>
                  <span>{chip.who}</span>
                  <i>{chip.hall}</i>

                </article>
              );
            })}

            {/* Act 3 — the repair's own trace: where the card came from. */}
            <span
              className="ob-trace"
              style={{
                ["--col" as any]: intruder?.col ?? 3,
                ["--row" as any]: intruder?.row ?? 2,
                ["--span" as any]: intruder?.span ?? 2,
              }}
            >
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

      {/* Whose week this is. Never left to inference: the one card that is not
          the reader's own is the one the tour makes collide, and a coordinator
          must not leave this screen thinking they were shown a real clash. */}
      <span className="ob-source">
        {board.live
          ? <>أسبوع قسمك — <b>محاضرة مثال</b> واحدة مضافة</>
          : <>مثال توضيحي</>}
      </span>

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

export default function Onboarding({ isPowerAdmin, workspaceQuery, onFinish }: {
  isPowerAdmin: boolean;
  /** The same scoped query App.tsx warm-starts, so this usually costs nothing. */
  workspaceQuery?: string;
  onFinish: () => void;
}) {
  const still = useMemo(prefersReducedMotion, []);
  const [act, setAct] = useState(0);
  const [manual, setManual] = useState(false);
  const [board, setBoard] = useState<StageBoard>(SAMPLE_STAGE);
  const card = useRef<HTMLDivElement | null>(null);

  /* The reader's own week, if it is there. Silence on every failure: a welcome
     screen that cannot reach the board still has a welcome to give. */
  useEffect(() => {
    if (still) return;
    let alive = true;
    fetch(`/api/schedules/workspace?${workspaceQuery || "resolve=1"}`)
      .then(response => (response.ok ? response.json() : null))
      .then(payload => {
        const live = payload ? stageFromWorkspace(payload) : null;
        if (alive && live) setBoard(live);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [still, workspaceQuery]);

  /* Auto-play through the demonstration only — build, collide, repair — then
     hand over. See AUTOPLAY_THROUGH above for why it stops there. */
  const playing = !still && !manual && act < AUTOPLAY_THROUGH;
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setAct(current => current + 1), holdFor(SCENES[act]));
    return () => window.clearTimeout(timer);
  }, [act, playing]);

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
            <b>{isPowerAdmin ? " مساحة القرار الأكاديمي كاملةً بين يديك." : " مساحة قسمك جاهزة."}</b>
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
            <Stage scene={scene.key} board={board} />

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
          {/* The active dot fills over exactly this act's hold, so a tour that
              moves on its own never reads as one that might be stuck. */}
          {!still ? (
            <div
              className={`ob-dots ${playing ? "is-playing" : ""}`}
              role="tablist"
              aria-label="فصول الجولة"
            >
              {SCENES.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={index === act}
                  aria-label={item.title}
                  className={index === act ? "on" : index < act ? "done" : ""}
                  style={index === act ? { ["--hold" as any]: `${holdFor(item)}ms` } : undefined}
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
