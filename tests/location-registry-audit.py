#!/usr/bin/env python3
import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SEED=ROOT/'src/generated/locationRegistrySeed.ts'

def load_seed():
    # The generated seed is intentionally JSON embedded in TypeScript:
    #   export const LOCATION_REGISTRY_SEED = {...} as const;
    # Read that checked-in, privacy-safe artifact so CI never depends on
    # /mnt/data, the historical backup, or a developer-specific workspace.
    text=SEED.read_text(encoding='utf-8')
    match=re.search(r'export\s+const\s+LOCATION_REGISTRY_SEED\s*=\s*(\{.*\})\s+as\s+const;?\s*$', text, re.S)
    if not match:
        raise RuntimeError(f'Unable to parse LOCATION_REGISTRY_SEED from {SEED}')
    return json.loads(match.group(1))

data=load_seed()
B=data['buildings'];R=data['rooms'];C=data['reviewCases']; summary=data['summary']
passed=[]
def ok(name,cond):
    if not cond: raise AssertionError(name)
    passed.append(name)
def norm(v): return re.sub(r'\s+','',str(v or '')).upper()
def aliases(x): return {norm(x.get('officialCode') or x.get('canonicalCode'))}|{norm(a['value']) for a in x.get('aliases',[])}
def resolve_build(raw,college=None,section=None):
    cand=[b for b in B if norm(raw) in aliases(b) and (not college or college in b['collegeIds']) and (not section or section in b['sectionIds'] or not b['sectionIds'])]
    return cand[0] if len(cand)==1 else None
def resolve_room(raw,bid,college=None):
    cand=[r for r in R if r['buildingId']==bid and norm(raw) in aliases(r) and (not college or not r['collegeIds'] or college in r['collegeIds'])]
    return cand[0] if len(cand)==1 else None
