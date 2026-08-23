import React from "react";
import { AdCourse, AdInstructor, FSchedule } from "../types";

export type AuthorityReportEntry = {
  status: "added" | "deleted" | "changed" | "unchanged";
  changedFields: string[];
  referenceNumber: string;
  source: FSchedule | null;
  current: FSchedule | null;
};

export type AuthorityReport = {
  draftId: string;
  name: string;
  sourceFileName: string;
  sourceBranchCode?: string;
  sourceBranchName?: string;
  counts: { added: number; deleted: number; changed: number; unchanged: number };
  rows: AuthorityReportEntry[];
};

interface Props {
  report: AuthorityReport;
  termName: string;
  collegeName: string;
  collegeCode: string;
  sectionName: string;
  sectionCode: string;
  courseById: Map<number, AdCourse>;
  instructorById: Map<number, AdInstructor>;
}

const pageItems = <T,>(items: T[], size: number): T[][] => {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages.length ? pages : [[]];
};

export default function AuthorityPdfReport({
  report,
  termName,
  collegeName,
  collegeCode,
  sectionName,
  sectionCode,
  courseById,
  instructorById,
}: Props) {
  const entries = [...report.rows].sort((a, b) => {
    const ar = Number((a.current || a.source)?.sourceOrder ?? Number.MAX_SAFE_INTEGER);
    const br = Number((b.current || b.source)?.sourceOrder ?? Number.MAX_SAFE_INTEGER);
    return ar - br;
  });
  const pages = pageItems(entries, 23);
  const branch = [report.sourceBranchCode, report.sourceBranchName].filter(Boolean).join(" ") || "—";
  const fieldChanged = (entry: AuthorityReportEntry, ...fields: string[]) =>
    entry.status === "changed" && fields.some(field => entry.changedFields.includes(field));
  const dayNumbers = (row: FSchedule) =>
    [row.fsunday && "1", row.fmonday && "2", row.ftuesday && "3", row.fwednesday && "4", row.fthursday && "5"].filter(Boolean).join(" ") || "—";

  return (
    <div className="print-report print-wide print-query-report print-comprehensive print-comprehensive-book authority-pdf-report">
      <div className="print-comprehensive-pages">
        {pages.map((pageEntries, pageIndex) => (
          <section className="print-comprehensive-page authority-pdf-page" key={`authority-${pageIndex + 1}`}>
            <header className="print-comprehensive-classic-head authority-pdf-head">
              <div className="print-comprehensive-title-block authority-pdf-title">
                <h1>تقرير الجدول المعتمد</h1>
                <p>{report.sourceFileName}</p>
              </div>
              <div className="authority-pdf-scope-grid">
                <div><span>الفصل</span><strong>{termName || "—"}</strong></div>
                <div><span>الكلية</span><strong>{[collegeCode, collegeName].filter(Boolean).join(" ") || "—"}</strong></div>
                <div><span>القسم</span><strong>{[sectionCode, sectionName].filter(Boolean).join(" ") || "—"}</strong></div>
                <div><span>الفرع</span><strong>{branch}</strong></div>
              </div>
            </header>

            <div className="print-comprehensive-grid authority-pdf-grid" role="table" aria-label="تقرير الجدول المعتمد">
              <div className="print-comprehensive-grid-row print-comprehensive-grid-head" role="row">
                {["رقم المقرر", "الرقم المرجعي", "مسمى المقرر", "عدد الوحدات", "عدد الساعات", "الحد الأقصى", "القاعة", "المبنى", "الوقت", "الأيام", "المدرس"].map(head => (
                  <div role="columnheader" key={head}>{head}</div>
                ))}
              </div>
              <div className="print-comprehensive-grid-body" role="rowgroup">
                {pageEntries.map((entry, index) => {
                  const row = (entry.current || entry.source) as FSchedule;
                  if (!row) return null;
                  const course = courseById.get(Number(row.AdCourseId));
                  const instructor = instructorById.get(Number(row.AdInstructorId));
                  const cell = (changed: boolean) => changed ? "authority-pdf-cell-changed" : "";
                  return (
                    <div className={`print-comprehensive-grid-row authority-pdf-row authority-pdf-row-${entry.status}`} role="row" key={`${pageIndex}-${index}-${row.id || row.sourceOrder || index}-${entry.status}`}>
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course?.CourseCode || "—"}</div>
                      <div role="cell" className="print-ltr">{entry.referenceNumber || "—"}</div>
                      <div role="cell" className={`print-wrap print-course-name ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course?.CourseName || row.AdCourseName || "—"}</div>
                      <div role="cell" className={`num ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course?.CourseCredit ?? "—"}</div>
                      <div role="cell" className={`num ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course?.CourseHours ?? "—"}</div>
                      <div role="cell" className={`num ${cell(fieldChanged(entry, "AdCourseId"))}`}>{course?.MaxStudent ?? "—"}</div>
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "AdRoomHall"))}`}>{String(row.AdRoomHall || "").trim() || "—"}</div>
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "AdRoomCode"))}`}>{String(row.AdRoomCode || "").trim() || "—"}</div>
                      <div role="cell" className={`print-ltr print-nowrap ${cell(fieldChanged(entry, "fstarttime", "fendtime"))}`}>{row.fstarttime && row.fendtime ? `${row.fstarttime} - ${row.fendtime}` : "—"}</div>
                      <div role="cell" className={`print-ltr ${cell(fieldChanged(entry, "fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"))}`}>{dayNumbers(row)}</div>
                      <div role="cell" className={`print-wrap print-instructor-name ${cell(fieldChanged(entry, "AdInstructorId"))}`}>{instructor?.AdInstructorName || row.sourceInstructorText || "—"}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="print-comprehensive-page-footer authority-pdf-footer">
              <div className="print-comprehensive-signatures">
                <div><span>توقيع رئيس لجنة الجدول</span><i /></div>
                <div><span>توقيع رئيس القسم العلمي</span><i /></div>
                <div><span>توقيع العميد</span><i /></div>
              </div>
              <div className="print-comprehensive-legend-stack">
                <div className="print-comprehensive-legend authority-pdf-legend">
                  <span className="authority-pdf-key authority-pdf-key-added">مضاف</span>
                  <span className="authority-pdf-key authority-pdf-key-deleted">محذوف</span>
                  <span className="authority-pdf-key authority-pdf-key-changed">معدّل</span>
                </div>
                <div className="print-comprehensive-page-number"><bdi dir="ltr">{pageIndex + 1} / {pages.length}</bdi></div>
              </div>
            </footer>
          </section>
        ))}
      </div>
    </div>
  );
}
