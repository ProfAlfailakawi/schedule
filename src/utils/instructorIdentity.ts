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

/* ── اسمٌ للعرض، لا ضجيجٌ مقروء ────────────────────────────────────────────
 * خانة الأستاذ في المسح قد تُقرأ ومعها ضجيج الحدود والأعمدة المجاورة:
 * «وفى»ف0[ف[]»أ88 در محمد…» و«حمد ail سعود المحيلبي ١». الاسم لا يحمل
 * أرقاماً ولا حروفاً لاتينية ولا أقواساً، فالكلمة التي فيها شيءٌ من ذلك ضجيجٌ
 * تسقط كلها؛ لا يُستخرج منها حرف، لأن ما يبقى من حروفها لا يصنع كلمة.
 * وتسقط قبل الاسم الألقابُ والشظايا القصيرة («د.»، «در»). ما يبقى يُعرض
 * للمراجع دليلاً يختار به من القائمة لا هويةً، ويُقال معه إن المسح شوّهه
 * (garbled) — فلا يُوصف شخصٌ بأنه «غير مسجّل» لأن اسمه قُرئ مشوّهاً. */
const ARABIC_NAME_WORD = /^[\u0621-\u063A\u0641-\u064A\u0670-\u06D3\u0640\u064B-\u0652]+\.?$/;
const NAME_TITLE = /^(?:ا\.?د|أ\.?د|د|أ|ا|م|دكتور|الدكتور|دكتورة|الدكتورة|أستاذ|الأستاذ|استاذ|الاستاذ)\.?$/;
const nameLetters = (word: string) => word.replace(/[.\u0640\u064B-\u0652]/g, "");
export function readableInstructorName(raw: unknown): { text: string; garbled: boolean } {
  const source = stripPresentation(String(raw || "")).replace(/\./g, ". ").replace(/\s+/g, " ").trim();
  if (!source) return { text: "", garbled: false };
  let garbled = false;
  const words = source.split(" ").filter(word => {
    if (ARABIC_NAME_WORD.test(word)) return true;
    garbled = true;
    return false;
  });
  while (words.length && (NAME_TITLE.test(words[0]) || nameLetters(words[0]).length <= 2)) words.shift();
  while (words.length && nameLetters(words[words.length - 1]).length <= 1) { words.pop(); garbled = true; }
  return { text: words.map(word => word.replace(/\.$/, "")).join(" "), garbled };
}

/** The scanned instructor text as any screen may show it: clean words only
 *  when the scan garbled it, otherwise exactly as printed. One rule for the
 *  preview, the import report and the server's sentences. */
export const displayInstructorText = (raw: unknown): string => {
  const readable = readableInstructorName(raw);
  return readable.garbled ? readable.text : String(raw || "").trim();
};

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
/** الاسم بترتيبٍ موحّد: بعض السجلات القديمة تُدخل العائلة أولاً
 *  («الأنصاري عبدالله رجب»)، والشخص هو الشخص. مجموعة الرموز الكاملة نفسها
 *  بأي ترتيب = هوية واحدة — للمساواة الكاملة فقط، كسابقتها. */
export const instructorSortedKey = (value: string) => {
  /* الاسم مدوّراً: العائلة من أوله إلى آخره. التدوير وحده هو «السجل القديم
     الذي يُدخل العائلة أولاً»؛ الترتيب الأبجدي الكامل كان يساوي بين «عبدالله
     محمد حسن» و«محمد حسن عبدالله» — شخصان مختلفان. */
  const tokens = instructorIdentityTokens(value);
  return tokens.length >= 3 ? [...tokens.slice(1), tokens[0]].join(" ") : tokens.join(" ");
};

/**
 * قانون «هذا الاسم هو ذاك الاسم» المشترك.
 * ١) تساوي الرموز؛ ٢) تساويها بلا مسافات؛ ٣) تدوير العائلة إلى أول الاسم في
 * أحد الطرفين (ثلاثة أسماء فأكثر)؛ ٤) اسم السجل صدرُ المطبوع كاملاً — اسم
 * أخير زائد في المطبوع — باسمين على الأقل. لا احتواء في الوسط ولا
 * في الآخر: «درويش مطر الشمري» داخل «حسين درويش مطر الشمري» هو الأب.
 */
