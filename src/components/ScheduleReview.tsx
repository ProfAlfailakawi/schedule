import React, { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Info, Printer, X } from "lucide-react";
import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { PrintLetterhead, PrimaryButton, SecondaryButton } from "./ui";
import {
  DAY_KEYS, DAY_NAMES, regulationScore, reviewSchedule,
  type DayKey, type RegulationFinding
} from "../utils/scheduleRegulations";
import type { CourseNature } from "../utils/courseNature";

/**
 * The last read before a schedule is adopted.
 *
 * Everything the product knows how to check, run at once against the whole
 * term, and reported as a single page a department head can sign. It is
 * deliberately a review and not a gate: the regulation is the standard, the
 * department is the authority, and every finding names the article it came from
 * so a coordinator can judge whether the exception is justified rather than
 * simply obeying a red box.
 */

interface Props {
  rows: FSchedule[];
  courses: Map<number, AdCourse>;
  instructors: Map<number, AdInstructor>;
  previousRows?: FSchedule[];
  /** What each course has habitually been, learned from every term on record. */
  nature?: Map<number, CourseNature> | null;
  scopeLine: string;
  meeting?: { day: DayKey; from: string; to: string } | null;
  onClose: () => void;
  onFocusRows?: (ids: number[]) => void;
}

const SEVERITY_LABEL: Record<string, string> = { high: "يمنع الاعتماد", medium: "يستحق المراجعة", low: "ملاحظة" };

