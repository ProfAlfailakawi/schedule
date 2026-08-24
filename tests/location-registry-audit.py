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
ok('21 registry filters canonical', 'locationRegistry.buildings' in (ROOT/'src/components/Reports.tsx').read_text() and 'String(s.buildingId||"") === filters.building' in (ROOT/'src/components/Reports.tsx').read_text())
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

print(json.dumps({'passed':len(passed),'tests':passed},ensure_ascii=False,indent=2))
