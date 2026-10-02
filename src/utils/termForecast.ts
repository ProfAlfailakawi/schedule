/**
 * ── الإنذار المبكر للفصل: توقّعٌ حتميّ من بياناتٍ محفوظة ──────────────────────
 *
 * ليس ذكاءً اصطناعياً ولا تخميناً: حسابٌ ثابت القواعد على ما خزّنه النظام
 * (كشف «المقاعد المتبقية» المستورد، شعب جدول الفصل، سعة المقرر، نصاب الأستاذ).
 * ما لا بيانات له لا يُحسب ولا يُخمَّن: يُقال إنه غير معروف.
 *
 * القواعد (لقسمٍ واحدٍ وفصلٍ واحد):
 *  1. الطلب = «المقاعد المتبقية» لكل مقرر من الكشف المستورد (العمود "seats" وحده؛
 *     العمود القديم لا يُعدّ طلباً). لا كشف ← لا توقّع (status = "no-remaining").
 *  2. الشعب المطلوبة = ⌈المتبقي ÷ سعة الشعبة⌉ والسعة هي MaxStudent المسجّلة للمقرر.
 *     سعةٌ صفرٌ أو غائبة = «السعة غير معروفة»: لا تُفترض سعة، ويُستثنى المقرر من
 *     التغطية والنقص ويُذكر وحده.
 *  3. الشعب المجدولة = عدد رموز الشعب (SCode، وإلا رقم الصف) المميّزة للمقرر في صفوف
 *     هذا الفصل. النقص = الشعب المطلوبة − المجدولة (لا يقلّ عن صفر).
 *  4. تغطية الطلب % = المقاعد المغطّاة ÷ مجموع المتبقي، بالمقرّبة إلى أقرب عدد صحيح؛
 *     المغطّى لكل مقرر = min(المتبقي، المجدولة × السعة)، والمجموع على المقررات
 *     المعروفة السعة التي لها متبقٍّ موجب. لا مقعد ← percent = null (لا رقم مختلق).
 *  5. تجاوز الأستاذ = ساعاته المعتمدة الأسبوعية (weeklyLoadOf: كل شعبة مرة) أعلى من
 *     نصابه المسجّل AdInstructorLoad — هو العتبة الموجودة في المشروع. أستاذٌ بلا نصاب
 *     مسجّل لا يُحكم عليه برقمٍ مخترع.
 *  6. الشعب بلا قاعة = شعبٌ فيها صفٌّ واحد على الأقل بلا موقع (roomIdentityKey فارغ،
 *     ويشمل «بانتظار تثبيت القاعة»). لا يتطلب كشف المتبقي.
 *
 * الأولويات في الإبراز (حتى ٣): الأشدّ نقصاً، ثم تجاوز الأساتذة، ثم الشعب بلا قاعة،
 * ثم باقي النواقص، ثم السعة المجهولة. و«كل التفاصيل» تحمل ما لم يُبرَز فقط.
 */
import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { AR, countOf } from "./arabicCount";
import { weeklyLoadOf } from "./instructorRequestVerdict";
import { roomIdentityKey } from "./locationRegistry";

export type ForecastRiskKind = "shortage" | "overload" | "unroomed" | "capacity";
export interface ForecastRisk { kind: ForecastRiskKind; tone: "danger" | "warning" | "info"; text: string }

export interface TermForecast {
  /** no-remaining: لم يُستورد كشف المتبقي لهذا النطاق؛ ready: التوقّع محسوب. */
  status: "ready" | "no-remaining";
  coverage: { percent: number | null; coveredSeats: number; totalSeats: number };
  shortCourses: number;
  highlights: ForecastRisk[];
  more: ForecastRisk[];
}

export interface ForecastInput {
  rows: readonly FSchedule[];
  courses: readonly AdCourse[];
  instructors: readonly Pick<AdInstructor, "AdInstructorId" | "AdInstructorName" | "AdInstructorLoad">[];
  /** AdCourseId → المقاعد المتبقية؛ null/غائب = لم يُستورد كشفُ "seats". */
  remaining: Record<string, number> | null | undefined;
}

