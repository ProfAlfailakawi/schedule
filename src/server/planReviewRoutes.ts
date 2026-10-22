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
import { groupDeptTracks, planMatchKey, trackLabels, type DeptTrack } from "../utils/collegeTrack";
import { TECHNOLOGY_EDUCATION_CURRICULA } from "../data/technologyEducationCurricula";
import { compareCurriculumReference, isTechnologyEducation, referenceCodeKey } from "../utils/curriculumReference";
import { AR, countOf } from "../utils/arabicCount";
import express from "express";
import { rateLimit } from "express-rate-limit";
import type { Express, Request, RequestHandler, Response } from "express";
import { DuplicateResourceError, RuleDraftConflict, Repository } from "../db/repository";
import type { AdCourse, CurriculumRuleSet, ElectiveGroup } from "../types";
import { roleDefinition } from "../utils/academicRoles";
import { sectionLabels } from "../utils/sectionLabel";
import {
  checkRuleSet, normalizeGroup, normalizeRule, normalizeRules, withDerivedGroups, type RuleIssue,
} from "../utils/curriculumRules";
import { buildReferenceRules, planReferenceApplication, splitFrozenUpdates } from "../utils/referenceApply";
import { collegeBranchRoot } from "../utils/branchScope";
import { rowsToDrafts, type ImportPlan, type RuleImportRow } from "../utils/curriculumRulesImport";
import { authorityDepartmentCode } from "../utils/authorityAcademicCodes";
import { branchAudience } from "../utils/referenceApply";
import { checkSheetScope, correctedNames, departmentNameNote, printedTotalsNotes, ownCourses, sheetToReference, storedCode } from "../utils/planSheetImport";
import { parsePlanItems } from "../utils/planPdfParser";
import { extractPlanItems, PLAN_PDF_MAX_BYTES } from "./planPdfExtract";

export interface PlanReviewDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  isRootAdmin: (req: any) => boolean;
  hasPermission: (req: any, formId: number) => boolean;
  actorName: (req: any) => string;
}

type Plan = { id: string; AdCollegeId: number; AdSectionId: number; name: string; status: string };
interface CourseInfo { id: number; code: string; name: string; credit: number; hours: number; capacity: number; collegeId: number; sectionId: number }
interface Context {
  plan: Plan;
  courseIds: number[];
  /** متطلباتٌ عامة (مقررات أقسامٍ أخرى) داخل `courseIds`: للقراءة. */
  externalIds: number[];
  catalog: Map<number, CourseInfo>;
  sectionName: string;
}

const READERS = new Set(["committeeChair", "departmentHead", "standard"]);
const WORKSPACE_FORM = 7;

