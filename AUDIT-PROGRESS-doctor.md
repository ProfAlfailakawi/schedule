# AUDIT PROGRESS — doctor stream

| ID | Status | Covered by |
|----|--------|------------|
| D1 | FIXED — calendar key: env CALENDAR_SECRET wins, else HMAC("calendar-feed-key-v1") of the Firestore-shared secret (src/server/calendarSecret.ts), lazy awaited resolver, demo cache separated, legacy bridge only for configured env | tests/doctor-journey-audit.ts D1 |
| D2 | FIXED — staff links live to term end (termLinkExpiresAt in src/utils/shareLinkLifetime.ts, fallback +150d), requestsCloseAt stored separately, /issue uses same close format, card/publish wording truthful | tests/doctor-journey-audit.ts D2 |
| D3 | TODO | |
| D4 | FIXED — normalizeCivilId/sameCivilId in src/utils/civilId.ts used by staff card, card note, request signing, both imports, delegate routes, instructor create/update. Student survey routes (asciiDigits+\\D, same result) left to the student stream (DO NOT TOUCH) | tests/doctor-journey-audit.ts D4, tests/request-signature-audit.ts |
| D5 | FIXED — termPhase() in termSequence.ts (past only if termHasEnded); card shows «فصل قادم», keeps calendar; ics feed serves a pinned upcoming term (?term=) | tests/doctor-journey-audit.ts D5 |
| D6 | TODO | |
| D7 | FIXED — calendarSpanForTerm (icalendar.ts) uses termWindow start/end (declared or from term name); endDate→UNTIL; "today" anchor only when term unknown; honest feed label | tests/doctor-journey-audit.ts D7 |
| D8 | TODO | |
| D9 | TODO | |
| D10 | TODO | |
| D11 | TODO | |
| D12 | TODO | |
| D13 | TODO | |
| D14 | TODO | |
| D15 | FIXED — roleGuard allows `/public/` prefix for authenticated read-only roles (token governs) | tests/role-guard-audit.ts (public section) |
| D16 | TODO | |
| D17 | TODO | |
