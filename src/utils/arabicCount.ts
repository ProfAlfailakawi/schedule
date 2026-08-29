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

/** Latin numerals inside Arabic text, matching this program's convention. */
const ar = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

/**
 * The counted phrase, whole.
 *
 * @param zero  what to say for none. Defaults to «لا …», which reads better
 *              than «٠ …» in every place this program counts something.
 */
/**
 * واحد or واحدة — the adjective agrees with the noun it follows.
 *
 * Half this dictionary is feminine (محاضرة، قاعة، دقيقة، حركة …) and every one
 * of them was reading «محاضرة واحد». The ة is the marker, and it is the only
 * one needed here: no noun in this program is feminine without it.
 */
const one = (noun: ArabicNoun) => (noun.one.endsWith("ة") ? "واحدة" : "واحد");

export function countOf(value: number, noun: ArabicNoun, zero?: string): string {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n === 0) return zero ?? `لا ${noun.few}`;
  if (n === 1) return `${noun.one} ${one(noun)}`;
  if (n === 2) return noun.two;

  const rest = n % 100;
  // A compound takes the form its last part demands, so ١٠٣ is «مواعيد» while
  // ١١١ is «موعداً» and ٢٠٠ is «موعد».
  if (rest === 0 || rest === 1 || rest === 2) return `${ar(n)} ${noun.one}`;
  if (rest >= 3 && rest <= 10) return `${ar(n)} ${noun.few}`;
  return `${ar(n)} ${noun.many}`;
}

/** Just the noun in its correct form, when the number is displayed separately. */
export function nounFor(value: number, noun: ArabicNoun): string {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n === 0) return noun.few;
  if (n === 1) return noun.one;
  if (n === 2) return noun.two;
  const rest = n % 100;
  if (rest === 0 || rest === 1 || rest === 2) return noun.one;
  if (rest >= 3 && rest <= 10) return noun.few;
  return noun.many;
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
  message:     { one: "رسالة", two: "رسالتان", few: "رسائل", many: "رسالة" },
  clash:       { one: "تداخل", two: "تداخلان", few: "تداخلات", many: "تداخلاً" },
  conflict:    { one: "تعارض", two: "تعارضان", few: "تعارضات", many: "تعارضاً" },
  blocker:     { one: "مانع", two: "مانعان", few: "موانع", many: "مانعاً" },
  breach:      { one: "مخالفة", two: "مخالفتان", few: "مخالفات", many: "مخالفة" },
  decision:    { one: "قرار", two: "قراران", few: "قرارات", many: "قراراً" },
  record:      { one: "سجل", two: "سجلان", few: "سجلات", many: "سجلاً" },
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
} as const satisfies Record<string, ArabicNoun>;
