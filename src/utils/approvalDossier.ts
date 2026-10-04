/**
 * ── ملف الاعتماد: النموذجُ وحده ─────────────────────────────────────────────
 *
 * ورقةٌ واحدة هادئة تُجيب لجنةَ الاعتماد عمّا تبحث عنه في أربع شاشات: ما الذي
 * تغيّر منذ الجدول المعتمد، وما الذي ما زال يمنع، ومن وقّع ومتى، وما حالُ
 * القسم. وهذا الملف هو الجزء الذي لا يرسم شيئاً: يأخذ ما أعادته الخوادم
 * الثلاثة كما هو (سجلُّ الاعتماد، تقريرُ التغييرات، جاهزيةُ المراجعة) ويُخرج
 * نموذجاً مكتوباً لا يخترع شيئاً.
 *
 * القواعد:
 *  ١) لا قيمة مختلقة. ما لم يعدْه الخادم يُوسَم `available: false` ويعرضه
 *     المُصيِّر «غير متوفر» بهدوء — لا صفراً يوحي بأن لا شيء هناك.
 *  ٢) النطاقُ واحد: كلية + قسم + فصل. ما جاء لنطاقٍ آخر (قراءةٌ بائتة، أو
 *     سجلُّ اعتمادٍ لقسم شقيق) لا يدخل النموذج، ويُقال ذلك (`scopeMismatch`).
 *  ٣) لا أسبابَ للتغيير: سجلُّ التغيير (diffSchedules + وثيقة الهيئة) يحمل
 *     «ما تغيّر» فقط — الخانةُ وقيمتُها قبلُ وبعد — ولا يحمل «لماذا»، فلا
 *     يُعرض سببٌ ولا يُستنتج.
 *  ٤) كلُّ عددٍ مع معدوده يمرّ بـ countOf / nounFor.
 */

import { AR, countOf, nounFor } from "./arabicCount";
import { compareCourseSection } from "./scheduleOrder";
import { approvalScopeKey, AUTHORITY_BASELINE_LABEL, rowsInApprovalScope, type ApprovalScope } from "./approvalScope";

/* ── ما يصل من الخوادم (أشكالٌ ضيّقة: ما نقرؤه فقط) ───────────────────────── */

export interface DossierDiffChange { field?: string; label: string; before: string; after: string }
export interface DossierDiffEntry {
  kind: "added" | "removed" | "changed";
  scheduleId: number;
  row?: { AdCollegeId?: unknown; AdSectionId?: unknown; AdTermId?: unknown } & Record<string, unknown>;
  changes?: DossierDiffChange[];
  display?: { courseCode?: string; course?: string; sectionCode?: string; time?: string; days?: string; room?: string; instructor?: string };
}
export interface DossierSignature {
  stage: "committee" | "head"; userName: string; roleLabel?: string; at: string;
  rowCount?: number; regulationNoticeCount?: number; verifyCode?: string;
}
export interface DossierRound {
  number: number; submittedAt?: string; submittedBy?: string;
  returnedAt?: string; returnedBy?: string; returnedNoteCount?: number; changedRowCount?: number;
  acceptedAt?: string; acceptedBy?: string; amendment?: boolean;
}
export interface DossierApproval {
  AdCollegeId?: number; AdSectionId?: number; AdTermId?: number;
  status: string; currentRound?: number;
  signatures?: DossierSignature[]; rounds?: DossierRound[];
  pendingAdditions?: unknown[]; pendingAdditionsOverflow?: number;
  headReturn?: { by: string; at: string; reason: string };
}
export interface DossierBlocker { id?: string; title: string; detail?: string }
export interface DossierReport {
  approval?: DossierApproval | null;
  statusLabel?: string;
  rowCount?: number;
  baselineSource?: "authority" | "round" | "capture" | "reviewed" | "none";
  authoritySource?: { name?: string; sourceFileName?: string; importedAt?: string; publishedAt?: string | null } | null;
  diff?: { entries?: DossierDiffEntry[]; counts?: { added?: number; removed?: number; changed?: number; unchanged?: number } } | null;
  notes?: Array<{ origin?: string; state?: string }>;
  reviewBlockers?: DossierBlocker[];
  regulationNotices?: Array<{ title: string; approvalEffect?: string }>;
}
export interface DossierReadiness {
  blockers?: DossierBlocker[]; warnings?: DossierBlocker[];
  blockingConflicts?: number; blockingRows?: number;
}

