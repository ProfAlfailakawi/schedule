/**
 * ── البابُ الذي يعدّل منه الأستاذ ───────────────────────────────────────────
 *
 * دورةُ رغبات الأساتذة كاملةٌ في الخادم: يُصدَر لكل أستاذٍ رابطُه، ويفتح جدولَه،
 * ويطلب، ويُحكم على طلبه، ويصل القسمَ في وارده. وكان ينقصها شيءٌ واحد: لا زرَّ
 * في الواجهة كلِّها يستدعي الإصدار. فلا يُصدَر رابطٌ أبداً، ولا يفتح أستاذٌ
 * جدولَه، ودورةٌ بُنيت كلُّها لا بابَ لها.
 *
 * وموضعُه «نشر»: هناك كان بابان وكلاهما قراءةٌ فقط، فمن بحث عن بابِ التعديل
 * وجد بطاقةَ اطّلاعٍ وظنَّ أنها هي.
 */

import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const publish = fs.readFileSync(path.join(process.cwd(), "src/components/SchedulePublish.tsx"), "utf8");
const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const details = fs.readFileSync(path.join(process.cwd(), "src/styles/09-details.css"), "utf8");

/* ── البابُ موجودٌ ويُستدعى ────────────────────────────────────────────── */

check(server.includes('app.post("/api/instructor-requests/issue"'), "مسارُ الإصدار قائمٌ في الخادم");
check(publish.includes('fetch("/api/instructor-requests/issue"'),
  "والواجهةُ تستدعيه — وهذا ما كان ناقصاً، فبقيت الدورةُ بلا باب");
check(publish.includes('type Kind = "department" | "staff" | "request";'),
  "وهو بابٌ ثالثٌ في «نشر»، حيث البابان الآخران قراءةٌ فقط");
check(publish.includes("<span>رغبات الأساتذة</span>"), "ويُسمّى باسمه");
check(publish.includes("كل أستاذ يفتح جدوله ويطلب تعديله — والقرار لكم"),
  "ويُقال تحته ما يفعله ومن يقرّر، فلا يُخلط ببطاقة الاطّلاع");

/* ── موعدٌ يُكتب، لا مدّةٌ تُحسب ───────────────────────────────────────── */

/* الأستاذُ يقرأ «آخر موعد ٥ أكتوبر»، ولا يقرأ «ثلاثين يوماً من متى». */
check(publish.includes('<label className="share-closes">') && publish.includes('type="date"'),
  "وللرغبات تاريخُ إغلاقٍ يُكتب، لا مدّةٌ بالأيام");
check(publish.includes('disabled={busy || (kind === "request" && !closesAt)}'),
  "ولا يُصدَر بلا موعدٍ مكتوب");

/* ── ويُقال ما وقع ────────────────────────────────────────────────────── */

/* روابطُ الرغبات لا تظهر في قائمة الروابط: هي رابطٌ لكلِّ أستاذٍ على حدة، لا
   رابطٌ واحدٌ يُنسخ. فلو صمتت الشاشةُ بعد الإصدار لظنَّ القسمُ أنه لم يقع. */
check(publish.includes("const reissued = rows.filter(row => row.reissued).length;"),
  "ويُفرَّق بين رابطٍ جديدٍ وآخرَ يحمله صاحبُه من قبل");
check(publish.includes("أُصدر") && publish.includes("يحملون روابطهم من قبل"),
  "فلا يظنُّ القسمُ أنه أرسل لعشرين وقد أرسل لثلاثة");
check(publish.includes("أرسلها وتابعها في «وارد الأساتذة»"),
  "ويُدلُّ على موضع المتابعة، فالروابطُ لا تظهر في هذه القائمة");

/* ── ثلاثةٌ في صفٍّ واحد ──────────────────────────────────────────────── */

/* عمودان ثابتان كانا يتركان الثالثَ وحيداً بعرض نصف الورقة. */
check(/\.share-kind\{[^}]*auto-fit/.test(details.replace(/\s+/g, "")),
  "وتتّسع الأبوابُ الثلاثةُ في صفٍّ واحد، بلا عددٍ مكتوبٍ يلزم تغييرُه عند الرابع");

/* ── ثلاثُ ملاحظاتٍ من مراجعةٍ آلية ─────────────────────────────────────── */

/* ١) رمزُ الطلب كان يُفتح من باب القراءة. البابُ يُعالج «بطاقة الأستاذ» ثم
      يسقط بما سواها إلى جدول القسم كاملاً — ومنه رمزُ الطلب. فمن نسخه من
      قائمة الروابط أو فتحه بهذا المسار يرى جدولَ القسم كلَّه بدل نموذج
      صاحبه: تسريبٌ لا يشتكي منه أحد، لأن الصفحةَ تُفتح وتعمل. */
check(server.includes('if (resolved.link.kind === "request") {')
  && server.includes('res.redirect(302, `/r/${encodeURIComponent(resolved.link.id)}`);'),
  "ورمزُ الطلب يُردّ إلى بابه، فلا يُفتح على جدول القسم");
/* والترتيبُ شرط: تحويلٌ بعد بناء الجدول لا يمنع بناءه. ويُقاس داخل بابه
   وحدَه، فـ`buildSharePayload` تُستدعى في ثلاثة مواضعَ في الملفّ. */
