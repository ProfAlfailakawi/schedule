import { findConflicts } from "./scheduleIntelligence";

/**
 * ── ما يمنع الاعتماد، بتفاصيله — داخل حدود القسم ─────────────────────────
 *
 * كانت شاشةُ التغييرات تقول «4 يمنع الاعتماد» ولا تقول ما هي. فصار كلُّ مانعٍ
 * يصل بمواعيد هذا القسم المعنيّة به، بمقرّراتها وأساتذتها. وتعارضٌ مع موعدٍ في
 * قسمٍ آخر يُقال عامّاً — «مع موعدٍ خارج هذا القسم» — بلا اسم قسمٍ ولا مقرّرٍ
 * ولا أستاذٍ منه: الخادمُ يرى الموعدَ المقابل ليحمي الجدول، والقارئُ لا.
 *
 * والقواعدُ هي قواعدُ العدّ نفسُها (`countBlockingConflicts`): تعارضُ الأستاذ
 * بين نطاقين لا يُحسب هنا، لأن الأستاذَ الزائر يُراجَع في جدوله هو.
 */
export interface ReviewBlocker {
  id: string;
  type: string;
  title: string;
  detail: string;
  rowIds: number[];
  subjectLabel?: string;
}

export function blockingConflictDetails(
  scopeRows: any[],
  termRows: any[],
  courseName: Map<number, string>,
  instructorName: Map<number, string> = new Map(),
): ReviewBlocker[] {
  const ownIds = new Set(scopeRows.map((row: any) => Number(row.id)));
  const byId = new Map(termRows.map((row: any) => [Number(row.id), row] as const));
  const scopeOf = new Map(termRows.map((row: any) => [Number(row.id), `${Number(row.AdCollegeId || 0)}:${Number(row.AdSectionId || 0)}`] as const));
  const typeLabel: Record<string, string> = {
    room: "تعارض قاعة", instructor: "تعارض أستاذ", duplicate: "موعد مكرّر", cohort: "تعارض مقرّرين يشترك طلبتُهما",
  };
  const describe = (row: any) => {
    const who = instructorName.get(Number(row?.AdInstructorId)) || "";
    return `${courseName.get(Number(row?.AdCourseId)) || row?.AdCourseName || "مقرر"} (شعبة ${row?.SCode || "—"}${who ? ` — ${who}` : ""})`;
  };
  const seen = new Set<string>();
  const blockers: ReviewBlocker[] = [];
  for (const item of findConflicts(scopeRows as any, termRows as any)) {
    if (item.severity !== "high" && item.type !== "duplicate") continue;
    const a = Number(item.rowId), b = Number(item.otherId);
    if (!ownIds.has(a) && !ownIds.has(b)) continue;
    if (item.type === "instructor" && scopeOf.get(a) !== scopeOf.get(b)) continue;
    const key = [Math.min(a, b), Math.max(a, b), item.type].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    const label = typeLabel[String(item.type)] || "تعارض يمنع الاعتماد";
    const own = [a, b].filter(id => ownIds.has(id));
    if (own.length === 2) {
      blockers.push({
        id: key, type: String(item.type), title: label,
        detail: `${describe(byId.get(a))} و${describe(byId.get(b))} في الوقت نفسه.`,
        rowIds: own,
        subjectLabel: `${describe(byId.get(a))} · ${describe(byId.get(b))}`,
      });
    } else {
      blockers.push({
        id: key, type: String(item.type), title: `${label} مع موعدٍ خارج هذا القسم`,
        detail: "الموعد المقابل في جدول قسمٍ آخر؛ غيّر وقتَ هذا الموعد أو مكانه، أو نسّق مع ذلك القسم.",
        rowIds: own,
        subjectLabel: describe(byId.get(own[0])),
      });
    }
  }
  return blockers;
}
