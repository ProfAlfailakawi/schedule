/**
 * ── ضغطةُ «أرسل» صارت توقيعاً ───────────────────────────────────────────────
 *
 * كانت لا تُثبت شيئاً. الرابطُ يصل في واتساب، ويُعاد توجيهه إلى مجموعةٍ أو
 * زميل، ويُفتح من هاتفٍ ليس هاتفَه — فيصل القسمَ طلبٌ باسمه لم يكتبه. وهو ما
 * يُنكره عند أوّل خلاف، ولا شيء في السجلّ يردّ عليه.
 *
 * فصار يُطلب رقمُه المدنيُّ عند الإرسال ويُطابَق بسجلّه: الشيءُ الذي لا يعرفه
 * عنه غيرُه.
 *
 * وما يلي حدودُ ذلك. وأخطرُها بابان:
 *   - أن يصير البابُ مجرَّبا عليه بالأرقام.
 *   - أن يُحفظ الرقمُ نفسُه، فيصير الطلبُ مخزناً لأرقام الأساتذة المدنية.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const inbox = fs.readFileSync(path.join(process.cwd(), "src/components/InstructorInbox.tsx"), "utf8");
const types = fs.readFileSync(path.join(process.cwd(), "src/types.ts"), "utf8");

const route = server.slice(
  server.indexOf('app.post("/api/public/request/:token"'),
  server.indexOf('app.post("/api/public/request/:token/check"'),
);
check(route.length > 400, "مسارُ الإرسال مقروءٌ للتدقيق");

/* ── لا يمرّ بلا رقم ──────────────────────────────────────────────────── */

check(route.includes('const civil = normalizeCivilId(req.body?.civil)'),
  "الإرسالُ يقرأ الرقمَ المدني");
check(route.includes("validateCivilId(civil)"),
  "ويُتحقَّق من صحّته بالخوارزمية الكويتية، فلا يمرّ رقمٌ مخترع");
check(route.includes("const storedCivil = normalizeCivilId(signer?.AdInstructorCivil)")
  && route.includes("if (!storedCivil || storedCivil !== civil)"),
  "ويُطابَق بسجلّ صاحب الرابط نفسِه — وهو ما يجعله توقيعاً");
/* والرقمُ المخزونُ يُطبَّع كما يُطبَّع المُرسَل: سجلٌّ كُتب بأرقامٍ عربيةٍ أو
   فارسية — وبابُ الأساتذة يقبلها — كان يُمحى كلُّه فلا يطابق شيئاً أبداً،
   وصاحبُه يدخل رقمَه الصحيح فيُردّ مرّةً بعد مرّة. */
check(!/String\(signer\.AdInstructorCivil\)\.replace/.test(route),
  "ولا يُقارَن رقمٌ مخزونٌ بلا تطبيع");

/* والترتيبُ شرط: حارسٌ بعد الحفظ ليس حارساً. */
check(route.indexOf("لا يطابق صاحب هذا الرابط") < route.indexOf("saveInstructorRequest"),
  "والمطابقةُ قبل الحفظ، لا بعده");

/* ── ولا يُجرَّب عليه ─────────────────────────────────────────────────── */

check(route.includes("staffLookupAllowed(`request:${resolved.request.id}`"),
  "وحدُّ المحاولات مفروضٌ كما على بطاقة الأستاذ وحالة الطالب");
/* والجوابُ واحدٌ سواءٌ أخطأ الرقمَ أم لم يكن في سجلّه رقمٌ: التفريقُ بينهما
   يقول لمن يجرّب أيُّ الأساتذة مسجَّلٌ رقمُه. */
check(!/لا يوجد رقم|غير مسجّل|ليس له رقم/.test(route),
  "والجوابُ واحدٌ لمن أخطأ الرقمَ ولمن لا رقمَ في سجلّه، فلا يُكشف أحد");

/* ── ولا يُحفظ الرقم ─────────────────────────────────────────────────── */

check(route.includes("fingerprint: await surveyFingerprint(civil)"),
  "ولا يُحفظ الرقمُ نفسُه، بل بصمتُه");
/* والسجلُّ المحفوظُ يحمل التوقيعَ بحقوله الثلاثة لا غير: لحظتُه، وبصمتُه،
   ورمزُه. وما بينها موضعُ الرقم لو أُقحم. */
const signatureLiteral = server.slice(
  server.indexOf("const signature: InstructorRequestSignature = {"),
  server.indexOf("const changed = items.filter"));
check(signatureLiteral.length > 60
  && /at,/.test(signatureLiteral) && /fingerprint:/.test(signatureLiteral) && /verifyCode:/.test(signatureLiteral)
  && !/\bcivil\s*[,:}]/.test(signatureLiteral.replace("surveyFingerprint(civil)", "")),
  "ولا يُكتب الرقمُ في السجلّ بأيّ اسم");
/* والبصمةُ لا تصل المتصفّح: إرسالُها يجعلها رقماً يُجرَّب عليه. */
check(server.includes('? { at: request.signature.at, verifyCode: request.signature.verifyCode, fingerprint: "" }'),
  "والبصمةُ لا تصل المتصفّح، تُطابَق في الخادم وحدَه");
check(server.includes("verificationCode(resolved.request.id, Number(resolved.request.AdInstructorId), at)"),
  "ورمزُ التحقّق يُشتقّ كما يُشتقّ رمزُ توقيع الجدول، فلا اشتقاقان يفترقان");
check(types.includes("signature?: InstructorRequestSignature;"),
  "والتوقيعُ حقلٌ في السجلّ، لا سطرٌ في خطٍّ زمنيّ يُقرأ ولا يُطابَق");

/* ── ويُقال للطرفين ──────────────────────────────────────────────────── */

check(server.includes("بإدخال رقمك المدني والضغط على «أرسل» فأنت توقّع هذا الطلب باسمك."),
  "والصفحةُ تقول إنه توقيع، لا «تحقّق من هويتك» — لأنه توقيع");
check(server.includes('var field=document.getElementById("civil");')
  && server.includes('.replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))})'),
  "والأرقامُ العربيةُ تُقبل كما تُكتب على لوحة الهاتف");
check(server.includes("رمز توقيعك:"),
  "ويُعطى صاحبُه رمزَه، فهو ما يُطابَق به طلبُه");
check(inbox.includes("row.signature?.verifyCode") && inbox.includes("موقَّع"),
  "والقسمُ يرى من وقّع");
/* وطلبٌ قديمٌ أُرسل قبل هذا لا يحمل توقيعاً. وعرضُه كالموقَّع كذبٌ صامت. */
check(inbox.includes('data-missing="true"') && inbox.includes("بلا توقيع"),
  "وما أُرسل قبل هذا يُقال فيه «بلا توقيع»، فلا يُفترض توقيعٌ لم يقع");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
