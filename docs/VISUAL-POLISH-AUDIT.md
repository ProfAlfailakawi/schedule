# Visual polish audit — demo-mode walkthrough

Scope: visual layer only (CSS and static-page CSS). No markup, text, handlers, ids, validators, approval flows, server code, tests or dependencies were changed.

Method: ran the app in demo mode (`DATA_MODE=demo`, dev server) and captured Chromium screenshots at 1280px and 390px; opened the static pages from `public/` directly. Existing guards read before editing: `tests/journey-reveal-audit.ts`, `tests/notify-bell-yield-audit.ts` (parse `03-shell.css` rule order), `tests/term-student-phases-audit.ts` (no hex colors after the student-journey section of `12-deadlines.css`), `tests/plan-review-audit.ts`, `scripts/guide-audit.mjs`, `scripts/render-brand.mjs`.

## Screens examined (rendered)

| Screen | Viewport | Finding | Action |
|---|---|---|---|
| Login | 390 / 1280 | Calm, one primary action, no pollution. | Left alone. |
| Onboarding tour dialog | 390 / 1280 | Already visual (mini timetable, step dots). | Left alone. |
| Dashboard (home) | 390 / 1280 | Already stat tiles, readiness ring, health bars. | Left alone. |
| Schedule (الجدول الدراسي) | 1280 | Dense but structured; floating dock overlaps the legend by design. | Left alone. |
| Query center (الاستعلامات) | 1280 | Pill tabs, ask-bar, skeleton rows. | Left alone. |
| Intelligence | 1280 | Step rail + reading tiles with icons. | Left alone. |
| Schedule changes | 1280 | Deadline card + student-journey stepper. | Left alone. |
| Instructor inbox | 1280 | Progress ring, heat strip, status chips. | Left alone. |
| Registration sheet | 1280 | Step tiles with counts. | Left alone. |
| Registration radar | 1280 | Stat tiles + cause bar. | Left alone. |
| Plan review (مراجعة الصحيفة) | 1280 | Native `<select aria-label="قسم الصحيفة">` in `PlanSheetUpload` rendered with browser default (square, grey) next to rounded controls: inconsistent. | Fixed (`12-deadlines.css`, `.pr-import-actions select`). |
| Academic data / Terms | 1280 | Stat strip + master/detail. | Left alone. |
| System admin / Users | 1280 | Tab strip, stat tiles, master/detail. | Left alone. |
| Sidebar rail (every page, desktop) | 1280 | In the collapsed demo rail the "جرّب كطالب" link was not hidden with its siblings: it wrapped onto two lines and ran off the right edge of the viewport. | Fixed (`03-shell.css`, hide the link in the collapsed rail like the other chip children; it reappears on hover/focus). |
| Sidebar drawer (mobile) | 390 | The demo chip used `border-radius:999px` around two wrapped rows, producing an oversized oval. | Fixed (`03-shell.css`, `20px` radius; single-row look unchanged). |
| Landing page `public/landing/index.html` | 1280 | The two floating hero chips sat on top of the dashboard title and on a chart bar/label. | Fixed (anchored to the frame edges: `.hotspot-1 { top:-30px }`, `.hotspot-2 { bottom:-22px }`; still hidden under 900px, animation untouched). |
| Plan sheet `public/plans/educational-technology` | 1280 / 390 | Already an infographic flow diagram. | Left alone. |
| Presentation `public/schedule-presentation.html` | 1280 / 390 | No horizontal overflow. | Left alone. |

No horizontal overflow at 390px or 1280px on any rendered page (`scrollWidth` equals viewport width).

## Not rendered / not examined visually

Screens that need a different demo role, Firestore data or a live backend were not rendered: other-role views (dean, registrar, student "مساري"), print/report papers, approval bar and dossier modals, PDF-import previews, notification panel, Gemini surfaces, admin sub-tabs beyond the first. They are covered only by the existing audits, not by this pass. Source files for these (`Schedules.tsx`, `Reports.tsx`, `IntelligenceWorkspace.tsx`, `ApprovalBar.tsx`, etc.) were not edited because the repo's markup-inspecting tests make blind edits risky and no concrete defect was observed.

## Deliberately left alone

Copy shortening: many strings are asserted by guide/brand/behavior audits and the existing screens already use icon + short label patterns; no text was changed.

---

# Round 2 — motion system and role-view pass

