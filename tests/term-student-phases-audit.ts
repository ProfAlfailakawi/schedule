/**
 * ── رحلة الطلبة في الفصل (المرحلة ٢) ─────────────────────────────────────────
 *
 *   T1  الفحص: الترتيب هو القاعدة (تسليم ← رغبات ← جولات ← إغلاق) وكل رفضٍ يسمّي حقله.
 *   T2  أين نحن اليوم: كل يومٍ من الرحلة يُقرأ مرحلةً واحدة، وما يُسمح به فيها.
 *   T3  الشريط الزمني يوافق القراءة نفسها.
 *   T4  اقتراح العام الماضي: إزاحةٌ بأسابيع كاملة، وقابلةٌ للفحص.
 *   T5  المستودع يحفظ ولا يمحو غيره، والخادم يفحص بالقاعدة نفسها وبصلاحية رئيس التسجيل.
 *   T6  الواجهة في لوحة مواعيد التسليم نفسها، لا شاشة ثانية، وكل زرٍّ موثَّق للمرشد.
 */
import fs from "fs";
import path from "path";
import os from "os";
import {
  MAX_STUDENT_ROUNDS, checkStudentPhases, hasStudentPhases, readStudentPhase, studentTimeline, suggestStudentPhases,
} from "../src/utils/termStudentPhases";
import type { AdTerm, TermStudentPhases } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const SUBMIT = "2026-10-08";
const GOOD: TermStudentPhases = {
  wishesOpen: "2026-10-12", wishesClose: "2026-10-25",
  rounds: [
    { id: "r1", name: "مبكر", start: "2026-11-01", end: "2026-11-07" },
    { id: "r2", name: "عادي", start: "2026-11-15", end: "2026-11-21" },
  ],
  requestsClose: "2026-12-05",
};
const issuesOf = (input: any, submissionDeadline: string | undefined = SUBMIT) => checkStudentPhases(input, { submissionDeadline }).issues;

