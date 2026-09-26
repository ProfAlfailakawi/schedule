/**
 * شريط الاعتماد إنفوجرافيك — وما لا يحمل بياناً لا يُرسم.
 *
 * ١) قاعدة الظهور (approvalBarPresence): قسمٌ في أول الإعداد لا شيء ينتظره
 *    لا يرى شريطاً؛ و«التفاصيل» لا تُعرض ومنطقتُها فارغة؛ والمرقاة لا تُرسم
 *    قبل أن يكون للدورة أثر.
 * ٢) الشريطُ يسأل القاعدة ولا يكتبها ثانية.
 * ٣) كلُّ جملةٍ كانت سطراً باقيةٌ في تلميحها أو لقارئ الشاشة.
 */
import fs from "fs";
import path from "path";
import { approvalBarPresence, type ApprovalBarPresenceInput } from "../src/utils/approvalBarPresence";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

const blank: ApprovalBarPresenceInput = {
  status: "drafting", hasCommitteeSignature: false, hasHeadSignature: false, round: 0, headReturned: false,
  pendingAdditions: 0, hasDeadline: false, openNotes: 0, escalatedNotes: 0, historyEvents: 0, hasAction: false,
};
const at = (patch: Partial<ApprovalBarPresenceInput>) => approvalBarPresence({ ...blank, ...patch });

/* ── ١) القاعدة ─────────────────────────────────────────────────────────── */
{
  const empty = at({});
  check(!empty.bar && !empty.details && !empty.relay, "قسمٌ قيد الإعداد بلا توقيعٍ ولا موعدٍ ولا فعل: لا شريط، ولا «التفاصيل»، ولا مرقاة");
  const deadlineOnly = at({ hasDeadline: true });
  check(deadlineOnly.bar && !deadlineOnly.details && !deadlineOnly.relay, "موعدٌ وحده: الشريطُ بحلقته، بلا «التفاصيل» ولا مرقاة");
  const canSign = at({ hasAction: true });
  check(canSign.bar && !canSign.details, "زرُّ التوقيع وحده: الشريطُ يبقى لأن لصاحبه فعلاً، و«التفاصيل» لا تظهر فارغة");
  const history = at({ historyEvents: 3 });
  check(history.bar && !history.details, "سجلٌّ وحده: يُعرض زرُّه، ولا «تفاصيل» بلا محتوى");
  check(at({ openNotes: 2 }).bar && at({ escalatedNotes: 1 }).bar, "ملاحظةٌ مفتوحة أو خلافٌ مرفوع يُبقي الشريط");
  check(at({ pinned: true }).bar, "خطأٌ معروض أو ورقةٌ مفتوحة لا يُخفى الشريط من تحتهما");
  for (const [label, patch] of [
    ["توقيع اللجنة", { hasCommitteeSignature: true }],
    ["توقيع رئيس القسم", { hasHeadSignature: true }],
    ["جولةٌ جارية", { round: 1 }],
    ["إرجاع رئيس القسم", { headReturned: true }],
    ["إضافاتٌ تنتظر", { pendingAdditions: 2 }],
    ["عند التسجيل", { status: "submitted" }],
    ["معتمد", { status: "accepted" }],
    ["مُرجَع", { status: "returned" }],
  ] as Array<[string, Partial<ApprovalBarPresenceInput>]>) {
    const p = at(patch);
    check(p.bar && p.details && p.relay, `${label}: للدورة أثر، فالمرقاة و«التفاصيل» تظهران`);
  }
}

/* ── ٢) الشريط يسأل القاعدة ولا يعيد كتابتها ─────────────────────────────── */
const bar = read("src/components/ApprovalBar.tsx");
check(bar.includes('import { approvalBarPresence } from "../utils/approvalBarPresence"') && bar.includes("if (!presence.bar) return null;"),
  "الشريط يستورد القاعدة ويعود null حين لا يحمل شيئاً");
