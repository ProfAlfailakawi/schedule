/**
 * ── تدقيق ما بعد الدمج: طلب الأستاذ ووارد القسم وصفحاتها العامة ────────────
 *
 * كلُّ فحصٍ هنا يحرس خللاً وُجد فعلاً عند تشغيل الصفحات على بياناتٍ حيّة:
 *   - بديلٌ لمحاضرة يومين كان يعرض يوماً واحداً، فتصير المحاضرةُ يوماً بضغطة.
 *   - قرارُ «رُفض» كان يبقى على بندٍ غيّر الأستاذُ وقتَه وأعاد إرساله.
 *   - قرارُ الإضافة كان يُمحى عند كل إعادة إرسال، فتعود مثبَّتةٌ «بانتظار».
 *   - تعابيرُ نمطيةٌ داخل قوالب الخادم كانت تفقد شرطتَها المائلة (\s → s)
 *     فلا تُطابق شيئاً في المتصفح، ولا يلاحظ أحد.
 *   - الواردُ على مستوى الكلية يُصفّى بنطاق الحساب قسماً قسماً.
 */

import { readFileSync } from "node:fs";
import vm from "node:vm";
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = readFileSync("server.ts", "utf8");
const inbox = readFileSync("src/components/InstructorInbox.tsx", "utf8");

/* ── البديلُ ينقل المحاضرةَ بأيامها ──────────────────────────────────────── */

const TEACHER = 7;
const row = (over: Partial<FSchedule> = {}): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: 5, AdTermId: 20, AdCourseId: 100, SCode: "01", AdInstructorId: TEACHER,
  fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "أ", AdRoomHall: "101", ...over,
} as FSchedule);
const course = (id: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: 5, CourseCode: `C${id}`, CourseName: `مقرر ${id}`, CourseCredit: 3, CourseHours: 3 } as AdCourse);
const teacher: AdInstructor = { AdInstructorId: TEACHER, AdInstructorCivil: "000000000007", AdInstructorName: "د. 7" } as AdInstructor;
/* الأستاذ مشغولٌ الأحد والثلاثاء عند الثامنة والحادية عشرة — وهما كلُّ ما يعرفه سُلّمُ القسم. */
const busy = [row({ id: 1 }), row({ id: 2, AdCourseId: 200, fstarttime: "11:00", fendtime: "11:50" })];
const context: VerdictContext = {
  instructorId: TEACHER, allRows: busy, instructorRowsAfter: busy,
  courses: new Map([[100, course(100)], [200, course(200)], [300, course(300)]]),
  instructors: new Map([[TEACHER, teacher]]), knownRoomKeys: [], startLadder: ["08:00", "11:00"],
};
const ask: RequestedRow = { rowId: null, action: "add", AdCourseId: 300, days: ["fsunday", "ftuesday"], start: "08:00" };
const verdict = judgeRequest(ask, { ...context, instructorRowsAfter: [...busy, row({ id: -1, AdCourseId: 300 })] });
check(verdict.kind === "conflict", "إضافةٌ فوق محاضرةٍ قائمة تُمنع");
check(verdict.nearestTimes.length > 0, "وحين تمتلئ بداياتُ القسم المعروفة يُكمَّل البديلُ من شبكة اللائحة");
check(verdict.nearestTimes.every(slot => slot.days.join() === "fsunday,ftuesday"),
  "وكلُّ بديلٍ يحمل أيامَ المحاضرة كلها، لا يوماً منها");
check(verdict.nearestTimes.every(slot => slot.start !== "08:00" && slot.start !== "11:00"),
  "ولا يُقترح وقتٌ الأستاذُ مشغولٌ فيه");
check(judgeRequest(ask, { ...context, startLadder: [] }).nearestTimes.length === 0,
  "وبلا سُلّمٍ معروفٍ للقسم لا يُقترح شيء");

const page = server.slice(server.indexOf("function instructorRequestPage"), server.indexOf('app.post("/api/public/request/:token/check"'));
check(page.includes('data-alt="\'+esc(ds.join(",")+"|"+a.start)') && page.includes('p[0].split(",").filter(Boolean)'),
  "وصفحةُ الأستاذ تطبّق البديلَ بأيامه كلها");
check(server.includes("nearestTimes: verdict.nearestTimes.map(entry => ({ day: entry.day, days: entry.days,"),
  "والأيامُ تصل من الحكم إلى الصفحة والوارد");

/* ── قرارُ القسم يخصّ ما طُلب يومَ قُرِّر ───────────────────────────────── */

