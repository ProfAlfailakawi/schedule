/**
 * هوية اسم الأستاذ — قانون واحد للطرفين، يطوي كل ما يختلف به الاسم العربي.
 *
 * «إقبال» في السجل و«اقبال» في الورقة شخص واحد. وكذلك «عبد العزيز»/«عبدالعزيز»،
 * و«البصيلي»/«البصيلى»، و«يحيى»/«يحي»، و«مؤمن»/«مومن»، و«فائزة»/«فايزه»،
 * و«آلاء»/«ألاء»/«الاء» — وحتى المسافات نفسها: كلمة انشطرت تحت القلم الضوئي
 * أو التصقت تحت الأصابع لا تصنع شخصاً جديداً.
 *
 * المطابقة على الخادم، والحسم داخل المعاينة، وبحث القوائم: كانت كلٌّ تعيد
 * كتابة تطبيعها الناقص في موضعها، فيقرأ طرفٌ اسماً لا يراه الآخر — ويقف
 * المنسّق أمام «غير محسوم» لشخص يراه أمامه في القائمة. القانون هنا وحده،
 * ويستورده الجميع.
 */

const stripPresentation = (value: string) => String(value || "")
  /* Authority PDFs store Arabic as Presentation Forms («ﺟﺪﻭﻝ»); NFKC turns
     them back into ordinary letters before any comparison. */
  .normalize("NFKC")
  /* Bidi-control glyphs are layout instructions, not text. */
  .replace(/[‎‏‪-‮⁦-⁩‌‍﻿]/g, "");

/** حروف الاسم وحدها، مطويّةً على كل ما يتقلب به الرسم:
 *  همزات الألف على صورة واحدة، ى=ي، ة=ه، ؤ=و، ئ=ي، والهمزة المفردة تسقط
 *  (تسقط من الورقة أصلاً: «آلاء» تُطبع «الا»)، والحروف الفارسية التي تتسرب
 *  من لوحات المفاتيح (ی، ک، ھ) على رسمها العربي. */
