import type { AdTerm, TermStudentPhases, TermStudentRound } from "../types";
import { kuwaitDateISO } from "./approvalWorkflow";
import { deadlineDateShort } from "./submissionDeadlines";
import { previousYearSameTermName, sameTermName, termWindow } from "./termSequence";

/**
 * ── رحلة الطلبة في الفصل: تواريخ تُكتب مرة وتحرّك كل شيء ──────────────────────
 *
 * بابُ الطالب والشاشةُ الموحدة للأقسام يسألان سؤالاً واحداً: «في أي مرحلةٍ نحن
 * اليوم؟». لو قرأه كلٌّ منهما بطريقته لاختلف الطالبُ والقسمُ على ما يُسمح الآن،
 * فهنا وحدها يُجاب عنه، خادماً وواجهةً.
 *
 *   ① تسليم الجداول (AdTermSubmissionDeadline، موجود قبل هذا)
 *   ② الرغبات      — الطالب يكتب مواده المجتازة ويرى جدوله المتوقع
 *   ③ التجميد      — القراءة فقط، والأقسام تعدّل جداولها على الأرقام
 *   ④ جولات التسجيل — «هل سجلت؟» وطلبُ المتعثّر
 *   ⑤ الإغلاق      — آخر يومٍ تُستقبل فيه الطلبات
 *
 * **اليوم بتوقيت الكويت** (kuwaitDateISO) وكل تاريخٍ يشمل يومَه كاملاً، كما في
 * موعد التسليم: قاعدةٌ واحدة للتواريخ في النظام كله.
 *
 * **فصلٌ بلا تواريخ يعمل كما كان.** غيابُها يعني «لم تُحدَّد»، لا «مفتوح» ولا
 * «مغلق»، ولا يُمنع به شيءٌ قائم.
 */

export const MAX_STUDENT_ROUNDS = 8;
export const ROUND_NAME_MAX = 30;
const MAX_SPAN_DAYS = 400;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const isRealDay = (value: unknown): value is string => {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const at = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(at) && new Date(at).toISOString().slice(0, 10) === value;
};
const dayNumber = (value: string) => Math.round(Date.parse(`${value}T00:00:00Z`) / DAY_MS);
const addDays = (value: string, days: number) => new Date((dayNumber(value) + days) * DAY_MS).toISOString().slice(0, 10);

export interface PhaseIssue { field: string; message: string }

export interface PhasesCheck {
  ok: boolean;
  issues: PhaseIssue[];
  /** النسخةُ المنظَّفة: تواريخ مقصوصة، جولاتٌ مرتّبة بمعرّفات، بلا فارغ. */
  phases: TermStudentPhases;
}

const cleanDay = (value: unknown): string | undefined => {
  const text = String(value ?? "").trim();
  return text ? text : undefined;
};

/**
 * يفحص التواريخ ويرجع النسخة المنظَّفة.
 *
 * الترتيبُ هو القاعدة: التسليم ثم الرغبات ثم الجولات ثم الإغلاق، لا يسبق شيءٌ
 * ما قبله ولا تتداخل جولتان. والرفضُ بجملةٍ تسمّي الحقل، لأن من يكتبها رئيسُ
 * تسجيلٍ لا مبرمج.
 */
