# Authority PDF import — golden baseline

This file freezes the import behavior that is already working well. It is a guardrail, not a redesign.

## Non-negotiable identity rules

1. Native PDFs use the embedded text layer and physical cell coordinates. Scans/photos use OCR.
2. Course identity is the course **number**. The displayed course name is always the canonical system name.
3. Section numbers are generated from course identity and row order — every course starts at `501` and advances `502`, `503`… in the order its rows appear (owner-approved rule, restored 2026-09-26). The printed section cell is the most weld-prone cell of the scan (`1504`, `50`, `3150`), so it is kept only as evidence in `sourceSectionText`; a row whose course identity is unproven gets no section.
4. The Authority location grammar is owned by one resolver. Example: `012B09` = site `012B` + building `09`.
5. A room is valid only inside its already-confirmed building. The same room code in another building is a different identity.
6. Seat/capacity welds such as `345045`, `520020`, and `320020` are never interpreted as building codes. A damaged building may be inferred from a room only when the room fingerprint points to one official building in the permitted branch.
7. Instructor output is always a system identity. Titles (`د.` / `ا.` / `أ.د.` and variants) are presentation only. Two-name proof is allowed only inside a constrained course/department pool; global recovery requires stronger unique proof. Ambiguity stays blank. `هيئة` resolves only to the system `هيئة تدريسية` identity.
8. Alternate sites such as `012J` and `012F` remain legitimate rows of branch `012` and are shown as an informational site badge beside the course.
9. Missing or uncertain data fails safely: keep confirmed fields, leave the uncertain field unresolved, and never manufacture a canonical value.

## Confidence and provenance

Every imported row carries evidence for course, section, days, time, instructor, building, and room. Evidence records source path, proof method, score, raw value, canonical value, and whether the value was safely derived. The preview uses this metadata only as a calm visual cue; it does not replace registry validation.

## Change protocol

Before changing any Authority parser/resolver:

1. Add or update a reviewed fixture for the new case.
2. Run `npm run test:pdf-import` and `npm run test:locations`.
3. Existing golden fixtures must remain unchanged unless the owner explicitly approves a behavior change.
4. Never weaken a validator merely to increase the number of populated cells.
5. Prefer a narrow repair in the responsible layer over a new parallel parser rule.

The machine-readable fixture is `tests/fixtures/authority-import-golden.json` and its guard is `tests/pdf-import-golden.ts`.


> الحالة الحالية الأوسع وقواعد عدم العبث موثقة أيضًا في `docs/CURRENT_GOLDEN_STATE.md`.

## Hardening rules added after the 2026-09 audit (guard: `tests/pdf-import-hardening.ts`)

10. Instructor names are compared **position by position**. A printed name that contradicts the registry name in any position (family `النصف`≠`الكندري`, father `فهيد`≠`فهد`, `حسن`≠`حسين`) is another person and stays blank. Only the last printed name may be truncated at the cell edge; missing middle names are allowed when the printed family name equals the registry family name. A registry name found in the middle/end of the printed name (the father) is never an identity, and a free permutation of names is not an exact match (only the family-first rotation, and only after the course/department pools).
11. A clean course number (native text layer, or a well-formed department key) that is absent from the catalogue stays **unresolved** — it is never "repaired" to a one-digit neighbour. The OCR multi-page rescue keeps its golden behaviour. A seven-digit catalogue key must carry the same local department digits.
12. A native page whose printed data rows exceed the rows proven by the column grid (re-printed at another scale, split course token) is **suspicious** and the import stops; it never falls back to the flat reader. Files over 12 pages are refused, never truncated. A searchable scan (full-page image + hidden text) is read as a scan. The 012 legacy lane is used only while it is at least as sound as the semantic lane.
13. The room cell is bounded by the printed `القاعة` header label; the seats-in-packages column can never become a room.
14. A well-formed but unregistered building code (e.g. `011B23`) is never rebound to another building through a room fingerprint; that rescue is for damaged cells only.
15. Scanned (OCR) days must agree with the time slot and the catalogue hours, otherwise they are cleared or left for review; a scanned reference number whose length differs from the page is cleared. History-recovered values are shown for review, not as confirmed.
16. Publishing an Authority draft re-checks that the term is still empty. The change report treats two different registered instructor IDs as a change, and never fills the live row from the baseline.
17. Rows imported from the Authority keep their generated section (`501`, `502`…) and Authority room through term copy, evaluation and edits.
18. The PDF change report's units, hours and maximum columns are taken **from the system catalogue** by design; they are not read from the PDF.
