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
