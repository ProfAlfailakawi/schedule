/**
 * ── سؤالٌ واحدٌ فوق الوارد ──────────────────────────────────────────────────
 *
 * الوارد كان يُفلتر بأربع شرائحَ وحقلِ بحثٍ بالاسم، وهذا يكفي حين تكون الأقسام
 * ستّة. حين تصير أربعين، فالسؤال الذي يُطرح فعلاً ليس «أي حالة؟» بل جملةٌ
 * مركّبة: «الأقسام المتأخرة اللي عندها موانع»، «ملاحظات مفتوحة في التربية»،
 * «شُعب تنتظر رئيس القسم». كلُّ واحدةٍ منها ثلاثُ نقراتٍ في الشرائح، أو سطرٌ
 * واحدٌ هنا.
 *
 * وهذا الملف هو السطر. يقرأ الجملة العربية ويُخرج منها ما يفهمه الوارد، ويترك
 * ما لم يفهمه نصّاً يُطابَق بالاسم — فجملةٌ نصفها مفهومٌ ونصفها اسمُ قسمٍ تعمل
 * كما يتوقّع كاتبها، لا تُرفض كلّها لأن نصفها لم يُعرف.
 *
 * **يقرأ ولا يقرّر.** لا شيء هنا يمسّ جدولاً ولا اعتماداً ولا ملاحظة؛ مُخرجُه
 * مرشّحُ عرضٍ ليس إلا، وأسوأ ما قد يفعله خطؤه أن يُظهر بطاقاتٍ أقلّ مما يريد
 * القارئ — ولهذا يُعرض ما فهمه سطراً تحت الحقل، ليُصحّحه من يقرأ بضغطة مسح.
 *
 * **ولا يخمّن حالةً من كلمةٍ عابرة.** «القسم» وحدها لا تعني «عند القسم»، لأن
 * الكلمة تقع في كل اسمٍ تقريباً. الحالات تُلتقط بعباراتٍ لا تلتبس، وما سواها
 * يبقى بحثاً بالاسم.
 */

import { toEnglishDigits } from "./naturalQuery";

/** حالات الاعتماد التي يفلتر بها الوارد. `all` تعني بلا فلتر. */
export type InboxAskStatus = "all" | "submitted" | "returned" | "accepted";

/** إشاراتٌ تُطلب بعينها: مانعٌ مادّي، ملاحظةٌ مفتوحة، ردٌّ ينتظر، شعبةٌ تنتظر إقراراً. */
export type InboxAskSignal = "blocking" | "openNotes" | "answered" | "pendingAdditions";

export interface InboxAsk {
  /** الحالة المطلوبة، أو `all` إن لم تُذكر. */
  status: InboxAskStatus;
  /** المتأخّرون عن الموعد وحدهم. */
  lateOnly: boolean;
  /** الإشارات المطلوبة، بلا تكرار وبترتيب ورودها. */
  signals: InboxAskSignal[];
  /** ما بقي من الجملة بعد نزع ما فُهم — يُطابَق باسم القسم أو الكلية. */
  text: string;
  /** جملةٌ عربيةٌ تصف ما فُهم، أو فارغةٌ إن لم يُفهم شيءٌ يستحقّ الذكر. */
  note: string;
  /** هل فُهم شيءٌ أصلاً؟ يميّز «لم أفهم» عن «لم يُطلب شيء». */
  understood: boolean;
}

/** الجملة الفارغة: بلا فلترٍ ولا ملاحظة. */
export const EMPTY_INBOX_ASK: InboxAsk = {
  status: "all", lateOnly: false, signals: [], text: "", note: "", understood: false,
};

/**
 * العبارات، وكلٌّ منها لا يلتبس بغيره.
 *
 * الترتيب مقصود: الأطولُ أولاً، فـ«بانتظار رئيس القسم» تُلتقط شعبةً منتظرةً قبل
 * أن تلتقطها «بانتظار» حالةً مُرسلة. ولو عُكس الترتيب لقُرئت الجملة خطأً وما
 * ظهر لقارئها سببُ ذلك.
 */
