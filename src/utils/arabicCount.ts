/**
 * ── العدد والمعدود ──────────────────────────────────────────────────────────
 *
 * Arabic counts in five ways, and software almost always writes one of them.
 * The result is the specific ugliness every Arabic-speaking user recognises
 * instantly as a machine talking:
 *
 *     ١ مواعيد   ·   ٢ موعد   ·   ٥ موعداً   ·   ١١ مواعيد
 *
 * All four are wrong, and all four appeared in this program. The rules:
 *
 *   ٠      لا مواعيد            — negation, not a number
 *   ١      موعد واحد            — the noun leads, the number follows
 *   ٢      موعدان               — a dual form; the numeral is not written at all
 *   ٣–١٠   ٣ مواعيد             — a broken plural
 *   ١١–٩٩  ١١ موعداً            — singular, accusative (تمييز منصوب)
 *   ١٠٠+   ١٠٠ موعد             — singular, genitive
 *   ٧٫٥    ٧٫٥ ساعة             — a fraction takes the singular too
 *
 * Compounds follow their last part: ١٠٣ مواعيد, ١١١ موعداً, ٢٠٠ موعد.
 *
 * A noun therefore cannot be a string. It is four forms, declared once, and
 * every count in the program goes through here.
 */

export interface ArabicNoun {
  /** موعد — used for one, and for hundreds. */
  one: string;
  /** موعدان — the dual, written without a numeral. */
  two: string;
  /** مواعيد — the broken plural, for three to ten. */
  few: string;
  /** موعداً — singular accusative, for eleven to ninety-nine. */
  many: string;
}

/**
 * The counted phrase, whole.
 *
 * واحد or واحدة — the adjective agrees with the noun it follows. Half this
 * dictionary is feminine (محاضرة، قاعة، دقيقة، حركة …) and every one of them
 * was reading «محاضرة واحد». The ة is the marker, and it is the only one
 * needed here: no noun in this program is feminine without it.
 *
 * Numerals are Latin inside Arabic text, matching this program's convention.
 *
 * @param zero  what to say for none. Defaults to «لا …», which reads better
 *              than «٠ …» in every place this program counts something.
 *
 * SELF-CONTAINED ON PURPOSE: no helper, no closure, no nested function. The
 * server-rendered public pages do not load the client bundle, so they receive
 * this very function as source text (ARABIC_COUNT_SCRIPT below). Anything this
 * body referenced from outside would be undefined in the browser.
 */
export function countOf(value: number, noun: ArabicNoun, zero?: string): string {
  // A fraction («7.5 ساعة») is read with the singular, like a hundred.
  const tenths = Math.max(0, Math.round((Number(value) || 0) * 10)) / 10;
  if (tenths % 1) return tenths.toLocaleString("ar-KW-u-nu-latn") + " " + noun.one;
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n === 0) return zero ?? "لا " + noun.few;
  if (n === 1) return noun.one + " " + (noun.one.slice(-1) === "ة" ? "واحدة" : "واحد");
  if (n === 2) return noun.two;
  const shown = n.toLocaleString("ar-KW-u-nu-latn");
  const rest = n % 100;
  // A compound takes the form its last part demands, so ١٠٣ is «مواعيد» while
  // ١١١ is «موعداً» and ٢٠٠ is «موعد».
  if (rest === 0 || rest === 1 || rest === 2) return shown + " " + noun.one;
  if (rest >= 3 && rest <= 10) return shown + " " + noun.few;
  return shown + " " + noun.many;
}

/**
 * Just the noun in its correct form, when the number is displayed separately.
 * Also agrees any four-form word with a count — a verb or an adjective that
 * follows the counted noun (see the agreement forms at the end of AR).
 * Self-contained for the same reason as countOf.
 */
export function nounFor(value: number, noun: ArabicNoun): string {
  if ((Math.max(0, Math.round((Number(value) || 0) * 10)) / 10) % 1) return noun.one;
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n === 0) return noun.few;
  if (n === 1) return noun.one;
  if (n === 2) return noun.two;
  const rest = n % 100;
  if (rest === 0 || rest === 1 || rest === 2) return noun.one;
  if (rest >= 3 && rest <= 10) return noun.few;
  return noun.many;
}

