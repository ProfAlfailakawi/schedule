/**
 * ── رادارُ التسجيل: مسارات العاملين ─────────────────────────────────────────
 *
 * التشغيلُ لإدارة النظام (يحسب لكل الطلبة معاً)، والقراءةُ لكل صاحب نطاقٍ بحدود
 * نطاقه: القسمُ يرى مقرراتِه، والعمادةُ والتسجيلُ يرون كلّ شيء. أعدادٌ لا أسماء —
 * الملفُّ لا يحمل اسماً أصلاً — وكلُّ رقمٍ يحمل أساسَه (كم ملفاً، كم منهم بلا رغبات،
 * كم صحيفةً بلا قواعد معتمدة).
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { Repository } from "../db/repository";
import type { AdCourse, RegistrationOutcomeShard } from "../types";
import { createTtlMemo } from "./notificationCache";
import { AR, countOf } from "../utils/arabicCount";
import { pickDoorTerm, readStudentPhase } from "../utils/termStudentPhases";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { runRegistrationSimulation } from "./simulationData";

export interface SimulationDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  actorName: (req: any) => string;
}

let running = false;
const outcomeMemo = createTtlMemo<RegistrationOutcomeShard[]>({ ttlMs: 30_000 });

export function registerSimulationRoutes(app: Express, deps: SimulationDeps): void {
  const fail = (res: Response, status: number, error: string, code?: string) => res.status(status).json({ error, ...(code ? { code } : {}) });

  app.get("/api/simulation/summary", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ term: null, run: null, canRun: deps.isPowerUser(req) }); return; }
    const run = await Repository.getRegistrationRun(Number(term.AdTermId));
    const catalog = new Map(((await Repository.getCourses()) as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const power = deps.isPowerUser(req);
    const inScope = (rows: NonNullable<typeof run>["courses"] | undefined) => (rows || [])
      .filter(row => power || deps.isScopeAllowed(req, row.collegeId, row.sectionId))
      .map(row => {
        const course = catalog.get(row.courseId);
        return { ...row, code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${row.courseId}`) };
      });
    const visible = power ? null : (run?.scopes || []).filter(scope => deps.isScopeAllowed(req, scope.collegeId, scope.sectionId));
    const bands = () => ({ canReach15: 0, canReach12To14: 0, below12: 0, graduatingBelow12: 0, unknown: 0 });
    const scoped = { students: 0, population: 0, withoutRules: 0, defaulted: 0, windows: Array.from({ length: run?.rounds || 1 }, () => 0), capacity: bands(), projected: { students: 0, capacity: bands() }, dataQuality: { total: 0, ready: 0, excluded: 0, issues: {} as Record<string, number> } };
    for (const scope of visible || []) {
      for (const key of ["students", "population", "withoutRules", "defaulted"] as const) scoped[key] += scope[key];
      scope.windows.forEach((count, index) => { scoped.windows[index] = (scoped.windows[index] || 0) + count; });
      for (const key of Object.keys(scoped.capacity) as Array<keyof typeof scoped.capacity>) {
        scoped.capacity[key] += scope.capacity[key]; scoped.projected.capacity[key] += scope.projected.capacity[key];
      }
      scoped.projected.students += scope.projected.students;
      for (const key of ["total", "ready", "excluded"] as const) scoped.dataQuality[key] += scope.dataQuality[key];
      for (const [key, count] of Object.entries(scope.dataQuality.issues)) scoped.dataQuality.issues[key] = (scoped.dataQuality.issues[key] || 0) + count;
    }
    res.json({
      term: { id: Number(term.AdTermId), name: String(term.AdTermName || "") },
      canRun: power,
      auto: radarAutoSettings(),
      phase: (() => { const reading = readStudentPhase(term.AdTermStudentPhases); return { mode: reading.mode, label: reading.label, line: reading.line, namesVisible: reading.namesVisible }; })(),
      run: run ? {
        ranAt: run.ranAt, ranBy: run.ranBy, students: power ? run.students : scoped.students, withoutRules: power ? run.withoutRules : scoped.withoutRules, defaulted: power ? run.defaulted : scoped.defaulted,
        population: power ? (run.population ?? run.students + run.defaulted) : scoped.population,
        capacity: power ? (run.capacity || null) : (run.scopes ? scoped.capacity : null),
        projected: power ? (run.projected ? { students: run.projected.students, capacity: run.projected.capacity } : null) : (run.scopes ? scoped.projected : null),
        dataQuality: power ? (run.dataQuality || null) : (run.scopes ? scoped.dataQuality : null),
        stale: Boolean(run.stale || (!power && !run.scopes)), staleAt: run.staleAt || null,
        sourceFingerprint: run.sourceFingerprint || null,
        rounds: run.rounds, windows: power ? run.windows : scoped.windows, scoped: !power,
      } : null,
      courses: inScope(run?.courses),
      projectedCourses: inScope(run?.projected?.courses),
    });
  });

  /* ما قاله الطلبةُ بعد التسجيل («هل سجلت؟»): أعدادٌ لكل مقرر، بحدود النطاق. */
  app.get("/api/simulation/outcome", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const terms = await Repository.getTerms();
    const term = pickDoorTerm(terms as any);
    if (!term) { res.json({ term: null, answered: 0, courses: [] }); return; }
    const termId = Number(term.AdTermId);
    const shards = await outcomeMemo.get(String(termId), () => Repository.getRegistrationOutcome(termId));
    const merged = new Map<number, { registered: number; stuck: number; full: number; prereq: number; conflict: number; other: number }>();
    let answered = 0;
    for (const shard of shards) {
      answered += Number(shard.students) || 0;
      for (const [id, row] of Object.entries(shard.byCourse || {})) {
        const sum = merged.get(Number(id)) || { registered: 0, stuck: 0, full: 0, prereq: 0, conflict: 0, other: 0 };
        for (const key of Object.keys(sum) as Array<keyof typeof sum>) sum[key] += Number(row[key]) || 0;
        merged.set(Number(id), sum);
      }
    }
    const power = deps.isPowerUser(req);
    const catalog = new Map(((await Repository.getCourses()) as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    const courses = [...merged].flatMap(([courseId, row]) => {
      const course = catalog.get(courseId);
      if (!course || (!power && !deps.isScopeAllowed(req, Number(course.AdCollegeId), Number(course.AdSectionId)))) return [];
      return [{ courseId, code: String(course.CourseCode || ""), name: String(course.CourseName || ""), ...row }];
    }).sort((a, b) => b.stuck - a.stuck || a.code.localeCompare(b.code, "en"));
    /* عددُ المجيبين الكلّيُّ لا يُقال لمن يرى مقرراتِه وحدها: طلبةٌ أجابوا عن أقسامٍ أخرى لا يصفون نتائجَه.
       يُقال له عددُ الأجوبة عن مقرراتِه (جوابٌ لكل مقرر). */
    const answers = courses.reduce((sum, c) => sum + c.registered + c.stuck, 0);
    res.json({ term: { id: termId, name: String(term.AdTermName || "") }, answered: power ? answered : null, answers, scoped: !power, courses });
  });

  app.post("/api/simulation/run", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isPowerUser(req)) { fail(res, 403, "تحديث الرادار لإدارة النظام.", "not-allowed"); return; }
    /* العلَمُ يُرفع قبل أيّ انتظار (تشغيلان في العملية نفسها)، ثم القفلُ في قاعدة البيانات
       (نسختان من الخادم). وكلاهما يُفكّ في finally. */
    if (running) { fail(res, 409, "الرادار يُحدَّث الآن. انتظر انتهاءه.", "busy"); return; }
    running = true;
    let lease: { termId: number; holder: string } | null = null;
    try {
      const terms = await Repository.getTerms();
      const term = pickDoorTerm(terms as any);
      if (!term) { fail(res, 409, "لا فصلَ جارياً أو قادماً يُبنى له الرادار.", "no-term"); return; }
      const holder = `${process.pid}-${Date.now()}`;
      if (!(await Repository.acquireRegistrationRunLease(Number(term.AdTermId), holder))) { fail(res, 409, "الرادار يُحدَّث الآن على خادمٍ آخر. انتظر انتهاءه.", "busy"); return; }
      lease = { termId: Number(term.AdTermId), holder };
      const run = await runRegistrationSimulation(term, deps.actorName(req));
      res.locals.auditChanges = `رادار تسجيل «${term.AdTermName || term.AdTermId}»: ${countOf(run.students, AR.profile)}`;
      res.json({ ok: true, students: run.students, ranAt: run.ranAt });
    } catch (error) {
      console.error("[simulation] run:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر تحديث الرادار. أعد المحاولة بعد قليل.");
    } finally {
      running = false;
      if (lease) await Repository.releaseRegistrationRunLease(lease.termId, lease.holder).catch(() => undefined);
    }
  });
}