const STATUS_PHRASES: Array<[RegExp, InboxAskStatus]> = [
  [/بانتظار\s*(?:ال)?مراجعة|ينتظر\s*(?:ال)?مراجعة|قيد\s*(?:ال)?مراجعة|وصل(?:ت|ني)?\s*(?:لل)?تسجيل|مُرسل|مرسل(?:ة)?|مسلّم|مسلم(?:ة)?/g, "submitted"],
  [/عند\s*ال[أا]قسام|عند\s*القسم|مُعاد|معاد(?:ة)?|مُرتجع|مرتجع(?:ة)?|رُجّع|رجع(?:ت)?|رادّ|رادة/g, "returned"],
  [/مُعتمد|معتمد(?:ة)?|مُقرّ|اعتُمد|اعتمد(?:ت)?|مُوقّع|موقع(?:ة)?\s*بالكامل/g, "accepted"],
];

const LATE_PHRASES = /متأخّر|متأخر(?:ة|ين|ون)?|تأخّر|تأخر(?:ت)?|فات\s*(?:ال)?موعد|بعد\s*(?:ال)?موعد|تجاوز\s*(?:ال)?موعد/g;

const SIGNAL_PHRASES: Array<[RegExp, InboxAskSignal]> = [
  [/موانع|مانع|تعارض(?:ات)?|تصادم|متعارض(?:ة)?/g, "blocking"],
  [/ملاحظات?\s*مفتوحة|ملاحظة\s*مفتوحة|مفتوحة|ملاحظات|ملاحظة/g, "openNotes"],
  [/رد(?:ود)?\s*(?:ال)?قسم|ردّ(?:ود)?|ردود|مُجاب|أُجيب|أجاب(?:ت)?/g, "answered"],
  [/شُعب?\s*تنتظر|شعب\s*تنتظر|بانتظار\s*رئيس\s*(?:ال)?قسم|إقرار\s*(?:ال)?رئيس|إضافات\s*معلّقة|إضافات\s*معلقة/g, "pendingAdditions"],
];

/**
 * كلماتٌ لا تُسمّى بها كليةٌ ولا قسم.
 *
 * كلُّ واحدةٍ منها تُكتب في جملةٍ طبيعيةٍ ولا تعني شيئاً للوارد: «الأقسام
 * المتأخرة» تعني المتأخرة، لا قسماً اسمُه «الأقسام». ولو بقيت نصَّ بحثٍ لأقصت
 * كلَّ بطاقةٍ في الشاشة — وهذا أسوأُ ما قد يفعله مرشّح: أن يُفرغ الشاشة ويبدو
 * كأنه لا وارد.
 */
const STOP_WORDS = new Set([
  "في", "من", "على", "عن", "عند", "عندها", "عندهم", "لدى",
  "التي", "الذي", "اللي", "اللتي", "الذين",
  "و", "أو", "او", "ثم", "مع",
  "قسم", "أقسام", "الأقسام", "الاقسام", "كلية", "كليات", "الكليات",
  "فيه", "فيها", "فيهم", "بها", "به", "لها", "له",
  "كل", "جميع", "أي", "اي", "هل", "ما", "وش", "شنو",
  "جدول", "جداول", "الجدول", "الجداول",
]);

const STATUS_WORD: Record<Exclude<InboxAskStatus, "all">, string> = {
  submitted: "بانتظار المراجعة",
  returned: "عند القسم",
  accepted: "معتمد",
};

const SIGNAL_WORD: Record<InboxAskSignal, string> = {
  blocking: "فيه موانع",
  openNotes: "فيه ملاحظات مفتوحة",
  answered: "فيه ردود تنتظر قرارك",
  pendingAdditions: "فيه شُعب تنتظر رئيس القسم",
};

/**
 * يقرأ الجملة.
 *
 * كلُّ عبارةٍ تُلتقط تُنزع من النصّ، فما يبقى في `text` هو ما لم يُفهم وحده —
 * وهو بالضبط ما ينبغي أن يُطابَق بالاسم. الجملةُ التي كلُّها مفهومةٌ تترك
 * نصّاً فارغاً، فلا تُقصي كلَّ البطاقات بمطابقةٍ اسميةٍ لا معنى لها.
 */