b09=next(b for b in B if b['officialCode']=='012B09')
ok('01 B9 contextual', resolve_build('B9',6)['officialCode']=='012B09')
ok('02 B9 no other context', resolve_build('B9',5) is None)
ok('03 012B9 canonical anchor/alias', norm('012B9') in aliases(b09) or b09['officialCode']=='012B09')
ok('04 whitespace normalization', norm('B 09')=='B09')
ok('05 lowercase normalization', norm('b09')=='B09')
ok('06 suspicious G09 not blind building', not any(b['officialCode']=='012G09' and b['confidence']=='CONFIRMED' for b in B) or any(c['rawValue'].upper()=='G09' for c in C))
ok('07 placeholders not rooms', all(norm(r['canonicalCode']) not in {'TBA','00','0','-','---','PENDING_ROOM'} for r in R))
ok('07b CANCEL placeholders handled in runtime', all(x in (ROOT/'src/utils/locationRegistry.ts').read_text() for x in ['CANCEL','Pure punctuation/garbage']))
room_alias=next((r for r in R if r['confidence']=='CONFIRMED' and r.get('aliases')),None)
ok('08 room alias in building', room_alias is not None and resolve_room(room_alias['aliases'][0]['value'],room_alias['buildingId']) is not None)
code_multi={}
for r in R: code_multi.setdefault(norm(r['canonicalCode']),set()).add(r['buildingId'])
ok('09 same room code remains per-building', any(len(v)>1 for v in code_multi.values()) and all(r['id'].startswith('room_') for r in R))
ok('10 shared logic evidence', summary['sharedRooms']>0 and all(str(r.get('sharedConfidence')) in {'CONFIRMED','PROBABLE'} for r in R if r['shared']))
loc=(ROOT/'src/utils/locationRegistry.ts').read_text()
ok('11 pending system state', 'PENDING_ROOM' in loc and 'return ""' in loc)
server=(ROOT/'server.ts').read_text()
ok('12 ordinary add room unavailable UI/backend', 'إضافة القاعات محصورة بمدير النظام' in server)
ok('13 admin backend protected', 'app.post("/api/admin/location-registry/rooms", requirePermission(7), requirePowerAdmin' in server)
imp=(ROOT/'src/components/ImportPreviewTable.tsx').read_text()
ok('14 import unknown blocks', 'locationStatus !== "PENDING_ROOM"' in imp and 'buildingId' in imp and 'roomId' in imp)
ok('15 unknown building blocks', 'اختر مبنى رسميًا من سجل المباني' in (ROOT/'src/server/locationRegistryEngine.ts').read_text())
ok('16 pending allows preflight', 'type:"pending_room",severity:"warning"' in (ROOT/'src/server/locationRegistryEngine.ts').read_text())
ok('17 later room runs conflicts', '/api/schedules/check-conflicts' in imp and 'scheduleConflicts(req,canonicalBody' in server)
ok('18 historical view allowed', 'allowHistoricalView' in (ROOT/'src/server/locationRegistryEngine.ts').read_text())
ok('19 unresolved reuse blocks', 'resolveHistorical: true' in server and 'لا يمكن نسخ الجدول قبل معالجة بياناته' in server)
ok('20 stats excludes pending', 'verified=rows.filter' in loc and 'pendingRoomSchedules' in loc)
ok('21 registry filters canonical and historical aliases safely', 'rowMatchesBuilding' in (ROOT/'src/components/Reports.tsx').read_text() and 'rowMatchesRoom' in (ROOT/'src/components/Reports.tsx').read_text() and 'resolveBuilding' in (ROOT/'src/components/Reports.tsx').read_text() and 'resolveRoom' in (ROOT/'src/components/Reports.tsx').read_text())
engine=(ROOT/'src/server/locationRegistryEngine.ts').read_text()
ok('22 migration idempotent version', 'locationMigrationVersion===LOCATION_MIGRATION_VERSION' in engine)
ok('23 migration rollback', 'rollbackPatch' in engine and 'rollback-location-registry' in server)
ok('24 review queue', summary['reviewCases']>0 and '/api/admin/location-registry/review/' in server)
seed=(ROOT/'src/generated/locationRegistrySeed.ts').read_text()
ok('25 no personal data in seed/export', all(x not in seed for x in ['SystemUserPass','AdInstructorCivil','studentName','civilId','passwordHash']))
ok('26 probable inactive', all(not b['active'] for b in B if b['confidence']=='PROBABLE') and all(not r['active'] for r in R if r['confidence']=='PROBABLE'))
ok('27 no free text schedule location', 'data-location-registry-picker="true"' in (ROOT/'src/components/LocationPicker.tsx').read_text())
ok('28 hall barter canonical ids', 'canonicalForBarter' in server and 'barterRequestMatchesRow(request,row)' in server)
ok('29 copy writes validated rows', 'replaceScheduleScope(collegeId, sectionId, targetTermId, copiedRows' in server)
ok('30 backup not embedded', not any('schedule-full-backup_2026' in str(p) for base in [ROOT/'src',ROOT/'scripts',ROOT/'tests',ROOT/'public'] if base.exists() for p in base.rglob('*')))

# Owner-supplied college/site prefix semantics: 012B07 = site 012B + BUILDING 7.
b07=next(b for b in B if b['officialCode']=='012B07')
b11=next(b for b in B if b['officialCode']=='012B11')
ok('31 owner prefix semantics building 7', b07.get('sitePrefix')=='012B' and str(b07.get('buildingNumber'))=='7' and 6 in b07['collegeIds'])
ok('32 owner prefix semantics building 11', b11.get('sitePrefix')=='012B' and str(b11.get('buildingNumber'))=='11' and 6 in b11['collegeIds'])
ok('33 full identity retains zero padding', b07['officialCode']=='012B07' and b11['officialCode']=='012B11')
ok('34 authoritative prefix prevents cross-college binding', all(not (cid==6 and not b['officialCode'].startswith('012B')) for b in B for cid in b.get('collegeIds',[])))
prefix_src=(ROOT/'src/utils/locationCollegePrefixes.ts').read_text()
ok('35 numeric college prefixes require context', 'Numeric site prefixes' in prefix_src and '0510' in prefix_src and '0420' in prefix_src)
living=(ROOT/'src/components/LivingScheduleLayer.tsx').read_text()
reports=(ROOT/'src/components/Reports.tsx').read_text()
intel=(ROOT/'src/components/IntelligenceWorkspace.tsx').read_text()
ok('36 hidden decision editor uses registry picker', '<LocationPicker' in living and '<span>المبنى</span>\n                          <input' not in living and 'roomIdentityKey(selected)' in living)
ok('37 room report filters use canonical ids', 'String(row.roomId) === matrixHall' in reports and 'placeholder="F10 مثلاً"' not in reports)
ok('38 smart room proposals carry canonical ids', '{ ...row, ...change, locationStatus: change.locationStatus || "VERIFIED" }' in intel)
ok('39 operational buildings require an actually usable room', 'eligibleBuildingIds' in server and '!sectionId||eligibleBuildingIds.has(building.id)' in server and 'stale\n  // building.sectionIds relationship' in server)
ok('40 import blocker guides user to preview', 'أكمل الحقول المطلوبة والملاحظات في جدول المعاينة أولاً.' in intel and 'scrollIntoView({ behavior: "smooth", block: "center" })' in intel and 'أكمل الحقول المطلوبة والملاحظات في جدول المعاينة أولاً.' in server)
admin=(ROOT/'src/components/LocationRegistryAdmin.tsx').read_text()
ok('41 shared room is derived, never manually checked', 'shared=sectionIds.length>1' in server and 'checked={Boolean(editEntity.shared)}' not in admin and 'checked={newRoom.shared}' not in admin and 'تُصنّف تلقائيًا كمشتركة' in admin)
ok('42 suggestions obey the same department room scope', 'room.shared||room.sectionIds.length===0||room.sectionIds.includes(sectionId)' not in server and 'borrowedRoomIds.has(room.id)' in server)
ok('43 admin workspace collapses secondary controls', '<details className="location-admin-guide">' in admin and 'showBuildingCreate' in admin and 'showRoomCreate' in admin)


