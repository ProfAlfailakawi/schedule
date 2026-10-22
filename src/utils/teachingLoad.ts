/**
 * ── النصاب التدريسي: الحسابُ وحده ────────────────────────────────────────────
 *
 * ميزةٌ اختيارية يديرها المسؤول المخوّل من إعدادات الإدارة. هذا الملفُّ نقيٌّ لا يعرف قاعدةَ بيانات ولا
 * واجهة، ويقرؤه الخادمُ (الحفظ والتنبيه) والواجهةُ (شاشةُ الإعداد) بالتعريف نفسه.
 *
 *   العبء   = مجموعُ ساعات المقررات المسجَّلة للعضو في الفصل (CourseHours)، شعبةً واحدةً مرّة واحدة
 *             مهما تعدّدت صفوفُ مواعيدها.
 *   المسموح = الحدُّ الأعلى (للعضو إن عُيّن له، وإلا لدرجته) + الساعاتُ الإضافية.
 *   التجاوز = ما زاد على المسموح. وهو تنبيهٌ يُقال ولا يمنع: لا يُرفض به حفظُ موعد.
 *
 * عضوٌ بلا درجةٍ ولا نصابٍ خاصّ «غيرُ مضبوط»: لا يُفرَض عليه رقمٌ مخترَع، ولا يظهر له تنبيه.
 */
import { AR, countOf } from "./arabicCount";
import type { AcademicRank, FSchedule, TeachingLoadAssignment, TeachingLoadConfig } from "../types";

export const TEACHING_LOAD_DOC_ID = "main" as const;
export const MAX_ACADEMIC_RANKS = 30;
export const MAX_RANK_NAME_LENGTH = 60;
export const MAX_LOAD_HOURS = 60;
export const MAX_EXTRA_HOURS = 30;

export const emptyTeachingLoadConfig = (): TeachingLoadConfig => ({ id: TEACHING_LOAD_DOC_ID, enabled: false, ranks: [], assignments: {}, updatedAt: "" });

const hoursOf = (value: unknown, max: number): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.min(max, Math.round(n * 100) / 100);
};
const cleanName = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_RANK_NAME_LENGTH);

/** ما يُقرأ من التخزين أو يصل من العميل، مُنقّىً إلى الشكل الصحيح (لا يرمي). */
export function normalizeTeachingLoadConfig(raw: unknown): TeachingLoadConfig {
  const input: any = raw && typeof raw === "object" ? raw : {};
  const seen = new Set<string>();
  const ranks: AcademicRank[] = [];
  for (const item of Array.isArray(input.ranks) ? input.ranks : []) {
    const name = cleanName(item?.name);
    let id = String(item?.id ?? "").trim().slice(0, 40);
    if (!name) continue;
    if (!id || seen.has(id)) id = `rank-${ranks.length + 1}-${Math.random().toString(36).slice(2, 7)}`;
    seen.add(id);
    ranks.push({ id, name, minHours: hoursOf(item?.minHours, MAX_LOAD_HOURS) ?? 0, maxHours: hoursOf(item?.maxHours, MAX_LOAD_HOURS) ?? 0 });
  }
  const assignments: Record<string, TeachingLoadAssignment> = {};
  for (const [key, value] of Object.entries(input.assignments && typeof input.assignments === "object" ? input.assignments : {})) {
    const id = Number(key);
    if (!Number.isInteger(id) || id <= 0) continue;
    const row: any = value || {};
    const rankId = String(row.rankId ?? "").trim();
    const entry: TeachingLoadAssignment = {};
    if (rankId && seen.has(rankId)) entry.rankId = rankId;
    const min = hoursOf(row.minHours, MAX_LOAD_HOURS), max = hoursOf(row.maxHours, MAX_LOAD_HOURS), extra = hoursOf(row.extraHours, MAX_EXTRA_HOURS);
    if (min !== undefined) entry.minHours = min;
    if (max !== undefined) entry.maxHours = max;
    if (extra) entry.extraHours = extra;
    if (Object.keys(entry).length) assignments[String(id)] = entry;
  }
  return {
    id: TEACHING_LOAD_DOC_ID, enabled: input.enabled === true, ranks, assignments,
    updatedAt: String(input.updatedAt || ""), ...(input.updatedBy ? { updatedBy: String(input.updatedBy).slice(0, 120) } : {}),
  };
}

