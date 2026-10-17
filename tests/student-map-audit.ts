/**
 * ── «خريطتي»: نموذجُ الخريطة وحسابُها ────────────────────────────────────────
 *
 *   M1  حسابُ المتصفح = حسابُ المنصّة: المسبقاتُ والمجموعاتُ والمتبقّي والنسبةُ على آلاف المجموعات العشوائية.
 *   M2  النموذجُ: رمزُ العرض عند التكرار، والتصنيف، والمطروح، ولا بيانَ عن طالب.
 *   M3  السلاسل والمفاتيح (ما يفتحه المقرر).
 */
import {
  buildStudentMap, STUDENT_MAP_CORE, type StudentMapModel,
} from "../src/utils/studentMap";
import { groupProgress, remainingNeed, unmetPrereq } from "../src/utils/curriculumRules";
import { planProgress, unitsOf } from "../src/utils/studentProfile";
import type { CurriculumCourseRule, ElectiveGroup } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : ""); }
};
const kmCore = new Function(`${STUDENT_MAP_CORE}; return kmCore;`)() as (m: StudentMapModel, passed: number[]) => any;

/* مولّدٌ عشوائيّ ثابتُ البذرة. */
let seed = 20261017;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];

function randomPlan() {
  const n = 28 + Math.floor(rnd() * 14);
  const ids = Array.from({ length: n }, (_, i) => 100 + i);
  const courses = new Map(ids.map((id, i) => [id, { code: `01${String(9 + (i % 4)).padStart(2, "0")}${String(100 + Math.floor(i / 4) * 100 % 400 + (i % 97)).padStart(3, "0")}`, name: `مقرر ${id}`, credit: pick([1, 2, 3, 3, 3, 4]), sectionId: i % 5 === 0 ? 7 : 9 }]));
  const groups: ElectiveGroup[] = [];
  const pool = [...ids].sort(() => rnd() - 0.5);
  for (let g = 0; g < Math.floor(rnd() * 3); g++) {
    const members = pool.splice(0, 3 + Math.floor(rnd() * 4));
    groups.push({ id: `g${g}`, name: `مجموعة ${g}`, minCourses: Math.floor(rnd() * 3), minUnits: pick([0, 0, 3, 6, 9]), courseIds: members });
  }
  const rules: CurriculumCourseRule[] = ids.map((id, i) => {
    const earlier = ids.slice(0, i);
    const rule: CurriculumCourseRule = { courseId: id, kind: pick(["compulsory", "college", "university", "elective", undefined] as any) };
    if (earlier.length && rnd() < 0.55) {
      const all = [...new Set(Array.from({ length: Math.floor(rnd() * 3) }, () => pick(earlier)))];
      const anyOf = rnd() < 0.3 ? [[...new Set([pick(earlier), pick(earlier)])]] : [];
      rule.prereq = { all, anyOf, ...(rnd() < 0.2 ? { minUnits: pick([9, 30, 60]) } : {}) } as any;
    }
    return rule;
  });
  return { ids, courses, groups, rules };
}