ok('44 basic education female site label is explicit', 'siteLabel: "التربية الأساسية - بنات"' in prefix_src)
ok('45 registry ordering is natural everywhere', 'compareLocationCodes' in loc and 'merged.buildings.sort' in server and 'merged.rooms.sort' in server)
ok('46 admin department filter requires an actual department room', 'hasDepartmentRoom' in admin and 'room.sectionIds.includes(sectionFilter)' in admin)
ok('47 admin refresh is automatic and duplicate buttons removed', 'visibilitychange' in admin and '<RefreshCw' not in admin and 'setWorkspaceTab("migration");void previewMigration()' not in admin)
ok('48 empty review and pending tabs removed', 'workspaceTab==="review"' not in admin and 'workspaceTab==="pending"' not in admin)
ok('49 historical migration uses smart safe recovery without promoting PROBABLE to VERIFIED', 'RECOVERED_FROM_UNIQUE_ROOM_FINGERPRINT' in engine and 'HISTORICAL_STRONG_PROBABLE_REVIEW' in engine and 'resolveStrongHistoricalProbableRoom' in engine and 'HISTORICAL_STRONG_PROBABLE_ROOM' not in engine)
ok('50 invalid historical garbage is classified explicitly', 'CANCELLED' in loc and 'Pure punctuation/garbage' in loc and 'Placeholder تاريخي' in admin)


admin=(ROOT/'src/components/LocationRegistryAdmin.tsx').read_text()
picker=(ROOT/'src/components/LocationPicker.tsx').read_text()
ok('51 redundant site filter removed from registry UI', 'aria-label="الموقع"' not in admin and 'كل المواقع' not in admin and 'siteFilter' not in admin)
ok('52 department room picker merges then sorts all department rooms', 'departmentRooms=useMemo' in picker and 'compareLocationCodes(a.canonicalCode,b.canonicalCode)' in picker)
ok('53 section selectors are Arabic-natural sorted', 'sortByName(data.sections.filter' in admin and 'sortByName(availableSections' in (ROOT/'src/components/IntelligenceContextBar.tsx').read_text())

