import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { formatScheduleTimeRange } from "../utils/scheduleTime";

/**
 * The wait itself becomes the show.
 *
 * While the genesis draft is being built on the server, the real entities of
 * the schedule — course names, faculty, rooms, days and times — float freely
 * across a quiet stage. Pairs that would collide (same room, same instructor)
 * drift apart from each other. The moment the real result arrives, every
 * element glides onto the exact cell of the real preview table where it
 * belongs, so the motion resolves seamlessly into the actual timetable.
 *
 * Rules honoured here:
 * - transform + opacity only (WAAPI), no layout thrash during animation;
 * - the result is never held back more than ~1s once it is ready;
 * - prefers-reduced-motion renders a minimal quiet caption instead, and the
 *   table appears immediately (the parent skips the settle phase entirely).
 */

export type ChoreoPhase = "idle" | "drift" | "settle";

type ChipKind = "course" | "instructor" | "room" | "day" | "time";

interface Chip {
  id: string;
  kind: ChipKind;
  label: string;
  ltr?: boolean;
  /** Home position, in viewport percent. */
  x: number;
  y: number;
  /** Index of the chip this one "conflicts" with (repels from), if any. */
  repelFrom?: number;
}

const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];

/** Deterministic-enough pseudo random, seeded per activation. */
function makeRandom(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sample<T>(list: T[], count: number, rand: () => number): T[] {
  const pool = list.slice();
  const out: T[] = [];
  while (pool.length && out.length < count) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
}

function truncate(text: string, max: number) {
  const clean = String(text || "").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function buildChips(
  rows: FSchedule[],
  courses: AdCourse[],
  instructors: AdInstructor[],
  rand: () => number,
  compact: boolean,
): Chip[] {
  const courseNames = new Set<string>();
  rows.forEach((r) => r.AdCourseName && courseNames.add(String(r.AdCourseName)));
  courses.forEach((c: any) => c?.CourseName && courseNames.add(String(c.CourseName)));
  const instructorNames = new Set<string>();
  rows.forEach((r: any) => {
    const found = instructors.find((i) => i.AdInstructorId === r.AdInstructorId);
    if (found?.AdInstructorName) instructorNames.add(String(found.AdInstructorName));
  });
  instructors.forEach((i) => i?.AdInstructorName && instructorNames.add(String(i.AdInstructorName)));
  const roomNames = new Set<string>();
  rows.forEach((r: any) => {
    const room = [r.AdRoomCode, r.AdRoomHall].filter(Boolean).join("/");
    if (room) roomNames.add(room);
  });
  const times = new Set<string>();
  rows.forEach((r: any) => {
    const t = formatScheduleTimeRange(r.fstarttime, r.fendtime);
    if (t && t !== "—") times.add(t);
  });
  if (!times.size) ["08:00 - 08:50", "10:00 - 10:50", "12:00 - 12:50"].forEach((t) => times.add(t));

  const counts = compact
    ? { course: 5, instructor: 4, room: 3, day: 3, time: 3 }
    : { course: 7, instructor: 6, room: 4, day: 4, time: 4 };
  const spec: Array<[ChipKind, string[], number, boolean]> = [
    ["course", [...courseNames], counts.course, false],
    ["instructor", [...instructorNames], counts.instructor, false],
    ["room", [...roomNames], counts.room, true],
    ["day", DAY_LABELS, counts.day, false],
    ["time", [...times], counts.time, true],
  ];

  const chips: Chip[] = [];
  spec.forEach(([kind, list, count, ltr]) => {
    sample(list, count, rand).forEach((label, index) => {
      chips.push({
        id: `${kind}-${index}-${label}`,
        kind,
        label: truncate(label, kind === "course" ? 26 : 22),
        ltr,
        // Scatter across the stage, keeping clear of the very edges and of
        // the centered caption band.
        x: 8 + rand() * 80,
        y: 10 + rand() * 72,
        repelFrom: undefined,
      });
    });
  });
  // Nominate a few "conflicts": pairs that drift apart from one another, the
  // visual grammar for "this combination cannot hold".
  const pairCount = Math.min(3, Math.floor(chips.length / 6));
  const indices = sample(chips.map((_, i) => i), pairCount * 2, rand);
  for (let p = 0; p < pairCount; p++) {
    const a = indices[p * 2], b = indices[p * 2 + 1];
    // Pull the pair close together first so the repulsion reads.
    const cx = 20 + rand() * 55, cy = 15 + rand() * 55;
    chips[a].x = cx; chips[a].y = cy;
    chips[b].x = cx + 6; chips[b].y = cy + 5;
    chips[a].repelFrom = b;
    chips[b].repelFrom = a;
  }
  return chips;
}

interface Props {
  phase: ChoreoPhase;
  rows: FSchedule[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  /** Container that holds the destination table (the real preview). */
  targetRoot: React.RefObject<HTMLElement | null>;
  onSettled: () => void;
}

export default function GenesisChoreography({ phase, rows, courses, instructors, targetRoot, onSettled }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const settleStarted = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const chips = useMemo(() => {
    if (phase === "idle") return [] as Chip[];
    const rand = makeRandom(Date.now() & 0xffff);
    const compact = typeof window !== "undefined" && window.innerWidth < 560;
    return buildChips(rows, courses, instructors, rand, compact);
    // Chips are frozen for the duration of one activation on purpose: the
    // same physical elements that floated are the ones that settle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase !== "idle"]);

  // Phase 1 — drift. Every chip breathes on its own rhythm; conflicting
  // pairs carry an extra additive animation pushing them apart and back.
  useEffect(() => {
    if (phase !== "drift" || !stageRef.current) return;
    settleStarted.current = false;
    const rand = makeRandom((Date.now() >> 4) & 0xffff);
    const nodes: HTMLElement[] = Array.from(stageRef.current.querySelectorAll<HTMLElement>("[data-choreo-chip]"));
    const animations: Animation[] = [];
    nodes.forEach((node, index) => {
      const dx = 18 + rand() * 26, dy = 14 + rand() * 22;
      const rot = (rand() - 0.5) * 4;
      // Entrance: fade up softly, staggered.
      animations.push(node.animate(
        [
          { opacity: 0, transform: "translate3d(0, 14px, 0) scale(0.94)" },
          { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        ],
        { duration: 620, delay: 40 * index, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
      ));
      // Perpetual drift, additive so it layers over everything else.
      animations.push(node.animate(
        [
          { transform: "translate3d(0, 0, 0) rotate(0deg)" },
          { transform: `translate3d(${dx}px, ${-dy}px, 0) rotate(${rot}deg)` },
          { transform: `translate3d(${-dx * 0.7}px, ${dy * 0.8}px, 0) rotate(${-rot}deg)` },
          { transform: "translate3d(0, 0, 0) rotate(0deg)" },
        ],
        {
          duration: 7000 + rand() * 4000,
          delay: -rand() * 5000,
          iterations: Infinity,
          easing: "ease-in-out",
          composite: "add",
        },
      ));
      const chip = chips[index];
      if (chip?.repelFrom != null) {
        const partner = chips[chip.repelFrom];
        // Push away from the partner along the axis between them.
        const ax = chip.x - (partner?.x ?? chip.x), ay = chip.y - (partner?.y ?? chip.y);
        const norm = Math.hypot(ax, ay) || 1;
        const px = (ax / norm) * 30, py = (ay / norm) * 30;
        animations.push(node.animate(
          [
            { transform: "translate3d(0,0,0)", opacity: 1 },
            { transform: `translate3d(${px}px, ${py}px, 0)`, opacity: 0.55, offset: 0.5 },
            { transform: "translate3d(0,0,0)", opacity: 1 },
          ],
          { duration: 3600, iterations: Infinity, easing: "ease-in-out", composite: "add" },
        ));
      }
    });
    return () => animations.forEach((a) => a.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "drift", chips]);

  // Phase 2 — settle. Each chip flies to the real cell it belongs to inside
  // the freshly rendered preview table; unmatched chips bow out quietly.
  useEffect(() => {
    if (phase !== "settle" || !stageRef.current) return;
    if (settleStarted.current) return;
    settleStarted.current = true;
    let cancelled = false;
    const finish = () => { if (!cancelled) onSettledRef.current(); };
    // Hard cap: whatever happens, the stage clears well under 1.5s.
    const failsafe = window.setTimeout(finish, 1400);

    const raf = requestAnimationFrame(() => {
      const stage = stageRef.current;
      const root = targetRoot.current;
      if (!stage) return finish();
      const nodes: HTMLElement[] = Array.from(stage.querySelectorAll<HTMLElement>("[data-choreo-chip]"));
      const targets: HTMLElement[] = root
        ? Array.from(root.querySelectorAll<HTMLElement>("[data-choreo-target]"))
        : [];
      const viewH = window.innerHeight, viewW = window.innerWidth;
      const claimed = new Set<HTMLElement>();
      const pickTarget = (kind: string, label: string) => {
        let fallback: HTMLElement | null = null;
        for (const el of targets) {
          if (claimed.has(el) || el.dataset.choreoTarget !== kind) continue;
          const rect = el.getBoundingClientRect();
          if (rect.bottom < 0 || rect.top > viewH || rect.width < 8) continue;
          if ((el.textContent || "").includes(label.replace("…", ""))) { claimed.add(el); return el; }
          if (!fallback) fallback = el;
        }
        if (fallback) claimed.add(fallback);
        return fallback;
      };
      let last: Animation | null = null;
      nodes.forEach((node, index) => {
        const chip = chips[index];
        const from = node.getBoundingClientRect();
        const target = chip ? pickTarget(chip.kind, chip.label) : null;
        const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
        const delay = Math.min(index * 26, 340);
        let anim: Animation;
        if (target) {
          const to = target.getBoundingClientRect();
          const tx = to.left + to.width / 2 - (from.left + from.width / 2);
          const ty = to.top + to.height / 2 - (from.top + from.height / 2);
          anim = node.animate(
            [
              { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
              { transform: `translate3d(${tx}px, ${ty}px, 0) scale(0.72)`, opacity: 0.9, offset: 0.82 },
              { transform: `translate3d(${tx}px, ${ty}px, 0) scale(0.6)`, opacity: 0 },
            ],
            { duration: 680, delay, easing: ease, fill: "forwards" },
          );
        } else {
          // No seat on the visible table: this element was not part of the
          // final answer — it drifts off and dissolves.
          const offX = from.left < viewW / 2 ? -60 : 60;
          anim = node.animate(
            [
              { transform: "translate3d(0,0,0) scale(1)", opacity: 1 },
              { transform: `translate3d(${offX}px, -34px, 0) scale(0.92)`, opacity: 0 },
            ],
            { duration: 520, delay, easing: ease, fill: "forwards" },
          );
        }
        last = anim;
      });
      const veil = stage.querySelector<HTMLElement>("[data-choreo-veil]");
      veil?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 260, easing: "ease-out", fill: "forwards" });
      if (last) (last as Animation).onfinish = finish; else finish();
    });
    return () => { cancelled = true; window.clearTimeout(failsafe); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === "settle", chips, targetRoot]);

  if (phase === "idle" || typeof document === "undefined") return null;

  return createPortal(
    <div className="choreo-stage" ref={stageRef} role="status" aria-live="polite" aria-label="يجري بناء الجدول الآن">
      <div className="choreo-veil" data-choreo-veil aria-hidden="true" />
      {chips.map((chip) => (
        <span
          key={chip.id}
          data-choreo-chip
          className={`choreo-chip choreo-${chip.kind}${chip.repelFrom != null ? " choreo-conflict" : ""}`}
          style={{ insetInlineStart: `${chip.x}%`, top: `${chip.y}%` }}
          dir={chip.ltr ? "ltr" : undefined}
          aria-hidden="true"
        >
          {chip.label}
        </span>
      ))}
      {phase === "drift" ? (
        <p className="choreo-caption">
          <strong>تُنسَج المسودة الآن</strong>
          <span>المقررات والأساتذة والقاعات تبحث عن مواضعها الصحيحة…</span>
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
