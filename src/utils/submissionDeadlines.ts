/**
 * ── مواعيد التسليم: الموعدُ الواحد واستثناءاتُه ──────────────────────────────
 *
 * كلَّ فصلٍ يضع رئيسُ التسجيل آخرَ موعدٍ لتسليم الجداول لكل الأقسام، ثم يستثني
 * بالأيام قسماً أو كليةً أو الجميع. كان ذلك حقلَ تاريخٍ مجرّداً بجانب اسم الفصل
 * وزرَّ «تمديد» في كل سطرٍ من الوارد — قراران في موضعين، ولكلٍّ حسابُه.
 *
 * فالقواعد هنا وحدها، ويقرؤها الخادمُ (المسارُ الجماعي ومسارُ القسم الواحد)
 * والشاشةُ (المعاينة قبل الضغط) معاً:
 *
 *   - الأيامُ أيامُ الكويت: «+٣ أيام» تُضاف إلى تاريخٍ لا إلى ساعة.
 *   - الأيامُ تُعدّ من موعد الفصل، أو من استثناء القسم القائم إن كان أبعد —
 *     فاستثناءٌ ثانٍ لا يُقصّر أولاً.
 *   - الاستثناءُ لا يسبق موعد الفصل (`extensionRefusal`)، ولا يكون بلا سبب،
 *     ولا في فصلٍ بلا موعد.
 *   - رفعُ الاستثناء يعيد القسم إلى موعد الفصل.
 */
import type { ScheduleApproval } from "../types";
import { daysBetween, extensionRefusal, type DeadlineState } from "./approvalWorkflow";
import { AR, countOf, oblique } from "./arabicCount";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

/** تاريخٌ في الكويت + عددُ أيام — حسابُ تقويمٍ، لا ساعات. */
export function addKuwaitDays(dateISO: string, days: number): string {
  const at = Date.UTC(Number(dateISO.slice(0, 4)), Number(dateISO.slice(5, 7)) - 1, Number(dateISO.slice(8, 10)))
    + Math.round(Number(days) || 0) * 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}

/** شرائحُ الأيام السريعة في «إضافة استثناء». */
export const EXCEPTION_DAY_CHIPS = [1, 2, 3, 5, 7] as const;
/** أقصى ما يُضاف بضغطةٍ واحدة. */
export const EXCEPTION_MAX_DAYS = 60;
/** مواعيدُ جاهزةٌ لفصلٍ بلا موعد: بعد أسبوعٍ وأسبوعين وثلاثة من اليوم. */
export const DEADLINE_PRESET_WEEKS = [1, 2, 3] as const;

export function presetDeadline(todayISO: string, weeks: number): string {
  return addKuwaitDays(todayISO, weeks * 7);
}

export function presetLabel(weeks: number): string {
  return weeks === 1 ? "بعد أسبوع" : weeks === 2 ? "بعد أسبوعين" : `بعد ${countOf(weeks, AR.week)}`;
}

/* ── الأساس الذي تُعدّ منه الأيام ─────────────────────────────────────────── */

export interface ExceptionBase {
  /** التاريخُ الذي تُضاف إليه الأيام. */
  base: string;
  /** أمن موعد الفصل، أم من استثناء القسم القائم لأنه أبعد. */
  from: "term" | "extension";
}

export function exceptionBase(termDeadline: string, currentExtension?: string | null): ExceptionBase {
  return currentExtension && currentExtension > termDeadline
    ? { base: currentExtension, from: "extension" }
    : { base: termDeadline, from: "term" };
}

export type ExceptionAmount = { days: number } | { until: string };

export interface ExceptionPlan {
  until: string;
  base: string;
  from: "term" | "extension" | "date";
  /** كم يوماً بعد موعد الفصل يصير موعدُ القسم. */
  daysAfterTerm: number;
}

/** موعدُ قسمٍ واحد بعد الاستثناء: بالأيام من أساسه، أو بتاريخٍ صريح. */
export function planException(termDeadline: string, currentExtension: string | null | undefined, amount: ExceptionAmount): ExceptionPlan {
  if ("until" in amount) {
    return { until: amount.until, base: termDeadline, from: "date", daysAfterTerm: daysBetween(termDeadline, amount.until) };
  }
  const { base, from } = exceptionBase(termDeadline, currentExtension);
  const until = addKuwaitDays(base, amount.days);
  return { until, base, from, daysAfterTerm: daysBetween(termDeadline, until) };
}

/** عددُ الأيام صالحٌ؟ صحيحٌ بين ١ والحدّ الأعلى. */
export function normalizeExceptionDays(value: unknown): number | null {
  const days = Number(value);
  if (!Number.isFinite(days) || Math.round(days) !== days || days < 1 || days > EXCEPTION_MAX_DAYS) return null;
  return days;
}