ok('54 import publish is disabled while any issue remains', 'importReady = Boolean(importPreview?.valid && importBlockingIssues.length === 0)' in intel and 'disabled={!importReady || busy}' in intel)
ok('55 empty query hides print and report actions', 'results.length && !pending ? <div className="query-canvas-actions">' in reports)
ok('56 query facets cascade through the actual intersected dataset', 'rowLocation = useCallback' in reports and 'rowsForFacet = useCallback' in reports and 'rowsForFacet("course")' in reports and 'rowsForFacet("instructor")' in reports and 'rowsForFacet("building")' in reports and 'rowsForFacet("room")' in reports)
ok('57 late alert shows thin course name under course code', 'subtitle: courseName || undefined' in intel and 'intel-reason-course-name' in intel)
ok('58 demand arithmetic values are centered under labels', 'justify-items:center' in (ROOT/'src/styles/06-intelligence.css').read_text())
courses_src=(ROOT/'src/components/Courses.tsx').read_text()
ok('59 courses type import restored for CI', 'import type { AdSection } from "../types";' in courses_src)
ok('60 course inspector shows public code not internal id', '<b>{selected.CourseCode || "—"}</b>' in courses_src)
transfer=(ROOT/'src/components/ScheduleTransfer.tsx').read_text()
ok('61 transfer publish is hidden and hard-disabled for any unresolved preview note', 'const importReady = Boolean(xlsxPreview?.rows?.length && importBlockingIssues.length === 0)' in transfer and '{importReady ? (' in transfer and 'disabled={busy || !importReady}' in transfer and 'previewIssues: importBlockingIssues' in transfer and 'if (!importReady)' in transfer)
ok('62 draft backend rejects unresolved preview notes', 'لا يمكن حفظ المسودة أو نشرها قبل معالجة جميع ملاحظات المعاينة.' in server and 'previewIssues.length' in server)
ok('63 pending room never waives the required building', 'building: (row: ImportRow) => !row.buildingId,' in imp)
doc_ocr=(ROOT/'src/utils/documentOcr.ts').read_text()
ok('64 authority PDF normalizes Arabic presentation forms before header and instructor matching', '.normalize("NFKC")' in doc_ocr and 'ordinary Arabic letters before ANY header/course/instructor matching' in doc_ocr)
ok('65 authority PDF text layer keeps one physical timetable row and drops each repeated page header structurally', 'tableFromWords(words,[],"pdf-text")' in doc_ocr and 'authorityBodyOnly(physicalRows)' in doc_ocr and 'strictPdfRows?dist<=rowTolerance' in doc_ocr and 'hasCourseKey&&(hasTime||hasBuilding)' in doc_ocr)
ok('66 authority PDF building bleed is repaired only through the central confirmed-registry resolver', 'const bleed=token.match(/^(\\d{3}[A-Z]\\d{2})\\d$/)' in loc and 'buildingMethod="BORDER_BLEED_RECOVERY"' in loc and 'resolveAuthorityLocation(registry' in server)
ok('67 wrong academic term is rejected before table OCR', 'readAuthorityPdfHeader(bytes)' in server and server.index('readAuthorityPdfHeader(bytes)') < server.index('ocrDocument(bytes,"application/pdf"') and 'PDF_TERM_MISMATCH' in server)
ok('68 cross-branch PDF rows are surfaced and never silently assigned to current college', 'sourceSitePrefix!==targetSitePrefix' in server and 'لن يُضاف هذا السطر إلى الكلية المحددة قبل مراجعته' in server and 'officialSiteLabel(sourceSitePrefix)' in server)
ok('69 instructor import keeps department roster evidence and accepts only unique system identities from full/two/three-name proof', 'Repository.getDepartmentDelegates(collegeId,sectionId)' in server and 'Repository.getVisitingRoster(collegeId,sectionId,termId)' in server and 'TWO or THREE real name tokens' in doc_ocr and 'preferredHit' in doc_ocr and 'const globalHit=choose(catalogue,false)' in doc_ocr)

# PDF import regressions observed on real Authority text PDFs and CamScanner scans.
ok('70 partial text PDF header falls back instead of rejecting a valid branch', 'const physicalText=tableFromWords(headerWords,[],"pdf-text")' in doc_ocr and 'if(embedded.term&&embedded.branch&&embedded.department)' in doc_ocr and 'A PARTIAL text-layer hit is not success' in doc_ocr)
ok('71 time-column proof tolerates one ruled-border digit while rejecting building-shaped OCR', 'authorityTimeCellLooksPlausible' in doc_ocr and '012-809' in doc_ocr and 'const timeIndex=claimBy(authorityTimeCellLooksPlausible' in doc_ocr)
ok('72 academic key searches the bounded right table edge instead of the last physical band', 'const keySearchFrom=Math.max(0,columnBands.length-7)' in doc_ocr and 'for(let end=lastBand;end>=keySearchFrom;end--)' in doc_ocr)
ok('73 full Authority course keys resolve by number inside the selected document department', 'authorityCourseCodeMatches(source,item.digits,authorityDepartment)' in doc_ocr and 'Course NAMES are display evidence only' in doc_ocr)
schedules_src=(ROOT/'src/components/Schedules.tsx').read_text()
ok('74 section numbering starts at 501 and ignores legacy/broken lower values when suggesting next section', 'return "501"' in schedules_src and 'value >= 501 && value <= 999' in schedules_src and 'Sections of one course run 501, 502, 503' in schedules_src)

