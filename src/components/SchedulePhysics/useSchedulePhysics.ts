import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type { FSchedule } from "../../types";
import { magnetStrength, rotationForVelocity } from "./physics";
import type { ScheduleDayKey, SchedulePhysicsDecision, SchedulePhysicsDragState, SchedulePhysicsDropRequest, SchedulePhysicsTarget } from "./types";
import useReducedMotion from "./useReducedMotion";

type EvaluateTarget = (row: FSchedule, target: SchedulePhysicsTarget, signal: AbortSignal) => Promise<SchedulePhysicsDecision>;

interface Options {
  disabled?: boolean;
  evaluateTarget: EvaluateTarget;
  onStart?: (row: FSchedule, sourceDay: ScheduleDayKey) => void;
  onDecision?: (decision: SchedulePhysicsDecision | null, target: SchedulePhysicsTarget | null) => void;
  onDropRequest: (request: SchedulePhysicsDropRequest) => void;
  onCancel?: (reason: "escape" | "outside" | "same" | "invalid") => void;
  onInvalid?: (decision: SchedulePhysicsDecision | null) => void;
}

interface Session {
  pointerId: number;
  pointerType: string;
  row: FSchedule;
  sourceDay: ScheduleDayKey;
  sourceStart: string;
  sourceRect: DOMRect;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  pointerX: number;
  pointerY: number;
  previousX: number;
  previousY: number;
  previousAt: number;
  velocityX: number;
  velocityY: number;
  currentX: number;
  currentY: number;
  motionVX: number;
  motionVY: number;
  lastFrameAt: number;
  active: boolean;
  ending: boolean;
  target: SchedulePhysicsTarget | null;
  targetKey: string;
  decision: SchedulePhysicsDecision | null;
  longPressTimer?: number;
}

const IDLE: SchedulePhysicsDragState = {
  phase: "idle", row: null, sourceDay: null, sourceStart: "", target: null, decision: null,
  pointerType: "", velocityX: 0, velocityY: 0,
};

function targetFromPoint(x: number, y: number): SchedulePhysicsTarget | null {
  const hit = document.elementFromPoint(x, y) as HTMLElement | null;
  let slot = hit?.closest?.("[data-physics-slot='true']") as HTMLElement | null;
  // Events sit above the slot grid. Resolve the slot beneath an occupied card from its day column,
  // so conflict-heavy targets can still be evaluated rather than becoming accidental dead zones.
  if (!slot) {
    const column = hit?.closest?.("[data-physics-day-column='true']") as HTMLElement | null;
    if (column) {
      const slots = Array.from(column.querySelectorAll<HTMLElement>("[data-physics-slot='true']"));
      const firstRect = slots[0]?.getBoundingClientRect(), lastRect = slots[slots.length - 1]?.getBoundingClientRect();
      if (firstRect && lastRect && y >= firstRect.top && y < lastRect.bottom) slot = slots.find(item => { const rect = item.getBoundingClientRect(); return y >= rect.top && y < rect.bottom; })
        || slots.reduce<HTMLElement | null>((best, item) => {
          if (!best) return item;
          const a = item.getBoundingClientRect(), b = best.getBoundingClientRect();
          return Math.abs((a.top + a.bottom) / 2 - y) < Math.abs((b.top + b.bottom) / 2 - y) ? item : best;
        }, null);
    }
  }
  if (!slot) return null;
  const day = slot.dataset.physicsDay as ScheduleDayKey | undefined;
  const start = slot.dataset.physicsStart || "";
  if (!day || !start) return null;
  return { day, start, label: slot.dataset.physicsLabel || "", rect: slot.getBoundingClientRect() };
}

