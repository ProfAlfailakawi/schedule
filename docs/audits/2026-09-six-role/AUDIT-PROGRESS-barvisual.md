# Approval bar visual redesign — progress

| Item | Status | Covered by |
|---|---|---|
| Relay stepper (committee → head → registrar → accepted), turn pulse, return arc, round badge | FIXED | visual shots; tests/approval-bar-visual-audit.ts |
| Signature stamps with name/date/verify code in tooltip | FIXED | approval-bar-visual-audit (رمز التحقق) |
| Deadline ring (ok/near/past), exception / request / rejection badge | FIXED | approval-bar-visual-audit |
| Notes / escalation / additions / blocked badges with counts (countOf in tooltips) | FIXED | approval-bar-visual-audit |
| Icon-only secondary actions (withdraw, history, head-return, extension), primary with short word | FIXED | guide-audit; report-approval, relay-fixes audits |
| Owner rule: nothing without data renders; empty drafting bar hidden; details toggle only when non-empty | FIXED | approval-bar-visual-audit (approvalBarPresence) |
| Dark / phone / reduced motion / focus rings | FIXED | shots + CSS assertions |
| Registrar view | N/A | registrar roles never mount ApprovalBar (ScheduleChanges gates it with !isRegistrar; registrarHead has no schedule workspace) |
