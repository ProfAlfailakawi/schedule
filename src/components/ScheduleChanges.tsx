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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, CalendarDays, CalendarRange, Check, ChevronLeft, ClipboardList, Clock3,
  CornerUpLeft, FileDiff, Inbox, MapPin, MessageSquarePlus, Scale, Search, Send, ShieldCheck, Trash2,
  UsersRound, X,
} from "lucide-react";
import ApprovalBar from "./ApprovalBar";
import ScopeAskBar, { type ScopeAskSelect } from "./ScopeAskBar";
import { EMPTY_INBOX_ASK, matchesInboxAsk, parseInboxAsk, type InboxAsk, type InboxAskSignal } from "../utils/inboxAsk";
import { Badge, EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface } from "./ui";
import { APPROVAL_STATUS_LABEL, blockingConflictPhrase } from "../utils/approvalWorkflow";
import { DIFF_FIELD_LABEL, type DiffFieldKey } from "../utils/scheduleDiff";
import { currentTermId } from "../utils/termSequence";
import type { AdTerm, ScheduleApprovalStatus } from "../types";

type NoteField = DiffFieldKey | "row";
type NoteState = "open" | "changed" | "answered" | "resolved" | "removed";

interface InboxRow {
  collegeId: number; sectionId: number; collegeName: string; sectionName: string;
  status: ScheduleApprovalStatus; statusLabel: string; round: number; rowCount: number;
  blockingConflicts: number; openNotes: number; answeredNotes: number; pendingAdditions: number;
  deadline: { effective?: string; past: boolean; daysLeft?: number; tone: string; extensionUntil?: string; extensionReason?: string };
  late: boolean; priority: number; updatedAt: string;
}

