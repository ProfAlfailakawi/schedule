/**
 * ── مراجعةُ الصحيفة: القسمُ يراجع صحيفتَه، ورئيسُ اللجنة يعتمدها ────────────────
 *
 * البياناتُ الأكاديمية حساسة: لا يدخل القسمُ عليها. فللصحيفة **مسوّدةٌ** (مقرراتُها
 * ومستوياتُها وما يسبق ماذا) تُعرض على القسم وحده، يصحّح فيها ما لقسمه، ثم يعتمدها
 * رئيسُ لجنة الجدول بضغطةٍ. لا شيءٌ يصل المحرّكَ ولا الطالبَ قبل الاعتماد.
 *
 * حدودٌ لا تُكسر:
 *   · القسمُ يعدّل **قواعدَ مقرراتِه فقط** (المستوى، النوع، المسبق، المقرن). مقررُ قسمٍ
 *     آخر يظهر في الخريطة مقفولاً، ويُشار إليه مسبقاً أو يُضاف إلى مجموعةٍ اختيارية
 *     فحسب. والحارسُ هنا في الخادم لا في الواجهة وحدها.
 *   · الاعتمادُ لرئيس لجنة الجدول (وإدارة النظام)، ويرفضه الخادمُ إن بقي مانعٌ
 *     في القواعد (دورة، مجموعةٌ لا تتّسع لحدّها…)، أو تغيّرت المسوّدةُ بعد أن رآها.
 *   · كلُّ تعديلٍ في سجلّ التدقيق.
 */
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../data/technologyEducationCurricula";
import { compareCurriculumReference, isTechnologyEducation, referenceCodeKey } from "../utils/curriculumReference";
import { AR, countOf } from "../utils/arabicCount";
import type { Express, Request, RequestHandler, Response } from "express";
import { RuleDraftConflict, Repository } from "../db/repository";
import type { AdCourse, CurriculumRuleSet } from "../types";
import { roleDefinition } from "../utils/academicRoles";
import {
  checkRuleSet, normalizeGroup, normalizeRule, normalizeRules, withDerivedGroups, type RuleIssue,
} from "../utils/curriculumRules";
import { rowsToDrafts, type ImportPlan, type RuleImportRow } from "../utils/curriculumRulesImport";

export interface PlanReviewDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  hasPermission: (req: any, formId: number) => boolean;
  actorName: (req: any) => string;
}

type Plan = { id: string; AdCollegeId: number; AdSectionId: number; name: string; status: string };
interface CourseInfo { id: number; code: string; name: string; credit: number; collegeId: number; sectionId: number }
interface Context {
  plan: Plan;
  courseIds: number[];
  catalog: Map<number, CourseInfo>;
  sectionName: string;
}

const READERS = new Set(["committeeChair", "departmentHead", "standard"]);
const WORKSPACE_FORM = 7;

