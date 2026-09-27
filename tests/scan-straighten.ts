/* ── الجدول المائل يُستقام قبل أن يُقطع (straightenTable) ─────────────────────
   3.pdf (2026-09-27): خطوط الأعمدة تُقاس في الترويسة وحدها، فانزاحت في آخر الصفحة
   10–18 بكسلاً — عرضَ خانة في عمود رقم المقرر — فخرج «0101150» «3010115»
   والأيام «5 4 3 2 1» «5432» والمبنى فارغاً. هذا الاختبار يرسم جدولاً اصطناعياً
   تنزاح خطوطه كلما نزلنا، ويتحقق أن الاستقامة تعيد كل خط إلى موضعه في
   الترويسة، وأن الجدول المستقيم أصلاً لا يُمسّ. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { straightenTable, STRAIGHTEN_MIN_SHIFT } from "../src/utils/documentOcr.ts";

const lib: any = await import("@napi-rs/canvas");
const passed: string[] = [];

const W = 1600, H = 1200, TOP = 120, HEADER = 80, ROWS = 24, PITCH = 40;
const COLS = Array.from({ length: 13 }, (_, i) => 100 + i * 110);
const BOTTOM = TOP + HEADER + ROWS * PITCH;
const BANDS = Array.from({ length: ROWS }, (_, i) => ({ top: TOP + HEADER + i * PITCH, bottom: TOP + HEADER + (i + 1) * PITCH }));

/** A ruled table whose vertical rules drift right as they go down (more on the
 *  right: perspective), and whose row rules tilt by `tilt` px across the table. */
function table(drift: number, tilt = 0) {
  const canvas = lib.createCanvas(W, H), g = canvas.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#111"; g.lineWidth = 2;
  const xAt = (x: number, y: number) => x + drift * Math.max(0, (y - TOP) / (BOTTOM - TOP)) ** 1.5 * (0.5 + x / W);
  const yAt = (x: number, y: number) => y + tilt * ((COLS[12] - x) / (COLS[12] - COLS[0])) * ((y - TOP) / (BOTTOM - TOP));
  for (const x of COLS) { g.beginPath(); g.moveTo(xAt(x, TOP), TOP); g.lineTo(xAt(x, BOTTOM), yAt(x, BOTTOM)); g.stroke(); }
  const ys = [TOP, TOP + HEADER, ...BANDS.map(band => band.bottom)];
  for (const y of ys) { g.beginPath(); g.moveTo(xAt(COLS[0], y), yAt(COLS[0], y)); g.lineTo(xAt(COLS[12], y), yAt(COLS[12], y)); g.stroke(); }
  g.fillStyle = "#222"; g.font = "20px sans-serif";
  for (let r = 0; r < ROWS; r++) for (let k = 0; k < 12; k++) {
    const y = TOP + HEADER + r * PITCH + 27;
    g.fillText(String(1000 + r * 7 + k), xAt(COLS[k], y) + 18, yAt(COLS[k], y));
  }
  return canvas;
}
/** Where a vertical rule really is inside one row band: the darkest column near x. */
function ruleX(canvas: any, x0: number, band: { top: number; bottom: number }) {
  const data = canvas.getContext("2d").getImageData(0, band.top + 5, W, band.bottom - band.top - 10).data;
  const rows = band.bottom - band.top - 10;
  let best = -1, bestX = x0;
  for (let x = x0 - 25; x <= x0 + 25; x++) {
    let ink = 0;
    for (let y = 0; y < rows; y++) if (data[(y * W + x) * 4] < 100) ink++;
    if (ink > best) { best = ink; bestX = x; }
  }
  return bestX;
}
const check = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed.push(name); };

await check("a table whose rules drift down the page is straightened back to its header positions", () => {
  const slanted = table(18);
  const last = BANDS[BANDS.length - 1];
  const before = COLS.map(x => ruleX(slanted, x, last) - x);
  assert.ok(Math.max(...before) >= 12, `the drawn drift is real (${before.join(",")})`);
  const out = straightenTable(lib, slanted, { cols: COLS, bands: BANDS });
  assert.ok(out, "a drifted table is straightened");
  assert.ok(out!.shift >= 12, `the measured shift is the drawn drift (${out!.shift})`);
  const after = COLS.map(x => ruleX(out!.surface, x, last) - x);
  assert.ok(after.every(offset => Math.abs(offset) <= 2), `every rule is back within 2 px at the last row (${after.join(",")})`);
  /* The geometry handed back is the one the page now has: the same columns, at their header positions, and the same rows. */
  assert.equal(out!.geometry.cols.length, COLS.length);
  assert.ok(out!.geometry.cols.every((x, index) => Math.abs(x - COLS[index]) <= 2), `columns stay at the header (${out!.geometry.cols.join(",")})`);
  assert.equal(out!.geometry.bands.length, BANDS.length);
  assert.ok(out!.geometry.bands.every((band, index) => Math.abs(band.top - BANDS[index].top) <= 3), "rows stay where the table's middle has them");
  /* The header is where the rules are measured: straightening never moves it. */
  const header = { top: TOP + 4, bottom: TOP + HEADER - 4 };
  assert.ok(COLS.every(x => Math.abs(ruleX(out!.surface, x, header) - ruleX(slanted, x, header)) <= 1), "the header band stays where it was");
});

