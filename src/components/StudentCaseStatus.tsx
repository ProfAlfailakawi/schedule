/**
 * ── حالةُ طلب الطالب: رسمٌ واحدٌ في كشف التسجيل ومركز الذكاء ─────────────────
 *
 * «طلبات الطلبة» في مركز الذكاء هي نفسُها «كشف التسجيل». كان الكشفُ وحده يعرف
 * الحالات (بانتظار اللجنة · وافقت · سُجّل · ردّ) وتصفيةَ «رحلة الطلب» والتصدير؛
 * والمركزُ وحده يعرض الجدولَ بلا حالات. هنا الدماغُ المشترك الذي يستعمله الاثنان:
 * الكلماتُ والأسبابُ، شارةُ الحالة بأيقونتها، شريطُ الرحلة، وقاعدةُ تصنيف الصف.
 * الكشفُ يضيف أزرارَ القرار فوق هذه الشارات؛ المركزُ يعرضها للقراءة فقط.
 */
import React from "react";
import { Ban, CheckCheck, Clock3, Hourglass, ThumbsDown, Users } from "lucide-react";
import type { StudentCommitteeRejectReason, StudentCourseRejectReason } from "../types";
import type { StudentCaseStatus } from "../utils/studentCaseDecision";

/* اللجنةُ أولاً، ثم التسجيل: ما لم تقل فيه اللجنة شيئاً «بانتظار اللجنة» ولا يراه التسجيل. */
export const PENDING_COMMITTEE = "بانتظار اللجنة";
export const STATE_LABEL: Record<string, string> = {
  "awaiting-registration": "وافقت اللجنة · بانتظار التسجيل",
  "committee-rejected": "لم توافق اللجنة",
  registered: "سُجّل",
  rejected: "ردّه التسجيل",
};
/** حالةُ الخريج بالتصنيف نفسه، وبكلماتٍ تناسب قراراً في الحالة كلها. */
export const CASE_STATUS_LABEL: Record<StudentCaseStatus, string> = {
  pending: PENDING_COMMITTEE,
  approved: "وافقت اللجنة · بانتظار التسجيل",
  "committee-rejected": "لم توافق اللجنة",
  registered: "نفّذه التسجيل",
  rejected: "ردّه التسجيل",
};
export const REJECT_REASONS: Array<[StudentCourseRejectReason, string]> = [
  ["no-seat", "لا مقاعد"],
  ["prerequisite", "متطلّب سابق"],
  ["level", "المستوى"],
  ["conflict", "تعارض في جدوله"],
  ["closed", "الشعبة مغلقة"],
  ["other", "سبب آخر"],
];
export const COMMITTEE_REASONS: Array<[StudentCommitteeRejectReason, string]> = [
  ["not-eligible", "لا تنطبق عليه الشروط"],
  ["not-in-plan", "ليس من خطته الدراسية"],
  ["prerequisite", "متطلّب سابق"],
  ["duplicate", "طلب مكرر أو سبق تسجيله"],
  ["other", "سبب آخر"],
];
export const reasonLabel = (code?: string) =>
  [...REJECT_REASONS, ...COMMITTEE_REASONS].find(([value]) => value === code)?.[1] || "";

export type StatusFilter = "all" | "pending" | "approved" | "committee-rejected" | "registered" | "rejected";
export type RowStatus = Exclude<StatusFilter, "all">;

/** الحقولُ التي تكفي لتصنيف مقرّرٍ واحد (مشتركةٌ بين صفّ الكشف وعرض السجلّ). */
export interface CourseStateFields { settled?: boolean; state?: string; readOnly?: boolean; droppedByStudent?: boolean }

export const statusOf = (course: CourseStateFields): RowStatus =>
  !course.settled ? "pending"
    : course.state === "awaiting-registration" ? "approved"
      : course.state as Exclude<RowStatus, "pending" | "approved">;

/** نصُّ حالة المقرّر كما يُقرأ في أي شاشة. */
export const courseStateLabel = (course: CourseStateFields & { droppedLabel?: string; decidedBySectionName?: string }): string =>
  course.droppedByStudent ? (course.droppedLabel || "ألغاه الطالب")
    : course.readOnly ? `يقرّره قسم ${course.decidedBySectionName || "آخر"}`
      : course.settled ? STATE_LABEL[course.state || ""] || String(course.state) : PENDING_COMMITTEE;

/** البنودُ التي تنتظر قراراً في صفٍّ واحد: مقرّراته، أو حالتُه كلها. */
export function viewStatuses(row: { caseLevel?: boolean; caseStatus?: StudentCaseStatus; courses: CourseStateFields[] }): RowStatus[] {
  if (row.caseLevel) return [row.caseStatus || "pending"];
  return row.courses.filter(course => !course.readOnly).map(statusOf);
}

