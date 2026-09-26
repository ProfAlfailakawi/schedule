/**
 * ── أيُّ صحيفةٍ يتبعها هذا الطالب؟ ──────────────────────────────────────────
 *
 * في المرحلة الانتقالية يدرس في القسم الواحد جيلان: طلبة الصحيفة السابقة
 * وطلبة الصحيفة الجديدة، ولكلٍّ منهما مجموعُ وحداتٍ وشروطُ تخرّجٍ قد تختلف.
 * فلا يصحّ أن يُقاس خرّيجٌ على رقمٍ واحدٍ للقسم.
 *
 * والدليلُ موجودٌ في الورقة التي يرفعها الطالب نفسه: سطرُ «الوحدات المطلوبة»
 * في صحيفة التخرج هو مجموعُ وحدات خطّته. فنطابقه بمجموع كل صحيفةٍ حيّة في
 * القسم. هذه الدالةُ المكانُ الوحيدُ لذلك القرار، وهي نقيّةٌ ليُختبر سلوكها.
 *
 * لا تخمين: إن لم يُحسم الأمرُ رفضنا بسببٍ واضح بدل أن نقيس الطالب على قاعدة
 * صحيفةٍ ليست صحيفته.
 */
import type { DegreeRule } from "./degreeRules";

export type PlanRuleCandidate = {
  /** معرّف الصحيفة؛ فارغٌ للقسم الذي لم يُنشئ صحائف بعد (قاعدةُ القسم وحدها). */
  planId?: string;
  planName: string;
  status: "active" | "transition" | "section";
  rule: DegreeRule | null;
};

export type SheetTotals = {
  requiredUnits?: number;
  requiredUnitCandidates?: number[];
  passedUnits?: number;
};

export type PlanChoice =
  | { ok: true; candidate: PlanRuleCandidate & { rule: DegreeRule }; evidence: "single" | "sheet-total" | "same-rule" }
  | { ok: false; code: "no-degree-rule" | "plan-rule-missing" | "plan-total-unknown" | "plan-total-unreadable" | "plan-ambiguous"; error: string };

const sameRule = (a: DegreeRule, b: DegreeRule) =>
  Number(a.degreeUnits) === Number(b.degreeUnits)
  && Number(a.graduateRegularPassed) === Number(b.graduateRegularPassed)
  && Number(a.graduateSummerPassed) === Number(b.graduateSummerPassed);

const list = (values: number[]) => values.map(value => String(value)).join(" أو ");

/**
 * الأرقامُ التي تشهد على مجموع وحدات الطالب، من الأقوى إلى الأضعف:
 * القيمة المقروءة بجانب «الوحدات المطلوبة» مباشرة، ثم الأرقام القريبة من
 * ذلك السطر. والمستوى الثاني لا يُسأل إلا إذا قُرئت الوحدات المجتازة صراحةً
 * فاستُبعد رقمُها: طالبٌ جديدٌ اجتاز 130 وحدة لا يصير طالباً قديماً لأن 130
 * مجموعُ الصحيفة القديمة. ولا نقرأ أرقام الصفحة كلها لهذا السبب نفسه.
 */
export function sheetTotalEvidence(facts: SheetTotals): number[][] {
  const direct = Number(facts.requiredUnits || 0);
  const passed = Number(facts.passedUnits || 0);
  const near = passed > 0
    ? [...new Set((facts.requiredUnitCandidates || []).map(Number)
      .filter(value => Number.isFinite(value) && value >= 60 && value <= 300 && value !== passed))]
    : [];
  return [direct > 0 ? [direct] : [], near];
}

/**
 * يختار الصحيفة التي يُقاس عليها الطالب.
 *
 * - صحيفةٌ حيّةٌ واحدة (أو قسمٌ بلا صحائف): هي، كما كان السلوك دائماً.
 * - أكثر من صحيفة: يحسمها مجموعُ الوحدات في صحيفة الطالب. فإن لم يُقرأ
 *   المجموع وكانت الصحائف كلها بالقاعدة نفسها فلا فرق، وإلا طلبنا صورةً أوضح.
 */
export function choosePlanForSheet(candidates: PlanRuleCandidate[], facts: SheetTotals): PlanChoice {
  const live = candidates.filter(Boolean);
  const ruled = live.filter((row): row is PlanRuleCandidate & { rule: DegreeRule } => Boolean(row.rule));
  if (!ruled.length) {
    return { ok: false, code: "no-degree-rule", error: "لا توجد قواعد تخرج أكاديمية معتمدة لهذا القسم في النظام. لا يمكن التحقق من صحيفة التخرج قبل اعتمادها من إدارة القسم." };
  }
  if (live.length === 1) return { ok: true, candidate: ruled[0], evidence: "single" };

  const totals = [...new Set(ruled.map(row => Number(row.rule.degreeUnits)))];
  for (const level of sheetTotalEvidence(facts)) {
    const seen = totals.filter(total => level.includes(total));
    if (seen.length !== 1) continue;
    const matches = ruled.filter(row => Number(row.rule.degreeUnits) === seen[0]);
    if (matches.every(row => sameRule(row.rule, matches[0].rule))) {
      return { ok: true, candidate: matches[0], evidence: "sheet-total" };
    }
    return {
      ok: false, code: "plan-ambiguous",
      error: `مجموع وحدات صحيفتك (${seen[0]}) مشترك بين صحيفتين في القسم بشروط تخرج مختلفة، فلا يمكن تحديد صحيفتك آلياً. راجع القسم ليبتّ في حالتك.`,
    };
  }

  const direct = Number(facts.requiredUnits || 0);
  if (direct > 0 && !totals.includes(direct)) {
    return live.some(row => !row.rule)
      ? { ok: false, code: "plan-rule-missing", error: `صحيفتك تتبع خطةً مجموع وحداتها ${direct}، ولم يعتمد القسم شروط تخرجها في النظام بعد. راجع القسم.` }
      : { ok: false, code: "plan-total-unknown", error: `مجموع الوحدات في صحيفتك (${direct}) لا يطابق أي صحيفة معتمدة لهذا القسم (${list(totals)}). تأكد أنك اخترت قسمك الصحيح، أو راجع القسم.` };
  }

  /* لم يُقرأ المجموع. إن كانت كل الصحائف الحيّة معتمدةً وبالقاعدة نفسها فالنتيجة واحدة أياً كانت صحيفته. */
  if (ruled.length === live.length && ruled.every(row => sameRule(row.rule, ruled[0].rule))) {
    return { ok: true, candidate: ruled[0], evidence: "same-rule" };
  }
  return {
    ok: false, code: "plan-total-unreadable",
    error: "لم أتعرف على «الوحدات المطلوبة» في صحيفة التخرج، وهي التي تحدد صحيفتك (القديمة أو الجديدة). ارفع الصفحة الرسمية كاملة وبوضوح يظهر فيها هذا السطر.",
  };
}
