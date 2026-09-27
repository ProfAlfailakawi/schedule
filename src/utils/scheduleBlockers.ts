import { findConflicts, isBlockingConflict, type ConflictInsight, type LiveClashNote } from "./scheduleIntelligence";
import { placeholderInstructorIds } from "./instructorIdentity";
import { AR, countOf, nounFor, oblique } from "./arabicCount";
import type { FSchedule } from "../types";

export { isBlockingConflict, placeholderInstructorIds };

/**
 * ── «مانع الاعتماد» — قاعدةٌ واحدة، في موضعٍ واحد ──────────────────────────
 *
 * The question «what stops this department's schedule from being approved?»
 * was answered six different ways: the save gate exempted «هيئة تدريسية» and
 * normalised legacy hall aliases; the committee count did neither and dropped
 * cross-department instructor clashes; the dean's balance counted only
 * severity "high" and so ignored exact duplicates; the review screen counted
 * cross-department instructors but not placeholders… One department of the
 * college showed eight approval blockers that were all placeholder pairs, and
 * the dean saw fourteen for a department the registrar saw two for.
 *
 * Every screen now asks THIS module:
 *
 *   • A blocker is a pair, counted once, that `isBlockingConflict` accepts
 *     (instructor / room double booking, or an indistinguishable double
 *     entry; never soft advice). The same section recorded in two halls or
 *     with two teachers is not physical: it is read by the same sweep as a
 *     WARNING (`readScopeConflicts`), shown and never counted
 *     (قاعدة المالك 2026-09-27: «التوقيع لا يمنعه إلا تعارض ماديّ»).
 *   • «هيئة تدريسية» is never a person: its pairs are never instructor
 *     clashes (a shared hall or an exact duplicate still is).
 *   • A hall is identified the way the save gate identifies it — the caller
 *     passes the gate's canonicalisation as `normalizeRow`.
 *   • A pair belongs to every department owning either row. A clash with a
 *     lecture of another department is real — the save gate refuses it — so
 *     it counts in both, and is described here only generically
 *     («مع موعدٍ خارج هذا القسم»).
 *
 * `tests/blocker-oracle-audit.ts` holds the behaviour and refuses a second
 * copy of the predicate anywhere else in the product.
 */
export interface ApprovalBlockerOptions {
  /** «هيئة تدريسية» records (see `placeholderInstructorIds`). */
  placeholderInstructorIds?: Iterable<number>;
  /** The save gate's hall canonicalisation; identity when omitted. */
  normalizeRow?: (row: any) => any;
  courseName?: Map<number, string>;
  instructorName?: Map<number, string>;
}

/**
 * One reading of the scope against the term, and its two halves: the pairs
 * that block, and the pairs that are only said — the same section recorded in
 * two halls or with two teachers (`sectionTwice`, قاعدة المالك 2026-09-27).
 * Both come from the same sweep with the same options, so a pair can never be
 * a blocker on one screen and a warning on another.
 */
export function readScopeConflicts(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): { blocking: ConflictInsight[]; warnings: ConflictInsight[] } {
  const normalize = options.normalizeRow || ((row: any) => row);
  const scope = (scopeRows || []).map(normalize);
  const scopeIds = new Set(scope.map((row: any) => Number(row.id)));
  const universe = [
    ...(termRows || []).filter((row: any) => !scopeIds.has(Number(row?.id))).map(normalize),
    ...scope,
  ];
  const seen = new Set<string>();
  const warned = new Set<string>();
  const blocking: ConflictInsight[] = [];
  const warnings: ConflictInsight[] = [];
  for (const item of findConflicts(scope as FSchedule[], universe as FSchedule[], { placeholderInstructorIds: options.placeholderInstructorIds })) {
    const a = Number(item.rowId), b = Number(item.otherId);
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (isBlockingConflict(item)) {
      if (seen.has(key)) continue;
      seen.add(key);
      blocking.push(item);
    } else if (item.type === "sectionTwice") {
      if (warned.has(key)) continue;
      warned.add(key);
      warnings.push(item);
    }
  }
  return { blocking, warnings };
}

