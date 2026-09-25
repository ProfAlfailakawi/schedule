# AUDIT-PROGRESS — single-department scope (stream: singledept)

Owner request: a single-department account sees only «الكلية + الفصل» on every screen, as on the board.

| id | item | status | test |
|----|------|--------|------|
| SD1 | One helper `singleDepartmentOf(scopes, collegeId, isAdmin)` in src/utils/scopeContext.ts; college-wide rows (section 0 / `AdCollegeWide`) never single; `lockSection` copy removed | FIXED | tests/single-department-scope-audit.ts S1 |
| SD2 | Server marks rows expanded from a college-wide scope with `AdCollegeWide: true` (display only; guard unchanged) | FIXED | S2 |
| SD3 | Board (filter, add form, copy), queries & reports, intelligence context bar route through the helper | FIXED | S4 |
| SD4 | كشف التسجيل + طلبات الأساتذة hide the department picker and keep the sole department in state | FIXED | S4 |
| SD5 | تغييرات الجدول opens the single department's report by the helper; inbox department picker guarded | FIXED | S4 |
| SD6 | Filter row closes the gap (`.query-scope[data-count="2"]`) | FIXED | S4 |
| SD7 | Demo: committee chair + department head single; dean keeps picker | FIXED | S3 + live demo run |
