/**
 * تحويل منتدب ⇄ معيّن: الخطة النقية، ثم التنفيذ على الصندوق التجريبي —
 * والتاريخ (رواستر الفصول الماضية والجداول) يبقى كما هو.
 */
import fs from "fs";
import { Repository } from "../src/db/repository";
import { planVisitingConversion, ConversionState } from "../src/utils/visitingConversion";
import { readConversionState, runVisitingConversion } from "../src/db/visitingConversion";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/* ── الخطة النقية ── */
const fam = (c: number, s: number) => (s === 10 || s === 20 ? "family:x" : `${c}:${s}`);
const base: ConversionState = {
  directory: [{ collegeId: 1, sectionId: 10 }, { collegeId: 3, sectionId: 30 }],
  rosters: [{ collegeId: 1, sectionId: 10, termId: 5 }, { collegeId: 2, sectionId: 20, termId: 4 }, { collegeId: 3, sectionId: 30, termId: 5 }],
  pastTermIds: [4], knownTermIds: [4, 5, 6], familyOf: fam,
};
let p = planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [{ collegeId: 1, sectionId: 10 }] }, base);
check(p.errors.length === 0 && p.changes.length === 2 && p.changes.some(c => c.kind === "directory-remove") && p.changes.some(c => c.kind === "roster-remove" && c.termId === 5), "معيّن: يُرفع من الدليل ومن روستر الفصل الحالي");
check(!p.changes.some(c => c.collegeId === 3), "معيّن: القسم غير المختار في كلية أخرى لا يُمس");
p = planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [{ collegeId: 1, sectionId: 10 }, { collegeId: 3, sectionId: 30 }] }, base);
check(p.changes.length === 4 && p.changes.filter(c => c.kind === "directory-remove").length === 2 && p.changes.filter(c => c.kind === "roster-remove").length === 2, "معيّن في قسمين: دليلان + روستر الجاري لكلٍّ");
p = planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [{ collegeId: 1, sectionId: 10 }, { collegeId: 2, sectionId: 20 }] }, base);
check(p.changes.length === 2 && p.changes.filter(c => c.kind === "directory-remove").length === 1, "أختان من عائلة واحدة: دليلٌ واحد وروستر الجاري");
p = planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [{ collegeId: 1, sectionId: 10 }] }, { ...base, rosters: [...base.rosters, { collegeId: 1, sectionId: 10, termId: 6 }] });
check(p.errors.length === 0 && p.changes.filter(c => c.kind === "roster-remove").map(c => (c as any).termId).sort().join() === "5,6", "معيّن: يُرفع من الجاري وكل قادم تلقائياً");
check(!p.changes.some(c => c.kind === "roster-remove" && (c as any).termId === 4), "معيّن: روستر الفصل الماضي لا يُمس");
p = planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [{ collegeId: 1, sectionId: 10 }] }, { ...base, rosters: [{ collegeId: 1, sectionId: 10, termId: 4 }] });
check(p.changes.length === 1 && p.changes[0].kind === "directory-remove", "معيّن: روستر ماضٍ فقط: الدليل وحده");
p = planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [{ collegeId: 1, sectionId: 10 }] }, { ...base, rosters: [{ collegeId: 2, sectionId: 20, termId: 6 }] });
check(p.changes.some(c => c.kind === "roster-remove" && c.collegeId === 2 && (c as any).termId === 6) || p.changes.some(c => c.kind === "roster-remove" && (c as any).termId === 6), "معيّن: روستر فصلٍ قادمٍ عبر العائلة يُرفع");
p = planVisitingConversion({ direction: "toVisiting", instructorId: 8, scopes: [{ collegeId: 9, sectionId: 90 }], termId: 6 }, { ...base, directory: [], rosters: [] });
check(p.errors.length === 0 && p.changes.length === 2, "منتدب إلى فصلٍ قادمٍ بلا جداول: يعمل");
check(planVisitingConversion({ direction: "toVisiting", instructorId: 8, scopes: [{ collegeId: 9, sectionId: 90 }], termId: 77 }, base).errors.length > 0, "منتدب إلى فصلٍ غير موجود: يُرفض");
check(planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [] }, base).errors.length > 0, "معيّن بلا قسم: يُرفض");
check(planVisitingConversion({ direction: "toAppointed", instructorId: 7, scopes: [{ collegeId: 9, sectionId: 90 }] }, base).errors.length > 0, "قسمٌ ليس منتدباً فيه: يُرفض");
p = planVisitingConversion({ direction: "toVisiting", instructorId: 8, scopes: [{ collegeId: 9, sectionId: 90 }], termId: 5 }, { ...base, directory: [], rosters: [] });
check(p.errors.length === 0 && p.changes.length === 2, "منتدب: دليل + روستر");
check(planVisitingConversion({ direction: "toVisiting", instructorId: 8, scopes: [], termId: 5 }, base).errors.some(e => e.includes("القسم")), "منتدب بلا قسم: رسالة واضحة");
check(planVisitingConversion({ direction: "toVisiting", instructorId: 8, scopes: [{ collegeId: 9, sectionId: 90 }] }, base).errors.some(e => e.includes("الفصل")), "منتدب بلا فصل: رسالة واضحة");
check(planVisitingConversion({ direction: "toVisiting", instructorId: 8, scopes: [{ collegeId: 9, sectionId: 90 }], termId: 4 }, base).errors.length > 0, "منتدب في فصلٍ مضى: يُرفض");
p = planVisitingConversion({ direction: "toVisiting", instructorId: 7, scopes: [{ collegeId: 2, sectionId: 20 }], termId: 5 }, base);
check(p.changes.length === 0 && p.errors.length > 0, "منتدب بالفعل (عبر العائلة): لا تعديل");

