/**
 * ── بروفةُ التسجيل: المحرّك (المرحلة ٦) ──────────────────────────────────────
 *
 *   S1 الحتمية: المدخلاتُ نفسُها تُنتج المخرجاتِ نفسَها.
 *   S2 الدفتر: لا مقعدَ فوق السعة، ولا تعارضَ وقتٍ في أيّ خطة.
 *   S3 القواعد: المسبقُ يمنع، والمجموعةُ الاختيارية تُؤخذ بحدّها لا كلُّها.
 *   S4 الحاجة: الأوشكُ على التخرّج في النافذة الأولى، والنوافذُ متساوية.
 *   S5 الرغبات: قيدُ الصباح، والوحدات، والاحتياط (ب/ج).
 *   S6 المقياس: ٢٥ ألف طالبٍ في ثوانٍ.
 */
import { SIM_UNITS_MIN, parseClock, simulateRegistration, slotsConflict, type SimInput, type SimOffering, type SimPlanRules, type SimStudent } from "../src/utils/registrationSim";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};

const credit = new Map<number, number>();
for (let id = 1; id <= 12; id++) credit.set(id, 3);
const off = (courseId: number, code: string, day: number, start: string, end: string, capacity = 30, sectionId = 11): SimOffering =>
  ({ id: `${courseId}|${code}`, courseId, code, collegeId: 1, sectionId, capacity, slots: [{ day, start: parseClock(start)!, end: parseClock(end)! }] });
const plan: SimPlanRules = {
  planId: "p", courseIds: [1, 2, 3, 4, 5, 6, 7, 8], hasApprovedRules: true,
  rules: [
    { courseId: 1, level: 1, kind: "compulsory" }, { courseId: 2, level: 1, kind: "compulsory" },
    { courseId: 3, level: 2, kind: "compulsory", prereq: { all: [1], anyOf: [] } },
    { courseId: 4, level: 2, kind: "compulsory", prereq: { all: [2], anyOf: [] } },
    { courseId: 5, level: 3, kind: "compulsory", prereq: { all: [3, 4], anyOf: [] } },
    { courseId: 6, kind: "elective", groupId: "g" }, { courseId: 7, kind: "elective", groupId: "g" }, { courseId: 8, kind: "elective", groupId: "g" },
  ],
  groups: [{ id: "g", name: "اختياري", minCourses: 1, minUnits: 3, courseIds: [6, 7, 8] }],
};
const offerings: SimOffering[] = [
  off(1, "01", 0, "08:00", "09:30"), off(1, "02", 1, "14:00", "15:30"),
  off(2, "01", 0, "10:00", "11:30"), off(2, "02", 2, "14:00", "15:30"),
  off(3, "01", 1, "08:00", "09:30"), off(4, "01", 1, "09:30", "11:00"), off(5, "01", 2, "08:00", "10:00"),
  off(6, "01", 3, "08:00", "09:30"), off(7, "01", 3, "10:00", "11:30"), off(8, "01", 3, "12:00", "13:30"),
];
const student = (fp: string, passedIds: number[], wishes?: SimStudent["wishes"]): SimStudent => ({ fp, planId: "p", passed: passedIds, wishes });
const base = (students: SimStudent[], extra: Partial<SimInput> = {}): SimInput => ({ students, offerings, plans: [plan], credit, rounds: 2, ...extra });

/* S1 */
{
  const input = base([student("a", []), student("b", [1, 2]), student("c", [1, 2, 3, 4])]);
  const one = simulateRegistration(input), two = simulateRegistration({ ...JSON.parse(JSON.stringify({ ...input, credit: undefined })), credit });
  check(JSON.stringify(one) === JSON.stringify(two), "S1 الحتمية: مدخلاتٌ واحدة، مخرجاتٌ واحدة");
  check(parseClock("08:30") === 510 && parseClock("24:00") === null && parseClock("x") === null, "S1 قراءةُ الساعة");
}

