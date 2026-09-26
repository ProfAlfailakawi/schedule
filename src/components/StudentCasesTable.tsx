/**
 * ── سجلُّ حالات الطلبة — شكلٌ واحد في مركز الذكاء وكشف التسجيل ─────────────
 *
 * The owner: «كشف التسجيل هنا خله نفس اللي في مركز الذكاء». The two screens
 * read the same student cases, and each drew them its own way — the register
 * as a table with the student's name, civil ID and type; the registration
 * sheet as cards titled «طالب». One rule, one place: this component owns the
 * look (kicker, heading, «N من M حالة», type chips with counts, the four print
 * buttons, the table with its coloured edge per type, the printed sheet), and
 * each screen hands it the cases. The registration sheet adds its decisions
 * through two render props — per course, and per graduate case — so the
 * decision layer sits inside the same table instead of replacing it.
 *
 * `tests/student-registration-audit.ts` refuses a second copy of the table.
 */
import React, { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Badge, PrintLetterhead, PrintPortal, SecondaryButton } from "./ui";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";

export type StudentCaseType = "new-course" | "course-conflict" | "graduate";
type TypeFilter = "all" | StudentCaseType;

export interface StudentCaseCourseView {
  id: number | string;
  name: string;
  code?: string;
  /** Owning department of the course; «own» when it is the screen's department. */
  sectionId?: number;
  sectionName?: string;
}

export interface StudentCaseView {
  id: string;
  caseRef: string;
  /** Decrypted for authorised staff; empty when the server withholds or cannot read it. */
  name?: string;
  civil?: string;
  studentSectionName?: string;
  /** The student's curriculum plan, when the department runs two side by side. */
  curriculum?: { name: string; status: string } | null;
  requestType: string;
  createdAt: string;
  details?: string;
  graduateReason?: string;
  passedUnits?: number | null;
  requiredUnits?: number | null;
  eligibility?: string;
  courses: StudentCaseCourseView[];
}

export const STUDENT_CASE_TYPE_LABEL: Record<StudentCaseType, string> = {
  graduate: "خريج / متوقع تخرجه",
  "course-conflict": "تعارض مقررين",
  "new-course": "فتح مقرر جديد",
};
export const GRADUATE_REASON_LABEL: Record<string, string> = {
  "field-conflict": "مقرر يتعارض مع وقت الميداني",
  "field-prerequisite-conflict": "مقرر مسبق ميداني يتعارض مع مقرر آخر مسبق ميداني",
  other: "سبب آخر",
};

const typeOf = (item: StudentCaseView): StudentCaseType =>
  item.requestType === "graduate" || item.requestType === "course-conflict" ? item.requestType : "new-course";
const typeTone = (type: StudentCaseType) => type === "graduate" ? "warning" : type === "course-conflict" ? "danger" : "success";
const courseLabel = (course: StudentCaseCourseView) => `${course.name}${course.code ? ` (${course.code})` : ""}`;
const caseMoment = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-KW-u-nu-latn");
};
/** A calendar day for print — the register carries the moment, the report the date. */
const printableCaseDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(date);
};
/** «صحيفة سابقة / جديدة» — which generation of the curriculum the student follows. */
const curriculumTag = (item: StudentCaseView) => item.curriculum
  ? <span className={`student-case-plan ${item.curriculum.status === "active" ? "is-new" : "is-old"}`} title={item.curriculum.status === "active" ? "الصحيفة الحالية (الجديدة)" : "الصحيفة السابقة"}>{item.curriculum.name}</span>
  : null;
const graduateReasonText = (item: StudentCaseView) => {
  const reason = GRADUATE_REASON_LABEL[String(item.graduateReason || "")] || "";
  return [reason, String(item.details||"").trim()].filter(Boolean).join(" — ") || "—";
};

const PRINT_TITLE: Record<TypeFilter, string> = {
  all: "حالات استبيان الطلبة — التقرير الشامل",
  "new-course": "حالات فتح مقرر جديد",
  "course-conflict": "حالات تعارض المقررات",
  graduate: "حالات الخريج والمتوقع تخرجه",
};

