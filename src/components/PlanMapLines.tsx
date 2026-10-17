import React, { useEffect, useState } from "react";
import type { CurriculumCourseRule } from "../types";

export type PlanId = string | number;
export interface PlanEdge { from: PlanId; to: PlanId; optional: boolean; /** رقم لون المقرر السابق (١–١٠): لونُ رقمه ولونُ أسهمه الخارجة منه. */ hue?: number }

/** لونُ المستوى: ١٠٠→١ … ٤٠٠→٤، وغير المصنف→٥. الرقمُ يحمل لون أسهمه (كما في صفحة الخطة). */
export const levelHue = (level: number) => level >= 100 && level <= 400 ? Math.floor(level / 100) : 5;

/** كلُّ مسبقٍ يربط مقرره بالمقرر الذي يشترطه؛ «أحدها» يُرسم متقطعاً. */
export function planEdges(rules: readonly CurriculumCourseRule[], visible: ReadonlySet<number>, hueOf?: (id: number) => number): PlanEdge[] {
  const out: PlanEdge[] = [];
  for (const rule of rules) {
    if (!rule.prereq || !visible.has(rule.courseId)) continue;
    const seen = new Set<number>();
    for (const id of rule.prereq.all) if (visible.has(id) && !seen.has(id)) { seen.add(id); out.push({ from: id, to: rule.courseId, optional: false, hue: hueOf?.(id) }); }
    for (const id of rule.prereq.anyOf.flat()) if (visible.has(id) && !seen.has(id)) { seen.add(id); out.push({ from: id, to: rule.courseId, optional: true, hue: hueOf?.(id) }); }
  }
  return out;
}

interface Path { key: string; d: string; head: string; from: PlanId; to: PlanId; optional: boolean; hue: number; dur: number; delay: number }
type Pt = [number, number];

const LANE = 8;          // المسافة بين مسارين متجاورين في الممر
const WIDE_MIN = 901;    // أضيق من هذا تُخفى الخيوط وتبقى السلسلة مضاءة بالألوان

