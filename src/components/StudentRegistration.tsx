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
 * **ولا تعرض جدولاً ولا شعبة.** الحالةُ قولٌ عن طلب طالبٍ بعينه، لا عن مقعد.
 * النظامُ لا يملك المقاعد، والتسجيلُ هو صاحبُها — وادّعاءُ غير ذلك يصنع زحمةً
 * أسوأَ حين يكتشف الطالبُ أن ما قرأه ليس تسجيلاً.
 *
 * **والبحثُ برقم الحالة أولاً.** الطالبُ يقف أمام الموظّف حاملاً رقماً من
 * ثمانية أحرف؛ وكتابتُه أسرعُ من اثني عشر رقماً مدنياً، ولا تكشف شيئاً لمن
 * يقف خلفه في الطابور.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, ClipboardList, Clock3, Download, X } from "lucide-react";
import ScopeAskBar, { type ScopeAskSelect } from "./ScopeAskBar";
import StudentCasesTable, { GRADUATE_REASON_LABEL, STUDENT_CASE_TYPE_LABEL, type StudentCaseView } from "./StudentCasesTable";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface } from "./ui";
import { AR, nounFor } from "../utils/arabicCount";
import { currentTermId } from "../utils/termSequence";
import { singleDepartmentOf } from "../utils/scopeContext";
import { readSharedScope, resolveSharedScope, useSharedScope } from "../utils/sharedScope";
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

/* ── اللجنةُ أولاً، ثم التسجيل ────────────────────────────────────────────
   ما لم تقل فيه اللجنة شيئاً «بانتظار اللجنة» ولا يراه التسجيل. ما وافقت عليه
   يُسلَّم «بانتظار التسجيل»، وما لم توافق عليه يبقى عندها بسببه. */
const PENDING_COMMITTEE = "بانتظار اللجنة";
const STATE_LABEL: Record<string, string> = {
  "awaiting-registration": "وافقت اللجنة · بانتظار التسجيل",
  "committee-rejected": "لم توافق اللجنة",
  registered: "سُجّل",
  rejected: "ردّه التسجيل",
};

const REJECT_REASONS: Array<[StudentCourseRejectReason, string]> = [
  ["no-seat", "لا مقاعد"],
  ["prerequisite", "متطلّب سابق"],
  ["level", "المستوى"],
  ["conflict", "تعارض في جدوله"],
  ["closed", "الشعبة مغلقة"],
  ["other", "سبب آخر"],
];

const COMMITTEE_REASONS: Array<[StudentCommitteeRejectReason, string]> = [
  ["not-eligible", "لا تنطبق عليه الشروط"],
  ["not-in-plan", "ليس من خطته الدراسية"],
  ["prerequisite", "متطلّب سابق"],
  ["duplicate", "طلب مكرر أو سبق تسجيله"],
  ["other", "سبب آخر"],
];
const reasonLabel = (code?: string) =>
  [...REJECT_REASONS, ...COMMITTEE_REASONS].find(([value]) => value === code)?.[1] || "";

type StatusFilter = "all" | "pending" | "approved" | "committee-rejected" | "registered" | "rejected";
const statusOf = (course: CaseCourse): Exclude<StatusFilter, "all"> =>
  !course.settled ? "pending"
    : course.state === "awaiting-registration" ? "approved"
      : course.state as Exclude<StatusFilter, "all" | "pending" | "approved">;

/** حالةُ الخريج بالتصنيف نفسه، وبكلماتٍ تناسب قراراً في الحالة كلها. */
const CASE_STATUS_LABEL: Record<StudentCaseStatus, string> = {
  pending: PENDING_COMMITTEE,
  approved: "وافقت اللجنة · بانتظار التسجيل",
  "committee-rejected": "لم توافق اللجنة",
  registered: "نفّذه التسجيل",
  rejected: "ردّه التسجيل",
};
/** البنودُ التي تنتظر قراراً في صفٍّ واحد: مقرّراته، أو حالتُه كلها. */
const rowStatuses = (row: CaseRow): Array<Exclude<StatusFilter, "all">> =>
  row.caseLevel ? [row.caseStatus || "pending"] : row.courses.filter(course => !course.readOnly).map(statusOf);

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

/* ── الشاشة ─────────────────────────────────────────────────────────────── */