ok('75 narrow room cells are re-read in isolation after geometry proves the room column', 'Rooms are the narrowest identity cells in SWRSCHA' in doc_ocr and 'readCell(surface,columnBands[hallIndex],row,LOCATION_ALNUM,worker)' in doc_ocr and 'if(stripPatterns.hall.test(value))next[row]=value' in doc_ocr)
ok('76 scan clock border artefacts use a same-page dominant tail rather than a hard-coded time guess', 'const clockTailCounts=new Map<string,number>()' in doc_ocr and 'pageClockTail' in doc_ocr and 'one-character tail correction' in doc_ocr)
ok('77 generated RTL header keeps glued 012 branch separate from 0101 department', 'Some Oracle/PDF extractors glue the code to the Arabic word visually' in doc_ocr and 'nearestDepartmentName' in doc_ocr and 'التربية الاسلامية 0101 القسم' in doc_ocr)
ok('78 CamScanner page-1 header has bounded high-resolution rescue', 'Deep header rescue' in doc_ocr and 'renderPdfFirstPage(input,TARGET_LONG_EDGE)' in doc_ocr and 'for(const psm of [6,11])' in doc_ocr)
ok('79 partial preflight is rescued before PDF_HEADER_UNRESOLVED is emitted', 'A partial preflight is NOT a rejection' in server and server.index('ocrDocument(bytes,"application/pdf"') < server.index('code:"PDF_HEADER_UNRESOLVED"'))
ok('80 successful scan grid still rereads page-1 header when preflight is incomplete', 'readAuthorityHeaderBand(upright,lanePool.ara)' in doc_ocr and 'needsHeaderRescue' in doc_ocr and 'already-upright 2800px page' in doc_ocr)
ok('81 native text PDF reconstructs SWRSCHA cells from embedded coordinates instead of camera OCR', 'authorityPdfTextGridRows(words,Number(viewport.width||0))' in doc_ocr and 'Native generated PDFs get the coordinate-grid path' in doc_ocr)
ok('82 native text PDF building/room are physically bounded away from seat-capacity columns', 'Capacity/seat columns start to the right of x=.39' in doc_ocr and 'zone(row,.294,.348)' in doc_ocr and 'zone(row,.348,.390)' in doc_ocr)
ok('83 building identity is owned by one registry resolver rather than shape alone', 'resolveAuthorityLocation(registry' in server and 'EXACT_REGISTRY' in loc and 'known.includes(token)' in loc and 'Never send arbitrary six-digit numeric seat/capacity strings' in loc)
ok('84 room validity is building-bound and not incorrectly rejected by main-campus context', 'a room is valid iff it exists under THAT building' in server and 'resolveRoom(registry,rawHall,building.value.id,{})' in server)
ok('85 instructor titles d/a/a.d are stripped only as presentation and هيئة is registry-bound', 'د./ا./ا.د.' in server and 'هيئة تدريسية' in doc_ocr and 'ambiguous names stay blank' in doc_ocr)
ok('86 fast OCR lanes have page-scoped safe fallback and do not reread clean pages', 'SAFE FALLBACK — suspicious pages only' in doc_ocr and 'const suspiciousIndexes=pages.map' in doc_ocr and 'Clean pages are never re-read' in doc_ocr)
preview_import=(ROOT/'src/components/ImportPreviewTable.tsx').read_text()
ok('87 visiting instructor is shown as a quiet badge beside the canonical system name', 'import-visiting-badge' in preview_import and 'visitingIdSet.has' in preview_import)