/** مسارٌ متعامد بزوايا مستديرة. */
function rounded(points: Pt[], radius: number): string {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy), r = Math.min(radius, l1 / 2, l2 / 2);
    if (r < 0.5) { d += ` L${cx},${cy}`; continue; }
    d += ` L${cx + (px - cx) / l1 * r},${cy + (py - cy) / l1 * r} Q${cx},${cy} ${cx + (nx - cx) / l2 * r},${cy + (ny - cy) / l2 * r}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

/** تلوينُ فترات: كلُّ فترتين متداخلتين في مسارين مختلفين، وغير المتداخلتين تتشاركان مساراً (فيقلّ عدد المسارات). */
function assignLanes(items: Array<{ lo: number; hi: number }>): { lane: number[]; count: number } {
  const order = items.map((_, i) => i).sort((a, b) => items[a].lo - items[b].lo || items[a].hi - items[b].hi);
  const ends: number[] = [], lane: number[] = new Array(items.length).fill(0);
  for (const i of order) {
    let k = ends.findIndex(end => end + 4 < items[i].lo);
    if (k < 0) { k = ends.length; ends.push(items[i].hi); } else ends[k] = items[i].hi;
    lane[i] = k;
  }
  return { lane, count: ends.length };
}

/**
 * خيوطُ المسبقات فوق الخريطة على طريقة خريطة المترو:
 * لكل سهمٍ مسارٌ خاصٌّ في الممرّ بين عمودين (لا تتراكب الأسهم)، ونقاطُ الاتصال موزّعةٌ على حافة البطاقة،
 * والسهمُ الذي يقفز فوق مستوىً كاملاً يمرّ في ممرٍّ علويّ بدل أن يعبر خلف البطاقات.
 * يُضيّق الممرُّ ويتّسع تلقائياً بقدر الحاجة (عبر column-gap وpadding-block-start على الحاوية).
 * الأعمدة تُقرأ من أقرب `section` لكل بطاقة بترتيب ظهورها، والاتجاه من اليمين لليسار.
 */
export default function PlanMapLines({ mapRef, edges, focus, up, down, off, layoutKey }: {
  mapRef: React.RefObject<HTMLDivElement | null>; edges: PlanEdge[]; focus: PlanId; up: ReadonlySet<PlanId>; down: ReadonlySet<PlanId>; /** مقررات غير فعالة بحسب الفلتر: تخفت أسهمها. */ off?: ReadonlySet<PlanId>; layoutKey: string;
}) {
  const [geo, setGeo] = useState<{ w: number; h: number; paths: Path[] }>({ w: 0, h: 0, paths: [] });
  useEffect(() => {
    const root = mapRef.current;
    if (!root) return;
    let appliedGap = -1, appliedPad = -1, retries = 0;
    const apply = (gap: number, pad: number) => {
      if (gap === appliedGap && pad === appliedPad) return false;
      appliedGap = gap; appliedPad = pad;
      root.style.columnGap = gap > 0 ? `${gap}px` : "";
      root.style.paddingBlockStart = pad > 0 ? `${pad}px` : "";
      return true;
    };
    const measure = () => {
      const box = root.getBoundingClientRect();
      if (window.innerWidth < WIDE_MIN) { apply(0, 0); setGeo({ w: 0, h: 0, paths: [] }); return; }
      const secs: Element[] = [];
      const cards = new Map<string, { r: DOMRect; col: number }>();
      root.querySelectorAll<HTMLElement>("[data-cid]").forEach(el => {
        const sec = el.closest("section");
        if (!sec) return;
        let col = secs.indexOf(sec);
        if (col < 0) { secs.push(sec); col = secs.length - 1; }
        cards.set(String(el.dataset.cid), { r: el.getBoundingClientRect(), col });
      });
      const secR = secs.map(s => s.getBoundingClientRect());
      const nCols = secs.length;
      type E = { e: PlanEdge; a: { r: DOMRect; col: number }; b: { r: DOMRect; col: number }; sideA: "L" | "R"; sideB: "L" | "R"; kind: "adj" | "long" | "same"; x1: number; y1: number; x2: number; y2: number };
      const list: E[] = [];
      for (const e of edges) {
        const a = cards.get(String(e.from)), b = cards.get(String(e.to));
        if (!a || !b) continue;
        let sideA: "L" | "R", sideB: "L" | "R", kind: E["kind"];
        if (a.col === b.col) { sideA = sideB = a.col < nCols - 1 ? "L" : "R"; kind = "same"; }
        else if (b.col > a.col) { sideA = "L"; sideB = "R"; kind = b.col - a.col === 1 ? "adj" : "long"; }
        else { sideA = "R"; sideB = "L"; kind = a.col - b.col === 1 ? "adj" : "long"; }
        list.push({ e, a, b, sideA, sideB, kind, x1: 0, y1: 0, x2: 0, y2: 0 });
      }
      if (!list.length) { apply(0, 0); setGeo({ w: box.width, h: box.height, paths: [] }); return; }

      /* نقاطُ الاتصال: على كل حافةٍ تتوزع الأسهم بترتيب ارتفاع الطرف الآخر فلا تتقاطع عند البطاقة. */
      const ports = new Map<string, Array<{ i: number; end: "a" | "b"; other: number }>>();
      list.forEach((it, i) => {
        const push = (id: PlanId, side: string, end: "a" | "b", other: DOMRect) => {
          const k = `${id}|${side}`;
          ports.set(k, [...(ports.get(k) || []), { i, end, other: other.top + other.height / 2 }]);
        };
        push(it.e.from, it.sideA, "a", it.b.r); push(it.e.to, it.sideB, "b", it.a.r);
      });
      ports.forEach(group => {
        group.sort((p, q) => p.other - q.other);
        group.forEach((p, k) => {
          const it = list[p.i], card = p.end === "a" ? it.a : it.b, side = p.end === "a" ? it.sideA : it.sideB;
          const x = (side === "L" ? card.r.left : card.r.right) - box.left, y = card.r.top + (k + 1) / (group.length + 1) * card.r.height - box.top;
          if (p.end === "a") { it.x1 = x; it.y1 = y; } else { it.x2 = x; it.y2 = y; }
        });
      });

      /* مسارات الممرات: كل مقطعٍ رأسيٍّ في ممرٍّ بين عمودين. */
      type Seg = { i: number; part: "m" | "s" | "t"; lo: number; hi: number };
      const gutters = new Map<number, Seg[]>();
      const addSeg = (g: number, s: Seg) => gutters.set(g, [...(gutters.get(g) || []), s]);
      list.forEach((it, i) => {
        const ca = it.a.col, cb = it.b.col;
        if (it.kind === "same") addSeg(it.sideA === "L" ? ca : ca - 1, { i, part: "m", lo: Math.min(it.y1, it.y2), hi: Math.max(it.y1, it.y2) });
        else if (it.kind === "adj") addSeg(Math.min(ca, cb), { i, part: "m", lo: Math.min(it.y1, it.y2), hi: Math.max(it.y1, it.y2) });
        else {
          const dir = cb > ca ? 1 : -1;
          addSeg(dir > 0 ? ca : ca - 1, { i, part: "s", lo: 0, hi: it.y1 });
          addSeg(dir > 0 ? cb - 1 : cb, { i, part: "t", lo: 0, hi: it.y2 });
        }
      });
      let maxLanes = 1;
      const laneX = new Map<string, number>();
      gutters.forEach((segs, g) => {
        const { lane, count } = assignLanes(segs);
        maxLanes = Math.max(maxLanes, count);
        const left = secR[g + 1]?.right ?? secR[g].left - 40, right = secR[g]?.left ?? left + 40;
        const mid = (left + right) / 2 - box.left, spacing = Math.min(LANE, Math.max(3, (right - left - 20) / Math.max(1, count - 1)));
        segs.forEach((s, k) => laneX.set(`${s.i}:${s.part}`, mid + (lane[k] - (count - 1) / 2) * spacing));
      });

      /* الممرّ العلوي لما يقفز فوق مستوى: صفوفٌ بحسب تداخل الامتداد الأفقي. */
      const longs = list.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === "long");
      const rows = assignLanes(longs.map(({ i }) => { const s = laneX.get(`${i}:s`)!, t = laneX.get(`${i}:t`)!; return { lo: Math.min(s, t), hi: Math.max(s, t) }; }));
      const corridorY = new Map<number, number>();
      longs.forEach(({ i }, k) => corridorY.set(i, 10 + rows.lane[k] * LANE));

      /* الاتساع المطلوب: يُضبط ثم تُعاد القياسات (مع حدٍّ أعلى للمحاولات). */
      const needGap = Math.min(150, Math.max(40, Math.ceil(((maxLanes - 1) * LANE + 32) / 8) * 8));
      const needPad = longs.length ? rows.count * LANE + 22 : 0;
      if (apply(needGap, needPad) && retries++ < 4) { requestAnimationFrame(measure); return; }
      retries = 0;

      const paths: Path[] = list.map((it, i) => {
        const m = laneX.get(`${i}:m`), s = laneX.get(`${i}:s`), t = laneX.get(`${i}:t`), cy = corridorY.get(i);
        const pts: Pt[] = it.kind === "long"
          ? [[it.x1, it.y1], [s!, it.y1], [s!, cy!], [t!, cy!], [t!, it.y2], [it.x2, it.y2]]
          : [[it.x1, it.y1], [m!, it.y1], [m!, it.y2], [it.x2, it.y2]];
        const prevX = pts[pts.length - 2][0], dir = it.x2 >= prevX ? 1 : -1, L = 8, W = 4.5;
        const length = pts.reduce((sum, p, k) => k ? sum + Math.abs(p[0] - pts[k - 1][0]) + Math.abs(p[1] - pts[k - 1][1]) : 0, 0);
        const dur = Math.max(2.4, length / 90);
        return {
          key: `${it.e.from}-${it.e.to}`, d: rounded(pts, 7), from: it.e.from, to: it.e.to, optional: it.e.optional, hue: it.e.hue || 10, dur, delay: -((i * 0.61) % dur),
          /* رأسُ السهم عند المقرر الذي يشترط، يتجه مع آخر مقطعٍ أفقي. */
          head: `M${it.x2},${it.y2} L${it.x2 - dir * L},${it.y2 - W} L${it.x2 - dir * L},${it.y2 + W} Z`,
        };
      });
      setGeo({ w: box.width, h: box.height, paths });
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    ro?.observe(root);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    void document.fonts?.ready.then(measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", onResize); root.style.columnGap = ""; root.style.paddingBlockStart = ""; };
  }, [mapRef, edges, layoutKey]);

  if (!geo.paths.length) return null;
  return (
    <svg className="pr-lines" style={{ width: geo.w, height: geo.h, maxWidth: "none" }} width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true" focusable="false">
      {geo.paths.map(p => {
        const tone = off && (off.has(p.from) || off.has(p.to)) ? "off" : !focus ? "" : up.has(p.from) && (up.has(p.to) || p.to === focus) ? "up" : (p.from === focus || down.has(p.from)) && down.has(p.to) ? "down" : "dim";
        return (
          <g key={p.key} className={`pr-line ${tone}${p.optional ? " opt" : ""}`} style={{ ["--arrow" as string]: `var(--series-${p.hue})` }}>
            <path d={p.d} />
            <path className="pr-head" d={p.head} />
            <circle className="pr-dot" r="3.2"><animateMotion dur={`${p.dur.toFixed(2)}s`} begin={`${p.delay.toFixed(2)}s`} repeatCount="indefinite" path={p.d} /></circle>
          </g>
        );
      })}
    </svg>
  );
}
