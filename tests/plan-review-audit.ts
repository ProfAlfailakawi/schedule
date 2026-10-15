/**
 * ── مراجعةُ الصحيفة: قواعدُ المقررات (المرحلة ٥) ─────────────────────────────
 *
 *   R1  التنظيف: ما يُكتب في الواجهة يُنظَّف قبل أن يُحفظ.
 *   R2  الفحص: دورةٌ تمنع، ومجموعةٌ لا تتّسع لحدّها تمنع، والمستوى المقلوب يُنبَّه.
 *   R3  الأسئلة: المسبقُ والمقرنُ والمتبقّي بالمجموعة لا بالمقررات كلها.
 *   R4  الاستيراد: ورقةُ الصحيفة إلى مسوّدةٍ، وما لا يُفهم يُقال بسطره.
 *   R5  المسارات: نطاقُ القسم، ومقرراتُ القسم وحدها، والاعتمادُ لرئيس اللجنة،
 *       ومسوّدةٌ لا تتغيّر تحت المعتمِد.
 *   R6  الواجهة: أيقونةٌ مؤقتة، وكلُّ زرٍّ موثَّق للمرشد.
 */
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import type { AddressInfo } from "net";
import {
  byLevel, checkRuleSet, coreqMet, dependentsOf, describePrereq, findPrereqCycle, groupProgress, normalizeGroups, normalizeRule,
  normalizeRules, prereqMet, remainingNeed, unmetPrereq, withDerivedGroups,
} from "../src/utils/curriculumRules";
import { parseKind, rowsToDrafts } from "../src/utils/curriculumRulesImport";
import type { CurriculumCourseRule, ElectiveGroup } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── R1: التنظيف ─────────────────────────────────────────────────────────── */
{
  check(normalizeRule({}) === null && normalizeRule({ courseId: 0 }) === null && normalizeRule({ courseId: "x" }) === null, "R1 بلا مقررٍ لا قاعدة");
  const r = normalizeRule({ courseId: 5, level: "3", kind: "elective", prereq: { all: [1, "2", 2, 5, 0, "x"], anyOf: [[3, 4, 3], [6], [], [7, 5]], minUnits: "60" }, coreq: [8, 8, 5], groupId: "  g1 " })!;
  check(r.level === 300 && r.kind === "elective" && r.groupId === "g1", "R1 المستوى القديم ٣ يُحوَّل إلى ٣٠٠ والنوع والمجموعة");
  check(JSON.stringify(r.prereq?.all) === "[1,2,6,7]", "R1 المسبق «الكلّ»: بلا تكرار ولا نفسه ولا صفر، ومجموعةٌ من واحدٍ (بعد استبعاد نفسه) تصير «كلّاً»", r.prereq);
  check(JSON.stringify(r.prereq?.anyOf) === "[[3,4]]", "R1 مجموعةٌ فارغة تسقط، وما فيها نفسُه يُستبعد", r.prereq?.anyOf);
  check(r.prereq?.minUnits === 60 && JSON.stringify(r.coreq) === "[8]", "R1 الوحدات والمقرن");
  check(normalizeRule({ courseId: 5, level: 500 })!.level === undefined && normalizeRule({ courseId: 5, kind: "zzz" })!.kind === undefined, "R1 مستوىً بعد ٤٠٠ ونوعٌ مجهول يُهملان");
  check(normalizeRule({ courseId: 6, level: 400 })!.level === 400 && normalizeRule({ courseId: 7, level: 4 })!.level === 400, "R1 المستوى الأقصى ٤٠٠ والقيم القديمة محفوظة بالتطبيع");
  check(normalizeRule({ courseId: 5, prereq: { all: [], anyOf: [] } })!.prereq === undefined, "R1 مسبقٌ فارغ لا يُحفظ");
  check(normalizeRules([{ courseId: 2, level: 1 }, { courseId: 1 }, { courseId: 2, level: 4 }]).map(x => `${x.courseId}:${x.level ?? "-"}`).join() === "1:-,2:400", "R1 آخرُ قاعدةٍ لمقررٍ تحلّ محلّ ما قبلها، ومرتّبة");
  const g = normalizeGroups([{ id: "a", name: "  اختياري   جامعة ", minCourses: "2", minUnits: 9, courseIds: [3, 3, 4, "x"] }, { id: "" }, { id: "b", minCourses: 99, minUnits: 999 }]);
  check(g.length === 2 && g[0].name === "اختياري جامعة" && g[0].minCourses === 2 && g[0].courseIds.join() === "3,4" && g[1].minCourses === 20 && g[1].minUnits === 60 && g[1].name === "مجموعة اختيارية", "R1 المجموعة: اسمٌ منظَّف وحدّان مقيَّدان");
  const derived = withDerivedGroups([{ courseId: 3, level: 200, groupId: "stale" }, { courseId: 9, level: 100, groupId: "old" }], [{ id: "a", name: "ا", minCourses: 1, minUnits: 3, courseIds: [3, 4] }]);
  check(derived.find(x => x.courseId === 3)?.groupId === "a" && derived.find(x => x.courseId === 4)?.groupId === "a" && derived.find(x => x.courseId === 9)?.groupId === undefined && derived.find(x => x.courseId === 3)?.level === 200, "R1 انتماءُ المقرر يُشتقّ من المجموعة نفسها لا من نسخةٍ قديمة");
}

