# AUDIT PROGRESS — adversarial review of 1eb47e4..HEAD

| id | status | covering test |
|----|--------|---------------|
| 1 | FIXED | tests/doctor-journey-audit.ts D6 (reserve concurrency + structural) |
| 2 | FIXED | tests/student-journey-audit.ts «R2» (memo/coalescer behaviour + structural wiring + NotificationCenter pageAwake) |
| 3 | FIXED | tests/student-journey-audit.ts «R3» (chooseStudentCaseSecret + structural, legacy bridge kept) |
| 4 | FIXED | tests/dean-notify-audit.ts «R4» (structural; memo semantics tested in R2) |
| 5 | FIXED | tests/relay-fixes-audit.ts «R5-review» (behavioural retry on demo repo + structural) |
| 6 | FIXED | tests/relay-fixes-audit.ts «R6-review» (marker behaviour on demo repo + structural settle points); client not yet reading X-Approval-Amendment header |
| 7 | FIXED | tests/relay-fixes-audit.ts «R7-review»; tests/blockers-stream-audit.ts B9 updated |
