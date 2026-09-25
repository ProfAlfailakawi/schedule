# Live-demo term rehearsal — progress (stream: rehearsal)

Full academic-term rehearsal performed in the live public demo on 2026-09-25,
every role, through the same APIs the screens call. Test file: `tests/rehearsal-audit.ts`
(`npm run test:rehearsal`).

| Id | Defect found in the rehearsal | Status | Covered by |
|----|--------------------------------|--------|------------|
| R1 | Pending additions outlive the head's withdrawn/returned signature: head told «أُضيفت بعد اعتمادك» with no approval, committee badge counts additions it cannot act on, returned bell says «إقرار» instead of «اعتماد» | FIXED | rehearsal-audit R1 |
| R2 | Head-return reaches the committee bell as a plain «وقّع جدول…»: neither the return nor its reason is said | FIXED | rehearsal-audit R2 |
| R3 | Dean / vice-dean bell summary printed raw digits: «المعتمد 1 من جدولين», «بقي 1 لم يعتمده التسجيل بعد» | FIXED | rehearsal-audit R3, notification-center-audit |
| R4 | Extension request accepted on an accepted (or submitted) schedule, 13 days before the deadline, and over a pending request — the button rule lived only in the bar; registrar bell line omitted the requested days | FIXED | rehearsal-audit R4 |
| R5 | `/api/approvals/term` labelled a department with written appointments but no approval record «لم يبدأ» (dean balance showed «لم يبدأ» beside 6 appointments) while the inbox and the bar said «قيد الإعداد» | FIXED | rehearsal-audit R5, dean-notify-audit N3 |
| R6 | Rejecting an instructor request item that the checker judged «متاح» (e.g. for a cohort reason) offered no alternatives: nearest free times were computed only for blocked items, so the reject sheet had nothing to offer | FIXED | rehearsal-audit R6 |
| R7 | Instructor movement history stamped each change with the NEXT snapshot (time of a later edit, or «now» with label «الجدول الحالي») and its «قبل …» label, and named only the first lecture day | FIXED | rehearsal-audit R7 |
| R8 | A demo sandbox lost mid-session (a deploy restarted the server during the rehearsal) answered every call «الرجاء تسجيل الدخول أولاً» — a login prompt for a visitor with no account | FIXED | rehearsal-audit R8 |
| R9 | Department head bell showed the committee's registration-sheet queue as an action for him («ينتظر قرار اللجنة», tone action) though the sheet is read-only for his role | FIXED | rehearsal-audit R9 |

## Observed, not changed (policy or out of reach)

- The committee cannot save its department's degree rule: `PUT /api/degree-rules/:id` needs form 4, which is admin-only (403 «هذه الشاشة مخصصة لإدارة النظام الرئيسية»). Role policy for the owner to decide.
- The demo's instructor-request reject sheet can never offer alternatives: the department start ladder is learned from history (`learnRhythm`, min 8 lectures) and the demo departments have 7–8 rows, so `nearestFree` returns nothing. The rule is intentional («بلا سُلّمٍ معروفٍ للقسم لا يُقترح شيء»). R6 matters in production data.
- A course-conflict case that includes another department's course cannot be finished in the demo: that course is decided by the other department's committee, and the demo has one committee account (CS only).
- Graduate proof by OCR not exercised (no synthetic graduation sheet exists; real sheets must not be used). Only the verified-proof reuse path (`proof-status`) was used.
- `GET /api/schedule-notes` `open` counts department notes too (3 against the bar's 2 registrar notes). No screen reads that endpoint.
- The demo sandbox lives in memory. A deploy during the rehearsal (build 20260925174951) wiped it. R8 fixes only the wording of what the visitor sees.
