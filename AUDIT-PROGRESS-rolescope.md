# Role-scope audit progress (stream: rolescope)

| Id | Status | Test |
|----|--------|------|
| A  deadlines panel gated by role (inboxAudience) | FIXED | tests/role-scope-audit.ts §A |
| B  multi-site single department inbox («قسمك في N موقعاً») | FIXED | tests/role-scope-audit.ts §B |
| C  per-role server/client visibility audit | FIXED (server leaks found by live audit + inventory) | tests/role-scope-audit.ts §C, §C-college, §C-inventory; scripts/role-scope-live-audit.mjs |
| D  hide-empty sweep (main offenders) | FIXED | tests/role-scope-audit.ts §D |

## Live audit (scripts/role-scope-live-audit.mjs, isolated demo, 10 roles × ~150 probes)
Final run: LEAK cells 0. Fixed along the way (server first):
- GET /api/degree-rules returned every department's rules → filterByScope; PUT now scope-checked.
- GET /api/instructor-affiliations and /api/instructors/:id/affiliation mapped the whole university → scope-filtered.
- GET /api/delegates returned every delegate id → scope directories only.
- GET /api/instructors sent every employee's civil id + mobile to department accounts → full values only for the department circle (taught in scope any term, or in its directory); others get the last 4 digits and no phone.
- GET /api/reports/schedule-changes let deans read draft diffs → accepted schedules only.
- GET /api/reports/department-balance counted drafts for deans → finalRowsOnly.
- College-only reads (sectionId=0 means «has something in this college»): export course catalogue, outside-clashes, staff-inbox, department-start-rhythm, settled-drift → filtered to the reader's own departments; caches keyed by reader.
- rooms/owner, courses/nature, intelligence/lookups → the one scope rule.
By design (not leaks): course-conflict student cases carry the other course read-only; shared-room owner names in the location registry; clash lines name the other department + day + hour (settled disclosure rule); /api/journey public aggregates; instructor catalogue names are university-wide.
