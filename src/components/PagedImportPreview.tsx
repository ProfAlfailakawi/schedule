import React, { useEffect, useMemo, useState } from "react";
import { instructorIdentityKey, uniqueExactIdentityMatch } from "../utils/instructorIdentity";
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
  /* The tab strip follows the LIVE rows, not the original PDF page count. A page
     the reviewer empties by deleting all of its rows must vanish from the
     preview entirely — its source rows still live on in the immutable baseline
     that feeds the change report, so nothing is lost there. Interior pages that
     were emptied stay visible (they fall under maxRowPage) so a gap between two
     populated pages is never hidden; only trailing emptied pages fall away.
     Using pageCount here kept a deleted last page on screen as a permanent
     "empty" tab that looked like an unresolved problem. */
  const totalPages = Math.max(1, maxRowPage);
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
   *    (تاريخه ودليله اليدوي ومنتدبيه)، يُربط به. نطاق القسم وحده: لا تُعمّم هوية خارج قائمة القسم.
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
  const allowedInstructorIds = new Set([
    ...(tableProps.departmentIds || []), ...(tableProps.affiliatedIds || []),
    ...Array.from(tableProps.visitingIds || []),
    ...(tableProps.visitingPeople || []).map(person => person.AdInstructorId),
    ...departmentPeople.map(person => person.AdInstructorId),
  ].map(Number));
  const linked = (row: ImportRow) => allowedInstructorIds.has(Number(row.AdInstructorId));
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

  if (totalPages <= 1) return <ImportPreviewTable rows={rows} onRows={onRows} {...displayProps} />;

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
        <ImportPreviewTable rows={currentRows} onRows={mergePageRows} {...displayProps} />
      ) : (
        <div className="import-page-empty"><FileText /><strong>لا توجد صفوف في هذه الصفحة</strong><small>لن تُضاف أي بيانات منها ما لم تكن الصفحة تحتوي جدولًا فعليًا.</small></div>
      )}
    </section>
  );
}
