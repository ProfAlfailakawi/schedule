# Authority PDF import — golden baseline

This file freezes the import behavior that is already working well. It is a guardrail, not a redesign.

## Non-negotiable identity rules

1. Native PDFs use the embedded text layer and physical cell coordinates. Scans/photos use OCR.
2. Course identity is the course **number**. The displayed course name is always the canonical system name.
3. Sections are generated per course: `501`, `502`, `503`… and restart at `501` for the next course.
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
