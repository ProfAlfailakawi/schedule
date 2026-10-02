/**
 * صفحة المقترح الدراسي للأستاذ (/r/:token/proposal/:pid): تُبنى في الخادم وسكربتها
 * داخل قالبٍ نصّي، فخطأٌ واحد في الهروب يُبقيها على «يفتح…». هنا يُجمَّع سكربتُها
 * بمحرّك V8 نفسه، وتُفحص العقودُ التي لا يجوز أن تنكسر بتعديلٍ لاحق: لا رقمَ
 * مدنياً مخزَّناً، ولا ردَّ بلا رقم نسخة، ولا ادّعاءَ بأن الجدول تغيّر قبل التثبيت.
 */
import fs from "fs";
import vm from "vm";
import { studyProposalPage } from "../src/server/studyProposalPage";
import { PROPOSAL_ALERT_CSS, PROPOSAL_ALERT_SCRIPT } from "../src/server/studyProposalAlert";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

/* استخراج عناصر <tag> بالبحث النصي لا بالتعبيرات النمطية: لا نحاول «تحليل HTML» بتعبير. */
function elements(source: string, tag: string): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  const lower = source.toLowerCase();
  let at = 0;
  for (;;) {
    const open = lower.indexOf(`<${tag}`, at);
    if (open < 0) break;
    const next = lower[open + tag.length + 1];
    if (next && !/[\s>]/.test(next)) { at = open + 1; continue; }
    const headEnd = lower.indexOf(">", open);
    if (headEnd < 0) break;
    const close = lower.indexOf(`</${tag}`, headEnd);
    if (close < 0) break;
    out.push(["", source.slice(open + tag.length + 1, headEnd), source.slice(headEnd + 1, close)]);
    const closeEnd = lower.indexOf(">", close);
    at = closeEnd < 0 ? source.length : closeEnd + 1;
  }
  return out;
}

const html = studyProposalPage("demo.token-1", "pid-1", "NONCE123", "");
const scripts = elements(html, "script");
const styles = elements(html, "style");
check(scripts.length === 1, "سكربتٌ واحد فقط");
check(styles.length === 1, "أنماطٌ واحدة فقط");
check(/nonce="NONCE123"/.test(scripts[0]?.[1] || ""), "السكربت يحمل nonce الصفحة");
const js = scripts[0]?.[2] || "";
const css = styles[0]?.[2] || "";
let compiled = true;
try { new vm.Script(js, { filename: "study-proposal-inline.js" }); } catch (error: any) { compiled = false; console.log(error?.message); }
check(compiled, "السكربت المولَّد سليم الصياغة");
check(html.includes("/* SCHEDULE_PUBLIC_PLEX_ARABIC */"), "علامة خطوط Plex Arabic موجودة");
check(/lang="ar" dir="rtl"/.test(html) && /name="viewport"/.test(html), "RTL وviewport");
check(/noindex/.test(html), "الصفحة لا تُفهرس");

