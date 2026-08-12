#!/usr/bin/env python3
import json, re, sys
from snapshot_loader import load_snapshot
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = load_snapshot()
REPORT = json.loads((ROOT / 'docs/LEGACY_DATA_EXTRACTION_REPORT.json').read_text(encoding='utf-8'))

mapping = {
    'SystemUser': 'users',
    'FormName': 'formNames',
    'FormSecurity': 'formSecurity',
    'AdCollegeUserAssign': 'collegeUserAssign',
    'AdTerm': 'terms',
    'AdCollege': 'colleges',
    'AdSection': 'sections',
    'AdInstructor': 'instructors',
    'AdCourse': 'courses',
    'FSchedule': 'schedules',
    'AdRoom': 'rooms',
}

errors=[]
for legacy, new in mapping.items():
    expected = int(REPORT['userTables'][legacy]['decodedRows'])
    actual = len(DB.get(new, []))
    if actual != expected:
        errors.append(f'{legacy}/{new}: expected {expected}, got {actual}')

# Core FK parity after transform. Historical orphan permission/scope rows are deliberately preserved and reported, not removed.
college_ids={x['AdCollegeId'] for x in DB['colleges']}
section_ids={x['AdSectionId'] for x in DB['sections']}
course_ids={x['AdCourseId'] for x in DB['courses']}
instructor_ids={x['AdInstructorId'] for x in DB['instructors']}
term_ids={x['AdTermId'] for x in DB['terms']}
user_ids={x['SystemUserId'] for x in DB['users']}
form_ids={x['FormNameId'] for x in DB['formNames']}

checks = [
    ('sections->colleges', [x for x in DB['sections'] if x['AdCollegeId'] not in college_ids]),
    ('courses->sections', [x for x in DB['courses'] if x['AdSectionId'] not in section_ids]),
    ('schedules->courses', [x for x in DB['schedules'] if x['AdCourseId'] not in course_ids]),
    ('schedules->instructors', [x for x in DB['schedules'] if x['AdInstructorId'] not in instructor_ids]),
    ('schedules->terms', [x for x in DB['schedules'] if x['AdTermId'] not in term_ids]),
]
for name,bad in checks:
    if bad: errors.append(f'{name}: {len(bad)} broken rows')

# Passwords must all be salted scrypt; no legacy plaintext is persisted in db.json.
for u in DB['users']:
    val=str(u.get('SystemUserPass',''))
    if not re.fullmatch(r'scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}', val):
        errors.append(f"user {u.get('SystemUserId')} password is not a salted scrypt hash")

# Admin legacy identity must be preserved exactly (password hash itself is intentionally modernized).
admin=next((u for u in DB['users'] if u.get('SystemUserId')==1),None)
if not admin or admin.get('SystemUserLogin')!='admin' or admin.get('Name')!='د. أحمد الفيلكاوي':
    errors.append('legacy primary admin identity was not preserved')
if admin and (not admin.get('IsAdminUser') or not admin.get('IsActive') or admin.get('IsLocked') or admin.get('IsDeleted')):
    errors.append('legacy primary admin status flags are incorrect')

# Legacy civil ID rule. Existing blank generic faculty record is preserved because exact data parity takes priority.
weights=[2,1,6,3,7,9,10,5,8,4,2]
def civil_ok(v):
    s=str(v or '')
    if not re.fullmatch(r'[0-9]{12}',s): return False
    return (11-(sum(int(s[i])*weights[i] for i in range(11))%11)) == int(s[11])
invalid=[x for x in DB['instructors'] if x.get('AdInstructorCivil') and not civil_ok(x.get('AdInstructorCivil'))]
if invalid: errors.append(f'nonblank legacy civil IDs failing checksum: {len(invalid)}')
blank=[x for x in DB['instructors'] if not x.get('AdInstructorCivil')]
if len(blank)!=1:
    errors.append(f'expected exactly one preserved blank legacy civil ID, found {len(blank)}')

# All schedule section codes in this legacy snapshot are English digits.
non_numeric_scodes=[x for x in DB['schedules'] if not re.fullmatch(r'[0-9]+',str(x.get('SCode','')))]
if non_numeric_scodes: errors.append(f'non-numeric SCode rows: {len(non_numeric_scodes)}')

# Historical orphan permission/scope rows: preserve but make them inert by server-side joins/authorization.
orphan_perms=[x for x in DB['formSecurity'] if x['SystemUserId'] not in user_ids or x['FormNameId'] not in form_ids]
orphan_scopes=[x for x in DB['collegeUserAssign'] if x['SystemUserId'] not in user_ids or x['AdCollegeId'] not in college_ids or x['AdSectionId'] not in section_ids]

summary={
    'verifiedCounts': {new: len(DB[new]) for new in mapping.values()},
    'blankLegacyCivilIdsPreserved': len(blank),
    'orphanLegacyPermissionsPreserved': len(orphan_perms),
    'orphanLegacyScopesPreserved': len(orphan_scopes),
    'duplicateLegacyCivilValuesPreserved': sum(1 for v in Counter(str(x.get('AdInstructorCivil','')) for x in DB['instructors'] if x.get('AdInstructorCivil')).values() if v>1),
}
print(json.dumps(summary, ensure_ascii=False, indent=2))
if errors:
    print('\nFAIL:')
    for e in errors: print('-',e)
    sys.exit(1)
print('\nPASS: real legacy snapshot integrity checks passed.')
