/**
 * ── تدقيق تجربة العميد والتنبيهات والنطاق ───────────────────────────────────
 *
 * ما يحرسه هذا الملفّ (معرّفات المراجعة بين قوسين):
 *   - البحث بالجملة لا يقرأ خارج نطاق القارئ (N9).
 *   - أقسامُ «الكلية كلها» تُقرأ من حَكَمٍ واحد (N8).
 *   - …وبقية البنود تُضاف بأقسامها أدناه.
 */

import fs from "fs";
import path from "path";
import { coversWholeCollege, expandScopeSections, resolveSmartScope, type ScopePredicate } from "../src/server/readScope";
import { finalSourceFor, HISTORICAL_FINALITY_LABEL } from "../src/utils/finality";
import { buildNotifications, pendingExtensionRequest, routeFor, type CenterScope } from "../src/utils/notificationCenter";
import { emptyApproval } from "../src/utils/approvalWorkflow";
import { daysLeftUntil, isLate } from "../src/utils/lateness";
import { buildFairnessEngine } from "../src/utils/livingSchedule";
import { placeholderInstructorIdsOf } from "../src/utils/placeholderInstructor";
import { mergeBalanceDepartments } from "../src/components/Reports";
import { NOTIFY_FOCUS_KEY, takeNotifyFocus, writeNotifyFocus } from "../src/utils/notifyFocus";
import { currentTermId as currentTermIdOf, planningTermCandidates, planningTermId } from "../src/utils/termSequence";
import { onboardingScenesFor } from "../src/components/Onboarding";
import { onboardingSeenKey } from "../src/utils/onboardingKey";
import { createDemoSandboxState, DEMO_ROLE_ACCOUNTS } from "../src/db/demoSandbox";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
/** جسمُ مسارٍ من الخادم: من تعريفه إلى تعريف المسار التالي. */
function routeBody(signature: string): string {
  const at = server.indexOf(signature);
  if (at === -1) return "";
  const next = server.indexOf("\napp.", at + signature.length);
  return server.slice(at, next === -1 ? undefined : next);
}
function fnBody(signature: string): string {
  const at = server.indexOf(signature);
  if (at === -1) return "";
  const next = server.indexOf("\n}\n", at);
  return server.slice(at, next + 3);
}

/* ── عالمٌ اصطناعي: كليتان، ثلاثة أقسام ─────────────────────────────────── */
const sections = [
  { AdSectionId: 11, AdCollegeId: 1 },
  { AdSectionId: 12, AdCollegeId: 1 },
  { AdSectionId: 21, AdCollegeId: 2 },
];
/** رئيس لجنة القسم ١١ وحده. */
const committee: ScopePredicate = (c, s) => c === 1 && s === 11;
/** عميد الكلية ١ (صفّ قسمٍ صفر). */
const dean: ScopePredicate = (c, s) => c === 1 && (s === 0 || s === 11 || s === 12);
/** عميد التسجيل: كل الكليات. */
const everyone: ScopePredicate = () => true;
/** حسابٌ بلا نطاق. */
const nobody: ScopePredicate = () => false;

/* ══ N9 — البحث بالجملة يلتزم النطاق ═════════════════════════════════════ */

check(resolveSmartScope({ requested: { collegeId: 1, sectionId: 12 }, sections, allowed: committee }).allowed === false,
  "N9: رئيس لجنة القسم ١١ يطلب القسم ١٢ فيُرفض");
check(resolveSmartScope({ requested: { collegeId: 0, sectionId: 21 }, sections, allowed: committee }).allowed === false,
  "N9: …ويطلب قسماً في كليةٍ أخرى بلا كلية فيُرفض");
check(resolveSmartScope({ requested: { collegeId: 1, sectionId: 21 }, sections, allowed: everyone }).allowed === false,
  "N9: كليةٌ لا تطابق القسمَ المطلوب تُرفض ولو كان القارئ واسع النطاق");
check(resolveSmartScope({ requested: { collegeId: 1, sectionId: 0 }, sections, allowed: committee, allowCollegeWide: true }).allowed === false,
  "N9: قراءةُ الكلية كلها لا تُجاز لمن له قسمٌ واحدٌ فيها");
check(resolveSmartScope({ requested: { collegeId: 0, sectionId: 0 }, sections, allowed: nobody, allowCollegeWide: true }).allowed === false,
  "N9: حسابٌ بلا نطاق لا ينتهي إلى قراءة الجامعة كلها");
{
  const own = resolveSmartScope({ requested: { collegeId: 1, sectionId: 11 }, sections, allowed: committee });
  check(own.allowed && own.sectionId === 11 && own.collegeId === 1, "N9: قسمُه نفسه يُقرأ");
  const auto = resolveSmartScope({ requested: { collegeId: 0, sectionId: 0 }, sections, allowed: committee, busiest: new Map([[21, 900], [11, 3]]) });
  check(auto.allowed && auto.sectionId === 11, "N9: بلا طلبٍ يُختار من داخل النطاق، لا الأكثف في الجامعة");
  const deanAuto = resolveSmartScope({ requested: { collegeId: 0, sectionId: 0 }, sections, allowed: dean, allowCollegeWide: true });
  check(deanAuto.allowed && deanAuto.collegeId === 1 && deanAuto.sectionId === 0, "N9/N28: العميد يُقرأ له مستوى كليته");
  const deanOther = resolveSmartScope({ requested: { collegeId: 2, sectionId: 0 }, sections, allowed: dean, allowCollegeWide: true });
  check(!deanOther.allowed, "N9: العميد لا يقرأ كليةً غير كليته");
}

