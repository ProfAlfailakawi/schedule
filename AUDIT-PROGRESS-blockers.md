# AUDIT PROGRESS — stream `blockers`

| id | status | test |
|----|--------|------|
| B1 | FIXED | tests/blocker-oracle-audit.ts (test:blocker-oracle) |
| B2 | FIXED | tests/blockers-stream-audit.ts (B2 checks) — Reports.tsx rendering of scopeLabel belongs to the dean stream |
| B3 | FIXED | tests/blockers-stream-audit.ts (B3) + oracle behaviour in blocker-oracle-audit |
| B4 | FIXED | tests/blockers-stream-audit.ts (B4) |
| B5 | FIXED | tests/blockers-stream-audit.ts (B5) |
| B6 | FIXED | tests/blockers-stream-audit.ts (B6) |
| B7 | FIXED | tests/blockers-stream-audit.ts (B7); guide-audit green |
| B8 | FIXED | tests/blockers-stream-audit.ts (B8) |
| B9 | FIXED | tests/blockers-stream-audit.ts (B9) — base = draft creation / state right after the versioned change; branch sites of a multi-site PDF publish are not base-checked (only the draft scope) |
| B10 | FIXED | tests/blockers-stream-audit.ts (B10) — measured via replacementLoss + isWholesaleChange(bulk-delete); genesis drafts count as copy-term |
| B11 | TODO | |
| B12 | TODO | |
| B13 | TODO | |
| B14 | TODO | |
| B15 | TODO | |

## Notes
- B1: one module `src/utils/scheduleBlockers.ts` (blockingConflicts / approvalBlockerCount / approvalBlockers /
  blockingConflictDetails wrapper; re-exports isBlockingConflict + placeholderInstructorIds). Predicate lives in
  scheduleIntelligence.isBlockingConflict (lowest layer, avoids an import cycle); placeholder rule in
  instructorIdentity.placeholderInstructorIds. Server passes `approvalBlockerOptions()` (placeholders + the save
  gate's hall canonicalisation) at every count/list site. analyzeSchedule/fastConflictScan exempt placeholders.
