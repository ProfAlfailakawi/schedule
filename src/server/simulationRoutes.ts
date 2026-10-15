/**
 * ── بروفةُ التسجيل: مسارات العاملين ─────────────────────────────────────────
 *
 * التشغيلُ لإدارة النظام (يحسب لكل الطلبة معاً)، والقراءةُ لكل صاحب نطاقٍ بحدود
 * نطاقه: القسمُ يرى مقرراتِه، والعمادةُ والتسجيلُ يرون كلّ شيء. أعدادٌ لا أسماء —
 * الملفُّ لا يحمل اسماً أصلاً — وكلُّ رقمٍ يحمل أساسَه (كم ملفاً، كم منهم بلا رغبات،
 * كم صحيفةً بلا قواعد معتمدة).
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { Repository } from "../db/repository";
import type { AdCourse } from "../types";
import { AR, countOf } from "../utils/arabicCount";
import { pickDoorTerm } from "../utils/termStudentPhases";
import { runRegistrationSimulation } from "./simulationData";

export interface SimulationDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  actorName: (req: any) => string;
}

let running = false;

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
    const rows = (run?.courses || [])
      .filter(row => power || deps.isScopeAllowed(req, row.collegeId, row.sectionId))
      .map(row => {
        const course = catalog.get(row.courseId);
        return { ...row, code: String(course?.CourseCode || ""), name: String(course?.CourseName || `مقرر ${row.courseId}`) };
      });
    res.json({
      term: { id: Number(term.AdTermId), name: String(term.AdTermName || "") },
      canRun: power,
      run: run ? {
        ranAt: run.ranAt, ranBy: run.ranBy, students: run.students, withoutRules: run.withoutRules, defaulted: run.defaulted,
        rounds: run.rounds, windows: run.windows, scoped: !power,
      } : null,
      courses: rows,
    });
  });

  app.post("/api/simulation/run", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isPowerUser(req)) { fail(res, 403, "تشغيل البروفة لإدارة النظام.", "not-allowed"); return; }
    /* العلَمُ يُرفع قبل أيّ انتظار (تشغيلان في العملية نفسها)، ثم القفلُ في قاعدة البيانات
       (نسختان من الخادم). وكلاهما يُفكّ في finally. */
    if (running) { fail(res, 409, "بروفةٌ تعمل الآن. انتظر انتهاءها.", "busy"); return; }
    running = true;
    let lease: { termId: number; holder: string } | null = null;
    try {
      const terms = await Repository.getTerms();
      const term = pickDoorTerm(terms as any);
      if (!term) { fail(res, 409, "لا فصلَ جارياً أو قادماً تُبنى له البروفة.", "no-term"); return; }
      const holder = `${process.pid}-${Date.now()}`;
      if (!(await Repository.acquireRegistrationRunLease(Number(term.AdTermId), holder))) { fail(res, 409, "بروفةٌ تعمل الآن على خادمٍ آخر. انتظر انتهاءها.", "busy"); return; }
      lease = { termId: Number(term.AdTermId), holder };
      const run = await runRegistrationSimulation(term, deps.actorName(req));
      res.locals.auditChanges = `بروفة تسجيل «${term.AdTermName || term.AdTermId}»: ${countOf(run.students, AR.profile)}`;
      res.json({ ok: true, students: run.students, ranAt: run.ranAt });
    } catch (error) {
      console.error("[simulation] run:", error instanceof Error ? error.message : error);
      fail(res, 500, "تعذّر إتمام البروفة. أعد المحاولة بعد قليل.");
    } finally {
      running = false;
      if (lease) await Repository.releaseRegistrationRunLease(lease.termId, lease.holder).catch(() => undefined);
    }
  });
}