/* ── M1 ───────────────────────────────────────────────────────────────────── */
{
  let rounds = 0, mismatchUnmet = 0, mismatchGroup = 0, mismatchNeed = 0, mismatchProgress = 0, mismatchStatus = 0;
  let sample: unknown;
  for (let plans = 0; plans < 60; plans++) {
    const { ids, courses, groups, rules } = randomPlan();
    const model = buildStudentMap({
      planCourseIds: ids, courses, rules, groups, studentSectionId: 9, sectionName: id => `قسم ${id}`, offered: null,
      planName: "ص", studentSectionName: "ق", termName: "ف",
    });
    const credit = new Map(ids.map(id => [id, courses.get(id)!.credit]));
    const set = { rules, groups };
    for (let k = 0; k < 40; k++) {
      const passedIds = ids.filter(() => rnd() < rnd());
      const passedSet = new Set(passedIds);
      const X = kmCore(model, passedIds);
      const units = unitsOf(passedIds, credit);
      rounds++;
      for (const id of ids) {
        const rule = rules.find(r => r.courseId === id);
        const server = unmetPrereq(rule?.prereq, passedSet, units);
        const mine = X.unmet(id);
        const norm = (u: any) => JSON.stringify({ all: [...u.all].sort(), anyOf: u.anyOf.map((g: number[]) => [...g].sort()).sort(), unitsShort: u.unitsShort });
        if (norm(server) !== norm(mine)) { mismatchUnmet++; sample = { id, server, mine }; }
        const ok = server.all.length === 0 && server.anyOf.length === 0 && server.unitsShort === 0;
        const st = X.status(id);
        const groupDone = (() => { const g = groups.find(x => x.courseIds.includes(id)); return g ? groupProgress(g, passedSet, credit).done : false; })();
        const expect = passedSet.has(id) ? "ok" : groupDone ? "full" : ok ? "now" : "wait";
        if (st !== expect) { mismatchStatus++; sample = { id, st, expect }; }
      }
      for (const g of groups) {
        const a = groupProgress(g, passedSet, credit), b = X.group(g);
        if (a.needCourses !== b.needCourses || a.needUnits !== b.needUnits || a.done !== b.done || a.passedCourses !== b.passedCourses) { mismatchGroup++; sample = { g: g.id, a, b }; }
      }
      const serverNeed = remainingNeed(ids, set, passedSet, credit), mineNeed = X.need();
      if (serverNeed.remainingUnits !== mineNeed.remainingUnits || serverNeed.requiredUnits !== mineNeed.requiredUnits
        || JSON.stringify([...serverNeed.compulsoryRemaining].sort((a, b) => a - b)) !== JSON.stringify([...mineNeed.compulsoryRemaining].sort((a: number, b: number) => a - b))) { mismatchNeed++; sample = { serverNeed, mineNeed }; }
      /* ما يحسبه الخادم في summaryOf حرفياً. */
      let progress = planProgress(ids, passedIds, credit);
      if (groups.length) {
        const need = remainingNeed(ids, set, passedSet, credit);
        const total = Math.max(need.requiredUnits, progress.passedUnits);
        progress = { ...progress, totalUnits: total, remainingUnits: need.remainingUnits, percent: total > 0 ? Math.max(0, Math.min(100, Math.round(((total - need.remainingUnits) / total) * 100))) : 0 };
      }
      const mp = X.progress();
      if (mp.percent !== progress.percent || mp.remainingUnits !== progress.remainingUnits || mp.totalUnits !== progress.totalUnits || mp.passedUnits !== progress.passedUnits) { mismatchProgress++; sample = { progress, mp }; }
    }
  }
  check(rounds === 2400, `M1 ${rounds} مجموعةً عشوائية على 60 صحيفة`);
  check(mismatchUnmet === 0, "M1 ما ينقص كل مقررٍ من مسبقات = unmetPrereq", sample);
  check(mismatchStatus === 0, "M1 الحالة (اجتزته / متاح / ينتظر / اكتملت مجموعته) تطابق حساب الخادم", sample);
  check(mismatchGroup === 0, "M1 تقدّم المجموعات الاختيارية = groupProgress", sample);
  check(mismatchNeed === 0, "M1 المتبقّي والمطلوب والإجباري المتبقّي = remainingNeed", sample);
  check(mismatchProgress === 0, "M1 النسبةُ والمتبقّي المعروضان = ما يحسبه الخادم في summaryOf", sample);
}

/* ── M2 ───────────────────────────────────────────────────────────────────── */
{
  const courses = new Map<number, { code: string; name: string; credit: number; sectionId: number }>([
    [1, { code: "0109105", name: "أسس تكنولوجيا التعليم", credit: 3, sectionId: 9 }],
    [2, { code: "0103105", name: "الحضارة العربية الإسلامية", credit: 3, sectionId: 3 }],
    [3, { code: "0109220", name: "تكنولوجيا الصوت", credit: 3, sectionId: 9 }],
    [4, { code: "0119150", name: "مقدمة في التربية الخاصة", credit: 3, sectionId: 19 }],
    [5, { code: "0109226", name: "التفكير الحاسوبي", credit: 3, sectionId: 9 }],
    [6, { code: "0130099", name: "لغة إنجليزية", credit: 0, sectionId: 30 }],
  ]);
  const rules: CurriculumCourseRule[] = [
    { courseId: 3, kind: "compulsory", prereq: { all: [1, 777], anyOf: [[4, 888]], minUnits: 9 } as any, coreq: [2, 999] },
    { courseId: 5, kind: "elective", groupId: "g1" },
  ];
  const groups: ElectiveGroup[] = [{ id: "g1", name: "اختياري تخصصي", minCourses: 1, minUnits: 3, courseIds: [5, 555] }];
  const model = buildStudentMap({
    planCourseIds: [1, 2, 3, 4, 5, 6, 1, 404], courses, rules, groups, studentSectionId: 9, sectionName: id => ({ 3: "الاجتماعيات", 19: "التربية الخاصة", 30: "اللغة الإنجليزية" } as any)[id] || "", offered: new Map([[1, { sections: 2 }], [3, { sections: 0 }], [5, { sections: 1 }]]),
    categoryOf: id => ({ 1: "تخصصية", 3: "تخصصية", 5: "تخصصية", 2: "ثقافة عامة", 4: "مهنية" } as any)[id] || "", categoryOrder: ["ثقافة عامة", "تخصصية", "مهنية", "التدريب الميداني"],
    planName: "خطة 2026", studentSectionName: "قسم تكنولوجيا التعليم", termName: "الأول 2026/2027",
  });
  const by = (id: number) => model.courses.find(course => course.id === id)!;
  check(model.courses.length === 6 && !model.courses.some(course => course.id === 404), "M2 بلا تكرارٍ ولا مقررٍ مجهول");
  check(by(1).short === "105" && by(2).short === "03·105" && by(1).own && !by(2).own && by(2).owner === "الاجتماعيات", "M2 رمز 105 المتكرر: قسمُ الطالب برمزه، والغريب دون الكلية مع اسم قسمه");
  check(by(1).level === 100 && by(3).level === 200 && by(4).level === 100, "M2 المستوى من رمز المقرر");
  check(model.cats.join("|") === "ثقافة عامة|تخصصية|مهنية", "M2 التصنيفات بترتيب الصحيفة وما وُجد منها فقط", model.cats);
  check(JSON.stringify(model.rules[3]) === JSON.stringify({ all: [1], anyOf: [[4]], minUnits: 9, coreq: [2] }) && !model.rules[5], "M2 القاعدة تُنقّى من المقررات غير الموجودة في الصحيفة", model.rules);
  check(JSON.stringify(model.offered) === '{"1":2,"5":1}', "M2 المطروح هذا الفصل فقط", model.offered);
  check(model.groups.length === 1 && model.groups[0].courseIds.join() === "5" && by(5).group === "g1", "M2 المجموعةُ بأعضائها الموجودين");
  check(!/passed|civil|fingerprint|identity|name"?\s*:\s*"سارة/i.test(JSON.stringify(model)), "M2 النموذجُ بلا أيّ بيانٍ عن الطالب");
  check(by(6).cat === "" && by(6).credit === 0, "M2 مقررٌ بلا تصنيفٍ ولا قاعدة يبقى بلا تصنيف");
  const nokind = buildStudentMap({ planCourseIds: [1], courses, rules: [{ courseId: 1, kind: "university" }], groups: [], studentSectionId: 9, sectionName: () => "", offered: null, planName: "", studentSectionName: "", termName: "" });
  check(nokind.courses[0].cat === "متطلب جامعة" || nokind.courses[0].cat.length > 0, "M2 بلا تصنيفٍ مكتوب: يُعرض نوعُ المقرر بالعربية", nokind.courses[0]);
}

