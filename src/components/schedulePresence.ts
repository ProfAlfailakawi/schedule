/**
 * ── من غيري على هذا الجدول ──────────────────────────────────────────────────
 *
 * Two coordinators open the same department in the same week, and each works as
 * though they were alone. They are not: one is about to move a lecture the other
 * has already picked up, and the first either of them learns of it is a refusal
 * at save time, or worse, silence and a schedule nobody meant.
 *
 * This module is the small channel that fixes that. It carries one person's
 * position up — the cell under their pointer, the card in their hand, the row
 * open in their editor — and hands back the same thing about everyone else on
 * the board.
 *
 * Three decisions worth stating, because each is load-bearing:
 *
 *   1. **It is not React.** A colleague's pointer moves several times a second,
 *      and the board is a very large component tree. Remote marks are painted
 *      onto the DOM directly, inside one animation frame, at a cost measured by
 *      what CHANGED and never by how many lectures are on screen. Only the list
 *      of who is here — which changes on arrival and departure, not on movement
 *      — is allowed to be state.
 *
 *   2. **It never says you are alone.** It reports the people it can see. If a
 *      colleague is served by a different server instance, they are invisible
 *      here, and an interface that turned that into «لا أحد معك» would be
 *      confidently wrong at the exact moment being wrong is expensive.
 *
 *   3. **It decides nothing.** A ring around a card is a warning, never a lock.
 *      The guarantee stays where it already was — the row's revision, checked
 *      inside the write, refused as a conflict if it moved underneath. Presence
 *      only moves the discovery earlier, from after the save to before it.
 */

export interface PresenceMark {
  cell: { day: string; start: string; room?: string } | null;
  holding: { rowId: number; rev: number } | null;
  editing: { rowId: number; rev: number } | null;
}

export interface PresencePeer extends PresenceMark {
  connId: string;
  userId: number;
  name: string;
}

export interface PresenceScope { collegeId: number; sectionId: number; termId: number }

/** The smallest gap between two beats. A pointer crossing the week must not
 *  become a POST per cell it passes over. */
const MIN_INTERVAL_MS = 300;

const emptyMark = (): PresenceMark => ({ cell: null, holding: null, editing: null });

const sameMark = (a: PresenceMark, b: PresenceMark) =>
  JSON.stringify(a) === JSON.stringify(b);

export interface PresenceClient {
  /** Names this browser's stream; goes on the EventSource URL. */
  readonly connId: string;
  /** Merge a partial mark and schedule a beat. */
  send(patch: Partial<PresenceMark>): void;
  /** Where this browser is looking. Changing it re-homes the person. */
  setScope(scope: PresenceScope): void;
  /** A frame arrived on the stream. */
  ingest(frame: { scope: string; peers: PresencePeer[] }): void;
  /** Who else is here, right now, without a re-render to ask. */
  peers(): PresencePeer[];
  /** Someone else holding or editing this row, if anyone. */
  claimant(rowId: number): PresencePeer | null;
  /** Fires only when someone ARRIVES or LEAVES — the one thing allowed to
   *  reach React, because it is the only part that changes rarely. */
  onRoster(listener: (peers: PresencePeer[]) => void): () => void;
  /** Fires on every frame, including a colleague merely moving. For the
   *  painter, which writes to the DOM and never re-renders anything. */
  onFrame(listener: (peers: PresencePeer[]) => void): () => void;
  /** Leaving: clears the mark now, and survives the page going away. */
  leave(): void;
  dispose(): void;
}