export default function ScheduleReview({ rows, courses, instructors, previousRows, nature, scopeLine, meeting, onClose, onFocusRows }: Props) {
  const findings = useMemo(
    () => reviewSchedule({ rows, courses, instructors, previousRows, meeting, nature }),
    [rows, courses, instructors, previousRows, meeting, nature]
  );
  const score = useMemo(() => regulationScore(findings, rows.length), [findings, rows.length]);
  const blocking = findings.filter(finding => finding.severity === "high");
  const [open, setOpen] = useState<string | null>(findings[0]?.rule || null);

  /**
   * The schedule as a bar rather than a list.
   *
   * Every appointment is counted once, at the worst thing said about it, so the
   * bar adds up to the schedule itself: this much is blocked, this much wants a
   * look, this much is a note, and the rest is clean. Reading it takes no
   * arithmetic — the clean part is simply the length of the green.
   */
  const spread = useMemo(() => {
    const worst = new Map<number, RegulationFinding["severity"]>();
    const rank = { high: 3, medium: 2, low: 1 } as const;
    for (const finding of findings) {
      for (const id of finding.rowIds) {
        const current = worst.get(id);
        if (!current || rank[finding.severity] > rank[current]) worst.set(id, finding.severity);
      }
    }
    const counts = { high: 0, medium: 0, low: 0 };
    for (const severity of worst.values()) counts[severity] += 1;
    const flagged = counts.high + counts.medium + counts.low;
    return { ...counts, clean: Math.max(0, rows.length - flagged), total: Math.max(1, rows.length) };
  }, [findings, rows.length]);
  const share = (value: number) => `${(value / spread.total) * 100}%`;
  const tone = blocking.length ? "danger" : score >= 85 ? "good" : "warn";
  // A ring drawn as a single arc: circumference 100 makes the maths the score.
  const ringLength = 2 * Math.PI * 26;

  const byId = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows]);
  const describe = (row?: FSchedule) => {
    if (!row) return "";
    const days = DAY_KEYS.filter(key => (row as any)[key]).map(key => DAY_NAMES[DAY_KEYS.indexOf(key)]).join("، ");
    const code = courses.get(row.AdCourseId)?.CourseCode || row.AdCourseName || "";
    const who = instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ";
    return `${code} · شعبة ${row.SCode} · ${who} · ${days || "بلا أيام"} · ${row.fstarttime}–${row.fendtime}`;
  };

  return (
    // The printable sheet lives inside this dialog, so the wrapper itself can
    // never be `no-print` — doing so hid the very report the print button was
    // meant to produce. Only the on-screen dialog is suppressed on paper.
    <div className="review-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="review-sheet no-print" role="dialog" aria-modal="true" aria-label="مراجعة الاعتماد">
        <header className={`review-head tone-${tone}`}>
          <svg className="review-ring" viewBox="0 0 64 64" role="img" aria-label={`مؤشر المطابقة ${score} من 100`}>
            <circle className="ring-track" cx="32" cy="32" r="26" />
            <circle
              className="ring-value"
              cx="32" cy="32" r="26"
              strokeDasharray={`${(score / 100) * ringLength} ${ringLength}`}
            />
            <text x="32" y="34" className="ring-number">{score.toLocaleString("ar-KW-u-nu-latn")}</text>
            <text x="32" y="45" className="ring-unit">/ 100</text>
          </svg>
          <div className="review-title">
            <span className="surface-kicker">مراجعة الاعتماد · قرار 1912/2016</span>
            <h2>{blocking.length ? "يوجد ما يمنع الاعتماد" : findings.length ? "جاهز مع ملاحظات" : "مطابق للائحة"}</h2>
            <p>{scopeLine}</p>
          </div>
          <button type="button" className="drawer-close" onClick={onClose} aria-label="إغلاق"><X /></button>
        </header>

        {/* The whole term as one bar: every appointment counted once. */}
        <div className="review-spread" role="img" aria-label="توزيع المواعيد حسب الملاحظات">
          <div className="spread-bar">
            {spread.high ? <i className="seg-high" style={{ width: share(spread.high) }} title={`${spread.high} يمنع`} /> : null}
            {spread.medium ? <i className="seg-medium" style={{ width: share(spread.medium) }} title={`${spread.medium} يراجَع`} /> : null}
            {spread.low ? <i className="seg-low" style={{ width: share(spread.low) }} title={`${spread.low} ملاحظة`} /> : null}
            {spread.clean ? <i className="seg-clean" style={{ width: share(spread.clean) }} title={`${spread.clean} سليم`} /> : null}
          </div>
          <div className="spread-keys">
            <span className="seg-high"><b>{spread.high.toLocaleString("ar-KW-u-nu-latn")}</b>يمنع</span>
            <span className="seg-medium"><b>{spread.medium.toLocaleString("ar-KW-u-nu-latn")}</b>يراجَع</span>
            <span className="seg-low"><b>{spread.low.toLocaleString("ar-KW-u-nu-latn")}</b>ملاحظة</span>
            <span className="seg-clean"><b>{spread.clean.toLocaleString("ar-KW-u-nu-latn")}</b>سليم</span>
          </div>
        </div>

        <div className="review-body">
          {findings.length ? findings.map(finding => (
            <article key={finding.rule} className={`review-finding severity-${finding.severity} ${open === finding.rule ? "open" : ""}`}>
              <button type="button" onClick={() => setOpen(current => (current === finding.rule ? null : finding.rule))}>
                <span className="review-mark" aria-hidden="true">
                  {finding.severity === "high" ? <AlertTriangle /> : finding.severity === "medium" ? <Info /> : <CheckCircle2 />}
                </span>
                <span className="review-copy">
                  <strong>{finding.title}</strong>
                  <small>{finding.detail}</small>
                  {finding.rowIds.length ? (
                    <span className="finding-share" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, (finding.rowIds.length / spread.total) * 100)}%` }} />
                    </span>
                  ) : null}
                </span>
                <em>{finding.article}</em>
                <i>{SEVERITY_LABEL[finding.severity]}</i>
              </button>
              {open === finding.rule && finding.rowIds.length ? (
                <div className="review-rows">
                  {finding.rowIds.slice(0, 12).map(id => (
                    <p key={id}>{describe(byId.get(id))}</p>
                  ))}
                  {finding.rowIds.length > 12 ? <p className="review-more">و{(finding.rowIds.length - 12).toLocaleString("ar-KW-u-nu-latn")} غيرها…</p> : null}
                  {onFocusRows ? (
                    <SecondaryButton type="button" onClick={() => { onFocusRows(finding.rowIds); onClose(); }}>
                      أظهرها على الجدول
                    </SecondaryButton>
                  ) : null}
                </div>
              ) : null}
            </article>
          )) : (
            <div className="review-clear">
              <CheckCircle2 />
              <strong>لا ملاحظات</strong>
              <span>الجدول مطابق لكل ما يمكن فحصه آلياً من اللائحة.</span>
            </div>
          )}
        </div>

        <footer className="review-foot">
          <PrimaryButton type="button" onClick={() => window.print()}>
            <Printer />طباعة تقرير الاعتماد
          </PrimaryButton>
          <SecondaryButton type="button" onClick={onClose}>إغلاق</SecondaryButton>
        </footer>
      </section>

      {/* The signed sheet. */}
      <div className="print-only print-sheet-modal">
        <div className="print-report print-upright">
          <PrintLetterhead title="تقرير مراجعة الجدول قبل الاعتماد" scope={scopeLine} />
          <div className="print-summary">
            <span>مؤشر المطابقة: <b>{score} / 100</b></span>
            <span>عدد المواعيد: <b>{rows.length}</b></span>
            <span>ملاحظات: <b>{findings.length}</b></span>
          </div>
          <table>
            <colgroup><col style={{ width: "7%" }} /><col style={{ width: "11%" }} /><col style={{ width: "13%" }} /><col /></colgroup>
            <thead><tr><th>م</th><th>المادة</th><th>الدرجة</th><th>الملاحظة</th></tr></thead>
            <tbody>
              {findings.map((finding, index) => (
                <tr key={finding.rule}>
                  <td>{index + 1}</td>
                  <td>{finding.article}</td>
                  <td>{SEVERITY_LABEL[finding.severity]}</td>
                  <td>{finding.title} — {finding.detail}</td>
                </tr>
              ))}
              {findings.length ? null : (
                <tr><td>1</td><td>—</td><td>مطابق</td><td>لا ملاحظات على الجدول.</td></tr>
              )}
            </tbody>
          </table>
          <div className="print-signatures">
            <div><span>منسق الجدول</span><i /></div>
            <div><span>رئيس القسم العلمي</span><i /></div>
            <div><span>التاريخ</span><i /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { ClipboardCheck as ReviewIcon };
