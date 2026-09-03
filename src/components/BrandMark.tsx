import React from "react";

/**
 * ── العلامة: الأسبوع الذي حُلّ ─────────────────────────────────────────────
 *
 * خمسة أعمدة = خمسة أيام. كل عمود محاضرة تطفو عند ساعتها: `y` وقت البدء،
 * و`h` المدّة، كما على اللوحة. العمود النحاسي هو الذي نُقل، فيتدلّى تحت
 * جيرانه لأنه أُخرِج من الساعة التي كان يتصادم فيها.
 *
 * الهندسة تُكتب هنا مرة واحدة، وكل سطح يرسمها من هذا المصفوف. الألوان من
 * `--brand-*` في 01-foundation.css، ويقرأها كذلك scripts/render-brand.mjs
 * لتوليد الأيقونات، فلا يمكن لأصل مستقل أن ينحرف عن البرنامج.
 *
 * صيغتان بمجموعة أرقام واحدة:
 *   `tile`  — العلامة على أرضيتها الداكنة، مطابقة للأيقونة المثبّتة.
 *   `glyph` — الأعمدة وحدها، مُكبّرة لتملأ صندوقها.
 */

/**
 * The mark's colours come from `--brand-*` in 01-foundation.css, which is the
 * single declaration the whole product and `scripts/render-brand.mjs` read.
 * The literals here are fallbacks only, for any context that renders this
 * component without the stylesheet — a test renderer, a detached portal. If
 * they ever disagree with the CSS, the CSS wins on every real screen.
 */
export const BRAND_JADE = "var(--brand-jade, #5fbfa6)";
export const BRAND_BRASS = "var(--brand-brass, #c79b5f)";
export const BRAND_GROUND = "var(--brand-ground, #141917)";

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
  /* `style` rather than a `fill=` attribute: `var()` inside an SVG presentation
     attribute is not reliably supported, while an inline style is. */
  const bars = (
    <>
      {trace ? (
        <rect
          x={TRACE.x} y={TRACE.y} width={BAR_W} height={TRACE.h} rx={BAR_R}
          strokeDasharray="2 2"
          style={{ fill: "none", stroke: BRAND_BRASS, strokeOpacity: 0.42, strokeWidth: 0.9 }}
        />
      ) : null}
      {BARS.map(bar => (
        <rect
          key={bar.day}
          x={bar.x} y={bar.y} width={BAR_W} height={bar.h} rx={BAR_R}
          style={{ fill: bar.decided ? BRAND_BRASS : BRAND_JADE }}
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
          <rect width="64" height="64" rx="14" style={{ fill: BRAND_GROUND }} />
          <rect
            x="1" y="1" width="62" height="62" rx="13.4"
            style={{ fill: "none", stroke: BRAND_BRASS, strokeOpacity: 0.22, strokeWidth: 0.8 }}
          />
        </>
      ) : null}
      {variant === "glyph" ? <g transform={FILL}>{bars}</g> : bars}
    </svg>
  );
}
