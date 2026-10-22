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
