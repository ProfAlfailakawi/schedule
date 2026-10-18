/**
 * ── نشر الصحيفة للعامة: رابطٌ وQR وPDF لكل قسمٍ يعتمد خطته ───────────────────
 *
 * رئيس لجنة الجدول (وإدارة النظام) ينشر الصحيفة **المعتمدة** من داخل البرنامج؛ فيحفظ الخادمُ لقطةً نهائية
 * منها ويرسمها صفحةً تفاعلية بالتصميم المعتمد لقسم تكنولوجيا التعليم، بلا حسابٍ ولا شعار:
 *
 *   /plans/                       فهرسُ الأقسام التي نشرت
 *   /plans/s<قسم>/                صحائفُ القسم (صفحةٌ واحدة تفتح مباشرةً إن كانت له صحيفةٌ واحدة)
 *   /plans/s<قسم>/<صحيفة>/        الصحيفةُ التفاعلية، وزرُّ «تحميل PDF» (طباعةٌ A3 من الصفحة نفسها)
 *
 * حدودٌ لا تُكسر:
 *   · لا يُنشر إلا ما اعتُمد؛ لا مسوّدةٌ ولا قيدَ مراجعة.
 *   · القسمُ يرى مقرراتِه فقط (قاعدة الصحائف الثابتة): مقررُ قسمٍ آخر ملاحظةٌ لا بطاقةٌ ولا سهم.
 *   · اللقطةُ مستقلة: مسحُ الخطة بعد الاعتماد لا يُسقط الصفحة المنشورة، وإيقافُ النشر يُسقطها.
 *   · رمزُ QR يحمل الدومين الرسمي دائماً.
 */