export function parseInboxAsk(input: string): InboxAsk {
  const raw = String(input ?? "").trim();
  if (!raw) return EMPTY_INBOX_ASK;

  /* الأرقام العربية تُوحَّد كما في بقيّة النظام، والتطويلُ يُنزع لأن «معتمـد»
     و«معتمد» كلمةٌ واحدةٌ عند من يكتبها. */
  let rest = ` ${toEnglishDigits(raw).replace(/ـ+/g, "")} `;
  let status: InboxAskStatus = "all";
  let lateOnly = false;
  const signals: InboxAskSignal[] = [];

  for (const [pattern, value] of STATUS_PHRASES) {
    pattern.lastIndex = 0;
    if (!pattern.test(rest)) continue;
    /* أولُ حالةٍ تُذكر هي المقصودة: «معتمد» بعد «مُرسل» في جملةٍ واحدةٍ تناقضٌ
       لا يُحلّ بالترجيح، والأمانةُ أن يُؤخذ ما قيل أولاً ويُقال ذلك. */
    if (status === "all") status = value;
    rest = rest.replace(pattern, " ");
  }

  LATE_PHRASES.lastIndex = 0;
  if (LATE_PHRASES.test(rest)) {
    lateOnly = true;
    rest = rest.replace(LATE_PHRASES, " ");
  }

  for (const [pattern, value] of SIGNAL_PHRASES) {
    pattern.lastIndex = 0;
    if (!pattern.test(rest)) continue;
    if (!signals.includes(value)) signals.push(value);
    rest = rest.replace(pattern, " ");
  }

  /* ما بقي يُنظَّف كلمةً كلمة، لا بحدود الكلمات في التعابير النمطية: `\b` في
     جافاسكربت حدٌّ بين حرفٍ لاتينيٍّ وغيره، والحرف العربي ليس منها — فقاعدةٌ
     مكتوبةٌ به تُطابق مواضعَ لا يقصدها أحد وتترك المقصودة. التقطيع بالمسافة
     يقول ما يعنيه بالضبط.

     والكلماتُ المحذوفة صنفان: حروفُ الجرّ والوصل، وكلماتٌ تصف الوارد نفسه
     («الأقسام»، «عندها») لا قسماً بعينه. بقاءُ أيٍّ منها نصَّ بحثٍ يُفرغ
     الشاشة من غير سبب. */
  const text = rest
    .split(/\s+/)
    .filter(Boolean)
    .filter(word => !STOP_WORDS.has(word))
    .join(" ")
    .trim();

  const understood = status !== "all" || lateOnly || signals.length > 0;
  const parts: string[] = [];
  if (status !== "all") parts.push(STATUS_WORD[status]);
  if (lateOnly) parts.push("متأخّر عن الموعد");
  for (const signal of signals) parts.push(SIGNAL_WORD[signal]);
  if (text) parts.push(`الاسم يحوي «${text}»`);

  return {
    status, lateOnly, signals, text,
    note: parts.length ? parts.join(" · ") : "",
    understood,
  };
}

/** ما يحتاجه الفلتر من بطاقةٍ في الوارد — لا أكثر، فتبقى الدالة نقيّةً ومُختبرة. */
export interface InboxAskCandidate {
  status: string;
  late?: boolean;
  blockingConflicts?: number;
  openNotes?: number;
  answeredNotes?: number;
  pendingAdditions?: number;
  sectionName?: string;
  collegeName?: string;
}

/**
 * هل تطابق هذه البطاقة السؤال؟
 *
 * الإشاراتُ تُجمع بـ«و» لا بـ«أو»: «متأخر وفيه موانع» يعني الاثنين معاً، لأن
 * من يكتب شرطين يقصدهما، ومن أراد أحدهما كتب أحدهما.
 */
export function matchesInboxAsk(row: InboxAskCandidate, ask: InboxAsk): boolean {
  if (ask.status !== "all" && row.status !== ask.status) return false;
  if (ask.lateOnly && !row.late) return false;
  for (const signal of ask.signals) {
    if (signal === "blocking" && !(Number(row.blockingConflicts) > 0)) return false;
    if (signal === "openNotes" && !(Number(row.openNotes) > 0)) return false;
    if (signal === "answered" && !(Number(row.answeredNotes) > 0)) return false;
    if (signal === "pendingAdditions" && !(Number(row.pendingAdditions) > 0)) return false;
  }
  if (ask.text) {
    const haystack = `${row.sectionName || ""} ${row.collegeName || ""}`;
    /* المطابقة بالكلمات لا بالجملة كاملة: «التربية الأساسية» يجدها من كتب
       «الأساسية التربية»، ومن كتب كلمةً واحدةً منهما. */
    const words = ask.text.split(/\s+/).filter(Boolean);
    if (!words.every(word => haystack.includes(word))) return false;
  }
  return true;
}
