/**
 * ── الصحيفة العامة التفاعلية (لكل قسم) ──────────────────────────────────────
 *
 * تولّد صفحةَ الخطة بالتصميم نفسه الذي اعتمده المالك لقسم تكنولوجيا التعليم
 * (public/plans/educational-technology): أعمدةٌ بألوانها، بطاقاتٌ خفيفة، أسهمٌ متعامدةٌ
 * بلون المقرر السابق، وشريطُ اختياري ذهبي، ورمزُ QR للرابط الرسمي — بلا شعار قسمٍ.
 * الأعمدةُ هنا «مستويات» (١٠٠…٤٠٠) كما في شاشة الصحيفة داخل البرنامج، لا سنواتٍ وفصول.
 *
 * الدالة نقيّة: نموذجٌ (بيانات الصحيفة المعتمدة) ← نصُّ HTML. القالبُ (الخطوط والتفاعل والطباعة)
 * في public/plans/_template/sheet.html ويُمرَّر هنا نصّاً، فلا قراءةَ ملفاتٍ داخل الطلب.
 */
import qrFactory from "../utils/qrcodeGenerator";
import type { SheetCourse, SheetElective, SheetGroup, SheetModel } from "../types";

export type { SheetCourse, SheetElective, SheetGroup, SheetModel };

export interface SheetTemplateParts { template: string }

const W_MIN = 1754;
const COL_W = 322, COL_GAP = 128, CARD_W = 262, CARD_H = 60, ROW = 72, PAD_L = 48;
const LEVEL_PALETTE: Array<[string, string]> = [
  ["#2563EB", "#DBEAFE"], ["#059669", "#D1FAE5"], ["#7C3AED", "#EDE9FE"], ["#EA580C", "#FFEDD5"], ["#475569", "#E2E8F0"],
];
/** ألوانُ الأسهم بترتيب أرقام المقررات المصدِّرة، كما في صفحة قسم تكنولوجيا التعليم. */
const HUES = ["#D81B60", "#1E88E5", "#2E7D32", "#8E24AA", "#EF6C00", "#00838F", "#3949AB", "#B71C1C", "#689F38", "#0097A7", "#6D4C41", "#5E35B1", "#F9A825", "#0277BD", "#00897B", "#AD1457", "#546E7A"];
const PILL_COLORS = ["#2563EB", "#059669", "#7C3AED", "#EA580C"];
const GRAY = "#64748B";

const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n1 = (x: number) => Math.round(x * 10) / 10;
type Pt = [number, number];

