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
  AlertTriangle, ArrowRight, CalendarRange, Check, ChevronLeft, ClipboardList, Clock3, CornerUpLeft,
  FileDiff, Inbox, MessageSquarePlus, Scale, Search, Send, ShieldCheck, Trash2, X,
} from "lucide-react";
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
interface DiffEntry { kind: "added" | "removed" | "changed"; scheduleId: number; row: any; changes: DiffChange[] }

/** صفٌّ من الجدول الكامل، مشكّلٌ كما تُقرأ خاناتُه — القسم يريد رؤية الجدول كله لا التغييرات وحدها. */
interface FullRow {
  scheduleId: number; course: string; sectionCode: string;
  time: string; days: string; room: string; instructor: string; changed: boolean;
}

interface ChangeReport {
  approval: { status: ScheduleApprovalStatus; currentRound: number; pendingAdditions: any[]; signatures: any[] };
  statusLabel: string; round: number;
  rounds: Array<{ number: number; submittedAt?: string; submittedBy?: string; returnedAt?: string; returnedBy?: string; returnedNoteCount?: number; changedRowCount?: number; acceptedAt?: string; acceptedBy?: string }>;
  deadline: InboxRow["deadline"];
  diff: { entries: DiffEntry[]; counts: { added: number; removed: number; changed: number; unchanged: number }; firstReview: boolean };
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
  return date.toLocaleDateString("ar-KW", { year: "numeric", month: "long", day: "numeric" });
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

function Inbox_({ termId, onOpen, canExtend }: { termId: number; onOpen: (row: InboxRow) => void; canExtend: boolean; key?: React.Key }) {
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [totals, setTotals] = useState<{ waiting: number; returned: number; accepted: number; late: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "submitted" | "returned" | "accepted">("all");
  const [query, setQuery] = useState("");
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

  /* بحثٌ سريعٌ بالاسم وفلترٌ بالحالة: الأقسام كثيرة، ومن يبحث عن قسمٍ بعينه لا
     يمرّ على عشرين بطاقة. الفلتر أربع حالاتٍ لا أكثر — وكثرةُ المرشّحات قرارٌ
     يُطلب من الموظّف قبل أن يبدأ. */
  const visible = useMemo(() => {
    const needle = query.trim();
    return (rows || []).filter(row => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (needle && !`${row.sectionName} ${row.collegeName}`.includes(needle)) return false;
      return true;
    });
  }, [rows, statusFilter, query]);

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
      {/* الفلتر بالحالة: كل شريحةٍ تحمل عددها، فيُقرأ الوضع قبل الضغط. */}
      <div className="changes-toolbar">
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
        <label className="changes-search">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم القسم أو الكلية"
            aria-label="ابحث باسم القسم أو الكلية"
          />
        </label>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={query || statusFilter !== "all" ? "لا نتائج" : "لا وارد"} detail={query || statusFilter !== "all" ? "لا قسمَ يطابق البحث أو الفلتر الحالي." : "لم يصل جدولٌ يحتاج مراجعتك في هذا الفصل."} />
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

      <DeadlineStrip deadline={report.deadline} />
      {error ? <Notice type="error">{error}</Notice> : null}
      {message ? <Notice type="success">{message}</Notice> : null}

      {report.blockingConflicts > 0 ? (
        <Notice type="error">
          <AlertTriangle aria-hidden="true" /> {blockingConflictPhrase(report.blockingConflicts)} يمنع الاعتماد. لا يُقبل الجدول قبل معالجته.
        </Notice>
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
        (report.fullSchedule || []).length === 0 ? (
          <EmptyState title="لا مواعيد" detail="لا مواعيد محفوظة في جدول هذا القسم بعد." />
        ) : (
          <div className="changes-full" role="table" aria-label="الجدول كامل">
            {(report.fullSchedule || []).map(row => (
              <article key={`full:${row.scheduleId}`} className="changes-entry" data-kind={row.changed ? "changed" : undefined}>
                <header>
                  {row.changed ? <span className="changes-kind">تحرّك</span> : null}
                  <strong>{row.course}</strong>
                  <small>شعبة {row.sectionCode}</small>
                </header>
                <dl className="changes-fields changes-fields-full">
                  <div><dt>الوقت</dt><dd><b>{row.time}</b></dd></div>
                  <div><dt>الأيام</dt><dd><b>{row.days}</b></dd></div>
                  <div><dt>القاعة</dt><dd><b>{row.room}</b></dd></div>
                  <div><dt>أستاذ المقرر</dt><dd><b>{row.instructor}</b></dd></div>
                </dl>
                {rowExtras(row.scheduleId, true, "room")}
              </article>
            ))}
          </div>
        )
      ) : report.diff.entries.length === 0 ? (
        <EmptyState title="لم يتغيّر شيء" detail="لا فرق بين هذا الجدول وما راجعتَه آخر مرّة — انظر «الجدول كامل» لرؤية المواعيد كلها." />
      ) : (
        <div className="changes-table" role="table" aria-label="تغييرات الجدول">
          {report.diff.entries.map(entry => (
            <article key={`${entry.kind}:${entry.scheduleId}`} className="changes-entry" data-kind={entry.kind}>
              <header>
                <span className="changes-kind">{KIND_LABEL[entry.kind]}</span>
                <strong>{entry.row?.AdCourseName || `موعد ${entry.scheduleId}`}</strong>
                <small>شعبة {entry.row?.SCode || "—"}</small>
              </header>

              {entry.kind === "changed" ? (
                <dl className="changes-fields">
                  {entry.changes.map(change => (
                    <div key={change.field}>
                      <dt>{change.label}</dt>
                      <dd>
                        <s>{change.before}</s>
                        <ArrowRight aria-hidden="true" />
                        <b>{change.after}</b>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {rowExtras(entry.scheduleId, entry.kind !== "removed", entry.changes?.[0]?.field || "room")}
            </article>
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
        action={
          terms.length > 1 ? (
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
          <Inbox_ key={reloadKey} termId={termId} canExtend={role.canManageDeadline} onOpen={(row) => setOpened({ collegeId: row.collegeId, sectionId: row.sectionId, collegeName: row.collegeName, sectionName: row.sectionName })} />
        </Surface>
      )}
    </div>
  );
}