export default function StudentRegistration({ scopes, powerAdmin = false }: Props) {
  const [terms, setTerms] = useState<AdTerm[] | null>(null);
  const [termId, setTermId] = useState(0);
  /* الكلية والقسم من النطاق المشترك (src/utils/sharedScope.ts)، معروضين على
     نطاق القارئ؛ وافتراض الشاشة أدناه («أوّل كلية») لا يُكتب فيه. */
  const [collegeId, setCollegeId] = useState(() => resolveSharedScope(readSharedScope(), { scopes, isAdmin: powerAdmin }).collegeId);
  const [sectionId, setSectionId] = useState(() => resolveSharedScope(readSharedScope(), { scopes, isAdmin: powerAdmin }).sectionId);
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
        .sort((a, b) => a.label.localeCompare(b.label, "ar"));
    }
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      const id = Number(scope.AdCollegeId);
      if (id && !seen.has(id)) seen.set(id, String(scope.AdCollegeName || `كلية ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, catalog]);

  const sectionOptions = useMemo(() => {
    if (catalog) {
      return catalog.sections
        .filter(row => !collegeId || Number(row.AdCollegeId) === collegeId)
        .map(row => ({ value: Number(row.AdSectionId), label: String(row.AdSectionName || `قسم ${row.AdSectionId}`) }))
        .filter(item => item.value)
        .sort((a, b) => a.label.localeCompare(b.label, "ar"));
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

  const committeeActs = canWrite && (viewer === "committee" || viewer === "both");
  const registrationActs = canWrite && (viewer === "registration" || viewer === "both");
  /* قرارُ التسجيل لا تنقضه اللجنة. */
  const decidedByRegistration = (course: CaseCourse) => course.settled && (course.state === "registered" || course.state === "rejected");
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows || []) for (const status of rowStatuses(row)) counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, [rows]);

  /* ── تصديرُ ما يُعرض، كما يُعرض ──────────────────────────────────────────
     التسجيلُ يصفّي «بانتظار التسجيل» فيصدّر الكشفَ المعتمد جاهزاً للتسجيل،
     واللجنةُ تصدّر ما تريد مراجعته. لا يُصدَّر إلا ما في الشاشة وبالتصفية
     نفسها — فلا يخرج مقرّرٌ لم توافق عليه اللجنة في ملفّ التسجيل. */
  const exportVisible = async () => {
    const XLSX = await import("xlsx");
    const headers = ["رقم الحالة", "اسم الطالب", "الرقم المدني", "نوع الطلب", "رمز المقرر", "المقرر", "الحالة", "السبب", "ملاحظة", "ملاحظات الطالب"];
    const body = visible.flatMap(row => row.caseLevel
      ? [(() => {
          const last = row.caseState?.registrar || row.caseState?.committee;
          return [
            row.caseRef, row.name || "", row.civil || "", REQUEST_TYPE_LABEL[row.requestType] || row.requestType, "", `حالة خريج — ${GRADUATE_REASON_LABEL[row.graduate?.reason || ""] || ""}`,
            CASE_STATUS_LABEL[row.caseStatus || "pending"], reasonLabel(last?.reasonCode), last?.note || "", row.details || "",
          ];
        })()]
      : row.courses
      .filter(course => statusFilter === "all" || statusOf(course) === statusFilter)
      .map(course => [
        row.caseRef, row.name || "", row.civil || "", REQUEST_TYPE_LABEL[row.requestType] || row.requestType, course.code || "", course.name || "",
        course.droppedByStudent ? (course.droppedLabel || "ألغاه الطالب") : course.readOnly ? `يقرّره قسم ${course.decidedBySectionName || "آخر"}`
          : course.settled ? STATE_LABEL[course.state] || course.state : PENDING_COMMITTEE,
        reasonLabel(course.reasonCode), course.note || "", row.details || "",
      ]));
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
    (sheet as any)["!cols"] = [{ wch: 11 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 11 }, { wch: 30 }, { wch: 26 }, { wch: 22 }, { wch: 24 }, { wch: 30 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "كشف التسجيل");
    const section = sectionOptions.find(item => item.value === sectionId)?.label || "القسم";
    const term = (terms || []).find(item => Number(item.AdTermId) === termId)?.AdTermName || "الفصل";
    XLSX.writeFile(book, `كشف_التسجيل_${section}_${term}.xlsx`.replace(/[\\/*?:"<>|]/g, "_"));
  };

  /* موافقةُ اللجنة على كل ما ينتظرها في طلب طالبٍ واحد — لا على الكشف كله:
     النظرُ في كل طالب هو عملُ اللجنة، والزرُّ يختصر النقرات لا المراجعة. */
  const approveAll = async (row: CaseRow) => {
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
    courses: [
      ...row.courses.map(course => ({ id: course.id, name: course.name, code: course.code, sectionId: course.sectionId, sectionName: course.sectionName || course.decidedBySectionName })),
      /* الطرفُ الآخر في «تعارض مقررين» يُعرض مكدَّساً مع طرفه، بلا قرارٍ هنا. */
      ...(row.partnerCourses || []).map((course, index) => ({ id: `partner-${course.id ?? index}`, name: course.name, code: course.code, sectionId: course.sectionId ?? -1, sectionName: course.sectionName })),
    ],
  })), [visible]);
  const printScope = [
    sectionOptions.find(item => item.value === sectionId)?.label,
    (terms || []).find(item => Number(item.AdTermId) === termId)?.AdTermName,
  ].filter(Boolean).join(" · ");
  const courseStateLabel = (course: CaseCourse) => course.droppedByStudent ? (course.droppedLabel || "ألغاه الطالب")
    : course.readOnly ? `يقرّره قسم ${course.decidedBySectionName || "آخر"}`
    : course.settled ? STATE_LABEL[course.state] || course.state : PENDING_COMMITTEE;

  const courseDecision = (row: CaseRow, course: CaseCourse) => {
    const key = `${row.id}:${course.id}`;
    return (
      <span className="student-case-decision" data-state={course.settled ? course.state : "pending"}>
        <span className="student-case-state" data-state={course.readOnly ? "readonly" : course.settled ? course.state : "pending"}>
          {course.readOnly ? `يقرّره قسم ${course.decidedBySectionName || "آخر"}` : course.settled ? STATE_LABEL[course.state] || course.state : PENDING_COMMITTEE}
        </span>
        {course.reasonCode ? <em>{reasonLabel(course.reasonCode)}{course.note ? ` · ${course.note}` : ""}</em>
          : course.note ? <em>{course.note}</em> : null}
        {course.droppedByStudent ? <em className="registration-dropped">{course.droppedLabel || "ألغاه الطالب بعد التسجيل"}</em> : null}
        {committeeActs && !course.readOnly && !course.droppedByStudent && !decidedByRegistration(course) ? (
          <span className="student-case-actions" aria-label="قرار اللجنة">
            <button
              type="button" className="changes-chip"
              data-active={(course.settled && course.state === "awaiting-registration") || undefined}
              disabled={busyKey === key || busyKey === `${row.id}:all`}
              data-guide-target="registration.action.state"
              onClick={() => void setState(row, course, "awaiting-registration")}
            >
              <Check aria-hidden="true" /> موافقة
            </button>
            <button
              type="button" className="changes-chip"
              data-active={course.state === "committee-rejected" || undefined}
              disabled={busyKey === key || busyKey === `${row.id}:all`}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course, committee: true })}
            >
              <X aria-hidden="true" /> لا توافق
            </button>
          </span>
        ) : null}
        {registrationActs && !course.readOnly && !course.droppedByStudent && course.settled && course.state !== "committee-rejected" ? (
          <span className="student-case-actions" aria-label="قرار التسجيل">
            <button
              type="button" className="changes-chip"
              data-active={course.state === "registered" || undefined}
              disabled={busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => void setState(row, course, "registered")}
            >
              <Check aria-hidden="true" /> سُجّل
            </button>
            <button
              type="button" className="changes-chip"
              data-active={course.state === "rejected" || undefined}
              disabled={busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course, committee: false })}
            >
              <X aria-hidden="true" /> رُدّ
            </button>
            {course.state !== "awaiting-registration" ? (
              <button
                type="button" className="changes-chip"
                disabled={busyKey === key}
                data-guide-target="registration.action.state"
                onClick={() => void setState(row, course, "awaiting-registration")}
              >
                <Clock3 aria-hidden="true" /> أعِده للانتظار
              </button>
            ) : null}
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
        <span className="student-case-state" data-state={status}>{CASE_STATUS_LABEL[status]}</span>
        {last?.reasonCode ? <em>{reasonLabel(last.reasonCode)}{last.note ? ` · ${last.note}` : ""}</em>
          : last?.note ? <em>{last.note}</em> : null}
        {row.graduate && !row.graduate.nameMatched ? <em>الاسم في صحيفة التخرج لم يُطابق حرفياً</em> : null}
        {committeeActs && !row.caseState?.registrar ? (
          <span className="student-case-actions" aria-label="قرار اللجنة في الحالة">
            <button
              type="button" className="changes-chip"
              data-active={status === "approved" || undefined}
              disabled={busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => void setCaseState(row, "committee", "approved")}
            >
              <Check aria-hidden="true" /> موافقة
            </button>
            <button
              type="button" className="changes-chip"
              data-active={status === "committee-rejected" || undefined}
              disabled={busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course: null, committee: true })}
            >
              <X aria-hidden="true" /> لا توافق
            </button>
          </span>
        ) : null}
        {registrationActs && row.caseState?.committee?.state === "approved" ? (
          <span className="student-case-actions" aria-label="قرار التسجيل في الحالة">
            <button
              type="button" className="changes-chip"
              data-active={status === "registered" || undefined}
              disabled={busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => void setCaseState(row, "registrar", "approved")}
            >
              <Check aria-hidden="true" /> نُفّذ
            </button>
            <button
              type="button" className="changes-chip"
              data-active={status === "rejected" || undefined}
              disabled={busyKey === key}
              data-guide-target="registration.action.state"
              onClick={() => setRejecting({ row, course: null, committee: false })}
            >
              <X aria-hidden="true" /> رُدّ
            </button>
            {row.caseState?.registrar ? (
              <button
                type="button" className="changes-chip"
                disabled={busyKey === key}
                data-guide-target="registration.action.state"
                onClick={() => void setCaseState(row, "registrar", "pending")}
              >
                <Clock3 aria-hidden="true" /> أعِده للانتظار
              </button>
            ) : null}
          </span>
        ) : null}
      </span>
    );
  };

  /* ما يُقال عن الحالة تحت مقرّراتها: ملاحظاتُ الطالب، وطلبُ خريجٍ استُبدل،
     و«موافقة على الكل» لطالبٍ واحد. */
  const caseNote = (row: CaseRow) => {
    const pendingHere = committeeActs && !row.caseLevel && row.courses.some(course => !course.settled && !course.readOnly && !course.droppedByStudent);
    if (row.caseLevel) return null;
    if (!row.details && !row.caseDroppedAt && !pendingHere) return null;
    return (
      <span className="student-case-notes">
        {row.details ? <em className="registration-details">ملاحظات الطالب: {row.details}</em> : null}
        {row.caseDroppedAt ? <em className="registration-dropped">ألغى الطالب طلب الخريج السابق بعد قرارٍ فيه، واستبدله بهذا الطلب.</em> : null}
        {pendingHere ? (
          <button
            type="button" className="changes-chip student-case-approve-all"
            disabled={busyKey === `${row.id}:all`}
            data-guide-target="registration.action.state"
            onClick={() => void approveAll(row)}
          >
            <CheckCheck aria-hidden="true" /> موافقة على الكل
          </button>
        ) : null}
      </span>
    );
  };

  const selects: ScopeAskSelect[] = [
    { key: "college", label: "الكلية", value: collegeId, placeholder: "اختر الكلية", options: collegeOptions },
    /* من لا يملك في الكلية إلا قسماً واحداً يرى «الكلية + الفصل» كلوحة الجدول. */
    ...(singleDepartmentOf(scopes, collegeId, powerAdmin) === null
      ? [{ key: "section", label: "القسم", value: sectionId, placeholder: "اختر القسم", options: sectionOptions, disabled: !collegeId }]
      : []),
    { key: "term", label: "الفصل", value: termId, placeholder: "اختر الفصل", options: (terms || []).map(row => ({ value: row.AdTermId, label: row.AdTermName })) },
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
        selects={selects}
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
          <Surface className="request-totals">
            <div><b>{totals?.students ?? 0}</b><span>{nounFor(totals?.students ?? 0, AR.student)} {nounFor(totals?.students ?? 0, viewer === "registration" ? AR.handedOverVerb : AR.answeredVerb)}</span></div>
            {/* الصفرُ لا يُعرض لوحةً (قاعدة إخفاء الفارغ): العددُ الأول يكفي جواباً. */}
            {viewer !== "registration" && totals?.pendingCommittee ? <div><b>{totals.pendingCommittee}</b><span>ينتظر اللجنة</span></div> : null}
            {totals?.waiting ? <div><b>{totals.waiting}</b><span>ينتظر التسجيل</span></div> : null}
            {totals?.registered ? <div><b>{totals.registered}</b><span>{nounFor(totals.registered, AR.course)} {nounFor(totals.registered, AR.registeredVerb)}</span></div> : null}
          </Surface>

          {!canWrite ? (
            <p className="registration-readonly">
              <Clock3 aria-hidden="true" /> هذا الكشف للقراءة بصفتك. الموافقةُ فيه للجنة القسم، والتسجيلُ لموظفي التسجيل.
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
                  .filter(([value]) => value === "all" || statusCounts[value] || statusFilter === value)
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
                <button
                  type="button" className="changes-chip registration-export"
                  disabled={!visible.length}
                  onClick={() => void exportVisible()}
                  data-guide-ignore="تصدير ما يُعرض إلى Excel — لا يغيّر شيئاً"
                >
                  <Download aria-hidden="true" /> تصدير Excel
                </button>
                {!visible.length && (needle || statusFilter !== "all") ? (
                  <SecondaryButton type="button" onClick={() => { setAsk(""); filterChosen.current = true; setStatusFilter("all"); }} data-guide-ignore="مسح البحث — عرضٌ لا فعل">اعرض الكل</SecondaryButton>
                ) : null}
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
            printStatus={item => {
              const row = rowById.get(item.id);
              if (!row) return "";
              if (row.caseLevel) return CASE_STATUS_LABEL[row.caseStatus || "pending"];
              return row.courses.map(course => `${course.name}: ${courseStateLabel(course)}`).join(" · ");
            }}
          />
        </>
      )}

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
