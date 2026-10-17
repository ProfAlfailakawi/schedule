import React, { useLayoutEffect, useState } from "react";
import type { CurriculumCourseRule } from "../types";

export interface PlanEdge { from: number; to: number; optional: boolean }

/** كلُّ مسبقٍ يربط مقرره بالمقرر الذي يشترطه؛ «أحدها» يُرسم متقطعاً. */
export function planEdges(rules: readonly CurriculumCourseRule[], visible: ReadonlySet<number>): PlanEdge[] {
  const out: PlanEdge[] = [];
  for (const rule of rules) {
    if (!rule.prereq || !visible.has(rule.courseId)) continue;
    const seen = new Set<number>();
    for (const id of rule.prereq.all) if (visible.has(id) && !seen.has(id)) { seen.add(id); out.push({ from: id, to: rule.courseId, optional: false }); }
    for (const id of rule.prereq.anyOf.flat()) if (visible.has(id) && !seen.has(id)) { seen.add(id); out.push({ from: id, to: rule.courseId, optional: true }); }
  }
  return out;
}

interface Path { key: string; d: string; x: number; y: number; from: number; to: number; optional: boolean }

/** خيوطُ المسبقات فوق الخريطة: ظاهرةٌ دائماً، وعند تحديد مقررٍ تُضاء سلسلته ويخفت الباقي. */
export default function PlanMapLines({ mapRef, edges, focus, up, down, layoutKey }: {
  mapRef: React.RefObject<HTMLDivElement | null>; edges: PlanEdge[]; focus: number; up: ReadonlySet<number>; down: ReadonlySet<number>; layoutKey: string;
}) {
  const [geo, setGeo] = useState<{ w: number; h: number; paths: Path[] }>({ w: 0, h: 0, paths: [] });
  useLayoutEffect(() => {
    const root = mapRef.current;
    if (!root) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const rects = new Map<number, DOMRect>();
      root.querySelectorAll<HTMLElement>("[data-cid]").forEach(el => rects.set(Number(el.dataset.cid), el.getBoundingClientRect()));
      const paths: Path[] = [];
      for (const e of edges) {
        const a = rects.get(e.from), b = rects.get(e.to);
        if (!a || !b) continue;
        const ay = a.top + a.height / 2 - box.top, by = b.top + b.height / 2 - box.top;
        let x1: number, x2: number, c1: number, c2: number;
        if (Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)) < 24) {
          x1 = a.left - box.left; x2 = b.left - box.left; c1 = x1 - 38; c2 = x2 - 38;
        } else {
          const toLeft = a.left + a.width / 2 > b.left + b.width / 2;
          x1 = (toLeft ? a.left : a.right) - box.left;
          x2 = (toLeft ? b.right : b.left) - box.left;
          const dx = Math.max(36, Math.abs(x2 - x1) / 2);
          c1 = x1 + (toLeft ? -dx : dx); c2 = x2 + (toLeft ? dx : -dx);
        }
        paths.push({ key: `${e.from}-${e.to}`, d: `M${x1},${ay} C${c1},${ay} ${c2},${by} ${x2},${by}`, x: x2, y: by, from: e.from, to: e.to, optional: e.optional });
      }
      setGeo({ w: box.width, h: box.height, paths });
    };
    measure();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(root);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [mapRef, edges, layoutKey]);

  if (!geo.paths.length) return null;
  return (
    <svg className="pr-lines" width={geo.w} height={geo.h} viewBox={`0 0 ${geo.w} ${geo.h}`} aria-hidden="true" focusable="false">
      {geo.paths.map(p => {
        const tone = !focus ? "" : up.has(p.from) && (up.has(p.to) || p.to === focus) ? "up" : (p.from === focus || down.has(p.from)) && down.has(p.to) ? "down" : "dim";
        return (
          <g key={p.key} className={`pr-line ${tone}${p.optional ? " opt" : ""}`}>
            <path d={p.d} />
            <circle cx={p.x} cy={p.y} r={3.2} />
          </g>
        );
      })}
    </svg>
  );
}