const decideSrc = server.slice(server.indexOf("function decisionStillApplies"), server.indexOf("async function instructorRequestItemsFromPayload"));
const helpers = new vm.Script(decideSrc.replace(/: [A-Za-z<>\[\]| ]+(?=[,)=])/g, "").replace(/\): boolean \{/g, ") {").replace(/\): [A-Za-z| ]+ \{/g, ") {")
  + "\nthis.decisionStillApplies = decisionStillApplies; this.priorAddFor = priorAddFor;");
const sandbox: any = {};
try { helpers.runInNewContext(sandbox); } catch (error) { console.log(String(error)); }
const { decisionStillApplies, priorAddFor } = sandbox;
const rejected = { action: "change", slots: [{ day: "fmonday", start: "09:30" }, { day: "fwednesday", start: "09:30" }], decision: { state: "rejected" } };
check(typeof decisionStillApplies === "function" && decisionStillApplies(rejected, "change", ["fwednesday", "fmonday"], "09:30") === true,
  "بندٌ لم يتغيّر يبقى قرارُه");
check(decisionStillApplies?.(rejected, "change", ["fmonday", "fwednesday"], "11:00") === false,
  "وبندٌ غيّر الأستاذُ وقتَه يسقط عنه «رُفض» القديم");
check(decisionStillApplies?.(rejected, "delete", [], "") === false, "وكذلك إن غيّر نوعَ الطلب");
const adds = [
  { action: "add", after: { courseId: 8, collegeId: 2, sectionId: 3 }, slots: [{ day: "fthursday", start: "12:00" }], decision: { state: "fixed" } },
  { action: "add", after: { courseId: 8, collegeId: 2, sectionId: 3 }, slots: [{ day: "fthursday", start: "12:00" }], decision: { state: "rejected" } },
];
const used = new Set<number>();
check(priorAddFor?.(adds, used, 8, 2, 3, ["fthursday"], "12:00")?.decision?.state === "fixed"
  && priorAddFor?.(adds, used, 8, 2, 3, ["fthursday"], "12:00")?.decision?.state === "rejected",
  "والإضافةُ تستعيد قرارَها بمطابقة المقرّر وموقعه وأيامه وبدايته، وكلُّ سابقةٍ مرّةً واحدة");
check(priorAddFor?.(adds, new Set(), 8, 2, 3, ["fthursday"], "13:00") === undefined,
  "وإضافةٌ غيّر الأستاذُ وقتَها طلبٌ جديد بلا قرار");
