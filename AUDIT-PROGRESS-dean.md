# AUDIT-PROGRESS — stream dean

Test file: `tests/dean-notify-audit.ts` (`npm run test:dean-notify`).

| id | status | covered by |
|----|--------|-----------|
| N9 | FIXED — resolveSmartContext enforces scope via src/server/readScope.ts (resolveSmartScope, one judge = isScopeAllowed); /api/search/natural 403s out-of-scope, reads rows via readSchedulesForRequest; /api/search reads via readScopedTermRows (final-only for deans) | dean-notify-audit §N9 |
| N8 | (see FIXED row below) |
| N1 | FIXED — finalSourceFor (src/utils/finality.ts) is the one rule; ended term (AdTermClosed or termHasEnded) shows no-record/never-accepted depts live as "historical"; /api/schedules exposes X-Schedule-Finality; Reports shows «جدول نُفّذ (قبل دورة الاعتماد)» note + per-row chip | dean-notify-audit §N1 |
| N2 | FIXED — ROLE_LENSES dean/viceDean start with balance; initialLensFor(); one-shot switch list→balance when the first read returns zero accepted rows | dean-notify-audit §N2 |
| N11 | FIXED — initialLensFor maps "time" to "matrix" for roles lacking it; saved lenses the role lacks are ignored | dean-notify-audit §N2/N11 |
| N15 | FIXED — routeFor(role, kind) in src/utils/notificationCenter.ts is the only place a view is chosen; head & registrar → scheduleChanges; committee "returned" → scheduleChanges; instructor-request items only for form-7 roles | dean-notify-audit §N15 |
| N8 | FIXED — expandScopeSections (src/server/readScope.ts) + scopeSectionIdsFor/readScopedTermRows; used by /api/dashboard (+final-only for deans), /api/search, resolveSmartContext, /api/instructors?sectionId | dean-notify-audit §N8 |
| N13 | FIXED — instructorsForReader() strips AdInstructorCivil/AdInstructorMobile for read-only roles on every /api/instructors answer and in /api/search | dean-notify-audit §N13 |
| N3 | FIXED — src/utils/lateness.ts isLate() is the one rule (extension > term deadline; handed-over never late; not-started IS late); /api/approvals/term returns notStarted sections in scope + late per row; BalancePanel merges them (mergeBalanceDepartments) with «لم يبدأ»; notificationCenter uses isLate | dean-notify-audit §N3 |
| N4 | FIXED — balance approvals fetched for all colleges in scope (no collegeId); deadline + days left per dept via countOf(AR.day); multi-college dean with no college gets «اختر الكلية» | dean-notify-audit §N4 |
| N5 | FIXED — header uses totals.scopeLabel fallback «في نطاقك», countOf for departments/appointments/blockers, rooms «N (موثّقة M)» when verifiedRooms present, note «يشمل الجداول قيد الإعداد» | dean-notify-audit §N5 |
| N21 | FIXED — registrar «not submitted» alert uses isLate with each dept's extension; bell counts all in-scope depts for registrar/dean watchers | dean-notify-audit §N3/N21 |
| N6 | FIXED — lens fairness uses buildFairnessEngine (same as balance); engine excludes «هيئة تدريسية» via shared src/utils/placeholderInstructor.ts (server placeholderInstructorIds delegates) and rows without instructor; «متوسط النصاب (ساعات معتمدة)» via weeklyLoadOf, screen + print | dean-notify-audit §N6 |
| N7 | FIXED — /api/reports/visiting-roster and /visiting-history accept college level for readers covering the whole college (wholeCollegeSectionIds → coversWholeCollege); history keeps people no longer in the directory (listedNow flag, shown «لم يعد في دليل القسم»); weekly hours per visitor; «كل الفصول» reachable for dean/viceDean | dean-notify-audit §N7 |
| N10 | FIXED — /api/reports/room-load allows sectionId=0 when the reader covers the whole college; dean rows final-only | dean-notify-audit §N10 |
| N12 | FIXED — /api/reports/excel reads via readSchedulesForRequest (scope + final-only for deans; civil column redacted for readers); «تصدير Excel» action in the report canvas with the screen's filters (data-guide-ignore) | dean-notify-audit §N12 |
| N14 | FIXED — balance print button available whenever the balance is loaded (even with zero accepted rows); print includes approval + deadline columns, not-started departments, title «نشرة المجلس — ميزان الأقسام» with term and issue date | dean-notify-audit §N14 |
| N16 | FIXED — src/utils/notifyFocus.ts (write/take, view-matched, 5-min TTL, one-shot); ScheduleChanges opens the focused department (switching term if the item carries one); Reports sets scope from focus, opens balance for dean readers and highlights the row; also fixed the mode effect that overwrote the initial lens on mount | dean-notify-audit §N16 |
| N17 | FIXED — /api/approvals/badge: head counts approvals in "committee" (awaiting his signature) + pending additions + open registrar notes | dean-notify-audit §N17 |
| N19 | FIXED — open registrar notes counted in any status (badge + bell); notificationCenter emits «ملاحظات التسجيل على جدول …» action (routeFor "notes" → scheduleChanges) outside "returned" | dean-notify-audit §N19 |
| N18 | FIXED — planningTermCandidates/planningTermId in termSequence.ts; /api/notifications and /api/approvals/badge cover current + planning term (bellPlanningTermId), planning items carry termId/termName, prefixed detail and namespaced ids; explicit termId answers one term | dean-notify-audit §N18 |
| N20 | FIXED — deans get alert items: dept late (isLate), returned idle >3 days, accepted dept with blockers (server supplies blockingConflicts for accepted scopes); each routes to reportDepartment with the dept focus → balance highlighted | dean-notify-audit §N20 |
| N22 | FIXED — ids keyed by scope+state: final-summary:{all|partial}, not-submitted:{late|open}, additions, request:{id}:{at}, students-*-{state|latestApprovedAt}; no counts in any id | dean-notify-audit §N22 |
| N23 | FIXED — «أرجع…» says pending additions await the head before resubmission; committee tone waiting, head tone action in that case | dean-notify-audit §N23 |
| N24 | FIXED — server counts open registrar notes with insistCount>=3 or escalatedAt (read defensively) → head action item «التسجيل يُصرّ…» → scheduleChanges | dean-notify-audit §N24 |
| N25 | FIXED — pendingExtensionRequest() reads approval.extensionRequest defensively; registrarHead action item routed to scheduleChanges with dept focus | dean-notify-audit §N25 |
| N26 | FIXED — onboardingScenesFor(role): committee/admin keep the 6-scene stage; head, registrarHead (+deadline), registrarStaff, dean/registrarDean, viceDean (+lenses) get their own step lists (read as list; stage not shown); seen key onboardingSeenKey(userId, role) = schedule-onboarding-v5-${userId}-${role}, effect re-runs on role change | dean-notify-audit §N26 |
