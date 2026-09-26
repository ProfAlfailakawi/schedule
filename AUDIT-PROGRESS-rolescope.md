# Role-scope audit progress (stream: rolescope)

| Id | Status | Test |
|----|--------|------|
| A  deadlines panel gated by role (inboxAudience) | FIXED | tests/role-scope-audit.ts §A |
| B  multi-site single department inbox («قسمك في N موقعاً») | FIXED | tests/role-scope-audit.ts §B |
| C  per-role server/client visibility audit | FIXED (server leaks found by live audit + inventory) | tests/role-scope-audit.ts §C, §C-college, §C-inventory; scripts/role-scope-live-audit.mjs |
| D  hide-empty sweep (main offenders) | FIXED | tests/role-scope-audit.ts §D |