/* ── R2: الفحص ───────────────────────────────────────────────────────────── */
const NAMES: Record<number, string> = { 1: "أ", 2: "ب", 3: "ج", 4: "د", 5: "هـ", 6: "و", 99: "خ" };
const ctx = (plan: number[]) => ({
  planCourseIds: plan, knownCourseIds: new Set([1, 2, 3, 4, 5, 6, 99]),
  credit: new Map([[1, 3], [2, 3], [3, 3], [4, 3], [5, 2], [6, 3], [99, 3]]), name: (id: number) => NAMES[id] || String(id),
});
{
  const rule = (courseId: number, extra: Partial<CurriculumCourseRule> = {}): CurriculumCourseRule => ({ courseId, ...extra });
  check(checkRuleSet({ rules: [rule(1, { level: 100 }), rule(2, { level: 200, prereq: { all: [1], anyOf: [] } })], groups: [] }, ctx([1, 2])).length === 0, "R2 قواعدُ سليمة: لا ملاحظات");
  const cyc = [rule(1, { prereq: { all: [2], anyOf: [] } }), rule(2, { prereq: { all: [3], anyOf: [] } }), rule(3, { prereq: { all: [1], anyOf: [] } })];
  check(JSON.stringify(findPrereqCycle(cyc)) === "[1,2,3,1]" || findPrereqCycle(cyc)?.length === 4, "R2 الدورة تُكتشف", findPrereqCycle(cyc));
  check(findPrereqCycle([rule(1, { prereq: { all: [], anyOf: [[2, 3]] } }), rule(2), rule(3, { prereq: { all: [1], anyOf: [] } })]) !== null, "R2 دورةٌ عبر «أو»");
  check(findPrereqCycle([rule(1), rule(2, { prereq: { all: [1], anyOf: [] } }), rule(3, { prereq: { all: [1, 2], anyOf: [] } })]) === null, "R2 سلسلةٌ بلا دورة (ماسٌ مقبول)");
  check(checkRuleSet({ rules: cyc, groups: [] }, ctx([1, 2, 3])).some(i => i.severity === "block" && i.code === "cycle"), "R2 الدورة تمنع الاعتماد");
  check(checkRuleSet({ rules: [rule(1, { coreq: [2] }), rule(2, { coreq: [1] })], groups: [] }, ctx([1, 2])).every(i => i.severity !== "block"), "R2 مقرنان متبادلان مقبولان");
  check(checkRuleSet({ rules: [rule(1, { prereq: { all: [77], anyOf: [] } })], groups: [] }, ctx([1])).some(i => i.code === "unknown-ref" && i.severity === "block"), "R2 مسبقٌ غير معروف يمنع");
  check(checkRuleSet({ rules: [rule(1, { prereq: { all: [99], anyOf: [] } })], groups: [] }, ctx([1])).some(i => i.code === "ref-outside-plan" && i.severity === "warn"), "R2 مسبقٌ من خارج الصحيفة: تنبيهٌ لا منع (قد يكون من قسمٍ آخر)");
  check(checkRuleSet({ rules: [rule(9)], groups: [] }, ctx([1])).some(i => i.code === "not-in-plan" && i.severity === "block"), "R2 قاعدةٌ لمقررٍ ليس في الصحيفة");
  check(checkRuleSet({ rules: [rule(1, { level: 300 }), rule(2, { level: 200, prereq: { all: [1], anyOf: [] } })], groups: [] }, ctx([1, 2])).some(i => i.code === "prereq-level" && i.severity === "warn"), "R2 مسبقٌ في مستوىً لاحق: تنبيه");
  check(checkRuleSet({ rules: [rule(1, { kind: "elective" })], groups: [] }, ctx([1])).some(i => i.code === "elective-no-group"), "R2 اختياريٌّ بلا مجموعة: تنبيه");
  const bad: ElectiveGroup[] = [{ id: "a", name: "م", minCourses: 3, minUnits: 0, courseIds: [1, 2] }, { id: "b", name: "ن", minCourses: 1, minUnits: 20, courseIds: [3, 4] }];
  const gi = checkRuleSet({ rules: [], groups: bad }, ctx([1, 2, 3, 4]));
  check(gi.some(i => i.code === "group-min-courses" && i.groupId === "a") && gi.some(i => i.code === "group-min-units" && i.groupId === "b"), "R2 مجموعةٌ لا تتّسع لحدّها (مواد/وحدات) تمنع");
  check(checkRuleSet({ rules: [], groups: [{ id: "a", name: "م", minCourses: 1, minUnits: 3, courseIds: [1, 2] }, { id: "b", name: "ن", minCourses: 1, minUnits: 3, courseIds: [2, 3] }] }, ctx([1, 2, 3])).some(i => i.code === "two-groups"), "R2 مقررٌ في مجموعتين يمنع");
  check(checkRuleSet({ rules: [], groups: [{ id: "a", name: "م", minCourses: 2, minUnits: 9, courseIds: [1, 2, 3] }] }, ctx([1, 2, 3])).length === 0, "R2 «اختر ٢ بحدٍّ أدنى ٩ وحدات» من ثلاثةٍ: سليمة");
}

