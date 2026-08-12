# Design QA — Schedule Academic Workspace

## Reference and scope

- Visual reference: `/Users/prof.ahmadalfailakawi/.codex/generated_images/019fef29-06fb-7340-ae47-55f7f3f87124/exec-d738daaa-570e-4caa-b17b-ae62aeb73295.png`
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