export function sameInstructorIdentity(registryTokens: string[], printedTokens: string[]): boolean {
  if (!registryTokens.length || !printedTokens.length) return false;
  const key = registryTokens.join(" "), printed = printedTokens.join(" ");
  if (key === printed || registryTokens.join("") === printedTokens.join("")) return true;
  const rotate = (tokens: string[]) => [...tokens.slice(1), tokens[0]].join(" ");
  if (registryTokens.length >= 3 && printedTokens.length === registryTokens.length
    && (rotate(registryTokens) === printed || rotate(printedTokens) === key)) return true;
  if (registryTokens.length >= 2 && registryTokens.length < printedTokens.length
    && registryTokens.every((token, index) => printedTokens[index] === token)) return true;
  /* الاسم المختصر في السجل: الأول والعائلة وما بينهما بترتيبه داخل المطبوع. */
  if (registryTokens.length >= 2 && registryTokens.length < printedTokens.length
    && registryTokens[0] === printedTokens[0] && registryTokens[registryTokens.length - 1] === printedTokens[printedTokens.length - 1]) {
    let at = 1;
    for (const token of registryTokens.slice(1, -1)) {
      while (at < printedTokens.length - 1 && printedTokens[at] !== token) at++;
      if (at >= printedTokens.length - 1) return false;
      at++;
    }
    return true;
  }
  return false;
}

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
  const printed = instructorIdentityTokens(raw);
  if (!printed.length) return undefined;
  const hits = people.filter(person => sameInstructorIdentity(instructorIdentityTokens(String(person?.AdInstructorName || "")), printed));
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
/**
 * من في السجل يشبه هذا الاسم؟ — الجواب بالأسماء لا بالحكم وحده.
 *
 * «غير محسوم» بلا تفصيل تركت المنسّق يحدّق في خانة لا تقول لماذا: هل الشخص
 * مسجّل مرتين فيرفض النظام الاختيار بين «شخصين»؟ أم غائب أصلاً والوسم جاء من
 * مشاركة عابرة مع أسماء آخرين؟ العلاجان مختلفان تماماً — حذف مكرر مقابل
 * تسجيل — فتُسمّى المرشحون تسميةً، مع درجة القرب: مطابقة تامة (سجلات مكررة
 * لأشخاص مختلفين بنفس الاسم المطويّ) أو مشاركة جزئية.
 */
export function registryCandidatesFor<T extends { AdInstructorId: number | string; AdInstructorName: string }>(
  raw: string,
  instructors: T[],
  limit = 4,
): { exact: T[]; partial: T[] } {
  const printed = instructorIdentityTokens(raw);
  const empty = { exact: [] as T[], partial: [] as T[] };
  if (!printed.length) return empty;
  const printedSet = new Set(printed);
  const printedKey = printed.join(" ");
  const printedSpaceless = printed.join("");
  const haystack = ` ${printedKey} `;
  const needed = printed.length >= 2 ? 2 : 1;
  const exact: T[] = []; const partial: T[] = [];
  const seen = new Set<number>();
  for (const person of instructors) {
    const id = Number(person?.AdInstructorId);
    if (!id || seen.has(id)) continue;
    const tokens = instructorIdentityTokens(String(person?.AdInstructorName || ""));
    if (!tokens.length) continue;
    const key = tokens.join(" ");
    const isExact = sameInstructorIdentity(tokens, printed);
    const shared = tokens.filter(token => printedSet.has(token)).length;
    if (isExact) { seen.add(id); exact.push(person); }
    else if (shared >= needed) { seen.add(id); partial.push(person); }
    if (exact.length >= limit && partial.length >= limit) break;
  }
  return { exact: exact.slice(0, limit), partial: partial.slice(0, limit) };
}

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

/* ── معرّفات «هيئة تدريسية» في السجل — قاعدة واحدة ─────────────────────────
   سجلٌّ اسمه هذا ليس شخصاً بل معنى تتشاركه الجامعة: تُكتب حين لا يكون للشعبة
   اسم مدرّس ثابت. فلا يُقاس عليه الحجز المزدوج، وإلا صار كل قسمين استعملاه في
   ساعة واحدة «تعارضاً» لا يملك أحد إصلاحه. وكلمة «هيئة» لا يُسمّى بها الناس،
   فصدرُ الاسم وحده يعرّف السجل مهما كتبت بقيته.
   كانت هذه القراءة مكتوبة في الخادم وفي شاشة النقل كلٌّ على حدة؛ صارت هنا
   ويستوردها الجميع (`scheduleBlockers` يعيد تصديرها). */
export function placeholderInstructorIds(
  instructors: Iterable<{ AdInstructorId?: unknown; AdInstructorName?: unknown } | null | undefined> | null | undefined,
): Set<number> {
  const head = instructorIdentityTokens("هيئة")[0];
  const ids = new Set<number>();
  for (const person of instructors || []) {
    const id = Number(person?.AdInstructorId || 0);
    if (id > 0 && instructorIdentityTokens(String(person?.AdInstructorName || ""))[0] === head) ids.add(id);
  }
  return ids;
}