/**
 * لماذا يُرفض استثناءٌ — قبل أن يُكتب على أيّ قسم. رسالةٌ واحدة بالعربية أو null.
 * (الشاشةُ تسأله لتُعطّل «تطبيق»، والمسارُ يسأله ليردّ.)
 */
export function exceptionRefusal(input: {
  termDeadline?: string | null;
  amount?: Partial<{ days: unknown; until: unknown }>;
  reason?: string | null;
}): string | null {
  if (!input.termDeadline) return "ضع آخر موعدٍ للفصل أولاً — الاستثناءُ يُعدّ منه.";
  const amount = input.amount || {};
  if (amount.until !== undefined && amount.until !== null && amount.until !== "") {
    if (!isIsoDay(amount.until)) return "التاريخ يُكتب هكذا: 2026-10-22";
    const earlier = extensionRefusal(String(amount.until), input.termDeadline);
    if (earlier) return earlier;
  } else if (normalizeExceptionDays(amount.days) === null) {
    return `اختر عدد الأيام: من يومٍ واحد إلى ${countOf(EXCEPTION_MAX_DAYS, AR.day)}.`;
  }
  if (String(input.reason || "").trim().length < 3) return "اكتب سبب الاستثناء — يراه القسم مع موعده.";
  return null;
}

/* ── كتابةُ الاستثناء على سجلّ الاعتماد: موضعٌ واحد للمسارين ────────────── */

export function withException(approval: ScheduleApproval, input: { until: string; reason?: string; by: string; at?: string }): ScheduleApproval {
  const reason = String(input.reason || "").trim().slice(0, 240);
  /* منحُ استثناءٍ يطوي طلبَ القسم إن كان: أُجيب. */
  const { extensionRequest: _answered, ...rest } = approval;
  return {
    ...rest,
    extensionUntil: input.until,
    extensionReason: reason || undefined,
    extensionBy: input.by,
    extensionAt: input.at || new Date().toISOString(),
  } as ScheduleApproval;
}

/** رفعُ الاستثناء: يعود القسمُ إلى موعد الفصل. طلبٌ معلّقٌ يبقى كما هو. */
export function withoutException(approval: ScheduleApproval): ScheduleApproval {
  const { extensionUntil: _u, extensionReason: _r, extensionBy: _b, extensionAt: _a, ...rest } = approval;
  return rest as ScheduleApproval;
}

/** رفضُ طلب القسم: يُطوى الطلب، ويبقى موعدُه كما كان. */
export function withoutExtensionRequest(approval: ScheduleApproval): ScheduleApproval {
  const { extensionRequest: _r, ...rest } = approval;
  return rest as ScheduleApproval;
}

/* ── ما يُقال على الشاشة ─────────────────────────────────────────────────── */

function utcDay(iso: string): Date {
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
}

/** «الخميس 8 أكتوبر 2026» — يومُ الأسبوع أولاً، لأنه ما يُخطَّط به. */
export function deadlineDateLong(iso?: string | null): string {
  if (!iso || !isIsoDay(iso.slice(0, 10))) return iso || "";
  const at = utcDay(iso);
  const weekday = at.toLocaleDateString("ar-KW-u-nu-latn", { weekday: "long", timeZone: "UTC" });
  const date = at.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return `${weekday} ${date}`;
}

/** «الأحد 11 أكتوبر» — بلا سنة، للقوائم والمعاينة. */
export function deadlineDateShort(iso?: string | null): string {
  if (!iso || !isIsoDay(iso.slice(0, 10))) return iso || "";
  const at = utcDay(iso);
  const weekday = at.toLocaleDateString("ar-KW-u-nu-latn", { weekday: "long", timeZone: "UTC" });
  const date = at.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long", timeZone: "UTC" });
  return `${weekday} ${date}`;
}

export type DeadlinePhase = "none" | "upcoming" | "today" | "passed";

export function deadlinePhase(state: Pick<DeadlineState, "effective" | "past" | "daysLeft">): DeadlinePhase {
  if (!state.effective) return "none";
  if (state.past) return "passed";
  return (state.daysLeft ?? 0) <= 0 ? "today" : "upcoming";
}

/** «بقي 12 يوماً» · «اليوم آخر يوم» · «انقضى منذ 3 أيام». */
export function deadlineCountdown(state: Pick<DeadlineState, "effective" | "past" | "daysLeft">): string {
  const phase = deadlinePhase(state);
  const days = Number(state.daysLeft || 0);
  if (phase === "none") return "";
  if (phase === "passed") return days === -1 ? "انقضى أمس" : `انقضى منذ ${countOf(Math.abs(days), oblique(AR.day))}`;
  if (phase === "today") return "اليوم آخر يوم";
  return days === 1 ? "بقي يومٌ واحد — غداً" : `بقي ${countOf(days, AR.day)}`;
}

