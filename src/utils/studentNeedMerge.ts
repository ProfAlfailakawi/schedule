/**
 * ── إعادةُ الإرسال تُحدِّث الطلب ولا تستبدله ────────────────────────────────
 *
 * كان الطالبُ إذا أعاد الإرسال يُحذف سجلُّه ويُكتب غيره: معرّفٌ جديد، وقراراتُ
 * القسم والتسجيل على ما لم يعد مطلوباً تختفي بلا أثر، والكتابةُ نفسُها ليست
 * عمليةً واحدة. فمقرّرٌ سجّله التسجيلُ أمسِ ثم حذفه الطالبُ اليوم يختفي من
 * الكشف، ولا يعرف أحدٌ أن مقعداً محجوزاً باسمه لم يعد يريده.
 *
 * القاعدةُ هنا في مكانٍ واحد، يستعملها مسارا التخزين (Firestore والمحلي):
 * - يبقى معرّفُ السجلّ ورقمُ الحالة وتاريخُ أول إرسال.
 * - قرارُ مقرّرٍ ما زال مطلوباً يبقى كما هو.
 * - قرارُ مقرّرٍ حذفه الطالبُ لا يُمحى: يبقى معلَّماً `droppedByStudent`،
 *   ليقرأ القسمُ والتسجيلُ «ألغاه الطالب بعد التسجيل».
 * - قرارُ الحالة كلها (الخريج) يبقى ما دام الطلبُ طلبَ حالة.
 */
import type { StudentCourseState, StudentNeed } from "../types";
import { isCaseLevelNeed } from "./studentCaseDecision";

export const caseRefFromId = (id: string): string => String(id).slice(0, 8).toUpperCase();

/** نصُّ المقرّر الذي ألغاه الطالبُ بعد أن قيل فيه شيء. */
export const droppedCourseLabel = (state: Pick<StudentCourseState, "state">): string =>
  state.state === "registered" ? "ألغاه الطالب بعد التسجيل" : "ألغاه الطالب بعد القرار";

export function mergeStudentResubmission(
  prior: StudentNeed[],
  entry: Omit<StudentNeed, "id" | "createdAt">,
  now: string,
  freshId: string,
): { row: StudentNeed; removeIds: string[] } {
  const ordered = [...prior].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const keep = ordered[0];
  if (!keep) {
    const row: StudentNeed = { ...entry, id: freshId, createdAt: now } as StudentNeed;
    row.caseRef = row.caseRef || caseRefFromId(row.id);
    return { row, removeIds: [] };
  }
  const wanted = new Set((entry.courseIds || []).map(Number));
  /* أحدثُ قولٍ في كل مقرّر هو قولُه، من كل السجلّات المكرّرة لليد نفسها. */
  const newest = new Map<number, StudentCourseState>();
  for (const state of ordered.flatMap(item => item.courseStates || [])) {
    const at = newest.get(Number(state.courseId));
    if (!at || String(state.at) > String(at.at)) newest.set(Number(state.courseId), state);
  }
  const courseStates: StudentCourseState[] = [...newest.values()].map(state => {
    if (wanted.has(Number(state.courseId))) {
      const { droppedByStudent: _dropped, droppedAt: _at, ...rest } = state;
      return rest as StudentCourseState;
    }
    return state.droppedByStudent ? state : { ...state, droppedByStudent: true, droppedAt: now };
  });
  const row: StudentNeed = {
    ...entry,
    id: keep.id,
    createdAt: keep.createdAt,
    updatedAt: now,
    caseRef: ordered.map(item => item.caseRef).find(Boolean) || caseRefFromId(keep.id),
    ...(courseStates.length ? { courseStates } : {}),
  } as StudentNeed;
  if (!courseStates.length) delete (row as any).courseStates;
  const priorCase = ordered.map(item => item.caseState).find(state => state && (state.committee || state.registrar));
  delete (row as any).caseState; delete (row as any).caseDroppedAt;
  if (priorCase) {
    /* قرارُ الحالة لا يُمحى إن غيّر الطالبُ نوعَ طلبه: يبقى، ومعه متى ألغاه. */
    row.caseState = priorCase;
    if (!isCaseLevelNeed(row)) row.caseDroppedAt = ordered.map(item => item.caseDroppedAt).find(Boolean) || now;
  }
  return { row, removeIds: ordered.slice(1).map(item => item.id) };
}
