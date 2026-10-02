import React from "react";
import { AR, countOf } from "../utils/arabicCount";

/**
 * Presentation-only drawings. Every figure is derived from numbers the caller
 * already holds on screen; nothing here fetches, saves or computes new data.
 */

export interface CampusRisk {
  fromBuilding: string;
  toBuilding: string;
  requiredMinutes: number;
  gapMinutes?: number;
  level?: string;
}

interface Edge { a: string; b: string; minutes: number; count: number; high: boolean }

const MAX_NODES = 8;

/** Buildings as nodes, walking minutes as line weight, tiring hops in the danger colour. */
export function CampusTravelMap({ risks }: { risks: CampusRisk[] }) {
  const model = React.useMemo(() => {
    const edges = new Map<string, Edge>();
    const weight = new Map<string, number>();
    for (const risk of risks || []) {
      const a = String(risk.fromBuilding || "").trim();
      const b = String(risk.toBuilding || "").trim();
      const minutes = Number(risk.requiredMinutes);
      if (!a || !b || a === b || !Number.isFinite(minutes)) continue;
      const key = [a, b].sort().join("|");
      const edge = edges.get(key) || { a, b, minutes: 0, count: 0, high: false };
      edge.minutes = Math.max(edge.minutes, minutes);
      edge.count += 1;
      edge.high = edge.high || risk.level === "high";
      edges.set(key, edge);
      weight.set(a, (weight.get(a) || 0) + 1);
      weight.set(b, (weight.get(b) || 0) + 1);
    }
    const names = [...weight.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, MAX_NODES).map(([name]) => name);
    const kept = new Set(names);
    const list = [...edges.values()].filter(edge => kept.has(edge.a) && kept.has(edge.b));
    return { names, list };
  }, [risks]);

  if (model.names.length < 2 || !model.list.length) return null;

  const W = 360;
  const H = 230;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 128;
  const ry = 78;
  const point = new Map<string, { x: number; y: number }>(model.names.map((name, i): [string, { x: number; y: number }] => {
    const angle = (-Math.PI / 2) + (i * 2 * Math.PI) / model.names.length;
    return [name, { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) }];
  }));
  const maxMinutes = Math.max(1, ...model.list.map(edge => edge.minutes));
  const summary = model.list
    .map(edge => `${edge.a} إلى ${edge.b} ${countOf(edge.minutes, AR.minute)}${edge.high ? " مرهق" : ""}`)
    .join("، ");

  return (
    <figure className="campus-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`خريطة الحرم: ${summary}`}>
        {model.list.map(edge => {
          const p = point.get(edge.a)!;
          const q = point.get(edge.b)!;
          return (
            <g key={`${edge.a}-${edge.b}`} className={edge.high ? "is-high" : "is-guarded"}>
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} strokeWidth={2 + (edge.minutes / maxMinutes) * 6} strokeLinecap="round" />
            </g>
          );
        })}
        {model.list.map(edge => {
          const p = point.get(edge.a)!;
          const q = point.get(edge.b)!;
          return (
            <text key={`t-${edge.a}-${edge.b}`} className="campus-map-min" x={(p.x + q.x) / 2} y={(p.y + q.y) / 2} textAnchor="middle" dominantBaseline="central">
              {edge.minutes.toLocaleString("ar-KW-u-nu-latn")}د
            </text>
          );
        })}
        {model.names.map(name => {
          const p = point.get(name)!;
          return (
            <g key={name} className="campus-map-node" transform={`translate(${p.x} ${p.y})`}>
              <circle r="17" />
              <text textAnchor="middle" dominantBaseline="central" direction="ltr">{name.length > 4 ? `${name.slice(0, 3)}…` : name}</text>
              <title>{name}</title>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/** A worked sum drawn as chips: «a − b = c». */
export function EquationChips({ parts, result, tone }: {
  parts: Array<{ value: string; unit?: string; label: string } | { op: string }>;
  result: { value: string; unit?: string; label: string };
  tone?: "danger" | "ok" | "neutral";
}) {
  return (
    <div className="equation-chips" aria-hidden="true">
      {parts.map((part, i) => "op" in part
        ? <span key={i} className="eq-op">{part.op}</span>
        : <span key={i} className="eq-term"><b dir="ltr">{part.value}{part.unit || ""}</b><small>{part.label}</small></span>)}
      <span className="eq-op">=</span>
      <span className={`eq-term eq-result tone-${tone || "neutral"}`}><b dir="ltr">{result.value}{result.unit || ""}</b><small>{result.label}</small></span>
    </div>
  );
}

/** Read-only n×n heat map; the editable inputs stay where they are. */
export function TravelHeatMatrix({ buildings, pairs, sameBuildingMinutes }: {
  buildings: string[];
  pairs: Array<{ fromBuilding: string; toBuilding: string; minutes: number }>;
  sameBuildingMinutes?: number;
}) {
  const names = buildings.slice(0, 10);
  if (names.length < 2) return null;
  const minutesOf = new Map<string, number>();
  for (const pair of pairs) {
    minutesOf.set(`${pair.fromBuilding}|${pair.toBuilding}`, pair.minutes);
    minutesOf.set(`${pair.toBuilding}|${pair.fromBuilding}`, pair.minutes);
  }
  const shown = new Set(names);
  const values = pairs
    .filter(pair => shown.has(pair.fromBuilding) && shown.has(pair.toBuilding))
    .map(pair => pair.minutes)
    .filter(Number.isFinite);
  const max = Math.max(1, ...values);
  const min = Math.min(max, ...values);
  const fmt = (n: number) => n.toLocaleString("ar-KW-u-nu-latn");
  return (
    <div className="travel-heat" role="img" aria-label={`خريطة حرارية لأزمنة الانتقال بين ${countOf(names.length, AR.building)}، من ${fmt(min)} إلى ${countOf(max, AR.minute)}. التعديل في الحقول أدناه.`}>
      <div className="travel-heat-grid" style={{ gridTemplateColumns: `auto repeat(${names.length}, minmax(34px, 1fr))` }}>
        <span aria-hidden="true" />
        {names.map(name => <b key={`h-${name}`} className="travel-heat-head" dir="ltr">{name}</b>)}
        {names.map(row => (
          <React.Fragment key={row}>
            <b className="travel-heat-head" dir="ltr">{row}</b>
            {names.map(col => {
              if (row === col) {
                return <span key={`${row}-${col}`} className="travel-heat-cell is-self" dir="ltr">{sameBuildingMinutes === undefined ? "—" : fmt(sameBuildingMinutes)}</span>;
              }
              const minutes = minutesOf.get(`${row}|${col}`);
              if (minutes === undefined) return <span key={`${row}-${col}`} className="travel-heat-cell is-self" aria-hidden="true">—</span>;
              const pct = Math.round(12 + (minutes / max) * 70);
              return (
                <span key={`${row}-${col}`} className="travel-heat-cell" dir="ltr" style={{ "--heat-pct": `${pct}%` } as React.CSSProperties} title={`${row} - ${col}: ${minutes}`}>{fmt(minutes)}</span>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
