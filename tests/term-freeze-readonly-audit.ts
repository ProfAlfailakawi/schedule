/**
 * ── الفصلُ السابق للعرض فقط ─────────────────────────────────────────────────
 *
 * حين يصير فصلٌ جديدٌ هو الجاري، يبقى ما قبله يُقرأ في كشف التسجيل ورغبات الأساتذة وتغييرات الجدول
 * ولا يُكتب فيه شيء. القاعدةُ واحدة (`termIsFrozen`) للشاشة وللخادم، وكلُّ باب كتابةٍ على الأرشيف يُسأل
 * عنها قبل أن يمسّ بيانات. يُفحص هنا السلوكُ على فصولٍ اصطناعية، ثم أن كلَّ بابٍ يمرّ بها فعلاً.
 */
import fs from "fs";
import path from "path";
import { currentTermId, termIsFrozen, TERM_FROZEN_LABEL, TERM_FROZEN_MESSAGE } from "../src/utils/termSequence";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

/* ── السلوك ── */
const NOW = Date.parse("2026-10-17T09:00:00Z");
const flagged = [
  { AdTermId: 11, AdTermName: "الفصل الثاني 2025/2026", AdTermClosed: true },
  { AdTermId: 12, AdTermName: "الفصل الأول 2026/2027", AdTermClosed: false },
  { AdTermId: 13, AdTermName: "الفصل الثاني 2026/2027", AdTermClosed: false },
];
check(currentTermId(flagged as any, NOW) === 12, "الجاري: أقدمُ فصلٍ أُعلن أنه غير منتهٍ");
check(termIsFrozen(11, flagged as any, NOW), "الفصلُ المغلق صراحةً ← مجمَّد");
check(!termIsFrozen(12, flagged as any, NOW), "والجاري مفتوح");
check(!termIsFrozen(13, flagged as any, NOW), "والقادم (التخطيط) مفتوح — لا يُجمَّد ما بعد الجاري");

/* الفصلُ الجديد يصير جارياً: ما كان جارياً قبله يتجمّد حين يُغلق، فتتبدّل الحال على الفور. */
const rolled = flagged.map(term => term.AdTermId === 12 ? { ...term, AdTermClosed: true } : term);
check(currentTermId(rolled as any, NOW) === 13 && termIsFrozen(12, rolled as any, NOW) && !termIsFrozen(13, rolled as any, NOW),
  "إغلاقُ الجاري ينقل الجريان إلى التالي ويجمّد السابق، وبيانات كلٍّ منهما تبقى بمعرّف فصلها");

/* بيانات قديمة بلا علامات: يحكم التقويمُ والترتيب. */
const legacy = [
  { AdTermId: 20, AdTermName: "الفصل الأول 2025/2026" },
  { AdTermId: 21, AdTermName: "الفصل الثاني 2025/2026" },
  { AdTermId: 22, AdTermName: "الفصل الأول 2026/2027" },
];
check(currentTermId(legacy as any, NOW) === 22, "بلا علاماتٍ: الجاري أحدثُ فصلٍ بدأ");
check(termIsFrozen(20, legacy as any, NOW) && termIsFrozen(21, legacy as any, NOW) && !termIsFrozen(22, legacy as any, NOW), "وما انقضى قبله مجمَّد");

check(!termIsFrozen(0, flagged as any, NOW) && !termIsFrozen(999, flagged as any, NOW) && !termIsFrozen(12, [] as any, NOW), "معرّفٌ مجهول أو بلا فصول لا يُجمَّد (لا ينكسر ما لا نعرفه)");
check(TERM_FROZEN_LABEL === "فصل سابق · للعرض فقط" && /للاطّلاع فقط/.test(TERM_FROZEN_MESSAGE), "والنصّان كما طلب المالك");