/** صحائفُ قيد المراجعة التي يراها هذا الحساب: لجرس الإشعارات. نفسُ حارس النطاق والصفة في الشاشة. */
export async function pendingPlanReviews(req: any, deps: Pick<PlanReviewDeps, "isScopeAllowed" | "isPowerUser">): Promise<Array<{ planId: string; planName: string; sectionId: number; collegeId: number; sectionName: string; groupKey: string; groupLabel: string; unitKey: string; updatedAt: string }>> {
  const role = roleDefinition(req.user?.Role).id;
  const drafts = (await Repository.listRuleDrafts()).filter(draft => draft.status === "review");
  const visible = drafts.filter(draft => deps.isPowerUser(req) || (READERS.has(role) && deps.isScopeAllowed(req, draft.AdCollegeId, draft.AdSectionId)));
  if (!visible.length) return [];
  const [sectionRows, collegeRows] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
  const sections = sectionLabels(sectionRows as any[], collegeRows as any[]);
  /* بناتُ القسم بمواقعهنّ (الجهراء والفحيحيل) صحيفةٌ واحدة: إشعارٌ واحد لا ثلاثة. */
  const trackOfSection = new Map<number, DeptTrack>();
  const allTracks = groupDeptTracks(sectionRows as any[], collegeRows as any[]), labels = trackLabels(allTracks);
  for (const track of allTracks) for (const section of [track.canonical, ...track.mirrors]) trackOfSection.set(Number(section.AdSectionId), track);
  const out = [];
  for (const draft of visible) {
    const plan = (await Repository.getCurriculumPlans(draft.AdSectionId)).find(row => row.id === draft.planId);
    out.push({ planId: draft.planId, planName: plan?.name || "الصحيفة", sectionId: draft.AdSectionId, collegeId: draft.AdCollegeId, sectionName: sections.get(draft.AdSectionId) || "",
      /* إشعارٌ واحد لكل قسم (باسمه) مهما تعدّدت كلياتُه ومساراتُه؛ والصحيفةُ تُعدّ بمسارها وكليتها وسنتها (unitKey). */
      groupKey: trackOfSection.get(draft.AdSectionId)?.deptName || `${draft.AdCollegeId}:${draft.AdSectionId}`,
      groupLabel: (() => { const t = trackOfSection.get(draft.AdSectionId); return t ? (/^قسم\s/.test(t.deptName) ? t.deptName : `قسم ${t.deptName}`) : sections.get(draft.AdSectionId) || ""; })(),
      unitKey: `${trackOfSection.get(draft.AdSectionId)?.key || draft.AdSectionId}|${planMatchKey(plan?.name || draft.planId)}`,
      updatedAt: draft.updatedAt });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** تصنيف كل مقرر في صحيفة تكنولوجيا التعليم كما تكتبه الصحيفة (ثقافة عامة، تخصصية، مهنية، تدريب ميداني)، وترتيب ظهور التصنيفات فيها. */
export const REFERENCE_CATEGORIES = (() => {
  const byCode = new Map<string, string>(), order: string[] = [];
  for (const reference of [...TECHNOLOGY_EDUCATION_CURRICULA].sort((a, b) => Number(b.id === "new") - Number(a.id === "new")))
    for (const group of reference.groups) {
      if (!order.includes(group.category)) order.push(group.category);
      for (const course of group.courses) if (!byCode.has(course.code)) byCode.set(course.code, group.category);
    }
  return { byCode, order };
})();

/** تصنيفُ مقررٍ بحسب الصحيفة المرجعية: الرمزُ القصير يُوسَّع برمز قسم المالك كما في المقارنة. */
export function referenceCategoryResolver(sections: readonly any[]): (code: string, ownerSectionId: number) => string {
  const ownerCodes = new Map(sections.map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
  return (code, ownerSectionId) => {
    const key = referenceCodeKey(code), owner = ownerCodes.get(Number(ownerSectionId)) || "";
    return REFERENCE_CATEGORIES.byCode.get(/^\d{1,3}$/.test(key) && /^\d{2}$/.test(owner) ? `01${owner}${key.padStart(3, "0")}` : key) || "";
  };
}

/** مقارنة صحائف تكنولوجيا التعليم المرجعية بكتالوج موقعٍ واحد: للعرض وللتطبيق معاً، فلا يفترقان. */
export function referenceSnapshotFor(sections: any[], courses: AdCourse[]) {
    const sectionCodes = new Map(sections.map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
    const sectionIdsByCollegeCode = new Map<string, number[]>();
    for (const row of sections) {
      const key = `${Number(row.AdCollegeId)}:${sectionCodes.get(Number(row.AdSectionId)) || ""}`;
      sectionIdsByCollegeCode.set(key, [...(sectionIdsByCollegeCode.get(key) || []), Number(row.AdSectionId)]);
    }
  return async (target: any) => {
      const [plans, links] = await Promise.all([Repository.getCurriculumPlans(Number(target.AdSectionId)), Repository.getCurriculumPlanCourses(Number(target.AdSectionId))]);
      const collegeCourses = courses.filter(row => Number(row.AdCollegeId) === Number(target.AdCollegeId)).map(row => {
        const code = referenceCodeKey(row.CourseCode), ownerCode = sectionCodes.get(Number(row.AdSectionId));
        return { ...row, CourseCode: /^\d{1,3}$/.test(code) && /^\d{2}$/.test(ownerCode || "") ? `01${ownerCode}${code.padStart(3, "0")}` : code };
      });
      const references = TECHNOLOGY_EDUCATION_CURRICULA.map(reference => {
        const matchingPlans = plans.filter(plan => !plan.virtual && plan.status === (reference.id === "new" ? "active" : "transition"));
        const plan = matchingPlans.length === 1 ? matchingPlans[0] : undefined;
        const members = new Set(links.filter(link => link.planId === plan?.id).map(link => Number(link.AdCourseId)));
        const groups = compareCurriculumReference(reference, collegeCourses, members, Number(target.AdSectionId)).map(group => ({ ...group, courses: group.courses.map(course => {
          const matched = course.current && collegeCourses.find(row => Number(row.AdCourseId) === Number(course.current?.id));
          const inferred = sectionIdsByCollegeCode.get(`${Number(target.AdCollegeId)}:${course.code.slice(2, 4)}`) || [];
          const ownerSectionId = Number(matched?.AdSectionId) || (inferred.length === 1 ? inferred[0] : 0);
          const owner = sections.find(row => Number(row.AdSectionId) === ownerSectionId);
          return { ...course, ownerSectionId, ownerSectionName: String(owner?.AdSectionName || ""), ownerCollegeId: Number(target.AdCollegeId) };
        }) }));
        return { ...reference, planId: plan?.id || null, groups };
      });
      return { plans, links, collegeCourses, references };
  };
}

export function registerPlanReviewRoutes(app: Express, deps: PlanReviewDeps): void {
  const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json({ error, ...extra });
  const roleId = (req: any): string => roleDefinition(req.user?.Role).id;
  /* رفعُ صحيفة يقرأ ملفاً كاملاً ويكتب في الكتالوج: حدٌّ سخيٌّ يمنع حلقةً من شغل الخادم. */
  const sheetLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "ملفاتٌ كثيرة في وقتٍ قصير. انتظر قليلاً ثم أعد الرفع." } });

  /** من يرى الصحيفة: صاحبُ نطاقها بصفةٍ تفتح الشاشة، أو إدارةُ النظام. */
  const canSee = (req: any, plan: Plan) =>
    deps.isPowerUser(req) || (READERS.has(roleId(req)) && deps.isScopeAllowed(req, plan.AdCollegeId, plan.AdSectionId));
  /** رئيس القسم يصحح صحيفته في نطاقه فقط؛ لا يحصل بذلك على صلاحية تعديل الجدول. */
  const canEdit = (req: any, plan: Plan) =>
    deps.isPowerUser(req) || (canSee(req, plan) && (
      (roleId(req) === "departmentHead" && plan.status !== "archived")
      || (!roleDefinition(req.user?.Role).readOnly && deps.hasPermission(req, WORKSPACE_FORM))
    ));
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
        credit: Number(course.CourseCredit) || 0, hours: Number(course.CourseHours) || 0,
        capacity: Number(course.MaxStudent) || 0, collegeId: Number(course.AdCollegeId), sectionId: Number(course.AdSectionId),
      });
    }
    const [draftSet, liveSet] = await Promise.all([Repository.getRuleDraft(planId), Repository.getRuleSet(planId)]);
    const externalIds = [...new Set(((draftSet || liveSet)?.externals || []).map(Number).filter(id => id > 0))];
    const memberIds = [...new Set(links.filter(link => link.planId === planId).map(link => Number(link.AdCourseId)))];
    return {
      plan: { id: plan.id, AdCollegeId: Number(plan.AdCollegeId), AdSectionId: Number(plan.AdSectionId), name: plan.name, status: plan.status },
      externalIds: externalIds.filter(id => !memberIds.includes(id)),
      courseIds: [...new Set([...memberIds, ...externalIds])],
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
    const [sectionRows, collegeRows] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const sections = sectionLabels(sectionRows as any[], collegeRows as any[]);
    const issues = issuesOf(ctx, shown);
    /* التصنيف لقسم تكنولوجيا التعليم وحده (له صحيفة مرجعية)؛ الرمز القصير يُوسَّع برمز قسم المالك كما في المقارنة. */
    const planSection = (sectionRows as any[]).find(row => Number(row.AdSectionId) === Number(ctx.plan.AdSectionId));
    const categorized = isTechnologyEducation(planSection?.AdSectionName);
    const ownerCodes = new Map((sectionRows as any[]).map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
    const categoryOf = (course: { code: string; sectionId: number }) => {
      if (!categorized) return "";
      const key = referenceCodeKey(course.code), owner = ownerCodes.get(Number(course.sectionId)) || "";
      return REFERENCE_CATEGORIES.byCode.get(/^\d{1,3}$/.test(key) && /^\d{2}$/.test(owner) ? `01${owner}${key.padStart(3, "0")}` : key) || "";
    };
    return {
      categories: categorized ? REFERENCE_CATEGORIES.order : [],
      plan: { id: ctx.plan.id, name: ctx.plan.name, status: ctx.plan.status, sectionId: ctx.plan.AdSectionId, sectionName: ctx.sectionName },
      courses: ctx.courseIds.map(id => {
        const course = ctx.catalog.get(id) || { id, code: "", name: `مقرر ${id}`, credit: 0, hours: 0, capacity: 0, collegeId: 0, sectionId: 0 };
        return { id, code: course.code, name: course.name, credit: course.credit, hours: course.hours, capacity: course.capacity,
          collegeId: course.collegeId, sectionId: course.sectionId, ownerSectionId: course.sectionId, category: categoryOf(course),
          ownerSectionName: sections.get(course.sectionId) || "", owned: ownsCourse(req, course), external: ctx.externalIds.includes(id) };
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
    const [sectionRows, collegeRows] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const sections = sectionLabels(sectionRows as any[], collegeRows as any[]);
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
    for (const section of sectionRows as any[]) {
      const collegeId = Number(section.AdCollegeId), sectionId = Number(section.AdSectionId);
      if (!canSee(req, { id: "", AdCollegeId: collegeId, AdSectionId: sectionId, name: "", status: "" })) continue;
      const plans = (await Repository.getCurriculumPlans(sectionId)).filter(plan => plan.status !== "archived" && !plan.virtual);
      if (plans.length || isTechnologyEducation(section.AdSectionName) || deps.isRootAdmin(req)) reachable.push({ sectionId, sectionName: sections.get(sectionId) || String(section.AdSectionName || ""), plans: [...plans].sort((x, y) => Number(pendingIds.has(y.id)) - Number(pendingIds.has(x.id)) || Number(y.status === "active") - Number(x.status === "active")).map(plan => ({ id: plan.id, name: plan.name, status: plan.status, pending: pendingIds.has(plan.id) })) });
    }
    res.json({ pending: rows.filter(row => row.state === "review"), approved: rows.filter(row => row.state === "approved"), sections: reachable, canApprove: deps.isPowerUser(req) || roleId(req) === "committeeChair", canImport: deps.isRootAdmin(req) });
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
    const snapshotOf = referenceSnapshotFor(sections, courses);
    const sectionResults = await Promise.all(technologySections.map(async target => {
      const { references } = await snapshotOf(target);
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

  /** محرر بيانات المقرر داخل الصحيفة: لا يغيّر الهوية أو الملكية، ويُبقي الكتابة داخل القسم والصحيفة. */
  app.put("/api/plan-review/course-details", deps.requireAuth, async (req: Request, res: Response) => {
    const ctx = await need(req, res, req.body?.planId, req.body?.sectionId);
    if (!ctx) return;
    if (!canEdit(req, ctx.plan)) { fail(res, 403, "لا تملك تعديل هذه الصحيفة."); return; }
    const allowedFields = new Set(["planId", "sectionId", "courseId", "credit", "hours", "capacity"]);
    if (Object.keys(req.body || {}).some(key => !allowedFields.has(key))) { fail(res, 400, "هذا المحرر يغيّر الوحدات والساعات والسعة فقط."); return; }
    const courseId = Number(req.body?.courseId);
    const course = ctx.catalog.get(courseId);
    if (!course || !ctx.courseIds.includes(courseId)) { fail(res, 400, "هذا المقرر ليس في الصحيفة."); return; }
    if (!ownsCourse(req, course)) { fail(res, 403, "لا يمكن تعديل مقرر تابع لقسم آخر.", { code: "foreign-course" }); return; }
    const credit = Number(req.body?.credit), hours = Number(req.body?.hours), capacity = Number(req.body?.capacity);
    if (!Number.isInteger(credit) || credit < 0 || credit > 20 || !Number.isFinite(hours) || hours < 0 || hours > 40 || Math.round(hours * 2) !== hours * 2 || !Number.isInteger(capacity) || capacity < 0 || capacity > 200) {
      fail(res, 400, "تحقق من الوحدات والساعات والسعة."); return;
    }
    const updated = await Repository.updateCourse(course.id, course.collegeId, course.sectionId, course.code, course.name, credit, hours, capacity);
    res.locals.auditChanges = `تصحيح بيانات مقرر «${course.name}» في صحيفة «${ctx.plan.name}»`;
    res.json({ course: { id: updated.AdCourseId, credit: updated.CourseCredit, hours: updated.CourseHours, capacity: updated.MaxStudent } });
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
      /* صحيفةٌ منشورة للعامة تتبع اعتمادها: تُعاد لقطتُها بالقواعد الجديدة، فلا يبقى الرابطُ على نسخةٍ قديمة.
         الاستيرادُ متأخر لأن وحدة النشر تستورد من هذه الوحدة. */
      const republished = await (await import("./planSheetRoutes")).republishIfPublished(ctx.plan.id, deps.actorName(req)).catch(() => false);
      res.locals.auditChanges = `اعتماد صحيفة «${ctx.plan.name}» — الإصدار ${approved.version}${republished ? "، وتحديث صفحتها العامة" : ""}`;
      res.json(await view(req, ctx));
    } catch (error) {
      if (error instanceof RuleDraftConflict) { fail(res, 409, error.message, { code: "stale" }); return; }
      throw error;
    }
  });

  /* ── تطبيق صحيفة تكنولوجيا التعليم المرجعية على كتالوج الموقع ──────────────────────
     المعاينة والتطبيق من الدالة نفسها (planReferenceApplication): ما يُعرض هو ما يُكتب.
     الحساب الرئيسي وحده؛ يصحّح الاسم والوحدات والساعات إلى الصحيفة، ويضيف الناقص في قسمه المالك،
     ويربط مقررات القسم بالصحيفة، ويُنشئ مسوّدة قواعد (مستوى/نوع/مسبقات/مجموعات) لا تُعتمد. */
  app.post("/api/plan-review/reference/apply", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "تطبيق الصحيفة المرجعية للحساب الرئيسي وحده."); return; }
    const reference = TECHNOLOGY_EDUCATION_CURRICULA.find(row => row.id === req.body?.referenceId);
    if (!reference) { fail(res, 400, "اختر الصحيفة القديمة أو الجديدة."); return; }
    const dryRun = req.body?.dryRun !== false;
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const wanted = Array.isArray(req.body?.sectionIds) ? new Set((req.body.sectionIds as unknown[]).map(Number)) : null;
    const targets = (sections as any[]).filter(row => isTechnologyEducation(row.AdSectionName) && (!wanted || wanted.has(Number(row.AdSectionId))));
    if (!targets.length) { fail(res, 404, "لا قسم تكنولوجيا التعليم في المواقع المختارة."); return; }
    const by = deps.actorName(req);
    const reports: any[] = [];
    for (const target of targets) {
      const sid = Number(target.AdSectionId), cid = Number(target.AdCollegeId);
      const collegeName = String((colleges as any[]).find(row => Number(row.AdCollegeId) === cid)?.AdCollegeName || "");
      const branch = collegeBranchRoot(colleges as any[], cid);
      const report: any = { sectionId: sid, collegeId: cid, collegeName, branch, planId: null, planNote: "", updates: [], creates: [], links: [], skipped: [], notes: [], rules: 0, groups: 0, externals: 0, applied: false };
      let courses = await Repository.getCourses();
      let snapshot = await referenceSnapshotFor(sections as any[], courses)(target);
      let ref: any = snapshot.references.find((row: any) => row.id === reference.id);
      if (!branch) { report.planNote = "موقع بلا فرع معروف: لم يُطبَّق."; reports.push(report); continue; }
      if (!ref.planId) {
        const live = snapshot.plans.filter(plan => !plan.virtual && plan.status !== "archived");
        if (reference.id === "old" && live.length) report.planNote = "لا صحيفة انتقالية (سابقة) في هذا الموقع: تُنشأ مع الصحيفة الجديدة فحسب.";
        else if (dryRun) report.planNote = reference.id === "new" ? "ستُنشأ الصحيفة الجديدة وتُنقل الحالية إلى «السابقة»." : "ستُنشأ الصحيفة الجديدة فتظهر معها «الصحيفة السابقة».";
        else {
          await Repository.createCurriculumPlan({ collegeId: cid, sectionId: sid, name: `الصحيفة الجديدة ${reference.effectiveTerm}`, by });
          snapshot = await referenceSnapshotFor(sections as any[], courses)(target);
          ref = snapshot.references.find((row: any) => row.id === reference.id);
        }
        if (report.planNote.startsWith("لا صحيفة")) { reports.push(report); continue; }
      }
      report.planId = ref.planId;
      const members = new Set<number>(snapshot.links.filter(link => link.planId === ref.planId).map(link => Number(link.AdCourseId)));
      const application = planReferenceApplication(reference, ref.groups, branch, members, sid);
      /* الاسم المجمَّد: مقرر في صحيفةٍ غير فعّالة (في قسمه). */
      const frozenCache = new Map<number, Set<number>>();
      const frozenIdsOf = async (sectionOfCourse: number): Promise<Set<number>> => {
        if (!frozenCache.has(sectionOfCourse)) {
          const [ownPlans, ownLinks] = await Promise.all([Repository.getCurriculumPlans(sectionOfCourse), Repository.getCurriculumPlanCourses(sectionOfCourse)]);
          const inactive = new Set(ownPlans.filter(plan => plan.status !== "active" && !plan.virtual).map(plan => plan.id));
          frozenCache.set(sectionOfCourse, new Set(ownLinks.filter(link => inactive.has(link.planId)).map(link => Number(link.AdCourseId))));
        }
        return frozenCache.get(sectionOfCourse)!;
      };
      for (const update of application.updates) update.frozen = update.identityChange && (await frozenIdsOf(update.ownerSectionId)).has(update.courseId);
      const { apply: toApply, held } = splitFrozenUpdates(application.updates, req.body?.confirmIdentity === true);
      Object.assign(report, { held, updates: application.updates, creates: application.creates, links: application.links, skipped: application.skipped, notes: application.notes, courseCount: application.courseCount, externals: application.externals });
      if (dryRun || !ref.planId) { reports.push(report); continue; }

      /* 1) تصحيح ما يخالف الصحيفة */
      for (const update of toApply) {
        const row = (courses as AdCourse[]).find(course => Number(course.AdCourseId) === update.courseId);
        if (!row) continue;
        await Repository.updateCourse(row.AdCourseId, row.AdCollegeId, row.AdSectionId, row.CourseCode, update.after.name, update.after.credit, update.after.hours, Number(row.MaxStudent) || 0);
      }
      /* 2) إضافة الناقص في كتالوج قسمه المالك */
      const createdIds = new Map<string, number>();
      for (const create of application.creates) {
        const ownerCourses = (courses as AdCourse[]).filter(course => Number(course.AdSectionId) === create.sectionId);
        const shortStyle = ownerCourses.length > 0 && ownerCourses.filter(course => /^\d{1,3}$/.test(referenceCodeKey(course.CourseCode))).length * 2 > ownerCourses.length;
        const code = shortStyle ? String(Number(create.code.slice(-3))) : create.code;
        try {
          const made = await Repository.createCourse(cid, create.sectionId, code, create.name, create.credit, create.hours, 0, false);
          createdIds.set(create.code, Number(made.AdCourseId));
        } catch (error) {
          if (error instanceof DuplicateResourceError) report.notes.push(`«${create.name}»: الرمز ${code} مستعمل في القسم؛ لم يُنشأ.`);
          else throw error;
        }
      }
      courses = await Repository.getCourses();
      const after = referenceSnapshotFor(sections as any[], courses);
      snapshot = await after(target);
      ref = snapshot.references.find((row: any) => row.id === reference.id);
      /* 3) ربط مقررات القسم بالصحيفة */
      const byId = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course] as const));
      const memberNow = new Set<number>(snapshot.links.filter(link => link.planId === ref.planId).map(link => Number(link.AdCourseId)));
      const skipCodes = new Set<string>(application.skipped.map(item => referenceCodeKey(item.code)));
      const memberIdByCode = new Map<string, number>(), knownIdByCode = new Map<string, number>(), externalIdByCode = new Map<string, number>();
      for (const group of ref.groups) for (const course of group.courses) {
        const key = referenceCodeKey(course.code);
        if (!course.current || skipCodes.has(key)) continue;
        knownIdByCode.set(key, Number(course.current.id));
        if (course.ownerSectionId !== sid) {
          /* مقررُ قسمٍ آخر: متطلبٌ عامٌّ للقراءة. يُصحَّح في كتالوج قسمه، ولا يُربط بعضوية هذه الصحيفة. */
          externalIdByCode.set(key, Number(course.current.id));
          continue;
        }
        const row = byId.get(Number(course.current.id));
        if (!row) continue;
        if (!memberNow.has(row.AdCourseId)) await Repository.addCourseToCurriculumPlan(ref.planId, row, by);
        memberIdByCode.set(key, Number(row.AdCourseId));
      }
      /* 4) مسوّدة القواعد: لا تُعتمد، ولا تمحو ما كتبه القسم. المتطلباتُ العامة تدخلها قراءةً (للقسم) وبقواعدها (للإدارة). */
      const ruleScope = new Map<string, number>([...memberIdByCode, ...externalIdByCode]);
      const built = buildReferenceRules(reference, ruleScope, knownIdByCode, skipCodes);
      const live = await Repository.getRuleSet(ref.planId);
      const allIds = new Set<number>(ruleScope.values());
      const externalIds = [...externalIdByCode.values()];
      await Repository.updateRuleDraft(ref.planId, current => {
        const base: CurriculumRuleSet = current ? { ...current } : { id: ref.planId, planId: ref.planId, AdCollegeId: cid, AdSectionId: sid, rules: live?.rules || [], groups: live?.groups || [], externals: live?.externals, version: live?.version || 0, status: "review", basedOnVersion: live?.version || 0, updatedAt: "", updatedBy: by };
        const hasRule = new Set(base.rules.map(rule => rule.courseId));
        const hasGroup = new Set(base.groups.map(group => group.id));
        const rules = normalizeRules([...base.rules, ...built.rules.filter(rule => !hasRule.has(rule.courseId))]);
        const groups = [...base.groups, ...built.groups.filter(group => !hasGroup.has(group.id)).map(group => normalizeGroup({ ...group, courseIds: group.courseIds.filter(id => allIds.has(id)) })).filter(Boolean) as ElectiveGroup[]];
        const externals = [...new Set([...(base.externals || []), ...externalIds])].sort((a, b) => a - b);
        return { ...base, rules: withDerivedGroups(rules, groups), groups, externals, status: "review", updatedAt: new Date().toISOString(), updatedBy: `تطبيق الصحيفة المرجعية · ${by}` };
      });
      report.externals = externalIds.length; report.rules = built.rules.length; report.groups = built.groups.length; report.notes.push(...built.notes.slice(0, 20)); report.applied = true;
      reports.push(report);
    }
    if (!dryRun) {
      const total = reports.reduce((sum, row) => sum + row.updates.length + row.creates.length + row.links.length, 0);
      res.locals.auditChanges = `تطبيق ${reference.name} (${reference.program}) على ${countOf(reports.filter(row => row.applied).length, AR.site)}: ${countOf(total, AR.change)}`;
    }
    res.json({ referenceId: reference.id, dryRun, sites: reports });
  });

  /* ── رفع «الخطة الدراسية» (صحيفة التخرج) لقسمٍ واحد: يُطبَّق مباشرةً، والقسم يعتمد بعدها ──────
     الحساب الرئيسي وحده. لا يُقبل إلا كشفُ الكلية والقسم المختارين (checkSheetScope) وقبل أي كتابة؛
     وتؤخذ مقررات القسم وحدها برقمها (105)، وتُصحَّح أسماؤها، ولا تُمسّ السعة أبداً. */
  app.post("/api/plan-review/sheet/import", sheetLimit, deps.requireAuth, express.raw({ type: "application/octet-stream", limit: PLAN_PDF_MAX_BYTES + 4096 }), async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "رفع الصحيفة للحساب الرئيسي وحده."); return; }
    const reject = (kind: string, message: string) => { res.status(422).json({ error: message, rejection: { kind, message } }); };
    const sectionId = Number(req.query.sectionId);
    const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
    const target = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId);
    if (!target) { fail(res, 404, "اختر القسم أولاً."); return; }
    const cid = Number(target.AdCollegeId), sid = sectionId;
    const college = (colleges as any[]).find(row => Number(row.AdCollegeId) === cid);
    const body = Buffer.isBuffer(req.body) ? req.body : null;
    if (!body?.length) { fail(res, 400, "لا ملف."); return; }
    if (body.subarray(0, 5).toString("latin1") !== "%PDF-") { reject("unreadable", "الملف ليس PDF. ارفع «الخطة الدراسية» كما تطبعها SWRCAPP (نصاً لا صورة)."); return; }
    let sheet;
    try { sheet = parsePlanItems(await extractPlanItems(body)); }
    catch (error) { reject("unreadable", error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : "تعذّرت قراءة الملف. ارفع «الخطة الدراسية» PDF كما تطبعها SWRCAPP."); return; }
    const departmentKey = authorityDepartmentCode(college?.AdCollegeCode, target.AdSectionCode);
    const rejection = checkSheetScope(sheet, { collegeName: String(college?.AdCollegeName || ""), sectionName: String(target.AdSectionName || ""), departmentKey });
    if (rejection) { res.status(422).json({ error: rejection.message, rejection }); return; }

    const by = deps.actorName(req);
    const branch = collegeBranchRoot(colleges as any[], cid);
    const inBranch = ownCourses(sheet, departmentKey).filter(course => !(course.girlsOnly && branch && branchAudience(branch) !== "girls"));
    const { names, fixes } = correctedNames(inBranch);
    const { reference, notes } = sheetToReference(sheet, inBranch, names);
    notes.unshift(...[departmentNameNote(sheet, { sectionName: String(target.AdSectionName || "") }), ...printedTotalsNotes(sheet)].filter(Boolean));
    const numberOf = (code: unknown) => Number(referenceCodeKey(code).slice(-3));
    const report: { updated: number; created: number; linked: number; unchanged: number; otherDepartments: number; girlsOnlySkipped: number; rules: number; groups: number } =
      { updated: 0, created: 0, linked: 0, unchanged: 0, otherDepartments: sheet.courses.length - ownCourses(sheet, departmentKey).length, girlsOnlySkipped: ownCourses(sheet, departmentKey).length - inBranch.length, rules: 0, groups: 0 };

    /* الصحيفة الفعّالة للقسم؛ وإن لم توجد تُنشأ قبل أي تعديلٍ ليحفظ «السابقةُ» الكتالوجَ كما كان. */
    const livePlans = () => Repository.getCurriculumPlans(sid).then(rows => rows.filter(plan => !plan.virtual && plan.status === "active"));
    let plan = (await livePlans())[0], planCreated = false;
    if (!plan) {
      await Repository.createCurriculumPlan({ collegeId: cid, sectionId: sid, name: `الصحيفة الجديدة ${sheet.semesterLabel || sheet.startYear || ""}`.trim(), by });
      plan = (await livePlans())[0]; planCreated = true;
    }
    if (!plan) { fail(res, 500, "تعذّر إنشاء صحيفة للقسم."); return; }

    /* 1) المقررات: تصحيح الاسم/الوحدات/الساعات وإضافة الناقص؛ السعة كما هي. */
    let courses = await Repository.getCourses() as AdCourse[];
    for (const course of inBranch) {
      const matches = courses.filter(row => Number(row.AdSectionId) === sid && numberOf(row.CourseCode) === Number(course.number));
      if (matches.length > 1) { notes.push(`الرمز ${storedCode(course)} يطابق أكثر من مقرر في القسم: لم يُمسّ.`); continue; }
      const name = names.get(course.codeKey) || course.name;
      const row = matches[0];
      if (!row) {
        try { await Repository.createCourse(cid, sid, storedCode(course), name, course.units, course.hours, 0, false); report.created += 1; }
        catch (error) { if (error instanceof DuplicateResourceError) notes.push(`الرمز ${storedCode(course)} مستعمل في القسم؛ لم يُنشأ.`); else throw error; }
      } else if (String(row.CourseName).normalize("NFKC").trim() !== name || Number(row.CourseCredit) !== course.units || Number(row.CourseHours) !== course.hours) {
        await Repository.updateCourse(row.AdCourseId, row.AdCollegeId, row.AdSectionId, row.CourseCode, name, course.units, course.hours, Number(row.MaxStudent) || 0);
        report.updated += 1;
      } else report.unchanged += 1;
    }

    /* 2) ربط مقررات القسم بالصحيفة. */
    courses = await Repository.getCourses() as AdCourse[];
    const sectionCodes = new Map((sections as any[]).map(row => [Number(row.AdSectionId), authorityDepartmentCode(colleges.find((c: any) => Number(c.AdCollegeId) === Number(row.AdCollegeId))?.AdCollegeCode, row.AdSectionCode)] as const));
    const keyOf = (row: AdCourse) => {
      const code = referenceCodeKey(row.CourseCode), dept = sectionCodes.get(Number(row.AdSectionId)) || "";
      return /^\d{1,3}$/.test(code) && /^\d{4}$/.test(dept) ? `${dept}${code.padStart(3, "0")}` : code;
    };
    const knownIdByCode = new Map<string, number>(), memberIdByCode = new Map<string, number>();
    for (const row of courses) if (Number(row.AdCollegeId) === cid) knownIdByCode.set(keyOf(row), Number(row.AdCourseId));
    const members = new Set<number>((await Repository.getCurriculumPlanCourses(sid)).filter(link => link.planId === plan!.id).map(link => Number(link.AdCourseId)));
    for (const course of inBranch) {
      const row = courses.find(item => Number(item.AdSectionId) === sid && numberOf(item.CourseCode) === Number(course.number));
      if (!row) continue;
      memberIdByCode.set(course.codeKey, Number(row.AdCourseId));
      if (!members.has(Number(row.AdCourseId))) { await Repository.addCourseToCurriculumPlan(plan.id, row, by); report.linked += 1; }
    }

    /* 3) مسوّدة القواعد: لا تُعتمد (يعتمدها القسم)، ولا تمحو ما كتبه. متطلباتُ الأقسام الأخرى تدخل مقفولةً للقراءة. */
    const externalIdByCode = new Map<string, number>();
    for (const group of reference.groups) for (const course of group.courses) for (const need of course.prerequisites) {
      const id = knownIdByCode.get(referenceCodeKey(need));
      if (id && !memberIdByCode.has(need)) externalIdByCode.set(need, id);
    }
    const ruleScope = new Map<string, number>([...memberIdByCode, ...externalIdByCode]);
    const built = buildReferenceRules(reference, memberIdByCode, ruleScope.size ? new Map([...knownIdByCode, ...ruleScope]) : knownIdByCode, new Set());
    const live = await Repository.getRuleSet(plan.id);
    const allIds = new Set<number>(ruleScope.values());
    const externalIds = [...externalIdByCode.values()];
    await Repository.updateRuleDraft(plan.id, current => {
      const base: CurriculumRuleSet = current ? { ...current } : { id: plan!.id, planId: plan!.id, AdCollegeId: cid, AdSectionId: sid, rules: live?.rules || [], groups: live?.groups || [], externals: live?.externals, version: live?.version || 0, status: "review", basedOnVersion: live?.version || 0, updatedAt: "", updatedBy: by };
      const hasRule = new Set(base.rules.map(rule => rule.courseId));
      const hasGroup = new Set(base.groups.map(group => group.id));
      const rules = normalizeRules([...base.rules, ...built.rules.filter(rule => !hasRule.has(rule.courseId))]);
      const groups = [...base.groups, ...built.groups.filter(group => !hasGroup.has(group.id)).map(group => normalizeGroup({ ...group, courseIds: group.courseIds.filter(id => allIds.has(id)) })).filter(Boolean) as ElectiveGroup[]];
      const externals = [...new Set([...(base.externals || []), ...externalIds])].sort((a, b) => a - b);
      return { ...base, rules: withDerivedGroups(rules, groups), groups, externals, status: "review", updatedAt: new Date().toISOString(), updatedBy: `رفع الصحيفة · ${by}` };
    });
    report.rules = built.rules.length; report.groups = built.groups.length;
    notes.push(...built.notes.slice(0, 20));
    res.locals.auditChanges = `رفع الخطة الدراسية ${sheet.program} لقسم ${String(target.AdSectionName || "").trim()}: ${countOf(report.created, AR.course)} جديدة، ${countOf(report.updated, AR.course)} مصحَّحة، تصحيح ${fixes.length} من الأسماء`;
    res.json({ ok: true, program: sheet.program, planId: plan.id, planName: plan.name, planCreated, ...report, nameFixes: fixes, notes: notes.slice(0, 30) });
  });

  /* ── استيراد الصحائف: إدارةُ النظام وحدها، ويُنشئ مسوّداتٍ لا يعتمد شيئاً ────── */
  app.post("/api/plan-review/import", deps.requireAuth, async (req: Request, res: Response) => {
    if (!deps.isRootAdmin(req)) { fail(res, 403, "استيراد قواعد الصحائف مخصص لحساب الإدارة الرئيسي."); return; }
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
