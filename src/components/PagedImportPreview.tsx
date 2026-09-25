import React, { useEffect, useMemo, useRef, useState } from "react";
import { instructorIdentityKey, uniqueExactIdentityMatch } from "../utils/instructorIdentity";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import ImportPreviewTable, { type ImportRow } from "./ImportPreviewTable";
import { AR, countOf } from "../utils/arabicCount";
import { pageReviewWaitLine } from "../utils/importPageReview";

type TableProps = React.ComponentProps<typeof ImportPreviewTable>;
type PageDiagnostic = { page?: number; extractedRows?: number; visualRows?: number; suspicious?: boolean; reason?: string; warning?: string; missedLines?: number };
type PageSummary = { page?: number; rows?: number; ready?: number; review?: number; suspicious?: boolean; diagnostic?: PageDiagnostic };

/**
 * The line beside save / publish while scanned pages wait for «راجعت الصفحة».
 * Each page's own button lives on its page. When the page preview is not on
 * screen at all — every row deleted in review, or a file whose pages produced
 * none — the buttons come here, or publishing would wait for a button nobody
 * can reach. One component for both import screens.
 */
export function PageReviewWait({ pages, onReviewPage, withButtons = false }: { pages: number[]; onReviewPage?: (page: number) => void; withButtons?: boolean }) {
  if (!pages.length) return null;
  return (
    <p className="transfer-preflight-wait" role="status">
      <span>{pageReviewWaitLine(pages)}</span>
      {withButtons && onReviewPage ? pages.map(page => (
        <button key={page} type="button" className="import-page-review-confirm" title="أؤكد أني قارنت هذه الصفحة بالورقة، وسأضيف أسطرها الناقصة في الجدول بعد الاستيراد" data-guide-ignore="تأكيد مراجعة صفحة ناقصة في المعاينة فقط؛ لا يحفظ ولا ينشر" onClick={() => onReviewPage(page)}>راجعت الصفحة {page.toLocaleString("ar-KW-u-nu-latn")}</button>
      )) : null}
    </p>
  );
}

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
  reviewedPages = [],
  onReviewPage,
  ...tableProps
}: TableProps & {
  pageCount?: number;
  pageDiagnostics?: PageDiagnostic[];
  pageSummaries?: PageSummary[];
  /** Pages whose missing printed lines the reviewer has confirmed (importPageReview). */
  reviewedPages?: number[];
  onReviewPage?: (page: number) => void;
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
  /* The tab strip follows the LIVE rows, not the original PDF page count. A page
     the reviewer empties by deleting all of its rows must vanish from the
     preview entirely — its source rows still live on in the immutable baseline
     that feeds the change report, so nothing is lost there. Interior pages that
     were emptied stay visible (they fall under maxRowPage) so a gap between two
     populated pages is never hidden; only trailing emptied pages fall away.
     Using pageCount here kept a deleted last page on screen as a permanent
     "empty" tab that looked like an unresolved problem.
     The one exception is a page that still owes printed lines (missedLines):
     a short last page read with no row at all has no row to keep its tab, yet
     publishing waits for the «راجعت الصفحة» button that lives on that tab. */
  const owedPage = pageDiagnostics.reduce((max, item) => Number(item?.missedLines) > 0 ? Math.max(max, Math.floor(Number(item?.page) || 0)) : max, 0);
  const totalPages = Math.max(1, maxRowPage, owedPage);
  const [activePage, setActivePage] = useState(1);

  useEffect(() => {
    if (activePage > totalPages) setActivePage(totalPages);
  }, [activePage, totalPages]);

  const currentRows = useMemo(() => rows.filter(row => rowPage(row) === activePage), [rows, activePage]);
  const summaryByPage = useMemo(() => new Map(pageSummaries.map(item => [Number(item.page || 0), item])), [pageSummaries]);
  const diagnosticByPage = useMemo(() => new Map(pageDiagnostics.map(item => [Number(item.page || 0), item])), [pageDiagnostics]);

  /* ── المعاينة تشفي نفسها ────────────────────────────────────────────────────
   *
   * المطابقة على الخادم تجري مرة واحدة، لحظة القراءة. لكن القصة الحقيقية تكمل
   * بعدها: المنسّق يسجّل زملاءه أعضاءً في القسم وهو يرى الخانات، ويحسم اسماً
   * على صفٍّ بينما الاسم نفسه مطبوع على خمسة صفوف أخرى. كان كل ذلك يضيع —
   * التسجيل لا يصل الخانات إلا بإعادة رفع الملف، والحسم يبقى حبيس صفّه.
   *
   * ممرّان يعملان على المسودة كاملة، عبر الصفحات كلها:
   *
   * ١) اسم مقروء يطابق حرفياً — بقانون الهوية المشترك نفسه الذي تحكم به
   *    المطابقة على الخادم — شخصاً واحداً لا ثاني له من أعضاء هذا القسم
   *    (تاريخه ودليله اليدوي ومنتدبيه)، يُربط به. نطاق القسم وحده: الجامعة
   *    كلها تبقى للخادم ولقرار المراجع، فلا يُنتَج هنا ما كان الخادم يرفضه.
   *
   * ٢) صفٌّ حسمه المراجع أو المطابقة يُعمَّم على كل صفٍّ آخر لم يُحسم ويحمل
   *    الاسم المقروء نفسه. القرار عن الاسم لا عن الصف. وإن اختُلف — الاسم
   *    نفسه رُبط بشخصين على صفّين — لا يُعمَّم شيء، فالخلاف للمراجع.
   */
  const collegeId = Number((tableProps as any).collegeId || 0);
  const sectionId = Number((tableProps as any).sectionId || 0);
  const termId = Number((tableProps as any).termId || 0);
  const [departmentPeople, setDepartmentPeople] = useState<Array<{ AdInstructorId: number; AdInstructorName: string }>>([]);
  useEffect(() => {
    if (!sectionId) { setDepartmentPeople([]); return; }
    const controller = new AbortController();
    const params = new URLSearchParams({ sectionId: String(sectionId) });
    if (collegeId) params.set("collegeId", String(collegeId));
    if (termId) params.set("termId", String(termId));
    fetch(`/api/instructors?${params}`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : []))
      .then(list => { if (Array.isArray(list)) setDepartmentPeople(list); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [collegeId, sectionId, termId]);

  const readIdentity = (row: ImportRow) =>
    instructorIdentityKey(String(row.sourceInstructorText || row.importEvidence?.instructor?.raw || ""));
  const linked = (row: ImportRow) => Number(row.AdInstructorId) > 0;
  /* ربطٌ صنعته الآلة هنا — تعميماً أو مطابقةَ دليلٍ — يحمل نسبته معه، فيبقى
     قابلاً للنقض حين يتغيّر قرار الإنسان. ربطُ الإنسان والخادم لا يُمسّ. */
  const machineLinked = (row: ImportRow) => {
    const proof: any = row.importEvidence?.instructor;
    return proof?.method === "NAME_PROPAGATION" || proof?.source === "DEPARTMENT_DIRECTORY";
  };
  /* المتقاعد والمجاز يحتفظان بمواعيدهما القائمة ولا يُعرضان لجديدة — القاعدة
     نفسها التي تحكم قائمة الاختيار تحكم الربط التلقائي، وإلا نُشر جدول باسم
     من غادر. */
  const activePeople = useMemo(() => departmentPeople.filter((person: any) =>
    person?.AdInstructorStatus !== "retired" && person?.AdInstructorStatus !== "sabbatical"), [departmentPeople]);

  useEffect(() => {
    if (!rows.length) return;
    /* قرارات قائمة: الاسم المقروء ⇦ هوية الشخص المحسومة. مصدر القرار إنسانٌ
       أو مطابقةُ الخادم أو مطابقةُ الدليل — أما التعميم فليس مصدراً، وإلا
       صار القرار شاهداً على نفسه ولم يُنقض أبداً. */
    const settled = new Map<string, { id: number; evidence: any }>();
    const disputed = new Set<string>();
    rows.forEach(row => {
      if (!linked(row)) return;
      const evidence: any = row.importEvidence?.instructor;
      if (evidence?.method === "NAME_PROPAGATION") return;
      const key = readIdentity(row);
      if (!key) return;
      const prior = settled.get(key);
      if (prior && prior.id !== Number(row.AdInstructorId)) { disputed.add(key); return; }
      if (!prior || (evidence?.source === "MANUAL" && prior.evidence?.source !== "MANUAL")) {
        settled.set(key, { id: Number(row.AdInstructorId), evidence });
      }
    });
    let changed = false;
    const healed = rows.map(row => {
      const key = readIdentity(row);
      if (!key) return row;
      /* ── نقض ما صنعته الآلة حين تبدّل القرار ─────────────────────────────
         الاسم صار محسوماً بشخصين مختلفين ⇦ كل ربط آلي له يعود خانةً مفتوحة،
         فالخلاف للمراجع لا للآلة. والاسم الذي بقي قراره واحداً لكنه تغيّر ⇦
         الروابط الآلية تتبعه، لأن القرار عن الاسم لا عن الصف. */
      if (linked(row) && machineLinked(row)) {
        if (disputed.has(key)) {
          changed = true;
          return {
            ...row,
            AdInstructorId: 0,
            importEvidence: {
              ...(row.importEvidence || {}),
              instructor: {
                raw: String(row.sourceInstructorText || ""),
                confidence: "UNRESOLVED", score: 0, derived: false,
                source: "", method: "DISPUTED_NAME",
                reason: "الاسم المقروء نفسه رُبط بشخصين مختلفين في هذه المسودة؛ احسم هذا الصف بنفسك.",
              },
            },
          } as ImportRow;
        }
        const decision = settled.get(key);
        if (decision && decision.id !== Number(row.AdInstructorId)) {
          changed = true;
          return {
            ...row,
            AdInstructorId: decision.id,
            importEvidence: {
              ...(row.importEvidence || {}),
              instructor: {
                ...(decision.evidence || {}),
                method: "NAME_PROPAGATION",
                raw: String(row.sourceInstructorText || decision.evidence?.raw || ""),
                reason: "الاسم المقروء نفسه حُسم في صف آخر من هذه المسودة؛ القرار عن الاسم لا عن الصف.",
              },
            },
          } as ImportRow;
        }
        return row;
      }
      if (linked(row)) return row;
      const decision = !disputed.has(key) ? settled.get(key) : undefined;
      if (decision) {
        changed = true;
        return {
          ...row,
          AdInstructorId: decision.id,
          importEvidence: {
            ...(row.importEvidence || {}),
            instructor: {
              ...(decision.evidence || {}),
              method: "NAME_PROPAGATION",
              raw: String(row.sourceInstructorText || decision.evidence?.raw || ""),
              reason: "الاسم المقروء نفسه حُسم في صف آخر من هذه المسودة؛ القرار عن الاسم لا عن الصف.",
            },
          },
        } as ImportRow;
      }
      const person = activePeople.length && !disputed.has(key) ? uniqueExactIdentityMatch(key, activePeople) : undefined;
      if (!person) return row;
      changed = true;
      return {
        ...row,
        AdInstructorId: Number(person.AdInstructorId),
        importEvidence: {
          ...(row.importEvidence || {}),
          instructor: {
            raw: String(row.sourceInstructorText || ""),
            confidence: "CONFIRMED", score: 100,
            source: "DEPARTMENT_DIRECTORY", method: "REGISTRY_EXACT", derived: false,
            reason: "الاسم المقروء يطابق حرفياً شخصاً واحداً من أعضاء هذا القسم المسجّلين.",
          },
        },
      } as ImportRow;
    });
    if (changed) onRows(healed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activePeople]);

  /* صفحةٌ قُبلت وفيها أسطر مطبوعة بلا صف: الصفوف الناقصة لا تظهر في الجدول أصلاً،
     والمعاينة تعدّل الصفوف ولا تضيفها. فيُطلب تأكيدٌ صريح أن الصفحة قورنت بالورقة،
     والحفظ والنشر ينتظرانه، وتُضاف الأسطر الناقصة في الجدول بعد الاستيراد
     (importPageReview). */
  const focusReviewed = useRef(0);
  const awaitingReview = (diagnostic?: PageDiagnostic) => {
    const page = Number(diagnostic?.page || 0);
    return Boolean(onReviewPage && page && Number(diagnostic?.missedLines) > 0 && !reviewedPages.includes(page));
  };
  const reviewControl = (diagnostic?: PageDiagnostic) => {
    const page = Number(diagnostic?.page || 0);
    if (!onReviewPage || !page || !(Number(diagnostic?.missedLines) > 0)) return null;
    /* الزرّ يختفي بالضغط، فتنتقل البؤرة إلى العبارة التي حلّت محلّه ولا تسقط إلى أول الصفحة. */
    return reviewedPages.includes(page)
      ? <span className="import-page-reviewed" tabIndex={-1} ref={element => { if (element && focusReviewed.current === page) { focusReviewed.current = 0; element.focus(); } }}><CheckCircle2 aria-hidden="true" />رُوجعت الصفحة · أضف الناقص بعد الاستيراد</span>
      : <button type="button" className="import-page-review-confirm" title="أؤكد أني قارنت هذه الصفحة بالورقة، وسأضيف أسطرها الناقصة في الجدول بعد الاستيراد" data-guide-ignore="تأكيد مراجعة صفحة ناقصة في المعاينة فقط؛ لا يحفظ ولا ينشر" onClick={() => { focusReviewed.current = page; onReviewPage(page); }}>راجعت الصفحة</button>;
  };

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

  /* من رُبط تلقائياً يجب أن يُقرأ اسمه في الجدول ولو لم يكن في قوائم الشاشة
     الأم بعد؛ أعضاء القسم المجلوبون هنا يُمرَّرون للعرض. */
  const displayProps = {
    ...tableProps,
    visitingPeople: [...((tableProps as any).visitingPeople || []), ...departmentPeople] as any,
  };

  if (totalPages <= 1) {
    /* ملفٌّ بصفحة واحدة لا شريطَ صفحاتٍ له، فتنبيهُ قراءتها (سطرٌ مطبوع لم يُقرأ) يُقال فوق جدولها. */
    const warned = pageDiagnostics.find(item => item?.warning);
    const warning = String(warned?.warning || "");
    return (
      <>
        {warning ? <div className="import-page-status" role="alert" data-import-issue={awaitingReview(warned) ? "true" : undefined}><AlertTriangle /><span>{warning}.</span>{reviewControl(warned)}</div> : null}
        <ImportPreviewTable rows={rows} onRows={onRows} {...displayProps} />
      </>
    );
  }

  return (
    <section className="import-page-review" aria-label="معاينة صفحات PDF كل صفحة على حدة">
      <div className="import-page-review-head">
        <div>
          <strong>معاينة صفحة بصفحة</strong>
          <small>كل صفحة تُراجع مستقلة كما قرأها المحرك، ثم تُدمج النتائج عند النشر.</small>
        </div>
        <span>{countOf(totalPages, AR.page)}</span>
      </div>

      <div className="import-page-tabs" role="tablist" aria-label="صفحات ملف PDF">
        {Array.from({ length: totalPages }, (_, offset) => {
          const page = offset + 1;
          const pageRows = rows.filter(row => rowPage(row) === page);
          const summary = summaryByPage.get(page);
          const diagnostic = diagnosticByPage.get(page) || summary?.diagnostic;
          const liveReview = pageRows.filter(rowNeedsReview).length;
          const review = pageRows.length ? liveReview : Number(summary?.review ?? 0);
          /* صفحةٌ رُوجعت أسطرها الناقصة لا يبقى تنبيه قراءتها مثلثاً على لسانها؛ صفوفها الحيّة تحكم. */
          const acknowledged = Number(diagnostic?.missedLines) > 0 && reviewedPages.includes(page);
          const suspicious = Boolean(summary?.suspicious || diagnostic?.suspicious || (diagnostic?.warning && !acknowledged) || review > 0 || (pageRows.length === 0 && Number(diagnostic?.extractedRows || 0) > 0));
          const empty = pageRows.length === 0;
          const active = activePage === page;
          return (
            <button
              key={page}
              type="button"
              role="tab"
              aria-selected={active}
              data-guide-ignore="تنقّل داخلي بين صفحات معاينة PDF فقط ولا ينفذ إجراءً على الجدول أو البيانات"
              data-import-issue={awaitingReview(diagnostic) ? "true" : undefined}
              className={`${active ? "active" : ""} ${suspicious ? "review" : empty ? "empty" : "ready"}`.trim()}
              onClick={() => setActivePage(page)}
            >
              <FileText aria-hidden="true" />
              <span><b>صفحة {page.toLocaleString("ar-KW-u-nu-latn")}</b><small>{countOf(pageRows.length, AR.row)}</small></span>
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
          /* صفحةٌ لم يُقرأ منها صف وأسطرها المطبوعة قليلة تُقبل بتنبيهها؛ فزرّ مراجعتها
             يظهر هنا أيضاً، وإلا بقي النشر ينتظر زراً لا يُرى. */
          if (!currentRows.length) return <><AlertTriangle /><span>{diagnostic?.warning ? `${String(diagnostic.warning)}.` : "لم تُستخرج صفوف من هذه الصفحة. راجع جودة الصفحة قبل النشر."}</span>{reviewControl(diagnostic)}</>;
          /* تنبيهُ القراءة (سطرٌ مطبوع لم يُقرأ) يُقال على صفحته ولو اكتملت صفوفها المقروءة. */
          if (diagnostic?.warning) return <><AlertTriangle /><span>{String(diagnostic.warning)}{review ? ` · ${countOf(review, AR.row)} بحاجة إلى مراجعة` : ""}.</span>{reviewControl(diagnostic)}</>;
          if (suspicious) return <><AlertTriangle /><span>هذه الصفحة تحتاج مراجعة: {review ? countOf(review, AR.row) : String(diagnostic?.reason || "بعض الخلايا لم تُحسم بعد")}.</span></>;
          return <><CheckCircle2 /><span>تمت قراءة الصفحة {activePage.toLocaleString("ar-KW-u-nu-latn")} بنجاح · {countOf(currentRows.length, AR.row)}.</span></>;
        })()}
      </div>

      {currentRows.length ? (
        <ImportPreviewTable rows={currentRows} onRows={mergePageRows} {...displayProps} />
      ) : (
        (() => {
          const diagnostic = diagnosticByPage.get(activePage);
          if (!(Number(diagnostic?.missedLines) > 0)) return <div className="import-page-empty"><FileText /><strong>لا توجد صفوف في هذه الصفحة</strong><small>لن تُضاف أي بيانات منها ما لم تكن الصفحة تحتوي جدولًا فعليًا.</small></div>;
          /* الصفحة المدينة بأسطر تبقى ولو فرغت: فرغت لأن المراجع حذف صفوفها، أو لأنه لم يُقرأ منها صف. */
          const readRows = Number(summaryByPage.get(activePage)?.rows ?? diagnostic?.extractedRows ?? 0);
          return readRows > 0
            ? <div className="import-page-empty"><FileText /><strong>حُذفت صفوف هذه الصفحة في المعاينة</strong><small>وما طُبع فيها ولم يُقرأ يُضاف في الجدول بعد الاستيراد.</small></div>
            : <div className="import-page-empty"><FileText /><strong>لم يُقرأ صف من هذه الصفحة</strong><small>ما طُبع فيها ولم يُقرأ يُضاف في الجدول بعد الاستيراد.</small></div>;
        })()
      )}
    </section>
  );
}