interface Props {
  cases: StudentCaseView[];
  /** The department on screen: its courses read as «own», others carry their department. */
  sectionId: number;
  /** All cases before the parent's own filters (state, search) — for «N من M». Defaults to `cases.length`. */
  total?: number;
  heading?: string;
  emptyText?: string;
  /** Extra controls in the toolbar (the registration sheet's state filters and Excel export). */
  toolbarExtra?: React.ReactNode;
  /** Decision layer for one course of a case (registration sheet). */
  renderCourseDecision?: (item: StudentCaseView, course: StudentCaseCourseView) => React.ReactNode;
  /** Decision layer for a case decided as a whole (graduate). */
  renderCaseDecision?: (item: StudentCaseView) => React.ReactNode;
  /** Something said about the case under its courses (partner course, dropped notice). */
  renderCaseNote?: (item: StudentCaseView) => React.ReactNode;
  /** A status column on the printed sheet (registration decisions). */
  printStatus?: (item: StudentCaseView) => string;
  print: { scope: string; college?: string };
}

export default function StudentCasesTable({
  cases, sectionId, total, heading = "طلبات الطلبة بالتفاصيل", emptyText, toolbarExtra,
  renderCourseDecision, renderCaseDecision, renderCaseNote, printStatus, print,
}: Props) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [printMode, setPrintMode] = useState<TypeFilter | null>(null);
  const counts = useMemo(() => ({
    all: cases.length,
    "new-course": cases.filter(item => typeOf(item) === "new-course").length,
    "course-conflict": cases.filter(item => typeOf(item) === "course-conflict").length,
    graduate: cases.filter(item => typeOf(item) === "graduate").length,
  }), [cases]);
  const visible = useMemo(() => typeFilter === "all" ? cases : cases.filter(item => typeOf(item) === typeFilter), [cases, typeFilter]);
  const showVerification = visible.some(item => typeOf(item) === "graduate");
  const grand = Math.max(total ?? cases.length, cases.length);
  const decisions = Boolean(renderCourseDecision || renderCaseDecision);

  const printCases = (mode: TypeFilter) => {
    setPrintMode(mode);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.documentElement.dataset.printKind = "student-cases";
      const clear = () => {
        delete document.documentElement.dataset.printKind;
        window.removeEventListener("afterprint", clear);
      };
      window.addEventListener("afterprint", clear);
      window.print();
    }));
  };

  const courseBlock = (item: StudentCaseView, course: StudentCaseCourseView, index: number) => {
    const other = Boolean(course.sectionId) && Number(course.sectionId) !== Number(sectionId);
    return (
      <span key={`${course.id}-${index}`} className={`student-case-course ${other ? "other" : "own"}`}>
        <b>{courseLabel(course)}</b>
        {other && course.sectionName ? <small>{course.sectionName}</small> : null}
        {renderCourseDecision ? renderCourseDecision(item, course) : null}
      </span>
    );
  };

  const detailCell = (item: StudentCaseView) => {
    const type = typeOf(item);
    if (type === "graduate") {
      return (
        <div className="student-case-detail">
          <span className="student-case-reason">{graduateReasonText(item)}</span>
          {renderCaseDecision ? renderCaseDecision(item) : null}
        </div>
      );
    }
    const courses = item.courses || [];
    if (!courses.length) return <div className="student-case-detail">{renderCaseDecision ? renderCaseDecision(item) : "—"}</div>;
    /* The conflict pair stacked, the other department's course named; a
       new-course request the same way once it carries decisions. */
    const stacked = type === "course-conflict" || decisions;
    return (
      <div className="student-case-detail">
        {stacked
          ? <div className={`student-conflict-courses${decisions ? " with-decisions" : ""}`}>{courses.map((course, index) => courseBlock(item, course, index))}</div>
          : <span>{courses.map(courseLabel).join(" · ")}</span>}
        {renderCaseNote ? renderCaseNote(item) : null}
      </div>
    );
  };

  const pages = useMemo(() => {
    if (!printMode) return [] as StudentCaseView[][];
    const chosen = printMode === "all" ? cases : cases.filter(item => typeOf(item) === printMode);
    const out: StudentCaseView[][] = [];
    for (let at = 0; at < chosen.length; at += 14) out.push(chosen.slice(at, at + 14));
    return out;
  }, [cases, printMode]);
  const printGraduate = pages.some(page => page.some(item => typeOf(item) === "graduate"));
  const stamp = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <section className={`student-cases-register${decisions ? " student-cases-register--decisions" : ""}`}>
      <header>
        <div>
          <span className="surface-kicker">سجل الحالات</span>
          <h3>{heading}</h3>
          <p>{grand ? `${visible.length.toLocaleString("ar-KW-u-nu-latn")} من ${countOf(grand, oblique(AR.occurrence))} · الأحدث أولاً` : "لا توجد حالات مرسلة لهذا الفصل بعد."}</p>
        </div>
      </header>
      {grand ? <>
        <div className="student-case-toolbar">
          <div className="student-case-filters" role="group" aria-label="فلترة حالات الطلبة">
            {([
              ["all", "الكل"],
              ["new-course", "فتح مقرر"],
              ["course-conflict", "تعارض مقررين"],
              ["graduate", "خريج / متوقع"],
            ] as const).map(([value, label]) => (
              <button
                key={value} type="button" className={typeFilter === value ? "active" : ""} aria-pressed={typeFilter === value}
                data-guide-ignore="فلتر محلي لسجل حالات الطلبة لا يغير البيانات"
                onClick={() => setTypeFilter(value)}
              ><span>{label}</span><b>{counts[value].toLocaleString("ar-KW-u-nu-latn")}</b></button>
            ))}
          </div>
          <div className="student-case-print-actions" aria-label="خيارات طباعة حالات الطلبة">
            <SecondaryButton data-guide-ignore="طباعة شاملة لسجل حالات الطلبة فقط" onClick={() => printCases("all")} disabled={!counts.all}><Printer />الشاملة</SecondaryButton>
            <SecondaryButton data-guide-ignore="طباعة حالات فتح المقرر فقط" onClick={() => printCases("new-course")} disabled={!counts["new-course"]}><Printer />فتح مقرر</SecondaryButton>
            <SecondaryButton data-guide-ignore="طباعة حالات التعارض فقط" onClick={() => printCases("course-conflict")} disabled={!counts["course-conflict"]}><Printer />التعارض</SecondaryButton>
            <SecondaryButton data-guide-ignore="طباعة حالات الخريج والمتوقع فقط" onClick={() => printCases("graduate")} disabled={!counts.graduate}><Printer />الخريج</SecondaryButton>
          </div>
        </div>
        {toolbarExtra ? <div className="student-case-toolbar student-case-toolbar--extra">{toolbarExtra}</div> : null}
        {visible.length ? (
          <div className="student-cases-table-wrap">
            <table className="student-cases-table">
              <thead><tr>
                <th>رقم الحالة</th><th>الطالب</th><th>الرقم المدني</th><th>قسم الطالب</th><th>نوع الطلب</th>
                <th>{decisions ? "المقررات / السبب · القرار" : "المقررات / السبب"}</th>
                {showVerification ? <th>تحقق التخرج</th> : null}<th>التاريخ</th>
              </tr></thead>
              <tbody>{visible.map(item => {
                const type = typeOf(item);
                return (
                  <tr key={item.id} className={`case-${type}`}>
                    <td data-label="رقم الحالة" dir="ltr"><code>{item.caseRef || "—"}</code></td>
                    <td data-label="الطالب"><strong>{item.name || "—"}</strong></td>
                    <td data-label="الرقم المدني" dir="ltr">{item.civil || "—"}</td>
                    <td data-label="قسم الطالب">{item.studentSectionName || "—"}{curriculumTag(item)}</td>
                    <td data-label="نوع الطلب"><Badge tone={typeTone(type)}>{STUDENT_CASE_TYPE_LABEL[type]}</Badge></td>
                    <td data-label="المقررات / السبب" className="student-case-detail-cell">{detailCell(item)}</td>
                    {showVerification ? (
                      <td data-label="تحقق التخرج">{type === "graduate"
                        ? <span className={item.eligibility === "eligible" ? "case-eligible" : "case-ineligible"}>{item.passedUnits ?? "—"} / {item.requiredUnits ?? "—"} {nounFor(Number(item.requiredUnits || 0), AR.unit)}</span>
                        : null}</td>
                    ) : null}
                    <td data-label="التاريخ">{caseMoment(item.createdAt)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <div className="empty-state-compact">لا توجد حالات من هذا النوع.</div>}
      </> : <div className="empty-state-compact">{emptyText || "ستظهر هنا هوية الطالب، قسمه، نوع الطلب، المقررات، التحقق ورقم الحالة."}</div>}

      {printMode && pages.length ? (
        /* Paginated into explicit landscape pages, the way every other report in
           the program is built — the wide-print path and Safari's rotate path
           both key on that structure. */
        <PrintPortal className="student-cases-print-host"><div className="print-report print-wide student-cases-print">
          {pages.map((pageCases, pageIndex) => (
            <section className="print-explicit-page" key={`cases-${pageIndex}`}>
              <PrintLetterhead title={PRINT_TITLE[printMode]} scope={print.scope} college={print.college} footer={false} />
              <table>
                <colgroup>
                  <col style={{ width: "4%" }} /><col style={{ width: "8%" }} /><col style={{ width: "15%" }} /><col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} /><col style={{ width: "11%" }} />
                  <col style={{ width: `${33 - (printGraduate ? 8 : 0) - (printStatus ? 12 : 0)}%` }} />
                  {printGraduate ? <col style={{ width: "8%" }} /> : null}
                  {printStatus ? <col style={{ width: "12%" }} /> : null}
                  <col style={{ width: "7%" }} />
                </colgroup>
                <thead><tr>
                  <th>م</th><th>رقم الحالة</th><th>الاسم</th><th>الرقم المدني</th><th>قسم الطالب</th><th>نوع الطلب</th><th>المقررات / السبب</th>
                  {printGraduate ? <th>تحقق التخرج</th> : null}{printStatus ? <th>الحالة</th> : null}<th>التاريخ</th>
                </tr></thead>
                <tbody>{pageCases.map((item, index) => {
                  const type = typeOf(item);
                  const detail = type === "graduate"
                    ? graduateReasonText(item)
                    : (item.courses || []).map(course => Number(course.sectionId || sectionId) === Number(sectionId) ? course.name : `${course.name}${course.sectionName ? ` — ${course.sectionName}` : ""}`).filter(Boolean).join(" · ") || item.details || "—";
                  return (
                    <tr key={item.id}>
                      <td className="num">{(pageIndex * 14 + index + 1).toLocaleString("ar-KW-u-nu-latn")}</td>
                      <td dir="ltr">{item.caseRef || "—"}</td>
                      <td>{item.name || "—"}</td>
                      <td dir="ltr">{item.civil || "—"}</td>
                      <td>{item.studentSectionName || "—"}{item.curriculum ? <small className="student-case-plan-print"> · {item.curriculum.name}</small> : null}</td>
                      <td>{STUDENT_CASE_TYPE_LABEL[type]}</td>
                      <td className="print-break-any">{detail}</td>
                      {printGraduate ? <td className="num">{type === "graduate" ? `${item.passedUnits ?? "—"} / ${item.requiredUnits ?? "—"}` : "—"}</td> : null}
                      {printStatus ? <td>{printStatus(item)}</td> : null}
                      <td>{printableCaseDate(item.createdAt)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <footer className="print-explicit-page-meta">
                <span>{print.scope || "الجدول الأكاديمي"}</span>
                <bdi dir="ltr">{pageIndex + 1} / {pages.length}</bdi>
                <time dir="ltr">{stamp}</time>
              </footer>
            </section>
          ))}
        </div></PrintPortal>
      ) : null}
    </section>
  );
}
