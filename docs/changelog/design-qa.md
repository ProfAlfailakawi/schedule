# Design QA — Schedule Academic Workspace

## Reference and scope

- Visual reference: `~/.codex/generated_images/019fef29-06fb-7340-ae47-55f7f3f87124/exec-d738daaa-570e-4caa-b17b-ae62aeb73295.png`
- Audited experience: dashboard, schedule list/week views, conflicts and queries, courses/catalog records, reports, users/permissions, intelligence workspace, search overlay, navigation, and mobile menu.
- Direction: Arabic editorial control room; slim navigation, restrained brass/mint accents, strong typographic hierarchy, low-noise surfaces, and a single primary action per decision context.

## Pass 1 findings and corrections

- P1 — The mobile living-schedule command deck was too dense and mixed Arabic/English labels. Rebuilt the responsive command layout and localized visible operational labels.
- P1 — Query intent-card text could visually join on narrow screens. Made title and supporting copy explicit block-level rows with controlled spacing.
- P2 — Several catalog, admin, schedule, and intelligence surfaces retained technical English labels. Localized them while preserving codes and established product names.
- P2 — Eight icon-only controls lacked a reliable accessible name. Added contextual Arabic `aria-label`/title values and repeated the static audit.
- P2 — Schedule week width could force page-level horizontal scrolling. Kept the page fixed and confined horizontal scrolling to the calendar surface.

## Final verification

- Desktop reference comparison: passed at 1490 × 1059 CSS pixels.
- Phone layout: passed at the phone breakpoint with dashboard, schedule, catalog, query, admin, and intelligence states captured.
- Page-level horizontal overflow: none in audited desktop or phone states.
- Week calendar overflow: intentionally local to the calendar surface (`overflow-x: auto`).
- Navigation drawer: opens, reads clearly, and closes correctly on phone.
- Global search overlay: opens and closes correctly; close control has an accessible name.
- Icon-only button audit: 0 missing accessible names.
- Browser console during final interaction pass: 0 errors.
- TypeScript check: passed.
- Production build: passed.
- Open P0 issues: 0.
- Open P1 issues: 0.
- Open P2 issues: 0.

## Final result

passed

---

## Addendum — Course-card identity and dense simultaneous hours (2026-08-13)

### References and implementation evidence

- Reference — room timeline: `~/Desktop/Screenshot 2026-08-13 at 8.51.58 PM.png`
- Reference — simultaneous bundle: `~/Desktop/Screenshot 2026-08-13 at 8.52.10 PM.png`
- Implementation — room cards: `~/Documents/ChatGPT/Schedule/current-ux-audit/course-card-room-implementation.jpg`
- Implementation — live Islamic Education data: `~/Documents/ChatGPT/Schedule/current-ux-audit/course-card-bundle-implementation.jpg`
- Implementation — nine-at-once stress case: `~/Documents/ChatGPT/Schedule/current-ux-audit/course-card-nine-implementation.jpg`

### Root cause found in the live account

- Scope verified: College of Basic Education — Women, Islamic Education Department, first term 2017/2018.
- Live state: 129 appointments, 44 woven bundles; the current data peaks at eight simultaneous appointments.
- Before the correction, an eight-item fifty-minute bundle had only `41.16px` for its bands. The vertical stack required `71px`, so four rows were visible, the fifth was clipped, and rows six through eight were physically hidden.
- The fix converts only dense bundles into a two-column grid. Eight appointments become four rows; nine become five. This preserves the true time height and does not cover the next hour.

### Focused measurements

- Live eight-at-once case: `199 × 41.16px` identity area, two `99px` columns, four `9.54px` rows; all eight rows have their full row height visible.
- Nine-at-once stress case: two `98.5px` columns, five `8.40px` rows; all nine rows have their full row height visible.
- Dense identity order: course `6.25px` (nine case `5.8px`), instructor `5.35px` (nine case `4.9px`), code/section seal `4.1px` (nine case `3.8px`).
- Code/section uses the compact form `102/1`; its measured width is about `10.55px`, leaving about `82.45px` of each live `99px` cell for course and instructor.
- Long instructor names use honorific + first + family name, or first + family name; the complete name remains in the card tooltip and accessible label.
- Room cards at the desktop reference width keep course, instructor, and course number visible at `78.77–88.61px` card widths.
- RTL axis verified at 1280px: `08:00` is at x=`1139`, while `19:00` is at x=`43`.

### Verification

- Live-account visual check: passed.
- Nine-at-once stress check: passed.
- TypeScript: passed.
- Production build: passed.
- Behavior tests: 2038 passed, 0 failed.

## Addendum final result

passed

---

## Addendum — Final room matrix, official hours and scoped loading (2026-08-14)

### Corrections verified in source

- The room comparison binds every compact lane to one exact day pattern. A lecture meeting on one, two or three days therefore carries those full day names beside the correct card instead of a room-wide union or unexplained initials.
- The horizontal room scale is RTL: `08` is anchored to the right boundary; `19` is the last visible heading. `20:00` remains the hard closing boundary/terminal grid line, but the redundant `20` heading is not shown.
- Room cards reserve independent rows for course, instructor, and the tiny course/section seal. The visual card receives a readable minimum one-hour width while a colored foot preserves the exact occupied duration.
- Long instructor names use first/compound-first + family name. The full name remains in the tooltip and accessible name.
- Opening a department replaces the course and instructor lists with that department's scoped data. Firestore resolves only the instructor documents referenced by the section/term; it does not hydrate the 743-person register. Wider search waits for two characters, is cancelled while typing, stays inside the selected college/term, and returns at most 40 matches.
- Every timetable surface, time input, suggestion generator, drag/move, import, draft publication, restore and server write guard uses `08:00–20:00`. Values outside that interval are refused with an Arabic reason before a write.
- Global notices render through one fixed viewport toast layer, stack safely, and remain dismissible. Login is intentionally inline.
- Decision language distinguishes a blocked candidate from an accepted timetable: visible labels use “موانع الحفظ” or “موضع يحتاج تحقق”; an actual collision is still named in the rejection that prevents saving.

### Performance verification

- Initial schedule load no longer waits for university-wide course/instructor catalogues.
- Schedule rows, section courses and section instructors load independently; stale scope requests are aborted.
- The room index is built once per data/scope change and uses `content-visibility` for off-screen rooms.
- Expensive intelligence is idle-loaded only after schedule rows exist; presentation-only pair analysis does not run in ordinary views.
- Route chunks prefetch on pointer/focus; gzip compression is enabled for text responses; Excel remains a separate lazy chunk.
- Production build: 1,717 modules, 3.78 s Vite build, schedule chunk 70.06 kB gzip.
- TypeScript: passed.
- Behavior tests: 2,045 passed, 0 failed.
- Full test command: passed; database parity suites were skipped because no legacy snapshot exists in this checkout.

### Visual verification boundary

The final live-browser screenshot comparison was not repeated after this addendum because the owner explicitly requested that no browser or other site be touched. The source/layout arithmetic, type-check, behavior tests and production build pass; a current post-change visual capture remains the only unperformed check.

## Addendum final result

code-and-test passed; current live visual capture intentionally not run
