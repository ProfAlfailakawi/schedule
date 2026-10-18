import { byArabic } from "../utils/sorting";
/**
 * ── كشفُ التسجيل ────────────────────────────────────────────────────────────
 *
 * الشاشةُ التي يفتحها موظّفُ التسجيل والقسمُ معاً، وهي واحدةٌ لا اثنتان.
 *
 * وكان الطرفان يعملان على ورقتين: القسم يجمع الرغبات بالاستبيان ويسلّمها
 * يدوياً، والتسجيلُ يقرّر في نظامه، والطالبُ بينهما لا يعرف شيئاً — فيقف عند
 * المكتب ليسأل سؤالاً واحداً: «وش صار؟». هذه الشاشةُ هي الورقة الواحدة:
 * التسجيلُ يكتب أين وصل كلُّ مقرّر، والقسمُ يقرأ ما كتبه لحظتَها، والطالبُ
 * يراه في صفحته بلا أن يسأل أحداً.
 *
 * **ولا تعرض جدولاً ولا مقاعد.** الحالةُ قولٌ عن طلب طالبٍ بعينه، لا عن مقعد. والاستثناءُ الوحيد زرُّ اللجنة
 * «موافقة + فتح شعبة»: حين يثبت أن شعبةً جديدةً تخلو من التعارض تُفتح في الجدول بالمسار نفسه الذي تفتح به
 * الورشة، ولا تُسجَّل الموافقةُ إن رُفضت الشعبة.
 * النظامُ لا يملك المقاعد، والتسجيلُ هو صاحبُها — وادّعاءُ غير ذلك يصنع زحمةً
 * أسوأَ حين يكتشف الطالبُ أن ما قرأه ليس تسجيلاً.
 *
 * **والبحثُ برقم الحالة أولاً.** الطالبُ يقف أمام الموظّف حاملاً رقماً من
 * ثمانية أحرف؛ وكتابتُه أسرعُ من اثني عشر رقماً مدنياً، ولا تكشف شيئاً لمن
 * يقف خلفه في الطابور.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, ClipboardList, Clock3, Download, Hourglass, MessageSquareText, Users, X, Zap } from "lucide-react";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { useScopedTerms } from "./useScopedTerms";
import ScopeAskBar, { pinSingleScope, type ScopeAskSelect } from "./ScopeAskBar";
import ApplyProposal from "./ApplyProposal";
import StudentCasesTable, { exportStudentCasesXlsx, GRADUATE_REASON_LABEL, STUDENT_CASE_TYPE_LABEL, type StudentCaseView } from "./StudentCasesTable";
import {
  CASE_STATUS_LABEL, COMMITTEE_REASONS, CaseStateChip, PENDING_COMMITTEE, REJECT_REASONS, RegistrationJourney, STATE_LABEL,
  courseStateLabel, reasonLabel, statusOf, viewStatuses, type RowStatus, type StatusFilter,
} from "./StudentCaseStatus";
import TermFrozenRibbon, { useTermFrozen } from "./TermFrozenRibbon";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton } from "./ui";
import { AR, countOf, nounFor, studentNounsFor } from "../utils/arabicCount";
import { currentTermId } from "../utils/termSequence";
import { singleDepartmentOf } from "../utils/scopeContext";
import { readSharedScope, resolveSharedScope, useSharedScope } from "../utils/sharedScope";
import { DEMO_STAGE_SECTION_ID, isDemoSession } from "../utils/demoSession";
import { takeNotifyFocus } from "../utils/notifyFocus";
import type { AdTerm, StudentCommitteeRejectReason, StudentCourseRejectReason, StudentCourseStateValue } from "../types";
import type { StudentCaseStatus } from "../utils/studentCaseDecision";

interface Props {
  /**
   * نطاقُ الحساب كما يرسله الخادم.
   *
   * الأسماءُ تصل في `AdCollegeName` و`AdSectionName` — وهي أسماءُ الحقول في
   * `clientScopeDetails`، لا أسماءٌ تُخمَّن. وقراءتُها باسمٍ آخر لا تُخطئ
   * بصوتٍ مسموع: تسقط إلى البديل فتظهر «كلية ٥» مكان اسم الكلية، ويبدو
   * كأن الحساب يحمل نطاقاتٍ ليست له.
   */
  scopes: Array<{ AdCollegeId: number; AdSectionId: number; AdCollegeName?: string; AdSectionName?: string }>;
  /**
   * صاحبُ الصلاحية الكاملة لا نطاقَ له لأن له الكلّ.
   *
   * وبناءُ القوائم من النطاق وحدَه كان يُريه الكليتين المسندتين إليه فقط،
   * فيظنّ أن النظام لا يعرف غيرهما. والقاعدةُ مستقرّةٌ في الشاشات القديمة:
   * الكتالوجُ كاملاً لمن له الكلّ، ومُصفّىً بالنطاق لمن سواه.
   */
  powerAdmin?: boolean;
}

interface CaseCourse {
  id: number; code: string; name: string;
  state: StudentCourseStateValue;
  reasonCode?: StudentCourseRejectReason | StudentCommitteeRejectReason;
  note?: string; by?: string; byRole?: string; at?: string;
  settled: boolean;
  /** موافقةُ اللجنة فتحت شعبةً في الجدول الأصلي. */
  scheduleId?: number; sectionCode?: string;
  /** مقرّرُ قسمٍ آخر في طلبٍ قُدّم عبر استبيان هذا القسم: يُعرض ويُقرَّر في كشف قسمه. */
  readOnly?: boolean;
  decidedBySectionName?: string;
  /** حذفه الطالبُ من طلبه بعد القرار: يُعرض ولا يُقرَّر فيه. */
  droppedByStudent?: boolean;
  droppedLabel?: string;
  /** مالكُ المقرّر وقسمه (من الخادم). */
  sectionId?: number;
  sectionName?: string;
}

