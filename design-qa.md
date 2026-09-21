**Source visual truth**

- `/Users/prof.ahmadalfailakawi/Desktop/Screenshot 2026-09-21 at 8.17.35 PM.png`

**Implementation**

- `server.ts` — `instructorRequestPage`
- Intended mobile viewport: 390 × 844 CSS pixels at device scale 1.
- State: open instructor request with existing courses, add-course picker, and empty/local movement history.

**Evidence**

- The supplied source image was available and inspected.
- Production build completed successfully.
- The embedded request-page JavaScript parsed successfully as a standalone script.
- Request behavior, signature, handoff, term-lock, and source-contract audits passed.
- A browser-rendered implementation screenshot could not be captured. The Codex in-app browser blocked `http://localhost:3000` because its admin policy check was unavailable. The same navigation was retried once and returned the same policy failure.

**Findings**

- [P1] Browser visual comparison is unavailable.
  Location: full mobile request page.
  Evidence: source image is available, but there is no browser-rendered implementation image to place beside it.
  Impact: typography, exact spacing, sticky controls, and interaction-state rendering cannot be certified visually in this environment.
  Fix: repeat the comparison when the in-app browser policy service allows localhost navigation.

**Fidelity surfaces**

- Fonts and typography: implemented with the existing Plex Arabic font and tested through build only; visual comparison blocked.
- Spacing and layout rhythm: explicit mobile breakpoints and narrow-grid rules implemented; visual comparison blocked.
- Colors and visual tokens: retained the product's green, neutral, warning, and danger semantics; visual comparison blocked.
- Image quality and assets: this screen contains no raster imagery or custom image assets.
- Copy and content: verified in source audits for add, edit, delete, readiness, signature, and detailed activity states.

**Primary interactions covered by source and behavior tests**

- Add any course from the department list.
- Edit days and start time with server-side conflict checks.
- Delete a course.
- Switch between schedule and activity tabs.
- Restore saved days, time, verdict, and department decision when reopening.
- Block submission while a live check is pending or has a conflict.

**Comparison history**

- Pass 1: localhost navigation blocked before capture by the browser's admin policy check.
- Pass 2: identical policy failure; no visual comparison could be performed.

**Implementation checklist**

- Re-run a 390 × 844 browser capture when localhost access is restored.
- Compare the schedule tab and activity tab against the supplied mobile source.
- Confirm there is no horizontal overflow and that the sticky submit panel does not cover the final content.

final result: blocked