check((server.match(/decisionStillApplies\(stored, action, days, start\)/g) || []).length === 2
  && (server.match(/priorAddFor\(/g) || []).length === 3,
  "ومسارا الفحص والإرسال كلاهما يطبّقان القاعدة نفسها");

/* ── قوالبُ الخادم لا تأكل شرطاتِها ──────────────────────────────────────── */

let eaten = 0;
const lowerServer = server.toLowerCase();
for (let at = lowerServer.indexOf("<script"); at >= 0; at = lowerServer.indexOf("<script", at + 1)) {
  const end = lowerServer.indexOf("</script", at);
  const body = server.slice(at, end < 0 ? undefined : end);
  eaten += (body.match(/(?<!\\)\\[sdwbDSW]/g) || []).length;
}
check(eaten === 0, "لا تعبيرَ نمطيَّ في صفحةٍ عامة يفقد شرطتَه المائلة عند التوليد");

const staffSrc = server.slice(server.indexOf("function staffCardPage"), server.indexOf("</html>`", server.indexOf("function staffCardPage")) + 9) + ";}";
const staffHtml = (() => {
  const sb: any = {};
  vm.runInNewContext(staffSrc.replace("function staffCardPage(token: string, label: string, nonce: string, demoHint = \"\"): string {", "function staffCardPage(token, label, nonce, demoHint = \"\") {")
    + "\nthis.html = staffCardPage('t','قسم','n');", sb);
  return String(sb.html);
})();
/* السكربتُ يُقتطع بالبحث النصّي لا بتعبيرٍ نمطيٍّ لوسوم HTML: هذا اختبارٌ على
   صفحةٍ نولّدها نحن، والاقتطاعُ بالموضع لا يَعِد بما لا يفعله. */
const lowerHtml = staffHtml.toLowerCase();
const scriptOpen = lowerHtml.indexOf(">", lowerHtml.indexOf("<script")) + 1;
const script = staffHtml.slice(scriptOpen, lowerHtml.indexOf("</script", scriptOpen));
const fnOf = (name: string) => {
  const at = script.indexOf(`function ${name}(`);
  const body = script.slice(at, script.indexOf("}", script.indexOf("return", at)) + 1);
  const sb: any = {}; vm.runInNewContext(body + `\nthis.f=${name};`, sb); return sb.f as (value: string) => string;
};
check(fnOf("visibleCardCollege")("كلية التربية الأساسية - بنات") === "",
  "التربيةُ الأساسية بنات صامتةٌ فعلاً في المتصفح، لا في المصدر وحده");
check(fnOf("visibleCardCollege")("كلية الدراسات التجارية - بنات") === "كلية الدراسات التجارية - بنات", "وغيرُها يظهر");
check(fnOf("shortCardCollege")("كلية الدراسات التجارية - بنات") === "الدراسات التجارية - بنات"
  && fnOf("shortCardCollege")("101 · كلية الدراسات التجارية - بنات") === "الدراسات التجارية - بنات",
  "والخليةُ تختصر: لا رقمَ ولا كلمةَ «كلية»");
check(staffHtml.includes('if(pick){window.location.href="/r/"+encodeURIComponent(pick.linkId);return;}'),
  "«طلب تعديل الجدول» يفتح النموذجَ مباشرةً");

/* ── الوارد على مستوى الكلية ──────────────────────────────────────────────── */

const inboxRoute = server.slice(server.indexOf('app.get("/api/instructor-requests"'), server.indexOf('app.post("/api/instructor-requests/:id/decide"'));
check(inboxRoute.includes('if (!collegeId || !termId)') && !inboxRoute.includes("!collegeId || !sectionId || !termId"),
  "القسمُ اختياري في الوارد");
check(inboxRoute.includes("&& isScopeAllowed(req, scope.collegeId, Number(scope.sectionId) || -1);")
  && inboxRoute.includes("(scopeRowsAll as any[]).filter(row => inScope("),
  "وبلا قسمٍ يُصفّى كلُّ طلبٍ وكلُّ صفٍّ بنطاق الحساب قسماً قسماً");
/* الطلبُ يحمل جدولَ الأستاذ بكل كلياته، فكلُّ بندٍ يُصفّى بموقعه هو: ما خارج
   المختار يصير مكاناً فارغاً بلا تفاصيل، ويبقى ترقيمُ البنود كما هو. */
check(inboxRoute.includes("Repository.getInstructorRequests(0, 0, termId)")
  && /inSelection\(requestItemScope\(full, item\)\)\s*\?\s*\(awaited\.has\(index\) \? \{ \.\.\.item, awaitedElsewhere: true \} : item\)\s*:\s*hiddenItem\(item\)/.test(inboxRoute)
  /* المخفيُّ يحمل رقمَ الصفّ ونوعَ الفعل وحالةَ القرار — ليُعرف أنّ إضافةً هنا
     تنتظر حذفاً هناك — ولا مقرّرَ ولا وقتَ ولا قاعة. */
  && (() => {
    const hidden = inboxRoute.slice(inboxRoute.indexOf("const hiddenItem = "), inboxRoute.indexOf("} as any);", inboxRoute.indexOf("const hiddenItem = ")));
    return hidden.includes("slots: []") && hidden.includes("hidden: true")
      && !/before|after|courseName|room|start|end|excuse|note/.test(hidden.replace(/decision\?\.state|decision:/g, ""));
  })(),
  "وكلُّ بندٍ يصل منسّقَ كليته وحده، ولا يصل غيرَه منه شيء");
check(inboxRoute.includes(".map(id => sectionNameOf.get(id) || \"\").filter(Boolean)"), "وكلُّ طلبٍ يحمل اسمَ قسم ما يُرى منه");
check(inbox.includes('className="request-card-section"') && inbox.includes('item.action === "add" && item.after?.collegeName'),
  "والبطاقةُ تعرض القسمَ، والإضافةُ تعرض كليتَها");

/* ── صفحةُ الأستاذ: ما يحتاجه من لا يعرف التقنية ──────────────────────────── */

check(page.includes("function startChoices(days)") && page.includes('data-quick="'), "بداياتٌ جاهزة بضغطة");
check(page.includes("function saveDraft()") && page.includes("localStorage.setItem(DRAFT_KEY")
  && !/saveDraft[\s\S]{0,300}signCivil/.test(page), "والمسودةُ تُحفظ في الجهاز بلا رقمٍ مدني");
check(page.includes('window.addEventListener("beforeunload"'), "وتنبيهٌ قبل مغادرة ما لم يُرسل");
check(page.includes("function decisionBox(") && page.includes("data-dept-alt"), "وقرارُ القسم وبدائلُه في البطاقة نفسها");
check(page.includes("function originalOf(it)"), "و«موعدك الحالي نفسه» يُقاس على الموعد الأصلي لا على المطلوب");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
