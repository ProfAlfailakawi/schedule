/**
 * ── عدّةُ الصفحات العامة: ما تَعِد به يُقاس ─────────────────────────────────────
 *
 * 1. حقلُ الوقت يقبل 930 ويكتب 09:30 بأرقامٍ إنجليزية، ويقبل ما يكتبه الهاتفُ
 *    العربيُّ بأرقامه الهندية، ويرفض ما خارج الدوام وما ليس وقتاً.
 * 2. لا <input type="time"> في صفحة عامة: المتصفحُ يرسمه بأرقام الجهاز وبـ«ص/م».
 * 3. الخيطُ يحفظ أولَ رسالةٍ حين يبلغ حدَّه.
 * 4. الصفحتان تحملان العدّةَ والخطَّ اللاتيني (منه تأتي الأرقامُ بخطّ العلامة).
 */
import fs from "fs";
import vm from "vm";
import { PUBLIC_FONT_FACES, PUBLIC_KIT_CSS, PUBLIC_KIT_SCRIPT } from "../src/server/publicKit";
import { THREAD_LIMIT, capThread } from "../src/utils/instructorRequestThread";
import { studyProposalPage } from "../src/server/studyProposalPage";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/* ── السكربتُ يعمل وحده بلا صفحة ──────────────────────────────────────────── */
const noop = () => undefined;
const fakeEl: any = { classList: { add: noop, remove: noop, contains: () => false }, setAttribute: noop, appendChild: noop };
const sandbox: any = {
  document: { addEventListener: noop, createElement: () => ({ ...fakeEl }), body: { appendChild: noop, classList: { add: noop, remove: noop } }, getElementById: () => null },
  window: { addEventListener: noop },
  Array, String, Date, JSON, Number,
};
let compiled = true;
try { vm.runInNewContext(`${PUBLIC_KIT_SCRIPT}\nthis.SK = SK;`, sandbox); } catch (error: any) { compiled = false; console.log(error?.message); }
check(compiled && !!sandbox.SK, "العدّةُ تُحمَّل في سياقٍ نظيف");
const SK = sandbox.SK;

check(SK.norm("930") === "09:30", "930 ← 09:30");
check(SK.norm("0930") === "09:30" && SK.norm("09:30") === "09:30", "0930 و09:30 كلاهما 09:30");
check(SK.norm("١٥٣٠") === "15:30", "أرقامُ لوحةٍ عربية (١٥٣٠) ← 15:30 بأرقامٍ إنجليزية");
check(SK.norm("۱۵۳۰") === "15:30", "وأرقامُ لوحةٍ فارسية كذلك");
check(SK.norm("2560") === "" && SK.norm("9999") === "", "ساعةٌ أو دقيقةٌ مستحيلة تُرفض");
check(SK.norm("0700") === "" && SK.norm("2100") === "", "خارج الدوام (08:00–20:00) يُرفض");
check(SK.norm("0700", "06:00", "20:00") === "07:00", "والحدّان يُضبطان بحسب الصفحة");
check(SK.norm("12") === "" && SK.norm("") === "", "ناقصٌ أو فارغٌ لا يُقبل");
check(SK.digits("٠١٢٣٤٥٦٧٨٩abc") === "0123456789", "digits تحوّل الهندية وتُسقط غير الأرقام");

const field: string = SK.tf('data-x="1"', "09:30");
check(field.includes('type="text"') && !/type="time"/.test(field) && field.includes('dir="ltr"') && field.includes('inputmode="numeric"'),
  "حقلُ الوقت نصٌّ رقميٌّ يساريّ لا حقل المتصفح");
check(field.includes('value="09:30"') && field.includes('data-min="08:00"') && field.includes('data-max="20:00"'), "قيمتُه وحدّاه ظاهران");
check(SK.tf("", '"><b>').includes("&quot;&gt;&lt;b&gt;"), "قيمةُ الحقل تُهرَّب");

/* ── الخيطُ يحفظ طلبَه الأول ──────────────────────────────────────────────── */
const long = Array.from({ length: THREAD_LIMIT + 7 }, (_, at) => ({ at }));
const capped = capThread(long);
check(capped.length === THREAD_LIMIT && capped[0].at === 0 && capped[capped.length - 1].at === THREAD_LIMIT + 6,
  "عند الحدّ تبقى الرسالةُ الأولى وآخرُ الرسائل");
check(capThread(long.slice(0, 5)).length === 5, "وما دون الحدّ يبقى كما هو");

/* ── الصفحتان العامتان ─────────────────────────────────────────────────────── */
const server = fs.readFileSync("server.ts", "utf8");
const pageStart = server.indexOf("function instructorRequestPage");
const requestPage = server.slice(pageStart, server.indexOf('app.get("/r/:token"', pageStart));
const proposal = studyProposalPage("t", "p", "n", "");
check(!/type="time"/.test(requestPage) && !/type="time"/.test(proposal), "لا حقلَ <input type=\"time\"> في أيٍّ من الصفحتين");
check(requestPage.includes("${PUBLIC_KIT_SCRIPT}") && requestPage.includes("${PUBLIC_FONT_FACES}") && requestPage.includes("${PUBLIC_KIT_CSS}"),
  "صفحةُ الطلب تحمل العدّة والخطوط");
check(proposal.includes("var SK=(function()") && proposal.includes("plex-arabic-latin-400.woff2") && proposal.includes(".sk-sheet"),
  "وصفحةُ المقترح كذلك");
check(PUBLIC_FONT_FACES.includes("plex-arabic-latin-700.woff2") && /U\+0000-00FF/.test(PUBLIC_FONT_FACES),
  "الوجهُ اللاتيني يغطي الأرقام (U+0000–00FF) بكل الأوزان");
check(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(PUBLIC_KIT_SCRIPT) && !/console\./.test(PUBLIC_KIT_SCRIPT),
  "العدّة لا تخزّن شيئاً ولا تطبع في السجل: الرقمُ المدني يبقى في ذاكرة الصفحة وحدها");
check(!PUBLIC_KIT_CSS.includes("`") && !PUBLIC_KIT_SCRIPT.includes("`") && !PUBLIC_KIT_SCRIPT.includes("${"), "لا علامةَ اقتباسٍ مائلة ولا ‎${‎ في نصٍّ يُحقن في قالب");
check(/prefers-color-scheme:dark/.test(proposal) && /prefers-color-scheme:dark/.test(fs.readFileSync("src/server/requestPageStyles.ts", "utf8")),
  "الصفحتان تدعمان الوضع الداكن");

console.log(`\nPublic kit audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