/**
 * The same noun after a preposition or as an object: only the dual changes
 * case — «منذ يومين»، «على ملاحظتين»، «من جدولين» — every other form is the
 * same word. The one-to-many forms are untouched, so this is still countOf's
 * rule, applied to the oblique dual.
 */
export function oblique(noun: ArabicNoun): ArabicNoun {
  return { ...noun, two: noun.two.replace(/ان$/, "ين").replace(/ا (?=\S)/, "ي ") };
}

/* ── The nouns this program counts ────────────────────────────────────────
 *
 * Declared in one place so a word is spelt and inflected identically wherever
 * it appears. Feminine nouns take ة in the accusative form; the tanween mark
 * is left off, as it is in ordinary modern writing.
 */
export const AR = {
  appointment: { one: "موعد", two: "موعدان", few: "مواعيد", many: "موعداً" },
  lecture:     { one: "محاضرة", two: "محاضرتان", few: "محاضرات", many: "محاضرة" },
  course:      { one: "مقرر", two: "مقرران", few: "مقررات", many: "مقرراً" },
  instructor:  { one: "أستاذ", two: "أستاذان", few: "أساتذة", many: "أستاذاً" },
  colleague:   { one: "زميل", two: "زميلان", few: "زملاء", many: "زميلاً" },
  room:        { one: "قاعة", two: "قاعتان", few: "قاعات", many: "قاعة" },
  building:    { one: "مبنى", two: "مبنيان", few: "مبانٍ", many: "مبنى" },
  term:        { one: "فصل", two: "فصلان", few: "فصول", many: "فصلاً" },
  day:         { one: "يوم", two: "يومان", few: "أيام", many: "يوماً" },
  week:        { one: "أسبوع", two: "أسبوعان", few: "أسابيع", many: "أسبوعاً" },
  minute:      { one: "دقيقة", two: "دقيقتان", few: "دقائق", many: "دقيقة" },
  hour:        { one: "ساعة", two: "ساعتان", few: "ساعات", many: "ساعة" },
  section:     { one: "شعبة", two: "شعبتان", few: "شعب", many: "شعبة" },
  page:        { one: "صفحة", two: "صفحتان", few: "صفحات", many: "صفحة" },
  cell:        { one: "خلية", two: "خليتان", few: "خلايا", many: "خلية" },
  note:        { one: "ملاحظة", two: "ملاحظتان", few: "ملاحظات", many: "ملاحظة" },
  request:     { one: "طلب", two: "طلبان", few: "طلبات", many: "طلباً" },
  message:     { one: "رسالة", two: "رسالتان", few: "رسائل", many: "رسالة" },
  clash:       { one: "تداخل", two: "تداخلان", few: "تداخلات", many: "تداخلاً" },
  conflict:    { one: "تعارض", two: "تعارضان", few: "تعارضات", many: "تعارضاً" },
  blocker:     { one: "مانع", two: "مانعان", few: "موانع", many: "مانعاً" },
  /* مضافٌ إلى «اعتماد»: المثنّى تسقط نونه، والتمييز لا تنوين له. */
  approvalBlocker: { one: "مانع اعتماد", two: "مانعا اعتماد", few: "موانع اعتماد", many: "مانع اعتماد" },
  saveBlocker: { one: "مانع حفظ", two: "مانعا حفظ", few: "موانع حفظ", many: "مانع حفظ" },
  breach:      { one: "مخالفة", two: "مخالفتان", few: "مخالفات", many: "مخالفة" },
  decision:    { one: "قرار", two: "قراران", few: "قرارات", many: "قراراً" },
  record:      { one: "سجل", two: "سجلان", few: "سجلات", many: "سجلاً" },
  unit:        { one: "وحدة", two: "وحدتان", few: "وحدات", many: "وحدة" },
  move:        { one: "حركة", two: "حركتان", few: "حركات", many: "حركة" },
  change:      { one: "تغيير", two: "تغييران", few: "تغييرات", many: "تغييراً" },
  point:       { one: "نقطة", two: "نقطتان", few: "نقاط", many: "نقطة" },
  layer:       { one: "طبقة", two: "طبقتان", few: "طبقات", many: "طبقة" },
  meeting:     { one: "لقاء", two: "لقاءان", few: "لقاءات", many: "لقاءً" },
  filter:      { one: "مرشّح", two: "مرشّحان", few: "مرشّحات", many: "مرشّحاً" },
  matter:      { one: "أمر", two: "أمران", few: "أمور", many: "أمراً" },
  student:     { one: "طالب", two: "طالبان", few: "طلاب", many: "طالباً" },
  pair:        { one: "زوج", two: "زوجان", few: "أزواج", many: "زوجاً" },
  account:     { one: "حساب", two: "حسابان", few: "حسابات", many: "حساباً" },
  visit:       { one: "مرة", two: "مرتان", few: "مرات", many: "مرة" },
  link:        { one: "علاقة", two: "علاقتان", few: "علاقات", many: "علاقة" },
  row:         { one: "صف", two: "صفان", few: "صفوف", many: "صفاً" },
  department:  { one: "قسم", two: "قسمان", few: "أقسام", many: "قسماً" },
  schedule:    { one: "جدول", two: "جدولان", few: "جداول", many: "جدولاً" },
  position:    { one: "موضع", two: "موضعان", few: "مواضع", many: "موضعاً" },
  gap:         { one: "فراغ", two: "فراغان", few: "فراغات", many: "فراغاً" },
  edit:        { one: "تعديل", two: "تعديلان", few: "تعديلات", many: "تعديلاً" },
  item:        { one: "بند", two: "بندان", few: "بنود", many: "بنداً" },
  slot:        { one: "خانة", two: "خانتان", few: "خانات", many: "خانة" },
  bond:        { one: "ارتباط", two: "ارتباطان", few: "ارتباطات", many: "ارتباطاً" },
  booking:     { one: "حجز", two: "حجزان", few: "حجوزات", many: "حجزاً" },
  line:        { one: "سطر", two: "سطران", few: "أسطر", many: "سطراً" },
  offering:    { one: "طرح", two: "طرحان", few: "طروح", many: "طرحاً" },

  /* ── Agreement forms, read with nounFor(n, …) after a counted noun ──────
   * A verb or adjective that follows a counted non-human noun is singular for
   * one, dual for two, and feminine singular for the plural: «موعد لم يتغيّر»،
   * «موعدان لم يتغيّرا»، «٤ مواعيد لم تتغيّر». Not nouns, but the same four
   * slots, so they live in the same table and go through the same rule. */
  unchangedVerb: { one: "لم يتغيّر", two: "لم يتغيّرا", few: "لم تتغيّر", many: "لم تتغيّر" },
  affectedAdj:   { one: "متأثر", two: "متأثران", few: "متأثرة", many: "متأثراً" },
  otherAdj:      { one: "آخر", two: "آخران", few: "أخرى", many: "آخر" },
  readyAdj:      { one: "جاهز", two: "جاهزان", few: "جاهزة", many: "جاهزة" },
  needsVerb:     { one: "يحتاج معالجة", two: "يحتاجان معالجة", few: "تحتاج معالجة", many: "تحتاج معالجة" },
  inItPron:      { one: "فيه", two: "فيهما", few: "فيها", many: "فيها" },
  waitVerb:      { one: "ينتظر", two: "ينتظران", few: "تنتظر", many: "تنتظر" },
  waitFemVerb:   { one: "تنتظر", two: "تنتظران", few: "تنتظر", many: "تنتظر" },
  addedFemVerb:  { one: "أُضيفت", two: "أُضيفتا", few: "أُضيفت", many: "أُضيفت" },
  hasPron:       { one: "لديه", two: "لديهما", few: "لديهم", many: "لديهم" },
  lateAdj:       { one: "متأخر", two: "متأخران", few: "متأخرة", many: "متأخراً" },
  possibleAdj:   { one: "محتمل", two: "محتملان", few: "محتملة", many: "محتملاً" },
  otherFemAdj:   { one: "أخرى", two: "أخريان", few: "أخرى", many: "أخرى" },
} as const satisfies Record<string, ArabicNoun>;

/**
 * The same rule, as browser source, for the server-rendered public pages that
 * do not load the client bundle. It is not a second copy: it is the text of
 * countOf and nounFor above plus the dictionary, so a correction here reaches
 * every page. Inject once per page script: `${ARABIC_COUNT_SCRIPT}` defines
 * `countOf`, `nounFor` and `AR` with the same signatures.
 */
export const ARABIC_COUNT_SCRIPT =
  `var countOf=(${countOf.toString()});var nounFor=(${nounFor.toString()});var AR=${JSON.stringify(AR)};`;