const ICON: Record<RowStatus, React.ComponentType<any>> = {
  pending: Hourglass, approved: Clock3, "committee-rejected": ThumbsDown, registered: CheckCheck, rejected: Ban,
};

/** شارةُ الحالة: أيقونةٌ وكلمة. تُرسَم بالطريقة نفسها في الشاشتين. */
export function CaseStateChip({ state, label, readonly = false }: { state: string; label: string; readonly?: boolean }) {
  const Icon = ICON[(state in ICON ? state : "pending") as RowStatus];
  return <span className="student-case-state" data-state={readonly ? "readonly" : state}><Icon aria-hidden="true" />{label}</span>;
}

/** القراءةُ وحدها: ما يعرضه المركزُ حين لا يقرّر أحد من هناك. */
export function CaseStatusReadout({ course, caseStatus, reason, note }: {
  course?: CourseStateFields & { reasonCode?: string; note?: string; droppedLabel?: string; decidedBySectionName?: string };
  caseStatus?: StudentCaseStatus; reason?: string; note?: string;
}) {
  const dropped = course?.droppedByStudent;
  const state = course ? (course.readOnly ? "readonly" : course.settled ? String(course.state) : "pending") : (caseStatus || "pending");
  const label = course ? courseStateLabel(course) : CASE_STATUS_LABEL[caseStatus || "pending"];
  const why = reasonLabel(course?.reasonCode || reason);
  const text = course?.note || note;
  return (
    <span className="student-case-decision" data-state={course ? (course.settled ? course.state : "pending") : (caseStatus || "pending")}>
      <CaseStateChip state={state} label={label} readonly={state === "readonly"} />
      {why ? <em>{why}{text ? ` · ${text}` : ""}</em> : text ? <em>{text}</em> : null}
      {dropped && course?.droppedLabel ? <em className="registration-dropped">{course.droppedLabel}</em> : null}
    </span>
  );
}

export interface JourneyTotals { all: number; pending: number; approved: number; registered: number }

/** عدّادُ الرحلة من العروض نفسها: كلُّ طالبٍ يُعدّ في أبعد محطةٍ بلغها أيُّ بندٍ من بنوده. */
export function journeyFromViews(rows: ReadonlyArray<{ caseLevel?: boolean; caseStatus?: StudentCaseStatus; courses: CourseStateFields[] }>): JourneyTotals {
  const out: JourneyTotals = { all: rows.length, pending: 0, approved: 0, registered: 0 };
  for (const row of rows) {
    const statuses = viewStatuses(row);
    if (statuses.includes("pending")) out.pending += 1;
    if (statuses.includes("approved")) out.approved += 1;
    if (statuses.includes("registered")) out.registered += 1;
  }
  return out;
}

/** شريطُ «رحلة الطلب»: من الطالب إلى اللجنة إلى التسجيل — كلُّ محطةٍ عددُها، ولمسُها يصفّي. */
export function RegistrationJourney({ totals, active, onPick, registrationView = false }: {
  totals: JourneyTotals; active: StatusFilter; onPick: (value: StatusFilter) => void; registrationView?: boolean;
}) {
  const stations: Array<[StatusFilter, React.ReactNode, number, string, string]> = [
    ["all", <Users key="i" aria-hidden="true" />, totals.all, registrationView ? "الكل · سُلّم" : "الكل · أجاب", "accent"],
    ...(!registrationView ? [["pending", <Hourglass key="i" aria-hidden="true" />, totals.pending, PENDING_COMMITTEE, "warning"] as [StatusFilter, React.ReactNode, number, string, string]] : []),
    ["approved", <Clock3 key="i" aria-hidden="true" />, totals.approved, "بانتظار التسجيل", "info"],
    ["registered", <CheckCheck key="i" aria-hidden="true" />, totals.registered, "سُجّل", "success"],
  ];
  return (
    <ol className="reg-flow" aria-label="رحلة الطلب">
      {stations.map(([value, icon, n, label, tone]) => (
        <li key={value} data-tone={tone} data-empty={!n || undefined}>
          <button type="button" aria-pressed={active === value} onClick={() => onPick(value)} data-guide-ignore="تصفية العرض من رحلة الطلب — لا يغيّر شيئاً">
            <span className="reg-flow-ic">{icon}</span><b>{n.toLocaleString("ar-KW-u-nu-latn")}</b><small>{label}</small>
          </button>
        </li>
      ))}
    </ol>
  );
}