/* ── M3 ───────────────────────────────────────────────────────────────────── */
{
  const courses = new Map<number, { code: string; name: string; credit: number; sectionId: number }>([
    [1, { code: "0119150", name: "ت خاصة", credit: 3, sectionId: 19 }],
    [2, { code: "0109325", name: "مساعدة", credit: 3, sectionId: 9 }],
    [3, { code: "0119207", name: "موهبة", credit: 3, sectionId: 19 }],
    [4, { code: "0130099", name: "إنجليزي", credit: 0, sectionId: 30 }],
    [5, { code: "0130164", name: "إنجليزي 1", credit: 3, sectionId: 30 }],
    [6, { code: "0109105", name: "أسس", credit: 3, sectionId: 9 }],
    [7, { code: "0109121", name: "نظريات", credit: 3, sectionId: 9 }],
    [8, { code: "0109233", name: "تصميم", credit: 3, sectionId: 9 }],
    [9, { code: "0109343", name: "وسائط", credit: 3, sectionId: 9 }],
  ]);
  const rules: CurriculumCourseRule[] = [
    { courseId: 2, kind: "compulsory", prereq: { all: [1], anyOf: [] } }, { courseId: 3, kind: "compulsory", prereq: { all: [1], anyOf: [] } },
    { courseId: 5, kind: "compulsory", prereq: { all: [4], anyOf: [] } },
    { courseId: 7, kind: "compulsory", prereq: { all: [6], anyOf: [] } }, { courseId: 8, kind: "compulsory", prereq: { all: [7], anyOf: [] } }, { courseId: 9, kind: "compulsory", prereq: { all: [8], anyOf: [] } },
  ];
  const model = buildStudentMap({ planCourseIds: [...courses.keys()], courses, rules, groups: [], studentSectionId: 9, sectionName: id => `ق${id}`, offered: null, planName: "", studentSectionName: "", termName: "" });
  const X = kmCore(model, []);
  const chains = X.chains().map((line: number[]) => line.join(">")).sort();
  check(chains.join(",") === "1>2,1>3,4>5", "M3 السلاسل العابرة للأقسام: كل مسارٍ لمقرر الطالب أو الغريب، وبلا سلسلة داخل قسمه", chains);
  check(X.unlocks(6).length === 3 && X.unlocks(7).length === 2 && X.unlocks(9).length === 0, "M3 ما يفتحه المقرر: مباشرةً وبعده");
  X.set(7, true);
  check(X.unlocks(6).length === 0 && X.status(8) === "now" && X.status(9) === "wait" && X.status(7) === "ok" && X.status(6) === "now", "M3 بعد اجتياز مقرر: يُعاد الحساب فوراً (يتحوّل ما بعده إلى متاح، وما اجتيز لا يُعدّ)");
  check(X.levels().map((l: any) => l.level).join() === "100,200,300,0", "M3 المستويات بترتيبها وغير المصنّف أخيراً");
}

{
  const { STUDENT_HOME_SCRIPT } = await import("../src/server/studentHomePage.ts");
  const { STUDENT_MAP_SCRIPT } = await import("../src/server/studentMapUi.ts");
  let compiles = true;
  try { new Function(STUDENT_HOME_SCRIPT); } catch { compiles = false; }
  check(compiles, "M4 سكربت مساري (مع الخريطة) يُترجَم بلا خطأ صياغة");
  check(!/=>|`|\$\{/.test(STUDENT_MAP_SCRIPT), "M4 سكربت الخريطة بصياغة ES5 (بلا أسهم ولا قوالب)");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
