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
  const fn = reports.slice(reports.indexOf("function initialLensFor("), reports.indexOf("function initialLensFor(") + 900);
  check(fn.includes('if (deanReader && (mode === "reportDepartment" || mode === "searchAdvanced")) return "balance";'),
    "N2: تقرير القسم يفتح للعميدين على الميزان");
  check(fn.includes('if (wanted === "time" && fits("matrix")) return "matrix";'), "N11: شاشة ١٦ (الوقت) تُفتح للعميد المساعد على المصفوفة");
  check(fn.includes("fits(savedLens as Lens)"), "N11: عدسةٌ محفوظة لا تملكها الصفة لا تُفتح");
  check(/if \(lens === "list" && !all\.length && shownLenses\.some\(item => item\.id === "balance"\)\) setLens\("balance"\);/.test(reports)
    && reports.includes("autoBalanceDone.current = true"), "N2: قائمةٌ محفوظة فارغة تُحوَّل إلى الميزان مرّةً واحدة بعد القراءة");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
