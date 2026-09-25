# Demo-complete stream — progress

Base: origin/main (b14886b). Test: `npm run test:demo-complete` (tests/demo-complete-audit.ts).

| Id | Status | Covered by |
|----|--------|------------|
| P1 process caches keyed by data context (registry, mobility, hall barter, rhythm, drift, historical time, living, survey payload, bell memos); demo registry never merged with the university seed; notify pulses from a sandbox stay in that sandbox | FIXED | demo-complete-audit §P1 (structural + behavioural) |
| P2 demo sandbox registry (4 synthetic 9xx buildings, 13 department halls + a shared lab), every seeded row linked (buildingId/roomId/official codes/VERIFIED) and spread over its department's halls; CS (the committee's stage) now seeded as returned-with-notes so the committee can edit, DS carries the at-registrar round-2 story | FIXED — live: committee PUT 200, move-batch 200, add 201; /api/location-registry lists the demo buildings | demo-complete-audit §P2; demo-roles; blockers-stream B15 |
| P3 link tokens created in a sandbox carry a `demo.` prefix (never valid base64url); /s /q /r /m and /api/public/* bind to the sandbox that owns the token (same browser or a phone's calendar), a demo token is never looked up in real data, a real token always resolves in real data even with a demo cookie; a demo session has no identity outside its sandbox (authCache used to serve the demo admin identity to an expired sandbox's requests); the process-wide student-case secret is always read outside the sandbox (a demo visitor used to be able to pin the sandbox key for real students) | FIXED — live: /q /s /m /api/public/survey and ICS 200 in demo, unknown demo token 404 | demo-complete-audit §P3 |
| P4 seeded stories per role | TODO | |
| P5 live HTTP walkthrough of every role | TODO | |
