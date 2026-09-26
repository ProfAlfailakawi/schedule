# AUDIT-PROGRESS — sticky scope (one shared college/department/term)

Owner request: a college/department/term picked on any screen stays picked on every other screen until changed.

| Item | Status | Covered by |
|---|---|---|
| One store `src/utils/sharedScope.ts` (per-user safeStorage key, in-memory subscribe/notify, cross-tab `storage` event, `useSharedScope` hook) | FIXED | tests/shared-scope-audit.ts P/W/N |
| Read validated against the reader's scope (coerceScopeValues, singleDepartmentOf, admin catalogue, stale term → screen default) | FIXED | shared-scope-audit R |
| Writes only on an active pick; screen fallbacks never overwrite the shared value | FIXED | shared-scope-audit R (last check), S (`.pick(` per screen) |
| Notification focus is an explicit target and updates the shared scope (takeNotifyFocus) | FIXED | shared-scope-audit F |
| الجدول الدراسي (Schedules) — hydrate from store, diff-write on change, follow external changes; prefs keep view/colour only | FIXED | shared-scope-audit S |
| الاستعلامات (Reports) — scope removed from `schedule-unified-prefs`, lens/filters kept | FIXED | shared-scope-audit S, location-registry-audit 208 |
| تغييرات الجدول (ScheduleChanges) — term + inbox college/section | FIXED | shared-scope-audit S |
| كشف التسجيل / طلبات الأساتذة — store + single focus reader (the inbox used to consume other screens' focus) | FIXED | shared-scope-audit S, student-registration-audit |
| مركز الذكاء (IntelligenceWorkspace) — store; guide simulation still wins temporarily without writing | FIXED | shared-scope-audit S |
| Warm start (App.scheduleScopeQuery) reads the same store | FIXED | shared-scope-audit S |
| Live demo run (admin + committee chair) | VERIFIED | manual, isolated demo on port 3117 |
