# AUDIT PROGRESS — doctor stream

| ID | Status | Covered by |
|----|--------|------------|
| D1 | FIXED — calendar key: env CALENDAR_SECRET wins, else HMAC("calendar-feed-key-v1") of the Firestore-shared secret (src/server/calendarSecret.ts), lazy awaited resolver, demo cache separated, legacy bridge only for configured env | tests/doctor-journey-audit.ts D1 |
| D2 | FIXED — staff links live to term end (termLinkExpiresAt in src/utils/shareLinkLifetime.ts, fallback +150d), requestsCloseAt stored separately, /issue uses same close format, card/publish wording truthful | tests/doctor-journey-audit.ts D2 |
| D3 | FIXED — department alternatives render read-only after close; request links issued to term end and old personal links (staff/request) readable until their term ends (personalLinkReadable); "alternative-chosen" timeline event recorded (chosenAlternativeIndex in src/utils/requestAlternatives.ts); writing still gated by request window | tests/doctor-journey-audit.ts D3 |
| D4 | FIXED — normalizeCivilId/sameCivilId in src/utils/civilId.ts used by staff card, card note, request signing, both imports, delegate routes, instructor create/update. Student survey routes (asciiDigits+\\D, same result) left to the student stream (DO NOT TOUCH) | tests/doctor-journey-audit.ts D4, tests/request-signature-audit.ts |
| D5 | FIXED — termPhase() in termSequence.ts (past only if termHasEnded); card shows «فصل قادم», keeps calendar; ics feed serves a pinned upcoming term (?term=) | tests/doctor-journey-audit.ts D5 |
| D6 | FIXED — src/server/publicAttemptLimiter.ts (blocked/fail, env PUBLIC_ATTEMPT_MAX_FAILURES / PUBLIC_ATTEMPT_WINDOW_MINUTES); staff card, card note and request signing count only failures. Survey routes still use legacy consume() via staffLookupAllowed (student stream owns them) | tests/doctor-journey-audit.ts D6 |
| D7 | FIXED — calendarSpanForTerm (icalendar.ts) uses termWindow start/end (declared or from term name); endDate→UNTIL; "today" anchor only when term unknown; honest feed label | tests/doctor-journey-audit.ts D7 |
| D8 | FIXED — movementHistoryScopes adds request departments + issuing department to scheduleMovementEntries (option historyScopes; version loading untouched); card opens empty with movement when he lost all rows in the link term, generic 404 otherwise | tests/doctor-journey-audit.ts D8 (structural) |
| D9 | FIXED — coverConflict() in src/utils/coverAvailability.ts (weekly rows not cancelled that date + existing covers that date); exception POST returns 409 cover-busy/cover-double-booked; substitutes ranking excludes via same rule | tests/doctor-journey-audit.ts D9 |
| D10 | TODO | |
| D11 | TODO | |
| D12 | TODO | |
| D13 | TODO | |
| D14 | TODO | |
| D15 | FIXED — roleGuard allows `/public/` prefix for authenticated read-only roles (token governs) | tests/role-guard-audit.ts (public section) |
| D16 | TODO | |
| D17 | TODO | |