/* التوكن والمعرّف يدخلان السكربت JSON ولا يُغلقان الوسم. */
const hostile = studyProposalPage('x</script><img src=x>', 'p"</script>', "n");
check(!hostile.includes("</script><img"), "رمز رابطٍ خبيث لا يُغلق وسم السكربت");
check([...hostile.matchAll(/<script\b/gi)].length === 1, "الرمز الخبيث لا يزيد سكربتاً");
let hostileCompiles = true;
try { new vm.Script(elements(hostile, "script")[0][2]); } catch { hostileCompiles = false; }
check(hostileCompiles, "السكربت سليم مع رمزٍ بعلاماتٍ خاصة");
check(/\/api\/public\/request\/"\+encodeURIComponent\(TOKEN\)\+"\/proposals\/"\+encodeURIComponent\(PID\)/.test(js), "نداء القراءة على المسار العام للمقترح");
check(js.includes('"/respond"'), "نداء الرد على /respond");

/* التوقيع: يُكتب ولا يُحفظ. */
check(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(js), "لا تخزينَ في المتصفح (لا رقم مدني محفوظ)");
check(!/console\.(log|info|debug|warn|error)/.test(js), "لا طباعةَ في السجل (لا رقم مدني مسرَّب)");
check(!/UI\.civil/.test(js) && js.includes("SK.sign(") && /pagehide/.test(js), "الرقم المدني لا يدخل حالة الصفحة: يمرّ من ورقة التوقيع إلى الطلب، ويُمحى من الذاكرة بإغلاق الصفحة");
check(/civil:civil/.test(js) && /c\.length!==12/.test(js), "الرقم المدني 12 خانة ويُرسل في الحقل civil");
check(/٠-٩/.test(js) && /۰-۹/.test(js), "الأرقام العربية والفارسية تُحوَّل");
check(!/history\.(push|replace)State|location\.(search|hash)\s*=/.test(js), "لا يُكتب الرقم في الرابط");

/* النسخة تُرسل مع كل رد. */
check(/version:D\.version/.test(js), "رقم النسخة يُرسل مع كل ردّ");
check(/stale-version/.test(js) && js.includes("وصلتك نسخةٌ أحدث"), "تعامُلٌ مع 409 نسخةٍ أقدم برسالة وزرّ إعادة التحميل");
check(/\.status===409/.test(js) && /x\.status===429/.test(js), "409 و429 يُعالجان");
check(/UI\.sending/.test(js) && /if\(UI\.sending\|\|!D\)return/.test(js), "لا إرسالَ مضاعَف أثناء الإرسال");
check(/' disabled'/.test(js), "زرّ الإرسال يُعطَّل أثناء الإرسال");

/* النص: لا يُدّعى أن الجدول تغيّر قبل التثبيت. */
check(js.includes("تم تسجيل موافقتك · بانتظار تثبيت القسم"), "نصّ الموافقة الحرفي: تم تسجيل موافقتك · بانتظار تثبيت القسم");
check(js.includes("سجّلنا طلب التعديل · سيراجعه القسم"), "نصّ طلب التعديل الحرفي: سجّلنا طلب التعديل · سيراجعه القسم");
check(js.includes("ثبّت القسم هذا المقترح في جدولك"), "نصّ التثبيت: ثبّت القسم هذا المقترح في جدولك");
check(js.includes("لم يتغيّر جدولك"), "تُقال صراحةً: لم يتغيّر جدولك قبل التثبيت");
check(!/(تم|قد|جرى)\s+(تعديل|تغيير|تحديث)\s+جدولك/.test(js), "لا عبارةَ تدّعي تعديل الجدول");
check(js.includes("تغيّرت بعض بيانات الجدول بعد إرسال المقترح") && js.includes("سيعيد القسم مراجعته قبل التثبيت"), "ملاحظة التقادم الهادئة");
check(js.includes("لا يوجد مقترحٌ بهذا المعرّف") || /LOADCODE===404\?"لا يوجد مقترحٌ بهذا المعرّف"/.test(js), "حالة 404 بنصٍّ عربيّ");
check(js.includes("g.reason"), "سبب إغلاق الباب يُعرض من الخادم");
check(js.includes("applied") && js.includes("skipped"), "نتيجة كل مادة بعد التثبيت (applied/skipped)");

/* البيانات والعرض. */
check(js.includes("غير متوفر") && /loadUnits|\.b==null|a==null/.test(js) && !/loadUnits\s*\|\|\s*0/.test(js), "النصاب المجهول «غير متوفر» لا صفر");
check(js.includes("ساعات الحضور") && js.includes("ساعات التدريس") && /presenceMinutes/.test(js) && /teachingMinutes/.test(js), "ساعات الحضور وساعات التدريس مفهومان منفصلان");
check(/gapMinutes/.test(js) && /maxGap/.test(js), "الفراغات وأطولها");
check(js.includes("\\u2066") && js.includes("\\u2069"), "الوقت في عزلٍ يسارِيّ فلا ينقلب");
check(/function lanesFor/.test(js) && /lanes/.test(js), "المواعيد المتداخلة تُوزَّع على مسارات متجاورة");
check(js.includes("القاعة لم تُحدد"), "«القاعة لم تُحدد» حين المكان مجهول");
check(["مقترح", "معدّل", "يخرج", "أظهر ما سيخرج أو يتغيّر", "جدولي الحالي", "بعد المقترح"].every(t => js.includes(t)), "وسوم الحالات وعناصر التبديل موجودة نصّاً");
check(["أوافق", "أحتاج تعديلاً", "أوافق على المقترح"].every(t => js.includes(t)), "أزرار الرد");
check(js.includes("يوافق الأستاذ على المجموعة كاملة أو يطلب تعديلها"), "شرح الترتيب المترابط");
check(["الوقت", "المكان", "الأيام", "النصاب", "سبب آخر"].every(t => js.includes(t)), "أسباب طلب التعديل");
check(/maxlength="600"/.test(js) && js.includes("SK.tf(") && !/type="time"/.test(js), "الملاحظة حتى 600 حرف وحقل وقتٍ مقترح بأرقامٍ إنجليزية لا حقل المتصفح");
check(/يخرج من جدولك|يخرج من جدولك:/.test(js) && js.includes("يدخل:"), "نصّ الاستبدال: يخرج/يدخل");
check(js.includes("تبقى الشعبة الخارجة في جدول القسم"), "معنى إلغاء الإسناد بكلماتٍ بسيطة");
check(js.includes("عُدّل وقتُ هذه الشعبة"), "ملاحظة تعديل الشعبة المسندة");
check(js.includes("آخر موعد للرد"), "موعد الرد بالعربية الواضحة");

/* الوصول والحركة. */
check(/role="dialog" aria-modal="true"/.test(js), "نافذة التفاصيل role=dialog وaria-modal");
check(/aria-pressed/.test(js) && /role="group"/.test(js), "أزرار التبديل بـ aria-pressed ضمن مجموعات");
check(/role="alert"/.test(js) && /aria-live/.test(js), "رسائل الخطأ والحالة تُعلَن");
check(/<button type="button"/.test(js) && /class="ev/.test(js), "عناصر الجدول أزرارٌ حقيقية تُفعَّل بالكيبورد");
check(/e\.key==="Escape"/.test(js), "Esc يغلق التفاصيل");
check(/focus-visible/.test(css), "حلقة تركيز ظاهرة");
check(/@media \(prefers-reduced-motion:reduce\)\{[^}]*animation:none!important[^}]*transition:none!important/.test(css), "قاعدة تقليل الحركة تُلغي الانتقالات والرسوم");
check(/@media print/.test(css), "أنماط طباعة");
check(/@media \(max-width:639px\)/.test(css) && /agenda/.test(js), "عرض يومي بتبويب أيامٍ للهاتف");
const durations = [...css.matchAll(/(?:transition|animation:fadeIn)[^;{}]*?([0-9.]+)s/g)].map(m => Number(m[1]));
check(durations.length > 0 && durations.every(d => d <= 0.2), "كل الانتقالات ≤ 200ms");
check(/setRegion/.test(js) && /preventScroll/.test(js), "إعادة الرسم بالمناطق مع حفظ البؤرة");

/* تنبيهات المدخل في الصفحتين الأخريين. */
check(PROPOSAL_ALERT_SCRIPT.includes("لديك مقترح دراسي من القسم"), "نصّ التنبيه «لديك مقترح دراسي من القسم»");
check(/\/r\/"\+encodeURIComponent\(it\.token\)\+"\/proposal\//.test(PROPOSAL_ALERT_SCRIPT), "التنبيه يفتح صفحة المقترح");
check(/gate&&p\.gate\.open/.test(PROPOSAL_ALERT_SCRIPT), "لا يظهر إلا والباب مفتوح");
check(!/\\/.test(PROPOSAL_ALERT_SCRIPT + PROPOSAL_ALERT_CSS.replace(/\\/g, "")), "نصّ التنبيه بلا شرطاتٍ مائلة");
let alertCompiles = true;
try { new vm.Script(PROPOSAL_ALERT_SCRIPT); } catch { alertCompiles = false; }
check(alertCompiles, "سكربت التنبيه سليم");
const server = fs.readFileSync("server.ts", "utf8");
check(/app\.get\("\/r\/:token\/proposal\/:pid"/.test(server), "المسار /r/:token/proposal/:pid مسجَّل");
check(server.indexOf('app.get("/r/:token/proposal/:pid"') > server.indexOf('app.get("/r/:token", async'), "المسار الجديد بعد مسار صفحة الطلب");
check((server.match(/\$\{PROPOSAL_ALERT_SCRIPT\}/g) || []).length === 2, "التنبيه محقونٌ في صفحة الطلب وبطاقة الأستاذ");
check((server.match(/\$\{PROPOSAL_ALERT_CSS\}/g) || []).length === 2, "أنماط التنبيه في الصفحتين");
check(/id="proposalAlerts"/.test(server), "حاوية التنبيه في بطاقة الأستاذ");

console.log(`\nStudy proposal page audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