export function checkStudentPhases(
  input: Partial<TermStudentPhases> | null | undefined,
  context: { submissionDeadline?: string } = {},
): PhasesCheck {
  const issues: PhaseIssue[] = [];
  const raw = input || {};
  const wishesOpen = cleanDay(raw.wishesOpen);
  const wishesClose = cleanDay(raw.wishesClose);
  const requestsClose = cleanDay(raw.requestsClose);

  for (const [field, value, label] of [
    ["wishesOpen", wishesOpen, "بداية الرغبات"],
    ["wishesClose", wishesClose, "نهاية الرغبات"],
    ["requestsClose", requestsClose, "إغلاق الطلبات"],
  ] as const) {
    if (value && !isRealDay(value)) issues.push({ field, message: `${label}: تاريخٌ غير صالح — يُكتب هكذا 2026-11-15` });
  }

  const rounds: TermStudentRound[] = [];
  const list = Array.isArray(raw.rounds) ? raw.rounds : [];
  if (list.length > MAX_STUDENT_ROUNDS) issues.push({ field: "rounds", message: `أكثر ما يُسمح به ${MAX_STUDENT_ROUNDS} جولات.` });
  list.slice(0, MAX_STUDENT_ROUNDS).forEach((entry, index) => {
    const name = String(entry?.name ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
    const start = cleanDay(entry?.start), end = cleanDay(entry?.end);
    const field = `rounds.${index}`;
    if (!name && !start && !end) return;
    if (!name) { issues.push({ field, message: `الجولة ${index + 1}: اكتب لها اسماً (مبكر، عادي…).` }); return; }
    if (name.length > ROUND_NAME_MAX) issues.push({ field, message: `الجولة ${index + 1}: الاسم أطول من ${ROUND_NAME_MAX} حرفاً.` });
    if (!isRealDay(start) || !isRealDay(end)) { issues.push({ field, message: `«${name}»: حدّد بدايةً ونهايةً بتاريخٍ صالح.` }); return; }
    if (end < start) { issues.push({ field, message: `«${name}»: النهاية قبل البداية.` }); return; }
    rounds.push({ id: String(entry?.id || "").slice(0, 40) || `r${index + 1}`, name: name.slice(0, ROUND_NAME_MAX), start, end });
  });
  rounds.sort((a, b) => a.start.localeCompare(b.start));
  /* معرّفٌ ثابتٌ لا يتكرر: جولتان بالمعرّف نفسه تُدمجان عند الحفظ. */
  const seenIds = new Set<string>();
  rounds.forEach((round, index) => { if (seenIds.has(round.id)) round.id = `r${index + 1}-${dayNumber(round.start)}`; seenIds.add(round.id); });

  const wishesOk = (!wishesOpen || isRealDay(wishesOpen)) && (!wishesClose || isRealDay(wishesClose));
  if (Boolean(wishesOpen) !== Boolean(wishesClose)) {
    issues.push({ field: wishesOpen ? "wishesClose" : "wishesOpen", message: "حدّد بداية الرغبات ونهايتها معاً." });
  } else if (wishesOpen && wishesClose && wishesOk) {
    if (wishesClose < wishesOpen) issues.push({ field: "wishesClose", message: "نهاية الرغبات قبل بدايتها." });
    const deadline = cleanDay(context.submissionDeadline);
    if (deadline && isRealDay(deadline) && wishesOpen <= deadline) {
      issues.push({ field: "wishesOpen", message: `الرغبات تبدأ بعد موعد تسليم الجداول (${deadlineDateShort(deadline)}): الجدولُ المتوقع يُبنى من جداول كل الأقسام.` });
    }
  }

  if (rounds.length && wishesClose && isRealDay(wishesClose)) {
    const first = rounds[0];
    if (first.start <= wishesClose) issues.push({ field: "rounds.0", message: `«${first.name}» تبدأ قبل انتهاء الرغبات أو معها — الجولة بعد التجميد.` });
  }
  if (rounds.length && !wishesClose) issues.push({ field: "wishesClose", message: "ضع الرغبات قبل الجولات: الجدول المتوقع يسبق التسجيل." });
  for (let i = 1; i < rounds.length; i += 1) {
    if (rounds[i].start <= rounds[i - 1].end) issues.push({ field: `rounds.${i}`, message: `«${rounds[i].name}» تتداخل مع «${rounds[i - 1].name}».` });
  }

  if (requestsClose && isRealDay(requestsClose)) {
    const floor = rounds.length ? rounds[rounds.length - 1].end : wishesClose;
    if (!floor) issues.push({ field: "requestsClose", message: "ضع الرغبات أو الجولات قبل إغلاق الطلبات." });
    else if (requestsClose < floor) issues.push({ field: "requestsClose", message: "إغلاق الطلبات قبل نهاية آخر جولة." });
  }

  const all = [wishesOpen, wishesClose, requestsClose, ...rounds.flatMap(r => [r.start, r.end])].filter((v): v is string => Boolean(v) && isRealDay(v));
  if (all.length > 1) {
    const sorted = [...all].sort();
    if (dayNumber(sorted[sorted.length - 1]) - dayNumber(sorted[0]) > MAX_SPAN_DAYS) issues.push({ field: "rounds", message: "التواريخ تمتد أكثر من سنة — راجعها." });
  }

  const phases: TermStudentPhases = {};
  if (wishesOpen && isRealDay(wishesOpen)) phases.wishesOpen = wishesOpen;
  if (wishesClose && isRealDay(wishesClose)) phases.wishesClose = wishesClose;
  if (rounds.length) phases.rounds = rounds;
  if (requestsClose && isRealDay(requestsClose)) phases.requestsClose = requestsClose;
  return { ok: issues.length === 0, issues, phases };
}

export function hasStudentPhases(phases: TermStudentPhases | null | undefined): boolean {
  return Boolean(phases && (phases.wishesOpen || (phases.rounds && phases.rounds.length) || phases.requestsClose));
}

/* ───────────────────────── أين نحن اليوم؟ ───────────────────────── */

export type StudentPhaseKey = "unset" | "collecting" | "wishes" | "frozen" | "round" | "between" | "closed";

/** ما يفعله باب الطالب الآن. */
export type StudentDoorMode = "none" | "waiting" | "wishes" | "frozen" | "report" | "closed";

export interface PhaseReading {
  key: StudentPhaseKey;
  mode: StudentDoorMode;
  /** الجولةُ الجارية، أو آخر جولةٍ مضت في «بين الجولتين»، وإلا -1. */
  roundIndex: number;
  round?: TermStudentRound;
  /** هل يكتب الطالب رغباته الآن؟ */
  canEditWishes: boolean;
  /** هل يُسمح بطلب المتعثّر الآن؟ */
  canReport: boolean;
  /** هل تُعرض أسماءُ المتعثّرين للأقسام الآن؟ (قبل التسجيل: أرقام فقط) */
  namesVisible: boolean;
  label: string;
  line: string;
  /** أقربُ تاريخٍ قادم يغيّر المرحلة، وما هو. */
  nextAt?: string;
  nextLabel?: string;
}

const NAMES: Record<StudentPhaseKey, string> = {
  unset: "لم تُحدَّد المواعيد",
  collecting: "الأقسام تُدخل جداولها",
  wishes: "الرغبات مفتوحة",
  frozen: "الجدول مُجمَّد",
  round: "جولة تسجيل",
  between: "بين الجولات",
  closed: "أُغلقت الطلبات",
};

/**
 * المرحلةُ في يومٍ بعينه. اليوم الافتراضي: اليومُ في الكويت.
 *
 * بين الجولات يبقى طلبُ المتعثّر مفتوحاً إلى «إغلاق الطلبات»: من لم يجد مادته
 * في الجولة الأولى لا ينتظر الثانية ليقول ذلك.
 */
export function readStudentPhase(phases: TermStudentPhases | null | undefined, today: string = kuwaitDateISO()): PhaseReading {
  const base = (key: StudentPhaseKey, mode: StudentDoorMode, extra: Partial<PhaseReading> = {}): PhaseReading => ({
    key, mode, roundIndex: -1, canEditWishes: false, canReport: false, namesVisible: false,
    label: NAMES[key], line: NAMES[key], ...extra,
  });
  if (!hasStudentPhases(phases)) {
    return base("unset", "none", { line: "لم تُحدَّد مواعيد الطلبة لهذا الفصل بعد." });
  }
  const p = phases as TermStudentPhases;
  const rounds = p.rounds || [];
  const nextAfter = (...days: Array<[string | undefined, string]>) => {
    const upcoming = days.filter(([day]) => day && day > today).sort((a, b) => String(a[0]).localeCompare(String(b[0])))[0];
    return upcoming ? { nextAt: upcoming[0], nextLabel: upcoming[1] } : {};
  };
  const allNext = [
    [p.wishesOpen, "تبدأ الرغبات"], [p.wishesClose, "تنتهي الرغبات"],
    ...rounds.flatMap(r => [[r.start, `تبدأ «${r.name}»`], [r.end, `تنتهي «${r.name}»`]] as Array<[string | undefined, string]>),
    [p.requestsClose, "تُغلق الطلبات"],
  ] as Array<[string | undefined, string]>;
  const next = nextAfter(...allNext);

  if (p.requestsClose && today > p.requestsClose) {
    return base("closed", "closed", { line: `أُغلقت الطلبات في ${deadlineDateShort(p.requestsClose)}.` });
  }
  const running = rounds.findIndex(r => today >= r.start && today <= r.end);
  if (running >= 0) {
    const round = rounds[running];
    return base("round", "report", {
      roundIndex: running, round, canReport: true, namesVisible: true,
      label: `«${round.name}»`, line: `جولة «${round.name}» جارية حتى ${deadlineDateShort(round.end)}.`, ...next,
    });
  }
  const passed = rounds.filter(r => today > r.end);
  if (passed.length) {
    const last = passed[passed.length - 1];
    const open = !p.requestsClose || today <= p.requestsClose;
    return base("between", open ? "report" : "closed", {
      roundIndex: rounds.indexOf(last), round: last, canReport: open, namesVisible: true,
      line: open ? `انتهت «${last.name}». طلبُ المتعثّر مفتوح${p.requestsClose ? ` حتى ${deadlineDateShort(p.requestsClose)}` : ""}.` : NAMES.closed, ...next,
    });
  }
  if (p.wishesOpen && p.wishesClose) {
    if (today < p.wishesOpen) return base("collecting", "waiting", { line: `تبدأ الرغبات ${deadlineDateShort(p.wishesOpen)}.`, ...next });
    if (today <= p.wishesClose) {
      return base("wishes", "wishes", { canEditWishes: true, line: `الرغبات مفتوحة حتى ${deadlineDateShort(p.wishesClose)}.`, ...next });
    }
    return base("frozen", "frozen", {
      line: rounds.length ? `الجدول مُجمَّد. تبدأ «${rounds[0].name}» ${deadlineDateShort(rounds[0].start)}.` : "الجدول مُجمَّد للقراءة.", ...next,
    });
  }
  /* جولاتٌ أو إغلاقٌ بلا رغبات: لا مرحلة قبل الجولة الأولى إلا الانتظار. */
  return base("collecting", "waiting", { line: next.nextAt ? `${next.nextLabel} ${deadlineDateShort(next.nextAt)}.` : NAMES.collecting, ...next });
}

/* ───────────────────────── الخطّ الزمني للعرض ───────────────────────── */

export interface TimelineStep {
  id: string;
  title: string;
  from?: string;
  to?: string;
  state: "done" | "now" | "next" | "unset";
  kind: "submission" | "wishes" | "frozen" | "round" | "close";
}

/**
 * خطوات الرحلة كما يرسمها الشريط: التسليم، الرغبات، التجميد، كل جولة، الإغلاق.
 * الحالةُ كلها من اليوم و`readStudentPhase`، فلا يقول الشريط غير ما يقوله الباب.
 */
export function studentTimeline(
  phases: TermStudentPhases | null | undefined,
  submissionDeadline: string | undefined,
  today: string = kuwaitDateISO(),
): TimelineStep[] {
  const stateOf = (from?: string, to?: string): TimelineStep["state"] => {
    if (!from && !to) return "unset";
    const start = from || to!, end = to || from!;
    if (today > end) return "done";
    if (today >= start) return "now";
    return "next";
  };
  const p = phases || {};
  const steps: TimelineStep[] = [
    { id: "submission", title: "تسليم الجداول", to: submissionDeadline || undefined, state: stateOf(undefined, submissionDeadline || undefined), kind: "submission" },
    { id: "wishes", title: "الرغبات", from: p.wishesOpen, to: p.wishesClose, state: stateOf(p.wishesOpen, p.wishesClose), kind: "wishes" },
  ];
  const first = (p.rounds || [])[0];
  if (p.wishesClose && first) {
    const from = addDays(p.wishesClose, 1), to = addDays(first.start, -1);
    steps.push({ id: "frozen", title: "التجميد والتحليل", from: from <= to ? from : undefined, to: from <= to ? to : undefined, state: from <= to ? stateOf(from, to) : "unset", kind: "frozen" });
  } else {
    steps.push({ id: "frozen", title: "التجميد والتحليل", state: "unset", kind: "frozen" });
  }
  for (const round of p.rounds || []) {
    steps.push({ id: round.id, title: round.name, from: round.start, to: round.end, state: stateOf(round.start, round.end), kind: "round" });
  }
  steps.push({ id: "close", title: "إغلاق الطلبات", to: p.requestsClose, state: stateOf(undefined, p.requestsClose), kind: "close" });
  return steps;
}

/* ───────────────────────── اقتراحٌ من الفصل نفسه في السنة الماضية ───────────────────────── */

export interface PhaseSuggestion {
  phases: TermStudentPhases;
  fromTermName: string;
  /** الإزاحةُ بالأيام (مضاعفُ ٧: يبقى اليومُ نفسُه من الأسبوع). */
  shiftDays: number;
}

/**
 * الفصلُ الجديد هو فصلُ السنة الماضية نفسُه بتواريخَ مُزاحة، فيُقترح عليه ذلك
 * بدل صفحةٍ بيضاء. الإزاحةُ فرقُ بداية الفصلين مقرَّباً إلى أسبوعٍ كامل، حتى لا
 * تنتقل «الأحد» إلى «الثلاثاء». لا يُحفظ شيءٌ: مقترحٌ يراجعه صاحبُه ويضغط حفظ.
 */
export function suggestStudentPhases(term: AdTerm | undefined, terms: readonly AdTerm[]): PhaseSuggestion | null {
  if (!term) return null;
  const wanted = previousYearSameTermName(term.AdTermName);
  if (!wanted) return null;
  const previous = terms.find(row => sameTermName(row.AdTermName, wanted) && hasStudentPhases(row.AdTermStudentPhases));
  if (!previous?.AdTermStudentPhases) return null;
  const a = termWindow(previous), b = termWindow(term);
  if (!a || !b) return null;
  const rawDays = Math.round((b.from - a.from) / DAY_MS);
  const shiftDays = Math.round(rawDays / 7) * 7;
  const move = (day: string | undefined) => (day && isRealDay(day) ? addDays(day, shiftDays) : undefined);
  const source = previous.AdTermStudentPhases;
  const phases: TermStudentPhases = {};
  const wo = move(source.wishesOpen), wc = move(source.wishesClose), rc = move(source.requestsClose);
  if (wo) phases.wishesOpen = wo;
  if (wc) phases.wishesClose = wc;
  if (source.rounds?.length) phases.rounds = source.rounds.map(r => ({ id: r.id, name: r.name, start: move(r.start)!, end: move(r.end)! }));
  if (rc) phases.requestsClose = rc;
  return { phases, fromTermName: String(previous.AdTermName || ""), shiftDays };
}

/** معرّفٌ جديد لجولةٍ تُضاف من الواجهة. */
export const newRoundId = (existing: readonly TermStudentRound[]): string => {
  let n = existing.length + 1;
  const used = new Set(existing.map(r => r.id));
  while (used.has(`r${n}`)) n += 1;
  return `r${n}`;
};