check(bar.includes('{presence.details ? <IconButton label={expanded ? "إخفاء التفاصيل" : "التفاصيل"}'),
  "زرُّ «التفاصيل» مشروطٌ بأن تحته شيئاً");
check(bar.includes("const showDetails = expanded && presence.details;") && bar.includes("{showDetails ? (") && !/\{expanded \? \(\s*<div className="apb-expanded"/.test(bar),
  "منطقة التفاصيل لا تُفتح فارغةً ولو بقي تفضيلُ الفتح محفوظاً");
check(bar.includes("{!showDetails && presence.relay ? ("), "المرقاة المصغّرة لا تُرسم قبل أن يكون للدورة أثر");
check(!/hasCommitteeSignature\s*\|\|/.test(bar) && !/input\.round/.test(bar), "لا نسخةَ ثانية من قاعدة الظهور داخل الشريط");
check(bar.includes("countdown ? (") && /const ring = \(size: "sm" \| "lg"\) => countdown \?/.test(bar), "لا حلقةَ موعدٍ بلا موعد");
check(bar.includes("{events.length ? (") && bar.includes("{!onOpenNotes && openNotes > 0 ? ("), "لا زرَّ سجلٍّ بلا أحداث، ولا شارةَ ملاحظاتٍ عند الصفر");

/* ── ٣) النصُّ انتقل إلى التلميح ولم يضع ─────────────────────────────────── */
for (const phrase of [
  "يمنع التوقيع: {blockingSummaryPhrase(blockingConflicts, state.blockingRows)}",
  "يمنع الإرسال: {blockingSummaryPhrase(blockingConflicts, state.blockingRows)}",
  "انقضى موعد التسليم — يلزم تمديدٌ من رئيس التسجيل",
  "أصرّ عليها التسجيل ثلاثاً بعد ردّ اللجنة",
  "رمز التحقق",
  "طُلب تمديد ${countOf(extensionRequest.days, oblique(AR.day))}",
  "رُفض طلب التمديد",
  "سبب الاستثناء",
  'label="سحب توقيعي"',
  "افتح الملاحظات",
  'aria-label={status === "returned" ? "إعادة الإرسال إلى التسجيل" : "إرسال إلى التسجيل"}',
  'aria-label={signatureStage === "head" ? "اعتماد وإرسال للتسجيل" : "توقيع لجنة الجدول"}',
]) check(bar.includes(phrase), `النصُّ باقٍ في التلميح أو اسم الزرّ: ${phrase.slice(0, 48)}`);
check(bar.includes('role="tooltip"') && bar.includes("aria-describedby={id}"), "التلميح مربوطٌ بعنصره لقارئ الشاشة");
check((bar.match(/className="sr-only"/g) || []).length >= 2, "الحالُ والتواقيعُ نصّاً مخفيّاً لقارئ الشاشة");
check(!/\$\{(openNotes|escalated|pendingAdditions)\} (ملاحظ|شعب)/.test(bar), "الأعدادُ العربية بـ countOf لا بلصق الرقم بالاسم");

const css = read("src/styles/11-approval.css");
check(/@media \(prefers-reduced-motion:reduce\)\{[^}]*apb-steps li\[data-turn\] \.apb-node[^}]*animation:none/.test(css), "النبضةُ تسكن عند من طلب تقليل الحركة");
check(css.includes(".apb-tip-target:focus-visible") && css.includes(".apb-icon-btn:focus-visible"), "حلقةُ تركيزٍ ظاهرة للوحة المفاتيح");
check(/@media \(max-width:640px\)\{[\s\S]*\.apb-step-label\{display:none\}/.test(css), "على الهاتف: المرقاة أيقوناتٌ بلا تسميات");
check(css.includes(".apb-visuals:empty{display:none}"), "حاويةُ الأيقونات الفارغة لا تترك فراغاً");

console.log(`\nApproval bar visual audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