/* ── R3: الأسئلة ─────────────────────────────────────────────────────────── */
{
  const passedSet = (...ids: number[]) => new Set(ids);
  const p = { all: [1], anyOf: [[2, 3]], minUnits: 60 };
  check(!prereqMet(p, passedSet(), 100) && !prereqMet(p, passedSet(1), 100) && !prereqMet(p, passedSet(1, 2), 30) && prereqMet(p, passedSet(1, 3), 60) && prereqMet(undefined, passedSet(), 0), "R3 «الكلّ» و«أحدها» و«الوحدات»: كلُّها معاً");
  const u = unmetPrereq(p, passedSet(2), 40);
  check(u.all.join() === "1" && u.anyOf.length === 0 && u.unitsShort === 20, "R3 ما ينقص: المسبقُ الغائب وفارق الوحدات", u);
  check(unmetPrereq(p, passedSet(1), 100).anyOf[0].join() === "2,3", "R3 مجموعةٌ لم يُجتَز منها شيء تُذكر كاملة");
  check(coreqMet([2], passedSet(), new Set([2])) && coreqMet([2], passedSet(2), new Set()) && !coreqMet([2], passedSet(), new Set()) && coreqMet(undefined, passedSet(), new Set()), "R3 المقرن: يُسجَّل معه أو سبق اجتيازه");
  const credit = new Map([[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]]);
  const rules: CurriculumCourseRule[] = [{ courseId: 1, level: 100 }, { courseId: 2, level: 200 }, { courseId: 3, kind: "elective" }, { courseId: 4, kind: "elective" }, { courseId: 5, kind: "elective" }];
  const groups: ElectiveGroup[] = [{ id: "g", name: "اختياري", minCourses: 2, minUnits: 6, courseIds: [3, 4, 5] }];
  const need = remainingNeed([1, 2, 3, 4, 5, 6], { rules, groups }, passedSet(1, 3), credit);
  check(need.compulsoryRemaining.join() === "2,6" && need.compulsoryUnits === 6, "R3 الإجباريُّ المتبقّي", need.compulsoryRemaining);
  check(need.groups[0].needCourses === 1 && need.groups[0].needUnits === 3 && !need.groups[0].done && need.groups[0].candidateIds.join() === "4,5", "R3 المجموعة: ينقص مقررٌ واحد لا الثلاثة", need.groups[0]);
  check(need.remainingUnits === 6 + 3, "R3 المتبقّي = إجباريٌّ + ما تحتاجه المجموعة لا كلُّ اختياراتها", need.remainingUnits);
  check(remainingNeed([1, 2, 3, 4, 5, 6], { rules, groups }, passedSet(1, 2, 3, 4, 6), credit).remainingUnits === 0, "R3 كلُّ شيءٍ أُنجز: صفر");
  check(groupProgress(groups[0], passedSet(3, 4), credit).done && !groupProgress(groups[0], passedSet(3), credit).done, "R3 اكتمالُ المجموعة بحدّيها معاً");
  check(dependentsOf([{ courseId: 2, prereq: { all: [1], anyOf: [] } }, { courseId: 3, prereq: { all: [], anyOf: [[1, 4]] } }, { courseId: 4 }], 1).join() === "2,3", "R3 ما يتوقّف على مقرر");
  check(describePrereq({ all: [1, 2], anyOf: [[3, 4]], minUnits: 60 }, id => NAMES[id]) === "أ + ب + (ج أو د) + 60 وحدة", "R3 المسبق بالعربية", describePrereq({ all: [1, 2], anyOf: [[3, 4]], minUnits: 60 }, id => NAMES[id]));
  const levels = byLevel([1, 2, 3, 4], [{ courseId: 2, level: 200 }, { courseId: 1, level: 100 }, { courseId: 3, level: 200 }]);
  check([...levels.keys()].join() === "100,200,0" && levels.get(200)!.join() === "2,3" && levels.get(0)!.join() === "4", "R3 الخريطة بالمستويات، وغيرُ الموزَّع في الآخر");
}