export default function useSchedulePhysics(options: Options) {
  const { disabled = false } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<SchedulePhysicsDragState>(IDLE);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  // When a real drag last ended. A drag ends in a click too, and the card's
  // click opens the full course page — so the card needs to know that the press
  // it just saw was a move, not an "open this". Geometry alone was deciding it,
  // and a drag that travelled five pixels and came back still read as a click.
  const dragEndedAtRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const evalTimerRef = useRef<number | null>(null);
  const evalAbortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, SchedulePhysicsDecision>());
  const settlingRef = useRef<{ mode: "drop" | "return"; started: number; destination: { x: number; y: number } } | null>(null);

  const clearEvaluation = useCallback(() => {
    if (evalTimerRef.current) window.clearTimeout(evalTimerRef.current);
    evalTimerRef.current = null;
    evalAbortRef.current?.abort();
    evalAbortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearEvaluation();
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    const session = sessionRef.current;
    if (session?.longPressTimer) window.clearTimeout(session.longPressTimer);
    if (session?.active) dragEndedAtRef.current = performance.now();
    settlingRef.current = null;
    sessionRef.current = null;
    document.documentElement.classList.remove("schedule-physics-active");
    setState(IDLE);
    optionsRef.current.onDecision?.(null, null);
  }, [clearEvaluation]);

  const finishReturn = useCallback((reason: "escape" | "outside" | "same" | "invalid") => {
    const session = sessionRef.current;
    if (!session || session.ending) return;
    session.ending = true;
    clearEvaluation();
    settlingRef.current = {
      mode: "return",
      started: performance.now(),
      destination: { x: session.sourceRect.left, y: session.sourceRect.top },
    };
    setState(prev => ({ ...prev, phase: "returning" }));
    if (reason === "invalid") optionsRef.current.onInvalid?.(session.decision);
    else optionsRef.current.onCancel?.(reason);
  }, [clearEvaluation]);

  const runEvaluation = useCallback((session: Session, target: SchedulePhysicsTarget) => {
    clearEvaluation();
    const key = `${session.row.id}:${target.day}:${target.start}`;
    const cached = cacheRef.current.get(key);
    if (cached) {
      session.decision = cached;
      setState(prev => ({ ...prev, target, decision: cached }));
      optionsRef.current.onDecision?.(cached, target);
      return;
    }
    const loading: SchedulePhysicsDecision = {
      key, quality: "unknown", title: "أقرأ أثر القرار…", summary: "أحسب التعارضات والفراغ والضغط والجودة دون حفظ أي شيء.",
      reasons: [], positives: [], tradeoffs: [], conflicts: [], ripple: null, why: null, whyNot: null, loading: true, dataAvailable: false,
    };
    session.decision = loading;
    setState(prev => ({ ...prev, target, decision: loading }));
    optionsRef.current.onDecision?.(loading, target);
    evalTimerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      evalAbortRef.current = controller;
      try {
        const decision = await optionsRef.current.evaluateTarget(session.row, target, controller.signal);
        if (controller.signal.aborted) return;
        cacheRef.current.set(key, decision);
        const current = sessionRef.current;
        if (!current || current.targetKey !== key || current.row.id !== session.row.id) return;
        current.decision = decision;
        setState(prev => ({ ...prev, target: current.target, decision }));
        optionsRef.current.onDecision?.(decision, current.target);
      } catch (error: any) {
        if (controller.signal.aborted || error?.name === "AbortError") return;
        const fallback: SchedulePhysicsDecision = {
          key, quality: "unknown", title: "لا توجد بيانات كافية", summary: "تعذر جلب قراءة القرار اللحظية. لم يتم حفظ أي تغيير.",
          reasons: [], positives: [], tradeoffs: [], conflicts: [], ripple: null, why: null, whyNot: null, dataAvailable: false,
        };
        cacheRef.current.set(key, fallback);
        const current = sessionRef.current;
        if (!current || current.targetKey !== key) return;
        current.decision = fallback;
        setState(prev => ({ ...prev, decision: fallback }));
        optionsRef.current.onDecision?.(fallback, current.target);
      }
    }, 125);
  }, [clearEvaluation]);

  const updateTarget = useCallback((session: Session) => {
    const target = targetFromPoint(session.pointerX, session.pointerY);
    const key = target ? `${session.row.id}:${target.day}:${target.start}` : "";
    if (key === session.targetKey) {
      if (target && session.target) session.target.rect = target.rect;
      return;
    }
    session.target = target;
    session.targetKey = key;
    session.decision = null;
    if (!target) {
      clearEvaluation();
      setState(prev => ({ ...prev, target: null, decision: null }));
      optionsRef.current.onDecision?.(null, null);
      return;
    }
    runEvaluation(session, target);
  }, [clearEvaluation, runEvaluation]);

  const animate = useCallback((now: number) => {
    const session = sessionRef.current;
    if (!session) { frameRef.current = null; return; }
    const overlay = overlayRef.current;
    const settling = settlingRef.current;
    let desiredX = session.pointerX - session.offsetX;
    let desiredY = session.pointerY - session.offsetY;

    if (settling) {
      desiredX = settling.destination.x;
      desiredY = settling.destination.y;
    } else if (session.target?.rect && !reducedMotion) {
      const quality = session.decision?.quality || "unknown";
      const strength = magnetStrength(quality);
      if (strength) {
        const baseCenterX = desiredX + session.sourceRect.width / 2;
        const baseCenterY = desiredY + session.sourceRect.height / 2;
        const targetCenterX = session.target.rect.left + session.target.rect.width / 2;
        const targetCenterY = session.target.rect.top + Math.min(session.target.rect.height, session.sourceRect.height) / 2;
        const maxBias = quality === "suboptimal" ? 3.5 : 7;
        desiredX += Math.max(-maxBias, Math.min(maxBias, (targetCenterX - baseCenterX) * strength));
        desiredY += Math.max(-maxBias, Math.min(maxBias, (targetCenterY - baseCenterY) * strength));
      }
    }

    if (reducedMotion) {
      session.currentX = desiredX;
      session.currentY = desiredY;
      session.motionVX = 0;
      session.motionVY = 0;
    } else {
      // Restrained damped spring: enough mass/momentum to feel physical without game-like bounce.
      const dt = Math.max(0.5, Math.min(2, (now - session.lastFrameAt) / 16.67 || 1));
      session.lastFrameAt = now;
      const stiffness = settling ? 0.18 : 0.15;
      const damping = settling ? 0.58 : 0.55;
      session.motionVX = (session.motionVX + (desiredX - session.currentX) * stiffness * dt) * Math.pow(damping, dt);
      session.motionVY = (session.motionVY + (desiredY - session.currentY) * stiffness * dt) * Math.pow(damping, dt);
      session.motionVX = Math.max(-18, Math.min(18, session.motionVX));
      session.motionVY = Math.max(-18, Math.min(18, session.motionVY));
      session.currentX += session.motionVX * dt;
      session.currentY += session.motionVY * dt;
    }
    const rotation = settling ? 0 : rotationForVelocity(session.velocityX, reducedMotion);
    if (overlay) {
      overlay.style.width = `${session.sourceRect.width}px`;
      overlay.style.minHeight = `${session.sourceRect.height}px`;
      overlay.style.transform = `translate3d(${session.currentX}px, ${session.currentY}px, 0) rotate(${rotation}deg)`;
      overlay.style.setProperty("--physics-vx", String(session.velocityX));
      overlay.style.setProperty("--physics-vy", String(session.velocityY));
    }

    if (settling) {
      const elapsed = now - settling.started;
      const distance = Math.hypot(desiredX - session.currentX, desiredY - session.currentY);
      if (reducedMotion || (elapsed > 150 && distance < 2.5) || elapsed > 360) {
        if (settling.mode === "drop" && session.target && session.sourceDay) {
          const request: SchedulePhysicsDropRequest = { row: session.row, sourceDay: session.sourceDay, target: session.target, decision: session.decision };
          reset();
          optionsRef.current.onDropRequest(request);
          return;
        }
        reset();
        return;
      }
    }
    frameRef.current = requestAnimationFrame(animate);
  }, [reducedMotion, reset]);

  const ensureAnimation = useCallback(() => {
    if (frameRef.current == null) frameRef.current = requestAnimationFrame(animate);
  }, [animate]);

  const activate = useCallback((session: Session) => {
    if (session.active || session.ending) return;
    session.active = true;
    // Cache only within one drag gesture so evaluations never outlive a schedule change.
    cacheRef.current.clear();
    session.currentX = session.sourceRect.left;
    session.currentY = session.sourceRect.top;
    session.motionVX = 0;
    session.motionVY = 0;
    session.lastFrameAt = performance.now();
    document.documentElement.classList.add("schedule-physics-active");
    setState({
      phase: "dragging", row: session.row, sourceDay: session.sourceDay, sourceStart: session.sourceStart,
      target: null, decision: null, pointerType: session.pointerType, velocityX: 0, velocityY: 0,
    });
    optionsRef.current.onStart?.(session.row, session.sourceDay);
    ensureAnimation();
  }, [ensureAnimation]);

  const onPointerMove = useCallback((event: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId || session.ending) return;
    const now = performance.now();
    const dt = Math.max(8, now - session.previousAt);
    const dx = event.clientX - session.previousX;
    const dy = event.clientY - session.previousY;
    const rawVx = dx / dt * 16.67;
    const rawVy = dy / dt * 16.67;
    session.velocityX = session.velocityX * 0.58 + rawVx * 0.42;
    session.velocityY = session.velocityY * 0.58 + rawVy * 0.42;
    session.previousX = event.clientX;
    session.previousY = event.clientY;
    session.previousAt = now;
    session.pointerX = event.clientX;
    session.pointerY = event.clientY;

    if (!session.active) {
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (session.pointerType === "touch") {
        if (distance > 12 && session.longPressTimer) {
          window.clearTimeout(session.longPressTimer);
          session.longPressTimer = undefined;
          reset();
        }
        return;
      }
      if (distance < 5) return;
      activate(session);
    }
    if (event.cancelable) event.preventDefault();
    updateTarget(session);
    // Position/velocity are written directly to the floating transform in RAF.
    // Keeping pointermove out of React state prevents a full schedule render per pixel.
    ensureAnimation();
  }, [activate, ensureAnimation, reset, updateTarget]);

  const settleDrop = useCallback((session: Session) => {
    if (!session.target?.rect) { finishReturn("outside"); return; }
    if (session.decision?.quality === "impossible" || session.decision?.hardBlocked) { finishReturn("invalid"); return; }
    session.ending = true;
    clearEvaluation();
    const rect = session.target.rect;
    settlingRef.current = {
      mode: "drop", started: performance.now(),
      destination: { x: rect.left + (rect.width - session.sourceRect.width) / 2, y: rect.top + 1 },
    };
    setState(prev => ({ ...prev, phase: "settling" }));
    ensureAnimation();
  }, [clearEvaluation, ensureAnimation, finishReturn]);

  const onPointerUp = useCallback((event: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (session.longPressTimer) window.clearTimeout(session.longPressTimer);
    session.longPressTimer = undefined;
    if (!session.active) { reset(); return; }
    if (event.cancelable) event.preventDefault();
    settleDrop(session);
  }, [reset, settleDrop]);

  const onPointerCancel = useCallback((event: PointerEvent) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    if (session.active) finishReturn("outside"); else reset();
  }, [finishReturn, reset]);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp, { passive: false });
    window.addEventListener("pointercancel", onPointerCancel, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [onPointerCancel, onPointerMove, onPointerUp]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const session = sessionRef.current;
      if (!session?.active) return;
      event.preventDefault();
      finishReturn("escape");
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [finishReturn]);

  /**
   * A drag cannot outlive the window's attention.
   *
   * The settle runs on animation frames, and a hidden tab stops giving them —
   * so a card released just before switching away would hang in the air and,
   * worse, leave a live session behind that refuses every later drag. Losing
   * focus or visibility now sends the card home and clears the session.
   */
  useEffect(() => {
    const stand = () => {
      const session = sessionRef.current;
      if (!session) return;
      if (session.active && !session.ending) finishReturn("outside");
      else if (!session.active) reset();
    };
    const onVisibility = () => { if (document.hidden) stand(); };
    window.addEventListener("blur", stand);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", stand);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [finishReturn, reset]);

  useEffect(() => { if (disabled && sessionRef.current) reset(); }, [disabled, reset]);
  useEffect(() => () => reset(), [reset]);

  const bindEvent = useCallback((row: FSchedule, sourceDay: ScheduleDayKey) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) return;
      // A session left behind — a pointerup swallowed by the window, a tab
      // switched mid-drag — used to lock dragging out permanently: every later
      // press saw a live session, refused, and fell through to the card's click,
      // which opens the full course page. That is the "I can no longer drag
      // anything, it just opens the lecture" failure. A stale session is now
      // cleared and the new press proceeds; only a genuinely live drag refuses.
      if (sessionRef.current) {
        if (sessionRef.current.active) return;
        reset();
      }
      const target = event.target as HTMLElement;
      if (target.closest("button,input,select,textarea,a,[data-no-physics='true']")) return;
      const element = event.currentTarget as HTMLElement;
      const rect = element.getBoundingClientRect();
      const session: Session = {
        pointerId: event.pointerId, pointerType: event.pointerType || "mouse", row, sourceDay, sourceStart: row.fstarttime,
        sourceRect: rect, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
        startX: event.clientX, startY: event.clientY, pointerX: event.clientX, pointerY: event.clientY,
        previousX: event.clientX, previousY: event.clientY, previousAt: performance.now(), velocityX: 0, velocityY: 0,
        currentX: rect.left, currentY: rect.top, motionVX: 0, motionVY: 0, lastFrameAt: performance.now(), active: false, ending: false, target: null, targetKey: "", decision: null,
      };
      sessionRef.current = session;
      setState({ phase: "armed", row, sourceDay, sourceStart: row.fstarttime, target: null, decision: null, pointerType: session.pointerType, velocityX: 0, velocityY: 0 });
      if (event.pointerType === "touch") {
        // A finger may drag the card from anywhere on it, not only from the grip
        // — the grip is a two-millimetre target on a phone. Only the grip claims
        // the gesture outright; elsewhere the press merely arms a long press, so
        // a finger that moves on to scroll the week still scrolls it.
        if (target.closest("[data-physics-handle='true']")) event.preventDefault();
        session.longPressTimer = window.setTimeout(() => activate(session), 260);
      }
    },
  }), [activate, disabled, reset]);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session?.active) finishReturn("escape");
  }, [finishReturn]);

  /**
   * Did the press that just finished move a card?
   *
   * The card's own click opens the lecture for editing. A drag ends in a click
   * as well, so without this the move and the "open it" are the same event and
   * the full course page appears on top of a card the person only wanted to
   * relocate. The window is short — long enough for the click that follows the
   * release, too short to swallow a real second click.
   */
  const didDrag = useCallback(() => performance.now() - dragEndedAtRef.current < 400, []);

  const supported = useMemo(() => typeof window !== "undefined" && "PointerEvent" in window, []);
  return { state, overlayRef, bindEvent, cancel, didDrag, reducedMotion, supported };
}