export function createPresenceClient(currentUserId = 0): PresenceClient {
  const connId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

  let scope: PresenceScope = { collegeId: 0, sectionId: 0, termId: 0 };
  let mark: PresenceMark = emptyMark();
  let sent: PresenceMark = emptyMark();
  let roster: PresencePeer[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastBeat = 0;
  let disposed = false;
  const listeners = new Set<(peers: PresencePeer[]) => void>();
  const frameListeners = new Set<(peers: PresencePeer[]) => void>();

  const body = (extra?: Record<string, unknown>) =>
    JSON.stringify({ conn: connId, scope, ...mark, ...extra });

  const beat = () => {
    if (disposed) return;
    lastBeat = Date.now();
    sent = { ...mark };
    void fetch("/api/auth/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body(),
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      // A missed beat is not an error worth showing anyone. The next one
      // carries the whole position again, and the server forgets a silent
      // connection on its own.
    });
  };

  /**
   * @param force  Send even from a hidden tab.
   *
   * The distinction matters more than it looks. A hidden tab is not a place
   * anyone is looking FROM, so a pointer position from one is noise and is
   * suppressed. But WHICH BOARD a person is on is not a pointer position — it
   * is the address their colleagues' rosters are keyed by, and suppressing it
   * meant a tab that happened to be in the background when the board opened
   * never announced itself at all, and nothing ever announced it later.
   */
  const schedule = (force = false) => {
    if (disposed || timer) return;
    if (!force && typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (!force && sameMark(mark, sent)) return;
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastBeat));
    timer = setTimeout(() => { timer = null; beat(); }, wait);
  };

  /* Coming back to a tab is an arrival: the position that was held back while
     it was hidden is announced now, in one beat. */
  const onVisible = () => { if (document.visibilityState === "visible") schedule(true); };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);

  const announce = () => { for (const listener of listeners) listener(roster); };
  const announceFrame = () => { for (const listener of frameListeners) listener(roster); };

  return {
    connId,

    send(patch) {
      mark = { ...mark, ...patch };
      schedule();
    },

    setScope(next) {
      if (next.collegeId === scope.collegeId && next.sectionId === scope.sectionId
        && next.termId === scope.termId) return;
      scope = next;
      // Moving to another board drops whatever was marked on the old one, and
      // the server is told at once rather than at the next pointer move.
      mark = emptyMark();
      sent = { cell: { day: "", start: "" }, holding: null, editing: null };
      roster = [];
      announce();
      // Forced: an address, not a mouse position. Until the server has it, this
      // person is filed under the wrong board and sees nobody on the right one.
      schedule(true);
    },

    ingest(frame) {
      if (!frame || frame.scope !== `${scope.collegeId}:${scope.sectionId}:${scope.termId}`) return;
      // Everyone but me. A single account may have several open tabs, but it is
      // still one person: hide every connection carrying my user id and collapse
      // colleagues by user id so one colleague never becomes three chips.
      const distinct = new Map<string, PresencePeer>();
      for (const peer of frame.peers || []) {
        if (peer.connId === connId) continue;
        if (currentUserId && Number(peer.userId) === Number(currentUserId)) continue;
        const key = peer.userId ? `u:${peer.userId}` : `c:${peer.connId}`;
        const previous = distinct.get(key);
        // Prefer the connection that is actively holding/editing a row; otherwise
        // the first live connection is enough to represent this person.
        if (!previous || ((!previous.holding && !previous.editing) && (peer.holding || peer.editing))) distinct.set(key, peer);
      }
      const next = [...distinct.values()];
      const before = new Set(roster.map(peer => peer.userId ? `u:${peer.userId}` : `c:${peer.connId}`));
      const membershipChanged =
        next.length !== before.size || next.some(peer => !before.has(peer.userId ? `u:${peer.userId}` : `c:${peer.connId}`));
      roster = next;
      // Two audiences, deliberately. The painter wants every frame, because a
      // colleague moving one cell is exactly what it exists to draw. React
      // wants only arrivals and departures — repainting a very large tree
      // because someone's pointer crossed a column is the cost this whole
      // design was shaped to avoid.
      announceFrame();
      if (membershipChanged) announce();
    },

    peers: () => roster,

    claimant(rowId) {
      for (const peer of roster)
        if (peer.holding?.rowId === rowId || peer.editing?.rowId === rowId) return peer;
      return null;
    },

    onRoster(listener) {
      listeners.add(listener);
      listener(roster);
      return () => { listeners.delete(listener); };
    },

    onFrame(listener) {
      frameListeners.add(listener);
      listener(roster);
      return () => { frameListeners.delete(listener); };
    },

    leave() {
      if (timer) { clearTimeout(timer); timer = null; }
      mark = emptyMark();
      const payload = body({ gone: true });
      // sendBeacon is the only request that reliably survives the page closing;
      // fetch is the fallback for a soft leave, where the tab lives on.
      const sent = typeof navigator !== "undefined" && navigator.sendBeacon
        ? navigator.sendBeacon("/api/auth/presence", new Blob([payload], { type: "application/json" }))
        : false;
      if (!sent) void fetch("/api/auth/presence", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: payload, credentials: "include", keepalive: true,
      }).catch(() => undefined);
    },

    dispose() {
      disposed = true;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      if (timer) { clearTimeout(timer); timer = null; }
      listeners.clear();
      frameListeners.clear();
      roster = [];
    },
  };
}

