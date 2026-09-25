/**
 * ── مفتاحُ الذاكرة يحمل عالَمه ───────────────────────────────────────────────
 *
 * البيئةُ التجريبية تعمل داخل الخدمة الحقيقية نفسها: كلُّ طلبٍ يحمل جلسةً
 * تجريبية يُربط بصندوقه (AsyncLocalStorage في repository.ts) فلا يقرأ إلا
 * بياناتِه. لكنّ ذاكرةً على مستوى العملية لا تعرف هذا الربط: ما حفظه طلبٌ
 * تجريبيٌّ يقرؤه الحقيقيُّ بعده، والعكس.
 *
 * فكلُّ ذاكرةٍ تحفظ شيئاً قرأه Repository تبني مفتاحها من هنا: «real|…» للعالم
 * الحقيقي، و«demo:<الجلسة>|…» لصندوق كل زائر. قاعدةٌ واحدة في موضعٍ واحد؛
 * و`tests/demo-complete-audit.ts` يمنع ذاكرةً في server.ts تُقرأ أو تُكتب
 * بمفتاحٍ لم يمرّ بها.
 */
export function createDataContextKey(currentDemoSessionId: () => string) {
  return (key: string | number): string => {
    const demo = currentDemoSessionId();
    return `${demo ? `demo:${demo}` : "real"}|${key}`;
  };
}