/* ── T1: الفحص ───────────────────────────────────────────────────────────── */
{
  check(checkStudentPhases(GOOD, { submissionDeadline: SUBMIT }).ok, "T1 تواريخٌ مرتّبة تُقبل");
  check(checkStudentPhases({}, { submissionDeadline: SUBMIT }).ok && !hasStudentPhases(checkStudentPhases({}).phases), "T1 لا تواريخ = لا شيء، وليس خطأ");
  check(issuesOf({ ...GOOD, wishesOpen: "2026-10-08", wishesClose: "2026-10-25" })[0]?.field === "wishesOpen", "T1 الرغبات لا تبدأ في يوم التسليم نفسه ولا قبله");
  check(issuesOf({ ...GOOD, wishesOpen: "2026-10-02" }).some(i => i.field === "wishesOpen" && i.message.includes("تسليم الجداول")), "T1 الرفضُ يذكر موعد التسليم");
  check(checkStudentPhases({ ...GOOD, wishesOpen: "2026-10-02" }, {}).ok, "T1 بلا موعد تسليم لا قيدَ عليه");
  check(issuesOf({ wishesOpen: "2026-10-12" }).some(i => i.field === "wishesClose"), "T1 بداية الرغبات بلا نهايتها مرفوضة");
  check(issuesOf({ wishesOpen: "2026-10-20", wishesClose: "2026-10-12" }).some(i => i.field === "wishesClose"), "T1 نهايةٌ قبل البداية");
  check(issuesOf({ ...GOOD, rounds: [{ id: "a", name: "مبكر", start: "2026-10-25", end: "2026-10-30" }] }).some(i => i.field === "rounds.0"), "T1 الجولة تبدأ بعد انتهاء الرغبات لا معها");
  check(issuesOf({ ...GOOD, rounds: [{ id: "a", name: "أ", start: "2026-11-01", end: "2026-11-10" }, { id: "b", name: "ب", start: "2026-11-10", end: "2026-11-12" }] }).some(i => i.field === "rounds.1"), "T1 جولتان لا تتداخلان");
  check(issuesOf({ ...GOOD, rounds: [{ id: "a", name: "", start: "2026-11-01", end: "2026-11-05" }] }).some(i => i.message.includes("اسماً")), "T1 الجولة بلا اسم");
  check(issuesOf({ ...GOOD, rounds: [{ id: "a", name: "مبكر", start: "2026-11-09", end: "2026-11-01" }] }).some(i => i.message.includes("قبل البداية")), "T1 جولةٌ نهايتها قبل بدايتها");
  check(issuesOf({ ...GOOD, requestsClose: "2026-11-10" }).some(i => i.field === "requestsClose"), "T1 الإغلاق بعد آخر جولة");
  check(issuesOf({ ...GOOD, wishesOpen: "2026-13-45" }).some(i => i.field === "wishesOpen"), "T1 تاريخٌ مستحيل");
  check(issuesOf({ ...GOOD, wishesOpen: "2026-02-30" }).some(i => i.field === "wishesOpen"), "T1 ٣٠ فبراير مرفوض");
  check(issuesOf({ ...GOOD, requestsClose: "2028-12-05" }).length > 0, "T1 تواريخٌ تمتد أكثر من سنة");
  const many = Array.from({ length: MAX_STUDENT_ROUNDS + 1 }, (_, i) => ({ id: `r${i}`, name: `ج${i}`, start: `2026-11-${String(1 + i * 3).padStart(2, "0")}`, end: `2026-11-${String(2 + i * 3).padStart(2, "0")}` }));
  check(issuesOf({ ...GOOD, rounds: many, requestsClose: undefined }).some(i => i.field === "rounds"), `T1 أكثر من ${MAX_STUDENT_ROUNDS} جولات مرفوض`);
  const shuffled = checkStudentPhases({ ...GOOD, rounds: [GOOD.rounds![1], GOOD.rounds![0]] }, { submissionDeadline: SUBMIT });
  check(shuffled.ok && shuffled.phases.rounds![0].name === "مبكر", "T1 الجولات تُرتَّب بالتاريخ عند التنظيف");
  const dup = checkStudentPhases({ ...GOOD, rounds: [{ id: "x", name: "أ", start: "2026-11-01", end: "2026-11-03" }, { id: "x", name: "ب", start: "2026-11-05", end: "2026-11-07" }], requestsClose: "2026-12-01" }, { submissionDeadline: SUBMIT });
  check(new Set(dup.phases.rounds!.map(r => r.id)).size === 2, "T1 معرّفاتُ الجولات لا تتكرر");
  const dirty = checkStudentPhases({ wishesOpen: " 2026-10-12 ", wishesClose: "2026-10-25", rounds: [{ id: "q", name: "  مبكر   جدا ", start: "2026-11-01", end: "2026-11-02" }, { id: "e", name: "", start: "", end: "" }] }, { submissionDeadline: SUBMIT });
  check(dirty.ok && dirty.phases.wishesOpen === "2026-10-12" && dirty.phases.rounds!.length === 1 && dirty.phases.rounds![0].name === "مبكر جدا", "T1 التنظيف: مسافات، وسطرٌ فارغ يُسقط");
}

/* ── T2: أين نحن اليوم ────────────────────────────────────────────────────── */
{
  const at = (day: string) => readStudentPhase(GOOD, day);
  check(readStudentPhase(undefined, "2026-10-15").key === "unset" && readStudentPhase({}, "2026-10-15").mode === "none", "T2 بلا تواريخ: لم تُحدَّد");
  check(at("2026-10-09").key === "collecting" && at("2026-10-09").mode === "waiting" && !at("2026-10-09").canEditWishes, "T2 قبل الرغبات: الأقسام تُدخل جداولها");
  check(at("2026-10-12").key === "wishes" && at("2026-10-12").canEditWishes && !at("2026-10-12").canReport, "T2 أول يوم في الرغبات: مفتوح للكتابة");
  check(at("2026-10-25").key === "wishes" && at("2026-10-25").canEditWishes, "T2 آخر يومٍ في الرغبات يشمل يومه كاملاً");
  check(at("2026-10-26").key === "frozen" && !at("2026-10-26").canEditWishes && at("2026-10-26").mode === "frozen", "T2 بعدها يُجمَّد للقراءة");
  check(at("2026-10-31").key === "frozen", "T2 يوم قبل الجولة الأولى ما يزال تجميداً");
  check(at("2026-11-01").key === "round" && at("2026-11-01").canReport && at("2026-11-01").namesVisible && at("2026-11-01").round?.name === "مبكر", "T2 أول يومٍ في الجولة: التبليغ مفتوح وتظهر الأسماء");
  check(at("2026-11-07").key === "round", "T2 آخر يومٍ في الجولة يشمل يومه");
  check(at("2026-11-10").key === "between" && at("2026-11-10").canReport && at("2026-11-10").roundIndex === 0, "T2 بين الجولتين: طلب المتعثّر ما يزال مفتوحاً");
  check(at("2026-11-16").key === "round" && at("2026-11-16").roundIndex === 1, "T2 الجولة الثانية");
  check(at("2026-12-05").canReport && at("2026-12-06").key === "closed" && !at("2026-12-06").canReport && at("2026-12-06").mode === "closed", "T2 بعد الإغلاق: لا تبليغ");
  check(!at("2026-10-12").namesVisible && !at("2026-10-26").namesVisible, "T2 قبل التسجيل لا أسماء: أرقامٌ فقط");
  check(at("2026-10-12").nextAt === "2026-10-25", "T2 التاريخ القادم المغيِّر للمرحلة");
  const noClose = readStudentPhase({ ...GOOD, requestsClose: undefined }, "2027-03-01");
  check(noClose.key === "between" && noClose.canReport, "T2 بلا إغلاقٍ مكتوب: لا يُغلق من تلقاء نفسه");
  const wishesOnly = readStudentPhase({ wishesOpen: "2026-10-12", wishesClose: "2026-10-25" }, "2026-11-30");
  check(wishesOnly.key === "frozen", "T2 رغباتٌ بلا جولات: يبقى مجمَّداً");
}

