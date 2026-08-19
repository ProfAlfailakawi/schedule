import React, { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, ClipboardCheck, Info, Printer, X } from "lucide-react";
import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { PrintLetterhead, PrintPortal, PrimaryButton, SecondaryButton } from "./ui";
import {
  DAY_KEYS, DAY_NAMES, DECISION_1912_LABEL, isDecision1912Finding, regulationScore, reviewSchedule,
  type DayKey, type RegulationFinding
} from "../utils/scheduleRegulations";
import type { CourseNature } from "../utils/courseNature";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import { findConflicts } from "../utils/scheduleIntelligence";

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
  collegeId: number;
  sectionId: number;
  termId: number;
  meeting?: { day: DayKey; from: string; to: string } | null;
  onClose: () => void;
  onFocusRows?: (ids: number[]) => void;
}

type ReviewFindingGroup = RegulationFinding & {
  groupKey: string;
  groupedItems: RegulationFinding[];
  groupedCount: number;
};

const groupFindingKey = (finding: RegulationFinding) => [finding.approvalEffect, finding.source, finding.article, finding.title].join("::");

const findingStatus = (finding: RegulationFinding) => {
  if (finding.approvalEffect === "block") return "يمنع الاعتماد";
  if (finding.source === "decision-1912") return finding.approvalEffect === "review" ? "مراجعة لائحية" : "ملاحظة لائحية";
  if (finding.source === "history") return "سياق تاريخي";
  if (finding.source === "department") return "سياسة القسم";
  return "مراجعة";
};

/** Visual tone follows approval effect, not the rule's analytical severity. */
const findingTone = (finding: RegulationFinding): "high" | "medium" | "low" =>
  finding.approvalEffect === "block" ? "high" : finding.approvalEffect === "review" ? "medium" : "low";
const findingIcon = (finding: RegulationFinding) => {
  const tone = findingTone(finding);
  return tone === "high" ? <AlertTriangle /> : tone === "medium" ? <Info /> : <CheckCircle2 />;
};

/**
 * One person, once — with their sections folded beneath.
 *
 * A single lecturer can trip a finding in six sections, and printing the name
 * six times turned a list of people into a list of rows. This shows the name and
 * how many times it recurs; pressing it reveals exactly which sections, so the
 * reader sees who first and the detail only when they ask for it.
 */
