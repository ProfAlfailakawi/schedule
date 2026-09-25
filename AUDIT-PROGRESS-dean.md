# AUDIT-PROGRESS — stream dean

Test file: `tests/dean-notify-audit.ts` (`npm run test:dean-notify`).

| id | status | covered by |
|----|--------|-----------|
| N9 | FIXED — resolveSmartContext enforces scope via src/server/readScope.ts (resolveSmartScope, one judge = isScopeAllowed); /api/search/natural 403s out-of-scope, reads rows via readSchedulesForRequest; /api/search reads via readScopedTermRows (final-only for deans) | dean-notify-audit §N9 |
| N8 | PARTIAL — helper expandScopeSections + readScopedTermRows added; /api/search + resolveSmartContext use it; dashboard/instructors pending | dean-notify-audit §N8 |