const staffDoor = server.slice(server.indexOf('app.get("/s/:token"'));
check(staffDoor.indexOf('res.redirect(302, `/r/${encodeURIComponent(resolved.link.id)}`);')
  < staffDoor.indexOf("const payload = await buildSharePayload(resolved.link);"),
  "ويُردّ قبل أن يُبنى جدولُ القسم، لا بعده");
/* وحارسٌ ثانٍ في الشاشة: لا تُعرض أصلاً، فلا تأخذ أزرارَ القائمة التي تبني
   `/s/`. */
check(publish.includes('link.kind !== "survey" && link.kind !== "request"'),
  "ولا تُعرض روابطُ الطلب في قائمة روابط النشر");

/* ٢) الصلاحيةُ كانت ثابتةً بـ٢١ يوماً والموعدُ يُكتب بحرّية. فمن كتب موعداً
      أبعدَ منها رأى أساتذتُه «انتهت صلاحية هذا الرابط» قبل الموعد الذي
      وعدهم به، ولا شيءَ في الشاشة يقول لماذا. */
check(server.includes("expiresAt: new Date(Math.max(")
  && server.includes("Date.parse(`${closesAt}T23:59:59.999Z`) + 86400000,"),
  "وصلاحيةُ الرمز تتبع الموعدَ المُعلَن، فلا يُغلق قبل ما وُعد به");
check(server.includes("Date.now() + REQUEST_LINK_DAYS * 86400000,"),
  "ولا تنزل عن الحدّ الأدنى، فلا يُغلق رابطُ موعدٍ قريبٍ لحظةَ انتهائه");

/* ٣) «أُصدر ١٢ رابطاً» كانت تبقى بعد إغلاق اللوحة وفتحِها على نطاقٍ آخر، أو
      بعد إنشاء رابط قراءةٍ عادي — فتُقرأ خبراً عن الفعل الجاري وهي خبرٌ عن
      فعلٍ مضى. */
check(publish.includes("useEffect(() => { setIssued(null); }, [open, collegeId, sectionId, termId, kind]);"),
  "ونتيجةُ الإصدار تُمحى عند تغيّر النطاق أو النوع أو إعادة الفتح");
check(publish.includes("setCreatedId(data.id);\n      setIssued(null);"),
  "وعند إنشاء رابطٍ من نوعٍ آخر");
check(publish.includes("setIssued({ created: rows.length - reissued, reissued });\n      setCreatedId(null);"),
  "والعكسُ كذلك، فلا يُعرض خبران عن فعلين");

/* ── والمرشدُ يعرف البابَ الثالث ──────────────────────────────────────────
 * السؤالُ الذي جاء منه هذا العمل كان «وين الدكتور يقدر يعدل؟». فباباً يُضاف
 * ولا يعرفه المرشدُ يترك السؤالَ قائماً لمن يسأله بعد. */
const guide = fs.readFileSync(path.join(process.cwd(), "src/guide/smartGuide.ts"), "utf8");
check(guide.includes('id:"schedule.publish.requests"'),
  "وللبابِ الثالث تعريفٌ في المرشد");
check(guide.includes("وين يعدل الدكتور"),
  "ويُعثر عليه بالسؤال الذي يُسأل به فعلاً");
check(guide.includes("وبطاقةُ الأستاذ بجانبه للاطّلاع وحده، وهي موضعُ الخلط"),
  "ويُفرَّق صراحةً عن بطاقة الاطّلاع، وهي موضعُ الخلط");
/* ── وهدفُ الخطوة هو العنصرُ الذي تتكلّم عنه ────────────────────────────
 * المرشدُ يستبدل أولَ اسمٍ بين قوسين في نصّ الخطوة باسمِ هدفها الحيّ
 * (`hydrateGuideSteps`). فخطوةٌ تقول «اختر رغبات الأساتذة» وهدفُها زرُّ النشر
 * الخارجيُّ تصير «اختر نشر» — نقيضُ ما وُضعت له، وأسوأُ من غيابها. */
check(publish.includes('data-guide-target="schedule.publish.requests"'),
  "ولزرِّ الرغبات هدفٌ خاصٌّ به في الشاشة");
check(guide.includes('{target:"schedule.publish.requests",text:"هذا هو «رغبات الأساتذة»'),
  "والخطوةُ التي تسمّيه تُشير إليه هو، فلا يُستبدل اسمُه باسم غيره");
/* والخطوةُ التي لا تسمّي عنصراً لا تحمل قوسين أصلاً، فلا يُقحَم فيها اسمٌ. */
check(!/\{target:"schedule\.publish",text:"[^"]*«/.test(guide.slice(guide.indexOf('id:"schedule.publish.requests"'))),
  "وما لا تسمّيه لا تضع فيه قوسين، فلا يُقحَم اسمُ الزرّ الخارجيّ");
/* ووصفُ «نشر» نفسُه صار يذكر الأبوابَ الثلاثة، فلا يقرأ القارئُ «رابط قراءة»
   فيظنّ أن لا تعديلَ هناك. */
check(guide.includes("ورغباتُ الأساتذة — وهو الوحيد الذي يُعدَّل منه"),
  "ووصفُ النشر نفسُه يذكر الأبوابَ الثلاثة");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
