/**
 * ── مراجعةُ الاعتماد مربوطةٌ بنطاقٍ واحد ────────────────────────────────────
 *
 * شاشةُ المراجعة وشريطُ الاعتماد وتقريرُ التغييرات تقرأ كلّها «كلية + قسم +
 * فصل» بعينه. وعائلةُ القسم (departmentFamily) تجمع المنتدَبين عبر الكليات،
 * لكنها لا تجمع مواعيدَ الاعتماد ولا ملاحظاتِه: صفٌّ من قسمٍ شقيق في كليةٍ
 * أخرى ليس من هذا الاعتماد.
 *
 * وكلُّ قراءةٍ غير متزامنة تُوسَم بمفتاح النطاق الذي طُلبت له؛ فإن وصلت بعد
 * أن تبدّل النطاق — أو بعد قراءةٍ أحدث — رُميت، فلا يظهر تقريرُ قسمٍ تحت اسمِ
 * قسمٍ آخر.
 */

export interface ApprovalScope { collegeId: number; sectionId: number; termId?: number }

export function approvalScopeKey(scope: ApprovalScope): string {
  return `${Number(scope.collegeId || 0)}:${Number(scope.sectionId || 0)}:${Number(scope.termId || 0)}`;
}

/** صفوف النطاق وحده: صفٌّ يحمل كليةً أو قسماً غيرَ المختار لا يدخل المراجعة. */
export function rowsInApprovalScope<Row extends { AdCollegeId?: unknown; AdSectionId?: unknown; AdTermId?: unknown }>(
  rows: readonly Row[], scope: ApprovalScope,
): Row[] {
  const collegeId = Number(scope.collegeId || 0), sectionId = Number(scope.sectionId || 0), termId = Number(scope.termId || 0);
  return rows.filter(row => {
    const college = Number(row?.AdCollegeId || 0), section = Number(row?.AdSectionId || 0), term = Number(row?.AdTermId || 0);
    if (collegeId && college && college !== collegeId) return false;
    if (sectionId && section && section !== sectionId) return false;
    if (termId && term && term !== termId) return false;
    return true;
  });
}

/**
 * حارسُ القراءات: `begin` تُعطي رمزاً للقراءة، و`accepts` لا تقبل إلا رمزَ
 * آخرِ قراءةٍ ما دام نطاقُها هو النطاقَ المعروض الآن.
 */
export function createScopeGuard() {
  let seq = 0;
  let current = "";
  return {
    /** النطاقُ المعروض تبدّل: كلُّ قراءةٍ سابقة تصير بائتة. */
    setScope(key: string) { if (key !== current) { current = key; seq += 1; } },
    begin(key: string) { seq += 1; return { key, seq }; },
    accepts(token: { key: string; seq: number }) { return token.seq === seq && token.key === current; },
    get scope() { return current; },
  };
}
export type ScopeGuard = ReturnType<typeof createScopeGuard>;

/**
 * صفوفُ وثيقة الهيئة التي تخصّ هذا النطاق من وثيقةٍ قد تكون محفوظةً عند موقعٍ
 * شقيق. كان المجموعُ الواحد يُعاد كلّه أيّاً كان صاحبه — فتصير وثيقةُ الموقع
 * الشقيق أساساً لمقارنة هذا القسم ويُعدّ جدولُه كلّه «محذوفاً ومضافاً».
 */
export function authorityRowsForScope<Row>(
  rows: readonly Row[],
  split: { groups: Array<{ scope: { collegeId: number; sectionId: number; isBase?: boolean }; rows: Row[] }>; unplaced: Array<{ rows: Row[] }> },
  draft: { AdCollegeId: number; AdSectionId: number },
  collegeId: number, sectionId: number,
): Row[] {
  if (!rows.length) return [];
  const isDraftScope = Number(collegeId) === Number(draft.AdCollegeId) && Number(sectionId) === Number(draft.AdSectionId);
  const isMine = (scope: { collegeId: number; sectionId: number; isBase?: boolean }) =>
    (Number(scope.collegeId) === Number(collegeId) && Number(scope.sectionId) === Number(sectionId));
  if (split.groups.length <= 1 && !split.unplaced.length) {
    const only = split.groups[0];
    if (!only) return isDraftScope ? [...rows] : [];
    /* موقعُ الأساس يُحسب للوثيقة نفسها ولو قُرئ قسمُه بنظيرٍ آخر. */
    return isMine(only.scope) || (isDraftScope && only.scope.isBase) ? [...rows] : [];
  }
  const mine = split.groups.find(group => isMine(group.scope));
  // صف تعذّر تحديد موقعه لم يغادر مكان الاستيراد، فيبقى في تقريره.
  return [...(mine ? mine.rows : []), ...(isDraftScope ? split.unplaced.flatMap(entry => entry.rows) : [])];
}

/** اسمُ أساس المقارنة بوثيقة الهيئة المعتمدة — بلفظه هذا في كل موضع. */
export const AUTHORITY_BASELINE_LABEL = "منذ الجدول المعتمد";

/**
 * سطرُ مصدر المقارنة: أيُّ وثيقةٍ، ومتى اعتُمدت أو استُوردت. القارئ يرى ما
 * يُقارَن به، لا يستنتجه.
 */
export function authorityBaselineLabel(source?: { name?: string; sourceFileName?: string; importedAt?: string; publishedAt?: string | null } | null): string {
  const file = String(source?.sourceFileName || source?.name || "الجدول المعتمد.pdf");
  const when = String(source?.publishedAt || source?.importedAt || "").slice(0, 10);
  const verb = source?.publishedAt ? "اعتُمدت" : "استُوردت";
  return `${AUTHORITY_BASELINE_LABEL}: المقارنة مع «${file}»${when ? ` — ${verb} ${when}` : ""}.`;
}