/* ── T3: الشريط ───────────────────────────────────────────────────────────── */
{
  const steps = studentTimeline(GOOD, SUBMIT, "2026-10-15");
  check(steps.map(s => s.kind).join(",") === "submission,wishes,frozen,round,round,close", "T3 المحطات: تسليم، رغبات، تجميد، جولتان، إغلاق");
  check(steps[2].title === "مراجعة الجدول", "T3 اسم مرحلة التجميد واضح للطالب: مراجعة الجدول");
  check(steps[0].state === "done" && steps[1].state === "now" && steps[2].state === "next", "T3 الحالة: مضت / الآن / قادمة");
  check(steps[2].from === "2026-10-26" && steps[2].to === "2026-10-31", "T3 التجميد يُحسب بين نهاية الرغبات وأول جولة");
  const empty = studentTimeline(undefined, undefined, "2026-10-15");
  check(empty.every(s => s.state === "unset") && empty.length === 4, "T3 بلا تواريخ: كل المحطات غير محدّدة");
  check(readStudentPhase(GOOD, "2026-10-15").key === "wishes" && steps.filter(s => s.state === "now").length === 1, "T3 الشريط والقراءة متفقان: محطةٌ واحدة «الآن»");
}

/* ── T4: اقتراح العام الماضي ──────────────────────────────────────────────── */
{
  const terms: AdTerm[] = [
    { AdTermId: 1, AdTermName: "الفصل الأول 2025/2026", AdTermStart: "2025-09-14", AdTermWeeks: 14, AdTermStudentPhases: {
      wishesOpen: "2025-10-12", wishesClose: "2025-10-25", rounds: [{ id: "r1", name: "مبكر", start: "2025-11-02", end: "2025-11-08" }], requestsClose: "2025-12-06",
    } } as any,
    { AdTermId: 2, AdTermName: "الفصل الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 14 } as any,
  ];
  const s = suggestStudentPhases(terms[1], terms);
  check(Boolean(s) && s!.shiftDays % 7 === 0 && s!.fromTermName.includes("2025/2026"), "T4 الإزاحة بأسابيع كاملة من الفصل نفسه في السنة الماضية");
  const dayName = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
  check(Boolean(s) && dayName(s!.phases.wishesOpen!) === dayName("2025-10-12"), "T4 اليومُ من الأسبوع يبقى كما هو");
  check(Boolean(s) && checkStudentPhases(s!.phases, {}).ok, "T4 المقترح يمرّ من الفحص");
  check(suggestStudentPhases({ AdTermId: 3, AdTermName: "فصل بلا نمط" } as any, terms) === null, "T4 اسمٌ لا يُفهم: لا اقتراح");
  check(suggestStudentPhases({ AdTermId: 4, AdTermName: "الفصل الثاني 2026/2027" } as any, terms) === null, "T4 لا فصلَ سابقاً بتواريخ: لا اقتراح");
}

/* ── T5: المستودع والخادم ─────────────────────────────────────────────────── */
{
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-phases-"));
  fs.writeFileSync(path.join(privateDir, "db.json"), JSON.stringify({
    schedules: [], colleges: [], sections: [], terms: [{ AdTermId: 9, AdTermName: "الفصل الأول 2026/2027", AdTermSubmissionDeadline: SUBMIT }], courses: [], instructors: [],
    systemUsers: [], formSecurity: [], adCollegeUserAssigns: [], formNames: [], sessions: [], studentNeeds: [],
  }), { mode: 0o600 });
  process.env.NODE_ENV = "test"; process.env.DATA_MODE = "demo"; process.env.SCHEDULE_PRIVATE_DIR = privateDir;
  const quiet = console.warn; console.warn = () => {};
  const { Repository, initDatabase } = await import("../src/db/repository");
  await initDatabase();
  console.warn = quiet;
  const saved = await Repository.setTermStudentPhases(9, GOOD);
  check(JSON.stringify(saved.AdTermStudentPhases) === JSON.stringify(GOOD) && saved.AdTermSubmissionDeadline === SUBMIT, "T5 الحفظ يضيف الحقل ولا يمسّ موعد التسليم");
  const renamed = await Repository.updateTerm(9, "الفصل الأول 2026/2027 (معدّل)");
  check(Boolean(renamed.AdTermStudentPhases?.rounds?.length), "T5 تعديل اسم الفصل لا يمحو المواعيد");
  const cleared = await Repository.setTermStudentPhases(9, undefined);
  check(cleared.AdTermStudentPhases === undefined && cleared.AdTermSubmissionDeadline === SUBMIT, "T5 الرفع يزيل الحقل وحده");
  let missing = false;
  try { await Repository.setTermStudentPhases(999, GOOD); } catch { missing = true; }
  check(missing, "T5 فصلٌ غير موجود: خطأ");

  const server = read("server.ts");
  const start = server.indexOf('app.post("/api/approvals/student-phases"');
  const route = server.slice(start, server.indexOf("\n});\n", start));
  check(start > 0 && route.includes("canManageDeadline(req.user?.Role)") && route.includes("isPowerUser(req)"), "T5 المسار برئيس التسجيل والإدارة وحدهما");
  check(route.includes("checkStudentPhases(incoming, { submissionDeadline:") && route.includes("res.status(400)"), "T5 الخادم يفحص بالقاعدة نفسها ويرفض بـ400");
  check(route.includes('code: "term-closed"') && route.includes("termHasEnded"), "T5 فصلٌ منتهٍ لا تُوضع له مواعيد");
  check(route.includes("res.locals.auditChanges"), "T5 كل تغيير في سجلّ التدقيق");
  check(route.includes("setTermStudentPhases(termId, undefined)"), "T5 الفارغ يرفع المواعيد");
}

/* ── T6: الواجهة ──────────────────────────────────────────────────────────── */
{
  const panel = read("src/components/SubmissionDeadlines.tsx");
  const block = read("src/components/StudentPhasesBlock.tsx");
  check(panel.includes("<StudentPhasesBlock term={term} terms={terms} canEdit={canEdit}"), "T6 الرحلة داخل لوحة مواعيد التسليم نفسها");
  check(!/api\/approvals\/student-phases/.test(panel) && block.includes("/api/approvals/student-phases"), "T6 الكتابة من مكوّن الرحلة وحده");
  const buttons = (block.match(/<(button|SecondaryButton|PrimaryButton)\b/g) || []).length;
  const documented = (block.match(/data-guide-(ignore|target)=/g) || []).length;
  check(buttons >= 8 && documented >= buttons, "T6 كل زرٍّ موثَّق للمرشد (سبب أو هدف) — والتدقيق الكامل في audit:guide");
  check(block.includes("checkStudentPhases(draft") && block.includes("disabled={busy || !check.ok"), "T6 الحفظ معطَّل ما دام الفحص يرفض");
  check(block.includes('aria-label="مراحل الطلبة في الفصل"') && block.includes('aria-current={step.state === "now"'), "T6 الشريط مقروء لقارئ الشاشة، والمحطة الحالية معلَّمة");
  const css = read("src/styles/12-deadlines.css");
  check(css.includes(".sp-track") && css.includes("prefers-reduced-motion") && css.includes("@media (max-width:640px)"), "T6 تنسيقٌ للهاتف ولا حركةَ لمن يمنعها");
  check(!/#[0-9a-fA-F]{3,6}\b/.test(css.slice(css.indexOf("رحلة الطلبة"))), "T6 ألوان الرحلة من رموز النظام لا ألوانٌ مكتوبة");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