const sectionKey = (row: FSchedule) => String(row.SCode || row.id);

export function computeTermForecast(input: ForecastInput): TermForecast {
  const rows = input.rows;
  const courseOf = new Map(input.courses.map(course => [Number(course.AdCourseId), course]));
  const sectionsOf = new Map<number, Set<string>>();
  for (const row of rows) {
    const id = Number(row.AdCourseId);
    if (!sectionsOf.has(id)) sectionsOf.set(id, new Set());
    sectionsOf.get(id)!.add(sectionKey(row));
  }

  const ready = Boolean(input.remaining && Object.keys(input.remaining).length);
  let covered = 0, total = 0;
  const shortages: Array<{ code: string; missing: number }> = [];
  let unknownCapacity = 0;
  if (ready) {
    for (const course of input.courses) {
      const seats = Math.max(0, Math.round(Number(input.remaining![String(course.AdCourseId)]) || 0));
      if (!seats) continue;
      const capacity = Number(course.MaxStudent) || 0;
      if (capacity <= 0) { unknownCapacity++; continue; }
      const scheduled = sectionsOf.get(Number(course.AdCourseId))?.size || 0;
      const required = Math.ceil(seats / capacity);
      total += seats;
      covered += Math.min(seats, scheduled * capacity);
      if (required > scheduled) shortages.push({ code: String(course.CourseCode || course.CourseName || ""), missing: required - scheduled });
    }
  }
  shortages.sort((a, b) => b.missing - a.missing || a.code.localeCompare(b.code));

  const byInstructor = new Map<number, FSchedule[]>();
  for (const row of rows) {
    const id = Number(row.AdInstructorId || 0);
    if (id > 0) byInstructor.set(id, [...(byInstructor.get(id) || []), row]);
  }
  let overloaded = 0;
  let firstOverloaded = "";
  for (const instructor of input.instructors) {
    const limit = Number(instructor.AdInstructorLoad) || 0;
    if (limit <= 0) continue;
    const mine = byInstructor.get(Number(instructor.AdInstructorId));
    if (mine && weeklyLoadOf(mine, courseOf as Map<number, AdCourse>) > limit) {
      if (!overloaded) firstOverloaded = String(instructor.AdInstructorName || "");
      overloaded++;
    }
  }
  const unroomedSections = new Set<string>();
  for (const row of rows) if (!roomIdentityKey(row)) unroomedSections.add(`${row.AdCourseId}|${sectionKey(row)}`);

  const shortageRisk = (s: { code: string; missing: number }): ForecastRisk =>
    ({ kind: "shortage", tone: "danger", text: `مقرر ${s.code} ناقص ${countOf(s.missing, AR.section)}` });
  const overloadRisk: ForecastRisk | null = overloaded ? { kind: "overload", tone: "warning",
    text: overloaded === 1 ? `${firstOverloaded ? `الأستاذ ${firstOverloaded}` : "أستاذ"} تجاوز نصابه` : `${countOf(overloaded, AR.instructor)} تجاوزوا نصابهم` } : null;
  const unroomedRisk: ForecastRisk | null = unroomedSections.size ? { kind: "unroomed", tone: "warning",
    text: `${countOf(unroomedSections.size, AR.section)} بلا قاعة` } : null;
  const capacityRisk: ForecastRisk | null = unknownCapacity ? { kind: "capacity", tone: "info",
    text: `السعة غير معروفة لـ${countOf(unknownCapacity, AR.course)}` } : null;

  const ordered = [
    ...(shortages[0] ? [shortageRisk(shortages[0])] : []),
    ...(overloadRisk ? [overloadRisk] : []),
    ...(unroomedRisk ? [unroomedRisk] : []),
    ...shortages.slice(1).map(shortageRisk),
    ...(capacityRisk ? [capacityRisk] : []),
  ];
  return {
    status: ready ? "ready" : "no-remaining",
    coverage: { percent: total > 0 ? Math.round((covered / total) * 100) : null, coveredSeats: covered, totalSeats: total },
    shortCourses: shortages.length,
    highlights: ordered.slice(0, 3),
    more: ordered.slice(3),
  };
}