/**
 * ما يخصّ الجرسَ من الرادار وأجوبة «هل سجلت؟»: عددٌ واحدٌ لكل منهما بحدود نطاق الحساب.
 * يقرأ الملخّصَ المحفوظ والعدّاداتِ المشاظِرة فقط — لا يحسب شيئاً ولا يقرأ ملفّات الطلبة.
 */
export async function radarNoticeFor(req: any, deps: Pick<SimulationDeps, "isScopeAllowed" | "isPowerUser">): Promise<{ radar: { ranAt: string; needsDecision: number; scoped: boolean } | null; outcome: { answered: number; stuck: number; scoped: boolean } | null; termId: number; termName: string }> {
  const none = { radar: null, outcome: null, termId: 0, termName: "" };
  const term = pickDoorTerm((await Repository.getTerms()) as any);
  if (!term) return none;
  const termId = Number(term.AdTermId), power = deps.isPowerUser(req);
  const [run, shards] = await Promise.all([Repository.getRegistrationRun(termId), outcomeMemo.get(String(termId), () => Repository.getRegistrationOutcome(termId))]);
  const mine = (collegeId: number, sectionId: number) => power || deps.isScopeAllowed(req, collegeId, sectionId);
  const radar = run ? {
    ranAt: run.ranAt, scoped: !power,
    needsDecision: run.courses.filter(row => mine(row.collegeId, row.sectionId) && (row.unmet.full > 0 || row.unmet["not-offered"] > 0)).length,
  } : null;
  let outcome: { answered: number; stuck: number; scoped: boolean } | null = null;
  const answered = shards.reduce((sum, shard) => sum + (Number(shard.students) || 0), 0);
  if (answered > 0) {
    const catalog = new Map(((await Repository.getCourses()) as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
    let stuck = 0, answers = 0;
    for (const shard of shards) for (const [id, row] of Object.entries(shard.byCourse || {})) {
      const course = catalog.get(Number(id));
      if (course && mine(Number(course.AdCollegeId), Number(course.AdSectionId))) { stuck += Number(row.stuck) || 0; answers += (Number(row.stuck) || 0) + (Number(row.registered) || 0); }
    }
    outcome = { answered: power ? answered : answers, stuck, scoped: !power };
  }
  return { radar, outcome, termId, termName: String(term.AdTermName || "") };
}

/* ── التشغيل التلقائي ──────────────────────────────────────────────────────────
 * لا يحتاج أحدٌ أن يضغط كلَّ مرة: يُحدَّث الرادارُ وحدَه مرةً كل ٢٤ ساعة (RADAR_AUTO_HOURS) ما دامت
 * رغباتُ الطلبة مفتوحةً أو بعدها (حتى إغلاق الطلبات)، ومرةً أخيرةً بعد إغلاق الرغبات مباشرةً كي
 * تُبنى التذاكرُ على الرغبات النهائية. وزرُّ «حدّث الرادار» يبقى لمن يريده الآن. التحديثُ يقرأ ملفّاتِ
 * الطلبة كلَّها (قراءةً لكل ملف)، فلا يُجعل أقصرَ من ذلك بلا حاجة. RADAR_AUTO=false يُوقفه. */
export const RADAR_RUN_MODES = new Set(["wishes", "frozen", "report"]);

export function radarDue(input: { mode: string; wishesClose?: string; today: string; ranAt?: string; now: number; everyMs: number }): boolean {
  if (!RADAR_RUN_MODES.has(input.mode)) return false;
  if (!input.ranAt) return true;
  const ranMs = Date.parse(input.ranAt);
  if (!Number.isFinite(ranMs)) return true;
  /* أُغلقت الرغباتُ بعد آخر تحديث: تحديثٌ أخيرٌ بالرغبات النهائية. */
  if (input.wishesClose && input.today > input.wishesClose && kuwaitDateISO(new Date(ranMs)) <= input.wishesClose) return true;
  return input.now - ranMs >= input.everyMs;
}

export function radarAutoSettings(): { enabled: boolean; everyHours: number } {
  const hours = Number(process.env.RADAR_AUTO_HOURS);
  return { enabled: String(process.env.RADAR_AUTO ?? "").trim().toLowerCase() !== "false", everyHours: Number.isFinite(hours) && hours >= 1 ? Math.floor(hours) : 24 };
}

export function scheduleRadarAutoRun(log: (message: string) => void = console.log): void {
  const { enabled, everyHours } = radarAutoSettings();
  if (!enabled) return;
  const tick = async () => {
    if (running || Repository.isDemoMode()) return;
    running = true;
    let lease: { termId: number; holder: string } | null = null;
    try {
      const term = pickDoorTerm((await Repository.getTerms()) as any);
      if (!term) return;
      const reading = readStudentPhase(term.AdTermStudentPhases);
      const run = await Repository.getRegistrationRun(Number(term.AdTermId));
      if (!radarDue({ mode: reading.mode, wishesClose: term.AdTermStudentPhases?.wishesClose, today: kuwaitDateISO(), ranAt: run?.ranAt, now: Date.now(), everyMs: everyHours * 3_600_000 })) return;
      const holder = `auto-${process.pid}-${Date.now()}`;
      if (!(await Repository.acquireRegistrationRunLease(Number(term.AdTermId), holder))) return; // خادمٌ آخر يعمل
      lease = { termId: Number(term.AdTermId), holder };
      const done = await runRegistrationSimulation(term, "تلقائي");
      log(`[radar] تحديثٌ تلقائي: ${countOf(done.students, AR.profile)}`);
    } catch (error) {
      console.error("[radar] auto:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
      if (lease) await Repository.releaseRegistrationRunLease(lease.termId, lease.holder).catch(() => undefined);
    }
  };
  setTimeout(() => void tick(), 2 * 60_000).unref();
  setInterval(() => void tick(), 60 * 60_000).unref();
}
