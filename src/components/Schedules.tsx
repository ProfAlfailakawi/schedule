import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  Bookmark,
  BrainCircuit,
  Building2,
  CalendarDays,
  ClipboardCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit2,
  Expand,
  Eye,
  EyeOff,
  Focus,
  GripVertical,
  History,
  HelpCircle,
  Inbox,
  Timer,
  Hourglass,
  Layers,
  Palette,
  Undo2,
  CornerUpRight,
  ListChecks,
  ChevronDown,
  LayoutList,
  Lightbulb,
  MapPin,
  Contrast,
  MessageSquareText,
  Plus,
  Radio,
  Search,
  Sparkles,
  Table2,
  UsersRound,
  WandSparkles,
  X,
} from "lucide-react";
import {
  AddButton,
  Badge,
  EmptyState,
  Field,
  FormActions,
  GhostButton,
  IconAction,
  MetaPill,
  Notice,
  PageTitle,
  PrimaryButton,
  PrintLetterhead,
  PrintPortal,
  SecondaryButton,
  Segmented,
  StatCard,
  Surface,
} from "./ui";
import {
  AdCollege,
  AdCourse,
  AdInstructor,
  AdSection,
  AdTerm,
  FSchedule,
} from "../types";
import LivingScheduleLayer from "./LivingScheduleLayer";
import HallBarterBoard, { type HallBarterReservationView } from "./HallBarterBoard";
import SchedulePublish from "./SchedulePublish";
import ScheduleExperienceLayer, {
  useScheduleExperience,
} from "./ScheduleExperienceLayer";
import SchedulePhysicsLayer from "./SchedulePhysics/SchedulePhysicsLayer";
import useSchedulePhysics from "./SchedulePhysics/useSchedulePhysics";
import {
  buildDecision,
  buildMoveCandidate,
  isSamePlacement,
  relatedness,
} from "./SchedulePhysics/physics";
import type {
  SchedulePhysicsDecision,
  SchedulePhysicsDropRequest,
  SchedulePhysicsTarget,
} from "./SchedulePhysics/types";
import {
  blankSchedule as blank,
  scheduleArabicDays as arabicDays,
  scheduleDays as days,
  scheduleFriendlyError as friendlyError,
  scheduleMinutes as mins,
  scheduleTimeFromMinutes as timeFromMins,
  type DayKey,
} from "./scheduleWorkspace";
import { coerceScopeValues, describeScopeSelection, resolveScopeSelection } from "../utils/scopeContext";
import { runVisualTransition } from "../utils/visualTransition";
import { byArabic, sortByName } from "../utils/sorting";
import { previousYearSameTermName, sameTermName } from "../utils/termSequence";
import ScheduleReview from "./ScheduleReview";
import InstructorPicker from "./InstructorPicker";
import QuickCreatePopover, { type QuickDraft, type QuickSeed } from "./QuickCreatePopover";
import CommandPalette, { type ScheduleCommand } from "./CommandPalette";
import ScheduleViewsMenu, { SaveViewDialog } from "./ScheduleViewsMenu";
import {
  createLocalViewsStore,
  describeStaleScope,
  sameView,
  type ScheduleSavedView,
  type ScheduleViewDraft,
} from "../utils/scheduleViews";
import ScheduleTransfer from "./ScheduleTransfer";
import { adviseDayPattern, patternsForHours, patternsForHoursOnDay, reviewSchedule, type DayKey as RegDayKey, type WeeklyPattern } from "../utils/scheduleRegulations";
import { fastConflictScan, findConflicts } from "../utils/scheduleIntelligence";
import { findRepairChain, type RepairChain } from "../utils/repairChain";
import type { CourseNature } from "../utils/courseNature";
import { courseLabel, instructorLabel } from "../utils/courseLabel";
import { AR, countOf } from "../utils/arabicCount";
import { createPresenceClient, createPresencePainter, presenceHue, type PresencePeer } from "./schedulePresence";
import { claimWarmStart } from "../utils/warmStart";
/* The same six hues the stylesheet paints from, so a chip and the ring it
   refers to are the same colour. Red is absent on purpose: it belongs to
   conflicts, and a colleague is not one. */
const PRESENCE_HUES = [200, 262, 38, 96, 288, 178];
import { clusterSqueezed, courseHue, dayLoad as computeDayLoad, firstLast, patternForDay, peakConcurrency, pickLive } from "../utils/weekVisual";
import {
  formatScheduleTimeRange,
  scheduleClockForDisplay,
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_END_TIME,
  SCHEDULE_DAY_START,
  SCHEDULE_DAY_START_TIME,
  SCHEDULE_SLOT_MINUTES,
  withinScheduleDay,
} from "../utils/scheduleTime";
export type ScheduleMode = "schedule" | "copy";
interface Props {
  mode: ScheduleMode;
  user: any;
  scopes?: any[];
}
type EditorMode = "index" | "create" | "edit";
const AGENDA_PAGE_SIZE = 60;

/**
 * A reversal, written down rather than held in a closure.
 *
 * Storing the undo as the requests that would restore the previous state — and
 * not as a function — is what lets the day's log outlive a page reload.
 */
export type UndoStep = { method: "POST" | "PUT" | "DELETE"; url: string; body?: any };
export type UndoEntry = { id: string; label: string; at: number; steps: UndoStep[]; usedAt?: number };
/** How long the floating bar stays; the log itself lasts until midnight. */
const UNDO_BAR_MS = 15_000;
const UNDO_LOG_LIMIT = 60;
const isToday = (at: number) => new Date(at).toDateString() === new Date().toDateString();
const undoClock = (at: number) =>
  new Date(at).toLocaleTimeString("ar-KW", { hour: "2-digit", minute: "2-digit", numberingSystem: "latn" });

/**
 * One half-hour, in pixels.
 *
 * The grid used to position cards at 36px per half-hour while the CSS drew the
 * rows at 38px, so every appointment drifted two pixels lower than its own hour
 * and by the end of the afternoon sat a full row away from the time it claimed.
 * There is now one number, exported to the stylesheet as `--week-slot`, and the
 * row is tall enough for a card to say the course and the instructor in full
 * rather than truncating both to fit a line and a half.
 */
const SLOT_H = 46;

const normalizeArabicIndicDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

const normalizeRoomToken = (value: unknown) =>
  normalizeArabicIndicDigits(String(value || ""))
    .replace(/[‎‏؜]/g, "")
    .replace(/\s+/g, "")
    .replace(/[\/]/g, "")
    .toUpperCase();

const compactRoomLabel = (value: unknown) =>
  normalizeArabicIndicDigits(String(value || ""))
    .replace(/[‎‏؜]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const prettyBuildingLabel = (value: unknown) => {
  const token = normalizeRoomToken(value);
  if (!token) return "";
  const matched = token.match(/^([A-Z]+)(\d.*)$/);
  return matched ? `${matched[1]} ${matched[2]}` : compactRoomLabel(value) || token;
};

const prettyHallLabel = (value: unknown) => {
  const token = normalizeRoomToken(value);
  if (!token) return "";
  const matched = token.match(/^([A-Z]+)(\d.*)$/);
  return matched ? `${matched[1]}${matched[2]}` : compactRoomLabel(value) || token;
};

const roomIdentity = (buildingRaw: unknown, hallRaw: unknown) => {
  const buildingKey = normalizeRoomToken(buildingRaw);
  const hallKey = normalizeRoomToken(hallRaw);
  const building = prettyBuildingLabel(buildingRaw);
  const hall = prettyHallLabel(hallRaw);
  return {
    buildingKey,
    hallKey,
    key: `${buildingKey}|${hallKey}`,
    building,
    hall,
    label: [building, hall].filter(Boolean).join("/"),
  };
};

const sameRoom = (
  left: { AdRoomCode?: unknown; AdRoomHall?: unknown },
  right: { AdRoomCode?: unknown; AdRoomHall?: unknown },
) => {
  const a = roomIdentity(left.AdRoomCode, left.AdRoomHall);
  const b = roomIdentity(right.AdRoomCode, right.AdRoomHall);
  return Boolean(a.buildingKey || a.hallKey) && a.key === b.key;
};

/**
 * The detail card, painted on the window rather than inside the grid.
 *
 * It opens above the lecture it describes and then measures itself: if it would
 * cross the top of the window it flips below, and if it would cross either side
 * it slides back in. Nothing it says can be clipped by a column, which was the
 * entire failure of the version it replaces.
 */
function WeekPeek({ anchor, title, who, code, section, days: dayText, from, to, room, hue }: {
  anchor: { x: number; y: number };
  title: string; who: string; code: string; section: string;
  days: string; from: string; to: string; room: string; hue?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = 10;
    let left = anchor.x - rect.width / 2;
    let top = anchor.y - rect.height - 10;
    if (top < margin) top = anchor.y + 46;
    left = Math.max(margin, Math.min(window.innerWidth - rect.width - margin, left));
    top = Math.min(window.innerHeight - rect.height - margin, top);
    setBox({ left, top });
  }, [anchor.x, anchor.y]);
  return (
    <div
      className="week-peek"
      ref={ref}
      role="tooltip"
      style={{
        ...(box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }),
        // The same course hue the card and the band wear — one colour identity
        // followed from the grid to the hover card, so the eye keeps its thread.
        ...(hue != null ? { ["--hue" as any]: hue } : null),
      }}
    >
      <strong>{title}</strong>
      <em>{who}</em>
      <dl>
        <dt>الشعبة</dt><dd dir="ltr">{section} · {code}</dd>
        <dt>الأيام</dt><dd>{dayText || "بدون أيام"}</dd>
        <dt>الوقت</dt><dd dir="ltr">{formatScheduleTimeRange(from, to)}</dd>
        <dt>القاعة</dt><dd dir="ltr">{room || "—"}</dd>
      </dl>
    </div>
  );
}

/**
 * The board, drawn as light before its data arrives.
 *
 * A schedule loads by fetching a term's rows, and for a beat the surface was
 * black — the reader could not tell «loading» from «empty». A skeleton in the
 * exact shape of the view about to appear (day columns, a list, a room grid)
 * turns that beat into a promise: this is where the week will be. Pure
 * presentation; it renders nothing but shimmering placeholders and reads no
 * scheduling state.
 */
function ScheduleSkeleton({ viewMode }: { viewMode: "week" | "list" | "rooms" }) {
  if (viewMode === "list") {
    return (
      <div className="sched-skeleton sched-skeleton-list" role="status" aria-label="يجري تحميل المواعيد">
        {Array.from({ length: 7 }).map((_, i) => (
          <div className="sk-row" key={i} style={{ ["--i" as any]: i }}>
            <span className="sk-line" style={{ width: `${52 - (i % 3) * 9}%` }} />
            <span className="sk-line sk-dim" style={{ width: `${26 + (i % 4) * 6}%` }} />
            <span className="sk-chip" />
          </div>
        ))}
      </div>
    );
  }
  const cols = viewMode === "rooms" ? 6 : 5;
  return (
    <div className={`sched-skeleton sched-skeleton-week ${viewMode === "rooms" ? "is-rooms" : ""}`} role="status" aria-label="يجري تحميل الجدول">
      {Array.from({ length: cols }).map((_, c) => (
        <div className="sk-col" key={c} style={{ ["--i" as any]: c }}>
          <span className="sk-col-head" />
          {Array.from({ length: 3 + ((c * 2) % 3) }).map((_, r) => (
            <span
              className="sk-card"
              key={r}
              style={{ height: 34 + ((c * 17 + r * 29) % 52), ["--i" as any]: c + r }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A phone stays a phone after rotation. Width-only media queries turn an
 * iPhone landscape into a desktop, so use the device short edge plus touch/
 * mobile capability instead. Tablets keep the full workspace. */
function isPhoneDevice() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  const mobileUa = Boolean(nav.userAgentData?.mobile) || /iPhone|iPod|Android.+Mobile|Mobile/i.test(nav.userAgent || "");
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const shortEdge = Math.min(Number(window.screen?.width || window.innerWidth), Number(window.screen?.height || window.innerHeight));
  return shortEdge <= 600 && (mobileUa || coarse);
}

export default function Schedules({ mode, user, scopes = [] }: Props) {
  const prefsKey = `schedule-workspace-prefs-${user?.SystemUserId || 0}`;
  const lastSavedRef = useRef<any>(null);
  /** Where a press began, so a drag is never mistaken for a tap. */
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  // The row touched by the last write, so the grid can say "this one just
  // changed" for a few seconds instead of leaving the user to hunt for it.
  const [justChangedId, setJustChangedId] = useState<number | null>(null);
  const lastSavedHydrated = useRef(false);
  let savedPrefs: any = {};
  try {
    savedPrefs = JSON.parse(localStorage.getItem(prefsKey) || "{}");
  } catch {}
  const [colleges, setColleges] = useState<AdCollege[]>([]),
    [sections, setSections] = useState<AdSection[]>([]),
    [terms, setTerms] = useState<AdTerm[]>([]),
    [courses, setCourses] = useState<AdCourse[]>([]),
    [instructors, setInstructors] = useState<AdInstructor[]>([]),
    [rows, setRows] = useState<FSchedule[]>([]);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [editor, setEditor] = useState<EditorMode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [form, setForm] = useState(blank()),
    [courseName, setCourseName] = useState(""),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    /* A timetable is only valid when it is conflict-free. This is deliberately
       a rule, not a preference the reader can turn off. */
    [strictNoConflict] = useState(true),
    /* What a colour stands for. Three alphabets, not two: a room is the third
       thing a week is actually read by — «which hall is carrying this day» is
       a question the course and the instructor palettes cannot answer. */
    [hueBy, setHueBy] = useState<"course" | "instructor" | "room">(
      savedPrefs.hueBy === "instructor" ? "instructor" : savedPrefs.hueBy === "room" ? "room" : "course",
    ),
    /* Colour alone is never the only carrier of meaning. Off by default — when
       on, every hue also gets a texture, so red/green pairs that look identical
       to a deuteranopic reader stay tellable apart. */
    [colorBlind, setColorBlind] = useState<boolean>(Boolean(savedPrefs.colorBlind)),
    /* The legend's current focus: the colour identities lit, everything else
       hushed. A set rather than a single key because the question a coordinator
       actually asks is comparative — «where do these two collide?» — and one
       lit course at a time cannot answer it. Its own state, deliberately
       separate from the lens and the x-ray so it can never alter what either of
       them means. */
    [hueFocus, setHueFocus] = useState<Set<string>>(() => new Set()),
    /* Layers folded away. Distinct from a focus on purpose: hushing asks «where
       are these two?», folding asks «what is left once these are out of the
       way?» — the second is how a crowded week is actually untangled. Nothing
       is deleted and nothing is filtered out of any count that matters; the
       strip keeps saying how many layers are folded and offers them back. */
    [hueHidden, setHueHidden] = useState<Set<string>>(() => new Set()),
    /* Measured, not guessed: at thirty-two courses the key is already 6.3×
       wider than the strip that holds it — six screens of sideways scrolling
       to find one name. Past a dozen the key needs a way to be asked. */
    [legendQuery, setLegendQuery] = useState(""),
    /* Cards moved in the last minute, keyed to the undo entry that reverses
       them — the pill each one wears is the undo, in place. */
    [recentMoves, setRecentMoves] = useState<Record<number, string>>({}),
    /* A fading dashed echo left where a card used to sit, so a move reads as a
       journey from one place to another and not a card that merely appeared. */
    [moveTraces, setMoveTraces] = useState<Array<{ key: string; dayKey: DayKey; top: number; height: number; label: string }>>([]),
    /* Which day the rooms matrix is reading, and which rooms are pinned. */
    [matrixDay, setMatrixDay] = useState<DayKey | "week">("week"),
    [matrixBuildings, setMatrixBuildings] = useState<Set<string>>(new Set()),
    [matrixRooms, setMatrixRooms] = useState<Set<string>>(new Set()),
    [viewMode, setViewMode] = useState(
      isPhoneDevice() ? "list" : savedPrefs.viewMode === "week" ? "week" : savedPrefs.viewMode === "rooms" ? "rooms" : "list",
    ),
    [conflicts, setConflicts] = useState<any[]>([]),
    [checking, setChecking] = useState(false),
    [solutions, setSolutions] = useState<any[]>([]),
    [solving, setSolving] = useState(false),
    [focusMode, setFocusMode] = useState(false),
    [presentationMode, setPresentationMode] = useState(false),
    [context, setContext] = useState<any>(null),
    [contextLoading, setContextLoading] = useState(false),
    [contextSolutions, setContextSolutions] = useState<any[]>([]),
    [commentText, setCommentText] = useState(""),
    [xrayId, setXrayId] = useState<number | null>(null),
    [draggingId, setDraggingId] = useState<number | null>(null),
    [ripple, setRipple] = useState<any>(null),
    [replay, setReplay] = useState<any>(null),
    [replayLoading, setReplayLoading] = useState(false),
    [quickSearch, setQuickSearch] = useState("");
  /* The timetable stays the main object. Secondary controls disclose only
     when they are being used, while an active lens keeps its result visible in
     the toolbar even after its fields are folded away. */
  const [lensOpen, setLensOpen] = useState(false);
  const [workspaceToolsOpen, setWorkspaceToolsOpen] = useState(false);
  const [mobileViewGate, setMobileViewGate] = useState<"list" | "week" | "rooms" | null>(null);
  const [phoneReadOnly, setPhoneReadOnly] = useState(() => isPhoneDevice());
  const [livingPanelOpen, setLivingPanelOpen] = useState(false);
  const [returnNote] = useState(() => {
    const note = sessionStorage.getItem("schedule-return-note") || "";
    sessionStorage.removeItem("schedule-return-note");
    return note;
  });
  const [contextRelatedOpen, setContextRelatedOpen] = useState(false);
  const [contextCommentsOpen, setContextCommentsOpen] = useState(false);
  const rippleTimer = useRef<number | undefined>(undefined),
    rippleKey = useRef("");
  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const pointer = window.matchMedia("(pointer: coarse)");
    const sync = () => setPhoneReadOnly(isPhoneDevice());
    sync();
    window.addEventListener("resize", sync, { passive: true });
    window.addEventListener("orientationchange", sync);
    pointer.addEventListener?.("change", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      pointer.removeEventListener?.("change", sync);
    };
  }, []);
  const [filterCollege, setFilterCollege] = useState(
      Number(savedPrefs.filterCollege) || 0,
    ),
    [filterSection, setFilterSection] = useState(
      Number(savedPrefs.filterSection) || 0,
    ),
    [filterTerm, setFilterTerm] = useState(Number(savedPrefs.filterTerm) || 0),
    [visibleLimit, setVisibleLimit] = useState(AGENDA_PAGE_SIZE);
  const [copyCollege, setCopyCollege] = useState(0),
    [copySection, setCopySection] = useState(0),
    [copyFromTerm, setCopyFromTerm] = useState(0),
    [copyToTerm, setCopyToTerm] = useState(0),
    // The copy decision is made from the counts; the per-record list is hidden
    // until asked for, so the preview is not a wall of someone else's schedule.
    [copyListOpen, setCopyListOpen] = useState(false),
    [copyPreview, setCopyPreview] = useState<any | null>(null),
    [copyUndoPoint, setCopyUndoPoint] = useState<any | null>(null),
    [previewing, setPreviewing] = useState(false);
  const [physicsNotice, setPhysicsNotice] = useState(""),
    [undoPoint, setUndoPoint] = useState<any>(null),
    // What the server has said about squares the pointer has actually visited
    // during this drag. It refines the local reading; it does not replace it.
    [physicsField, setPhysicsField] = useState<Record<string, string>>({});
  /**
   * Several lectures carried at once.
   *
   * Moving a whole morning an hour later is one intention, and asking someone to
   * express it as six identical drags is asking them to do the computer's work.
   * A long press on empty space, or the toolbar button, arms selection; from
   * then on a tap picks and unpicks, and dragging any picked card carries the
   * set with the same offset.
   */
  const [picking, setPicking] = useState(false);
  const [multiSelect, setMultiSelect] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) =>
    setMultiSelect(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  /**
   * The card that says the rest.
   *
   * The old one was drawn inside the grid, and the grid clips its own contents,
   * so the name it existed to reveal was the first thing cut off at the edge of
   * a column. This one is measured against the window: it opens beside the card
   * it describes and steps back inside whichever edge it would have crossed.
   */
  const [peek, setPeek] = useState<{ row: FSchedule; x: number; y: number } | null>(null);
  const openPeek = (row: FSchedule, element: HTMLElement | null) => {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPeek({ row, x: rect.left + rect.width / 2, y: rect.top });
  };

  /**
   * Painting a new appointment straight onto an empty column.
   *
   * Asking for a lecture from ten to half past eleven by opening a form and
   * typing two times is the long way round when the column is right there. A
   * stroke down the empty squares says the day, the hour and the length in one
   * gesture, and the form opens already knowing all three. A single tap is the
   * same stroke of one square, so nothing was taken away.
   */
  const [paint, setPaint] = useState<{ day: DayKey; from: string; to: string } | null>(null);
  const paintRef = useRef<{ day: DayKey; anchor: number } | null>(null);
  /* Where the stroke ended, held open as a card until it is answered or
     dismissed. Saving from here is a deliberate press like any other; nothing
     is written by the gesture itself. */
  const [quick, setQuick] = useState<QuickSeed | null>(null);
  /**
   * ── The invisible power layer ─────────────────────────────────────────────
   *
   * Everything below adds capability without adding furniture. A reader who
   * never presses a key sees the screen exactly as it was: no new toolbar, no
   * new panel, no badge on a lecture card. A reader who knows the keys reaches
   * the same functions the buttons reach — the same `changeView`, the same
   * `commitMove`, the same undo — because a second implementation of anything
   * here would be a second thing to keep true.
   */
  const viewsStore = useMemo(() => createLocalViewsStore(`schedule-views-${user?.SystemUserId || 0}`), [user?.SystemUserId]);
  const [savedViews, setSavedViews] = useState<ScheduleSavedView[]>(() => {
    try { return viewsStore.list(); } catch { return []; }
  });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewDialog, setViewDialog] = useState<{ mode: "create" | "rename"; view?: ScheduleSavedView } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
    /* The dock's search button has nothing of its own to search with — it brings
     the reader to the one field that already exists, rather than owning a
     second one that could disagree with it. */
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  /**
   * Someone else changed this row while it was open.
   *
   * The versions log could always say what had happened; it could never stop it
   * happening, and the person whose work was overwritten was never told. The
   * write is now refused and both versions are put in front of the reader —
   * theirs, and the one actually in the database — with two plain choices and
   * no default, because choosing for them is exactly the thing that went wrong.
   */
  const [clash, setClash] = useState<{ current: FSchedule; yours: any } | null>(null);
  const paintOpen = useRef<((seed: { day: DayKey; start: string; end: string; x: number; y: number }) => void) | null>(null);
  useEffect(() => {
    const finish = (event: PointerEvent) => {
      const stroke = paintRef.current;
      paintRef.current = null;
      if (!stroke) return;
      setPaint(current => {
        if (current)
          paintOpen.current?.({
            day: current.day,
            start: current.from,
            end: current.to,
            // Where the hand let go — the card opens there rather than at some
            // fixed corner, so the answer appears where the question was asked.
            x: event.clientX,
            y: event.clientY,
          });
        return null;
      });
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, []);
  const fetchJson = async (url: string, options?: RequestInit) => {
    if (options?.method && options.method !== "GET" && !navigator.onLine)
      throw new Error(
        "أنت الآن دون اتصال. العرض متاح، لكن الحفظ متوقف لحماية الجدول.",
      );
    // Read the body as text, THEN parse — so a non-JSON response never explodes
    // into «Unexpected token '<'». That response is almost always a gateway's
    // own HTML page while the server is busy or restarting, not the client
    // needing a re-upload; it is transient and the honest advice is "retry",
    // which is what this now says.
    /**
     * A request that never answers used to hold the screen hostage.
     *
     * `saving` is one flag shared by every write, cleared in a `finally` — which
     * only runs when the promise settles. A gateway that accepts the socket and
     * then holds it open forever therefore left the flag true for the rest of
     * the session: the form's buttons stayed dead, dragging stayed disabled, and
     * the live channel went on believing the reader was mid-write. A request
     * now has a horizon; past it, it fails honestly and everything unlocks.
     */
    const timeout = new AbortController();
    const timer = window.setTimeout(() => timeout.abort(), 35_000);
    let res: Response;
    try {
      res = await fetch(url, { ...options, signal: options?.signal ?? timeout.signal });
    } catch (error: any) {
      if (error?.name === "AbortError" && timeout.signal.aborted)
        throw new Error("تأخر الخادم في الرد ولم يُحفظ أي تغيير. أعد المحاولة.");
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
    const body = await res.text();
    let data: any = {};
    if (body) {
      try { data = JSON.parse(body); }
      catch {
        throw new Error(
          res.ok
            ? "وصل رد غير متوقع من الخادم. أعد المحاولة بعد لحظات."
            : `الخادم مشغول حالياً (${res.status}). أعد المحاولة بعد قليل.`,
        );
      }
    }
    if (!res.ok) {
      /**
       * A refusal to overwrite is not an error to be flattened into a sentence.
       *
       * When the server answers 409 because the row moved on under the editor,
       * the reply carries both versions — and the screen has to be able to show
       * them and let a person choose. Wrapping it in a plain Error would throw
       * that away, so the two sides travel on the thrown object.
       */
      const failure: any = new Error(data.error || `تعذر إتمام العملية (${res.status}).`);
      if (res.status === 409 && data?.conflict === "revision") {
        failure.revisionConflict = true;
        failure.current = data.current;
        failure.yours = data.yours;
      }
      throw failure;
    }
    return data;
  };
  /**
   * The department's own courses, not the university's — added, not swapped in.
   *
   * Resolving a course id to a name needed the catalogue, and the catalogue was
   * fetched whole — fourteen hundred records to name the forty that belong to
   * the open department. Once a department is chosen its slice is fetched
   * instead, which is the same information at a fortieth of the weight.
   *
   * But the slice used to *replace* the catalogue, and that quietly emptied the
   * editor: open a lecture whose course or instructor belongs anywhere else and
   * the select had no option to match its value, so the course, its code and
   * the instructor all showed blank — the record looked erased, and touching
   * the course list then really did erase it. The slice is now merged over what
   * is already known, so a narrower view never removes a name the form still
   * has to display.
   */
  const mergeById = <T,>(current: T[], incoming: T[], id: (row: T) => number, name: (row: T) => string) => {
    const merged = new Map<number, T>(current.map(row => [id(row), row] as const));
    incoming.forEach(row => merged.set(id(row), row));
    return sortByName([...merged.values()], name as any);
  };
  const loadLookups = async () => {
    const [c, s, rawTerms] = await Promise.all([
      fetchJson("/api/colleges"),
      fetchJson("/api/sections"),
      fetchJson("/api/terms"),
    ]);
    const t = [...rawTerms].sort((a: AdTerm, b: AdTerm) => Number(b.AdTermId) - Number(a.AdTermId));
    setColleges(sortByName(c, (row:any)=>row.AdCollegeName));
    setSections(sortByName(s, (row:any)=>row.AdSectionName));
    setTerms(t);
    return { colleges: c as AdCollege[], sections: s as AdSection[], terms: t as AdTerm[] };
  };
  /**
   * The week lens.
   *
   * Filtering a timetable by removing rows destroys the thing you are reading:
   * the shape of the week. So nothing is removed — what matches keeps its
   * colour and everything else fades into the background. The week stays whole
   * while one question is asked of it: this instructor, this building, this
   * hall, this hour.
   */
  const [lens, setLens] = useState<{ instructorId: number; building: string; rooms: string[]; from: string; to: string }>(
    { instructorId: 0, building: "", rooms: [], from: "", to: "" }
  );
  const lensActive = Boolean(lens.instructorId || lens.building || lens.rooms.length || (lens.from && lens.to));
  const lensMatches = (row: FSchedule) => {
    if (!lensActive) return true;
    const room = roomIdentity(row.AdRoomCode, row.AdRoomHall);
    if (lens.instructorId && Number(row.AdInstructorId) !== lens.instructorId) return false;
    if (lens.building && room.buildingKey !== normalizeRoomToken(lens.building)) return false;
    if (lens.rooms.length && !lens.rooms.includes(room.key)) return false;
    if (lens.from && lens.to) {
      // Any overlap with the chosen window counts, not only an exact match.
      if (!(mins(row.fstarttime) < mins(lens.to) && mins(row.fendtime) > mins(lens.from))) return false;
    }
    return true;
  };
  const lensClass = (row: FSchedule) => (lensActive ? (lensMatches(row) ? "lens-hit" : "lens-miss") : "");

  /**
   * What the campus actually contains, learned from the schedule.
   *
   * There is no room catalogue to read, but every appointment ever written
   * names a building and a hall, which is the same information seen from the
   * other side. Typing a building therefore offers the halls that exist in it
   * instead of leaving an empty box and a guess.
   */
  const estate = useMemo(() => {
    const map = new Map<string, { label: string; halls: Map<string, string> }>();
    rows.forEach(row => {
      const room = roomIdentity(row.AdRoomCode, row.AdRoomHall);
      if (!room.buildingKey || !room.hallKey) return;
      if (!map.has(room.buildingKey)) map.set(room.buildingKey, { label: room.building, halls: new Map() });
      map.get(room.buildingKey)!.halls.set(room.hallKey, room.hall);
    });
    return map;
  }, [rows]);
  const buildingOptions = useMemo(() => [...estate.values()].map(item => item.label).sort(byArabic), [estate]);
  const hallOptions = useMemo(() => {
    const code = normalizeRoomToken(form.AdRoomCode);
    if (!code) return [] as string[];
    return [...(estate.get(code)?.halls.values() || [])].sort(byArabic);
  }, [estate, form.AdRoomCode]);
  /* The same reading, asked about any building rather than the form's — the
     quick card names its own building and needs the halls that go with it. */
  const hallsOf = useCallback(
    (building: string) => [...(estate.get(normalizeRoomToken(building))?.halls.values() || [])].sort(byArabic),
    [estate],
  );

  /**
   * The next section number, offered rather than imposed.
   *
   * Sections of one course run 101, 102, 103. Typing that sequence by hand is
   * the kind of work a person should never be doing, but guessing wrong is
   * worse than not guessing — so the number is filled in only while the field
   * is still untouched for this course, and anything typed by hand wins.
   */
  const nextSectionCode = (courseId: number, termId: number) => {
    const used = rows
      .filter(row => Number(row.AdCourseId) === Number(courseId) && Number(row.AdTermId) === Number(termId))
      .map(row => Number(String(row.SCode || "").trim()))
      .filter(value => Number.isFinite(value) && value > 0);
    if (!used.length) return "101";
    return String(Math.max(...used) + 1);
  };
  const sectionAutofilled = useRef(false);
  const sectionHint = useMemo(() => {
    const courseId = Number(form.AdCourseId || 0);
    if (!courseId) return undefined;
    const termId = Number(form.AdTermId) || filterTerm || 0;
    const taken = rows.filter(row => Number(row.AdCourseId) === courseId && Number(row.AdTermId) === termId).length;
    return taken ? `شعب هذا المقرر المسجّلة: ${taken.toLocaleString("ar-KW-u-nu-latn")} — اقترحنا الرقم التالي` : "أول شعبة لهذا المقرر";
  }, [form.AdCourseId, form.AdTermId, filterTerm, rows]);

  /** What the chosen days mean for the length of this lecture. */
  const dayPatternNote = useMemo(() => {
    const chosen = days.filter(day => (form as any)[day.key]).map(day => day.key as RegDayKey);
    const advice = adviseDayPattern(chosen, form.fstarttime, form.fendtime);
    return advice?.note;
  }, [form.fsunday, form.fmonday, form.ftuesday, form.fwednesday, form.fthursday, form.fstarttime, form.fendtime]);

  /** The department's own staff, ordered by how much of it they carry. */
  const departmentInstructorIds = useMemo(() => {
    const load = new Map<number, number>();
    rows.forEach(row => {
      const id = Number(row.AdInstructorId);
      if (id) load.set(id, (load.get(id) || 0) + 1);
    });
    return [...load.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [rows]);

  /**
   * A whole working day to change your mind.
   *
   * Every save here was final, which makes people hesitate before doing the
   * ordinary thing — and hesitation is what makes a tool feel heavy. So the
   * inverse of each change is kept: deleting what was created, restoring what
   * was edited, re-creating what was deleted, sending a moved card home.
   *
   * A minute was too short to be trusted — the coordinator notices the mistake
   * after the next three saves, not during. The reversal is therefore written
   * as plain request steps rather than a closure, which means it survives a
   * reload and can wait until the end of the day. The floating bar still leaves
   * after a few seconds so it never sits in the way; the day's log stays behind
   * it. Nothing carries over to tomorrow: a schedule someone has slept on is
   * not something to silently rewind.
   */
  const undoKey = `schedule-undo-log-${user?.SystemUserId || 0}`;
  const [undoLog, setUndoLog] = useState<UndoEntry[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(undoKey) || "[]");
      return Array.isArray(stored) ? stored.filter((item: UndoEntry) => item?.at && isToday(item.at)) : [];
    } catch { return []; }
  });
  const [undoBusy, setUndoBusy] = useState<string | null>(null);
  const [undoBarId, setUndoBarId] = useState<string | null>(null);
  const [undoLogOpen, setUndoLogOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(undoKey, JSON.stringify(undoLog.slice(0, UNDO_LOG_LIMIT))); } catch {}
  }, [undoLog, undoKey]);
  // Yesterday's log is dropped as soon as the tab notices the date has changed.
  useEffect(() => {
    const prune = () => setUndoLog(current =>
      current.some(item => !isToday(item.at)) ? current.filter(item => isToday(item.at)) : current);
    const timer = window.setInterval(prune, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!undoBarId) return;
    const timer = window.setTimeout(() => setUndoBarId(null), UNDO_BAR_MS);
    return () => window.clearTimeout(timer);
  }, [undoBarId]);
  const pendingUndo = useMemo(() => undoLog.filter(item => !item.usedAt), [undoLog]);
  /**
   * The day's log introduces itself once, then gets out of the way.
   *
   * A permanent labelled chip in the corner is a label a reader learns in the
   * first minute and then reads for the rest of the year. It says its name the
   * first time it appears on this browser, and afterwards it is the icon and the
   * count — the same target, a third of the ink.
   */
  const [logNamed, setLogNamed] = useState<boolean>(() => {
    try { return localStorage.getItem("schedule-log-named") === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (logNamed || !pendingUndo.length) return;
    const timer = window.setTimeout(() => {
      setLogNamed(true);
      try { localStorage.setItem("schedule-log-named", "1"); } catch {}
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [logNamed, pendingUndo.length]);
  const undoAction = useMemo(
    () => (undoBarId ? undoLog.find(item => item.id === undoBarId && !item.usedAt) || null : null),
    [undoBarId, undoLog],
  );
  const runUndoEntry = async (entry: UndoEntry) => {
    if (showMobileReadOnlyGate()) return;
    if (entry.usedAt || undoBusy) return;
    // Anything but the newest change may sit under later edits to the same row,
    // so what the reversal will actually do is stated plainly before it runs.
    const newest = pendingUndo[0];
    if (newest && newest.id !== entry.id && !window.confirm(
      `«${entry.label}» ليس آخر تغيير.\nالتراجع عنه يعيد الصفوف المعنية إلى حالتها قبله ويلغي ما جرى عليها بعده.\nمتابعة؟`,
    )) return;
    setUndoBusy(entry.id);
    setError(null);
    try {
      /* An undo of moves goes back through the same atomic door the moves came
         in by — all restored or none, with the server judging conflicts. Steps
         that are not schedule placements fall back to the sequential path. */
      const scheduleStep = /^\/api\/schedules\/(\d+)$/;
      const allPlacements = entry.steps.length > 0 &&
        entry.steps.every(step => step.method === "PUT" && scheduleStep.test(step.url) && step.body);
      if (allPlacements) {
        await fetchJson("/api/schedules/move-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strict: false,
            moves: entry.steps.map(step => ({
              id: Number(scheduleStep.exec(step.url)![1]),
              fields: {
                fsunday: Boolean(step.body.fsunday),
                fmonday: Boolean(step.body.fmonday),
                ftuesday: Boolean(step.body.ftuesday),
                fwednesday: Boolean(step.body.fwednesday),
                fthursday: Boolean(step.body.fthursday),
                fstarttime: step.body.fstarttime,
                fendtime: step.body.fendtime,
                AdRoomCode: step.body.AdRoomCode,
                AdRoomHall: step.body.AdRoomHall,
              },
            })),
          }),
        });
      } else {
        for (const step of entry.steps) {
          await fetchJson(step.url, {
            method: step.method,
            ...(step.body === undefined
              ? {}
              : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(step.body) }),
          });
        }
      }
      setUndoLog(current => current.map(item => (item.id === entry.id ? { ...item, usedAt: Date.now() } : item)));
      if (undoBarId === entry.id) setUndoBarId(null);
      await loadRows();
      setMessage(`تم التراجع: ${entry.label}`);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setUndoBusy(null);
    }
  };
  const offerUndo = (label: string, steps: UndoStep[]) => {
    if (!steps.length) return "";
    const entry: UndoEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label, at: Date.now(), steps,
    };
    setUndoLog(current => [entry, ...current].slice(0, UNDO_LOG_LIMIT));
    setUndoBarId(entry.id);
    // The id goes back to the caller so the moved card itself can wear it.
    return entry.id;
  };
  /* Takes back an undo entry that was offered optimistically when the server then
     refuses the move — so a rejected move leaves no phantom undo bar or pill. */
  const revokeUndo = (id: string) => {
    if (!id) return;
    setUndoLog(current => current.filter(item => item.id !== id));
    setUndoBarId(current => (current === id ? null : current));
  };
  // A saved row, reduced to the one request that would put it back as it was.
  const restoreStep = (snapshot: FSchedule): UndoStep => {
    const body: any = { ...snapshot };
    delete body.id;
    delete body.AdCourseName;
    return { method: "PUT", url: `/api/schedules/${snapshot.id}`, body };
  };

  /**
   * What each course has habitually been, read from every term on record.
   *
   * Loaded once per department and reused by the editor, the review and the
   * suggestions — so the product stops treating "how this course is taught" as
   * something the coordinator must retype every term.
   */
  const [nature, setNature] = useState<Map<number, CourseNature>>(new Map());
  useEffect(() => {
    if (!filterSection) { setNature(new Map()); return; }
    let alive = true;
    fetch(`/api/courses/nature?sectionId=${filterSection}`)
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!alive || !data?.nature) return;
        setNature(new Map(Object.entries(data.nature).map(([id, value]) => [Number(id), value as CourseNature])));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [filterSection]);

  /**
   * Who is seconded to this department this term.
   *
   * The roster exists and is edited, but the schedule never read it, so the
   * distinction it records was invisible exactly where it matters — on the
   * timetable, beside the name. A seconded colleague is scheduled differently
   * from a permanent one, and a coordinator should not have to remember which
   * is which.
   */
  const [visitingIds, setVisitingIds] = useState<Set<number>>(new Set());

  const [reviewOpen, setReviewOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  /** Appointments the review asked to see; they glow until something else happens. */
  const [reviewFocus, setReviewFocus] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!reviewFocus.size) return;
    const timer = window.setTimeout(() => setReviewFocus(new Set()), 20000);
    return () => window.clearTimeout(timer);
  }, [reviewFocus]);
  // A flagged lecture is often inside a weave, where it draws as no card at all.
  // After the highlight is set, open the first weave that holds a flagged row —
  // and scroll the lit card into view — so "أظهرها على الجدول" and the radar
  // actually land the reader on the thing they asked to see, not a silent band.
  useEffect(() => {
    if (!reviewFocus.size || viewMode !== "week") return;
    const raf = window.requestAnimationFrame(() => window.setTimeout(() => {
      const band = document.querySelector<HTMLButtonElement>(".week-bundle.bundle-flagged .week-bundle-head");
      if (band) { band.click(); band.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      const card = document.querySelector<HTMLElement>(".week-event.review-flagged");
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60));
    return () => window.cancelAnimationFrame(raf);
  }, [reviewFocus, viewMode]);
  const [previousTermRows, setPreviousTermRows] = useState<FSchedule[]>([]);
  useEffect(() => {
    if (!reviewOpen || !filterTerm) return;
    const earlier = terms
      .map(term => Number(term.AdTermId) || 0)
      .filter(id => id < Number(filterTerm))
      .reduce((max, id) => Math.max(max, id), 0);
    if (!earlier) { setPreviousTermRows([]); return; }
    const query = new URLSearchParams({ termId: String(earlier) });
    if (filterCollege) query.set("collegeId", String(filterCollege));
    if (filterSection) query.set("sectionId", String(filterSection));
    fetch(`/api/schedules?${query}`)
      .then(response => (response.ok ? response.json() : []))
      .then(data => setPreviousTermRows(Array.isArray(data) ? data : []))
      .catch(() => setPreviousTermRows([]));
  }, [reviewOpen, filterTerm, filterCollege, filterSection, terms]);

  const [rowsLoading, setRowsLoading] = useState(false);
  /**
   * An empty scope should answer, not just be empty.
   *
   * "I chose a college, a department and a term and no schedule appeared" is
   * almost never a missing schedule — it is a scope that has none, while the
   * rows sit under a neighbouring department or an earlier term. Rather than
   * showing a blank page and letting someone hunt, the screen reads the term
   * once more without the department filter and says where the appointments
   * actually are, with a way to go straight there.
   */
  const [emptyElsewhere, setEmptyElsewhere] = useState<Array<{ sectionId: number; name: string; count: number }>>([]);
  /** Only the newest read may write the rows; a slower earlier one is discarded. */
  const loadToken = useRef(0);
  const loadAbort = useRef<AbortController | null>(null);
  /**
   * The scope this screen is looking at, readable from anywhere at any age.
   *
   * ── The board that emptied itself ─────────────────────────────────────────
   * The live channel's listener is registered once, when the workspace first
   * becomes ready, and its dependencies are deliberately narrow so the socket
   * is not torn down and rebuilt on every keystroke. That listener therefore
   * closed over the `loadRows` of that first render — and with it over the
   * college, department and term as they stood *then*, which on first paint is
   * whatever the server resolved before the reader chose anything.
   *
   * So the sequence the reader reported: drag a lecture, the write succeeds,
   * the server announces the change, the stale listener re-reads the schedule
   * of the FIRST scope, and `setRows` replaces this department's week with that
   * one's — usually empty. The board goes blank, nothing is wrong with the
   * data, and re-choosing the college and department fixes it because that path
   * calls the workspace read with the scope that is actually on screen.
   *
   * A ref cannot go stale. Every reader of the scope now goes through this one,
   * so a listener of any age asks for the department the reader is looking at.
   */
  const scopeRef = useRef({ collegeId: 0, sectionId: 0, termId: 0 });
  scopeRef.current = { collegeId: filterCollege, sectionId: filterSection, termId: filterTerm };
  /**
   * The channel that says who else is on this board.
   *
   * Both objects are created once and never replaced: the client owns a
   * connection identity the server addresses by, and the painter owns the set
   * of marks currently written onto the DOM. Rebuilding either on a render
   * would orphan a live stream and leave its marks painted with nothing left
   * to erase them.
   */
  const presence = useMemo(createPresenceClient, []);
  const presencePaint = useMemo(() => createPresencePainter(), []);
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  /** Bumped whenever the live channel reports a write, so readings that depend
   *  on the whole university can refresh without anyone polling for them. */
  const [liveFeedSerial, setLiveFeedSerial] = useState(0);
  useEffect(() => () => presence.dispose(), [presence]);
  /** `silent` refreshes without the reading indicator — the live channel uses
   *  it so a colleague's change slides in without the screen looking busy. */
  const loadRows = async (opts?: { silent?: boolean }) => {
    const scope = scopeRef.current;
    const p = new URLSearchParams();
    if (scope.collegeId) p.set("collegeId", String(scope.collegeId));
    if (scope.sectionId) p.set("sectionId", String(scope.sectionId));
    if (scope.termId) p.set("termId", String(scope.termId));
    const stamp = `${scope.collegeId}|${scope.sectionId}|${scope.termId}`;
    const token = ++loadToken.current;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    if (!opts?.silent) setRowsLoading(true);
    try {
      const data = await fetchJson(`/api/schedules${p.size ? `?${p}` : ""}`, { signal: controller.signal });
      // Second guard, belt to the ref's braces: an answer that arrives after the
      // reader has moved to another department describes a board that is no
      // longer on screen, and must never be painted onto the one that is.
      const now = scopeRef.current;
      if (stamp !== `${now.collegeId}|${now.sectionId}|${now.termId}`) return;
      if (token === loadToken.current) setRows(data);
    } catch (error: any) {
      if (error?.name !== "AbortError") throw error;
    } finally {
      if (token === loadToken.current) setRowsLoading(false);
    }
  };
  useEffect(() => () => loadAbort.current?.abort(), []);
  /**
   * One request opens the whole department.
   *
   * The workspace read resolves the scope on the server — a coordinator's
   * account already names their department — and answers with the catalogues,
   * the term's rows, the department's own staff, courses and visiting roster in
   * a single round trip. The waterfall of six requests that used to precede
   * first paint is gone; on the campus connection each wait was the slow part.
   * If the one-shot endpoint is unavailable (an older server mid-deploy), the
   * same data is fetched the old way, piece by piece.
   */
  const appliedScope = useRef("");
  /**
   * The last answer this scope ever received, read straight from the service
   * worker's own shelf. It paints the whole board in a few milliseconds while
   * the network fetches the truth — and it lives in the very cache the logout
   * button already clears, so no new place holds schedule data.
   */
  const warmWorkspaceSnapshot = async (url: string) => {
    try {
      if (typeof caches === "undefined") return null;
      const names = (await caches.keys()).filter(name => name.startsWith("schedule-api-"));
      for (const name of names) {
        const hit = await (await caches.open(name)).match(url);
        if (hit) return await hit.json();
      }
      return null;
    } catch {
      return null;
    }
  };
  const loadWorkspace = async (
    collegeId: number,
    sectionId: number,
    termId: number,
    resolve = false,
    onContext?: (context: { collegeId: number; sectionId: number; termId: number }) => void,
  ) => {
    const token = ++loadToken.current;
    loadAbort.current?.abort();
    const controller = new AbortController();
    loadAbort.current = controller;
    setRowsLoading(true);
    const apply = (data: any) => {
      if (token !== loadToken.current) return null;
      const context = {
        collegeId: Number(data?.context?.collegeId ?? collegeId) || 0,
        sectionId: Number(data?.context?.sectionId ?? sectionId) || 0,
        termId: Number(data?.context?.termId ?? termId) || 0,
      };
      appliedScope.current = `${context.collegeId}|${context.sectionId}|${context.termId}`;
      if (Array.isArray(data?.colleges) && data.colleges.length) setColleges(sortByName(data.colleges, (row: any) => row.AdCollegeName));
      if (Array.isArray(data?.sections) && data.sections.length) setSections(sortByName(data.sections, (row: any) => row.AdSectionName));
      if (Array.isArray(data?.terms) && data.terms.length) setTerms([...data.terms].sort((a: AdTerm, b: AdTerm) => Number(b.AdTermId) - Number(a.AdTermId)));
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      // A scope with no chosen section keeps the names it already knows —
      // parity with the old per-section lookups, which only ran once a
      // section was picked, so the editor never loses a name it must display.
      if (Array.isArray(data?.instructors) && data.instructors.length) setInstructors(sortByName(data.instructors, (row: any) => row.AdInstructorName));
      if (Array.isArray(data?.courses) && data.courses.length) setCourses(sortByName(data.courses, (row: any) => row.CourseName));
      setVisitingIds(new Set((Array.isArray(data?.visitingInstructorIds) ? data.visitingInstructorIds : []).map(Number).filter(Boolean)));
      onContext?.(context);
      return context;
    };
    try {
      const query = new URLSearchParams();
      if (collegeId) query.set("collegeId", String(collegeId));
      if (sectionId) query.set("sectionId", String(sectionId));
      if (termId) query.set("termId", String(termId));
      if (resolve) query.set("resolve", "1");
      const url = `/api/schedules/workspace?${query}`;
      // The shelf answers first, the wire answers last: the snapshot paints the
      // board immediately and the network response quietly replaces it.
      let networkSettled = false;
      void warmWorkspaceSnapshot(url).then(snapshot => {
        if (!snapshot || networkSettled || token !== loadToken.current) return;
        apply(snapshot);
      });
      try {
        /* If this exact question was already asked before the board existed,
           its answer is either here or on its way — so take that instead of
           asking it a second time. */
        const warmed = claimWarmStart<any>(url);
        const data = warmed
          ? await warmed.catch(() => fetchJson(url, { signal: controller.signal }))
          : await fetchJson(url, { signal: controller.signal });
        networkSettled = true;
        return apply(data);
      } catch (workspaceError: any) {
        networkSettled = true;
        if (workspaceError?.name === "AbortError") return null;
        const rowsQuery = new URLSearchParams();
        if (collegeId) rowsQuery.set("collegeId", String(collegeId));
        if (sectionId) rowsQuery.set("sectionId", String(sectionId));
        if (termId) rowsQuery.set("termId", String(termId));
        const [lookup, rowsData, instructorsData, coursesData, roster] = await Promise.all([
          colleges.length ? Promise.resolve(null) : loadLookups(),
          fetchJson(`/api/schedules${rowsQuery.size ? `?${rowsQuery}` : ""}`, { signal: controller.signal }),
          sectionId ? fetchJson(`/api/instructors?sectionId=${sectionId}&termId=${termId || 0}`, { signal: controller.signal }).catch(() => []) : Promise.resolve([]),
          sectionId ? fetchJson(`/api/courses?sectionId=${sectionId}`, { signal: controller.signal }).catch(() => []) : Promise.resolve([]),
          collegeId && sectionId && termId
            ? fetchJson(`/api/visiting-roster?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { signal: controller.signal }).catch(() => null)
            : Promise.resolve(null),
        ]);
        return apply({
          context: { collegeId, sectionId, termId: termId || Number((lookup?.terms || terms)[0]?.AdTermId || 0) },
          rows: rowsData,
          instructors: instructorsData,
          courses: coursesData,
          visitingInstructorIds: roster?.instructorIds || [],
        });
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") throw error;
      return null;
    } finally {
      if (token === loadToken.current) setRowsLoading(false);
    }
  };
  useEffect(() => {
    setEditor("index");
    setEditId(null);
    setForm(blank());
    setCourseName("");
    setError(null);
    setMessage(null);
    setVisibleLimit(AGENDA_PAGE_SIZE);
    setCopyCollege(0);
    setCopySection(0);
    setCopyFromTerm(0);
    setCopyToTerm(0);
    setCopyPreview(null);
    setCopyUndoPoint(null);
    setWorkspaceReady(false);
    appliedScope.current = "";
    (async () => {
      try {
        let pref: any = {};
        try {
          pref = JSON.parse(localStorage.getItem(prefsKey) || "{}");
        } catch {}
        if (!lastSavedHydrated.current) {
          lastSavedHydrated.current = true;
          if (pref.lastSaved) lastSavedRef.current = pref.lastSaved;
        }
        const savedCollege = Number(pref.filterCollege) || 0;
        const savedSection = Number(pref.filterSection) || 0;
        if (mode === "schedule") {
          // The server validates the saved scope, locks a coordinator inside
          // their own department, and answers with that department alone.
          const scoped = isPowerAdmin
            ? { collegeId: savedCollege, sectionId: savedSection }
            : coerceScopeValues(scopes, savedCollege, savedSection, false);
          setViewMode(pref.viewMode === "week" ? "week" : pref.viewMode === "rooms" ? "rooms" : "list");
          // The context callback runs on the warm snapshot first, so the board
          // is alive in milliseconds; the network answer re-runs it with the
          // authoritative scope moments later.
          await loadWorkspace(scoped.collegeId, scoped.sectionId, 0, true, (context) => {
            setFilterCollege(context.collegeId);
            setFilterSection(context.sectionId);
            // A stale preference must never silently reopen a decade-old term.
            setFilterTerm(context.termId);
            setWorkspaceReady(true);
          });
          return;
        }
        // The copy screen is a rare admin maintenance task; it keeps the
        // catalogue-by-catalogue read.
        const lookup = await loadLookups();
        const latestTermId = Number(lookup.terms[0]?.AdTermId || 0);
        let defaultCollege = savedCollege && lookup.colleges.some(c => c.AdCollegeId === savedCollege) ? savedCollege : 0;
        let defaultSection = savedSection && lookup.sections.some(sec => sec.AdSectionId === savedSection) ? savedSection : 0;
        if (isPowerAdmin) {
          if (!defaultCollege) defaultCollege = Number(lookup.sections[0]?.AdCollegeId || lookup.colleges[0]?.AdCollegeId || 0);
          if (!defaultSection || lookup.sections.find(sec => sec.AdSectionId === defaultSection)?.AdCollegeId !== defaultCollege)
            defaultSection = Number(lookup.sections.find(sec => sec.AdCollegeId === defaultCollege)?.AdSectionId || 0);
        } else {
          const scoped = coerceScopeValues(scopes, defaultCollege, defaultSection, false);
          defaultCollege = scoped.collegeId;
          defaultSection = scoped.sectionId;
        }
        setCopyCollege(defaultCollege);
        setCopySection(defaultSection);
        setCopyToTerm(latestTermId);
        setCopyFromTerm(Number(lookup.terms.find(term => term.AdTermId !== latestTermId)?.AdTermId || 0));
      } catch (e: any) {
        setError(friendlyError(e));
      }
    })();
  }, [mode, user?.SystemUserId]);
  useEffect(() => {
    if (mode !== "schedule" || !workspaceReady) return;
    localStorage.setItem(
      prefsKey,
      JSON.stringify({
        filterCollege,
        filterSection,
        filterTerm,
        viewMode,
        lastRoomCode: form.AdRoomCode || savedPrefs.lastRoomCode || "",
        lastRoomHall: form.AdRoomHall || savedPrefs.lastRoomHall || "",
        lastSaved: lastSavedRef.current || savedPrefs.lastSaved || null,
        strictNoConflict,
        hueBy,
        colorBlind,
      }),
    );
    setVisibleLimit(AGENDA_PAGE_SIZE);
  }, [
    filterCollege,
    filterSection,
    filterTerm,
    viewMode,
    strictNoConflict,
    hueBy,
    colorBlind,
    form.AdRoomCode,
    form.AdRoomHall,
    mode,
    prefsKey,
  ]);
  /* Flagged on the root the same way the theme is, because the cards it styles
     are not all inside one subtree — the fan and the hover card are fixed and
     mount at the end of the document. Removed on unmount so no other screen
     inherits a setting that belongs to the schedule. */
  useEffect(() => {
    const root = document.documentElement;
    if (colorBlind) root.setAttribute("data-colorblind", "true");
    else root.removeAttribute("data-colorblind");
    return () => root.removeAttribute("data-colorblind");
  }, [colorBlind]);
  const formSections = useMemo(
      () =>
        sections.filter(
          (s) => !form.AdCollegeId || s.AdCollegeId === form.AdCollegeId,
        ),
      [sections, form.AdCollegeId],
    ),
    formCourses = useMemo(
      () => sortByName(courses.filter((c) => c.AdSectionId === form.AdSectionId), (c: AdCourse) => c.CourseName),
      [courses, form.AdSectionId],
    ),
    courseNames = useMemo(
      () => Array.from(new Set<string>(formCourses.map((c) => c.CourseName))),
      [formCourses],
    ),
    courseCodes = useMemo(
      () =>
        formCourses.filter((c) => !courseName || c.CourseName === courseName),
      [formCourses, courseName],
    );
  const filterSections = sections.filter(
      (s) => !filterCollege || s.AdCollegeId === filterCollege,
    ),
    copySections = sections.filter(
      (s) => !copyCollege || s.AdCollegeId === copyCollege,
    );
  const latestTermId = useMemo(() => terms.reduce((max, term) => Math.max(max, Number(term.AdTermId) || 0), 0), [terms]);
  /* Stable lookup maps are essential here. Rebuilding them on every click made
     every dependent memo look changed and forced the week layout to start over. */
  const collegeById = useMemo(
      () => new Map<number, AdCollege>(colleges.map((v) => [v.AdCollegeId, v] as const)),
      [colleges],
    ),
    courseById = useMemo(
      () => new Map<number, AdCourse>(courses.map((v) => [v.AdCourseId, v] as const)),
      [courses],
    ),
    instructorById = useMemo(
      () => new Map<number, AdInstructor>(instructors.map((v) => [v.AdInstructorId, v] as const)),
      [instructors],
    ),
    selectedInstructor = instructorById.get(form.AdInstructorId);
  const changeView = useCallback((value: string) => {
    const requested = value === "week" ? "week" : value === "rooms" ? "rooms" : "list";
    const next = phoneReadOnly ? "list" : requested;
    startTransition(() => setViewMode(next));
    setMobileViewGate(null);
  }, [phoneReadOnly]);
  const showMobileReadOnlyGate = useCallback(() => {
    if (!phoneReadOnly || viewMode === "list") return false;
    setMobileViewGate(viewMode === "week" ? "week" : "rooms");
    return true;
  }, [phoneReadOnly, viewMode]);
  useEffect(() => {
    if (!phoneReadOnly) return;
    if (viewMode !== "list") startTransition(() => setViewMode("list"));
    setMobileViewGate(null);
    setFocusMode(false);
    setPresentationMode(false);
    setExpandedDay(null);
  }, [phoneReadOnly, viewMode]);
  const filterScope = resolveScopeSelection(scopes, filterCollege, isPowerAdmin);
  const formScope = resolveScopeSelection(scopes, form.AdCollegeId, isPowerAdmin);
  const copyScope = resolveScopeSelection(scopes, copyCollege, isPowerAdmin);
  const formScopeLabel = describeScopeSelection(colleges, sections, form.AdCollegeId || formScope.defaultCollegeId, form.AdSectionId || formScope.defaultSectionId);
  const filterScopeLabel = describeScopeSelection(colleges, sections, filterCollege || filterScope.defaultCollegeId, filterSection || filterScope.defaultSectionId);
  const experience = useScheduleExperience({
    rows,
    courses,
    instructors,
    terms,
    collegeId: filterCollege,
    sectionId: filterSection,
    termId: filterTerm,
    isPowerAdmin,
  });
  useEffect(() => {
    if (isPowerAdmin || !sections.length) return;
    const next = coerceScopeValues(scopes, filterCollege, filterSection, false);
    if (next.collegeId !== filterCollege) setFilterCollege(next.collegeId);
    if (next.sectionId !== filterSection) setFilterSection(next.sectionId);
  }, [isPowerAdmin, sections.length, scopes, filterCollege, filterSection]);
  useEffect(() => {
    if (mode !== "copy" || isPowerAdmin || !sections.length) return;
    const next = coerceScopeValues(scopes, copyCollege, copySection, false);
    if (next.collegeId !== copyCollege) setCopyCollege(next.collegeId);
    if (next.sectionId !== copySection) setCopySection(next.sectionId);
  }, [mode, isPowerAdmin, sections.length, scopes, copyCollege, copySection]);
  const openCreate = (seed?: { day?: DayKey; start?: string; end?: string }) => {
      if (showMobileReadOnlyGate()) return;
      setError(null);
      setMessage(null);
      setConflicts([]);
      setSolutions([]);
      const next = blank();
      const last = lastSavedRef.current || savedPrefs.lastSaved || null;
      if (last) Object.assign(next, last);
      next.AdRoomCode = next.AdRoomCode || savedPrefs.lastRoomCode || "";
      next.AdRoomHall = next.AdRoomHall || savedPrefs.lastRoomHall || "";
      const preferredCollege = Number(last?.AdCollegeId) || filterCollege || Number(savedPrefs.filterCollege) || formScope.defaultCollegeId || 0;
      const preferredSection = Number(last?.AdSectionId) || filterSection || Number(savedPrefs.filterSection) || 0;
      const scoped = coerceScopeValues(scopes, preferredCollege, preferredSection, isPowerAdmin);
      next.AdCollegeId = scoped.collegeId;
      next.AdSectionId = scoped.sectionId || resolveScopeSelection(scopes, scoped.collegeId, isPowerAdmin).defaultSectionId || 0;
      next.AdTermId = Number(last?.AdTermId) || filterTerm || latestTermId || 0;
      // Started from an empty square in the week: that square is the answer to
      // the day and the hour, so the form opens with them already filled and a
      // sensible one-hour length.
      if (seed?.day) {
        days.forEach(day => { (next as any)[day.key] = day.key === seed.day; });
      }
      if (seed?.start) {
        next.fstarttime = seed.start;
        // A square gives an hour; a stroke down the column gives its own length.
        next.fendtime = seed.end && mins(seed.end) > mins(seed.start)
          ? seed.end
          : timeFromMins(Math.min(SCHEDULE_DAY_END, mins(seed.start) + 60));
      }
      // A tap paints one square, which should still mean the usual hour.
      if (seed?.end && seed.start && mins(seed.end) - mins(seed.start) <= 30) {
        next.fendtime = timeFromMins(Math.min(SCHEDULE_DAY_END, mins(seed.start) + 60));
      }
      setForm(next);
      setCourseName("");
      setEditId(null);
      setEditor("create");
    },
    openEdit = (row: FSchedule) => {
      if (showMobileReadOnlyGate()) return;
      setError(null);
      setMessage(null);
      setConflicts([]);
      setSolutions([]);
      setEditId(row.id);
      const { id: _id, AdCourseName: name, ...values } = row;
      setForm(values);
      setCourseName(name || courseById.get(row.AdCourseId)?.CourseName || "");
      // A row open in someone's form is the quietest way to lose a change: it
      // looks untouched on every other screen right up until the save.
      presence.send({ editing: { rowId: row.id, rev: Number((row as any).rev || 0) } });
      setEditor("edit");
    },
    back = () => {
      setEditor("index");
      presence.send({ editing: null });
      setEditId(null);
      setError(null);
      setConflicts([]);
      setSolutions([]);
      setForm(blank());
      setCourseName("");
    };
  /* The Escape listener is registered once; these keep it from asking an old
     render whether an editor is open. */
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const backRef = useRef<(() => void) | null>(null);
  backRef.current = back;
  const setNumber = (key: keyof typeof form, raw: string) =>
    setForm((prev) => ({ ...prev, [key]: Number(raw) || 0 }));
  const englishDigits = (v: string) => /^\d*$/.test(v);
  /**
   * The scope a painted appointment is filed under.
   *
   * The grid a stroke was drawn on already belongs to one college, one
   * department and one term — that is what makes it *this* grid. The card
   * therefore never asks again; it reads the open scope, falls back to the last
   * save the way the full form does, and lets the scope rules have the last
   * word so a coordinator can never file a lecture outside their own remit.
   */
  const quickScope = () => {
    const last = lastSavedRef.current || savedPrefs.lastSaved || null;
    const preferredCollege =
      filterCollege || Number(last?.AdCollegeId) || Number(savedPrefs.filterCollege) || filterScope.defaultCollegeId || 0;
    const preferredSection =
      filterSection || Number(last?.AdSectionId) || Number(savedPrefs.filterSection) || 0;
    const scoped = coerceScopeValues(scopes, preferredCollege, preferredSection, isPowerAdmin);
    const sectionId =
      scoped.sectionId || resolveScopeSelection(scopes, scoped.collegeId, isPowerAdmin).defaultSectionId || 0;
    return {
      collegeId: scoped.collegeId,
      sectionId,
      termId: filterTerm || Number(last?.AdTermId) || latestTermId || 0,
    };
  };
  /* The courses the card may offer: the department's own, which is the only set
     a lecture on this grid can be drawn from. */
  const quickCourses = useMemo(
    () => courses.filter(c => c.AdSectionId === quickScope().sectionId),
    [courses, filterSection, filterCollege, filterTerm, scopes, isPowerAdmin],
  );
  // The paint gesture ends on a window listener registered once, so it reaches
  // the card through a ref rather than by re-binding on every render.
  paintOpen.current = (seed) => {
    setQuickError(null);
    // Nothing to choose from is not a card, it is a dead end — the full editor
    // can still fetch and explain, so the stroke goes there instead.
    if (!quickCourses.length || !instructors.length) { openCreate(seed); return; }
    const last = lastSavedRef.current || savedPrefs.lastSaved || null;
    setQuick({
      day: seed.day,
      dayLabel: days.find(d => d.key === seed.day)?.label || "",
      start: seed.start,
      end: seed.end,
      x: seed.x,
      y: seed.y,
      instructorId: Number(last?.AdInstructorId) || 0,
      room: String(last?.AdRoomCode || savedPrefs.lastRoomCode || ""),
      hall: String(last?.AdRoomHall || savedPrefs.lastRoomHall || ""),
    });
  };
  /**
   * What the browser can already tell about a painted hour.
   *
   * Modest on purpose, exactly like the drag field: it names only what is
   * certainly true of rows already on screen — this instructor or this hall
   * busy across the same minutes — and leaves every subtler judgement to the
   * server, which stays the only thing that can refuse a save.
   */
  const quickConflict = (draft: QuickDraft, day: DayKey): string | null => {
    const from = mins(draft.start), to = mins(draft.end);
    if (to <= from) return "وقت النهاية يجب أن يكون بعد وقت البداية.";
    if (!withinScheduleDay(from, to)) return "الوقت خارج اليوم الدراسي (20:00 - 8:00).";
    const room = draft.room.trim(), hall = draft.hall.trim();
    const busy = rows.find(r =>
      Boolean((r as any)[day]) &&
      mins(r.fstarttime) < to && mins(r.fendtime) > from &&
      ((draft.instructorId && r.AdInstructorId === draft.instructorId) ||
        (room && hall && String(r.AdRoomCode) === room && String(r.AdRoomHall) === hall)));
    if (!busy) return null;
    const what = busy.AdCourseName || courseById.get(busy.AdCourseId)?.CourseName || "موعد آخر";
    const why = draft.instructorId && busy.AdInstructorId === draft.instructorId ? "الأستاذ مرتبط بـ" : "القاعة محجوزة لـ";
    return `${why}${what} ${formatScheduleTimeRange(busy.fstarttime, busy.fendtime)}`;
  };
  const selectedFormDays = days.filter(d=>Boolean(form[d.key]));
  // A brand-new form should not open already scolding. The validation strip
  // waits until the days or the time have been touched, or until a save is
  // attempted; the submit button stays disabled meanwhile either way.
  const [scheduleTouched, setScheduleTouched] = useState(false);
  /**
   * Three proposed placements, ranked.
   *
   * The days and the length of the lecture are the question; the answer is a
   * time and a hall that leave the instructor the least idle time and the
   * shortest walk. Asking is explicit — nothing is computed while typing, and
   * nothing is written until a suggestion is chosen.
   */
  /**
   * Whose hall is this?
   *
   * Asked from the room alone, so the answer arrives while the room is being
   * typed rather than after the day and the time are filled in. It is a
   * warning, never a block: booking another department's hall is sometimes
   * exactly what was intended — it just should never happen by accident.
   */
  const [roomOwner, setRoomOwner] = useState<any>(null);
  useEffect(() => {
    const room = String(form.AdRoomCode || "").trim();
    const hall = String(form.AdRoomHall || "").trim();
    if (!room || !hall || !form.AdCollegeId || !form.AdSectionId) { setRoomOwner(null); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({
          room, hall,
          collegeId: String(form.AdCollegeId),
          sectionId: String(form.AdSectionId)
        });
        const response = await fetch(`/api/rooms/owner?${query}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        setRoomOwner(data?.owner || null);
      } catch { /* an aborted lookup is the normal case while typing */ }
    }, 320);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [form.AdRoomCode, form.AdRoomHall, form.AdCollegeId, form.AdSectionId]);

  const [slotIdeas, setSlotIdeas] = useState<any[] | null>(null);
  const [slotBusy, setSlotBusy] = useState(false);
  const askForSlots = async () => {
    setSlotBusy(true);
    setSlotIdeas(null);
    try {
      const duration = form.fstarttime && form.fendtime && mins(form.fendtime) > mins(form.fstarttime)
        ? mins(form.fendtime) - mins(form.fstarttime)
        : 60;
      const response = await fetch("/api/schedules/suggest-slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, durationMinutes: duration, excludeId: editId || 0 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر اقتراح الأوقات");
      setSlotIdeas(Array.isArray(data.slots) ? data.slots : []);
    } catch (e: any) {
      setError(friendlyError(e));
      setSlotIdeas([]);
    } finally {
      setSlotBusy(false);
    }
  };
  const takeSlot = (slot: any) => {
    setScheduleTouched(true);
    setForm(prev => ({ ...prev, fstarttime: slot.start, fendtime: slot.end, AdRoomCode: slot.room, AdRoomHall: slot.hall }));
    setSlotIdeas(null);
  };
  /**
   * What the regulation would say about this appointment, said while it is
   * still being written.
   *
   * The articles were only ever read over a finished term — the approval review
   * — so a coordinator learned that a lecture breaks م.8 long after they had
   * left the form. The same reading now runs on the draft, against the rest of
   * the scope so the context rules (an instructor's day, a course's habit) mean
   * what they mean, and reports only what is true of THIS appointment.
   *
   * It is advice and it stays advice: nothing here can disable the save. A
   * department that knows why it is departing from the article should not have
   * to argue with a form about it — it should simply be told, once, plainly.
   */
  const editorRegulation = useMemo(() => {
    if (editor === "index") return [];
    if (!form.AdCourseId || !form.fstarttime || !form.fendtime) return [];
    if (!days.some(d => Boolean((form as any)[d.key]))) return [];
    if (mins(form.fendtime) <= mins(form.fstarttime)) return [];
    const draftId = editId || -1;
    const draft = { ...(form as any), id: draftId, AdCourseName: courseName || undefined } as FSchedule;
    const around = rows.filter(row => row.id !== draftId && Number(row.AdTermId) === Number(form.AdTermId));
    try {
      return reviewSchedule({
        rows: [...around, draft],
        courses: courseById,
        instructors: instructorById,
        nature,
      }).filter(finding => finding.rowIds.includes(draftId));
    } catch {
      return [];
    }
  }, [
    editor, editId, courseName, rows, courseById, instructorById, nature,
    form.AdCourseId, form.AdInstructorId, form.AdTermId, form.SCode,
    form.fstarttime, form.fendtime, form.AdRoomCode, form.AdRoomHall,
    form.fsunday, form.fmonday, form.ftuesday, form.fwednesday, form.fthursday,
  ]);
  const timeRangeInvalid = Boolean(form.fstarttime&&form.fendtime)&&mins(form.fendtime)<=mins(form.fstarttime);
  const outsideTeachingDay = Boolean(form.fstarttime && form.fendtime) && !timeRangeInvalid &&
    !withinScheduleDay(mins(form.fstarttime), mins(form.fendtime));
  const validationIssues=[
    !selectedFormDays.length?"يجب اختيار يوم واحد على الأقل للمحاضرة.":"",
    timeRangeInvalid?"وقت النهاية يجب أن يكون بعد وقت البداية.":"",
    outsideTeachingDay?"وقت المحاضرة يجب أن يكون بين 08:00 و20:00.":"",
  ].filter(Boolean);
  const blockingConflicts=conflicts.filter(c=>c?.severity==="high"||c?.type==="duplicate");
  /* The keystroke updates the input; the two-hundred-card grid follows a beat
     behind. Deferring the query keeps typing at the keyboard's speed instead of
     the layout's — React drops the stale in-between renders entirely. */
  const deferredSearch = useDeferredValue(quickSearch);
  const filteredRows=useMemo(()=>{
    const q=deferredSearch.trim().toLowerCase();
    const visible=q?rows.filter(r=>{const c=courseById.get(r.AdCourseId),i=instructorById.get(r.AdInstructorId);return[r.AdCourseName,c?.CourseName,c?.CourseCode,r.SCode,i?.AdInstructorName,i?.AdInstructorCivil,r.AdRoomCode,r.AdRoomHall,arabicDays(r)].join(" ").toLowerCase().includes(q)}):[...rows];
    return visible.sort((a,b)=>
      byArabic(a.AdCourseName||courseById.get(a.AdCourseId)?.CourseName||"",b.AdCourseName||courseById.get(b.AdCourseId)?.CourseName||"")||
      byArabic(a.SCode,b.SCode)||mins(a.fstarttime)-mins(b.fstarttime)||Number(a.id)-Number(b.id)
    );
  },[rows,deferredSearch,courseById,instructorById]);
  /**
   * The inspector's reading order.
   *
   * Previous/next follows what a coordinator means by "next" in a timetable:
   * first teaching day, then start time, then course identity. It deliberately
   * uses the currently visible result set, so a search remains a coherent
   * sequence instead of unexpectedly jumping to a hidden appointment.
   */
  const contextSequence = useMemo(() => {
    const firstDay = (row: FSchedule) => {
      const index = days.findIndex(day => Boolean((row as any)[day.key]));
      return index < 0 ? days.length : index;
    };
    return filteredRows.slice().sort((a, b) =>
      firstDay(a) - firstDay(b) ||
      mins(a.fstarttime) - mins(b.fstarttime) ||
      byArabic(
        a.AdCourseName || courseById.get(a.AdCourseId)?.CourseName || "",
        b.AdCourseName || courseById.get(b.AdCourseId)?.CourseName || "",
      ) ||
      Number(a.id) - Number(b.id),
    );
  }, [filteredRows, courseById]);
  /**
   * The shapes this course is allowed to take.
   *
   * Read from the course's own weekly hours, so the answer is about this course
   * and not about lectures in general. Applying one rewrites the days and the
   * end time together, which is the only way a move between day families can
   * leave the course still adding up to its credit hours.
   */
  const courseNature = nature.get(Number(form.AdCourseId) || 0) || null;
  const approvedPatterns = useMemo<WeeklyPattern[]>(() => {
    const course = courseById.get(Number(form.AdCourseId) || 0);
    const hours = Number(course?.CourseHours || course?.CourseCredit || 0);
    const chosen = days.filter(day => (form as any)[day.key]).map(day => day.key as RegDayKey);
    return hours ? patternsForHoursOnDay(hours, chosen[0]) : [];
  }, [form.AdCourseId, courseById]);
  const activePattern = useMemo(() => {
    const chosen = days.filter(day => (form as any)[day.key]).map(day => day.key);
    return approvedPatterns.find(pattern =>
      pattern.days.length === chosen.length && pattern.days.every(day => chosen.includes(day as any))) || null;
  }, [approvedPatterns, form.fsunday, form.fmonday, form.ftuesday, form.fwednesday, form.fthursday]);
  const applyPattern = (pattern: WeeklyPattern) => {
    setScheduleTouched(true);
    setForm(previous => {
      const next: any = { ...previous };
      days.forEach(day => { next[day.key] = pattern.days.includes(day.key as any); });
      // Every meeting starts at the same hour (م.8/9); the first one sets the length.
      const start = next.fstarttime || SCHEDULE_DAY_START_TIME;
      next.fstarttime = start;
      const [h, m] = start.split(":").map(Number);
      const total = Math.min(SCHEDULE_DAY_END, (h || 0) * 60 + (m || 0) + pattern.minutesPerDay[0]);
      next.fendtime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      return next;
    });
  };

  const weekInstructors = useMemo(() => {
    const seen = new Map<number, string>();
    filteredRows.forEach(row => {
      const id = Number(row.AdInstructorId);
      if (id && !seen.has(id)) seen.set(id, instructorById.get(id)?.AdInstructorName || `أستاذ ${id}`);
    });
    return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => byArabic(a.name, b.name));
  }, [filteredRows, instructorById]);
  const weekBuildings = useMemo(
    () => [...new Map(filteredRows
      .map(row => roomIdentity(row.AdRoomCode, row.AdRoomHall))
      .filter(room => room.buildingKey)
      .map(room => [room.buildingKey, room.building] as const)).values()].sort(byArabic),
    [filteredRows]
  );
  /**
   * The rooms, the way the paper timetable says them.
   *
   * The sheet this screen replaces lists rooms as its rows — F10, F11, F12 —
   * and a scheduler thinks "قاعة" first, building second. So the room filter
   * offers actual room numbers, written building/hall; with a building already
   * chosen it narrows to that building's halls, and picking a room sets both
   * halves of the lens at once.
   */
  const weekRooms = useMemo(() => {
    const seen = new Map<string, { building: string; hall: string; label: string }>();
    filteredRows.forEach(row => {
      const room = roomIdentity(row.AdRoomCode, row.AdRoomHall);
      if (!room.hallKey) return;
      if (lens.building && room.buildingKey !== normalizeRoomToken(lens.building)) return;
      if (!seen.has(room.key)) seen.set(room.key, { building: room.building, hall: room.hall, label: room.label || room.hall });
    });
    return [...seen.values()].sort((a, b) => byArabic(a.label, b.label));
  }, [filteredRows, lens.building]);
  const weekLensCount = useMemo(() => filteredRows.filter(lensMatches).length, [filteredRows, lens]);

  const solveConflicts = async () => {
    if (
      !form.AdCollegeId ||
      !form.AdSectionId ||
      !form.AdTermId ||
      !form.AdCourseId ||
      !form.AdInstructorId
    )
      return;
    setSolving(true);
    setSolutions([]);
    try {
      const d = await fetchJson("/api/intelligence/conflict-solutions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editId || -1 }),
      });
      setSolutions(d.solutions || []);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSolving(false);
    }
  };
  const applySolution = (item: any) => {
    setForm((p) => ({
      ...p,
      fstarttime: item.start,
      fendtime: item.end,
      AdRoomCode: item.roomCode,
      AdRoomHall: item.roomHall,
    }));
    setSolutions([]);
  };
  const openContext = async (row: FSchedule) => {
    setContextLoading(true);
    setCommentText("");
    setContextSolutions([]);
    setReplay(null);
    setContextRelatedOpen(false);
    setContextCommentsOpen(false);
    try {
      const d = await fetchJson(`/api/intelligence/context/${row.id}`);
      setContext(d);
      if (d?.conflicts?.length) {
        try {
          const sx = await fetchJson("/api/intelligence/conflict-solutions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...d.selected, id: d.selected.id }),
          });
          setContextSolutions((sx.solutions || []).slice(0, 3));
        } catch {
          setContextSolutions([]);
        }
      }
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setContextLoading(false);
    }
  };
  const contextSequenceIndex = context?.selected?.id
    ? contextSequence.findIndex(row => row.id === context.selected.id)
    : -1;
  const previousContextRow = contextSequenceIndex > 0
    ? contextSequence[contextSequenceIndex - 1]
    : null;
  const nextContextRow = contextSequenceIndex >= 0 && contextSequenceIndex < contextSequence.length - 1
    ? contextSequence[contextSequenceIndex + 1]
    : null;
  const loadReplay = async (row: FSchedule) => {
    if (!isPowerAdmin) return;
    setReplayLoading(true);
    setReplay(null);
    try {
      setReplay(await fetchJson(`/api/intelligence/replay/${row.id}`));
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setReplayLoading(false);
    }
  };
  const clearRipple = () => {
    if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    rippleTimer.current = undefined;
    rippleKey.current = "";
    setDraggingId(null);
    setRipple(null);
  };
  const beginRipple = (row: FSchedule) => {
    setDraggingId(row.id);
    setRipple({
      loading: true,
      rowId: row.id,
      headline: "حرّك الموعد فوق أي خانة… وسأريك المستقبل قبل الإفلات",
      effects: [],
      candidate: null,
    });
  };
  const previewRipple = (
    row: FSchedule,
    targetDay: DayKey,
    targetStart: string,
  ) => {
    const key = `${row.id}:${targetDay}:${targetStart}`;
    if (rippleKey.current === key) return;
    rippleKey.current = key;
    if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    setRipple((p: any) => ({
      ...p,
      loading: true,
      rowId: row.id,
      targetDay,
      targetStart,
    }));
    rippleTimer.current = window.setTimeout(async () => {
      try {
        const data = await fetchJson(`/api/intelligence/ripple/${row.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetDay, targetStart }),
        });
        if (rippleKey.current === key)
          setRipple({
            ...data,
            loading: false,
            rowId: row.id,
            targetDay,
            targetStart,
          });
      } catch {
        if (rippleKey.current === key)
          setRipple((p: any) => ({
            ...p,
            loading: false,
            headline: "تعذر حساب الأثر اللحظي لهذه الخانة",
          }));
      }
    }, 170);
  };
  const evaluatePhysicsTarget = async (
    row: FSchedule,
    target: SchedulePhysicsTarget,
    signal: AbortSignal,
  ): Promise<SchedulePhysicsDecision> => {
    const candidate = buildMoveCandidate(row, target),
      payload: any = { ...candidate };
    delete payload.id;
    delete payload.AdCourseName;
    const key = `${row.id}:${target.day}:${target.start}`;
    const [rippleResult, whyResult, conflictResult] = await Promise.allSettled([
      fetchJson(`/api/intelligence/ripple/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetDay: target.day,
          targetStart: target.start,
        }),
        signal,
      }),
      fetchJson("/api/intelligence/why", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowId: row.id, candidate }),
        signal,
      }),
      fetchJson("/api/schedules/check-conflicts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, excludeId: row.id }),
        signal,
      }),
    ]);
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const rippleData =
        rippleResult.status === "fulfilled" ? rippleResult.value : null,
      whyData = whyResult.status === "fulfilled" ? whyResult.value : null,
      conflictData =
        conflictResult.status === "fulfilled" ? conflictResult.value : null;
    const conflicts = Array.isArray(conflictData?.conflicts)
      ? conflictData.conflicts
      : [];
    if (!rippleData && !whyData && !conflictData)
      throw new Error("لا توجد بيانات كافية");
    let decision = buildDecision(
      key,
      rippleData,
      whyData,
      null,
      conflicts,
      false,
    );
    if (
      decision.quality === "suboptimal" ||
      decision.quality === "impossible"
    ) {
      try {
        const whyNotData = await fetchJson("/api/intelligence/why-not", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowId: row.id,
            candidate,
            question: "لماذا هذا الموضع أقل تفضيلاً؟",
          }),
          signal,
        });
        if (!signal.aborted)
          decision = buildDecision(
            key,
            rippleData,
            whyData,
            whyNotData,
            conflicts,
            false,
          );
      } catch (e: any) {
        if (signal.aborted || e?.name === "AbortError") throw e;
      }
    }
    return decision;
  };
  const addComment = async () => {
    if (!context?.selected?.id || !commentText.trim()) return;
    try {
      const c = await fetchJson(
        `/api/intelligence/comments/${context.selected.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: commentText }),
        },
      );
      setContext((p: any) => ({ ...p, comments: [c, ...(p.comments || [])] }));
      setCommentText("");
    } catch (e: any) {
      setError(friendlyError(e));
    }
  };
  const resolveComment = async (comment: any) => {
    try {
      await fetchJson(
        `/api/intelligence/comments/${context.selected.id}/${comment.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved: !comment.resolved }),
        },
      );
      setContext((p: any) => ({
        ...p,
        comments: p.comments.map((x: any) =>
          x.id === comment.id ? { ...x, resolved: !x.resolved } : x,
        ),
      }));
    } catch (e: any) {
      setError(friendlyError(e));
    }
  };
  useEffect(
    () => () => {
      if (rippleTimer.current) window.clearTimeout(rippleTimer.current);
    },
    [],
  );
  useEffect(() => {
    const modeName = presentationMode
      ? "presentation"
      : focusMode
        ? "focus"
        : "";
    if (modeName) document.documentElement.dataset.scheduleWorkspace = modeName;
    else delete document.documentElement.dataset.scheduleWorkspace;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // The editor is a whole page, not a drawer, so it has no close of its
        // own; Escape is the habit every other editor in the program already
        // answers to, and it must answer here too.
        if (editorRef.current !== "index") { backRef.current?.(); return; }
        setContext(null);
        if (focusMode || presentationMode) {
          setFocusMode(false);
          setPresentationMode(false);
        }
        setXrayId(null);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      delete document.documentElement.dataset.scheduleWorkspace;
      window.removeEventListener("keydown", key);
    };
  }, [focusMode, presentationMode]);
  useEffect(() => {
    if (mode !== "schedule" || !colleges.length) return;
    const command = sessionStorage.getItem("schedule-command");
    if (!command) return;
    sessionStorage.removeItem("schedule-command");
    if (command === "new") openCreate();
    if (command === "focus") {
      setFocusMode(true);
      setViewMode("week");
    }
    if (command === "presentation") {
      setPresentationMode(true);
      setViewMode("week");
    }
  }, [mode, colleges.length]);
  useEffect(() => {
    if (mode !== "schedule" || !rows.length) return;
    const raw = sessionStorage.getItem("schedule-open-context-id");
    if (!raw) return;
    const id = Number(raw);
    const row = rows.find((r) => r.id === id);
    if (row) {
      sessionStorage.removeItem("schedule-open-context-id");
      void openContext(row);
    }
  }, [mode, rows.length]);
  useEffect(() => {
    setSolutions([]);
    if (
      editor === "index" ||
      !form.AdTermId ||
      !form.fstarttime ||
      !form.fendtime ||
      timeRangeInvalid ||
      !days.some((d) => form[d.key])
    ) {
      setConflicts([]);
      return;
    }
    // The board already in memory answers first: a same-department collision
    // lights up the instant a day or an hour is touched, with no request and no
    // debounce. The server's verdict — which also sees other departments, the
    // hall's ownership and campus travel — replaces it the moment it lands.
    const candidate: any = { ...form, id: editId || -900001 };
    setConflicts(findConflicts([candidate], editId ? rows.filter(row => row.id !== editId) : rows));
    const controller = new AbortController(),
      timer = window.setTimeout(async () => {
        setChecking(true);
        try {
          const data = await fetchJson("/api/schedules/check-conflicts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, excludeId: editId || 0 }),
            signal: controller.signal,
          });
          setConflicts(data.conflicts || []);
        } catch (e: any) {
          if (e?.name !== "AbortError") { setError(friendlyError(e)); }
        } finally {
          setChecking(false);
        }
      }, 320);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    editor,
    editId,
    rows,
    form.AdTermId,
    form.AdInstructorId,
    form.AdCourseId,
    form.SCode,
    form.fsunday,
    form.fmonday,
    form.ftuesday,
    form.fwednesday,
    form.fthursday,
    form.fstarttime,
    form.fendtime,
    timeRangeInvalid,
    form.AdRoomCode,
    form.AdRoomHall,
  ]);
  // The last successful save becomes the starting point for the next one: same
  // term, same scope, same instructor, same room, same days. Only the identity
  // of the appointment itself starts blank.
  const markChanged = (id: number | null | undefined) => {
    if (!id) return;
    setJustChangedId(Number(id));
    window.setTimeout(() => setJustChangedId((current) => (current === Number(id) ? null : current)), 6000);
  };
  const traceBatch = useRef(0);
  /* Records the spots a set of moved cards vacated and clears them after a beat,
     so the grid briefly shows both where each card landed (the brass ring) and
     where it came from (a fading dashed echo) — a move reads as a journey rather
     than a card that merely appeared somewhere new (Notes 7 & 16). */
  const leaveMoveTraces = (moves: Array<{ before: FSchedule; after: FSchedule }>) => {
    const traces: Array<{ key: string; dayKey: DayKey; top: number; height: number; label: string }> = [];
    moves.forEach(({ before, after }) => {
      days.forEach((d) => {
        if (!Boolean((before as any)[d.key])) return;
        // No echo where nothing moved. "Moved" has to include a change of hall:
        // carrying a lecture from F6 to F7 at the same hour is exactly the move
        // the reader said left no trace, and the old test — same day, same start
        // — called it a card that had stayed put.
        const sameRoom =
          String((before as any).AdRoomCode || "") === String((after as any).AdRoomCode || "") &&
          String((before as any).AdRoomHall || "") === String((after as any).AdRoomHall || "");
        if (Boolean((after as any)[d.key]) && before.fstarttime === after.fstarttime && sameRoom) return;
        traces.push({
          key: `${d.key}-${before.id}-${before.fstarttime}`,
          dayKey: d.key as DayKey,
          top: ((mins(before.fstarttime) - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H,
          height: Math.max(SLOT_H - 4, ((mins(before.fendtime) - mins(before.fstarttime)) / SCHEDULE_SLOT_MINUTES) * SLOT_H - 3),
          label: before.AdCourseName || courseById.get(before.AdCourseId)?.CourseName || "الموعد",
        });
      });
    });
    if (!traces.length) return;
    const batch = ++traceBatch.current;
    setMoveTraces(traces);
    // Held as long as the destination's halo, so the two marks are on screen
    // together for the whole time the eye needs to join them.
    window.setTimeout(() => { if (traceBatch.current === batch) setMoveTraces([]); }, 7000);
  };

  const rememberSave = (row: any) => {
    lastSavedRef.current = {
      AdCollegeId: row.AdCollegeId, AdSectionId: row.AdSectionId, AdTermId: row.AdTermId,
      AdInstructorId: row.AdInstructorId, AdRoomCode: row.AdRoomCode, AdRoomHall: row.AdRoomHall,
      fstarttime: row.fstarttime, fendtime: row.fendtime,
      fsunday: row.fsunday, fmonday: row.fmonday, ftuesday: row.ftuesday,
      fwednesday: row.fwednesday, fthursday: row.fthursday
    };
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (showMobileReadOnlyGate()) return;
    setError(null);
    setMessage(null);
    if (
      !form.AdCollegeId ||
      !form.AdSectionId ||
      !form.AdTermId ||
      !form.AdCourseId ||
      !form.SCode ||
      !form.AdInstructorId ||
      !form.fstarttime ||
      !form.fendtime ||
      !form.AdRoomCode ||
      !form.AdRoomHall
    ) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    if (!englishDigits(form.SCode)) { setError("الرجاء كتابة الأرقام بالانجليزي"); return; }
    if (validationIssues.length) { setScheduleTouched(true); setError(validationIssues[0]); return; }
    if (blockingConflicts.length) { setError(blockingConflicts[0]?.message || "لا يمكن الحفظ قبل معالجة التعارضات."); return; }
    setSaving(true);
    try {
      const url =
        editor === "edit" ? `/api/schedules/${editId}` : "/api/schedules";
      const before = editor === "edit" ? rows.find((row) => row.id === editId) : null;
      const saved = await fetchJson(url, {
        method: editor === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        // The revision this editor opened. The server compares it and refuses
        // rather than overwriting a change someone else made meanwhile.
        body: JSON.stringify({ ...form, rev: editor === "edit" ? rows.find(row => row.id === editId)?.rev : undefined }),
      });
      if (editor === "edit" && before) {
        const { id: _id, AdCourseName: _name, ...previousValues } = before as any;
        offerUndo(
          `تعديل ${before.AdCourseName || courseById.get(before.AdCourseId)?.CourseName || "موعد"}`,
          [{ method: "PUT", url: `/api/schedules/${editId}`, body: previousValues }],
        );
      } else if (editor !== "edit") {
        const createdId = Number(saved?.id || 0);
        if (createdId) {
          offerUndo(
            `إضافة ${courseById.get(form.AdCourseId)?.CourseName || "موعد"}`,
            [{ method: "DELETE", url: `/api/schedules/${createdId}` }],
          );
        }
      }
      rememberSave(form);
      markChanged(editor === "edit" ? editId : Number(saved?.id || 0) || null);
      // Follow the save: the list jumps to the scope the row was filed under so
      // the user always sees what they just did.
      if (form.AdCollegeId && form.AdCollegeId !== filterCollege) setFilterCollege(form.AdCollegeId);
      if (form.AdSectionId && form.AdSectionId !== filterSection) setFilterSection(form.AdSectionId);
      if (form.AdTermId && form.AdTermId !== filterTerm) setFilterTerm(form.AdTermId);
      // The server already answered with the authoritative row — place it on
      // the board directly instead of re-reading the whole scope. The board
      // updates the same instant the save button releases.
      const savedRow = saved && typeof saved === "object" && Number(saved.id) ? (saved as FSchedule) : null;
      const scopeUnchanged =
        (!form.AdCollegeId || form.AdCollegeId === filterCollege) &&
        (!form.AdSectionId || form.AdSectionId === filterSection) &&
        (!form.AdTermId || form.AdTermId === filterTerm);
      if (savedRow && scopeUnchanged) {
        setRows(current => {
          const exists = current.some(item => item.id === savedRow.id);
          const next = exists
            ? current.map(item => (item.id === savedRow.id ? savedRow : item))
            : [...current, savedRow];
          return next.sort((a, b) => a.id - b.id);
        });
      } else if (scopeUnchanged) {
        await loadRows();
      }
      // A save filed under another scope: the filters just moved, and the
      // scope effect reloads that workspace on its own — nothing to do here.
      setMessage(editor === "edit" ? "تم حفظ التعديل" : "تم حفظ الموعد");
      back();
    } catch (e: any) {
      // The row moved on under this editor: hand back both versions instead of
      // flattening the refusal into a sentence.
      if (e?.revisionConflict) { setClash({ current: e.current, yours: e.yours }); return; }
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };
  /**
   * Saving the card that was drawn on the grid.
   *
   * It writes through the very same door as the full form — one POST, the same
   * server rules, the same undo entry, the same "this one just changed" ring —
   * so an appointment created in two seconds is in every respect the same
   * record as one created in two minutes. A refusal is said on the card itself
   * and the card stays open, because the fastest fix for a busy hall is the
   * field that is already under the reader's hand.
   */
  const createQuick = async (draft: QuickDraft) => {
    if (showMobileReadOnlyGate()) return;
    if (!quick) return;
    setQuickError(null);
    const scope = quickScope();
    if (!scope.collegeId || !scope.sectionId || !scope.termId) {
      setQuickError("اختر الكلية والقسم والفصل من الشريط أعلى الجدول أولاً.");
      return;
    }
    const payload: any = {
      ...blank(),
      AdCollegeId: scope.collegeId,
      AdSectionId: scope.sectionId,
      AdTermId: scope.termId,
      AdCourseId: draft.courseId,
      SCode: draft.scode.trim(),
      AdInstructorId: draft.instructorId,
      fstarttime: draft.start,
      fendtime: draft.end,
      AdRoomCode: draft.room.trim(),
      AdRoomHall: draft.hall.trim(),
    };
    payload[quick.day] = true;
    setSaving(true);
    try {
      const saved = await fetchJson("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const createdId = Number(saved?.id || 0);
      if (createdId)
        offerUndo(
          `إضافة ${courseById.get(draft.courseId)?.CourseName || "موعد"}`,
          [{ method: "DELETE", url: `/api/schedules/${createdId}` }],
        );
      rememberSave(payload);
      markChanged(createdId || null);
      const savedRow = saved && typeof saved === "object" && createdId ? (saved as FSchedule) : null;
      const scopeUnchanged =
        (!filterCollege || filterCollege === scope.collegeId) &&
        (!filterSection || filterSection === scope.sectionId) &&
        (!filterTerm || filterTerm === scope.termId);
      if (savedRow && scopeUnchanged) {
        setRows(current =>
          (current.some(item => item.id === savedRow.id)
            ? current.map(item => (item.id === savedRow.id ? savedRow : item))
            : [...current, savedRow]
          ).sort((a, b) => a.id - b.id));
      } else {
        // Filed somewhere the board is not currently looking: follow it there.
        if (scope.collegeId !== filterCollege) setFilterCollege(scope.collegeId);
        if (scope.sectionId !== filterSection) setFilterSection(scope.sectionId);
        if (scope.termId !== filterTerm) setFilterTerm(scope.termId);
        if (scopeUnchanged) await loadRows();
      }
      setQuick(null);
      setMessage("تم حفظ الموعد");
    } catch (e: any) {
      setQuickError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };
  /* «تفاصيل أكثر»: the same draft, handed to the full editor without losing a
     keystroke — the card is a shortcut through the form, never a smaller one. */
  const expandQuick = (draft: QuickDraft) => {
    if (showMobileReadOnlyGate()) { setQuick(null); return; }
    if (!quick) return;
    const seedDay = quick.day, start = draft.start, end = draft.end;
    setQuick(null);
    openCreate({ day: seedDay, start, end });
    setForm(prev => ({
      ...prev,
      AdCourseId: draft.courseId || prev.AdCourseId,
      SCode: draft.scode.trim() || prev.SCode,
      AdInstructorId: draft.instructorId || prev.AdInstructorId,
      AdRoomCode: draft.room.trim() || prev.AdRoomCode,
      AdRoomHall: draft.hall.trim() || prev.AdRoomHall,
    }));
    if (draft.courseId) setCourseName(courseById.get(draft.courseId)?.CourseName || "");
  };
  const remove = async (id: number) => {
    if (showMobileReadOnlyGate()) return;
    if (!window.confirm("هل أنت متأكد من حذف بيانات المقرر الدراسي؟")) return;
    setError(null);
    const before = rows.find((row) => row.id === id);
    // The card leaves the board the moment the choice is confirmed; the network
    // follows behind it, and a refusal puts the card back exactly where it was.
    if (before) setRows(current => current.filter(item => item.id !== id));
    try {
      await fetchJson(`/api/schedules/${id}`, { method: "DELETE" });
      if (before) {
        const { id: _id, AdCourseName: _name, ...values } = before as any;
        offerUndo(
          `حذف ${before.AdCourseName || courseById.get(before.AdCourseId)?.CourseName || "موعد"}`,
          [{ method: "POST", url: "/api/schedules", body: values }],
        );
      }
      if (!before) await loadRows({ silent: true });
    } catch (e: any) {
      if (before) setRows(current =>
        current.some(item => item.id === id) ? current : [...current, before].sort((a, b) => a.id - b.id));
      setError(friendlyError(e));
    }
  };
  useEffect(() => {
    if (mode !== "schedule" || rowsLoading || rows.length || !filterTerm) { setEmptyElsewhere([]); return; }
    // A coordinator with one department has no "elsewhere" to be told about,
    // so the wider probe is a read that can never show anything — skip it.
    if (!isPowerAdmin && scopes.length <= 1) { setEmptyElsewhere([]); return; }
    const controller = new AbortController();
    (async () => {
      try {
        const query = new URLSearchParams({ termId: String(filterTerm) });
        if (filterCollege) query.set("collegeId", String(filterCollege));
        const response = await fetch(`/api/schedules?${query}`, { signal: controller.signal });
        if (!response.ok) return;
        const wider: FSchedule[] = await response.json();
        const counts = new Map<number, number>();
        wider.forEach(row => counts.set(Number(row.AdSectionId), (counts.get(Number(row.AdSectionId)) || 0) + 1));
        setEmptyElsewhere(
          [...counts.entries()]
            .filter(([id]) => id && id !== filterSection)
            .map(([sectionId, count]) => ({
              sectionId,
              name: sections.find(item => item.AdSectionId === sectionId)?.AdSectionName || `قسم ${sectionId}`,
              count
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
        );
      } catch { /* an aborted probe is the normal case while switching scope */ }
    })();
    return () => controller.abort();
  }, [mode, rowsLoading, rows.length, filterTerm, filterCollege, filterSection, sections]);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await loadRows();
    } catch (e: any) {
      setError(friendlyError(e));
    }
  };
  /**
   * The scope applies itself.
   *
   * Choosing a college, a department and a term and then having to press a
   * button was a step with no decision in it — and when the read was slow, the
   * press and the result drifted so far apart that the screen looked broken.
   * The selection is the request now, debounced so dragging through a long list
   * of departments does not fire one read per option.
   */
  useEffect(() => {
    if (mode !== "schedule" || !workspaceReady) return;
    // The scope the bootstrap already answered needs no second read.
    if (appliedScope.current === `${filterCollege}|${filterSection}|${filterTerm}`) return;
    const timer = window.setTimeout(() => {
      setError(null);
      loadWorkspace(filterCollege, filterSection, filterTerm).catch((error: any) => setError(friendlyError(error)));
    }, 60);
    return () => window.clearTimeout(timer);
  }, [mode, workspaceReady, filterCollege, filterSection, filterTerm]);
  useEffect(() => {
    if (
      mode !== "copy" ||
      !copyCollege ||
      !copySection ||
      !copyFromTerm ||
      !copyToTerm
    ) {
      setCopyPreview(null);
      return;
    }
    const controller = new AbortController(),
      timer = window.setTimeout(async () => {
        setPreviewing(true);
        try {
          const p = new URLSearchParams({
            collegeId: String(copyCollege),
            sectionId: String(copySection),
            fromTermId: String(copyFromTerm),
            toTermId: String(copyToTerm),
          });
          setCopyPreview(
            await fetchJson(`/api/schedules/copy-preview?${p}`, {
              signal: controller.signal,
            }),
          );
        } catch (e: any) {
          if (e?.name !== "AbortError") {
            setCopyPreview(null);
            setError(friendlyError(e));
          }
        } finally {
          setPreviewing(false);
        }
      }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, copyCollege, copySection, copyFromTerm, copyToTerm]);
  const copySchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!copyCollege || !copySection || !copyFromTerm || !copyToTerm) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    setSaving(true);
    try {
      const data = await fetchJson("/api/schedules/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          AdCollegeId: copyCollege,
          AdSectionId: copySection,
          fromTermId: copyFromTerm,
          toTermId: copyToTerm,
        }),
      });
      setMessage(`تم نسخ ${countOf(data.count ?? 0, AR.record)} بنجاح`);
      setCopyUndoPoint(data.undoVersion || null);
      setCopyPreview(null);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };
  const undoCopy = async () => {
    if (!copyUndoPoint?.id) return;
    if (!window.confirm("سيتم استرجاع جدول الفصل الوجهة إلى حالته قبل آخر عملية نسخ. هل تريد المتابعة؟")) return;
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const data = await fetchJson(`/api/intelligence/versions/${copyUndoPoint.id}/restore`, {
        method: "POST",
        headers: { "x-schedule-confirm": "restore" },
      });
      setCopyUndoPoint(null);
      setCopyPreview(null);
      setMessage(`تم التراجع عن آخر عملية نسخ واسترجاع ${data.count ?? 0} سجل.`);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };
  const moveSchedule = async (
    row: FSchedule,
    targetDay: DayKey,
    targetStart: string,
    options?: {
      skipConfirm?: boolean;
      decision?: SchedulePhysicsDecision | null;
    },
  ) => {
    const selected = days.filter((d) => Boolean(row[d.key]));
    const target = {
      day: targetDay,
      start: targetStart,
      label: days.find((d) => d.key === targetDay)?.label || "",
    };
    const sourceDay=(selected[0]?.key||targetDay) as DayKey;
    if(isSamePlacement(row,sourceDay,target as any)){setPhysicsNotice("هذا هو نفس الموضع الحالي؛ لم يتم تنفيذ أي تغيير.");return;}
    const candidate = buildMoveCandidate(row, target),
      payload: any = { ...candidate };
    delete payload.id;
    delete payload.AdCourseName;
    const dayText =
      selected.length === 1
        ? ` إلى ${target.label}`
        : " مع الإبقاء على أيامه الحالية";
    try {
      const check=await fetchJson("/api/schedules/check-conflicts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,excludeId:row.id})});
      const blocking=Array.isArray(check.conflicts)?check.conflicts.filter((c:any)=>c?.severity==="high"||c?.type==="duplicate"):[];
      if(blocking.length){const reasons=blocking.slice(0,3).map((c:any)=>[c?.message,c?.detail].filter(Boolean).join(" — ")).filter(Boolean);const reason=reasons.join(" | ")||"هذا النقل يسبب تعارضاً ولا يمكن حفظه.";setError(`تعذر نقل الموعد: ${reason}`);setPhysicsNotice(`رفض النقل: ${reason}`);return;}
    } catch(e:any){setError(friendlyError(e));return;}
    const decisionRipple =
      options?.decision?.ripple ||
      (ripple?.rowId === row.id &&
      ripple?.targetDay === targetDay &&
      ripple?.targetStart === targetStart
        ? ripple
        : null);
    const forecastNote = decisionRipple?.headline
      ? `\n\nRipple Forecast: ${decisionRipple.headline}${Array.isArray(decisionRipple.effects) ? `\n${decisionRipple.effects.map((x: any) => `• ${x.text}`).join("\n")}` : ""}`
      : "";
    if (
      !options?.skipConfirm &&
      !confirm(
        `نقل موعد ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "المقرر"}${dayText} والوقت ${targetStart}؟${forecastNote}`,
      )
    )
      return;
    try {
      setSaving(true);
      await fetchJson(`/api/schedules/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      markChanged(row.id);
      if (isPowerAdmin) {
        try {
          const q = new URLSearchParams({
              collegeId: String(row.AdCollegeId),
              sectionId: String(row.AdSectionId),
              termId: String(row.AdTermId),
            }),
            points = await fetchJson(`/api/intelligence/safety-net?${q}`),
            point = Array.isArray(points) ? points[0] : null;
          if (point)
            setUndoPoint({
              ...point,
              decisionLabel: `استرجاع نقل ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "المقرر"} إلى ${target.label} ${targetStart}`,
            });
        } catch {
          setUndoPoint(null);
        }
      }
      setPhysicsNotice("");
      setMessage(
        selected.length > 1
          ? "تم تغيير وقت المقرر مع الحفاظ على جميع أيامه."
          : "تم نقل الموعد في الجدول الأسبوعي.",
      );
      await loadRows();
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };
  /**
   * A drop is a move.
   *
   * The previous build answered a drag with a modal that asked the coordinator
   * to approve the thing they had just done with their hand, and building a
   * timetable became a hundred confirmations. So the gesture now means what it
   * looks like: the card lands, the change is written, and the move joins the
   * day's undo log in case the hand was wrong. Nothing is lost by being
   * decisive when the decision is reversible.
   *
   * Refusal is reserved for what genuinely cannot be saved. A real clash — the
   * same instructor or the same hall in the same hour — sends the card home and
   * says which lecture it collided with, by name, in Arabic.
   */
  const describeConflict = (list: any[]) => {
    const lines = list
      .slice(0, 3)
      .map((item: any) => [item?.message, item?.detail].filter(Boolean).join(" — "))
      .filter(Boolean);
    return lines.join(" · ") || "هذا الموضع يسبب تعارضاً فلا يمكن حفظه.";
  };

  /**
   * The warning that arrives before the refusal.
   *
   * The guarantee against two people overwriting each other has not changed and
   * does not live here: the row's revision travels with the write, the server
   * compares it inside the transaction, and a stale one comes back as a
   * conflict. That is correct, and it is also late — it fires after a person
   * has already committed to a change.
   *
   * This says the same thing a second earlier, in words, and then gets out of
   * the way. It never blocks a write, never locks a row, and is never the thing
   * that decides. If presence is wrong — a colleague whose tab froze, a stream
   * that dropped — the worst it can do is mention someone who has already left.
   */
  const warnIfHeldElsewhere = useCallback((ids: number[]) => {
    for (const id of ids) {
      const holder = presence.claimant(id);
      if (!holder) continue;
      setPhysicsNotice(holder.holding
        ? `${holder.name} يحمل هذا الموعد الآن — إن تعارض التعديلان فسيُرفض الأحدث.`
        : `${holder.name} يعدّل هذا الموعد الآن — إن تعارض التعديلان فسيُرفض الأحدث.`);
      return true;
    }
    return false;
  }, [presence]);

  const commitMove = async (request: SchedulePhysicsDropRequest) => {
    if (showMobileReadOnlyGate()) return;
    const { row, target } = request;
    const day = target.day as DayKey;
    // A whole selection travels together, keeping the shape it already had.
    const party = multiSelect.has(row.id)
      ? rows.filter(item => multiSelect.has(item.id))
      : [row];
    warnIfHeldElsewhere(party.map(item => item.id));
    const shift = mins(target.start) - mins(row.fstarttime);
    const sourceDay = (days.find(d => Boolean(row[d.key]))?.key || day) as DayKey;
    const dayChanged = sourceDay !== day;

    /**
     * Crossing rhythms is a real move, asked out loud.
     *
     * A Sunday-Tuesday-Thursday lecture dropped on Monday is not asking to
     * teach four days — it is asking to live on the other rhythm. When the
     * carried card has several days and the target day is outside them, the
     * whole day-set switches to the target's pattern (1-3-5 ⇄ 2-4), same
     * time, same length — after one plain-words confirmation.
     */
    const carriedDays = days.filter(d => Boolean(row[d.key])).map(d => d.key as DayKey);
    const rhythmSwitch = carriedDays.length > 1 && !carriedDays.includes(day) ? patternForDay(day) : null;
    if (rhythmSwitch) {
      const fromLabels = carriedDays.map(k => days.find(d => d.key === k)?.label).join(" - ");
      const toLabels = rhythmSwitch.map(k => days.find(d => d.key === k)?.label).join(" - ");
      const title = row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "المحاضرة";
      if (!window.confirm(`«${title}» تُدرَّس ${fromLabels}.\nنقلها إلى ${days.find(d => d.key === day)?.label} يحوّل أيامها كلها إلى نمط ${toLabels} بنفس الوقت والمدة.\nمتابعة؟`)) {
        setPhysicsNotice("");
        return;
      }
    }

    const moves = party.map(item => {
      const singleDay = days.filter(d => Boolean(item[d.key])).length === 1;
      const start = item.id === row.id ? target.start : timeFromMins(mins(item.fstarttime) + shift);
      const candidate = buildMoveCandidate(item, { day, start });
      // Only the carried card changes day; the rest keep theirs and shift in time.
      if (item.id !== row.id && singleDay && dayChanged) {
        days.forEach(d => { (candidate as any)[d.key] = Boolean(item[d.key]); });
      }
      // The carried multi-day card takes the whole target rhythm.
      if (item.id === row.id && rhythmSwitch) {
        days.forEach(d => { (candidate as any)[d.key] = rhythmSwitch.includes(d.key as DayKey); });
      }
      return { before: item, after: candidate };
    });

    // Anything that would land outside the day is not a move, it is a mistake.
    const outside = moves.find(m => mins(m.after.fstarttime) < gridWindow.start || mins(m.after.fendtime) > gridWindow.end);
    if (outside) {
      setPhysicsNotice("");
      setError("هذا الموضع يخرج عن ساعات اليوم؛ لم يتغير شيء.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      /**
       * One atomic request instead of "check, then N separate PUTs".
       *
       * The old shape had two windows for disaster: the check could pass while
       * another user was writing, and a dropped connection mid-loop left the
       * party half-moved. Now the server re-checks every candidate itself —
       * treating the travelling party as already moved, so a sibling about to
       * vacate its slot is not a clash — and commits the whole party in one
       * batch. Either every card lands or none do; a refusal arrives as plain
       * words and the grid snaps back to exactly what the server holds.
       */
      const moveFields = (after: FSchedule) => ({
        fsunday: Boolean((after as any).fsunday),
        fmonday: Boolean((after as any).fmonday),
        ftuesday: Boolean((after as any).ftuesday),
        fwednesday: Boolean((after as any).fwednesday),
        fthursday: Boolean((after as any).fthursday),
        fstarttime: after.fstarttime,
        fendtime: after.fendtime,
      });
      // The grid answers immediately; the network catches up behind it.
      const patched = new Map(moves.map(m => [m.before.id, m.after]));
      setRows(current => current.map(item => patched.get(item.id) || item));

      // Optimistic feedback — the "just moved" ring and the undo pill appear the
      // instant the card lands, not after the network answers. On a slow campus
      // link the old order left the moved card looking untouched for a long
      // moment and its undo icon arriving late (Note 8/15). Everything here is
      // rolled back below if the server refuses the move.
      markChanged(row.id);
      leaveMoveTraces(moves);
      setPhysicsNotice("");
      const label = days.find(d => d.key === day)?.label || "";
      const movedIds = moves.map(m => m.before.id);
      const undoId = offerUndo(
        moves.length > 1
          ? `نُقل ${countOf(moves.length, AR.appointment)} إلى ${label} ${target.start}`
          : `نُقل ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "الموعد"} إلى ${label} ${target.start}`,
        moves.map(move => restoreStep(move.before)),
      );
      let undoTimer: number | undefined;
      if (undoId) {
        /* The moved cards wear their own undo for a minute. */
        setRecentMoves(current => {
          const next = { ...current };
          movedIds.forEach(id => { next[id] = undoId; });
          return next;
        });
        undoTimer = window.setTimeout(() => {
          setRecentMoves(current => {
            const next = { ...current };
            movedIds.forEach(id => { if (next[id] === undoId) delete next[id]; });
            return next;
          });
        }, 60_000);
      }

      try {
        const outcome = await fetchJson("/api/schedules/move-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strict: strictNoConflict,
            moves: moves.map(move => ({ id: move.before.id, fields: moveFields(move.after), rev: move.before.rev })),
          }),
        });
        // The confirmation already carries the written rows — settle them in
        // place instead of re-reading the whole scope after every drag.
        if (Array.isArray(outcome?.rows) && outcome.rows.length) {
          const confirmed = new Map<number, FSchedule>(outcome.rows.map((item: FSchedule) => [item.id, item]));
          setRows(current => current.map(item => confirmed.get(item.id) || item));
        }
      } catch (refusal) {
        // Nothing was written — put the grid back, and take back the optimistic
        // marker and undo so a refused move leaves no trace of having happened.
        const restore = new Map(moves.map(m => [m.before.id, m.before]));
        setRows(current => current.map(item => restore.get(item.id) || item));
        setJustChangedId(current => (current === Number(row.id) ? null : current));
        setMoveTraces([]);
        if (undoId) {
          if (undoTimer !== undefined) window.clearTimeout(undoTimer);
          setRecentMoves(current => {
            const next = { ...current };
            movedIds.forEach(id => { if (next[id] === undoId) delete next[id]; });
            return next;
          });
          revokeUndo(undoId);
        }
        setPhysicsNotice("");
        throw refusal;
      }
    } catch (e: any) {
      // A refusal to overwrite is a decision to hand back, not a message to show.
      if (e?.revisionConflict) setClash({ current: e.current, yours: null });
      else {
        setError(friendlyError(e));
        /*
         * A refusal that only says "no" leaves the reader exactly where they
         * were, holding the same card and the same problem. The engine that
         * can answer "then where?" already exists, so a blocked drop asks it
         * immediately and offers the chain — the refusal and its way out arrive
         * together rather than one of them never arriving at all.
         */
        window.setTimeout(() => {
          try {
            const chain = findRepairChain(row, rows);
            if (chain) { setRepairReason("تعذّر هذا الموضع — إليك أقرب بديل"); setRepair(chain); }
          } catch { /* a suggestion is a courtesy; never a second failure */ }
        }, 0);
      }
      void loadRows({ silent: true });
    } finally {
      setSaving(false);
    }
  };

  /**
   * The matrix's move: same day, new hour and-or new room.
   *
   * Deliberately the same shape as commitMove — conflict gate first (strict
   * mode makes every conflict a wall), optimistic grid, one PUT per row, an
   * undo entry, and the moved card wearing its own way back for a minute.
   */
  const commitRoomMove = async (row: FSchedule, day: DayKey, start: string, building: string, hall: string) => {
    if (showMobileReadOnlyGate()) return;
    const duration = Math.max(30, mins(row.fendtime) - mins(row.fstarttime));
    const end = timeFromMins(Math.min(SCHEDULE_DAY_END, mins(start) + duration));
    const unchanged = row.fstarttime === start &&
      String(row.AdRoomCode || "") === building && String(row.AdRoomHall || "") === hall;
    if (unchanged) return;
    warnIfHeldElsewhere([row.id]);
    const after: FSchedule = { ...row, fstarttime: start, fendtime: end, AdRoomCode: building, AdRoomHall: hall } as FSchedule;
    setSaving(true);
    setError(null);
    try {
      /* Same atomic door the week drag uses: server-side re-check + one write. */
      setRows(current => current.map(item => (item.id === row.id ? after : item)));

      // Optimistic feedback first — marker and undo pill land with the card, not
      // after the network answers, and are rolled back on refusal (Note 8/15).
      markChanged(row.id);
      // A room move is a move: it earns the same pair of marks as a week drag —
      // the brass halo where the lecture landed, and the dashed echo where it
      // used to be. Carrying a lecture from F6 to F7 said nothing at all before
      // this line; now it reads exactly like every other move in the program.
      leaveMoveTraces([{ before: row, after }]);
      const place = [building, hall].filter(Boolean).join("/") || "بلا قاعة";
      const undoId = offerUndo(
        `نُقل ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "الموعد"} إلى ${place} ${start}`,
        [restoreStep(row)],
      );
      let undoTimer: number | undefined;
      if (undoId) {
        setRecentMoves(current => ({ ...current, [row.id]: undoId }));
        undoTimer = window.setTimeout(() => {
          setRecentMoves(current => {
            if (current[row.id] !== undoId) return current;
            const next = { ...current };
            delete next[row.id];
            return next;
          });
        }, 60_000);
      }

      try {
        const outcome = await fetchJson("/api/schedules/move-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strict: strictNoConflict,
            moves: [{
              id: row.id,
              fields: {
                fsunday: Boolean((after as any).fsunday),
                fmonday: Boolean((after as any).fmonday),
                ftuesday: Boolean((after as any).ftuesday),
                fwednesday: Boolean((after as any).fwednesday),
                fthursday: Boolean((after as any).fthursday),
                fstarttime: after.fstarttime,
                fendtime: after.fendtime,
                AdRoomCode: building,
                AdRoomHall: hall,
              },
            }],
          }),
        });
        // Settle the server's own row in place — no follow-up read.
        if (Array.isArray(outcome?.rows) && outcome.rows.length) {
          const confirmed = new Map<number, FSchedule>(outcome.rows.map((item: FSchedule) => [item.id, item]));
          setRows(current => current.map(item => confirmed.get(item.id) || item));
        }
      } catch (refusal) {
        setRows(current => current.map(item => (item.id === row.id ? row : item)));
        setJustChangedId(current => (current === Number(row.id) ? null : current));
        if (undoId) {
          if (undoTimer !== undefined) window.clearTimeout(undoTimer);
          setRecentMoves(current => {
            if (current[row.id] !== undoId) return current;
            const next = { ...current };
            delete next[row.id];
            return next;
          });
          revokeUndo(undoId);
        }
        throw refusal;
      }
    } catch (e: any) {
      // A refusal to overwrite is a decision to hand back, not a message to show.
      if (e?.revisionConflict) setClash({ current: e.current, yours: null });
      else {
        setError(friendlyError(e));
        /*
         * A refusal that only says "no" leaves the reader exactly where they
         * were, holding the same card and the same problem. The engine that
         * can answer "then where?" already exists, so a blocked drop asks it
         * immediately and offers the chain — the refusal and its way out arrive
         * together rather than one of them never arriving at all.
         */
        window.setTimeout(() => {
          try {
            const chain = findRepairChain(row, rows);
            if (chain) { setRepairReason("تعذّر هذا الموضع — إليك أقرب بديل"); setRepair(chain); }
          } catch { /* a suggestion is a courtesy; never a second failure */ }
        }, 0);
      }
      void loadRows({ silent: true });
    } finally {
      setSaving(false);
    }
  };

  const undoPhysicsDecision = async () => {
    if (showMobileReadOnlyGate()) return;
    if (!isPowerAdmin || !undoPoint) return;
    if (
      !window.confirm(
        `${undoPoint.decisionLabel || "استرجاع قرار النقل"}؟\nسيحفظ النظام نقطة أمان جديدة قبل التراجع.`,
      )
    )
      return;
    try {
      setSaving(true);
      const d = await fetchJson(
        `/api/intelligence/safety-net/${undoPoint.id}/undo`,
        { method: "POST", headers: { "x-schedule-confirm": "decision-undo" } },
      );
      setUndoPoint(null);
      setPhysicsNotice("");
      setMessage(d.message || "تم استرجاع القرار السابق.");
      await loadRows();
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };
  const weekRows = filteredRows;
  /**
   * Where the chosen room is actually free.
   *
   * Filtering by a room answers "what happens in G24" — the dimmed cards say
   * that already. The question a scheduler actually brings to a room is the
   * opposite one: "when can I still use it?" So while a building or hall is in
   * the lens, every half-hour that room is NOT teaching gets a quiet wash, and
   * the grid becomes a map of availability instead of occupation.
   *
   * Computed from the department's full row set, not the search-filtered one:
   * a room is not free just because its lecture is filtered out of view.
   */
  const lensRoomActive = Boolean(lens.building || lens.rooms.length);
  const lensRoomBusy = useMemo(() => {
    const busy = new Set<string>();
    if (!lensRoomActive) return busy;
    rows.forEach(row => {
      const room = roomIdentity(row.AdRoomCode, row.AdRoomHall);
      if (lens.building && room.buildingKey !== normalizeRoomToken(lens.building)) return;
      if (lens.rooms.length && !lens.rooms.includes(room.key)) return;
      const from = mins(row.fstarttime), to = mins(row.fendtime);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;
      days.forEach(day => {
        if (!(row as any)[day.key]) return;
        for (let m = Math.floor(from / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES; m < to; m += SCHEDULE_SLOT_MINUTES) {
          busy.add(`${day.key}|${timeFromMins(m)}`);
        }
      });
    });
    return busy;
  }, [rows, lens.building, lens.rooms, lensRoomActive]);
  /** The university clock is fixed: every timetable reads 08:00–20:00. */
  /**
   * The minute the grid believes it is.
   *
   * A wall clock rather than a timer: the first tick is aligned to the next
   * minute boundary, so the marker moves when the minute actually changes
   * instead of at some random fraction of a minute after the page opened.
   */
  const [nowMinutes, setNowMinutes] = useState(() => {
    const at = new Date();
    return at.getHours() * 60 + at.getMinutes();
  });
  useEffect(() => {
    let interval: number | undefined;
    const read = () => {
      const at = new Date();
      setNowMinutes(at.getHours() * 60 + at.getMinutes());
    };
    const at = new Date();
    const toNextMinute = (60 - at.getSeconds()) * 1000 - at.getMilliseconds();
    const timeout = window.setTimeout(() => {
      read();
      interval = window.setInterval(read, 60_000);
    }, toNextMinute);
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, []);
  /**
   * ── «الآن» على الأسبوع ──────────────────────────────────────────────────
   *
   * The rooms matrix has had a now-marker for a while; the week board — the
   * screen people actually live in — has never had one. Opening it between two
   * lectures told you everything about the week and nothing about the minute.
   *
   * Two conditions gate it, and both matter. It is drawn **only in today's
   * column**, because in a weekly grid the other four days are not happening —
   * a rule stretched across all five would say something false about Tuesday.
   * And it is drawn **only while the term on screen is the term now running**,
   * because a line labelled «الآن» over a schedule from 2019 is worse than no
   * line at all. Where a term carries its start date and length, that is the
   * test; where it does not — and ten years of terms do not — the newest term
   * is taken as the current one, which is this department's own convention.
   */
  const termIsRunning = useMemo(() => {
    const term = terms.find((item: any) => Number(item.AdTermId) === Number(filterTerm));
    if (!term) return false;
    const start = String((term as any).AdTermStart || "");
    const weeks = Number((term as any).AdTermWeeks || 0);
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && weeks > 0) {
      const from = Date.parse(`${start}T00:00:00`);
      if (Number.isFinite(from)) {
        const to = from + weeks * 7 * 86400000;
        const now = Date.now();
        return now >= from && now < to;
      }
    }
    const newest = Math.max(0, ...terms.map((item: any) => Number(item.AdTermId) || 0));
    return Number(filterTerm) === newest;
  }, [terms, filterTerm]);

  /**
   * Which column, if any, is today.
   *
   * Friday and Saturday are not taught, so they return null — which is how the
   * marker takes the weekend off rather than parking itself on Thursday.
   * Recomputed each minute so the column hands over at midnight.
   */
  const todayKey = useMemo<DayKey | null>(() => {
    const byWeekday: Record<number, DayKey> = {
      0: "fsunday", 1: "fmonday", 2: "ftuesday", 3: "fwednesday", 4: "fthursday",
    };
    return byWeekday[new Date().getDay()] ?? null;
  }, [nowMinutes]);
  /**
   * The two appointments the hour cares about: the one under way and the one
   * after it.
   *
   * The list is the section's whole week in one column, not a day in order, so
   * a "now" rule drawn across it would divide nothing. What a reader actually
   * asks on opening the page is narrower — what is running, and what is next —
   * and that is answerable without disturbing the order at all: at most two
   * cards out of several hundred carry a mark, and on a weekend, none do.
   */
  const liveNow = useMemo(
    () => pickLive(filteredRows as any, todayKey, nowMinutes),
    [filteredRows, todayKey, nowMinutes],
  );
  /**
   * How heavily each day is actually taught, as a share of the heaviest day.
   *
   * A count answers "how many" and stops there — six lectures spread across a
   * morning and six stacked into ninety minutes are the same number and not
   * remotely the same day. Taught minutes say which is which, so the strip can
   * show the pressure before the day is opened.
   */
  const dayLoad = useMemo(() => computeDayLoad(weekRows as any), [weekRows]);
  /**
   * ── الشبكة تتّسع لما فيها ───────────────────────────────────────────────
   *
   * This was fixed at 08:00–20:00. A lecture outside that window was not
   * filtered out — it was POSITIONED outside the grid and then clipped away by
   * the surface's own `overflow`, so it existed, it counted in every total, it
   * blocked its hall, and it was invisible. A coordinator looking for it would
   * search the week and conclude it had been deleted.
   *
   * The teaching day is still 08:00–20:00 and every rule that guards it is
   * unchanged: a lecture cannot be CREATED outside it. But a schedule imported
   * from a decade of legacy data can already contain one, and a grid that
   * silently hides a row it is displaying the totals for is lying.
   *
   * So the window is the union of the teaching day and whatever the data
   * actually holds, snapped outward to whole slots. In the ordinary case that
   * is exactly 08:00–20:00 and nothing changes; in the case that was broken,
   * the missing cards appear.
   */
  const gridWindow = useMemo(() => {
    let start = SCHEDULE_DAY_START, end = SCHEDULE_DAY_END;
    for (const row of weekRows as FSchedule[]) {
      const from = mins(row.fstarttime), to = mins(row.fendtime);
      if (Number.isFinite(from) && from < start) start = from;
      if (Number.isFinite(to) && to > end) end = to;
    }
    const snapDown = (value: number) => Math.floor(value / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES;
    const snapUp = (value: number) => Math.ceil(value / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES;
    return { start: Math.max(0, snapDown(start)), end: Math.min(24 * 60, snapUp(end)) };
  }, [weekRows]);
  /** Where the line sits inside a day column, in pixels from its top. */
  const nowOffset = useMemo(() => {
    if (!todayKey || !termIsRunning) return null;
    if (nowMinutes < gridWindow.start || nowMinutes > gridWindow.end) return null;
    return ((nowMinutes - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H;
  }, [todayKey, termIsRunning, nowMinutes, gridWindow]);

  /**
   * The rooms matrix, computed once per change of data — not once per render.
   *
   * This screen used to build its room map, sort it through the Arabic
   * collator, and then RE-FILTER every appointment once per room row, all
   * inside the render body. Ten rooms against a hundred appointments meant a
   * thousand comparisons plus a full Intl sort — and it ran again on every
   * hover, because hovering a card sets peek state. That is the whole reason
   * the most beautiful screen was the slowest one.
   *
   * Now the day's rows are indexed into a room→rows map in one pass, the sort
   * happens once, and a hover re-renders without recomputing anything.
   */
  const roomsMatrix = useMemo(() => {
    const displayDays = matrixDay === "week"
      ? days
      : days.filter(day => day.key === matrixDay);
    const roomsSeen = new Map<string, {
      key: string;
      building: string;
      hall: string;
      buildingKey: string;
      hallKey: string;
      label: string;
    }>();
    filteredRows.forEach(row => {
      const room = roomIdentity(row.AdRoomCode, row.AdRoomHall);
      if (!room.buildingKey && !room.hallKey) return;
      if (!roomsSeen.has(room.key)) {
        roomsSeen.set(room.key, {
          key: room.key,
          building: room.building,
          hall: room.hall,
          buildingKey: room.buildingKey,
          hallKey: room.hallKey,
          label: room.label,
        });
      }
    });
    const allRooms = [...roomsSeen.values()].sort((a, b) => byArabic(a.label, b.label));
    const buildingCounts = new Map<string, number>();
    allRooms.forEach(room => buildingCounts.set(room.buildingKey, (buildingCounts.get(room.buildingKey) || 0) + 1));
    const allBuildings = [...new Map(allRooms
      .filter(room => room.buildingKey)
      .map(room => [room.buildingKey, { key: room.buildingKey, label: room.building, count: buildingCounts.get(room.buildingKey) || 0 }] as const)
    ).values()].sort((a, b) => byArabic(a.label, b.label));
    // One pass builds every room/day bucket. The full-week view therefore
    // costs one O(rows × five-days) index, not five complete room renders.
    const byDayRoom = new Map<string, FSchedule[]>();
    const byRoom = new Map<string, FSchedule[]>();
    const noRoomByDay = new Map<DayKey, FSchedule[]>();
    const roomCounts = new Map<string, number>();
    filteredRows.forEach(row => {
      if (!row.fstarttime || !row.fendtime || mins(row.fendtime) <= mins(row.fstarttime)) return;
      const room = roomIdentity(row.AdRoomCode, row.AdRoomHall);
      if (room.buildingKey || room.hallKey) {
        const roomRows = byRoom.get(room.key);
        if (roomRows) roomRows.push(row); else byRoom.set(room.key, [row]);
      }
      days.forEach(day => {
        if (!Boolean((row as any)[day.key])) return;
        if (!room.buildingKey && !room.hallKey) {
          const homeless = noRoomByDay.get(day.key as DayKey);
          if (homeless) homeless.push(row); else noRoomByDay.set(day.key as DayKey, [row]);
          return;
        }
        const dayKey = `${day.key}|${room.key}`;
        const bucket = byDayRoom.get(dayKey);
        if (bucket) bucket.push(row); else byDayRoom.set(dayKey, [row]);
        roomCounts.set(room.key, (roomCounts.get(room.key) || 0) + 1);
      });
    });
    const hourMarks: number[] = [];
    for (let m = gridWindow.start; m <= gridWindow.end; m += 60) hourMarks.push(m);
    const compactByRoom = new Map<string, {
      items: Array<{ row: FSchedule; lane: number; visualFrom: number; visualTo: number }>;
      lanes: number;
      laneDays: Array<{ key: string; labels: string[] }>;
    }>();
    byRoom.forEach((roomRows, key) => {
      /* A compact lane has one *day pattern*, not an unrelated union of room
         days.  Thus الأحد/الثلاثاء/الخميس beside a lane describes every card
         on that exact lane; one-, two- and three-day lectures remain obvious. */
      const groups = new Map<string, { labels: string[]; rows: FSchedule[]; firstDay: number }>();
      roomRows.forEach(row => {
        const active = days.filter(day => Boolean((row as any)[day.key]));
        const pattern = active.map(day => day.key).join("|") || "none";
        const existing = groups.get(pattern);
        if (existing) existing.rows.push(row);
        else groups.set(pattern, {
          labels: active.map(day => day.label),
          rows: [row],
          firstDay: active.length ? days.findIndex(day => day.key === active[0].key) : days.length,
        });
      });
      const items: Array<{ row: FSchedule; lane: number; visualFrom: number; visualTo: number }> = [];
      const laneDays: Array<{ key: string; labels: string[] }> = [];
      [...groups.entries()].sort((a, b) => a[1].firstDay - b[1].firstDay || a[0].localeCompare(b[0])).forEach(([pattern, group]) => {
        const laneEnds: number[] = [];
        group.rows.slice().sort((a, b) => mins(a.fstarttime) - mins(b.fstarttime) || mins(a.fendtime) - mins(b.fendtime)).forEach(row => {
          const actualFrom = Math.max(SCHEDULE_DAY_START, mins(row.fstarttime));
          const actualTo = Math.min(SCHEDULE_DAY_END, mins(row.fendtime));
          const readableSpan = Math.max(60, actualTo - actualFrom);
          const visualFrom = Math.min(actualFrom, SCHEDULE_DAY_END - readableSpan);
          const visualTo = Math.min(SCHEDULE_DAY_END, visualFrom + readableSpan);
          let localLane = laneEnds.findIndex(endAt => endAt <= visualFrom);
          if (localLane < 0) {
            localLane = laneEnds.length;
            laneEnds.push(visualTo);
            laneDays.push({ key: `${pattern}:${localLane}`, labels: group.labels });
          } else laneEnds[localLane] = visualTo;
          const laneBase = laneDays.length - laneEnds.length;
          items.push({ row, lane: laneBase + localLane, visualFrom, visualTo });
        });
      });
      compactByRoom.set(key, { items, lanes: Math.max(1, laneDays.length), laneDays });
    });
    return {
      displayDays,
      allRooms,
      allBuildings,
      byDayRoom,
      compactByRoom,
      noRoomByDay,
      roomCounts,
      hourMarks,
      span: Math.max(60, gridWindow.end - gridWindow.start),
    };
  }, [filteredRows, matrixDay, gridWindow]);
  useEffect(() => {
    const allowed = new Set(
      roomsMatrix.allRooms
        .filter(room => !matrixBuildings.size || matrixBuildings.has(room.buildingKey))
        .map(room => room.key),
    );
    setMatrixRooms(current => {
      if (!current.size) return current;
      const next = new Set([...current].filter(key => allowed.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [roomsMatrix.allRooms, matrixBuildings]);
  /* The ladder is the window's own, not the constant's. It already declared
     `gridWindow` as its dependency and then ignored it — so a window that grew
     to hold an early or late lecture produced a card with nowhere to stand. */
  const timeSlots = useMemo(
    () => Array.from({ length: Math.round((gridWindow.end - gridWindow.start) / SCHEDULE_SLOT_MINUTES) }, (_, i) =>
      timeFromMins(gridWindow.start + i * SCHEDULE_SLOT_MINUTES),
    ),
    [gridWindow],
  );
  const [expandedDay, setExpandedDay] = useState<DayKey | null>(null);
  const [hallBarterReservations, setHallBarterReservations] = useState<HallBarterReservationView[]>([]);
  useEffect(() => { setHallBarterReservations([]); }, [filterCollege, filterSection, filterTerm]);

  /**
   * The board's own description of itself.
   *
   * Only what a reader would expect to find again: the scope, which board is
   * showing, what the colours mean, which layers are folded, what the search
   * box holds. Deliberately not: the lecture under the pointer, a half-made
   * selection, an open dialog, the undo log, the scroll offset. A view is where
   * you were standing, not what you happened to be doing.
   */
  const captureView = useCallback((name: string): ScheduleViewDraft => ({
    name,
    scope: { collegeId: filterCollege, sectionId: filterSection, termId: filterTerm },
    display: {
      viewMode: viewMode as any,
      hueBy,
      colorBlind,
      expandedDay: expandedDay || null,
      matrixDay: String(matrixDay),
    },
    filters: {
      quickSearch,
      hueFocus: [...hueFocus],
      hueHidden: [...hueHidden],
      matrixBuildings: [...matrixBuildings],
      matrixRooms: [...matrixRooms],
    },
  }), [filterCollege, filterSection, filterTerm, viewMode, hueBy, colorBlind, expandedDay, matrixDay, quickSearch, hueFocus, hueHidden, matrixBuildings, matrixRooms]);

  const activeView = useMemo(
    () => savedViews.find(view => view.id === activeViewId) || null,
    [savedViews, activeViewId],
  );
  /* The dot's whole meaning: the board no longer matches what was saved. */
  const viewDirty = useMemo(
    () => Boolean(activeView) && !sameView(captureView(activeView!.name), activeView!),
    [activeView, captureView],
  );

  const applyView = useCallback((view: ScheduleSavedView) => {
    const stale = describeStaleScope(view, {
      colleges: colleges.map(item => item.AdCollegeId),
      sections: sections.map(item => item.AdSectionId),
      terms: terms.map(item => Number(item.AdTermId)),
    });
    // A scope that has since been archived is said out loud, and whatever is
    // still reachable is opened anyway — never a silent empty board.
    if (view.scope.collegeId) setFilterCollege(view.scope.collegeId);
    if (view.scope.sectionId) setFilterSection(view.scope.sectionId);
    if (view.scope.termId) setFilterTerm(view.scope.termId);
    startTransition(() => setViewMode(view.display.viewMode));
    setHueBy(view.display.hueBy);
    setColorBlind(view.display.colorBlind);
    setExpandedDay((view.display.expandedDay as DayKey) || null);
    setMatrixDay((view.display.matrixDay as any) || "week");
    setQuickSearch(view.filters.quickSearch);
    setHueFocus(new Set(view.filters.hueFocus));
    setHueHidden(new Set(view.filters.hueHidden));
    setMatrixBuildings(new Set(view.filters.matrixBuildings || []));
    setMatrixRooms(new Set(view.filters.matrixRooms));
    setActiveViewId(view.id);
    setMessage(stale ? stale : `فُتح العرض: ${view.name}`);
  }, [colleges, sections, terms]);

  const saveCurrentView = useCallback((name: string) => {
    const created = viewsStore.create(captureView(name));
    setSavedViews(viewsStore.list());
    setActiveViewId(created.id);
    setMessage(`حُفظ العرض: ${created.name}`);
  }, [viewsStore, captureView]);

  /**
   * Week means week on first entry — on every screen size.
   *
   * A previous phone optimisation auto-opened today's column, which made the
   * «الأسبوع» view arrive already filtered to one day. Day focus now happens
   * only after an explicit press on a day header or the «اليوم» control.
   */

  /*
   * Phone keeps the dense boards safe.
   *
   * The list view is now editable on the phone, so only the week canvas and the
   * room matrix stay behind the explanatory gate. Their gestures still mean
   * drag, move and spatial comparison, which are easy to trigger by mistake on
   * a touch screen.
   */
  useEffect(() => {
    if (!phoneReadOnly || mode !== "schedule" || typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>(".schedule-page");
    if (!root) return;
    const insideCanvas = (event: Event) => {
      const target = event.target as HTMLElement | null;
      return Boolean(target?.closest(".rooms-surface, .week-surface"));
    };
    const stopStart = (event: Event) => {
      if (!insideCanvas(event)) return;
      event.stopPropagation();
    };
    const explain = (event: Event) => {
      if (!insideCanvas(event)) return;
      event.preventDefault();
      event.stopPropagation();
      setMobileViewGate(viewMode === "week" ? "week" : viewMode === "rooms" ? "rooms" : "list");
    };
    const explainKey = (event: KeyboardEvent) => {
      if (!insideCanvas(event)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      setMobileViewGate(viewMode === "week" ? "week" : viewMode === "rooms" ? "rooms" : "list");
    };
    root.addEventListener("pointerdown", stopStart, true);
    root.addEventListener("click", explain, true);
    root.addEventListener("dblclick", explain, true);
    root.addEventListener("dragstart", explain, true);
    root.addEventListener("drop", explain, true);
    root.addEventListener("contextmenu", explain, true);
    root.addEventListener("keydown", explainKey, true);
    return () => {
      root.removeEventListener("pointerdown", stopStart, true);
      root.removeEventListener("click", explain, true);
      root.removeEventListener("dblclick", explain, true);
      root.removeEventListener("dragstart", explain, true);
      root.removeEventListener("drop", explain, true);
      root.removeEventListener("contextmenu", explain, true);
      root.removeEventListener("keydown", explainKey, true);
    };
  }, [phoneReadOnly, mode, viewMode]);
  /** How many appointments each day actually carries — every day gets a count. */
  const dayCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    days.forEach(day => { counts[day.key] = 0; });
    weekRows.forEach(row => days.forEach(day => { if ((row as any)[day.key]) counts[day.key] += 1; }));
    return counts;
  }, [weekRows]);
  /**
   * The lectures the week cannot draw.
   *
   * A row with no day, or with no hour, exists in the data and nowhere on the
   * grid — so it is invisible exactly when it most needs attention. They are
   * gathered into a column of their own beside the week; dragging one onto a
   * square is how it joins the timetable.
   */
  const unplaced = useMemo(
    () => weekRows.filter(row =>
      !days.some(day => Boolean((row as any)[day.key])) ||
      !row.fstarttime || !row.fendtime || mins(row.fendtime) <= mins(row.fstarttime)),
    [weekRows],
  );

  /**
   * Week layout: one lane assignment per day, then every card widens.
   *
   * The old version grouped a day into chains of overlap and judged the chain
   * as a whole, so an ordinary Wednesday — eighteen lectures, never more than
   * two at once — became a single scrolling list of catalogue numbers, because
   * one lecture touched the next which touched the next. The chain is not the
   * measure of density; the moment is.
   *
   * So this is the calendar algorithm proper. Overlapping appointments get
   * columns, and then each one expands to the right over every column that
   * happens to be free for its own hour. A lecture with nobody beside it takes
   * the whole width even when the day around it is busy, and only the genuinely
   * concurrent hour is split — which is what a person means when they say a
   * timetable is readable.
   */
  /**
   * The slim vertical rails are retired.
   *
   * Long workshops used to step out of the lanes into rotated slivers at the
   * column's edge — and the field said no: this grid reads horizontally,
   * always. With the threshold at infinity every workshop stays in the lane
   * flow, and when a crowd of them collides the woven hour takes over and
   * lays them as horizontal, named, draggable slices.
   */
  const LONG_BLOCK = Number.POSITIVE_INFINITY;
  const weekLayout = useMemo(() => {
    type Placed = { row: FSchedule; top: number; height: number; lane: number; span: number; lanes: number; spine?: number };
    const layout: Record<string, { items: Placed[]; spine: Placed[]; busiest: number }> = {};

    const geometry = (row: FSchedule) => ({
      top: ((mins(row.fstarttime) - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H,
      height: Math.max(SLOT_H - 4, ((mins(row.fendtime) - mins(row.fstarttime)) / SCHEDULE_SLOT_MINUTES) * SLOT_H - 3),
    });

    for (const day of days) {
      const all = weekRows
        .filter((item) => Boolean(item[day.key]) && item.fstarttime && item.fendtime)
        .slice()
        .sort((a, b) => mins(a.fstarttime) - mins(b.fstarttime) || mins(b.fendtime) - mins(a.fendtime));

      /**
       * The four-hour workshop steps out of the way.
       *
       * A block that runs from eight to one is not competing with the ten
       * o'clock lecture for attention — it is the background of the day. Left
       * in the ordinary column flow it takes a quarter of the width for five
       * hours and squeezes every lecture beside it into an unreadable sliver.
       * So long single-day blocks get slim rails of their own at the edge of
       * the column, and the day's teaching keeps its full width.
       */
      const spineRows = all.filter(item =>
        days.filter(d => Boolean((item as any)[d.key])).length === 1 &&
        mins(item.fendtime) - mins(item.fstarttime) >= LONG_BLOCK);
      const items = all.filter(item => !spineRows.includes(item));

      const spineEnds: number[] = [];
      const spine: Placed[] = spineRows.map(item => {
        const from = mins(item.fstarttime);
        let rail = spineEnds.findIndex(endAt => endAt <= from);
        if (rail < 0) { rail = spineEnds.length; spineEnds.push(0); }
        spineEnds[rail] = mins(item.fendtime);
        return { row: item, ...geometry(item), lane: 0, span: 1, lanes: 1, spine: rail };
      });

      // Chains of overlap define who competes for columns…
      const groups: FSchedule[][] = [];
      let current: FSchedule[] = [];
      let currentEnd = -1;
      for (const item of items) {
        if (current.length && mins(item.fstarttime) >= currentEnd) {
          groups.push(current); current = []; currentEnd = -1;
        }
        current.push(item);
        currentEnd = Math.max(currentEnd, mins(item.fendtime));
      }
      if (current.length) groups.push(current);

      const placed: Placed[] = [];
      let busiest = 1;
      for (const group of groups) {
        // …greedy column assignment inside the chain…
        const columns: FSchedule[][] = [];
        for (const item of group) {
          const from = mins(item.fstarttime), to = mins(item.fendtime);
          let index = columns.findIndex(column =>
            column.every(other => mins(other.fendtime) <= from || mins(other.fstarttime) >= to));
          if (index < 0) { index = columns.length; columns.push([]); }
          columns[index].push(item);
        }
        const lanes = Math.max(1, columns.length);

        for (let lane = 0; lane < columns.length; lane++) {
          for (const item of columns[lane]) {
            const from = mins(item.fstarttime), to = mins(item.fendtime);
            // …and then the card takes every neighbouring column that is free
            // for exactly its own hour.
            let span = 1;
            for (let probe = lane + 1; probe < columns.length; probe++) {
              const clash = columns[probe].some(other => mins(other.fstarttime) < to && mins(other.fendtime) > from);
              if (clash) break;
              span += 1;
            }
            busiest = Math.max(busiest, lanes - span + 1);
            placed.push({ row: item, ...geometry(item), lane, span, lanes });
          }
        }
      }
      layout[day.key] = { items: placed, spine, busiest: Math.max(busiest, spineEnds.length ? busiest + 1 : busiest) };
    }
    return layout;
  }, [weekRows, gridWindow]);

  /**
   * When an hour holds five lectures or more, lanes stop being an answer.
   *
   * Eight concurrent courses in a 212px column are eight slivers of 26 pixels —
   * a bar chart of nothing. Past this threshold the cluster stops pretending to
   * be eight readable cards and becomes one honest object: a woven band, one
   * ribbon per course in the course's own hue, that says "this hour is dense"
   * at a glance and names each thread on hover. Opening it fans the lectures
   * into full-width cards that drag onto the grid like any other — the fan is
   * the reading view, the weave is the map.
   *
   * Clusters are found by time-overlap connectivity on the already-laid-out
   * items, so the weave covers exactly the block the lanes would have covered.
   */
  /* Four lanes was the old survival threshold; the readability floor says a
     card under ~72px cannot say its name, and four lanes land there. From
     four concurrent onward the hour weaves. */
  const BUNDLE_LANES = 4;
  const weekBundles = useMemo(() => {
    type Bundle = { key: string; top: number; height: number; from: string; to: string; rows: FSchedule[] };
    const byDay: Record<string, Bundle[]> = {};
    const bundled: Record<string, Set<number>> = {};
    for (const day of days) {
      /* Membership and clustering live in utils/weekVisual (clusterSqueezed),
         where the per-card rule — five-plus lanes, two spans or fewer — and
         the chain-tail exemption are documented and under test. */
      const items = weekLayout[day.key]?.items || [];
      const rowById = new Map(items.map(item => [item.row.id, item.row]));
      const clusters = clusterSqueezed(
        items.map(item => ({ id: item.row.id, top: item.top, height: item.height, lanes: item.lanes, span: item.span })),
        BUNDLE_LANES,
      );
      const dayBundles: Bundle[] = [];
      const ids = new Set<number>();
      clusters.forEach(cluster => {
        const rows = cluster.ids
          .map(id => rowById.get(id))
          .filter((row): row is FSchedule => Boolean(row))
          .sort((a, b) => mins(a.fstarttime) - mins(b.fstarttime));
        if (!rows.length) return;
        const from = rows.reduce((m, r) => Math.min(m, mins(r.fstarttime)), Number.POSITIVE_INFINITY);
        const to = rows.reduce((m, r) => Math.max(m, mins(r.fendtime)), 0);
        rows.forEach(row => ids.add(row.id));
        dayBundles.push({
          key: `${day.key}:${rows.map(r => r.id).join("-")}`,
          top: cluster.top,
          height: cluster.bottom - cluster.top,
          from: timeFromMins(from),
          to: timeFromMins(to),
          rows,
        });
      });
      byDay[day.key] = dayBundles;
      bundled[day.key] = ids;
    }
    return { byDay, bundled };
  }, [weekLayout]);
  /** The one weave currently fanned open, with where to hang the panel. */
  const [fanned, setFanned] = useState<{ key: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!fanned) return;
    const stillThere = days.some(day => (weekBundles.byDay[day.key] || []).some(b => b.key === fanned.key));
    if (!stillThere) setFanned(null);
  }, [weekBundles, fanned]);

  /**
   * Where a card sits across the width of its day.
   *
   * An expanded day gives every lane the full grid, so nothing there needs to
   * share. Everywhere else the card occupies the columns it earned.
   */
  const RAIL = 26;
  const laneStyle = (placed: { lane: number; span: number; lanes: number }, rails: number): React.CSSProperties => {
    const reserved = rails * RAIL;
    if (placed.lanes <= 1) return reserved ? { insetInlineEnd: `${reserved + 5}px` } : {};
    const unit = `((100% - ${reserved}px) / ${placed.lanes})`;
    return {
      insetInlineStart: `calc(${placed.lane} * ${unit} + 4px)`,
      insetInlineEnd: "auto",
      width: `calc(${placed.span} * ${unit} - 8px)`,
      zIndex: 20 + placed.lane,
    };
  };

  /**
   * A single week card. Shared by ordinary hours and by opened days.
   *
   * What it says, and in what order, is the whole argument of this screen. A
   * coordinator reads a timetable looking for a subject and a colleague, never
   * for a catalogue number — so the course name leads, the instructor follows,
   * and the code is demoted to a small mark that identifies the card without
   * competing with it. Nothing is clipped: the card is as tall as its lecture,
   * and the lines it cannot fit are dropped whole rather than cut in half.
   */
  const renderWeekCard = (r: FSchedule, d: { key: DayKey; label: string }, style: React.CSSProperties, widthShare = 1) => {
    const c = courseById.get(r.AdCourseId);
    const i = instructorById.get(r.AdInstructorId);
    const code = c?.CourseCode || r.AdCourseName || "—";
    const title = r.AdCourseName || c?.CourseName || code;
    const label = courseLabel(title, widthShare);
    const who = i?.AdInstructorName || "بدون أستاذ";
    /* First and last name only — «د. عبدالرحمن الشراد» — then the width-aware
       shortener may trim further on a squeezed lane. */
    const shortWho = i?.AdInstructorName ? instructorLabel(firstLast(i.AdInstructorName), widthShare) : who;
    const place = placeOf(r);
    /* Computed once: the card wears it as colour, and — when the reader has
       asked for it — as a weave keyed to the same number. */
    const cardHue = hueFor(code, title, i?.AdInstructorName, placeOf(r));
    // The drag lives on pointerdown. Recording where the press began has to be
    // merged with it rather than declared after it — a second onPointerDown prop
    // silently replaces the first, which is exactly how dragging was lost.
    const grip = physics.bindEvent(r, d.key);
    return (
      <article
        {...grip}
        draggable={!saving && !physics.supported}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/schedule-id", String(r.id));
          e.dataTransfer.effectAllowed = "move";
          beginRipple(r);
        }}
        onDragEnd={clearRipple}
        onPointerDown={(e) => {
          pressOrigin.current = { x: e.clientX, y: e.clientY };
          grip.onPointerDown?.(e);
        }}
        onClick={(e) => {
          // A drag ends in a click too; only a press that stayed put means "open".
          // Geometry alone was not enough — a card nudged five pixels and settled
          // back still read as a click and opened the whole lecture on top of a
          // move. The drag itself is now asked whether it just happened.
          if (physics.didDrag() || physicsActive) return;
          const from = pressOrigin.current;
          if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return;
          if (picking) { toggleSelect(r.id); return; }
          // Clicking a lecture opens its reading panel — understand before edit,
          // and never leave the board. Editing is one press away inside the panel.
          void openContext(r);
        }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") { void openContext(r); return; }
          // Space lifts the lecture into the keyboard's hands. Enter keeps the
          // meaning it always had, so nothing a reader already knows changes.
          if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); pickUpWithKeyboard(r); }
        }}
        aria-label={`${title} · ${code} · شعبة ${r.SCode || "—"} · ${who} · ${arabicDays(r) || "بلا أيام"} · ${formatScheduleTimeRange(r.fstarttime, r.fendtime)}${place ? ` · قاعة ${place}` : ""}`}
        data-narrow={widthShare <= 0.34 ? "true" : undefined}
        data-row-id={r.id}
        className={`week-event ${lensClass(r)} ${xrayClass(r)} ${physicsRelationClass(r)} ${draggingId === r.id ? "ripple-source" : ""} ${physicsActive && physicsOrigin?.id === r.id ? "physics-source-lift" : ""} ${justChangedId === r.id ? "just-changed" : ""} ${reviewFocus.has(r.id) ? "review-flagged" : ""} ${multiSelect.has(r.id) ? "week-picked" : ""} ${liveClash.ids.has(r.id) ? "live-clash" : ""} ${keyMove?.rowId === r.id ? "week-keymove-source" : ""} ${hueFocusClass(r)}`}
        style={{ ...style, ["--hue" as any]: cardHue, ...textureFor(cardHue) }}
        onPointerEnter={(e) => { if (!physicsActive) openPeek(r, e.currentTarget); }}
        onPointerLeave={() => setPeek(current => (current?.row.id === r.id ? null : current))}
        onFocus={(e) => openPeek(r, e.currentTarget)}
        onBlur={() => setPeek(current => (current?.row.id === r.id ? null : current))}
        key={`${d.key}-${r.id}`}
      >
        <GripVertical data-physics-handle="true" className="week-drag-handle" />
        <button
          className="week-insight"
          type="button"
          title="السياق الذكي"
          onClick={(e) => { e.stopPropagation(); openContext(r); }}
        >
          <BrainCircuit />
        </button>
        <strong className="week-title" data-short={label.shortened ? "true" : undefined}>{label.text}</strong>
        <span className="week-who">{shortWho}{visitingIds.has(r.AdInstructorId) ? <i className="week-visiting" title="أستاذ منتدب">م</i> : null}</span>
        <small className="week-when"><time dir="ltr">{formatScheduleTimeRange(r.fstarttime, r.fendtime)}</time>{place ? <i>{place}</i> : null}</small>
        <em className="week-code" dir="ltr">{code}</em>
        {(() => {
          /* The card that just landed says so, and carries its own way back:
             one press undoes exactly this move — no hunting through a log. */
          const undoId = recentMoves[r.id];
          const entry = undoId ? undoLog.find(item => item.id === undoId && !item.usedAt) : null;
          if (!entry) return null;
          return (
            <button
              type="button"
              className="week-moved-pill"
              title={`${entry.label} — اضغط للتراجع`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                void runUndoEntry(entry);
                setRecentMoves(current => {
                  const next = { ...current };
                  delete next[r.id];
                  return next;
                });
              }}
            >
              <Undo2 aria-hidden="true" />تراجع
            </button>
          );
        })()}
      </article>
    );
  };
  /** One switch decides what colour answers: "which course?" or "whose?" */
  /** «مبنى/قاعة», or the honest absence of one — one spelling, used everywhere. */
  const placeOf = (r: FSchedule) => roomIdentity(r.AdRoomCode, r.AdRoomHall).label || "بدون قاعة";
  const hueFor = (code: string, title: string, instructorName?: string, room?: string) =>
    hueBy === "instructor"
      ? courseHue(instructorName || "بدون أستاذ", "")
      : hueBy === "room"
        ? courseHue(room || "بدون قاعة", "")
        : courseHue(code, title);

  /**
   * A weave for a hue — the second channel the colour-blind setting turns on.
   *
   * The wheel is cut into six, and each sixth gets a weave that survives on a
   * five-pixel spine: only patterns that vary along the card's height are
   * legible there, so the set varies dash length and angle rather than
   * direction alone. The sixth is solid, which is as distinct as any pattern.
   * Emitted always but read only under [data-colorblind] — three unused custom
   * properties cost nothing and keep the style object in one shape.
   */
  const textureFor = (hue: number) => {
    const band = Math.floor(((((hue % 360) + 360) % 360) / 60)) % 6;
    const weave = [
      { a: "0deg", on: "2px", off: "4px" },
      { a: "0deg", on: "5px", off: "4px" },
      { a: "45deg", on: "2px", off: "4px" },
      { a: "-45deg", on: "2px", off: "4px" },
      { a: "0deg", on: "1px", off: "3px" },
      { a: "0deg", on: "100px", off: "0px" },
    ][band];
    return {
      ["--cb-angle" as any]: weave.a,
      ["--cb-on" as any]: weave.on,
      ["--cb-off" as any]: weave.off,
    };
  };

  /**
   * What a card's colour actually stands for.
   *
   * The hue is a hash of exactly these inputs, so the legend derives its swatch
   * from the same call rather than guessing — a chip can never show a colour the
   * grid does not use. The key is prefixed by mode because the two modes are
   * different alphabets: a focus held across the switch would be meaningless.
   */
  const hueIdentity = (r: FSchedule) => {
    if (hueBy === "instructor") {
      const name = instructorById.get(r.AdInstructorId)?.AdInstructorName || "بدون أستاذ";
      return { key: `i:${name}`, label: firstLast(name), hue: courseHue(name, "") };
    }
    if (hueBy === "room") {
      const place = placeOf(r);
      return { key: `r:${place}`, label: place, hue: courseHue(place, "") };
    }
    const course = courseById.get(r.AdCourseId);
    const code = course?.CourseCode || r.AdCourseName || "—";
    const title = r.AdCourseName || course?.CourseName || code;
    return { key: `c:${code}·${title}`, label: title, hue: courseHue(code, title) };
  };

  /* The key to the week's colours, built from what is actually on screen and
     ordered by weight, so the course a reader is most likely hunting sits
     first. Rebuilt only when the rows or the colour's meaning change. */
  const hueLegend = useMemo(() => {
    const seen = new Map<string, { key: string; label: string; hue: number; count: number }>();
    filteredRows.forEach(r => {
      const id = hueIdentity(r);
      const found = seen.get(id.key);
      if (found) found.count += 1;
      else seen.set(id.key, { ...id, count: 1 });
    });
    return [...seen.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ar"));
  }, [filteredRows, hueBy, courseById, instructorById]);

  /* Arabic is written with and without its diacritics and with three shapes of
     alef, so a raw substring match makes the reader spell a name exactly as the
     catalogue happens to store it. Folding both sides means «الاذاعة» finds
     «الإذاعة». */
  const foldArabic = (value: string) =>
    String(value || "")
      .replace(/[ً-ْٰـ]/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .toLowerCase()
      .trim();

  const legendShown = useMemo(() => {
    const needle = foldArabic(legendQuery);
    if (!needle) return hueLegend;
    return hueLegend.filter(item => foldArabic(item.label).includes(needle));
  }, [hueLegend, legendQuery]);

  /* The search only earns its place once the strip overflows; below that the
     chips are all visible and a box would be furniture. */
  const legendSearchable = hueLegend.length > 12;

  /* A focus is only meaningful against the rows it was chosen from: when the
     scope or the colour's meaning changes, the old key names nothing.
     The tools panel is no longer part of this: the key stands on its own now,
     so a focus can always be lifted from the same place it was set — the trap
     that made this reset necessary cannot occur. */
  useEffect(() => {
    setHueFocus(new Set());
    setHueHidden(new Set());
    setLegendQuery("");
  }, [hueBy, filterTerm, filterSection, filterCollege]);

  /* Applied to a card or a band while the legend holds a focus. Additive and
     self-contained — it neither reads nor writes the lens or the x-ray, so
     whatever those two mean is exactly what they meant before. */
  const hueFocusClass = (r: FSchedule) => {
    const key = hueIdentity(r).key;
    /* A folded layer wins over a focus: asking for a card to be out of the way
       and asking for it to be lit are contradictory, and the fold is the more
       recent, more deliberate instruction. */
    if (hueHidden.has(key)) return "hue-folded";
    return !hueFocus.size ? "" : hueFocus.has(key) ? "hue-lit" : "hue-shade";
  };
  /* Folding a layer away, and unfolding it. Presentation only — the row is on
     the board, in every count and every conflict scan, merely not drawn. */
  const toggleHueHidden = (key: string) =>
    setHueHidden(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /* Toggling one identity in or out of the lit set. */
  const toggleHueFocus = (key: string) =>
    setHueFocus(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /**
   * Colour as information.
   *
   * Every course keeps the same hue everywhere it appears, derived from its
   * code, so the eye can trace one course across five days without reading a
   * single word — and five concurrent lectures separate instantly. Red is never
   * assigned; it stays reserved for conflicts.
   */
  /* Colour assignment lives in utils/weekVisual — pure, shared, and under
     test. The comment on it there explains the FNV mixing and why the name
     joins the code. */

  const xraySelected = xrayId
    ? filteredRows.find((r) => r.id === xrayId) || null
    : null;
  const xraySharedDay = (a: FSchedule, b: FSchedule) =>
    days.some((d) => Boolean(a[d.key]) && Boolean(b[d.key]));
  const xrayTimeConnected = (a: FSchedule, b: FSchedule) => {
    if (!xraySharedDay(a, b)) return false;
    const gap = Math.max(
      0,
      Math.max(mins(a.fstarttime), mins(b.fstarttime)) -
        Math.min(mins(a.fendtime), mins(b.fendtime)),
    );
    return gap <= 30;
  };
  const xrayClass = (r: FSchedule) => {
    if (!xraySelected) return "";
    if (r.id === xraySelected.id) return "xray-origin";
    const rel: string[] = [];
    if (r.AdInstructorId === xraySelected.AdInstructorId) rel.push("professor");
    if (r.AdCourseId === xraySelected.AdCourseId) rel.push("course");
    if (sameRoom(r, xraySelected)) rel.push("room");
    if (xraySharedDay(r, xraySelected)) rel.push("day");
    if (xrayTimeConnected(r, xraySelected)) rel.push("time");
    return rel.length
      ? `xray-related ${rel.map((x) => `xray-${x}`).join(" ")}`
      : "xray-dim";
  };

  /**
   * The first answer during a drag is local and therefore instant.
   *
   * The server still refines it with the full university scope, but the card
   * no longer waits for three round trips before saying whether the visible
   * lecturer/room slot is free. This also protects a very quick drop: a known
   * local blocker can reject it before the remote explanation arrives.
   */
  const previewPhysicsTarget = (row: FSchedule, target: SchedulePhysicsTarget): SchedulePhysicsDecision => {
    const candidate = buildMoveCandidate(row, target);
    const samePlacement = (a: FSchedule, b: FSchedule) =>
      a.fstarttime === b.fstarttime && a.fendtime === b.fendtime &&
      days.every(day => Boolean(a[day.key]) === Boolean(b[day.key]));
    const combinedDelivery = (a: FSchedule, b: FSchedule) =>
      a.AdCourseId === b.AdCourseId && String(a.SCode) !== String(b.SCode) &&
      a.AdInstructorId === b.AdInstructorId &&
      sameRoom(a, b) &&
      samePlacement(a, b);
    const blockersFor = (probe: FSchedule) => rows.flatMap(other => {
      if (other.id === row.id || other.AdTermId !== probe.AdTermId || combinedDelivery(probe, other)) return [];
      const sharesDay = days.some(day => Boolean(probe[day.key]) && Boolean(other[day.key]));
      const overlaps = mins(probe.fstarttime) < mins(other.fendtime) && mins(other.fstarttime) < mins(probe.fendtime);
      if (!sharesDay || !overlaps) return [];
      const instructorBusy = Boolean(probe.AdInstructorId) && probe.AdInstructorId === other.AdInstructorId;
      const roomBusy = Boolean(probe.AdRoomCode && probe.AdRoomHall) && sameRoom(probe, other);
      if (!instructorBusy && !roomBusy) return [];
      return [{
        type: instructorBusy ? "instructor" : "room",
        severity: "high",
        message: instructorBusy ? "الأستاذ مرتبط بموعد آخر" : "القاعة محجوزة في هذا الوقت",
        detail: `${other.AdCourseName || courseById.get(other.AdCourseId)?.CourseName || "موعد آخر"} · ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}`,
      }];
    });
    const before = blockersFor(row).length;
    const blockers = blockersFor(candidate);
    const delta = blockers.length - before;
    const targetLoad = rows.filter(item => Boolean(item[target.day]) && mins(item.fstarttime) < mins(candidate.fendtime) && mins(item.fendtime) > mins(candidate.fstarttime)).length;
    const ripple = {
      headline: blockers.length
        ? "غير متاح مبدئيًا — يوجد حجز ظاهر في هذا الموضع."
        : "متاح مبدئيًا — أتأكد الآن من أثره على النطاق الكامل.",
      delta: {
        conflicts: delta,
        professorGap: 0,
        quality: blockers.length ? -4 : delta < 0 ? 3 : 0,
        dayPressure: Math.max(0, targetLoad - 1) * 4,
      },
      effects: blockers.length
        ? blockers.slice(0, 2).map(item => ({ tone: "warn", text: `${item.message} — ${item.detail}` }))
        : [{ tone: "good", text: "لا يظهر مانع في القاعة أو الأستاذ ضمن الجدول المعروض." }],
    };
    return buildDecision(
      `${row.id}:${target.day}:${target.start}`,
      ripple,
      null,
      null,
      blockers as any,
      blockers.length > 0,
      blockers[0] ? `${blockers[0].message} — ${blockers[0].detail}` : "",
    );
  };
  /* Declared ahead of the drag layer because the drag layer reads it: while the
     keyboard holds a lecture, the pointer layer is off. */
  type KeyboardMove = { rowId: number; day: DayKey; start: string };
  const [keyMove, setKeyMove] = useState<KeyboardMove | null>(null);
  const physics = useSchedulePhysics({
    disabled:
      mode !== "schedule" ||
      editor !== "index" ||
      (viewMode !== "week" && viewMode !== "rooms") ||
      saving ||
      presentationMode ||
      // One card, one hand: while the keyboard is carrying a lecture the
      // pointer layer is switched off entirely, so a stray press cannot pick up
      // a second copy of the same thing.
      Boolean(keyMove),
    previewTarget: previewPhysicsTarget,
    evaluateTarget: evaluatePhysicsTarget,
    onStart: (row) => {
      setPhysicsNotice("");
      setPhysicsField({});
      setError(null);
      // Colleagues learn the card is in the air the moment it leaves the board,
      // not when it lands — which is the only window in which knowing helps.
      presence.send({ holding: { rowId: row.id, rev: Number((row as any).rev || 0) }, cell: null });
      beginRipple(row);
    },
    onDecision: (decision, target) => {
      if (!target || !decision) return;
      // Fired on target change, never per pixel — so this cannot flood the beat.
      presence.send({ cell: { day: target.day, start: target.start,
        ...((target as any).room ? { room: `${(target as any).room.code}|${(target as any).room.hall}` } : {}) } });
      setPhysicsField((prev) => ({
        ...prev,
        [`${target.day}:${target.start}`]: decision.quality,
      }));
      const base = decision.ripple || {};
      setRipple({
        ...base,
        loading: Boolean(decision.loading),
        rowId: Number(decision.key.split(":")[0]) || 0,
        targetDay: target.day,
        targetStart: target.start,
        headline: decision.summary,
        effects:
          base.effects ||
          decision.reasons.map((text) => ({
            tone:
              decision.quality === "suboptimal"
                ? "warn"
                : decision.quality === "excellent" ||
                    decision.quality === "good"
                  ? "good"
                  : "neutral",
            text,
          })),
      });
    },
    onDropRequest: (request) => {
      clearRipple();
      setPhysicsField({});
      presence.send({ holding: null, cell: null });
      const room = (request.target as any)?.room as { code: string; hall: string } | undefined;
      if (room) {
        // The rooms board: the square names a hall, so the landing carries one.
        void commitRoomMove(request.row, request.target.day as DayKey, request.target.start, room.code, room.hall);
        return;
      }
      if (isSamePlacement(request.row, request.sourceDay, request.target)) {
        setPhysicsNotice("");
        return;
      }
      void commitMove(request);
    },
    onCancel: () => {
      clearRipple();
      setPhysicsField({});
      presence.send({ holding: null, cell: null });
      setPhysicsNotice("تم إلغاء السحب دون حفظ أي تغيير.");
    },
    onInvalid: (decision) => {
      clearRipple();
      setPhysicsField({});
      presence.send({ holding: null, cell: null });
      const details = (decision?.reasons || []).slice(0, 3).join(" — ");
      const reason = details || decision?.summary || "هذا الموضع غير متاح وفق قواعد الجدول.";
      setError(`تعذر النقل: ${reason}`);
      setPhysicsNotice(`رفض النقل: ${reason}`);
    },
  });
  const physicsOrigin = physics.state.row;
  /**
   * Whether a card is in the air.
   *
   * This used to be read as `physics.state.active` — a field the drag state has
   * never had (SchedulePhysics/types.ts declares `phase`, not `active`), and one
   * the compiler could not catch because the hook's return type degrades to
   * `any` at this call site. Every read was `undefined`, so the fan's Escape
   * guard never saw a live drag and the edge-autoscroll effect below returned on
   * its first line and never ran at all.
   */
  const physicsActive = Boolean(
    physicsOrigin &&
    physics.state.phase !== "idle" &&
    physics.state.phase !== "armed",
  );
  useEffect(() => {
    if (!fanned) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape mid-drag belongs to the drag; the fan only closes when idle.
      if (event.key === "Escape" && !physicsActive) setFanned(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fanned, physicsActive]);
  /**
   * The grid walks with the drag.
   *
   * A lecture at eight in the morning could never reach seven in the evening
   * in one gesture — the pointer hit the window's edge and stopped. While a
   * drag is live, holding the pointer inside the last ~48px of the viewport's
   * top or bottom scrolls the page, and near the surface's side edges scrolls
   * the week sideways; speed grows the deeper into the edge the pointer sits.
   */
  useEffect(() => {
    if (!physicsActive) return;
    let pointerX = -1, pointerY = -1, frame = 0;
    const surface = document.querySelector<HTMLElement>(".week-surface");
    const EDGE = 48, TOP_GUARD = 72, MAX_STEP = 24;
    const follow = (event: PointerEvent) => { pointerX = event.clientX; pointerY = event.clientY; };
    const tick = () => {
      if (pointerY >= 0) {
        const vh = window.innerHeight;
        if (pointerY < TOP_GUARD + EDGE) {
          window.scrollBy(0, -Math.ceil(MAX_STEP * Math.min(1, (TOP_GUARD + EDGE - pointerY) / EDGE)));
        } else if (pointerY > vh - EDGE) {
          window.scrollBy(0, Math.ceil(MAX_STEP * Math.min(1, (pointerY - (vh - EDGE)) / EDGE)));
        }
        if (surface) {
          const rect = surface.getBoundingClientRect();
          if (pointerX < rect.left + EDGE && pointerX > rect.left - 8) {
            surface.scrollBy(-Math.ceil(MAX_STEP * Math.min(1, (rect.left + EDGE - pointerX) / EDGE)), 0);
          } else if (pointerX > rect.right - EDGE && pointerX < rect.right + 8) {
            surface.scrollBy(Math.ceil(MAX_STEP * Math.min(1, (pointerX - (rect.right - EDGE)) / EDGE)), 0);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", follow, { passive: true });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", follow);
      cancelAnimationFrame(frame);
    };
  }, [physicsActive]);
  /**
   * The watchdog over a drag that never ended.
   *
   * Every ordinary ending — a drop, an escape, a refusal — clears the carried
   * state on its way out. An extraordinary one does not: a tab switched
   * mid-flight pauses the animation frame that would have finished the settle,
   * so the gesture simply stops, and the screen goes on believing a card is
   * still in the air. That belief is not cosmetic — it is the flag the live
   * channel reads to decide the reader is busy, so a schedule that thinks it is
   * mid-drag stops accepting a colleague's changes entirely, silently, until
   * the page is reloaded.
   *
   * So: if the physics has been at rest for a beat while this screen still
   * thinks a card is travelling, the belief is wrong and is dropped. The delay
   * is what keeps it from firing inside the first frame of a real drag.
   */
  useEffect(() => {
    if (!physics.supported || !draggingId || physics.state.phase !== "idle") return;
    const timer = window.setTimeout(() => clearRipple(), 500);
    return () => window.clearTimeout(timer);
  }, [physics.supported, physics.state.phase, draggingId]);
  /**
   * One compact before/after sentence, built from the same live target the
   * physics layer is judging. It replaces the generic drag hint in-place, so
   * the grid never jumps and no second floating panel competes with the
   * existing verdict HUD.
   */
  const dragComparison = useMemo(() => {
    const row = physics.state.row;
    const target = physics.state.target;
    if (!row || !target) return null;
    const candidate: any = buildMoveCandidate(row, target);
    const carriedDays = days.filter(day => Boolean((row as any)[day.key])).map(day => day.key as DayKey);
    const rhythmSwitch = carriedDays.length > 1 && !carriedDays.includes(target.day as DayKey)
      ? patternForDay(target.day as DayKey)
      : null;
    if (rhythmSwitch) {
      days.forEach(day => { candidate[day.key] = rhythmSwitch.includes(day.key as DayKey); });
    }
    const place = [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") || "بلا قاعة";
    const partyCount = multiSelect.has(row.id) ? multiSelect.size : 1;
    return {
      before: `${arabicDays(row) || "بلا يوم"} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`,
      after: `${arabicDays(candidate) || target.label} · ${formatScheduleTimeRange(candidate.fstarttime, candidate.fendtime)}`,
      place,
      partyCount,
    };
  }, [
    physics.state.row,
    physics.state.target?.day,
    physics.state.target?.start,
    physics.state.target?.label,
    multiSelect,
  ]);
  /**
   * The grid answers the held card.
   *
   * While a lecture is carried, the appointments that sit where it would land
   * step aside — the ones above lift, the ones below settle — so the space it
   * is about to occupy is visible before the finger lets go. Nothing is moved
   * in the data; this is the same reasoning the decision panel is doing, said
   * in motion instead of in numbers.
   */
  const displacedByDrag = useMemo(() => {
    const target = physics.state.target;
    const carried = physics.state.row;
    if (!target || !carried) return new Map<number, "up" | "down">();
    const span = Math.max(30, mins(carried.fendtime) - mins(carried.fstarttime));
    const from = mins(target.start);
    const to = from + span;
    const shifts = new Map<number, "up" | "down">();
    for (const row of weekRows) {
      if (row.id === carried.id) continue;
      if (!(row as any)[target.day]) continue;
      const start = mins(row.fstarttime);
      const end = mins(row.fendtime);
      if (start >= to || end <= from) continue;
      shifts.set(row.id, start < from ? "up" : "down");
    }
    return shifts;
  }, [physics.state.target, physics.state.row, weekRows]);

  const physicsRelationClass = (r: FSchedule) => {
    if (!physicsActive || !physicsOrigin) return "";
    if (r.id === physicsOrigin.id) return "physics-origin";
    const shift = displacedByDrag.get(r.id);
    if (shift) return `physics-displaced physics-shift-${shift}`;
    const rel = relatedness(r, physicsOrigin),
      tags = Object.entries(rel)
        .filter(([, v]) => v)
        .map(([k]) => `physics-rel-${k}`);
    return tags.length ? `physics-related ${tags.join(" ")}` : "physics-dim";
  };
  /**
   * Where this lecture would sit best, shown while it is still in the air.
   *
   * The grid already says "here is bad" once the pointer arrives. Saying "here
   * are the three best" before the pointer goes anywhere turns a search into a
   * choice. The scoring is deliberately local and instant — no request, no
   * waiting — and only counts things that are certainly true: a clash with the
   * same instructor or the same hall, the gap it leaves in the instructor's
   * day, and whether the length matches what the day expects.
   */
  /**
   * The whole week judged at the moment the card leaves the grid.
   *
   * Waiting for the pointer to arrive before saying "not here" makes the search
   * a guessing game: the coordinator drags across four squares, is refused four
   * times, and learns the rule one refusal at a time. So every square is judged
   * at once, the instant the card is lifted — the ones that cannot take it are
   * shaded and say why, and the three best are ranked.
   *
   * This is a local reading and it stays modest about it: it refuses only what
   * is certainly true from data already on screen — the same instructor or the
   * same hall already busy in that hour, or a lecture too long to finish before
   * the grid ends. Everything subtler stays the server's judgement when the
   * pointer actually arrives, and the server remains the only thing that can
   * block a save.
   */
  const dragField = useMemo(() => {
    const blocked = new Map<string, string>();
    /**
     * Three answers, not two.
     *
     * A square the carried lecture cannot take is not one thing. Sometimes the
     * teacher is busy, and no amount of rearranging helps — that is a wall.
     * Sometimes only the HALL is taken, and the hour is perfectly good for this
     * teacher: that is not a refusal, it is "yes, in another room", and it was
     * being painted in the same red as the wall. So the reader was steered away
     * from half the hours that were actually available to them.
     */
    const tier = new Map<string, "free" | "room" | "blocked">();
    const suggestions: Array<{ day: DayKey; start: string; score: number }> = [];
    const carried = physics.state.row;
    if (!carried || physics.state.phase === "idle") return { blocked, tier, suggestions };
    const span = Math.max(30, mins(carried.fendtime) - mins(carried.fstarttime));
    const instructorRows = weekRows.filter(row => row.id !== carried.id && carried.AdInstructorId && row.AdInstructorId === carried.AdInstructorId);
    const hallRows = weekRows.filter(row => row.id !== carried.id && carried.AdRoomCode && sameRoom(row, carried));
    for (const day of days) {
      for (const slot of timeSlots) {
        const key = `${day.key}:${slot}`;
        const from = mins(slot);
        const to = from + span;
        if (to > gridWindow.end) {
          blocked.set(key, "المحاضرة أطول من الوقت المتبقي في هذا اليوم");
          tier.set(key, "blocked");
          continue;
        }
        const clash = (list: FSchedule[]) => list.find(row =>
          (row as any)[day.key] && mins(row.fstarttime) < to && mins(row.fendtime) > from);
        const instructorClash = clash(instructorRows);
        if (instructorClash) {
          blocked.set(key, `الأستاذ مرتبط بـ${instructorClash.AdCourseName || courseById.get(instructorClash.AdCourseId)?.CourseName || "موعد آخر"} ${instructorClash.fstarttime}`);
          tier.set(key, "blocked");
          continue;
        }
        const hallClash = clash(hallRows);
        if (hallClash) {
          // The hour is free for this teacher; only the room is taken. That is
          // a different answer, and it gets a different colour.
          blocked.set(key, `الساعة متاحة للأستاذ، لكن القاعة محجوزة لـ${hallClash.AdCourseName || courseById.get(hallClash.AdCourseId)?.CourseName || "موعد آخر"} — يلزم تبديل القاعة`);
          tier.set(key, "room");
          continue;
        }
        tier.set(key, "free");
        let score = 100;
        // A lecture that sits against another of the same instructor's is kinder
        // than one that leaves an hour of waiting in the middle of their day.
        const sameDay = instructorRows
          .filter(row => (row as any)[day.key])
          .map(row => ({ from: mins(row.fstarttime), to: mins(row.fendtime) }));
        if (sameDay.length) {
          const nearest = Math.min(...sameDay.map(other =>
            other.to <= from ? from - other.to : other.from >= to ? other.from - to : 0));
          score -= Math.min(40, Math.round(nearest / 15) * 4);
        } else {
          // A brand-new day for this instructor costs a commute.
          score -= 12;
        }
        const expected = day.key === "fmonday" || day.key === "fwednesday" ? 90 : 60;
        if (span !== expected) score -= 18;
        if (from < 8 * 60 || from >= 14 * 60) score -= 8;
        suggestions.push({ day: day.key as DayKey, start: slot, score });
      }
    }
    suggestions.sort((a, b) => b.score - a.score);
    return { blocked, tier, suggestions: suggestions.slice(0, 3) };
  }, [physics.state.row, physics.state.phase, weekRows, timeSlots, gridWindow, courseById]);
  const dragSuggestions = dragField.suggestions;
  const suggestionRank = useMemo(() => {
    const map = new Map<string, number>();
    dragSuggestions.forEach((item, index) => map.set(`${item.day}:${item.start}`, index + 1));
    return map;
  }, [dragSuggestions]);
  /** Why this square cannot take the carried card, for its tooltip. */
  /**
   * ── The decision field ────────────────────────────────────────────────────
   *
   * The engine that judges a placement already exists; it just never spoke
   * until the card was already in the air. So a coordinator learned that
   * eleven o'clock was a bad idea by dragging there, reading the verdict, and
   * dragging back — the answer arrived after the question had been acted on.
   *
   * Opening a lecture's reading panel now asks the same engine about the whole
   * week at once, and the empty squares answer in place: where this lecture
   * would sit well, where it would sit badly, and where it cannot sit at all.
   * The reasoning is identical to the one the drag uses — the same instructor,
   * the same hall, the same day-end, the same closeness-to-their-other-lectures
   * scoring — because it is the same code path, only asked earlier.
   *
   * It is deliberately a *reading*: it paints nothing over the lectures
   * themselves, adds no control, and disappears the moment the panel closes or
   * a real drag begins, when the live evaluation takes over.
   */
  type PlacementReading = { tier: "excellent" | "good" | "fair" | "blocked"; why: string };
  /**
   * One reading of one placement — the single source of truth for "how good
   * would this lecture be here?".
   *
   * Both surfaces that ask the question ahead of time go through this: the
   * decision field that paints the whole week when a lecture is opened, and the
   * keyboard move that reports each step as the arrows walk it around. Neither
   * owns a copy of the reasoning, so the two can never disagree — and neither
   * competes with the live drag, which asks the server and therefore knows more.
   */
  const readPlacement = useCallback((row: FSchedule, day: DayKey, slot: string): PlacementReading => {
    const span = Math.max(30, mins(row.fendtime) - mins(row.fstarttime));
    const from = mins(slot);
    const to = from + span;
    const nameOf = (item: FSchedule) =>
      item.AdCourseName || courseById.get(item.AdCourseId)?.CourseName || "موعد آخر";
    if (to > gridWindow.end)
      return { tier: "blocked", why: "المحاضرة أطول من الوقت المتبقي في هذا اليوم" };
    const clash = (test: (item: FSchedule) => boolean) =>
      weekRows.find(item =>
        item.id !== row.id && test(item) && (item as any)[day] &&
        mins(item.fstarttime) < to && mins(item.fendtime) > from);
    const busyInstructor = row.AdInstructorId
      ? clash(item => item.AdInstructorId === row.AdInstructorId) : undefined;
    if (busyInstructor)
      return { tier: "blocked", why: `الأستاذ مرتبط بـ${nameOf(busyInstructor)} ${busyInstructor.fstarttime}` };
    const busyHall = row.AdRoomCode
      ? clash(item => sameRoom(item, row)) : undefined;
    if (busyHall)
      return { tier: "blocked", why: `القاعة محجوزة لـ${nameOf(busyHall)} ${busyHall.fstarttime}` };

    /* Same scoring the drag uses, in the same order of importance. */
    let score = 100;
    const reasons: string[] = [];
    const sameDay = weekRows
      .filter(item => item.id !== row.id && row.AdInstructorId && item.AdInstructorId === row.AdInstructorId && (item as any)[day])
      .map(item => ({ from: mins(item.fstarttime), to: mins(item.fendtime) }));
    if (sameDay.length) {
      const nearest = Math.min(...sameDay.map(other =>
        other.to <= from ? from - other.to : other.from >= to ? other.from - to : 0));
      score -= Math.min(40, Math.round(nearest / 15) * 4);
      reasons.push(nearest === 0 ? "ملاصق لمحاضرة أخرى للأستاذ" : `فراغ ${nearest} دقيقة عن أقرب محاضرة للأستاذ`);
    } else {
      score -= 12;
      reasons.push("يوم جديد للأستاذ — يكلّف انتقالاً");
    }
    const label = days.find(d => d.key === day)?.label || "";
    const expected = day === "fmonday" || day === "fwednesday" ? 90 : 60;
    if (span !== expected) { score -= 18; reasons.push(`طول غير معتاد ليوم ${label}`); }
    if (from < 8 * 60 || from >= 14 * 60) { score -= 8; reasons.push("خارج ذروة اليوم الدراسي"); }
    const tier = score >= 88 ? "excellent" : score >= 70 ? "good" : "fair";
    return {
      tier,
      why: `${tier === "excellent" ? "ممتاز" : tier === "good" ? "جيد" : "ممكن بتنازل"} — ${reasons.join(" · ")}`,
    };
  }, [weekRows, gridWindow, courseById]);

  const decisionField = useMemo(() => {
    const field = new Map<string, PlacementReading>();
    const row: FSchedule | null =
      viewMode === "week" && !physicsActive && !saving && context?.selected
        ? rows.find(item => item.id === context.selected.id) || null
        : null;
    if (!row || !row.fstarttime || !row.fendtime) return field;
    const carriedDays = days.filter(d => Boolean((row as any)[d.key])).map(d => d.key as DayKey);
    for (const day of days) {
      for (const slot of timeSlots) {
        if (carriedDays.includes(day.key as DayKey) && slot === row.fstarttime) continue;
        field.set(`${day.key}:${slot}`, readPlacement(row, day.key as DayKey, slot));
      }
    }
    return field;
  }, [viewMode, physicsActive, saving, context?.selected?.id, rows, timeSlots, readPlacement]);

  /**
   * ── Keyboard move ─────────────────────────────────────────────────────────
   *
   * A second road to the same place, never a second engine. Space picks a
   * focused lecture up, the arrows walk it, Enter puts it down through
   * `commitMove` — the identical function the pointer uses, so the conflict
   * rules, the optimistic paint, the undo entry and the live broadcast are all
   * literally the same code.
   *
   * The two roads are mutually exclusive on purpose. While a lecture is held by
   * the keyboard the drag layer is switched off, so a stray pointer cannot pick
   * up a second copy of the same card; and a lecture already in the air under a
   * pointer cannot be picked up by Space. One card, one hand, always.
   */
  const keyMoveRow = useMemo(
    () => (keyMove ? rows.find(row => row.id === keyMove.rowId) || null : null),
    [keyMove, rows],
  );
  const keyMoveReading = useMemo(
    () => (keyMove && keyMoveRow ? readPlacement(keyMoveRow, keyMove.day, keyMove.start) : null),
    [keyMove, keyMoveRow, readPlacement],
  );
  /* What a screen reader is told, and the only announcement this mode makes. */
  const [keyMoveSay, setKeyMoveSay] = useState("");

  const pickUpWithKeyboard = useCallback((row: FSchedule) => {
    if (!isPowerAdmin || saving) return;
    if (physics.state.phase !== "idle") return;      // a pointer already holds something
    if (viewMode !== "week") return;
    const day = (days.find(d => Boolean((row as any)[d.key]))?.key || "fsunday") as DayKey;
    setKeyMove({ rowId: row.id, day, start: row.fstarttime });
    presence.send({ holding: { rowId: row.id, rev: Number((row as any).rev || 0) },
      cell: { day, start: row.fstarttime } });
    const title = row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "الموعد";
    setKeyMoveSay(`تم التقاط ${title}. استخدم الأسهم للتحريك، Enter للتنفيذ، Esc للإلغاء.`);
  }, [isPowerAdmin, saving, physics.state.phase, viewMode, courseById, presence]);

  const cancelKeyboardMove = useCallback(() => {
    setKeyMove(null);
    presence.send({ holding: null, cell: null });
    setKeyMoveSay("أُلغي النقل؛ لم يتغير شيء.");
  }, [presence]);

  const stepKeyboardMove = useCallback((axis: "time" | "day", delta: number) => {
    setKeyMove(current => {
      if (!current) return current;
      const announce = (next: { day: DayKey; start: string }) => {
        presence.send({ cell: { day: next.day, start: next.start } });
        return next;
      };
      if (axis === "time") {
        const next = mins(current.start) + delta * SCHEDULE_SLOT_MINUTES;
        if (next < gridWindow.start || next > gridWindow.end - SCHEDULE_SLOT_MINUTES) return current;
        return announce({ ...current, start: timeFromMins(next) });
      }
      const index = days.findIndex(d => d.key === current.day);
      const target = index + delta;
      if (target < 0 || target >= days.length) return current;
      return announce({ ...current, day: days[target].key as DayKey });
    });
  }, [gridWindow, presence]);

  const commitKeyboardMove = useCallback(() => {
    if (!keyMove || !keyMoveRow) return;
    if (keyMoveReading?.tier === "blocked") {
      setKeyMoveSay(`غير متاح — ${keyMoveReading.why}`);
      return;
    }
    const sourceDay = (days.find(d => Boolean((keyMoveRow as any)[d.key]))?.key || keyMove.day) as DayKey;
    const label = days.find(d => d.key === keyMove.day)?.label || "";
    setKeyMove(null);
    presence.send({ holding: null, cell: null });
    setKeyMoveSay(`تم نقل الموعد إلى ${label} ${keyMove.start}.`);
    // The same door as a drag: same checks, same undo, same broadcast.
    void commitMove({
      row: keyMoveRow,
      sourceDay: sourceDay as any,
      target: { day: keyMove.day as any, start: keyMove.start, label },
      decision: null,
    } as any);
  }, [keyMove, keyMoveRow, keyMoveReading]);

  /* The arrows belong to the held card and to nothing else while it is held. */
  useEffect(() => {
    if (!keyMove) return;
    const rtl = document.documentElement.dir !== "ltr";
    const onKey = (event: KeyboardEvent) => {
      const element = document.activeElement as HTMLElement | null;
      if (element && (element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.isContentEditable)) return;
      switch (event.key) {
        case "ArrowUp": event.preventDefault(); stepKeyboardMove("time", -1); return;
        case "ArrowDown": event.preventDefault(); stepKeyboardMove("time", 1); return;
        // The columns are read in the page's own direction: in Arabic the day
        // to the visual left is the LATER day, so the arrows follow the grid
        // rather than an assumption about which way "next" points.
        case "ArrowLeft": event.preventDefault(); stepKeyboardMove("day", rtl ? 1 : -1); return;
        case "ArrowRight": event.preventDefault(); stepKeyboardMove("day", rtl ? -1 : 1); return;
        case "Enter": event.preventDefault(); commitKeyboardMove(); return;
        case "Escape": event.preventDefault(); event.stopPropagation(); cancelKeyboardMove(); return;
        case " ": case "Spacebar": event.preventDefault(); cancelKeyboardMove(); return;
        default: return;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keyMove, stepKeyboardMove, commitKeyboardMove, cancelKeyboardMove]);

  /* A held card announces where it now points, once per step. */
  useEffect(() => {
    if (!keyMove || !keyMoveReading) return;
    const label = days.find(d => d.key === keyMove.day)?.label || "";
    setKeyMoveSay(`${label} ${keyMove.start} — ${keyMoveReading.why}`);
  }, [keyMove?.day, keyMove?.start, keyMoveReading?.why]);

  const slotBlockReason = (day: DayKey, start: string) => dragField.blocked.get(`${day}:${start}`) || "";
  /* The field's own class and sentence for a square. A live drag always wins:
     the moment a card is actually carried, the server-backed evaluation is the
     better answer and this reading steps aside. */
  const decisionSlot = (day: DayKey, start: string) => decisionField.get(`${day}:${start}`) || null;

  /**
   * @param room  "code|hall" on the rooms board, nothing on the week grid.
   *
   * The room is not optional decoration. A square on the week grid is named by
   * a day and an hour, and that pair is unique. On the rooms board the SAME
   * pair exists once per hall — measured on the live board, «الأحد 08:00»
   * belongs to ten different squares — so a target matched on day and hour
   * alone lit all ten at once. The week highlighted one square under the
   * pointer; the rooms board lit a whole column across rooms the card was
   * nowhere near, and that is the entire difference in how the two felt.
   */
  const physicsSlotClass = (day: DayKey, start: string, room?: string) => {
    const key = `${day}:${start}`;
    const rank = suggestionRank.get(key);
    // Lifting the card shades every square the local reading has ruled out, so
    // the shape of what is free is visible before the pointer goes anywhere.
    // Where the server has since given a verdict for a square the pointer
    // actually visited, that verdict wins — it knows rules this reading cannot.
    const sampled = physicsField[key] || (dragField.blocked.has(key) ? "impossible" : "");
    const shade = dragField.tier.get(key);
    const target = physics.state.target;
    const targetRoom = target?.room ? `${target.room.code}|${target.room.hall}` : "";
    const active =
      target?.day === day &&
      target?.start === start &&
      // Only when both sides agree about the hall — or neither has one.
      (room ? targetRoom === room : !targetRoom);
    const quality = active
      ? physics.state.decision?.quality || sampled || "unknown"
      : sampled || "";
    return `${active ? `physics-target physics-${quality}` : ""} ${sampled ? `gravity-slot gravity-${sampled}` : ""} ${shade ? `field-tier tier-${shade}` : ""} ${rank ? `suggested-slot suggested-${rank}` : ""}`.trim();
  };
  /**
   * The live radar: collisions and regulation notes, read on every change.
   *
   * Both readings are local and instant — no request, no debounce — so the
   * numbers in the toolbar are always the numbers on the board. The clash scan
   * knows the combined-delivery exemption the server knows, and the notes are
   * the same review the approval sheet prints, run quietly on the open scope.
   * The colliding cards themselves wear the ring in every view.
   */
  const liveClash = useMemo(() => fastConflictScan(filteredRows), [filteredRows]);
  /**
   * What changed under the settled schedule while nobody was looking.
   *
   * Asked for once per department and re-asked only when the live feed says
   * some schedule somewhere was written. It is silent by construction: the
   * state is null until the server has something to report, and the strip below
   * does not exist at all until then. A banner that is always present is a
   * banner nobody reads.
   */
  const [drift, setDrift] = useState<any>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  /* The department's learned rhythm is deliberately NOT shown. It is working
     knowledge, not a headline: the engine already obeys it, and a person who
     breaks it is told at the moment they break it. Reading the habit back at
     someone who has kept it for ten years tells them nothing they do not know
     and costs a permanent strip on their board. */
  /** What the department's own instructors have said, and not yet been answered. */
  const [inbox, setInbox] = useState<any[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  useEffect(() => {
    if (mode !== "schedule" || !workspaceReady || !filterCollege) { setDrift(null); return; }
    let alive = true;
    void fetch(`/api/intelligence/settled-drift?collegeId=${filterCollege}&sectionId=${filterSection}`,
      { credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!alive) return;
        setDrift(data?.watching && data.total ? data : null);
      })
      .catch(() => undefined);
    return () => { alive = false; };
    // liveFeedSerial changes when the live channel reports a write anywhere.
  }, [mode, workspaceReady, filterCollege, filterSection, liveFeedSerial]);
  const loadInbox = useCallback(() => {
    if (mode !== "schedule" || !workspaceReady || !filterCollege || !filterTerm) { setInbox([]); return; }
    void fetch(`/api/schedules/staff-inbox?collegeId=${filterCollege}&sectionId=${filterSection}&termId=${filterTerm}`,
      { credentials: "include" })
      .then(response => (response.ok ? response.json() : []))
      .then(data => setInbox(Array.isArray(data) ? data : []))
      .catch(() => undefined);
  }, [mode, workspaceReady, filterCollege, filterSection, filterTerm]);
  useEffect(loadInbox, [loadInbox]);

  /**
   * ── The command registry ──────────────────────────────────────────────────
   *
   * One list, one place. Every entry names a function that already exists on
   * this screen and calls it — nothing here re-implements a behaviour, so a
   * command can never drift from the button that does the same thing. A command
   * that is not possible right now says so by being dimmed; one that makes no
   * sense at all is simply absent.
   */
  /**
   * ── أصلح بأقل أثر ─────────────────────────────────────────────────────────
   *
   * The chain is searched, shown whole, and only then written — as one atomic
   * batch through the same door a drag uses, so either every card in it lands
   * or none does. Nothing here decides anything: the sheet states the cost in
   * plain numbers and waits.
   */
  const [repair, setRepair] = useState<RepairChain | null>(null);
  const [repairReason, setRepairReason] = useState<string>("");
  const [repairing, setRepairing] = useState(false);

  const proposeRepair = useCallback(() => {
    const first = rows.find(row => liveClash.ids.has(row.id));
    if (!first) { setMessage("لا يوجد تداخل في هذا النطاق."); return; }
    setRepairing(true);
    // The search is synchronous and bounded; a frame is yielded first so the
    // press feels answered rather than frozen.
    window.setTimeout(() => {
      try {
        const chain = findRepairChain(first, rows);
        if (!chain) setMessage("لم أجد سلسلة إصلاح لا تُنشئ تعارضاً جديداً. جرّب تحرير قاعة أو ساعة أولاً.");
        else { setRepairReason("سلسلة إصلاح مقترحة"); setRepair(chain); }
      } finally {
        setRepairing(false);
      }
    }, 0);
  }, [rows, liveClash]);

  const applyRepair = useCallback(async () => {
    if (!repair) return;
    setSaving(true);
    setError(null);
    try {
      const payload = repair.moves.map(move => ({
        id: move.id,
        rev: move.before.rev,
        fields: {
          fsunday: move.day === "fsunday", fmonday: move.day === "fmonday",
          ftuesday: move.day === "ftuesday", fwednesday: move.day === "fwednesday",
          fthursday: move.day === "fthursday",
          fstarttime: move.start, fendtime: move.end,
          AdRoomCode: move.roomCode, AdRoomHall: move.roomHall,
        },
      }));
      const outcome = await fetchJson("/api/schedules/move-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strict: strictNoConflict, moves: payload }),
      });
      if (Array.isArray(outcome?.rows) && outcome.rows.length) {
        const written = new Map<number, FSchedule>(outcome.rows.map((row: FSchedule) => [row.id, row]));
        setRows(current => current.map(row => written.get(row.id) || row));
      }
      // Every card in the chain wears the same marks a hand-made move wears.
      repair.moves.forEach(move => markChanged(move.id));
      leaveMoveTraces(repair.moves.map(move => ({
        before: move.before,
        after: { ...move.before, fstarttime: move.start, fendtime: move.end,
          AdRoomCode: move.roomCode, AdRoomHall: move.roomHall } as FSchedule,
      })));
      offerUndo(
        `إصلاح بسلسلة ${countOf(repair.moves.length, AR.move)}`,
        repair.moves.map(move => restoreStep(move.before)),
      );
      setRepair(null);
      setMessage(`نُفِّذت السلسلة — ${countOf(repair.moves.length, AR.move)}، والتداخل ${repair.before} ← ${repair.after}.`);
    } catch (e: any) {
      if (e?.revisionConflict) setClash({ current: e.current, yours: null });
      else setError(friendlyError(e));
      void loadRows({ silent: true });
    } finally {
      setSaving(false);
    }
  }, [repair, strictNoConflict]);

  const commands = useMemo<ScheduleCommand[]>(() => {
    const inWeek = viewMode === "week";
    const list: ScheduleCommand[] = [
      { id: "view.list", group: "التنقل", label: "عرض القائمة", keywords: ["list", "قائمة"], icon: <LayoutList />, execute: () => changeView("list") },
      { id: "view.week", group: "التنقل", label: "عرض الأسبوع", keywords: ["week", "اسبوع", "شبكة"], icon: <CalendarDays />, execute: () => changeView("week") },
      { id: "view.rooms", group: "التنقل", label: "عرض القاعات", keywords: ["rooms", "قاعات", "مبنى"], icon: <MapPin />, execute: () => changeView("rooms") },
      {
        id: "view.today", group: "التنقل", label: "افتح يوم اليوم وحده",
        keywords: ["today", "اليوم"], icon: <Focus />, enabled: Boolean(todayKey),
        execute: () => { if (!inWeek) changeView("week"); setExpandedDay(current => (current === todayKey ? null : todayKey)); },
      },
      { id: "search.focus", group: "التنقل", label: "البحث في الجدول", keywords: ["search", "بحث"], shortcut: "/", icon: <Search />, execute: () => { searchRef.current?.scrollIntoView({ block: "center" }); searchRef.current?.focus(); } },
      { id: "schedule.create", group: "الجدول", label: "إضافة موعد", keywords: ["add", "new", "اضافة", "جديد"], icon: <Plus />, execute: () => openCreate() },
      {
        id: "schedule.pick", group: "الجدول", label: picking ? "إنهاء النقل الجماعي" : "نقل جماعي",
        keywords: ["multi", "جماعي", "تحديد"], icon: <Layers />, enabled: inWeek,
        execute: () => { setPicking(value => !value); setMultiSelect(new Set()); },
      },
      {
        id: "schedule.undo", group: "الجدول", label: "التراجع عن آخر تغيير",
        keywords: ["undo", "تراجع"], shortcut: "Ctrl+Z", icon: <Undo2 />,
        enabled: pendingUndo.length > 0,
        execute: () => { const entry = pendingUndo[0]; if (entry) void runUndoEntry(entry); },
      },
      { id: "schedule.log", group: "الجدول", label: "سجل تغييرات اليوم", keywords: ["history", "سجل"], icon: <History />, enabled: pendingUndo.length > 0, execute: () => setUndoLogOpen(true) },
      {
        id: "schedule.clash", group: "الجدول", label: "الانتقال إلى التداخل",
        keywords: ["conflict", "تعارض", "تداخل"], icon: <AlertTriangle />, enabled: liveClash.pairs > 0,
        execute: () => { changeView("week"); setReviewFocus(new Set([...liveClash.ids])); },
      },
      {
        id: "schedule.keymove", group: "الجدول", label: "نقل المحاضرة بلوحة المفاتيح",
        keywords: ["keyboard", "كيبورد", "لوحة", "نقل", "اسهم"],
        icon: <GripVertical />, shortcut: "Space",
        enabled: viewMode === "week" && Boolean(context?.selected),
        execute: () => {
          const row = rows.find(item => item.id === context?.selected?.id);
          if (row) pickUpWithKeyboard(row);
        },
      },
      {
        id: "schedule.repair", group: "الجدول", label: "أصلح التداخل بأقل أثر",
        keywords: ["repair", "fix", "اصلاح", "تعارض", "تداخل", "سلسلة"],
        icon: <WandSparkles />, enabled: liveClash.pairs > 0 && !repairing,
        execute: proposeRepair,
      },
      { id: "schedule.review", group: "الجدول", label: "مراجعة الاعتماد", keywords: ["review", "اعتماد", "مراجعة"], icon: <ClipboardCheck />, execute: () => setReviewOpen(true) },
      { id: "schedule.focus", group: "العرض", label: focusMode ? "إنهاء التركيز" : "وضع التركيز", keywords: ["focus", "تركيز"], icon: <Focus />, execute: () => { setFocusMode(!focusMode); setPresentationMode(false); if (!focusMode) changeView("week"); } },
      { id: "schedule.present", group: "العرض", label: presentationMode ? "إنهاء العرض" : "وضع العرض", keywords: ["present", "عرض", "شاشة"], icon: <Expand />, execute: () => { setPresentationMode(!presentationMode); setFocusMode(false); if (!presentationMode) changeView("week"); } },
      { id: "hue.course", group: "العرض", label: "التلوين حسب المقرر", keywords: ["colour", "color", "لون", "مقرر"], icon: <Palette />, enabled: hueBy !== "course", execute: () => setHueBy("course") },
      { id: "hue.instructor", group: "العرض", label: "التلوين حسب الأستاذ", keywords: ["colour", "color", "لون", "استاذ"], icon: <Palette />, enabled: hueBy !== "instructor", execute: () => setHueBy("instructor") },
      { id: "hue.room", group: "العرض", label: "التلوين حسب القاعة", keywords: ["colour", "color", "لون", "قاعة"], icon: <Palette />, enabled: hueBy !== "room", execute: () => setHueBy("room") },
      { id: "hue.reset", group: "العرض", label: "إظهار كل الطبقات", keywords: ["reset", "اظهار", "طبقات"], icon: <Eye />, enabled: hueHidden.size > 0 || hueFocus.size > 0, execute: () => { setHueHidden(new Set()); setHueFocus(new Set()); } },
      { id: "views.save", group: "العروض المحفوظة", label: "حفظ العرض الحالي", keywords: ["save", "view", "حفظ", "عرض"], icon: <Bookmark />, execute: () => setViewDialog({ mode: "create" }) },
    ];
    if (activeView) {
      list.push(
        { id: "views.update", group: "العروض المحفوظة", label: `تحديث «${activeView.name}»`, keywords: ["update", "تحديث"], icon: <Bookmark />, enabled: viewDirty, execute: () => { viewsStore.update(activeView.id, captureView(activeView.name)); setSavedViews(viewsStore.list()); setMessage("حُدِّث العرض"); } },
        { id: "views.restore", group: "العروض المحفوظة", label: `العودة إلى «${activeView.name}»`, keywords: ["restore", "استرجاع"], icon: <Undo2 />, enabled: viewDirty, execute: () => applyView(activeView) },
      );
    }
    savedViews.forEach(view => {
      list.push({
        id: `views.open.${view.id}`,
        group: "العروض المحفوظة",
        label: `فتح: ${view.name}`,
        keywords: ["view", "عرض", view.name],
        icon: view.favorite ? <Sparkles /> : <Bookmark />,
        execute: () => applyView(view),
      });
    });
    // Read-only accounts keep every reading command and lose only the writing
    // ones — the palette must never offer a door the account cannot open.
    const writes = new Set(["schedule.create", "schedule.pick", "schedule.undo", "schedule.clash"]);
    const phoneWrites = new Set(["schedule.pick", "schedule.keymove", "schedule.repair"]);
    const phoneHiddenViews = new Set(["view.week", "view.rooms", "view.today", "schedule.clash", "schedule.focus", "schedule.present"]);
    return list.map(command => {
      if (phoneReadOnly && (phoneWrites.has(command.id) || phoneHiddenViews.has(command.id))) return { ...command, visible: false };
      return isPowerAdmin || !writes.has(command.id) ? command : { ...command, visible: false };
    });
  }, [viewMode, todayKey, picking, pendingUndo, liveClash, focusMode, presentationMode, hueBy, hueHidden, hueFocus, savedViews, activeView, viewDirty, isPowerAdmin, phoneReadOnly, changeView, applyView, captureView, viewsStore]);

  /**
   * ── One keyboard, one place ───────────────────────────────────────────────
   *
   * Every shortcut on this screen is decided here, in one listener, with one
   * order of precedence — so a key can never mean two things at once and a new
   * one cannot be added by scattering another listener somewhere else.
   *
   * It never steals a keystroke from a field, a dialog, or a drag in flight.
   */
  const shortcutsBlocked = useCallback(() => {
    const element = document.activeElement as HTMLElement | null;
    if (element) {
      const tag = element.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable) return true;
    }
    if (editor !== "index") return true;
    if (physics.state.phase !== "idle") return true;
    if (viewDialog || reviewOpen || transferOpen || undoLogOpen) return true;
    return false;
  }, [editor, physics.state.phase, viewDialog, reviewOpen, transferOpen, undoLogOpen]);

  useEffect(() => {
    if (mode !== "schedule") return;
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      // The palette's own key works even from inside a field: it is the way out.
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(value => !value);
        return;
      }
      if (paletteOpen) return;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        if (editor !== "index" || !pendingUndo.length) return;
        event.preventDefault();
        void runUndoEntry(pendingUndo[0]);
        return;
      }
      if (shortcutsBlocked()) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.scrollIntoView({ block: "center" });
        searchRef.current?.focus();
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(value => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, paletteOpen, editor, pendingUndo, shortcutsBlocked]);

  const conflictIds = liveClash.ids;
  /**
   * The living board: a colleague saves, your screen already knows.
   *
   * One server-sent event per change, answered with a quiet scoped re-read —
   * no spinner, no refresh button, and never while a card is being dragged or
   * the editor holds unsaved work; those moments queue the refresh and it runs
   * the instant the hands are free.
   */
  const [liveFeed, setLiveFeed] = useState(false);
  const liveRefreshPending = useRef(false);
  const liveBusy = useRef(false);
  useEffect(() => {
    liveBusy.current = saving || editor !== "index" || Boolean(physicsActive) || Boolean(draggingId);
  }, [saving, editor, physicsActive, draggingId]);
  useEffect(() => {
    if (mode !== "schedule" || !workspaceReady || typeof EventSource === "undefined") return;
    let refreshTimer = 0;
    /* The scope goes on the URL so the server knows which board this stream is
       watching from the first byte. It is read from the ref, not the filter
       state, because the effect deliberately does not re-run when the scope
       changes — the stream stays open and a beat announces the move instead. */
    const at = scopeRef.current;
    const source = new EventSource(
      `/api/schedules/events?conn=${encodeURIComponent(presence.connId)}` +
      `&college=${at.collegeId}&section=${at.sectionId}&term=${at.termId}`);
    source.addEventListener("presence", event => {
      try { presence.ingest(JSON.parse((event as MessageEvent).data)); } catch { /* a malformed frame is not news */ }
    });
    /* Hovered-cell presence comes from ONE delegated, passive listener. The
       slot's own onPointerEnter belongs to the drag-to-paint quick-create
       stroke, and adding to it risks arming a stroke nobody asked for. */
    let lastCell = "";
    const onOver = (event: PointerEvent) => {
      // A pointer that is not a mouse has no hover — a finger only ever
      // "hovers" the thing it is already pressing.
      if (event.pointerType !== "mouse") return;
      const slot = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-physics-slot="true"]');
      const day = slot?.dataset.physicsDay || "";
      const start = slot?.dataset.physicsStart || "";
      const room = slot?.dataset.physicsRoom;
      const key = `${day}|${start}|${room || ""}`;
      if (key === lastCell) return;
      lastCell = key;
      presence.send({ cell: day && start ? { day, start, ...(room ? { room } : {}) } : null });
    };
    document.addEventListener("pointerover", onOver, { passive: true });
    const onHide = () => presence.leave();
    window.addEventListener("pagehide", onHide);
    const refreshQuietly = () => {
      if (liveBusy.current) {
        // Deferred, and deliberately re-armed: the companion effect below only
        // runs when saving/editor/drag actually change, so a refresh that
        // arrived while the reader was mid-gesture could sit pending forever if
        // nothing changed afterwards — the live channel would go quietly deaf.
        liveRefreshPending.current = true;
        window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(refreshQuietly, 1200);
        return;
      }
      liveRefreshPending.current = false;
      void loadRows({ silent: true }).catch(() => undefined);
    };
    source.addEventListener("schedules", () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(refreshQuietly, 250);
      setLiveFeedSerial(current => current + 1);
    });
    source.onopen = () => setLiveFeed(true);
    source.onerror = () => setLiveFeed(false);
    return () => {
      window.clearTimeout(refreshTimer);
      document.removeEventListener("pointerover", onOver);
      window.removeEventListener("pagehide", onHide);
      presence.leave();
      presencePaint.clear();
      source.close();
      setLiveFeed(false);
    };
  }, [mode, workspaceReady]);
  /* Who is here is the only part of presence allowed to be React state — it
     changes when someone arrives or leaves, not when they move. */
  useEffect(() => presence.onRoster(setPeers), [presence]);
  useEffect(() => presence.onFrame(presencePaint.paint), [presence, presencePaint]);
  /* Changing college, section or term is walking to a different board. */
  useEffect(() => {
    presence.setScope({ collegeId: filterCollege, sectionId: filterSection, termId: filterTerm });
    presencePaint.clear();
  }, [presence, presencePaint, filterCollege, filterSection, filterTerm]);
  /* A remounted view has a fresh DOM with none of the marks on it. */
  useEffect(() => { presencePaint.paint(presence.peers()); });
  // A refresh that arrived mid-work runs as soon as the work lets go.
  useEffect(() => {
    if (!liveRefreshPending.current) return;
    if (saving || editor !== "index" || physicsActive || draggingId) return;
    liveRefreshPending.current = false;
    void loadRows({ silent: true }).catch(() => undefined);
  }, [saving, editor, physicsActive, draggingId]);
  /**
   * The settled-term sheet.
   *
   * Deliberately a reading, not a workspace: it names what changed and who
   * changed it, and stops. Nothing here edits a term the department has closed
   * — reopening one is a decision a person makes on the board, with all the
   * ordinary checks, not a button on a warning.
   */
  const driftSheet = drift && driftOpen ? (
    <div className="drift-sheet-backdrop no-print" role="presentation" onClick={() => setDriftOpen(false)}>
      <section
        className="drift-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`ما تغيّر تحت ${drift.term?.name || "الفصل المعتمد"}`}
        onClick={event => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="drift-eyebrow">فصل معتمد · لم يعد أحد يعدّله</p>
            <h2>{drift.term?.name || "الفصل المعتمد"}</h2>
          </div>
          <button type="button" onClick={() => setDriftOpen(false)} aria-label="إغلاق"><X aria-hidden="true" /></button>
        </header>
        <p className="drift-headline">{drift.headline}</p>
        <ul className="drift-list">
          {drift.findings.map((item: any) => (
            <li key={`${item.rowId}:${item.otherId}`} className={item.foreign ? "drift-foreign" : ""}>
              <div className="drift-row">
                <strong>{item.name}</strong>
                <time>{item.time}</time>
                {item.room ? <span className="drift-room">{item.room}</span> : null}
              </div>
              <p>{item.detail}</p>
              {item.foreign ? (
                <p className="drift-source">
                  {item.otherName ? `المصدر: ${item.otherName}` : "المصدر خارج نطاق عرضك"}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <footer>{drift.limit}</footer>
      </section>
    </div>
  ) : null;

  /**
   * The tray.
   *
   * Every note is pinned to the lecture it is about, so answering one is the
   * ordinary act of opening that lecture — there is no second workflow here and
   * nothing that edits a schedule from inside a message. «فهمت» resolves the
   * note through the same endpoint the appointment panel already uses.
   */
  const inboxTray = inbox.length && inboxOpen ? (
    <div className="drift-sheet-backdrop no-print" role="presentation" onClick={() => setInboxOpen(false)}>
      <section
        className="drift-sheet inbox-sheet"
        role="dialog" aria-modal="true" aria-label="رسائل الأساتذة"
        onClick={event => event.stopPropagation()}
      >
        <header>
          <div>
            <p className="drift-eyebrow">وصلت من بطاقات الأساتذة</p>
            <h2>{countOf(inbox.length, AR.message)} تنتظر</h2>
          </div>
          <button type="button" onClick={() => setInboxOpen(false)} aria-label="إغلاق"><X aria-hidden="true" /></button>
        </header>
        <ul className="drift-list">
          {inbox.map((note: any) => (
            <li key={note.id} className={note.kind === "apology" ? "inbox-apology" : ""}>
              <div className="drift-row">
                <strong>{note.from}</strong>
                {note.course ? <span className="drift-room">{note.course}</span> : null}
                {note.time ? <time>{note.time}</time> : null}
              </div>
              <p>{note.text}</p>
              <div className="inbox-actions">
                <button
                  type="button"
                  onClick={() => {
                    const row = rows.find(item => item.id === note.scheduleId);
                    setInboxOpen(false);
                    if (row) { setViewMode("week"); setReviewFocus(new Set([row.id])); openContext(row); }
                  }}
                >افتح الموعد</button>
                <button
                  type="button"
                  className="inbox-done"
                  onClick={() => {
                    setInbox(current => current.filter(item => item.id !== note.id));
                    // The route that already resolves a note from the
                    // appointment panel. A second one would be a second truth.
                    void fetch(`/api/intelligence/comments/${note.scheduleId}/${encodeURIComponent(note.id)}`, {
                      method: "PUT", headers: { "Content-Type": "application/json" },
                      credentials: "include", body: JSON.stringify({ resolved: true }),
                    }).catch(loadInbox);
                  }}
                >عولجت</button>
              </div>
            </li>
          ))}
        </ul>
        <footer>الرسالة ملاحظة بجانب الموعد؛ لا تغيّر الجدول بنفسها ولا تحجز شيئاً.</footer>
      </section>
    </div>
  ) : null;

  const liveNotes = useMemo(() => {
    if (!filteredRows.length) return [];
    try {
      return reviewSchedule({ rows: filteredRows, courses: courseById, instructors: instructorById, nature });
    } catch {
      return [];
    }
  }, [filteredRows, courseById, instructorById, nature]);

  const [presentConflictsOnly, setPresentConflictsOnly] = useState(false);

  // The workspace mode lives on <html> so the shell can clear its chrome for
  // focus and presentation without every screen knowing about it.
  useEffect(() => {
    const root = document.documentElement;
    const mode = presentationMode ? "presentation" : focusMode ? "focus" : "";
    if (mode) root.dataset.scheduleWorkspace = mode;
    else delete root.dataset.scheduleWorkspace;
    return () => { delete root.dataset.scheduleWorkspace; };
  }, [focusMode, presentationMode]);

  // A meeting board belongs on the whole screen, not inside a browser chrome.
  useEffect(() => {
    if (typeof document === "undefined" || !document.documentElement.requestFullscreen) return;
    if (presentationMode && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
    if (!presentationMode && document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  }, [presentationMode]);

  const CinemaView = () => (
    <Surface className="schedule-cinema">
      <div className="cinema-head">
        <div>
          <span>عرض الجدول</span>
          <h2>
            {terms.find((t) => t.AdTermId === filterTerm)?.AdTermName ||
              "الجدول الدراسي"}
          </h2>
          <p>
            {sections.find((s) => s.AdSectionId === filterSection)
              ?.AdSectionName || "عرض الاجتماع"}{" "}
            · {filteredRows.length.toLocaleString("ar-KW-u-nu-latn")} موعد
          </p>
        </div>
        <div className="cinema-tools">
          {conflictIds.size ? (
            <button
              type="button"
              className={presentConflictsOnly ? "active" : ""}
              onClick={() => setPresentConflictsOnly(v => !v)}
              title="عرض المواعيد التي تحتاج تحقق فقط"
            >
              <AlertTriangle />
              <span>تحتاج تحقق</span>
              <b>{conflictIds.size}</b>
            </button>
          ) : null}
          <button type="button" onClick={() => setPresentationMode(false)} title="إنهاء العرض">
            <X />
          </button>
        </div>
      </div>
      <div className="cinema-timeline">
        {days.map((day) => {
          const items = [...filteredRows]
            .filter((r) => Boolean(r[day.key]))
            .filter((r) => !presentConflictsOnly || conflictIds.has(r.id))
            .sort((a, b) => mins(a.fstarttime) - mins(b.fstarttime));
          return (
            <section key={day.key} className="cinema-day">
              <header>
                <span>{day.short}</span>
                <strong>{day.label}</strong>
                <small>{items.length} موعد</small>
              </header>
              <div className="cinema-day-track">
                {items.length ? (
                  items.map((r) => {
                    const c = courseById.get(r.AdCourseId),
                      i = instructorById.get(r.AdInstructorId);
                    return (
                      <article
                        key={r.id}
                        className={`${xrayClass(r)} ${conflictIds.has(r.id) ? "conflict" : ""}`}
                        onClick={() =>
                          setXrayId((v) => (v === r.id ? null : r.id))
                        }
                      >
                        <time dir="ltr">
                          <b>{scheduleClockForDisplay(r.fendtime)}</b><span>-</span><small>{scheduleClockForDisplay(r.fstarttime)}</small>
                        </time>
                        <i />
                        <div>
                          <strong>
                            {c?.CourseCode || "—"} ·{" "}
                            {r.AdCourseName || c?.CourseName || "مقرر"}
                          </strong>
                          <span>{i?.AdInstructorName || "بدون أستاذ"}</span>
                          <small>
                            شعبة {r.SCode} · {r.AdRoomCode || "—"}/
                            {r.AdRoomHall || "—"}
                          </small>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="cinema-empty">لا توجد محاضرات</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </Surface>
  );
  if (mode === "copy")
    return (
      <div className="content-stack copy-page">
<PageTitle
          eyebrow="أداة إدارية ذكية"
          subtitle="معاينة كاملة قبل التنفيذ"
        >
          نسخ جدول فصل دراسي
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        {message ? <Notice type="success">{message}</Notice> : null}
        <Surface className="copy-workspace">
          <div className="form-intro">
            <span>
              <ArrowLeftRight />
            </span>
            <div>
              <strong>من فصل إلى فصل</strong>
              <p>نطاق · مصدر · وجهة</p>
            </div>
          </div>
          <form onSubmit={copySchedule}>
            {copyScope.lockCollege && copyScope.lockSection ? <div className="scope-inline-note"><strong>النطاق الجاهز</strong><span>{describeScopeSelection(colleges, sections, copyCollege, copySection)}</span></div> : null}
            <div className="form-grid">
              {!copyScope.lockCollege ? <Field label="الكلية" required>
                <select
                  value={copyCollege || ""}
                  onChange={(e) => {
                    const id = Number(e.target.value) || 0;
                    setCopyCollege(id);
                    setCopySection(isPowerAdmin ? (sections.find(sec=>sec.AdCollegeId===id)?.AdSectionId||0) : (resolveScopeSelection(scopes, id, false).defaultSectionId || 0));
                  }}
                  required
                >
                  <option value="">اختر ...</option>
                  {colleges.map((c) => (
                    <option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>
                  ))}
                </select>
              </Field> : null}
              {!copyScope.lockSection ? <Field label="القسم العلمي" required>
                <select
                  value={copySection || ""}
                  disabled={!copyCollege}
                  onChange={(e) => setCopySection(Number(e.target.value) || 0)}
                  required
                >
                  <option value="">اختر ...</option>
                  {copySections.map((section) => (
                    <option key={section.AdSectionId} value={section.AdSectionId}>{section.AdSectionName}</option>
                  ))}
                </select>
              </Field> : null}
              <Field label="الفصل المصدر" required>
                <select
                  value={copyFromTerm || ""}
                  onChange={(e) => setCopyFromTerm(Number(e.target.value) || 0)}
                  required
                >
                  <option value="">اختر ...</option>
                  {terms.map((t) => (
                    <option key={t.AdTermId} value={t.AdTermId}>
                      {t.AdTermName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="الفصل الوجهة" required>
                <select
                  value={copyToTerm || ""}
                  onChange={(e) => {
                    const to = Number(e.target.value) || 0;
                    setCopyToTerm(to);
                    // Idea 1: a new term is usually last year's same semester with
                    // light edits — so pre-pick that as the source to copy from.
                    const destName = terms.find((t) => t.AdTermId === to)?.AdTermName;
                    const wantName = previousYearSameTermName(destName);
                    const match = wantName ? terms.find((t) => sameTermName(t.AdTermName, wantName)) : null;
                    if (match) setCopyFromTerm(match.AdTermId);
                  }}
                  required
                >
                  <option value="">اختر ...</option>
                  {terms.map((t) => (
                    <option key={t.AdTermId} value={t.AdTermId}>
                      {t.AdTermName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="copy-preview">
              {previewing ? (
                <div className="preview-state">جاري تجهيز المعاينة...</div>
              ) : copyPreview ? (
                <>
                  <div className="preview-summary">
                    <StatCard
                      icon={<Table2 />}
                      value={copyPreview.sourceCount}
                      label="سجل في المصدر"
                    />
                    <StatCard
                      icon={
                        copyPreview.targetCount ? (
                          <AlertTriangle />
                        ) : (
                          <CheckCircle2 />
                        )
                      }
                      value={copyPreview.targetCount}
                      label="سجل موجود في الوجهة"
                    />
                  </div>
                  {copyPreview.targetCount ? (
                    <div className="copy-warning">
                      <AlertTriangle />
                      <div>
                        <strong>الفصل الوجهة يحتوي جدولاً</strong>
                        <span>
                          سيُضاف الجديد بجانب الموجود دون حذف أي شيء.
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {copyPreview.sourceIssues?.length ? (
                    <Notice>{copyPreview.sourceIssues.join(" · ")}</Notice>
                  ) : null}
                  {copyPreview.preview?.length ? (
                    <button
                      type="button"
                      className="preview-list-toggle"
                      onClick={() => setCopyListOpen((v) => !v)}
                      aria-expanded={copyListOpen}
                    >
                      <ListChecks aria-hidden="true" />
                      {copyListOpen ? "إخفاء السجلات" : "عرض السجلات (اختياري)"}
                      <ChevronDown aria-hidden="true" style={{ transform: copyListOpen ? "rotate(180deg)" : undefined }} />
                    </button>
                  ) : null}
                  {copyListOpen ? (
                    <div className="preview-list">
                      {copyPreview.preview.map((x: any) => (
                        <article key={x.id}>
                          <span className="code-chip">{x.courseCode}</span>
                          <div>
                            <strong>{x.courseName}</strong>
                            {/* Note 28: the instructor name is noise in a copy preview
                                — the copy is by course/section, not by teacher. */}
                            <small>شعبة {x.sectionCode}</small>
                          </div>
                          <span dir="ltr">{x.time}</span>
                          <span>{x.room}</span>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="preview-state">
                  <Sparkles />
                  اختر الحقول الأربعة لعرض معاينة النسخ.
                </div>
              )}
            </div>
            <div className="form-actions copy-safe-actions">
              <PrimaryButton
                type="submit"
                disabled={
                  saving ||
                  user.SystemUserId !== 1 ||
                  Boolean(copyPreview && !copyPreview.canCopy)
                }
              >
                <Sparkles /> تنفيذ النسخ
              </PrimaryButton>
              {copyUndoPoint ? (
                <SecondaryButton type="button" onClick={undoCopy} disabled={saving}>
                  <History /> تراجع عن آخر نسخ
                </SecondaryButton>
              ) : null}
            </div>
          </form>
        </Surface>
      </div>
    );
  if (editor !== "index")
    return (
      <div className="content-stack editor-page schedule-editor">
        {/* The way out, at the top where the eye already is. The only exit used
            to be a button at the far end of a four-section form, below the fold
            on any ordinary screen — so changing one's mind meant scrolling a
            whole page to find permission to leave. */}
        <button
          type="button"
          className="drawer-close schedule-editor-close no-print"
          onClick={back}
          aria-label="إغلاق بدون حفظ"
          title="إغلاق بدون حفظ (Esc)"
        >
          <X aria-hidden="true" />
        </button>
        <PageTitle
          eyebrow="الجدول الدراسي"
          subtitle="فحص لحظي قبل الحفظ"
        >
          {editor === "create" ? "إضافة موعد دراسي" : "تعديل موعد دراسي"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <div className="schedule-editor-grid">
          <Surface className="form-card smart-form">
            <div className="form-intro">
              <span>
                <CalendarDays />
              </span>
              <div>
                <strong>تفاصيل الموعد</strong>
                <p>البيانات · الأيام · الوقت · المكان</p>
              </div>
            </div>
            {formScopeLabel?<div className="scope-inline-note"><strong>النطاق الجاهز</strong><span>{formScopeLabel}</span></div>:null}
            {(scheduleTouched||outsideTeachingDay)&&validationIssues.length?<div className="editor-validation-strip"><AlertTriangle/><div><strong>صحّح قبل الحفظ</strong>{validationIssues.map(x=><span key={x}>{x}</span>)}</div></div>:null}
            <form onSubmit={save}>
              <div className="schedule-form-sections">
                <section className="schedule-form-section">
                  <header><span>1</span><div><strong>النطاق الأكاديمي</strong><small>الكلية والقسم والفصل</small></div></header>
                  <div className="form-grid">
                {!formScope.lockCollege ? <Field label="الكلية" required>
                  <select value={form.AdCollegeId || ""} onChange={(e) => { const id=Number(e.target.value)||0; setForm(p=>({...p,AdCollegeId:id,AdSectionId:resolveScopeSelection(scopes,id,isPowerAdmin).defaultSectionId||0,AdCourseId:0})); setCourseName(""); }} required>
                    <option value="">اختر ...</option>{colleges.map(c=><option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}
                  </select>
                </Field> : null}
                {!formScope.lockSection ? <Field label="القسم العلمي" required>
                  <select value={form.AdSectionId || ""} disabled={!form.AdCollegeId} onChange={(e)=>{const id=Number(e.target.value)||0;setForm(p=>({...p,AdSectionId:id,AdCourseId:0}));setCourseName("");}} required>
                    <option value="">اختر ...</option>{formSections.map(s=><option key={s.AdSectionId} value={s.AdSectionId}>{s.AdSectionName}</option>)}
                  </select>
                </Field> : null}
                <Field label="الفصل الدراسي" required>
                  <select
                    value={form.AdTermId || ""}
                    onChange={(e) => setNumber("AdTermId", e.target.value)}
                    required
                  >
                    <option value="">اختر ...</option>
                    {terms.map((t) => (
                      <option key={t.AdTermId} value={t.AdTermId}>
                        {t.AdTermName}
                      </option>
                    ))}
                  </select>
                </Field>
                  </div>
                </section>
                <section className="schedule-form-section">
                  <header><span>2</span><div><strong>بيانات المقرر</strong><small>المقرر والرمز والشعبة</small></div></header>
                  <div className="form-grid">
                <Field label="المقرر الدراسي" required>
                  <select
                    value={courseName}
                    disabled={!form.AdSectionId}
                    onChange={(e) => {
                      setCourseName(e.target.value);
                      setForm((p) => ({ ...p, AdCourseId: 0 }));
                    }}
                    required
                  >
                    <option value="">اختر ...</option>
                    {courseNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="رمز المقرر الدراسي"
                  required
                  hint={editId || !sectionHint ? undefined : <span className="section-hint">{sectionHint}</span>}
                >
                  <select
                    value={form.AdCourseId || ""}
                    disabled={!courseName}
                    onChange={(e) => {
                      const courseId = Number(e.target.value) || 0;
                      setForm((p) => {
                        const next = { ...p, AdCourseId: courseId };
                        // Offer the next free section number for this course,
                        // unless a number was typed by hand.
                        if (!editId && courseId && (!p.SCode || sectionAutofilled.current)) {
                          next.SCode = nextSectionCode(courseId, Number(p.AdTermId) || filterTerm || 0);
                          sectionAutofilled.current = true;
                        }
                        return next;
                      });
                    }}
                    required
                  >
                    <option value="">اختر ...</option>
                    {courseCodes.map((c) => (
                      <option key={c.AdCourseId} value={c.AdCourseId}>
                        {c.CourseCode}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="الشعبة" required>
                  <input
                    value={form.SCode}
                    maxLength={20}
                    inputMode="numeric"
                    onChange={(e) => {
                      sectionAutofilled.current = false;
                      if (englishDigits(e.target.value))
                        setForm((p) => ({ ...p, SCode: e.target.value }));
                    }}
                    onBeforeInput={(e: any) => {
                      if (e.data && !/^\d+$/.test(e.data)) {
                        e.preventDefault();
                        setError("الرجاء كتابة الأرقام بالانجليزي");
                      }
                    }}
                    required
                  />
                </Field>
                  </div>
                </section>
                <section className="schedule-form-section">
                  <header><span>3</span><div><strong>التدريس</strong><small>الأستاذ وأيام المحاضرة</small></div></header>
                  <div className="form-grid">
                <Field label="أستاذ المقرر" required>
                  <InstructorPicker
                    value={Number(form.AdInstructorId) || 0}
                    onChange={(id) => setForm((p) => ({ ...p, AdInstructorId: id }))}
                    instructors={instructors as any}
                    departmentIds={departmentInstructorIds}
                    onCreated={(person) =>
                      setInstructors((current: any[]) =>
                        sortByName([...current, person], (row: any) => row.AdInstructorName))
                    }
                    onSelected={(person) =>
                      setInstructors((current: any[]) =>
                        mergeById(current, [person], row => Number(row.AdInstructorId), row => row.AdInstructorName))
                    }
                    collegeId={Number(form.AdCollegeId) || filterCollege}
                    termId={Number(form.AdTermId) || filterTerm}
                  />
                  {/* The civil ID already sits inside the picker beneath the
                      name; repeating it under the field was the same number
                      twice. */}
                </Field>
                {courseNature && courseNature.confidence !== "low" ? (
                  <div className="nature-card">
                    <div>
                      <span className="surface-kicker">كما يُدرَّس هذا المقرر عادةً</span>
                      <strong>{courseNature.summary}</strong>
                      <small>
                        من {courseNature.terms.toLocaleString("ar-KW-u-nu-latn")} فصلاً
                        · {courseNature.observations.toLocaleString("ar-KW-u-nu-latn")} شعبة
                        {courseNature.sectionsPerTerm > 1 ? ` · عادةً ${countOf(courseNature.sectionsPerTerm, AR.section)} في الفصل` : ""}
                      </small>
                    </div>
                    {courseNature.suggestion ? (
                      <button
                        type="button"
                        onClick={() => {
                          const seed = courseNature.suggestion!;
                          setScheduleTouched(true);
                          setForm(previous => {
                            const next: any = { ...previous };
                            days.forEach(day => { next[day.key] = seed.days.includes(day.key as any); });
                            next.fstarttime = seed.start;
                            next.fendtime = seed.end;
                            if (seed.building) next.AdRoomCode = seed.building;
                            if (seed.hall) next.AdRoomHall = seed.hall;
                            if (seed.instructorId && !next.AdInstructorId) next.AdInstructorId = seed.instructorId;
                            return next;
                          });
                        }}
                      >
                        املأ كالمعتاد
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {approvedPatterns.length ? (
                  <div className="pattern-shelf">
                    <span>الأنماط المعتمدة لهذا المقرر</span>
                    <div>
                      {approvedPatterns.map(pattern => (
                        <button
                          type="button"
                          key={pattern.id}
                          className={activePattern?.id === pattern.id ? "active" : ""}
                          onClick={() => applyPattern(pattern)}
                          title={pattern.note}
                        >
                          {pattern.label}
                        </button>
                      ))}
                    </div>
                    {activePattern ? <small>{activePattern.note}</small> : <small>اختر نمطاً ليضبط الأيام والمدة معاً.</small>}
                  </div>
                ) : null}
                <Field label="الأيام" hint={dayPatternNote}>
                  <div className="checkbox-row day-pills">
                    {days.map((d) => (
                      <label key={d.key}>
                        <input
                          type="checkbox"
                          checked={Boolean(form[d.key])}
                          onChange={(e) => {
                            setScheduleTouched(true);
                            setForm((p) => {
                              const next: any = { ...p, [d.key]: e.target.checked };
                              // Three weekly hours are two 90-minute meetings on
                              // Monday/Wednesday, or three 60-minute meetings on
                              // Sunday/Tuesday/Thursday. Changing the days changes
                              // the lecture, so the end time follows (م.8/أ،ب).
                              const chosen = days.filter(day => next[day.key]).map(day => day.key as RegDayKey);
                              const advice = adviseDayPattern(chosen, next.fstarttime, next.fendtime);
                              if (advice && advice.family !== "mixed" && advice.changed && next.fstarttime) {
                                next.fendtime = advice.suggestedEnd;
                              }
                              return next;
                            });
                          }}
                        />
                        <span>{d.label}</span>
                      </label>
                    ))}
                  </div>
                </Field>
                  </div>
                </section>
                <section className="schedule-form-section">
                  <header><span>4</span><div><strong>الوقت والمكان</strong><small>الفترة والمبنى والقاعة</small></div></header>
                  <div className="form-grid">
                <Field label="بداية الوقت" required>
                  <input
                    type="time"
                    min={SCHEDULE_DAY_START_TIME}
                    max={SCHEDULE_DAY_END_TIME}
                    step={SCHEDULE_SLOT_MINUTES * 60}
                    value={form.fstarttime}
                    onChange={(e) => {
                      setScheduleTouched(true);
                      setForm((p) => ({ ...p, fstarttime: e.target.value }));
                    }}
                    required
                  />
                </Field>
                <Field label="نهاية الوقت" required>
                  <input
                    type="time"
                    min={SCHEDULE_DAY_START_TIME}
                    max={SCHEDULE_DAY_END_TIME}
                    step={SCHEDULE_SLOT_MINUTES * 60}
                    value={form.fendtime}
                    onChange={(e) => {
                      setScheduleTouched(true);
                      setForm((p) => ({ ...p, fendtime: e.target.value }));
                    }}
                    required
                  />
                </Field>
                <Field label="رقم المبنى" required>
                  <input
                    value={form.AdRoomCode}
                    list="schedule-buildings"
                    onChange={(e) =>
                      // A different building means the old hall no longer exists.
                      setForm((p) => ({ ...p, AdRoomCode: e.target.value, AdRoomHall: "" }))
                    }
                    required
                  />
                  <datalist id="schedule-buildings">
                    {buildingOptions.map(code => <option key={code} value={code} />)}
                  </datalist>
                </Field>
                <Field
                  label="رقم القاعة"
                  required
                  hint={hallOptions.length ? `قاعات ${form.AdRoomCode}: ${hallOptions.slice(0, 8).join(" · ")}` : undefined}
                >
                  <input
                    value={form.AdRoomHall}
                    list="schedule-halls"
                    onChange={(e) =>
                      setForm((p) => ({ ...p, AdRoomHall: e.target.value }))
                    }
                    required
                  />
                  <datalist id="schedule-halls">
                    {hallOptions.map(hall => <option key={hall} value={hall} />)}
                  </datalist>
                </Field>
                {roomOwner ? (
                  <div className="room-owner-note" role="status">
                    <span className="room-owner-mark" aria-hidden="true"><Building2 /></span>
                    <div>
                      <strong>
                        <bdi>{roomOwner.room}/{roomOwner.hall}</bdi> قاعة {roomOwner.section || "قسم آخر"}
                      </strong>
                      <span>
                        {roomOwner.college ? `${roomOwner.college} · ` : ""}
                        {roomOwner.share}٪ من حجوزاتها المسجلة لهذا القسم. يمكنك المتابعة إذا كان الحجز متفقاً عليه.
                      </span>
                    </div>
                    <button type="button" onClick={() => setForm(p => ({ ...p, AdRoomCode: "", AdRoomHall: "" }))}>
                      تغيير القاعة
                    </button>
                  </div>
                ) : null}
                  </div>
                  <div className="slot-advisor">
                    <button
                      type="button"
                      className="slot-advisor-ask"
                      onClick={askForSlots}
                      disabled={slotBusy || !selectedFormDays.length}
                      title={selectedFormDays.length ? "اقترح أفضل ثلاث خانات" : "اختر الأيام أولاً"}
                    >
                      <Sparkles aria-hidden="true" />
                      {slotBusy ? "أبحث…" : "اقترح لي وقتاً وقاعة"}
                    </button>
                    {slotIdeas ? (
                      slotIdeas.length ? (
                        <div className="slot-ideas">
                          {slotIdeas.map((slot, index) => (
                            <button type="button" key={`${slot.start}-${slot.room}-${slot.hall}`} onClick={() => takeSlot(slot)}>
                              <b className="slot-rank">{index + 1}</b>
                              <span className="slot-when">
                                <time dir="ltr">{formatScheduleTimeRange(slot.start, slot.end)}</time>
                                <small>{slot.room}/{slot.hall}</small>
                              </span>
                              <span className="slot-why">
                                {slot.reasons.map((reason: string) => <i key={reason}>{reason}</i>)}
                              </span>
                              <span className="slot-score" style={{ "--score": `${slot.score}%` } as React.CSSProperties}>
                                <i />
                                <em>{slot.score}</em>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="slot-empty">لا توجد خانة خالية بهذه الأيام والمدة.</p>
                      )
                    ) : null}
                  </div>
                </section>
              </div>
              <div className="save-preview">
                <span className="save-preview-icon">
                  <Eye />
                </span>
                <div className="save-preview-copy">
                  <small>معاينة قبل الحفظ</small>
                  <strong>
                    {courseName || "اختر المقرر"}
                    {form.SCode ? ` · شعبة ${form.SCode}` : ""}
                  </strong>
                  <span>
                    {selectedInstructor?.AdInstructorName || "اختر الأستاذ"} ·{" "}
                    {arabicDays(form) || "اختر الأيام"}
                  </span>
                </div>
                <div className="save-preview-facts">
                  <MetaPill
                    label="الوقت"
                    value={
                      form.fstarttime && form.fendtime
                        ? formatScheduleTimeRange(form.fstarttime, form.fendtime)
                        : "—"
                    }
                    dir="ltr"
                  />
                  <MetaPill
                    label="القاعة"
                    value={
                      form.AdRoomCode && form.AdRoomHall
                        ? `${form.AdRoomCode}/${form.AdRoomHall}`
                        : "—"
                    }
                  />
                  <Badge
                    tone={
                      checking
                        ? "neutral"
                        : conflicts.length
                          ? "warning"
                          : "success"
                    }
                  >
                    {checking
                      ? "جاري الفحص"
                      : conflicts.length
                        ? countOf(conflicts.length, AR.note)
                        : "جاهز"}
                  </Badge>
                </div>
              </div>
              <FormActions onBack={back} loading={saving} submitDisabled={Boolean(validationIssues.length||blockingConflicts.length||checking)} />
            </form>
          </Surface>
          <aside className="conflict-panel">
            <div className="conflict-head">
              <span>
                <AlertTriangle />
              </span>
              <div>
                <strong>فحص موانع الحفظ</strong>
                <small>
                  {validationIssues.length?"تحقق من الوقت والأيام":checking?"جاري الفحص...":blockingConflicts.length?"تعارض يمنع الحفظ":"لا يوجد مانع ظاهر"}
                </small>
              </div>
            </div>
            {conflicts.length ? (
              <div className="conflict-list">
                {conflicts.map((c, i) => (
                  <article key={`${c.type}-${c.rowId}-${i}`}>
                    <Badge tone={c.severity === "high" ? "danger" : "warning"}>
                      {c.type === "room"
                        ? "قاعة"
                        : c.type === "instructor"
                          ? "أستاذ"
                          : c.type === "roomScope"
                            ? "نطاق القاعة"
                            : "تكرار"}
                    </Badge>
                    <strong>{c.message}</strong>
                    <span>{c.detail}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="conflict-clear">
                <CheckCircle2 />
                <strong>الموعد صالح للحفظ</strong>
                <span>
                  سيستمر الفحص تلقائياً مع تغيير الوقت أو القاعة أو الأستاذ.
                </span>
              </div>
            )}
            {/*
              The articles, read on the draft. Deliberately below the blocking
              check and deliberately never blocking: a save is refused only by
              a real clash, and a departure from the regulation is a thing the
              department is told about, not prevented from doing.
            */}
            {editorRegulation.length ? (
              <div className="regulation-advice" role="status">
                <div className="regulation-advice-head">
                  <ClipboardCheck aria-hidden="true" />
                  <strong>ملاحظات اللائحة</strong>
                  <em>تحذير — لا يمنع الحفظ</em>
                </div>
                {editorRegulation.slice(0, 4).map(finding => (
                  <article key={finding.rule} className={`regulation-advice-item sev-${finding.severity}`}>
                    <span className="regulation-article">{finding.article}</span>
                    <strong>{finding.title}</strong>
                    <span>{finding.detail}</span>
                  </article>
                ))}
                {editorRegulation.length > 4 ? (
                  <small className="regulation-advice-more">
                    و{(editorRegulation.length - 4).toLocaleString("ar-KW-u-nu-latn")} ملاحظة أخرى تظهر في مراجعة الاعتماد.
                  </small>
                ) : null}
              </div>
            ) : null}
            {conflicts.length ? (
              <div className="solver-box">
                <SecondaryButton
                  type="button"
                  onClick={solveConflicts}
                  disabled={solving}
                >
                  <WandSparkles />
                  {solving ? "أبحث عن البدائل..." : "اقترح بديلاً آمناً"}
                </SecondaryButton>
                {solutions.length ? (
                  <div className="solver-results">
                    {solutions.map((x: any) => (
                      <button
                        type="button"
                        key={`${x.start}-${x.roomCode}-${x.roomHall}`}
                        onClick={() => applySolution(x)}
                      >
                        <span className="solver-rank">{x.rank}</span>
                        <div>
                          <strong dir="ltr">
                            {formatScheduleTimeRange(x.start, x.end)}
                          </strong>
                          <small>
                            مبنى {x.roomCode} · قاعة {x.roomHall}
                          </small>
                        </div>
                        {/* A clear suggestion needs no "no obstacle" label — that
                            is what being suggested already means. Only a real
                            caveat earns a badge. */}
                        {x.conflicts ? <Badge tone="warning">{x.label}</Badge> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <p className="conflict-note">
              هذه تنبيهات واقتراحات فقط؛ الحفظ الأصلي لا يتم إلا عندما تضغط
              «موافق».
            </p>
          </aside>
        </div>
      </div>
    );
  const dockSuppressed = Boolean(
    presentationMode ||
    livingPanelOpen ||
    experience.decisionOpen ||
    experience.signatureOpen ||
    reviewOpen ||
    editor !== "index" ||
    viewDialog ||
    transferOpen ||
    undoLogOpen ||
    paletteOpen ||
    shortcutsOpen ||
    driftOpen ||
    inboxOpen ||
    clash ||
    context ||
    quick ||
    repair ||
    fanned ||
    mobileViewGate
  );
  return (
    <div className={`content-stack schedule-page ${phoneReadOnly ? "schedule-phone" : ""}`.trim()}>
      <PageTitle
        eyebrow="مركز الجدول"
        subtitle="نطاق · مراجعة · نشر"
        action={<AddButton onClick={openCreate}>إضافة موعد</AddButton>}
      >
        الجدول الدراسي
      </PageTitle>
      {mobileViewGate ? (
        <div className="mobile-desktop-gate no-print" role="dialog" aria-modal="true" aria-label="بعض عروض الجدول للقراءة فقط على الهاتف">
          <div className="mobile-desktop-gate-card">
            <span className="mobile-desktop-gate-icon">
              {mobileViewGate === "week" ? <CalendarDays /> : <MapPin />}
            </span>
            <div>
              <strong>{mobileViewGate === "week" ? "عرض الأسبوع" : "عرض القاعات"} للقراءة فقط على الهاتف</strong>
              <p>
                يمكنك تصفّح هذا العرض بوضوح كامل، لكن السحب والنقل المباشر داخله يعملان من الكمبيوتر فقط. إذا أردت التعديل أو إضافة موعد من الهاتف، استخدم «قائمة» فهي متاحة للتحرير والإنشاء.
              </p>
            </div>
            <button type="button" onClick={() => setMobileViewGate(null)}>فهمت · متابعة العرض</button>
          </div>
        </div>
      ) : null}
      {returnNote ? <Notice type="success">{returnNote}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice type="success">{message}</Notice> : null}
      {physicsNotice || undoPoint ? (
        <div className="schedule-physics-status no-print">
          <div>
            <span className="physics-status-dot" />
            <strong>
              {physicsNotice || "شبكة أمان القرار جاهزة لهذا التغيير."}
            </strong>
          </div>
          {isPowerAdmin && undoPoint ? (
            <button
              type="button"
              onClick={() => void undoPhysicsDecision()}
              disabled={saving}
            >
              <History />
              {undoPoint.decisionLabel || "استرجاع القرار"}
            </button>
          ) : null}
        </div>
      ) : null}
      <Surface className="schedule-control">
        <div className="filter-strip">
          {filterScope.lockCollege && filterScope.lockSection && filterScopeLabel ? <div className="scope-filter-chip"><span>النطاق</span><strong>{filterScopeLabel}</strong></div> : null}
          {!filterScope.lockCollege ? <Field label="الكلية"><select value={filterCollege || ""} onChange={(e)=>{const id=Number(e.target.value)||0;setFilterCollege(id);setFilterSection(isPowerAdmin ? (sections.find(sec=>sec.AdCollegeId===id)?.AdSectionId||0) : (resolveScopeSelection(scopes,id,false).defaultSectionId||0))}}><option value="">الكل ...</option>{colleges.map(c=><option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}</select></Field> : null}
          {!filterScope.lockSection ? <Field label="القسم العلمي"><select value={filterSection || ""} disabled={!filterCollege} onChange={(e)=>setFilterSection(Number(e.target.value)||0)}><option value="">الكل ...</option>{filterSections.map(s=><option key={s.AdSectionId} value={s.AdSectionId}>{s.AdSectionName}</option>)}</select></Field> : null}
          <Field label="الفصل الدراسي">
            <select
              value={filterTerm || ""}
              onChange={(e) => setFilterTerm(Number(e.target.value) || latestTermId)}
            >
              <option value="">الأحدث تلقائياً</option>
              {terms.map((t) => (
                <option key={t.AdTermId} value={t.AdTermId}>
                  {t.AdTermName}
                </option>
              ))}
            </select>
          </Field>
          {rowsLoading ? <span className="filter-strip-busy" role="status"><i aria-hidden="true" />يقرأ الجدول…</span> : null}
        </div>
        <div className="schedule-tools" role="toolbar" aria-label="أدوات عرض الجدول">
          <div className="schedule-view-cluster">
          <div className="segmented" role="group" aria-label="طريقة عرض الجدول">
            <button type="button" className={viewMode === "list" ? "active" : ""} aria-pressed={viewMode === "list"} onClick={() => changeView("list")}>
              <LayoutList aria-hidden="true" /> قائمة
            </button>
            {!phoneReadOnly ? (<>
              <button type="button" className={viewMode === "week" ? "active" : ""} aria-pressed={viewMode === "week"} onClick={() => changeView("week")}>
                <CalendarDays aria-hidden="true" /> أسبوع
              </button>
              <button type="button" className={viewMode === "rooms" ? "active" : ""} aria-pressed={viewMode === "rooms"} onClick={() => changeView("rooms")}>
                <MapPin aria-hidden="true" /> القاعات
              </button>
            </>) : null}
          </div>
          {/* A way of looking at the board, remembered by name. Absent entirely
              until the reader has saved one — no empty menu on behalf of a
              feature nobody has used. */}
          <ScheduleViewsMenu
            views={savedViews}
            activeId={activeViewId}
            dirty={viewDirty}
            onOpenView={applyView}
            onUpdateActive={() => {
              if (!activeView) return;
              viewsStore.update(activeView.id, captureView(activeView.name));
              setSavedViews(viewsStore.list());
              setMessage("حُدِّث العرض");
            }}
            onRestoreActive={() => { if (activeView) applyView(activeView); }}
            onSaveAs={() => setViewDialog({ mode: "create" })}
            onRename={view => setViewDialog({ mode: "rename", view })}
            onDelete={view => {
              if (!window.confirm(`حذف العرض «${view.name}»؟`)) return;
              viewsStore.remove(view.id);
              setSavedViews(viewsStore.list());
              if (activeViewId === view.id) setActiveViewId(null);
            }}
            onToggleFavorite={view => { viewsStore.toggleFavorite(view.id); setSavedViews(viewsStore.list()); }}
          />
          {/* The live radar: what the board knows about itself, always visible.
              Counted locally on every change, so the number never waits for a
              request — pressing it takes you to the offending cards. */}
          <span
            className={`schedule-live-dot ${liveFeed ? "on" : ""}`}
            title={liveFeed ? "بث مباشر: أي تغيير من زميل يظهر هنا تلقائياً" : "البث المباشر غير متصل — يحدَّث عند القراءة"}
            role="status"
            aria-label={liveFeed ? "البث المباشر متصل" : "البث المباشر غير متصل"}
          />
          {/* Who else is on this board. It only ever names the people it can
              see — it never claims you are alone, because a colleague served by
              another instance is invisible from here, and being confidently
              wrong about that is worse than saying nothing. */}
          {peers.length ? (
            <span className="presence-strip no-print" role="status"
              aria-label={`${countOf(peers.length, AR.colleague)} معك على هذا الجدول`}>
              {peers.slice(0, 5).map(peer => (
                <span key={peer.connId} className="presence-chip"
                  data-busy={peer.holding || peer.editing ? "1" : "0"}
                  style={{ ["--presence-hue" as string]: PRESENCE_HUES[presenceHue(peer.userId) - 1] }}
                  title={peer.holding ? `${peer.name} — يحمل موعداً الآن`
                       : peer.editing ? `${peer.name} — يعدّل موعداً الآن`
                       : `${peer.name} — معك على هذا الجدول`}>
                  {peer.name.replace(/^د\.\s*/, "").trim().charAt(0) || "؟"}
                </span>
              ))}
              {peers.length > 5 ? <span className="presence-chip" title={`و${countOf(peers.length - 5, AR.colleague)} غيرهم`}>+{peers.length - 5}</span> : null}
            </span>
          ) : null}
          {liveClash.pairs ? (
            <button
              type="button"
              className="schedule-radar radar-clash"
              onClick={() => {
                if (phoneReadOnly) {
                  setReviewOpen(true);
                  return;
                }
                setViewMode("week");
                setReviewFocus(new Set([...liveClash.ids]));
              }}
              title={`تداخل قائم في هذا النطاق — أستاذ: ${liveClash.instructorPairs.toLocaleString("ar-KW-u-nu-latn")} · قاعة: ${liveClash.roomPairs.toLocaleString("ar-KW-u-nu-latn")} · تكرار: ${liveClash.duplicatePairs.toLocaleString("ar-KW-u-nu-latn")} — اضغط لإظهارها على الأسبوع`}
            >
              {/* "تعارض" implied something unsaveable, and the program never lets
                  a real conflict be saved — so what the radar surfaces is an
                  existing OVERLAP (usually inherited from legacy data), which is
                  what the honest word describes. */}
              <AlertTriangle aria-hidden="true" />
              {countOf(liveClash.pairs, AR.clash)}
            </button>
          ) : null}
          {liveNotes.length ? (
            <button
              type="button"
              className="schedule-radar radar-notes"
              onClick={() => setReviewOpen(true)}
              title="ملاحظات اللائحة على النطاق المفتوح — اضغط لفتح مراجعة الاعتماد"
            >
              <ClipboardCheck aria-hidden="true" />
              {countOf(liveNotes.length, AR.note)}
            </button>
          ) : null}
          {/* What arrived from the department's own instructors. It is the only
              chip here that is about people rather than rows, so it says who,
              not how many. */}
          {inbox.length ? (
            <button
              type="button"
              className="schedule-radar radar-inbox"
              onClick={() => setInboxOpen(true)}
              title={`${countOf(inbox.length, AR.message)} من أساتذة القسم — اضغط للقراءة`}
            >
              <Inbox aria-hidden="true" />
              {inbox.length.toLocaleString("ar-KW-u-nu-latn")} من الأساتذة
            </button>
          ) : null}
          {/* The settled term. It appears only when it has something to say, and
              what it says is about a term nobody is editing — so it is a mark,
              not a colour, and it never joins the counters above. */}
          {drift ? (
            <button
              type="button"
              className={`schedule-radar radar-drift ${drift.foreign ? "radar-drift-foreign" : ""}`}
              onClick={() => setDriftOpen(true)}
              title={`${drift.headline} — اضغط للتفصيل`}
            >
              <History aria-hidden="true" />
              {drift.term?.name || "الفصل المعتمد"}
            </button>
          ) : null}
          {!liveClash.pairs && !liveNotes.length && filteredRows.length ? (
            <span className="schedule-radar radar-clean" title="لا تداخل ولا ملاحظات لائحة على النطاق المفتوح">
              <CheckCircle2 aria-hidden="true" /> سليم
            </span>
          ) : null}
          </div>
          <label className="schedule-quick-search" role="search">
            <Search aria-hidden="true" />
            <input
              type="search"
              ref={searchRef}
              value={quickSearch}
              onChange={e => setQuickSearch(e.target.value)}
              placeholder="بحث سريع"
              aria-label="بحث سريع داخل مواعيد الجدول"
            />
            {quickSearch ? <button type="button" onClick={() => setQuickSearch("")} aria-label="مسح البحث السريع">×</button> : null}
          </label>
          <div className="schedule-tool-actions" role="group" aria-label="أدوات الجدول الإضافية">
            {/* The schedule lens was retired: its one distinct trick — dimming
                instead of removing — did not earn a permanent button in a busy
                toolbar when the quick search answers the same question by name
                and the query centre covers the structured cases in full. */}
            <GhostButton
              type="button"
              onClick={() => setWorkspaceToolsOpen(open => !open)}
              aria-expanded={workspaceToolsOpen}
              title="إظهار أدوات التركيز والمراجعة والنشر"
            >
              <Layers aria-hidden="true" /> {workspaceToolsOpen ? "أدوات أقل" : "المزيد"}
            </GhostButton>
            {!phoneReadOnly && (workspaceToolsOpen || focusMode) ? <GhostButton
              type="button"
              onClick={() => {
                setFocusMode(!focusMode);
                setPresentationMode(false);
                if (!focusMode) setViewMode("week");
              }}
              aria-pressed={focusMode}
            >
              <Focus /> {focusMode ? "إنهاء التركيز" : "تركيز"}
            </GhostButton> : null}
            {!phoneReadOnly && (workspaceToolsOpen || presentationMode) ? <GhostButton
              type="button"
              onClick={() => {
                setPresentationMode(!presentationMode);
                setFocusMode(false);
                if (!presentationMode) setViewMode("week");
              }}
              aria-pressed={presentationMode}
            >
              <Expand /> {presentationMode ? "إنهاء العرض" : "عرض"}
            </GhostButton> : null}
            {workspaceToolsOpen ? <GhostButton
              type="button"
              onClick={() => setViewDialog({ mode: "create" })}
              title="احفظ الكلية والقسم والفصل وطريقة العرض والتلوين والطبقات باسم تعود إليه"
            >
              <Bookmark aria-hidden="true" /> حفظ العرض الحالي
            </GhostButton> : null}
            {workspaceToolsOpen ? <GhostButton type="button" onClick={() => setReviewOpen(true)} title="فحص الجدول كاملاً قبل الاعتماد">
              <ClipboardCheck /> مراجعة الاعتماد
            </GhostButton> : null}
            {workspaceToolsOpen ? <GhostButton
              type="button"
              onClick={() => { if (!showMobileReadOnlyGate()) setTransferOpen(true); }}
              title={isPowerAdmin ? "استيراد وتصدير واستبدال أستاذ والمنتدبون" : "المنتدبون"}
            >
              <ArrowLeftRight /> {isPowerAdmin ? "أدوات البيانات" : "المنتدبون"}
            </GhostButton> : null}
            {workspaceToolsOpen && isPowerAdmin ? (
              <div className="schedule-publish-slot">
                <SchedulePublish
                  collegeId={filterCollege}
                  sectionId={filterSection}
                  termId={filterTerm}
                  scopeLabel={sections.find((x) => x.AdSectionId === filterSection)?.AdSectionName}
                />
              </div>
            ) : null}
          </div>
        </div>
        {mode === "schedule" && workspaceReady && filterCollege && filterSection && filterTerm ? (
          <div className="schedule-control-barter">
            <HallBarterBoard
              collegeId={filterCollege}
              sectionId={filterSection}
              termId={filterTerm}
              liveSerial={liveFeedSerial}
              onReservationsChange={setHallBarterReservations}
            />
          </div>
        ) : null}
      </Surface>
      {xraySelected ? (
        <section className="academic-xray no-print">
          <div className="xray-beam">
            <BrainCircuit />
            <span>أشعة الجدول</span>
          </div>
          <div className="xray-main">
            <strong>
              {xraySelected.AdCourseName ||
                courseById.get(xraySelected.AdCourseId)?.CourseName}
            </strong>
            <small>
              شعبة {xraySelected.SCode} ·{" "}
              {arabicDays(xraySelected) || "بدون أيام"} · اضغط الموعد مرة أخرى
              لإلغاء الأشعة
            </small>
          </div>
          <div className="xray-relations">
            <span>
              <UsersRound />
              <b>
                {
                  rows.filter(
                    (r) => r.AdInstructorId === xraySelected.AdInstructorId,
                  ).length
                }
              </b>{" "}
              للأستاذ
            </span>
            <span>
              <CalendarDays />
              <b>
                {
                  rows.filter((r) => r.AdCourseId === xraySelected.AdCourseId)
                    .length
                }
              </b>{" "}
              للمقرر
            </span>
            <span>
              <Table2 />
              <b>
                {
                  rows.filter((r) => sameRoom(r, xraySelected)).length
                }
              </b>{" "}
              للقاعة
            </span>
            <span>
              <CalendarDays />
              <b>
                {
                  rows.filter(
                    (r) =>
                      r.id !== xraySelected.id &&
                      xraySharedDay(r, xraySelected),
                  ).length
                }
              </b>{" "}
              في نفس الأيام
            </span>
            <span>
              <Eye />
              <b>
                {
                  rows.filter(
                    (r) =>
                      r.id !== xraySelected.id &&
                      xrayTimeConnected(r, xraySelected),
                  ).length
                }
              </b>{" "}
              متصل زمنياً
            </span>
          </div>
          <button
            type="button"
            aria-label="إغلاق أشعة الجدول"
            title="إغلاق أشعة الجدول"
            onClick={() => setXrayId(null)}
          >
            <X />
          </button>
        </section>
      ) : null}
      <section className="schedule-mini-stats">
        <StatCard
          icon={<CalendarDays />}
          value={filteredRows.length}
          label="موعد ظاهر"
        />
        <StatCard
          icon={<Table2 />}
          value={
            new Set(filteredRows.map((x) => x.AdRoomCode + "|" + x.AdRoomHall)).size
          }
          label="قاعة مستخدمة"
        />
        <StatCard
          icon={<Sparkles />}
          value={new Set(filteredRows.map((x) => x.AdInstructorId)).size}
          label="أستاذ مقرر"
        />
      </section>
      <ScheduleExperienceLayer
        experience={experience}
        isPowerAdmin={isPowerAdmin}
        onOpenRow={openEdit}
        onEnsureWeek={() => setViewMode("week")}
        rows={filteredRows}
        headless
      />
      <LivingScheduleLayer
        user={user}
        rows={filteredRows}
        courses={courses}
        instructors={instructors}
        terms={terms}
        collegeId={filterCollege}
        sectionId={filterSection}
        termId={filterTerm}
        onOpenRow={openEdit}
        onRefresh={loadRows}
        experience={experience}
        onEnsureWeek={() => setViewMode("week")}
        onPanelOpenChange={setLivingPanelOpen}
      />
      {rowsLoading && !rows.length ? (
        <Surface className="sched-skeleton-surface">
          <ScheduleSkeleton viewMode={viewMode} />
        </Surface>
      ) : presentationMode ? (
        <CinemaView />
      ) : viewMode === "list" ? (
        <Surface className="schedule-agenda-surface">
          <div className="agenda-head">
            <div>
              <span className="surface-kicker">عرض ذكي</span>
              <h2>مواعيد القسم</h2>
            </div>
            <span>{filteredRows.length.toLocaleString("ar-KW-u-nu-latn")} موعد</span>
          </div>
          {filteredRows.length ? (
            <div className="schedule-agenda">
              {filteredRows.slice(0, visibleLimit).map((s, idx) => {
                const c = courseById.get(s.AdCourseId),
                  i = instructorById.get(s.AdInstructorId);
                return (
                  <article
                    data-row-id={s.id}
                    className={`agenda-card ${xrayClass(s)} ${justChangedId === s.id ? "just-changed" : ""} ${liveClash.ids.has(s.id) ? "live-clash" : ""} ${liveNow.running.has(s.id) ? "agenda-running" : liveNow.next === s.id ? "agenda-next" : ""}`}
                    key={s.id}
                    /* The course's own colour, carried into the list so a lecture
                       looks the same here as it does in the grid, the fan and the
                       hover card. A variable only — every state colour the card
                       already owns (running, x-ray, just-changed) still wins. */
                    style={{ ["--hue" as any]: hueFor(c?.CourseCode || s.AdCourseName || "—", s.AdCourseName || c?.CourseName || "", i?.AdInstructorName, placeOf(s)) }}
                    onClick={() => runVisualTransition(() => setXrayId((v) => (v === s.id ? null : s.id)))}
                    onDoubleClick={() => openEdit(s)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openContext(s);
                    }}
                  >
                    <div className="agenda-index">
                      {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="agenda-core">
                      <div className="agenda-title-row">
                        <span className="code-chip">
                          {c?.CourseCode || "—"}
                        </span>
                        <strong>{s.AdCourseName || c?.CourseName || ""}</strong>
                        <Badge tone="neutral">شعبة {s.SCode}</Badge>
                        {liveNow.running.has(s.id) ? (
                          <span className="agenda-live-tag">جارية الآن</span>
                        ) : liveNow.next === s.id ? (
                          <span className="agenda-live-tag next">التالية</span>
                        ) : null}
                      </div>
                      <div className="agenda-sub">
                        <span>
                          <UsersRound />
                          {i?.AdInstructorName || "بدون أستاذ"}
                        </span>
                        <span>
                          <CalendarDays />
                          {arabicDays(s) || "بدون أيام"}
                        </span>
                      </div>
                    </div>
                    <div className="agenda-time" title="الوقت">
                      <Clock3 aria-hidden="true" />
                      <strong dir="ltr">
                        {formatScheduleTimeRange(s.fstarttime, s.fendtime)}
                      </strong>
                    </div>
                    <div className="agenda-place" title="المكان">
                      <MapPin aria-hidden="true" />
                      <strong>
                        {s.AdRoomCode || "—"} / {s.AdRoomHall || "—"}
                      </strong>
                    </div>
                    <div className="agenda-meta">
                      <span className="unit-pill" title="وحدات">
                        <Layers aria-hidden="true" />
                        {c?.CourseCredit ?? "—"}
                      </span>
                      <span className="unit-pill" title="ساعات">
                        <Hourglass aria-hidden="true" />
                        {c?.CourseHours ?? "—"}
                      </span>
                    </div>
                    <div className="agenda-actions">
                      <button
                        className="icon-action icon-action-insight"
                        type="button"
                        title="افهم هذا الموعد"
                        aria-label="افهم هذا الموعد"
                        onClick={() => openContext(s)}
                      >
                        <BrainCircuit />
                      </button>
                      <IconAction
                        label="تعديل"
                        kind="edit"
                        onClick={() => openEdit(s)}
                      />
                      <IconAction
                        label="حذف"
                        kind="delete"
                        onClick={() => remove(s.id)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="لا توجد مواعيد ضمن الاختيار الحالي"
              detail={
                emptyElsewhere.length
                  ? "هذا الفصل يحتوي مواعيد، لكن في أقسام أخرى:"
                  : "لا مواعيد مسجلة في هذا الفصل ضمن نطاقك."
              }
              action={
                <>
                  {emptyElsewhere.length ? (
                    <div className="empty-elsewhere">
                      {emptyElsewhere.map(item => (
                        <button
                          type="button"
                          key={item.sectionId}
                          onClick={() => setFilterSection(item.sectionId)}
                        >
                          {item.name}
                          <b>{item.count.toLocaleString("ar-KW-u-nu-latn")}</b>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <PrimaryButton onClick={openCreate}>إضافة موعد</PrimaryButton>
                </>
              }
            />
          )}{" "}
          {filteredRows.length > visibleLimit ? (
            <div className="agenda-more">
              <SecondaryButton onClick={() => setVisibleLimit((v) => v + AGENDA_PAGE_SIZE)}>
                عرض المزيد ·{" "}
                {Math.min(AGENDA_PAGE_SIZE, filteredRows.length - visibleLimit).toLocaleString(
                  "ar-KW-u-nu-latn",
                )}
              </SecondaryButton>
            </div>
          ) : null}
        </Surface>
      ) : viewMode === "rooms" ? (
        <Surface className="rooms-surface">
          {(() => {
            /* --- The paper timetable, alive -----------------------------------
               The sheet this program replaces lists rooms as rows and the day
               as columns of hours — the mind of the building itself. Same here:
               room is now a five-day card: the paper's day column becomes five
               living lanes sharing one hour line. A reader can still fold it
               down to one day, but the default finally answers the real room
               question: what happens here across the whole week? */
            const { displayDays, allBuildings, allRooms, byDayRoom, compactByRoom, noRoomByDay, roomCounts, hourMarks, span } = roomsMatrix;
            /* Pinning rooms narrows the matrix to the ones being worked on —
               a building's four labs instead of every room in the college. */
            const buildingScopedRooms = matrixBuildings.size
              ? allRooms.filter(room => matrixBuildings.has(room.buildingKey))
              : allRooms;
            const roomList = matrixRooms.size ? buildingScopedRooms.filter(room => matrixRooms.has(room.key)) : buildingScopedRooms;
            const pct = (minutesAt: number) => ((minutesAt - gridWindow.start) / span) * 100;
            const rowsFor = (day: DayKey, roomKey: string) => byDayRoom.get(`${day}|${roomKey}`) || [];
            const renderTrackCard = (row: FSchedule, placement?: { lane: number; visualFrom: number; visualTo: number }) => {
              const course = courseById.get(row.AdCourseId);
              const instructor = instructorById.get(row.AdInstructorId);
              const code = String(course?.CourseCode || "").trim() || "—";
              const title = row.AdCourseName || course?.CourseName || code;
              const compactTitle = courseLabel(title, 0.46).text;
              const who = instructor?.AdInstructorName ? firstLast(instructor.AdInstructorName) : "بدون أستاذ";
              const compactWho = instructor?.AdInstructorName ? instructorLabel(instructor.AdInstructorName, 0.5) : "بدون أستاذ";
              const whoWords = who.split(/\s+/).filter(Boolean);
              const whoFamily = whoWords.length > 1 ? whoWords.pop()! : "";
              const whoGiven = whoWords.join(" ") || who;
              const activeRoomDays = days.filter(day => Boolean((row as any)[day.key]));
              const dayNames = activeRoomDays.map(day => day.label).join(" · ") || "بلا يوم";
              const undoId = recentMoves[row.id];
              const undoEntry = undoId ? undoLog.find(item => item.id === undoId && !item.usedAt) : null;
              const actualFrom = mins(row.fstarttime), actualTo = mins(row.fendtime);
              const visualFrom = placement?.visualFrom ?? actualFrom;
              const visualTo = placement?.visualTo ?? actualTo;
              const visualSpan = Math.max(1, visualTo - visualFrom);
              const cardStyle: React.CSSProperties = {
                ["--hue" as any]: hueFor(code, title, instructor?.AdInstructorName, placeOf(row)),
                right: `${pct(visualFrom)}%`,
                width: `${Math.max(3, pct(visualTo) - pct(visualFrom))}%`,
                ...(placement ? {
                  top: `${4 + placement.lane * 68}px`,
                  bottom: "auto",
                  height: "64px",
                  ["--actual-right" as any]: `${((actualFrom - visualFrom) / visualSpan) * 100}%`,
                  ["--actual-width" as any]: `${Math.max(3, ((actualTo - actualFrom) / visualSpan) * 100)}%`,
                } : {}),
              };
              // The card is bound to the same drag engine the week uses, so it
              // lifts, floats, is judged and lands with the identical behaviour
              // — not an imitation of it.
              const trackGrip = physics.bindEvent(row, (activeRoomDays[0]?.key || "fsunday") as any);
              return (
                <article
                  {...trackGrip}
                  key={row.id}
                  data-row-id={row.id}
                  className={`rooms-card ${placement ? "rooms-card-compact" : ""} ${justChangedId === row.id ? "just-changed" : ""} ${liveClash.ids.has(row.id) ? "live-clash" : ""} ${physicsActive && physicsOrigin?.id === row.id ? "physics-source-lift" : ""}`}
                  style={cardStyle}
                  draggable={!saving && !physics.supported}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/schedule-id", String(row.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  title={`${title} · ${instructor?.AdInstructorName || "بدون أستاذ"} · ${dayNames} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`}
                  aria-label={`${title} · ${instructor?.AdInstructorName || "بدون أستاذ"} · ${dayNames} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`}
                  onClick={() => void openContext(row)}
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") void openContext(row); }}
                >
                  <b>{placement ? compactTitle : courseLabel(title, 0.82).text}</b>
                  <span title={instructor?.AdInstructorName || "بدون أستاذ"}>{placement ? <i>{compactWho}</i> : <><i>{whoGiven}</i>{whoFamily ? <i>{whoFamily}</i> : null}</>}</span>
                  <em dir="ltr">{code}</em>
                  {undoEntry ? (
                    <button
                      type="button"
                      className="week-moved-pill"
                      title={`${undoEntry.label} — اضغط للتراجع`}
                      onClick={(e) => { e.stopPropagation(); void runUndoEntry(undoEntry); setRecentMoves(current => { const next = { ...current }; delete next[row.id]; return next; }); }}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <Undo2 aria-hidden="true" />تراجع
                    </button>
                  ) : null}
                </article>
              );
            };
            const trackDrop = (building: string, hall: string, day: DayKey) => async (e: React.DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/schedule-id"));
              const row = rows.find(item => item.id === id);
              if (!row || saving) return;
              const track = e.currentTarget.getBoundingClientRect();
              /* RTL: the track starts at its right edge; the drop's share of the
                 width, snapped to the half hour, is the new start. */
              const share = Math.min(1, Math.max(0, (track.right - e.clientX) / track.width));
              const start = timeFromMins(Math.round((gridWindow.start + share * span) / SCHEDULE_SLOT_MINUTES) * SCHEDULE_SLOT_MINUTES);
              await commitRoomMove(row, day, start, building, hall);
            };
            return (
              <>
                <div className="rooms-head">
                  <Segmented
                    value={matrixDay}
                    instant
                    options={[{ value: "week", label: "الأسبوع كامل" }, ...days.map(day => ({ value: day.key, label: day.label }))]}
                    onChange={(value) => setMatrixDay(value as DayKey | "week")}
                  />
                  <small>{phoneReadOnly ? "معاينة ثابتة على الهاتف؛ التبديل والنقل والتعديل متاح من الكمبيوتر فقط." : matrixDay === "week" ? "مقارنة سريعة: القاعة ثم أيام استخدامها ثم ساعاتها؛ كل مقرر يبقى داخل مدته الحقيقية ويظهر معه أستاذه ونمط أيامه." : "عرض يوم منفرد — ارجع إلى «الأسبوع كامل» للمقارنة المدمجة بين القاعات."}</small>
                </div>
                {allBuildings.length > 1 ? (
                  <div className="rooms-filter-block">
                    <div className="rooms-filter-copy">
                      <div><Building2 /><strong>المباني المعروضة</strong></div>
                      <small>{phoneReadOnly ? "المباني معروضة للقراءة فقط على الهاتف؛ التصفية والتحريك من الكمبيوتر." : matrixBuildings.size ? `اخترت ${matrixBuildings.size.toLocaleString("ar-KW-u-nu-latn")} من ${allBuildings.length.toLocaleString("ar-KW-u-nu-latn")} مبنى — اضغط لإضافة مبنى أو إزالته.` : "كل المباني ظاهرة — اختر مبنى واحدًا أو عدة مبانٍ قبل تصفية القاعات."}</small>
                    </div>
                    <div className="rooms-picker" role="group" aria-label="اختيار مبنى واحد أو عدة مبانٍ">
                      <button
                        type="button"
                        className={`rooms-chip ${matrixBuildings.size ? "" : "on"}`}
                        aria-pressed={matrixBuildings.size === 0}
                        onClick={() => setMatrixBuildings(new Set())}
                      >
                        كل المباني <b className="num">{allBuildings.length}</b>
                      </button>
                      {allBuildings.map(building => (
                        <button
                          type="button"
                          key={building.key}
                          className={`rooms-chip ${matrixBuildings.has(building.key) ? "on" : ""}`}
                          aria-pressed={matrixBuildings.has(building.key)}
                          title={`${matrixBuildings.has(building.key) ? "إخفاء" : "إظهار"} ${building.label}`}
                          onClick={() => setMatrixBuildings(current => {
                            const next = new Set(current);
                            if (next.has(building.key)) next.delete(building.key); else next.add(building.key);
                            return next;
                          })}
                        >
                          <span dir="ltr">{building.label}</span>
                          <b className="num">{building.count}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {buildingScopedRooms.length > 1 ? (
                  <div className="rooms-filter-block">
                    <div className="rooms-filter-copy">
                      <div><MapPin /><strong>القاعات المعروضة</strong></div>
                      <small>{phoneReadOnly ? "القاعات معروضة للقراءة فقط على الهاتف؛ التصفية والتحريك من الكمبيوتر." : matrixRooms.size ? `اخترت ${matrixRooms.size} من ${countOf(buildingScopedRooms.length, AR.room)} — اضغط لإضافة قاعة أو إزالتها.` : matrixBuildings.size ? "كل قاعات المباني المختارة ظاهرة — اختر قاعة واحدة أو مجموعة قاعات للمقارنة." : "كل القاعات ظاهرة — اختر قاعة واحدة أو مجموعة قاعات للمقارنة."}</small>
                    </div>
                    <div className="rooms-picker" role="group" aria-label="اختيار قاعة واحدة أو عدة قاعات">
                      <button
                        type="button"
                        className={`rooms-chip ${matrixRooms.size ? "" : "on"}`}
                        aria-pressed={matrixRooms.size === 0}
                        onClick={() => setMatrixRooms(new Set())}
                      >
                        كل القاعات <b className="num">{buildingScopedRooms.length}</b>
                      </button>
                      {buildingScopedRooms.map(room => (
                        <button
                          type="button"
                          key={room.key}
                          className={`rooms-chip ${matrixRooms.has(room.key) ? "on" : ""}`}
                          aria-pressed={matrixRooms.has(room.key)}
                          title={`${matrixRooms.has(room.key) ? "إخفاء" : "إظهار"} ${room.label}`}
                          onClick={() => setMatrixRooms(current => {
                            const next = new Set(current);
                            if (next.has(room.key)) next.delete(room.key); else next.add(room.key);
                            return next;
                          })}
                        >
                          <span dir="ltr">{room.label}</span>
                          <b className="num">{roomCounts.get(room.key) || 0}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className={`rooms-scale ${matrixDay === "week" ? "rooms-scale-week" : ""}`} aria-hidden="true">
                  {matrixDay === "week" ? <><small>القاعة</small><small>الأيام</small></> : <small />}
                  <div>
                    {hourMarks.slice(0, -1).map(mark => (
                      <span key={mark} style={{ right: `${pct(mark)}%` }} dir="ltr">{Math.floor(mark / 60)}</span>
                    ))}
                  </div>
                </div>
                <div className="rooms-rows">
                  {roomList.map(room => {
                    const compact = compactByRoom.get(room.key) || { items: [], lanes: 1, laneDays: [] };
                    const firstDay = (days.find(day => compact.items.some(item => Boolean((item.row as any)[day.key])))?.key || days[0].key) as DayKey;
                    return matrixDay === "week" ? (
                      <section className="rooms-week-room rooms-compare-room" key={room.key}>
                        <div className="rooms-compare-row">
                          <header className="rooms-compare-room-head">
                            <strong dir="ltr">{room.label}</strong>
                            <small><b className="num">{compact.items.length}</b> محاضرة</small>
                          </header>
                          <div className="rooms-compare-days">
                            {compact.laneDays.map(lane => (
                              <span key={lane.key}>{lane.labels.length ? lane.labels.map(label => <small key={label}>{label}</small>) : <small>بلا يوم</small>}</span>
                            ))}
                          </div>
                          <div
                            className="rooms-track rooms-compact-track"
                            style={{ height: `${Math.max(74, compact.lanes * 68 + 8)}px` }}
                            onDragOver={(e) => e.preventDefault()}
                            data-physics-day-column="true"
                            onDrop={trackDrop(room.building, room.hall, firstDay)}
                          >
                            {/* The landing squares, on the compact track too —
                                this is the layout the week view actually shows,
                                and it was the one left without them. */}
                            {timeSlots.map(slot => (
                              <i
                                key={`slot-${slot}`}
                                className={`rooms-slot ${physicsSlotClass(firstDay as DayKey, slot, `${room.building}|${room.hall}`)}`}
                                data-physics-slot="true"
                                data-physics-day={firstDay}
                                data-physics-start={slot}
                                data-physics-label={room.label}
                                data-physics-room={`${room.building}|${room.hall}`}
                                style={{ right: `${pct(mins(slot))}%`, width: `${(SCHEDULE_SLOT_MINUTES / span) * 100}%` }}
                              />
                            ))}
                            {hourMarks.map(mark => <i key={mark} className={`rooms-hourline ${mark === SCHEDULE_DAY_END ? "rooms-hourline-terminal" : ""}`} style={{ right: `${pct(mark)}%` }} />)}
                            {nowMinutes >= gridWindow.start && nowMinutes <= gridWindow.end ? <i className="rooms-now" style={{ right: `${pct(nowMinutes)}%` }} title={`الآن · ${timeFromMins(nowMinutes)}`}><b dir="ltr">{timeFromMins(nowMinutes)}</b></i> : null}
                            {compact.items.map(item => renderTrackCard(item.row, item))}
                          </div>
                        </div>
                      </section>
                    ) : (
                      <section className="rooms-week-room" key={room.key}>
                        <header className="rooms-week-room-head">
                          <strong dir="ltr">{room.label}</strong>
                          <small><b className="num">{roomCounts.get(room.key) || 0}</b> موعداً أسبوعياً</small>
                        </header>
                        <div className="rooms-week-days">
                          {displayDays.map(day => {
                            const inRoom = rowsFor(day.key as DayKey, room.key);
                            return (
                              <div className="rooms-row" key={`${room.key}|${day.key}`}>
                                <small className="rooms-day-label">{day.label}</small>
                                <div
                                  className="rooms-track"
                                  data-physics-day-column="true"
                                  onDragOver={(e) => e.preventDefault()}
                                  onDrop={trackDrop(room.building, room.hall, day.key as DayKey)}
                                >
                                  {/* The same landing squares the week grid has,
                                      laid along the track instead of down a
                                      column — so the drag engine reads this
                                      board with the identical code, and the
                                      lift, the verdict and the ring are the
                                      same here as they are there. */}
                                  {timeSlots.map(slot => (
                                    <i
                                      key={`slot-${slot}`}
                                      className={`rooms-slot ${physicsSlotClass(day.key as DayKey, slot, `${room.building}|${room.hall}`)}`}
                                      data-physics-slot="true"
                                      data-physics-day={day.key}
                                      data-physics-start={slot}
                                      data-physics-label={`${day.label} · ${room.label}`}
                                      data-physics-room={`${room.building}|${room.hall}`}
                                      style={{ right: `${pct(mins(slot))}%`, width: `${(SCHEDULE_SLOT_MINUTES / span) * 100}%` }}
                                    />
                                  ))}
                                  {hourMarks.map(mark => <i key={mark} className={`rooms-hourline ${mark === SCHEDULE_DAY_END ? "rooms-hourline-terminal" : ""}`} style={{ right: `${pct(mark)}%` }} />)}
                                  {todayKey === day.key && nowMinutes >= gridWindow.start && nowMinutes <= gridWindow.end ? <i className="rooms-now" style={{ right: `${pct(nowMinutes)}%` }} title={`الآن · ${timeFromMins(nowMinutes)}`}><b dir="ltr">{timeFromMins(nowMinutes)}</b></i> : null}
                                  {inRoom.map(row => renderTrackCard(row))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                  {displayDays.some(day => (noRoomByDay.get(day.key as DayKey) || []).length) ? (
                    <section className="rooms-week-room rooms-row-none">
                      <header className="rooms-week-room-head"><strong>بلا قاعة</strong></header>
                      <div className="rooms-week-days">
                        {displayDays.map(day => (
                          <div className="rooms-row" key={`none|${day.key}`}>
                            <small className="rooms-day-label">{day.label}</small>
                            <div className="rooms-track" onDragOver={(e) => e.preventDefault()} onDrop={trackDrop("", "", day.key as DayKey)}>
                              {(noRoomByDay.get(day.key as DayKey) || []).map(renderTrackCard)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {!roomList.length && !displayDays.some(day => (noRoomByDay.get(day.key as DayKey) || []).length) ? (
                    <p className="rooms-empty">لا قاعات مسجلة في هذا النطاق بعد — أسنِد قاعة لأي محاضرة وستظهر هنا صفاً كاملاً.</p>
                  ) : null}
                </div>
              </>
            );
          })()}
        </Surface>
      ) : (
        <>
          <Surface
            /* A scope change keeps the old week on screen while the new one is
               fetched — deliberately, so the board never blinks to empty. But
               «يقرأ الجدول…» in small type was the only sign, and a reader who
               missed it was looking at last term's grid believing it was this
               one. The surface now says so itself: the stale week steps back and
               a light sweeps the top edge until the answer lands. */
            /* No aria-busy here: Surface forwards only className, so the
               attribute would be dropped and the code would merely look like it
               announced something. The screen reader is already served by the
               «يقرأ الجدول…» status line in the filter strip. */
            className={`week-surface ${physicsActive ? "physics-lens-active" : ""} ${picking ? "week-picking" : ""} ${rowsLoading && rows.length ? "week-refreshing" : ""}`}
          >
            {/* One question at a time, asked of the whole week. The controls
                fold away; their answer remains visible on the toolbar button. */}
                {/* The schedule lens UI was removed with its toolbar button; the
                    lens state remains inert (lensActive stays false) so week
                    cards render without any dimming. */}
            <div
              className={`week-note ${physicsActive ? "gravity-note-active" : ""}`}
            >
              <GripVertical aria-hidden="true" />
              <span
                aria-live="polite"
                title={physicsActive && dragComparison
                  ? `قبل: ${dragComparison.before} · بعد: ${dragComparison.after} · القاعة ${dragComparison.place}`
                  : undefined}
              >
                {physicsActive && dragComparison
                  ? `قبل: ${dragComparison.before} ← بعد: ${dragComparison.after} · القاعة ${dragComparison.place}${dragComparison.partyCount > 1 ? ` · قائد مجموعة من ${dragComparison.partyCount} مواعيد` : ""}`
                  : phoneReadOnly
                    ? "على الهاتف يمكنك التعديل والإضافة من «قائمة»، أما عرض الأسبوع فيبقى للقراءة فقط حتى لا يتحول اللمس إلى نقلٍ غير مقصود."
                  : picking
                    ? "النقل الجماعي: اختر المواعيد المطلوبة، ثم اسحب أي واحد منها — تنتقل المجموعة معاً بعد فحص الموانع."
                    : "اسحب الموعد لتنقله كاملًا بأيامه المسجلة · اسحب على عمود فارغ لإنشاء موعد · أو انتقل بـTab إلى محاضرة واضغط مسافة لتحريكها بالأسهم · التراجع متاح بعد كل نقل."}
              </span>
              {(workspaceToolsOpen || picking || multiSelect.size > 0) ? <button
                type="button"
                className={`week-pick-toggle ${picking ? "on" : ""}`}
                onClick={() => { setPicking(v => !v); setMultiSelect(new Set()); }}
                title="اختر أكثر من موعد ثم انقلها كلها بسحبة واحدة"
                aria-pressed={picking}
              >
                <Layers aria-hidden="true" />
                {picking
                  ? (multiSelect.size ? `${countOf(multiSelect.size, AR.appointment)} مختار · اسحب الآن` : "اختر المواعيد من الجدول")
                  : "نقل جماعي"}
              </button> : null}
              {/*
                Note 13: the "منع التعارض مفعّل" badge was removed from the toolbar
                — it is not a user choice, it is an always-on backend guarantee
                (any drop that creates a conflict auto-reverts and is never saved),
                so surfacing it only added noise. The enforcement itself is untouched.
              */}
              {workspaceToolsOpen ? <button
                type="button"
                className="week-pick-toggle"
                onClick={() => setHueBy(v => (v === "course" ? "instructor" : v === "instructor" ? "room" : "course"))}
                title="بدّل معنى اللون: كل مقرر بلون، أو كل أستاذ، أو كل قاعة"
              >
                <Palette aria-hidden="true" />
                {hueBy === "course" ? "التلوين حسب: المقرر" : hueBy === "instructor" ? "التلوين حسب: الأستاذ" : "التلوين حسب: القاعة"}
              </button> : null}
              {/* The texture switch used to live here, beside the other tools.
                  It now sits inside the colour key, where the colours it
                  qualifies are actually being read. */}
              {multiSelect.size ? (
                <button type="button" className="week-pick-clear" onClick={() => setMultiSelect(new Set())}>
                  <X aria-hidden="true" />إلغاء التحديد
                </button>
              ) : null}
            </div>
            {/*
              The key to the colours.

              The grid has always been coloured, but nothing said what a colour
              meant — the reader had to hover a card to learn it. The key names
              every colour on screen, weightiest first, and pressing one hushes
              the rest so a course's whole week stands out at once. The focus is
              its own state: the lens still filters, the x-ray still relates,
              and neither learns anything new from this.

              It is no longer folded inside «المزيد». A key that has to be found
              is not a key, and the reader who needs it most — someone who cannot
              separate these hues by eye — is the least likely to go looking,
              because nothing on screen tells them a colour was ever the point.
              So the key sits with the grid it explains, and carries the texture
              switch itself.
            */}
            {hueLegend.length > 1 ? (
              <div className="week-legend" role="group" aria-label="مفتاح الألوان">
                {/* The alphabet the colours are written in, switched where the
                    colours are actually being read rather than three menus away.
                    Three readings of one week: who teaches it, what is taught,
                    and which hall carries it. */}
                <div className="week-legend-basis" role="group" aria-label="معنى اللون">
                  {([
                    { key: "course", label: "المقررات" },
                    { key: "instructor", label: "الأساتذة" },
                    { key: "room", label: "القاعات" },
                  ] as const).map(basis => (
                    <button
                      key={basis.key}
                      type="button"
                      className={hueBy === basis.key ? "is-on" : ""}
                      aria-pressed={hueBy === basis.key}
                      onClick={() => setHueBy(basis.key)}
                      title={`لوّن الأسبوع حسب ${basis.label}`}
                    >
                      {basis.label}
                    </button>
                  ))}
                  <b className="num">
                    {legendQuery
                      ? `${legendShown.length.toLocaleString("ar-KW-u-nu-latn")}/${hueLegend.length.toLocaleString("ar-KW-u-nu-latn")}`
                      : hueLegend.length.toLocaleString("ar-KW-u-nu-latn")}
                  </b>
                </div>
                {legendSearchable ? (
                  <span className="week-legend-search">
                    <Search aria-hidden="true" />
                    <input
                      type="search"
                      value={legendQuery}
                      onChange={e => setLegendQuery(e.target.value)}
                      placeholder={hueBy === "course" ? "ابحث عن مقرر…" : hueBy === "room" ? "ابحث عن قاعة…" : "ابحث عن أستاذ…"}
                      aria-label="تصفية مفتاح الألوان"
                    />
                  </span>
                ) : null}
                <div className="week-legend-chips">
                  {legendShown.length === 0 ? (
                    <span className="week-legend-none">لا مطابقة</span>
                  ) : null}
                  {legendShown.map(item => {
                    const folded = hueHidden.has(item.key);
                    return (
                      <span
                        className={`week-legend-item ${folded ? "is-folded" : ""}`}
                        key={item.key}
                        style={{ ["--hue" as any]: item.hue, ...textureFor(item.hue) }}
                      >
                        <button
                          type="button"
                          className={`week-legend-chip ${hueFocus.has(item.key) ? "is-on" : ""}`}
                          aria-pressed={hueFocus.has(item.key)}
                          disabled={folded}
                          title={`${item.label} — ${countOf(item.count, AR.appointment)} · اضغط لإبراز حصصه، واضغط غيره لتقارن الاثنين`}
                          onClick={() => toggleHueFocus(item.key)}
                        >
                          <i aria-hidden="true" />
                          <span>{item.label}</span>
                          <em className="num">{item.count.toLocaleString("ar-KW-u-nu-latn")}</em>
                        </button>
                        {/* Folding, kept a separate press from hushing: one asks
                            «where are these?», the other «what is left without
                            them?». Nothing is deleted either way. */}
                        <button
                          type="button"
                          className="week-legend-eye"
                          aria-pressed={folded}
                          aria-label={folded ? `إظهار ${item.label}` : `إخفاء ${item.label} من الشبكة`}
                          title={folded ? `إظهار ${item.label} على الشبكة` : `أخفِ ${item.label} من الشبكة مؤقتاً — لا يُحذف شيء`}
                          onClick={() => toggleHueHidden(item.key)}
                        >
                          {folded ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                        </button>
                      </span>
                    );
                  })}
                </div>
                {hueHidden.size ? (
                  <button
                    type="button"
                    className="week-legend-clear is-folded-clear"
                    onClick={() => setHueHidden(new Set())}
                    title={`${countOf(hueHidden.size, AR.layer)} مطوية — أعدها إلى الشبكة`}
                  >
                    <EyeOff aria-hidden="true" />أعد المطوي
                    <b className="num">{hueHidden.size.toLocaleString("ar-KW-u-nu-latn")}</b>
                  </button>
                ) : null}
                {hueFocus.size ? (
                  <button
                    type="button"
                    className="week-legend-clear"
                    onClick={() => setHueFocus(new Set())}
                    title={`${hueFocus.size} مُبرَز — أعد إظهار الجدول كاملاً`}
                  >
                    <X aria-hidden="true" />عرض الكل
                    {hueFocus.size > 1 ? <b className="num">{hueFocus.size.toLocaleString("ar-KW-u-nu-latn")}</b> : null}
                  </button>
                ) : null}
                {/* The «نقش» texture toggle was removed at the reader's request;
                    the machinery stays inert (colorBlind defaults off) so nothing
                    that reads the flag breaks. */}
              </div>
            ) : null}
            {/*
              The day strip.

              The grid can already fold down to a single full-width day — that
              fold is what makes a phone readable at all — but reaching it meant
              finding the right column header, and moving to the next day meant
              unfolding the whole week and folding it again somewhere else.

              The strip says the five days once, marks today, and carries the
              count each one holds, so choosing a day is a single press from
              anywhere and the fold is visible rather than discovered.
            */}
            <div className="week-daystrip">
              {days.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className="week-daystrip-day"
                  data-today={todayKey === d.key ? "true" : undefined}
                  aria-pressed={expandedDay === d.key}
                  onClick={() => setExpandedDay((current) => (current === d.key ? null : (d.key as DayKey)))}
                  style={{ ["--reading" as any]: `${dayLoad.share[d.key] || 0}%` }}
                  title={`${expandedDay === d.key ? "العودة إلى الأسبوع كاملاً" : `عرض ${d.label} وحده`} · ${Math.round((dayLoad.minutesByDay[d.key] || 0) / 60)} ساعة تدريس`}
                >
                  <span>{d.label}</span>
                  <b title="عدد المواعيد في هذا اليوم">{dayCounts[d.key] || 0}</b>
                </button>
              ))}
              {expandedDay ? (
                <button
                  type="button"
                  className="week-daystrip-all"
                  onClick={() => setExpandedDay(null)}
                  title="عرض الأسبوع كاملاً"
                >
                  <Expand aria-hidden="true" />الأسبوع
                </button>
              ) : null}
            </div>
            {unplaced.length ? (
              <div className="week-unplaced">
                <header>
                  <AlertTriangle aria-hidden="true" />
                  <strong>غير موزّعة</strong>
                  <b>{unplaced.length}</b>
                  <small>مواعيد بلا يوم أو بلا وقت — لا تظهر على الشبكة. اسحب أياً منها إلى خانة لتثبيتها.</small>
                </header>
                <div className="week-unplaced-rows">
                  {unplaced.map(r => {
                    const c = courseById.get(r.AdCourseId);
                    const i = instructorById.get(r.AdInstructorId);
                    const code = c?.CourseCode || "—";
                    const grip = physics.bindEvent(r, "fsunday" as any);
                    return (
                      <article
                        {...grip}
                        key={`unplaced-${r.id}`}
                        className="week-unplaced-card"
                        style={{ ["--hue" as any]: hueFor(code, r.AdCourseName || c?.CourseName || "", i?.AdInstructorName, placeOf(r)) }}
                        onPointerDown={(e) => {
                          pressOrigin.current = { x: e.clientX, y: e.clientY };
                          grip.onPointerDown?.(e);
                        }}
                        onClick={(e) => {
                          const from = pressOrigin.current;
                          if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) return;
                          openEdit(r);
                        }}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") openEdit(r); }}
                      >
                        <strong>{r.AdCourseName || c?.CourseName || code}</strong>
                        <span>{i?.AdInstructorName || "بدون أستاذ"}</span>
                        <em dir="ltr">{code} · {r.SCode}</em>
                        <i>{!days.some(day => Boolean((r as any)[day.key])) ? "بلا يوم" : "بلا وقت"}</i>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {draggingId && ripple && physics.state.phase === "idle" ? (
              <div
                className={`ripple-forecast ${ripple.loading ? "loading" : ""}`}
              >
                <div className="ripple-radar">
                  <Radio />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="ripple-copy">
                  <span>توقع الأثر · المستقبل قبل الإفلات</span>
                  <strong>{ripple.headline}</strong>
                  {ripple.candidate ? (
                    <small>
                      {ripple.candidate.targetDayLabel} ·{" "}
                      <b dir="ltr">
                        {formatScheduleTimeRange(ripple.candidate.start, ripple.candidate.end)}
                      </b>{" "}
                      · {ripple.candidate.roomCode}/{ripple.candidate.roomHall}
                    </small>
                  ) : (
                    <small>مرّر فوق خانة زمنية لبدء المحاكاة.</small>
                  )}
                </div>
                {ripple.effects?.length ? (
                  <div className="ripple-effects">
                    {ripple.effects.map((x: any, i: number) => (
                      <span className={x.tone} key={i}>
                        <Activity />
                        {x.text}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="ripple-pulse">
                    <i />
                    <span>أحلّل…</span>
                  </div>
                )}
              </div>
            ) : null}
            {/*
              A dense week is given more paper, not smaller type.
              Five columns share whatever the window offers, so a day with four
              concurrent lectures squeezed each of them to a strip too narrow
              for a word. When any day is that busy the grid widens instead and
              the surface scrolls — the same trick a printed timetable uses when
              it changes to a larger sheet.
            */}
            <div
              className={`week-calendar ${physicsActive ? "gravity-field-active" : ""}`}
              data-expanded={expandedDay || undefined}
              style={{ ["--week-lane-min" as any]: `${Math.min(212, 118 + Math.max(...days.map(d => weekLayout[d.key]?.busiest || 1)) * 32)}px` }}
            >
              <div className="week-time-head" />
              {days.map((d) => (
                <div
                  className={`week-day-head ${physics.state.target?.day === d.key ? `physics-day-target physics-${physics.state.decision?.quality || "unknown"}` : ""} ${physics.state.target?.day === d.key && physics.state.decision?.stress ? `stress-${physics.state.decision.stress.level}` : ""}`}
                  data-today={todayKey === d.key ? "true" : undefined}
                  style={{ ["--reading" as any]: `${dayLoad.share[d.key] || 0}%` }}
                  key={d.key}
                >
                  <button
                    type="button"
                    className="week-day-toggle"
                    onClick={() => setExpandedDay((current) => (current === d.key ? null : d.key))}
                    title={expandedDay === d.key ? "عرض كل الأيام" : "توسيع هذا اليوم"}
                    aria-pressed={expandedDay === d.key}
                  >
                    <span>{d.label}</span>
                    <b title="عدد المواعيد في هذا اليوم">{dayCounts[d.key] || 0}</b>
                    {(weekLayout[d.key]?.busiest || 1) >= 4 && expandedDay !== d.key ? (
                      <i className="week-dense" title={`${weekLayout[d.key].busiest} محاضرات في نفس الساعة — اضغط لتوسيع اليوم`}>
                        <Expand aria-hidden="true" />
                      </i>
                    ) : null}
                  </button>
                  {physics.state.target?.day === d.key &&
                  physics.state.decision?.stress ? (
                    <small>{physics.state.decision.stress.label}</small>
                  ) : null}
                </div>
              ))}
              <div className="week-times">
                {timeSlots.map((t) => (
                  <span key={t} dir="ltr">
                    {t}
                  </span>
                ))}
                {/* The 20:00 cap is gone: teaching ends by 19:50, so the label
                    only ever marked an empty boundary. The grid still reaches it
                    to hold a lecture that runs to 19:50 — it just isn't announced. */}
              </div>
              {days.map((d) => {
                return (
                  <div
                    className={`week-day ${expandedDay && expandedDay !== d.key ? "week-day-collapsed" : ""}`}
                    data-physics-day-column="true"
                    data-busiest={weekLayout[d.key]?.busiest || 1}
                    data-today={todayKey === d.key ? "true" : undefined}
                    key={d.key}
                  >
                    {hallBarterReservations
                      .filter((reservation) => reservation.status === "approved" && reservation.day === d.key)
                      .map((reservation) => {
                        const start = mins(reservation.startTime), end = mins(reservation.endTime);
                        if (end <= gridWindow.start || start >= gridWindow.end) return null;
                        const borrowing = reservation.requesterCollegeId === filterCollege && reservation.requesterSectionId === filterSection;
                        const top = ((Math.max(start, gridWindow.start) - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H;
                        const height = Math.max(SLOT_H - 4, ((Math.min(end, gridWindow.end) - Math.max(start, gridWindow.start)) / SCHEDULE_SLOT_MINUTES) * SLOT_H - 3);
                        return (
                          <div
                            key={`hall-barter-${reservation.id}-${d.key}`}
                            className={`week-hall-barter ${borrowing ? "borrowed" : "lent"}`}
                            style={{ top, height }}
                            title={`${borrowing ? "نافذة قاعة مستعارة لقسمك" : "نافذة قاعة معارة"} · ${reservation.roomCode}/${reservation.roomHall} · ${formatScheduleTimeRange(reservation.startTime, reservation.endTime)}`}
                            aria-label={`${borrowing ? "قاعة مستعارة" : "قاعة معارة"} ${reservation.roomCode}/${reservation.roomHall} · ${formatScheduleTimeRange(reservation.startTime, reservation.endTime)}`}
                          >
                            <ArrowLeftRight aria-hidden="true" />
                            <strong>{borrowing ? "مستعارة" : "معارة"}</strong>
                            <span dir="ltr">{reservation.roomCode}/{reservation.roomHall}</span>
                            <time dir="ltr">{formatScheduleTimeRange(reservation.startTime, reservation.endTime)}</time>
                          </div>
                        );
                      })}
                    {timeSlots.map((t) => (
                      <div
                        data-physics-slot="true"
                        data-physics-day={d.key}
                        data-physics-start={t}
                        data-physics-label={d.label}
                        className={`week-slot ${ripple?.targetDay === d.key && ripple?.targetStart === t ? "ripple-target" : ""} ${physicsSlotClass(d.key, t)} ${lensRoomActive && !lensRoomBusy.has(`${d.key}|${t}`) ? "room-free" : ""} ${decisionSlot(d.key as DayKey, t) ? `field-${decisionSlot(d.key as DayKey, t)!.tier}` : ""}`}
                        key={t}
                        onDragOver={(e) => e.preventDefault()}
                        role="button"
                        tabIndex={-1}
                        title={
                          slotBlockReason(d.key as DayKey, t) ||
                          (decisionSlot(d.key as DayKey, t)
                            ? `${d.label} ${t} — ${decisionSlot(d.key as DayKey, t)!.why}`
                            : `إضافة موعد · ${d.label} ${t}`)
                        }
                        onPointerDown={(e) => {
                          // Only a press on the empty square itself; a press that
                          // landed on a lecture belongs to that lecture.
                          if (e.target !== e.currentTarget || e.button !== 0) return;
                          paintRef.current = { day: d.key as DayKey, anchor: mins(t) };
                          setPaint({ day: d.key as DayKey, from: t, to: timeFromMins(mins(t) + SCHEDULE_SLOT_MINUTES) });
                        }}
                        onPointerEnter={() => {
                          const stroke = paintRef.current;
                          if (!stroke || stroke.day !== d.key) return;
                          const here = mins(t);
                          setPaint({
                            day: d.key as DayKey,
                            from: timeFromMins(Math.min(stroke.anchor, here)),
                            to: timeFromMins(Math.max(stroke.anchor, here) + SCHEDULE_SLOT_MINUTES),
                          });
                        }}
                        onDragEnter={() => {
                          const row = rows.find((r) => r.id === draggingId);
                          if (row) previewRipple(row, d.key, t);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = Number(
                            e.dataTransfer.getData("text/schedule-id") ||
                              draggingId,
                          );
                          const row = rows.find((r) => r.id === id);
                          if (row) {
                            const sourceDay = (days.find(day => Boolean(row[day.key]))?.key || d.key) as DayKey;
                            if (!(sourceDay === d.key && row.fstarttime === t)) {
                              void commitMove({ row, sourceDay: sourceDay as any, target: { day: d.key as any, start: t, label: d.label }, decision: null });
                            }
                          }
                          window.setTimeout(clearRipple, 0);
                        }}
                      />
                    ))}
                    {/* Where the keyboard is pointing: a ghost in the target
                        square, carrying the same verdict the drag would show. */}
                    {keyMove && keyMove.day === d.key && keyMoveRow ? (
                      <div
                        className={`week-keymove-target tier-${keyMoveReading?.tier || "fair"}`}
                        style={{
                          top: ((mins(keyMove.start) - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H,
                          height: Math.max(
                            SLOT_H - 4,
                            ((mins(keyMoveRow.fendtime) - mins(keyMoveRow.fstarttime)) / SCHEDULE_SLOT_MINUTES) * SLOT_H - 3,
                          ),
                        }}
                        aria-hidden="true"
                      >
                        <b dir="ltr">{keyMove.start}</b>
                        <span>{keyMoveReading?.tier === "blocked" ? "غير متاح" : keyMoveReading?.tier === "excellent" ? "ممتاز" : keyMoveReading?.tier === "good" ? "جيد" : "ممكن بتنازل"}</span>
                      </div>
                    ) : null}
                    {paint && paint.day === d.key ? (
                      <div
                        className="week-paint"
                        style={{
                          top: ((mins(paint.from) - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H,
                          height: Math.max(SLOT_H - 4, ((mins(paint.to) - mins(paint.from)) / SCHEDULE_SLOT_MINUTES) * SLOT_H - 3),
                        }}
                        aria-hidden="true"
                      >
                        <b dir="ltr">{formatScheduleTimeRange(paint.from, paint.to)}</b>
                        <span>موعد جديد</span>
                      </div>
                    ) : null}
                    {/* Today's column carries the hour it actually is. Positioned by the
                        same arithmetic as every card above it, and deliberately free of
                        pointer handlers — a stray one here would land on the cards and
                        take the drag with it.
                        It also asks WHICH term is on screen. «الآن» drawn across a term
                        that finished in 2019 is not a clock, it is a false statement
                        about a schedule nobody is teaching; and a line that means "this
                        minute" has no business on a sheet of paper. */}
                    {todayKey === d.key &&
                    termIsRunning &&
                    nowMinutes >= gridWindow.start &&
                    nowMinutes <= gridWindow.end ? (
                      <div
                        className="week-now no-print"
                        style={{ top: ((nowMinutes - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H }}
                        aria-hidden="true"
                      >
                        <span><time>{timeFromMins(nowMinutes)}</time></span>
                      </div>
                    ) : null}
                    {experience.ghostEnabled
                      ? experience.ghostRows
                          .filter((r) => Boolean(r[d.key]))
                          .map((r) => {
                            const top =
                                ((mins(r.fstarttime) - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H,
                              height = Math.max(
                                SLOT_H - 4,
                                ((mins(r.fendtime) - mins(r.fstarttime)) / SCHEDULE_SLOT_MINUTES) *
                                  SLOT_H -
                                  3,
                              ),
                              c = courseById.get(r.AdCourseId),
                              i = instructorById.get(r.AdInstructorId);
                            return (
                              <article
                                className={`week-event ghost-semester-event ${experience.ghostClass(r)}`}
                                key={`ghost-${d.key}-${r.id}`}
                                style={{ top, height }}
                                title={`الفصل السابق · ${r.AdCourseName || c?.CourseName || "مقرر"}`}
                                aria-hidden="true"
                              >
                                <History />
                                <strong>
                                  {c?.CourseCode || r.AdCourseName}
                                </strong>
                                <span>{r.AdCourseName || c?.CourseName}</span>
                                <small dir="ltr">
                                  {formatScheduleTimeRange(r.fstarttime, r.fendtime)}
                                </small>
                                <small>
                                  {i?.AdInstructorName} · {r.AdRoomCode}/
                                  {r.AdRoomHall}
                                </small>
                              </article>
                            );
                          })
                      : null}
                    {moveTraces
                      .filter((trace) => trace.dayKey === d.key)
                      .map((trace) => (
                        <div
                          key={`trace-${trace.key}`}
                          className="week-move-trace"
                          style={{ top: trace.top, height: trace.height }}
                          aria-hidden="true"
                        >
                          <span><CornerUpRight aria-hidden="true" />نُقل من هنا</span>
                        </div>
                      ))}
                    {(weekLayout[d.key]?.spine || []).map((placed) => {
                      const c = courseById.get(placed.row.AdCourseId);
                      const railInstructor = instructorById.get(placed.row.AdInstructorId);
                      const code = c?.CourseCode || "—";
                      const grip = physics.bindEvent(placed.row, d.key);
                      return (
                        <article
                          {...grip}
                          key={`rail-${d.key}-${placed.row.id}`}
                          className={`week-rail ${lensClass(placed.row)} ${xrayClass(placed.row)} ${justChangedId === placed.row.id ? "just-changed" : ""}`}
                          style={{
                            top: placed.top,
                            height: placed.height,
                            insetInlineEnd: `${(placed.spine || 0) * RAIL + 4}px`,
                            ["--hue" as any]: courseHue(code, placed.row.AdCourseName || c?.CourseName || ""),
                          }}
                          onPointerDown={(e) => { pressOrigin.current = { x: e.clientX, y: e.clientY }; grip.onPointerDown?.(e); }}
                          onClick={(e) => {
                            if (physics.didDrag() || physicsActive) return;
                            const from = pressOrigin.current;
                            if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return;
                            if (picking) { toggleSelect(placed.row.id); return; }
                            openEdit(placed.row);
                          }}
                          onPointerEnter={(e) => { if (!physicsActive) openPeek(placed.row, e.currentTarget); }}
                          onPointerLeave={() => setPeek(current => (current?.row.id === placed.row.id ? null : current))}
                          tabIndex={0}
                          onKeyDown={(e) => { if (e.key === "Enter") openEdit(placed.row); }}
                        >
                          <b>{courseLabel(placed.row.AdCourseName || c?.CourseName || code, 0.4).text}</b>
                          <span>{railInstructor?.AdInstructorName ? firstLast(railInstructor.AdInstructorName) : "بدون أستاذ"}</span>
                          <time dir="ltr">{placed.row.fstarttime}</time>
                        </article>
                      );
                    })}
                    {(weekLayout[d.key]?.items || [])
                      .filter((placed) => expandedDay === d.key || !weekBundles.bundled[d.key]?.has(placed.row.id))
                      .map((placed) =>
                        renderWeekCard(placed.row, d, {
                          top: placed.top,
                          height: placed.height,
                          ...(expandedDay === d.key
                            ? {}
                            : laneStyle(placed, (weekLayout[d.key]?.spine || []).reduce((max, x) => Math.max(max, (x.spine || 0) + 1), 0))),
                        }, placed.span / placed.lanes),
                      )}
                    {expandedDay === d.key ? null : (weekBundles.byDay[d.key] || []).map((bundle) => {
                      const hits = lensActive ? bundle.rows.filter(lensMatches).length : bundle.rows.length;
                      const openFan = (anchor: HTMLElement) => {
                        const host = (anchor.closest(".week-bundle") as HTMLElement) || anchor;
                        const rect = host.getBoundingClientRect();
                        setFanned(current => current?.key === bundle.key
                          ? null
                          : { key: bundle.key, x: rect.left + rect.width / 2, y: rect.top });
                      };
                      // A flagged lecture folded into a weave was invisible — so
                      // "أظهرها على الجدول" and the radar seemed to do nothing.
                      // The band now lights when it holds any flagged row, and
                      // fans itself open so the highlighted card is actually seen.
                      const flaggedHere = bundle.rows.filter(r => reviewFocus.has(r.id));
                      return (
                        <div
                          className={`week-bundle ${lensActive && !hits ? "lens-miss" : ""} ${flaggedHere.length ? "bundle-flagged" : ""}`}
                          key={bundle.key}
                          style={{ top: bundle.top, height: bundle.height }}
                          role="group"
                          aria-label={`${countOf(bundle.rows.length, AR.lecture)} متزامنة${flaggedHere.length ? ` · ${flaggedHere.length} مميّزة` : ""}`}
                        >
                          <button
                            type="button"
                            className="week-bundle-head"
                            aria-expanded={fanned?.key === bundle.key}
                            title="فرد الساعة في مروحة"
                            onClick={(e) => openFan(e.currentTarget)}
                          >
                            {(() => {
                              /* "18 معاً" was a lie when the true simultaneous
                                 peak was 9 — the count is the cluster, the
                                 peak is the wall. Say both when they differ. */
                              const peak = peakConcurrency(bundle.rows.map(r => ({ start: mins(r.fstarttime), end: mins(r.fendtime) })));
                              return peak && peak < bundle.rows.length
                                ? <><b className="num">{bundle.rows.length}</b> موعداً · ذروة <b className="num">{peak}</b> معاً</>
                                : <><b className="num">{bundle.rows.length}</b> معاً</>;
                            })()}
                            {lensActive && hits > 0 && hits < bundle.rows.length ? (
                              <i className="week-bundle-hits">{hits} مطابقة</i>
                            ) : null}
                            <time dir="ltr">{formatScheduleTimeRange(bundle.from, bundle.to)}</time>
                            <Expand aria-hidden="true" />
                          </button>
                          <div
                            className="week-bundle-bands"
                            data-dense={(bundle.height - 22) / bundle.rows.length < 15 ? "true" : undefined}
                            /* Below fourteen pixels a band cannot print a name at
                               any size, so it stops trying and becomes a stripe.
                               Measured: twenty in one hour gave 7px bands. */
                            data-crush={(bundle.height - 22) / bundle.rows.length < 14 ? "true" : undefined}
                            data-count={bundle.rows.length}
                          >
                            {bundle.rows.map((row) => {
                              const course = courseById.get(row.AdCourseId);
                              const bandInstructor = instructorById.get(row.AdInstructorId);
                              const courseCode = String(course?.CourseCode || "").trim() || "—";
                              const bandCode = courseCode || row.AdCourseName || "—";
                              const rawBandTitle = row.AdCourseName || course?.CourseName || bandCode;
                              const bandTitle = courseLabel(
                                rawBandTitle,
                                bundle.rows.length >= 8 ? 0.36 : bundle.rows.length >= 6 ? 0.44 : bundle.rows.length >= 5 ? 0.52 : 0.62,
                              ).text;
                              const bandWho = bandInstructor?.AdInstructorName
                                ? firstLast(bandInstructor.AdInstructorName)
                                : "بدون أستاذ";
                              /* The slice is the lecture's real handle: the same grip the
                                 full card carries, so a drag starts here exactly as it
                                 would there — lift, conflicts, verdict, drop. A press
                                 that stays put opens the fan instead. */
                              const grip = physics.bindEvent(row, d.key);
                              return (
                                <div
                                  {...grip}
                                  key={row.id}
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`${rawBandTitle} · ${bandWho} · ${courseCode} — اسحبها أو افتح المروحة`}
                                  data-row-id={row.id}
                                  className={`week-bundle-band ${lensActive && !lensMatches(row) ? "lens-miss" : ""} ${hueFocusClass(row)}`}
                                  style={(() => {
                                    const bandHue = hueFor(bandCode, bandTitle, instructorById.get(row.AdInstructorId)?.AdInstructorName, placeOf(row));
                                    return { ["--hue" as any]: bandHue, ...textureFor(bandHue) };
                                  })()}
                                  title={`${rawBandTitle} · ${bandWho} — اسحبها مباشرة أو اضغط للمروحة`}
                                  onPointerDown={(e) => {
                                    pressOrigin.current = { x: e.clientX, y: e.clientY };
                                    grip.onPointerDown?.(e);
                                  }}
                                  onClick={(e) => {
                                    if (physics.didDrag() || physicsActive) return;
                                    const from = pressOrigin.current;
                                    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return;
                                    openFan(e.currentTarget);
                                  }}
                                  onPointerEnter={(ev) => { if (!physicsActive) openPeek(row, ev.currentTarget as unknown as HTMLElement); }}
                                  onPointerLeave={() => setPeek(current => (current?.row.id === row.id ? null : current))}
                                >
                                  <span className="week-band-identity">
                                    <strong>{bandTitle}</strong>
                                    <small>{bandWho}</small>
                                  </span>
                                  <em dir="ltr">{courseCode}</em>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </Surface>
          {fanned ? (() => {
            const bundle = days.flatMap(day => weekBundles.byDay[day.key] || []).find(b => b.key === fanned.key);
            if (!bundle) return null;
            const dayKey = fanned.key.split(":")[0] as DayKey;
            const day = days.find(x => x.key === dayKey);
            if (!day) return null;
            const panelLeft = Math.max(12, Math.min(fanned.x - 160, window.innerWidth - 336));
            const panelTop = Math.max(66, Math.min(fanned.y - 8, window.innerHeight - 440));
            /* The crowd profile: sweep the bundle's own span into buckets and count
               how many lectures are live in each. It draws the real wall — a nine
               that all lands at noon spikes; a nine spread across the morning stays
               flat. Pure read of the rows already in hand; touches no scheduling
               state, so it can never move a lecture. */
            const crowdSpans = bundle.rows
              .map(r => ({ s: mins(r.fstarttime), e: mins(r.fendtime) }))
              .filter(x => Number.isFinite(x.s) && Number.isFinite(x.e) && x.e > x.s);
            const crowdLo = crowdSpans.length ? Math.min(...crowdSpans.map(x => x.s)) : 0;
            const crowdHi = crowdSpans.length ? Math.max(...crowdSpans.map(x => x.e)) : 0;
            const CROWD_BUCKETS = 32;
            const crowd = crowdHi > crowdLo
              ? Array.from({ length: CROWD_BUCKETS }, (_, k) => {
                  const t = crowdLo + ((crowdHi - crowdLo) * (k + 0.5)) / CROWD_BUCKETS;
                  return crowdSpans.filter(x => x.s <= t && t < x.e).length;
                })
              : [];
            const crowdPeak = crowd.reduce((m, v) => Math.max(m, v), 1);
            /* When the wall stands. The first bucket that reaches the peak, read
               back as a clock time — so the strip says not just «how many» but
               «at what hour», which is the number a coordinator acts on. */
            const crowdPeakAt = (() => {
              if (crowd.length < 2 || crowdPeak < 2) return "";
              const k = crowd.indexOf(crowdPeak);
              if (k < 0) return "";
              const t = crowdLo + ((crowdHi - crowdLo) * (k + 0.5)) / CROWD_BUCKETS;
              const h = Math.floor(t / 60), m = Math.round(t % 60);
              return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            })();
            return (
              <>
                <div className="week-fan-backdrop" onClick={() => setFanned(null)} />
                <div
                  className="week-fan"
                  role="dialog"
                  aria-label={`المحاضرات المتزامنة يوم ${day.label}`}
                  style={{ left: panelLeft, top: panelTop }}
                >
                  <header>
                    <b>{bundle.rows.length} محاضرات معاً · {day.label}</b>
                    <time dir="ltr">{formatScheduleTimeRange(bundle.from, bundle.to)}</time>
                    <button type="button" onClick={() => setFanned(null)} aria-label="إغلاق المروحة"><X aria-hidden="true" /></button>
                  </header>
                  {crowd.length > 1 ? (
                    <div className="fan-crowd" role="img" aria-label={`أعلى تزامن ${crowdPeak} محاضرات في وقت واحد`}>
                      <span className="fan-crowd-cap">
                        التزامن عبر الساعة
                        {crowdPeakAt ? <i className="fan-crowd-at">الذروة <time dir="ltr">{crowdPeakAt}</time></i> : null}
                        <b className="num">{crowdPeak}</b>
                      </span>
                      <div className="fan-crowd-bars">
                        {crowd.map((v, k) => (
                          <i
                            key={k}
                            data-peak={v === crowdPeak && crowdPeak > 1 ? "true" : undefined}
                            style={{
                              ["--h" as any]: `${Math.max(8, Math.round((v / crowdPeak) * 100))}%`,
                              ["--lit" as any]: (0.35 + 0.65 * (v / crowdPeak)).toFixed(3),
                              ["--i" as any]: k,
                            }}
                          />
                        ))}
                      </div>
                      {/* The axis rides the same flex track as the bars — one slot
                          per bucket — so the caret under the wall is aligned by
                          construction, in either writing direction, with no maths. */}
                      <div className="fan-crowd-axis" aria-hidden="true">
                        {crowd.map((v, k) => (
                          <i key={k} data-peak={v === crowdPeak && crowdPeak > 1 ? "true" : undefined} />
                        ))}
                      </div>
                      <div className="fan-crowd-scale" aria-hidden="true">
                        <time dir="ltr">{bundle.from}</time>
                        <time dir="ltr">{bundle.to}</time>
                      </div>
                    </div>
                  ) : null}
                  <p>اسحب أي بطاقة من هنا إلى الشبكة مباشرة — المروحة تبقى مفتوحة حتى يهبط النقل.</p>
                  <div className="week-fan-cards">
                    {bundle.rows.map((row, index) => (
                      <div className="week-fan-slot" style={{ ["--i" as any]: index }} key={row.id}>
                        {renderWeekCard(row, day, {
                          position: "relative",
                          top: "auto",
                          insetInline: "auto",
                          width: "100%",
                          /* The fan is a scrollable list, not the grid: a card is
                             free to be as tall as its own name and instructor need.
                             A fixed height clipped Arabic descenders from below and
                             tripped the height container-query that hid the time. */
                          minHeight: 58,
                        }, 1)}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })() : null}
          {peek ? (
            <WeekPeek
              anchor={{ x: peek.x, y: peek.y }}
              title={peek.row.AdCourseName || courseById.get(peek.row.AdCourseId)?.CourseName || "مقرر"}
              who={`${instructorById.get(peek.row.AdInstructorId)?.AdInstructorName || "بدون أستاذ"}${visitingIds.has(peek.row.AdInstructorId) ? " · منتدب" : ""}`}
              code={courseById.get(peek.row.AdCourseId)?.CourseCode || "—"}
              section={String(peek.row.SCode || "—")}
              days={arabicDays(peek.row)}
              from={peek.row.fstarttime}
              to={peek.row.fendtime}
              room={[peek.row.AdRoomCode, peek.row.AdRoomHall].filter(Boolean).join("/")}
              hue={hueFor(
                courseById.get(peek.row.AdCourseId)?.CourseCode || peek.row.AdCourseName || "—",
                peek.row.AdCourseName || courseById.get(peek.row.AdCourseId)?.CourseName || "",
                instructorById.get(peek.row.AdInstructorId)?.AdInstructorName,
                placeOf(peek.row),
              )}
            />
          ) : null}
          {quick ? (
            <QuickCreatePopover
              seed={quick}
              courses={quickCourses}
              instructors={instructors}
              buildings={buildingOptions}
              hallsFor={hallsOf}
              conflictOf={quickConflict}
              saving={saving}
              error={quickError}
              onCancel={() => { setQuick(null); setQuickError(null); }}
              onExpand={expandQuick}
              onCreate={createQuick}
            />
          ) : null}
          <SchedulePhysicsLayer
            state={physics.state}
            overlayRef={physics.overlayRef}
            course={
              physics.state.row
                ? courseById.get(physics.state.row.AdCourseId)
                : undefined
            }
            instructor={
              physics.state.row
                ? instructorById.get(physics.state.row.AdInstructorId)
                : undefined
            }
            isPowerAdmin={isPowerAdmin}
          />
        </>
      )}
      {/*
        The dock.

        The toolbar sits at the top of a page that scrolls, and the week is
        taller than any window — so by the time a reader is looking at Thursday
        afternoon, every control that could act on it is a scroll away. The four
        things a hand reaches for constantly (change the view, find a name, jump
        to today, add an appointment) therefore ride with the reader instead,
        near the thumb on a phone and out of the way of the grid on a desk.

        It adds no power of its own: every button here is the same call the
        toolbar already makes, so nothing new can be done from it and nothing
        can drift out of step. It stands down for the cinema view, which is a
        room the audience is not meant to be steering.
      */}
      {!dockSuppressed ? (
        <nav className="schedule-dock no-print" aria-label="أدوات الجدول السريعة">
          <div className="dock-views" role="group" aria-label="طريقة العرض">
            <button
              type="button" className={viewMode === "list" ? "on" : ""} aria-pressed={viewMode === "list"}
              onClick={() => changeView("list")} title="عرض القائمة" aria-label="عرض القائمة"
            ><LayoutList aria-hidden="true" /></button>
            {!phoneReadOnly ? (<>
              <button
                type="button" className={viewMode === "week" ? "on" : ""} aria-pressed={viewMode === "week"}
                onClick={() => changeView("week")} title="عرض الأسبوع" aria-label="عرض الأسبوع"
              ><CalendarDays aria-hidden="true" /></button>
              <button
                type="button" className={viewMode === "rooms" ? "on" : ""} aria-pressed={viewMode === "rooms"}
                onClick={() => changeView("rooms")} title="عرض القاعات" aria-label="عرض القاعات"
              ><MapPin aria-hidden="true" /></button>
            </>) : null}
          </div>
          <span className="dock-split" aria-hidden="true" />
          <button
            type="button"
            className={`dock-act ${quickSearch ? "on" : ""}`}
            onClick={() => {
              searchRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
              searchRef.current?.focus();
            }}
            title="بحث سريع في المواعيد"
            aria-label="بحث سريع في المواعيد"
          ><Search aria-hidden="true" /></button>
          {!phoneReadOnly ? (
            <button
              type="button"
              className={`dock-act ${expandedDay && expandedDay === todayKey ? "on" : ""}`}
              onClick={() => {
                if (viewMode !== "week") changeView("week");
                setExpandedDay(current => (current === todayKey ? null : (todayKey as DayKey)));
              }}
              title={todayKey ? "اعرض يوم اليوم وحده" : "اليوم خارج أيام الدراسة"}
              aria-label="اليوم"
              disabled={!todayKey}
            ><Focus aria-hidden="true" /></button>
          ) : null}
          <button
            type="button"
            className="dock-add"
            onClick={() => openCreate()}
            title="إضافة موعد جديد"
          ><Plus aria-hidden="true" /><span>موعد</span></button>
        </nav>
      ) : null}
      {/* The keyboard move's only voice: a polite live region, and a single
          quiet strip while a lecture is held. Nothing permanent is added to the
          screen for a mode that is not running. */}
      <span className="sr-only" role="status" aria-live="polite">{keyMoveSay}</span>
      {keyMove && keyMoveRow ? (
        <div className={`keymove-bar no-print tier-${keyMoveReading?.tier || "fair"}`} role="status">
          <strong>{keyMoveRow.AdCourseName || courseById.get(keyMoveRow.AdCourseId)?.CourseName || "الموعد"}</strong>
          <span dir="ltr">{days.find(d => d.key === keyMove.day)?.label} · {keyMove.start}</span>
          <em>{keyMoveReading?.why || ""}</em>
          <span className="keymove-keys"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> تحريك · <kbd>Enter</kbd> تنفيذ · <kbd>Esc</kbd> إلغاء</span>
        </div>
      ) : null}
      {/*
        Two versions, one decision, no default.

        Overwriting silently is what this exists to prevent, so the sheet never
        picks for the reader: it shows the row as it now stands in the database
        beside what they were about to write, and offers to keep theirs (which
        re-sends on top of the current revision) or to take the newer one.
      */}
      {/* The chain, whole, before anything is written. */}
      {repair ? (
        <div className="views-dialog-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) setRepair(null); }}>
          <div className="views-dialog repair-sheet" role="dialog" aria-modal="true" aria-label="سلسلة إصلاح مقترحة">
            <header>
              <strong>{repairReason || "سلسلة إصلاح مقترحة"}</strong>
              <button type="button" onClick={() => setRepair(null)} aria-label="إغلاق"><X aria-hidden="true" /></button>
            </header>
            <div className="repair-cost">
              <span><b>{repair.moves.length.toLocaleString("ar-KW-u-nu-latn")}</b> حركات</span>
              <span><b>{repair.before.toLocaleString("ar-KW-u-nu-latn")} ← {repair.after.toLocaleString("ar-KW-u-nu-latn")}</b> تداخل</span>
              <span><b>{repair.instructorsAffected.toLocaleString("ar-KW-u-nu-latn")}</b> أساتذة متأثرون</span>
              <span><b>{repair.roomsAffected.toLocaleString("ar-KW-u-nu-latn")}</b> قاعات</span>
            </div>
            <ol className="repair-steps">
              {repair.moves.map((move, index) => (
                <li key={move.id}>
                  <span className="repair-index">{index + 1}</span>
                  <div>
                    <strong>{move.before.AdCourseName || courseById.get(move.before.AdCourseId)?.CourseName || `موعد ${move.id}`}</strong>
                    <em>{move.because}</em>
                    <span className="repair-line">
                      <bdi>{arabicDays(move.before) || "بلا يوم"} · {move.before.fstarttime}</bdi>
                      {" ← "}
                      <bdi>{days.find(d => d.key === move.day)?.label} · {move.start} · {move.roomCode}/{move.roomHall}</bdi>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <p className="repair-note">لن يُكتب شيء حتى تضغط التنفيذ، وتُنفَّذ السلسلة كاملة أو لا تُنفَّذ.</p>
            <footer>
              <button type="button" className="views-dialog-cancel" onClick={() => setRepair(null)}>تجاهل</button>
              <button type="button" className="views-dialog-save" disabled={saving} onClick={() => void applyRepair()}>
                {saving ? "أنفّذ…" : "نفّذ السلسلة"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
      {driftSheet}
      {inboxTray}
      {clash ? (
        <div className="views-dialog-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) setClash(null); }}>
          <div className="views-dialog clash-sheet" role="dialog" aria-modal="true" aria-label="تغيّر هذا الموعد أثناء عملك">
            <header>
              <strong>تغيّر هذا الموعد أثناء عملك</strong>
              <button type="button" onClick={() => setClash(null)} aria-label="إغلاق"><X aria-hidden="true" /></button>
            </header>
            <p className="clash-note">
              حفظ زميل تعديلاً على هذا الموعد بعد أن فتحته. لم يُكتب شيء فوق عمله — اختر ما يبقى.
            </p>
            <div className="clash-sides">
              <section>
                <span>النسخة الحالية في الجدول</span>
                <strong>{clash.current.AdCourseName || courseById.get(clash.current.AdCourseId)?.CourseName || "الموعد"}</strong>
                <em>{arabicDays(clash.current) || "بلا أيام"}</em>
                <b dir="ltr">{formatScheduleTimeRange(clash.current.fstarttime, clash.current.fendtime)}</b>
                <i dir="ltr">{[clash.current.AdRoomCode, clash.current.AdRoomHall].filter(Boolean).join("/") || "—"}</i>
              </section>
              {clash.yours ? (
                <section className="clash-yours">
                  <span>نسختك</span>
                  <strong>{courseById.get(clash.yours.AdCourseId)?.CourseName || "الموعد"}</strong>
                  <em>{arabicDays(clash.yours) || "بلا أيام"}</em>
                  <b dir="ltr">{formatScheduleTimeRange(clash.yours.fstarttime, clash.yours.fendtime)}</b>
                  <i dir="ltr">{[clash.yours.AdRoomCode, clash.yours.AdRoomHall].filter(Boolean).join("/") || "—"}</i>
                </section>
              ) : null}
            </div>
            <footer>
              <button
                type="button"
                className="views-dialog-cancel"
                onClick={() => {
                  // Take the newer one: put it on the board and open it, so the
                  // reader sees what they are now editing.
                  setRows(current => current.map(row => (row.id === clash.current.id ? clash.current : row)));
                  setClash(null);
                  openEdit(clash.current);
                }}
              >
                خذ النسخة الأحدث
              </button>
              {clash.yours ? (
                <button
                  type="button"
                  className="views-dialog-save"
                  onClick={() => {
                    // Keep mine: the form re-opens on top of the current
                    // revision, so the next save is a deliberate overwrite.
                    setRows(current => current.map(row => (row.id === clash.current.id ? clash.current : row)));
                    setClash(null);
                    setForm(prev => ({ ...prev, ...clash.yours, rev: clash.current.rev } as any));
                    setMessage("أُبقيت نسختك — راجعها ثم احفظ مرة أخرى.");
                  }}
                >
                  أبقِ نسختي
                </button>
              ) : null}
            </footer>
          </div>
        </div>
      ) : null}
      {paletteOpen ? (
        <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />
      ) : null}
      {viewDialog ? (
        <SaveViewDialog
          title={viewDialog.mode === "rename" ? "إعادة تسمية العرض" : "حفظ العرض الحالي"}
          initial={viewDialog.view?.name || ""}
          onCancel={() => setViewDialog(null)}
          onSave={name => {
            if (viewDialog.mode === "rename" && viewDialog.view) {
              viewsStore.rename(viewDialog.view.id, name);
              setSavedViews(viewsStore.list());
            } else {
              saveCurrentView(name);
            }
            setViewDialog(null);
          }}
        />
      ) : null}
      {/* The keys, listed only when asked for — and only the ones that exist. */}
      {shortcutsOpen ? (
        <div className="views-dialog-backdrop no-print" onMouseDown={event => { if (event.target === event.currentTarget) setShortcutsOpen(false); }}>
          <div className="views-dialog shortcuts-sheet" role="dialog" aria-modal="true" aria-label="اختصارات لوحة المفاتيح">
            <header>
              <strong>اختصارات لوحة المفاتيح</strong>
              <button type="button" onClick={() => setShortcutsOpen(false)} aria-label="إغلاق"><X aria-hidden="true" /></button>
            </header>
            <dl className="shortcuts-list">
              <div><dt><kbd>Ctrl</kbd><kbd>K</kbd></dt><dd>لوحة الأوامر</dd></div>
              <div><dt><kbd>/</kbd></dt><dd>البحث السريع</dd></div>
              <div><dt><kbd>Ctrl</kbd><kbd>Z</kbd></dt><dd>التراجع عن آخر تغيير</dd></div>
              <div><dt><kbd>Tab</kbd></dt><dd>التنقّل بين المحاضرات على الشبكة</dd></div>
              <div><dt><kbd>Space</kbd></dt><dd>التقاط المحاضرة المحددة لنقلها بالأسهم</dd></div>
              <div><dt><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></dt><dd>تحريك المحاضرة الملتقَطة</dd></div>
              <div><dt><kbd>Enter</kbd></dt><dd>تنفيذ النقل</dd></div>
              <div><dt><kbd>Esc</kbd></dt><dd>إلغاء النقل · إغلاق ما هو مفتوح</dd></div>
              <div><dt><kbd>?</kbd></dt><dd>هذه القائمة</dd></div>
            </dl>
            <p className="shortcuts-note">تعمل الاختصارات خارج حقول الكتابة فقط، ولا تعمل أثناء السحب.</p>
          </div>
        </div>
      ) : null}
      {undoAction ? (
        <div className="undo-bar no-print" role="status">
          <History aria-hidden="true" />
          <span>{undoAction.label}</span>
          <button type="button" onClick={() => void runUndoEntry(undoAction)} disabled={Boolean(undoBusy)}>
            {undoBusy === undoAction.id ? "يتراجع…" : "تراجع"}
          </button>
          <button type="button" className="undo-dismiss" onClick={() => setUndoBarId(null)} aria-label="إخفاء"><X /></button>
        </div>
      ) : null}
      {/*
        The bar leaves after a few seconds; the day does not. Everything undoable
        since this morning sits behind one quiet button, newest first, each line
        saying what it was and at what time — so a mistake found three saves
        later is still a mistake that can be taken back.
      */}
      {!undoAction && pendingUndo.length ? (
        <button
          type="button"
          className="undo-log-open no-print"
          onClick={() => setUndoLogOpen(true)}
          title="سجل تغييرات اليوم"
        >
          <History aria-hidden="true" />
          {logNamed ? null : <span>سجل اليوم</span>}
          <b>{pendingUndo.length}</b>
        </button>
      ) : null}
      {undoLogOpen ? (
        <div className="undo-log-sheet no-print" role="dialog" aria-modal="true" aria-label="سجل تغييرات اليوم">
          <div className="undo-log-backdrop" onClick={() => setUndoLogOpen(false)} />
          <div className="undo-log-panel">
            <header>
              <History aria-hidden="true" />
              <strong>سجل تغييرات اليوم</strong>
              <button type="button" className="undo-dismiss" onClick={() => setUndoLogOpen(false)} aria-label="إغلاق"><X /></button>
            </header>
            {undoLog.length ? (
              <ul>
                {undoLog.map(entry => {
                  // The course and the teacher behind the change, pulled from the
                  // affected row (or the step's own body for a re-create), and
                  // set in a whisper-light line beneath the action.
                  const step = entry.steps[0] as any;
                  const idMatch = String(step?.url || "").match(/\/api\/schedules\/(\d+)/);
                  const affected = idMatch ? rows.find(r => r.id === Number(idMatch[1])) : null;
                  const courseId = Number(step?.body?.AdCourseId || affected?.AdCourseId || 0);
                  const instrId = Number(step?.body?.AdInstructorId || affected?.AdInstructorId || 0);
                  const courseName = courseById.get(courseId)?.CourseName || affected?.AdCourseName || "";
                  const whoName = instructorById.get(instrId)?.AdInstructorName || "";
                  return (
                  <li key={entry.id} className={entry.usedAt ? "used" : ""}>
                    {/* One column of words, one column of action. The teacher's
                        name belongs INSIDE this block, under the label it
                        describes — as a sibling it became a third column and
                        sat beside the sentence instead of beneath it. */}
                    <div className="undo-log-line">
                      <span className="undo-log-label">{entry.label}</span>
                    {/*
                       The label already names the course — «نُقل ورشة انتاج
                       وسائل تعليمية خاصة» — so repeating it underneath said the
                       same words twice, and the truncated label made the pair
                       look like two different lectures. The quiet line beneath
                       is for what the label does NOT say: who teaches it. If
                       that is unknown, there is nothing to add and no line.
                    */}
                      <span className="undo-log-when">
                        <time dateTime={new Date(entry.at).toISOString()}>{undoClock(entry.at)}</time>
                        {whoName ? <em>{whoName}</em> : null}
                      </span>
                    </div>
                    {entry.usedAt ? (
                      <span className="undo-log-done">تُراجع عنه {undoClock(entry.usedAt)}</span>
                    ) : (
                      <button type="button" onClick={() => void runUndoEntry(entry)} disabled={Boolean(undoBusy)}>
                        {undoBusy === entry.id ? "يتراجع…" : "تراجع"}
                      </button>
                    )}
                  </li>
                  );
                })}
              </ul>
            ) : (
              <p className="undo-log-empty">لم يُسجَّل أي تغيير اليوم.</p>
            )}
            <footer>يُمسح السجل تلقائياً مع بداية يوم جديد.</footer>
          </div>
        </div>
      ) : null}
      {transferOpen ? (
        <ScheduleTransfer
          collegeId={filterCollege}
          sectionId={filterSection}
          termId={filterTerm}
          instructors={instructors as any}
          departmentIds={departmentInstructorIds}
          terms={terms as any}
          canTransfer={isPowerAdmin}
          onChanged={() => { void loadRows(); }}
          onClose={() => setTransferOpen(false)}
        />
      ) : null}
      {reviewOpen ? (
        <ScheduleReview
          rows={filteredRows}
          courses={courseById}
          instructors={instructorById}
          previousRows={previousTermRows}
          nature={nature}
          scopeLine={[
            terms.find((t) => t.AdTermId === filterTerm)?.AdTermName,
            colleges.find((c) => c.AdCollegeId === filterCollege)?.AdCollegeName,
            sections.find((x) => x.AdSectionId === filterSection)?.AdSectionName,
          ].filter(Boolean).join(" · ")}
          onClose={() => setReviewOpen(false)}
          onFocusRows={(ids) => {
            // Bring the flagged appointments to the surface using the lens the
            // week grid already has, rather than inventing a second highlight.
            setViewMode("week");
            setQuickSearch("");
            setReviewFocus(new Set(ids));
          }}
        />
      ) : null}
      {/* The week is a wide document; it is printed on a wide page, in the same
          hand as every other sheet the program produces. */}
      {!reviewOpen ? (
        <PrintPortal>
          <div className="schedule-print print-report print-wide">
        <PrintLetterhead
          title="الجدول الدراسي"
          scope={[
            terms.find((t) => t.AdTermId === filterTerm)?.AdTermName,
            colleges.find((c) => c.AdCollegeId === filterCollege)?.AdCollegeName,
            sections.find((s) => s.AdSectionId === filterSection)?.AdSectionName,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <table>
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "26%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "17%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "14%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>م</th>
              <th>المقرر</th>
              <th>الشعبة</th>
              <th>الأستاذ</th>
              <th>الأيام</th>
              <th>الوقت</th>
              <th>المبنى/القاعة</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((s, i) => (
              <tr key={s.id}>
                <td>{i + 1}</td>
                <td className="print-wrap">
                  {courseById.get(s.AdCourseId)?.CourseCode} — {s.AdCourseName}
                </td>
                <td className="print-ltr">{s.SCode}</td>
                <td className="print-wrap">
                  {instructorById.get(s.AdInstructorId)?.AdInstructorName}
                </td>
                <td className="print-days">
                  {days.filter(d => Boolean((s as any)[d.key])).map((d, index) => (
                    <React.Fragment key={d.key}>{index ? " · " : null}<bdi>{d.label}</bdi></React.Fragment>
                  ))}
                </td>
                <td className="print-ltr">
                  {formatScheduleTimeRange(s.fstarttime, s.fendtime)}
                </td>
                <td className="print-ltr">
                  {s.AdRoomCode}/{s.AdRoomHall}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </PrintPortal>
      ) : null}
      {contextLoading ? (
        <div className="context-loading">
          <span />
        </div>
      ) : null}
      {context ? (
        <div
          className="schedule-context-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setContext(null);
          }}
        >
          <aside className="schedule-context">
            <div className="context-actions">
              <div className="context-nav" role="group" aria-label="التنقل بين مواعيد اليوم">
                <button
                  type="button"
                  aria-label="الموعد السابق في اليوم"
                  title="السابق"
                  disabled={!previousContextRow}
                  onClick={() => { if (previousContextRow) void openContext(previousContextRow); }}
                >
                  <ChevronRight />
                </button>
                <button
                  type="button"
                  aria-label="الموعد التالي في اليوم"
                  title="التالي"
                  disabled={!nextContextRow}
                  onClick={() => { if (nextContextRow) void openContext(nextContextRow); }}
                >
                  <ChevronLeft />
                </button>
              </div>
              <div className="context-actions-main">
                <button
                  type="button"
                  className="btn btn-secondary context-edit"
                  onClick={() => { const row = context.selected; setContext(null); openEdit(row); }}
                >
                  <Edit2 /> تعديل
                </button>
                <button
                  className="drawer-close"
                  type="button"
                  aria-label="إغلاق سياق الموعد"
                  title="إغلاق"
                  onClick={() => setContext(null)}
                >
                  <X />
                </button>
              </div>
            </div>
            <div className="context-title">
              <span>
                <BrainCircuit />
              </span>
              <div>
                <small>الجدول يفهم نفسه</small>
                <h2>
                  {context.selected.AdCourseName} · شعبة{" "}
                  {context.selected.SCode}
                </h2>
                <p>
                  {context.instructor?.AdInstructorName} ·{" "}
                  {context.selected.AdRoomCode}/{context.selected.AdRoomHall}
                </p>
              </div>
            </div>
            {isPowerAdmin ? (
              <button
                type="button"
                className="decision-replay-trigger"
                onClick={() => void loadReplay(context.selected)}
                disabled={replayLoading}
              >
                <History />
                {replayLoading
                  ? "أعيد بناء تشريح القرار…"
                  : "كيف وصل القرار إلى هذا الشكل؟"}
              </button>
            ) : null}
            {replay ? (
              <div className="decision-replay">
                <div className="replay-head">
                  <div>
                    <span>تشريح القرار</span>
                    <strong>لماذا استقر هنا ومتى تغيّر</strong>
                  </div>
                  <button
                    type="button"
                    aria-label="إغلاق تشريح القرار"
                    title="إغلاق تشريح القرار"
                    onClick={() => setReplay(null)}
                  >
                    <X />
                  </button>
                </div>
                {/*
                  The story of one appointment, drawn as a spine.
                  Even when there is nothing to tell, the shape says so honestly:
                  a single mark at the beginning of a line that has not moved is a
                  clearer statement than a paragraph explaining what the log does
                  not contain.
                */}
                {replay.events?.length ? (
                  <ol className="replay-spine">
                    {replay.events.map((event: any, i: number) => (
                      <li className={event.tone || "neutral"} key={`${event.timestamp}-${i}`}>
                        <span className="replay-dot" aria-hidden="true" />
                        <div className="replay-body">
                          <strong>{event.title}</strong>
                          <p>{event.detail}</p>
                          {/* ليش انتقل — مُستخرج من نسخة ذلك اليوم، لا مكتوب بيد أحد.
                              ولهذا يحمل مصدره: القارئ يجب أن يعرف أن هذا استنتاج
                              مُثبَت من الأرشيف، لا جملة كتبها موظف. */}
                          {event.why ? (
                            <p className="replay-why">
                              <HelpCircle aria-hidden="true" />
                              <span>
                                {event.why}
                                {event.whySource ? <em>{event.whySource}</em> : null}
                              </span>
                            </p>
                          ) : null}
                          <div className="replay-meta">
                            <time dateTime={event.timestamp}>
                              {new Date(event.timestamp).toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long", year: "numeric" })}
                            </time>
                            {event.actor ? <em>{event.actor}</em> : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="replay-still">
                    <span className="replay-still-line" aria-hidden="true">
                      <i /><b />
                    </span>
                    <div>
                      <strong>لم يتحرك هذا الموعد منذ تسجيله</strong>
                      <p>
                        السجل التشغيلي يبدأ من تفعيل هذه الطبقة، ولا يخترع أحداثاً أقدم منها.
                        أي تعديل من الآن سيظهر هنا خطوةً خطوة.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {context.conflicts?.length ? (
              <div className="context-conflicts">
                <AlertTriangle />
                <div>
                  <strong>{context.conflicts.length} علاقة تحتاج انتباه</strong>
                  <span>
                    تعارضات الأستاذ/القاعة محسوبة حتى مع الحجوزات خارج القسم، مع
                    إخفاء التفاصيل غير المصرح بها.
                  </span>
                </div>
              </div>
            ) : (
              <div className="context-clear">
                <CheckCircle2 /> لا يوجد تعارض ظاهر لهذا الموعد.
              </div>
            )}
            <div className="context-relations">
              <article>
                <span>
                  <UsersRound />
                </span>
                <div>
                  <strong>الأستاذ</strong>
                  <b>{context.related.professor.length}</b>
                  <small>موعد ظاهر في الفصل</small>
                </div>
              </article>
              <article>
                <span>
                  <CalendarDays />
                </span>
                <div>
                  <strong>المقرر</strong>
                  <b>{context.related.course.length}</b>
                  <small>شعبة/موعد مرتبط</small>
                </div>
              </article>
              <article>
                <span>
                  <Table2 />
                </span>
                <div>
                  <strong>القاعة</strong>
                  <b>{context.related.room.length}</b>
                  <small>حجز ظاهر ضمن صلاحياتك</small>
                </div>
              </article>
              <article
                className={
                  context.conflicts?.length ? "impact-warn" : "impact-good"
                }
              >
                <span>
                  <Sparkles />
                </span>
                <div>
                  <strong>أثر الجودة</strong>
                  <b>{context.conflicts?.length ? "مراجعة" : "مستقر"}</b>
                  <small>
                    {context.conflicts?.length
                      ? "البديل الآمن يحسن القرار"
                      : "لا يوجد أثر سلبي ظاهر"}
                  </small>
                </div>
              </article>
            </div>
            <div className="context-schedules">
              <h3>السياق المرتبط</h3>
              {context.related.professor.slice(0, 6).map((r: any) => (
                <article key={r.id}>
                  <strong>
                    {r.AdCourseName} · {r.SCode}
                  </strong>
                  <span>{arabicDays(r)}</span>
                  <small dir="ltr">
                    {formatScheduleTimeRange(r.fstarttime, r.fendtime)}
                  </small>
                </article>
              ))}
            </div>
            {contextSolutions.length ? (
              <div className="context-alternatives">
                <h3>أفضل البدائل الآن</h3>
                <div>
                  {contextSolutions.map((x: any) => (
                    <button
                      type="button"
                      key={`${x.start}-${x.roomCode}-${x.roomHall}`}
                      onClick={() => {
                        const row = context.selected as FSchedule;
                        openEdit({
                          ...row,
                          fstarttime: x.start,
                          fendtime: x.end,
                          AdRoomCode: x.roomCode,
                          AdRoomHall: x.roomHall,
                        });
                        setContext(null);
                      }}
                    >
                      <span className="solver-rank">{x.rank}</span>
                      <div>
                        <strong dir="ltr">
                          {formatScheduleTimeRange(x.start, x.end)}
                        </strong>
                        <small>
                          مبنى {x.roomCode} · قاعة {x.roomHall}
                        </small>
                      </div>
                      {x.conflicts ? <Badge tone="warning">{x.label}</Badge> : null}
                    </button>
                  ))}
                </div>
                <p>
                  اختيار البديل يفتح نموذج التعديل معبأً فقط؛ لن يُحفظ شيء قبل
                  ضغط «موافق».
                </p>
              </div>
            ) : null}
            {/* ── ذاكرة القسم ────────────────────────────────────────────
                What ten years say about this particular appointment — its
                course, its teacher, its hall, its hour. The block does not
                exist unless history had something worth saying, which for most
                appointments it does not. The surprising ones are marked; the
                merely-true ones never reach here at all. */}
            {context.memory?.length ? (
              <div className="context-memory">
                <div className="context-memory-head">
                  <History aria-hidden="true" />
                  <span>ذاكرة القسم</span>
                  <small>{countOf(context.memoryTerms || 0, AR.term)}</small>
                </div>
                <ul>
                  {context.memory.map((item: any, index: number) => (
                    <li key={index} className={item.surprising ? "memory-surprise" : ""}>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="context-comments">
              <div className="context-comments-head">
                <div>
                  <MessageSquareText />
                  <span>
                    <strong>ملاحظات الفريق</strong>
                    <small>مرتبطة بهذا الموعد فقط</small>
                  </span>
                </div>
              </div>
              <div className="comment-compose">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="مثلاً: بانتظار موافقة رئيس القسم"
                  maxLength={600}
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={!commentText.trim()}
                >
                  إضافة
                </button>
              </div>
              <div className="comment-list">
                {context.comments?.length ? (
                  context.comments.map((c: any) => (
                    <button
                      type="button"
                      key={c.id}
                      className={c.resolved ? "resolved" : ""}
                      onClick={() => resolveComment(c)}
                    >
                      <span>
                        {c.resolved ? <CheckCircle2 /> : <MessageSquareText />}
                      </span>
                      <div>
                        <strong>{c.text}</strong>
                        <small>
                          {c.userName} ·{" "}
                          {new Date(c.createdAt).toLocaleString("ar-KW-u-nu-latn")}
                        </small>
                      </div>
                    </button>
                  ))
                ) : (
                  <p>لا ملاحظات</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
