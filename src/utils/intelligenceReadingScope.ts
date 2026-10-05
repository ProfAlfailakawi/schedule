import { compareTerms } from "./scheduleIntelligence";
import type { FSchedule } from "../types";

export interface IntelligenceScope { collegeId: number; sectionId: number; collegeName?: string }
export interface ScopedReading { scope: IntelligenceScope; data: any }
export const sameIntelligenceScope = (a: IntelligenceScope, b: IntelligenceScope) =>
  Number(a.collegeId) === Number(b.collegeId) && Number(a.sectionId) === Number(b.sectionId);
export const rowsForIntelligenceScope = (rows: FSchedule[], scope: IntelligenceScope) =>
  rows.filter(row => Number(row.AdCollegeId) === Number(scope.collegeId) && Number(row.AdSectionId) === Number(scope.sectionId));
export const tagReading = (value: any, scope: IntelligenceScope) => ({ ...value, readingScope: scope });
const list = (value: any): any[] => Array.isArray(value) ? value : [];
const sum = (readings: ScopedReading[], field: string) => readings.reduce((total, item) => total + Number(item.data?.[field] || 0), 0);
export const scopedReadingList = (readings: ScopedReading[], field?: string) => readings.flatMap(item =>
  list(field ? item.data?.[field] : item.data).map(value => tagReading(value, item.scope)));

export function mergeDemandReadings(readings: ScopedReading[]) {
  if (readings.length === 1) return { ...readings[0].data, byCollege: readings };
  const respondents = sum(readings, "respondents");
  const nested = (field: string, key: string) => readings.flatMap(item => list(item.data?.[field]?.[key]).map(value => tagReading(value, item.scope)));
  const courses = scopedReadingList(readings, "courses").map(course => ({ ...course, share: respondents ? Math.round(Number(course.students || 0) / respondents * 100) : 0 }));
  return {
    ...readings[0]?.data, cohort: "mixed", cohortLabel: "طلبة القسم عبر كلياته", byCollege: readings,
    respondents, totalRespondents: sum(readings, "totalRespondents"), totalCases: sum(readings, "totalCases"),
    courses: courses.sort((a, b) => Number(b.students) - Number(a.students)),
    cases: scopedReadingList(readings, "cases"), survey: scopedReadingList(readings, "survey"),
    pairs: scopedReadingList(readings, "pairs"), repairs: scopedReadingList(readings, "repairs"), unsolved: scopedReadingList(readings, "unsolved"),
    openings: { proposals: nested("openings", "proposals"), noCeiling: nested("openings", "noCeiling"), headline: "اقتراحات الشعب بحسب كلية كل مقرر" },
    prediction: { courses: readings.flatMap(item => list(item.data?.prediction?.courses).map(value => tagReading({...value, predictionFrom: Number(item.data?.prediction?.from || 0)}, item.scope))), pairs: nested("prediction", "pairs"), from: readings.reduce((total, item) => total + Number(item.data?.prediction?.from || 0), 0), headline: "توقعات مستقلة لكل كلية من تاريخها" },
    succession: { links: nested("succession", "links"), pathsSeen: readings.reduce((total, item) => total + Number(item.data?.succession?.pathsSeen || 0), 0), headline: "مسارات المقررات بحسب كلية كل مسار" },
    turnover: { total: readings.reduce((total, item) => total + Number(item.data?.turnover?.total || 0), 0), headline: "قراءة الطلبة الجدد والعائدين بحسب كلياتهم" },
  };
}
export function mergeOperationsReadings(readings: ScopedReading[]) {
  const known = readings.filter(item => item.data?.accuracy?.available);
  const counts = (field: string) => known.reduce((total, item) => total + Number(item.data.accuracy[field] || 0), 0);
  const unchanged = counts("unchanged"), changed = counts("changed");
  return { byCollege: readings,
    anomalies: scopedReadingList(readings, "anomalies"), unwrittenRules: scopedReadingList(readings, "unwrittenRules"),
    accuracy: { available: known.length > 0, complete: known.length === readings.length, unchanged, changed, added: counts("added"), removed: counts("removed"), accuracy: known.length ? (unchanged + changed ? Math.round(unchanged / (unchanged + changed) * 100) : 100) : null, postmortem: known.flatMap(item => list(item.data.accuracy.postmortem).map(line => `${item.scope.collegeName || ""}: ${line}`)) },
  };
}
export function mergeDecisionReadings(readings: ScopedReading[]) {
  const manual = scopedReadingList(readings, "manual");
  const inferred = scopedReadingList(readings, "inferred").map(item => ({ ...item, id: `${item.id}:${item.readingScope.collegeId}:${item.readingScope.sectionId}` }));
  return { manual, inferred, totalOpen: manual.filter(item => item.status === "open").length + inferred.length };
}
export function compareIntelligenceTerms(from: FSchedule[], to: FSchedule[], scopes: IntelligenceScope[]) {
  const perCollege = scopes.map(scope => ({ scope, diff: compareTerms(rowsForIntelligenceScope(from, scope), rowsForIntelligenceScope(to, scope)) }));
  return { ...compareTerms(from, to),
    added: perCollege.reduce((total, item) => total + item.diff.added, 0), removed: perCollege.reduce((total, item) => total + item.diff.removed, 0),
    appeared: perCollege.flatMap(item => item.diff.appeared), disappeared: perCollege.flatMap(item => item.diff.disappeared), moved: perCollege.flatMap(item => item.diff.moved),
    perCollege,
  };
}