/* S2 */
{
  const students = Array.from({ length: 200 }, (_, i) => student(`s${i}`, i % 3 === 0 ? [1, 2] : []));
  const result = simulateRegistration(base(students));
  check(result.seats.every(s => s.taken <= s.capacity), "S2 لا مقعدَ فوق السعة");
  const byId = new Map(offerings.map(o => [o.id, o]));
  const clash = result.tickets.some(t => t.plans.some(p => p.items.some((x, i) => p.items.some((y, j) => i < j && slotsConflict(byId.get(x.offeringId)!.slots, byId.get(y.offeringId)!.slots)))));
  check(!clash, "S2 لا تعارضَ وقتٍ في أيّ خطةٍ من أ/ب/ج");
  check(result.tickets.every(t => t.plans.length === 3 && t.plans.map(p => p.label).join("") === "ABC"), "S2 ثلاثُ خططٍ لكلّ طالب");
  const full = simulateRegistration(base([student("x", []), student("y", [])], { offerings: [off(1, "01", 0, "08:00", "09:00", 1), off(2, "01", 0, "10:00", "11:00", 5)] }));
  const gotCourse1 = full.tickets.filter(t => t.plans[0].items.some(i => i.courseId === 1)).length;
  check(gotCourse1 === 1 && full.demand.find(d => d.courseId === 1)!.unmet.full === 1, "S2 مقعدٌ واحد لطالبين: واحدٌ يأخذه والآخر «امتلأ»", full.demand);
}

/* S3 */
{
  const r = simulateRegistration(base([student("n", []), student("m", [1])]));
  const planA = (fp: string) => r.tickets.find(t => t.fp === fp)!.plans[0].items.map(i => i.courseId);
  check(!planA("n").includes(3) && !planA("n").includes(5), "S3 بلا مسبقٍ لا يُسجَّل (٣ و٥)");
  check(r.tickets.find(t => t.fp === "n")!.unmet.some(u => u.courseId === 3 && u.reason === "prereq"), "S3 والسببُ يُقال: مسبق");
  check(planA("m").includes(3) && !planA("m").includes(4), "S3 اجتاز ١ فيُفتح ٣ لا ٤");
  const elective = planA("n").filter(id => [6, 7, 8].includes(id));
  check(elective.length === 1, "S3 المجموعةُ الاختيارية بحدّها: مقررٌ واحدٌ لا الثلاثة", elective);
  const noRules = simulateRegistration(base([student("z", [])], { plans: [{ ...plan, hasApprovedRules: false }] }));
  check(noRules.withoutRules === 1 && noRules.tickets[0].plans[0].items.length > 0, "S3 صحيفةٌ بلا قواعدَ معتمدة: تُعدّ ويُبنى لها بلا مسبق");
}

/* S4 */
{
  const students = [student("far", []), student("near", [1, 2, 3, 4, 6]), student("mid", [1, 2]), student("mid2", [1])];
  const r = simulateRegistration(base(students, { rounds: 2 }));
  const w = (fp: string) => r.tickets.find(t => t.fp === fp)!.window;
  check(w("near") === 1, "S4 الأوشكُ على التخرّج في النافذة الأولى");
  check(r.windows.join() === "2,2" && r.windows.reduce((a, b) => a + b) === 4, "S4 النوافذُ متساوية", r.windows);
  check(r.tickets[0].fp === "near", "S4 الدفترُ يُخصم بترتيب النوافذ");
}

/* S5 */
{
  const wish = (constraints: any, targetUnits = 15, courseIds: number[] = []) => ({ targetUnits, courseIds, constraints });
  const r = simulateRegistration(base([student("e", [], wish({ noMorning: true }))]));
  const items = r.tickets[0].plans[0].items;
  const byId = new Map(offerings.map(o => [o.id, o]));
  check(items.every(i => byId.get(i.offeringId)!.slots.every(s => s.start >= 12 * 60)), "S5 «لا صباح»: كلُّ ما في أ بعد الظهر", items);
  const small = simulateRegistration(base([student("u", [1, 2], wish({}, 12))]));
  check(small.tickets[0].plans[0].units <= 12, "S5 ١٢ وحدةً مطلوبة: لا يتجاوزها", small.tickets[0].plans[0]);
  const b = simulateRegistration(base([student("b", [], wish({}))]));
  const [A, B, C] = b.tickets[0].plans;
  check(JSON.stringify(A.items.map(i => i.offeringId)) !== JSON.stringify(B.items.map(i => i.offeringId)), "S5 (ب) تأخذ شعباً مختلفة حيث وُجدت", { A, B });
  check(C.units <= SIM_UNITS_MIN && b.tickets[0].plans[2].items.every(i => [1, 2, 3, 4, 5, 6, 7, 8].includes(i.courseId)), "S5 (ج) إجباريٌّ وحدٌّ أدنى");
  const wishfirst = simulateRegistration(base([student("w", [], wish({}, 12, [8]))]));
  check(wishfirst.tickets[0].plans[0].items.some(i => i.courseId === 8), "S5 المقرر الاختياري المرغوب يُفضَّل داخل المجموعة", wishfirst.tickets[0].plans[0]);
  check(simulateRegistration(base([student("d", [])])).defaulted === 1, "S5 من لم يُدخل رغباتٍ يُعدّ «افتراضياً»");
}

