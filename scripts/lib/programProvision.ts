/**
 * ── تجهيز برنامجٍ دراسي لكليةٍ جديدة: الصحيفةُ بمسبقاتها وحساباتُ كل الأدوار ──────────────
 *
 * كلية صديقة تريد استخدام النظام: صحيفةُ برنامجها (مرجعٌ من كشف SWRCAPP) تُحمَّل كما هي،
 * وحساباتُ الأدوار كلّها تُنشأ **على كليتها وحدها** (بنين فقط)، بطريقة سكربتات التجهيز السابقة:
 *
 *   • معاينةٌ افتراضياً: لا يُكتب شيء إلا مع apply.
 *   • الكلية لا تُنشأ ولا تُخمَّن: تُحدَّد بالاسم («الدراسات التكنولوجية» + «بنين») أو برقمها؛
 *     وإن التبس الأمر أو غابت تُعرض الخيارات ويتوقف السكربت.
 *   • الأقسام الناقصة (قسم البرنامج وأقسام المقررات المساندة) لا تُنشأ إلا بأسماءٍ يزوّدها صاحب
 *     النظام؛ بلا اسم لا نخترع اسمَ قسم.
 *   • المقرر القائم لا يُعدَّل. والصحيفةُ تُربط بمقررات قسم البرنامج وحدها؛ ومقرراتُ الأقسام الأخرى
 *     متطلباتٌ عامة (externals) تُقرأ ولا تُربط.
 *   • القواعد تُحفظ «قيد المراجعة»: يعتمدها رئيس لجنة الجدول من «مراجعة الصحيفة» ثم تُنشر خريطتُها.
 *   • الحساب يُنشأ موقوفاً وبلا كلمة سر (يضعها المدير ويفعّله من شاشة المستخدمين)، والقائم لا يُمسّ.
 *
 * آمنٌ لإعادة التشغيل.
 */
import type { CurriculumReference } from "../../src/data/technologyEducationCurricula";
import { ACADEMIC_ROLES } from "../../src/utils/academicRoles";
import { buildReferenceRules } from "../../src/utils/referenceApply";
import { referenceCodeKey } from "../../src/utils/curriculumReference";

export interface ProvisionOptions {
  apply: boolean;
  /** رقم الكلية صراحةً (وإلا تُستنتج من الاسم). */
  collegeId?: number;
  /** تُنشأ الكلية بهذا الرمز والاسم إن لم توجد (لا تُنشأ بغير هذا الخيار الصريح، ولا إن وُجدت). */
  createCollege?: { code: string; name: string };
  /** كلمة سرٍّ افتراضية: تُفعَّل بها حساباتُ هذه الأداة (الجديدة، أو المُنشأة سابقاً وما زالت بلا كلمة سر) ولا يُمسّ حسابٌ سواها. */
  password?: string;
  /** نصٌّ يجب أن يرد في اسم الكلية؛ الافتراضي: الدراسات التكنولوجية. */
  collegeMatch?: string[];
  /** بادئة اسم الدخول: `tsb` ← tsbdean، tsbhead… */
  prefix: string;
  /** اسم القسم لكل رمز قسمٍ غائب عن الكلية (30=اللغة الإنجليزية…). */
  deptNames?: Record<string, string>;
  actor?: string;
  log?: (line: string) => void;
}

export interface ProvisionReport {
  ok: boolean;
  error?: string;
  college?: { id: number; name: string };
  collegeToCreate?: { code: string; name: string };
  sectionsToCreate: Array<{ code: string; name: string }>;
  sectionsMissingName: string[];
  coursesToCreate: number;
  coursesExisting: number;
  planStatus: "exists" | "created" | "will-create";
  draftStatus: "kept" | "written" | "will-write";
  accounts: Array<{ login: string; role: string; scope: string; status: "exists" | "created" | "completed" | "activated" | "will-create" }>;
  wrote: boolean;
}

/** اسم الدخول لكل صفة: لاحقةٌ ثابتة بعد البادئة. */
export const ROLE_LOGIN_SUFFIX: Record<string, string> = {
  dean: "dean", viceDean: "vicedean", registrarDean: "registrardean", registrarHead: "registrarhead", registrarStaff: "registrarstaff",
  departmentHead: "head", advisor: "advisor", committeeChair: "dept", standard: "user",
};
/** صفاتُ القسم تُقيَّد بقسم البرنامج؛ وما سواها بالكلية كلِّها (قسم صفر) — ولا شيء خارج هذه الكلية. */
const SECTION_ROLES = new Set(["departmentHead", "advisor", "committeeChair"]);