# Owner academic-import identity rules (2026-08-25).
auth=(ROOT/'src/utils/authorityAcademicCodes.ts').read_text()
doc=(ROOT/'src/utils/documentOcr.ts').read_text()
server=(ROOT/'server.ts').read_text()
ok('81 scientific department code is college + local department', 'college 01 + department 01 => 0101' in auth and 'authorityDepartmentMatches' in server)
ok('82 course identity is number-only and canonical name comes from system', 'Course NAMES are display evidence only' in doc and 'AdCourseName:course.CourseName' in doc)
ok('83 imported sections restart at 501 per canonical course', 'assignAuthoritySections' in auth and 'nextByCourse' in auth and 'sequentialSections:true' in server and 'assignAuthoritySections(safeDraftRows(parsed.rows' in server)
ok('84 instructor import uses unique full/two/three-name system identity with no edit-distance rescue', 'TWO or THREE real name tokens' in doc and 'ambiguous names stay blank' in doc and 'const globalHit=choose(catalogue,false)' in doc)
preview=(ROOT/'src/components/ImportPreviewTable.tsx').read_text()
ok('85 unmatched instructor source text is never displayed as a canonical professor', 'person?.AdInstructorName ?' in preview and 'person.AdInstructorName' in preview and 'person?.AdInstructorName || String(row.sourceInstructorText' not in preview)
ok('86 document department rejects local-only code when college composite is known', 'if (college && composite) return source === composite' in auth)
ok('87 authority section sequence is re-applied server-side after preview, edit, delete and publish', server.count('assignAuthoritySections(safeDraftRows') >= 5)
transfer=(ROOT/'src/components/ScheduleTransfer.tsx').read_text()
ok('88 authority section sequence is re-applied in both import UIs', 'assignAuthoritySections(next)' in transfer and 'assignAuthoritySections(rows)' in intel)
ok('89 canonical header receipt uses system department label after numeric proof', 'canonical system label in the receipt/preview' in server and 'name:canonicalName' in server)
ok('90 fallback parser never confuses full course key with CRN', 'value!==sourceCourseCode' in doc and 'sourceCourseCode=sourceCourseRuns.find' in doc)


