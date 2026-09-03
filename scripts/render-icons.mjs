/**
 * ── رسم أيقونات PNG من هندسة العلامة نفسها ────────────────────────────────
 *
 * The PNGs used to be hand-exported files that nothing regenerated, so they
 * could drift from the SVG without anyone noticing. This draws them from the
 * same five bars that `src/components/BrandMark.tsx` and the two SVGs use,
 * multiplied by 8 into the 512 grid.
 *
 * Run: node scripts/render-icons.mjs
 */
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";

const JADE = "#5FBFA6";
const BRASS = "#C79B5F";
const GROUND = "#141917";

/* الأحد ← الخميس. Same numbers as BrandMark.tsx, ×8. */
const BARS = [
  { x: 371.2, y: 156, h: 120 },
  { x: 302.4, y: 220, h: 96 },
  { x: 233.6, y: 132, h: 152 },
  { x: 164.8, y: 260, h: 112, decided: true },
  { x: 96.0, y: 188, h: 128 },
];
const W = 44.8;
const R = 22.4;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * @param size   pixel size of the output
 * @param masked true for the maskable/apple variant: square ground, no ring —
 *               the platform's own mask draws the shape, and the ring would sit
 *               outside the safe circle and be cut off anyway.
 */
function draw(size, masked) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const k = size / 512;
  ctx.scale(k, k);

  ctx.fillStyle = GROUND;
  if (masked) {
    ctx.fillRect(0, 0, 512, 512);
  } else {
    roundRect(ctx, 0, 0, 512, 512, 112);
    ctx.fill();
    ctx.strokeStyle = BRASS;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 6.4;
    roundRect(ctx, 8, 8, 496, 496, 107.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* No trace here. The vacated hour is drawn only on the boot splash, where the
     brass column is seen leaving it; as a static outline it read as a stray
     dotted glyph rather than as an absence. */
  for (const bar of BARS) {
    ctx.fillStyle = bar.decided ? BRASS : JADE;
    roundRect(ctx, bar.x, bar.y, W, bar.h, R);
    ctx.fill();
  }

  return canvas.toBuffer("image/png");
}

const jobs = [
  ["public/schedule-icon-192.png", 192, false],
  ["public/schedule-icon-512.png", 512, false],
  ["public/schedule-maskable-512.png", 512, true],
];

for (const [file, size, masked] of jobs) {
  writeFileSync(file, draw(size, masked));
  console.log(`${file}  ${size}×${size}${masked ? "  maskable" : ""}`);
}
