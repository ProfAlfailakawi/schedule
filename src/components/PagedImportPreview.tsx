import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import ImportPreviewTable, { type ImportRow } from "./ImportPreviewTable";

type TableProps = React.ComponentProps<typeof ImportPreviewTable>;
type PageDiagnostic = { page?: number; extractedRows?: number; visualRows?: number; suspicious?: boolean; reason?: string };
type PageSummary = { page?: number; rows?: number; ready?: number; review?: number; suspicious?: boolean; diagnostic?: PageDiagnostic };

/**
 * Page-scoped Authority PDF review.
 *
 * The data remains one draft, but the reviewer sees the same physical boundary
 * the OCR engine saw. This makes multi-page scans observable and prevents a bad
 * page from visually drowning three good pages. The wrapper never reparses or
 * reorders academic data; it only filters one sourcePage at a time and merges
 * edits back by the immutable sourceOrder assigned by the parser.
 */
export default function PagedImportPreview({
  rows,
  onRows,
  pageCount = 0,
  pageDiagnostics = [],
  pageSummaries = [],
  ...tableProps
}: TableProps & {
  pageCount?: number;
  pageDiagnostics?: PageDiagnostic[];
  pageSummaries?: PageSummary[];
}) {
  const rowPage = (row: ImportRow) => {
    const page = Number(row.sourcePage || 1);
    return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  };
  const rowNeedsReview = (row: ImportRow) => {
    const proofs = Object.values(row.importEvidence || {});
    return proofs.length > 0 && proofs.some((proof: any) => proof?.confidence !== "CONFIRMED");
  };
  const maxRowPage = useMemo(() => rows.reduce((max, row) => Math.max(max, rowPage(row)), 1), [rows]);
  const totalPages = Math.max(1, Number(pageCount) || 0, maxRowPage);
  const [activePage, setActivePage] = useState(1);

  useEffect(() => {
    if (activePage > totalPages) setActivePage(totalPages);
  }, [activePage, totalPages]);

  const currentRows = useMemo(() => rows.filter(row => rowPage(row) === activePage), [rows, activePage]);
  const summaryByPage = useMemo(() => new Map(pageSummaries.map(item => [Number(item.page || 0), item])), [pageSummaries]);
  const diagnosticByPage = useMemo(() => new Map(pageDiagnostics.map(item => [Number(item.page || 0), item])), [pageDiagnostics]);

  const mergePageRows = (nextPageRows: ImportRow[]) => {
    const stamped = nextPageRows.map(row => ({ ...row, sourcePage: activePage }));
    const others = rows.filter(row => rowPage(row) !== activePage);
    const combined = [...others, ...stamped];
    const fallbackOrder = new Map(combined.map((row, index) => [row, index] as const));
    combined.sort((a, b) => {
      const ao = Number(a.sourceOrder), bo = Number(b.sourceOrder);
      const aOk = Number.isFinite(ao), bOk = Number.isFinite(bo);
      if (aOk && bOk && ao !== bo) return ao - bo;
      if (aOk !== bOk) return aOk ? -1 : 1;
      return Number(fallbackOrder.get(a) || 0) - Number(fallbackOrder.get(b) || 0);
    });
    onRows(combined);
  };

  if (totalPages <= 1) return <ImportPreviewTable rows={rows} onRows={onRows} {...tableProps} />;

  return (
    <section className="import-page-review" aria-label="معاينة صفحات PDF كل صفحة على حدة">
      <div className="import-page-review-head">
        <div>
          <strong>معاينة صفحة بصفحة</strong>
          <small>كل صفحة تُراجع مستقلة كما قرأها المحرك، ثم تُدمج النتائج عند النشر.</small>
        </div>
        <span>{totalPages.toLocaleString("ar-KW-u-nu-latn")} صفحات</span>
      </div>

      <div className="import-page-tabs" role="tablist" aria-label="صفحات ملف PDF">
        {Array.from({ length: totalPages }, (_, offset) => {
          const page = offset + 1;
          const pageRows = rows.filter(row => rowPage(row) === page);
          const summary = summaryByPage.get(page);
          const diagnostic = diagnosticByPage.get(page) || summary?.diagnostic;
          const liveReview = pageRows.filter(rowNeedsReview).length;
          const review = pageRows.length ? liveReview : Number(summary?.review ?? 0);
          const suspicious = Boolean(summary?.suspicious || diagnostic?.suspicious || review > 0 || (pageRows.length === 0 && Number(diagnostic?.extractedRows || 0) > 0));
          const empty = pageRows.length === 0;
          const active = activePage === page;
          return (
            <button
              key={page}
              type="button"
              role="tab"
              aria-selected={active}
              data-guide-ignore="تنقّل داخلي بين صفحات معاينة PDF فقط ولا ينفذ إجراءً على الجدول أو البيانات"
              className={`${active ? "active" : ""} ${suspicious ? "review" : empty ? "empty" : "ready"}`.trim()}
              onClick={() => setActivePage(page)}
            >
              <FileText aria-hidden="true" />
              <span><b>صفحة {page.toLocaleString("ar-KW-u-nu-latn")}</b><small>{pageRows.length.toLocaleString("ar-KW-u-nu-latn")} صف</small></span>
              {suspicious ? <AlertTriangle aria-label="تحتاج مراجعة" /> : empty ? null : <CheckCircle2 aria-label="تمت القراءة" />}
            </button>
          );
        })}
      </div>

      <div className="import-page-status" aria-live="polite">
        {(() => {
          const summary = summaryByPage.get(activePage);
          const diagnostic = diagnosticByPage.get(activePage) || summary?.diagnostic;
          const liveReview = currentRows.filter(rowNeedsReview).length;
          const review = currentRows.length ? liveReview : Number(summary?.review ?? 0);
          const suspicious = Boolean(summary?.suspicious || diagnostic?.suspicious || review > 0);
          if (!currentRows.length) return <><AlertTriangle /><span>لم تُستخرج صفوف من هذه الصفحة. راجع جودة الصفحة قبل النشر.</span></>;
          if (suspicious) return <><AlertTriangle /><span>هذه الصفحة تحتاج مراجعة: {review ? `${review.toLocaleString("ar-KW-u-nu-latn")} صف` : String(diagnostic?.reason || "بعض الخلايا لم تُحسم بعد")}.</span></>;
          return <><CheckCircle2 /><span>تمت قراءة الصفحة {activePage.toLocaleString("ar-KW-u-nu-latn")} بنجاح · {currentRows.length.toLocaleString("ar-KW-u-nu-latn")} صف.</span></>;
        })()}
      </div>

      {currentRows.length ? (
        <ImportPreviewTable rows={currentRows} onRows={mergePageRows} {...tableProps} />
      ) : (
        <div className="import-page-empty"><FileText /><strong>لا توجد صفوف في هذه الصفحة</strong><small>لن تُضاف أي بيانات منها ما لم تكن الصفحة تحتوي جدولًا فعليًا.</small></div>
      )}
    </section>
  );
}