Scope: presentation only. One new stylesheet, `src/styles/30-motion.css`, imported last in `src/index.css`. No markup, text, handlers, ids, validators, approval flows, Gemini layer, server code, tests, dependencies or workflows were changed. Existing guards read first: `notify-bell-yield` (parses `03-shell.css` rule order, so no rule was added there), `journey-reveal` (no `infinite` loops), `term-student-phases` (no hex colours in `12-deadlines.css`; the new file uses tokens only), `approval-bar-visual`, `arabic-presentation`, `plan-review`, `deadlines-panel`, the guide/brand audits.

## What round 2 found

The app was already richer than round 1's notes suggested: it ships its own bar/ring/gauge draws (`bar-stretch`, `ring-sweep`, `gauge-sweep`, `sd-bar-draw`, the `useMotionScope` hook), hover lifts on its clickable cards (`insight-preview`, `pr-card`, `record-card`), a toast, a notification drop and an onboarding choreography. Duplicating any of that would have fought it. The new layer therefore only fills gaps and is written so that it can never override an existing animation (see "How the layer stays safe").

## Motion inventory (everything this round added)

Tokens (`:root`): `--mo-ease: cubic-bezier(.2,.7,.2,1)`, `--mo-fast/base/slow: 120/180/260ms`, `--mo-rise: 8px`, `--mo-rise-sm: 6px`, `--mo-step: 40ms`.

| What | Trigger | Motion | Duration |
|---|---|---|---|
| Page root (`.content-frame > *`) | route mount | opacity 0 → 1 (opacity only, so no containing block for fixed docks/dialogs) | 180ms |
| Page sections (`.content-frame > * > *`, first 8) | route mount | opacity + 8px rise, 40ms stagger; 9th and later: none | 260ms |
| Tile / card groups (`.insight-preview-list`, `.deck-signals`, `.deck-metrics`, `.inbox-glance`, `.reg-flow`, `.admin-quiet-summary`, `.request-deck`, `.dashboard-workload-preview`; first 8) | mount | opacity + 8px rise, 40ms stagger | 260ms |
| Tab panels (`[role=tabpanel]`) | panel appears | opacity + 6px rise | 180ms |
| Disclosure body (`details[open] > *:not(summary)`) | open | opacity + 6px rise (height left to the browser, no reflow) | 180ms |
| Menus (`[role=menu]`) | open | opacity + 6px drop | 120ms |
| Dialogs / sheets / drawers (`[role=dialog]`, `[role=alertdialog]`) | open | opacity + 6px rise; nodes that are themselves the dimmed backdrop only fade | 180ms |
| Active nav rule (`.side-nav-link.active::before`) | row becomes current | opacity + `scale: 1 .35 → 1` | 260ms |
| `.btn` press | `:active` | `scale(.98)` (replaces the old 1px sink; disabled buttons never react) | existing 120ms transition |
| Forward arrow inside `.btn` | hover | `translate: -2px 0` (RTL forward) | 180ms |

Nothing loops. Only `opacity` and the transform-family properties (`translate`, `scale`, `transform`) move; no layout property is touched. All of it sits inside `@media (prefers-reduced-motion: no-preference)`; under `reduce` none of it exists and every element is simply visible. A `@media print` block cancels the layer's animations. Without JavaScript nothing changes: the layer is pure CSS and never hides content behind a script.

Intentionally not animated: conflict / blocker / approval / dossier containers (excluded by class-name pattern, and `.ad-dialog` / `.approval-sheet` explicitly), `.deck-decision` and `.dashboard-attention`, tables, form inputs, long-form text, payment-like amounts (none on screen), anything inside the student/exam flows.

## How the layer stays safe

1. **End state equals the static design by construction.** Every animation is `backwards`-filled with only a `from` keyframe. Before its delay an element sits at the `from` pose; once finished nothing of it remains. There is deliberately no forward fill: a retained `translate` would keep a containing block alive for fixed descendants (the dock, dialogs).
2. **`translate`/`scale` instead of `transform`** in keyframes, so they compose with an element's own `transform` (a dialog centred with `translate(-50%,-50%)` is never overwritten).
3. **Zero specificity.** Every selector is inside `:where()`, so any animation the app already declares on the same element wins; nothing is doubled.
4. **Measured**: a Playwright run (`document.getAnimations()`) after each route change showed the layer's `mo-*` animations all finished within the wait and every `.content-frame` child at `opacity: 1`, `translate: none`; with `reducedMotion: 'reduce'` emulated, no `mo-*` animation existed at any sample and all nine sampled children were `opacity: 1` immediately. The approval dossier dialog and the notification panel have identical final rectangles in normal and reduced mode.

## Static polish in the same file

