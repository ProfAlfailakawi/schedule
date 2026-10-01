/**
 * التقويم الأكاديمي المعتمد والإنشاء التلقائي للفصل التالي.
 * البداية أحدٌ دائماً، والنهاية خميسٌ دائماً: بداية + (أسابيع−1)×7 + 4.
 */
import fs from "fs";
import { autoTermDue, defaultTermDates, sundayNearest, termEndDate, termHasEnded, termStatus, termWindow } from "../src/utils/termSequence";
import { closeEndedTerms, runAutoTermJob } from "../src/server/autoTerms";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => { if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); } };
const dow = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();

/* الأمثلة المؤكَّدة من صاحب النظام */
const cases: Array<[string, string, string, number]> = [
  ["الفصل الأول 2026/2027", "2026-09-13", "2026-12-17", 14],
  ["الفصل الثاني 2026/2027", "2027-01-31", "2027-05-06", 14],
  ["الفصل الصيفي 2026/2027", "2027-06-13", "2027-07-29", 7],
];
for (const [name, start, end, weeks] of cases) {
  const d = defaultTermDates(name);
  check(!!d && d.start === start && d.end === end && d.weeks === weeks, `${name}: ${start} ← ${end} (${weeks})  [${d?.start} ← ${d?.end}]`);
}