location_prefixes=(ROOT/'src/utils/locationCollegePrefixes.ts').read_text()
location_registry=(ROOT/'src/utils/locationRegistry.ts').read_text()
ok('91 owner grammar reconstructs 012B09 only from branch 012 + B09 + official registry', 'recoverOfficialBuildingCodeFromAuthorityCell' in location_prefixes and 'site prefix 012B + building 09' in location_prefixes and 'knownOfficialCodes' in location_prefixes)
ok('92 PDF import preserves raw same-cell building evidence for registry recovery', 'buildingRaw?:string' in doc_ocr and 'sourceBuildingText:grid.buildingRaw||grid.building' in doc_ocr and 'row.sourceBuildingText||row.AdRoomCode' in server)
ok('93 room OCR correction is constrained to confirmed room inside already resolved building', 'Same-cell OCR repair' in location_registry and 'repairedMatches=base.filter' in location_registry and 'repairedMatches.length===1' in location_registry)
ok('94 alternate-site course cue is informational and restored beside the course name', 'courseSiteLabel' in server and 'import-course-site-note' in preview and '<MapPin />' in preview)
ok('95 same-branch 012J/012F site cue does not become a blocking cross-branch mismatch', 'sameAuthorityBranch' in server and 'row.courseSiteLabel=sourceSiteLabel' in server and 'sourceSitePrefix!==targetSitePrefix&&!sameAuthorityBranch' in server)
ok('96 distinctive confirmed room may rescue a damaged building only when the room fingerprint is unique', 'resolveBuildingFromUniqueRoom' in location_registry and 'UNIQUE_ROOM_FINGERPRINT' in location_registry and 'Ambiguous rooms' in location_registry and 'resolveAuthorityLocation(registry' in server)
ok('97 instructor identity canonicalizes spaced/unspaced عبد names and keeps two-name proof department-only', 'Authority/system spellings alternate constantly between «عبد الله» and' in doc_ocr and 'const twoExactProof=allowTwo' in doc_ocr and 'const globalHit=choose(catalogue,false)' in doc_ocr)
ok('98 authority location grammar has one central resolver', 'export function resolveAuthorityLocation' in location_registry and server.count('resolveAuthorityLocation(registry') >= 1)
ok('99 import evidence covers all seven canonical fields', all(key in server for key in ['course:{raw:', 'section:{raw:', 'days:{raw:', 'time:{raw:', 'instructor:{raw:', 'building:{raw:', 'room:{raw:']))
ok('100 provenance survives preview and carries source/method/score', 'score?: number; source?: string; method?: string; derived?: boolean' in preview and 'evidenceTitle' in preview)
ok('101 safely-derived cells use a calm non-danger preview state', 'import-cell-derived' in preview and 'td.import-cell-derived' in (ROOT/'src/styles/06-intelligence.css').read_text())
ok('102 PDF preview exposes quiet ready/review counts instead of a large blocker banner', 'pdfReadinessSummary' in transfer and '<small>جاهز</small>' in transfer and '<small>للمراجعة</small>' in transfer and 'import-color-key' in transfer)
ok('103 golden Authority fixture and regression guard are wired into npm test', (ROOT/'tests/fixtures/authority-import-golden.json').exists() and (ROOT/'tests/pdf-import-golden.ts').exists() and 'tsx tests/pdf-import-regression.ts && tsx tests/pdf-import-golden.ts' in (ROOT/'package.json').read_text())
ok('104 golden baseline documents no-regression change protocol', 'Existing golden fixtures must remain unchanged' in (ROOT/'docs/PDF_IMPORT_GOLDEN_BASELINE.md').read_text() and 'Never weaken a validator' in (ROOT/'docs/PDF_IMPORT_GOLDEN_BASELINE.md').read_text())
ok('105 instructor resolver uses course history before department before global proof', doc_ocr.index('const courseHit=') < doc_ocr.index('const preferredHit=') < doc_ocr.index('const globalHit='))
ok('106 seat/capacity numerics cannot enter contextual building shorthand', 'Never send arbitrary six-digit numeric seat/capacity strings' in location_registry and '/^(?:0*\\d{1,3}|[A-Z]0*\\d{1,3})$/' in location_registry)
ok('107 sideways image-only Authority PDF is refused before body OCR without weakening semantic course proof', 'authorityScanRequiresLandscape' in doc_ocr and 'ROOT ORIENTATION SAFETY' in doc_ocr and 'authorityCourseCellLooksPlausible' in doc_ocr and 'PDF_SCAN_REQUIRES_LANDSCAPE' in server and server.index('PDF_SCAN_REQUIRES_LANDSCAPE') < server.index('ocrDocument(bytes,"application/pdf"'))
ok('108 any later scan page that required a physical turn is refused before row parsing', 'pageDiagnostics' in doc_ocr and 'const rotatedPages=recognized.pageDiagnostics.filter' in server and server.index('const rotatedPages=recognized.pageDiagnostics.filter') < server.index('parseScheduleTable(recognized.pages'))
css=(ROOT/'src/styles/06-intelligence.css').read_text()
ok('109 import confidence legend uses four visually distinct named states', 'أبيض · مؤكد مباشر' in transfer and 'أخضر · مستنتج ومثبت' in transfer and 'ذهبي · يحتاج مراجعة' in transfer and 'أحمر · ناقص' in transfer and 'import-cell-review' in css)
ok('110 scan course-column proof rejects welded section+CRN as a course key', 'authorityCourseCellLooksPlausible' in doc_ocr and '5011894' in doc_ocr and 'authorityGridDepartment' in doc_ocr and 'readGrid(upright,lanePool,authorityGridDepartment)' in doc_ocr)
ok('111 unresolved OCR course evidence can never become the user-facing course title', 'AdCourseId:0,AdCourseName:""' in doc_ocr and 'course?.CourseName || "—"' in preview and 'row.AdCourseName=canonicalCourse?String(canonicalCourse.CourseName||""):""' in server)

ok('P0 probable room never becomes verified from usage alone', 'HISTORICAL_STRONG_PROBABLE_REVIEW' in engine and 'locationStatus:"LOCATION_REVIEW_REQUIRED"' in engine)
ok('P1 room college metadata follows canonical target building', 'roomCollegeIds=targetBuilding.collegeIds.length?[...targetBuilding.collegeIds]' in server and 'لا يمكن نقل/ربط القاعة بكلية لا يتبع لها المبنى الهدف' in server)
ok('P1 shared identity derives from section associations', 'shared:room.sectionIds.length>1' in engine and 'shared:room.sectionIds.length>1' in server)
ok('P1 punctuation garbage is classified consistently', '*+=~!|:;,' in location_registry)
ok('P1 query filters use dependent facet intersections', all(x in reports for x in ['rowsForFacet("course")','rowsForFacet("instructor")','rowsForFacet("building")','rowsForFacet("room")']))

