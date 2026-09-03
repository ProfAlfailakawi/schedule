import React from "react";

/**
 * ── العلامة: الأسبوع الذي حُلّ ─────────────────────────────────────────────
 *
 * Before this file the product had five marks. The app icon drew a calendar in
 * a brass frame with a jade block inside it; the boot splash drew the same
 * calendar with the two colours SWAPPED — jade frame, brass pins — so the mark
 * on the home screen and the mark half a second after tapping it contradicted
 * each other. The sidebar and the login screen used a stock `CalendarDays`
 * glyph, and the welcome tour carried no mark at all. Five drawings, none of
 * which had seen the others.
 *
 * All five also drew a CALENDAR, and this is not a calendar. The journey screen
 * names the product itself: an academic decision system. It finds a collision
 * before it happens and repairs it with the fewest moves it can. A calendar
 * glyph describes the data; it says nothing about the work, and every scheduling
 * product on earth could use the same one.
 *
 * So the mark carries the act instead of the container:
 *
 *   Five columns — five days, because this university's week is five, not
 *   seven. Each column is a lecture floating at its own hour: `y` is when it
 *   starts, `h` is how long it runs, exactly as on the real board. One column
 *   is brass, and brass in this system has always been the colour of a
 *   judgement. It is the one that MOVED: it hangs lower than every neighbour
 *   because it was pushed out of the hour it shared with الثلاثاء.
 *
 * The geometry lives here once and every surface renders it from this array.
 * The old marks drifted because there was nothing for them to drift FROM.
 *
 * Two variants, one set of numbers:
 *   `tile`  — the mark on its own dark ground, matching the installed icon.
 *   `glyph` — the bare bars, rescaled to fill their box, for a coloured tile
 *             the shell already draws.
 *
 * `trace` draws the hour the brass column vacated. It is off everywhere except
 * the boot splash — see the note on TRACE below for why.
 */

/** Brand constants. Not theme tokens: the mark is the same colour on every
    ground, the way it is on the home screen. */
export const BRAND_JADE = "#5FBFA6";
export const BRAND_BRASS = "#C79B5F";
export const BRAND_GROUND = "#141917";

/** الأحد ← الخميس, right to left, as the board reads them. */
const BARS = [
  { day: "الأحد", x: 46.4, y: 19.5, h: 15 },
  { day: "الاثنين", x: 37.8, y: 27.5, h: 12 },
  { day: "الثلاثاء", x: 29.2, y: 16.5, h: 19 },
  { day: "الأربعاء", x: 20.6, y: 32.5, h: 14, decided: true },
  { day: "الخميس", x: 12.0, y: 23.5, h: 16 },
];

/**
 * Where the brass column sat before the repair — level with الثلاثاء's top,
 * which is the hour they shared.
 *
 * Off by default, and the static icons never draw it. Rendered at 512 it read
 * as a dotted letter floating above the mark rather than as an absence: an
 * outline with no motion behind it is just another shape competing with the
 * five. It earns its place only on the boot splash, where the brass column is
 * seen LEAVING it, and that half-second of movement is what makes it legible.
 */
const TRACE = { x: 20.6, y: 16.5, h: 14 };

const BAR_W = 5.6;
const BAR_R = 2.8;

/**
 * The drawn content is 40 × 30 inside the 64 grid — correct for a tile that has
 * a background and needs breathing room, too small for a bare glyph, which
 * should fill its box. This re-centres and scales the SAME coordinates rather
 * than introducing a second set of numbers to keep in step.
 *
 * Content spans x 12→52 and y 16.5→46.5, so its centre is (32, 31.5); 56/40 is
 * the scale that leaves 4 units of air on the wide axis.
 */
const FILL = "translate(32 32) scale(1.4) translate(-32 -31.5)";

/**
 * Every content corner sits at most 23.6 units from centre, inside the 25.6 that
 * a maskable icon's safe circle allows. The old icon's brass ring was 6px from
 * the edge and every Android and iOS mask cut it off entirely — the one element
 * that distinguished it was the one nobody ever saw.
 */
export default function BrandMark({
  variant = "glyph",
  trace = false,
  className,
}: {
  variant?: "glyph" | "tile";
  trace?: boolean;
  className?: string;
}) {
  const bars = (
    <>
      {trace ? (
        <rect
          x={TRACE.x} y={TRACE.y} width={BAR_W} height={TRACE.h} rx={BAR_R}
          fill="none" stroke={BRAND_BRASS} strokeOpacity={0.42}
          strokeWidth={0.9} strokeDasharray="2 2"
        />
      ) : null}
      {BARS.map(bar => (
        <rect
          key={bar.day}
          x={bar.x} y={bar.y} width={BAR_W} height={bar.h} rx={BAR_R}
          fill={bar.decided ? BRAND_BRASS : BRAND_JADE}
        />
      ))}
    </>
  );

  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {variant === "tile" ? (
        <>
          <rect width="64" height="64" rx="14" fill={BRAND_GROUND} />
          <rect
            x="1" y="1" width="62" height="62" rx="13.4"
            fill="none" stroke={BRAND_BRASS} strokeOpacity={0.22} strokeWidth={0.8}
          />
        </>
      ) : null}
      {variant === "glyph" ? <g transform={FILL}>{bars}</g> : bars}
    </svg>
  );
}
