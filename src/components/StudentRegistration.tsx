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
import { Check, ClipboardList, Clock3, Search, X } from "lucide-react";
import ScopeAskBar, { type ScopeAskSelect } from "./ScopeAskBar";
import { EmptyState, MicroLoader, Notice, PageTitle, PrimaryButton, SecondaryButton, Surface } from "./ui";
import { AR, countOf } from "../utils/arabicCount";
import { currentTermId } from "../utils/termSequence";
import type { AdTerm, StudentCourseRejectReason, StudentCourseStateValue } from "../types";

interface Props {
  scopes: Array<{ AdCollegeId: number; AdSectionId: number; CollegeName?: string; SectionName?: string }>;
}

interface CaseCourse {
  id: number; code: string; name: string;
  state: StudentCourseStateValue;
  reasonCode?: StudentCourseRejectReason;
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
  registered: number; rejected: number; waiting: number;
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

const STATE_LABEL: Record<string, string> = {
  "awaiting-registration": "بانتظار التسجيل",
  registered: "سُجّل",
  rejected: "مردود",
};

const REJECT_REASONS: Array<[StudentCourseRejectReason, string]> = [
  ["no-seat", "لا مقاعد"],
  ["prerequisite", "متطلّب سابق"],
  ["level", "المستوى"],
  ["conflict", "تعارض في جدوله"],
  ["closed", "الشعبة مغلقة"],
  ["other", "سبب آخر"],
];

const arabicDate = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW", { month: "long", day: "numeric" });
};

/* ── ورقةُ الردّ ────────────────────────────────────────────────────────── */

function RejectSheet({ course, busy, onClose, onSubmit }: {
  course: CaseCourse;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: StudentCourseRejectReason, note: string) => void;
}) {
  const [reason, setReason] = useState<StudentCourseRejectReason | "">("");
  const [note, setNote] = useState("");
  return (
    <div className="changes-extend-sheet" role="dialog" aria-modal="true" aria-label="ردّ مقرّر">
      <div className="changes-extend-card">
        <header>
          <strong>ردّ «{course.name}»</strong>
          <button type="button" onClick={onClose} aria-label="إغلاق" data-guide-ignore="إغلاق الورقة — لا يغيّر شيئاً"><X /></button>
        </header>
        <label>
          <span>السبب</span>
          <select value={reason} onChange={event => setReason(event.target.value as any)}>
            <option value="">اختر السبب</option>
            {REJECT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
            onClick={() => onSubmit(reason as StudentCourseRejectReason, note)}
          >
            {busy ? "يحفظ…" : "سجّل الردّ"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── الشاشة ─────────────────────────────────────────────────────────────── */

export default function StudentRegistration({ scopes }: Props) {
  const [terms, setTerms] = useState<AdTerm[] | null>(null);
  const [termId, setTermId] = useState(0);
  const [collegeId, setCollegeId] = useState(0);
  const [sectionId, setSectionId] = useState(0);
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ row: CaseRow; course: CaseCourse } | null>(null);

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
    if (collegeId || !scopes.length) return;
    setCollegeId(Number(scopes[0].AdCollegeId) || 0);
    if (scopes.length === 1) setSectionId(Number(scopes[0].AdSectionId) || 0);
  }, [scopes, collegeId]);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setRows(null); return; }
    setError(null);
    try {
      const data = await request(`/api/student-registration?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`);
      setRows(data.rows || []);
      setTotals(data.totals || null);
      setCanWrite(Boolean(data.canWrite));
    } catch (e: any) { setError(e.message); setRows([]); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);

  const collegeOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      const id = Number(scope.AdCollegeId);
      if (id && !seen.has(id)) seen.set(id, String(scope.CollegeName || `كلية ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes]);

  const sectionOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const scope of scopes) {
      if (collegeId && Number(scope.AdCollegeId) !== collegeId) continue;
      const id = Number(scope.AdSectionId);
      if (id && !seen.has(id)) seen.set(id, String(scope.SectionName || `قسم ${id}`));
    }
    return [...seen].map(([value, label]) => ({ value, label }));
  }, [scopes, collegeId]);

  /* رقمُ الحالة أولاً، ثم الاسم، ثم الرقم المدني: هذا ترتيبُ ما يحمله من يقف
     أمام الموظّف. والمطابقةُ بلا حساسيةٍ لحالة الأحرف لأن الرقم يُكتب كيفما
     اتّفق. */
  const needle = ask.trim();
  const visible = useMemo(() => (rows || []).filter(row => {
    if (!needle) return true;
    const upper = needle.toUpperCase();
    return row.caseRef.includes(upper)
      || String(row.name || "").includes(needle)
      || String(row.civil || "").includes(needle);
  }), [rows, needle]);

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
        subtitle="ما طلبه الطلبة، وأين وصل كلُّ مقرّرٍ منه"
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
            <div><b>{totals?.students ?? 0}</b><span>طالباً أجاب</span></div>
            <div><b>{totals?.registered ?? 0}</b><span>مقرّراً سُجّل</span></div>
            <div><b>{totals?.waiting ?? 0}</b><span>ينتظر التسجيل</span></div>
          </Surface>

          {!canWrite ? (
            <p className="registration-readonly">
              <Clock3 aria-hidden="true" /> هذا الكشف للقراءة بصفتك. الكتابةُ فيه للتسجيل ولمن يبني الجدول.
            </p>
          ) : null}

          {!visible.length ? (
            <EmptyState
              title="لا نتائج"
              detail="لا طالبَ يطابق رقم الحالة أو الاسم المكتوب."
              action={<SecondaryButton type="button" onClick={() => setAsk("")} data-guide-ignore="مسح البحث — عرضٌ لا فعل">امسح البحث</SecondaryButton>}
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
                            <span data-state={course.state}>
                              {course.settled ? STATE_LABEL[course.state] || course.state : "لم يُقل فيه شيء بعد"}
                            </span>
                            {course.reasonCode ? (
                              <em>{REJECT_REASONS.find(([value]) => value === course.reasonCode)?.[1]}{course.note ? ` · ${course.note}` : ""}</em>
                            ) : course.note ? <em>{course.note}</em> : null}
                          </div>

                          {canWrite ? (
                            <div className="registration-course-actions">
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
                                onClick={() => setRejecting({ row, course })}
                              >
                                <X aria-hidden="true" /> رُدّ
                              </button>
                              <button
                                type="button" className="changes-chip"
                                data-active={(course.settled && course.state === "awaiting-registration") || undefined}
                                disabled={busyKey === key}
                                data-guide-target="registration.action.state"
                                onClick={() => void setState(row, course, "awaiting-registration")}
                              >
                                <Clock3 aria-hidden="true" /> سُلّم
                              </button>
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
          busy={busyKey === `${rejecting.row.id}:${rejecting.course.id}`}
          onClose={() => setRejecting(null)}
          onSubmit={(reason, note) => {
            const target = rejecting;
            setRejecting(null);
            void setState(target.row, target.course, "rejected", { reasonCode: reason, note });
          }}
        />
      ) : null}
    </div>
  );
}