/** مسارٌ متعامد بزوايا مستديرة نصفُ قطرها ٨. */
function rounded(points: Pt[], radius = 8): string {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  let d = `M${n1(pts[0][0])} ${n1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy), r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) { d += ` L${n1(cx)} ${n1(cy)}`; continue; }
    d += ` L${n1(cx + (px - cx) / l1 * r)} ${n1(cy + (py - cy) / l1 * r)} Q${n1(cx)} ${n1(cy)} ${n1(cx + (nx - cx) / l2 * r)} ${n1(cy + (ny - cy) / l2 * r)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${n1(last[0])} ${n1(last[1])}`;
}

/** تلوينُ فترات: المتداخلتان في مسارين، وغيرُ المتداخلتين تتشاركان مساراً. */
function assignLanes(items: Array<{ lo: number; hi: number }>): { lane: number[]; count: number } {
  const order = items.map((_, i) => i).sort((a, b) => items[a].lo - items[b].lo || items[a].hi - items[b].hi);
  const ends: number[] = [], lane: number[] = new Array(items.length).fill(0);
  for (const i of order) {
    let k = ends.findIndex(end => end + 6 < items[i].lo);
    if (k < 0) { k = ends.length; ends.push(items[i].hi); } else ends[k] = items[i].hi;
    lane[i] = k;
  }
  return { lane, count: ends.length };
}

function qrPath(text: string, x: number, y: number, size: number): string {
  const qr = (qrFactory as any)(0, "M");
  qr.addData(text); qr.make();
  const count: number = qr.getModuleCount(), cell = size / count;
  let d = "";
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${(x + c * cell).toFixed(2)} ${(y + r * cell).toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
  return d;
}

const AR_PICK: Record<number, string> = { 1: "مقرراً واحداً", 2: "مقررين", 3: "ثلاثة مقررات", 4: "أربعة مقررات", 5: "خمسة مقررات" };
const levelLabel = (level: number) => level ? `المستوى ${level}` : "بلا مستوى";

/** اسمُ المقرر في بطاقة: سطرٌ واحد بخطٍّ أصغر عند الضرورة، وإلا سطران متوازنان. */
function nameLines(name: string, avail: number): { lines: string[]; size: number } {
  const width = (s: string, fs: number) => s.length * fs * 0.5;
  for (const fs of [16, 15, 14]) if (width(name, fs) <= avail) return { lines: [name], size: fs };
  const words = name.split(" ");
  let best: string[] = [name], bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const w = Math.max(a.length, b.length);
    if (w < bestW) { bestW = w; best = [a, b]; }
  }
  const fs = best.every(line => width(line, 14) <= avail) ? 14 : 13;
  return { lines: best, size: fs };
}

interface Placed { c: SheetCourse; id: string; col: number; row: number; x: number; y: number; }

export function buildPlanSheet(model: SheetModel, parts: SheetTemplateParts): string {
  const wide = model.layout === "wide";
  /* رمزُ العرض: آخرُ ثلاث خانات للرمز الجامعي، وبالرمز الكامل إن تصادم اثنان. */
  const shortOf = new Map<string, string>();
  const all = [...model.courses.map(c => c.code), ...model.groups.flatMap(g => g.courses.map(c => c.code))];
  const tail = (code: string) => (/^\d{7}$/.test(code) ? code.slice(-3) : code);
  const tails = new Map<string, number>();
  for (const code of all) tails.set(tail(code), (tails.get(tail(code)) || 0) + 1);
  for (const code of all) shortOf.set(code, (tails.get(tail(code)) || 0) > 1 ? code : tail(code));
  const idOf = (code: string) => shortOf.get(code) || code;

  const levels = [...new Set(model.courses.map(c => c.level))].sort((a, b) => (a || 9e9) - (b || 9e9));
  const colOf = new Map(levels.map((l, i) => [l, i]));
  const n = Math.max(1, levels.length);
  const colsTotal = n * COL_W + (n - 1) * COL_GAP;
  const W = Math.max(W_MIN, 84 + colsTotal);
  const x0 = (W - colsTotal) / 2;
  const colX = (i: number) => x0 + (n - 1 - i) * (COL_W + COL_GAP);

  /* ── الأعمدة والبطاقات ──────────────────────────────────────────────── */
  const byCol: SheetCourse[][] = levels.map(l => model.courses.filter(c => c.level === l).sort((a, b) => a.code.localeCompare(b.code)));
  const known = new Set(all);
  const edges = model.edges.filter(([s, t]) => known.has(s) && known.has(t) && s !== t);
  const hues = new Map<string, string>();
  [...new Set(edges.map(e => e[0]))].sort((a, b) => Number(idOf(a)) - Number(idOf(b)) || a.localeCompare(b)).forEach((code, i) => hues.set(code, HUES[i % HUES.length]));

  const placed = new Map<string, Placed>();
  const mapEdges = edges.filter(([, t]) => model.courses.some(c => c.code === t));
  const colIdx = (code: string) => colOf.get(model.courses.find(c => c.code === code)?.level ?? -1) ?? -1;
  const skipCount = mapEdges.filter(([s, t]) => Math.abs(colIdx(s) - colIdx(t)) > 1 && colIdx(s) >= 0 && colIdx(t) >= 0).length;
  const cardsTop = 270 + Math.max(0, skipCount * 6 - 20);
  byCol.forEach((list, col) => list.forEach((c, row) => placed.set(c.code, { c, id: idOf(c.code), col, row, x: colX(col) + PAD_L, y: cardsTop + row * ROW })));
  const maxRows = Math.max(1, ...byCol.map(l => l.length));

  /* ── الأسهم: مسارٌ لكل جذعٍ (مقرر سابق ← ممرّ) بتلوين فترات ───────────── */
  type Seg = { key: string; lo: number; hi: number; region: [number, number] };
  const segs: Seg[] = [];
  const segIndex = new Map<string, number>();
  const regionOf = (gutter: string): [number, number] => {
    if (gutter.startsWith("m")) { const c = Number(gutter.slice(1)); return [colX(c) + 6, colX(c) + PAD_L - 8]; }
    const a = Number(gutter.slice(1)); // الممرّ بين العمودين a وa+1 (a+1 أقصى اليسار)
    return [colX(a + 1) + PAD_L + CARD_W + 12, colX(a) + PAD_L - 12];
  };
  const touch = (key: string, gutter: string, y1: number, y2: number) => {
    let i = segIndex.get(key);
    if (i === undefined) { i = segs.length; segIndex.set(key, i); segs.push({ key, lo: Math.min(y1, y2), hi: Math.max(y1, y2), region: regionOf(gutter) }); }
    else { segs[i].lo = Math.min(segs[i].lo, y1, y2); segs[i].hi = Math.max(segs[i].hi, y1, y2); }
  };
  const gutterKey = (a: number, b: number) => `g${Math.min(a, b)}`;

  /* منافذُ الدخول على حافة البطاقة: موزّعةٌ وفق عدد الداخل. */
  const incoming = new Map<string, Array<{ s: string; side: "r" | "l" }>>();
  const sideOf = (s: string, t: string): "r" | "l" => {
    const cs = colIdx(s), ct = colIdx(t);
    return ct > cs ? "r" : ct < cs ? "l" : "l"; /* السهم الغربي يدخل الحافةَ اليمنى للهدف؛ الشرقيّ واللفّات اليسرى */
  };
  for (const [s, t] of mapEdges) {
    const key = `${t}|${sideOf(s, t)}`;
    const list = incoming.get(key) || [];
    list.push({ s, side: sideOf(s, t) }); incoming.set(key, list);
  }
  const portY = (s: string, t: string): number => {
    const target = placed.get(t)!, list = incoming.get(`${t}|${sideOf(s, t)}`) || [];
    list.sort((p, q) => (placed.get(p.s)?.y ?? 0) - (placed.get(q.s)?.y ?? 0));
    const idx = Math.max(0, list.findIndex(p => p.s === s)), step = Math.min(11, 36 / Math.max(1, list.length));
    return target.y + 12 + idx * step;
  };

  interface Route { s: string; t: string; pts: (lanes: number[]) => Pt[]; keys: string[]; skipChan?: number }
  const routes: Route[] = [];
  let chan = 0;
  for (const [s, t] of mapEdges) {
    const A = placed.get(s), B = placed.get(t);
    if (!A || !B) continue;
    const ys = A.y + 48, yt = portY(s, t), cs = A.col, ct = B.col;
    if (cs === ct) {
      const key = `${s}#m${cs}`; touch(key, `m${cs}`, ys, yt);
      routes.push({ s, t, keys: [key], pts: ([lx]) => [[A.x, ys], [lx, ys], [lx, yt], [B.x, yt]] });
    } else if (Math.abs(cs - ct) === 1) {
      const key = `${s}#${gutterKey(cs, ct)}`; touch(key, gutterKey(cs, ct), ys, yt);
      const west = ct > cs;
      routes.push({ s, t, keys: [key], pts: ([lx]) => west
        ? [[A.x, ys], [lx, ys], [lx, yt], [B.x + CARD_W, yt]]
        : [[A.x + CARD_W, ys], [lx, ys], [lx, yt], [B.x, yt]] });
    } else {
      const west = ct > cs, yc = 250 + chan * 6; chan++;
      const g1 = west ? gutterKey(cs, cs + 1) : gutterKey(cs, cs - 1), g2 = west ? gutterKey(ct - 1, ct) : gutterKey(ct + 1, ct);
      const k1 = `${s}#${g1}#c`, k2 = `${s}>${t}#${g2}#c`;
      touch(k1, g1, ys, yc); touch(k2, g2, yc, yt);
      routes.push({ s, t, keys: [k1, k2], pts: ([l1, l2]) => west
        ? [[A.x, ys], [l1, ys], [l1, yc], [l2, yc], [l2, yt], [B.x + CARD_W, yt]]
        : [[A.x + CARD_W, ys], [l1, ys], [l1, yc], [l2, yc], [l2, yt], [B.x, yt]] });
    }
  }
  /* تلوينُ الفترات لكل ممرٍّ على حدة، ثم موضعُ كل مسار داخل الممر. */
  const laneX = new Map<string, number>();
  const gutters = new Map<string, number[]>();
  segs.forEach((seg, i) => { const g = seg.region.join(":"); (gutters.get(g) || gutters.set(g, []).get(g)!).push(i); });
  for (const [g, idxs] of gutters) {
    const [lo, hi] = g.split(":").map(Number);
    const { lane, count } = assignLanes(idxs.map(i => segs[i]));
    const pitch = Math.min(8, (hi - lo) / (count + 1));
    idxs.forEach((i, k) => laneX.set(segs[i].key, hi - (lane[k] + 1) * pitch));
  }

  const edgeSvg: string[] = [];
  const drawn = new Map<string, string>();
  for (const r of routes) {
    const hue = hues.get(r.s) || GRAY, d = rounded(r.pts(r.keys.map(k => laneX.get(k) ?? 0)));
    const group = `<g class="edge" data-s="${esc(idOf(r.s))}" data-t="${esc(idOf(r.t))}"><path d="${d}" fill="none" stroke="#fff" stroke-width="5.5" stroke-opacity=".9" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${hue}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#m${esc(idOf(r.s))})"/></g>`;
    drawn.set(`${r.s}>${r.t}`, group); edgeSvg.push(group);
  }

  /* ── ارتفاعُ الأعمدة ومفتاحُ الأسهم ───────────────────────────────────── */
  const bodyBottom = cardsTop + maxRows * ROW + 8;
  const lastCol = byCol[n - 1] || [];
  const freeLeft = bodyBottom - (cardsTop + lastCol.length * ROW);
  const keyBox = !wide && mapEdges.length > 0;
  const needExtra = keyBox && freeLeft < 130;
  const colBottom = bodyBottom + (needExtra ? 130 : 0);
  const colH = colBottom - 180;

  const out: string[] = [];
  const defs = `<defs><filter id="sh" x="-5%" y="-15%" width="110%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#0B2545" flood-opacity=".12"/></filter><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF4FF"/><stop offset="1" stop-color="#F8FAFC"/></linearGradient>${[...hues].map(([code, hue]) => `<marker id="m${esc(idOf(code))}" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9.5" refY="6" orient="auto"><path d="M0,1 L10,6 L0,11 Z" fill="${hue}"/></marker>`).join("")}</defs>`;

  /* ── الترويسة: الاسم، رمز QR، الشرائح ────────────────────────────────── */
  const units = (c: { credit: number }) => Number(c.credit) || 0;
  const electiveUnits = model.groups.reduce((sum, g) => sum + g.pick * (g.courses.length ? Math.max(...g.courses.map(units)) : 0), 0);
  const ownUnits = model.courses.reduce((sum, c) => sum + units(c), 0);
  const byCategory = new Map<string, number>();
  for (const c of model.courses) if (c.category) byCategory.set(c.category, (byCategory.get(c.category) || 0) + units(c));
  const pills = model.pills || [
    { n: ownUnits + electiveUnits, label: "وحدة" },
    ...(byCategory.size ? [...byCategory].slice(0, 3).map(([label, total]) => ({ n: total, label })) : [{ n: ownUnits, label: "إجباري" }]),
    ...(electiveUnits ? [{ n: electiveUnits, label: "اختياري" }] : []),
  ].slice(0, 4);
  const cx = W / 2;
  const title = model.title;
  out.push(`<rect width="${W}" height="@H@" fill="url(#bg)"/>`);
  out.push(`<text x="${W - 42}" y="154" direction="ltr" text-anchor="end" font-size="${model.planLabel.length > 12 ? 24 : 30}" font-weight="300" fill="#0B2545" letter-spacing="1">${esc(model.planLabel)}</text>`);
  out.push(`<text x="${W - 42 - 168}" y="152" text-anchor="start" font-size="14" font-weight="500" fill="#64748B">الخطة الدراسية</text>`);
  out.push(`<a href="${esc(model.url)}" aria-label="رمز QR للنسخة التفاعلية"><rect x="38" y="28" width="136" height="136" rx="16" fill="#fff" stroke="#CBD5E1" stroke-width="1"/><path d="${qrPath(model.url, 50, 40, 112)}" fill="#0B2545" shape-rendering="crispEdges"/></a>`);
  out.push(`<text x="184" y="90" text-anchor="end" font-size="16" font-weight="700" fill="#0B2545">النسخة التفاعلية</text><text x="184" y="116" text-anchor="end" font-size="14" font-weight="500" fill="#64748B">امسح الرمز لتفتح الخطة</text>`);
  out.push(`<text x="${cx}" y="68" text-anchor="middle" font-size="${title.length > 26 ? 38 : 46}" font-weight="900" fill="#0B2545">${esc(title)}</text>`);
  out.push(`<rect x="${cx - 60}" y="82" width="120" height="5" rx="2.5" fill="#2563EB"/><rect x="${cx - 60}" y="82" width="30" height="5" rx="2.5" fill="#EA580C"/>`);
  const pw = 196, pg = 10, ptotal = pills.length * pw + (pills.length - 1) * pg;
  pills.forEach((p, i) => {
    const px = cx + ptotal / 2 - (i + 1) * pw - i * pg, col = PILL_COLORS[i % PILL_COLORS.length];
    out.push(`<rect x="${px}" y="104" width="${pw}" height="52" rx="26" fill="#fff" stroke="${col}" stroke-opacity=".45" stroke-width="1.5" filter="url(#sh)"/><text x="${px + 162}" y="140" text-anchor="middle" font-size="28" font-weight="900" fill="${col}">${p.n}</text><text x="${px + 76}" y="136" text-anchor="middle" font-size="15" font-weight="700" fill="#334155">${esc(p.label)}</text>`);
  });

  /* ── أعمدةُ المستويات ─────────────────────────────────────────────────── */
  const cardSvg = (code: string, label: string, credit: number, x: number, y: number, w: number, stroke: string, tint: string, numColor: string, dashed = false) => {
    const cy = y + CARD_H / 2, avail = w - 112;
    const nl = nameLines(label, avail);
    const textY = nl.lines.length === 2 ? [cy - 3, cy + 14] : [cy + (nl.size >= 16 ? 5 : 5)];
    return `<g class="card" data-c="${esc(idOf(code))}" tabindex="0" role="button" aria-label="${esc(`${idOf(code)} ${label}`)}"><rect x="${x}" y="${y}" width="${w}" height="${CARD_H}" rx="15" fill="${tint}" stroke="${stroke}" stroke-opacity=".5" stroke-width="1.5"${dashed ? ' stroke-dasharray="6 4"' : ""} filter="url(#sh)"/><circle cx="${x + w - 24}" cy="${cy}" r="14" fill="${stroke}"/><text x="${x + w - 24}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="900" fill="#fff">${credit}</text>${nl.lines.map((line, k) => `<text x="${x + w - 46}" y="${textY[k]}" text-anchor="start" font-size="${nl.size}" font-weight="700" fill="#1E293B">${esc(line)}</text>`).join("")}<text x="${x + 13}" y="${cy + 9}" text-anchor="end" font-size="25" font-weight="900" fill="${numColor}">${esc(idOf(code))}</text></g>`;
  };

  if (wide) {
    /* قسمٌ مساند بلا تخصص: أشرطةٌ بالعرض بحسب التصنيف، في كلٍّ بطاقاتٌ في صفوف. */
    const buckets = new Map<string, SheetCourse[]>();
    for (const c of model.courses) (buckets.get(c.category || "المقررات") || buckets.set(c.category || "المقررات", []).get(c.category || "المقررات")!).push(c);
    let y = 190;
    [...buckets].forEach(([label, list], bi) => {
      list.sort((a, b) => a.code.localeCompare(b.code));
      const perRow = Math.max(1, Math.floor((W - 84 - 88 + 60) / 410)), rows = Math.ceil(list.length / perRow), h = 78 + rows * 80;
      const [stroke, tint] = LEVEL_PALETTE[bi % LEVEL_PALETTE.length];
      out.push(`<rect x="42" y="${y}" width="${W - 84}" height="${h}" rx="28" fill="${tint}" fill-opacity=".55" stroke="${stroke}" stroke-opacity=".5" stroke-width="1.5"/>`);
      out.push(`<rect x="52" y="${y + 10}" width="${W - 104}" height="46" rx="20" fill="${stroke}"/><text x="${cx}" y="${y + 41}" text-anchor="middle" font-size="24" font-weight="900" fill="#fff">${esc(label)}</text>`);
      list.forEach((c, i) => {
        const r = Math.floor(i / perRow), k = i % perRow, inRow = Math.min(perRow, list.length - r * perRow);
        const rowW = inRow * 350 + (inRow - 1) * 60, startX = cx + rowW / 2 - 350;
        out.push(cardSvg(c.code, c.name, c.credit, startX - k * 410, y + 70 + r * 80, 350, stroke, "#fff", GRAY));
      });
      y += h + 24;
    });
    out.push(`@WIDE_END@${y}`);
  } else {
    levels.forEach((level, i) => {
      const [stroke, tint] = LEVEL_PALETTE[Math.min(i, LEVEL_PALETTE.length - 1)], cxx = colX(i);
      out.push(`<rect x="${cxx}" y="180" width="${COL_W}" height="${colH}" rx="28" fill="${tint}" fill-opacity=".55" stroke="${stroke}" stroke-opacity=".5" stroke-width="1.5"/>`);
      out.push(`<rect x="${cxx + 10}" y="190" width="${COL_W - 20}" height="50" rx="20" fill="${stroke}"/><text x="${cxx + COL_W / 2}" y="225" text-anchor="middle" font-size="26" font-weight="900" fill="#fff">${esc(levelLabel(level))}</text>`);
    });
    out.push(...edgeSvg);
    for (const p of placed.values()) {
      const [stroke] = LEVEL_PALETTE[Math.min(p.col, LEVEL_PALETTE.length - 1)];
      out.push(cardSvg(p.c.code, p.c.name, p.c.credit, p.x, p.y, CARD_W, stroke, "#fff", hues.get(p.c.code) || GRAY));
    }
    if (keyBox) {
      const kx = colX(n - 1) + 20, ky = colBottom - 130;
      out.push(`<g><rect x="${kx}" y="${ky}" width="282" height="112" rx="18" fill="#fff" stroke="#EA580C" stroke-opacity=".35" stroke-dasharray="5 4"/>${["السهم يبدأ من المتطلب", "وينتهي عند المقرر الذي يفتحه", "ولون الرقم هو لون أسهمه"].map((line, k) => `<text x="${kx + 141}" y="${ky + 34 + k * 28}" text-anchor="middle" font-size="16" font-weight="700" fill="#334155">${line}</text>`).join("")}</g>`);
    }
  }

  /* ── أشرطةُ الاختياري ─────────────────────────────────────────────────── */
  let y = wide ? Number(out.pop()!.replace("@WIDE_END@", "")) : colBottom + 24;
  const bandSvg: string[] = [];
  for (const group of model.groups) {
    const perRow = Math.max(1, Math.min(4, Math.floor((W - 84 - 88 + 60) / 410)));
    const rows = Math.ceil(group.courses.length / perRow);
    const prereqOf = (code: string) => edges.filter(([, t]) => t === code).map(([s]) => s);
    const hasArrows = group.courses.some(c => prereqOf(c.code).length);
    const rowH = hasArrows ? 170 : 80, h = 58 + (rows - 1) * rowH + (hasArrows ? 148 : 90);
    bandSvg.push(`<rect x="42" y="${y}" width="${W - 84}" height="${h}" rx="28" fill="#FEF3C7" fill-opacity=".6" stroke="#D97706" stroke-opacity=".5" stroke-width="1.5"/>`);
    bandSvg.push(`<text x="${cx}" y="${y + 41}" text-anchor="middle" font-size="24" font-weight="900" fill="#92400E">${esc(group.title)}${group.pick ? ` - اختر ${AR_PICK[group.pick] || `${group.pick} مقررات`}` : ""}</text>`);
    group.courses.forEach((c, i) => {
      const r = Math.floor(i / perRow), k = i % perRow, inRow = Math.min(perRow, group.courses.length - r * perRow);
      const rowW = inRow * 350 + (inRow - 1) * 60, cxx = cx + rowW / 2 - 350 - k * 410, top = y + 58 + r * rowH;
      const pre = prereqOf(c.code);
      pre.forEach((s, j) => {
        const ax = cxx + 175 + (pre.length === 1 ? 0 : (j === 0 ? 45 : -45)), hue = hues.get(s) || GRAY;
        bandSvg.push(`<g class="edge" data-s="${esc(idOf(s))}" data-t="${esc(idOf(c.code))}"><path d="M${ax} ${top + 112} L${ax} ${top + 72}" stroke="${hue}" stroke-width="2.4" stroke-linecap="round" marker-end="url(#m${esc(idOf(s))})"/><text x="${ax}" y="${top + 138}" text-anchor="middle" font-size="22" font-weight="900" fill="${hue}">${esc(idOf(s))}</text></g>`);
      });
      if (pre.length === 2) bandSvg.push(`<text x="${cxx + 175}" y="${top + 138}" text-anchor="middle" font-size="22" font-weight="900" fill="#475569">+</text>`);
      bandSvg.push(cardSvg(c.code, c.name, c.credit, cxx, top, 350, "#D97706", "#fff", GRAY));
    });
    y += h + 24;
  }
  out.push(...bandSvg);

  /* ── ملاحظاتٌ: متطلباتٌ من أقسامٍ أخرى ────────────────────────────────── */
  if (model.notes.length) {
    const h = 56 + model.notes.length * 28;
    out.push(`<rect x="42" y="${y}" width="${W - 84}" height="${h}" rx="22" fill="#fff" stroke="#CBD5E1" stroke-dasharray="5 4"/><text x="${W - 70}" y="${y + 34}" text-anchor="start" font-size="17" font-weight="900" fill="#0B2545">ملاحظات</text>`);
    model.notes.forEach((note, i) => out.push(`<text x="${W - 70}" y="${y + 66 + i * 28}" text-anchor="start" font-size="15" font-weight="700" fill="#334155">${esc(note)}</text>`));
    y += h + 24;
  }
  const H = y + 50;
  const svg = `<svg id="plan" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" direction="rtl" role="img" aria-label="${esc(title)}">${defs}${out.join("").replace("@H@", String(H))}</svg>`;

  /* ── بياناتُ التفاعل ───────────────────────────────────────────────────── */
  const C: Record<string, [number, string, number, string]> = {};
  const levelIndex = (level: number) => (colOf.get(level) ?? 0) + 1;
  for (const c of model.courses) C[idOf(c.code)] = [levelIndex(c.level), c.name, c.credit, c.category || ""];
  const EL: Record<string, [string, number]> = {};
  for (const g of model.groups) for (const c of g.courses) EL[idOf(c.code)] = [c.name, c.credit];
  const H_: Record<string, string> = {};
  for (const [code, hue] of hues) H_[idOf(code)] = hue;
  const LV: Record<string, [string, string, string]> = {};
  levels.forEach((level, i) => { LV[String(i + 1)] = [LEVEL_PALETTE[Math.min(i, LEVEL_PALETTE.length - 1)][0], LEVEL_PALETTE[Math.min(i, LEVEL_PALETTE.length - 1)][1], levelLabel(level)]; });
  const data = { C, EL, E: edges.map(([s, t]) => [idOf(s), idOf(t)]), H: H_, LV, EL_LABEL: "اختياري" };
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, ch => (ch === "\u2028" ? "\\u2028" : "\\u2029"));

  return parts.template
    .replace("{{TITLE}}", () => esc(`خطة ${title}`))
    .replace("{{DESC}}", () => esc(`الخطة الدراسية — ${title}: المقررات ومسبقاتها حسب الخطة المعتمدة.`))
    .replace("{{SVG}}", () => svg)
    .replace("{{DATA}}", () => json);
}