import type { Express, Request, RequestHandler, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { Repository } from "../db/repository";
import type { AdCourse, CurriculumRuleSet, PublishedPlanSheet, SheetModel } from "../types";
import { roleDefinition } from "../utils/academicRoles";
import { byLevel } from "../utils/curriculumRules";
import { isTechnologyEducation, referenceCodeKey } from "../utils/curriculumReference";
import { buildPlanSheet } from "./planSheetPage";
import { REFERENCE_CATEGORIES } from "./planReviewRoutes";
import { AR, countOf } from "../utils/arabicCount";
import { familyOf, groupDeptTracks, planMatchKey, trackLabels, trackOf, TRACK_LABEL, type DeptTrack } from "../utils/collegeTrack";

export interface PlanSheetDeps {
  requireAuth: RequestHandler;
  isScopeAllowed: (req: any, collegeId: number, sectionId: number) => boolean;
  isPowerUser: (req: any) => boolean;
  actorName: (req: any) => string;
  /** قالبُ الصفحة (public/plans/_template/sheet.html) يُقرأ مرةً عند الإقلاع. */
  template: string;
}

/* الدومين الرسمي الثابت (AGENTS.md)؛ لا متغيّرَ بيئةٍ يغيّره، فلا يحمل QR مطبوعٌ عنواناً آخر. */
const OFFICIAL_ORIGIN = "https://schedule-kw.com";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tail = (code: string) => (/^\d{7}$/.test(code) ? code.slice(-3) : code);
const deptTitle = (name: string) => (/^قسم\s/.test(name.trim()) ? name.trim() : `قسم ${name.trim()}`);

export const sheetUrl = (sectionId: number, planId: string) => `${OFFICIAL_ORIGIN}/plans/s${sectionId}/${encodeURIComponent(planId)}/`;

/** يبني لقطة الصحيفة من قواعدها المعتمدة: مقرراتُ القسم وحدها، والمتطلباتُ الخارجية ملاحظات. */
export async function buildSheetModel(plan: { id: string; AdCollegeId: number; AdSectionId: number; name: string }, live: CurriculumRuleSet): Promise<{ model: SheetModel; sectionName: string }> {
  const sectionId = Number(plan.AdSectionId);
  const [courses, links, sections] = await Promise.all([
    Repository.getCourses(), Repository.getCurriculumPlanCourses(sectionId), Repository.getSections(),
  ]);
  const section = (sections as any[]).find(row => Number(row.AdSectionId) === sectionId);
  const sectionName = String(section?.AdSectionName || "");
  const catalog = new Map((courses as AdCourse[]).map(course => [Number(course.AdCourseId), course]));
  const ownerName = new Map((sections as any[]).map(row => [Number(row.AdSectionId), String(row.AdSectionName || "")]));
  const memberIds = [...new Set(links.filter(link => link.planId === plan.id).map(link => Number(link.AdCourseId)))];
  const isOwn = (id: number) => Number(catalog.get(id)?.AdSectionId) === sectionId;
  const own = memberIds.filter(isOwn);
  const ownSet = new Set(own);
  const codeOf = (id: number) => String(catalog.get(id)?.CourseCode || "");
  const nameOf = (id: number) => String(catalog.get(id)?.CourseName || `مقرر ${id}`);
  const creditOf = (id: number) => Number(catalog.get(id)?.CourseCredit) || 0;

  /* التصنيف كما تكتبه الصحيفة (لقسم له صحيفةٌ مرجعية) فقط. */
  const categorized = isTechnologyEducation(sectionName);
  const ownerCodes = new Map((sections as any[]).map(row => [Number(row.AdSectionId), referenceCodeKey(row.AdSectionCode).padStart(2, "0")]));
  const categoryOf = (id: number) => {
    if (!categorized) return "";
    const key = referenceCodeKey(codeOf(id)), owner = ownerCodes.get(sectionId) || "";
    return REFERENCE_CATEGORIES.byCode.get(/^\d{1,3}$/.test(key) && /^\d{2}$/.test(owner) ? `01${owner}${key.padStart(3, "0")}` : key) || "";
  };

  const groups = (live.groups || []).map(group => ({ group, ids: group.courseIds.filter(id => ownSet.has(id)) })).filter(entry => entry.ids.length);
  const grouped = new Set(groups.flatMap(entry => entry.ids));
  const mapIds = own.filter(id => !grouped.has(id));
  const levels = byLevel(mapIds, live.rules, new Map(mapIds.map(id => [id, codeOf(id)])));
  const levelOf = new Map<number, number>();
  for (const [level, ids] of levels) for (const id of ids) levelOf.set(id, level);

  const visible = new Set<number>([...mapIds, ...grouped]);
  /* مقرراتُ الصحيفة التي لا تُرسم (أقسامٌ أخرى ومتطلباتٌ عامة) تبقى في مجموع وحدات التخرج. */
  /* خياراتُ مجموعات الاختيار لا تُجمع كلُّها: يُحسب منها حدُّ المجموعة وحده (ما كان بين مقرراتها لقسمٍ آخر)، وإلا ظهر
     مجموعُ التخرّج أكبر من المطبوع (112 بدل 75). مجموعةٌ لا مقرر لقسم الصحيفة فيها تدخل بحدّها الأدنى. */
  const inGroup = new Set((live.groups || []).flatMap(group => group.courseIds));
  const foreignIds = [...new Set([...memberIds.filter(id => !isOwn(id)), ...(live.externals || []).map(Number)])].filter(id => id > 0 && !isOwn(id));
  const groupedForeign = (live.groups || []).filter(group => !group.courseIds.some(id => ownSet.has(id)) && group.courseIds.some(id => foreignIds.includes(id))).reduce((sum, group) => sum + (Number(group.minUnits) || 0), 0);
  const otherUnits = foreignIds.filter(id => !inGroup.has(id)).reduce((sum, id) => sum + creditOf(id), 0) + groupedForeign;
  const edgeKeys = new Set<string>(), edges: Array<[string, string]> = [];
  const notes: string[] = [];
  const anyOf: Array<[string, string[]]> = [];
  const minUnits: Record<string, number> = {};
  const label = (id: number) => `${tail(codeOf(id))} «${nameOf(id)}»${ownSet.has(id) ? "" : (ownerName.get(Number(catalog.get(id)?.AdSectionId)) ? ` من ${ownerName.get(Number(catalog.get(id)?.AdSectionId))}` : "")}`;
  for (const rule of live.rules) {
    if (!visible.has(rule.courseId)) continue;
    const mine = tail(codeOf(rule.courseId));
    const link = (id: number) => { const key = `${id}>${rule.courseId}`; if (!edgeKeys.has(key)) { edgeKeys.add(key); edges.push([codeOf(id), codeOf(rule.courseId)]); } };
    for (const id of new Set(rule.prereq?.all || [])) { if (visible.has(id)) link(id); else notes.push(`المقرر ${mine} يتطلب أيضاً المقرر ${label(id)}.`); }
    for (const group of rule.prereq?.anyOf || []) {
      const inside = group.filter(id => visible.has(id)), outside = group.filter(id => !visible.has(id));
      for (const id of inside) link(id);
      /* «أحدها يكفي» يبقى أحدها: بدائلُ الخريطة مجموعةٌ واحدة، وما خرج منها يُذكر معها في الملاحظة نفسها. */
      if (inside.length && (inside.length > 1 || outside.length)) anyOf.push([codeOf(rule.courseId), inside.map(codeOf)]);
      if (outside.length) notes.push(`المقرر ${mine} يتطلب أحد المقررات: ${group.map(label).join(" أو ")}.`);
    }
    const units = Number(rule.prereq?.minUnits) || 0;
    if (units > 0) { minUnits[codeOf(rule.courseId)] = units; notes.push(`المقرر ${mine} يتطلب اجتياز ${countOf(units, AR.unit)} على الأقل.`); }
    for (const id of new Set(rule.coreq || [])) if (!visible.has(id)) notes.push(`المقرر ${mine} يُسجَّل معه المقرر ${label(id)} في الفصل نفسه (أو سبق اجتيازه).`);
  }

  const model: SheetModel = {
    title: deptTitle(sectionName || "القسم"),
    planLabel: String(plan.name || "").replace(/^خطة\s+/, "").trim() || "الخطة الدراسية",
    courses: mapIds.map(id => ({ code: codeOf(id), name: nameOf(id), credit: creditOf(id), level: levelOf.get(id) || 0, category: categoryOf(id) || undefined })),
    groups: groups.map(({ group, ids }) => ({ title: group.name, pick: Math.max(0, Number(group.minCourses) || 0), minUnits: Math.max(0, Number(group.minUnits) || 0), courses: ids.map(id => ({ code: codeOf(id), name: nameOf(id), credit: creditOf(id) })) })),
    edges,
    anyOf,
    minUnits,
    otherUnits,
    notes,
    url: sheetUrl(sectionId, plan.id),
    layout: edges.length === 0 ? "wide" : "levels",
  };
  return { model, sectionName };
}

/** مساراتُ الأقسام (بنات بمواقعهنّ، بنين) من الكليات الحالية. */
async function deptTracks(): Promise<DeptTrack[]> {
  const [sections, colleges] = await Promise.all([Repository.getSections(), Repository.getColleges()]);
  return groupDeptTracks(sections as any[], colleges as any[]);
}

/** ينسخ لقطةَ صحيفة البنات الأصل كما هي إلى مواقعها الفرعية (الجهراء/الفحيحيل): يطابق صحيفتَها بالسنة أو بالاسم. */
async function mirrorSheet(sheet: PublishedPlanSheet, track: DeptTrack | undefined): Promise<{ done: number; unmatched: string[] }> {
  if (!track || !track.mirrors.length) return { done: 0, unmatched: [] };
  const plan = (await Repository.getCurriculumPlans(sheet.AdSectionId)).find(row => row.id === sheet.planId);
  const key = planMatchKey(String(plan?.name || sheet.planName));
  const colleges = new Map(((await Repository.getColleges()) as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  let done = 0; const unmatched: string[] = [];
  for (const mirror of track.mirrors) {
    const target = (await Repository.getCurriculumPlans(mirror.AdSectionId)).find(row => !row.virtual && row.status !== "archived" && planMatchKey(String(row.name || "")) === key);
    if (!target) { unmatched.push(colleges.get(Number(mirror.AdCollegeId)) || String(mirror.AdSectionId)); continue; }
    await Repository.savePublishedSheet({
      ...sheet, id: target.id, planId: target.id, AdCollegeId: Number(mirror.AdCollegeId), AdSectionId: Number(mirror.AdSectionId),
      planName: String(target.name || sheet.planName), model: { ...sheet.model, url: sheetUrl(Number(mirror.AdSectionId), target.id) }, mirrorOf: sheet.planId,
    });
    done += 1;
  }
  return { done, unmatched };
}

/** بعد اعتماد قواعدٍ جديدة: إن كانت الصحيفة منشورة تُعاد لقطتُها، ولا يُنشر ما لم يكن منشوراً. */
export async function republishIfPublished(planId: string, actor: string): Promise<boolean> {
  const current = await Repository.getPublishedSheet(planId);
  if (!current) return false;
  const [plans, live] = await Promise.all([Repository.getCurriculumPlans(current.AdSectionId), Repository.getRuleSet(planId)]);
  const plan = plans.find(row => row.id === planId);
  if (!plan || !live) return false;
  const { model, sectionName } = await buildSheetModel(plan, live);
  const fresh = { ...current, sectionName, planName: String(plan.name || ""), model, ruleVersion: Number(live.version) || 0, publishedAt: new Date().toISOString(), publishedBy: actor };
  await Repository.savePublishedSheet(fresh);
  if (!current.mirrorOf) await mirrorSheet(fresh, (await deptTracks()).find(track => track.canonical.AdSectionId === current.AdSectionId));
  return true;
}

const PAGE_CSS = `*{box-sizing:border-box}body{margin:0;background:#EEF4FF;color:#0B2545;font-family:'Cairo','Tajawal',system-ui,sans-serif;min-height:100dvh;padding:28px 16px 60px}
.w{max-width:960px;margin:0 auto}h1{margin:0 0 6px;font-size:clamp(26px,5vw,40px);font-weight:900}p.s{margin:0 0 26px;color:#475569;font-weight:500}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
a.c{display:flex;flex-direction:column;gap:6px;padding:18px 20px;border-radius:20px;background:#fff;border:1px solid #CBD5E1;color:inherit;text-decoration:none;box-shadow:0 6px 18px rgba(11,37,69,.08);transition:transform .15s,box-shadow .15s}
a.c:hover,a.c:focus-visible{transform:translateY(-2px);box-shadow:0 10px 24px rgba(11,37,69,.14);outline:none}
a.c b{font-size:19px;font-weight:900}a.c span{color:#475569;font-size:14px;font-weight:500}a.c i{align-self:flex-start;margin-top:4px;padding:3px 12px;border-radius:999px;background:#DBEAFE;color:#1D4ED8;font-style:normal;font-size:13px;font-weight:700}
.q{width:100%;margin:0 0 20px;padding:12px 16px;border-radius:14px;border:1px solid #CBD5E1;font:inherit;font-size:16px;background:#fff;color:inherit}
.e{padding:40px 12px;text-align:center;color:#475569}`;

const FONTS = ["500", "700", "900"].map(w => `@font-face{font-family:'Cairo';font-style:normal;font-weight:${w};font-display:swap;src:url('/plans/fonts/cairo-arabic-${w}-normal.woff2') format('woff2');unicode-range:U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE80-FEFC}@font-face{font-family:'Cairo';font-style:normal;font-weight:${w};font-display:swap;src:url('/plans/fonts/cairo-latin-${w}-normal.woff2') format('woff2');unicode-range:U+0000-00FF,U+2000-206F}`).join("");

const shell = (title: string, body: string, script = "") => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="robots" content="noindex,nofollow"><style>${FONTS}${PAGE_CSS}</style></head><body><div class="w">${body}</div>${script}</body></html>`;

const FILTER_SCRIPT = `<script>(function(){var q=document.getElementById('q');if(!q)return;q.addEventListener('input',function(){var t=q.value.trim();document.querySelectorAll('a.c').forEach(function(a){a.style.display=!t||a.textContent.indexOf(t)>=0?'':'none'})})})();</script>`;

export function registerPlanSheetRoutes(app: Express, deps: PlanSheetDeps): void {
  const roleId = (req: any): string => roleDefinition(req.user?.Role).id;
  const canPublish = (req: any, collegeId: number, sectionId: number) =>
    deps.isPowerUser(req) || (roleId(req) === "committeeChair" && deps.isScopeAllowed(req, collegeId, sectionId));
  const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

  const publicRead = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, message: "طلباتٌ كثيرة. انتظر قليلاً." });
  const publishLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: "عملياتُ نشرٍ كثيرة في وقتٍ قصير. انتظر قليلاً." } });

  /** ينشر صحيفةً معتمدة (يتحقق من الاعتماد والنطاق). */
  async function publishOne(req: any, planId: string, sectionId: number): Promise<{ sheet?: PublishedPlanSheet; status?: number; error?: string }> {
    const plans = await Repository.getCurriculumPlans(sectionId);
    const plan = plans.find(row => row.id === planId && Number(row.AdSectionId) === sectionId && !row.virtual && row.status !== "archived");
    if (!plan) return { status: 404, error: "الصحيفة غير موجودة." };
    if (!canPublish(req, Number(plan.AdCollegeId), sectionId)) return { status: 403, error: "نشر الصحائف لرئيس لجنة الجدول وحده، ضمن نطاقه." };
    const live = await Repository.getRuleSet(plan.id);
    if (!live) return { status: 409, error: "لا تُنشر إلا صحيفةٌ معتمدة؛ اعتمد قواعدها أولاً." };
    const { model, sectionName } = await buildSheetModel(plan, live);
    if (!model.courses.length && !model.groups.length) return { status: 409, error: "لا مقرراتَ لهذا القسم في الصحيفة لتُنشر." };
    const sheet: PublishedPlanSheet = {
      id: plan.id, planId: plan.id, AdCollegeId: Number(plan.AdCollegeId), AdSectionId: sectionId, sectionName,
      planName: String(plan.name || ""), model, ruleVersion: Number(live.version) || 0,
      publishedAt: new Date().toISOString(), publishedBy: deps.actorName(req),
    };
    await Repository.savePublishedSheet(sheet);
    return { sheet };
  }

  /* ── من داخل البرنامج: ما يمكن نشره وما نُشر ─────────────────────────────── */
  app.get("/api/plan-sheets", deps.requireAuth, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const [tracks, published] = await Promise.all([deptTracks(), Repository.listPublishedSheets()]);
    const labels = trackLabels(tracks);
    const publishedById = new Map(published.map(sheet => [sheet.id, sheet]));
    const rows: any[] = [];
    /* القسمُ المختار في مركز الذكاء (أصلاً أو موقعاً فرعياً) يُعاد ولو بلا صحيفةٍ معتمدة، ليشرح الواجهةُ أنّ الاعتماد مطلوب لا أن تُخفي لوحتَه. */
    const focusId = Number(req.query.section) || 0;
    for (const track of tracks) {
      const section = track.canonical, sectionId = Number(section.AdSectionId), collegeId = Number(section.AdCollegeId);
      const members = [section, ...track.mirrors].map(row => Number(row.AdSectionId));
      if (!canPublish(req, collegeId, sectionId)) continue;
      const plans = (await Repository.getCurriculumPlans(sectionId)).filter(plan => !plan.virtual && plan.status !== "archived");
      const sheets: any[] = [];
      for (const plan of plans) {
        const live = await Repository.getRuleSet(plan.id);
        if (!live) continue;
        const pub = publishedById.get(plan.id);
        sheets.push({ planId: plan.id, name: plan.name, ruleVersion: live.version, published: Boolean(pub), publishedAt: pub?.publishedAt || "", stale: Boolean(pub && pub.ruleVersion !== live.version), url: pub ? sheetUrl(sectionId, plan.id) : "" });
      }
      if (sheets.length || members.includes(focusId)) rows.push({
        sectionId, sectionName: String(section.AdSectionName || ""), label: labels.get(track.key) || String(section.AdSectionName || ""), family: track.family, track: track.track, trackLabel: track.track ? TRACK_LABEL[track.track] : "", collegeName: track.collegeName,
        members, campuses: track.mirrors.length, sheets, deptUrl: `${OFFICIAL_ORIGIN}/plans/s${sectionId}/`, indexUrl: `${OFFICIAL_ORIGIN}/plans/`,
      });
    }
    res.json({ sections: rows, canPublish: rows.length > 0 || deps.isPowerUser(req) });
  });

  /* نشرُ صحيفةٍ واحدة، أو كلِّ صحائف قسمٍ، أو كلِّ ما يملكه الحساب من صحائفَ معتمدة. */
  app.post("/api/plan-sheets/publish", deps.requireAuth, publishLimit, async (req: Request, res: Response) => {
    const body = req.body || {};
    const targets: Array<{ planId: string; sectionId: number }> = [];
    if (body.planId) targets.push({ planId: String(body.planId), sectionId: Number(body.sectionId || 0) });
    else {
      /* الأصلُ وحدَه يُنشر؛ مواقعُ البنات الفرعية تُنسخ منه فلا تُنشر من قواعدها. */
      const sections = (await deptTracks()).map(track => track.canonical) as any[];
      const wanted = body.sectionId ? sections.filter(row => Number(row.AdSectionId) === Number(body.sectionId)) : sections;
      for (const section of wanted) {
        const sectionId = Number(section.AdSectionId);
        if (!canPublish(req, Number(section.AdCollegeId), sectionId)) continue;
        for (const plan of (await Repository.getCurriculumPlans(sectionId)).filter(row => !row.virtual && row.status !== "archived")) targets.push({ planId: plan.id, sectionId });
      }
    }
    if (!targets.length) return fail(res, 404, "لا صحائف في نطاقك لتُنشر.");
    const done: Array<{ planId: string; url: string }> = [], skipped: Array<{ planId: string; reason: string }> = [];
    const tracks = await deptTracks();
    let copied = 0; const unmatched = new Set<string>();
    for (const target of targets) {
      const result = await publishOne(req, target.planId, target.sectionId);
      if (result.sheet) {
        done.push({ planId: target.planId, url: sheetUrl(result.sheet.AdSectionId, target.planId) });
        const mirrored = await mirrorSheet(result.sheet, tracks.find(track => track.canonical.AdSectionId === result.sheet!.AdSectionId));
        copied += mirrored.done; mirrored.unmatched.forEach(name => unmatched.add(name));
      }
      else if (body.planId) return fail(res, result.status || 400, result.error || "تعذّر النشر.");
      else skipped.push({ planId: target.planId, reason: result.error || "" });
    }
    if (!done.length) return fail(res, 409, "لا صحيفةَ معتمدة في هذا النطاق لتُنشر.");
    res.locals.auditChanges = `نشر ${countOf(done.length, AR.sheet)} للعامة` + (copied ? ` ونسخها إلى ${countOf(copied, AR.sheet)} في مواقع البنات` : "");
    res.json({ published: done, skipped, copiedToCampuses: copied, unmatchedCampuses: [...unmatched] });
  });

  app.post("/api/plan-sheets/unpublish", deps.requireAuth, publishLimit, async (req: Request, res: Response) => {
    const planId = String(req.body?.planId || "");
    const sheet = await Repository.getPublishedSheet(planId);
    if (!sheet) return fail(res, 404, "هذه الصحيفة غير منشورة.");
    if (!canPublish(req, sheet.AdCollegeId, sheet.AdSectionId)) return fail(res, 403, "إيقاف النشر لرئيس لجنة الجدول وحده، ضمن نطاقه.");
    await Repository.deletePublishedSheet(planId);
    for (const copy of (await Repository.listPublishedSheets()).filter(row => row.mirrorOf === planId)) await Repository.deletePublishedSheet(copy.id);
    res.locals.auditChanges = `إيقاف نشر صحيفة «${sheet.sectionName} — ${sheet.planName}»`;
    res.json({ ok: true });
  });

  /* ── الصفحات العامة: بلا حساب ─────────────────────────────────────────────── */
  const noStore = (res: Response) => { res.setHeader("Cache-Control", "no-cache"); res.setHeader("X-Robots-Tag", "noindex"); };
  const sectionIdOf = (raw: unknown): number => { const m = /^s(\d{1,9})$/.exec(String(raw || "")); return m ? Number(m[1]) : 0; };
  const byDept = (sheets: PublishedPlanSheet[]) => {
    const map = new Map<number, PublishedPlanSheet[]>();
    for (const sheet of sheets) map.set(sheet.AdSectionId, [...(map.get(sheet.AdSectionId) || []), sheet]);
    return map;
  };

  app.get("/plans/", publicRead, async (_req: Request, res: Response, next) => {
    try {
      noStore(res);
      /* نُسَخُ الجهراء والفحيحيل تُفتح برابطها المباشر ولا تتكرر بطاقاتٍ في الفهرس. */
      const [published, colleges] = await Promise.all([Repository.listPublishedSheets(), Repository.getColleges()]);
      const groups = byDept(published.filter(sheet => !sheet.mirrorOf));
      const collegeName = new Map((colleges as any[]).map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
      /* القسمُ نفسُه للبنات وللبنين: يُضاف المسارُ إلى العنوان ليتميّزا. */
      const families = new Map<string, Set<string>>(), names = new Map<string, number>();
      for (const [, list] of groups) {
        const name = list[0].sectionName;
        names.set(name, (names.get(name) || 0) + 1);
        families.set(name, new Set([...(families.get(name) || []), familyOf(collegeName.get(list[0].AdCollegeId) || "")]));
      }
      /* القسمُ نفسُه في عائلة كلياتٍ أخرى (التمريض…) له صحيفتُه المستقلة: تُضاف الكلية والمسارُ ليتميّز. */
      const cardTitle = (list: PublishedPlanSheet[]) => {
        const college = collegeName.get(list[0].AdCollegeId) || "", track = trackOf(college), name = list[0].sectionName;
        const family = (families.get(name)?.size || 0) > 1 ? familyOf(college).replace(/^كلية\s+/, "") : "";
        return [deptTitle(name), family, (names.get(name) || 0) > 1 && track ? TRACK_LABEL[track] : ""].filter(Boolean).join(" — ");
      };
      /* صفحةُ قسم تكنولوجيا التعليم الأولى ثابتةٌ: تبقى في الفهرس ما لم يُنشر القسمُ من البرنامج. */
      const hasTech = [...groups.values()].some(list => isTechnologyEducation(list[0].sectionName));
      const cards = [...groups.entries()].sort((a, b) => a[1][0].sectionName.localeCompare(b[1][0].sectionName, "ar")).map(([sectionId, list]) =>
        `<a class="c" href="/plans/s${sectionId}/"><b>${esc(cardTitle(list))}</b><span>${esc(list.length === 1 ? list[0].planName : countOf(list.length, AR.sheet))}</span><i>افتح الخطة</i></a>`);
      if (!hasTech) cards.unshift(`<a class="c" href="/plans/educational-technology/"><b>قسم تكنولوجيا التعليم</b><span>الخطة الدراسية</span><i>افتح الخطة</i></a>`);
      res.type("text/html; charset=utf-8").send(shell("الخطط الدراسية", `<h1>الخطط الدراسية</h1><p class="s">اختر القسم لتفتح خطته التفاعلية وتحمّلها PDF.</p>${cards.length > 6 ? '<input id="q" class="q" type="search" placeholder="ابحث عن قسم" aria-label="ابحث عن قسم">' : ""}<div class="g">${cards.join("") || '<div class="e">لم تُنشر خططٌ بعد.</div>'}</div>`, FILTER_SCRIPT));
    } catch (error) { next(error); }
  });

  app.get("/plans/:dept/", publicRead, async (req: Request, res: Response, next) => {
    try {
      const sectionId = sectionIdOf(req.params.dept);
      if (!sectionId) return next(); /* مجلداتٌ ثابتة (educational-technology، fonts) تُخدم من الملفات */
      noStore(res);
      const list = (await Repository.listPublishedSheets()).filter(sheet => sheet.AdSectionId === sectionId).sort((a, b) => a.planName.localeCompare(b.planName, "ar"));
      if (!list.length) return res.status(404).type("text/html; charset=utf-8").send(shell("غير منشورة", `<div class="e"><h1>لا خطة منشورة</h1><p>لم يُنشر لهذا القسم شيء بعد.</p><p><a href="/plans/">الخطط الدراسية</a></p></div>`));
      if (list.length === 1) return res.redirect(302, `/plans/s${sectionId}/${encodeURIComponent(list[0].planId)}/${req.query.pdf === "1" ? "?pdf=1" : ""}`);
      const cards = list.map(sheet => `<a class="c" href="/plans/s${sectionId}/${encodeURIComponent(sheet.planId)}/"><b>${esc(sheet.planName || "الخطة الدراسية")}</b><span>${countOf(sheet.model.courses.length + sheet.model.groups.reduce((n, g) => n + g.courses.length, 0), AR.course)}</span><i>افتح الخطة</i></a>`);
      res.type("text/html; charset=utf-8").send(shell(`خطط ${deptTitle(list[0].sectionName)}`, `<h1>${esc(deptTitle(list[0].sectionName))}</h1><p class="s">اختر الصحيفة.</p>${cards.length > 6 ? '<input id="q" class="q" type="search" placeholder="ابحث عن صحيفة" aria-label="ابحث عن صحيفة">' : ""}<div class="g">${cards.join("")}</div>`, FILTER_SCRIPT));
    } catch (error) { next(error); }
  });

  app.get("/plans/:dept/:plan/", publicRead, async (req: Request, res: Response, next) => {
    try {
      const sectionId = sectionIdOf(req.params.dept);
      if (!sectionId) return next();
      noStore(res);
      const sheet = await Repository.getPublishedSheet(String(req.params.plan || ""));
      if (!sheet || sheet.AdSectionId !== sectionId) return res.status(404).type("text/html; charset=utf-8").send(shell("غير منشورة", `<div class="e"><h1>الخطة غير منشورة</h1><p><a href="/plans/">الخطط الدراسية</a></p></div>`));
      res.type("text/html; charset=utf-8").send(buildPlanSheet({ ...sheet.model, url: sheetUrl(sheet.AdSectionId, sheet.planId) }, { template: deps.template }));
    } catch (error) { next(error); }
  });
}