- Headings use `text-wrap: balance` and short explanatory paragraphs `text-wrap: pretty` (no orphaned Arabic word; copy and widths untouched).
- `::selection` wears the brand jade.
- **Phone scope selects (≤760px).** The كلية / قسم / فصل selects on الاستعلامات، كشف التسجيل، تغييرات الجدول and مركز الذكاء were three boxed cards of ~100px each (a grey frame around a white frame around the control). Each is now one quiet row: label on the inline-start, control filling the rest, no second frame. Same labels, controls, order, ids and handlers. Effect on the 390px registration sheet, read from the before/after screenshots: the scope block went from roughly 300px to roughly 130px tall, so the step flow (18 / 16 / 4 / 4) and the first results now sit above the fold; on the intelligence page the step rail and tabs moved up the same way. Verified: no horizontal overflow, labels not clipped (`scrollWidth <= clientWidth`).

## Screens rendered through the demo role switchers

Rendered at 1280 and/or 390 (Chromium, `DATA_MODE=demo`): dashboard (admin, dean, registrar head, department head, advisor, standard), الجدول الدراسي، الاستعلامات والتقارير (admin and dean — `reportDepartment`), registrar `searchInstructor`, مركز الذكاء، تغييرات الجدول (admin, registrar dean, department head, committee chair), رغبات الأساتذة، كشف التسجيل (admin, registrar head, advisor), رادار التسجيل (registrar head), مراجعة الصحيفة (admin, department head, committee chair), البيانات الأكاديمية، إدارة النظام، audit, locations, permissions, backup, about; plus overlays: notification panel, approval dossier (department head and chair), approval bar region. 390px runs: 16 views across four roles, `scrollWidth == clientWidth` in all.

Left alone, and why: these already read as infographic + icon + short label (stat tiles, rings, step rails, ledger strips, ruled-sheet titles) and every candidate change touched strings or markup that the guide/brand/behavior audits assert. In particular the approval dossier's static design, the notification panel (own `notify-drop` animation) and the toast were not touched.

## Not reached / not verified

- **Student «مساري» (`/me`, `/m/`, `/q/`, `/s/`, `/t/`), the public plan sheets and the study-proposal pages are server-rendered from templates under `server.ts` and `src/server/*`** with inline CSS. They are presentation, but they live in server code the brief forbids touching, so they were not restyled and not given this layer. The React-side student-facing screens (registration sheet, radar) were covered.
- Print / report paper (`08-print.css` surfaces) were not rendered or restyled; the layer only makes sure it cancels its own animations for print.
- PDF-import preview tables and `ImportPreviewTable` need an uploaded file; not rendered. Gemini surfaces need a key; not rendered.
- Exit animations (modal/drawer/toast out) need the component to stay mounted after close, which is JavaScript behaviour; not added. Entry only.
- A sliding active-nav indicator (one element travelling between rows) needs measurement in JS; the rule instead grows into place on the new row.
- No focus-ring ease-in: the ring is a `box-shadow`, outside the opacity/transform-only rule.
- Dark theme: the layer contains no colours besides the selection tint (a `color-mix` of `--accent`, which follows the theme); dark mode was not re-rendered.
- Below-the-fold sections animate on mount (CSS cannot wait for visibility); only the first eight children of any group animate, so deep pages are not choreographed. An IntersectionObserver helper was deliberately not added to keep the layer script-free.
- Under heavy machine load (load average >30 from sibling sessions) screenshot timing was slow; animations were therefore sampled with `getAnimations()` rather than by eye. Motion quality itself (feel) was not judged visually, only its end states.

## Checks that ran

- `npm run lint` (tsc --noEmit): pass. `verify:pwa`, `audit:brand`, `audit:guide`, `test:guide`, `test:guide:perf`: pass. `vite build` (to a scratch outDir; the layer is present in the emitted CSS): pass.
- `npm test`: every script before `test:behavior` passed; the chain then stops at `test:behavior`. Three scripts fail identically with this round's change stashed: `test:behavior` (`TypeError ... reading 'AdCollegeId'` at `tests/run-tests.ts:1878`), `test:data` and `test:parity` (the 15 `FAIL` lines are all legacy-dataset counts and preserved identities: the checkout has no legacy data). These are environmental, not caused by CSS. The remaining ~72 scripts after `test:behavior` were then run one by one (not chained) and all pass.
- Browser: per-route `getAnimations()` sampling in normal and `reducedMotion: 'reduce'`, rectangle comparison for the dossier dialog and notification panel, `scrollWidth == clientWidth` at 390px on 16 views and at 1280px on 31 views.
