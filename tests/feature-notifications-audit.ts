/**
 * ── الإشعاراتُ والمزايا الجديدة (الطالب والعاملون) ─────────────────────────────
 *
 *   N1 «ما الجديد؟» في مساري: ما يُطلب، وما جهز، وما قرّره القسمُ والتسجيل.
 *   N2 جرسُ العاملين: صحيفةٌ قيد المراجعة، الرادار، ما تعثّر فيه الطلبة — بالصفة والنطاق.
 *   N3 الربط: الخادمُ يضيف بنودَ المزايا إلى /api/notifications، والواجهةُ تعرف وجهتَيها.
 */
import fs from "fs";
import path from "path";
import { buildStudentNotices, type StudentNoticeInput } from "../src/utils/studentNotices";
import { buildFeatureNotifications } from "../src/utils/featureNotifications";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string, extra?: unknown) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const base: StudentNoticeInput = {
  setupDone: true, phase: { mode: "waiting", canEditWishes: false, canReport: false, line: "" }, hasWishes: false, ticket: null,
  reportAnswered: false, reportCourses: 0, cases: [],
};
const ids = (input: StudentNoticeInput) => buildStudentNotices(input).map(n => n.id);
{
  const plain = buildStudentNotices({ ...base, cases: [{ courseId: 3, name: "الذكاء الاصطناعي", state: "awaiting-registration" }] }).find(n => n.id === "case:3:awaiting");
  const opened = buildStudentNotices({ ...base, cases: [{ courseId: 3, name: "الذكاء الاصطناعي", state: "awaiting-registration", opened: true }] }).find(n => n.id === "case:3:awaiting");
  check(plain?.detail === "بانتظار التسجيل." && /فُتحت لك شعبةٌ جديدة/.test(opened?.detail || "") && !/موعد|\d{2}:\d{2}/.test(opened?.detail || ""), "N1 موافقةٌ فتحت شعبةً: يُقال للطالب ذلك بلا موعدٍ (الجدولُ مسوّدةٌ حتى يعتمده القسم)", opened);
}

/* N1 */
{
  const withOpen = buildStudentNotices({ ...base, opened: [{ courseId: 9, name: "مشروع التخرج", section: "502" }] }).find(n => n.id === "opened:9");
  check(withOpen?.tone === "action" && withOpen.title.includes("مشروع التخرج") && withOpen.target === "ticket", "N1 فُتحت شعبةٌ لمقررٍ أرده الطالب: يُقال له ويُحال إلى تذكرته");
  check(ids({ ...base }).includes("advice") && !ids({ ...base, setupDone: false }).includes("advice"), "N1 «مقترحك الشخصي» لمن أكمل ملفّه وحده");
  check(ids({ ...base, setupDone: false }).join() === "setup", "N1 ملفٌّ لم يكتمل: «أكمل ملفّك» وحدها");
  check(ids({ ...base, phase: { ...base.phase, canEditWishes: true, nextAt: "25 أكتوبر", nextLabel: "تنتهي الرغبات" } }).includes("wishes-open"), "N1 الرغباتُ مفتوحة ولم يكتب: يُطلب منه");
  check(!ids({ ...base, hasWishes: true, phase: { ...base.phase, canEditWishes: true } }).includes("wishes-open"), "N1 كتب رغباته: لا يُطلب ثانيةً");
  const tk = buildStudentNotices({ ...base, ticket: { stale: false, window: 2, of: 3, windowName: "مبكر", start: "14 نوفمبر" } });
  check(tk.some(n => n.id === "ticket-ready:2" && /نافذتك 2 من 3/.test(n.title) && /14 نوفمبر/.test(n.detail || "")), "N1 تذكرةٌ جاهزة بنافذتها وتاريخها", tk);
  check(ids({ ...base, ticket: { stale: true, window: 1, of: 2 } }).includes("ticket-stale"), "N1 ملفٌّ عُدّل بعد الحساب: يُقال له");
  check(ids({ ...base, phase: { ...base.phase, canReport: true }, reportCourses: 4 }).includes("report-open"), "N1 الجولة جارية: «هل سجّلت؟» مطلوب");
  check(!ids({ ...base, phase: { ...base.phase, canReport: true }, reportCourses: 0 }).includes("report-open"), "N1 بلا مقرراتٍ تُسأل عنها: لا يُسأل");
  const answered = ids({ ...base, phase: { ...base.phase, canReport: true }, reportCourses: 4, reportAnswered: true });
  check(answered.includes("report-done") && !answered.includes("report-open"), "N1 أجاب: «وصل جوابك» لا «أخبرنا»");
  const cs = buildStudentNotices({ ...base, cases: [
    { courseId: 1, name: "فقه", state: "registered" }, { courseId: 2, name: "تفسير", state: "committee-rejected", reasonCode: "prerequisite" },
    { courseId: 3, name: "سيرة", state: "awaiting-registration" }, { courseId: 4, name: "عقيدة", state: "pending" }, { courseId: 5, name: "حديث", state: "rejected", note: "امتلأت الشعبة" },
    { courseId: 6, name: "نحو", state: "rejected", dropped: true },
  ] });
  check(cs.filter(n => n.id.startsWith("case:")).length === 5 && cs.every(n => n.id !== "case:6:rejected"), "N1 ما حذفه الطالب لا يُقال له");
  check(cs[0].tone === "alert" && cs[cs.length - 1].tone === "done", "N1 الترتيب: ما رُدّ أولاً، وما تمّ آخراً", cs.map(n => n.tone));
  check(cs.find(n => n.id.startsWith("case:2"))!.detail === "متطلّبٌ سابق لم يُستوفَ" && cs.find(n => n.id.startsWith("case:5"))!.detail === "امتلأت الشعبة", "N1 سببُ الرفض يُقال: من القائمة أو من ملاحظة القسم");
  check(new Set(cs.map(n => n.id)).size === cs.length, "N1 معرّفاتٌ فريدة");
}

