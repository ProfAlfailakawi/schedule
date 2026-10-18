/**
 * ── قواعد التخرج: الاقتراحُ المشتقّ من اسم القسم ────────────────────────────
 *
 * كان هذا التخمينُ مكتوباً مرّتين — في الخادم وفي شاشة الأقسام — فيفترقان عند
 * أول تعديل. وهو **اقتراحٌ لا قاعدة**: لا يُقاس عليه طالبٌ قبل أن يحفظه القسم
 * صراحةً (`storedDegreeRuleForSection` في الخادم يرفض التحقق بلا قاعدةٍ
 * محفوظة). مكانُه الوحيد هنا.
 */
import { toEnglishDigits } from "./digits";

export type DegreeRule = {
  degreeUnits: number;
  fieldTrainingRequired: number;
  graduateRegularPassed: number;
  graduateSummerPassed: number;
};

export const suggestedDegreeRule = (sectionName: string): DegreeRule => {
  const name = String(sectionName || "");
  const degreeUnits = /فرنسي/.test(name) ? 132 : /انجليزي|إنجليزي|تربية خاصة|تفوق|إعاقة|صعوبات/.test(name) ? 134 : 130;
  return degreeUnits === 130
    ? { degreeUnits, fieldTrainingRequired: 102, graduateRegularPassed: 107, graduateSummerPassed: 109 }
    : degreeUnits === 132
      ? { degreeUnits, fieldTrainingRequired: 107, graduateRegularPassed: 109, graduateSummerPassed: 111 }
      : { degreeUnits, fieldTrainingRequired: 107, graduateRegularPassed: 111, graduateSummerPassed: 113 };
};

/** One validation for every place a graduation rule is typed: a department's own rule and a curriculum plan's rule obey
 * the same bounds. «لفتح التدريب الميداني» لا تعرضه شاشة القسم؛ فحين لا يُرسَل يبقى المحفوظ (أو المقترح) بشرط ألا يتجاوز
 * حدّ الخريج العادي، فلا يُرفض مجموعٌ أصغر برقمٍ قديمٍ لا يراه المستخدم. حين يُرسَل (شاشة الصحائف) يُتحقَّق منه كغيره. */
export const readDegreeRuleInput = (body: any, fieldTrainingFallback: number): { rule: DegreeRule } | { error: string } => {
  const read = (key: string) => Math.round(Number(toEnglishDigits((body || {})[key])));
  const degreeUnits = read("degreeUnits");
  const graduateRegularPassed = read("graduateRegularPassed"), graduateSummerPassed = read("graduateSummerPassed");
  const raw = (body || {}).fieldTrainingRequired;
  const given = !(raw == null || String(raw).trim() === "");
  const fieldTrainingRequired = given ? read("fieldTrainingRequired") : Math.min(Number(fieldTrainingFallback), graduateRegularPassed);
  const values = [degreeUnits, fieldTrainingRequired, graduateRegularPassed, graduateSummerPassed];
  if (values.some(value => !Number.isFinite(value) || value < 30 || value > 300)) return { error: "كل قيمة يجب أن تكون عدد وحدات بين 30 و 300" };
  // A student cannot be asked to pass more than the degree holds.
  /* المشتقّ لا يُلام: هو ≤ حدّ الخريج العادي، فإن زاد الأخير عن المجموع سُمّي الأخير. */
  const checked: Array<[string, number]> = [["خريج / متوقع · فصل عادي", graduateRegularPassed], ["خريج / متوقع · فصل صيفي", graduateSummerPassed]];
  if (given) checked.unshift(["لفتح التدريب الميداني", fieldTrainingRequired]);
  const over = checked.find(([, value]) => value > degreeUnits);
  if (over) return { error: `«${over[0]}» (${over[1]}) أكبر من مجموع وحدات الدرجة (${degreeUnits}) — عدّله أو ارفع المجموع` };
  return { rule: { degreeUnits, fieldTrainingRequired, graduateRegularPassed, graduateSummerPassed } };
};