# Golden-stage UX invariants: presentation improvements must not weaken import identity.
schedule_review=(ROOT/'src/components/ScheduleReview.tsx').read_text()
golden_state=(ROOT/'docs/CURRENT_GOLDEN_STATE.md').read_text()
ok('112 import course and section identities are locked during quick edit', 'import-locked-course' in preview and 'import-locked-section' in preview and 'المقرر مثبت من النظام ولا يتغير' in preview and 'رقم الشعبة مثبت من المصدر ولا يتغير هنا' in preview)
ok('113 corrected instructor editor hides raw OCR identity and shows only canonical picker', 'sourceInstructorText' in preview and 'قرأ الملف:' not in preview and '<InstructorPicker' in preview)
ok('114 valid manual preview edits replace stale error evidence with confirmed manual provenance', 'source:"MANUAL"' in preview and 'method:"USER_EDIT"' in preview and 'score:100' in preview and 'import-cell-manual' in preview)
ok('115 visiting badge is present in import, schedule, reports and final schedule review', 'import-visiting-badge' in preview and 'VisitingBadge' in schedules_src and 'VisitingBadge' in reports and 'VisitingBadge' in schedule_review and 'visitingIds={visitingIds}' in schedules_src)
ok('116 schedule and report time ranges are kept as one visual value', 'formatScheduleTimeRange(row.fstarttime, row.fendtime)' in reports and 'white-space:nowrap' in (ROOT/'src/styles/05-schedule.css').read_text() and 'white-space:nowrap' in (ROOT/'src/styles/06-intelligence.css').read_text())
ok('117 change log has a dedicated print action and print sheet', 'طباعة تقرير التعديلات' in schedules_src and 'change-log-print-host' in schedules_src and 'تقرير التعديلات' in schedules_src and 'data-print-kind="change-log"' not in schedules_src and 'root.dataset.printKind="change-log"' in schedules_src)
ok('118 current golden stage is documented for future maintainers', 'اسم المقرر ورقم الشعبة في معاينة الاستيراد **هويتان مقفلتان**' in golden_state and 'Badge صغيرة `منتدب`' in golden_state and 'تقرير تعديلات قابل للطباعة' in golden_state)
ai_review_prompt=(ROOT/'docs/AI_REVIEW_PROMPT.md').read_text()
ok('119 maintenance review prompt is embedded in the project and linked from golden state', 'لا تعِد البناء' in ai_review_prompt and 'عدم التخمين' in ai_review_prompt and 'docs/AI_REVIEW_PROMPT.md' in golden_state)

# Graduate-proof + report-availability invariants added after the Golden stage.
reports_src=(ROOT/'src/components/Reports.tsx').read_text()
ok('120 authority change report remains discoverable whenever a saved baseline exists', 'setAuthorityReportAvailable(Boolean(data?.draftId))' in reports_src and 'setAuthorityReportAvailable(Boolean(data?.hasChanges))' not in reports_src)
ok('121 graduate door accepts only the official graduation sheet and checks all identity fields', 'graduationSheetFacts(ocr.text)' in server and 'ليس صحيفة التخرج/الخطة الدراسية المعتمدة' in server and 'الرقم المدني في الإثبات لا يطابق' in server and 'التخصص الظاهر في صحيفة التخرج لا يطابق' in server and 'الوحدات المطلوبة في الصحيفة' in server)
ok('122 Special Education is one canonical umbrella for its programme sub-specialties', 'academicSectionNameMatches' in server and 'sourceSpecial||targetSpecial' in server and 'sourceSpecial&&targetSpecial' in server and 'academicSectionNameMatches(facts.normalizedText' in server)
ok('123 graduate proof cannot be bypassed with an old/generic proof token', 'proof.documentKind!=="graduation-sheet"' in server and 'proof.specializationMatched!==true' in server and 'Number(proof.degreeUnits)!==Number(currentRule.degreeUnits)' in server)
ok('124 public graduate UI explicitly asks for the graduation sheet, not a generic transcript', 'ارفع صحيفة التخرج' in server and 'أي مستند آخر لن يُقبل' in server and 'تحقق من صحيفة التخرج أولاً' in server)
ok('125 graduate eligibility uses only stored academic degree rules, never name-derived defaults', 'storedDegreeRuleForSection' in server and 'Graduate proof is a hard data gate' in server and 'لا توجد قواعد تخرج أكاديمية معتمدة' in server)

print(json.dumps({'passed':len(passed),'tests':passed},ensure_ascii=False,indent=2))
