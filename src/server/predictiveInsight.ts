/**
 * ── الذكاء التنبّؤي: من قاعدة البيانات إلى المحرّك ───────────────────────────
 *
 * المحرّكُ نقيٌّ (`utils/predictiveIntelligence.ts`). هنا يُجمَع ما يحتاجه **بحدود نطاق القارئ**:
 * شعبُ كل الفصول لأقسامه، وإحصاءُ التسجيل لآخر ستة فصولٍ سابقة، ورغباتُ الرادار الحيّة، وملفّاتُ
 * طلبة أقسامه. النطاقُ يُطبَّق **قبل** الحساب لا بعده: القسمُ لا يتأثر تنبّؤُه بأرقام قسمٍ آخر.
 * قراءةٌ فقط — لا يكتب شيئاً. أعدادٌ لا أسماء، ولا يخرج من هنا معرّفُ طالبٍ ولا قائمةُ طلبة.
 */
import { Repository } from "../db/repository";
import type { AdTerm, RegistrationRun } from "../types";
import { readPredictive, type PredictiveInput, type PredictiveReading, type PredStats } from "../utils/predictiveIntelligence";
import { termChronology } from "../utils/termSequence";
import type { loadSimulationInput } from "./simulationData";

/** كم فصلاً سابقاً يُقرأ له إحصاءُ التسجيل (قراءةٌ لكل قسمٍ × فصل). */
const STATS_TERMS = 6;

export type PredictiveClientReading = Omit<PredictiveReading, "graduation"> & {
  graduation: Omit<PredictiveReading["graduation"], "students">;
};

export async function predictiveReadingFor(args: {
  term: AdTerm;
  run: RegistrationRun | null | undefined;
  loaded: Awaited<ReturnType<typeof loadSimulationInput>>;
  allowed: (collegeId: number, sectionId: number) => boolean;
}): Promise<PredictiveClientReading> {
  const { term, run, loaded, allowed } = args;
  const termId = Number(term.AdTermId);
  const [terms, allRows] = await Promise.all([Repository.getTerms(), Repository.getSchedules()]);
  const rows = allRows.filter(row => allowed(Number(row.AdCollegeId), Number(row.AdSectionId)));

  /* الأقسامُ التي يقرؤها هذا القارئ فعلاً (لها شعبٌ في أي فصل) — منها تُقرأ الإحصاءات. */
  const scopes = [...new Map(rows.map(row => [`${row.AdCollegeId}:${row.AdSectionId}`, { collegeId: Number(row.AdCollegeId), sectionId: Number(row.AdSectionId) }] as const)).values()];
  const targetOrder = termChronology(terms.find(item => Number(item.AdTermId) === termId));
  const recent = [...terms]
    .filter(item => Number(item.AdTermId) !== termId && termChronology(item) < targetOrder)
    .sort((a, b) => termChronology(b) - termChronology(a)).slice(0, STATS_TERMS);

  const stats: PredStats[] = [];
  for (const past of recent) {
    const remaining: Record<string, number> = {}, vacant: Record<string, number> = {};
    let any = false;
    for (const scope of scopes) {
      const stat = await Repository.getRegistrationStats(scope.collegeId, scope.sectionId, Number(past.AdTermId)).catch(() => null);
      /* العمودُ القديم («seats») لا يُخلط به، كما في الإنذار المبكر. */
      if (!stat?.remaining || stat.remainingSource?.column !== "unregistered") continue;
      Object.assign(remaining, stat.remaining); Object.assign(vacant, stat.vacant || {}); any = true;
    }
    if (any) stats.push({ termId: Number(past.AdTermId), remaining, vacant });
  }

  const liveWanted: Record<string, number> = {};
  for (const course of run?.courses || []) {
    if (!allowed(course.collegeId, course.sectionId) || !(Number(course.wanted) > 0)) continue;
    liveWanted[String(course.courseId)] = (liveWanted[String(course.courseId)] || 0) + Number(course.wanted);
  }

  const courses = [...loaded.courses.values()].filter(course => allowed(Number(course.AdCollegeId), Number(course.AdSectionId)));
  const input: PredictiveInput = {
    target: { termId, name: String(term.AdTermName || "") },
    terms: terms as any, rows, courses, stats, liveWanted,
    students: loaded.input.students.filter(student => allowed(Number(student.collegeId || 0), Number(student.sectionId || 0))),
    plans: loaded.input.plans, credit: loaded.input.credit,
  };
  const reading = readPredictive(input);
  /* لا قائمةَ طلبةٍ تخرج من الخادم: التوزيعُ والأسبابُ أعدادٌ فقط. */
  const { students: _omitted, ...graduation } = reading.graduation;
  void _omitted;
  return { ...reading, demand: reading.demand.slice(0, 400), graduation };
}