/* ── التنفيذ على الصندوق ── */
async function behaviour() {
  const id = `demo_conv_${Date.now()}`;
  Repository.createDemoSandbox(id, 60_000);
  await Repository.withDemoSandbox(id, async () => {
    const isl = (await Repository.getSections()).filter(s => String(s.AdSectionCode) === "ISL");
    const other = (await Repository.getSections()).find(s => String(s.AdSectionCode) !== "ISL")!;
    const [a] = isl.map(s => ({ collegeId: Number(s.AdCollegeId), sectionId: Number(s.AdSectionId) }));
    const b = { collegeId: Number(other.AdCollegeId), sectionId: Number(other.AdSectionId) };
    const person = 13;
    const st0 = await readConversionState(person);
    const current = st0.currentTermId, past = st0.pastTermIds[0];
    check(Boolean(current && past), "في الصندوق فصلٌ حالي وفصلٌ مضى");
    check(!st0.pastTermIds.includes(current) && st0.knownTermIds.length === st0.pastTermIds.length + 1 + st0.futureTermIds.length, "الحد: الجاري ليس ماضياً، والباقي ماضٍ أو قادم");
    const fut = await Repository.createTerm("الفصل الأول 2098/2099", { start: "2098-09-13", weeks: 14 });
    const future = Number(fut.AdTermId);
    const st1 = await readConversionState(person);
    check(st1.currentTermId === current && st1.futureTermIds.includes(future) && !st1.pastTermIds.includes(future), "فصلٌ قادمٌ بلا جداول: قابلٌ للكتابة والجاري لم يتغير");
    const schedulesBefore = (await Repository.getInstructorTeachingScopes(person)).reduce((n, s) => n + s.rows, 0);

    let r = await runVisitingConversion({ direction: "toVisiting", instructorId: person, scopes: [], termId: current });
    check(!r.applied && r.errors.length > 0, "e2e: بلا قسم يُحجب");
    r = await runVisitingConversion({ direction: "toVisiting", instructorId: person, scopes: [a] });
    check(!r.applied && r.errors.length > 0, "e2e: بلا فصل يُحجب");

    r = await runVisitingConversion({ direction: "toVisiting", instructorId: person, scopes: [a], termId: 999999 });
    check(!r.applied && r.errors.length > 0, "e2e: فصلٌ مجهول يُحجب");
    r = await runVisitingConversion({ direction: "toVisiting", instructorId: person, scopes: [a], termId: past });
    check(!r.applied && r.errors.length > 0, "e2e: فصلٌ ماضٍ يُحجب");
    r = await runVisitingConversion({ direction: "toVisiting", instructorId: person, scopes: [{ collegeId: 999, sectionId: 999 }], termId: current });
    check(r.applied === true || r.errors.length > 0, "e2e: قسمٌ مجهول لا يكسر");
    await Repository.saveDepartmentDelegates(999, 999, []);
    for (const scope of [a, b]) {
      r = await runVisitingConversion({ direction: "toVisiting", instructorId: person, scopes: [scope], termId: current });
      check(r.applied && r.changes.length >= 1, `e2e: منتدب إلى ${scope.collegeId}:${scope.sectionId}`);
      await Repository.saveVisitingRoster(scope.collegeId, scope.sectionId, future, [...await Repository.getVisitingRoster(scope.collegeId, scope.sectionId, future), person]);
      await Repository.saveVisitingRoster(scope.collegeId, scope.sectionId, past, [...await Repository.getVisitingRoster(scope.collegeId, scope.sectionId, past), person]);
    }
    check((await Repository.getDepartmentDelegates(a.collegeId, a.sectionId)).includes(person) && (await Repository.getVisitingRoster(b.collegeId, b.sectionId, current)).includes(person), "e2e: في الدليل والروستر");

    const dry = await runVisitingConversion({ direction: "toAppointed", instructorId: person, scopes: [a] }, { dryRun: true });
    check(!dry.applied && (await Repository.getDepartmentDelegates(a.collegeId, a.sectionId)).includes(person), "e2e: المعاينة لا تكتب");

    check(dry.changes.some(c => c.kind === "roster-remove" && (c as any).termId === future) && !dry.changes.some(c => (c as any).termId === past), "e2e: المعاينة تسرد الجاري والقادم ولا تسرد الماضي");
    r = await runVisitingConversion({ direction: "toAppointed", instructorId: person, scopes: [a] });
    check(r.applied, "e2e: معيّن في القسم الأول");
    check(!(await Repository.getDepartmentDelegates(a.collegeId, a.sectionId)).includes(person), "e2e: خرج من دليل القسم (والعائلة)");
    check(!(await Repository.getVisitingRoster(a.collegeId, a.sectionId, current)).includes(person), "e2e: وخرج من روستر الفصل الحالي");
    check(!(await Repository.getVisitingRoster(a.collegeId, a.sectionId, future)).includes(person), "e2e: وخرج من روستر الفصل القادم");
    check((await Repository.getVisitingRoster(a.collegeId, a.sectionId, past)).includes(person), "e2e: روستر الفصل الماضي باقٍ");
    check((await Repository.getDepartmentDelegates(b.collegeId, b.sectionId)).includes(person), "e2e: القسم الآخر لم يُمس");
    r = await runVisitingConversion({ direction: "toAppointed", instructorId: person, scopes: [b] });
    check(r.applied && !(await Repository.getVisitingRoster(b.collegeId, b.sectionId, current)).includes(person) && !(await Repository.getVisitingRoster(b.collegeId, b.sectionId, future)).includes(person) && (await Repository.getVisitingRoster(b.collegeId, b.sectionId, past)).includes(person), "e2e: القسم الثاني: الجاري والقادم يُرفعان والماضي يبقى");
    check((await Repository.getVisitingRosterHistory(b.collegeId, b.sectionId)).some(h => Number(h.termId) === past && (h.instructorIds || []).map(Number).includes(person)), "e2e: تاريخ الروستر باقٍ");
    const schedulesAfter = (await Repository.getInstructorTeachingScopes(person)).reduce((n, s) => n + s.rows, 0);
    check(schedulesAfter === schedulesBefore, "e2e: الجداول لم تُمس");
  });
}

const server = fs.readFileSync("server.ts", "utf8");
const route = server.slice(server.indexOf('"/api/instructors/:id/visiting-conversion"'));
check(/requirePermission\(7\)/.test(route.slice(0, 120)) && /isScopeAllowed/.test(route.slice(0, 2000)), "المسار يفرض الصلاحية ونطاق كل قسم");
check(fs.readFileSync("src/components/Instructors.tsx", "utf8").includes("VisitingConversionPanel"), "اللوحة في شاشة تعديل الأستاذ");

behaviour().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(error => { console.error(error); process.exit(1); });
