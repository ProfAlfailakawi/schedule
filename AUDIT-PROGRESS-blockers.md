# AUDIT PROGRESS — stream `blockers`

| id | status | test |
|----|--------|------|
| B1 | FIXED | tests/blocker-oracle-audit.ts (test:blocker-oracle) |
| B2 | FIXED | tests/blockers-stream-audit.ts (B2 checks) — Reports.tsx rendering of scopeLabel belongs to the dean stream |
| B3 | TODO | |
| B4 | TODO | |
| B5 | TODO | |
| B6 | TODO | |
| B7 | TODO | |
| B8 | TODO | |
| B9 | TODO | |
| B10 | TODO | |
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
