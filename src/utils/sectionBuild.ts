import type { AdCourse, FSchedule } from "../types";
import { PAIR_FLOOR, type DemandReading } from "./studentDemand";

/**
 * ── تنزيل الشعب: من العدد المختار إلى جدولٍ بلا تعارض ──────────────────────────────
 *
 * «تخطيط الشعب» يقرّر كم شعبة يحتاج كل مقرر؛ هذه الدوال تحوّل القرار إلى فجوةٍ قابلة للقراءة
 * (المطلوب ٦، الموجود ٥، باقٍ ١) ثم إلى مدخلٍ لمحرّك الأوقات نفسه الذي تعتمد عليه التوصيات،
 * فلا محرّكَ ثانياً ولا طريقَ جانبياً: الكتابة كلها تمرّ من مسار الجدول.
 * نقيةٌ لا تقرأ قاعدة بيانات ولا تكتب شيئاً.
 */

export type GapState = "done" | "missing" | "over" | "unset";

export interface GapRow {
  courseId: number; name: string; code: string;
  /** المختار في التخطيط؛ null = لم يُقرَّر بعد. */
  target: number | null;
  /** شعبٌ مميّزة (SCode) موجودة في جدول هذا الفصل لهذا المقرر. */
  existing: number;
  /** ما بقي: max(0, target - existing). */
  remaining: number;
  state: GapState;
}

export function gapRows(courses: readonly Pick<AdCourse, "AdCourseId" | "CourseName" | "CourseCode">[], targets: ReadonlyMap<number, number>, termWeek: readonly FSchedule[]): GapRow[] {
  const codes = new Map<number, Set<string>>();
  for (const row of termWeek) {
    const id = Number(row.AdCourseId);
    if (!codes.has(id)) codes.set(id, new Set());
    codes.get(id)!.add(String(row.SCode));
  }
  return courses.map(course => {
    const id = Number(course.AdCourseId);
    const existing = codes.get(id)?.size || 0;
    const raw = targets.get(id);
    const target = raw === undefined || !Number.isFinite(raw) ? null : Math.max(0, Math.floor(raw));
    const remaining = target === null ? 0 : Math.max(0, target - existing);
    const state: GapState = target === null ? "unset" : remaining > 0 ? "missing" : existing > target ? "over" : "done";
    return { courseId: id, name: course.CourseName, code: course.CourseCode, target, existing, remaining, state };
  });
}

/**
 * مدخل المحرّك: طلبٌ اصطناعي = المختار × سعة الشعبة، فيخرج «المطلوب» من حسابه مساوياً للفجوة بالضبط
 * (shortfall = (target - open) × capacity). أزواج المستوى الواحد لا يجوز أن تتقاطع: طلبة المستوى يسجّلون معاً.
 */
export function demandFromTargets(rows: readonly GapRow[], capacityOf: (courseId: number) => number, levelOf: (courseId: number) => number): DemandReading {
  const active = rows.filter(row => row.target !== null);
  const courses = active.map(row => ({ courseId: row.courseId, name: row.name, code: row.code, students: (row.target as number) * capacityOf(row.courseId), share: 100 }));
  const pairs: DemandReading["pairs"] = [];
  for (let i = 0; i < active.length; i += 1) for (let j = i + 1; j < active.length; j += 1) {
    const a = active[i], b = active[j], la = levelOf(a.courseId), lb = levelOf(b.courseId);
    if (la > 0 && la === lb) pairs.push({ a: Math.min(a.courseId, b.courseId), b: Math.max(a.courseId, b.courseId), shared: PAIR_FLOOR, nameA: a.name, nameB: b.name });
  }
  return { respondents: Math.max(1, active.length), courses, pairs, unwanted: [], headline: "" };
}

/** الأصعب أولاً: مقرراتُ أوسع زمرةً (أكثر أقرانٍ من مستواها) ثم الأكثر شعباً، فيجد الأصعبُ وقتاً قبل أن تضيق الأسابيع. */
export function hardestFirst(rows: readonly GapRow[], levelOf: (courseId: number) => number): GapRow[] {
  const peers = (row: GapRow) => { const level = levelOf(row.courseId); return level > 0 ? rows.filter(other => levelOf(other.courseId) === level).length : 0; };
  return [...rows].sort((x, y) => peers(y) - peers(x) || y.remaining - x.remaining || x.courseId - y.courseId);
}

/** بصمة الأسبوع: تتغيّر بأي صفٍّ أُضيف أو حُذف أو تغيّر موعده؛ يقارنها الخادم لحظة التنزيل. */
export function weekFingerprint(rows: readonly FSchedule[]): string {
  const parts = rows.map(row => {
    const r: any = row;
    return [r.id, r.rev ?? 0, r.AdCourseId, r.SCode, r.fsunday ? 1 : 0, r.fmonday ? 1 : 0, r.ftuesday ? 1 : 0, r.fwednesday ? 1 : 0, r.fthursday ? 1 : 0, r.fstarttime, r.fendtime, r.roomId || "", r.AdInstructorId || 0].join(":");
  }).sort();
  let hash = 5381;
  for (const part of parts) for (let i = 0; i < part.length; i += 1) hash = ((hash << 5) + hash + part.charCodeAt(i)) | 0;
  return `${parts.length}-${(hash >>> 0).toString(36)}`;
}