export const foldInstructorText = (value: string) => stripPresentation(value)
  .replace(/[ً-ْـ]/g, "")
  .replace(/[أإآٱٲٳ]/g, "ا")
  .replace(/[ىی]/g, "ي")
  .replace(/ؤ/g, "و")
  .replace(/ئ/g, "ي")
  .replace(/ء/g, "")
  .replace(/[ةۃ]/g, "ه")
  .replace(/ک/g, "ك")
  .replace(/ھ/g, "ه")
  .replace(/[^ء-يa-zA-Z0-9 ]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

/** الألقاب عرضٌ لا هوية: «أ.د.» و«د.» و«الدكتور» و«Dr» تُكتب ولا تُقارن. */
export const instructorCleanName = (value: string) => foldInstructorText(value)
  .replace(/^(?:(?:ا\s*د|دكتور|الدكتور|دكتوره|الدكتوره|استاذ|الاستاذ|بروفيسور|د|ا|م|prof|dr|mr|ms)\s+)+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** «عبد الله» و«عبدالله» اسم واحد، و«ال أنصاري» المشطورة هي «الأنصاري»،
 *  و«يحيى» بعد طيّ الألف المقصورة هي «يحي». يُبنى الاسم رموزَ هويةٍ تُدمج
 *  فيها هذه الشظايا قبل أي مقارنة. */
export function instructorIdentityTokens(value: string) {
  const source = instructorCleanName(value).split(/\s+/).filter(token => /[ء-ي]/.test(token) && token.length >= 2);
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    let token = source[i];
    /* «عبد» و«ال» و«ابو» و«بو» شظايا تلتصق بما بعدها: انشطارها مسافةً لا
       يغيّر الاسم — «عبد الاله» و«بو حمد» و«ابو العلا» كأزواجها الملتصقة. */
    while ((token === "عبد" || token === "ال" || token === "ابو" || token === "بو") && i + 1 < source.length && source[i + 1].length >= 2) {
      token = `${token}${source[i + 1]}`;
      i++;
    }
    /* «يحيى» تصير «يحيي» بعد طيّ ى=ي؛ الياء المضعّفة في آخر الرمز واحدة. */
    out.push(token.replace(/يي+$/, "ي"));
  }
  return out;
}

/** الاسم بعد كل التطبيع، جاهزاً للمقارنة الحرفية أو كمفتاح تجميع. */
export const instructorIdentityKey = (value: string) => instructorIdentityTokens(value).join(" ");

/** الاسم بلا مسافات إطلاقاً: الحَكَم الأخير حين تسقط المسافات في غير مواضعها —
 *  «اقبالعبدالعزيز المطوع» و«اقبال عبدالعزيزالمطوع» سواء. للمساواة الكاملة
 *  فقط، لا للاحتواء: الاحتواء بلا حدود كلمات يبتلع الأسماء القصيرة. */
export const instructorSpacelessKey = (value: string) => instructorIdentityTokens(value).join("");

/**
 * مطابقة حرفية كاملة لا ثاني لها.
 *
 * تقبل ثلاثة طرق كلها حرفية:
 * ١) الاسمان متساويان رمزاً برمز؛
 * ٢) اسم السجل وارد كاملاً داخل المطبوع (اسم رابع مقصوص عند حافة الخانة)؛
 * ٣) الاسمان متساويان بعد إسقاط المسافات كلها.
 * وتُحسب الوحدانية بهوية الشخص لا بعدد السجلات، فسجلان مكرران لنفس الشخص
 * ليسا التباساً. أكثر من شخص واحد ⇦ لا اختيار، والخانة تبقى للمراجع.
 */
export function uniqueExactIdentityMatch<T extends { AdInstructorId: number | string; AdInstructorName: string }>(
  raw: string,
  people: T[],
): T | undefined {
  const printed = instructorIdentityKey(raw);
  if (!printed) return undefined;
  const printedSpaceless = printed.replace(/ /g, "");
  const haystack = ` ${printed} `;
  const hits = people.filter(person => {
    const key = instructorIdentityKey(String(person?.AdInstructorName || ""));
    if (!key) return false;
    return key === printed || haystack.includes(` ${key} `) || key.replace(/ /g, "") === printedSpaceless;
  });
  const ids = new Set(hits.map(person => Number(person.AdInstructorId)));
  return ids.size === 1 ? hits[0] : undefined;
}

/** هل لهذا الاسم المطبوع أصلٌ في سجل الأساتذة؟
 *
 * فشل المطابقة له معنيان مختلفان تماماً أمام المراجع:
 * إمّا أن السجل لا يعرف هذا الشخص بتاتاً — وحينها العلاج تسجيله، لا تصحيح
 * قراءة — وإمّا أن السجل يعرف أشخاصاً يشبهون الاسم ولم يحسم بينهم، وحينها
 * العلاج اختيار واحد منهم. الرسالة الواحدة «غير مرتبط» كانت تخفي الفرق،
 * فيقضي المراجع وقته يبحث عن خطأ قراءة لا وجود له.
 *
 * «مرشّح» هنا: من يشترك مع الاسم المطبوع في اسمين صريحين على الأقل — أو اسم
 * واحد إن كان المطبوع اسماً واحداً، لأنه كل ما طُبع — أو من يساويه كاملاً
 * بلا مسافات. */
export function instructorRegistryOutcome(
  raw: string,
  instructors: Array<{ AdInstructorId: number | string; AdInstructorName: string }>,
): "UNREGISTERED" | "AMBIGUOUS" {
  const printed = instructorIdentityTokens(raw);
  if (!printed.length) return "AMBIGUOUS";
  const printedSet = new Set(printed);
  const printedSpaceless = printed.join("");
  const needed = printed.length >= 2 ? 2 : 1;
  const candidate = (person: { AdInstructorName: string }) => {
    const tokens = instructorIdentityTokens(person?.AdInstructorName || "");
    if (!tokens.length) return false;
    if (tokens.join("") === printedSpaceless) return true;
    return tokens.filter(token => printedSet.has(token)).length >= needed;
  };
  return instructors.some(candidate) ? "AMBIGUOUS" : "UNREGISTERED";
}
