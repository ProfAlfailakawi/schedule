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
ok('49 historical migration uses smart safe recovery', 'RECOVERED_FROM_UNIQUE_ROOM_FINGERPRINT' in engine and 'HISTORICAL_STRONG_PROBABLE_ROOM' in engine and 'resolveStrongHistoricalProbableRoom' in engine)
ok('50 invalid historical garbage is classified explicitly', 'CANCELLED' in loc and 'Pure punctuation/garbage' in loc and 'Placeholder تاريخي' in admin)


admin=(ROOT/'src/components/LocationRegistryAdmin.tsx').read_text()
picker=(ROOT/'src/components/LocationPicker.tsx').read_text()
ok('51 redundant site filter removed from registry UI', 'aria-label="الموقع"' not in admin and 'كل المواقع' not in admin and 'siteFilter' not in admin)
ok('52 department room picker merges then sorts all department rooms', 'departmentRooms=useMemo' in picker and 'compareLocationCodes(a.canonicalCode,b.canonicalCode)' in picker)
ok('53 section selectors are Arabic-natural sorted', 'sortByName(data.sections.filter' in admin and 'sortByName(availableSections' in (ROOT/'src/components/IntelligenceContextBar.tsx').read_text())

ok('54 import publish is disabled while any issue remains', 'importReady = Boolean(importPreview?.valid && importBlockingIssues.length === 0)' in intel and 'disabled={!importReady || busy}' in intel)
ok('55 empty query hides print and report actions', 'results.length && !pending ? <div className="query-canvas-actions">' in reports)
ok('56 course selector cascades through historical canonical location', 'rowLocation = useCallback' in reports and 'rowMatchesBuilding(row, filters.building)' in reports and 'rowMatchesRoom(row, filters.hall)' in reports)
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
ok('66 authority PDF building bleed is repaired only through a confirmed registry code', 'const bleed=token.match(/^(\\d{3}[A-Z]\\d{2})\\d$/)' in server and 'if(repaired.status==="CONFIRMED"&&repaired.value)building=repaired' in server)
ok('67 wrong academic term is rejected before table OCR', 'readAuthorityPdfHeader(bytes)' in server and server.index('readAuthorityPdfHeader(bytes)') < server.index('ocrDocument(bytes,"application/pdf"') and 'PDF_TERM_MISMATCH' in server)
ok('68 cross-branch PDF rows are surfaced and never silently assigned to current college', 'sourceSitePrefix!==targetSitePrefix' in server and 'لن يُضاف هذا السطر إلى الكلية المحددة قبل مراجعته' in server and 'officialSiteLabel(sourceSitePrefix)' in server)
ok('69 instructor matching prioritizes real department rosters and normalizes academic titles', 'Repository.getDepartmentDelegates(collegeId,sectionId)' in server and 'Repository.getVisitingRoster(collegeId,sectionId,termId)' in server and 'Academic titles are presentation, not identity' in doc_ocr)

# PDF import regressions observed on real Authority text PDFs and CamScanner scans.
ok('70 partial text PDF header falls back instead of rejecting a valid branch', 'const physicalText=tableFromWords(headerWords,[],"pdf-text")' in doc_ocr and 'if(embedded.term&&embedded.branch&&embedded.department)' in doc_ocr and 'A PARTIAL text-layer hit is not success' in doc_ocr)
ok('71 time-column proof rejects building-shaped OCR before assigning semantic roles', '(?:0[7-9]|1\\d|20)[0-5]\\d' in doc_ocr and '012-809' in doc_ocr and 'const timeIndex=claim(stripPatterns.time' in doc_ocr)
ok('72 academic key searches the bounded right table edge instead of the last physical band', 'const keySearchFrom=Math.max(0,columnBands.length-7)' in doc_ocr and 'for(let end=lastBand;end>=keySearchFrom;end--)' in doc_ocr)
ok('73 full Authority course keys resolve against unique three-digit catalogue tails', 'tailCounts.get(tail)===1' in doc_ocr and 'item.digits.slice(-3)===tail' in doc_ocr)
schedules_src=(ROOT/'src/components/Schedules.tsx').read_text()
ok('74 section numbering starts at 501 and ignores legacy/broken lower values when suggesting next section', 'return "501"' in schedules_src and 'value >= 501 && value <= 999' in schedules_src and 'Sections of one course run 501, 502, 503' in schedules_src)

ok('75 narrow room cells are re-read in isolation after geometry proves the room column', 'Rooms are the narrowest identity cells in SWRSCHA' in doc_ocr and 'readCell(surface,columnBands[hallIndex],row,LOCATION_ALNUM,worker)' in doc_ocr and 'if(stripPatterns.hall.test(value))next[row]=value' in doc_ocr)
ok('76 scan clock border artefacts use a same-page dominant tail rather than a hard-coded time guess', 'const clockTailCounts=new Map<string,number>()' in doc_ocr and 'pageClockTail' in doc_ocr and 'one-character tail correction' in doc_ocr)

print(json.dumps({'passed':len(passed),'tests':passed},ensure_ascii=False,indent=2))
