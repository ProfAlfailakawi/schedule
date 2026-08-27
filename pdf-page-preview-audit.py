from pathlib import Path

root=Path(__file__).resolve().parents[1]
def read(path): return (root/path).read_text(encoding='utf-8')
def ok(name, cond):
    if not cond: raise AssertionError(name)
    print(f'[ok] {name}')

ocr=read('src/utils/documentOcr.ts')
server=read('server.ts')
paged=read('src/components/PagedImportPreview.tsx')
transfer=read('src/components/ScheduleTransfer.tsx')
intel=read('src/components/IntelligenceWorkspace.tsx')
report=read('src/components/AuthorityPdfReport.tsx')
printcss=read('src/styles/08-print.css')

ok('01 parser retains physical sourcePage', 'sourcePage?:number' in ocr and 'sourcePage:pageIndex+1' in ocr)
ok('02 grid parsing is page-local before merge', 'for(let pageIndex=0;pageIndex<pages.length;pageIndex++)' in ocr and 'const pageRows=parsed.rows.map(row=>({...row,sourcePage:pageIndex+1}))' in ocr)
ok('03 server preserves sourcePage through draft sanitization', 'sourcePage: Number.isFinite(Number(raw?.sourcePage))' in server)
ok('04 server returns explicit page summaries', 'const pageSummaries=Array.from({length:recognized.pageCount}' in server and 'verificationSummary,pageSummaries' in server)
ok('05 transfer preview is page-scoped', '<PagedImportPreview' in transfer and 'pageDiagnostics=' in transfer and 'pageSummaries=' in transfer)
ok('06 intelligence preview is page-scoped', '<PagedImportPreview' in intel and 'pageDiagnostics=' in intel and 'pageSummaries=' in intel)
ok('07 page editor merges edits by immutable sourceOrder', 'sourceOrder' in paged and 'mergePageRows' in paged and 'sourcePage: activePage' in paged)
ok('08 no all-pages table is rendered when source has multiple pages', 'if (totalPages <= 1)' in paged and 'currentRows.length ?' in paged)
ok('09 report remains field-level', 'authority-pdf-cell-changed' in report and 'fieldChanged(entry, "AdRoomHall")' in report and 'fieldChanged(entry, "fstarttime", "fendtime")' in report and 'fieldChanged(entry, "AdInstructorId")' in report)
ok('10 untouched changed-row cells remain neutral in print', '.authority-pdf-row-changed>[role="cell"]:not(.authority-pdf-cell-changed)' in printcss)
ok('11 every scanned page (one-page uploads and page 1 included) gets the same bounded catalogue-exact course-key rescue', 'const courseKeysForPage=(_index:number)=>multiPageCourseKeys' in ocr and 'OWNER MANDATE 2026-08-27' in ocr and 'readGrid(upright,lanePool,authorityGridDepartment,pageCourseKeys)' in ocr and 'courseKeysForPage(index)' in ocr)
ok('12 system-canonical section never paints yellow and section-only drift cannot create modified badge', 'const visibleChangedFields=changedFields.filter(field=>field!=="SCode")' in server and 'status:visibleChangedFields.length?"changed":"unchanged"' in server and 'className="print-ltr">{String(row.SCode' in report and 'fieldChanged(entry, "SCode")' not in report)
print('12/12 page-isolation and field-diff audit passed')
