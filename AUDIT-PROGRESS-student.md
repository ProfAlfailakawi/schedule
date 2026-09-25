# AUDIT PROGRESS — student stream (fix/student)

| id | status | covered by |
|----|--------|------------|
| S1 | FIXED — real portal screenshot replaced by generated synthetic example (scripts/make-graduation-sheet-example.mjs); real civil ID/name replaced with synthetic 300010100122 / «طالب تجريبي» in server.ts, documentOcr.ts, pdf-import-regression.ts. NOTE: the old image and values remain in git history / the public GitHub repo — owner must purge history (not done here: never push). | tests/student-journey-audit.ts §S1 (EXIF-free generated asset + repo-wide checksum-valid civil-ID guard) |
| S2 | FIXED — StudentNeed.caseState {committee, registrar} (src/utils/studentCaseDecision.ts = the one ordering rule), Repository.setStudentCaseDecision (transaction, both paths), POST /api/student-registration/:id/case-state (same guards/reason lists, «سطرٌ للطالب»), sheet shows graduate rows with verification facts + committee→registrar buttons, my-case/m/ show request type + case decision | tests/student-journey-audit.ts §S2 |
| S3 | FIXED — resolveSurveyStatusToken: my-case and /m/ stay readable for a revoked/expired survey link until max(link expiry, term end)+30 days; submission still uses resolveShareToken (closed); «أوقف الرابط» confirm + toast now say requests stop but status stays readable | tests/student-journey-audit.ts §S3 |
| S4 | FIXED — saveStudentNeed updates in place in one transaction (Firestore runTransaction / local), keeps id, caseRef, createdAt, all decided states; removed decided courses flagged droppedByStudent («ألغاه الطالب بعد التسجيل»), graduate caseState kept (caseDroppedAt if type changed); rule in src/utils/studentNeedMerge.ts; sheet + /m/ show dropped courses. survey page now shows the existing request (after case number) and warns «سيحلّ هذا الإرسال محل طلبك السابق…», send button «تحديث طلبي السابق» | tests/student-journey-audit.ts §S4; student-registration-audit updated |
| S5 | FIXED — identity-status returns only {exists, masked initial} without caseRef; name/department/summary only after civil+caseRef match; POST refuses replacing an existing case without caseRef (409 case-ref-required, «فقدت الرقم؟ راجع القسم»); proof reuse (proof-status + POST carry-forward) requires caseRef; my-case keyed by civil+caseRef, /m/ page asks for it (prefilled from #hash of the submit link) | tests/student-journey-audit.ts §S5; location-registry-audit 165 updated |
| S6 | FIXED — my-case uses toEnglishDigits + validateCivilId(...).isValid; server asciiDigits is now an alias of the shared toEnglishDigits; survey page digits() accepts ۰-۹; student-case-status audit no longer encodes the object test | tests/student-journey-audit.ts §S6 (incl. repo-wide `!validateCivilId(x)` guard, executes the page's digits()) |
| S7 | FIXED — GET /api/degree-rules reviewed=Boolean(saved), suggested=!saved; degreeRuleForSection reviewed:false for unsaved; name-derived guess now only in src/utils/degreeRules.ts (server + Sections.tsx import it); Sections shows «اقتراح غير محفوظ — احفظه ليعمل تحقق الخريجين» + «احفظ الاقتراح»; survey GET sends per-dept graduateRule {saved, threshold}; page blocks upload for a dept without saved rule; proof checks saved rule BEFORE OCR (code no-degree-rule); rule PUT clears survey payload cache | tests/student-journey-audit.ts §S7 |
| S8 | TODO | |
| S9 | TODO | |
| S10 | TODO | |
| S11 | TODO | |
| S12 | TODO | |
| S13 | TODO | |
| S14 | TODO | |
| S15 | TODO | |
| S16 | TODO | |
| S17 | TODO | |
| S18 | TODO | |
| S19 | TODO | |
| S20 | TODO | |
| S21 | TODO | |
| S22 | TODO | |