/** كلُّ قراءةٍ تأتي موسومةً بالنطاق الذي طُلبت له. */
export interface DossierInput {
  scope: ApprovalScope;
  names?: { college?: string; section?: string; term?: string };
  report: { scopeKey: string; data: DossierReport } | null;
  readiness: { scopeKey: string; data: DossierReadiness } | null;
  printedAt: Date;
}

/* ── النموذج ─────────────────────────────────────────────────────────────── */

export type DossierKind = "added" | "modified" | "removed";
export interface DossierTile { kind: DossierKind; count: number; percent: number; label: string }
export interface DossierTimelineStep {
  id: string; kind: "submitted" | "returned" | "accepted" | "signed" | "head-returned";
  round?: number; at: string; date: string; title: string; by?: string; detail?: string; verifyCode?: string;
}
export interface DossierChangeItem { kind: DossierKind; scheduleId: number; section: string; where: string; lines: string[] }
export interface DossierCourseGroup { key: string; code: string; course: string; items: DossierChangeItem[] }
export interface DossierBlockerLine { title: string; detail?: string }

export interface ApprovalDossierModel {
  scopeKey: string;
  names: { college: string; section: string; term: string };
  printedOn: string;
  /** `ok`: يُعرض كلُّه. `scope-mismatch`: وصل ما ليس لهذا النطاق فأُسقط. `loading`: لم يصل شيء بعد. */
  state: "ok" | "scope-mismatch" | "loading";
  scopeMismatch: { report: boolean; readiness: boolean; approval: boolean };

  baseline: {
    available: boolean;
    kind: "authority" | "round" | "capture" | "reviewed" | "none";
    /** عنوانُ المقارنة: «منذ الجدول المعتمد» أو ما يليق بمصدرها الفعلي. */
    title: string;
    /** سطرُ المصدر: أيُّ وثيقة ومتى. null حين لا مصدر. */
    sourceLine: string | null;
  };

  changes: {
    available: boolean;
    added: number; modified: number; removed: number; total: number;
    unchanged: number | null;
    /** حصةُ ما لم يُمسّ من الجدول الحيّ (٠–١٠٠) — null إن لم يُعرف المجموع. */
    stablePercent: number | null;
    tiles: DossierTile[];
    /** مواعيدُ وصلت من نطاقٍ آخر فأُسقطت من العدّ. */
    droppedOutOfScope: number;
  };

  /** مجموعاتٌ بحسب المقرر، بسقفٍ ثابت للأسطر. */
  groups: DossierCourseGroup[];
  shownItems: number;
  hiddenItems: number;
  hiddenLabel: string | null;

  approval: {
    available: boolean;
    statusLabel: string;
    tone: "success" | "warning" | "info" | "neutral";
    round: number | null;
    roundLabel: string | null;
    signedByCommittee: boolean;
    signedByHead: boolean;
    /** تغيّر عددُ المواعيد منذ آخر توقيع — قرينةٌ لا حُكم. */
    changedSinceSignature: string | null;
    pendingAdditions: number;
    pendingAdditionsLabel: string | null;
    headReturn: { by: string; date: string; reason: string } | null;
  };
  timeline: DossierTimelineStep[];

  blockers: {
    available: boolean;
    source: "readiness" | "report" | "none";
    blocking: DossierBlockerLine[];
    blockingCount: number;
    blockingRows: number | null;
    warnings: DossierBlockerLine[];
    warningCount: number | null;
    openNotes: number | null;
    regulationReview: number | null;
    /** هل لا يمنع شيءٌ فعلاً (قراءةٌ حقيقية ولا موانع) — لا يُدّعى عند غياب القراءة. */
    clear: boolean;
    summary: string | null;
  };
}

/** أقصى عددٍ من أسطر التغييرات على الورقة قبل «و N أخرى». */
export const DOSSIER_ITEM_CAP = 12;
export const DOSSIER_BLOCKER_CAP = 4;