/* ── R4: الاستيراد ───────────────────────────────────────────────────────── */
{
  const plans = [
    { id: "p1", sectionId: 11, sectionName: "قسم التربية الإسلامية", sectionCode: "ISL", name: "الجديدة", courseIds: [101, 102, 103, 104, 105] },
    { id: "p2", sectionId: 11, sectionName: "قسم التربية الإسلامية", sectionCode: "ISL", name: "السابقة", courseIds: [101, 102] },
    { id: "p3", sectionId: 12, sectionName: "قسم اللغة العربية", sectionCode: "ARB", name: "الجديدة", courseIds: [201] },
  ];
  const courses = [{ id: 101, code: "ISL 101" }, { id: 102, code: "ISL102" }, { id: 103, code: "ISL103" }, { id: 104, code: "ISL104" }, { id: 105, code: "ISL105" }, { id: 201, code: "ARB201" }, { id: 301, code: "UNI100" }];
  const rows = [
    { section: "ISL", plan: "الجديدة", code: "ISL101", level: "١٠٠", kind: "إجباري" },
    { section: "ISL", plan: "الجديدة", code: "isl-102", level: 2, kind: "اجباري", prereqAll: "ISL101", coreq: "ISL103" },
    { section: "ISL", plan: "الجديدة", code: "ISL103", level: 2, kind: "كلية", prereqAny: "ISL101|UNI100", minUnits: "٣٠" },
    { section: "ISL", plan: "الجديدة", code: "ISL104", kind: "اختياري", group: "اختياري قسم", groupMinCourses: 1, groupMinUnits: 3 },
    { section: "قسم التربية الإسلامية", plan: "الجديدة", code: "UNI100", kind: "جامعة" },
    { section: "ISL", plan: "الجديدة", code: "ZZZ999" },
    { section: "ISL", code: "ISL101" },
    { section: "XYZ", code: "ISL101" },
    { section: "ISL", plan: "الجديدة", code: "ISL105", prereqAll: "NOPE1" },
    { section: "ARB", code: "ARB201", level: 40, kind: "غريب" },
  ];
  const { drafts, diagnostics } = rowsToDrafts(rows, plans, courses);
  const d1 = drafts.find(d => d.planId === "p1")!;
  check(drafts.length === 2 && Boolean(d1) && Boolean(drafts.find(d => d.planId === "p3")), "R4 مسوّدةٌ لكل صحيفةٍ وردت فيها أسطر");
  const r102 = d1.rules.find(r => r.courseId === 102)!, r103 = d1.rules.find(r => r.courseId === 103)!;
  check(d1.rules.find(r => r.courseId === 101)?.level === 100 && r102.level === 200 && r102.prereq?.all.join() === "101" && r102.coreq?.join() === "103" && r102.kind === "compulsory", "R4 القيم القديمة تُطبَّع للأرقام ١٠٠–٤٠٠ مع المسبق والمقرن", r102);
  check(r103.prereq?.anyOf[0].join() === "101,301" && r103.prereq?.minUnits === 30 && r103.kind === "college", "R4 «أو» بين مقرراتٍ حتى من خارج الصحيفة، والوحدات");
  check(d1.groups.length === 1 && d1.groups[0].courseIds.join() === "104" && d1.groups[0].minCourses === 1 && d1.groups[0].minUnits === 3 && d1.rules.find(r => r.courseId === 104)?.groupId === d1.groups[0].id, "R4 المجموعة الاختيارية بحدّيها، وانتماؤها مشتقّ");
  const text = diagnostics.map(d => `${d.line}:${d.text}`).join("\n");
  check(/6:.*ZZZ999/.test(text), "R4 رمزٌ مجهول يُقال بسطره", text);
  check(/7:.*أكثر من صحيفة/.test(text), "R4 قسمٌ بصحيفتين بلا تسمية: لا تخمين");
  check(/8:.*قسمٌ غير معروف/.test(text), "R4 قسمٌ مجهول");
  check(/9:.*NOPE1/.test(text), "R4 مسبقٌ مجهول يُقال ولا يُسقط السطر");
  check(/10:.*المستوى يجب أن يكون/.test(text) && /10:.*نوعٌ غير مفهوم/.test(text), "R4 مستوىً ونوعٌ غير صالحين");
  check(parseKind("إجباري") === "compulsory" && parseKind("اختياري حر") === "elective" && parseKind("متطلب جامعة") === "university" && parseKind("متطلب كلية") === "college" && parseKind("???") === undefined, "R4 أنواعُ المقررات كما تُكتب");
}