/**
 * The painter.
 *
 * Kept beside the client rather than inside the board, because it is the one
 * piece that must never be tempted into React: it takes a roster, works out
 * what changed since the last one, and writes that difference onto the DOM in a
 * single frame. A hundred lectures on screen and one colleague moving costs two
 * attribute writes.
 */
export interface PresencePainter {
  paint(peers: PresencePeer[]): void;
  clear(): void;
}

const CELL_ATTR = "data-presence-cell";
const HOLD_ATTR = "data-presence-hold";
const EDIT_ATTR = "data-presence-edit";

/** Deterministic per-person colour index; red is left to conflicts alone. */
export const presenceHue = (userId: number) => (Math.abs(userId * 2654435761) % 6) + 1;

export function createPresencePainter(hueOf = presenceHue): PresencePainter {
  let painted = new Map<string, string>();
  let frame = 0;

  /* The key is split on a unit separator, not a colon: a start time IS "08:00",
     and splitting that on ":" quietly turns one cell into two wrong fields. The
     room already uses "|" (the physics engine writes `building|hall`), so that
     character is spoken for too. */
  const SEP = "\u001f";

  const wanted = (peers: PresencePeer[]) => {
    const next = new Map<string, string>();
    for (const peer of peers) {
      const hue = String(hueOf(peer.userId));
      if (peer.cell)
        next.set(["cell", peer.cell.day, peer.cell.start, peer.cell.room || ""].join(SEP), hue);
      // Holding outranks editing: a card in the air is the more urgent news.
      if (peer.editing) next.set(["edit", peer.editing.rowId].join(SEP), hue);
      if (peer.holding) next.set(["hold", peer.holding.rowId].join(SEP), hue);
    }
    return next;
  };

  /** CSS attribute selectors take a quoted string; a stray quote would end it. */
  const safe = (value: string) => value.replace(/["\\]/g, "");

  const apply = (key: string, hue: string | null) => {
    const [kind, a, b, c] = key.split(SEP);
    if (kind === "cell") {
      let selector = `[data-physics-slot="true"][data-physics-day="${safe(a)}"][data-physics-start="${safe(b)}"]`;
      if (c) selector += `[data-physics-room="${safe(c)}"]`;
      for (const node of document.querySelectorAll<HTMLElement>(selector)) {
        if (hue) node.setAttribute(CELL_ATTR, hue); else node.removeAttribute(CELL_ATTR);
      }
      return;
    }
    const attr = kind === "hold" ? HOLD_ATTR : EDIT_ATTR;
    // querySelectorAll, not querySelector: one lecture is drawn once per day it
    // meets, again inside a crowded hour's bundle, and again on the rooms board.
    for (const node of document.querySelectorAll<HTMLElement>(`[data-row-id="${safe(a)}"]`)) {
      if (hue) node.setAttribute(attr, hue); else node.removeAttribute(attr);
    }
  };

  return {
    paint(peers) {
      if (typeof document === "undefined") return;
      const next = wanted(peers);
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const key of painted.keys()) if (!next.has(key)) apply(key, null);
        for (const [key, hue] of next) if (painted.get(key) !== hue) apply(key, hue);
        painted = next;
      });
    },
    clear() {
      if (typeof document === "undefined") return;
      if (frame) { cancelAnimationFrame(frame); frame = 0; }
      for (const key of painted.keys()) apply(key, null);
      painted = new Map();
    },
  };
}
