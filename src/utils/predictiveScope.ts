/**
 * ── نطاق التنبّؤ وملخّصه (نقيّان، بلا قاعدة بيانات) ────────────────────────────
 * `predictiveNarrow`: مفتاح «هذه الكلية / كل كليات القسم» في مركز القراءات يضيّق النطاق ولا يوسّعه:
 *   «هذه الكلية» = القسم المفتوح في هذه الكلية فقط · «كل كليات القسم» = عائلة القسم (المواقع المتماثلة عبر الكليات).
 *   بلا sectionId (الرادار القديم) يبقى المعنى: كل أقسام الكلية.
 * `predictiveSummaryOf`: ملخّصٌ صغير للبطاقة يُشتقّ من القراءة نفسها (أعدادٌ فقط) فلا يحتاج تحميل اللوحة.
 */
import { departmentFamily } from "./sectionLabel";
import { isActionable, type PredictiveReading } from "./predictiveIntelligence";

export interface PredictiveNarrow { key: string; match: (collegeId: number, sectionId: number) => boolean }

export function predictiveNarrow(
  query: { analysisScope?: unknown; collegeId?: unknown; sectionId?: unknown },
  sections: ReadonlyArray<{ AdCollegeId: number; AdSectionId: number; AdSectionName?: string }>,
): PredictiveNarrow | null {
  const mode = query.analysisScope === "department" ? "department" : query.analysisScope === "college" ? "college" : "";
  const collegeId = Number(query.collegeId) || 0, sectionId = Number(query.sectionId) || 0;
  if (!mode || !collegeId) return null;
  if (!sectionId) return { key: `${mode}:${collegeId}:*`, match: (c) => c === collegeId };
  if (mode === "college") return { key: `college:${collegeId}:${sectionId}`, match: (c, s) => c === collegeId && s === sectionId };
  const family = departmentFamily(sections as any[], collegeId, sectionId);
  const pairs = new Set(family.map(member => `${member.collegeId}:${member.sectionId}`));
  return { key: `family:${[...pairs].sort().join(",")}`, match: (c, s) => pairs.has(`${c}:${s}`) };
}

export interface PredictiveSummary {
  /** فصولٌ سابقة لها جدولٌ في النطاق. */
  historyTerms: number;
  /** تاريخٌ لا يكفي لاختبارٍ رجعي ولا لاقتراحٍ مسؤول (أقل من فصلين). */
  thin: boolean;
  /** عدد الإجراءات المقترحة. */
  actions: number;
  /** منها ما يُنفَّذ بضغطة (ثقةٌ متوسطة فأعلى). */
  oneClick: number;
  /** أعلى إجراءٍ أثراً×ثقة. */
  best: { label: string; level: string; score: number } | null;
}

export function predictiveSummaryOf(reading: Pick<PredictiveReading, "historyTerms" | "top">): PredictiveSummary {
  const best = reading.top[0];
  return {
    historyTerms: reading.historyTerms,
    thin: reading.historyTerms < 2,
    actions: reading.top.length,
    oneClick: reading.top.filter(item => item.action.oneClick && isActionable(item.confidence)).length,
    best: best ? { label: best.label, level: best.confidence.level, score: best.confidence.score } : null,
  };
}
