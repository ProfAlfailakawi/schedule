/**
 * ── بصيرةُ الرادار: لماذا لم يبلغوا 12؟ وأيُّ شعبةٍ بيانُها ناقص؟ ───────────────────
 *
 * ثقيلةٌ بطبيعتها (تُعيد المحاكاة بقيدٍ مرفوعٍ في كل مرة)، فلا تُحسب مع التحديث التلقائي. تُحسب عند
 * الطلب مرةً لكل بصمة مصدر، وتُحفظ في الذاكرة، ويُدمج الطلبان المتزامنان في حسابٍ واحد.
 * أعدادٌ لا أسماء. والنطاقُ يُطبَّق عند القراءة، لا عند الحساب.
 */
import type { AdTerm } from "../types";
import { auditSimOfferings } from "../utils/registrationSim";
import { emptyCauseTotals, explainShortfalls, type ShortfallCause } from "../utils/registrationCauses";
import { loadSimulationInput } from "./simulationData";

export interface InsightScope { collegeId: number; sectionId: number; students: number; short: number; causes: Record<ShortfallCause, number> }
export interface QualityItem { offeringId: string; code: string; courseId: number; collegeId: number; sectionId: number; issue: string; rowId: number | null }
export interface RadarInsight { fingerprint: string; computedAt: string; scopes: InsightScope[]; quality: QualityItem[]; qualityTruncated: boolean }

/* سقفٌ للذاكرة فحسب؛ التقليلُ إلى ما يُعرض يقع بعد تطبيق نطاق القارئ (في المسار) لا قبله. */
const MAX_QUALITY_ITEMS = 5000;
const memo = new Map<string, { at: number; value: Promise<RadarInsight> }>();
const TTL_MS = 10 * 60_000;

export function radarInsightFor(term: AdTerm, rounds: number): Promise<RadarInsight> {
  const key = String(term.AdTermId);
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = compute(term, rounds).catch(error => { memo.delete(key); throw error; });
  memo.set(key, { at: Date.now(), value });
  return value;
}
export const resetRadarInsight = (): void => memo.clear();

async function compute(term: AdTerm, rounds: number): Promise<RadarInsight> {
  const { input, fingerprint, schedules } = await loadSimulationInput(term, rounds);
  const report = explainShortfalls(input);
  const studentOf = new Map(input.students.map(student => [student.fp, student] as const));
  const scopes = new Map<string, InsightScope>();
  const scopeOf = (collegeId: number, sectionId: number): InsightScope => {
    const key = `${collegeId}:${sectionId}`;
    let scope = scopes.get(key);
    if (!scope) { scope = { collegeId, sectionId, students: 0, short: 0, causes: emptyCauseTotals() }; scopes.set(key, scope); }
    return scope;
  };
  for (const student of input.students) if (student.wishes) scopeOf(student.collegeId, student.sectionId).students += 1;
  for (const [fp, cause] of report.byStudent) {
    const student = studentOf.get(fp);
    if (!student) continue;
    const scope = scopeOf(student.collegeId, student.sectionId);
    scope.short += 1; scope.causes[cause] += 1;
  }

  const audited = auditSimOfferings(input.offerings);
  const byOffering = new Map(input.offerings.map(offering => [offering.id, offering] as const));
  const quality: QualityItem[] = [];
  for (const issue of audited.issues) {
    if (quality.length >= MAX_QUALITY_ITEMS) break;
    const offering = byOffering.get(issue.offeringId);
    if (!offering) continue;
    const row = (schedules as any[]).find(item => Number(item.AdCourseId) === offering.courseId && String(item.SCode ?? "") === offering.code
      && Number(item.AdCollegeId) === offering.collegeId && Number(item.AdSectionId) === offering.sectionId);
    quality.push({ offeringId: offering.id, code: offering.code, courseId: offering.courseId, collegeId: offering.collegeId, sectionId: offering.sectionId, issue: issue.code, rowId: row ? Number(row.id) : null });
  }
  return { fingerprint, computedAt: new Date().toISOString(), scopes: [...scopes.values()], quality, qualityTruncated: audited.issues.length > MAX_QUALITY_ITEMS };
}