/* S6 */
{
  const many = Array.from({ length: 25000 }, (_, i) => student(`f${i}`, i % 4 === 0 ? [1, 2] : i % 7 === 0 ? [1, 2, 3, 4] : []));
  const bigOfferings: SimOffering[] = [];
  for (const o of offerings) for (let k = 0; k < 120; k++) bigOfferings.push({ ...o, id: `${o.id}#${k}`, code: `${o.code}${k}`, slots: o.slots });
  const t0 = Date.now();
  const r = simulateRegistration(base(many, { offerings: bigOfferings, rounds: 3 }));
  const ms = Date.now() - t0;
  check(r.students === 25000 && r.seats.every(s => s.taken <= s.capacity), `S6 ٢٥ ألف طالبٍ بلا تجاوزٍ للسعة (${ms}ms)`);
  check(ms < 30000, "S6 في ثوانٍ لا دقائق", ms);
}

/* S7: مراجعاتٌ بعد الدمج: المقرن، وحدّ الوحدات في المجموعة، وسببُ الإسقاط */
{
  const rules2: SimPlanRules = { planId: "q", courseIds: [1, 2, 3, 4, 5, 6], hasApprovedRules: true,
    rules: [{ courseId: 1, level: 1, kind: "compulsory", coreq: [2] }, { courseId: 2, level: 1, kind: "compulsory" }, { courseId: 3, level: 1, kind: "compulsory" },
      { courseId: 4, kind: "elective", groupId: "g" }, { courseId: 5, kind: "elective", groupId: "g" }, { courseId: 6, kind: "elective", groupId: "g" }],
    groups: [{ id: "g", name: "اختياري", minCourses: 1, minUnits: 6, courseIds: [4, 5, 6] }] };
  const run = (offs: SimOffering[], students: SimStudent[]) => simulateRegistration({ students, offerings: offs, plans: [rules2], credit, rounds: 1 });
  const st = (fp: string): SimStudent => ({ fp, planId: "q", passed: [], wishes: { targetUnits: 18, courseIds: [], constraints: {} } });
  const okOffs = [off(1, "01", 0, "08:00", "09:00"), off(2, "01", 1, "08:00", "09:00"), off(3, "01", 2, "08:00", "09:00"), off(4, "01", 3, "08:00", "09:00"), off(5, "01", 3, "10:00", "11:00"), off(6, "01", 3, "12:00", "13:00")];
  const together = run(okOffs, [st("a")]).tickets[0].plans[0].items.map(i => i.courseId);
  check(together.includes(1) && together.includes(2), "S7 المقرن يُسجَّل مع مقرره", together);
  const clash = run([off(1, "01", 0, "08:00", "09:00"), off(2, "01", 0, "08:30", "09:30"), ...okOffs.slice(2)], [st("b")]);
  const bItems = clash.tickets[0].plans[0].items.map(i => i.courseId);
  check(!bItems.includes(1) && clash.tickets[0].unmet.some(u => u.courseId === 1 && u.reason === "conflict"), "S7 مقرنٌ يتعارض معه: يسقط المقرّرُ كلُّه ولا تذكرةَ بمقررٍ بلا مقرنه", clash.tickets[0]);
  check(!clash.tickets[0].plans.some(p => p.items.some(i => i.courseId === 1) && !p.items.some(i => i.courseId === 2)), "S7 ولا في الخطتين (ب) و(ج)");
  const elec = run(okOffs, [st("c")]).tickets[0].plans[0].items.map(i => i.courseId).filter(id => id >= 4);
  check(elec.length === 2, "S7 المجموعةُ بحدّ ست وحدات: مقرران لا واحد", elec);
  const mixed = run([off(1, "01", 0, "08:00", "09:00", 0), off(1, "02", 1, "08:00", "09:00"), off(2, "01", 1, "08:30", "09:30"), ...okOffs.slice(2)], [{ ...st("d"), wishes: { targetUnits: 18, courseIds: [], constraints: {} } }]);
  const reasons = mixed.demand.find(d => d.courseId === 1)!.unmet;
  check(reasons.full === 0 && reasons.conflict >= 1, "S7 شعبةٌ ممتلئة وأخرى فيها مقعدٌ يمنعها الوقتُ: «تعارض» لا «امتلأت»", reasons);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