/**
 * The blocking pairs with at least one foot in `scopeRows`, once each, read
 * against the whole term. `termRows` may or may not contain the scope rows:
 * the scope's own version of a row always wins (unsaved candidates, drafts).
 */
export function blockingConflicts(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ConflictInsight[] {
  return readScopeConflicts(scopeRows, termRows, options).blocking;
}

/** The number every screen prints next to «مانع اعتماد». */
export function approvalBlockerCount(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): number {
  return blockingConflicts(scopeRows, termRows, options).length;
}

/**
 * ── الموانع وما تمسّه من مواعيد — رقمان، لا رقمٌ يُقرأ بمعنيين ─────────────
 *
 * The owner's screen showed «4 تعارضات مادّية» on the bar and «5 يمنع» in the
 * review: both were right, and nothing said the second counted appointments.
 * The headline unit everywhere is the number of blocking CONFLICTS (pairs);
 * where appointments are shown, they are these — the distinct rows of the
 * scope that stand in at least one blocking pair — and are named as such.
 */
export function blockingRowIds(conflicts: Array<{ rowId: unknown; otherId: unknown }>, scopeRows: any[]): number[] {
  const own = new Set((scopeRows || []).map((row: any) => Number(row?.id)));
  const touched = new Set<number>();
  for (const item of conflicts || []) {
    for (const id of [Number(item.rowId), Number(item.otherId)]) if (own.has(id)) touched.add(id);
  }
  return [...touched].sort((a, b) => a - b);
}

export interface ApprovalBlockerSummary {
  /** Blocking pairs — the headline number (`approvalBlockerCount`). */
  conflicts: number;
  /** Distinct own appointments standing in those pairs. */
  rows: number;
  rowIds: number[];
  /** How many of `conflicts` are an indistinguishable double ENTRY rather than
      a physical clash — so the sentence says «موعد مكرّر», not «تعارض مادّي». */
  duplicates: number;
}

/** Both numbers from ONE list, so they can never be read from two rules. */
export function approvalBlockerSummary(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ApprovalBlockerSummary {
  const list = blockingConflicts(scopeRows, termRows, options);
  const rowIds = blockingRowIds(list, scopeRows);
  return { conflicts: list.length, rows: rowIds.length, rowIds, duplicates: doubleEntryCount(list) };
}

/** The blocking pairs that are a double entry, not a physical clash. */
export function doubleEntryCount(conflicts: Array<{ type?: unknown }>): number {
  return (conflicts || []).filter(item => item?.type === "duplicate").length;
}

/**
 * ── ما يمنع الاعتماد، بتفاصيله — داخل حدود القسم ─────────────────────────
 *
 * كلُّ مانعٍ يصل بمواعيد هذا القسم المعنيّة به، بمقرّراتها وأساتذتها. وتعارضٌ
 * مع موعدٍ في قسمٍ آخر يُقال عامّاً — «مع موعدٍ خارج هذا القسم» — بلا اسم قسمٍ
 * ولا مقرّرٍ ولا أستاذٍ منه: الخادمُ يرى الموعدَ المقابل ليحمي الجدول، والقارئُ
 * لا. والقائمة هي `blockingConflicts` نفسها، فطولها هو `approvalBlockerCount`.
 */
export interface ReviewBlocker {
  id: string;
  type: string;
  title: string;
  detail: string;
  rowIds: number[];
  subjectKey?: string;
  subjectLabel?: string;
}

export function approvalBlockers(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ReviewBlocker[] {
  const courseName = options.courseName || new Map<number, string>();
  const instructorName = options.instructorName || new Map<number, string>();
  const ownIds = new Set((scopeRows || []).map((row: any) => Number(row.id)));
  const byId = new Map<number, any>((termRows || []).map((row: any) => [Number(row.id), row] as const));
  for (const row of scopeRows || []) byId.set(Number(row.id), row);
  const typeLabel: Record<string, string> = {
    room: "تعارض قاعة", instructor: "تعارض أستاذ", duplicate: "موعد مكرّر", cohort: "تعارض مقرّرين يشترك طلبتُهما",
  };
  const describe = (row: any) => {
    const who = instructorName.get(Number(row?.AdInstructorId)) || "";
    return `${courseName.get(Number(row?.AdCourseId)) || row?.AdCourseName || "مقرر"} (شعبة ${row?.SCode || "—"}${who ? ` — ${who}` : ""})`;
  };
  return blockingConflicts(scopeRows, termRows, options).map(item => {
    const a = Number(item.rowId), b = Number(item.otherId);
    const key = [Math.min(a, b), Math.max(a, b), item.type].join(":");
    const label = typeLabel[String(item.type)] || "تعارض يمنع الاعتماد";
    const own = [a, b].filter(id => ownIds.has(id));
    if (own.length === 2) {
      return {
        id: key, type: String(item.type), title: label,
        detail: `${describe(byId.get(a))} و${describe(byId.get(b))} في الوقت نفسه.`,
        rowIds: own,
        subjectLabel: `${describe(byId.get(a))} · ${describe(byId.get(b))}`,
      };
    }
    return {
      id: key, type: String(item.type), title: `${label} مع موعدٍ خارج هذا القسم`,
      detail: "الموعد المقابل في جدول قسمٍ آخر؛ غيّر وقتَ هذا الموعد أو مكانه، أو نسّق مع ذلك القسم.",
      rowIds: own,
      subjectLabel: describe(byId.get(own[0])),
    };
  });
}

/** Kept for existing callers: the same list, with names passed positionally. */
export function blockingConflictDetails(
  scopeRows: any[],
  termRows: any[],
  courseName: Map<number, string>,
  instructorName: Map<number, string> = new Map(),
  options: ApprovalBlockerOptions = {},
): ReviewBlocker[] {
  return approvalBlockers(scopeRows, termRows, { ...options, courseName, instructorName });
}

/**
 * ── ما يُقال ولا يمنع — للمراجعة ──────────────────────────────────────────
 *
 * الشعبة نفسها مسجّلة مرتين بالأيام والوقت نفسيهما، في قاعتين أو بأستاذين
 * (twinKind). ليست تعارضاً ماديّاً فلا تمنع — قاعدة المالك 2026-09-27: «التوقيع
 * لا يمنعه إلا تعارض ماديّ» — لكنها لا تُسكَت: تصل المراجعةَ بنداً «للمراجعة»
 * بجانب الموانع، من القراءة نفسها التي تعدّ الموانع. وما كان طرفُه الآخر في
 * قسمٍ آخر يُقال عامّاً، كما يُقال المانع.
 */
export function approvalWarnings(scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ReviewBlocker[] {
  return describeWarnings(readScopeConflicts(scopeRows, termRows, options).warnings, scopeRows, termRows, options);
}

/** The warnings of a reading already made, described for the review. */
export function describeWarnings(warnings: ConflictInsight[], scopeRows: any[], termRows: any[], options: ApprovalBlockerOptions = {}): ReviewBlocker[] {
  const courseName = options.courseName || new Map<number, string>();
  const ownIds = new Set((scopeRows || []).map((row: any) => Number(row.id)));
  const byId = new Map<number, any>((termRows || []).map((row: any) => [Number(row.id), row] as const));
  for (const row of scopeRows || []) byId.set(Number(row.id), row);
  return (warnings || []).map(item => {
    const a = Number(item.rowId), b = Number(item.otherId);
    const own = [a, b].filter(id => ownIds.has(id));
    const row = byId.get(own[0]) || byId.get(a);
    const course = courseName.get(Number(row?.AdCourseId)) || row?.AdCourseName || "مقرر";
    return {
      id: `twice:${Math.min(a, b)}:${Math.max(a, b)}`,
      type: String(item.type),
      title: item.message,
      detail: own.length === 2
        ? item.detail
        : "الشعبة نفسها مسجّلة أيضاً في جدول قسمٍ آخر بالأيام والوقت نفسيهما؛ تنبيهٌ لا يمنع الاعتماد.",
      rowIds: own,
      subjectKey: `course:${Number(row?.AdCourseId || 0)}:${String(row?.SCode ?? "")}`,
      subjectLabel: [course, `شعبة ${row?.SCode || "—"}`].join(" · "),
    };
  });
}

/**
 * ── سببُ الحلقة، مكتوباً على الصفّ نفسه ─────────────────────────────────────
 *
 * سأل المالك عن صفّين أحمرين في قائمة الجدول: «ليش المنع؟ شنو السبب؟». كانت
 * الحلقة لوناً بلا كلمة، والسبب في تلميحٍ لا يظهر إلا بالمرور — وعلى الهاتف لا
 * مرور. فكلُّ صفٍّ في تعارضٍ يقول سببه سطراً ظاهراً: الأحمر لما يمنع وحده،
 * والكهرماني لما يُقال ولا يمنع. والسطر يُكتب من قراءة اللوحة نفسها
 * (`fastConflictScan(...).notes`) — القراءة التي ترسم الحلقة — فلا يقول الصفّ
 * سبباً غير الذي لوّنه.
 *
 *   «يمنع التوقيع: حجز مزدوج للقاعة G28 مع أصول التربية شعبة 21»
 *   «تنبيه لا يمنع: الشعبة 20 مسجّلة مرتين في الوقت نفسه (G28 و G31)»
 *
 * سطرٌ لكل لون على الأكثر: أشدُّ ما في الصفّ أولاً، والباقي يُعدّ ولا يُسرد.
 * و`outsideNote` جملةُ الخادم عن تعارضٍ مع قسمٍ آخر لا تحمله اللوحة.
 */
export interface RowClashReason { tone: "block" | "warn"; text: string }

export function rowClashReasons(
  row: any,
  notes: readonly LiveClashNote[] | undefined,
  lookup: { row: (id: number) => any; course: (row: any) => string },
  outsideNote?: string,
): RowClashReason[] {
  const out: RowClashReason[] = [];
  const list = notes || [];
  const rank: Record<LiveClashNote["kind"], number> = { instructor: 0, room: 1, duplicate: 2, sectionTwice: 3 };
  const blocking = list.filter(item => item.blocking).sort((a, b) => rank[a.kind] - rank[b.kind]);
  const warnings = list.filter(item => !item.blocking);
  const hall = (item: any) => String(item?.AdRoomHall || "").trim();
  const named = (other: any) => other ? [lookup.course(other) || "موعد آخر", `شعبة ${other.SCode || "—"}`].join(" ") : "موعد آخر";
  /* «ومع موعدٍ آخر» / «ومع موعدين آخرين» / «ومع 3 مواعيد أخرى». */
  const more = (extra: number) => extra <= 0 ? ""
    : extra === 1 ? " · ومع موعدٍ آخر"
      : ` · ومع ${countOf(extra, oblique(AR.appointment))} ${nounFor(extra, oblique(AR.otherAdj))}`;

  const head = blocking[0];
  if (head || outsideNote) {
    const other = head ? lookup.row(head.otherId) : null;
    const text = !head ? String(outsideNote)
      : head.kind === "instructor" ? `حجز مزدوج لأستاذ المقرر مع ${named(other)}`
        : head.kind === "room" ? `حجز مزدوج للقاعة ${hall(row) || "نفسها"} مع ${named(other)}`
          : `موعد مكرّر: الشعبة ${row?.SCode || "—"} مسجّلة مرتين ولا شيء يميّز إحداهما`;
    out.push({ tone: "block", text: `يمنع التوقيع: ${text}${more(blocking.length - (head ? 1 : 0) + (head && outsideNote ? 1 : 0))}` });
  }
  if (warnings.length) {
    const other = lookup.row(warnings[0].otherId);
    /* ما يُذكر هو ما ميّز الصفّين فعلاً (twinKind): قاعتان مختلفتان، وإلا فأستاذان. */
    const hallCode = (item: any) => String(item?.AdRoomHall || "").split("/").pop()!.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const apart = other && hallCode(row) && hallCode(other) && hallCode(row) !== hallCode(other)
      ? ` (${hall(row)} و ${hall(other)})`
      : " بأستاذين";
    out.push({ tone: "warn", text: `تنبيه لا يمنع: الشعبة ${row?.SCode || "—"} مسجّلة مرتين في الوقت نفسه${apart}${more(warnings.length - 1)}` });
  }
  return out;
}
