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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
