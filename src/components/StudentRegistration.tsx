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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CheckCheck, ClipboardList, Clock3, Search, X } from "lucide-react";
import ScopeAskBar, { type ScopeAskSelect } from "./ScopeAskBar";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { currentTermId } from "../utils/termSequence";
import type { AdTerm, StudentCommitteeRejectReason, StudentCourseRejectReason, StudentCourseStateValue } from "../types";

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
}

interface CaseRow {
  id: string; caseRef: string; name: string; civil: string;
  createdAt: string; requestType: string; studentSectionName: string;
  courses: CaseCourse[];
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

const arabicDate = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { month: "long", day: "numeric" });
};

/* ── ورقةُ الردّ ────────────────────────────────────────────────────────── */

function RejectSheet({ course, busy, onClose, onSubmit, committee = false }: {
  course: CaseCourse;
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
  const [collegeId, setCollegeId] = useState(0);
  const [sectionId, setSectionId] = useState(0);
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [viewer, setViewer] = useState<Viewer>("committee");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ row: CaseRow; course: CaseCourse; committee: boolean } | null>(null);
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
        setTermId(current => current || currentTermId(list) || Number(list[list.length - 1]?.AdTermId || 0));
      } catch (e: any) { setError(e.message); setTerms([]); }
    })();
  }, []);

  useEffect(() => {
    /* ومن له الكلُّ لا يُختار له شيء. */
    if (collegeId || powerAdmin || !scopes.length) return;
    setCollegeId(Number(scopes[0].AdCollegeId) || 0);
    if (scopes.length === 1) setSectionId(Number(scopes[0].AdSectionId) || 0);
  }, [scopes, collegeId, powerAdmin]);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setRows(null); return; }
    setError(null);
    try {
      const data = await request(`/api/student-registration?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      setRows(data.rows || []);
      setTotals(data.totals || null);
      setCanWrite(Boolean(data.canWrite));
      setViewer(data.viewer === "registration" || data.viewer === "both" ? data.viewer : "committee");
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);

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
    if (statusFilter !== "all" && !row.courses.some(course => statusOf(course) === statusFilter)) return false;
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
    for (const row of rows || []) for (const course of row.courses) counts[statusOf(course)] = (counts[statusOf(course)] || 0) + 1;
    return counts;
  }, [rows]);

  /* موافقةُ اللجنة على كل ما ينتظرها في طلب طالبٍ واحد — لا على الكشف كله:
     النظرُ في كل طالب هو عملُ اللجنة، والزرُّ يختصر النقرات لا المراجعة. */
  const approveAll = async (row: CaseRow) => {
    const pending = row.courses.filter(course => !course.settled);
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

  const selects: ScopeAskSelect[] = [
    { key: "college", label: "الكلية", value: collegeId, placeholder: "اختر الكلية", options: collegeOptions },
    { key: "section", label: "القسم", value: sectionId, placeholder: "اختر القسم", options: sectionOptions, disabled: !collegeId },
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
          if (key === "college") { setCollegeId(id); setSectionId(0); }
          else if (key === "section") setSectionId(id);
          else setTermId(id);
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
            <div><b>{totals?.students ?? 0}</b><span>{viewer === "registration" ? "طالباً سلّمته اللجنة" : "طالباً أجاب"}</span></div>
            {viewer !== "registration" ? <div><b>{totals?.pendingCommittee ?? 0}</b><span>ينتظر اللجنة</span></div> : null}
            <div><b>{totals?.waiting ?? 0}</b><span>ينتظر التسجيل</span></div>
            <div><b>{totals?.registered ?? 0}</b><span>مقرّراً سُجّل</span></div>
          </Surface>

          <div className="registration-filter" role="group" aria-label="تصفية حسب الحالة">
            {([
              ["all", "الكل"],
              ...(viewer !== "registration" ? [["pending", PENDING_COMMITTEE], ["committee-rejected", "لم توافق اللجنة"]] : []),
              ["approved", "بانتظار التسجيل"],
              ["registered", "سُجّل"],
              ["rejected", "ردّه التسجيل"],
            ] as Array<[StatusFilter, string]>).map(([value, label]) => (
              <button
                key={value} type="button" className="changes-chip"
                data-active={statusFilter === value || undefined}
                onClick={() => setStatusFilter(value)}
                data-guide-ignore="تصفية العرض — لا يغيّر شيئاً"
              >
                {label}{value !== "all" && statusCounts[value] ? ` · ${statusCounts[value]}` : ""}
              </button>
            ))}
          </div>

          {!canWrite ? (
            <p className="registration-readonly">
              <Clock3 aria-hidden="true" /> هذا الكشف للقراءة بصفتك. الموافقةُ فيه للجنة القسم، والتسجيلُ لموظفي التسجيل.
            </p>
          ) : null}

          {!visible.length ? (
            <EmptyState
              title="لا نتائج"
              detail="لا طالبَ يطابق البحث أو الحالة المختارة."
              action={<SecondaryButton type="button" onClick={() => { setAsk(""); setStatusFilter("all"); }} data-guide-ignore="مسح البحث — عرضٌ لا فعل">اعرض الكل</SecondaryButton>}
            />
          ) : (
            <div className="request-deck">
              {visible.map(row => (
                <article key={row.id} className="request-card">
                  <header className="request-card-head">
                    <div>
                      <strong>{row.name || "طالب"}</strong>
                      <small>
                        {row.caseRef}
                        {row.studentSectionName ? ` · ${row.studentSectionName}` : ""}
                        {row.createdAt ? ` · ${arabicDate(row.createdAt)}` : ""}
                      </small>
                    </div>
                    <span className="registration-count">{countOf(row.courses.length, AR.course)}</span>
                    {committeeActs && row.courses.some(course => !course.settled) ? (
                      <button
                        type="button" className="changes-chip"
                        disabled={busyKey === `${row.id}:all`}
                        data-guide-target="registration.action.state"
                        onClick={() => void approveAll(row)}
                      >
                        <CheckCheck aria-hidden="true" /> موافقة على الكل
                      </button>
                    ) : null}
                  </header>

                  <div className="request-items">
                    {row.courses.map(course => {
                      const key = `${row.id}:${course.id}`;
                      return (
                        <div key={course.id} className="registration-course" data-state={course.state}>
                          <div className="registration-course-name">
                            <strong>{course.name}</strong>
                            {course.code ? <small>{course.code}</small> : null}
                          </div>

                          <div className="registration-course-state">
                            <span data-state={course.settled ? course.state : "pending"}>
                              {course.settled ? STATE_LABEL[course.state] || course.state : PENDING_COMMITTEE}
                            </span>
                            {course.reasonCode ? (
                              <em>{reasonLabel(course.reasonCode)}{course.note ? ` · ${course.note}` : ""}</em>
                            ) : course.note ? <em>{course.note}</em> : null}
                          </div>

                          {committeeActs && !decidedByRegistration(course) ? (
                            <div className="registration-course-actions" aria-label="قرار اللجنة">
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
                            </div>
                          ) : null}
                          {registrationActs && course.settled && course.state !== "committee-rejected" ? (
                            <div className="registration-course-actions" aria-label="قرار التسجيل">
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
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {rejecting ? (
        <RejectSheet
          course={rejecting.course}
          committee={rejecting.committee}
          busy={busyKey === `${rejecting.row.id}:${rejecting.course.id}`}
          onClose={() => setRejecting(null)}
          onSubmit={(reason, note) => {
            const target = rejecting;
            setRejecting(null);
            void setState(target.row, target.course, target.committee ? "committee-rejected" : "rejected", { reasonCode: reason, note });
          }}
        />
      ) : null}
    </div>
  );
}
