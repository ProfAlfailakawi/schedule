/**
 * ── المنجَز يتبع المسبقات بالضبط ─────────────────────────────────────────────
 *
 * قرارُ المالك: لا يختار الطالبُ ما يشاء. من جاء مستجدّاً في المستوى 100 لا يعلّم مقرراً من 400 مجتازاً،
 * ولا يطلب ما لم تُجتَز مسبقاتُه. فالمنجَزُ المحفوظ **مغلقٌ على المسبقات** (في قسمه وفي غيره، كما تقولها صحيفتُه):
 * كلُّ مقررٍ منجَز مسبقاتُه (الكل، وأحدُ كلِّ بدائل، وحدٌّ أدنى للوحدات) منجَزةٌ أيضاً.
 *
 * يُسقَط ما اختلّ شرطُه، وما بُني عليه، حتى يستقرّ المجموع. والحساب نفسُه في المتصفح (kmCore.unmet) وفي الخادم
 * (هنا)، فالواجهةُ تمنع والخادمُ لا يثق بها.
 */
import { unmetPrereq } from "./curriculumRules";
import type { CoursePrereq } from "../types";

export interface PassedClosure { kept: number[]; dropped: number[] }

export function closePassed(
  passed: readonly number[],
  prereqOf: (courseId: number) => CoursePrereq | undefined,
  credit: ReadonlyMap<number, number>,
): PassedClosure {
  const set = new Set(passed);
  const dropped: number[] = [];
  for (let changed = true; changed;) {
    changed = false;
    const units = [...set].reduce((sum, id) => sum + (credit.get(id) || 0), 0);
    for (const id of [...set]) {
      const lack = unmetPrereq(prereqOf(id), set, units);
      if (lack.all.length || lack.anyOf.length || lack.unitsShort) { set.delete(id); dropped.push(id); changed = true; break; }
    }
  }
  return { kept: passed.filter(id => set.has(id)), dropped };
}
