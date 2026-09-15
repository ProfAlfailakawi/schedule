/**
 * هوية اسم الأستاذ — قانون واحد للطرفين.
 *
 * المطابقة على الخادم، والحسم داخل المعاينة، وشاشات الاختيار: كلها كانت تعيد
 * كتابة نفس التطبيع (الألقاب، همزات الألف، عبد+الاسم، أرقام العرض) كلٌّ في
 * موضعه. نسختان من قانون واحد تفترقان مع الوقت، فيقرأ الخادم اسماً لا يراه
 * المتصفح — ويقف المستخدم أمام خانة «غير محسوم» لشخص يراه أمامه في القائمة.
 * فالقانون هنا، ويستورده الجميع.
 */

const stripPresentation = (value: string) => String(value || "")
  /* Authority PDFs store Arabic as Presentation Forms («ﺟﺪﻭﻝ»); NFKC turns
     them back into ordinary letters before any comparison. */
  .normalize("NFKC")
  /* Bidi-control glyphs are layout instructions, not text. */
  .replace(/[‎‏‪-‮⁦-⁩]/g, "");

/** حروف الاسم وحدها: بلا تشكيل، همزات الألف على صورة واحدة، ى=ي، ة=ه. */
export const foldInstructorText = (value: string) => stripPresentation(value)
  .replace(/[ً-ْـ]/g, "")
  .replace(/[أإآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[^ء-يa-zA-Z0-9 ]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

/** الألقاب عرضٌ لا هوية: «أ.د.» و«د.» و«الدكتور» تُكتب ولا تُقارن. */
export const instructorCleanName = (value: string) => foldInstructorText(value)
  .replace(/^(?:(?:ا\s*د|دكتور|الدكتور|دكتوره|الدكتوره|استاذ|الاستاذ|بروفيسور|د|ا|م)\s+)+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/** «عبد الله» و«عبدالله» اسم واحد: يُدمجان رمزاً واحداً على الجانبين. */
export function instructorIdentityTokens(value: string) {
  const source = instructorCleanName(value).split(/\s+/).filter(token => /[ء-ي]/.test(token) && token.length >= 2);
  const out: string[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "عبد" && i + 1 < source.length && source[i + 1].length >= 2) { out.push(`عبد${source[i + 1]}`); i++; continue; }
    out.push(source[i]);
  }
  return out;
}

/** الاسم بعد كل التطبيع، جاهزاً للمقارنة الحرفية أو كمفتاح تجميع. */
export const instructorIdentityKey = (value: string) => instructorIdentityTokens(value).join(" ");

/**
 * مطابقة حرفية كاملة لا ثاني لها.
 *
 * تعادل قاعدة EXACT_FULL في محرك الاستيراد: اسم السجل يساوي المطبوع كاملاً،
 * أو يرد كاملاً داخله (اسم رابع مقصوص عند حافة الخانة لا يُسقط الهوية).
 * وتُحسب الوحدانية بهوية الشخص لا بعدد السجلات، فسجلان مكرران لنفس الشخص
 * ليسا التباساً. أكثر من شخص واحد ⇦ لا اختيار، والخانة تبقى للمراجع.
 */
export function uniqueExactIdentityMatch<T extends { AdInstructorId: number | string; AdInstructorName: string }>(
  raw: string,
  people: T[],
): T | undefined {
  const printed = instructorIdentityKey(raw);
  if (!printed) return undefined;
  const haystack = ` ${printed} `;
  const hits = people.filter(person => {
    const key = instructorIdentityKey(String(person?.AdInstructorName || ""));
    return Boolean(key) && (key === printed || haystack.includes(` ${key} `));
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
 * واحد إن كان المطبوع اسماً واحداً، لأنه كل ما طُبع. */
export function instructorRegistryOutcome(
  raw: string,
  instructors: Array<{ AdInstructorId: number | string; AdInstructorName: string }>,
): "UNREGISTERED" | "AMBIGUOUS" {
  const printed = instructorIdentityTokens(raw);
  if (!printed.length) return "AMBIGUOUS";
  const printedSet = new Set(printed);
  const shared = (person: { AdInstructorName: string }) => {
    const tokens = instructorIdentityTokens(person?.AdInstructorName || "");
    return tokens.filter(token => printedSet.has(token)).length;
  };
  const needed = printed.length >= 2 ? 2 : 1;
  return instructors.some(person => shared(person) >= needed) ? "AMBIGUOUS" : "UNREGISTERED";
}
