/**
 * ── قواعد التخرج: الاقتراحُ المشتقّ من اسم القسم ────────────────────────────
 *
 * كان هذا التخمينُ مكتوباً مرّتين — في الخادم وفي شاشة الأقسام — فيفترقان عند
 * أول تعديل. وهو **اقتراحٌ لا قاعدة**: لا يُقاس عليه طالبٌ قبل أن يحفظه القسم
 * صراحةً (`storedDegreeRuleForSection` في الخادم يرفض التحقق بلا قاعدةٍ
 * محفوظة). مكانُه الوحيد هنا.
 */
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