/** صحائفُ قيد المراجعة التي يراها هذا الحساب: لجرس الإشعارات. نفسُ حارس النطاق والصفة في الشاشة. */
export async function pendingPlanReviews(req: any, deps: Pick<PlanReviewDeps, "isScopeAllowed" | "isPowerUser">): Promise<Array<{ planId: string; planName: string; sectionId: number; collegeId: number; sectionName: string; updatedAt: string }>> {
  const role = roleDefinition(req.user?.Role).id;
  const drafts = (await Repository.listRuleDrafts()).filter(draft => draft.status === "review");
  const visible = drafts.filter(draft => deps.isPowerUser(req) || (READERS.has(role) && deps.isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)));
  if (!visible.length) return [];
  const sections = new Map<number, string>((await Repository.getSections() as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
  const out = [];
  for (const draft of visible) {
    const plan = (await Repository.getCurriculumPlans(draft.AdSectionId)).find(row => row.id === draft.planId);
    out.push({ planId: draft.planId, planName: plan?.name || "الصحيفة", sectionId: draft.AdSectionId, collegeId: draft.AdCollegeId, sectionName: sections.get(draft.AdSectionId) || "", updatedAt: draft.updatedAt });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function registerPlanReviewRoutes(app: Express, deps: PlanReviewDeps): void {
  const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
  const roleId = (req: any): string => roleDefinition(req.user?.Role).id;

  /** من يرى الصحيفة: صاحبُ نطاقها بصفةٍ تفتح الشاشة، أو إدارةُ النظام. */
  const canSee = (req: any, plan: Plan) =>
    deps.isPowerUser(req) || (READERS.has(roleId(req)) && deps.isScopeAllowed(req, plan.AdCollegeId, plan.AdSectionId));
  /** من يعدّل: من يبني الجدول (لا قارئٌ صِرف) في نطاقها. */
  const canEdit = (req: any, plan: Plan) =>
    deps.isPowerUser(req) || (canSee(req, plan) && !roleDefinition(req.user?.Role).readOnly && deps.hasPermission(req, WORKSPACE_FORM));
  /** من يعتمد: رئيسُ لجنة الجدول وحده (وإدارةُ النظام). */
  const canApprove = (req: any, plan: Plan) => deps.isPowerUser(req) || (roleId(req) === "committeeChair" && canEdit(req, plan));
  const ownsCourse = (req: any, course: CourseInfo) => deps.isPowerUser(req) || deps.isScopeAllowed(req, course.collegeId, course.sectionId);

  async function context(planId: string, sectionId: number): Promise<Context | null> {
    if (!planId || !sectionId) return null;
    const [plans, links, courses, sections] = await Promise.all([
      Repository.getCurriculumPlans(sectionId), Repository.getCurriculumPlanCourses(sectionId), Repository.getCourses(), Repository.getSections(),
    ]);
    const plan = plans.find(row => row.id === planId && Number(row.AdSectionId) === sectionId);
    if (!plan) return null;
    const catalog = new Map<number, CourseInfo>();
    for (const course of courses as AdCourse[]) {
      catalog.set(Number(course.AdCourseId), {
        id: Number(course.AdCourseId), code: String(course.CourseCode || ""), name: String(course.CourseName || ""),
        credit: Number(course.CourseCredit) || 0, collegeId: Number(course.AdCollegeId), sectionId: Number(course.AdSectionId),
      });
    }
    return {
      plan: { id: plan.id, AdCollegeId: Number(plan.AdCollegeId), AdSectionId: Number(plan.AdSectionId), name: plan.name, status: plan.status },
      courseIds: [...new Set(links.filter(link => link.planId === planId).map(link => Number(link.AdCourseId)))],
      catalog,
      sectionName: String((sections as any[]).find(row => Number(row.AdSectionId) === sectionId)?.AdSectionName || ""),
    };
  }

  const issuesOf = (ctx: Context, set: Pick<CurriculumRuleSet, "rules" | "groups">): RuleIssue[] =>
    checkRuleSet(set, {
      planCourseIds: ctx.courseIds, knownCourseIds: new Set(ctx.catalog.keys()),
      credit: new Map([...ctx.catalog].map(([id, course]) => [id, course.credit])),
      name: id => ctx.catalog.get(id)?.name || `مقرر ${id}`,
    });

  const blank = (ctx: Context, by: string, live?: CurriculumRuleSet): CurriculumRuleSet => ({
    id: ctx.plan.id, planId: ctx.plan.id, AdCollegeId: ctx.plan.AdCollegeId, AdSectionId: ctx.plan.AdSectionId,
    rules: live?.rules || [], groups: live?.groups || [], version: live?.version || 0, status: "review",
    basedOnVersion: live?.version || 0, updatedAt: new Date().toISOString(), updatedBy: by,
  });

  /** ما تراه الواجهة: المسوّدةُ (أو المعتمدة إن لم تكن) مع ملكيّة كل مقرر. */
  async function view(req: any, ctx: Context) {
    const [draft, live] = await Promise.all([Repository.getRuleDraft(ctx.plan.id), Repository.getRuleSet(ctx.plan.id)]);
    const shown = draft || (live ? { ...live, status: "approved" as const } : blank(ctx, ""));
    const sections = new Map<number, string>((await Repository.getSections() as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
    const issues = issuesOf(ctx, shown);
    return {
      plan: { id: ctx.plan.id, name: ctx.plan.name, status: ctx.plan.status, sectionId: ctx.plan.AdSectionId, sectionName: ctx.sectionName },
      courses: ctx.courseIds.map(id => {
        const course = ctx.catalog.get(id) || { id, code: "", name: `مقرر ${id}`, credit: 0, collegeId: 0, sectionId: 0 };
        return { id, code: course.code, name: course.name, credit: course.credit, ownerSectionId: course.sectionId, ownerSectionName: sections.get(course.sectionId) || "", owned: ownsCourse(req, course) };
      }),
      /* مقرراتٌ يشير إليها مسبقٌ أو مقرن ولا تقع في الصحيفة: تُعرض أسماؤها لا غير. */
      referenced: [...new Set(shown.rules.flatMap(rule => [...(rule.prereq?.all || []), ...(rule.prereq?.anyOf || []).flat(), ...(rule.coreq || [])]))]
        .filter(id => !ctx.courseIds.includes(id)).map(id => ({ id, code: ctx.catalog.get(id)?.code || "", name: ctx.catalog.get(id)?.name || `مقرر ${id}`, credit: ctx.catalog.get(id)?.credit || 0 })),
      rules: shown.rules, groups: shown.groups,
      state: { status: shown.status || "approved", version: shown.version || 0, basedOnVersion: shown.basedOnVersion ?? null, updatedAt: shown.updatedAt, updatedBy: shown.updatedBy || "", approvedAt: shown.approvedAt || "", approvedBy: shown.approvedBy || "", live: live ? { version: live.version, approvedAt: live.approvedAt || "" } : null },
      issues,
      blockers: issues.filter(issue => issue.severity === "block").length,
      can: { edit: canEdit(req, ctx.plan), approve: canApprove(req, ctx.plan) },
    };
  }

  const need = async (req: any, res: Response, planId: unknown, sectionId: unknown): Promise<Context | null> => {
    const ctx = await context(String(planId || ""), Number(sectionId || 0));
    if (!ctx) { fail(res, 404, "الصحيفة غير موجودة."); return null; }
    if (!canSee(req, ctx.plan)) { fail(res, 403, "خارج نطاق هذه الصحيفة."); return null; }
    return ctx;
  };

  /* ── ما ينتظر المراجعة: يُظهر الأيقونةَ المؤقتة أو يُخفيها ──────────────────── */
  app.get("/api/plan-review/status", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const drafts = await Repository.listRuleDrafts();
    const sections = new Map<number, string>((await Repository.getSections() as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
    const rows: any[] = [];
    for (const draft of drafts) {
      const plan: Plan = { id: draft.planId, AdCollegeId: draft.AdCollegeId, AdSectionId: draft.AdSectionId, name: "", status: "" };
      if (!canSee(req, plan)) continue;
      rows.push({
        planId: draft.planId, sectionId: draft.AdSectionId, sectionName: sections.get(draft.AdSectionId) || "",
        state: draft.status || "approved", updatedAt: draft.updatedAt, approvedAt: draft.approvedAt || "",
        courses: draft.rules.length,
      });
    }
    /* الصحائفُ التي يُفتح عليها: أقسامُ هذا الحساب وحدها، بلا المؤرشفة. */
    const reachable: Array<{ sectionId: number; sectionName: string; plans: Array<{ id: string; name: string; status: string; pending: boolean }> }> = [];
    const pendingIds = new Set(rows.filter(row => row.state === "review").map(row => row.planId));
    for (const section of await Repository.getSections() as any[]) {
      const collegeId = Number(section.AdCollegeId), sectionId = Number(section.AdSectionId);
      if (!canSee(req, { id: "", AdCollegeId: collegeId, AdSectionId: sectionId, name: "", status: "" })) continue;
      const plans = (await Repository.getCurriculumPlans(sectionId)).filter(plan => plan.status !== "archived" && !plan.virtual);
      if (plans.length || isTechnologyEducation(section.AdSectionName)) reachable.push({ sectionId, sectionName: String(section.AdSectionName || ""), plans: [...plans].sort((x, y) => Number(pendingIds.has(y.id)) - Number(pendingIds.has(x.id)) || Number(y.status === "active") - Number(x.status === "active")).map(plan => ({ id: plan.id, name: plan.name, status: plan.status, pending: pendingIds.has(plan.id) })) });
    }
    res.json({ pending: rows.filter(row => row.state === "review"), approved: rows.filter(row => row.state === "approved"), sections: reachable, canApprove: deps.isPowerUser(req) || roleId(req) === "committeeChair", canImport: deps.isPowerUser(req) });
  });

  /* The supplied source sheets are a read-only comparison, available to both
     reviewers. Reading this endpoint never edits a catalog, membership or rule. */
  app.get("/api/plan-review/reference", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const sectionId = Number(req.query.sectionId);
    const section = (await Repository.getSections()).find(row => Number(row.AdSectionId) === sectionId);
    if (!section || !canSee(req, { id: "", name: "", status: "", AdCollegeId: Number(section.AdCollegeId), AdSectionId: sectionId })) {
      fail(res, 403, "خارج نطاق هذه الصحيفة."); return;
    }
    if (!isTechnologyEducation(section.AdSectionName)) { res.json({ references: [] }); return; }
    const [courses, sections, colleges] = await Promise.all([Repository.getCourses(), Repository.getSections(), Repository.getColleges()]);
    const technologySections = sections.filter(row => isTechnologyEducation(row.AdSectionName)
      && (deps.isPowerUser(req) || deps.isScopeAllowed(req, Number(row.AdCollegeId), Number(row.AdSectionId))));
    const sectionCodes = new Map(sections.map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
    const sectionIdsByCollegeCode = new Map<string, number[]>();
    for (const row of sections) {
      const key = `${Number(row.AdCollegeId)}:${sectionCodes.get(Number(row.AdSectionId)) || ""}`;
      sectionIdsByCollegeCode.set(key, [...(sectionIdsByCollegeCode.get(key) || []), Number(row.AdSectionId)]);
    }
    const sectionResults = await Promise.all(technologySections.map(async target => {
      const [plans, links] = await Promise.all([Repository.getCurriculumPlans(Number(target.AdSectionId)), Repository.getCurriculumPlanCourses(Number(target.AdSectionId))]);
      const collegeCourses = courses.filter(row => Number(row.AdCollegeId) === Number(target.AdCollegeId)).map(row => {
        const code = referenceCodeKey(row.CourseCode), ownerCode = sectionCodes.get(Number(row.AdSectionId));
        return { ...row, CourseCode: /^\d{1,3}$/.test(code) && /^\d{2}$/.test(ownerCode || "") ? `01${ownerCode}${code.padStart(3, "0")}` : code };
      });
      const references = TECHNOLOGY_EDUCATION_CURRICULA.map(reference => {
        const matchingPlans = plans.filter(plan => !plan.virtual && plan.status === (reference.id === "new" ? "active" : "transition"));
        const plan = matchingPlans.length === 1 ? matchingPlans[0] : undefined;
        const members = new Set(links.filter(link => link.planId === plan?.id).map(link => Number(link.AdCourseId)));
        const groups = compareCurriculumReference(reference, collegeCourses, members).map(group => ({ ...group, courses: group.courses.map(course => {
          const matched = course.current && collegeCourses.find(row => Number(row.AdCourseId) === Number(course.current?.id));
          const inferred = sectionIdsByCollegeCode.get(`${Number(target.AdCollegeId)}:${course.code.slice(2, 4)}`) || [];
          const ownerSectionId = Number(matched?.AdSectionId) || (inferred.length === 1 ? inferred[0] : 0);
          const owner = sections.find(row => Number(row.AdSectionId) === ownerSectionId);
          return { ...course, ownerSectionId, ownerSectionName: String(owner?.AdSectionName || ""), ownerCollegeId: Number(target.AdCollegeId) };
        }) }));
        return { ...reference, planId: plan?.id || null, groups };
      });
      return { sectionId: Number(target.AdSectionId), collegeId: Number(target.AdCollegeId), collegeName: colleges.find(row => Number(row.AdCollegeId) === Number(target.AdCollegeId))?.AdCollegeName || "", sectionName: target.AdSectionName, references };
    }));
    res.json({ sectionId, references: sectionResults.find(row => row.sectionId === sectionId)?.references || [], sections: sectionResults });
  });

  app.get("/api/plan-review/plan", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.query.planId, req.query.sectionId);
    if (!ctx) return;
    res.setHeader("Cache-Control", "no-store");
    res.json(await view(req, ctx));
  });

  /** يكتب في المسوّدة: تُنشأ من المعتمدة إن لم تكن، وتعود «قيد المراجعة» بكل تعديل. */
  async function editDraft(ctx: Context, req: any, change: (draft: CurriculumRuleSet) => CurriculumRuleSet) {
    const by = deps.actorName(req);
    const live = await Repository.getRuleSet(ctx.plan.id);
    return Repository.updateRuleDraft(ctx.plan.id, current => {
      const base: CurriculumRuleSet = current ? { ...current } : blank(ctx, by, live);
      if (base.status === "approved") { base.status = "review"; base.basedOnVersion = base.version; }
      const next = change(base);
      const groups = next.groups;
      return { ...next, status: "review", rules: withDerivedGroups(next.rules, groups), updatedAt: new Date().toISOString(), updatedBy: by };
    });
  }

  app.put("/api/plan-review/rule", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const rule = normalizeRule({ ...(req.body?.rule || {}), courseId: req.body?.rule?.courseId });
    if (!rule) { fail(res, 400, "اختر المقرر."); return; }
    const course = ctx.catalog.get(rule.courseId);
    if (!ctx.courseIds.includes(rule.courseId) || !course) { fail(res, 400, "هذا المقرر ليس في الصحيفة."); return; }
    /* قاعدةُ صاحب النظام: القسمُ يعدّل مقرراتِه لا مقرراتِ غيره. */
    if (!ownsCourse(req, course)) { fail(res, 403, `«${course.name}» يملكه قسمٌ آخر — لا يُعدَّل من هنا.`, { code: "foreign-course" }); return; }
    const empty = !rule.level && !rule.kind && !rule.prereq && !rule.coreq;
    const saved = await editDraft(ctx, req, draft => ({
      ...draft,
      rules: normalizeRules([...draft.rules.filter(item => item.courseId !== rule.courseId), ...(empty && !draft.groups.some(group => group.courseIds.includes(rule.courseId)) ? [] : [rule])]),
    }));
    res.locals.auditChanges = `قواعد صحيفة «${ctx.plan.name}»: ${course.name}`;
    res.json(await view(req, ctx).then(v => ({ ...v, saved: Boolean(saved) })));
  });

  app.put("/api/plan-review/group", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const raw = req.body?.group || {};
    const group = normalizeGroup({ ...raw, id: String(raw.id || "").trim() || `g${Date.now().toString(36)}` });
    if (!group) { fail(res, 400, "اكتب اسم المجموعة."); return; }
    group.courseIds = group.courseIds.filter(id => ctx.courseIds.includes(id));
    await editDraft(ctx, req, draft => ({ ...draft, groups: [...draft.groups.filter(item => item.id !== group.id).map(item => ({ ...item, courseIds: item.courseIds.filter(id => !group.courseIds.includes(id)) })), group] }));
    res.locals.auditChanges = `مجموعة اختيارية في صحيفة «${ctx.plan.name}»: ${group.name}`;
    res.json(await view(req, ctx));
  });

  app.post("/api/plan-review/group/delete", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const id = String(req.body?.groupId || "");
    await editDraft(ctx, req, draft => ({ ...draft, groups: draft.groups.filter(item => item.id !== id) }));
    res.locals.auditChanges = `حذف مجموعة اختيارية من صحيفة «${ctx.plan.name}»`;
    res.json(await view(req, ctx));
  });

  app.post("/api/plan-review/approve", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canApprove(req, ctx.plan)) { fail(res, 403, "الاعتماد لرئيس لجنة الجدول.", { code: "not-approver" }); return; }
    const draft = await Repository.getRuleDraft(ctx.plan.id);
    if (!draft || draft.status !== "review") { fail(res, 409, "لا مسوّدةَ قيد المراجعة لهذه الصحيفة."); return; }
    const issues = issuesOf(ctx, draft).filter(issue => issue.severity === "block");
    if (issues.length) { fail(res, 409, `لا يُعتمد وفي القواعد ${countOf(issues.length, AR.blocker)}: ${issues[0].text}`, { code: "blockers", issues }); return; }
    try {
      const approved = await Repository.approveRuleDraft(ctx.plan.id, String(req.body?.updatedAt || ""), deps.actorName(req));
      res.locals.auditChanges = `اعتماد صحيفة «${ctx.plan.name}» — الإصدار ${approved.version}`;
      res.json(await view(req, ctx));
    } catch (error) {
      if (error instanceof RuleDraftConflict) { fail(res, 409, error.message, { code: "stale" }); return; }
      throw error;
    }
  });

  /* ── استيراد الصحائف: إدارةُ النظام وحدها، ويُنشئ مسوّداتٍ لا يعتمد شيئاً ────── */
  app.post("/api/plan-review/import", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isPowerUser(req)) { fail(res, 403, "الاستيراد لإدارة النظام."); return; }
    const rows = (Array.isArray(req.body?.rows) ? req.body.rows : []).slice(0, 20000) as RuleImportRow[];
    if (!rows.length) { fail(res, 400, "لا أسطر."); return; }
    const [sections, courses] = await Promise.all([Repository.getSections(), Repository.getCourses()]);
    const plans: ImportPlan[] = [];
    for (const section of sections as any[]) {
      const sid = Number(section.AdSectionId);
      const [sectionPlans, links] = await Promise.all([Repository.getCurriculumPlans(sid), Repository.getCurriculumPlanCourses(sid)]);
      for (const plan of sectionPlans.filter(row => row.status !== "archived")) {
        plans.push({ id: plan.id, sectionId: sid, sectionName: String(section.AdSectionName || ""), sectionCode: String(section.AdSectionCode || ""), name: plan.name, courseIds: links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)) });
      }
    }
    const { drafts, diagnostics } = rowsToDrafts(rows, plans, (courses as AdCourse[]).map(course => ({ id: Number(course.AdCourseId), code: String(course.CourseCode || "") })));
    const replace = req.body?.replace === true;
    let created = 0; const skipped: string[] = [];
    for (const imported of drafts) {
      const plan = plans.find(row => row.id === imported.planId)!;
      const section = (sections as any[]).find(row => Number(row.AdSectionId) === imported.sectionId);
      const existing = await Repository.getRuleDraft(imported.planId);
      if (existing?.status === "review" && !replace) { skipped.push(plan.name); continue; }
      const live = await Repository.getRuleSet(imported.planId);
      await Repository.updateRuleDraft(imported.planId, () => ({
        id: imported.planId, planId: imported.planId, AdCollegeId: Number(section?.AdCollegeId || 0), AdSectionId: imported.sectionId,
        rules: imported.rules, groups: imported.groups, version: live?.version || 0, status: "review", basedOnVersion: live?.version || 0,
        updatedAt: new Date().toISOString(), updatedBy: `استيراد · ${deps.actorName(req)}`,
      }));
      created += 1;
    }
    res.locals.auditChanges = `استيراد قواعد صحائف: ${countOf(created, AR.draft)}`;
    res.json({ created, skipped, diagnostics: diagnostics.slice(0, 300), diagnosticsTotal: diagnostics.length });
  });
}
