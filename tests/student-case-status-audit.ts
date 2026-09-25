/**
 * ── تدقيق «حالة طلبي» ───────────────────────────────────────────────────────
 *
 * أكثرُ الزحمة في أسبوع التسجيل ليست عن مقعدٍ ولا عن تعارض: هي سؤالٌ واحد —
 * «وصل طلبي أو لا؟» — لم يكن للطالب طريقٌ إلى جوابه إلا المجيء. وهذه الصفحةُ
 * هي الجواب، وما يلي حدودُها.
 *
 * وأخطرُ ما فيها بابان يُفتحان بلا حساب:
 *   - أن تَعِد بما لا تعرفه. لو قالت «سُجّلت» والقسمُ يسلّم التسجيلَ يدوياً،
 *     لصنعت زحمةً أسوأ حين يكتشف الطالبُ أنه غير مسجَّل.
 *   - أن تكشف من عبّأ الاستبيان لمن يجرّب أرقاماً مدنيّة.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const route = server.slice(
  server.indexOf('app.post("/api/public/survey/:token/my-case"'),
  server.indexOf("function studentCaseStatusPage"),
);
const page = server.slice(
  server.indexOf("function studentCaseStatusPage"),
  server.indexOf('app.get("/m/:token"'),
);

/* ── البابان ───────────────────────────────────────────────────────────── */

check(server.includes('app.post("/api/public/survey/:token/my-case"'), "لحالة الطلب مسارٌ يُقرأ");
check(server.includes('app.get("/m/:token"'), "وصفحةٌ يفتحها الطالب من الرابط نفسه");
check(route.length > 200 && page.length > 200, "وكلاهما مقروءٌ للتدقيق");

/* ── لا يُفتح بالمحاولة ────────────────────────────────────────────────── */

check(route.includes("staffLookupAllowed(`mycase:${token}`"), "حدُّ المحاولات مفروضٌ كما على بطاقة الأستاذ");
check(route.includes("validateCivilId(civil).isValid"), "والرقمُ المدنيُّ يُتحقَّق من صحّته، فلا يصل المخزنَ رقمٌ مخترع");
check(route.includes("civil.length !== 12"), "وطولُه شرط");

/* ── لا يكشف أحداً ─────────────────────────────────────────────────────── */

check(route.includes("await surveyFingerprint(civil)"), "القراءةُ بالبصمة، كما الكتابة");
/* الفرقُ بين «لا طلبَ لك» و«الرقم خطأ» يكشف لمن يجرّب أرقاماً من عبّأ ومن لم
   يعبّئ. فالجوابُ واحدٌ في الحالتين. */
check(route.includes("res.json({ found: false"), "ومن لا طلبَ له يُقال له ذلك، لا «الرقم خطأ»");
check(!/nameCipher|AdInstructorName|openStudentIdentity/.test(route), "ولا يُعاد اسمٌ ولا يُفكّ تشفيرُ هويّة");
check(!/fingerprint:/.test(route.split("res.json({ found: true")[1] || ""), "ولا تُعاد البصمةُ نفسُها إلى المتصفّح");

/* ── لا تَعِد بما لا تعرفه ─────────────────────────────────────────────── */

check(page.includes("وليست تسجيلاً في النظام الأكاديمي"),
  "الصفحةُ تقول صراحةً إنها حالةُ طلبٍ عند القسم لا تسجيل");
check(!/سُجّلت|مقعدُك محجوز|تم التسجيل/.test(page), "ولا تدّعي مقعداً ولا تسجيلاً");
check(page.includes("وصل طلبك إلى القسم يوم"), "وتقول ما جرى فعلاً: وصل الطلب، ومتى");

/* ── الرقمُ هو هو ──────────────────────────────────────────────────────── */

/* رقمُ الحالة واحدٌ في كل موضعٍ يعرضه — لحظةَ الإرسال، وهنا، وفي كشف التسجيل.
   وكان يُشتقّ في كلِّ موضعٍ على حدة، فلمّا صار ثابتاً يُورَّث عبر إعادة
   الإرسال انتقل الاشتقاقُ إلى دالّةٍ واحدة: اشتقاقان يفترقان يوماً، ويقف
   الطالبُ أمام الموظّف برقمٍ ليس في كشفه. */
check((server.match(/caseRefFor\(/g) || []).length >= 3,
  "ورقمُ الحالة يُقرأ من دالّةٍ واحدةٍ في كل موضعٍ يعرضه");
check(!/slice\(0,\s*8\)\.toUpperCase\(\)/.test(server),
  "ولا اشتقاقَ ثانيَ في الخادم يمكن أن يفترق عنها");

/* ── يجدها الطالب ─────────────────────────────────────────────────────── */

check(server.includes('تابع حالة طلبك'), "وشاشةُ «وصل طلبك» تحمل طريقاً إليها");
check(server.includes('href="/m/\'+encodeURIComponent(TOKEN)+\''), "والرابطُ هو رابطُه نفسُه");

/* ── الصفحة ────────────────────────────────────────────────────────────── */

check(page.includes('nonce='), "والنصُّ البرمجيُّ موقَّعٌ بالـnonce كبقيّة الأبواب العامة");
check(page.includes('function esc('), "وكلُّ ما يُعرض يُهرَّب قبل عرضه");
check(page.includes("٠١٢٣٤٥٦٧٨٩"), "والأرقامُ العربيةُ تُقبل كما تُكتب");
check(page.includes('meta name="robots" content="noindex,nofollow"'), "ولا تُفهرس");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
