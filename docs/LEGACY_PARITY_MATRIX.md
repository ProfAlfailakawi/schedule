# Legacy Parity Matrix

| Legacy area | Legacy workflow/source | New implementation | Verification status |
|---|---|---|---|
| Login | `SystemUser` + active/locked/deleted + original credentials | `/api/auth/*`, `Login.tsx` | All 29 real users migrated; `admin / a7424400` verified; old AI demo password rejected |
| Home | 4 metrics + latest-term/day table with old admin/scoped quirks | `/api/dashboard`, `Dashboard.tsx` | Old DayOfWeek/default-Sunday behavior and dashboard totals preserved |
| AdTerm | Index → Create/Edit → موافق/تراجع → Delete | `Terms.tsx` | Implemented and parity-audited |
| AdCollege | Index → Create/Edit → موافق/تراجع → Delete | `Colleges.tsx` | FK delete guard preserved |
| AdSection | College-dependent CRUD | `Sections.tsx` | FK delete guard + historical delete confirmation text preserved |
| AdInstructor | Civil checksum + duplicate check + CRUD | `Instructors.tsx`, server validation | Exact checksum; server-side validation; real duplicates/blank historical rows retained |
| AdCourse | College → Section, duplicate code, CRUD | `Courses.tsx` | Course→Section relational semantics preserved; SQL-like FK protection to FSchedule on delete |
| FSchedule | Filtered Index → Create/Edit → Delete | `Schedules.tsx` | Fields, filters, workflow and numeric `fdetail` 1..5 encoding matched |
| FSchedule relational navigation | Schedule gets Course→Section→College/current CourseName through SQL navigation properties | repository hydration | Firestore convenience fields cannot drift from current relationships on reads |
| CopySchedule | `SystemUserId == 1`; section+term target must be empty | `Schedules.tsx`, `/api/schedules/copy`, repository | Whole-source copy and target-exists rejection matched; server authorization enforced |
| Instructor search/report | Instructor + Civil + Term | `Reports.tsx` | Filter semantics matched |
| Room search/report | College/Section/Term/Building/Hall | `Reports.tsx` | Contains/filter semantics matched |
| Time search/report | Legacy endpoint-overlap predicate | `Reports.tsx` | Predicate matched |
| Room + Time | Combined room/time filters | `Reports.tsx` | Predicate matched |
| Advanced search | Combined filters + weekday OR + deployed inert/duplicate field quirks | `Reports.tsx` | Active-view quirks preserved rather than “cleaned up” |
| Department report | College/Section/Term + active Legacy actions | `Reports.tsx` | Actions matched |
| Excel | Only active Legacy Excel actions | `/api/reports/excel/*` | Real XLSX generation; commented old actions not invented |
| SystemUser | Search + Index/Create/Edit/Delete; old list/edit exposes password value | `AdminUsers.tsx`, password hash + AES-GCM compatibility vault | Original workflow restored without plaintext-at-rest storage; API protected by permission 11 |
| FormSecurity | Per-record Index/Create/Edit/Delete | `AdminUsers.tsx` | 219 real rows + 28 historical orphan rows preserved |
| AdCollegeUserAssign | User filter + per-record Create/Delete | `AdminUsers.tsx` | 189 real rows + duplicate/orphan history preserved |
| Permission navigation | `FormSecurity` controls visible areas; admin flag does not grant screens | `App.tsx` + server permission gates | Server + UI gates matched |
| Academic data scope | Admin bypasses academic scope only where Legacy does; normal users use `AdCollegeUserAssign` | server/repository | Real scopes migrated and enforced |
| About | Original two people/cards side-by-side, including narrow mobile | `About.tsx`, CSS | Implemented; no AI-generated people used |
| Copyright | Old wording + year | App/Login | Same wording, year made dynamic as explicitly requested |
| Firestore migration | Stable Legacy IDs, active rows, raw/historical archive, counters | repository/import scripts | Complete local real snapshot verified; actual cloud write pending Firebase connection |

## Verified real Legacy snapshot

`29 users / 18 forms / 219 permissions / 189 scopes / 31 terms / 13 colleges / 87 sections / 743 instructors / 1,404 courses / 15,430 schedule rows / 1 room`.

All 15,430 active schedule rows were checked against the Legacy numeric weekday encoding stored in `fdetail`; no mismatch was found in the migrated snapshot.
