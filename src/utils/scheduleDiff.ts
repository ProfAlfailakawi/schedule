/**
 * ── ما تغيّر منذ آخر مراجعة ─────────────────────────────────────────────────
 *
 * في النظام مقارِنٌ قائمٌ بالفعل، لكنه يجيب عن سؤالٍ آخر: «ما تغيّر منذ ورقة
 * الاعتماد الأصلية؟» — ولذلك يُميّز الصفوف المستوردة من غيرها ويستبعد ما
 * أُنشئ يدوياً بعد الاستيراد. وهذا صحيحٌ لسؤاله، وخاطئٌ تماماً لسؤالنا.
 *
 * سؤال موظّف التسجيل مختلف: «ما تغيّر منذ أن نظرتُ أنا؟» — وجوابه لا يعرف
 * مستورَداً من يدويّ، ولا يستثني صفّاً لأنه أُنشئ بعد شيء. فالمقارنة هنا بين
 * لقطتين محفوظتين، بمعرّف الصفّ الذي يثبت في هذا النظام من إنشائه إلى حذفه.
 *
 * والفرق عمليٌّ لا نظريّ: من يراجع عشرين قسماً في كل جولة لا يقرأ الجدول من
 * أوّله مرّتين. يقرأ ما تحرّك.
 */

import type { FSchedule } from "../types";

export type DiffFieldKey = "time" | "days" | "room" | "instructor" | "sectionCode" | "course";

export const DIFF_FIELD_LABEL: Record<DiffFieldKey, string> = {
  time: "الوقت", days: "الأيام", room: "القاعة",
  instructor: "أستاذ المقرر", sectionCode: "رقم الشعبة", course: "المقرر",
};

export interface DiffFieldChange {
  field: DiffFieldKey;
  label: string;
  before: string;
  after: string;
}

export interface DiffEntry {
  kind: "added" | "removed" | "changed";
  scheduleId: number;
  /** الصفّ كما هو الآن — وللمحذوف: كما كان قبل الحذف. */
  row: FSchedule;
  changes: DiffFieldChange[];
}

export interface ScheduleDiff {
  entries: DiffEntry[];
  counts: { added: number; removed: number; changed: number; unchanged: number };
  /** هل هذه أول مراجعة؟ عندها كل صفٍّ «مضاف» وهذا صحيحٌ منطقياً. */
  firstReview: boolean;
}

const DAY_FIELDS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
const DAY_LETTERS = ["ح", "ن", "ث", "ر", "خ"];

/** الأيام كحروفٍ تُقرأ: «ح ث خ» لا «1,3,5». */
export function daysText(row: any): string {
  return DAY_FIELDS.map((field, index) => (row?.[field] ? DAY_LETTERS[index] : "")).filter(Boolean).join(" ");
}

function clock(value: unknown): string {
  const text = String(value ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : text;
}

/**
 * قيمة الخانة كما تُقارَن وكما تُعرض.
 *
 * واحدةٌ للاثنين عمداً. لو قُورنت بصيغةٍ وعُرضت بأخرى لظهر للموظّف «تغيّرت من
 * ٠٨:٠٠ إلى ٠٨:٠٠» — وهو أسوأ من ألّا يظهر شيء، لأنه يُفقده الثقة في التقرير
 * كله.
 */
export function fieldValue(row: any, field: DiffFieldKey, names?: DiffNames): string {
  switch (field) {
    case "time": return `${clock(row?.fstarttime)} – ${clock(row?.fendtime)}`;
    case "days": return daysText(row) || "—";
    case "room": {
      const code = String(row?.AdRoomCode || "").trim();
      const hall = String(row?.AdRoomHall || "").trim();
      return [code, hall].filter(Boolean).join(" / ") || "—";
    }
    case "instructor": {
      const id = Number(row?.AdInstructorId || 0);
      return names?.instructorById?.get(id) || (id ? `أستاذ ${id}` : "بدون أستاذ");
    }
    case "sectionCode": return String(row?.SCode || "").trim() || "—";
    case "course": {
      const id = Number(row?.AdCourseId || 0);
      return names?.courseById?.get(id) || String(row?.AdCourseName || "").trim() || (id ? `مقرر ${id}` : "—");
    }
  }
}

export interface DiffNames {
  instructorById?: Map<number, string>;
  courseById?: Map<number, string>;
}

const COMPARED_FIELDS: DiffFieldKey[] = ["course", "sectionCode", "days", "time", "room", "instructor"];

/**
 * المقارنة.
 *
 * `before` فارغةً تعني أول مراجعة: لا أساسَ سابق، فكل صفٍّ مضاف. وهذا ليس
 * حالةً استثنائية تُعالَج، بل الحالةُ الصحيحة — القسم الذي يُرسل جدوله أول
 * مرّة أرسل كل صفوفه فعلاً.
 */
export function diffSchedules(before: FSchedule[] | undefined, after: FSchedule[], names?: DiffNames): ScheduleDiff {
  const baseline = before || [];
  const baseById = new Map(baseline.map(row => [Number((row as any).id), row]));
  const entries: DiffEntry[] = [];
  let unchanged = 0;

  for (const row of after) {
    const id = Number((row as any).id);
    const previous = baseById.get(id);
    if (!previous) {
      entries.push({ kind: "added", scheduleId: id, row, changes: [] });
      continue;
    }
    baseById.delete(id);
    const changes: DiffFieldChange[] = [];
    for (const field of COMPARED_FIELDS) {
      const from = fieldValue(previous, field, names);
      const to = fieldValue(row, field, names);
      if (from !== to) changes.push({ field, label: DIFF_FIELD_LABEL[field], before: from, after: to });
    }
    if (changes.length) entries.push({ kind: "changed", scheduleId: id, row, changes });
    else unchanged += 1;
  }

  for (const [id, row] of baseById) {
    entries.push({ kind: "removed", scheduleId: id, row, changes: [] });
  }

  /* الترتيب كما يُقرأ لا كما يُخزَّن: المحذوف أولاً لأنه أخطر ما يمرّ دون أن
     يُلحظ — الصفّ المضاف يراه الناظر في الجدول، والمحذوف لا أثر له فيه. */
  const order: Record<DiffEntry["kind"], number> = { removed: 0, added: 1, changed: 2 };
  entries.sort((a, b) => order[a.kind] - order[b.kind]
    || String(fieldValue(a.row, "course", names)).localeCompare(String(fieldValue(b.row, "course", names)), "ar")
    || String(fieldValue(a.row, "sectionCode", names)).localeCompare(String(fieldValue(b.row, "sectionCode", names)), "ar"));

  return {
    entries,
    counts: {
      added: entries.filter(entry => entry.kind === "added").length,
      removed: entries.filter(entry => entry.kind === "removed").length,
      changed: entries.filter(entry => entry.kind === "changed").length,
      unchanged,
    },
    firstReview: baseline.length === 0,
  };
}

/** سطرٌ واحد يلخّص التقرير قبل فتحه. «لم يتغيّر شيء» جوابٌ كامل. */
export function summarizeDiff(diff: ScheduleDiff): string {
  const { added, removed, changed } = diff.counts;
  if (diff.firstReview) return `جدولٌ جديد — ${added} موعداً`;
  if (!added && !removed && !changed) return "لم يتغيّر شيء منذ مراجعتك";
  const parts: string[] = [];
  if (added) parts.push(`${added} مضاف`);
  if (removed) parts.push(`${removed} محذوف`);
  if (changed) parts.push(`${changed} معدّل`);
  return parts.join(" · ");
}