/* سنوات أخرى: البداية أحد، والنهاية خميس، وعلى بُعد ٣ أيام أو أقل من الموعد */
for (let y = 2020; y <= 2035; y++) {
  for (const season of ["الأول", "الثاني", "الصيفي"]) {
    const d = defaultTermDates(`الفصل ${season} ${y}/${y + 1}`)!;
    const anchor = season === "الأول" ? `${y}-09-13` : season === "الثاني" ? `${y + 1}-01-31` : `${y + 1}-06-13`;
    const gap = Math.abs(Date.parse(`${d.start}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86400000;
    if (!(dow(d.start) === 0 && dow(d.end) === 4 && gap <= 3)) check(false, `${season} ${y}: ${d.start} ← ${d.end}`);
  }
}
check(true, "2020–2035: كل بدايةٍ أحد وكل نهايةٍ خميس، وعلى ٣ أيام أو أقل من الموعد");
check(sundayNearest(2025, 9, 13) === "2025-09-14" && sundayNearest(2028, 9, 13) === "2028-09-10", "أقرب أحد: 13/9/2025 (سبت) ← 14/9 · 13/9/2028 (أربعاء) ← 10/9");
check(termEndDate("2026-09-13", 1) === "2026-09-17", "أسبوعٌ واحد: الأحد ← الخميس نفسه");

/* النافذة: المُدخَل يسبق، والنهاية بعد الخميس بيوم */
const w = termWindow({ AdTermName: "الفصل الأول 2026/2027" })!;
check(w.source === "default" && w.from === Date.parse("2026-09-13T00:00:00") && w.to === Date.parse("2026-12-18T00:00:00"), "النافذة الافتراضية: 13/9 ← نهاية الخميس 17/12");
const declared = termWindow({ AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-20", AdTermWeeks: 10 })!;
check(declared.source === "declared" && declared.to === Date.parse("2026-11-27T00:00:00"), "المُدخَل يسبق: 20/9 + 10 أسابيع ← الخميس 26/11");
check(!termHasEnded({ AdTermName: "الفصل الأول 2026/2027" }, Date.parse("2026-12-17T20:00:00")) && termHasEnded({ AdTermName: "الفصل الأول 2026/2027" }, Date.parse("2026-12-18T01:00:00")), "منتهٍ تلقائياً بعد يوم الخميس الأخير لا قبله");

/* الحالة المعروضة */
const terms = [
  { AdTermId: 1, AdTermName: "الفصل الصيفي 2025/2026" },
  { AdTermId: 2, AdTermName: "الفصل الأول 2026/2027", AdTermClosed: false },
];
const oct = Date.parse("2026-10-05T10:00:00");
check(termStatus(terms[1], terms, oct) === "current" && termStatus(terms[0], terms, oct) === "ended", "شاشة الفصول: الجاري «جارٍ» والصيفي المنقضي «منتهٍ» تلقائياً");

/* موعد الإنشاء التلقائي */
const due = (iso: string) => autoTermDue(Date.parse(`${iso}T09:00:00`));
check(due("2026-10-01").name === "الفصل الثاني 2026/2027" && due("2026-10-01").start === "2027-01-31" && due("2026-10-01").weeks === 14, "١ أكتوبر 2026 ← الثاني 2026/2027 (31/1/2027، 14)");
check(due("2026-09-30").name === "الفصل الأول 2026/2027", "٣٠ سبتمبر: لا شيء جديد بعد (الأول قائم)");
check(due("2027-01-01").name === "الفصل الصيفي 2026/2027" && due("2027-01-01").start === "2027-06-13" && due("2027-01-01").weeks === 7, "١ يناير 2027 ← الصيفي 2026/2027 (13/6، 7)");
check(due("2027-04-01").name === "الفصل الأول 2027/2028" && due("2027-04-01").start === "2027-09-12", "١ أبريل 2027 ← الأول 2027/2028 (12/9/2027)");

/* المهمة: تُنشئ مرةً واحدة، ولا تعمل في وضع العرض */
(async () => {
  const store: Array<{ AdTermId: number; AdTermName: string; AdTermStart?: string; AdTermWeeks?: number }> = [];
  const deps = (demo: boolean) => ({
    isDemoMode: () => demo,
    createTermIfAbsent: async (name: string, dates: { start: string; weeks: number }) => {
      if (store.some(t => t.AdTermName.replace(/\s+/g, "") === name.replace(/\s+/g, ""))) return null;
      const row = { AdTermId: store.length + 1, AdTermName: name, AdTermStart: dates.start, AdTermWeeks: dates.weeks };
      store.push(row); return row;
    },
  });
  check(await runAutoTermJob(deps(true), oct) === null && store.length === 0, "وضع العرض: لا إنشاء");
  const first = await runAutoTermJob(deps(false), Date.parse("2026-10-02T09:00:00"));
  const again = await runAutoTermJob(deps(false), Date.parse("2026-10-03T09:00:00"));
  check(first === "الفصل الثاني 2026/2027" && again === null && store.length === 1 && store[0].AdTermStart === "2027-01-31" && store[0].AdTermWeeks === 14,
    "المهمة متكرّرة الأمان: فصلٌ واحد بتاريخه وأسابيعه");
  const server = fs.readFileSync("server.ts", "utf8");
  const repo = fs.readFileSync("src/db/repository.ts", "utf8");
  check(server.includes("scheduleAutoTermJob({") && server.includes("Repository.createTermIfAbsent("), "الخادم يجدول المهمة عبر المستودع");
  check(repo.includes('collection("autoTermClaims").doc(') && repo.includes("await claim.create("), "Firestore: حجزُ الاسم ذرّي فلا يولد فصلان من نسختين");
  check(repo.includes("await claim.delete()"), "Firestore: فشلُ الإنشاء بعد الحجز يفكّ الحجز");
  {
    const terms: any[] = [
      { AdTermId: 1, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 14 },
      { AdTermId: 2, AdTermName: "الفصل الصيفي 2025/2026" },
      { AdTermId: 3, AdTermName: "الفصل الثاني 2025/2026", AdTermClosed: false, AdTermReopenedAt: "2026-06-01T00:00:00Z" },
      { AdTermId: 4, AdTermName: "الفصل الأول 2025/2026", AdTermClosed: false },
    ];
    const closed: number[] = [];
    const d = (demo: boolean) => ({ isDemoMode: () => demo, createTermIfAbsent: async () => null,
      getTerms: async () => terms, closeTerm: async (t: any) => { closed.push(t.AdTermId); } });
    await closeEndedTerms(d(false), Date.parse("2026-12-16T12:00:00"));
    check(closed.join() === "2,4", "المنتهي بتاريخه يُغلق وحده (ولو حُفظ false من النموذج)؛ الجاري لا يُمسّ؛ ما أُعيد فتحه بعد نهايته يبقى مفتوحاً");
    closed.length = 0;
    await closeEndedTerms(d(false), Date.parse("2026-12-19T12:00:00"));
    check(closed.includes(1), "الأول 2026/2027 يُغلق بعد الخميس 17/12");
    closed.length = 0;
    await closeEndedTerms(d(true), Date.parse("2027-12-19T12:00:00"));
    check(closed.length === 0, "وضع العرض: لا إغلاق");
    check(server.includes("closeTerm: term => Repository.updateTerm("), "الخادم يغلق عبر المستودع ويحفظ التقويم");
  }
  console.log(`\nTerm calendar audit: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
})();