interface CaseDecisionView {
  state: "approved" | "rejected";
  reasonCode?: string; note?: string; byRole?: string; at?: string;
}

interface CaseRow {
  id: string; caseRef: string; name: string; civil: string;
  createdAt: string; requestType: string; studentSectionName: string;
  curriculum?: { name: string; status: string } | null;
  details?: string;
  caseDroppedAt?: string;
  /** الطرفُ الآخر في «تعارض مقررين» حين لا يكون في هذا الكشف. */
  partnerCourses?: Array<{ id?: number; code: string; name: string; sectionId?: number; sectionName: string }>;
  courses: CaseCourse[];
  /** طلبُ الخريج: قرارٌ واحدٌ في الحالة كلها بدل قرارات المقرّرات. */
  caseLevel?: boolean;
  caseStatus?: StudentCaseStatus;
  caseState?: { committee?: CaseDecisionView; registrar?: CaseDecisionView };
  graduate?: { reason: string; passedUnits: number; requiredUnits: number; degreeUnits: number; eligibility: string; nameMatched: boolean };
}

interface Totals {
  students: number; courses: number;
  pendingCommittee?: number; committeeRejected?: number;
  registered: number; rejected: number; waiting: number;
}

/** من يقرأ الكشف: لجنة القسم، أو التسجيل، أو صاحب الصلاحية الكاملة (الجهتان). */
type Viewer = "committee" | "registration" | "both";

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

/* الكلماتُ والأسبابُ وشارةُ الحالة وشريطُ الرحلة: من StudentCaseStatus، وهي نفسُها في مركز الذكاء. */
type CaseCourseStatusFields = Parameters<typeof statusOf>[0];
const rowStatuses = (row: CaseRow): RowStatus[] => viewStatuses(row);

/* Type and graduate-reason words come from the shared register, so the
   sheet, its Excel file and the intelligence centre say the same thing. */
const REQUEST_TYPE_LABEL: Record<string, string> = STUDENT_CASE_TYPE_LABEL;

/* ── ورقةُ الردّ ────────────────────────────────────────────────────────── */

