/**
 * ── تدقيق تصلُّب المُدخلات ───────────────────────────────────────────────────
 *
 * أربعةُ مواضع كشفها فاحصُ CodeQL، وكلُّها سابقةٌ لدورة الاعتماد. ليس فيها ثغرةُ
 * اختراق، لكنّ اثنين منها كانا يُوقفان الخادم فعلاً — قِيسا هنا لا قُدِّرا.
 *
 * وما يحرسه هذا الملفّ ليس «أن الكود صحيحٌ اليوم»، بل أن عودةً إلى ما كان لا
 * تمرّ صامتة. ولذلك يقيس التعبيرين بالساعة لا بالنظر: تعبيرٌ يتراجع تراجعاً
 * تربيعياً يبدو في القراءة كأيّ تعبيرٍ آخر، ولا يُظهره إلا أن يُشغَّل.
 *
 * أربع طبقات:
 *   ١) التعبير النمطي للنقل: لا تراجعَ تربيعيّ، وسلوكُه لم يتغيّر.
 *   ٢) تعبير حدّ الفراغ: لا تراجع، ويقرأ العدد كما كان — ومنه «١٠٠».
 *   ٣) استبدالُ الشرطة الرأسية: كلُّها لا أوّلُها.
 *   ٤) سجلُّ الخطأ: عنوانُ الطلب حُجّةٌ لا نصُّ تنسيق.
 */

import fs from "fs";
import path from "path";
import { format } from "util";
import { parseNaturalQuery } from "../src/utils/naturalQuery";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

/** يقيس زمن مطابقةٍ واحدة. والحدُّ سخيٌّ عمداً: الفرق بين السليم والمعطوب هنا
 *  ثلاثةُ أصفار، لا نسبةٌ مئوية، فلا يُخفق التدقيق على آلةٍ بطيئة. */
function millis(task: () => void): number {
  const started = Date.now();
  task();
  return Date.now() - started;
}

const BUDGET_MS = 300;

/* ── ١) التعبير النمطي للنقل ────────────────────────────────────────────── */

const spacesThenNothing = `انقل${" ".repeat(40_000)}x`;
check(millis(() => parseNaturalQuery(spacesThenNothing)) < BUDGET_MS,
  "أربعون ألف فراغٍ بعد «انقل» لا تُعلّق قارئ الطلب");

const spacesThenNumber = `انقل${" ".repeat(20_000)}101 الى الاحد الساعة ٩`;
check(millis(() => parseNaturalQuery(spacesThenNumber)) < BUDGET_MS,
  "عشرون ألف فراغٍ ثم رقمٌ صحيح: يُقرأ بلا تعليق");

// وسلوكُه لم يتغيّر: الفراغُ قبل الاسم صار داخل المجموعة الاختيارية، وهو تغييرٌ
// في الصياغة لا في ما تقبله.
const VERBS = ["انقل", "نقل", "حرّك", "حرك", "رحّل", "رحل"];
const NOUNS = ["", "مقرر", "المادة", "الماده", "مادة", "ماده", "شعبة", "شعبه"];
const GAPS = ["", " ", "  ", "\t"];
let shapes = 0, read = 0;
for (const verb of VERBS) for (const gapOne of GAPS) for (const noun of NOUNS) for (const gapTwo of GAPS) {
  shapes++;
  if (parseNaturalQuery(`${verb}${gapOne}${noun}${gapTwo}0450 الى الاحد الساعة ٩`).intent === "move") read++;
}
check(shapes === read, `كلُّ صياغات أمر النقل تُقرأ: ${read} من ${shapes}`);

check(parseNaturalQuery("انقل 0450 الى الاحد الساعة ٩").intent === "move", "«انقل ٠٤٥٠» بلا اسمٍ بينهما");
check(parseNaturalQuery("انقلمقرر0450 الى الاحد الساعة ٩").intent === "move", "«انقلمقرر٠٤٥٠» بلا فراغٍ إطلاقاً");

/* ── ٢) تعبير حدّ الفراغ ────────────────────────────────────────────────── */

const serverSource = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const gapThreshold = serverSource.match(/normalized\.match\((\/[^;]*?\/)\)\?\.\[1\]\|\|3/);
check(Boolean(gapThreshold), "تعبير حدّ الفراغ موجودٌ في موضعه");

