import type { StudentProfile } from "../types";

/**
 * ── ملفُّ الطالب: القواعدُ التي لا تتغيّر بتغيّر الشاشة ──────────────────────
 *
 * ما يُكتب هنا يقرؤه الخادمُ (وهو الذي يحرس الباب) وتقرؤه الواجهةُ لتعرض
 * الحدودَ قبل الإرسال. لا شيء هنا يلمس قاعدة البيانات ولا الوقتَ الحقيقي: كل
 * دالّةٍ تأخذ «الآن» معاملاً، فتُجرَّب بأيّ تاريخ.
 */

/** الرمزُ الشخصي: ستة أرقام. */
export const CODE_LENGTH = 6;
/** محاولاتٌ خاطئة متتالية قبل القفل المؤقّت. */
export const CODE_MAX_FAILURES = 5;
export const CODE_LOCK_MS = 15 * 60_000;

/** انقطاعٌ عن الباب بهذا الطول (أربعة فصولٍ دراسية تقريباً) يحذف الملف. */
export const INACTIVE_DAYS = 730;
/** ملفٌّ جديد لم يُقدَّر له تخرّج بعد: يُحفظ هذه المدة. */
export const NEW_PROFILE_YEARS = 6;
/** بعد التخرّج المتوقَّع بهذه المدة يُحذف. */
export const AFTER_GRADUATION_DAYS = 365;
/** متوسّط ما يسجّله الطالب في الفصل (الهدف ١٢–١٥) لتقدير ما بقي له. */
export const TYPICAL_TERM_UNITS = 13.5;
/** الفصلان الأول والثاني؛ الصيفيُّ لا يُعدّ في التقدير. */
export const MONTHS_PER_TERM = 6;
/** آخرُ دخول لا يُكتب أكثر من مرةٍ في اليوم: القراءةُ لا تُكلّف كتابة. */
export const TOUCH_EVERY_MS = 24 * 3_600_000;
/** مهلةُ «نسيت رمزي»: يُحذف الملفُّ بعدها ما لم يدخل صاحبُه بالرمز. */
export const RESET_COOLDOWN_DAYS = 30;
/** عمر جلسة «هذا جهازي الشخصي». */
export const REMEMBER_DAYS = 180;

const DAY_MS = 86_400_000;

/* ───────────────────────── الرمز ───────────────────────── */

const isRun = (code: string): boolean => {
  const digits = code.split("").map(Number);
  const step = digits[1] - digits[0];
  return Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step);
};

/**
 * ما يمنع قبولَ رمزٍ يُخمَّن في ثلاث محاولات. يرجع جملةً أو null.
 * الرمزُ يحرس ملفَّ الطالب لا مالَه، فلا نُثقل عليه — لكن لا «000000» ولا «123456».
 */
export function codeProblem(code: unknown): string | null {
  const text = String(code ?? "");
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(text)) return `الرمز ${CODE_LENGTH} أرقام.`;
  if (/^(\d)\1+$/.test(text) || isRun(text)) return "اختر رمزاً أصعب من أرقامٍ متكرّرة أو متتالية.";
  return null;
}

export interface LockReading { locked: boolean; retryInMs: number }

export function lockState(profile: Pick<StudentProfile, "codeFailures">, now: number): LockReading {
  const until = Number(profile.codeFailures?.lockedUntil || 0);
  return until > now ? { locked: true, retryInMs: until - now } : { locked: false, retryInMs: 0 };
}

/** حالةُ المحاولات بعد خطأٍ آخر: عند الحدّ يُقفل الملفُّ مؤقّتاً ويبدأ العدّ من جديد بعده. */
export function afterCodeFailure(profile: Pick<StudentProfile, "codeFailures">, now: number): NonNullable<StudentProfile["codeFailures"]> {
  const previous = profile.codeFailures;
  const expired = Boolean(previous?.lockedUntil && previous.lockedUntil <= now);
  const count = (expired ? 0 : Number(previous?.count || 0)) + 1;
  return count >= CODE_MAX_FAILURES ? { count: 0, lockedUntil: now + CODE_LOCK_MS } : { count };
}

/* ───────────────────────── المنجَز والمتبقّي ───────────────────────── */

/** المقرراتُ التي يملكها القسمُ المختار فقط، بلا تكرار، مرتّبةً. */
export function sanitizePassed(ids: unknown, allowed: ReadonlySet<number>): number[] {
  const list = Array.isArray(ids) ? ids : [];
  return [...new Set(list.map(value => Number(value)).filter(id => Number.isInteger(id) && allowed.has(id)))].sort((a, b) => a - b);
}