const KIND_ORDER: Record<DossierKind, number> = { added: 0, modified: 1, removed: 2 };
const KIND_FROM_DIFF: Record<DossierDiffEntry["kind"], DossierKind> = { added: "added", changed: "modified", removed: "removed" };

const pad = (n: number) => String(n).padStart(2, "0");
/** dd/mm/yyyy بأرقام غربية؛ تاريخٌ لا يُقرأ يُعاد كما هو. */
export function dossierDate(iso?: string | null): string {
  const text = String(iso || "").trim();
  if (!text) return "";
  const date = new Date(text.length <= 10 ? `${text}T00:00:00` : text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** نسبٌ صحيحة مجموعها ١٠٠ (أكبر الباقي) — لا شريطَ يقول ٩٩٪. */
export function proportionalPercents(counts: number[]): number[] {
  const total = counts.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map(n => (Math.max(0, n) / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) { if (left <= 0) break; if (counts[index] > 0) { floors[index] += 1; left -= 1; } }
  return floors;
}

const asCount = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

function approvalTone(status: string): ApprovalDossierModel["approval"]["tone"] {
  if (status === "accepted") return "success";
  if (status === "returned") return "warning";
  if (status === "submitted" || status === "head" || status === "committee") return "info";
  return "neutral";
}

const STATUS_FALLBACK: Record<string, string> = {
  drafting: "قيد الإعداد", committee: "موقّع من اللجنة", head: "موقّع من رئيس القسم",
  submitted: "عند التسجيل", returned: "مُرجَع بملاحظات", accepted: "معتمد",
};

function baselineBlock(report: DossierReport | null): ApprovalDossierModel["baseline"] {
  const kind = report?.baselineSource || "none";
  if (!report || kind === "none") {
    return { available: false, kind: "none", title: AUTHORITY_BASELINE_LABEL, sourceLine: null };
  }
  if (kind === "authority") {
    const source = report.authoritySource;
    const file = String(source?.sourceFileName || source?.name || "الجدول المعتمد.pdf");
    const when = dossierDate(source?.publishedAt || source?.importedAt);
    const verb = source?.publishedAt ? "اعتُمدت" : "استُوردت";
    /* اسم الملف بعلامتي عزل: «.pdf» اللاتينية لا تقلب ترتيب ما حولها. */
    return { available: true, kind, title: AUTHORITY_BASELINE_LABEL, sourceLine: `المقارنة مع «\u2068${file}\u2069»${when ? ` — ${verb} ${when}` : ""}.` };
  }
  if (kind === "round") return { available: true, kind, title: "منذ ما رآه التسجيل", sourceLine: "المقارنة مع النسخة التي رآها التسجيل في الجولة السابقة — لا وثيقة معتمدة لهذا القسم." };
  if (kind === "capture") return { available: true, kind, title: "منذ آخر نسخة محفوظة", sourceLine: "المقارنة مع آخر لقطةٍ محفوظة قبل التعديل — لا وثيقة معتمدة لهذا القسم." };
  return { available: true, kind, title: "منذ آخر مراجعة", sourceLine: "المقارنة مع الجدول كما رآه التسجيل آخر مرة — لا وثيقة معتمدة لهذا القسم." };
}

/** قيمةٌ لاتينية/رقمية (وقت، قاعة) تُعزل لتبقى في ترتيبها داخل جملةٍ عربية. */
const ltr = (value: string) => (value && /^[\d\s:.\-–/A-Za-z]+$/.test(value) ? `\u2066${value}\u2069` : value);

function describeItem(entry: DossierDiffEntry, kind: DossierKind): DossierChangeItem {
  const display = entry.display || {};
  const where = [display.days, ltr(String(display.time || ""))].filter(Boolean).join(" · ");
  const lines: string[] = [];
  if (kind === "modified") {
    const parts = (entry.changes || []).map(change => `${change.label}: ${ltr(change.before || "—")} ← ${ltr(change.after || "—")}`);
    if (parts.length) lines.push(parts.join(" · "));
  } else {
    const detail = [display.room, display.instructor].filter(value => value && value !== "—").join(" · ");
    if (detail) lines.push(detail);
  }
  return { kind, scheduleId: Number(entry.scheduleId), section: String(display.sectionCode || ""), where, lines };
}

export function buildApprovalDossier(input: DossierInput): ApprovalDossierModel {
  const scopeKey = approvalScopeKey(input.scope);
  const names = { college: input.names?.college || "", section: input.names?.section || "", term: input.names?.term || "" };
  const printedOn = `${pad(input.printedAt.getDate())}/${pad(input.printedAt.getMonth() + 1)}/${input.printedAt.getFullYear()}`;

  /* ── ما وصل لنطاقٍ آخر يسقط كلُّه ─────────────────────────────────────── */
  const reportMismatch = Boolean(input.report && input.report.scopeKey !== scopeKey);
  const readinessMismatch = Boolean(input.readiness && input.readiness.scopeKey !== scopeKey);
  const report = input.report && !reportMismatch ? input.report.data : null;
  const readiness = input.readiness && !readinessMismatch ? input.readiness.data : null;

  /* سجلُّ الاعتماد نفسُه يحمل نطاقه: قسمٌ شقيق لا يُعرض اعتمادُه هنا ولو جاء
     تحت مفتاح هذا النطاق. */
  let approvalRecord = report?.approval || null;
  let approvalMismatch = false;
  if (approvalRecord) {
    const c = Number(approvalRecord.AdCollegeId || 0), s = Number(approvalRecord.AdSectionId || 0), t = Number(approvalRecord.AdTermId || 0);
    if ((c && c !== Number(input.scope.collegeId)) || (s && s !== Number(input.scope.sectionId)) || (t && input.scope.termId && t !== Number(input.scope.termId))) {
      approvalMismatch = true;
      approvalRecord = null;
    }
  }

  /* ── التغييرات ───────────────────────────────────────────────────────── */
  const baseline = baselineBlock(report);
  const rawEntries = report?.diff?.entries;
  const diffAvailable = Boolean(report && baseline.available && Array.isArray(rawEntries));
  const inScope = diffAvailable
    ? rowsInApprovalScope(rawEntries!.map(entry => ({ ...(entry.row || {}), __entry: entry })), input.scope).map(row => (row as any).__entry as DossierDiffEntry)
    : [];
  const droppedOutOfScope = diffAvailable ? rawEntries!.length - inScope.length : 0;

  let added = 0, modified = 0, removed = 0;
  for (const entry of inScope) {
    if (entry.kind === "added") added += 1;
    else if (entry.kind === "removed") removed += 1;
    else modified += 1;
  }
  const total = added + modified + removed;
  const unchangedRaw = diffAvailable ? asCount(report?.diff?.counts?.unchanged) : null;
  /* العدّادُ الأصليّ يُحسب لكل ما عاد؛ فإن أُسقط شيءٌ لم يُعتمد عدٌّ لا نعرف نطاقه. */
  const unchanged = droppedOutOfScope ? null : unchangedRaw;
  const liveTotal = unchanged === null ? null : unchanged + added + modified;
  const stablePercent = liveTotal ? Math.round((unchanged! / liveTotal) * 100) : null;
  const percents = proportionalPercents([added, modified, removed]);
  const tileDefs: Array<[DossierKind, number]> = [["added", added], ["modified", modified], ["removed", removed]];
  const tiles: DossierTile[] = tileDefs.map(([kind, count], index) => ({
    kind, count, percent: percents[index],
    label: `${nounFor(count, AR.appointment)} ${nounFor(count, kind === "added" ? AR.addedAdj : kind === "modified" ? AR.editedAdj : AR.deletedAdj)}`,
  }));

  /* ── مجموعات المقررات ─────────────────────────────────────────────────── */
  const groupMap = new Map<string, DossierCourseGroup>();
  for (const entry of inScope) {
    const display = entry.display || {};
    const code = String(display.courseCode || "");
    const course = String(display.course || (entry.row as any)?.AdCourseName || `موعد ${entry.scheduleId}`);
    const key = code || course;
    const group = groupMap.get(key) || { key, code, course, items: [] };
    group.items.push(describeItem(entry, KIND_FROM_DIFF[entry.kind] || "modified"));
    groupMap.set(key, group);
  }
  const allGroups = [...groupMap.values()].sort((a, b) => compareCourseSection({courseCode:a.code,courseName:a.course}, {courseCode:b.code,courseName:b.course}) || a.key.localeCompare(b.key));
  for (const group of allGroups) group.items.sort((a, b) => compareCourseSection({sectionCode:a.section,id:a.scheduleId}, {sectionCode:b.section,id:b.scheduleId}) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.scheduleId - b.scheduleId);
  let budget = DOSSIER_ITEM_CAP;
  const groups: DossierCourseGroup[] = [];
  for (const group of allGroups) {
    if (budget <= 0) break;
    const items = group.items.slice(0, budget);
    budget -= items.length;
    groups.push({ ...group, items });
  }
  const shownItems = groups.reduce((sum, group) => sum + group.items.length, 0);
  const hiddenItems = inScope.length - shownItems;

  /* ── الاعتماد والخط الزمني ────────────────────────────────────────────── */
  const record = approvalRecord;
  const timeline: DossierTimelineStep[] = [];
  if (record) {
    for (const round of record.rounds || []) {
      const label = round.amendment ? "جولة تعديل" : `الجولة ${round.number}`;
      if (round.submittedAt) timeline.push({ id: `submit:${round.number}`, kind: "submitted", round: round.number, at: round.submittedAt, date: dossierDate(round.submittedAt), title: `${label} — أُرسل إلى التسجيل`, by: round.submittedBy });
      if (round.returnedAt) {
        const parts: string[] = [];
        const notes = asCount(round.returnedNoteCount);
        if (notes) parts.push(`أُرجع بـ${countOf(notes, AR.note)}`);
        const moved = asCount(round.changedRowCount);
        if (moved) parts.push(`فتحرّك ${countOf(moved, AR.row)}`);
        timeline.push({ id: `return:${round.number}`, kind: "returned", round: round.number, at: round.returnedAt, date: dossierDate(round.returnedAt), title: `${label} — أُرجع بملاحظات`, by: round.returnedBy, detail: parts.join(" ") || undefined });
      }
      if (round.acceptedAt) timeline.push({ id: `accept:${round.number}`, kind: "accepted", round: round.number, at: round.acceptedAt, date: dossierDate(round.acceptedAt), title: `${label} — قُبل`, by: round.acceptedBy });
    }
    for (const sig of record.signatures || []) {
      if (!sig.at) continue;
      const detail: string[] = [];
      const rows = asCount(sig.rowCount);
      if (rows !== null) detail.push(`على ${countOf(rows, AR.appointment)}`);
      const regulation = asCount(sig.regulationNoticeCount);
      if (regulation) detail.push(`مع علمه بـ${countOf(regulation, AR.regulationNote)}`);
      timeline.push({
        id: `sign:${sig.stage}:${sig.at}`, kind: "signed", at: sig.at, date: dossierDate(sig.at),
        title: `توقيع ${sig.roleLabel || (sig.stage === "head" ? "رئيس القسم" : "لجنة الجدول")}`, by: sig.userName,
        detail: detail.join(" ") || undefined, verifyCode: sig.verifyCode || undefined,
      });
    }
    if (record.headReturn?.at) timeline.push({ id: `head-return:${record.headReturn.at}`, kind: "head-returned", at: record.headReturn.at, date: dossierDate(record.headReturn.at), title: "رئيس القسم أرجع للجنة", by: record.headReturn.by, detail: record.headReturn.reason || undefined });
  }
  timeline.sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id));

  const signatures = record?.signatures || [];
  const lastSigRows = signatures.length ? asCount([...signatures].sort((a, b) => String(a.at).localeCompare(String(b.at))).pop()!.rowCount) : null;
  const liveRows = asCount(report?.rowCount);
  const changedSinceSignature = lastSigRows !== null && liveRows !== null && lastSigRows !== liveRows
    ? `وقت آخر توقيع: ${countOf(lastSigRows, AR.appointment)} — الآن: ${countOf(liveRows, AR.appointment)}.`
    : null;
  const pendingNamed = Array.isArray(record?.pendingAdditions) ? record!.pendingAdditions!.length : 0;
  const pendingAdditions = pendingNamed + (asCount(record?.pendingAdditionsOverflow) || 0);
  const round = record ? asCount(record.currentRound) : null;

  /* ── الموانع ─────────────────────────────────────────────────────────── */
  const trim = (item: DossierBlocker): DossierBlockerLine => ({ title: String(item.title || ""), ...(item.detail ? { detail: String(item.detail) } : {}) });
  const fromReadiness = Array.isArray(readiness?.blockers);
  const fromReport = !fromReadiness && Array.isArray(report?.reviewBlockers);
  const blockingAll = (fromReadiness ? readiness!.blockers! : fromReport ? report!.reviewBlockers! : []).map(trim);
  const available = fromReadiness || fromReport;
  const notes = Array.isArray(report?.notes) ? report!.notes! : null;
  const openNotes = notes ? notes.filter(note => note.origin === "registrar" && note.state === "open").length : null;
  const regulationReview = Array.isArray(report?.regulationNotices) ? report!.regulationNotices!.filter(n => n.approvalEffect === "review").length : null;
  const warningsAll = Array.isArray(readiness?.warnings) ? readiness!.warnings!.map(trim) : null;
  const blockingCount = available ? (asCount(readiness?.blockingConflicts) ?? blockingAll.length) : 0;
  const clear = available && blockingAll.length === 0 && blockingCount === 0 && !pendingAdditions && !(openNotes || 0);
  const summaryParts: string[] = [];
  if (available && blockingCount) summaryParts.push(`${countOf(blockingCount, AR.approvalBlocker)} ${nounFor(blockingCount, AR.blockVerb)}`);
  if (openNotes) summaryParts.push(`${countOf(openNotes, AR.note)} من التسجيل لم تُعالج`);
  if (pendingAdditions) summaryParts.push(`${countOf(pendingAdditions, AR.section)} مضافة بعد التوقيع تنتظر رئيس القسم`);

  const hasAnyData = Boolean(report || readiness);
  const state: ApprovalDossierModel["state"] = !hasAnyData
    ? (reportMismatch || readinessMismatch ? "scope-mismatch" : "loading")
    : "ok";

  return {
    scopeKey, names, printedOn,
    state,
    scopeMismatch: { report: reportMismatch, readiness: readinessMismatch, approval: approvalMismatch },
    baseline,
    changes: {
      available: diffAvailable, added, modified, removed, total, unchanged, stablePercent, tiles, droppedOutOfScope,
    },
    groups, shownItems, hiddenItems,
    hiddenLabel: hiddenItems > 0 ? `و${countOf(hiddenItems, AR.appointment)} أخرى` : null,
    approval: {
      available: Boolean(record),
      statusLabel: record ? (report?.statusLabel || STATUS_FALLBACK[record.status] || "") : "",
      tone: record ? approvalTone(record.status) : "neutral",
      round,
      roundLabel: round ? `الجولة ${round}` : null,
      signedByCommittee: signatures.some(sig => sig.stage === "committee"),
      signedByHead: signatures.some(sig => sig.stage === "head"),
      changedSinceSignature,
      pendingAdditions,
      pendingAdditionsLabel: pendingAdditions ? `${countOf(pendingAdditions, AR.section)} مضافة بعد التوقيع تنتظر إقرار رئيس القسم` : null,
      headReturn: record?.headReturn?.at ? { by: record.headReturn.by, date: dossierDate(record.headReturn.at), reason: record.headReturn.reason } : null,
    },
    timeline,
    blockers: {
      available,
      source: fromReadiness ? "readiness" : fromReport ? "report" : "none",
      blocking: blockingAll.slice(0, DOSSIER_BLOCKER_CAP),
      blockingCount,
      blockingRows: fromReadiness ? asCount(readiness?.blockingRows) : null,
      warnings: (warningsAll || []).slice(0, DOSSIER_BLOCKER_CAP),
      warningCount: warningsAll ? warningsAll.length : null,
      openNotes, regulationReview,
      clear,
      summary: summaryParts.length ? summaryParts.join("، ") : null,
    },
  };
}
