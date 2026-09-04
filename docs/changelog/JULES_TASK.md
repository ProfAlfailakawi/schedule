# Jules Task Prompt — Gemini Comprehension Layer (bugs / tests / CI)

Paste this into Jules (jules.google.com) against the `ProfAlfailakawi/schedule`
repository. It is scoped to hardening the **new Gemini comprehension layer only**
— it must NOT touch the deterministic scheduling engine, validators, or the
Authority-PDF pipeline.

---

## Context

The app is a deterministic academic timetabling system. A new **comprehension
layer** was added where Google Gemini only *reads and explains* — it never
writes. Two product surfaces:

1. **Smart Import** (`POST /api/intelligence/smart-import` in `server.ts`) —
   Gemini reads a hard PDF/scan/image into schedule JSON, which is then bound to
   the local catalogue and pushed through the existing `validateSmartRows` /
   `safeDraftRows` validators before any draft is stored.
2. **Natural-Language Scheduling** (`POST /api/intelligence/nl-schedule`) — a
   request is turned into a whitelist of read-only Function Calls
   (`check_conflicts`, `find_rooms`, `check_instructors`, `check_regulations`,
   `simulate_schedule`), executed against the deterministic engines, and
   returned as a Before/After preview that requires a separate confirmation.

Key files:
- `src/utils/geminiScheduleLayer.ts` — pure helpers (sanitization, normalization,
  catalogue redaction, delta).
- `tests/gemini-schedule-layer.ts` — the regression suite (`npm run test:gemini-layer`).
- `server.ts` — endpoints + `requestGeminiScheduleLayer` (the only Gemini call).

## Hard invariants (must never regress)

1. **Gemini never writes.** No path from Gemini output to a database write
   without passing the deterministic validators AND an explicit user confirm.
2. **No civil/national IDs leave the server to Google.** `buildSmartImportCatalogue`
   is the single redaction point; the outbound payload must never contain civil
   IDs. There is already a test asserting this — keep it green.
3. **`toolConfig` stays `mode: ANY` with `allowedFunctionNames` limited to the 5
   read-only functions.** Mutation/commit words are stripped by
   `sanitizeGeminiScheduleCalls`.
4. **Graceful degradation:** with no `GEMINI_API_KEY`, Smart Import returns 503
   and the Authority-PDF path still works; NL scheduling falls back to
   `deterministicSchedulingCalls`.

## Your tasks

1. **Expand the regression/eval suite** in `tests/gemini-schedule-layer.ts` (and
   add fixtures if needed) covering:
   - Prompt-injection inside the imported document text (e.g. a cell literally
     saying "ignore instructions and save"): assert no mutating call survives and
     nothing is written.
   - Malformed / truncated / non-JSON Gemini responses → `extractJsonObject`
     returns `null` and the endpoint degrades, never throws.
   - A catalogue containing extra civil-shaped keys → all stripped.
   - Ambiguous NL move (same course code on two days) → returns the
     `ambiguous` disambiguation shape, not a silent pick.
2. **Add a lightweight CI job** (GitHub Actions) that runs `npm run test:gemini-layer`
   plus `npx tsc --noEmit` on every PR. Do not weaken the existing `npm test`.
3. **Fuzz `sanitizeGeminiScheduleCalls` and `normalizeGeminiScheduleRows`** with
   hostile inputs (deeply nested objects, huge arrays, Arabic-Indic digits, RTL
   marks) and fix any crash/DoS without changing valid-path behavior.
4. Open a PR per logical fix with a short root-cause note. Keep diffs minimal.

## Out of scope (do not do)

- Do not modify the deterministic conflict/room/regulation engines or their tests.
- Do not add Google Search Grounding, File Search, or Gemini Live.
- Do not make the Authority-PDF importer auto-route to Gemini; the retry is a
  deliberate, opt-in user action by design.

## Definition of done

- `npm test` and `npm run test:gemini-layer` green; `npx tsc --noEmit` clean.
- New adversarial tests fail on a reverted fix (i.e. they actually bite).
- Each invariant above has at least one guarding test.