/** السطرُ الكبير: «آخر موعد: الخميس 8 أكتوبر 2026 · بقي 12 يوماً». */
export function deadlineHeadline(state: Pick<DeadlineState, "effective" | "past" | "daysLeft">): string {
  if (!state.effective) return "لم يُحدَّد آخر موعدٍ لتسليم الجداول";
  return `آخر موعد: ${deadlineDateLong(state.effective)} · ${deadlineCountdown(state)}`;
}

/** «+3 أيام» — قدرُ الاستثناء بعد موعد الفصل. */
export function exceptionDaysLabel(daysAfterTerm: number): string {
  if (daysAfterTerm < 0) return "قبل موعد الفصل";
  if (daysAfterTerm === 0) return "بموعد الفصل";
  return `+${countOf(daysAfterTerm, AR.day)}`;
}

/**
 * سطرُ القسم: «موعدكم: الأحد 11 أكتوبر 2026 · بقي 15 يوماً (استثناء حتى الأحد 11 أكتوبر)».
 * القسمُ يرى موعده هو — التمديد إن وُجد — ويعرف أنه استثناءٌ لا موعدُ الجميع.
 */
export function departmentDeadlineLine(state: Pick<DeadlineState, "effective" | "past" | "daysLeft" | "extensionUntil" | "termDeadline">): string {
  if (!state.effective) return "";
  const base = `موعدكم: ${deadlineDateLong(state.effective)} · ${deadlineCountdown(state)}`;
  return state.extensionUntil ? `${base} (استثناء حتى ${deadlineDateShort(state.extensionUntil)})` : base;
}

/* ── ميزانُ الفصل ─────────────────────────────────────────────────────────── */

export interface DeadlineProgressRow {
  status: string;
  rowCount?: number;
  round?: number;
  /** من القاعدة الواحدة `isLate` — يحسبها الخادم مع الوارد. */
  late?: boolean;
}

export interface DeadlineProgress {
  total: number;
  sent: number;
  accepted: number;
  returned: number;
  drafting: number;
  notStarted: number;
  late: number;
}

export type ProgressSegment = "accepted" | "sent" | "returned" | "drafting" | "notStarted";

/** أين هذا القسم من التسليم — شريحةٌ واحدة لكل قسم، فالمجموعُ هو عددُ الأقسام. */
export function progressSegment(row: DeadlineProgressRow): ProgressSegment {
  if (row.status === "accepted") return "accepted";
  if (row.status === "submitted") return "sent";
  if (row.status === "returned") return "returned";
  if (row.status === "notStarted") return "notStarted";
  /* بلا جولةٍ ولا مواعيد: لم يبدأ. ومواعيدُ بلا إرسال: قيد الإعداد. */
  if (!Number(row.round || 0) && !Number(row.rowCount || 0)) return "notStarted";
  return "drafting";
}

export function deadlineProgress(rows: readonly DeadlineProgressRow[]): DeadlineProgress {
  const out: DeadlineProgress = { total: rows.length, sent: 0, accepted: 0, returned: 0, drafting: 0, notStarted: 0, late: 0 };
  for (const row of rows) {
    out[progressSegment(row)] += 1;
    if (row.late) out.late += 1;
  }
  return out;
}

export const PROGRESS_LABEL: Record<ProgressSegment | "late", string> = {
  accepted: "معتمد", sent: "عند التسجيل", returned: "مُرجَع للقسم", drafting: "قيد الإعداد", notStarted: "لم يبدأ", late: "متأخّر",
};

/* ── المعاينة: «سيصبح موعد 6 أقسام: الأحد 11 أكتوبر» ────────────────────── */

export interface PreviewTarget { key: string; extensionUntil?: string | null }

export interface ExceptionPreview {
  groups: Array<{ until: string; count: number; daysAfterTerm: number }>;
  /** كم قسماً عُدّت أيامُه من استثنائه القائم لأنه أبعد من موعد الفصل. */
  fromExtension: number;
  sentence: string;
}

export function previewExceptions(termDeadline: string, targets: readonly PreviewTarget[], amount: ExceptionAmount): ExceptionPreview {
  const byDate = new Map<string, { count: number; daysAfterTerm: number }>();
  let fromExtension = 0;
  for (const target of targets) {
    const plan = planException(termDeadline, target.extensionUntil, amount);
    if (plan.from === "extension") fromExtension += 1;
    const entry = byDate.get(plan.until) || { count: 0, daysAfterTerm: plan.daysAfterTerm };
    entry.count += 1;
    byDate.set(plan.until, entry);
  }
  const groups = [...byDate].map(([until, value]) => ({ until, ...value })).sort((a, b) => a.until.localeCompare(b.until));
  const sentence = !targets.length ? "اختر الأقسام أولاً."
    : groups.map(group => `سيصبح موعد ${countOf(group.count, AR.department)}: ${deadlineDateShort(group.until)}`).join(" · ");
  return { groups, fromExtension, sentence };
}
