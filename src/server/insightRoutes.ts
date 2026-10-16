/**
 * ── أثرُ المقرر، وذاكرةُ الموعد ──────────────────────────────────────────────────
 *
 * قراءةٌ فقط، بحدود النطاق. لا شيءٌ جديدٌ يُخزَّن: الأثرُ يُركَّب مما في الرادار وقواعد الصحائف،
 * و«لماذا؟» مما كُتب أصلاً في الصف (`origin`) وفي سجلّ التدقيق. أعدادٌ وأسماءُ مقررات لا أسماءُ طلبة.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { Repository } from "../db/repository";
import type { AdCourse } from "../types";
import { pickDoorTerm } from "../utils/termStudentPhases";

export interface InsightDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
}

export function registerInsightRoutes(app: Express, deps: InsightDeps): void {
  const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
  const allowed = (req: Request, collegeId: number, sectionId: number) => deps.isPowerUser(req) || deps.isScopeAllowed(req, collegeId, sectionId);

  /* ── ماذا يتأثر لو تغيّر هذا المقرر؟ ── */
  app.get("/api/impact/course", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const courseId = Number(req.query.courseId);
    const course = courseId ? await Repository.getCourseById(courseId) : undefined;
    if (!course) { fail(res, 404, "المقرر غير موجود."); return; }
    if (!allowed(req, Number(course.AdCollegeId), Number(course.AdSectionId))) { fail(res, 403, "خارج نطاق صلاحياتك."); return; }
    const sectionId = Number(course.AdSectionId);
    const [plans, links, catalog, term] = await Promise.all([
      Repository.getCurriculumPlans(sectionId), Repository.getCurriculumPlanCourses(sectionId), Repository.getCourses(), Repository.getTerms(),
    ]);
    const nameOf = new Map((catalog as AdCourse[]).map(row => [Number(row.AdCourseId), { name: String(row.CourseName || ""), code: String(row.CourseCode || "") }] as const));
    const live = plans.filter(plan => !plan.virtual && plan.status !== "archived");
    const carrying = live.filter(plan => links.some(link => link.planId === plan.id && Number(link.AdCourseId) === courseId));

    const prereqs = new Map<number, string>(), dependents = new Map<number, { name: string; plans: string[] }>();
    for (const plan of carrying) {
      const set = await Repository.getRuleSet(plan.id);
      for (const rule of set?.rules || []) {
        const needs = [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf || []).flat(), ...(rule.coreq || [])];
        if (rule.courseId === courseId) for (const id of needs) prereqs.set(id, nameOf.get(id)?.name || `مقرر ${id}`);
        else if (needs.includes(courseId)) {
          const entry = dependents.get(rule.courseId) || { name: nameOf.get(rule.courseId)?.name || `مقرر ${rule.courseId}`, plans: [] };
          if (!entry.plans.includes(plan.name)) entry.plans.push(plan.name);
          dependents.set(rule.courseId, entry);
        }
      }
    }
    const run = (term as any[]).length ? await Repository.getRegistrationRun(Number(pickDoorTerm(term as any)?.AdTermId || 0)) : undefined;
    const row = run?.courses.find(item => item.courseId === courseId);
    res.json({
      course: { id: courseId, code: String(course.CourseCode || ""), name: String(course.CourseName || ""), credit: Number(course.CourseCredit) || 0 },
      plans: carrying.map(plan => ({ id: plan.id, name: plan.name, status: plan.status })),
      prereqs: [...prereqs].map(([id, name]) => ({ id, name })),
      dependents: [...dependents].map(([id, value]) => ({ id, name: value.name, plans: value.plans })),
      demand: row ? { wanted: row.wanted, seated: row.seated, sections: row.sections, capacity: row.capacity, taken: row.taken, unmet: row.unmet } : null,
    });
  });

  /* ── لماذا هذا الموعد هنا؟ ── */
  app.get("/api/schedules/:id/history", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const id = Number(req.params.id);
    const row = id ? await Repository.getScheduleById(id) : undefined;
    if (!row) { fail(res, 404, "الموعد غير موجود."); return; }
    if (!allowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))) { fail(res, 403, "خارج نطاق صلاحياتك."); return; }
    const logs = await Repository.getAuditLogs(1500);
    const mine = logs.filter(log => log.status < 400 && ((log.entity === "schedules" && log.entityId === String(id)) || (Array.isArray(log.rowIds) && log.rowIds.includes(id))));
    res.json({
      origin: row.origin || null,
      events: mine.slice(0, 12).map(log => ({ at: log.timestamp, who: log.userName, action: log.action, what: log.changes || "" })),
      truncated: mine.length > 12,
    });
  });
}