const natural = routeBody('app.get("/api/search/natural"');
check(natural.includes("resolveSmartContext(req, { allowCollegeWide: true })") && /if \(!allowed\) \{ res\.status\(403\)/.test(natural),
  "N9: مسار البحث بالجملة يرفض ما لا يجيزه النطاق");
check(natural.includes("readSchedulesForRequest(req, collegeId, sectionId, termId)"),
  "N9: صفوفُ الإجابة من قارئ الطلب (نطاقٌ ونهائيٌّ للعميد)");
check(!natural.includes("scopedScheduleUniverse("),
  "N9: لا قراءةَ خامٍ لصفوف القسم المطلوب بلا نطاق");
const smart = fnBody("async function resolveSmartContext(");
check(smart.includes("resolveSmartScope(") && smart.includes("isScopeAllowed(req, collegeId, sectionId)"),
  "N9: السياق الذكي يحكم بالحَكَم الواحد");
check(!/requested\.collegeId \|\| Number\(section/.test(smart), "N9: لم تعد الكلية تؤخذ من الطلب كما جاءت");
const search = routeBody('app.get("/api/search"');
check(search.includes("readScopedTermRows(req, latestTermId)"), "N9: البحث العام يقرأ بالنطاق ويعطي العميدَ النهائي");
check(fnBody("async function readScopedTermRows(").includes("readsFinalSchedulesOnly(req) ? finalRowsOnly("),
  "N9: قارئ النطاق يطبّق «النهائي وحده» للعميد");

/* ══ N8 — أقسام الكلية الكاملة من حَكَمٍ واحد ═══════════════════════════ */

check(JSON.stringify([...expandScopeSections(sections, dean)].sort()) === JSON.stringify([11, 12]),
  "N8: صفُّ الكلية كلها يتوسّع إلى أقسامها");
check(coversWholeCollege(sections, dean, 1) && !coversWholeCollege(sections, committee, 1),
  "N8: «يغطّي الكلية» غيرُ «له شيءٌ فيها»");

/* ══ N1 — فصولٌ منتهية بلا دورة اعتماد تظهر «منفَّذة» ═══════════════════ */
{
  const noRecordEnded = finalSourceFor(undefined, true);
  check(noRecordEnded.kind === "live" && noRecordEnded.finality === "historical",
    "N1: فصلٌ منتهٍ وقسمٌ بلا سجلّ → الحيّ بصفة «منفَّذ»");
  check(finalSourceFor(undefined, false).kind === "none", "N1: الفصل الجاري/القادم يبقى المعتمدَ وحده");
  const accepted = finalSourceFor({ status: "accepted", rounds: [] }, false);
  check(accepted.kind === "live" && accepted.finality === "accepted", "N1: المعتمد الآن يُقرأ حيّاً «معتمداً»");
  const back = finalSourceFor({ status: "committee", rounds: [{ number: 1, acceptedAt: "2026-01-01", acceptedVersionId: "v1" }] }, true);
  check(back.kind === "version" && back.versionId === "v1", "N1: ما قُبل ثم عاد يُقرأ من نسخة القبول ولو انتهى الفصل");
  const neverEnded = finalSourceFor({ status: "drafting", rounds: [] }, true);
  check(neverEnded.kind === "live" && neverEnded.finality === "historical", "N1: سجلٌّ لم يُقبل قطّ في فصلٍ منتهٍ → «منفَّذ»");
  check(finalSourceFor({ status: "drafting", rounds: [] }, false).kind === "none", "N1: …وفي فصلٍ جارٍ لا يظهر");
}
check(HISTORICAL_FINALITY_LABEL === "جدول نُفّذ (قبل دورة الاعتماد)", "N1: التسمية كما طلبها المالك");
{
  const body = fnBody("async function finalRowsWithFinality(");
  check(body.includes("finalSourceFor(byScope.get(key), termEnded)"), "N1: القراءة النهائية تحكم بالدالّة الواحدة");
  check(!/if \(!approval\) continue;/.test(server), "N1: لم يعد القسم بلا سجلّ يسقط صامتاً");
  check(fnBody("async function termEndedForReading(").includes("termHasEnded("), "N1: الانتهاء من القاعدة المستقرّة termHasEnded");
  check(routeBody('app.get("/api/schedules", requireAnyPermission').includes('"X-Schedule-Finality"'), "N1: الخادم يكشف صفةَ كل قسم");
  const reports = read("src/components/Reports.tsx");
  check(reports.includes('X-Schedule-Finality') && reports.includes("HISTORICAL_FINALITY_LABEL"), "N1: التقرير يقرأ الصفة ويسمّيها");
}

/* ══ N2 / N11 — أوّل ما يراه العميدان ═══════════════════════════════════ */
{
  const reports = read("src/components/Reports.tsx");
  const lenses = reports.slice(reports.indexOf("const ROLE_LENSES"), reports.indexOf("const ROLE_LENSES") + 900);
  check(/dean:\s*\["balance"/.test(lenses) && /viceDean:\s*\["balance"/.test(lenses), "N2: العميد والعميد المساعد يبدآن بميزان الأقسام");
  check(reports.includes("initialLensFor(roleId, mode, saved.lens)"), "N2: العدسة الأولى من دالّةٍ واحدة تعرف الصفة");
  const fn = reports.slice(reports.indexOf("function initialLensFor("), reports.indexOf("function initialLensFor(") + 1400);
  check(reports.includes("const nextLens = modeSeen.current ? initialLensFor(roleId, mode, undefined) : lens;"),
    "N2: أثرُ تبدّل الشاشة لا يمحو العدسة الأولى عند الفتح");
  check(fn.includes('const generic = mode === "reportDepartment" || mode === "searchAdvanced";') && fn.includes('if (deanReader && generic) return "balance";'),
    "N2: تقرير القسم يفتح للعميدين على الميزان");
  check(fn.includes('if (wanted === "time" && fits("matrix")) return "matrix";'), "N11: شاشة ١٦ (الوقت) تُفتح للعميد المساعد على المصفوفة");
  check(fn.includes("fits(savedLens as Lens)"), "N11: عدسةٌ محفوظة لا تملكها الصفة لا تُفتح");
  check(/if \(lens === "list" && !all\.length && shownLenses\.some\(item => item\.id === "balance"\)\) setLens\("balance"\);/.test(reports)
    && reports.includes("autoBalanceDone.current = true"), "N2: قائمةٌ محفوظة فارغة تُحوَّل إلى الميزان مرّةً واحدة بعد القراءة");
}

/* ══ N15 — الإشعار يأخذ إلى شاشةٍ يملكها صاحبه ═══════════════════════════ */
{
  const scopeOf = (status: string, over: any = {}): CenterScope => ({
    approval: { ...emptyApproval(1, 11, 9), status, rounds: over.rounds || [], pendingAdditions: over.pendingAdditions || [], currentRound: (over.rounds || []).length } as any,
    collegeName: "كلية اختبار", sectionName: "قسم اختبار", rowCount: 5, openRegistrarNotes: 0, openRequests: 0,
    pendingRequests: over.pendingRequests, ...over,
  });
  const request = [{ requestId: "r1", instructorName: "أستاذ اختبار", count: 1, at: "2026-09-01T00:00:00Z" }];
  const headItems = buildNotifications({ role: "departmentHead", scopes: [scopeOf("committee", { pendingRequests: request }), scopeOf("returned", { rounds: [{ number: 1, returnedAt: "x" }] })] });
  check(headItems.length > 0 && headItems.every(item => item.view !== "schedules"), "N15: لا إشعارَ لرئيس القسم يشير إلى ورشة الجدول (صلاحية ٧ ليست له)");
  check(headItems.some(item => item.view === "scheduleChanges"), "N15: رئيس القسم يُؤخذ إلى تغييرات الجدول");
  check(!headItems.some(item => item.id.startsWith("request:")), "N15: طلبات الأساتذة لا تُعرض لمن لا يملك شاشتها");
  const committeeItems = buildNotifications({ role: "committeeChair", scopes: [scopeOf("returned", { rounds: [{ number: 1, returnedAt: "x" }], pendingRequests: request })] });
  check(committeeItems.find(item => item.title.includes("أرجع"))?.view === "scheduleChanges", "N15: «أُرجع» يأخذ اللجنة إلى الملاحظات في تغييرات الجدول");
  check(committeeItems.some(item => item.id.startsWith("request:") && item.view === "instructorRequests"), "N15: اللجنة (صلاحية ٧) ترى طلبات الأساتذة");
  check(routeFor("registrarHead", "approval") === "scheduleChanges" && routeFor("registrarStaff", "approval") === "scheduleChanges", "N15: التسجيل → تغييرات الجدول");
  check(routeFor("committeeChair", "approval") === "schedules", "N15: بقية إشعارات اللجنة → الورشة");
  check(routeFor("departmentHead", "request") === undefined && routeFor("committeeChair", "request") === "instructorRequests", "N15: طلبات الأساتذة لصلاحية ٧ وحدها");
  const nc = read("src/utils/notificationCenter.ts");
  check(!/view: "(schedules|scheduleChanges|instructorRequests|reportDepartment|studentRegistration)"/.test(nc), "N15: لا وجهةَ مكتوبةً بجانب routeFor");
}

/* ══ N8 (تتمّة) — لوحة البداية وقائمة الأساتذة بالحَكَم الواحد ════════════ */
{
  const dash = routeBody('app.get("/api/dashboard"');
  check(dash.includes("await scopeSectionIdsFor(req)"), "N8: لوحة البداية تقرأ أقسامها من الحَكَم الواحد");
  check(!dash.includes("(req.scopes || []).map(scope => Number(scope.AdSectionId))"), "N8: لا قائمةَ أقسامٍ خامٍ في لوحة البداية");
  check(dash.includes("readsFinalSchedulesOnly(req) ? await finalRowsOnly("), "N8: العميدان يريان النهائي في لوحة البداية");
  const ins = routeBody('app.get("/api/instructors", requireAnyPermission');
  check(ins.includes("isScopeAllowed(req, Number(sectionRow.AdCollegeId), sectionId)") && !ins.includes("scope.AdSectionId === sectionId"),
    "N8: قائمة أساتذة القسم تجيز صفَّ الكلية كلها");
  check(fnBody("async function scopeSectionIdsFor(").includes("expandScopeSections("), "N8: helper واحد يوسّع النطاق");
  check(!/new Set\(\(req\.scopes \|\| \[\]\)\.map\(scope => Number\(scope\.AdSectionId\)\)/.test(server), "N8: لا نسخةَ ثانية لتوسيع النطاق في الخادم");
}

/* ══ N13 — الرقم المدني والهاتف لا يصلان صفات الاطّلاع ═══════════════════ */
{
  const ins = routeBody('app.get("/api/instructors", requireAnyPermission');
  check(!/res\.json\(sortArabicNamed\(/.test(ins) && (ins.match(/send\(/g) || []).length === 3, "N13: كل إجابات دليل الأساتذة تمرّ بالمُرشِّح");
  const fn = fnBody("function instructorsForReader<");
  check(fn.includes("isReadOnlyRole(req.user?.Role)") && fn.includes('AdInstructorCivil: ""') && fn.includes('AdInstructorMobile: ""'), "N13: صفات الاطّلاع لا ترى الرقم المدني ولا الهاتف");
  const search = routeBody('app.get("/api/search"');
  check(search.includes("instructorsForReader(req, instructors)") && search.includes("readerInstructorCivil(ins)"), "N13: البحث العام لا يكشف الرقم المدني ولا يطابق عليه للقارئ");
}

/* ══ N3 / N21 — «متأخّر» قاعدةٌ واحدة ════════════════════════════════════ */
{
  const now = "2026-09-25T09:00:00Z";
  check(isLate({ approvalStatus: null, submittedRounds: 0, deadline: "2026-09-20", now }), "N3: قسمٌ لم يبدأ بعد انقضاء الموعد متأخّر");
  check(isLate({ approvalStatus: "drafting", rowCount: 0, deadline: "2026-09-20", now }), "N3: «قيد الإعداد» يتأخّر أيضاً (كان لا يتأخّر أبداً)");
  check(!isLate({ approvalStatus: "drafting", deadline: "2026-09-20", extension: "2026-10-01", now }), "N21: التمديد يتقدّم على موعد الفصل");
  check(!isLate({ approvalStatus: "submitted", submittedRounds: 1, deadline: "2026-09-20", now }), "N3: من سلّم ليس متأخّراً");
  check(!isLate({ approvalStatus: "drafting", submittedRounds: 2, deadline: "2026-09-20", now }), "N3: من سلّم من قبل ليس متأخّراً");
  check(!isLate({ approvalStatus: null, deadline: "2026-09-25", now }), "N3: اليوم الأخير نفسه ليس تأخّراً");
  check(!isLate({ approvalStatus: null, now }), "N3: بلا موعدٍ لا تأخّر");
  check(daysLeftUntil({ deadline: "2026-09-28", now }) === 3, "N4: الأيام الباقية من الدالّة نفسها");
  const term = routeBody('app.get("/api/approvals/term"');
  check(term.includes("notStarted") && term.includes('statusLabel: "لم يبدأ"'), "N3: الخادم يعيد أقسام النطاق التي لم تبدأ");
  check((term.match(/isLate\(/g) || []).length === 2, "N3: التأخّر في الخادم من isLate وحدها");
  const reports = read("src/components/Reports.tsx");
  check(reports.includes("late: Boolean(row.late)") && !reports.includes("Boolean(row.deadline?.past) && Number(row.currentRound"),
    "N3: الميزان لا يحسب التأخّر بنفسه");
  check(reports.includes("mergeBalanceDepartments(balance?.departments || [], approvals)"), "N3: أقسامُ النطاق بلا مواعيد تُدمج في الميزان");
  const nc = read("src/utils/notificationCenter.ts");
  check(nc.includes("isLate({") && !nc.includes('tone: input.deadline?.past ? "alert"'), "N21: جرس التسجيل يحكم بالقاعدة الواحدة وبتمديد كل قسم");
  const extended = buildNotifications({ role: "registrarHead", now: Date.parse(now), deadline: { effective: "2026-09-20", past: true },
    scopes: [{ approval: { ...emptyApproval(1, 11, 9) } as any, collegeName: "ك", sectionName: "ق", rowCount: 0, openRegistrarNotes: 0, openRequests: 0, deadline: { effective: "2026-10-05", past: false } }] });
  check(extended.find(item => item.id.startsWith("not-submitted"))?.tone === "waiting", "N21: قسمٌ مُدِّد له لا يُنبَّه عليه «متأخّراً»");
  const bell = fnBody("async function notificationItemsForTerm(");
  check(bell.includes("|| watchesSubmission;"), "N21: الجرس يعدّ أقسام النطاق التي لم تكتب شيئاً لمن يُحاسِب على التسليم");
}

/* ══ N4 / N5 — الميزان لكل النطاق، ويقول نطاقه ═══════════════════════════ */
{
  const reports = read("src/components/Reports.tsx");
  const fetchAt = reports.indexOf("fetch(`/api/approvals/term?${query}`");
  const before = reports.slice(fetchAt - 700, fetchAt);
  check(fetchAt > 0 && !before.includes('query.set("collegeId"'), "N4: حالات الاعتماد تُقرأ لكل كليات النطاق");
  check(reports.includes("countOf(state.daysLeft, AR.day"), "N4: الموعد والأيام الباقية لكل قسم (countOf)");
  check(reports.includes('isDeanReader && !filters.collegeId ? "اختر الكلية"'), "N4: عميدٌ بكليتين لم يختر يُقال له ذلك، لا «لم يُعتمد شيء»");
  check(!reports.includes("على مستوى الجامعة</span>") && reports.includes('balance.totals.scopeLabel ? `في ${balance.totals.scopeLabel}` : "في نطاقك"'), "N5: لا «على مستوى الجامعة» للعميد");
  check(reports.includes("(موثّقة {num(item.verifiedRooms)})"), "N5: القاعات الموثّقة تُذكر حين يرسلها الخادم");
  check(reports.includes("يشمل الجداول قيد الإعداد"), "N5: الميزان يقول إنه يشمل ما لم يُعتمد");
  const merged = mergeBalanceDepartments([{ sectionId: 11, sectionName: "أ", rows: 4 }],
    new Map([[11, { status: "drafting", late: false, round: 0 }], [12, { status: "notStarted", late: true, round: 0, sectionName: "ب", collegeName: "ك" }]]) as any);
  check(merged.length === 2 && merged[1].empty === true && merged[1].rows === 0, "N3: القسم الذي لم يبدأ صفٌّ بأصفارٍ صريحة");
}

/* ══ N6 — عدالةُ الحمل بمعادلةٍ واحدة، بلا غير الأشخاص ════════════════════ */
{
  const row = (id: number, instructor: number, start: string, end: string, day: string): any =>
    ({ id, AdInstructorId: instructor, AdCourseId: 1, SCode: String(id), fstarttime: start, fendtime: end, [day]: true });
  const people = [
    { AdInstructorId: 1, AdInstructorName: "أستاذ أول" },
    { AdInstructorId: 2, AdInstructorName: "أستاذ ثان" },
    { AdInstructorId: 9, AdInstructorName: "هيئة تدريسية" },
  ] as any[];
  const rows = [row(1, 1, "08:00", "09:00", "fsunday"), row(2, 2, "08:00", "09:00", "fmonday"),
    ...Array.from({ length: 12 }, (_, i) => row(10 + i, 9, "10:00", "11:00", ["fsunday", "fmonday", "ftuesday"][i % 3]))];
  const engine = buildFairnessEngine(rows, people);
  check(engine.profiles.length === 2 && !engine.profiles.some((p: any) => p.id === 9), "N6: «هيئة تدريسية» لا تدخل ميزان العدالة");
  check(engine.score >= 90, "N6: أستاذان متساويان عادلان، لا يُفسدهما سجلٌّ ليس شخصاً");
  check(placeholderInstructorIdsOf(people).has(9) && placeholderInstructorIdsOf(people).size === 1, "N6: قاعدة «هيئة» في موضعٍ واحد");
  check(fnBody("function placeholderInstructorIds(").includes("sharedPlaceholderInstructorIds(instructors)")
    && fs.readFileSync(path.join(process.cwd(), "src/utils/placeholderInstructor.ts"), "utf8").includes('from "./instructorIdentity"'), "N6: الخادم يسأل القاعدة المشتركة ولا يكرّرها");
  const reports = read("src/components/Reports.tsx");
  const memo = reports.slice(reports.indexOf("const fairness = useMemo("), reports.indexOf("const fairness = useMemo(") + 1200);
  check(memo.includes("buildFairnessEngine(results, instructors)") && memo.includes("weeklyLoadOf("), "N6: العدسة تحسب بالمحرّك نفسه، والنصاب بالساعات المعتمدة");
  check(!memo.includes("Math.sqrt("), "N6: لا معادلةَ عدالةٍ ثانية في العدسة");
  check(reports.includes("متوسط النصاب (ساعات معتمدة)"), "N6: وحدة النصاب مكتوبة");
}

/* ══ N7 — المنتدبون على مستوى الكلية، وتاريخُهم كاملاً ═════════════════════ */
{
  const roster = routeBody('app.get("/api/reports/visiting-roster"');
  check(roster.includes("await wholeCollegeSectionIds(req, collegeId)") && !roster.includes("!collegeId || !sectionId || !termId"),
    "N7: منتدبو الفصل يُقرؤون على مستوى الكلية لمن يغطّيها");
  check(fnBody("async function wholeCollegeSectionIds(").includes("coversWholeCollege("), "N7: «يغطّي الكلية» من الحَكَم الواحد");
  const history = routeBody('app.get("/api/reports/visiting-history"');
  check(!history.includes("activeDelegateIds.has(id)&&peopleById.has(id)"), "N7: التاريخ لا يُسقط من خرج من دليل القسم");
  check(history.includes("listedNow:activeDelegateIds.has(instructorId)"), "N7: ويُعلَّم من لم يعد في الدليل");
  check(history.includes("wholeCollegeSectionIds(req,collegeId)"), "N7: التاريخ على مستوى الكلية أيضاً");
  const reports = read("src/components/Reports.tsx");
  check(reports.includes('if (lens === "visitingHistory" && shownLenses.some(item => item.id === "visiting")) return;'), "N7: «كل الفصول» في متناول من يملك عدسة المنتدبين");
  check(reports.includes("countOf(Math.round(group.weeklyMinutes / 60), AR.hour)"), "N7: الساعات الأسبوعية لكل منتدب");
  check(!reports.includes("if(!filters.collegeId||!filters.sectionId||!filters.termId){setVisitingIds"), "N7: الواجهة لا تشترط قسماً لقراءة المنتدبين");
}

/* ══ N10 — إشغال القاعات على مستوى الكلية ═══════════════════════════════ */
{
  const load = routeBody('app.get("/api/reports/room-load"');
  check(load.includes("await wholeCollegeSectionIds(req, collegeId)") && load.includes("!collegeWide &&"), "N10: العميد المساعد يقرأ إشغال قاعات كليته بلا قسم");
  check(load.includes("readsFinalSchedulesOnly(req) ? await finalRowsOnly(scoped.rows, termId)"), "N10: «قاعاتي» للعميدين من النهائي وحده");
}

/* ══ N12 — Excel بقارئ الطلب، وزرٌّ في مساحة التقرير ═════════════════════ */
{
  const excel = routeBody('app.get("/api/reports/excel/:type"');
  check(excel.includes("readSchedulesForRequest(req, Number(collegeId||0), Number(sectionId||0), resolvedTermId)"), "N12: الملفّ يُقرأ بقارئ الطلب (النهائي للعميدين)");
  check(!excel.includes("Repository.getSchedulesByScope({termId:resolvedTermId"), "N12: لا قراءةَ خامٍ في التصدير");
  check(excel.includes("instructorsForReader(req, instructors)"), "N13: الرقم المدني لا يخرج في الملفّ لصفات الاطّلاع");
  const reports = read("src/components/Reports.tsx");
  const at = reports.indexOf("/api/reports/excel/ListofTeacherCourseExcel?");
  check(at > 0 && reports.slice(at - 200, at + 400).includes("data-guide-ignore="), "N12: زرّ «تصدير Excel» في مساحة التقرير بسمة المرشد");
}

/* ══ N14 — نشرة المجلس تُطبع في أي وقت، بعمود الاعتماد ═══════════════════ */
{
  const reports = read("src/components/Reports.tsx");
  check(reports.includes('balance: "نشرة المجلس — ميزان الأقسام"'), "N14: عنوان النشرة");
  check(reports.includes('!results.length && lens === "balance" && balance ?') && reports.includes('printReport("balance")'), "N14: الميزان يُطبع قبل أول موعدٍ معتمد");
  const printAt = reports.indexOf('if (kind === "balance") {');
  const printBody = reports.slice(printAt, printAt + 3500);
  check(printBody.includes("<th>الاعتماد</th><th>الموعد</th>") && printBody.includes("balanceStatusLabel(state.status)"), "N14: الطباعة تحمل عمود الاعتماد والموعد");
  check(printBody.includes("mergeBalanceDepartments(") && printBody.includes("صادرة في ${issueDate}"), "N14: النشرة تشمل الأقسام التي لم تبدأ، وتحمل الفصل والتاريخ");
  check(reports.includes("balanceApprovals={termApprovals}"), "N14: حال الاعتماد تصل ورقة الطباعة");
}

/* ══ N16 — الإشعار يفتح على قسمه ══════════════════════════════════════════ */
{
  const store = new Map<string, string>();
  (globalThis as any).sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  writeNotifyFocus({ view: "scheduleChanges", collegeId: 1, sectionId: 11, termId: 9 }, 1000);
  check(takeNotifyFocus("reportDepartment", 2000) === null && store.has(NOTIFY_FOCUS_KEY), "N16: شاشةٌ أخرى لا تأخذ تركيزاً ليس لها");
  const focus = takeNotifyFocus("scheduleChanges", 2000);
  check(focus?.sectionId === 11 && focus?.termId === 9 && !store.has(NOTIFY_FOCUS_KEY), "N16: الشاشة المقصودة تأخذه مرّةً واحدة");
  writeNotifyFocus({ view: "scheduleChanges", collegeId: 1, sectionId: 11 }, 0);
  check(takeNotifyFocus("scheduleChanges", 10 * 60_000) === null, "N16: تركيزٌ قديم لا يُطاع");
  const changes = read("src/components/ScheduleChanges.tsx");
  check(changes.includes('takeNotifyFocus("scheduleChanges")') && changes.includes("setOpened({ collegeId: focus.collegeId, sectionId: focus.sectionId })"), "N16: تغييرات الجدول تفتح على قسم الإشعار");
  const reports = read("src/components/Reports.tsx");
  check(reports.includes('takeNotifyFocus("reportDepartment")') && reports.includes("focusSectionId={focusSectionId}"), "N16: التقرير يفتح على قسم الإشعار ويُبرزه في الميزان");
  const center = read("src/components/NotificationCenter.tsx");
  check(center.includes("writeNotifyFocus(item)") && !center.includes("sessionStorage.setItem"), "N16: كاتبُ التركيز وقارئه في ملفٍّ واحد");
}

/* ══ N17 / N19 — عدّاد رئيس القسم، وملاحظات التسجيل في كل حال ═════════════ */
{
  const badge = fnBody("async function approvalBadgeForTerm(");
  check(badge.includes('if (stage === "head" && approval.status === "committee") open += 1;'), "N17: جدولٌ ينتظر توقيع رئيس القسم يُعدّ في عدّاده");
  check(!badge.includes('if (approval.status !== "returned" && !approval.pendingAdditions.length) continue;'), "N19: ملاحظات التسجيل تُعدّ في كل حال، لا في «أُرجع» وحده");
  const bell = fnBody("async function notificationItemsForTerm(");
  check(!bell.includes('department && approval.status === "returned"'), "N19: الجرس يقرأ ملاحظات التسجيل المفتوحة في أي حال");
  const mk = (status: string, notes: number): CenterScope => ({ approval: { ...emptyApproval(1, 11, 9), status } as any, collegeName: "ك", sectionName: "ق", rowCount: 3, openRegistrarNotes: notes, openRequests: 0 });
  const drafting = buildNotifications({ role: "committeeChair", scopes: [mk("drafting", 2)] });
  check(drafting.some(item => item.title.includes("ملاحظات التسجيل") && item.tone === "action" && item.view === "scheduleChanges"), "N19: ملاحظاتٌ والجدول قيد الإعداد تُنبّه اللجنة");
  const acceptedNotes = buildNotifications({ role: "departmentHead", scopes: [mk("accepted", 1)] });
  check(acceptedNotes.some(item => item.title.includes("ملاحظات التسجيل")), "N19: …وبعد الاعتماد تُنبّه القسم");
  check(fs.readFileSync(path.join(process.cwd(), "src/utils/notificationCenter.ts"), "utf8").includes('approval.status !== "submitted" && scope.openRegistrarNotes > 0')
    && fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8").includes('if (approval.status === "submitted") continue;'),
    "N19: والجدولُ عند التسجيل لا يُطلب من القسم فعلٌ على مراجعةٍ جارية");
}

/* ══ N18 — الجرس للجاري ولفصل التخطيط ═══════════════════════════════════ */
{
  const now = Date.parse("2026-09-25T09:00:00Z");
  const terms = [
    { AdTermId: 1, AdTermName: "الفصل الثاني 2025/2026" },
    { AdTermId: 2, AdTermName: "الفصل الصيفي 2025/2026" },
    { AdTermId: 3, AdTermName: "الفصل الأول 2026/2027" },
    { AdTermId: 4, AdTermName: "الفصل الثاني 2026/2027" },
  ];
  check(currentTermIdOf(terms, now) === 3, "N18: الجاري هو الأول 2026/2027 (تمهيد)");
  check(planningTermId(terms, id => id === 4, now) === 4, "N18: الفصل التالي بنشاطٍ هو فصل التخطيط");
  check(planningTermId(terms, () => false, now) === 0, "N18: فصلٌ بلا نشاط لا يُنبّه أحداً");
  check(!planningTermCandidates(terms, now).includes(1) && !planningTermCandidates(terms, now).includes(2), "N18: الفصول المنتهية ليست فصل تخطيط");
  check(planningTermId([...terms.slice(0, 2), { ...terms[2], AdTermClosed: false } as any, { AdTermId: 4, AdTermName: "الفصل الثاني 2026/2027", AdTermClosed: true } as any], () => true, now) === 0, "N18: المغلق ليس فصل تخطيط");
  const route = routeBody('app.get("/api/notifications", requireAuth');
  check(route.includes("bellPlanningTermId(terms as any[])") && route.includes("termName: planningName"), "N18: الجرس يضمّ فصل التخطيط ويسمّي فصل كل بند");
  check(route.includes("id: `term-${planning}:${item.id}`"), "N18: بنود فصل التخطيط لا تتصادم معرّفاتها مع الجاري");
  check(fnBody("async function bellPlanningTermId(").includes("planningTermCandidates("), "N18: المرشّحون من termSequence وحده");
  check(routeBody('app.get("/api/approvals/badge", requireAuth').includes("approvalBadgeForTerm(req, planning)"), "N18: العدّاد يجمع الفصلين");
}

/* ══ N20 / N22 / N23 / N24 / N25 — ما يقوله الجرس، وبأيّ معرّف ═════════════ */
{
  const now = Date.parse("2026-09-25T09:00:00Z");
  const base = (status: string, over: any = {}): CenterScope => ({
    approval: { ...emptyApproval(1, 11, 9), status, rounds: over.rounds || [], currentRound: (over.rounds || []).length, pendingAdditions: over.pendingAdditions || [], ...(over.approval || {}) } as any,
    collegeName: "ك", sectionName: over.name || "ق", rowCount: over.rowCount ?? 5, openRegistrarNotes: over.notes || 0, openRequests: 0,
    deadline: over.deadline, blockingConflicts: over.blockers, escalatedNotes: over.escalated,
  });
  const dean = buildNotifications({ role: "dean", now, scopes: [
    base("drafting", { deadline: { effective: "2026-09-20" }, name: "أ" }),
    base("returned", { rounds: [{ number: 1, submittedAt: "2026-09-10T00:00:00Z", returnedAt: "2026-09-18T00:00:00Z" }], name: "ب" }),
    base("accepted", { rounds: [{ number: 1, acceptedAt: "2026-09-12T00:00:00Z" }], blockers: 2, name: "ج" }),
  ] });
  check(dean.some(item => item.tone === "alert" && item.title.includes("تجاوز موعد التسليم") && item.view === "reportDepartment" && item.sectionId === 11), "N20: العميد يُنبَّه على قسمٍ متأخّر، ويُفتح الميزان على قسمه");
  check(dean.some(item => item.tone === "alert" && item.title.includes("مُرجَعٌ منذ")), "N20: …وعلى جدولٍ مُرجَعٍ بلا حراكٍ أكثر من ثلاثة أيام");
  check(dean.some(item => item.tone === "alert" && item.title.includes("المعتمد") && item.title.includes("مانع")), "N20: …وعلى معتمدٍ ظهر فيه مانع");
  check(dean.every(item => item.tone !== "action"), "N20: والعميد لا يُطلب منه فعل");

  /* N22: المعرّف لا يتغيّر بتغيّر العدد. */
  const idsOf = (scopes: CenterScope[], role: string) => buildNotifications({ role, scopes, now }).map(item => item.id).sort().join("|");
  const one = [base("accepted", { rounds: [{ number: 1, acceptedAt: "x" }] }), base("drafting", { name: "د" })];
  const two = [base("accepted", { rounds: [{ number: 1, acceptedAt: "x" }] }), base("accepted", { name: "د", rounds: [{ number: 1, acceptedAt: "y" }] }), base("drafting", { name: "هـ" })];
  const summary = (list: CenterScope[]) => buildNotifications({ role: "dean", scopes: list, now }).find(item => item.id.startsWith("final-summary"))?.id;
  check(summary(one) === summary(two), "N22: ملخّص العميد بمعرّفٍ ثابت ما دام الحال «جزئياً»");
  const reg = (n: number) => buildNotifications({ role: "registrarHead", now, scopes: Array.from({ length: n }, (_, i) => base("drafting", { name: `ق${i}` })) }).find(item => item.id.startsWith("not-submitted"))?.id;
  check(reg(3) === reg(4), "N22: «لم يسلّم بعد» بمعرّفٍ ثابت");
  const withAdd = (n: number) => idsOf([base("committee", { pendingAdditions: Array.from({ length: n }, (_, i) => ({ scheduleId: i })) })], "departmentHead");
  check(withAdd(1) === withAdd(2), "N22: الإضافات بمعرّفٍ ثابت");
  const nc = read("src/utils/notificationCenter.ts");
  check(!/\$\{(queue\.pendingCommittee|queue\.awaitingRegistration|entry\.count|notYet|done|total|approval\.pendingAdditions\.length)\}/.test(nc.split("id:").slice(1).map(part => part.split(",")[0]).join("\n")), "N22: لا عددَ في أيِّ معرّف");

  /* N23 */
  const returned = buildNotifications({ role: "committeeChair", now, scopes: [base("returned", { rounds: [{ number: 1, returnedAt: "x" }], pendingAdditions: [{ scheduleId: 1 }] })] });
  const back = returned.find(item => item.title.includes("أرجع"));
  check(Boolean(back) && !back!.detail.includes("بقي إعادة الإرسال") && back!.detail.includes("إقرارَ رئيس القسم") && back!.tone === "waiting", "N23: «أُرجع» يقول الحقيقة حين تمنع الإضافاتُ إعادة الإرسال");

  /* N24 */
  const head = buildNotifications({ role: "departmentHead", now, scopes: [base("returned", { rounds: [{ number: 1, returnedAt: "x" }], notes: 2, escalated: 1 })] });
  check(head.some(item => item.tone === "action" && item.title.includes("يُصرّ") && item.view === "scheduleChanges"), "N24: إصرارٌ ثالث يصير فعلاً مطلوباً من رئيس القسم");
  const bell = fnBody("async function notificationItemsForTerm(");
  check(bell.includes("Number(note.insistCount || 0) >= 3 || Boolean(note.escalatedAt)"), "N24: الخادم يقرأ الإصرار والتصعيد بحذر");

  /* N25 */
  const ext = (extra: any) => buildNotifications({ role: "registrarHead", now, scopes: [base("drafting", { approval: { extensionRequest: extra } })] });
  const asked = ext({ until: "2026-10-05", reason: "سبب", requestedAt: "2026-09-24T00:00:00Z" }).find(item => item.title.includes("يطلب تمديد"));
  check(Boolean(asked) && asked!.tone === "action" && asked!.view === "scheduleChanges" && asked!.sectionId === 11, "N25: طلبُ التمديد فعلٌ لرئيس التسجيل، يفتح القسم");
  check(!ext({ until: "2026-10-05", status: "granted" }).some(item => item.title.includes("يطلب تمديد")), "N25: الطلب المحسوم لا يُنبّه");
  check(!buildNotifications({ role: "registrarStaff", now, scopes: [base("drafting", { approval: { extensionRequest: { until: "2026-10-05" } } })] }).some(item => item.title.includes("يطلب تمديد")), "N25: موظف التسجيل لا يمدّد فلا يُطلب منه");
  check(pendingExtensionRequest({ ...emptyApproval(1, 1, 1) } as any) === null, "N25: غيابُ الحقل لا يُعطب شيئاً");
}

/* ══ N26 — جولةٌ لكل صفة ═════════════════════════════════════════════════ */
{
  const committee = onboardingScenesFor("committeeChair");
  check(committee.staged && committee.scenes.length === 6, "N26: اللجنة ترى المسرح بفصوله الستة كما هو");
  check(onboardingScenesFor(undefined).staged, "N26: حسابٌ بلا صفة (أو مدير) يرى جولة البناء");
  for (const role of ["departmentHead", "registrarHead", "registrarStaff", "dean", "viceDean", "registrarDean"]) {
    const tour = onboardingScenesFor(role);
    check(!tour.staged && tour.scenes.length >= 4 && !tour.scenes.some(scene => ["build", "clash", "repair"].includes(scene.key)),
      `N26: «${role}» يرى خطوات عمله، لا مسرح البناء`);
  }
  check(onboardingScenesFor("registrarHead").scenes.some(scene => scene.key === "reg-deadline") && !onboardingScenesFor("registrarStaff").scenes.some(scene => scene.key === "reg-deadline"),
    "N26: الموعد والتمديد في جولة رئيس التسجيل وحده");
  check(onboardingScenesFor("viceDean").scenes.length === onboardingScenesFor("dean").scenes.length + 1, "N26: العميد المساعد يُزاد الأساتذة والقاعات");
  check(onboardingSeenKey(7, "dean") === "schedule-onboarding-v5-7-dean" && onboardingSeenKey(7, "dean") !== onboardingSeenKey(7, "committeeChair"), "N26: علامة «رأى الجولة» تحمل الصفة");
  const app = read("src/App.tsx");
  check(!app.includes("schedule-onboarding-v4-") && (app.match(/onboardingSeenKey\(user\.SystemUserId, sessionRole\.id\)/g) || []).length === 3, "N26: التطبيق يقرأ العلامة ويكتبها ويمحوها بالصفة");
  check(app.includes("roleId={sessionRole.id}") && app.includes("}, [user?.SystemUserId, sessionRole.id]);"), "N26: الجولة تُمرَّر لها الصفة وتُعاد عند تبدّلها");
}

/* ══ N27 — «مدير» على صفة اطّلاع يُنبَّه عليه ════════════════════════════ */
{
  const admin = read("src/components/AdminUsers.tsx");
  check(admin.includes("isAdmin && roleDefinition(role).readOnly ?") && admin.includes("تتجاوز صفة"), "N27: اختيار «مدير» لصفة اطّلاع يُظهر تنبيهاً");
  check(fnBody("function readsFinalSchedulesOnly(").includes("!req.user?.IsAdminUser"), "N27: (سببه) المدير يتجاوز «النهائي وحده»");
}

/* ══ N28 — بحث العميد المساعد (نطاق كلية) لم يعد فارغاً ════════════════════ */
{
  const state = createDemoSandboxState();
  const vice = DEMO_ROLE_ACCOUNTS.find(account => account.role === "viceDean")!;
  const assigns = state.collegeUserAssign.filter(row => row.SystemUserId === vice.SystemUserId);
  /* صورةُ `isScopeAllowed` لصفةٍ نطاقُها «college»: صفٌّ بقسمٍ صفر يجيز الكلية كلها. */
  const allowed: ScopePredicate = (c, s) => assigns.some(row => row.AdCollegeId === c && (Number(row.AdSectionId) === 0 || row.AdSectionId === s));
  const own = expandScopeSections(state.sections as any, allowed);
  check(assigns.every(row => Number(row.AdSectionId) === 0) && own.size > 0, "N28: نطاق العميد المساعد (قسم صفر) يتوسّع إلى أقسام كليته");
  const natural = resolveSmartScope({ requested: { collegeId: 0, sectionId: 0 }, sections: state.sections as any, allowed, allowCollegeWide: true });
  check(natural.allowed && natural.sectionId === 0 && natural.collegeId === assigns[0].AdCollegeId, "N28: البحث بالجملة يقرأ له مستوى كليته");
  check(fnBody("async function readScopedTermRows(").includes("expandScopeSections(sections, allowed)"), "N28: البحث العام يقرأ أقسامه من التوسيع نفسه");
}

/* ── مراجعة 4: موانعُ جرس العميدين تُعدّ من جدول الفصل المقروء مرّة ─────── */
{
  const bell = fnBody("async function notificationItemsForTerm(");
  check(bell.includes("await bellBlockingCount(collegeId, sectionId, termId, termRows as any[])") && !bell.includes("blockingConflictCount("),
    "R4 الجرس لا يقرأ جدول الفصل ولا يفحصه لكل قسمٍ معتمد");
  const counter = fnBody("function bellBlockingCount(");
  check(counter.includes("termRows.filter(row => Number(row.AdCollegeId) === collegeId && Number(row.AdSectionId) === sectionId)")
    && counter.includes("countBlockingConflicts(scopeRows, termRows, await approvalBlockerOptions())") && counter.includes("bellBlockingMemo.get(key,"),
    "R4 يُعدّ لكل قسمٍ في الذاكرة بالقاعدة نفسها، محفوظاً");
  check(server.includes("onSchedulesInvalidated(() => bellBlockingMemo.invalidate());")
    && fnBody("function listenForScheduleChangesAcrossInstances(").includes("bellBlockingMemo.invalidate();"),
    "R4 ويُمحى المحفوظ حين يتغيّر جدولٌ هنا أو في نسخةٍ أخرى");
  check(server.includes("const key = `${Repository.currentDemoSessionId() || \"\"}:${termId}:${collegeId}:${sectionId}`;"), "R4 المفتاح يحمل جلسة العرض والفصل والقسم");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
