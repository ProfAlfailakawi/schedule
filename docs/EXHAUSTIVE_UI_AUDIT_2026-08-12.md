# Exhaustive UI Audit — 2026-08-12

This pass treats the application as one product rather than a collection of isolated pages. The review covered every routed screen and every major overlay/state visible in the current React source.

## Screens reviewed

- Login and session shell: launcher, sidebar, global search, theme, loading/offline states.
- Dashboard: masthead, hero, decision zone, metrics, insight panels and expandable detail.
- Academic catalog: colleges, departments, terms, instructors and courses; list, search, empty, selected, create and edit states.
- College mobility: detected buildings, travel-time matrix, defaults, loading/empty/save states.
- Schedule: filters, quick search, week/list/cinema views, editor, validation, drag/drop, pending state, context drawer, conflicts, comments, alternatives, replay, print and copy flow.
- Search and reporting: every search mode, every report mode, filter states, result cards, report preview and print layout.
- Intelligence workspace: quality, attention, approval, professor/room intelligence, heatmap, genome, constraints, scenarios, time travel, drafts, imports, war room, autopilot and Spatial Burnout Radar / Room Castling.
- Decision Center: pulse, topology, why/why-not, emergency rescue, health/fairness, copilot, minute brief, semester genesis, decision memory, safety net, meeting minutes plus advanced decision tools.
- One Decision modal, schedule signature and semester comparison.
- Administration: users, permissions, college/department scopes, audit log, create/edit/detail/empty states.
- About page and narrow-screen variants.

## Design defects addressed

1. Mixed visual hierarchies made many cards compete equally for attention.
2. Several master/detail pages reserved large fixed areas and produced dead whitespace.
3. Dense intelligence and decision surfaces used grids that were too uniform, creating visual noise.
4. The new geographic mobility and burnout modules were functional but had no dedicated visual system.
5. Report preview and print used screen geometry too directly, which risked clipping.
6. Repeated navigation/tool rows consumed too much vertical space.
7. Interactive targets and icon actions were not consistently sized.
8. Responsive behavior often compressed desktop layouts instead of recomposing them.

## Resulting visual rules

- One primary content hierarchy per screen.
- Compact controls, larger data canvas.
- Master/detail instead of list + empty canvas.
- Sticky inspectors only when the viewport supports them.
- The Decision Center becomes a navigation rail plus a calm working canvas on desktop, and a horizontal scene switcher on mobile.
- Spatial Burnout Radar presents score, risk list and castling recommendation as one decision story.
- Reports use a dedicated print geometry and avoid page-breaking rows.
- All interactive elements use a hand pointer; text inputs preserve the text cursor; disabled actions use not-allowed.
- Responsive breakpoints reconstruct the layout rather than merely shrinking it.