export function unitsOf(ids: readonly number[], credit: ReadonlyMap<number, number>): number {
  return ids.reduce((sum, id) => sum + (Number(credit.get(id)) || 0), 0);
}

export interface PlanProgress {
  totalCourses: number;
  passedCourses: number;
  totalUnits: number;
  passedUnits: number;
  remainingUnits: number;
  remainingIds: number[];
  /** ٠–١٠٠ بالوحدات لا بعدد المقررات. */
  percent: number;
}

export function planProgress(planCourseIds: readonly number[], passed: readonly number[], credit: ReadonlyMap<number, number>): PlanProgress {
  const plan = [...new Set(planCourseIds.map(Number))];
  const done = new Set(passed.map(Number));
  const inPlanPassed = plan.filter(id => done.has(id));
  const remainingIds = plan.filter(id => !done.has(id));
  const totalUnits = unitsOf(plan, credit);
  const passedUnits = unitsOf(inPlanPassed, credit);
  return {
    totalCourses: plan.length, passedCourses: inPlanPassed.length,
    totalUnits, passedUnits, remainingUnits: Math.max(0, totalUnits - passedUnits), remainingIds,
    percent: totalUnits > 0 ? Math.min(100, Math.round((passedUnits / totalUnits) * 100)) : 0,
  };
}

/* ───────────────────────── التخرّج المتوقَّع وعمر الملف ───────────────────────── */

const addMonths = (from: Date, months: number): Date => {
  const out = new Date(from.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
};

/**
 * متى يتخرّج إن سجّل المعتاد كل فصل. تقديرٌ للحذف لا وعدٌ للطالب، ولا يُعرض
 * عليه تاريخاً: لا شيء بعد الصفر المتبقّي سوى «الآن».
 */
export function expectedGraduation(remainingUnits: number, now: Date, perTerm: number = TYPICAL_TERM_UNITS): string {
  if (!(remainingUnits > 0)) return now.toISOString();
  const terms = Math.ceil(remainingUnits / Math.max(1, perTerm));
  return addMonths(now, terms * MONTHS_PER_TERM).toISOString();
}

export interface Lifetime { deleteAt: string; deleteReason: StudentProfile["deleteReason"] }

/**
 * متى يُحذف الملف: أقربُ التاريخين —
 *   • التخرّجُ المتوقَّع + سنة (أو، لملفٍّ لم يُقدَّر له تخرّج، تاريخُ الإنشاء + ستُّ سنوات)
 *   • آخرُ دخول + سنتان (الانقطاع)
 * فمن انقطع عن الباب سنتين يُحذف ولو كان تخرّجُه المتوقَّع بعيداً، ومن يتخرّج
 * يُحذف بعد سنةٍ ولو بقي يدخل.
 */
export function profileLifetime(
  profile: Pick<StudentProfile, "createdAt" | "lastSeenAt" | "expectedGraduationAt">,
  now: Date = new Date(),
): Lifetime {
  const seen = Date.parse(profile.lastSeenAt) || now.getTime();
  const created = Date.parse(profile.createdAt) || now.getTime();
  const inactiveAt = seen + INACTIVE_DAYS * DAY_MS;
  const graduation = profile.expectedGraduationAt ? Date.parse(profile.expectedGraduationAt) : NaN;
  const planned = Number.isFinite(graduation)
    ? { at: graduation + AFTER_GRADUATION_DAYS * DAY_MS, reason: "graduation" as const }
    : { at: addMonths(new Date(created), NEW_PROFILE_YEARS * 12).getTime(), reason: "initial" as const };
  return inactiveAt <= planned.at
    ? { deleteAt: new Date(inactiveAt).toISOString(), deleteReason: "inactive" }
    : { deleteAt: new Date(planned.at).toISOString(), deleteReason: planned.reason };
}

/** هل يُكتب آخرُ دخول الآن؟ مرةً في اليوم. */
export function shouldTouch(lastSeenAt: string, now: number): boolean {
  const seen = Date.parse(lastSeenAt);
  return !Number.isFinite(seen) || now - seen >= TOUCH_EVERY_MS;
}

/** حذفٌ مطلوب: بعد المهلة، أو قبلها إن كان عمرُ الملف أقصر. */
export function resetLifetime(profile: Pick<StudentProfile, "deleteAt">, now: Date): Lifetime {
  const at = now.getTime() + RESET_COOLDOWN_DAYS * DAY_MS;
  const current = Date.parse(profile.deleteAt);
  return Number.isFinite(current) && current < at
    ? { deleteAt: profile.deleteAt, deleteReason: "reset" }
    : { deleteAt: new Date(at).toISOString(), deleteReason: "reset" };
}