function ReviewPersonGroup({ group, courses }: { group: { who: string; rows: FSchedule[] }; courses: Map<number, AdCourse> }) {
  const [open, setOpen] = React.useState(false);
  const { who, rows } = group;
  const single = rows.length === 1;
  return (
    <div className={`review-person ${open ? "open" : ""}`}>
      <button type="button" className="review-person-head" onClick={() => !single && setOpen(v => !v)} aria-expanded={single ? undefined : open}>
        <strong>{who}</strong>
        {single ? (
          <small dir="ltr">{courses.get(rows[0].AdCourseId)?.CourseCode || rows[0].AdCourseName || "—"} · شعبة {rows[0].SCode}</small>
        ) : (
          <>
            <span className="review-person-count">{rows.length.toLocaleString("ar-KW-u-nu-latn")} شعب</span>
            <ChevronDown className="review-person-chevron" aria-hidden="true" />
          </>
        )}
      </button>
      {(open || single) ? (
        <div className="review-person-rows">
          {rows.map(row => {
            const days = DAY_KEYS.filter(key => (row as any)[key]).map(key => DAY_NAMES[DAY_KEYS.indexOf(key)]).join("، ");
            const code = courses.get(row.AdCourseId)?.CourseCode || row.AdCourseName || "";
            return (
              <article key={row.id} className="review-row-card">
                <span className="rrc-code" dir="ltr">{code || "—"}</span>
                <div className="rrc-main">
                  <small>شعبة {row.SCode} · {days || "بلا أيام"}</small>
                </div>
                <time className="rrc-time" dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ScheduleReview({ rows, courses, instructors, previousRows, nature, scopeLine, collegeId, sectionId, termId, meeting, onClose, onFocusRows }: Props) {
  const baseFindings = useMemo(
    () => reviewSchedule({ rows, courses, instructors, previousRows, meeting, nature }),
    [rows, courses, instructors, previousRows, meeting, nature]
  );
  const decisionFindings = useMemo(() => baseFindings.filter(isDecision1912Finding), [baseFindings]);
  const score = useMemo(() => regulationScore(decisionFindings, rows.length), [decisionFindings, rows.length]);
  const [serverBlockers, setServerBlockers] = useState<Array<{id:string;type:string;title:string;detail:string;rowIds:number[];subjectKey?:string;subjectLabel?:string}>>([]);
  const [readinessChecked, setReadinessChecked] = useState(false);
  const [readinessError, setReadinessError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) { setServerBlockers([]); setReadinessChecked(true); setReadinessError(true); return; }
    const controller = new AbortController();
    setReadinessChecked(false);
    setReadinessError(false);
    void fetch(`/api/schedules/review-readiness?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", signal: controller.signal })
      .then(async response => response.ok ? response.json() : Promise.reject(new Error("readiness")))
      .then(data => setServerBlockers(Array.isArray(data?.blockers) ? data.blockers : []))
      .catch(error => { if (error?.name !== "AbortError") { setServerBlockers([]); setReadinessError(true); } })
      .finally(() => { if (!controller.signal.aborted) setReadinessChecked(true); });
    return () => controller.abort();
  }, [collegeId, sectionId, termId, rows]);

  const localBlockers = useMemo(() => findConflicts(rows, rows)
    .filter(item => item.severity === "high" || item.type === "duplicate")
    .map(item => ({
      id: `local-conflict:${[item.rowId, item.otherId].sort((a, b) => a - b).join(":")}`,
      type: item.type,
      title: item.message,
      detail: item.detail,
      rowIds: [Number(item.rowId), Number(item.otherId)].filter(Boolean),
    })), [rows]);
  const activeBlockers = readinessChecked && !readinessError ? serverBlockers : localBlockers;

  const blockerFindings = useMemo<RegulationFinding[]>(() => activeBlockers.map((item, index) => ({
    rule: item.id || `approval-blocker-${index}`,
    article: "موانع الحفظ",
    severity: "high",
    source: "readiness",
    approvalEffect: "block",
    title: item.title || "يوجد مانع اعتماد",
    detail: item.detail || "راجع الموعد قبل الاعتماد.",
    subjectKey: item.subjectKey,
    subjectLabel: item.subjectLabel,
    rowIds: Array.isArray(item.rowIds) ? item.rowIds.map(Number).filter(Boolean) : [],
  })), [activeBlockers]);
  const readinessFindings = useMemo(() => baseFindings.filter(finding => finding.source === "readiness"), [baseFindings]);
  const supplementalFindings = useMemo(() => baseFindings.filter(finding => finding.source !== "readiness" && !isDecision1912Finding(finding)), [baseFindings]);
  // Approval reads in a predictable order: hard save blockers, decision 1912,
  // then historical/department context. This keeps different authorities from
  // being visually mixed under one regulation heading.
  const findings = useMemo(
    () => [...blockerFindings, ...readinessFindings, ...decisionFindings, ...supplementalFindings],
    [blockerFindings, readinessFindings, decisionFindings, supplementalFindings]
  );
  const groupedFindings = useMemo<ReviewFindingGroup[]>(() => {
    const buckets = new Map<string, { base: RegulationFinding; items: RegulationFinding[]; rowIds: Set<number> }>();
    for (const finding of findings) {
      const key = groupFindingKey(finding);
      const bucket = buckets.get(key) || { base: finding, items: [], rowIds: new Set<number>() };
      bucket.items.push(finding);
      finding.rowIds.forEach(id => bucket.rowIds.add(id));
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].map(([groupKey, bucket]) => ({
      ...bucket.base,
      groupKey,
      rowIds: [...bucket.rowIds],
      groupedItems: bucket.items,
      groupedCount: bucket.items.length,
      detail: bucket.items.length > 1 ? `تم جمع ${bucket.items.length.toLocaleString("ar-KW-u-nu-latn")} تعارضاً متشابهاً في بند واحد.` : bucket.base.detail,
    }));
  }, [findings]);
  const blocking = findings.filter(finding => finding.approvalEffect === "block");

  /**
   * The schedule as a bar rather than a list.
   *
   * Every appointment is counted once, at the worst thing said about it, so the
   * bar adds up to the schedule itself: this much is blocked, this much wants a
   * look, this much is a note, and the rest is clean. Reading it takes no
   * arithmetic — the clean part is simply the length of the green.
   */
  const spread = useMemo(() => {
    const state = new Map<number, "high" | "medium" | "low">();
    const rank = { high: 3, medium: 2, low: 1 } as const;
    for (const finding of findings) {
      const level: "high" | "medium" | "low" = finding.approvalEffect === "block" ? "high" : finding.approvalEffect === "review" ? "medium" : "low";
      for (const id of finding.rowIds) {
        const current = state.get(id);
        if (!current || rank[level] > rank[current]) state.set(id, level);
      }
    }
    const counts = { high: 0, medium: 0, low: 0 };
    for (const level of state.values()) counts[level] += 1;
    const flagged = counts.high + counts.medium + counts.low;
    return { ...counts, clean: Math.max(0, rows.length - flagged), total: Math.max(1, rows.length) };
  }, [findings, rows.length]);
  const share = (value: number) => `${(value / spread.total) * 100}%`;
  const tone = blocking.length ? "danger" : score >= 85 ? "good" : "warn";
  // A ring drawn as a single arc: circumference 100 makes the maths the score.
  const ringLength = 2 * Math.PI * 26;

  const byId = useMemo(() => new Map(rows.map(row => [row.id, row])), [rows]);

  const groupEntitySummary = (finding: ReviewFindingGroup) => {
    const affectedRows = finding.rowIds.map(id => byId.get(id)).filter(Boolean) as FSchedule[];
    if (finding.title.includes("أستاذ")) {
      const names = [...new Set(affectedRows.map(row => instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ"))];
      if (names.length === 1) return names[0];
      if (names.length > 1) return `${names.length.toLocaleString("ar-KW-u-nu-latn")} أساتذة`;
    }
    if (finding.title.includes("قاعة")) {
      const rooms = [...new Set(affectedRows.map(row => `${row.AdRoomCode}/${row.AdRoomHall}`).filter(room => room !== "/"))];
      if (rooms.length === 1) return `القاعة ${rooms[0]}`;
      if (rooms.length > 1) return `${rooms.length.toLocaleString("ar-KW-u-nu-latn")} قاعات`;
    }
    if (finding.source === "history") return "السجل التاريخي";
    if (finding.source === "department") return "سياسة القسم";
    return finding.rowIds.length ? `${finding.rowIds.length.toLocaleString("ar-KW-u-nu-latn")} موعد` : "تنبيه تشغيلي";
  };

  const findingPreview = (finding: ReviewFindingGroup) => {
    const entity = groupEntitySummary(finding);
    if (finding.groupedCount > 1) return `${entity} · ${finding.groupedCount.toLocaleString("ar-KW-u-nu-latn")} تعارض`;
    if (finding.approvalEffect === "block") return `${entity} · يحتاج معالجة قبل الاعتماد`;
    if (finding.source === "decision-1912") return `${entity} · تنبيه لائحي`;
    if (finding.source === "history") return `${entity} · استنتاج تاريخي`;
    return entity;
  };

  const printReview = React.useCallback(() => {
    if (typeof window === "undefined") return;
    flushSync(() => {});
    const ua = navigator.userAgent || "";
    const isWebKitSafari = /AppleWebKit/i.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Android)/i.test(ua);
    let leftForPrint = false;
    let resumed = false;
    const resume = () => {
      if (resumed) return;
      resumed = true;
      window.removeEventListener("afterprint", resume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") leftForPrint = true;
      else if (leftForPrint) resume();
    };
    window.addEventListener("afterprint", resume, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    let invoked = false;
    if (isWebKitSafari && typeof document.execCommand === "function") {
      try { invoked = document.execCommand("print"); } catch { invoked = false; }
    }
    if (!invoked) window.print();
    window.setTimeout(() => { if (!leftForPrint) resume(); }, 2500);
  }, []);
  const describe = (row?: FSchedule) => {
    if (!row) return "";
    const days = DAY_KEYS.filter(key => (row as any)[key]).map(key => DAY_NAMES[DAY_KEYS.indexOf(key)]).join("، ");
    const code = courses.get(row.AdCourseId)?.CourseCode || row.AdCourseName || "";
    const who = instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ";
    return `${code} · شعبة ${row.SCode} · ${who} · ${days || "بلا أيام"} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`;
  };

  const renderCompactRows = (rowIds: number[], limit = 6) => {
    const uniqueRows = [...new Set(rowIds)].map(id => byId.get(id)).filter(Boolean) as FSchedule[];
    if (!uniqueRows.length) return null;
    return (
      <>
        <div className="review-subject-rows">
          {uniqueRows.slice(0, limit).map(row => {
            const days = DAY_KEYS.filter(key => (row as any)[key]).map(key => DAY_NAMES[DAY_KEYS.indexOf(key)]).join("، ");
            const code = courses.get(row.AdCourseId)?.CourseCode || row.AdCourseName || "—";
            const who = instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ";
            return (
              <article key={`subject-row-${row.id}`} className="review-row-card compact">
                <span className="rrc-code" dir="ltr">{code}</span>
                <div className="rrc-main">
                  <strong>{who}</strong>
                  <small>شعبة {row.SCode} · {days || "بلا أيام"}</small>
                </div>
                <time className="rrc-time" dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
              </article>
            );
          })}
        </div>
        {uniqueRows.length > limit ? <p className="review-more">و{(uniqueRows.length - limit).toLocaleString("ar-KW-u-nu-latn")} مواعيد أخرى…</p> : null}
      </>
    );
  };

  const printRowPreviewLimit = 5;
  const firstPrintPage = groupedFindings.slice(0, Math.min(groupedFindings.length, 3));
  const remainingFindings = groupedFindings.slice(firstPrintPage.length);
  const printFollowupPages: ReviewFindingGroup[][] = [];
  for (let index = 0; index < remainingFindings.length; index += 4) {
    printFollowupPages.push(remainingFindings.slice(index, index + 4));
  }
  const renderPrintFinding = (finding: ReviewFindingGroup) => (
    <article className={`print-review-finding severity-${findingTone(finding)}`} key={finding.rule}>
      <header><b className="print-finding-index">{findingIcon(finding)}</b><div><strong>{finding.title}</strong><span>{finding.groupedCount > 1 ? `${finding.groupedCount.toLocaleString("ar-KW-u-nu-latn")} تعارض · ${finding.detail}` : finding.detail}</span></div><em>{finding.article}</em><i>{findingStatus(finding)}</i></header>
      {finding.rowIds.length ? <div className="print-review-rows">{finding.rowIds.slice(0, printRowPreviewLimit).map(id => <span key={id}>{describe(byId.get(id))}</span>)}{finding.rowIds.length > printRowPreviewLimit ? <small>+ {(finding.rowIds.length - printRowPreviewLimit).toLocaleString("ar-KW-u-nu-latn")} موعد آخر</small> : null}</div> : null}
    </article>
  );

  return (
    // The printable sheet lives inside this dialog, so the wrapper itself can
    // never be `no-print` — doing so hid the very report the print button was
    // meant to produce. Only the on-screen dialog is suppressed on paper.
    <div className="review-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="review-sheet no-print visual-minimal" role="dialog" aria-modal="true" aria-label="مراجعة الاعتماد">
        <header className={`review-head tone-${tone}`}>
          <svg className="review-ring" viewBox="0 0 64 64" role="img" aria-label={`مطابقة ${DECISION_1912_LABEL} ${score} من 100`}>
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
            <span className="surface-kicker">مراجعة الاعتماد · {DECISION_1912_LABEL}</span>
            <h2>{!readinessChecked ? "أتحقق من موانع الاعتماد…" : blocking.length ? "يوجد ما يمنع الاعتماد" : readinessError ? "تعذر فحص الموانع خارج القسم" : findings.length ? "جاهز مع تنبيهات" : "مطابق للتنبيهات المعتمدة"}</h2>
            <p>{scopeLine}</p>
            {readinessError ? <small>تمت مراجعة قرار 1913/2016 محلياً، لكن تعذر التأكد الآن من الحجوزات المتعارضة خارج نطاق القسم.</small> : null}
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
            <span className="seg-high"><AlertTriangle aria-hidden="true" /><b>{spread.high.toLocaleString("ar-KW-u-nu-latn")}</b><small>يمنع</small></span>
            <span className="seg-medium"><Info aria-hidden="true" /><b>{spread.medium.toLocaleString("ar-KW-u-nu-latn")}</b><small>يراجَع</small></span>
            <span className="seg-low"><ClipboardCheck aria-hidden="true" /><b>{spread.low.toLocaleString("ar-KW-u-nu-latn")}</b><small>ملاحظة</small></span>
            <span className="seg-clean"><CheckCircle2 aria-hidden="true" /><b>{spread.clean.toLocaleString("ar-KW-u-nu-latn")}</b><small>سليم</small></span>
          </div>
        </div>

        <div className="review-body">
          {groupedFindings.length ? groupedFindings.map(finding => (
            <article key={finding.groupKey} className={`review-finding severity-${findingTone(finding)} ${open === finding.groupKey ? "open" : ""}`}>
              <button type="button" data-guide-ignore="فتح تفاصيل ملاحظة داخل مراجعة الاعتماد فقط" onClick={() => setOpen(current => (current === finding.groupKey ? null : finding.groupKey))}>
                <span className="review-mark" aria-hidden="true">{findingIcon(finding)}</span>
                <span className="review-copy">
                  <strong>{finding.title}</strong>
                  <small>{findingPreview(finding)}</small>
                  {finding.rowIds.length ? (
                    <span className="finding-share-wrap">
                      <span className="finding-share-count">
                        <b>{finding.groupedCount.toLocaleString("ar-KW-u-nu-latn")}</b>
                        <span>{finding.groupedCount === 1 ? "تعارض" : "تعارضات"}</span>
                        <i>·</i>
                        <span>{finding.rowIds.length.toLocaleString("ar-KW-u-nu-latn")} موعد متأثر</span>
                      </span>
                      <span className="finding-share" aria-hidden="true">
                        <i style={{ width: `${Math.min(100, (finding.rowIds.length / spread.total) * 100)}%` }} />
                      </span>
                    </span>
                  ) : null}
                </span>
                <em>{finding.article}</em>
                <i>{findingStatus(finding)}</i>
              </button>
              {open === finding.groupKey ? (
                <div className="review-rows">
                  {!finding.rowIds.length ? (
                    <div className="review-finding-detail">
                      <p>{finding.detail}</p>
                      <div className="review-finding-meta">
                        <span>{finding.article}</span>
                        <span>{findingStatus(finding)}</span>
                        {finding.groupedCount > 1 ? <span>{finding.groupedCount.toLocaleString("ar-KW-u-nu-latn")} حالات</span> : null}
                      </div>
                    </div>
                  ) : null}
                  {finding.rowIds.length ? (
                    <>
                      {finding.groupedCount > 1 ? (
                        <div className="review-subject-list">
                          {(() => {
                            const subjects = new Map<string, { label: string; items: RegulationFinding[] }>();
                            finding.groupedItems.forEach((item, index) => {
                              const key = item.subjectKey || `case:${index}`;
                              const bucket = subjects.get(key) || { label: item.subjectLabel || groupEntitySummary(finding), items: [] };
                              bucket.items.push(item);
                              subjects.set(key, bucket);
                            });
                            return [...subjects.entries()].map(([key, subject]) => (
                              <section key={key} className="review-subject">
                                <header>
                                  <strong>{subject.label}</strong>
                                  <small>{subject.items.length.toLocaleString("ar-KW-u-nu-latn")} تعارض</small>
                                </header>
                                <div className="review-subject-cases">
                                  {(() => {
                                    const uniqueDetails = [...new Set(subject.items.map(item => item.detail).filter(Boolean))];
                                    const subjectRowIds = [...new Set(subject.items.flatMap(item => item.rowIds))];
                                    return (
                                      <>
                                        {renderCompactRows(subjectRowIds, 6)}
                                        {!subjectRowIds.length && uniqueDetails.length ? <p className="review-subject-summary">{uniqueDetails[0]}</p> : null}
                                      </>
                                    );
                                  })()}
                                </div>
                              </section>
                            ));
                          })()}
                        </div>
                      ) : (
                        (() => {
                          const groups = new Map<string, { who: string; rows: FSchedule[] }>();
                          for (const id of finding.rowIds) {
                            const row = byId.get(id);
                            if (!row) continue;
                            const who = instructors.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ";
                            const key = `${row.AdInstructorId}:${who}`;
                            const bucket = groups.get(key) || { who, rows: [] };
                            bucket.rows.push(row);
                            groups.set(key, bucket);
                          }
                          return [...groups.values()].slice(0, 12).map((group, index) => (
                            <React.Fragment key={`${group.who}-${index}`}>
                              <ReviewPersonGroup group={group} courses={courses} />
                            </React.Fragment>
                          ));
                        })()
                      )}
                      {finding.groupedCount === 1 && finding.rowIds.length > 12 ? <p className="review-more">و{(finding.rowIds.length - 12).toLocaleString("ar-KW-u-nu-latn")} غيرها…</p> : null}
                      {onFocusRows ? (
                        <SecondaryButton type="button" onClick={() => { onFocusRows(finding.rowIds); onClose(); }}>
                          أظهرها على الجدول
                        </SecondaryButton>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </article>
          )) : (
            <div className="review-clear">
              <CheckCircle2 />
              <strong>لا ملاحظات</strong>
              <span>لا توجد موانع حفظ، ولا تنبيهات لائحية ظاهرة ضمن النطاق الذي يفحصه النظام.</span>
            </div>
          )}
        </div>

        <footer className="review-foot">
          <PrimaryButton
            type="button"
            className="review-print-icon-button"
            data-guide-ignore="طباعة تقرير المراجعة لا تغيّر الجدول ولا تحتاج ميزة مستقلة"
            onClick={printReview}
            aria-label="طباعة تقرير الاعتماد"
            title="طباعة تقرير الاعتماد"
          >
            <Printer aria-hidden="true" />
          </PrimaryButton>
          <SecondaryButton type="button" className="review-close-icon-button" data-guide-ignore="إغلاق نافذة مراجعة الاعتماد فقط" onClick={onClose} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></SecondaryButton>
        </footer>
      </section>

      {/* The signed sheet. */}
      <PrintPortal>
        <div className="print-sheet-modal">
          <div className="print-report print-upright print-review-report">
            <section className="print-explicit-page print-review-page">
              <PrintLetterhead title={`مراجعة الاعتماد · ${DECISION_1912_LABEL}`} scope={scopeLine} />
              <section className={`print-review-hero tone-${tone}`}>
                <svg className="print-review-ring" viewBox="0 0 64 64" aria-label={`مطابقة ${DECISION_1912_LABEL} ${score} من 100`}>
                  <circle className="ring-track" cx="32" cy="32" r="26" />
                  <circle className="ring-value" cx="32" cy="32" r="26" strokeDasharray={`${(score / 100) * ringLength} ${ringLength}`} />
                  <text x="32" y="34" className="ring-number">{score.toLocaleString("ar-KW-u-nu-latn")}</text>
                  <text x="32" y="45" className="ring-unit">/ 100</text>
                </svg>
                <div><small>مراجعة الاعتماد · {DECISION_1912_LABEL}</small><strong>{blocking.length ? "يوجد ما يمنع الاعتماد" : readinessError ? "تعذر فحص الموانع خارج القسم" : findings.length ? "جاهز مع تنبيهات" : "مطابق للتنبيهات المعتمدة"}</strong><span>{scopeLine}</span></div>
              </section>
              <div className="print-review-spread" role="img" aria-label="توزيع المواعيد حسب نتيجة المراجعة">
                <div className="print-spread-bar">
                  {spread.high ? <i className="seg-high" style={{ width: share(spread.high) }} /> : null}
                  {spread.medium ? <i className="seg-medium" style={{ width: share(spread.medium) }} /> : null}
                  {spread.low ? <i className="seg-low" style={{ width: share(spread.low) }} /> : null}
                  {spread.clean ? <i className="seg-clean" style={{ width: share(spread.clean) }} /> : null}
                </div>
                <div className="print-spread-keys"><span className="seg-high"><b>{spread.high}</b> يمنع</span><span className="seg-medium"><b>{spread.medium}</b> يراجَع</span><span className="seg-low"><b>{spread.low}</b> ملاحظة</span><span className="seg-clean"><b>{spread.clean}</b> سليم</span></div>
              </div>
              <section className="print-review-findings">
                {findings.length ? firstPrintPage.map(renderPrintFinding) : <div className="print-review-clear"><CheckCircle2 /><strong>لا ملاحظات على الجدول</strong><span>لا توجد موانع حفظ محلية، ولا تنبيهات لائحية ظاهرة ضمن النطاق الذي يفحصه النظام.</span></div>}
              </section>
              {!printFollowupPages.length ? (
                <div className="print-signatures print-explicit-page-meta">
                  <div><span>منسق الجدول</span><i /></div>
                  <div><span>رئيس القسم العلمي</span><i /></div>
                  <div><span>التاريخ</span><i /></div>
                </div>
              ) : null}
            </section>
            {printFollowupPages.map((page, pageIndex) => (
              <section className="print-explicit-page print-review-page" key={`review-page-${pageIndex + 2}`}>
                <PrintLetterhead title={`مراجعة الاعتماد · متابعة الملاحظات (${pageIndex + 2})`} scope={scopeLine} />
                <div className="print-review-page-kicker">
                  <small>متابعة التقرير</small>
                  <strong>تفاصيل إضافية من مراجعة الاعتماد</strong>
                  <span>صفحة {(pageIndex + 2).toLocaleString("ar-KW-u-nu-latn")}</span>
                </div>
                <section className="print-review-findings print-review-findings--followup">
                  {page.map(renderPrintFinding)}
                </section>
                {pageIndex === printFollowupPages.length - 1 ? (
                  <div className="print-signatures print-explicit-page-meta">
                    <div><span>منسق الجدول</span><i /></div>
                    <div><span>رئيس القسم العلمي</span><i /></div>
                    <div><span>التاريخ</span><i /></div>
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      </PrintPortal>
    </div>
  );
}

export { ClipboardCheck as ReviewIcon };
