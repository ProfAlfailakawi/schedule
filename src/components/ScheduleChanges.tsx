/**
 * ── تغييرات الجدول ──────────────────────────────────────────────────────────
 *
 * الشاشة الوحيدة التي أُضيفت في هذا العمل كله، وسببُ استحقاقها أنها ليست
 * استعلاماً بل مكانَ عمل: موظّف التسجيل يفتحها ليقرّر، لا ليقرأ.
 *
 * ووجهُها يختلف بالصفة من المصدر نفسه — التسجيل يرى الأقسام الواردة كلها،
 * والقسم يرى نفسه ومعه ملاحظاتُ التسجيل في مواضعها. لا شاشتان تُبنيان مرّتين
 * ثم تفترقان عند أول تعديل.
 *
 * وما لا تفعله هذه الشاشة مقصودٌ كفعلها: لا تعرض الجدول كله — تعرض ما تحرّك؛
 * ولا تفتح الجولات السابقة — تطويها حتى تُطلب؛ ولا تسأل الموظّف أن يكتب جملةً
 * لكل خانة — الخانة نفسها هي الرسالة.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { takeNotifyFocus, type NotifyFocus } from "../utils/notifyFocus";
import {
  AlertTriangle, ArrowRight, CalendarDays, CalendarRange, Check, CheckCircle2, ChevronDown, ChevronLeft, ClipboardCheck, ClipboardList, Clock3,
  CornerUpLeft, FileDiff, Inbox, Info, MapPin, MessageSquarePlus, Search, Send, ShieldCheck, Trash2,
  UsersRound, X,
} from "lucide-react";
import ApprovalBar from "./ApprovalBar";
import SubmissionDeadlines from "./SubmissionDeadlines";
import ScopeAskBar, { type ScopeAskSelect } from "./ScopeAskBar";
import { EMPTY_INBOX_ASK, matchesInboxAsk, parseInboxAsk, type InboxAsk, type InboxAskSignal } from "../utils/inboxAsk";
import { Badge, EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface } from "./ui";
import { APPROVAL_STATUS_LABEL, CLOSED_BY_ACCEPTANCE_LABEL, countAnsweredRegistrarNotes, countOpenRegistrarNotes, ESCALATE_AFTER_INSISTS } from "../utils/approvalWorkflow";
import { isViewerOnlyRole } from "../utils/academicRoles";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";
import { DIFF_FIELD_LABEL, type DiffFieldKey } from "../utils/scheduleDiff";
import { DECISION_1912_LABEL, regulationScore, type RegulationFinding } from "../utils/scheduleRegulations";
import { currentTermId } from "../utils/termSequence";
import type { AdTerm, ScheduleApprovalStatus } from "../types";
import { singleDepartmentOf, type ScopeAssignmentLike } from "../utils/scopeContext";
import { readSharedScope, resolveSharedScope, useSharedScope } from "../utils/sharedScope";

type NoteField = DiffFieldKey | "row";
type NoteState = "open" | "changed" | "answered" | "resolved" | "removed";

interface InboxRow {
  collegeId: number; sectionId: number; collegeName: string; sectionName: string;
  status: ScheduleApprovalStatus; statusLabel: string; round: number; rowCount: number;
  blockingConflicts: number; openNotes: number; answeredNotes: number; pendingAdditions: number;
  deadline: { effective?: string; past: boolean; daysLeft?: number; tone: string; extensionUntil?: string; extensionReason?: string };
  late: boolean; priority: number; updatedAt: string;
  /** طلبُ تمديدٍ من القسم، والتاريخُ المقترح لمنحه. */
  extensionRequest?: { by: string; at: string; reason: string; days: number };
  suggestedExtensionUntil?: string;
  extensionBy?: string;
  extensionAt?: string;
}

interface NoteRow {
  id: string; scheduleId: number; text: string; field: NoteField; fieldLabel: string;
  state: NoteState; round?: number; origin?: string; userName: string; createdAt: string;
  valueAtNote?: string; valueNow?: string;
  rebuttal?: { text: string; at: string; userName: string };
  rebuttalVerdict?: "accepted" | "insisted";
  insistCount?: number;
  /** أهي ملاحظةُ الناظر نفسه — ملاحظاتُ القسم لكلٍّ كاتبُها. */
  mine?: boolean;
  rebuttalHistory?: Array<{ text: string; at: string; userName: string; insistedAt: string; insistedBy: string }>;
  escalatedAt?: string;
  resolution?: "rebuttal-accepted" | "closed-by-acceptance";
}

interface DiffChange { field: DiffFieldKey; label: string; before: string; after: string }

/**
 * صفُّ موعدٍ مشكّلٌ كما تُقرأ خاناتُه.
 *
 * شكلٌ واحدٌ يصل من الخادم للطرفين — «ما تحرّك» و«الجدول كامل» — فيُعرضان
 * بمُصيّرٍ واحد. وهو نفسُه شكلُ «مواعيد القسم» في ورشة الجدول: الصورةُ التي
 * تعوّدتها العينُ في هذا النظام، وليس لشاشة التغييرات أن تخترع لنفسها غيرها.
 */
interface DisplayRow {
  scheduleId: number; courseCode: string; course: string; sectionCode: string;
  time: string; days: string; room: string; instructor: string;
  dayOrder?: number; startMinutes?: number;
}
interface DiffEntry {
  kind: "added" | "removed" | "changed";
  scheduleId: number; row: any; changes: DiffChange[];
  display: DisplayRow;
}
interface FullRow extends DisplayRow { changed: boolean; changeKind?: DiffEntry["kind"] }
interface RegulationNotice {
  rule: string; article: string; source: string;
  approvalEffect: "note" | "review";
  title: string; detail: string; rowIds: number[];
}

interface ReviewBlocker {
  id: string; type: string; title: string; detail: string; rowIds: number[];
  subjectKey?: string; subjectLabel?: string;
}

interface ChangeReport {
  approval: { status: ScheduleApprovalStatus; currentRound: number; pendingAdditions: any[]; signatures: any[] };
  statusLabel: string; round: number;
  /** عددُ مواعيد الجدول الحيّ الآن — يُرسل مع القرار ليُعرف أنه على ما رُئي. */
  rowCount?: number;
  /** أوثيقةُ الهيئة متاحةٌ أساساً للمقارنة ولو لم تُختر. */
  authorityAvailable?: boolean;
  /** جولةٌ مضت تُقرأ بين أساسها ونهايتها. */
  viewingPastRound?: boolean;
  rounds: Array<{ number: number; submittedAt?: string; submittedBy?: string; returnedAt?: string; returnedBy?: string; returnedNoteCount?: number; changedRowCount?: number; acceptedAt?: string; acceptedBy?: string }>;
  deadline: InboxRow["deadline"];
  diff: { entries: DiffEntry[]; counts: { added: number; removed: number; changed: number; unchanged: number }; firstReview: boolean };
  /** من أين تبدأ المقارنة: النسخة المعتمدة، أو نسخة جولة، أو لقطة محفوظة، أو لا شيء. */
  baselineSource?: "authority" | "round" | "capture" | "reviewed" | "none";
  authoritySource?: { draftId: string; name: string; sourceFileName: string; importedAt?: string; publishedAt?: string | null };
  fullSchedule?: FullRow[];
  summary: string;
  notes: NoteRow[];
  /** نصٌّ جاهزٌ لكل خانةٍ يعرف النظام سببَ الشكّ فيها، مفتاحه `صف:خانة`. */
  suggestions?: Record<string, string>;
  blockingConflicts: number;
  regulationNotices: RegulationNotice[];
  /** نفس الموانع التفصيلية التي تظهر في مراجعة الاعتماد، لا عدّاداً منفصلاً. */
  reviewBlockers?: ReviewBlocker[];
}

export interface ScheduleChangesRole {
  id: string;
  canReview: boolean;
  canManageDeadline: boolean;
  /** يعلّق على الخانات: التسجيل والقسم كلاهما. */
  canAnnotate: boolean;
  signatureStage: "committee" | "head" | null;
}