function RejectSheet({ course, busy, onClose, onSubmit, committee = false }: {
  /** ما يُردّ: مقرّرٌ، أو حالةُ الخريج كلها (اسمُها يكفي للعنوان). */
  course: { name: string };
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => void;
  /** عدمُ موافقة اللجنة: أسبابُها غير أسباب ردّ التسجيل. */
  committee?: boolean;
}) {
  const [reason, setReason] = useState<string>("");
  const reasons: Array<[string, string]> = committee ? COMMITTEE_REASONS : REJECT_REASONS;
  const [note, setNote] = useState("");
  return (
    <div className="changes-extend-sheet" role="dialog" aria-modal="true" aria-label={committee ? "عدم موافقة اللجنة" : "ردّ مقرّر"}>
      <div className="changes-extend-card">
        <header>
          <strong>{committee ? `عدم موافقة اللجنة على «${course.name}»` : `ردّ «${course.name}»`}</strong>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق الورقة — لا يغيّر شيئاً"><X /></button>
        </header>
        <label>
          <span>السبب</span>
          <select value={reason} onChange={event => setReason(event.target.value)}>
            <option value="">اختر السبب</option>
            {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>سطرٌ للطالب <small>اختياري</small></span>
          <input value={note} onChange={event => setNote(event.target.value)} placeholder="راجع المرشد الأكاديمي" />
        </label>
        <div className="changes-extend-actions">
          <SecondaryButton type="button" onClick={onClose} data-guide-ignore="إلغاء — لا يغيّر شيئاً">تراجع</SecondaryButton>
          <PrimaryButton
            type="button" disabled={busy || !reason}
            data-guide-target="registration.action.state"
            onClick={() => onSubmit(reason, note)}
          >
            {busy ? "يحفظ…" : committee ? "سجّل عدم الموافقة" : "سجّل الردّ"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── قرارٌ سريع: بطاقةُ طالبٍ واحدة في الوسط، ثم التالية ───────────────────────────
   اللجنةُ تُنهي أربعين حالةً في دقائق لا بتنقّلٍ في جدولٍ عريض. القراراتُ هي نفسُها التي في السجلّ
   (setState/setCaseState): لا طريقَ ثانياً إلى الكتابة. الرفضُ يمرّ بورقة السبب نفسها. */
interface QuickItem { key: string; row: CaseRow; course: CaseCourse | null; side: "committee" | "registration" }

function QuickDecide({ items, busy, onApprove, onReject, onClose }: {
  items: QuickItem[]; busy: boolean; onApprove: (item: QuickItem) => void; onReject: (item: QuickItem) => void; onClose: () => void;
}) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [start] = useState(items.length);
  const ordered = useMemo(() => [...items.filter(item => !skipped.includes(item.key)), ...items.filter(item => skipped.includes(item.key))], [items, skipped]);
  const current = ordered[0];
  const doneCount = Math.max(0, start - items.length);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const skip = () => { if (current && items.length > 1) setSkipped(list => [...list.filter(key => key !== current.key), current.key]); };
  const nf = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "Escape") onClose();
      else if (!current || busy) return;
      else if (event.key === "Enter") { event.preventDefault(); onApprove(current); }
      else if (event.key === "r" || event.key === "R" || event.key === "ر") onReject(current);
      else if (event.key === "ArrowLeft" || event.key === " ") { event.preventDefault(); skip(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const row = current?.row;
  return (
    <div className="qd-scrim" role="dialog" aria-modal="true" aria-label="قرار سريع" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="qd">
        <header>
          <b><Zap aria-hidden="true" /> قرار سريع</b>
          <span>{nf(Math.min(doneCount + 1, start))} من {nf(start)}</span>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق القرار السريع — لا يغيّر شيئاً"><X /></button>
        </header>
        <div className="qd-bar" aria-hidden="true"><i style={{ inlineSize: `${start ? (doneCount / start) * 100 : 100}%` }} /></div>
        {current && row ? (
          <article
            className="qd-card" key={current.key}
            onTouchStart={event => { touch.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
            onTouchEnd={event => {
              const start = touch.current; touch.current = null;
              if (!start || busy) return;
              const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
              if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
              if (dx > 0) onApprove(current); else skip();
            }}
          >
            <div className="qd-who">
              <span className="qd-av" aria-hidden="true">{(row.name || "؟").trim().charAt(0)}</span>
              <div><b>{row.name || "—"}</b><small>{row.studentSectionName}{row.curriculum ? ` · ${row.curriculum.name}` : ""}</small></div>
              <code dir="ltr">{row.caseRef}</code>
            </div>
            <div className="qd-what">
              <span className={`qd-side ${current.side}`}>{current.side === "committee" ? "قرار اللجنة" : "قرار التسجيل"}</span>
              {current.course ? <>
                <strong>{current.course.name}</strong>
                <code dir="ltr">{current.course.code}</code>
              </> : <>
                <strong>طلب خريج</strong>
                {row.graduate ? <small>{GRADUATE_REASON_LABEL[row.graduate.reason as keyof typeof GRADUATE_REASON_LABEL] || row.graduate.reason} · أنجز {nf(row.graduate.passedUnits)} من {countOf(row.graduate.requiredUnits, AR.unit)}</small> : null}
              </>}
              {row.details ? <p className="qd-note"><MessageSquareText aria-hidden="true" />{row.details.replace(/^من «مساري» بعد التسجيل — /, "")}</p> : null}
            </div>
            <div className="qd-acts">
              <button type="button" className="yes" disabled={busy} onClick={() => onApprove(current)} data-guide-target="registration.action.state"><Check aria-hidden="true" /> {current.side === "committee" ? "موافقة" : "سجّل"}<kbd>↵</kbd></button>
              <button type="button" className="no" disabled={busy} onClick={() => onReject(current)} data-guide-ignore="يفتح ورقة سبب الرفض؛ لا يكتب قبل التأكيد"><X aria-hidden="true" /> {current.side === "committee" ? "رفض" : "ردّ"}<kbd>R</kbd></button>
            </div>
            <button type="button" className="qd-skip" disabled={items.length < 2} onClick={skip} data-guide-ignore="تخطّي الحالة — لا يغيّر شيئاً">تخطّ ←</button>
            <p className="qd-hint">اسحب لليمين للموافقة · لليسار للتخطّي</p>
          </article>
        ) : (
          <div className="qd-done">
            <span aria-hidden="true"><CheckCheck /></span>
            <b>{start ? "أنهيت الكل" : "لا حالات تنتظرك"}</b>
            {start ? <small>قرّرتَ في {nf(start)} {start === 1 ? "حالة" : "حالات"}.</small> : null}
            <PrimaryButton type="button" onClick={onClose} data-guide-ignore="إغلاق القرار السريع — لا يغيّر شيئاً">رجوع إلى الكشف</PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── الشاشة ─────────────────────────────────────────────────────────────── */

export default function StudentRegistration({ scopes, powerAdmin = false }: Props) {
  const [terms, setTerms] = useState<AdTerm[] | null>(null);
  const [termId, setTermId] = useState(0);
  /* الكلية والقسم من النطاق المشترك (src/utils/sharedScope.ts)، معروضين على
     نطاق القارئ؛ وافتراض الشاشة أدناه («أوّل كلية») لا يُكتب فيه. */
  const [collegeId, setCollegeId] = useState(() => resolveSharedScope(readSharedScope(), { scopes, isAdmin: powerAdmin }).collegeId);
  const [sectionId, setSectionId] = useState(() => {
    const scoped = resolveSharedScope(readSharedScope(), { scopes, isAdmin: powerAdmin });
    return scoped.sectionId || (isDemoSession() && scoped.collegeId ? DEMO_STAGE_SECTION_ID : 0);
  });
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [viewer, setViewer] = useState<Viewer>("committee");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const filterChosen = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ row: CaseRow; course: CaseCourse | null; committee: boolean } | null>(null);
  const [catalog, setCatalog] = useState<{
    colleges: Array<{ AdCollegeId: number; AdCollegeName: string }>;
    sections: Array<{ AdSectionId: number; AdCollegeId: number; AdSectionName: string }>;
  } | null>(null);

  /* ولا يُقرأ الكتالوجُ إلا لمن يحتاجه: من له نطاقٌ يكفيه نطاقُه. */
  useEffect(() => {
    if (!powerAdmin) { setCatalog(null); return; }
    void (async () => {
      try {
        const [colleges, sections] = await Promise.all([request("/api/colleges"), request("/api/sections")]);
        setCatalog({
          colleges: Array.isArray(colleges) ? colleges : (colleges.colleges || []),
          sections: Array.isArray(sections) ? sections : (sections.sections || []),
        });
      } catch { setCatalog(null); }
    })();
  }, [powerAdmin]);

  useEffect(() => {
    void (async () => {
      try {
        const data = await request("/api/terms");
        const list: AdTerm[] = Array.isArray(data) ? data : (data.terms || []);
        setTerms(list);
        setTermId(current => current || resolveSharedScope(readSharedScope(), {
          scopes, isAdmin: powerAdmin, terms: list,
          fallbackTermId: currentTermId(list) || Number(list[list.length - 1]?.AdTermId || 0),
        }).termId);
      } catch (e: any) { setError(e.message); setTerms([]); }
    })();
  }, []);

  /* جاء من إشعار: يفتح على قسم الإشعار نفسه، لا على نطاقٍ فارغ. */
  useEffect(() => {
    /* القارئ الوحيد للتركيز (notifyFocus.ts): يأخذه لهذه الشاشة وحدها، ويكتبه في
       النطاق المشترك — هدفٌ صريحٌ يغلب. */
    const focus = takeNotifyFocus("studentRegistration");
    if (focus?.collegeId) { setCollegeId(focus.collegeId); setSectionId(focus.sectionId || 0); }
  }, []);

  /* تغيّرٌ من شاشةٍ أخرى أو لسانٍ آخر يُعرض على النطاق ثم يُتبع. */
  /* قائمةُ الفصل: ما فيه بيانات للنطاق المختار، والحالي دائماً (useScopedTerms). */
  const scopedTerms = useScopedTerms<AdTerm>(terms, collegeId, sectionId, termId, setTermId);
  const sharedScope = useSharedScope((incoming) => {
    const next = resolveSharedScope(incoming, { scopes, isAdmin: powerAdmin, terms: terms || undefined, fallbackTermId: termId });
    setCollegeId(next.collegeId);
    setSectionId(next.sectionId);
    if (next.termId) setTermId(next.termId);
  });

  useEffect(() => {
    /* ومن له الكلُّ لا يُختار له شيء. */
    if (collegeId || powerAdmin || !scopes.length) return;
    const first = Number(scopes[0].AdCollegeId) || 0;
    setCollegeId(first);
    /* قسمٌ واحد في الكلية: يُختار له، ومنتقيه لا يُرسم (singleDepartmentOf). */
    const only = singleDepartmentOf(scopes, first);
    if (only) setSectionId(only);
  }, [scopes, collegeId, powerAdmin]);

  /* والمنتقي المخفيّ لا يترك القيمة فارغة: أيّ طريقٍ وصل بالكلية (إشعار، تبديل)
     يُعاد قسمُه إلى القسم الوحيد، فيبقى الطلبُ يحمل sectionId. */
  useEffect(() => {
    const only = singleDepartmentOf(scopes, collegeId, powerAdmin);
    if (only && sectionId !== only) setSectionId(only);
  }, [scopes, collegeId, sectionId, powerAdmin]);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setRows(null); return; }
    setError(null);
    try {
      const data = await request(`/api/student-registration?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      setRows(data.rows || []);
      setTotals(data.totals || null);
      setCanWrite(Boolean(data.canWrite));
      const nextViewer: Viewer = data.viewer === "registration" || data.viewer === "both" ? data.viewer : "committee";
      setViewer(nextViewer);
      /* يبدأ كلٌّ من طابوره هو — اللجنةُ بما ينتظرها، والتسجيلُ بما سُلّم إليه —
         مرةً واحدة، ولا يُعاد ضبطُ تصفيةٍ اختارها المستخدم بعدها. */
      if (!filterChosen.current) {
        const statuses = (data.rows || []).flatMap((row: CaseRow) => rowStatuses(row));
        const queue: StatusFilter = nextViewer === "registration" ? "approved" : nextViewer === "committee" ? "pending" : "all";
        setStatusFilter(queue !== "all" && statuses.includes(queue) ? queue : "all");
      }
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);

  /* ── اقتراحاتُ فتح الشعب لمقرّرات هذا القسم ──────────────────────────────────
     من القراءة نفسها التي يعرضها مركز الذكاء (الطلبُ ÷ السعة − المفتوح، موضوعةً في أسبوعٍ حقيقيّ). لمن
     لا يملك صلاحيةَ الجدول يُرفض الطلب فلا يُعرض زرٌّ — والتسجيلُ لا يرى منها شيئاً. */
  const [openings, setOpenings] = useState<Map<number, { shortfall: number; slot: any }>>(new Map());
  const loadOpenings = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setOpenings(new Map()); return; }
    try {
      const data = await request(`/api/schedules/demand?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      const next = new Map<number, { shortfall: number; slot: any }>();
      for (const proposal of data?.openings?.proposals || []) {
        const slot = (proposal.placements || []).find((placement: any) => Number(placement.instructorId) > 0);
        if (slot && !proposal.predicted) next.set(Number(proposal.courseId), { shortfall: Number(proposal.shortfall) || 0, slot });
      }
      setOpenings(next);
    } catch { setOpenings(new Map()); }
  }, [collegeId, sectionId, termId]);
  useEffect(() => { void loadOpenings(); }, [loadOpenings]);

  /* النبضةُ الحيّة: قرارٌ كتبته اللجنة أو التسجيل من شاشةٍ أخرى يُقرأ هنا فوراً. */
  useEffect(() => {
    if (!collegeId || !sectionId || !termId || typeof EventSource === "undefined") return;
    let source: EventSource | null = null, pending = 0;
    const soon = () => { window.clearTimeout(pending); pending = window.setTimeout(() => { void load(); }, 800); };
    try { source = new EventSource("/api/schedules/events"); source.addEventListener("notify", soon); } catch { source = null; }
    return () => { window.clearTimeout(pending); source?.close(); };
  }, [collegeId, sectionId, termId, load]);

  const collegeOptions = useMemo(() => {
    if (catalog) {
      return catalog.colleges
        .map(row => ({ value: Number(row.AdCollegeId), label: String(row.AdCollegeName || `كلية ${row.AdCollegeId}`) }))
        .filter(item => item.value)
        .sort((a, b) => byArabic(a.label, b.label));
    }
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      const id = Number(scope.AdCollegeId);
      if (id && !seen.has(id)) seen.set(id, String(scope.AdCollegeName || `كلية ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, catalog]);
  /* كلية البنات تُعدّ طالباتٍ أجبن، لا طلاباً أجابوا. */
  const studentWords = studentNounsFor(collegeOptions.find(item => item.value === collegeId)?.label);

  const sectionOptions = useMemo(() => {
    if (catalog) {
      return catalog.sections
        .filter(row => !collegeId || Number(row.AdCollegeId) === collegeId)
        .map(row => ({ value: Number(row.AdSectionId), label: String(row.AdSectionName || `قسم ${row.AdSectionId}`) }))
        .filter(item => item.value)
        .sort((a, b) => byArabic(a.label, b.label));
    }
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      if (collegeId && Number(scope.AdCollegeId) !== collegeId) continue;
      const id = Number(scope.AdSectionId);
      if (id && !seen.has(id)) seen.set(id, String(scope.AdSectionName || `قسم ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, collegeId, catalog]);

  /* رقمُ الحالة أولاً، ثم الاسم، ثم الرقم المدني: هذا ترتيبُ ما يحمله من يقف
     أمام الموظّف. والمطابقةُ بلا حساسيةٍ لحالة الأحرف لأن الرقم يُكتب كيفما
     اتّفق. */
  const needle = ask.trim();
  const visible = useMemo(() => (rows || []).filter(row => {
    if (statusFilter !== "all" && !rowStatuses(row).includes(statusFilter)) return false;
    if (!needle) return true;
    const upper = needle.toUpperCase();
    return row.caseRef.includes(upper)
      || String(row.name || "").includes(needle)
      || String(row.civil || "").includes(needle);
  }), [rows, needle, statusFilter]);

  /* فصلٌ سابق: يُقرأ ولا يُكتب فيه (والخادم يرفض أيضاً). الأزرار تبقى ظاهرةً معطَّلة. */
  const frozen = useTermFrozen(termId, terms);
  const committeeActs = canWrite && (viewer === "committee" || viewer === "both");
  const registrationActs = canWrite && (viewer === "registration" || viewer === "both");
  /* قرارُ التسجيل لا تنقضه اللجنة. */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows || []) for (const status of rowStatuses(row)) counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, [rows]);

  const [quick, setQuick] = useState(false);
  const quickItems = useMemo<QuickItem[]>(() => {
    const out: QuickItem[] = [];
    for (const row of rows || []) {
      if (row.caseLevel) {
        const status = row.caseStatus || "pending";
        if (committeeActs && status === "pending") out.push({ key: `${row.id}:case:c`, row, course: null, side: "committee" });
        else if (registrationActs && status === "approved") out.push({ key: `${row.id}:case:r`, row, course: null, side: "registration" });
        continue;
      }
      for (const course of row.courses) {
        if (course.readOnly || course.droppedByStudent) continue;
        if (committeeActs && !course.settled) out.push({ key: `${row.id}:${course.id}:c`, row, course, side: "committee" });
        else if (registrationActs && course.settled && course.state === "awaiting-registration") out.push({ key: `${row.id}:${course.id}:r`, row, course, side: "registration" });
      }
    }
    /* من يملك الجهتين (صاحب الصلاحية الكاملة): اللجنةُ أولاً، فإذا فرغت جاء التسجيل — فلا تعود البطاقةُ نفسُها بعد موافقتها. */
    const committee = out.filter(item => item.side === "committee");
    return committeeActs && registrationActs && committee.length ? committee : out;
  }, [rows, committeeActs, registrationActs]);

  /* ── تصديرُ ما يُعرض، كما يُعرض ──────────────────────────────────────────
     التسجيلُ يصفّي «بانتظار التسجيل» فيصدّر الكشفَ المعتمد جاهزاً للتسجيل،
     واللجنةُ تصدّر ما تريد مراجعته. لا يُصدَّر إلا ما في الشاشة وبالتصفية
     نفسها — فلا يخرج مقرّرٌ لم توافق عليه اللجنة في ملفّ التسجيل. */
  const exportVisible = async () => {
    const section = sectionOptions.find(item => item.value === sectionId)?.label || "القسم";
    const term = (terms || []).find(item => Number(item.AdTermId) === termId)?.AdTermName || "الفصل";
    /* التصديرُ يُخرج ما يُعرض بالتصفية نفسها (وبمقرّراتها)، فلا يخرج في ملف التسجيل ما لم توافق عليه اللجنة. */
    const shownViews = visibleCases.map(view => ({
      ...view,
      courses: view.caseLevel ? view.courses : view.courses.filter(course => course.partner || statusFilter === "all" || statusOf(course) === statusFilter),
    }));
    await exportStudentCasesXlsx(shownViews, `كشف_التسجيل_${section}_${term}.xlsx`);
  };

  /* موافقةُ اللجنة على كل ما ينتظرها في طلب طالبٍ واحد — لا على الكشف كله:
     النظرُ في كل طالب هو عملُ اللجنة، والزرُّ يختصر النقرات لا المراجعة. */
  const approveAll = async (row: CaseRow) => {
    if (frozen) return;
    const pending = row.courses.filter(course => !course.settled && !course.droppedByStudent && !course.readOnly);
    if (!pending.length) return;
    setBusyKey(`${row.id}:all`);
    setError(null);
    try {
      for (const course of pending) {
        await request(`/api/student-registration/${row.id}/course-state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id, state: "awaiting-registration" }),
        });
      }
      await load();
    } catch (e: any) { setError(e.message); await load(); }
    finally { setBusyKey(null); }
  };

  const setState = async (row: CaseRow, course: CaseCourse, state: StudentCourseStateValue, extra: any = {}) => {
    if (frozen) return;
    const key = `${row.id}:${course.id}`;
    setBusyKey(key);
    setError(null);
    try {
      await request(`/api/student-registration/${row.id}/course-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: course.id, state, ...extra }),
      });
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusyKey(null); }
  };

  /* قرارٌ في الحالة كلها (طلب الخريج): اللجنةُ ثم التسجيل، والخادمُ يحرس الترتيب. */
  const setCaseState = async (row: CaseRow, side: "committee" | "registrar", decision: "approved" | "rejected" | "pending", extra: any = {}) => {
    if (frozen) return;
    const key = `${row.id}:case`;
    setBusyKey(key);
    setError(null);
    try {
      await request(`/api/student-registration/${row.id}/case-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, decision, ...extra }),
      });
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusyKey(null); }
  };

  /* ── الكشفُ في شكل السجلّ ────────────────────────────────────────────────
     كلُّ صفٍّ يُقرأ كما يقرؤه سجلُّ مركز الذكاء: الاسم والرقم المدني وقسم
     الطالب ونوع الطلب والمقررات بطرفيها. والقرار يُرسم داخل الخانة نفسها. */
  const rowById = useMemo(() => new Map((rows || []).map(row => [row.id, row] as const)), [rows]);
  const visibleCases = useMemo<StudentCaseView[]>(() => visible.map(row => ({
    id: row.id, caseRef: row.caseRef, name: row.name, civil: row.civil,
    studentSectionName: row.studentSectionName, curriculum: row.curriculum, requestType: row.requestType, createdAt: row.createdAt,
    details: row.details,
    graduateReason: row.graduate?.reason,
    passedUnits: row.graduate ? row.graduate.passedUnits : undefined,
    requiredUnits: row.graduate ? row.graduate.requiredUnits : undefined,
    eligibility: row.graduate?.eligibility,
    caseLevel: row.caseLevel, caseStatus: row.caseStatus,
    caseReasonCode: (row.caseState?.registrar || row.caseState?.committee)?.reasonCode,
    caseNote: (row.caseState?.registrar || row.caseState?.committee)?.note,
    courses: [
      ...row.courses.map(course => ({
        id: course.id, name: course.name, code: course.code, sectionId: course.sectionId, sectionName: course.sectionName || course.decidedBySectionName,
        state: course.state, settled: course.settled, readOnly: course.readOnly, droppedByStudent: course.droppedByStudent, droppedLabel: course.droppedLabel,
        decidedBySectionName: course.decidedBySectionName, reasonCode: course.reasonCode, note: course.note,
      })),
      /* الطرفُ الآخر في «تعارض مقررين» يُعرض مكدَّساً مع طرفه، بلا قرارٍ هنا. */
      ...(row.partnerCourses || []).map((course, index) => ({ id: `partner-${course.id ?? index}`, name: course.name, code: course.code, sectionId: course.sectionId ?? -1, sectionName: course.sectionName, partner: true })),
    ],
  })), [visible]);
  const printScope = [
    sectionOptions.find(item => item.value === sectionId)?.label,
    (terms || []).find(item => Number(item.AdTermId) === termId)?.AdTermName,
  ].filter(Boolean).join(" · ");
  const decidedByRegistration = (course: CaseCourse) => course.settled && (course.state === "registered" || course.state === "rejected");

  const courseDecision = (row: CaseRow, course: CaseCourse) => {
    const key = `${row.id}:${course.id}`;
    return (
      <span className="student-case-decision" data-state={course.settled ? course.state : "pending"}>
        <CaseStateChip state={course.readOnly ? "readonly" : course.settled ? course.state : "pending"} label={courseStateLabel(course)} readonly={course.readOnly} />
        {course.reasonCode ? <em>{reasonLabel(course.reasonCode)}{course.note ? ` · ${course.note}` : ""}</em>
          : course.note ? <em>{course.note}</em> : null}
        {course.droppedByStudent ? <em className="registration-dropped">{course.droppedLabel || "ألغاه الطالب بعد التسجيل"}</em> : null}
            {!frozen && committeeActs && !course.settled && !course.readOnly && !course.droppedByStudent && openings.get(course.id) ? (() => {
              const proposal = openings.get(course.id)!, slot = proposal.slot;
              return (
                <ApplyProposal
                  compact
                  icon="check"
                  label="موافقة + فتح شعبة"
                  lines={[
                    `موافقةُ اللجنة على طلب «${course.name}»`,
                    `وفتحُ شعبةٍ جديدة له في الجدول: ${slot.dayLabel} ${formatScheduleTimeRange(slot.start, slot.end)} · ${slot.roomCode}${slot.roomHall ? `/${slot.roomHall}` : ""} · ${slot.instructorName}`,
                  ]}
                  why={`${countOf(proposal.shortfall, AR.student)} بلا مقعدٍ في هذا المقرر اليوم.`}
                  run={async () => {
                    const result = await request(`/api/student-registration/${row.id}/course-state`, {
                      method: "POST", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ courseId: course.id, state: "awaiting-registration", openSection: slot }),
                    });
                    return { summary: `وُوفق على الطلب وفُتحت شعبة ${result.opened?.sectionCode || "جديدة"} في الجدول`, amendment: Boolean(result.opened?.amendment) };
                  }}
                  onApplied={() => { void load(); void loadOpenings(); }}
                />
              );
            })() : null}
        {committeeActs && !(registrationActs && course.state === "awaiting-registration") && !course.readOnly && !course.droppedByStudent && !decidedByRegistration(course)
          && (!course.settled || course.state === "committee-rejected" || course.state === "awaiting-registration") ? (
          <span className="student-case-actions" aria-label="قرار اللجنة">
            {!(course.settled && course.state === "awaiting-registration") ? <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key || busyKey === `${row.id}:all`}
              data-guide-target="registration.action.state"
              onClick={() => void setState(row, course, "awaiting-registration")}
            >
              <Check aria-hidden="true" /> موافقة اللجنة
            </button> : null}

            {!course.settled || course.state === "awaiting-registration" ? <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key || busyKey === `${row.id}:all`}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course, committee: true })}
            >
              <X aria-hidden="true" /> رفض اللجنة
            </button> : null}
          </span>
        ) : null}
        {registrationActs && !course.readOnly && !course.droppedByStudent && course.settled && course.state !== "committee-rejected" ? (
          <span className="student-case-actions" aria-label="قرار التسجيل">
            {course.state === "awaiting-registration" ? <>
            <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => void setState(row, course, "registered")}
            >
              <Check aria-hidden="true" /> سجّل
            </button>
            <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course, committee: false })}
            >
              <X aria-hidden="true" /> ردّ التسجيل
            </button>
            </> : (
              <button
                type="button" className="changes-chip"
                disabled={frozen || busyKey === key}
                data-guide-target="registration.action.state"
                onClick={() => void setState(row, course, "awaiting-registration")}
              >
                <Clock3 aria-hidden="true" /> إعادة للانتظار
              </button>
            )}
          </span>
        ) : null}
      </span>
    );
  };

  /* طلبُ الخريج: قرارٌ واحدٌ في الحالة كلها — اللجنةُ ثم التسجيل. */
  const caseDecision = (row: CaseRow) => {
    const key = `${row.id}:case`;
    const status = row.caseStatus || "pending";
    const last = row.caseState?.registrar || row.caseState?.committee;
    return (
      <span className="student-case-decision" data-state={status}>
        <CaseStateChip state={status} label={CASE_STATUS_LABEL[status]} />
        {last?.reasonCode ? <em>{reasonLabel(last.reasonCode)}{last.note ? ` · ${last.note}` : ""}</em>
          : last?.note ? <em>{last.note}</em> : null}
        {row.graduate && !row.graduate.nameMatched ? <em>الاسم في صحيفة التخرج لم يُطابق حرفياً</em> : null}
        {committeeActs && !(registrationActs && status === "approved") && (status === "pending" || status === "approved" || status === "committee-rejected") ? (
          <span className="student-case-actions" aria-label="قرار اللجنة في الحالة">
            {status !== "approved" ? <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => void setCaseState(row, "committee", "approved")}
            >
              <Check aria-hidden="true" /> موافقة اللجنة
            </button> : null}
            {status !== "committee-rejected" ? <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course: null, committee: true })}
            >
              <X aria-hidden="true" /> رفض اللجنة
            </button> : null}
          </span>
        ) : null}
        {registrationActs && row.caseState?.committee?.state === "approved" ? (
          <span className="student-case-actions" aria-label="قرار التسجيل في الحالة">
            {status === "approved" ? <>
            <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => void setCaseState(row, "registrar", "approved")}
            >
              <Check aria-hidden="true" /> سجّل الطلب
            </button>
            <button
              type="button" className="changes-chip"
              disabled={frozen || busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course: null, committee: false })}
            >
              <X aria-hidden="true" /> ردّ التسجيل
            </button>
            </> : status === "registered" || status === "rejected" ? (
              <button
                type="button" className="changes-chip"
                disabled={frozen || busyKey === key}
                data-guide-target="registration.action.state"
                onClick={() => void setCaseState(row, "registrar", "pending")}
              >
                <Clock3 aria-hidden="true" /> إعادة للانتظار
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    );
  };

  /* ما يُقال عن الحالة تحت مقرّراتها: ملاحظاتُ الطالب وطلبُ خريجٍ استُبدل. */
  const caseNote = (row: CaseRow) => {
    if (row.caseLevel) return null;
    if (!row.details && !row.caseDroppedAt) return null;
    return (
      <span className="student-case-notes">
        {row.details ? <em className="registration-details" title={`ملاحظات الطالب: ${row.details}`}><MessageSquareText aria-hidden="true" /><span className="sr-only">ملاحظات الطالب: </span>{row.details.replace(/^من «مساري» بعد التسجيل — /, "")}</em> : null}
        {row.caseDroppedAt ? <em className="registration-dropped">ألغى الطالب طلب الخريج السابق بعد قرارٍ فيه، واستبدله بهذا الطلب.</em> : null}
      </span>
    );
  };

  const caseAction = (item: StudentCaseView) => {
    const row = rowById.get(item.id);
    const pendingHere = Boolean(row && committeeActs && !row.caseLevel && row.courses.some(course => !course.settled && !course.readOnly && !course.droppedByStudent));
    if (!row || !pendingHere) return null;
    return <button
      type="button" className="changes-chip student-case-approve-all"
      disabled={frozen || busyKey === `${row.id}:all`}
      data-guide-target="registration.action.state"
      onClick={() => void approveAll(row)}
    ><CheckCheck aria-hidden="true" /> موافقة مقررات الطالب</button>;
  };

  const selects: ScopeAskSelect[] = [
    { key: "college", label: "الكلية", value: collegeId, placeholder: "اختر الكلية", options: collegeOptions },
    { key: "section", label: "القسم", value: sectionId, placeholder: "اختر القسم", options: sectionOptions, disabled: !collegeId },
    { key: "term", label: "الفصل", value: termId, placeholder: "اختر الفصل", options: scopedTerms.map(row => ({ value: row.AdTermId, label: row.AdTermName })) },
  ];

  if (!terms) return <MicroLoader label="يقرأ الفصول…" />;

  return (
    <div className="content-stack changes-screen visual-minimal">
      <PageTitle
        eyebrow={<><ClipboardList aria-hidden="true" /> التسجيل</>}
        subtitle="ما طلبه الطلبة: اللجنة توافق أولاً، ثم يسجّل التسجيل"
      >
        كشف التسجيل
      </PageTitle>

      <ScopeAskBar
        idPrefix="registration"
        label="نطاق الكشف"
        ask={ask}
        onAskChange={setAsk}
        onAskSubmit={setAsk}
        askPlaceholder="اسأل: رقم الحالة أو اسم الطالب"
        onClear={() => setAsk("")}
        selects={pinSingleScope(selects, scopes, powerAdmin)}
        onSelect={(key, value) => {
          const id = Number(value) || 0;
          if (key === "college") {
            const only = singleDepartmentOf(scopes, id, powerAdmin) ?? 0;
            sharedScope.pick({ collegeId: id, sectionId: only });
            setCollegeId(id); setSectionId(only);
          }
          else if (key === "section") { sharedScope.pick({ sectionId: id }); setSectionId(id); }
          else { sharedScope.pick({ termId: id }); setTermId(id); }
        }}
      />

      <TermFrozenRibbon termId={termId} terms={terms} onGoCurrent={id => { sharedScope.pick({ termId: id }); setTermId(id); }} />

      {error ? <Notice type="error" onDismiss={() => setError(null)}>{error}</Notice> : null}

      {!collegeId || !sectionId || !termId ? (
        <EmptyState title="اختر النطاق" detail="يُعرض كشف التسجيل لقسمٍ واحدٍ في فصلٍ واحد." />
      ) : !rows ? (
        <MicroLoader label="يقرأ الكشف…" />
      ) : !rows.length ? (
        <EmptyState
          title="لا طلبات بعد"
          detail="يصل الكشفُ من استبيان الطلبة. ما لم يجب أحدٌ بعد، لا شيء هنا."
        />
      ) : (
        <>
<RegistrationJourney
            totals={{ all: totals?.students ?? 0, pending: totals?.pendingCommittee ?? 0, approved: totals?.waiting ?? 0, registered: totals?.registered ?? 0 }}
            active={statusFilter} registrationView={viewer === "registration"}
            onPick={value => { filterChosen.current = true; setStatusFilter(value); }}
          />

          {quickItems.length > 0 ? (
            <button type="button" className="qd-open" disabled={frozen} onClick={() => setQuick(true)} data-guide-ignore="يفتح نافذة القرار السريع؛ لا يكتب شيئاً قبل أن تقرّر">
              <Zap aria-hidden="true" /> قرار سريع <b>{quickItems.length.toLocaleString("ar-KW-u-nu-latn")}</b>
            </button>
          ) : null}

          {!canWrite ? (
            <p className="registration-readonly" title="الموافقةُ للجنة القسم، والتسجيلُ لموظفي التسجيل.">
              <Clock3 aria-hidden="true" /> للقراءة فقط
            </p>
          ) : null}

          {/* ── السجلّ نفسه الذي في مركز الذكاء ─────────────────────────────
              «كشف التسجيل هنا خله نفس اللي في مركز الذكاء»: الجدول والتصفية
              بالنوع والطباعة من StudentCasesTable، والقرار طبقةٌ داخله. */}
          <StudentCasesTable
            cases={visibleCases}
            total={rows.length}
            sectionId={sectionId}
            emptyText="لا طالبَ يطابق البحث أو الحالة المختارة."
            print={{ scope: printScope, college: collegeOptions.find(item => item.value === collegeId)?.label || "" }}
            activeFilterCount={statusFilter !== "all" ? 1 : 0}
            exportName="كشف_التسجيل.xlsx" onExport={() => void exportVisible()} readOnly={frozen}
            toolbarOutside={!visible.length && (needle || statusFilter !== "all") ? (
              <SecondaryButton type="button" onClick={() => { setAsk(""); filterChosen.current = true; setStatusFilter("all"); }} data-guide-ignore="مسح البحث — عرضٌ لا فعل">اعرض الكل</SecondaryButton>
            ) : null}
            toolbarExtra={
              <div className="registration-filter" role="group" aria-label="تصفية حسب الحالة">
                {([
                  ["all", "الكل"],
                  ...(viewer !== "registration" ? [["pending", PENDING_COMMITTEE], ["committee-rejected", "لم توافق اللجنة"]] : []),
                  ["approved", "بانتظار التسجيل"],
                  ["registered", "سُجّل"],
                  ["rejected", "ردّه التسجيل"],
                ] as Array<[StatusFilter, string]>)
                  /* حالةٌ لا طالبَ فيها لا تُعرض مرشّحاً — إلا المختارةُ الآن. */
                  /* محطّاتُ رحلة الطلب فوق الجدول هي المرشّح؛ هنا ما لا محطّةَ له فقط (الردّ). */
                  .filter(([value]) => (value === "committee-rejected" || value === "rejected") && (statusCounts[value] || statusFilter === value))
                  .map(([value, label]) => (
                  <button
                    key={value} type="button" className="changes-chip"
                    data-active={statusFilter === value || undefined}
                    onClick={() => { filterChosen.current = true; setStatusFilter(value); }}
                    data-guide-ignore="تصفية العرض — لا يغيّر شيئاً"
                  >
                    {label}{value !== "all" && statusCounts[value] ? ` · ${statusCounts[value]}` : ""}
                  </button>
                ))}
              </div>
            }
            renderCourseDecision={(item, view) => {
              const row = rowById.get(item.id);
              const course = row?.courses.find(entry => String(entry.id) === String(view.id));
              return row && course ? courseDecision(row, course) : null;
            }}
            renderCaseDecision={item => {
              const row = rowById.get(item.id);
              return row?.caseLevel ? caseDecision(row) : null;
            }}
            renderCaseNote={item => {
              const row = rowById.get(item.id);
              return row ? caseNote(row) : null;
            }}
            renderCaseAction={caseAction}
            printStatus={item => {
              const row = rowById.get(item.id);
              if (!row) return "";
              if (row.caseLevel) return CASE_STATUS_LABEL[row.caseStatus || "pending"];
              return row.courses.map(course => `${course.name}: ${courseStateLabel(course)}`).join(" · ");
            }}
          />
        </>
      )}

      {quick ? (
        <QuickDecide
          items={quickItems}
          busy={busyKey !== null}
          onClose={() => setQuick(false)}
          onApprove={item => {
            if (item.course) void setState(item.row, item.course, item.side === "committee" ? "awaiting-registration" : "registered");
            else void setCaseState(item.row, item.side === "committee" ? "committee" : "registrar", "approved");
          }}
          onReject={item => setRejecting({ row: item.row, course: item.course, committee: item.side === "committee" })}
        />
      ) : null}

      {rejecting ? (
        <RejectSheet
          course={rejecting.course || { name: "حالة الخريج" }}
          committee={rejecting.committee}
          busy={busyKey === `${rejecting.row.id}:${rejecting.course ? rejecting.course.id : "case"}`}
          onClose={() => setRejecting(null)}
          onSubmit={(reason, note) => {
            const target = rejecting;
            setRejecting(null);
            if (!target.course) {
              void setCaseState(target.row, target.committee ? "committee" : "registrar", "rejected", { reasonCode: reason, note });
              return;
            }
            void setState(target.row, target.course, target.committee ? "committee-rejected" : "rejected", { reasonCode: reason, note });
          }}
        />
      ) : null}
    </div>
  );
}