const localOf = (code: string) => code.slice(-3);
const deptOf = (code: string) => code.slice(2, 4);

export async function provisionProgram(Repository: any, ref: CurriculumReference & { department: string; departmentCode: string; college: string }, options: ProvisionOptions): Promise<ProvisionReport> {
  const log = options.log || (() => undefined);
  const actor = options.actor || `تجهيز ${ref.program}`;
  const report: ProvisionReport = { ok: false, sectionsToCreate: [], sectionsMissingName: [], coursesToCreate: 0, coursesExisting: 0, planStatus: "will-create", draftStatus: "will-write", accounts: [], wrote: false };

  /* ١. الكلية: صريحةً أو بالاسم؛ وتُنشأ فقط إن طُلب ذلك صراحةً ولم توجد. */
  const colleges = (await Repository.getColleges()) as any[];
  const match = options.collegeMatch || [ref.college.replace(/^كلية\s+/, ""), "بنين"];
  let candidates = options.collegeId
    ? colleges.filter(row => Number(row.AdCollegeId) === options.collegeId)
    : colleges.filter(row => match.every(part => String(row.AdCollegeName || "").includes(part)));
  if (!candidates.length && !options.collegeId && options.createCollege) {
    const { code, name } = options.createCollege;
    if (colleges.some(row => String(row.AdCollegeCode) === code)) {
      report.error = `رمز الكلية ${code} مستخدم لكليةٍ أخرى — مرّر --college-code=<رمز آخر> أو --college=<رقم الكلية القائمة>.`;
      return report;
    }
    report.collegeToCreate = { code, name };
    /* المعاينة تمضي على كليةٍ افتراضية (رقم 0) فتُعدّ كل أقسامها ومقرراتها جديدة؛ والتنفيذ ينشئها فعلاً. */
    candidates = options.apply ? [await Repository.createCollege(code, name)] : [{ AdCollegeId: 0, AdCollegeName: name }];
    if (options.apply) log(`+ كلية ${name} [${code}]`);
  }
  if (candidates.length !== 1) {
    report.error = candidates.length
      ? `التبس تحديد الكلية (${candidates.map(row => `${row.AdCollegeId}: ${row.AdCollegeName}`).join(" | ")}) — مرّر --college=<الرقم>.`
      : `لا كلية مسجّلة باسم يحوي «${match.join("» و«")}» — أضفها من شاشة الكليات أو أنشئها بخيار --create-college أو مرّر --college=<الرقم>.`;
    return report;
  }
  const college = candidates[0];
  const collegeId = Number(college.AdCollegeId);
  report.college = { id: collegeId, name: String(college.AdCollegeName) };
  log(`الكلية: ${college.AdCollegeName} (${collegeId})`);

  /* ٢. الأقسام: قسم البرنامج وأقسام المقررات المساندة، بالرمز داخل هذه الكلية. */
  const allCourses = ref.groups.flatMap(group => group.courses);
  const ownCode = ref.departmentCode;
  const deptCodes = [...new Set(allCourses.map(course => deptOf(course.code)))];
  let sections = ((await Repository.getSections()) as any[]).filter(row => Number(row.AdCollegeId) === collegeId);
  const sectionByCode = new Map(sections.map(row => [referenceCodeKey(row.AdSectionCode).padStart(2, "0"), row]));
  const names: Record<string, string> = { ...(options.deptNames || {}), [ownCode]: (options.deptNames || {})[ownCode] || ref.department };
  for (const code of deptCodes) {
    if (sectionByCode.has(code)) continue;
    if (names[code]) report.sectionsToCreate.push({ code, name: names[code] });
    else report.sectionsMissingName.push(code);
  }
  if (report.sectionsMissingName.length) {
    report.error = `أقسامٌ غائبة عن الكلية ولا اسم لها: ${report.sectionsMissingName.join("، ")} — مرّر --dept=<الرمز>=<الاسم> لكلٍّ منها (لا يُخمَّن اسمُ قسم).`;
    return report;
  }

  /* ٣. ما سيُكتب في المعاينة والتنفيذ. */
  const courses = (await Repository.getCourses()) as any[];
  const hasCourse = (sectionId: number | undefined, code: string) => Boolean(sectionId) && courses.some(row => Number(row.AdSectionId) === sectionId && (referenceCodeKey(row.CourseCode) === localOf(code) || referenceCodeKey(row.CourseCode) === code));
  for (const course of allCourses) {
    const section = sectionByCode.get(deptOf(course.code));
    if (hasCourse(section ? Number(section.AdSectionId) : undefined, course.code)) report.coursesExisting++; else report.coursesToCreate++;
  }
  const ownSectionNow = sectionByCode.get(ownCode);
  const plans = ownSectionNow ? ((await Repository.getCurriculumPlans(Number(ownSectionNow.AdSectionId))) as any[]) : [];
  const planCode = `${ref.program}-${ref.effectiveTerm.slice(0, 4)}`;
  const existingPlan = plans.find(row => row.code === planCode);
  report.planStatus = existingPlan ? "exists" : "will-create";
  const users = ((await Repository.getUsers()) as any[]).filter(row => !row.IsDeleted);
  const byLogin = new Map(users.map(row => [String(row.SystemUserLogin).toLowerCase(), row]));
  const roles = ACADEMIC_ROLES.filter(role => ROLE_LOGIN_SUFFIX[role.id]);
  for (const role of roles) {
    const login = `${options.prefix}${ROLE_LOGIN_SUFFIX[role.id]}`;
    report.accounts.push({ login, role: role.id, scope: SECTION_ROLES.has(role.id) ? `${college.AdCollegeName} · ${names[ownCode]}` : String(college.AdCollegeName), status: byLogin.has(login.toLowerCase()) ? "exists" : "will-create" });
  }
  if (!options.apply) { report.ok = true; return report; }

  /* ── التنفيذ ─────────────────────────────────────────────────────────── */
  for (const row of report.sectionsToCreate) {
    const created = await Repository.createSection(collegeId, row.code, row.name);
    sectionByCode.set(row.code, created);
    log(`+ قسم ${row.name} [${row.code}]`);
  }
  const own = sectionByCode.get(ownCode);
  const ownSectionId = Number(own.AdSectionId);
  const ownHadCourses = courses.some(row => Number(row.AdSectionId) === ownSectionId);

  /* الصحيفة قبل المقررات: أولُ صحيفةٍ تُنشئ «السابقة» تلقائياً من مقررات القسم الحالية؛ وقسمٌ بلا مقرراتٍ سابقة
     تكون سابقتُه فارغة فتُؤرشف حتى لا يُسأل الطالب «السابقة أم الجديدة؟». */
  let plan = existingPlan;
  if (!plan) {
    plan = await Repository.createCurriculumPlan({ collegeId, sectionId: ownSectionId, name: `صحيفة ${ref.program} ${ref.effectiveTerm.slice(0, 4)}/${Number(ref.effectiveTerm.slice(0, 4)) + 1}`, code: planCode, by: actor });
    report.planStatus = "created";
    log(`+ صحيفة ${plan.name}`);
    if (!plans.length && !ownHadCourses) {
      const legacy = ((await Repository.getCurriculumPlans(ownSectionId)) as any[]).find(row => row.code === "LEGACY" && row.status === "transition");
      if (legacy) { await Repository.archiveCurriculumPlan(legacy.id, ownSectionId, actor); log("~ أُرشفت «السابقة» الفارغة"); }
    }
  }

  let known = (await Repository.getCourses()) as any[];
  const idByCode = new Map<string, number>();
  const memberOwn = new Map<string, number>();
  for (const course of allCourses) {
    const section = sectionByCode.get(deptOf(course.code));
    const sectionId = Number(section.AdSectionId);
    let row = known.find(item => Number(item.AdSectionId) === sectionId && (referenceCodeKey(item.CourseCode) === localOf(course.code) || referenceCodeKey(item.CourseCode) === course.code));
    if (!row) {
      row = await Repository.createCourse(collegeId, sectionId, localOf(course.code), course.name, course.credit, course.hours, 0, false);
      known = [...known, row];
    }
    idByCode.set(course.code, Number(row.AdCourseId));
    if (deptOf(course.code) === ownCode) {
      memberOwn.set(course.code, Number(row.AdCourseId));
      await Repository.addCourseToCurriculumPlan(plan.id, row, actor);
    }
  }
  const externals = [...idByCode].filter(([code]) => deptOf(code) !== ownCode).map(([, id]) => id);

  const built = buildReferenceRules(ref, memberOwn, idByCode, new Set());
  /* مجموعاتُ الاختيار تضمّ كلَّ مقرراتها (ولو لقسمٍ آخر) ليُحسب تقدّمُ الطالب منها كلِّها. */
  const groups = built.groups.map(group => {
    const source = ref.groups.find(row => `${ref.id}-${row.id}` === group.id);
    return source ? { ...group, courseIds: [...new Set(source.courses.map(course => idByCode.get(course.code)).filter((id): id is number => Boolean(id)))] } : group;
  });
  const current = await Repository.getRuleDraft(plan.id);
  if (current?.rules?.length) { report.draftStatus = "kept"; log("= قواعد الصحيفة موجودة — لم تُمسّ"); }
  else {
    await Repository.updateRuleDraft(plan.id, () => ({
      id: plan.id, planId: plan.id, AdCollegeId: collegeId, AdSectionId: ownSectionId, rules: built.rules, groups, externals,
      version: 0, status: "review", basedOnVersion: 0, updatedAt: new Date().toISOString(), updatedBy: actor,
    }));
    report.draftStatus = "written";
    log(`+ قواعد الصحيفة (${built.rules.length} مقرراً، ${groups.length} مجموعتا اختيار) قيد المراجعة`);
  }

  /* الحسابات: موقوفة وبلا كلمة سر، على هذه الكلية وحدها. */
  const { roleDefinition } = await import("../../src/utils/academicRoles");
  for (const row of report.accounts) {
    const role = roleDefinition(row.role);
    if (row.status === "exists") {
      /* أُنشئ الحسابُ في تشغيلٍ سابقٍ انقطع قبل الصلاحيات أو النطاق: نُكمل الناقص فقط ولا نغيّر ما ضُبط. */
      const found = byLogin.get(row.login.toLowerCase());
      if (!found) continue;
      const userId = Number(found.SystemUserId);
      let filled = false;
      if (!(await Repository.getSecurityByUser(userId)).length) { await Repository.saveSecurityByUser(userId, role.formIds); filled = true; }
      if (!(await Repository.getUserAssigns(userId)).length) { await Repository.saveUserAssigns(userId, [{ AdCollegeId: collegeId, AdSectionId: SECTION_ROLES.has(row.role) ? ownSectionId : 0 }]); filled = true; }
      if (filled) { row.status = "completed"; log(`~ أُكمل حساب ${row.login} (${role.label}) — كان ناقص الصلاحيات أو النطاق`); }
      /* لا يُغيَّر إلا حسابٌ أنشأته هذه الأداة (موقوف وبلا كلمة سر ولا خزنة)؛ أيّ حسابٍ له كلمة سرٍّ يُترك كما هو. */
      if (options.password && !found.IsActive && !String(found.SystemUserPass || "").trim() && !String(found.SystemUserPassVault || "").trim()) {
        await Repository.updateUser(userId, { SystemUserPass: Repository.hashPassword(options.password), SystemUserPassVault: Repository.encryptPasswordForVault(options.password), IsActive: true });
        row.status = "activated"; log(`~ فُعّل حساب ${row.login} (${role.label}) بكلمة السر الافتراضية`);
      }
      continue;
    }
    const user = await Repository.createUser({
      Name: `${role.label} — ${report.college.name}`, SystemUserLogin: row.login,
      SystemUserPass: options.password ? Repository.hashPassword(options.password) : "",
      ...(options.password ? { SystemUserPassVault: Repository.encryptPasswordForVault(options.password) } : {}),
      IsAdminUser: false, IsActive: Boolean(options.password), IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: row.role,
    } as any);
    await Repository.saveSecurityByUser(user.SystemUserId, role.formIds);
    await Repository.saveUserAssigns(user.SystemUserId, [{ AdCollegeId: collegeId, AdSectionId: SECTION_ROLES.has(row.role) ? ownSectionId : 0 }]);
    row.status = "created";
    log(`+ حساب ${row.login} (${role.label})`);
  }
  report.wrote = true;
  report.ok = true;
  return report;
}