/* ── الخادم: كلُّ بابٍ يكتب يسأل ── */
const server = read("server.ts");
check(server.includes("async function refuseIfTermFrozen(res: Response, termId: number)") && server.includes('code: "term-frozen"'), "حارسٌ واحدٌ في الخادم برمزٍ صريح term-frozen");
const routeBody = (route: string) => {
  const at = server.indexOf(route);
  return at < 0 ? "" : server.slice(at, server.indexOf("\napp.", at + route.length));
};
for (const [route, label] of [
  ['app.post("/api/student-registration/:id/course-state"', "كشف التسجيل: قرار مقرر"],
  ['app.post("/api/student-registration/:id/case-state"', "كشف التسجيل: قرار حالة"],
  ['app.post("/api/instructor-requests/issue"', "رغبات الأساتذة: إصدار رابط"],
  ['app.post("/api/instructor-requests/:id/decide"', "رغبات الأساتذة: تثبيت/رفض"],
  ['app.post("/api/instructor-requests/:id/reply"', "رغبات الأساتذة: ردّ"],
] as const) {
  const body = routeBody(route);
  check(body.length > 200 && body.includes("refuseIfTermFrozen("), `${label} يرفض الفصل السابق`);
}
/* الحارس يحمل معرّف فصل السجلّ نفسه لا فصلاً يرسله المتصفح. */
check(routeBody('app.post("/api/student-registration/:id/course-state"').includes("need.AdTermId"), "ويقرأ فصلَ الطلب من السجلّ لا من الجسم");
check(routeBody('app.post("/api/instructor-requests/:id/decide"').includes("stored.AdTermId"), "وفصلَ طلب الأستاذ من السجلّ كذلك");

/* تغييرات الجدول: بوابةُ الدورة نفسها (refuseIfTermClosed) تعرف التجميد الآن. */
const closedGuard = server.slice(server.indexOf("async function refuseIfTermClosed("), server.indexOf("async function refuseIfTermFrozen("));
check(closedGuard.includes("termIsFrozen(termId") && closedGuard.includes("TERM_FROZEN_MESSAGE"), "تغييرات الجدول: التوقيع/الإرسال/القبول/الإرجاع/الملاحظات تمرّ بحارسٍ يجمّد الفصل الأقدم");
check((server.match(/refuseIfTermClosed\(res,/g) || []).length >= 10, "وكلُّ أبواب الدورة والملاحظات تسأله");

const proposals = read("src/server/studyProposalRoutes.ts");
check(proposals.includes("termIsFrozen(proposal.AdTermId") && proposals.includes('code: "term-frozen"'), "المقترحات الدراسية: التعديل والإرسال والسحب والتثبيت (عبر loadForStaff) ترفض الفصل السابق");
check(/termIsFrozen\(Number\(request\.AdTermId\)/.test(proposals), "وإنشاءُ مقترحٍ جديد كذلك");
check(proposals.includes("frozen: termIsFrozen(termId"), "والمساحة تعرف أنها للعرض فقط");

/* ── الشاشات: شريطٌ واحد، وأدواتٌ معطَّلة لا محذوفة ── */
const ribbon = read("src/components/TermFrozenRibbon.tsx");
check(ribbon.includes("TERM_FROZEN_LABEL") && ribbon.includes("<Lock />"), "شريطٌ واحدٌ بقفلٍ ونصّ «فصل سابق · للعرض فقط»");
const registration = read("src/components/StudentRegistration.tsx");
const inbox = read("src/components/InstructorInbox.tsx");
const changes = read("src/components/ScheduleChanges.tsx");
for (const [name, source] of [["كشف التسجيل", registration], ["رغبات الأساتذة", inbox], ["تغييرات الجدول", changes]] as const) {
  check(source.includes("<TermFrozenRibbon") && source.includes("useTermFrozen("), `${name}: الشريط والقاعدةُ المشتركة`);
}
check(registration.includes("disabled={frozen || busyKey ===") && registration.includes("if (frozen) return;"), "كشف التسجيل: الأزرار معطَّلة والمعالجات ترفض");
check((inbox.match(/const busy = busyProp \|\| frozenScreen;/g) || []).length === 2 && inbox.includes("disabled={frozenScreen}") && inbox.includes("if (frozen) return false;"), "رغبات الأساتذة: التثبيت والرفض والردّ معطَّلة");
check(changes.includes("disabled={frozen || busy || openNotes === 0}") && changes.includes("disabled={frozen}"), "تغييرات الجدول: الإرجاع والقبول والملاحظات معطَّلة");

/* كلُّ ما يُكتب مفتاحُه معرّفُ الفصل: لا يختلط فصلٌ بآخر. */
check(/AdTermId: number;/.test(read("src/types.ts").slice(read("src/types.ts").indexOf("export interface StudentNeed"))), "بيانات الطلبة مفتاحُها معرّف الفصل");

console.log(`\n${passed} نجح · ${failed} فشل`);
if (failed) process.exit(1);