interface Props {
  role: ScheduleChangesRole;
  /** نطاق القسم حين تُفتح الشاشة من جدول قسمٍ بعينه. */
  scope?: { collegeId: number; sectionId: number; collegeName?: string; sectionName?: string } | null;
  /** صفوف نطاق القارئ كما وصلت الجلسة. */
  scopes?: ScopeAssignmentLike[];
  powerAdmin?: boolean;
}

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const body = await response.text();
  let data: any = {};
  if (body) {
    try { data = JSON.parse(body); }
    catch { throw new Error(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`); }
  }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

/** التاريخ كما يُقرأ في الكويت: يومٌ وشهرٌ وسنة، لا طابعٌ زمنيّ كامل. */
const arabicDate = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
};

/** سطرُ الموعد المتبقّي. يقوله بالأيام لأن الأيام هي ما يُخطَّط به. */
function deadlineSentence(deadline: InboxRow["deadline"]): string {
  if (!deadline.effective) return "لا موعد تسليمٍ محدَّد لهذا الفصل";
  const days = deadline.daysLeft ?? 0;
  if (deadline.past) return `انقضى الموعد ${arabicDate(deadline.effective)} — بعده بـ${countOf(Math.abs(days), oblique(AR.day), "ساعات")}`;
  if (days === 0) return `آخر موعد للتسليم اليوم — ${arabicDate(deadline.effective)}`;
  if (days === 1) return `آخر موعد للتسليم غداً — ${arabicDate(deadline.effective)}`;
  return `آخر موعد للتسليم ${arabicDate(deadline.effective)} — بقي ${countOf(days, AR.day)}`;
}

export function DeadlineStrip({ deadline }: { deadline?: InboxRow["deadline"] }) {
  if (!deadline || deadline.tone === "none") return null;
  return (
    <div className="deadline-strip" data-tone={deadline.tone}>
      <Clock3 aria-hidden="true" />
      <span><strong>{deadlineSentence(deadline)}</strong></span>
      {deadline.extensionUntil ? (
        <span className="deadline-extension">
          تمديدٌ خاصّ بالقسم{deadline.extensionReason ? ` — ${deadline.extensionReason}` : ""}
        </span>
      ) : null}
    </div>
  );
}

export function ApprovalChip({ status, late }: { status: ScheduleApprovalStatus; late?: boolean }) {
  if (late) return <span className="approval-chip" data-status="late">متأخّر عن الموعد</span>;
  return <span className="approval-chip" data-status={status}>{APPROVAL_STATUS_LABEL[status]}</span>;
}

/* ── صندوق الوارد ───────────────────────────────────────────────────────── */

function Inbox_({ termId, terms, onTermChange, onOpen, canExtend, onLoaded, onExtend, scopes = [], powerAdmin = false }: {
  termId: number;
  /** نطاق القارئ: منه وحده يُقرّر أيُرسم منتقي القسم (singleDepartmentOf). */
  scopes?: ScopeAssignmentLike[];
  powerAdmin?: boolean;
  terms: AdTerm[];
  onTermChange: (termId: number) => void;
  onOpen: (row: InboxRow) => void;
  canExtend: boolean;
  /** الوارد نفسه يُسلَّم للوحة «مواعيد التسليم» — قراءةٌ واحدة للشاشة. */
  onLoaded?: (rows: InboxRow[] | null) => void;
  /** «تمديد» في السطر يفتح ورقة الاستثناء في اللوحة، لا ورقةً ثانية. */
  onExtend?: (row: InboxRow) => void;
  key?: React.Key;
}) {
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [totals, setTotals] = useState<{ waiting: number; returned: number; accepted: number; late: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "returned" | "accepted">("all");
  const [ask, setAsk] = useState("");
  /* الجملة تُقرأ عند الإرسال لا عند كل حرف: قارئٌ يكتب «متأخر» حرفاً حرفاً
     يمرّ على «م» و«مت» و«متأ»، ولو فُلتِر عند كلٍّ منها لرقصت الشاشة تحت يده. */
  const [parsed, setParsed] = useState<InboxAsk>(EMPTY_INBOX_ASK);
  /* الكلية والقسم من النطاق المشترك (src/utils/sharedScope.ts): معروضان على
     نطاق القارئ، ويُكتبان حين يختارهما بيده. */
  const reader = { scopes, isAdmin: powerAdmin };
  const [collegeId, setCollegeId] = useState(() => resolveSharedScope(readSharedScope(), reader).collegeId);
  const [sectionId, setSectionId] = useState(() => resolveSharedScope(readSharedScope(), reader).sectionId);
  const sharedScope = useSharedScope((incoming) => {
    const next = resolveSharedScope(incoming, reader);
    setCollegeId(next.collegeId);
    setSectionId(next.sectionId);
  });
  const [moreOpen, setMoreOpen] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [signalFilters, setSignalFilters] = useState<InboxAskSignal[]>([]);
  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await request(`/api/approvals/inbox?termId=${termId}`);
      setRows(data.rows || []);
      setTotals(data.totals || null);
      onLoaded?.(data.rows || []);
    } catch (e: any) { setError(e.message); setRows([]); onLoaded?.([]); }
  }, [termId]);

  useEffect(() => { void load(); }, [load]);

  /* الكليات والأقسام تُبنى من الوارد نفسه، لا من قراءةٍ ثانية: الشاشة لا تعرض
     قسماً ليس في وارِدها، فقائمةٌ تحوي ما لا يُعرض تَعِد بنتائجَ لا توجد. */
  const collegeOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows || []) if (!seen.has(row.collegeId)) seen.set(row.collegeId, row.collegeName || `كلية ${row.collegeId}`);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows]);

  /* نطاقٌ مشترك لا يظهر في هذا الوارد (كليةٌ لا قسمَ فيها ينتظر) يُعرض «الكل»
     هنا، ولا يُمحى من النطاق المشترك. */
  const shownCollege = collegeOptions.some(option => option.value === collegeId) ? collegeId : 0;
  const sectionOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows || []) {
      if (shownCollege && row.collegeId !== shownCollege) continue;
      if (!seen.has(row.sectionId)) seen.set(row.sectionId, row.sectionName || `قسم ${row.sectionId}`);
    }
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows, shownCollege]);
  const shownSection = shownCollege && sectionOptions.some(option => option.value === sectionId) ? sectionId : 0;

  /* الجملة والمرشّحات مصدرٌ واحد: ما تفهمه الجملة يُضاف إلى ما اختاره القارئ
     بيده، ولا يمحوه. من كتب «متأخر» ثم ضغط «فيه موانع» يريد الاثنين. */
  const effective: InboxAsk = useMemo(() => ({
    ...parsed,
    status: statusFilter !== "all" ? statusFilter : parsed.status,
    lateOnly: lateOnly || parsed.lateOnly,
    signals: [...new Set([...parsed.signals, ...signalFilters])],
  }), [parsed, statusFilter, lateOnly, signalFilters]);

  const visible = useMemo(() => (rows || []).filter(row => {
    if (shownCollege && row.collegeId !== shownCollege) return false;
    if (shownSection && row.sectionId !== shownSection) return false;
    return matchesInboxAsk(row, effective);
  }), [rows, shownCollege, shownSection, effective]);

  /* عددُ ما هو نشطٌ داخل «المزيد» وحدَه — الكلية والقسم والفصل ظاهرةٌ بأعينها
     فوقه، وعدُّها مرّتين يقول للقارئ إن شيئاً مخفيّاً وليس كذلك. */
  const activeMoreCount = (statusFilter !== "all" ? 1 : 0) + (lateOnly ? 1 : 0) + signalFilters.length;

  const toggleSignal = (signal: InboxAskSignal) =>
    setSignalFilters(current => current.includes(signal) ? current.filter(item => item !== signal) : [...current, signal]);

  const clearAll = () => {
    setParsed(EMPTY_INBOX_ASK); setStatusFilter("all"); setLateOnly(false);
    setSignalFilters([]); setCollegeId(0); setSectionId(0);
  };

  const askNote = ask.trim()
    ? (parsed.understood || parsed.text
        ? parsed.note
        : "لم أفهم هذه الجملة. جرّب: «متأخر وفيه موانع» أو اسم القسم.")
    : null;

  const selects: ScopeAskSelect[] = [
    {
      key: "college", label: "الكلية", value: shownCollege, placeholder: "كل الكليات",
      options: collegeOptions,
    },
    /* قسمٌ واحد في نطاق القارئ: لا منتقيَ له، كلوحة الجدول. */
    ...(singleDepartmentOf(scopes, shownCollege, powerAdmin) === null ? [{
      key: "section", label: "القسم", value: shownSection, placeholder: "كل الأقسام",
      options: sectionOptions, disabled: sectionOptions.length === 0,
    }] : []),
    {
      key: "term", label: "الفصل", value: termId, placeholder: "اختر الفصل",
      options: terms.map(row => ({ value: row.AdTermId, label: row.AdTermName })),
    },
  ];

  if (!rows) return <MicroLoader label="يقرأ الوارد…" />;

  return (
    <>
      {error ? <Notice type="error">{error}</Notice> : null}
      {/* الشريط نفسه الذي فوق مركز الاستعلام: سؤالٌ بالعربية أولاً، ثم الكلية
          والقسم والفصل، وما زاد عليها مطويٌّ خلف «المزيد». الشرائحُ لم تُلغَ —
          نزلت إلى داخله، لأنها تصف ما يُعرض لا ما يُسأل عنه. */}
      <ScopeAskBar
        idPrefix="changes-inbox"
        label="نطاق الوارد"
        ask={ask}
        onAskChange={value => { setAsk(value); if (!value.trim()) setParsed(EMPTY_INBOX_ASK); }}
        onAskSubmit={value => setParsed(parseInboxAsk(value))}
        askPlaceholder="اسأل: الأقسام المتأخرة اللي عندها موانع"
        askNote={askNote}
        onClear={clearAll}
        selects={selects}
        onSelect={(key, value) => {
          const id = Number(value) || 0;
          if (key === "college") { sharedScope.pick({ collegeId: id, sectionId: 0 }); setCollegeId(id); setSectionId(0); }
          else if (key === "section") { sharedScope.pick({ sectionId: id }); setSectionId(id); }
          else onTermChange(id);
        }}
        moreOpen={moreOpen}
        onToggleMore={() => setMoreOpen(open => !open)}
        activeMoreCount={activeMoreCount}
        more={
          <>
            <div className="field wide">
              <label>الحالة</label>
              <div className="changes-filter-chips" role="group" aria-label="فلترة بالحالة">
                {([
                  // «الكل» يعدّ كل بطاقةٍ معروضة — فيها «قيد الإعداد» للأقسام التي لم
                  // تبدأ بعد — لا الحالاتِ الثلاث وحدها، فلا يقول ٣ ويعرض ٥.
                  ["all", "الكل", (rows || []).length],
                  ["submitted", "بانتظار المراجعة", totals?.waiting || 0],
                  ["returned", "عند القسم", totals?.returned || 0],
                  ["accepted", "معتمد", totals?.accepted || 0],
                ] as Array<[typeof statusFilter, string, number]>).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    className="changes-chip"
                    data-active={statusFilter === value || undefined}
                    aria-pressed={statusFilter === value}
                    data-guide-ignore="فلترة الوارد بالحالة — عرضٌ لا فعل، ولا يغيّر بيانات"
                    onClick={() => setStatusFilter(value)}
                  >
                    {label}{count ? <b>{count}</b> : null}
                  </button>
                ))}
              </div>
            </div>
            <div className="field wide">
              <label>ما الذي يستحق الانتباه</label>
              <div className="changes-filter-chips" role="group" aria-label="فلترة بما يستحق الانتباه">
                {([
                  ["late", "متأخّر عن الموعد", totals?.late || 0],
                  ["blocking", "فيه موانع", 0],
                  ["openNotes", "ملاحظات مفتوحة", 0],
                  ["answered", "ردود تنتظر قرارك", 0],
                  ["pendingAdditions", "شُعب تنتظر رئيس القسم", 0],
                ] as Array<[string, string, number]>).map(([value, label, count]) => {
                  const on = value === "late" ? lateOnly : signalFilters.includes(value as InboxAskSignal);
                  return (
                    <button
                      key={value}
                      type="button"
                      className="changes-chip"
                      data-active={on || undefined}
                      aria-pressed={on}
                      data-guide-ignore="فلترة الوارد بالإشارات — عرضٌ لا فعل، ولا يغيّر بيانات"
                      onClick={() => value === "late" ? setLateOnly(flag => !flag) : toggleSignal(value as InboxAskSignal)}
                    >
                      {label}{count ? <b>{count}</b> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        }
      />


      {visible.length === 0 ? (
        <EmptyState
          title={(rows || []).length ? "لا نتائج" : "لا وارد"}
          detail={(rows || []).length
            ? "لا قسمَ يطابق السؤال أو المرشّحات الحالية."
            : "لم يصل جدولٌ يحتاج مراجعتك في هذا الفصل."}
          action={(rows || []).length ? (
            <SecondaryButton type="button" data-guide-ignore="مسح المرشّحات — عرضٌ لا فعل" onClick={() => { setAsk(""); clearAll(); }}>
              امسح المرشّحات
            </SecondaryButton>
          ) : undefined}
        />
      ) : (
        <div className="changes-inbox">
          {visible.map(row => (
            <div key={`${row.collegeId}:${row.sectionId}`} className="changes-inbox-row" data-status={row.status} data-late={row.late || undefined}>
              <button type="button" className="changes-inbox-open" data-guide-ignore="فتح قسمٍ من الوارد — تنقّل لا فعل، والفعل داخله مسجّل" onClick={() => onOpen(row)}>
                <div className="changes-inbox-title">
                  <strong>{row.sectionName || `قسم ${row.sectionId}`}</strong>
                  <small>{row.collegeName}</small>
                </div>
                {/* ثلاث دوائر بأرقامها: الموظّف يعرف أين المشكلة قبل أن يفتح. */}
                <div className="changes-signals" aria-label="الموانع والملاحظات">
                  {row.blockingConflicts ? <span data-kind="block" title="تعارض مادّي يمنع الاعتماد">{row.blockingConflicts}</span> : null}
                  {row.openNotes ? <span data-kind="note" title="ملاحظات بانتظار المعالجة">{row.openNotes}</span> : null}
                  {row.answeredNotes ? <span data-kind="answered" title="ردودٌ من القسم تنتظر قرارك">{row.answeredNotes}</span> : null}
                  {row.pendingAdditions ? <span data-kind="pending" title="شُعبٌ تنتظر إقرار رئيس القسم">{row.pendingAdditions}</span> : null}
                </div>
                <div className="changes-inbox-state">
                  <ApprovalChip status={row.status} late={row.late} />
                  {row.round > 1 ? <small>الجولة {row.round}</small> : null}
                </div>
                <ChevronLeft aria-hidden="true" />
              </button>
              {/* طلبُ القسم يُقرأ في مكانه، و«تمديد» يُفتح مملوءاً بما طلب. */}
              {row.extensionRequest ? (
                <small className="changes-extension-request">
                  <b>طلب تمديد {countOf(row.extensionRequest.days, oblique(AR.day))}</b>
                  <span>«{row.extensionRequest.reason}»</span>
                  <i>· {row.extensionRequest.by}</i>
                </small>
              ) : null}
              {canExtend && onExtend ? (
                <button type="button" className="changes-extend" data-pending={row.extensionRequest ? "" : undefined} data-guide-ignore="يفتح ورقة الاستثناء في «مواعيد التسليم» على هذا القسم — التطبيق هناك هو الفعل" onClick={() => onExtend(row)}>
                  {row.extensionRequest ? "نظر الطلب" : row.deadline.extensionUntil ? "استثناء" : "تمديد"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

    </>
  );
}

/* ── تقرير الجولة ───────────────────────────────────────────────────────── */

const KIND_LABEL: Record<DiffEntry["kind"], string> = { added: "مضاف", removed: "محذوف", changed: "معدّل" };

/**
 * نفس بطاقات مراجعة الاعتماد، داخل موضع المراجعة الفعلي.
 *
 * نستعمل أصناف `review-*` نفسها التي ترسمها ScheduleReview، فلا يصبح للنظام
 * عرضٌ ثالث للملاحظة اللائحية. المحتوى يصل مفصلاً من فاحص النطاق نفسه، وليس
 * عداداً يطلب من القارئ أن يبحث عن التفاصيل في شاشة أخرى.
 */
/**
 * ── تفاصيلُ الملاحظة في مكانها، كما في «الجدول الدراسي» ───────────────────
 *
 * كان الضغطُ على ملاحظةٍ هنا ينقل القارئ إلى الجدول فوراً — فيغادر المراجعة
 * ليعرف من المقصود. وفي «الجدول الدراسي» الضغطةُ تفتح الملاحظةَ في مكانها:
 * أسماءُ الأساتذة وشعبُهم وأوقاتُهم، ثم زرٌّ صريحٌ لمن أراد الانتقال. فصارت هنا
 * كذلك، بالأصناف نفسِها (`review-person`، `review-row-card`) فلا يفترق الشكلان.
 */
function FindingRows({ rowIds, rowsById, onJump }: { rowIds: number[]; rowsById: Map<number, DisplayRow>; onJump: (rowIds: number[]) => void }) {
  const groups = new Map<string, DisplayRow[]>();
  for (const id of [...new Set(rowIds.map(Number))]) {
    const row = rowsById.get(id);
    if (!row) continue;
    const who = row.instructor || "بدون أستاذ";
    groups.set(who, [...(groups.get(who) || []), row]);
  }
  const people = [...groups.entries()];
  return (
    <div className="review-rows">
      {people.length ? people.slice(0, 12).map(([who, rows]) => (
        <React.Fragment key={who}><FindingPerson who={who} rows={rows} onJump={onJump} /></React.Fragment>
      )) : <p className="review-more">المواعيد المعنيّة خارج ما يعرضه هذا التقرير.</p>}
      {people.length > 12 ? <p className="review-more">و{countOf(people.length - 12, AR.instructor)} غيرهم…</p> : null}
    </div>
  );
}

function FindingPerson({ who, rows, onJump }: { who: string; rows: DisplayRow[]; onJump: (rowIds: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const single = rows.length === 1;
  const sectionCount = new Set(rows.map(row => `${row.courseCode}:${row.sectionCode}`)).size;
  return (
    <div className={`review-person ${open ? "open" : ""}`}>
      <button type="button" className="review-person-head" data-guide-ignore="طيّ شعب أستاذ داخل ملاحظة مراجعة — عرض فقط، لا يغيّر الجدول" onClick={() => !single && setOpen(value => !value)} aria-expanded={single ? undefined : open}>
        <strong>{who}</strong>
        {single ? (
          <small>{rows[0].course}{rows[0].courseCode ? <> · <bdi dir="ltr">{rows[0].courseCode}</bdi></> : null} · شعبة {rows[0].sectionCode}</small>
        ) : (
          <>
            <span className="review-person-count" title={countOf(rows.length, AR.appointment)}>{countOf(sectionCount, AR.section)}</span>
            <ChevronDown className="review-person-chevron" aria-hidden="true" />
          </>
        )}
      </button>
      {(open || single) ? (
        <div className="review-person-rows">
          {rows.map(row => (
            /* الضغطُ على المقرّر ينقل إلى موعده هو وحده في الجدول. */
            <button type="button" key={row.scheduleId} className="review-row-card review-row-jump" title="انتقل إلى هذا الموعد في الجدول" data-guide-ignore="انتقالٌ إلى موعدٍ واحد في الجدول — تنقّلٌ لا يعدّل البيانات" onClick={() => onJump([row.scheduleId])}>
              <span className="rrc-code" dir="ltr">{row.courseCode || "—"}</span>
              <div className="rrc-main">
                {single ? null : <strong>{row.course}</strong>}
                <small>شعبة {row.sectionCode} · {row.days || "بلا أيام"}{row.room ? <> · <bdi dir="ltr">{row.room}</bdi></> : null}</small>
              </div>
              <time className="rrc-time" dir="ltr">{row.time}</time>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RegulationReview({ notices, onJump, rowsById }: { notices: RegulationNotice[]; onJump: (rowIds: number[]) => void; rowsById: Map<number, DisplayRow> }) {
  const [open, setOpen] = useState(false);
  const [openNotice, setOpenNotice] = useState<string | null>(null);
  if (!notices.length) return null;
  const preview = notices.slice(0, 3).map(item => item.title).join(" · ");
  return (
    <section className={`review-quiet changes-regulation-review ${open ? "open" : ""}`}>
      <button
        type="button"
        className="review-quiet-toggle"
        data-guide-ignore="فتح الملاحظات اللائحية في شاشة تغييرات الجدول — عرض فقط"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
      >
        <span className="review-mark" aria-hidden="true"><CheckCircle2 /></span>
        <span className="review-copy">
          <strong>{countOf(notices.length, AR.note)} لا {nounFor(notices.length, AR.blockFemVerb)} الاعتماد</strong>
          <small>{preview}{notices.length > 3 ? ` · و${(notices.length - 3).toLocaleString("ar-KW-u-nu-latn")} غيرها` : ""}</small>
        </span>
        <i>{countOf(new Set(notices.flatMap(item => item.rowIds)).size, AR.appointment)}</i>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="review-quiet-list">
          {notices.map((notice, index) => {
            const key = `${notice.rule}:${index}`;
            const medium = notice.approvalEffect === "review";
            return (
              <article key={key} className={`review-finding severity-${medium ? "medium" : "low"} ${openNotice === key ? "open" : ""}`}>
                <button
                  type="button"
                  data-guide-ignore="فتح تفاصيل ملاحظة داخل مراجعة الاعتماد فقط"
                  onClick={() => setOpenNotice(current => current === key ? null : key)}
                  aria-expanded={openNotice === key}
                >
                  <span className="review-mark" aria-hidden="true">{medium ? <Info /> : <CheckCircle2 />}</span>
                  <span className="review-copy">
                    <strong>{notice.title}</strong>
                    <small>{notice.rowIds.length ? `${countOf(notice.rowIds.length, AR.appointment)} ${nounFor(notice.rowIds.length, AR.affectedAdj)}` : "تنبيه لائحي"}</small>
                  </span>
                  <em>{notice.article}</em>
                  <i>{medium ? "مراجعة لائحية" : "ملاحظة لائحية"}</i>
                </button>
                {openNotice === key ? (
                  <>
                    {notice.detail ? <div className="review-finding-detail"><p>{notice.detail}</p></div> : null}
                    <FindingRows rowIds={notice.rowIds} rowsById={rowsById} onJump={onJump} />
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
 }

/**
 * ملخّص الاعتماد نفسه الذي اعتادت عليه نافذة المراجعة، لكن داخل «تغييرات
 * الجدول»؛ فهذه هي الأيقونة/الشاشة التي يرجع إليها المستخدم لمعرفة السبب.
 * لا تُعاد الرسالة الحمراء في كل مكان، ولا يُطلب منه أن يفتح نافذة أخرى.
 */
function ChangesReviewOverview({ report, scopeLine, onJump }: { report: ChangeReport; scopeLine: string; onJump: (rowIds: number[]) => void }) {
  const [open, setOpen] = useState(false);
  const [openBlocker, setOpenBlocker] = useState<string | null>(null);
  /* صفوفُ النطاق كما يعرضها التقرير نفسُه — الجدول كاملاً ومعه المحذوف — فتُسمّى
     المواعيدُ المعنيّة بأساتذتها دون أن يغادر القارئ المراجعة. */
  const rowsById = useMemo(() => {
    const map = new Map<number, DisplayRow>();
    for (const row of report.fullSchedule || []) map.set(Number(row.scheduleId), row);
    for (const entry of report.diff.entries || []) if (entry.display && !map.has(Number(entry.scheduleId))) map.set(Number(entry.scheduleId), entry.display);
    return map;
  }, [report.fullSchedule, report.diff.entries]);
  const blockers = report.reviewBlockers || [];
  const notices = report.regulationNotices || [];
  const rowCount = Math.max(0, report.diff.counts.added + report.diff.counts.changed + report.diff.counts.unchanged);

  /* الحلقة تخص قرار 1913/2016 كما في ScheduleReview بالضبط؛ موانع الحفظ
     منفصلةٌ عنها لأنها ليست درجةً لائحية. */
  const decisionFindings = useMemo<RegulationFinding[]>(() => notices
    .filter(item => item.source === "decision-1912")
    .map(item => ({
      rule: item.rule,
      article: item.article,
      severity: item.approvalEffect === "review" ? "medium" : "low",
      source: "decision-1912",
      approvalEffect: item.approvalEffect,
      title: item.title,
      detail: item.detail,
      rowIds: item.rowIds,
    })), [notices]);
  const score = useMemo(() => regulationScore(decisionFindings, rowCount), [decisionFindings, rowCount]);

  const spread = useMemo(() => {
    const state = new Map<number, "high" | "medium" | "low">();
    const rank = { high: 3, medium: 2, low: 1 } as const;
    const mark = (ids: number[], level: "high" | "medium" | "low") => {
      for (const rawId of ids || []) {
        const id = Number(rawId);
        if (!id) continue;
        const current = state.get(id);
        if (!current || rank[level] > rank[current]) state.set(id, level);
      }
    };
    blockers.forEach(item => mark(item.rowIds, "high"));
    notices.forEach(item => mark(item.rowIds, item.approvalEffect === "review" ? "medium" : "low"));
    const counts = { high: 0, medium: 0, low: 0 };
    state.forEach(level => { counts[level] += 1; });
    const flagged = counts.high + counts.medium + counts.low;
    return { ...counts, clean: Math.max(0, rowCount - flagged), total: Math.max(1, rowCount) };
  }, [blockers, notices, rowCount]);
  const share = (value: number) => `${(value / spread.total) * 100}%`;
  const blockedCount = Math.max(blockers.length, report.blockingConflicts || 0);
  const tone = blockedCount ? "danger" : score >= 85 ? "good" : "warn";
  const ringLength = 2 * Math.PI * 26;
  const hasFindings = blockers.length > 0 || notices.length > 0;

  return (
    <section className={`changes-review-overview ${open ? "open" : ""}`} aria-label="مراجعة الاعتماد">
      <button type="button" className="changes-review-toggle" data-guide-ignore="طيّ ملخص مراجعة الاعتماد وفتحه — عرض فقط ولا يغيّر بيانات" onClick={() => setOpen(value => !value)} aria-expanded={open}>
        <span className={`review-mini-dot tone-${tone}`} aria-hidden="true" />
        <span><strong>مراجعة الاعتماد</strong><small>{blockedCount ? countOf(blockedCount, AR.approvalBlocker) : notices.length ? countOf(notices.length, AR.note) : "لا ملاحظات"}</small></span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? <div className="changes-review-panel">
      <header className={`review-head tone-${tone}`}>
        <svg className="review-ring" viewBox="0 0 64 64" role="img" aria-label={`مطابقة ${DECISION_1912_LABEL} ${score} من 100`}>
          <circle className="ring-track" cx="32" cy="32" r="26" />
          <circle className="ring-value" cx="32" cy="32" r="26" strokeDasharray={`${(score / 100) * ringLength} ${ringLength}`} />
          <text x="32" y="34" className="ring-number">{score.toLocaleString("ar-KW-u-nu-latn")}</text>
          <text x="32" y="45" className="ring-unit">/ 100</text>
        </svg>
        <div className="review-title">
          <span className="surface-kicker">مراجعة الاعتماد · {DECISION_1912_LABEL}</span>
          <h2>{blockedCount ? "يوجد ما يمنع الاعتماد" : notices.length ? "جاهز مع تنبيهات" : "مطابق للتنبيهات المعتمدة"}</h2>
          <p>{scopeLine}</p>
        </div>
      </header>

      <div className="review-spread" role="img" aria-label="توزيع المواعيد حسب الملاحظات">
        <div className="spread-bar">
          {spread.high ? <i className="seg-high" style={{ width: share(spread.high) }} title={`${spread.high} يمنع`} /> : null}
          {spread.medium ? <i className="seg-medium" style={{ width: share(spread.medium) }} title={`${spread.medium} يراجَع`} /> : null}
          {spread.low ? <i className="seg-low" style={{ width: share(spread.low) }} title={countOf(spread.low, AR.note)} /> : null}
          {spread.clean ? <i className="seg-clean" style={{ width: share(spread.clean) }} title={`${spread.clean} سليم`} /> : null}
        </div>
        <div className="spread-keys">
          <span className="seg-high"><AlertTriangle aria-hidden="true" /><b>{spread.high.toLocaleString("ar-KW-u-nu-latn")}</b><small>يمنع</small></span>
          <span className="seg-medium"><Info aria-hidden="true" /><b>{spread.medium.toLocaleString("ar-KW-u-nu-latn")}</b><small>يراجَع</small></span>
          <span className="seg-low"><ClipboardCheck aria-hidden="true" /><b>{spread.low.toLocaleString("ar-KW-u-nu-latn")}</b><small>{nounFor(spread.low, AR.note)}</small></span>
          <span className="seg-clean"><CheckCircle2 aria-hidden="true" /><b>{spread.clean.toLocaleString("ar-KW-u-nu-latn")}</b><small>سليم</small></span>
        </div>
      </div>

      <div className="review-body">
        {blockers.map((blocker, index) => {
          const key = blocker.id || `blocker-${index}`;
          return (
            <article key={key} className={`review-finding severity-high ${openBlocker === key ? "open" : ""}`}>
              <button type="button" data-guide-ignore="فتح تفاصيل مانع داخل مراجعة الاعتماد فقط" onClick={() => setOpenBlocker(current => current === key ? null : key)} aria-expanded={openBlocker === key}>
                <span className="review-mark" aria-hidden="true"><AlertTriangle /></span>
                <span className="review-copy">
                  <strong>{blocker.title || "يوجد مانع اعتماد"}</strong>
                  <small>{blocker.subjectLabel || (blocker.rowIds.length ? `${countOf(blocker.rowIds.length, AR.appointment)} ${nounFor(blocker.rowIds.length, AR.affectedAdj)}` : "يحتاج معالجة قبل الاعتماد")}</small>
                </span>
                <em>موانع الحفظ</em>
                <i>يمنع الاعتماد</i>
              </button>
              {openBlocker === key ? (
                <>
                  {blocker.detail ? <div className="review-finding-detail"><p>{blocker.detail}</p></div> : null}
                  <FindingRows rowIds={blocker.rowIds} rowsById={rowsById} onJump={onJump} />
                </>
              ) : null}
            </article>
          );
        })}
        <RegulationReview notices={report.regulationNotices || []} onJump={onJump} rowsById={rowsById} />
        {!hasFindings ? (
          <div className="review-clear">
            <CheckCircle2 />
            <strong>لا ملاحظات</strong>
            <span>لا توجد موانع حفظ، ولا تنبيهات لائحية ظاهرة ضمن النطاق الذي يفحصه النظام.</span>
          </div>
        ) : null}
      </div>
      </div> : null}
    </section>
  );
}

/**
 * ── صفُّ الموعد، بالشكل الذي يقرؤه الناسُ كلَّ يوم ──────────────────────────
 *
 * «مواعيد القسم» في ورشة الجدول هي الشكلُ المستقرّ في هذا النظام، ويستعمله
 * الجميع: رقمٌ متسلسل، ثم رمزُ المقرّر واسمُه وشعبتُه، وتحتها أستاذُه وأيامُه،
 * ثم الوقتُ والمكان كلٌّ بأيقونته.
 *
 * وشاشةُ التغييرات كانت تعرض اسمَ المقرّر ورقمَ الشعبة وحدهما، فيقرأ موظّفُ
 * التسجيل «تغيّرت القاعة» ولا يعرف في أيِّ موعدٍ من الأسبوع، ولا من يُدرّسه.
 * فلبست الشكلَ نفسَه بأصنافه نفسِها — لا شكلاً يشبهه: ما يتحسّن هناك يتحسّن
 * هنا، ولا تفترق شاشتان تعرضان الشيءَ نفسَه.
 */
function ScheduleRowCard({ row, index, kind, tag, changes, children }: {
  row: DisplayRow;
  index: number;
  kind?: DiffEntry["kind"];
  /** كلمةٌ تُقال فوق الصفّ: «معدّل»، أو «تحرّك» في الجدول الكامل. */
  tag?: string;
  /** ما تحرّك في هذا الصفّ، ليُعلَّم كلُّ تغييرٍ في خانته هو. */
  changes?: DiffChange[];
  children?: React.ReactNode;
  /* الأصنافُ الصريحةُ في هذا الملفّ تُعلن مفتاحَها، وإلا رفضه المترجم. */
  key?: React.Key;
}) {
  /* ── وأين وقع التغييرُ بالضبط ─────────────────────────────────────────
   *
   * قائمةٌ تحت الصفّ تقول «القاعة: من ١٢٠ إلى ١٢٤» تجعل القارئ يقرأ الصفَّ
   * مرّةً ثم يقرأ القائمةَ مرّةً ثم يربط بينهما بعينه. وهو ربطٌ يُخطئ فيه من
   * يراجع عشرين قسماً.
   *
   * فالتغييرُ يُعلَّم في خانته نفسِها: القديمُ مشطوبٌ والجديدُ بعده، في
   * الموضع الذي يقرأ فيه القارئُ تلك القيمةَ أصلاً. فلا ربطَ ولا انتقال.
   */
  const moved = new Map((changes || []).map(change => [change.field, change]));
  const Cell = ({ field, children: fallback }: { field: DiffFieldKey; children: React.ReactNode }) => {
    const change = moved.get(field);
    if (!change) return <>{fallback}</>;
    return (
      <span className="changes-moved" title={`${change.label}: من ${change.before} إلى ${change.after}`}>
        <s>{change.before}</s>
        <ArrowRight aria-hidden="true" />
        <b>{change.after}</b>
      </span>
    );
  };

  return (
    <article className="agenda-card changes-row" id={`schedule-row-${row.scheduleId}`} data-kind={kind}>
      <div className="agenda-index">{String(index + 1).padStart(2, "0")}</div>
      <div className="agenda-core">
        <div className="agenda-title-row">
          {tag ? <span className="changes-kind">{tag}</span> : null}
          <span className="code-chip">{row.courseCode || "—"}</span>
          <strong><Cell field="course">{row.course}</Cell></strong>
          <Badge tone="neutral">شعبة <Cell field="sectionCode">{row.sectionCode}</Cell></Badge>
        </div>
        <div className="agenda-sub">
          <span data-changed={moved.has("instructor") || undefined}>
            <UsersRound aria-hidden="true" />
            <Cell field="instructor">{row.instructor || "بدون أستاذ"}</Cell>
          </span>
          <span data-changed={moved.has("days") || undefined}>
            <CalendarDays aria-hidden="true" />
            <Cell field="days">{row.days || "بدون أيام"}</Cell>
          </span>
        </div>
      </div>
      <div className="agenda-time" title="الوقت" data-changed={moved.has("time") || undefined}>
        <Clock3 aria-hidden="true" />
        <strong dir="ltr"><Cell field="time">{row.time || "—"}</Cell></strong>
      </div>
      <div className="agenda-place" title="المكان" data-changed={moved.has("room") || undefined}>
        <MapPin aria-hidden="true" />
        <strong><Cell field="room">{row.room || "—"}</Cell></strong>
      </div>
      {children ? <div className="changes-row-extra">{children}</div> : null}
    </article>
  );
}

/** ما اصطدم فيه الموعدان: القاعة، أو الأستاذ، أو الموعد نفسه. */
const CROSS_KIND_LABEL: Record<string, string> = {
  room: "القاعة", instructor: "أستاذ المقرر", duplicate: "موعدٌ مطابق",
  doorway: "زمنُ الانتقال", cohort: "دفعةُ الطلبة",
};

function Report({ termId, termName, scope, role, onBack }: {
  key?: React.Key;
  termId: number;
  termName?: string;
  scope: { collegeId: number; sectionId: number; collegeName?: string; sectionName?: string };
  role: ScheduleChangesRole;
  onBack?: () => void;
}) {
  const [report, setReport] = useState<ChangeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRounds, setShowRounds] = useState(false);
  /* «ما تحرّك» مدخلُ المراجعة السريعة، و«الجدول كامل» ما يطلبه القسم: أن يرى
     جدولَه كلَّه والملاحظات في مواضعها، لا الملاحظات وحدها. */
  const [view, setView] = useState<"changes" | "full">("changes");
  const [noteDraft, setNoteDraft] = useState<{ scheduleId: number; field: NoteField } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [rebutting, setRebutting] = useState<NoteRow | null>(null);
  const [rebutText, setRebutText] = useState("");
  /* يُبلِّغ شريطَ الاعتماد أن يُعيد قراءةَ حاله بعد توقيعٍ أو إرسال. */
  const [approvalSignal, setApprovalSignal] = useState(0);
  /* أساسُ المقارنة: ما رآه التسجيل في الجولة، أو وثيقةُ الهيئة. «تلقائي» يترك
     الخادم يختار: الجولةُ متى طُلبت جولة، والوثيقةُ متى لم تُطلب. */
  const [baseline, setBaseline] = useState<"auto" | "round" | "authority">("auto");
  const [viewRound, setViewRound] = useState<number | undefined>(undefined);
  const sortedDiffEntries = useMemo(() => {
    const kindOrder: Record<DiffEntry["kind"], number> = { added: 0, changed: 1, removed: 2 };
    return [...(report?.diff.entries || [])].sort((a, b) =>
      (a.display.dayOrder ?? 99) - (b.display.dayOrder ?? 99) ||
      (a.display.startMinutes ?? 99999) - (b.display.startMinutes ?? 99999) ||
      kindOrder[a.kind] - kindOrder[b.kind] ||
      a.display.course.localeCompare(b.display.course, "ar")
    );
  }, [report?.diff.entries]);
  const sortedFullSchedule = useMemo(() => [...(report?.fullSchedule || [])].sort((a, b) =>
    (a.dayOrder ?? 99) - (b.dayOrder ?? 99) ||
    (a.startMinutes ?? 99999) - (b.startMinutes ?? 99999) ||
    a.course.localeCompare(b.course, "ar")
  ), [report?.fullSchedule]);

  const load = useCallback(async (round?: number, base: "auto" | "round" | "authority" = "auto") => {
    setError(null);
    try {
      const query = `collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${termId}${round ? `&round=${round}` : ""}${base !== "auto" ? `&baseline=${base}` : ""}`;
      setReport(await request(`/api/reports/schedule-changes?${query}`));
    } catch (e: any) {
      /**
       * ── تقريرٌ أخفقت قراءتُه لا يبقى معروضاً ───────────────────────────
       *
       * كان الخطأ يُعرض ويبقى تقريرُ القسم السابق تحته. فيقرأ الموظّف تغييرات
       * قسمٍ ويضغط «قبول» فيذهب القرار إلى قسمٍ آخر — وهو خطأٌ لا يُكتشف إلا
       * بعد وقوعه، لأن الشاشة كانت متماسكةً تماماً في ظاهرها.
       */
      setReport(null);
      setError(e.message);
    }
  }, [scope.collegeId, scope.sectionId, termId]);

  /* وتبدّلُ القسم يُفرغ ما قبله قبل أن تصل القراءة: لا رأسُ قسمٍ فوق تغييرات
     قسمٍ آخر، ولو للحظة. */
  useEffect(() => {
    setReport(null);
    setShowRounds(false);
    setView("changes");
    setNoteDraft(null);
    setRebutting(null);
    setMessage(null);
    setBaseline("auto");
    setViewRound(undefined);
  }, [scope.collegeId, scope.sectionId, termId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (url: string, body?: unknown, done?: string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      /* القرارُ يحمل ما رآه صاحبه: الجولة وحالها وعدد المواعيد. فإن تغيّر شيءٌ
         منها منذ فُتحت الشاشة ردّه الخادم بدل أن يقع على جدولٍ لم يُقرأ. */
      const seen = report ? {
        expectedRound: report.approval.currentRound,
        expectedStatus: report.approval.status,
        ...(report.rowCount !== undefined ? { expectedRowCount: report.rowCount } : {}),
      } : {};
      await request(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId, ...seen, ...(body as object || {}) }),
      });
      if (done) setMessage(done);
      await load(viewRound, baseline);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const notesByRow = useMemo(() => {
    const map = new Map<number, NoteRow[]>();
    for (const note of report?.notes || []) {
      const list = map.get(note.scheduleId) || [];
      list.push(note);
      map.set(note.scheduleId, list);
    }
    return map;
  }, [report?.notes]);

  const saveNote = async () => {
    if (!noteDraft) return;
    setBusy(true); setError(null);
    try {
      await request("/api/schedule-notes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: noteDraft.scheduleId, field: noteDraft.field, text: noteText }),
      });
      setNoteDraft(null); setNoteText("");
      await load(viewRound, baseline);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const saveRebuttal = async () => {
    if (!rebutting) return;
    setBusy(true); setError(null);
    try {
      await request(`/api/schedule-notes/${rebutting.id}/rebut`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rebutText }),
      });
      setRebutting(null); setRebutText("");
      await load(viewRound, baseline);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!report) return error ? <Notice type="error">{error}</Notice> : <MicroLoader label="يقارن بالجولة السابقة…" />;

  /* العدّاد الواحد الذي يقرؤه الخادم عند الإرجاع: ملاحظاتُ التسجيل وحدها،
     في أيّ جولةٍ كانت. ملاحظةُ القسم الداخلية لا «تُرسل مع الإرجاع». */
  const openNotes = countOpenRegistrarNotes(report.notes);
  const answeredNotes = countAnsweredRegistrarNotes(report.notes);
  const handledNotes = report.notes.filter(note => note.origin === "registrar" && (note.state === "changed" || note.state === "removed")).length;
  const isRegistrar = role.canReview;
  /* «أبقِها كما هي» ردٌّ من القسم، لمن يوقّع فيه وحده — لا لعميد التسجيل ولا
     للعميد، وهما يقرآن ولا يكتبان. */
  const canRebut = Boolean(role.signatureStage) && !isViewerOnlyRole(role.id) && !isRegistrar;
  /* ── من يعلّق، ومن يقرّر ───────────────────────────────────────────────
   * التعليقُ للتسجيل وللقسم كليهما — وهو أوّلُ ما طُلب في هذا العمل: رئيسُ
   * القسم يحطّ ملاحظات ولا يعدّل. والقرارُ — قبولاً وإرجاعاً — للتسجيل وحده.
   * فلا يُخلط البابان: كانت الخاناتُ تُفتح لمن يقرّر، فبقي من يعلّق بلا باب. */
  const canAnnotate = role.canAnnotate;
  const mineOrigin = isRegistrar ? "registrar" : "department";
  const existingNoteFor = (scheduleId: number, field: NoteField) =>
    (notesByRow.get(scheduleId) || []).find(note => note.field === field && note.origin === mineOrigin
      /* ملاحظةُ القسم لكاتبها: لا تُفتح ملاحظةُ زميلك لتُكتب فوقها. */
      && (mineOrigin !== "department" || Boolean(note.mine)));
  /* فتحُ ورقة الملاحظة على خانةٍ بعينها: النصُّ الموجود، وإلا ما يعرفه النظام، وإلا فراغ. */
  const openNote = (scheduleId: number, field: NoteField) => {
    setNoteDraft({ scheduleId, field });
    setNoteText(existingNoteFor(scheduleId, field)?.text || report.suggestions?.[`${scheduleId}:${field}`] || "");
  };
  /* ملاحظاتٌ وتعارضٌ وزرُّ تعليق — مشتركةٌ بين «ما تحرّك» و«الجدول كامل». */
  const rowExtras = (scheduleId: number, annotatable: boolean, defaultField: NoteField) => {
    const notes = notesByRow.get(scheduleId) || [];
    return (
      <>
        {canAnnotate && annotatable ? (
          <button type="button" className="changes-note-add" data-guide-target="changes.action.note" onClick={() => openNote(scheduleId, defaultField)}>
            <MessageSquarePlus aria-hidden="true" /> علّق على خانة
          </button>
        ) : null}

        {notes.length ? (
          <ul className="changes-notes">
            {notes.map(note => (
              <li key={note.id} data-state={note.state}>
                <span className="changes-note-field">
                  {note.fieldLabel}
                  {note.origin === "department" ? <em> · من القسم — <bdi>{note.userName}</bdi></em> : null}
                </span>
                <p>{note.text}</p>
                {note.state === "changed" ? <small>عُولجت — تغيّرت الخانة</small> : null}
                {note.state === "resolved" ? (
                  <small>{note.resolution === "closed-by-acceptance" ? `محسومة — ${CLOSED_BY_ACCEPTANCE_LABEL}` : "محسومة — قُبل تبرير القسم"}</small>
                ) : null}
                {Number(note.insistCount || 0) >= ESCALATE_AFTER_INSISTS ? (
                  <small className="changes-note-stuck">
                    أصرّ التسجيل على هذه الخانة بعد ردّ القسم {countOf(Number(note.insistCount), AR.visit)} — ظهرت لرئيس القسم في شريط الاعتماد. إعلامٌ لا يوقف شيئاً.
                  </small>
                ) : null}
                {note.rebuttalHistory?.length ? (
                  <details className="changes-note-history">
                    <summary>ردودٌ سابقة ({note.rebuttalHistory.length.toLocaleString("ar-KW-u-nu-latn")})</summary>
                    <ul>
                      {note.rebuttalHistory.map((item, index) => (
                        <li key={`${item.at}:${index}`}>«{item.text}» — <bdi>{item.userName}</bdi> · أصرّ التسجيل ({arabicDate(item.insistedAt)})</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {note.rebuttal ? (
                  <blockquote>
                    <strong>ردّ القسم:</strong> {note.rebuttal.text}
                    <cite>{note.rebuttal.userName}</cite>
                  </blockquote>
                ) : null}
                <div className="changes-note-actions">
                  {canRebut && note.origin === "registrar" && note.state === "open" ? (
                    <button type="button" data-guide-ignore="ردّ القسم على ملاحظة — يُفتح به حقلُ السبب، والإرسال داخله" onClick={() => { setRebutting(note); setRebutText(""); }}>أبقِها كما هي</button>
                  ) : null}
                  {isRegistrar && note.state === "answered" ? (
                    <>
                      <button type="button" data-guide-ignore="قبول تبرير القسم على ملاحظةٍ واحدة — قرارٌ داخل الملاحظة لا على الجدول" disabled={busy} onClick={() => void act(`/api/schedule-notes/${note.id}/verdict`, { verdict: "accepted" }, "قُبل تبرير القسم")}>
                        <Check aria-hidden="true" /> مقبول
                      </button>
                      <button type="button" data-guide-ignore="إعادة ملاحظةٍ واحدة إلى الانتظار — قرارٌ داخل الملاحظة لا على الجدول" disabled={busy} onClick={() => void act(`/api/schedule-notes/${note.id}/verdict`, { verdict: "insisted" }, "أُعيدت الملاحظة")}>
                        لا زلت أطلب التغيير
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </>
    );
  };

  return (
    <div className="changes-report">
      {onBack ? (
        <button type="button" className="changes-back" data-guide-ignore="عودة إلى الوارد — تنقّل لا فعل" onClick={onBack}>
          <ArrowRight aria-hidden="true" /> عودة إلى الوارد
        </button>
      ) : null}

      <header className="changes-report-head">
        <div>
          <h2>{scope.sectionName || `قسم ${scope.sectionId}`}</h2>
          <p>{scope.collegeName}</p>
        </div>
        <div className="changes-report-state">
          <ApprovalChip status={report.approval.status} />
          {report.round > 1 ? <Badge tone="info">الجولة {report.round}</Badge> : null}
        </div>
      </header>

      {/* ── شريط الاعتماد لجهة القسم ─────────────────────────────────────────
          رئيسُ القسم واللجنة يوقّعان ويُرسلان من هنا — لا من ورشة تعديلٍ لا
          يفتحها رئيسُ القسم أصلاً. أمّا التسجيل (يراجع) فقرارُه شريطُ القبول
          والإرجاع أسفل الشاشة، لا هذا. */}
      {role.signatureStage && !isRegistrar ? (
        <ApprovalBar
          collegeId={scope.collegeId}
          sectionId={scope.sectionId}
          termId={termId}
          signatureStage={role.signatureStage}
          refreshSignal={approvalSignal}
          onChanged={() => { setApprovalSignal(value => value + 1); void load(); }}
        />
      ) : null}

      <DeadlineStrip deadline={report.deadline} />
      {error ? <Notice type="error">{error}</Notice> : null}
      {message ? <Notice type="success">{message}</Notice> : null}

      <ChangesReviewOverview
        report={report}
        scopeLine={[termName, scope.collegeName, scope.sectionName].filter(Boolean).join(" · ") || `قسم ${scope.sectionId}`}
        onJump={(rowIds) => {
          const id = Number(rowIds?.[0] || 0);
          if (!id) return;
          setView("full");
          window.setTimeout(() => {
            const target = document.getElementById(`schedule-row-${id}`);
            target?.scrollIntoView({ behavior: "smooth", block: "center" });
            target?.classList.add("changes-row-focus");
            window.setTimeout(() => target?.classList.remove("changes-row-focus"), 1800);
          }, 80);
        }}
      />

      <div className="changes-viewbar">
        <div className="changes-summary">
          <FileDiff aria-hidden="true" />
          <strong>{report.summary}</strong>
          {report.diff.counts.unchanged ? <small>{countOf(report.diff.counts.unchanged, AR.appointment)} {nounFor(report.diff.counts.unchanged, AR.unchangedVerb)}</small> : null}
          {/* ── من أين تبدأ المقارنة ──────────────────────────────────────
              «كلُّ صفٍّ مضاف» تعني أحد أمرين لا ثالثَ لهما: جدولٌ جديدٌ فعلاً،
              أو أساسٌ لم يُوجد فقُورن الجدولُ بالعدم. والفرقُ بينهما هو الفرقُ
              بين مراجعةٍ صحيحةٍ ومراجعةٍ ضائعة، فلا يُترك ليُستنتج. */}
          {report.baselineSource === "authority" ? (
            <small className="changes-baseline-note">المقارنة مع النسخة المعتمدة «{report.authoritySource?.sourceFileName || "الجدول المعتمد.pdf"}» — بنفس أساس تقرير تغييرات الجدول الرسمي.</small>
          ) : report.baselineSource === "none" ? (
            <small className="changes-baseline-note">أولُ مراجعةٍ لهذا القسم — لا نسخةَ سابقةَ يُقارَن بها، فكلُّ موعدٍ يُعرض مضافاً.</small>
          ) : report.baselineSource === "reviewed" ? (
            <small className="changes-baseline-note">لم يتحرّك شيءٌ منذ آخر مراجعةٍ للتسجيل — الجدول كما رآه.</small>
          ) : report.baselineSource === "capture" ? (
            <small className="changes-baseline-note">لم تحمل الجولاتُ السابقة نسخةً محفوظة، فالمقارنةُ من آخر لقطةٍ للجدول قبل هذه الجولة.</small>
          ) : null}
          {/* جولةٌ مضت تُقرأ بين أساسها ونهايتها — لا بين أساسها والجدول الآن. */}
          {report.viewingPastRound ? (
            <small className="changes-baseline-note">
              تعرض الجولة {report.round} كما انتهت، لا الجدول الآن.{" "}
              <button type="button" className="changes-inline-link" data-guide-ignore="العودة إلى الجولة الجارية — قراءةٌ لا فعل" onClick={() => { setViewRound(undefined); setBaseline("auto"); void load(undefined, "auto"); }}>
                عُد إلى الجولة الجارية
              </button>
            </small>
          ) : null}
        </div>
        {/* وثيقةُ الهيئة أساسٌ يُختار، لا يُفرض: من يراجع جولةً يريد ما تغيّر منذ رآها. */}
        {report.authorityAvailable && !report.viewingPastRound ? (
          <div className="changes-view-toggle" role="group" aria-label="أساس المقارنة">
            <button type="button" data-active={report.baselineSource !== "authority" || undefined} aria-pressed={report.baselineSource !== "authority"} data-guide-ignore="المقارنة بما رآه التسجيل آخر مرّة — عرضٌ لا فعل" onClick={() => { setBaseline("round"); void load(viewRound, "round"); }}>
              منذ آخر مراجعة
            </button>
            <button type="button" data-active={report.baselineSource === "authority" || undefined} aria-pressed={report.baselineSource === "authority"} data-guide-ignore="المقارنة بوثيقة الهيئة المعتمدة — عرضٌ لا فعل" onClick={() => { setBaseline("authority"); void load(viewRound, "authority"); }}>
              منذ وثيقة الهيئة
            </button>
          </div>
        ) : null}
        {/* تبديلٌ بين ما تحرّك والجدول كامل — القسم يريد رؤية جدوله كله والملاحظات فيه. */}
        <div className="changes-view-toggle" role="group" aria-label="طريقة العرض">
          <button type="button" data-active={view === "changes" || undefined} aria-pressed={view === "changes"} data-guide-ignore="تبديل العرض إلى ما تحرّك — عرضٌ لا فعل" onClick={() => setView("changes")}>
            <FileDiff aria-hidden="true" /> ما تحرّك
          </button>
          <button type="button" data-active={view === "full" || undefined} aria-pressed={view === "full"} data-guide-ignore="تبديل العرض إلى الجدول كامل — عرضٌ لا فعل" onClick={() => setView("full")}>
            <CalendarRange aria-hidden="true" /> الجدول كامل
          </button>
        </div>
      </div>

      {report.rounds.length > 1 ? (
        <div className="changes-rounds" data-open={showRounds || undefined}>
          <button type="button" data-guide-ignore="طيّ الجولات السابقة وفتحها — عرضٌ لا فعل" onClick={() => setShowRounds(v => !v)}>
            <ClipboardList aria-hidden="true" /> الجولات السابقة ({report.rounds.length - 1})
          </button>
          {showRounds ? (
            <ol>
              {report.rounds.map(round => (
                <li key={round.number} data-current={round.number === report.round || undefined}>
                  <strong>الجولة {round.number}</strong>
                  {round.submittedAt ? <span>أُرسلت {arabicDate(round.submittedAt)}{round.submittedBy ? ` — ${round.submittedBy}` : ""}</span> : null}
                  {round.returnedAt ? (
                    <span>
                      أُرجعت {arabicDate(round.returnedAt)} {round.returnedNoteCount ? `بـ${countOf(round.returnedNoteCount, oblique(AR.note))}` : "بلا ملاحظات"}
                      {/* عددُ الملاحظات يقول ما طُلب، وعددُ الصفوف يقول ما فُعل. */}
                      {round.changedRowCount !== undefined ? (round.changedRowCount ? ` — فتحرّك ${countOf(round.changedRowCount, AR.row)}` : " — ولم يتحرّك صف") : ""}
                    </span>
                  ) : null}
                  {round.acceptedAt ? <span>قُبلت {arabicDate(round.acceptedAt)}{round.acceptedBy ? ` — ${round.acceptedBy}` : ""}</span> : null}
                  <button type="button" data-guide-ignore="عرض تغييرات جولةٍ سابقة — قراءةٌ لا فعل" onClick={() => { setShowRounds(false); setViewRound(round.number); setBaseline("round"); void load(round.number, "round"); }}>اعرض تغييراتها</button>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}

      {view === "full" ? (
        sortedFullSchedule.length === 0 ? (
          <EmptyState title="لا مواعيد" detail="لا مواعيد محفوظة في جدول هذا القسم بعد." />
        ) : (
          <div className="changes-full agenda-list" role="table" aria-label="الجدول كامل">
            {sortedFullSchedule.map((row, index) => (
              <ScheduleRowCard
                key={`full:${row.scheduleId}`}
                row={row}
                index={index}
                kind={row.changeKind}
                tag={row.changeKind ? KIND_LABEL[row.changeKind] : undefined}
              >
                {rowExtras(row.scheduleId, true, "room")}
              </ScheduleRowCard>
            ))}
          </div>
        )
      ) : sortedDiffEntries.length === 0 ? (
        <EmptyState title="لم يتغيّر شيء" detail="لا فرق بين هذا الجدول وما راجعتَه آخر مرّة — انظر «الجدول كامل» لرؤية المواعيد كلها." />
      ) : (
        <div className="changes-table agenda-list" role="table" aria-label="تغييرات الجدول">
          {sortedDiffEntries.map((entry, index) => (
            <ScheduleRowCard
              key={`${entry.kind}:${entry.scheduleId}`}
              row={entry.display}
              index={index}
              kind={entry.kind}
              tag={KIND_LABEL[entry.kind]}
              changes={entry.kind === "changed" ? entry.changes : undefined}
            >
              {rowExtras(entry.scheduleId, entry.kind !== "removed", entry.changes?.[0]?.field || "room")}
            </ScheduleRowCard>
          ))}
        </div>
      )}

      {/* أزرار القرار في الأسفل: تُضغط بعد القراءة لا قبلها. وتُعرض على الجولة
          الجارية وحدها — قرارٌ من شاشة جولةٍ مضت يقع على ما لم يُعرض.
          والمعتمدُ يُرجَع أيضاً بملاحظة، في جولةٍ جديدة. */}
      {isRegistrar && !report.viewingPastRound && (report.approval.status === "submitted" || report.approval.status === "accepted") ? (
        <div className="changes-decision">
          <span>
            {openNotes ? `${countOf(openNotes, AR.note)} من التسجيل ستُرسل مع الإرجاع` : "لا ملاحظات مكتوبة بعد"}
            {handledNotes ? ` · ${countOf(handledNotes, AR.note)} عُولجت` : ""}
            {answeredNotes ? ` · ${countOf(answeredNotes, AR.note)} بانتظار قرارك` : ""}
          </span>
          <SecondaryButton type="button" data-guide-target="changes.action.return" disabled={busy || openNotes === 0} onClick={() => void act("/api/approvals/return", undefined, report.approval.status === "accepted" ? "أُعيد فتح الجدول المعتمد وأُرجع للقسم" : "أُرجع الجدول للقسم")}>
            <CornerUpLeft aria-hidden="true" /> {report.approval.status === "accepted" ? "إعادة فتح وإرجاع للقسم" : "إرجاع للقسم"}
          </SecondaryButton>
          {report.approval.status === "submitted" ? (
            <PrimaryButton type="button" data-guide-target="changes.action.accept" disabled={busy || report.blockingConflicts > 0} onClick={() => void act("/api/approvals/accept", undefined, "اعتُمد الجدول")}>
              <ShieldCheck aria-hidden="true" /> قبول نهائي
            </PrimaryButton>
          ) : null}
        </div>
      ) : null}

      {noteDraft ? (
        <div className="changes-extend-sheet" role="dialog" aria-label="ملاحظة على خانة">
          <div className="changes-extend-card">
            <header>
              <strong>ملاحظة على خانة</strong>
              <button type="button" data-guide-ignore="إغلاق الورقة المنبثقة — لا يغيّر شيئاً" onClick={() => setNoteDraft(null)} aria-label="إغلاق"><X /></button>
            </header>
            {/* اختيار الخانة داخل الورقة — بدل صفٍّ من ستّة أزرارٍ يزاحم كل موعد. */}
            <label>
              <span>الخانة</span>
              <select
                value={String(noteDraft.field)}
                onChange={(e) => {
                  const field = e.target.value as NoteField;
                  const existing = existingNoteFor(noteDraft.scheduleId, field);
                  setNoteDraft({ scheduleId: noteDraft.scheduleId, field });
                  setNoteText(existing?.text || report.suggestions?.[`${noteDraft.scheduleId}:${field}`] || "");
                }}
              >
                {(Object.keys(DIFF_FIELD_LABEL) as DiffFieldKey[]).map(field => (
                  <option key={field} value={field}>{DIFF_FIELD_LABEL[field]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>النصّ <small>اختياري — الخانة نفسها هي الرسالة</small></span>
              <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder={`راجِع ${DIFF_FIELD_LABEL[noteDraft.field as DiffFieldKey] || "الموعد"}`} autoFocus />
            </label>
            <div className="changes-extend-actions">
              <SecondaryButton type="button" data-guide-ignore="إلغاء كتابة الملاحظة — لا يغيّر شيئاً" onClick={() => setNoteDraft(null)}>إلغاء</SecondaryButton>
              <PrimaryButton type="button" data-guide-target="changes.action.note" disabled={busy} onClick={saveNote}>
                <MessageSquarePlus aria-hidden="true" /> {busy ? "يحفظ…" : "أثبِت الملاحظة"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}

      {rebutting ? (
        <div className="changes-extend-sheet" role="dialog" aria-label="ردّ على ملاحظة">
          <div className="changes-extend-card">
            <header>
              <strong>إبقاء {rebutting.fieldLabel} كما هي</strong>
              <button type="button" data-guide-ignore="إغلاق الورقة المنبثقة — لا يغيّر شيئاً" onClick={() => setRebutting(null)} aria-label="إغلاق"><X /></button>
            </header>
            <p className="changes-rebut-hint">
              السبب مطلوبٌ هنا وحده: ردٌّ بلا سببٍ يدفع الطرفين إلى الهاتف، فتضيع الحجّة خارج النظام.
            </p>
            <label>
              <span>السبب</span>
              <input value={rebutText} onChange={(e) => setRebutText(e.target.value)} placeholder="القاعة مخصّصة للمختبر بقرار القسم" autoFocus />
            </label>
            <div className="changes-extend-actions">
              <SecondaryButton type="button" data-guide-ignore="إلغاء الردّ — لا يغيّر شيئاً" onClick={() => setRebutting(null)}>إلغاء</SecondaryButton>
              <PrimaryButton type="button" data-guide-ignore="إرسال ردّ القسم على ملاحظةٍ واحدة — لا يمسّ الجدول" disabled={busy || rebutText.trim().length < 3} onClick={saveRebuttal}>
                {busy ? "يحفظ…" : "أرسل الردّ"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── الشاشة ─────────────────────────────────────────────────────────────── */

export default function ScheduleChanges({ role, scope, scopes = [], powerAdmin = false }: Props) {
  const [terms, setTerms] = useState<AdTerm[] | null>(null);
  const [termId, setTermId] = useState(0);
  const [opened, setOpened] = useState<{ collegeId: number; sectionId: number; collegeName?: string; sectionName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /* الوارد يُقرأ مرّةً ويُسلَّم للوحة مواعيد التسليم فوقه. */
  const [inboxRows, setInboxRows] = useState<InboxRow[] | null>(null);
  const [extendFor, setExtendFor] = useState<{ row: InboxRow; nonce: number } | null>(null);
  const [panelFocus, setPanelFocus] = useState<{ collegeId: number; sectionId: number; nonce: number } | null>(null);

  const loadTerms = useCallback(async () => {
    try {
      const data = await request("/api/terms");
      const list: AdTerm[] = Array.isArray(data) ? data : (data.terms || []);
      setTerms(list);
      /* الفصل المشترك إن بقي موجوداً (src/utils/sharedScope.ts)، وإلا فالفصل
         الجاري — هو الجواب في تسع حالاتٍ من عشر، فلا يُسأل عنه أحد. */
      setTermId(current => current || resolveSharedScope(readSharedScope(), {
        scopes, isAdmin: powerAdmin, terms: list,
        fallbackTermId: currentTermId(list) || Number(list[list.length - 1]?.AdTermId || 0),
      }).termId);
    } catch (e: any) { setError(e.message); setTerms([]); }
  }, []);

  useEffect(() => { void loadTerms(); }, [loadTerms]);
  /* الفصل يتبع النطاق المشترك، ويُكتب فيه حين يختاره القارئ من أيّ منتقٍ هنا. */
  const sharedScope = useSharedScope((incoming) => {
    if (!terms?.length) return;
    const next = resolveSharedScope(incoming, { scopes, isAdmin: powerAdmin, terms, fallbackTermId: termId });
    if (next.termId) setTermId(next.termId);
  });
  const pickTerm = (id: number) => { sharedScope.pick({ termId: id }); setTermId(id); };
  useEffect(() => { setOpened(null); setInboxRows(null); }, [termId]);
  /* ── الإشعار يفتح على قسمه (N16) ─────────────────────────────────────
     يُؤخذ التركيز مرّةً بعد أن يُعرف الفصل: فصلُ الإشعار إن اختلف، ثم القسم.
     ويأتي بعد مسح «المفتوح» عند تغيّر الفصل، فلا يُمحى ما فتحه. */
  const focusRef = useRef<NotifyFocus | null | undefined>(undefined);
  useEffect(() => {
    if (!termId || !terms) return;
    if (focusRef.current === undefined) focusRef.current = takeNotifyFocus("scheduleChanges");
    const focus = focusRef.current;
    if (!focus) return;
    if (focus.termId && focus.termId !== termId && terms.some(row => Number(row.AdTermId) === focus.termId)) { setTermId(focus.termId); return; }
    focusRef.current = null;
    /* إشعارُ الموعد وطلبُ التمديد يفتحان «مواعيد التسليم»، لا تقرير القسم. */
    if (focus.panel === "deadlines") { setPanelFocus({ collegeId: focus.collegeId, sectionId: focus.sectionId, nonce: Date.now() }); return; }
    if (focus.sectionId) setOpened({ collegeId: focus.collegeId, sectionId: focus.sectionId });
  }, [termId, terms]);

  const term = useMemo(() => (terms || []).find(row => Number(row.AdTermId) === termId), [terms, termId]);

  if (!terms) return <MicroLoader label="يقرأ الفصول…" />;

  /* القسم يفتح على تقريره مباشرةً: لا وارد عنده يختار منه. */
  const single = scope && !role.canReview ? { ...scope } : null;
  const active = opened || single;

  return (
    <div className="changes-screen">
      <PageTitle
        eyebrow={<><Inbox aria-hidden="true" /> دورة الاعتماد</>}
        subtitle="ما تحرّك منذ المراجعة الأخيرة، لا الجدول كله"
        /* الفصل نزل إلى شريط السؤال مع الكلية والقسم: ثلاثتُها تحدّد نطاقاً
           واحداً، ففصلُها عن أختيها في ركن العنوان يجعل القارئ يبحث عن نطاقه
           في موضعين.

           ويبقى هنا كلّما غاب الشريط — حين يُفتح تقريرُ قسمٍ بعينه، وحين لا
           يكون ثمّة فصلٌ مختار. والثانيةُ ليست حالةً نظرية: «اختر الفصل» خيارٌ
           يُنقر، ونقرُه كان يُفرّغ الفصلَ فيختفي الشريطُ الذي يحمل قائمته،
           فيبقى القارئ أمام شاشةٍ فارغةٍ لا مخرجَ منها إلا إعادة التحميل. */
        action={
          terms.length > 1 && (active || !termId) ? (
            <label className="changes-term-picker">
              <span>الفصل</span>
              <select value={termId || ""} onChange={(e) => pickTerm(Number(e.target.value) || 0)}>
                {terms.map(row => (
                  <option key={row.AdTermId} value={row.AdTermId}>{row.AdTermName}</option>
                ))}
              </select>
            </label>
          ) : undefined
        }
      >
        تغييرات الجدول
      </PageTitle>

      {error ? <Notice type="error">{error}</Notice> : null}

      {/* ── مواعيد التسليم: الموضعُ الوحيد الذي يُكتب منه الموعدُ واستثناءاتُه ── */}
      {termId && !active && term ? (
        <SubmissionDeadlines
          terms={terms}
          termId={termId}
          onTermChange={pickTerm}
          rows={inboxRows}
          canEdit={role.canManageDeadline}
          onChanged={() => { setReloadKey(key => key + 1); void loadTerms(); }}
          extendFor={extendFor}
          focus={panelFocus}
        />
      ) : null}

      {!termId ? (
        <EmptyState title="اختر الفصل" detail="تُعرض تغييرات الجداول لفصلٍ واحد في كل مرّة." />
      ) : active ? (
        <Report key={reloadKey} termId={termId} termName={term?.AdTermName || ""} scope={active} role={role} onBack={opened ? () => setOpened(null) : undefined} />
      ) : (
        <Surface>
          <Inbox_
            key={reloadKey}
            termId={termId}
            terms={terms}
            onTermChange={pickTerm}
            canExtend={role.canManageDeadline}
            onLoaded={setInboxRows}
            onExtend={(row) => setExtendFor({ row, nonce: Date.now() })}
            scopes={scopes}
            powerAdmin={powerAdmin}
            onOpen={(row) => setOpened({ collegeId: row.collegeId, sectionId: row.sectionId, collegeName: row.collegeName, sectionName: row.sectionName })}
          />
        </Surface>
      )}
    </div>
  );
}