/** رسالةٌ عربيةٌ واحدة لأول خللٍ في ما يرسله المسؤول، أو null إن صحّ. */
export function teachingLoadProblem(raw: any): string | null {
  const ranks: any[] = Array.isArray(raw?.ranks) ? raw.ranks : [];
  if (ranks.length > MAX_ACADEMIC_RANKS) return `الحدّ الأقصى ${MAX_ACADEMIC_RANKS} درجةً علمية.`;
  const names = new Set<string>();
  for (const rank of ranks) {
    const name = cleanName(rank?.name);
    if (!name) return "اكتب اسماً لكل درجة علمية.";
    const key = name.toLowerCase();
    if (names.has(key)) return `الدرجة «${name}» مكرّرة.`;
    names.add(key);
    const min = Number(rank?.minHours), max = Number(rank?.maxHours);
    if (![min, max].every(n => Number.isFinite(n) && n >= 0 && n <= MAX_LOAD_HOURS)) return `نصاب «${name}» يجب أن يكون بين صفر و${countOf(MAX_LOAD_HOURS, AR.hour)}.`;
    if (min > max) return `الحدّ الأدنى لنصاب «${name}» أكبر من الأعلى.`;
  }
  for (const [key, row] of Object.entries(raw?.assignments && typeof raw.assignments === "object" ? raw.assignments : {}) as Array<[string, any]>) {
    const min = row?.minHours, max = row?.maxHours, extra = row?.extraHours;
    for (const value of [min, max, extra]) {
      if (value === undefined || value === null || value === "") continue;
      if (!Number.isFinite(Number(value)) || Number(value) < 0) return `ساعاتُ العضو رقم ${key} غير صالحة.`;
    }
    if (extra !== undefined && extra !== null && extra !== "" && Number(extra) > MAX_EXTRA_HOURS) return `الساعات الإضافية لا تتجاوز ${MAX_EXTRA_HOURS}.`;
    if (min !== undefined && min !== null && min !== "" && max !== undefined && max !== null && max !== "" && Number(min) > Number(max)) return `الحدّ الأدنى للعضو رقم ${key} أكبر من الأعلى.`;
  }
  return null;
}

/** عبءُ كل عضو في الفصل: شعبةٌ (مقرر + رمز) تُحسب مرّةً لأستاذها، بساعات مقرّرها. */
export function teachingHoursByInstructor(
  rows: readonly Pick<FSchedule, "AdInstructorId" | "AdCourseId" | "SCode">[],
  courseHours: ReadonlyMap<number, number>,
): Map<number, number> {
  const counted = new Set<string>();
  const out = new Map<number, number>();
  for (const row of rows) {
    const instructorId = Number(row.AdInstructorId || 0), courseId = Number(row.AdCourseId || 0);
    if (!instructorId || !courseId) continue;
    const key = `${instructorId}|${courseId}|${String(row.SCode ?? "")}`;
    if (counted.has(key)) continue;
    counted.add(key);
    const hours = Number(courseHours.get(courseId) || 0);
    if (hours > 0) out.set(instructorId, Math.round(((out.get(instructorId) || 0) + hours) * 100) / 100);
  }
  return out;
}

export interface TeachingLoadLimits {
  rank: AcademicRank | null;
  min: number | null;
  max: number | null;
  extra: number;
  /** الحدّ الأعلى + الإضافية؛ null إن لم يُضبط نصابٌ لهذا العضو. */
  allowed: number | null;
}

export function teachingLoadLimits(config: TeachingLoadConfig, instructorId: number): TeachingLoadLimits {
  const entry = config.assignments[String(instructorId)];
  const rank = entry?.rankId ? config.ranks.find(item => item.id === entry.rankId) || null : null;
  const min = entry?.minHours ?? rank?.minHours ?? null;
  const max = entry?.maxHours ?? rank?.maxHours ?? null;
  const extra = Number(entry?.extraHours || 0);
  return { rank, min, max, extra, allowed: max === null ? null : Math.round((max + extra) * 100) / 100 };
}

export type TeachingLoadState = "unset" | "under" | "within" | "over";
export interface TeachingLoadStatus extends TeachingLoadLimits {
  instructorId: number;
  hours: number;
  state: TeachingLoadState;
  /** ما زاد على المسموح (موجبٌ في «over» فقط). */
  excess: number;
}

export function evaluateTeachingLoad(config: TeachingLoadConfig, instructorId: number, hours: number): TeachingLoadStatus {
  const limits = teachingLoadLimits(config, instructorId);
  const total = Math.round(Number(hours || 0) * 100) / 100;
  let state: TeachingLoadState = "unset";
  let excess = 0;
  if (limits.allowed !== null) {
    if (total > limits.allowed) { state = "over"; excess = Math.round((total - limits.allowed) * 100) / 100; }
    else if (limits.min !== null && total < limits.min) state = "under";
    else state = "within";
  }
  return { ...limits, instructorId, hours: total, state, excess };
}

/** «ساعة» / «ساعتان» / «٣ ساعات»: الصيغةُ العربية نفسها لبقية الشاشات، وللكسور «٢٫٥ ساعة». */
export function hoursLabel(value: number): string {
  const n = Math.round(Number(value || 0) * 100) / 100;
  return countOf(n, AR.hour);
}