/* N2 */
{
  const review = (n: number) => ({ planId: `p${n}`, planName: "الجديدة", sectionId: n, collegeId: 1, sectionName: `قسم ${n}`, updatedAt: `2026-10-1${n}T00:00:00Z` });
  const chair = buildFeatureNotifications({ role: "committeeChair", planReviews: [review(1)], radar: null, outcome: null });
  check(chair.length === 1 && chair[0].tone === "action" && chair[0].view === "planReview" && /تنتظر مراجعتك واعتمادك/.test(chair[0].title), "N2 رئيسُ اللجنة: صحيفةٌ تنتظر اعتماده (فعلٌ مطلوب)");
  const head = buildFeatureNotifications({ role: "departmentHead", planReviews: [review(1)], radar: null, outcome: null });
  check(head[0].tone === "waiting" && /قيد المراجعة/.test(head[0].title), "N2 رئيسُ القسم: يُعلم ولا يُطلب منه اعتماد");
  const many = buildFeatureNotifications({ role: "committeeChair", planReviews: [1, 2, 3, 4, 5, 6].map(review), radar: null, outcome: null });
  check(many.length === 5 && /قسمان/.test(many[4].title), "N2 أكثر من أربع: أربعٌ وبندٌ يجمع الباقي", many.map(m => m.title));
  const twoPlans = buildFeatureNotifications({ role: "committeeChair", planReviews: [{ ...review(1), planId: "a" }, { ...review(1), planId: "b", planName: "السابقة" }, review(2)], radar: null, outcome: null });
  check(twoPlans.length === 2 && /صحيفتان/.test(twoPlans.find(x => x.sectionId === 1)!.title), "N2 صحيفتان في قسمٍ واحد: إشعارٌ واحد لا اثنان", twoPlans.map(m => m.title));
  const girls = [{ ...review(1), planId: "g1", planName: "صحيفة 2026", sectionName: "قسم المناهج", groupKey: "المناهج|girls", groupLabel: "قسم المناهج · بنات (مع الجهراء والفحيحيل)" }, { ...review(2), planId: "g2", planName: "BA-0115 2026/2027", groupKey: "المناهج|girls", groupLabel: "قسم المناهج · بنات (مع الجهراء والفحيحيل)" }, { ...review(3), planId: "g3", planName: "صحيفة 2026", groupKey: "المناهج|girls", groupLabel: "قسم المناهج · بنات (مع الجهراء والفحيحيل)" }];
  const girlsOnly = buildFeatureNotifications({ role: "committeeChair", planReviews: girls, radar: null, outcome: null });
  const manyFamilies = buildFeatureNotifications({ role: "committeeChair", planReviews: ["أ", "ب", "ج", "د", "هـ"].map((x, i) => ({ ...review(i + 1), planId: `f${i}`, planName: "صحيفة 2026", sectionName: `قسم الدراسات الإسلامية · كلية ${x}`, groupKey: "الدراسات الإسلامية", groupLabel: "قسم الدراسات الإسلامية", unitKey: `كلية ${x}|girls|2026` })), radar: null, outcome: null });
  check(manyFamilies.length === 1 && /5 صحائف|خمس/.test(manyFamilies[0].title) && manyFamilies[0].detail === "قسم الدراسات الإسلامية", "N2 القسمُ نفسه في كلياتٍ عدة: إشعارٌ واحد لا خمسة", manyFamilies.map(m => [m.title, m.detail]));
  check(girlsOnly.length === 1 && /صحيفة «صحيفة 2026» تنتظر/.test(girlsOnly[0].title), "N2 بناتُ القسم في المواقع الثلاثة (صحيفةٌ واحدة بالسنة): إشعارٌ واحد", girlsOnly.map(m => m.title));
  const r1 = buildFeatureNotifications({ role: "committeeChair", planReviews: [], radar: { ranAt: "2026-10-15T10:00:00Z", needsDecision: 3, scoped: true }, outcome: null });
  check(r1[0].view === "simulation" && r1[0].tone === "action" && /3 مقررات تحتاج قراراً|ثلاثة مقررات/.test(r1[0].title) && /قسمك/.test(r1[0].detail), "N2 الرادار: مقرراتٌ تحتاج قراراً في قسمك", r1);
  check(buildFeatureNotifications({ role: "committeeChair", planReviews: [], radar: { ranAt: "x", needsDecision: 0, scoped: true }, outcome: null }).length === 0, "N2 لا مقرراتٍ تحتاج قراراً: لا إشعار (لا ضجيج)");
  const r2 = buildFeatureNotifications({ role: "committeeChair", planReviews: [], radar: { ranAt: "2026-10-16T10:00:00Z", needsDecision: 3, scoped: true }, outcome: null });
  check(r1[0].id !== r2[0].id, "N2 تحديثُ الرادار إشعارٌ جديد (المعرّف يحمل وقتَه)");
  const dean = buildFeatureNotifications({ role: "dean", planReviews: [], radar: { ranAt: "x", needsDecision: 5, scoped: false }, outcome: { answered: 900, stuck: 120, scoped: false } });
  check(dean.length === 2 && dean.find(d => d.id.startsWith("outcome:"))?.tone === "alert" && dean.find(d => d.id.startsWith("radar:"))?.tone === "waiting", "N2 العميد: يُنبَّه إلى تعثّر الطلبة (تنبيه) ويُعلَم بالرادار (انتظار)", dean.map(d => d.tone));
  check(buildFeatureNotifications({ role: "committeeChair", planReviews: [], radar: null, outcome: { answered: 10, stuck: 0, scoped: true } }).length === 0, "N2 لم يتعثّر أحد: لا إشعار");
  check(buildFeatureNotifications({ role: "instructor", planReviews: [], radar: null, outcome: { answered: 10, stuck: 5, scoped: false } }).length === 0, "N2 غيرُ العاملين على الجدول (كالأستاذ): لا شيء من هذا");
}

/* N3 */
{
  const server = read("server.ts");
  check(server.includes("buildFeatureNotifications({ role, planReviews: reviews") && server.includes("pendingPlanReviews(req, scopeDeps)") && server.includes("radarNoticeFor(req, scopeDeps)"), "N3 الخادم يضيف بنودَ المزايا إلى /api/notifications");
  check(server.includes('console.error("[notifications] feature items:"'), "N3 وتعذّرُها لا يُسقط الجرس");
  const center = read("src/utils/notificationCenter.ts");
  check(center.includes('"planReview"') && center.includes('"simulation"'), "N3 وجهتا الإشعار معرَّفتان");
  const app = read("src/App.tsx");
  check(app.includes('case "planReview"') && app.includes('case "simulation"'), "N3 والواجهة تفتح الوجهتين");
  const page = read("src/server/studentHomePage.ts");
  check(page.includes("/api/public/me/notices") && page.includes('id=\\"notices\\"'.replace(/\\/g, "")) , "N3 مساري يعرض «ما الجديد؟»");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