if (gapThreshold) {
  // يُبنى من نصّ الخادم نفسه، فلا يفترق ما يُقاس عمّا يعمل.
  const body = gapThreshold[1].slice(1, -1);
  const pattern = new RegExp(body);

  check(millis(() => pattern.test(`اعطني ${"9".repeat(60_000)}x`)) < BUDGET_MS,
    "ستون ألف رقمٍ بلا كلمة «ساعة» لا تُعلّق التحليل");

  const reads = (text: string) => text.match(pattern)?.[1] ?? null;
  check(reads("3 ساعات") === "3", "«٣ ساعات» تُقرأ ٣");
  check(reads("10 ساعات") === "10", "«١٠ ساعات» تُقرأ ١٠");
  check(reads("100 ساعات") === "100", "«١٠٠ ساعات» تُقرأ ١٠٠ لا ٠٠ — النظرةُ الخلفية تمنع البدء من الرقم الثاني");
  // العدد غير محدود الطول: تحديدُه بثلاث خاناتٍ كان يُسقط «١٠٠٠ ساعات» إلى الحدّ
  // الافتراضي بصمت — وهي زلّةٌ أدخلتُها ثم كشفتها مراجعةٌ آلية.
  check(reads("1000 ساعات") === "1000", "«١٠٠٠ ساعات» تُقرأ ١٠٠٠ كاملةً، لا تسقط إلى ٣");
  check(reads("5ساعات") === "5", "«٥ساعات» بلا فراغ");
  check(reads("اكثر من 4  ساعات") === "4", "فراغان بين العدد والكلمة");
  check(reads("لا رقم هنا ساعات") === null, "بلا عددٍ: يسقط إلى الحدّ الافتراضي");
  check(!/\(\\d\+\)\\s\*ساع/.test(serverSource), "لا رجوعَ إلى `(\\d+)\\s*ساع` غير المحروس بنظرةٍ خلفية");
  check(/\(\?<!\\d\)\(\\d\+\)/.test(serverSource), "الحراسةُ بنظرةٍ خلفيةٍ قبل عددٍ غير محدود الطول: تصلُّبٌ بلا فقدِ مدى");
}

/* ── ٣) استبدال الشرطة الرأسية ──────────────────────────────────────────── */

check(serverSource.includes('replaceAll("|","/")'), "اسمُ القاعة يُنظَّف بكلّ شرطةٍ رأسية فيه");
check(!serverSource.includes('replace("|","/")'), "لا بقيّةَ من الاستبدال الذي يقف عند أوّل شرطة");

// مفتاحُ القاعة يجمع بشرطةٍ رأسية، وقاعةٌ في مبنًى مركّب تحمل اثنتين.
const readable = (room: string) => String(room || "").replaceAll("|", "/");
check(readable("A|101") === "A/101", "شرطةٌ واحدة");
check(readable("A|101|2") === "A/101/2", "شرطتان تُستبدلان كلتاهما");
check(readable("") === "", "قيمةٌ فارغة تبقى فارغة");

/* ── ٤) سجلّ الخطأ ──────────────────────────────────────────────────────── */

check(serverSource.includes('console.error("[api-error] %s %s:", req.method, req.originalUrl,'),
  "عنوانُ الطلب حُجّةٌ بعد نصّ التنسيق، لا جزءٌ منه");
check(!serverSource.includes("console.error(`[api-error] ${req.method} ${req.originalUrl}"),
  "لا بقيّةَ من العنوان المدموج في نصّ التنسيق");

// والبرهان على أن الفرق ليس تجميلياً، بـ`util.format` نفسِه الذي يستعمله
// ‎console.error‎ لا بمحاكاةٍ له. والعنوانُ هنا عنوانٌ يستطيع كتابتَه أيُّ زائر.
const HOSTILE_URL = "/api/x?q=%s";
const ERROR_TEXT = "TypeError: cannot read AdSectionId of undefined";

const merged = format(`[api-error] GET ${HOSTILE_URL}:`, ERROR_TEXT);
check(!merged.includes(HOSTILE_URL),
  "العنوانُ المدموج: `%s` فيه يُستهلك، فلا يُقرأ العنوانُ الذي طُلب فعلاً");
check(!merged.endsWith(ERROR_TEXT),
  "والخطأُ يُبتلع في موضع العنوان بدل أن يُطبع بعده — ويضيع سببُ العطل");

const separated = format("[api-error] %s %s:", "GET", HOSTILE_URL, ERROR_TEXT);
check(separated.includes(HOSTILE_URL),
  "وبعد الفصل: العنوانُ يُطبع حرفاً بحرف كما كتبه صاحبُه");
check(separated.endsWith(ERROR_TEXT),
  "والخطأُ يبقى في آخر السطر مهما حمل العنوان");

console.log(`\n${passed} نجحت · ${failed} أخفقت`);
if (failed > 0) process.exit(1);
