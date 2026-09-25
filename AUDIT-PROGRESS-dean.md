# AUDIT-PROGRESS — stream dean

Test file: `tests/dean-notify-audit.ts` (`npm run test:dean-notify`).

| id | status | covered by |
|----|--------|-----------|
| N9 | FIXED — resolveSmartContext enforces scope via src/server/readScope.ts (resolveSmartScope, one judge = isScopeAllowed); /api/search/natural 403s out-of-scope, reads rows via readSchedulesForRequest; /api/search reads via readScopedTermRows (final-only for deans) | dean-notify-audit §N9 |
| N8 | PARTIAL — helper expandScopeSections + readScopedTermRows added; /api/search + resolveSmartContext use it; dashboard/instructors pending | dean-notify-audit §N8 |
| N1 | FIXED — finalSourceFor (src/utils/finality.ts) is the one rule; ended term (AdTermClosed or termHasEnded) shows no-record/never-accepted depts live as "historical"; /api/schedules exposes X-Schedule-Finality; Reports shows «جدول نُفّذ (قبل دورة الاعتماد)» note + per-row chip | dean-notify-audit §N1 |
| N2 | FIXED — ROLE_LENSES dean/viceDean start with balance; initialLensFor(); one-shot switch list→balance when the first read returns zero accepted rows | dean-notify-audit §N2 |
| N11 | FIXED — initialLensFor maps "time" to "matrix" for roles lacking it; saved lenses the role lacks are ignored | dean-notify-audit §N2/N11 |