await check("row rules that tilt across the table are levelled", () => {
  const tilted = table(0, 12);
  const out = straightenTable(lib, tilted, { cols: COLS, bands: BANDS });
  assert.ok(out, "a tilted table is straightened");
  /* Measure the last row rule's height at the left and right ends. */
  const ruleY = (canvas: any, x: number) => {
    const data = canvas.getContext("2d").getImageData(x, BOTTOM - 25, 1, 50).data;
    let best = -1, bestY = 0;
    for (let y = 0; y < 50; y++) if (255 - data[y * 4] > best) { best = 255 - data[y * 4]; bestY = y; }
    return BOTTOM - 25 + bestY;
  };
  const leftBefore = ruleY(tilted, COLS[0] + 30), rightBefore = ruleY(tilted, COLS[12] - 30);
  const leftAfter = ruleY(out!.surface, COLS[0] + 30), rightAfter = ruleY(out!.surface, COLS[12] - 30);
  assert.ok(Math.abs(leftBefore - rightBefore) >= 8, `the drawn tilt is real (${leftBefore} vs ${rightBefore})`);
  assert.ok(Math.abs(leftAfter - rightAfter) <= 2, `the rule is level after (${leftAfter} vs ${rightAfter})`);
});

await check("a straight table is never touched", () => {
  assert.equal(straightenTable(lib, table(0), { cols: COLS, bands: BANDS }), null);
  assert.equal(straightenTable(lib, table(1.5), { cols: COLS, bands: BANDS }), null, `under ${STRAIGHTEN_MIN_SHIFT} px is not a slant`);
});

await check("one disturbed rule on a straight table does not make the page slanted", () => {
  /* sampleB_200lowcon (2026-09-27): the worst rule 5.1 px, the typical rule 0.2 px — warping the page around that one
     trace broke its reference column. A stroke drawn beside one rule in the lower rows reproduces it. */
  const canvas = table(0), g = canvas.getContext("2d");
  /* The rule itself is erased from the middle down and redrawn peeling away from where it was — 0 px at band 8,
     7 px at the last band — so one trace drifts while every other rule stays put. */
  const x = COLS[6], from = BANDS[8].top, to = BANDS[23].bottom;
  g.fillStyle = "#fff"; g.fillRect(x - 3, from + 2, 7, to - from);
  g.strokeStyle = "#111"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, from); g.lineTo(x + 7, to); g.stroke();
  assert.equal(straightenTable(lib, canvas, { cols: COLS, bands: BANDS }), null);
});

await check("a double border that collapses onto one stroke keeps the real rule where it is", () => {
  /* Independent review: the header saw a second rule 10 px left of the table's first rule; both trace onto the real
     stroke. The rule that JUMPED is the stray one — the real rule must not be pushed 10 px into its cell. */
  const cols = [COLS[0] - 10, ...COLS];
  const out = straightenTable(lib, table(18), { cols, bands: BANDS });
  assert.ok(out, "the slanted table is still straightened");
  assert.ok(Math.abs(out!.geometry.cols[1] - COLS[0]) <= 2, `the real first rule stays at ${COLS[0]} (got ${out!.geometry.cols[1]})`);
  assert.ok(out!.geometry.cols[0] < out!.geometry.cols[1], "and the stray rule stays before it");
});

await check("a page without traceable rules keeps its original image", () => {
  const blank = lib.createCanvas(W, H), g = blank.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  assert.equal(straightenTable(lib, blank, { cols: COLS, bands: BANDS }), null);
});

await check("readGrid cuts every strip from the straightened page, and merged rows keep the printed order", () => {
  const source = readFileSync(new URL("../src/utils/documentOcr.ts", import.meta.url), "utf8");
  /* Straightened once, before the binarized copy is made, and only when the straightened page still proves the table. */
  /* …and the reader keeps the columns it measured: re-detecting on the straightened page finds rules that were slanted
     inside the header and changes the column count (1.pdf p3: 27 → 30), and its edge windows are counted in columns. */
  assert.match(source, /const straightened=straightenTable\(lib,surface,geometry\);\s*if\(straightened\)\{surface=straightened\.surface;geometry=straightened\.geometry;\}/);
  assert.doesNotMatch(source, /adaptiveGridGeometry\(lib,straightened\.surface\)/);
  assert.ok(source.indexOf("const straightened=straightenTable(lib,surface,geometry)") < source.indexOf("const bin=otsuBinarize(lib,surface);"), "the binarized page is made from the straightened one");
  /* Grid rows carry their height on the 842 scale, and the merge sorts by it. */
  assert.match(source, /y:\(\(bands\[row\]\.top\+bands\[row\]\.bottom\)\/2\)\*842\/Math\.max\(1,image\.width\)/);
  assert.match(source, /gridRows=\[\.\.\.wordLane\.rows,\.\.\.missing\]\.map\(\(row,index\)=>\(\{row,index\}\)\)\s*\.sort\(/);
});

console.log(JSON.stringify({ passed: passed.length, checks: passed }, null, 2));