interface NoteRow {
  id: string; scheduleId: number; text: string; field: NoteField; fieldLabel: string;
  state: NoteState; round?: number; origin?: string; userName: string; createdAt: string;
  valueAtNote?: string; valueNow?: string;
  rebuttal?: { text: string; at: string; userName: string };
  rebuttalVerdict?: "accepted" | "insisted";
  insistCount?: number;
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

interface ChangeReport {
  approval: { status: ScheduleApprovalStatus; currentRound: number; pendingAdditions: any[]; signatures: any[] };
  statusLabel: string; round: number;
  rounds: Array<{ number: number; submittedAt?: string; submittedBy?: string; returnedAt?: string; returnedBy?: string; returnedNoteCount?: number; changedRowCount?: number; acceptedAt?: string; acceptedBy?: string }>;
  deadline: InboxRow["deadline"];
  diff: { entries: DiffEntry[]; counts: { added: number; removed: number; changed: number; unchanged: number }; firstReview: boolean };
  /** من أين تبدأ المقارنة: نسخةُ جولةٍ سابقة، أم آخرُ لقطةٍ محفوظة، أم لا شيء. */
  baselineSource?: "round" | "capture" | "none";
  fullSchedule?: FullRow[];
  summary: string;
  notes: NoteRow[];
  /** نصٌّ جاهزٌ لكل خانةٍ يعرف النظام سببَ الشكّ فيها، مفتاحه `صف:خانة`. */
  suggestions?: Record<string, string>;
  crossScope?: CrossScopeClash[];
  blockingConflicts: number;
  regulationNotices: number;
}

interface CrossScopeClash {
  scheduleId: number;
  kind: string;
  message: string;
  otherSectionName: string;
  otherCollegeName: string;
  otherCourseName: string;
  otherSectionCode: string;
  visible: boolean;
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
  scope?: { collegeId: number; sectionId: number } | null;
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
  if (deadline.past) return `انقضى الموعد ${arabicDate(deadline.effective)} — بعده بـ${Math.abs(days)} يوماً`;
  if (days === 0) return `آخر موعد للتسليم اليوم — ${arabicDate(deadline.effective)}`;
  if (days === 1) return `آخر موعد للتسليم غداً — ${arabicDate(deadline.effective)}`;
  return `آخر موعد للتسليم ${arabicDate(deadline.effective)} — بقي ${days} يوماً`;
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

function Inbox_({ termId, terms, onTermChange, onOpen, canExtend }: {
  termId: number;
  terms: AdTerm[];
  onTermChange: (termId: number) => void;
  onOpen: (row: InboxRow) => void;
  canExtend: boolean;
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
  const [collegeId, setCollegeId] = useState(0);
  const [sectionId, setSectionId] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [lateOnly, setLateOnly] = useState(false);
  const [signalFilters, setSignalFilters] = useState<InboxAskSignal[]>([]);
  const [extending, setExtending] = useState<InboxRow | null>(null);
  const [extendUntil, setExtendUntil] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await request(`/api/approvals/inbox?termId=${termId}`);
      setRows(data.rows || []);
      setTotals(data.totals || null);
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [termId]);

  useEffect(() => { void load(); }, [load]);

  /* الكليات والأقسام تُبنى من الوارد نفسه، لا من قراءةٍ ثانية: الشاشة لا تعرض
     قسماً ليس في وارِدها، فقائمةٌ تحوي ما لا يُعرض تَعِد بنتائجَ لا توجد. */
  const collegeOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows || []) if (!seen.has(row.collegeId)) seen.set(row.collegeId, row.collegeName || `كلية ${row.collegeId}`);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows]);

  const sectionOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows || []) {
      if (collegeId && row.collegeId !== collegeId) continue;
      if (!seen.has(row.sectionId)) seen.set(row.sectionId, row.sectionName || `قسم ${row.sectionId}`);
    }
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "ar"));
  }, [rows, collegeId]);

  /* الجملة والمرشّحات مصدرٌ واحد: ما تفهمه الجملة يُضاف إلى ما اختاره القارئ
     بيده، ولا يمحوه. من كتب «متأخر» ثم ضغط «فيه موانع» يريد الاثنين. */
  const effective: InboxAsk = useMemo(() => ({
    ...parsed,
    status: statusFilter !== "all" ? statusFilter : parsed.status,
    lateOnly: lateOnly || parsed.lateOnly,
    signals: [...new Set([...parsed.signals, ...signalFilters])],
  }), [parsed, statusFilter, lateOnly, signalFilters]);

  const visible = useMemo(() => (rows || []).filter(row => {
    if (collegeId && row.collegeId !== collegeId) return false;
    if (sectionId && row.sectionId !== sectionId) return false;
    return matchesInboxAsk(row, effective);
  }), [rows, collegeId, sectionId, effective]);

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
      key: "college", label: "الكلية", value: collegeId, placeholder: "كل الكليات",
      options: collegeOptions,
    },
    {
      key: "section", label: "القسم", value: sectionId, placeholder: "كل الأقسام",
      options: sectionOptions, disabled: sectionOptions.length === 0,
    },
    {
      key: "term", label: "الفصل", value: termId, placeholder: "اختر الفصل",
      options: terms.map(row => ({ value: row.AdTermId, label: row.AdTermName })),
    },
  ];

  const submitExtension = async () => {
    if (!extending) return;
    setBusy(true);
    try {
      await request("/api/approvals/extension", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId: extending.collegeId, sectionId: extending.sectionId, termId, until: extendUntil, reason: extendReason }),
      });
      setExtending(null); setExtendUntil(""); setExtendReason("");
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

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
          if (key === "college") { setCollegeId(id); setSectionId(0); }
          else if (key === "section") setSectionId(id);
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
              {canExtend ? (
                <button type="button" className="changes-extend" data-guide-target="changes.action.deadline" onClick={() => { setExtending(row); setExtendUntil(row.deadline.extensionUntil || ""); setExtendReason(row.deadline.extensionReason || ""); }}>
                  تمديد
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {extending ? (
        <div className="changes-extend-sheet" role="dialog" aria-label="تمديد التسليم">
          <div className="changes-extend-card">
            <header>
              <strong>تمديد تسليم «{extending.sectionName}»</strong>
              <button type="button" data-guide-ignore="إغلاق الورقة المنبثقة — لا يغيّر شيئاً" onClick={() => setExtending(null)} aria-label="إغلاق"><X /></button>
            </header>
            <label>
              <span>حتى تاريخ</span>
              <input type="date" value={extendUntil} onChange={(e) => setExtendUntil(e.target.value)} />
            </label>
            <label>
              <span>السبب <small>اختياري</small></span>
              <input value={extendReason} onChange={(e) => setExtendReason(e.target.value)} placeholder="تأخّر اعتماد المنتدبين" />
            </label>
            <div className="changes-extend-actions">
              {/* تاريخٌ فارغ يرفع التمديد: القرار بالرفع واردٌ كالقرار بالمنح. */}
              <SecondaryButton type="button" data-guide-ignore="تفريغ حقل التاريخ داخل الورقة — الحفظ هو ما يُنفّذ، وهو مسجّل" onClick={() => { setExtendUntil(""); }}>إلغاء التمديد</SecondaryButton>
              <PrimaryButton type="button" data-guide-target="changes.action.deadline" disabled={busy} onClick={submitExtension}>
                {busy ? "يحفظ…" : extendUntil ? "منح التمديد" : "رفع التمديد"}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ── تقرير الجولة ───────────────────────────────────────────────────────── */

const KIND_LABEL: Record<DiffEntry["kind"], string> = { added: "مضاف", removed: "محذوف", changed: "معدّل" };

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
    <article className="agenda-card changes-row" data-kind={kind}>
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

function Report({ termId, scope, role, onBack }: {
  key?: React.Key;
  termId: number;
  scope: { collegeId: number; sectionId: number; collegeName?: string; sectionName?: string };
  role: ScheduleChangesRole;
  onBack?: () => void;
}) {
  const [report, setReport] = useState<ChangeReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRounds, setShowRounds] = useState(false);
  const [showRegulations, setShowRegulations] = useState(false);
  /* «ما تحرّك» مدخلُ المراجعة السريعة، و«الجدول كامل» ما يطلبه القسم: أن يرى
     جدولَه كلَّه والملاحظات في مواضعها، لا الملاحظات وحدها. */
  const [view, setView] = useState<"changes" | "full">("changes");
  const [noteDraft, setNoteDraft] = useState<{ scheduleId: number; field: NoteField } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [rebutting, setRebutting] = useState<NoteRow | null>(null);
  const [rebutText, setRebutText] = useState("");
  /* يُبلِّغ شريطَ الاعتماد أن يُعيد قراءةَ حاله بعد توقيعٍ أو إرسال. */
  const [approvalSignal, setApprovalSignal] = useState(0);
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

  const load = useCallback(async (round?: number) => {
    setError(null);
    try {
      const query = `collegeId=${scope.collegeId}&sectionId=${scope.sectionId}&termId=${termId}${round ? `&round=${round}` : ""}`;
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
    setShowRegulations(false);
    setView("changes");
    setNoteDraft(null);
    setRebutting(null);
    setMessage(null);
  }, [scope.collegeId, scope.sectionId, termId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (url: string, body?: unknown, done?: string) => {
    setBusy(true); setError(null); setMessage(null);
    try {
      await request(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId: scope.collegeId, sectionId: scope.sectionId, termId, ...(body as object || {}) }),
      });
      if (done) setMessage(done);
      await load();
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
      await load();
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
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!report) return error ? <Notice type="error">{error}</Notice> : <MicroLoader label="يقارن بالجولة السابقة…" />;

  const openNotes = report.notes.filter(note => note.state === "open").length;
  const answeredNotes = report.notes.filter(note => note.state === "answered").length;
  const handledNotes = report.notes.filter(note => note.state === "changed" || note.state === "removed").length;
  const isRegistrar = role.canReview;
  /* ── من يعلّق، ومن يقرّر ───────────────────────────────────────────────
   * التعليقُ للتسجيل وللقسم كليهما — وهو أوّلُ ما طُلب في هذا العمل: رئيسُ
   * القسم يحطّ ملاحظات ولا يعدّل. والقرارُ — قبولاً وإرجاعاً — للتسجيل وحده.
   * فلا يُخلط البابان: كانت الخاناتُ تُفتح لمن يقرّر، فبقي من يعلّق بلا باب. */
  const canAnnotate = role.canAnnotate;
  const mineOrigin = isRegistrar ? "registrar" : "department";
  const existingNoteFor = (scheduleId: number, field: NoteField) =>
    (notesByRow.get(scheduleId) || []).find(note => note.field === field && note.origin === mineOrigin);
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
        {(report.crossScope || []).filter(clash => clash.scheduleId === scheduleId).map((clash, index) => (
          <div className="changes-cross" key={`${clash.scheduleId}:${index}`}>
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>
                يتعارض مع «{clash.otherSectionName}»
                {CROSS_KIND_LABEL[clash.kind] ? ` — ${CROSS_KIND_LABEL[clash.kind]}` : ""}
              </strong>
              <small>
                {clash.visible
                  ? `${clash.otherCourseName || "موعد"} · شعبة ${clash.otherSectionCode || "—"}`
                  : "تفاصيل الموعد المقابل خارج نطاقك"}
                {" — "}معالجتُه بمقايضة القاعات بين القسمين، لا بملاحظةٍ على هذا الصفّ.
              </small>
            </div>
          </div>
        ))}
        {notes.length ? (
          <ul className="changes-notes">
            {notes.map(note => (
              <li key={note.id} data-state={note.state}>
                <span className="changes-note-field">
                  {note.fieldLabel}
                  {note.origin === "department" ? <em> · من القسم</em> : null}
                </span>
                <p>{note.text}</p>
                {note.state === "changed" ? <small>عُولجت — تغيّرت الخانة</small> : null}
                {note.state === "resolved" ? <small>محسومة — قُبل تبرير القسم</small> : null}
                {Number(note.insistCount || 0) >= 3 ? (
                  <small className="changes-note-stuck">
                    اختلف الطرفان على هذه الخانة {note.insistCount} مرّات. إعلامٌ لرئيس القسم، ولا شيء يقف عليه.
                  </small>
                ) : null}
                {note.rebuttal ? (
                  <blockquote>
                    <strong>ردّ القسم:</strong> {note.rebuttal.text}
                    <cite>{note.rebuttal.userName}</cite>
                  </blockquote>
                ) : null}
                <div className="changes-note-actions">
                  {!isRegistrar && note.origin === "registrar" && note.state === "open" ? (
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

      {report.blockingConflicts > 0 ? (
        <div className="approval-blocked" role="alert">
          <span className="approval-blocked-icon"><AlertTriangle aria-hidden="true" /></span>
          <div>
            <strong>{blockingConflictPhrase(report.blockingConflicts)} يمنع الاعتماد.</strong>
            <p>لا يُقبل الجدول قبل معالجته.</p>
          </div>
        </div>
      ) : null}

      {/* اللائحة تُعرض ولا تمنع: بطاقةٌ مطويّة تُفتح عند الحاجة، لا قائمةٌ
          تزاحم التقرير بما لا يوقف أحداً. */}
      {report.regulationNotices > 0 ? (
        <div className="changes-regulations" data-open={showRegulations || undefined}>
          <button type="button" data-guide-ignore="طيّ بطاقة اللوائح وفتحها — عرضٌ لا فعل" onClick={() => setShowRegulations(v => !v)}>
            <Scale aria-hidden="true" />
            <span>{report.regulationNotices} ملاحظةً لائحية</span>
            <small>تُعرض ولا تمنع الاعتماد</small>
          </button>
          {showRegulations ? (
            <p>
              اللائحة معيارٌ يُحتجّ به لا بوّابةٌ تُقفل. تظهر هذه الملاحظات في شاشة
              المراجعة اللائحية بتفصيلها، وتُسجَّل مع التوقيع، ولا تمنع القبول.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="changes-viewbar">
        <div className="changes-summary">
          <FileDiff aria-hidden="true" />
          <strong>{report.summary}</strong>
          {report.diff.counts.unchanged ? <small>{report.diff.counts.unchanged} موعداً لم يتغيّر</small> : null}
          {/* ── من أين تبدأ المقارنة ──────────────────────────────────────
              «كلُّ صفٍّ مضاف» تعني أحد أمرين لا ثالثَ لهما: جدولٌ جديدٌ فعلاً،
              أو أساسٌ لم يُوجد فقُورن الجدولُ بالعدم. والفرقُ بينهما هو الفرقُ
              بين مراجعةٍ صحيحةٍ ومراجعةٍ ضائعة، فلا يُترك ليُستنتج. */}
          {report.baselineSource === "none" ? (
            <small className="changes-baseline-note">أولُ مراجعةٍ لهذا القسم — لا نسخةَ سابقةَ يُقارَن بها، فكلُّ موعدٍ يُعرض مضافاً.</small>
          ) : report.baselineSource === "capture" ? (
            <small className="changes-baseline-note">لم تحمل الجولاتُ السابقة نسخةً محفوظة، فالمقارنةُ من آخر لقطةٍ للجدول قبل هذه الجولة.</small>
          ) : null}
        </div>
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
                      أُرجعت {arabicDate(round.returnedAt)} بـ{round.returnedNoteCount || 0} ملاحظة
                      {/* عددُ الملاحظات يقول ما طُلب، وعددُ الصفوف يقول ما فُعل. */}
                      {round.changedRowCount !== undefined ? ` — فتحرّك ${round.changedRowCount} صفّاً` : ""}
                    </span>
                  ) : null}
                  {round.acceptedAt ? <span>قُبلت {arabicDate(round.acceptedAt)}{round.acceptedBy ? ` — ${round.acceptedBy}` : ""}</span> : null}
                  <button type="button" data-guide-ignore="عرض تغييرات جولةٍ سابقة — قراءةٌ لا فعل" onClick={() => { setShowRounds(false); void load(round.number); }}>اعرض تغييراتها</button>
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

      {/* أزرار القرار في الأسفل: تُضغط بعد القراءة لا قبلها. */}
      {isRegistrar && report.approval.status === "submitted" ? (
        <div className="changes-decision">
          <span>
            {openNotes ? `${openNotes} ملاحظةً ستُرسل مع الإرجاع` : "لا ملاحظات مكتوبة بعد"}
            {handledNotes ? ` · ${handledNotes} عُولجت` : ""}
            {answeredNotes ? ` · ${answeredNotes} بانتظار قرارك` : ""}
          </span>
          <SecondaryButton type="button" data-guide-target="changes.action.return" disabled={busy || openNotes === 0} onClick={() => void act("/api/approvals/return", undefined, "أُرجع الجدول للقسم")}>
            <CornerUpLeft aria-hidden="true" /> إرجاع للقسم
          </SecondaryButton>
          <PrimaryButton type="button" data-guide-target="changes.action.accept" disabled={busy || report.blockingConflicts > 0} onClick={() => void act("/api/approvals/accept", undefined, "اعتُمد الجدول")}>
            <ShieldCheck aria-hidden="true" /> قبول نهائي
          </PrimaryButton>
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

/**
 * ── موعد التسليم ────────────────────────────────────────────────────────────
 *
 * حقلٌ واحد بجانب اسم الفصل، في الشاشة التي يفتحها رئيس التسجيل كل يوم. لا
 * شاشةَ إعداداتٍ يُبحث فيها عنه، ولا خطوتان: يكتب التاريخ ويحفظ.
 *
 * ولا يظهر لغيره أصلاً — فمن لا يملك القرار لا يُعرض عليه.
 */
function DeadlineControl({ term, onSaved }: { term: AdTerm; onSaved: () => void }) {
  const [value, setValue] = useState(term.AdTermSubmissionDeadline || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /* التاريخ يُعاد ضبطه عند تبدّل الفصل وحده.
   *
   * وكان يُعاد عند تبدّل الموعد أيضاً — والحفظُ نفسه هو ما يُبدّله. فرسالةُ
   * «محفوظ» كانت تُمحى في اللحظة التي تستحقّ أن تظهر فيها، ويبقى الحافظُ بلا
   * دليلٍ على أن حفظَه وقع. */
  useEffect(() => { setValue(term.AdTermSubmissionDeadline || ""); setSaved(false); }, [term.AdTermId]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await request("/api/approvals/deadline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId: term.AdTermId, deadline: value }),
      });
      setSaved(true);
      onSaved();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const dirty = (value || "") !== (term.AdTermSubmissionDeadline || "");

  return (
    <div className="changes-deadline-control">
      <label>
        <span>آخر موعد لتسليم الجداول</span>
        <input type="date" value={value} onChange={(e) => { setValue(e.target.value); setSaved(false); }} />
      </label>
      {dirty ? (
        <PrimaryButton type="button" data-guide-target="changes.action.deadline" disabled={busy} onClick={save}>
          {busy ? "يحفظ…" : value ? "أثبِت الموعد" : "ارفع الموعد"}
        </PrimaryButton>
      ) : saved ? (
        <span className="changes-deadline-saved"><Check aria-hidden="true" /> محفوظ، وظاهرٌ لكل الأقسام</span>
      ) : (
        <span className="changes-deadline-hint">يظهر لكل قسمٍ فوق جدوله</span>
      )}
      {error ? <Notice type="error">{error}</Notice> : null}
    </div>
  );
}

export default function ScheduleChanges({ role, scope }: Props) {
  const [terms, setTerms] = useState<AdTerm[] | null>(null);
  const [termId, setTermId] = useState(0);
  const [opened, setOpened] = useState<{ collegeId: number; sectionId: number; collegeName?: string; sectionName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadTerms = useCallback(async () => {
    try {
      const data = await request("/api/terms");
      const list: AdTerm[] = Array.isArray(data) ? data : (data.terms || []);
      setTerms(list);
      /* الفصل الجاري هو الجواب في تسع حالاتٍ من عشر، فلا يُسأل عنه أحد. */
      setTermId(current => current || currentTermId(list) || Number(list[list.length - 1]?.AdTermId || 0));
    } catch (e: any) { setError(e.message); setTerms([]); }
  }, []);

  useEffect(() => { void loadTerms(); }, [loadTerms]);
  useEffect(() => { setOpened(null); }, [termId]);

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
              <select value={termId || ""} onChange={(e) => setTermId(Number(e.target.value) || 0)}>
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

      {role.canManageDeadline && term ? (
        <Surface className="changes-deadline-surface">
          <DeadlineControl term={term} onSaved={() => { setReloadKey(key => key + 1); void loadTerms(); }} />
        </Surface>
      ) : null}

      {!termId ? (
        <EmptyState title="اختر الفصل" detail="تُعرض تغييرات الجداول لفصلٍ واحد في كل مرّة." />
      ) : active ? (
        <Report key={reloadKey} termId={termId} scope={active} role={role} onBack={opened ? () => setOpened(null) : undefined} />
      ) : (
        <Surface>
          <Inbox_
            key={reloadKey}
            termId={termId}
            terms={terms}
            onTermChange={(id) => setTermId(id)}
            canExtend={role.canManageDeadline}
            onOpen={(row) => setOpened({ collegeId: row.collegeId, sectionId: row.sectionId, collegeName: row.collegeName, sectionName: row.sectionName })}
          />
        </Surface>
      )}
    </div>
  );
}