/* ── R5: المسارات على مستودعٍ حقيقي ──────────────────────────────────────── */
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-plan-review-"));
  const courses = [
    { AdCourseId: 301, AdCollegeId: 1, AdSectionId: 21, CourseCode: "105", CourseName: "أسس تكنولوجيا التعلم", CourseCredit: 3, CourseHours: 3, MaxStudent: 60 },
    { AdCourseId: 101, AdCollegeId: 1, AdSectionId: 11, CourseCode: "ISL101", CourseName: "أصول", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
    { AdCourseId: 102, AdCollegeId: 1, AdSectionId: 11, CourseCode: "ISL102", CourseName: "فقه", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
    { AdCourseId: 103, AdCollegeId: 1, AdSectionId: 11, CourseCode: "ISL103", CourseName: "تفسير", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
    { AdCourseId: 104, AdCollegeId: 1, AdSectionId: 11, CourseCode: "ISL104", CourseName: "حديث", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
    { AdCourseId: 201, AdCollegeId: 1, AdSectionId: 12, CourseCode: "ARB201", CourseName: "نحو", CourseCredit: 3, CourseHours: 3, MaxStudent: 30 },
  ];
  fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify({
    users: [], formNames: [], formSecurity: [], collegeUserAssign: [], terms: [],
    colleges: [{ AdCollegeId: 1, AdCollegeCode: "EDU", AdCollegeName: "كلية" }, { AdCollegeId: 2, AdCollegeCode: "EDU2", AdCollegeName: "كلية أخرى" }],
    sections: [{ AdSectionId: 21, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" }, { AdSectionId: 22, AdCollegeId: 2, AdSectionCode: "09", AdSectionName: "قسم تكنولوجيا التعليم" }, { AdSectionId: 11, AdCollegeId: 1, AdSectionCode: "ISL", AdSectionName: "قسم التربية الإسلامية" }, { AdSectionId: 12, AdCollegeId: 1, AdSectionCode: "ARB", AdSectionName: "قسم اللغة العربية" }],
    instructors: [], courses, schedules: [], rooms: [], courseTransitions: [],
    curriculumPlans: [{ id: "p11", AdCollegeId: 1, AdSectionId: 11, name: "الجديدة", status: "active", createdAt: "2026-01-01" }],
    curriculumPlanCourses: [101, 102, 103, 104, 201].map(id => ({ id: `pc${id}`, planId: "p11", AdCollegeId: 1, AdSectionId: 11, AdCourseId: id, createdAt: "2026-01-01" })),
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = dir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  const { registerPlanReviewRoutes } = await import("../src/server/planReviewRoutes");
  await initDatabase();
  console.warn = quiet;

  /* مستخدمون تجريبيون يُعرَّفون بترويسة: الدورُ والنطاقُ والإذن، كما يفعل الخادمُ الحقيقي. */
  const USERS: Record<string, any> = {
    tech: { user: { Role: "departmentHead", Name: "رئيس تكنولوجيا التعليم" }, scopes: [{ AdCollegeId: 1, AdSectionId: 21 }], permissions: [14] },
    chair11: { user: { Role: "committeeChair", Name: "رئيس لجنة ISL" }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [7] },
    head11: { user: { Role: "departmentHead", Name: "رئيس قسم ISL" }, scopes: [{ AdCollegeId: 1, AdSectionId: 11 }], permissions: [14] },
    chair12: { user: { Role: "committeeChair", Name: "رئيس لجنة ARB" }, scopes: [{ AdCollegeId: 1, AdSectionId: 12 }], permissions: [7] },
    dean: { user: { Role: "dean", Name: "عميد" }, scopes: [{ AdCollegeId: 1, AdSectionId: 0 }], permissions: [14] },
    admin: { user: { SystemUserId: 1, Role: "committeeChair", Name: "المدير", IsAdminUser: true }, scopes: [], permissions: [7] },
    otherAdmin: { user: { SystemUserId: 2, Role: "committeeChair", Name: "مسؤول آخر", IsAdminUser: true }, scopes: [], permissions: [7] },
  };
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { const who = USERS[String(req.headers["x-who"] || "")]; if (who) { req.user = who.user; req.scopes = who.scopes; req.permissions = who.permissions; } next(); });
  registerPlanReviewRoutes(app, {
    requireAuth: (req: any, res, next) => (req.user ? next() : res.status(401).json({ error: "سجّل الدخول" })),
    isScopeAllowed: (req, collegeId, sectionId) => Boolean(req.user?.IsAdminUser) || (req.scopes || []).some((s: any) => s.AdCollegeId === collegeId && (s.AdSectionId === sectionId || s.AdSectionId === 0)),
    isPowerUser: req => Boolean(req.user?.IsAdminUser),
    isRootAdmin: req => Number(req.user?.SystemUserId) === 1,
    hasPermission: (req, id) => (req.permissions || []).includes(id),
    actorName: req => String(req.user?.Name || ""),
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (who: string, method: string, url: string, body?: unknown) => {
    const res = await fetch(base + url, { method, headers: { "content-type": "application/json", "x-who": who }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => ({})) as any };
  };
  const Q = "planId=p11&sectionId=11";
  try {
    check((await call("", "GET", "/api/plan-review/status")).status === 401, "R5 بلا دخول: ٤٠١");
    check((await call("chair11", "GET", "/api/plan-review/status")).json.pending.length === 0, "R5 لا مسوّدات: لا أيقونة");

    const beforeSource = JSON.stringify(await Repository.getCourses());
    const source = await call("tech", "GET", "/api/plan-review/reference?sectionId=21");
    check(source.status === 200 && source.json.references.length === 2 && source.json.references[1].degreeUnits === 125, "R5 رئيس القسم يرى مرجع الصحيفتين ومجموعيهما دون صحيفة تشغيلية");
    check(source.json.sections.length === 1 && source.json.sections[0].sectionId === 21, "R5 رئيس القسم يرى كلية نطاقه فقط في اختيار مطابقة الكليات");
    const allColleges = await call("admin", "GET", "/api/plan-review/reference?sectionId=21");
    check(allColleges.status === 200 && allColleges.json.sections.length === 2 && allColleges.json.sections.some((row: any) => row.sectionId === 22 && row.collegeName === "كلية أخرى"), "R5 الإدارة تجهّز مقارنة تكنولوجيا التعليم لكل كلية من سجلاتها");
    const adminStatus = await call("admin", "GET", "/api/plan-review/status");
    const techLabels = adminStatus.json.sections.filter((row: any) => [21, 22].includes(row.sectionId)).map((row: any) => row.sectionName);
    check(new Set(techLabels).size === 2 && techLabels.some((name: string) => name.includes("كلية")) && techLabels.some((name: string) => name.includes("أخرى")), "R5 القسم المشترك يظهر مرةً واضحةً لكل كلية ولا تتشابه خيارات الصحيفة", techLabels);
    const sec22Ref = allColleges.json.sections.find((row: any) => row.sectionId === 22).references.find((row: any) => row.id === "new");
    const missingOwnedCourse = sec22Ref.groups.flatMap((group: any) => group.courses).find((course: any) => course.code === "0109108");
    check(missingOwnedCourse.state === "missing" && missingOwnedCourse.ownerSectionId === 22, "R5 رمز القسم المتكرر يُحلّ داخل الكلية، فتظهر الإضافة لمالكها الصحيح");
    check((await call("tech", "GET", "/api/plan-review/reference?sectionId=22")).status === 403, "R5 رئيس القسم لا يفتح مقارنة كلية خارج نطاقه");
    const foundation = source.json.references[1].groups.flatMap((group: any) => group.courses).find((course: any) => course.code === "0109105");
    check(foundation.state === "different" && foundation.differences.includes("name") && foundation.name === "أسس تكنولوجيا التعليم", "R5 المطابقة تكشف الاسم الخطأ من رمز القسم والمقرر");
    check(JSON.stringify(await Repository.getCourses()) === beforeSource, "R5 قراءة المقارنة لا تغيّر أي مقرر حي");
    check((await call("chair11", "GET", "/api/plan-review/reference?sectionId=21")).status === 403, "R5 قسم آخر لا يقرأ فروقات قسم تكنولوجيا التعليم");
    check((await call("tech", "GET", "/api/plan-review/status")).json.sections.some((section: any) => section.sectionId === 21 && section.plans.length === 0), "R5 مرجع تكنولوجيا التعليم قابل للوصول حتى قبل إنشاء الصحيفة");

    const imp = await call("chair11", "POST", "/api/plan-review/import", { rows: [] });
    check(imp.status === 403, "R5 الاستيراد لإدارة النظام وحدها");
    check((await call("otherAdmin", "POST", "/api/plan-review/import", { rows: [] })).status === 403, "R5 استيراد الصحائف لحساب الإدارة الرئيسي وحده");
    const imported = await call("admin", "POST", "/api/plan-review/import", { rows: [
      { section: "ISL", code: "ISL101", level: 100, kind: "إجباري" },
      { section: "ISL", code: "ISL102", level: 200, kind: "إجباري", prereqAll: "ISL101" },
      { section: "ISL", code: "ISL103", level: 300, prereqAll: "ISL102" },
      { section: "ISL", code: "ISL104", kind: "اختياري", group: "اختياري", groupMinCourses: 1, groupMinUnits: 3 },
      { section: "ISL", code: "NOPE", level: 100 },
    ] });
    check(imported.status === 200 && imported.json.created === 1 && imported.json.diagnosticsTotal === 1, "R5 الاستيراد ينشئ مسوّدةً ويقول ما لم يفهمه", imported.json);
    check((await call("admin", "POST", "/api/plan-review/import", { rows: [{ section: "ISL", code: "ISL101", level: 500 }] })).json.skipped.length === 1, "R5 مسوّدةٌ قيد المراجعة لا يُكتب فوقها بلا طلبٍ صريح");

    const st = await call("chair11", "GET", "/api/plan-review/status");
    check(st.json.pending.length === 1 && st.json.pending[0].sectionName === "قسم التربية الإسلامية" && st.json.canApprove === true, "R5 تظهر الأيقونة لرئيس اللجنة: مسوّدةٌ تنتظر");
    const sec11 = st.json.sections.find((x: any) => x.sectionId === 11);
    check(sec11.plans[0].pending === true && typeof sec11.plans[0].status === "string", "R5 الصحيفةُ التي تنتظر مراجعةً تتصدّر قائمة القسم (لا الصحيفة السابقة)", sec11);
    check((await call("chair12", "GET", "/api/plan-review/status")).json.pending.length === 0, "R5 قسمٌ آخر لا يرى مسوّدةَ غيره");
    check((await call("head11", "GET", "/api/plan-review/status")).json.pending.length === 1 && (await call("head11", "GET", "/api/plan-review/status")).json.canApprove === false, "R5 رئيس القسم يرى ولا يعتمد");
    check((await call("dean", "GET", "/api/plan-review/status")).json.pending.length === 0, "R5 العميدُ لا شأن له بالمراجعة");

    check((await call("chair12", "GET", `/api/plan-review/plan?${Q}`)).status === 403, "R5 صحيفةُ قسمٍ آخر: ٤٠٣");
    check((await call("chair11", "GET", "/api/plan-review/plan?planId=zz&sectionId=11")).status === 404, "R5 صحيفةٌ غير موجودة: ٤٠٤");
    const v = (await call("chair11", "GET", `/api/plan-review/plan?${Q}`)).json;
    check(v.courses.length === 5 && v.courses.find((c: any) => c.id === 201).owned === false && v.courses.find((c: any) => c.id === 101).owned === true, "R5 مقرراتُ القسم مملوكة ومقرر القسم الآخر مقفول");
    check(v.can.edit === true && v.can.approve === true && v.state.status === "review" && v.blockers === 0, "R5 رئيس اللجنة يعدّل ويعتمد", v.state);
    const hv = (await call("head11", "GET", `/api/plan-review/plan?${Q}`)).json;
    check(hv.can.edit === false && hv.can.approve === false, "R5 رئيس القسم: قراءةٌ فقط");

    /* التعديل: قواعدُ مقرراتِ القسم وحدها */
    const rule = (courseId: number, extra: any = {}) => ({ planId: "p11", sectionId: 11, rule: { courseId, ...extra } });
    check((await call("head11", "PUT", "/api/plan-review/rule", rule(101, { level: 2 }))).status === 403, "R5 رئيس القسم لا يكتب");
    check((await call("chair12", "PUT", "/api/plan-review/rule", rule(101, { level: 2 }))).status === 403, "R5 رئيس لجنةٍ في قسمٍ آخر لا يكتب");
    const foreign = await call("chair11", "PUT", "/api/plan-review/rule", rule(201, { level: 1 }));
    check(foreign.status === 403 && foreign.json.code === "foreign-course", "R5 مقررُ قسمٍ آخر لا يُعدَّل من قسمنا", foreign.json);
    check((await call("chair11", "PUT", "/api/plan-review/rule", rule(999, { level: 1 }))).status === 400, "R5 مقررٌ ليس في الصحيفة");
    const own = await call("chair11", "PUT", "/api/plan-review/rule", rule(103, { level: 3, kind: "compulsory", prereq: { all: [102, 201], anyOf: [], minUnits: 60 }, coreq: [104] }));
    check(own.status === 200 && own.json.rules.find((r: any) => r.courseId === 103).prereq.all.join() === "102,201" && own.json.rules.find((r: any) => r.courseId === 103).prereq.minUnits === 60, "R5 مسبقٌ من قسمٍ آخر يُشار إليه (مرجعٌ لا تعديل)", own.json.rules);
    check(own.json.can.edit && own.json.state.updatedBy === "رئيس لجنة ISL", "R5 مَن عدّل يُسجَّل");

    /* الدورة تمنع الاعتماد */
    await call("chair11", "PUT", "/api/plan-review/rule", rule(101, { prereq: { all: [103], anyOf: [] } }));
    const cyc = (await call("chair11", "GET", `/api/plan-review/plan?${Q}`)).json;
    check(cyc.blockers === 1 && cyc.issues.some((i: any) => i.code === "cycle"), "R5 الدورة تظهر مانعاً");
    const refused = await call("chair11", "POST", "/api/plan-review/approve", { planId: "p11", sectionId: 11, updatedAt: cyc.state.updatedAt });
    check(refused.status === 409 && refused.json.code === "blockers" && /مانع/.test(refused.json.error), "R5 لا يُعتمد وفيه مانع", refused.json.error);
    await call("chair11", "PUT", "/api/plan-review/rule", rule(101, {}));

    /* المجموعة الاختيارية: مقرراتٌ من قسمٍ آخر مسموحة */
    const grp = await call("chair11", "PUT", "/api/plan-review/group", { planId: "p11", sectionId: 11, group: { id: "g-e", name: "اختياري جامعة", minCourses: 2, minUnits: 6, courseIds: [104, 201] } });
    check(grp.status === 200 && grp.json.groups.some((g: any) => g.id === "g-e" && g.courseIds.join() === "104,201"), "R5 مجموعةٌ اختيارية تضمّ مقرر قسمٍ آخر (يُضاف ولا يُعدَّل)", grp.json.groups);
    check(grp.json.groups.length === 2 && !grp.json.groups.find((g: any) => g.id !== "g-e").courseIds.includes(104), "R5 المقرر في مجموعةٍ واحدة: ينتقل ولا يتكرّر");
    check((await call("head11", "PUT", "/api/plan-review/group", { planId: "p11", sectionId: 11, group: { id: "x", name: "س" } })).status === 403, "R5 رئيس القسم لا يكتب المجموعات");

    const emptied = await call("chair11", "POST", "/api/plan-review/group/delete", { planId: "p11", sectionId: 11, groupId: "g1" });
    check(emptied.status === 200 && emptied.json.groups.length === 1, "R5 مجموعةٌ فرغت تُحذف قبل الاعتماد");

    /* الاعتماد: لرئيس اللجنة، على النسخة التي رآها */
    const before = (await call("chair11", "GET", `/api/plan-review/plan?${Q}`)).json;
    check(before.blockers === 0 && before.state.status === "review", "R5 جاهزةٌ للاعتماد", before.issues);
    check((await call("head11", "POST", "/api/plan-review/approve", { planId: "p11", sectionId: 11, updatedAt: before.state.updatedAt })).status === 403, "R5 رئيس القسم لا يعتمد");
    const stale = await call("chair11", "POST", "/api/plan-review/approve", { planId: "p11", sectionId: 11, updatedAt: "2000-01-01T00:00:00.000Z" });
    check(stale.status === 409 && stale.json.code === "stale", "R5 مسوّدةٌ تغيّرت بعد أن رآها المعتمِد: ترفض");
    const ok = await call("chair11", "POST", "/api/plan-review/approve", { planId: "p11", sectionId: 11, updatedAt: before.state.updatedAt });
    check(ok.status === 200 && ok.json.state.status === "approved" && ok.json.state.version === 1 && ok.json.state.approvedBy === "رئيس لجنة ISL", "R5 الاعتماد: نسخةٌ ١ باسم من اعتمدها", ok.json.state);
    check((await Repository.getRuleSet("p11"))?.version === 1 && (await Repository.getRuleSet("p11"))?.status === undefined, "R5 المعتمدةُ في مستودعها المنفصل");
    check((await call("chair11", "POST", "/api/plan-review/approve", { planId: "p11", sectionId: 11, updatedAt: before.state.updatedAt })).status === 409, "R5 لا اعتمادَ ثانٍ لما اعتُمد");
    check((await call("chair11", "GET", "/api/plan-review/status")).json.pending.length === 0, "R5 بعد الاعتماد تختفي الأيقونة");

    /* تعديلٌ بعد الاعتماد يعيدها قيد المراجعة */
    const again = await call("chair11", "PUT", "/api/plan-review/rule", rule(102, { level: 2, kind: "compulsory" }));
    check(again.json.state.status === "review" && again.json.state.basedOnVersion === 1, "R5 تعديلٌ بعد الاعتماد: قيد المراجعة من جديد على أساس الإصدار ١", again.json.state);
    check((await call("chair11", "GET", "/api/plan-review/status")).json.pending.length === 1, "R5 وتعود الأيقونة");
    check((await Repository.getRuleSet("p11"))?.version === 1, "R5 والمعتمدةُ لا تتغيّر حتى يُعتمد التعديل");
    const second = await call("chair11", "POST", "/api/plan-review/approve", { planId: "p11", sectionId: 11, updatedAt: again.json.state.updatedAt });
    check(second.json.state.version === 2, "R5 الاعتماد الثاني: الإصدار ٢");

    const del = await call("chair11", "POST", "/api/plan-review/group/delete", { planId: "p11", sectionId: 11, groupId: "g-e" });
    check(del.status === 200 && !del.json.groups.some((g: any) => g.id === "g-e") && del.json.state.status === "review", "R5 حذف المجموعة يعيدها قيد المراجعة");
  } finally { server.close(); }
}

/* ── R6: الواجهة ─────────────────────────────────────────────────────────── */
{
  const server = read("server.ts");
  check(server.includes("registerPlanReviewRoutes(app, {") && server.includes("isScopeAllowed: (req, collegeId, sectionId) => isScopeAllowed(req, collegeId, sectionId)"), "R6 الخادم يسجّل مسارات المراجعة بحارس النطاق نفسه");
  const routes = read("src/server/planReviewRoutes.ts");
  check(routes.includes("ownsCourse(req, course)") && routes.includes('code: "foreign-course"'), "R6 حارسُ «مقررات القسم وحدها» في الخادم لا في الواجهة");
  check(routes.includes('roleId(req) === "committeeChair"') && routes.includes("approveRuleDraft("), "R6 الاعتماد لرئيس اللجنة عبر معاملةٍ واحدة");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
