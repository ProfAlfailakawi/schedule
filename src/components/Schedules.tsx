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
  GraduationCap,
  List as ListIcon,
  Move,
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
  Upload,
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
  ShieldAlert,
  Search,
  ShieldCheck,
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
  visualConfirm,
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
import DaySubstitute from "./DaySubstitute";
import MeetingSlots from "./MeetingSlots";
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
import { byArabic, byRoom, byRoomLabel, byRoomPart, sortByName } from "../utils/sorting";
import { isTermClosed, previousYearSameTermName, sameTermName, sortTermsNewest } from "../utils/termSequence";
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
import { adviseDayPattern, DECISION_1912_LABEL, expectedMinutesForDay, isDecision1912Finding, patternsForHours, patternsForHoursOnDay, reviewSchedule, type DayKey as RegDayKey, type WeeklyPattern } from "../utils/scheduleRegulations";
import { fastConflictScan, findConflicts } from "../utils/scheduleIntelligence";
import { findRepairChain, type RepairChain } from "../utils/repairChain";
import type { CourseNature } from "../utils/courseNature";
import { courseLabel, instructorLabel } from "../utils/courseLabel";
import { AR, countOf } from "../utils/arabicCount";
import { createPresenceClient, createPresencePainter, presenceHue, type PresencePeer } from "./schedulePresence";
import { claimWarmStart } from "../utils/warmStart";
import { pickHistoricalDayModel, type HistoricalTimeModel } from "../utils/advancedIntelligence";
import { setTelemetryScope, telemetryApi, telemetryBreadcrumb, telemetryError, telemetryGuide, telemetryOffline, telemetryTiming } from "../utils/clientTelemetry";
import { canQueueScheduleMutation, enqueueScheduleMutation, flushOfflineScheduleQueue, offlineQueueCount, queuedPseudoResponse, setOfflineQueueOwner, subscribeOfflineQueue } from "../utils/offlineScheduleQueue";
import { GUIDE_ACTIONS, allAllowedGuideFeatures, canRunGuideAction, featureById, loadGuideProfile, masteryScore, recordFeatureEvent, evaluateGuideFriction, classifyGuideReason, ensureGuideJourney, advanceGuideJourney, completeGuideJourney, failGuideJourney, type GuideCommand } from "../guide/smartGuide";
/* The same six hues the stylesheet paints from, so a chip and the ring it
   refers to are the same colour. Red is absent on purpose: it belongs to
   conflicts, and a colleague is not one. */
const PRESENCE_HUES = [200, 262, 38, 96, 288, 178];
/* Rooms are read as an address, not as a word: building first, hall second,
   and each compared by its number — «7/31» before «8/22», «9» before «10». */
const byRoomIdentity = (a: { building?: string; hall?: string; label?: string }, b: { building?: string; hall?: string; label?: string }) =>
  byRoom(a.building || a.label || "", a.hall || "", b.building || b.label || "", b.hall || "") ||
  byRoomLabel(a.label || "", b.label || "");
import { buildWeekDensityPlan, courseHue, dayLoad as computeDayLoad, firstLast, patternForDay, peakConcurrency, pickLive, readableWeekDayWidth, readableWeekStripHourWidth, shouldUseWeekStrips } from "../utils/weekVisual";
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
  permissions?: number[];
  onNavigate?: (view:string) => void;
}
type EditorMode = "index" | "create" | "edit";
type CreateSeed = { day?: DayKey; start?: string; end?: string; roomCode?: string; roomHall?: string };
type DecisionFingerprint = { summary: string; before: string; after: string; place: string; quality: string; count: number; when: number };
/**
 * Run this after the thing the reader is actually waiting for.
 *
 * Opening a department fires six reads at once, and only one of them draws the
 * timetable: the other five are advisory — how each course is taught, the
 * department's start rhythm, settled drift, the instructors' inbox. They are
 * useful and none of them is on screen in the first moment, yet they left the
 * browser at the same instant as the board and competed with it for the network
 * and for the server's attention.
 *
 * So they wait for an idle moment. The timeout is the promise that "idle" never
 * means "never" on a busy screen, and the returned canceller keeps the effect's
 * cleanup honest.
 */
function whenIdle(run: () => void, timeout = 1500): () => void {
  const w = window as any;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(run, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(run, 180);
  return () => window.clearTimeout(id);
}

/**
 * ── ذاكرة الفصول التي رآها القارئ في هذه الجلسة ─────────────────────────────
 *
 * Switching terms used to pay the network on every switch — including a switch
 * BACK to a term the reader was looking at two seconds earlier. The rows were
 * gone the moment the scope changed, so the board could only wait.
 *
 * This shelf keeps the last boards seen this session, keyed by reader and
 * scope. A switch to a shelved scope paints it instantly — no skeleton, no
 * wait — while the network read still fires exactly as before and silently
 * replaces the shelf copy when it lands. The reader sees their board at the
 * speed of a render; the truth still arrives at the speed of the wire.
 *
 * Why this cannot show a colleague's stale board for long, and cannot corrupt
 * anything even if it did: every entry is at most minutes old and is
 * revalidated the instant it is shown; the server refuses any write built on
 * an out-of-date row (`rev` optimistic concurrency); and the live channel
 * already announces every write to every open board. The shelf changes what
 * the reader WAITS for, never what the system believes.
 *
 * Module-level on purpose — it must survive leaving the schedule screen and
 * coming back. Capped LRU so an afternoon of browsing thirty terms holds the
 * dozen that matter and quietly forgets the rest.
 */
type ShelvedBoard = {
  rows: FSchedule[];
  instructors: AdInstructor[] | null;
  courses: AdCourse[] | null;
  visitingIds: number[] | null;
  at: number;
};
const boardShelf = new Map<string, ShelvedBoard>();
const BOARD_SHELF_CAP = 12;
const shelveBoard = (key: string, board: ShelvedBoard) => {
  boardShelf.delete(key);
  boardShelf.set(key, board);
  if (boardShelf.size > BOARD_SHELF_CAP) {
    const oldest = boardShelf.keys().next().value as string | undefined;
    if (oldest) boardShelf.delete(oldest);
  }
};

const AGENDA_PAGE_SIZE = 60;

/* Hidden for now, deliberately not deleted. The data model/endpoints stay in
   place so team notes can be restored later without rebuilding the feature. */
const TEAM_NOTES_ENABLED = false;

/* «بديل اليوم» — one-day cancel/cover exceptions. Complete and working, held
   back until the department chooses to run day-level exceptions. Its sheet,
   its four server routes and the calendar's EXDATE support all stay in place;
   flipping this to `true` is the whole of switching it on. */
const DAY_SUBSTITUTE_ENABLED = false;

const SHORT_LECTURE_DAYS = new Set<DayKey>(["fsunday", "ftuesday", "fthursday"]);
const LONG_LECTURE_DAYS = new Set<DayKey>(["fmonday", "fwednesday"]);
const SHORT_LECTURE_MINUTES = 50;
const LONG_LECTURE_MINUTES = 80;

/**
 * Local timetable convention: Sun/Tue/Thu start on :00, Mon/Wed on :30.
 * It is guidance only — never a blocker. A coordinator may deliberately place
 * a lecture elsewhere, but the screen must say that the move departed from the
 * department's normal rhythm.
 */
const scheduleStartConventionNote = (row: Partial<FSchedule>): string | null => {
  const start = String(row.fstarttime || "").trim();
  const match = start.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const minute = Number(match[2]);
  const active = days.filter(day => Boolean((row as any)[day.key])).map(day => day.key as DayKey);
  if (!active.length) return null;
  const hasShortLectureDays = active.some(day => SHORT_LECTURE_DAYS.has(day));
  const hasLongLectureDays = active.some(day => LONG_LECTURE_DAYS.has(day));
  if (hasShortLectureDays && hasLongLectureDays) {
    return "ملاحظة التوقيت: الأيام المختارة تجمع نمطين زمنيين مختلفين. راجع سجل المقرر قبل تثبيت الوقت.";
  }
  const end = String(row.fendtime || "").trim();
  const endMatch = end.match(/^(\d{1,2}):(\d{2})$/);
  if (endMatch) {
    const startMinutes = Number(match[1]) * 60 + minute;
    const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2]);
    const duration = endMinutes - startMinutes;
    const expected = hasLongLectureDays ? LONG_LECTURE_MINUTES : SHORT_LECTURE_MINUTES;
    if (duration > 0 && duration !== expected) {
      return `ملاحظة التوقيت: المدة المعتادة لهذا النمط ${expected} دقيقة، بينما المدة المدخلة ${duration} دقيقة. تنبيه فقط — راجع سجل المقرر إن كان له نمط تاريخي مختلف.`;
    }
  }
  return null;
};


const normalizeArabicDigits = (value: string) => String(value || "")
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));

const displayClockCompact = (value: string) => scheduleClockForDisplay(value);

const formatTermLabel = (value: number) => {
  const count = Number(value || 0);
  if (!count) return "—";
  if (count === 1) return "فصل واحد";
  if (count === 2) return "فصلان";
  if (count <= 10) return `فصول ${count}`;
  return `فصلًا ${count}`;
};

const formatChangeLabel = (value: number) => {
  const count = Number(value || 0);
  if (!count) return "بلا تغيّر";
  if (count === 1) return "تغيّر واحد";
  if (count === 2) return "تغيّران";
  if (count <= 10) return `${count} تغيّرات`;
  return `${count} تغيّرًا`;
};

const formatLifeSummary = (terms: number, changes?: number | null) => {
  const parts = [formatTermLabel(terms)];
  if (changes !== undefined && changes !== null) parts.push(formatChangeLabel(Number(changes || 0)));
  return parts.filter(Boolean).join(" · ");
};

const isolateLtrText = (value: string) => `\u2066${String(value || "")}\u2069`;

type RegulationMetric = { kind: "minutes" | "meetings"; usual: number; current: number; delta: number; unit: string };
const parseRegulationMetric = (value: string): RegulationMetric | null => {
  const text = normalizeArabicDigits(String(value || ""));
  let match = text.match(/المعتاد\s+(\d+)\s+دقيقة[^\d]*[^\d]+(?:وهذا|والحالي|وهذه)\s+(\d+)/);
  if (match) {
    const usual = Number(match[1]);
    const current = Number(match[2]);
    if (Number.isFinite(usual) && Number.isFinite(current)) {
      return { kind: "minutes", usual, current, delta: current - usual, unit: "د" };
    }
  }
  match = text.match(/المعتاد\s+(\d+)\s+لقاءات[^\d]*[^\d]+(?:وهذا|والحالي|وهذه)\s+(\d+)/);
  if (match) {
    const usual = Number(match[1]);
    const current = Number(match[2]);
    if (Number.isFinite(usual) && Number.isFinite(current)) {
      return { kind: "meetings", usual, current, delta: current - usual, unit: "لقاءات" };
    }
  }
  return null;
};

type DepartmentStartRhythm = HistoricalTimeModel;

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
const SLOT_H = 56;

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

const displayRoomBadge = (room: { hall?: string; building?: string; label?: string }) => room.hall || room.building || room.label || "—";

const sameRoom = (
  left: { AdRoomCode?: unknown; AdRoomHall?: unknown },
  right: { AdRoomCode?: unknown; AdRoomHall?: unknown },
) => {
  const a = roomIdentity(left.AdRoomCode, left.AdRoomHall);
  const b = roomIdentity(right.AdRoomCode, right.AdRoomHall);
  return Boolean(a.buildingKey || a.hallKey) && a.key === b.key;
};

const physicsRoomKey = (room?: { code?: unknown; hall?: unknown } | null) =>
  room ? roomIdentity(room.code, room.hall).key : undefined;

const placementFieldKey = (day: DayKey, start: string, roomKey?: string) =>
  roomKey === undefined ? `${day}:${start}` : `${day}:${start}:${roomKey}`;

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
 * The hover card, and why it owns its own state.
 *
 * Pointing at a lecture used to set state on the schedule screen itself. That
 * screen renders every card on the board, so brushing the pointer across a week
 * re-ran the whole board once per card the pointer touched — measured at 50–80ms
 * a hover on a term with 126 appointments, and it grows with the term. The
 * *recomputation* had already been memoised away; what remained was React
 * re-rendering several hundred cards to produce byte-identical output, purely so
 * a tooltip could move.
 *
 * The tooltip now keeps its own state behind an imperative handle. A card calls
 * `open`/`close` through a ref that never changes identity, so the board is not
 * re-rendered at all — only this component is. Everything the card shows is
 * still derived from live data, through `describe`, at the moment it is shown.
 */
export type WeekPeekHandle = {
  open(row: FSchedule, element: HTMLElement | null): void;
  close(rowId: number): void;
};

type PeekDescription = React.ComponentProps<typeof WeekPeek>;

const WeekPeekLayer = React.forwardRef<
  WeekPeekHandle,
  { describe: (row: FSchedule) => Omit<PeekDescription, "anchor"> }
>(function WeekPeekLayer({ describe }, ref) {
  const [peek, setPeek] = useState<{ row: FSchedule; x: number; y: number } | null>(null);
  React.useImperativeHandle(ref, () => ({
    open(row, element) {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setPeek({ row, x: rect.left + rect.width / 2, y: rect.top });
    },
    close(rowId) {
      setPeek(current => (current?.row.id === rowId ? null : current));
    },
  }), []);
  if (!peek) return null;
  return <WeekPeek anchor={{ x: peek.x, y: peek.y }} {...describe(peek.row)} />;
});

/**
 * One lecture card, and the reason it is wrapped instead of rewritten.
 *
 * A board render used to rebuild every card: one keystroke in the quick search
 * cost 808 card renders on a 117-card term, and every square a dragged card
 * crossed cost another full set. The cards themselves had not changed — React
 * was rebuilding identical trees so that one of them could gain a class.
 *
 * `renderWeekCardBody` is therefore left exactly as it was, markup and all, and
 * only wrapped: this boundary re-runs it when — and only when — the card's
 * signature changes. The comparator looks at nothing else, so the drawing
 * closure may be stale; `weekCardSignature` is what makes that safe, and it is
 * written to include every value the body reads, visual or behavioural. When in
 * doubt a value belongs IN the signature: an over-full signature only costs a
 * render, while a missing one shows a stale card.
 */
const WeekCardBoundary = React.memo(
  function WeekCardBoundary({ draw }: { sig: string; draw: () => React.ReactElement }) {
    return draw();
  },
  (previous, next) => previous.sig === next.sig,
);

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

type RefusalReason = { kind: "room" | "instructor" | "cohort" | "other"; text: string; entity: string; state: string };

/**
 * One sentence of refusal, reduced to the fact it carries.
 *
 * The server says "القاعة B7/F31 مشغولة في نفس الوقت". The icon beside the line
 * already says "hall", so the words are noise and the code is the whole point.
 * Both refusal paths - the one the drag decides locally and the one the save
 * returns - run through here, so a wall reads the same however it was found.
 *
 * Soft notes are dropped on the way in. The server already refuses to block on
 * them, but they travelled in the same array, so an advisory could be the only
 * line under «تعذّر النقل» — a move to another hour answered with "this hall
 * has not been used for four terms", which is a remark about the past and not
 * a wall at all. An advisory belongs beside a move that succeeded, never in
 * place of one.
 */
/**
 * The only three things that may STOP a move: a room, an instructor, or a
 * cohort already booked at that time. Everything else the system knows — how
 * often a hall has been used, how a department usually behaves, how the day
 * looks afterwards — is a remark, and a remark never refuses anything.
 *
 * This is one predicate rather than a filter repeated per call site, because
 * an advisory that leaks into any one of them becomes «تعذّر النقل: هذه القاعة
 * لم تُستعمل منذ ٤ فصول» — a fact about the past standing in the way of the
 * present.
 */
export const isBlockingConflict = (item: any): boolean => {
  if (!item) return false;
  if (item.soft === true) return false;
  if (item.type === "memory" || item.type === "advice" || item.type === "regulation") return false;
  /* The user's law, and the server's own save gate, in one line: a real
     double-booking of a TIME, a ROOM or an INSTRUCTOR arrives as severity
     "high"; a duplicate row is data integrity. Everything else the system
     knows — cohort overlap, doorway walking time, hall history, day rhythm —
     is a remark beside a move that succeeded, never a wall in front of it. */
  return item.severity === "high" || item.type === "duplicate";
};

const condenseRefusalReasons = (items: Array<{ message?: string; detail?: string; type?: string; soft?: boolean; severity?: string }>): RefusalReason[] =>
  (items || []).filter(isBlockingConflict).slice(0, 3).map((item): RefusalReason => {
    const message = String(item?.message || "").replace(/[،,]/g, " ").replace(/\s+/g, " ").trim();
    const detail = String(item?.detail || "").replace(/\s+/g, " ").trim();
    const kind: RefusalReason["kind"] =
      item?.type === "room" || /قاعة|القاعة/.test(message) ? "room"
        : item?.type === "instructor" || /أستاذ|الأستاذ|هيئة|^د\./.test(message) ? "instructor"
          : item?.type === "cohort" || /طلاب|الطلاب|شعبة/.test(message) ? "cohort"
            : "other";

    /* The wall has a name, and it sits in one of two places: inside the message
       when the server names it ("القاعة B7/F31 مشغولة"), or in the detail when
       the message is only a state ("الأستاذ مرتبط بموعد آخر" + "مقدمة في
       تكنولوجيا · 10:00"). Reading both is what keeps the line short; stitching
       them and trimming the result is what made it long and truncated. */
    const named =
      /* A hall code carries a digit or a slash. Without that guard the capture
         happily takes the next word, and "القاعة محجوزة" names the hall
         "محجوزة". */
      message.match(/(?:^|\s)القاعة\s+(\S*[\d/]\S*)/)?.[1]
      || message.match(/(?:^|\s)(?:الأستاذ|أ\.|د\.)\s*(.+?)\s+(?:لديه|مرتبط|مشغول|محجوز)/)?.[1]
      || "";
    /* The detail leads with the other lecture's name and follows it with time
       and place after a separator. The name alone is the useful half. */
    const fromDetail = detail.split("·")[0].replace(/\s*[-—]\s*$/, "").trim();
    const entity = (named || fromDetail || message).trim();

    const state = kind === "room" ? "القاعة مشغولة"
      : kind === "instructor" ? "الأستاذ مشغول"
        : kind === "cohort" ? "تعارض طلاب"
          : "";
    /* Never print the state twice: if the name we found IS the message, the chip
       would only echo the line beside it. */
    const echo = !entity || entity === message || (state && entity.includes(state));
    return { kind, text: [message, detail].filter(Boolean).join(" — "),
      entity: echo ? message || detail : entity, state: echo ? "" : state };
  });

export default function Schedules({ mode, user, scopes = [], permissions = [], onNavigate }: Props) {
  const prefsKey = `schedule-workspace-prefs-${user?.SystemUserId || 0}`;
  const lastSavedRef = useRef<any>(null);
  /** Where a press began, so a drag is never mistaken for a tap. */
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  // The row touched by the last write, so the grid can say "this one just
  // changed" for a few seconds instead of leaving the user to hunt for it.
  const [justChangedId, setJustChangedId] = useState<number | null>(null);
  /** A busy hall stays inspectable: availability is guidance, not a dead disabled button. */
  const [hallBusyPreview, setHallBusyPreview] = useState<string | null>(null);
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
    [moveTraces, setMoveTraces] = useState<Array<{ key: string; dayKey: DayKey; top: number; height: number; label: string; roomKey: string; roomBuilding: string; roomHall: string; roomBuildingKey: string; roomHallKey: string; roomLabel: string; from: number; to: number }>>([]),
    /* Which day the rooms matrix is reading, and which rooms are pinned. */
    [matrixDay, setMatrixDay] = useState<DayKey | "week">("week"),
    [matrixBuildings, setMatrixBuildings] = useState<Set<string>>(new Set()),
    [matrixRooms, setMatrixRooms] = useState<Set<string>>(new Set()),
    [roomFilterQuery, setRoomFilterQuery] = useState(""),
    [viewMode, setViewMode] = useState(
      isPhoneDevice() ? "list" : savedPrefs.viewMode === "week" ? "week" : savedPrefs.viewMode === "rooms" ? "rooms" : "list",
    ),
    [conflicts, setConflicts] = useState<any[]>([]),
    [checking, setChecking] = useState(false),
    [solutions, setSolutions] = useState<any[]>([]),
    [solving, setSolving] = useState(false),
    [focusMode, setFocusMode] = useState(false),
    [focusExitPending, setFocusExitPending] = useState(false),
    [presentationMode, setPresentationMode] = useState(false),
    [context, setContext] = useState<any>(null),
    [contextTab, setContextTab] = useState<"overview" | "analysis" | "context">("overview"),
    [contextLoading, setContextLoading] = useState(false),
    [contextSolutions, setContextSolutions] = useState<any[]>([]),
    [commentText, setCommentText] = useState(""),
    [xrayId, setXrayId] = useState<number | null>(null),
    [draggingId, setDraggingId] = useState<number | null>(null),
    [ripple, setRipple] = useState<any>(null),
    [replay, setReplay] = useState<any>(null),
    [replayLoading, setReplayLoading] = useState(false),
    [quickSearch, setQuickSearch] = useState("");
  const [decisionEditQueue, setDecisionEditQueue] = useState<{ ids: number[]; index: number } | null>(null);
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
  const replayAbortRef = useRef<AbortController | null>(null);
  const replayRequestSeqRef = useRef(0);
  /**
   * ── ليش انتقل هذا الموعد — بلا أن يسأل أحد ──────────────────────────────
   *
   * The archive can already answer this. The server replays the placement a
   * lecture was moved away from, sweeps the week as it stood that day, and
   * names whatever had taken the slot. It has been able to do that all along.
   *
   * The trouble was where the answer lived: select a lecture, switch to the
   * analysis tab, press «كيف وصل القرار إلى هذا الشكل؟», wait for the server,
   * then read down a timeline until a line explains itself. Five steps to a
   * fact that belongs in the first sentence — which is why the person who
   * built it did not remember it was there.
   *
   * So it moves to the front, under two rules. It costs nothing on the way in:
   * the fetch waits for an idle moment and aborts the instant the selection
   * changes, so the panel opens at the speed it always did. And it says
   * nothing unless the archive genuinely does — `reasonForMove` returns null
   * for a move that was somebody's preference, and a blank is the honest
   * rendering of that, not a reason invented to fill the line.
   *
   * The same fetch primes the full anatomy, so pressing the line opens the
   * timeline with no second request. Surfacing it made it faster, not slower.
   */
  /**
   * ── لماذا رُفض النقل — مرفوعاً فوق اللوحة ───────────────────────────────
   *
   * The refusal used to be one run-on string joined by «—» and printed into a
   * notice that lives INSIDE the horizontally scrolling board, so a reader saw
   * «تعذر النقل: القاعة B7/F31 مشغولة في نفس الوقت — القاعة B 7/F 31 مشغولة…»
   * clipped at the edge of the scroller, with the third reason off-screen
   * entirely and the first two saying the same thing twice.
   *
   * A refusal is the one moment the reader is owed the WHOLE answer: they just
   * tried to move a lecture and the system said no. So it is lifted out of the
   * scroller into a floating card, one line per distinct wall, each carrying
   * the icon of what kind of wall it is — a hall, a person, a cohort. The list
   * is already deduplicated upstream in buildDecision.
   */
  /* Squares the server has already refused for a given lecture, remembered for
     the session. Without this the board forgets a wall the moment the card
     returns home, and offers the same impossible square again on the next lift.
     Keyed by lecture so one card's wall is never drawn on another's board. */
  const refusedCells = useRef<Map<number, Set<string>>>(new Map());
  /**
   * Show a refusal the server returned, the same way a refusal the drag decided
   * locally is shown.
   *
   * These were two different experiences for one event: the local one got the
   * card with a mark per wall, the server one got a plain banner holding every
   * wall stitched into a single line. Returns false when the failure is not a
   * refusal at all, so ordinary errors keep the ordinary banner.
   */
  const presentMoveRefusal = useCallback((error: any, rowId: number, cell: string) => {
    const walls = Array.isArray(error?.conflicts)
      ? error.conflicts.map((item: any) => [item?.message, item?.detail].filter(Boolean).join(" — ")).filter(Boolean)
      : [];
    if (!walls.length) return false;
    const reasons = condenseRefusalReasons(error.conflicts);
    if (!reasons.length) return false;
    setRefusal({ reasons, summary: String(error?.message || "تعذّر هذا الموضع وفق قواعد الجدول.") });
    /* One utterance for the screen reader, not four. */
    setPhysicsNotice(`رفض النقل: ${walls.join(". ")}`);
    /* The square the server just refused must stop being drawn as available. */
    if (rowId && cell) {
      const known = refusedCells.current.get(rowId) || new Set<string>();
      known.add(cell);
      refusedCells.current.set(rowId, known);
      setPhysicsField(prev => ({ ...prev, [cell]: "impossible" }));
    }
    return true;
  }, []);

  const [refusal, setRefusal] = useState<{ reasons: Array<{ kind: "room" | "instructor" | "cohort" | "other"; text: string; entity: string; state: string }>; summary: string } | null>(null);
  /* A refusal is read in a couple of seconds and then it is only in the way.
     It leaves on its own, and any new attempt clears it sooner. */
  useEffect(() => {
    if (!refusal) return;
    const timer = window.setTimeout(() => setRefusal(null), 9000);
    return () => window.clearTimeout(timer);
  }, [refusal]);

  const [moveNote, setMoveNote] = useState<{ text: string; against?: string; moves: number } | null>(null);
  const moveNoteAbortRef = useRef<AbortController | null>(null);
  const moveNoteSeqRef = useRef(0);
  const replayPrimedRef = useRef<{ id: number; payload: any } | null>(null);
  const guideOperationRef = useRef<{ featureId:string; transactionId?:string; startedAt:number; task?:string; expected?:string } | null>(null);
  const normalReviewTrackedRef = useRef(false);
  const normalSearchTrackedRef = useRef<{query:string;startedAt:number;completed?:boolean} | null>(null);
  const practiceSnapshotRef = useRef<FSchedule[] | null>(null);
  const [practiceMode, setPracticeMode] = useState(false);
  const [guideGhostDiff, setGuideGhostDiff] = useState<null | { before:FSchedule; after:FSchedule; conflicts:number; summary:string }>(null);
  const emitGuideResult = useCallback((detail: { featureId:string; ok:boolean; signal?:string; final?:boolean; transactionId?:string; rollbackCommand?:GuideCommand; label?:string; retries?:number; stepCount?:number }) => {
    const operation = guideOperationRef.current;
    const startedAt = operation?.featureId === detail.featureId ? operation.startedAt : Date.now();
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-action-result", { detail: { ...detail, durationMs: Math.max(0, Date.now() - startedAt) } }));
    if (detail.final !== false && operation?.featureId === detail.featureId) guideOperationRef.current = null;
  }, []);
  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);
  useEffect(() => () => {
    replayAbortRef.current?.abort();
    replayAbortRef.current = null;
  }, []);
  useEffect(() => {
    if (!rows.length) return;
    let request:any = null;
    try { request = JSON.parse(sessionStorage.getItem("schedule-guide-ghost-preview") || "null"); } catch {}
    if (!request || Date.now() - Number(request.createdAt || 0) > 10 * 60 * 1000) return;
    try { sessionStorage.removeItem("schedule-guide-ghost-preview"); } catch {}
    const before = rows.find(item => Number(item.id) === Number(request.id || request.before?.id || 0)) || request.before;
    const after = request.after;
    if (!before || !after) return;
    const issues = findConflicts([after], rows.filter(item => Number(item.id) !== Number(before.id)));
    setGuideGhostDiff({ before, after, conflicts:issues.length, summary:issues.length ? `ستظهر ${issues.length.toLocaleString("ar-KW-u-nu-latn")} ملاحظة تعارض في هذه المعاينة.` : "لا يظهر تعارض مانع في هذه المعاينة." });
    setReviewFocus(new Set([Number(before.id)]));
    changeView("week");
  // one-shot handoff from «جرّب»; consumed once the real board is ready.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);
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
  const [filterCollege, setFilterCollege] = useState(0),
    [filterSection, setFilterSection] = useState(0),
    [filterTerm, setFilterTerm] = useState(0),
    /**
     * ── أي فصل تخصّ هذه الصفوف؟ ─────────────────────────────────────────
     *
     * The loader has always refused to PAINT an answer that arrives after the
     * reader moved on. What it never did is clear the board in the meantime,
     * and the skeleton only stood in when there were no rows at all — true on
     * the first load, false on every later one. So changing the term left the
     * previous term's lectures on screen, at full strength and fully live,
     * until the new read came back.
     *
     * A reader who does not notice the small «يقرأ الجدول…» can drag, edit or
     * delete one of them, believing they are working in the term named in the
     * header above. The write would land on the term the row really belongs
     * to — the one they thought they had left.
     *
     * So the rows now carry the scope they were read for, and the board is
     * shown only while that matches what is selected. The skeleton already
     * existed for exactly this beat; it simply was not asked.
     */
    [rowsScope, setRowsScope] = useState(""),
    [visibleLimit, setVisibleLimit] = useState(AGENDA_PAGE_SIZE);
  const [departmentStartRhythm, setDepartmentStartRhythm] = useState<DepartmentStartRhythm | null>(null);
  const [formStartRhythm, setFormStartRhythm] = useState<DepartmentStartRhythm | null>(null);
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
    [pendingWriteIds, setPendingWriteIds] = useState<Set<number>>(() => new Set()),
    [, setDecisionFingerprint] = useState<DecisionFingerprint | null>(null),
    [historicalChoice, setHistoricalChoice] = useState<null | { dayLabel: string; picked: string; preferred: string; source: string }>(null),
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
  /* The hover card lives in its own layer (see WeekPeekLayer): pointing at a
     lecture must not re-render the board that draws every lecture. These two
     handles never change identity, so the card handlers stay stable too. */
  const peekRef = useRef<WeekPeekHandle | null>(null);
  const openPeek = (row: FSchedule, element: HTMLElement | null) => peekRef.current?.open(row, element);
  const closePeek = (rowId: number) => peekRef.current?.close(rowId);

  /**
   * Painting a new appointment straight onto an empty column.
   *
   * Asking for a lecture from ten to half past eleven by opening a form and
   * typing two times is the long way round when the column is right there. A
   * stroke down the empty squares says the day, the hour and the length in one
   * gesture, and the form opens already knowing all three. A single tap is the
   * same stroke of one square, so nothing was taken away.
   */
  const [paint, setPaint] = useState<{ day: DayKey; from: string; to: string; roomCode?: string; roomHall?: string; trackKey?: string } | null>(null);
  const paintRef = useRef<{ day: DayKey; anchor: number; roomCode?: string; roomHall?: string; trackKey?: string } | null>(null);
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
  const [offlinePending, setOfflinePending] = useState(() => offlineQueueCount());
  const syncFlushBusy = useRef(false);
  const [networkOnline, setNetworkOnline] = useState(() => navigator.onLine);
    /* The dock's search button has nothing of its own to search with — it brings
     the reader to the one field that already exists, rather than owning a
     second one that could disagree with it. */
  const searchRef = useRef<HTMLInputElement | null>(null);
  const xraySectionRef = useRef<HTMLElement | null>(null);
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
  const paintOpen = useRef<((seed: { day: DayKey; start: string; end: string; x: number; y: number; roomCode?: string; roomHall?: string }) => void) | null>(null);
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
            roomCode: current.roomCode,
            roomHall: current.roomHall,
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
    const method = String(options?.method || "GET").toUpperCase();
    const mutating = method !== "GET" && method !== "HEAD";
    const queueable = mutating && canQueueScheduleMutation(url, method);
    const readRequest = !mutating;
    telemetryBreadcrumb(`${method} ${url.split("?")[0]}`);
    if (mutating && !navigator.onLine) {
      telemetryOffline("schedule.write.offline");
      if (queueable) {
        const queued = enqueueScheduleMutation(url, options || {});
        if (queued) return queuedPseudoResponse(queued);
      }
      throw new Error("أنت الآن دون اتصال. يمكنك متابعة ترتيب المواعيد الموجودة، أما الإنشاء الجديد فيحتاج عودة الاتصال.");
    }
    let res: Response | null = null;
    let lastError: any = null;
    const maxAttempts = readRequest ? 2 : 1;
    const started = performance.now();
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const timeout = new AbortController();
      const timeoutMs = readRequest && attempt === 1 ? 20_000 : 35_000;
      const timer = window.setTimeout(() => timeout.abort(), timeoutMs);
      try {
        res = await fetch(url, { ...options, credentials: options?.credentials || "include", signal: options?.signal ?? timeout.signal });
        telemetryApi(url.split("?")[0], performance.now() - started, res.status, res.ok);
        lastError = null;
        break;
      } catch (error: any) {
        lastError = error;
        const elapsed = performance.now() - started;
        telemetryError(url.split("?")[0], error, elapsed);
        const externalAbort = Boolean(options?.signal && options.signal.aborted);
        if (queueable && !externalAbort) {
          const queued = enqueueScheduleMutation(url, options || {});
          if (queued) {
            window.clearTimeout(timer);
            return queuedPseudoResponse(queued);
          }
        }
        const timedOut = error?.name === "AbortError" && timeout.signal.aborted;
        if (readRequest && timedOut && attempt < maxAttempts && !externalAbort) {
          window.clearTimeout(timer);
          continue;
        }
        if (timedOut) {
          throw new Error(readRequest
            ? "الخدمة أبطأ من المعتاد في قراءة هذا الجدول. أعدت المحاولة تلقائياً، لكن الرد لم يصل بعد. حدّث الصفحة أو أعد المحاولة بعد قليل."
            : "الخادم تأخر في تثبيت هذا التغيير. إن كانت العملية قابلة للمزامنة فقد حُفظت محلياً، وإلا فلم يُعتمد أي تغيير بعد.");
        }
        throw error;
      } finally {
        window.clearTimeout(timer);
      }
    }
    if (!res) throw lastError || new Error("تعذر الوصول إلى الخدمة حالياً.");
    const body = await res.text();
    let data: any = {};
    if (body) {
      try { data = JSON.parse(body); }
      catch {
        const parseError = new Error(res.ok ? "وصل رد غير متوقع من الخادم. أعد المحاولة بعد لحظات." : `الخادم مشغول حالياً (${res.status}). أعد المحاولة بعد قليل.`);
        telemetryError("response.parse", parseError, performance.now() - started);
        throw parseError;
      }
    }
    if (!res.ok) {
      const failure: any = new Error(data.error || `تعذر إتمام العملية (${res.status}).`);
      /* The blockers the server listed are the whole substance of a refusal.
         Dropping them left the caller with one stitched sentence and no way to
         show a wall per line. */
      if (Array.isArray(data?.conflicts) && data.conflicts.length) failure.conflicts = data.conflicts;
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
    const t = sortTermsNewest<AdTerm>(rawTerms);
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
  const buildingOptions = useMemo(() => [...estate.values()].map(item => item.label).sort(byRoomPart), [estate]);
  const hallOptions = useMemo(() => {
    const code = normalizeRoomToken(form.AdRoomCode);
    if (!code) return [] as string[];
    return [...(estate.get(code)?.halls.values() || [])].sort(byRoomPart);
  }, [estate, form.AdRoomCode]);
  /* The same reading, asked about any building rather than the form's — the
     quick card names its own building and needs the halls that go with it. */
  const hallsOf = useCallback(
    (building: string) => [...(estate.get(normalizeRoomToken(building))?.halls.values() || [])].sort(byRoomPart),
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
    if (newest && newest.id !== entry.id && !(await visualConfirm({
      title: "تراجع عن تغيير أقدم",
      message: `«${entry.label}» ليس آخر تغيير.
التراجع عنه يعيد الصفوف المعنية إلى حالتها قبله ويلغي ما جرى عليها بعده.`,
      confirmLabel: "تراجع",
      tone: "warning",
    }))) return;
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
    const cancelIdle = whenIdle(() => {
    fetch(`/api/courses/nature?sectionId=${filterSection}`)
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!alive || !data?.nature) return;
        setNature(new Map(Object.entries(data.nature).map(([id, value]) => [Number(id), value as CourseNature])));
      })
      .catch(() => undefined);
    });
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
  /**
   * بديل اليوم — dated one-day facts over a lecture (cancel / cover).
   *
   * Built, tested and deliberately WITHDRAWN from the interface for now: the
   * department is not ready to run day-level exceptions, and a door nobody is
   * meant to open should not be visible. The component, its server routes and
   * the calendar's EXDATE support all remain intact and unreferenced from the
   * UI, so turning this flag to `true` is the whole of switching it on.
   * (Same pattern as TEAM_NOTES_ENABLED.)
   */
  const [dayToolRow, setDayToolRow] = useState<FSchedule | null>(null);
  /* متى نلتقي؟ — the committee-window finder over this term's own schedules. */
  const [meetingOpen, setMeetingOpen] = useState(false);
  /** Appointments the review asked to see; they glow until something else happens. */
  const [reviewFocus, setReviewFocus] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!reviewFocus.size) return;
    const timer = window.setTimeout(() => setReviewFocus(new Set()), 20000);
    return () => window.clearTimeout(timer);
  }, [reviewFocus]);
  // Every lecture is now always present as a real card.  Review therefore has
  // one job only: bring that existing card into view; there is no density band
  // to open and no alternate representation to reconcile.
  useEffect(() => {
    if (!reviewFocus.size || viewMode !== "week") return;
    const raf = window.requestAnimationFrame(() => window.setTimeout(() => {
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
  useEffect(() => {
    setTelemetryScope({ collegeId: filterCollege, sectionId: filterSection, termId: filterTerm });
    telemetryBreadcrumb(`نطاق ${filterCollege}/${filterSection}/${filterTerm}`);
  }, [filterCollege, filterSection, filterTerm]);
  useEffect(() => { setOfflineQueueOwner(Number(user?.SystemUserId || 0)); setOfflinePending(offlineQueueCount()); }, [user?.SystemUserId]);
  useEffect(() => subscribeOfflineQueue(setOfflinePending), []);
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
  /**
   * The rows on screen were read for a scope. If that is not the scope now
   * selected, they are another term's board and must not be shown — never
   * mind touched. Empty stamp means nothing has loaded yet, which the
   * first-load branch already covers.
   */
  const rowsForeign = rowsScope !== "" && rowsScope !== `${filterCollege}|${filterSection}|${filterTerm}`;

  /**
   * ── جيران الفصل يوضعون على الرف قبل أن يُطلبوا ─────────────────────────────
   *
   * The shelf makes RETURNING to a term instant; this makes ARRIVING instant
   * for the switches people actually make. A coordinator browsing history
   * walks the term list in order — previous term, next term — so the moment
   * one board settles, its two chronological neighbours are read quietly in
   * the background and shelved. By the time the reader reaches for either,
   * it paints in a frame like any shelved board, and the network read that
   * follows is the same silent revalidation every shelf hit gets.
   *
   * Deliberately narrow: two neighbours only, never recursive (a prefetched
   * board does not prefetch ITS neighbours — only a board the reader actually
   * opened does), idle-scheduled within 900ms — the tape showed readers hop
   * every four to five seconds, so the shelf must be stocked inside two — and
   * aborted the moment the scope moves on, and
   * skipped entirely for anything already shelved. Failures are swallowed:
   * this is a courtesy, not a dependency, and the normal path is untouched.
   */
  useEffect(() => {
    const stamp = `${filterCollege}|${filterSection}|${filterTerm}`;
    if (!filterCollege || !filterSection || !filterTerm) return;
    if (rowsScope !== stamp) return;                       // the board itself must be settled
    if (!terms.length) return;
    const ordered = sortTermsNewest<AdTerm>(terms);
    const at = ordered.findIndex(term => Number(term.AdTermId) === filterTerm);
    if (at < 0) return;
    const neighbours = [ordered[at + 1], ordered[at - 1]]  // الأقدم مباشرة ثم الأحدث مباشرة
      .filter(Boolean)
      .map(term => Number(term!.AdTermId))
      .filter(termId => !boardShelf.has(shelfKey(`${filterCollege}|${filterSection}|${termId}`)));
    if (!neighbours.length) return;
    const controller = new AbortController();
    const cancelIdle = whenIdle(() => {
      void (async () => {
        for (const termId of neighbours) {
          if (controller.signal.aborted) return;
          try {
            const res = await fetch(`/api/schedules?collegeId=${filterCollege}&sectionId=${filterSection}&termId=${termId}`, { signal: controller.signal });
            if (!res.ok) continue;
            const rows = await res.json();
            if (!Array.isArray(rows)) continue;
            shelveBoard(shelfKey(`${filterCollege}|${filterSection}|${termId}`), {
              rows, instructors: null, courses: null, visitingIds: null, at: Date.now(),
            });
          } catch { /* a prefetch owes nobody an apology */ }
        }
      })();
    }, 900);
    return () => { cancelIdle(); controller.abort(); };
  }, [rowsScope, filterCollege, filterSection, filterTerm, terms]);

  const rowsScopeRef = useRef("");
  const shelfKey = (stamp: string) => `${Number(user?.SystemUserId || 0)}:${stamp}`;

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
    /**
     * The previous term's rows leave the screen NOW, not when the new ones
     * arrive. Gating the board alone was not enough: the counters above it —
     * appointments shown, halls used, staff — are read from the same array,
     * so they went on quoting the term the reader had just left, and the
     * conflict chip with them. Emptying the array at the moment the scope
     * changes takes every one of them out together, and the skeleton that
     * already covers an empty board covers this too.
     *
     * Only on a real change of scope. A silent refresh of the same term must
     * not blank the board the reader is working in.
     */
    if (rowsScopeRef.current && rowsScopeRef.current !== stamp) {
      /* A scope seen earlier this session paints from the shelf in the same
         frame — the read below still fires and silently replaces it. Only a
         scope never seen clears to the skeleton. */
      const held = boardShelf.get(shelfKey(stamp));
      if (held) {
        setRows(held.rows);
        setRowsScope(stamp);
        rowsScopeRef.current = stamp;
      } else {
        rowsScopeRef.current = "";
        setRowsScope("");
        setRows([]);
      }
    }
    if (!opts?.silent) setRowsLoading(true);
    try {
      const data = await fetchJson(`/api/schedules${p.size ? `?${p}` : ""}`, { signal: controller.signal });
      // Second guard, belt to the ref's braces: an answer that arrives after the
      // reader has moved to another department describes a board that is no
      // longer on screen, and must never be painted onto the one that is.
      const now = scopeRef.current;
      if (stamp !== `${now.collegeId}|${now.sectionId}|${now.termId}`) return;
      if (token === loadToken.current) {
        setRows(data);
        setRowsScope(stamp);
        rowsScopeRef.current = stamp;
        /* Shelve rows without discarding the richer names a workspace read may
           already have put here for the same scope. */
        const prior = boardShelf.get(shelfKey(stamp));
        shelveBoard(shelfKey(stamp), {
          rows: data,
          instructors: prior?.instructors ?? null,
          courses: prior?.courses ?? null,
          visitingIds: prior?.visitingIds ?? null,
          at: Date.now(),
        });
      }
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        /* A failed read must not leave the previous term's board standing in
           for one that never arrived. Drop the rows and stamp the scope, so
           the screen says «لا مواعيد» honestly instead of holding a skeleton
           for ever or showing somebody else's term. */
        if (token === loadToken.current) { setRows([]); setRowsScope(stamp); rowsScopeRef.current = stamp; }
        throw error;
      }
    } finally {
      if (token === loadToken.current) setRowsLoading(false);
    }
  };
  useEffect(() => () => loadAbort.current?.abort(), []);
  useEffect(() => {
    const down = () => { setNetworkOnline(false); telemetryOffline("schedule.network"); };
    const up = async () => {
      setNetworkOnline(true);
      const result = await flushOfflineScheduleQueue();
      setOfflinePending(result.remaining);
      if (result.done) {
        setPhysicsNotice(`تمت مزامنة ${result.done.toLocaleString("ar-KW-u-nu-latn")} تغييرات محلية.`);
        await loadRows({ silent: true }).catch(() => undefined);
      } else if (result.conflict) {
        setPhysicsNotice("عاد الاتصال؛ تم حفظ التغيير المتعارض للمراجعة خارج طابور المزامنة حتى لا يعلق العداد.");
      }
    };
    window.addEventListener("offline", down);
    window.addEventListener("online", up);
    if (navigator.onLine && offlineQueueCount()) void up();
    return () => { window.removeEventListener("offline", down); window.removeEventListener("online", up); };
  }, []);
  /*
   * Fast sync pump: a transient campus-network hiccup should not leave the
   * schedule saying «بانتظار المزامنة» for minutes. While there is queued work
   * and the browser is online, retry quietly every 900ms. Only the rows are
   * refreshed after a successful flush; the board itself never blocks.
   */
  useEffect(() => {
    if (!networkOnline || !offlinePending) return;
    let cancelled = false;
    const pump = async () => {
      if (cancelled || syncFlushBusy.current || !navigator.onLine || !offlineQueueCount()) return;
      syncFlushBusy.current = true;
      try {
        const result = await flushOfflineScheduleQueue();
        if (cancelled) return;
        setOfflinePending(result.remaining);
        if (result.done) {
          setPhysicsNotice(result.remaining
            ? `${result.remaining.toLocaleString("ar-KW-u-nu-latn")} تغيير ما زال بانتظار التثبيت.`
            : "تم تثبيت التغييرات في الخلفية.");
          void loadRows({ silent: true }).catch(() => undefined);
        } else if (result.conflict) {
          setPhysicsNotice("تم إخراج تغيير متعارض من طابور المزامنة وحفظه للمراجعة؛ بقية التغييرات تستمر طبيعيًا.");
        }
      } finally {
        syncFlushBusy.current = false;
      }
    };
    void pump();
    const timer = window.setInterval(() => void pump(), 900);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [networkOnline, offlinePending]);
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
    const uiStarted = performance.now();
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
      const nextScopeKey = `${context.collegeId}|${context.sectionId}|${context.termId}`;
      const firstPaintForScope = appliedScope.current !== nextScopeKey;
      appliedScope.current = nextScopeKey;
      /* The rows about to be painted belong to THIS scope. Stamping them here
         is what lets the board know, on the next scope change, that what it is
         holding is another term's — the plain `/api/schedules` path stamps them
         too, and both must agree or the guard reads a scope nothing came from. */
      setRowsScope(nextScopeKey);
      rowsScopeRef.current = nextScopeKey;
      if (Array.isArray(data?.colleges) && data.colleges.length) setColleges(sortByName(data.colleges, (row: any) => row.AdCollegeName));
      if (Array.isArray(data?.sections) && data.sections.length) setSections(sortByName(data.sections, (row: any) => row.AdSectionName));
      if (Array.isArray(data?.terms) && data.terms.length) setTerms(sortTermsNewest<AdTerm>(data.terms));
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      // A scope with no chosen section keeps the names it already knows —
      // parity with the old per-section lookups, which only ran once a
      // section was picked, so the editor never loses a name it must display.
      setInstructors(Array.isArray(data?.instructors) ? sortByName(data.instructors, (row: any) => row.AdInstructorName) : []);
      setCourses(Array.isArray(data?.courses) ? sortByName(data.courses, (row: any) => row.CourseName) : []);
      const visiting = (Array.isArray(data?.visitingInstructorIds) ? data.visitingInstructorIds : []).map(Number).filter(Boolean);
      setVisitingIds(new Set(visiting));
      shelveBoard(shelfKey(nextScopeKey), {
        rows: Array.isArray(data?.rows) ? data.rows : [],
        instructors: Array.isArray(data?.instructors) ? sortByName(data.instructors, (row: any) => row.AdInstructorName) : null,
        courses: Array.isArray(data?.courses) ? sortByName(data.courses, (row: any) => row.CourseName) : null,
        visitingIds: visiting,
        at: Date.now(),
      });
      onContext?.(context);
      if (firstPaintForScope) requestAnimationFrame(() => telemetryTiming("schedule.ready", performance.now() - uiStarted));
      return context;
    };
    try {
      const query = new URLSearchParams();
      if (collegeId) query.set("collegeId", String(collegeId));
      if (sectionId) query.set("sectionId", String(sectionId));
      if (termId) query.set("termId", String(termId));
      if (resolve) query.set("resolve", "1");
      const url = `/api/schedules/workspace?${query}`;
      /**
       * ── ولماذا لم يكفِ إصلاح المسار الآخر ──────────────────────────────────
       *
       * Changing the term goes through THIS loader, not the plain one. The
       * plain `/api/schedules` path was taught to let go of the previous
       * term's rows the moment the scope changed; this path was not, and this
       * is the path a reader actually takes. So the board went on showing the
       * term they had just left — live, draggable, editable — until the new
       * read came back, which on production took seconds.
       *
       * Released here, before the request is even sent, and only when the
       * scope genuinely differs from the one already painted: a silent refresh
       * of the same term must not blank the board somebody is working in.
       */
      const requestedScope = `${collegeId}|${sectionId}|${termId}`;
      if (appliedScope.current && appliedScope.current !== requestedScope) {
        const held = boardShelf.get(shelfKey(requestedScope));
        if (held) {
          /* Instant paint of the shelved board — rows, and the names that came
             with them if a workspace read shelved them. The network read below
             proceeds untouched and replaces all of this on arrival. */
          setRows(held.rows);
          if (held.instructors) setInstructors(held.instructors);
          if (held.courses) setCourses(held.courses);
          if (held.visitingIds) setVisitingIds(new Set(held.visitingIds));
          setRowsScope(requestedScope);
          rowsScopeRef.current = requestedScope;
          appliedScope.current = requestedScope;
        } else {
          appliedScope.current = "";
          rowsScopeRef.current = "";
          setRowsScope("");
          setRows([]);
        }
      }
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
        const savedTerm = Number(pref.filterTerm) || 0;
        if (mode === "schedule") {
          setViewMode(pref.viewMode === "week" ? "week" : pref.viewMode === "rooms" ? "rooms" : "list");
          const lookup = await loadLookups();

          // First visit still starts unselected. Once this user has chosen a
          // college/term, however, that last valid workspace is their landing
          // place on the next sign-in. The preference key is user-scoped, so a
          // shared machine never lets one account activate another account's
          // college or academic term.
          let nextCollege = savedCollege;
          let nextSection = savedSection;
          if (isPowerAdmin) {
            if (!lookup.colleges.some(college => Number(college.AdCollegeId) === nextCollege)) nextCollege = 0;
            const section = lookup.sections.find(item => Number(item.AdSectionId) === nextSection);
            if (!section || (nextCollege && Number(section.AdCollegeId) !== nextCollege)) nextSection = 0;
          } else {
            const scoped = coerceScopeValues(scopes, nextCollege, nextSection, false);
            nextCollege = scoped.collegeId;
            nextSection = scoped.sectionId;
          }

          let nextTerm = savedTerm && lookup.terms.some(term => Number(term.AdTermId) === savedTerm) ? savedTerm : 0;
          // A previously saved term that was later removed should not strand the
          // user on an empty selector. Only stale saved state falls forward.
          if (savedTerm && !nextTerm) nextTerm = Number(lookup.terms[0]?.AdTermId || 0);
          /**
           * ── ولماذا لم يعد الفصل يُترك فارغاً حين يكون النطاق معروفاً ─────────
           *
           * A first visit used to leave the term unset on purpose — the reader
           * should say which term they mean rather than be shown one. That is
           * the right instinct for somebody with several colleges in front of
           * them and nothing to go on.
           *
           * It is the wrong outcome for a department account, and that is most
           * accounts. Their college and section are resolved for them from
           * their own scope a few lines above, so the program already knows
           * exactly whose schedule is being asked for — and then shows an empty
           * board anyway, because the one remaining field was left blank. The
           * server, asked with no term at all, would have answered with the
           * newest one; the screen simply never asked.
           *
           * So the term is filled in only when the rest of the scope is already
           * certain. A reader with no resolved department still chooses, exactly
           * as before — nothing is guessed on their behalf.
           *
           * The newest OPEN term, not merely the newest: terms marked ended are
           * history, and landing a new reader inside a closed one would answer
           * the wrong question confidently.
           */
          if (!nextTerm && nextCollege && nextSection) {
            const byNewest = sortTermsNewest(lookup.terms as any[]);
            const open = byNewest.find(term => !isTermClosed(term as any, lookup.terms as any[]));
            nextTerm = Number((open || byNewest[0])?.AdTermId || 0);
          }

          setFilterCollege(nextCollege);
          setFilterSection(nextSection);
          setFilterTerm(nextTerm);
          setRows([]);
          setWorkspaceReady(true);
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
        setCopyCollege(0);
        setCopySection(0);
        setCopyToTerm(0);
        setCopyFromTerm(0);
      } catch (e: any) {
        setError(friendlyError(e));
      }
    })();
  }, [mode, user?.SystemUserId]);
  useEffect(() => {
    setDecisionFingerprint(null);
  }, [filterCollege, filterSection, filterTerm, viewMode]);

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
  const filterCollegeScope = resolveScopeSelection(scopes, 0, isPowerAdmin);
  const filterColleges = isPowerAdmin ? colleges : colleges.filter((c) => filterCollegeScope.collegeIds.includes(Number(c.AdCollegeId)));
  const filterSections = sections.filter(
      (s) => (!filterCollege || s.AdCollegeId === filterCollege) && (isPowerAdmin || resolveScopeSelection(scopes, filterCollege, false).sectionIds.includes(Number(s.AdSectionId))),
    ),
    copySections = sections.filter(
      (s) => !copyCollege || s.AdCollegeId === copyCollege,
    );
  const latestTermId = useMemo(() => Number(sortTermsNewest(terms)[0]?.AdTermId || 0), [terms]);
  useEffect(() => {
    if (!form.AdSectionId) return;
    if (formCourses.length) return;
    let alive = true;
    void fetch(`/api/courses?sectionId=${Number(form.AdSectionId)}`, { credentials: "include" })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!alive || !Array.isArray(data) || !data.length) return;
        setCourses(current => {
          const merged = new Map(current.map(course => [Number(course.AdCourseId), course] as const));
          data.forEach((course: any) => merged.set(Number(course.AdCourseId), course));
          return sortByName([...merged.values()], (course: any) => course.CourseName);
        });
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [form.AdSectionId, formCourses.length]);
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

    // View-local state never leaks into another projection. A room comparison
    // belongs to the rooms canvas only; an expanded/focused day belongs to the
    // week only. Shared filters (course/instructor/colour/search) intentionally
    // survive because the reader expects the same question to follow them.
    if (viewMode === "rooms" && next !== "rooms") {
      setMatrixDay("week");
      setMatrixBuildings(new Set());
      setMatrixRooms(new Set());
    }
    if (viewMode === "week" && next !== "week") {
      setExpandedDay(null);
      setReviewFocus(new Set());
      setPicking(false);
      setMultiSelect(new Set());
      setPaint(null);
    }

    startTransition(() => setViewMode(next));
    setMobileViewGate(null);
  }, [phoneReadOnly, viewMode]);
  const guideViewStartedRef = useRef({ view:viewMode, at:Date.now() });
  useEffect(() => {
    if (guideViewStartedRef.current.view === viewMode) return;
    const now = Date.now();
    const featureId = viewMode === "rooms" ? "schedule.view.rooms" : viewMode === "week" ? "schedule.view.week" : "schedule.view.list";
    recordFeatureEvent(Number(user?.SystemUserId || 0), featureId, "completed", { durationMs: Math.max(1, now - guideViewStartedRef.current.at), stepCount:1 });
    guideViewStartedRef.current = { view:viewMode, at:now };
  }, [user?.SystemUserId, viewMode]);
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

  const [guideDetectedHelp, setGuideDetectedHelp] = useState<{ key?: string; featureId?: string; title: string; detail: string; level: "soft" | "strong" } | null>(null);
  const guideFailureTimesRef = useRef<number[]>([]);
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
    if (isPowerAdmin || !sections.length || !filterCollege) return;
    const next = coerceScopeValues(scopes, filterCollege, filterSection, false);
    if (next.collegeId !== filterCollege) setFilterCollege(next.collegeId);
    if (next.sectionId !== filterSection) setFilterSection(next.sectionId);
  }, [isPowerAdmin, sections.length, scopes, filterCollege, filterSection]);

  /*
   * The clock the department has actually used over the last ten academic
   * years. This is working knowledge for drag/drop, not another dashboard.
   * If history is thin, the long-standing 1-3-5/:00 and 2-4/:30 convention is
   * the safe fallback; either way it is advice, never a save restriction.
   */
  useEffect(() => {
    if (mode !== "schedule" || !workspaceReady || !filterCollege) {
      setDepartmentStartRhythm(null);
      return;
    }
    let alive = true;
    const query = new URLSearchParams({ collegeId: String(filterCollege), sectionId: String(filterSection || 0), termId: String(filterTerm || 0) });
    const cancelIdle = whenIdle(() => {
      void fetch(`/api/intelligence/department-start-rhythm?${query}`, { credentials: "include" })
        .then(response => (response.ok ? response.json() : null))
        .then(data => { if (alive) setDepartmentStartRhythm(data?.department?.days ? data : null); })
        .catch(() => { if (alive) setDepartmentStartRhythm(null); });
    });
    return () => { alive = false; cancelIdle(); };
  }, [mode, workspaceReady, filterCollege, filterSection, filterTerm, liveFeedSerial]);

  // The editor may be pointed at another department by an administrator. Never
  // reuse the visible board's history for that form: either read the form's own
  // section or fall back to the institutional convention while it loads.
  useEffect(() => {
    if (mode !== "schedule" || editor === "index" || !form.AdCollegeId || !form.AdSectionId) {
      setFormStartRhythm(null);
      return;
    }
    if (Number(form.AdCollegeId) === Number(filterCollege) && Number(form.AdSectionId) === Number(filterSection) && Number(form.AdTermId || filterTerm) === Number(filterTerm)) {
      setFormStartRhythm(departmentStartRhythm);
      return;
    }
    let alive = true;
    const query = new URLSearchParams({ collegeId: String(form.AdCollegeId), sectionId: String(form.AdSectionId), termId: String(form.AdTermId || 0) });
    void fetch(`/api/intelligence/department-start-rhythm?${query}`, { credentials: "include" })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (alive) setFormStartRhythm(data?.department?.days ? data : null); })
      .catch(() => { if (alive) setFormStartRhythm(null); });
    return () => { alive = false; };
  }, [mode, editor, form.AdCollegeId, form.AdSectionId, form.AdTermId, filterCollege, filterSection, filterTerm, departmentStartRhythm, liveFeedSerial]);

  const historicalChoiceResolver = useRef<((decision: "picked" | "preferred" | "cancel") => void) | null>(null);
  const askHistoricalTimeChoice = useCallback((data: { dayLabel: string; picked: string; preferred: string; source: string }) =>
    new Promise<"picked" | "preferred" | "cancel">(resolve => {
      historicalChoiceResolver.current?.("cancel");
      historicalChoiceResolver.current = resolve;
      setHistoricalChoice(data);
    }), []);
  const settleHistoricalTimeChoice = useCallback((decision: "picked" | "preferred" | "cancel") => {
    const resolve = historicalChoiceResolver.current;
    historicalChoiceResolver.current = null;
    setHistoricalChoice(null);
    resolve?.(decision);
  }, []);
  useEffect(() => () => {
    historicalChoiceResolver.current?.("cancel");
    historicalChoiceResolver.current = null;
  }, []);
  useEffect(() => {
    if (!historicalChoice) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") settleHistoricalTimeChoice("cancel"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [historicalChoice, settleHistoricalTimeChoice]);

  const historicalReadingFor = useCallback((row: Partial<FSchedule>, day: DayKey) => {
    const rowCollege = Number(row.AdCollegeId || 0), rowSection = Number(row.AdSectionId || 0), rowTerm = Number(row.AdTermId || 0);
    const boardMatch = rowCollege === Number(filterCollege) && rowSection === Number(filterSection) && (!rowTerm || !filterTerm || rowTerm === Number(filterTerm));
    const formMatch = rowCollege === Number(form.AdCollegeId || 0) && rowSection === Number(form.AdSectionId || 0) && (!rowTerm || !form.AdTermId || rowTerm === Number(form.AdTermId));
    const model = boardMatch ? departmentStartRhythm : formMatch ? formStartRhythm : null;
    return pickHistoricalDayModel(model, row, day);
  }, [departmentStartRhythm, formStartRhythm, filterCollege, filterSection, filterTerm, form.AdCollegeId, form.AdSectionId, form.AdTermId]);

  const expectedStartMinuteForDay = useCallback((row: Partial<FSchedule>, day: DayKey) => {
    const learned = historicalReadingFor(row, day).data;
    if (learned && learned.samples >= 3 && learned.share >= 0.55) return learned.minute;
    // Institutional fallback only when history has no reliable opinion.
    if (SHORT_LECTURE_DAYS.has(day)) return 0;
    if (LONG_LECTURE_DAYS.has(day)) return 30;
    return null;
  }, [historicalReadingFor]);

  const preferredStartForDrop = useCallback((row: Partial<FSchedule>, day: DayKey, picked: string) => {
    const expectedMinute = expectedStartMinuteForDay(row, day);
    const match = String(picked || "").match(/^(\d{1,2}):(\d{2})$/);
    if (expectedMinute == null || !match) return picked;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (minute === expectedMinute) return picked;
    return `${String(hour).padStart(2, "0")}:${String(expectedMinute).padStart(2, "0")}`;
  }, [expectedStartMinuteForDay]);

  const historicalTimingNote = useCallback((row: Partial<FSchedule>): string | null => {
    const active = days.filter(day => Boolean((row as any)[day.key]));
    if (!active.length || !row.fstarttime) return null;
    const start = String(row.fstarttime || "").slice(0, 5);
    const end = String(row.fendtime || "").slice(0, 5);
    const startMinutes = mins(start), endMinutes = mins(end);
    const duration = endMinutes > startMinutes ? endMinutes - startMinutes : 0;

    /**
     * A large course can have many perfectly normal clocks. "Most common" is
     * not the same as "only normal". A start/duration is accepted when the
     * course itself has repeated evidence for it over the ten-year window.
     * Instructor identity is deliberately absent from this decision.
     */
    const isSupported = (samples: number, share: number) =>
      samples >= 4 || (samples >= 2 && share >= 0.06);

    for (const day of active) {
      const reading = historicalReadingFor(row, day.key as DayKey);
      const learned = reading.data;
      const courseBased = reading.basis === "course-pattern" || reading.basis === "course";

      if (courseBased && learned && learned.samples >= 4) {
        const exactStart = (learned.starts || []).find(item => item.time === start);
        const acceptedStart = Boolean(exactStart && isSupported(exactStart.samples, exactStart.share));

        const exactDuration = duration > 0
          ? (learned.durations || []).find(item => Number(item.minutes) === duration)
          : null;
        const acceptedDuration = !duration || Boolean(exactDuration && isSupported(exactDuration.samples, exactDuration.share));

        // If both values are established in this course's own history there is
        // nothing useful to tell the user, even when another start is #1.
        if (acceptedStart && acceptedDuration) continue;

        if (!acceptedStart && learned.samples >= 8 && (learned.starts || []).length) {
          const normalStarts = (learned.starts || [])
            .filter(item => isSupported(item.samples, item.share))
            .slice(0, 5)
            .map(item => displayClockCompact(item.time));
          if (normalStarts.length) {
            return `سجل المقرر نفسه خلال 10 سنوات لا يُظهر ${day.label} عند ${isolateLtrText(start)} ضمن أوقاته المتكررة. الأوقات المثبتة تاريخياً لهذا المقرر تشمل ${normalStarts.map(isolateLtrText).join("، ")}. راجع اللائحة إن كان هذا الاستثناء مقصوداً.`;
          }
        }

        if (!acceptedDuration && duration > 0 && learned.durationSamples >= 6 && (learned.durations || []).length) {
          const normalDurations = (learned.durations || [])
            .filter(item => isSupported(item.samples, item.share))
            .slice(0, 4)
            .map(item => `${item.minutes.toLocaleString("ar-KW-u-nu-latn")} دقيقة`);
          if (normalDurations.length) {
            return `مدة ${duration.toLocaleString("ar-KW-u-nu-latn")} دقيقة غير مثبتة بما يكفي في سجل هذا المقرر على ${day.label}. المدد المتكررة تاريخياً: ${normalDurations.join("، ")}.`;
          }
        }

        // Course history exists but is not decisive: silence is safer than a
        // weak warning. The regulation layer below still performs its own check.
        continue;
      }
    }

    // With no reliable course-specific history, only a real institutional
    // duration mismatch deserves a note. We do not invent a preferred start.
    if (duration > 0) {
      const selectedKeys = active.map(item => item.key as RegDayKey);
      const institutional = adviseDayPattern(selectedKeys, start, end);
      if (institutional?.family === "mixed") return institutional.note;
      if (institutional?.changed) {
        return `${institutional.note} الفترة المدخلة ${isolateLtrText(formatScheduleTimeRange(start, end))}.`;
      }
    }
    return null;
  }, [historicalReadingFor]);

  const chooseHistoricalDropTime = useCallback(async (row: Partial<FSchedule>, day: DayKey, picked: string) => {
    const preferred = preferredStartForDrop(row, day, picked);
    if (preferred === picked) return picked;
    const dayLabel = days.find(item => item.key === day)?.label || "هذا اليوم";
    const reading = historicalReadingFor(row, day);
    const source = reading.data
      ? (reading.basis === "course-pattern" ? "المقرر + نمط الأيام" : reading.basis === "course" ? "سجل المقرر" : reading.basis === "pattern" ? "نمط الأيام" : "سجل القسم الحديث")
      : "القاعدة المؤسسية";
    const decision = await askHistoricalTimeChoice({ dayLabel, picked, preferred, source });
    if (decision === "cancel") return null;
    return decision === "picked" ? picked : preferred;
  }, [preferredStartForDrop, historicalReadingFor, askHistoricalTimeChoice]);
  useEffect(() => {
    if (mode !== "copy" || isPowerAdmin || !sections.length) return;
    const next = coerceScopeValues(scopes, copyCollege, copySection, false);
    if (next.collegeId !== copyCollege) setCopyCollege(next.collegeId);
    if (next.sectionId !== copySection) setCopySection(next.sectionId);
  }, [mode, isPowerAdmin, sections.length, scopes, copyCollege, copySection]);
  const markPendingWrites = useCallback((ids: number[], pending: boolean) => {
    if (!ids.length) return;
    setPendingWriteIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => {
        if (pending) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }, []);
  const stampDecisionFingerprint = useCallback((payload: DecisionFingerprint | null) => {
    setDecisionFingerprint(payload);
  }, []);

  const openCreate = (seed?: CreateSeed) => {
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
      // Scope is inherited only when the user has explicitly activated the
      // board. Never revive a saved college/term behind an empty selector.
      const preferredCollege = Number(filterCollege) || 0;
      const preferredSection = Number(filterSection) || 0;
      const scoped = preferredCollege ? coerceScopeValues(scopes, preferredCollege, preferredSection, isPowerAdmin) : { collegeId: 0, sectionId: 0 };
      next.AdCollegeId = scoped.collegeId;
      next.AdSectionId = scoped.sectionId || (scoped.collegeId ? resolveScopeSelection(scopes, scoped.collegeId, isPowerAdmin).defaultSectionId || 0 : 0);
      next.AdTermId = Number(filterTerm) || 0;
      // Started from an empty square in the week: its day decides the timetable
      // duration (50 minutes on Sun/Tue/Thu, 80 on Mon/Wed).
      if (seed?.day) {
        days.forEach(day => { (next as any)[day.key] = day.key === seed.day; });
      }
      if (seed?.roomCode !== undefined) next.AdRoomCode = seed.roomCode;
      if (seed?.roomHall !== undefined) next.AdRoomHall = seed.roomHall;
      if (seed?.start) {
        next.fstarttime = seed.start;
        const seededMinutes = seed.day ? expectedMinutesForDay(seed.day as RegDayKey) : 50;
        next.fendtime = seed.end && mins(seed.end) > mins(seed.start)
          ? seed.end
          : timeFromMins(Math.min(SCHEDULE_DAY_END, mins(seed.start) + seededMinutes));
      }
      // A tap paints one cell, which follows the selected day family.
      if (seed?.end && seed.start && mins(seed.end) - mins(seed.start) <= 30) {
        next.fendtime = timeFromMins(Math.min(SCHEDULE_DAY_END, mins(seed.start) + (seed.day ? expectedMinutesForDay(seed.day as RegDayKey) : 50)));
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
    openDecisionRows = (queue: FSchedule[]) => {
      const ids = [...new Set(queue.map(row => Number(row.id)).filter(Boolean))];
      if (!ids.length) return;
      setDecisionEditQueue({ ids, index: 0 });
      const first = rows.find(row => row.id === ids[0]) || queue[0];
      if (first) openEdit(first);
    },
    back = () => {
      setDecisionEditQueue(null);
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
  const revealHallOccupant = (occupant: FSchedule) => {
    const rowId = Number(occupant?.id || 0);
    if (!rowId) return;
    setHallBusyPreview(null);
    back();
    setQuickSearch("");
    setViewMode("week");
    setReviewFocus(new Set([rowId]));
    let attempts = 0;
    const seek = () => {
      window.requestAnimationFrame(() => {
        const card = document.querySelector<HTMLElement>(`.week-event[data-row-id="${rowId}"], [data-row-id="${rowId}"]`);
        if (!card && attempts++ < 30) { window.setTimeout(seek, 35); return; }
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
          card.setAttribute("data-hall-reveal", "true");
          window.setTimeout(() => card.removeAttribute("data-hall-reveal"), 2200);
        }
        window.setTimeout(() => { void openContext(occupant); }, card ? 260 : 0);
      });
    };
    seek();
  };
  const setNumber = (key: keyof typeof form, raw: string) =>
    setForm((prev) => ({ ...prev, [key]: Number(raw) || 0 }));
  const englishDigits = (v: string) => /^\d*$/.test(normalizeArabicDigits(v));
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
      room: String(seed.roomCode ?? last?.AdRoomCode ?? savedPrefs.lastRoomCode ?? ""),
      hall: String(seed.roomHall ?? last?.AdRoomHall ?? savedPrefs.lastRoomHall ?? ""),
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
    if (!withinScheduleDay(from, to)) return `الوقت خارج اليوم الدراسي (${formatScheduleTimeRange(SCHEDULE_DAY_START_TIME, SCHEDULE_DAY_END_TIME)}).`;
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
  const editorReviewFindings = useMemo(() => {
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
  const editorRegulation = useMemo(() => editorReviewFindings.filter(isDecision1912Finding), [editorReviewFindings]);
  const editorSupplementalReview = useMemo(() => editorReviewFindings.filter(finding => !isDecision1912Finding(finding)), [editorReviewFindings]);
  const timeRangeInvalid = Boolean(form.fstarttime&&form.fendtime)&&mins(form.fendtime)<=mins(form.fstarttime);
  const outsideTeachingDay = Boolean(form.fstarttime && form.fendtime) && !timeRangeInvalid &&
    !withinScheduleDay(mins(form.fstarttime), mins(form.fendtime));
  const validationIssues=[
    !selectedFormDays.length?"يجب اختيار يوم واحد على الأقل للمحاضرة.":"",
    timeRangeInvalid?"وقت النهاية يجب أن يكون بعد وقت البداية.":"",
    outsideTeachingDay?`وقت المحاضرة يجب أن يكون بين ${scheduleClockForDisplay(SCHEDULE_DAY_START_TIME)} و${scheduleClockForDisplay(SCHEDULE_DAY_END_TIME)}.`:"",
  ].filter(Boolean);
  const blockingConflicts=conflicts.filter(c=>c?.severity==="high"||c?.type==="duplicate");
  const editorTimingNote = historicalTimingNote(form);
  const formDurationMinutes = form.fstarttime && form.fendtime ? Math.max(0, mins(form.fendtime) - mins(form.fstarttime)) : 0;
  const currentInstructorName = instructorById.get(Number(form.AdInstructorId || 0))?.AdInstructorName || "";
  const currentRoomLabel = form.AdRoomCode && form.AdRoomHall ? `${form.AdRoomCode}/${form.AdRoomHall}` : "";
  const selectedDaySummary = selectedFormDays.map(day => day.label).join(" / ");
  const hallAvailabilityReady = Boolean(selectedFormDays.length && form.fstarttime && form.fendtime && !timeRangeInvalid);
  const hallAvailability = useMemo(() => {
    const building = normalizeRoomToken(form.AdRoomCode);
    const start = form.fstarttime ? mins(form.fstarttime) : 0;
    const end = form.fendtime ? mins(form.fendtime) : 0;
    return hallOptions.map(hall => {
      const hallKey = normalizeRoomToken(hall);
      const occupants = hallAvailabilityReady ? rows.filter(row => {
        if (editId && Number(row.id) === Number(editId)) return false;
        if (form.AdTermId && row.AdTermId && Number(row.AdTermId) !== Number(form.AdTermId)) return false;
        if (normalizeRoomToken(row.AdRoomCode) !== building || normalizeRoomToken(row.AdRoomHall) !== hallKey) return false;
        const sharesDay = selectedFormDays.some(day => Boolean((row as any)[day.key]));
        if (!sharesDay) return false;
        const otherStart = mins(row.fstarttime);
        const otherEnd = mins(row.fendtime);
        return otherStart < end && otherEnd > start;
      }) : [];
      return { hall, occupied: occupants.length > 0, occupants };
      /* Free halls lead — that is what this chooser is for — and within each
         group the halls run in their own numeric order. */
    }).sort((a, b) => Number(a.occupied) - Number(b.occupied) || byRoomPart(a.hall, b.hall));
  }, [hallOptions, hallAvailabilityReady, rows, editId, form.AdRoomCode, form.AdTermId, form.fstarttime, form.fendtime, selectedFormDays]);
  const availableHallCount = hallAvailability.filter(item => !item.occupied).length;
  const busyHallCount = hallAvailability.filter(item => item.occupied).length;
  const editorConflictCards = useMemo(() => conflicts.map((conflict: any, index: number) => {
    const other = rows.find(row => Number(row.id) === Number(conflict.otherId || conflict.rowId || -1));
    const detail = String(conflict?.detail || "").replace(/\s+/g, " ").trim();
    const isScope = conflict.type === "roomScope";
    const isRoom = conflict.type === "room" || isScope || conflict.type === "hallBarter" || conflict.type === "hallBarterWindow";
    const isInstructor = conflict.type === "instructor";
    const typeLabel = isRoom ? (isScope ? "نطاق القاعة" : "تعارض قاعة") : isInstructor ? "تعارض أستاذ" : conflict.type === "duplicate" ? "تكرار" : "ملاحظة";
    const statusLabel = isScope ? "تنبيه" : "مانع";
    const currentStart = form.fstarttime ? mins(form.fstarttime) : null;
    const currentEnd = form.fendtime ? mins(form.fendtime) : null;
    const otherStart = other?.fstarttime ? mins(other.fstarttime) : null;
    const otherEnd = other?.fendtime ? mins(other.fendtime) : null;
    const hasTimeline = currentStart != null && currentEnd != null && otherStart != null && otherEnd != null;
    const axisStart = hasTimeline ? Math.min(currentStart as number, otherStart as number) : null;
    const axisEnd = hasTimeline ? Math.max(currentEnd as number, otherEnd as number) : null;
    const axisSpan = hasTimeline ? Math.max(30, (axisEnd as number) - (axisStart as number)) : 0;
    const toPct = (value: number) => hasTimeline ? ((value - (axisStart as number)) / axisSpan) * 100 : 0;
    const overlapStart = hasTimeline ? Math.max(currentStart as number, otherStart as number) : null;
    const overlapEnd = hasTimeline ? Math.min(currentEnd as number, otherEnd as number) : null;
    const overlap = overlapStart != null && overlapEnd != null && overlapEnd > overlapStart
      ? { start: toPct(overlapStart), width: Math.max(toPct(overlapEnd) - toPct(overlapStart), 6) }
      : null;
    const otherCourse = other?.AdCourseName || (other ? courseById.get(Number(other.AdCourseId || 0))?.CourseName : "") || "";
    const roomLabel = currentRoomLabel || (other?.AdRoomCode && other?.AdRoomHall ? `${other.AdRoomCode}/${other.AdRoomHall}` : "");
    let title = conflict.message || "يوجد مانع للحفظ";
    let titleSecondary = "";
    let summary = detail;
    if (isInstructor) {
      title = `الأستاذ: ${currentInstructorName || other?.AdInstructorName || title.replace(/^الأستاذ\s*/, "").replace(/\s*لديه.*$/, "") || "—"}`;
      titleSecondary = "لديه محاضرة متداخلة";
      summary = otherCourse || detail;
    } else if (conflict.type === "room") {
      title = `القاعة ${roomLabel || "—"} مشغولة`;
      summary = otherCourse || detail;
    } else if (isScope) {
      title = conflict.message || `القاعة ${roomLabel || "—"} خارج النطاق`;
      summary = detail || "القاعة تخص نطاقاً آخر؛ المتابعة ممكنة بعد المراجعة.";
    } else if (conflict.type === "duplicate") {
      title = "يوجد موعد مطابق تماماً";
      titleSecondary = "لنفس المقرر والشعبة";
      summary = detail || "نفس الأيام ونفس الوقت.";
    } else if (conflict.type === "hallBarter") {
      title = `القاعة ${roomLabel || "—"} محجوزة رقمياً`;
      titleSecondary = "عبر استعارة القاعات";
      summary = detail;
    } else if (conflict.type === "hallBarterWindow") {
      title = conflict.message || "الموعد يتجاوز نافذة الاستعارة";
      summary = detail;
    }
    const lines = hasTimeline ? [
      {
        label: isInstructor ? (otherCourse || "محاضرة أخرى") : "الحجز الآخر",
        range: formatScheduleTimeRange(other?.fstarttime, other?.fendtime),
        start: toPct(otherStart as number),
        width: Math.max(toPct(otherEnd as number) - toPct(otherStart as number), 8),
        tone: "other",
      },
      {
        label: "المقرر الحالي",
        range: formatScheduleTimeRange(form.fstarttime, form.fendtime),
        start: toPct(currentStart as number),
        width: Math.max(toPct(currentEnd as number) - toPct(currentStart as number), 8),
        tone: "current",
      },
    ] : [];
    return {
      id: `${conflict.type}-${conflict.rowId || conflict.otherId || index}`,
      toneClass: isScope ? "decision-card--scope" : conflict.type === "duplicate" ? "decision-card--warning" : "decision-card--danger",
      typeLabel,
      statusLabel,
      icon: isRoom ? "room" : isInstructor ? "teacher" : "stack",
      title,
      titleSecondary,
      summary,
      supporting: selectedDaySummary || (other ? arabicDays(other) : ""),
      axisStart: axisStart != null ? displayClockCompact(timeFromMins(axisStart)) : "",
      axisEnd: axisEnd != null ? displayClockCompact(timeFromMins(axisEnd)) : "",
      overlap,
      lines,
    };
  }), [conflicts, rows, form.fstarttime, form.fendtime, currentInstructorName, currentRoomLabel, selectedDaySummary, courseById]);
  const editorTimingVisualDays = useMemo(() => {
    const startMinute = String(form.fstarttime || "").match(/^(\d{1,2}):(\d{2})$/) ? Number(String(form.fstarttime || "").split(":")[1]) : null;
    return days.map(day => {
      const active = Boolean((form as any)[day.key]);
      const expectedMinute = active ? expectedStartMinuteForDay(form, day.key as DayKey) : null;
      let state: "inactive" | "match" | "off" | "active" = active ? "active" : "inactive";
      if (active && startMinute != null && expectedMinute != null) state = startMinute === expectedMinute ? "match" : "off";
      const preferredStart = active && form.fstarttime ? preferredStartForDrop(form, day.key as DayKey, String(form.fstarttime || "")) : "";
      const cue = active ? displayClockCompact(preferredStart || String(form.fstarttime || "")) : "—";
      const icon = !active ? "inactive" : state === "match" ? "match" : "off";
      return { key: day.key, label: day.label, state, cue, icon, active };
    });
  }, [form, expectedStartMinuteForDay, preferredStartForDrop]);
  const editorTimingReviewCard = useMemo(() => {
    const historicalFindings = editorSupplementalReview.filter(finding => finding.source === "history");
    const details = historicalFindings
      .map(finding => String(finding.detail || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (editorTimingNote) {
      const timingDetail = String(editorTimingNote).replace(/^ملاحظة التوقيت:\s*/, "").replace(/\s+/g, " ").trim();
      if (timingDetail) details.push(timingDetail);
    }
    const uniqueDetails = [...new Set(details)];
    if (!uniqueDetails.length) return null;
    return {
      rule: "historical-course-pattern",
      article: "سجل المقرر + اللائحة",
      severity: "low",
      source: "history",
      approvalEffect: "note",
      title: "خارج المعتاد تاريخياً",
      detail: uniqueDetails.join(" — "),
      rowIds: editId ? [editId] : [],
      icon: "history",
      sourceLabel: "السجل التاريخي",
    };
  }, [editorTimingNote, editorSupplementalReview, editId]);
  const editorRegulationCards = useMemo(() => editorRegulation.map((finding, index) => {
    const detail = String(finding.detail || "").replace(/\s+/g, " ").trim();
    const ruleIcon = finding.rule === "rotation" ? "history" : finding.rule === "consecutive-sections" ? "idea" : finding.rule === "sections-same-hour" ? "room" : index % 2 ? "room" : "idea";
    return {
      ...finding,
      detail,
      icon: ruleIcon,
      metric: parseRegulationMetric(`${finding.title} ${detail}`),
      currentDurationLabel: formDurationMinutes ? `${formDurationMinutes.toLocaleString("ar-KW-u-nu-latn")} د` : "—",
      selectedDaysLabel: selectedFormDays.length ? selectedFormDays.length.toLocaleString("ar-KW-u-nu-latn") : "0",
    };
  }), [editorRegulation, formDurationMinutes, selectedFormDays.length]);
  const editorSupplementalCards = useMemo(() => {
    // Historical timing is one concept. Never show two cards for the same draft.
    const cards = editorSupplementalReview
      .filter(finding => finding.source !== "history")
      .map((finding, index) => ({
        ...finding,
        detail: String(finding.detail || "").replace(/\s+/g, " ").trim(),
        icon: index % 2 ? "room" : "idea",
        sourceLabel: finding.source === "department" ? "قرار القسم" : "جاهزية الاعتماد",
      }));
    return editorTimingReviewCard ? [editorTimingReviewCard, ...cards] : cards;
  }, [editorSupplementalReview, editorTimingReviewCard]);
  const editorRoomConflictCards = useMemo(() => editorConflictCards.filter(card => card.typeLabel === "تعارض قاعة" || card.typeLabel === "نطاق القاعة"), [editorConflictCards]);
  const editorInstructorConflictCards = useMemo(() => editorConflictCards.filter(card => card.typeLabel === "تعارض أستاذ"), [editorConflictCards]);
  const editorGenericConflictCards = useMemo(() => editorConflictCards.filter(card => card.typeLabel !== "تعارض قاعة" && card.typeLabel !== "نطاق القاعة" && card.typeLabel !== "تعارض أستاذ"), [editorConflictCards]);
  const hasEditorDecisionAccordions = Boolean(editorRoomConflictCards.length || editorInstructorConflictCards.length || editorRegulation.length || editorSupplementalCards.length || editorGenericConflictCards.length);
  const renderEditorConflictCard = (card: any) => (
    <article key={card.id} className={`decision-card ${card.toneClass}`}>
      <div className="decision-card-topline">
        <span className="decision-card-kicker">{card.typeLabel}</span>
        <em className="decision-card-flag">{card.statusLabel}</em>
      </div>
      <div className="decision-card-hero">
        <div className="decision-card-body">
          <strong className="decision-card-title">{card.title}</strong>
          {card.titleSecondary ? <strong className="decision-card-title decision-card-title--sub">{card.titleSecondary}</strong> : null}
          {card.summary ? <p className="decision-card-copy">{card.summary}</p> : null}
          {card.supporting ? <span className="decision-card-support">{card.supporting}</span> : null}
        </div>
        <div className="decision-card-icon" aria-hidden="true">
          {card.icon === "room" ? <Building2 /> : card.icon === "teacher" ? <UsersRound /> : <Layers />}
        </div>
      </div>
      {card.lines.length ? (
        <div className="decision-compare" aria-hidden="true">
          <div className="decision-compare-axis"><span dir="ltr">{card.axisStart}</span><span dir="ltr">{card.axisEnd}</span></div>
          <div className="decision-compare-tracks">
            {card.lines.map((line: any) => (
              <div key={`${card.id}-${line.label}`} className={`decision-line decision-line--${line.tone}`}>
                <div className="decision-line-head"><span>{line.label}</span><b dir="ltr">{line.range}</b></div>
                <div className="decision-line-track">
                  <span className="decision-line-bar" style={{ insetInlineStart: `${line.start}%`, inlineSize: `${line.width}%` }} />
                  {card.overlap ? <span className="decision-line-overlap" style={{ insetInlineStart: `${card.overlap.start}%`, inlineSize: `${card.overlap.width}%` }} /> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
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
      .map(room => [room.buildingKey, room.building] as const)).values()].sort(byRoomPart),
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
    return [...seen.values()].sort((a, b) => byRoom(a.building, a.hall, b.building, b.hall));
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
    replayAbortRef.current?.abort();
    replayAbortRef.current = null;
    replayRequestSeqRef.current += 1;
    setReplayLoading(false);
    setContextLoading(true);
    setContextTab("overview");
    setCommentText("");
    setContextSolutions([]);
    setReplay(null);
    moveNoteAbortRef.current?.abort();
    moveNoteAbortRef.current = null;
    moveNoteSeqRef.current += 1;
    replayPrimedRef.current = null;
    setMoveNote(null);
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
  const closeReplay = () => {
    replayAbortRef.current?.abort();
    replayAbortRef.current = null;
    replayRequestSeqRef.current += 1;
    setReplayLoading(false);
    setReplay(null);
  };
  useEffect(() => {
    const row = context?.selected;
    if (!row?.id) { setMoveNote(null); return; }
    let cancelled = false;
    const seq = ++moveNoteSeqRef.current;
    const cancelIdle = whenIdle(() => {
      if (cancelled || seq !== moveNoteSeqRef.current) return;
      const controller = new AbortController();
      moveNoteAbortRef.current = controller;
      void (async () => {
        try {
          const payload = await fetchJson(`/api/intelligence/replay/${row.id}`, { signal: controller.signal });
          if (cancelled || seq !== moveNoteSeqRef.current) return;
          const events: any[] = Array.isArray(payload?.events) ? payload.events : [];
          replayPrimedRef.current = { id: row.id, payload };
          const moves = events.filter(event => event?.type === "move").length;
          /* The most recent move that the archive can actually explain — an
             older one is true but stale, and the reader is asking about now. */
          const spoken = [...events].reverse().find(event => event?.why);
          setMoveNote(spoken ? { text: String(spoken.why), against: spoken.whyAgainst || undefined, moves } : null);
        } catch {
          /* Silence. A failed lookup and an unexplained move look the same to
             the reader, and neither is worth a line of apology in the panel. */
        } finally {
          if (moveNoteAbortRef.current === controller) moveNoteAbortRef.current = null;
        }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      cancelIdle();
      moveNoteAbortRef.current?.abort();
      moveNoteAbortRef.current = null;
    };
  }, [context?.selected?.id]);

  const loadReplay = async (row: FSchedule) => {
    replayAbortRef.current?.abort();
    const controller = new AbortController();
    replayAbortRef.current = controller;
    const requestSeq = ++replayRequestSeqRef.current;
    let timeoutReached = false;
    const timeoutId = window.setTimeout(() => { timeoutReached = true; controller.abort(); }, 6500);
    const currentPlace = [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") || "بدون قاعة";
    const currentDays = arabicDays(row) || "بدون أيام";
    const currentTime = formatScheduleTimeRange(row.fstarttime, row.fendtime);
    /* Already fetched while the panel sat idle — open on what we hold. */
    const primed = replayPrimedRef.current;
    if (primed && primed.id === row.id && primed.payload) {
      window.clearTimeout(timeoutId);
      controller.abort();
      setReplay({
        ...primed.payload,
        title: primed.payload?.title || row.AdCourseName || "الموعد الحالي",
        subtitle: primed.payload?.subtitle || `${currentDays} · ${currentTime} · ${currentPlace}`,
        summary: primed.payload?.summary || "تمت قراءة السجل التاريخي لهذا الموعد.",
        events: Array.isArray(primed.payload?.events) ? primed.payload.events : [],
        currentFacts: { days: currentDays, time: currentTime, place: currentPlace },
        emptyMessage: primed.payload?.emptyMessage || "لا توجد تغييرات تاريخية موثّقة لهذا الموعد حتى الآن.",
      });
      setReplayLoading(false);
      return;
    }
    setReplayLoading(true);
    setReplay({
      title: row.AdCourseName || "الموعد الحالي",
      subtitle: `${currentDays} · ${currentTime} · ${currentPlace}`,
      summary: "هذه قراءة فورية من الموعد الحالي. أستكمل الآن السجل التاريخي في الخلفية.",
      events: [],
      currentFacts: { days: currentDays, time: currentTime, place: currentPlace },
      emptyMessage: "القراءة الحالية جاهزة، ولم يصل بعد سجل تغييرات تاريخي موثّق لهذا الموعد.",
    });
    try {
      const payload = await fetchJson(`/api/intelligence/replay/${row.id}`, { signal: controller.signal });
      if (requestSeq !== replayRequestSeqRef.current) return;
      setReplay({
        ...payload,
        title: payload?.title || row.AdCourseName || "الموعد الحالي",
        subtitle: payload?.subtitle || `${currentDays} · ${currentTime} · ${currentPlace}`,
        summary: payload?.summary || "تمت قراءة السجل التاريخي لهذا الموعد.",
        events: Array.isArray(payload?.events) ? payload.events : [],
        currentFacts: { days: currentDays, time: currentTime, place: currentPlace },
        emptyMessage: payload?.emptyMessage || "لا توجد تغييرات تاريخية موثّقة لهذا الموعد حتى الآن. الوضع الحالي ظاهر أدناه بدل ترك الشاشة فارغة.",
      });
    } catch (e: any) {
      if (requestSeq !== replayRequestSeqRef.current) return;
      if (controller.signal.aborted && !timeoutReached) return;
      setReplay((current: any) => ({
        ...(current || {}),
        error: timeoutReached ? "انتهت مهلة جلب السجل التاريخي." : friendlyError(e),
        emptyMessage: timeoutReached
          ? "لم يصل السجل التاريخي خلال المهلة المحددة. أبقيت القراءة الحالية جاهزة ويمكنك إعادة المحاولة."
          : "تعذر جلب السجل التاريخي الآن. أبقيت بيانات الموعد الحالية ظاهرة ولم يتغير شيء في الجدول.",
        events: current?.events || [],
      }));
    } finally {
      window.clearTimeout(timeoutId);
      if (requestSeq === replayRequestSeqRef.current) {
        if (replayAbortRef.current === controller) replayAbortRef.current = null;
        setReplayLoading(false);
      }
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
  const rhythmSwitchForTarget = (row: FSchedule, day: DayKey) => {
    const carriedDays = days.filter(item => Boolean((row as any)[item.key])).map(item => item.key as DayKey);
    return carriedDays.length > 1 && !carriedDays.includes(day) ? patternForDay(day) : null;
  };

  const buildPhysicsTargetCandidate = (row: FSchedule, target: Pick<SchedulePhysicsTarget, "day" | "start" | "room">) => {
    const candidate = buildMoveCandidate(row, target);
    const rhythmSwitch = rhythmSwitchForTarget(row, target.day as DayKey);
    if (rhythmSwitch) {
      days.forEach(item => { (candidate as any)[item.key] = rhythmSwitch.includes(item.key as DayKey); });
      const originalDuration = Math.max(0, mins(row.fendtime) - mins(row.fstarttime));
      if (originalDuration <= 100) {
        candidate.fendtime = timeFromMins(Math.min(SCHEDULE_DAY_END, mins(candidate.fstarttime) + expectedMinutesForDay(target.day as RegDayKey)));
      }
    }
    if (target.room) {
      candidate.AdRoomCode = target.room.code;
      candidate.AdRoomHall = target.room.hall;
    }
    return candidate;
  };

  const localPhysicsBlockers = useCallback((source: FSchedule, probe: FSchedule) => {
    const samePlacement = (a: FSchedule, b: FSchedule) =>
      a.fstarttime === b.fstarttime && a.fendtime === b.fendtime &&
      days.every(day => Boolean((a as any)[day.key]) === Boolean((b as any)[day.key]));
    const combinedDelivery = (a: FSchedule, b: FSchedule) =>
      a.AdCourseId === b.AdCourseId && String(a.SCode) !== String(b.SCode) &&
      Boolean(a.AdInstructorId) && a.AdInstructorId === b.AdInstructorId &&
      sameRoom(a, b) && samePlacement(a, b);
    const blockers: Array<{ type: "instructor" | "room"; severity: "high"; message: string; detail: string }> = [];
    for (const other of rows) {
      if (other.id === source.id || other.AdTermId !== probe.AdTermId || combinedDelivery(probe, other)) continue;
      const sharesDay = days.some(day => Boolean((probe as any)[day.key]) && Boolean((other as any)[day.key]));
      const overlaps = mins(probe.fstarttime) < mins(other.fendtime) && mins(other.fstarttime) < mins(probe.fendtime);
      if (!sharesDay || !overlaps) continue;
      const detail = `${other.AdCourseName || courseById.get(other.AdCourseId)?.CourseName || "موعد آخر"} · ${formatScheduleTimeRange(other.fstarttime, other.fendtime)}`;
      if (probe.AdInstructorId && probe.AdInstructorId === other.AdInstructorId) {
        blockers.push({ type: "instructor", severity: "high", message: "الأستاذ مرتبط بموعد آخر", detail });
      }
      if ((probe.AdRoomCode || probe.AdRoomHall) && sameRoom(probe, other)) {
        blockers.push({ type: "room", severity: "high", message: "القاعة محجوزة في هذا الوقت", detail });
      }
    }
    return blockers;
  }, [rows, courseById]);

  const evaluatePhysicsTarget = async (
    row: FSchedule,
    target: SchedulePhysicsTarget,
    signal: AbortSignal,
  ): Promise<SchedulePhysicsDecision> => {
    const candidate = buildPhysicsTargetCandidate(row, target),
      payload: any = { ...candidate };
    delete payload.id;
    delete payload.AdCourseName;
    const key = `${row.id}:${target.day}:${target.start}:${physicsRoomKey(target.room) ?? "week"}`;
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
    const timingNote = historicalTimingNote(candidate);
    if (timingNote) {
      decision = {
        ...decision,
        summary: decision.hardBlocked ? decision.summary : `${decision.summary} ${timingNote}`,
        reasons: [timingNote, ...decision.reasons.filter(reason => reason !== timingNote)].slice(0, 4),
        tradeoffs: [timingNote, ...decision.tradeoffs.filter(reason => reason !== timingNote)].slice(0, 3),
      };
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
        setHallBusyPreview(null);
        // The editor is a whole page, not a drawer, so it has no close of its
        // own; Escape is the habit every other editor in the program already
        // answers to, and it must answer here too.
        if (editorRef.current !== "index") { backRef.current?.(); return; }
        setContext(null);
        if (focusMode) {
          // Leaving focus is transactional: if a drag/write is settling, keep
          // the focused canvas mounted until its verdict/conflict layer has had
          // a chance to render above the same board.
          setFocusExitPending(true);
        }
        if (presentationMode) setPresentationMode(false);
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
      // Focus magnifies the current workspace. It must never change the active
      // projection or discard room/day filters.
      setPresentationMode(false);
      setFocusMode(true);
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
    const traces: Array<{ key: string; dayKey: DayKey; top: number; height: number; label: string; roomKey: string; roomBuilding: string; roomHall: string; roomBuildingKey: string; roomHallKey: string; roomLabel: string; from: number; to: number }> = [];
    moves.forEach(({ before, after }) => {
      const sourceRoom = roomIdentity(before.AdRoomCode, before.AdRoomHall);
      const from = mins(before.fstarttime), to = mins(before.fendtime);
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
          key: `${d.key}-${sourceRoom.key}-${before.id}-${before.fstarttime}`,
          dayKey: d.key as DayKey,
          top: ((from - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H,
          height: Math.max(SLOT_H - 4, ((to - from) / SCHEDULE_SLOT_MINUTES) * SLOT_H - 3),
          label: before.AdCourseName || courseById.get(before.AdCourseId)?.CourseName || "الموعد",
          roomKey: sourceRoom.key,
          roomBuilding: sourceRoom.building,
          roomHall: sourceRoom.hall,
          roomBuildingKey: sourceRoom.buildingKey,
          roomHallKey: sourceRoom.hallKey,
          roomLabel: sourceRoom.label,
          from,
          to,
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
    if (!englishDigits(form.SCode)) { setError("الشعبة يجب أن تحتوي على أرقام فقط"); return; }
    if (validationIssues.length) { setScheduleTouched(true); setError(validationIssues[0]); return; }
    if (blockingConflicts.length) { setError(blockingConflicts[0]?.message || "لا يمكن الحفظ قبل معالجة التعارضات."); return; }
    const protectedPdfRow = editor === "edit" ? rows.find(row => row.id === editId) : null;
    if (protectedPdfRow && protectedPdfRow.sourceOrder !== undefined && Number(protectedPdfRow.sourceOrder) < 1_000_000 && Number(protectedPdfRow.AdCourseId) !== Number(form.AdCourseId)) {
      const remove = await visualConfirm({
        title: "اسم المقرر محمي وفق لائحة الجدول",
        message: "أنت تقوم بتبديل اسم المقرر الوارد في ملف PDF المعتمد، وهذا مخالف للائحة نظام الجدول. لا يمكن تغيير اسم المادة، لكن يمكنك حذفها كاملة ثم إضافة مقرر جديد. هل تريد حذف المادة الآن؟",
        confirmLabel: "حذف المادة",
        cancelLabel: "العودة دون تغيير",
        tone: "danger",
      });
      if (!remove) return;
      setSaving(true);
      try {
        await fetchJson(`/api/schedules/${protectedPdfRow.id}`, { method: "DELETE" });
        setRows(current => current.filter(row => row.id !== protectedPdfRow.id));
        setMessage("تم حذف المادة. يمكنك الآن إضافة المقرر الجديد، وسيظهر في تقرير المقارنة برقمه المرجعي فارغاً.");
        back();
      } catch (issue: any) { setError(issue?.message || "تعذر حذف المادة"); }
      finally { setSaving(false); }
      return;
    }
    if (practiceMode) {
      const before = editor === "edit" ? rows.find((row) => row.id === editId) : null;
      const practiceId = editor === "edit" ? Number(editId || 0) : -Math.max(1, Date.now() % 1_000_000_000);
      const nextRow = { ...(before || blank()), ...form, id: practiceId, AdCourseName: courseById.get(form.AdCourseId)?.CourseName || before?.AdCourseName || "" } as FSchedule;
      setRows(current => editor === "edit" ? current.map(item => item.id === practiceId ? nextRow : item) : [...current, nextRow].sort((a,b)=>a.id-b.id));
      setMessage("تم تطبيق التغيير داخل «وضع تجربة» فقط. لم يتغير جدولك الحقيقي.");
      setPhysicsNotice("تجربة آمنة · لا حفظ على الخادم");
      if (guideOperationRef.current?.featureId === "schedule.practice") emitGuideResult({ featureId:"schedule.practice", ok:true, signal:"schedule.practice.changed" });
      else recordFeatureEvent(Number(user?.SystemUserId || 0), "schedule.practice", "completed", { stepCount: 1 });
      back();
      return;
    }
    const saveStartedAt = Date.now();
    const guideOpAtSave = guideOperationRef.current;
    const trackedSaveFeatures:string[] = [];
    setSaving(true);
    try {
      const url =
        editor === "edit" ? `/api/schedules/${editId}` : "/api/schedules";
      const before = editor === "edit" ? rows.find((row) => row.id === editId) : null;
      if (before) {
        const dayChanged = days.some(dayItem => Boolean((before as any)[dayItem.key]) !== Boolean((form as any)[dayItem.key]));
        const timeChanged = dayChanged || String(before.fstarttime || "") !== String(form.fstarttime || "") || String(before.fendtime || "") !== String(form.fendtime || "");
        const courseChanged = Number(before.AdCourseId || 0) !== Number(form.AdCourseId || 0);
        const instructorChanged = Number(before.AdInstructorId || 0) !== Number(form.AdInstructorId || 0);
        const roomChanged = String(before.AdRoomCode || "") !== String(form.AdRoomCode || "") || String(before.AdRoomHall || "") !== String(form.AdRoomHall || "");
        if (timeChanged) trackedSaveFeatures.push("schedule.action.change-time");
        if (courseChanged) trackedSaveFeatures.push("schedule.action.change-course");
        if (instructorChanged) trackedSaveFeatures.push("schedule.action.change-instructor");
        if (roomChanged) trackedSaveFeatures.push("schedule.action.move-room");
        trackedSaveFeatures.forEach(featureId => {
          if (guideOpAtSave?.featureId === featureId) return;
          const trackingUserId = Number(user?.SystemUserId || 0);
          recordFeatureEvent(trackingUserId, featureId, "attempt");
          recordFeatureEvent(trackingUserId, featureId, "started");
          const journeyId = featureId === "schedule.action.change-time" ? "journey.schedule.change-time" : featureId === "schedule.action.change-course" ? "journey.schedule.change-course" : featureId === "schedule.action.change-instructor" ? "journey.schedule.change-instructor" : "journey.schedule.move-room";
          ensureGuideJourney(trackingUserId, journeyId);
          advanceGuideJourney(trackingUserId, journeyId, "schedule.row.selected");
          advanceGuideJourney(trackingUserId, journeyId, "schedule.editor.open");
          if (featureId === "schedule.action.change-time") advanceGuideJourney(trackingUserId, journeyId, "schedule.time.changed");
          else if (featureId === "schedule.action.change-course") advanceGuideJourney(trackingUserId, journeyId, "schedule.course.changed");
          else if (featureId === "schedule.action.change-instructor") advanceGuideJourney(trackingUserId, journeyId, "schedule.instructor.changed");
          else advanceGuideJourney(trackingUserId, journeyId, "schedule.move.destination.selected");
        });
      }
      const saved = await fetchJson(url, {
        method: editor === "edit" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        // The revision this editor opened. The server compares it and refuses
        // rather than overwriting a change someone else made meanwhile.
        body: JSON.stringify({ ...form, rev: editor === "edit" ? rows.find(row => row.id === editId)?.rev : undefined }),
      });
      let guideUndoId = "";
      if (editor === "edit" && before) {
        const { id: _id, AdCourseName: _name, ...previousValues } = before as any;
        guideUndoId = offerUndo(
          `تعديل ${before.AdCourseName || courseById.get(before.AdCourseId)?.CourseName || "موعد"}`,
          [{ method: "PUT", url: `/api/schedules/${editId}`, body: previousValues }],
        );
      } else if (editor !== "edit") {
        const createdId = Number(saved?.id || 0);
        if (createdId) {
          guideUndoId = offerUndo(
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
      const queuedOffline = Boolean((saved as any)?.queuedOffline);
      setMessage(queuedOffline ? "حُفظ التعديل محلياً وسيُزامن عند عودة الاتصال." : (editor === "edit" ? "تم حفظ التعديل" : "تم حفظ الموعد"));
      setPhysicsNotice([queuedOffline ? "بانتظار المزامنة" : "", editorTimingNote || ""].filter(Boolean).join(" · "));
      const guideOp = guideOperationRef.current;
      trackedSaveFeatures.forEach(featureId => {
        if (guideOp?.featureId === featureId) return;
        const trackingUserId = Number(user?.SystemUserId || 0);
        recordFeatureEvent(trackingUserId, featureId, "completed", { durationMs:Date.now()-saveStartedAt, stepCount:4, retries:0 });
        const journeyId = featureId === "schedule.action.change-time" ? "journey.schedule.change-time" : featureId === "schedule.action.change-course" ? "journey.schedule.change-course" : featureId === "schedule.action.change-instructor" ? "journey.schedule.change-instructor" : "journey.schedule.move-room";
        advanceGuideJourney(trackingUserId, journeyId, featureId === "schedule.action.move-room" ? "schedule.move.completed" : "schedule.edit.completed");
        completeGuideJourney(trackingUserId, journeyId);
      });
      if (guideOp && (guideOp.featureId === "schedule.action.change-time" || guideOp.featureId === "schedule.action.change-course" || guideOp.featureId === "schedule.action.change-instructor")) {
        emitGuideResult({
          featureId: guideOp.featureId,
          ok: true,
          signal: "schedule.edit.completed",
          transactionId: guideOp.transactionId,
          rollbackCommand: guideUndoId ? { scope:"schedule", type:"undoById", value:guideUndoId } : undefined,
          label: editor === "edit" ? "تعديل المقرر" : "إضافة الموعد",
          stepCount: 4,
        });
      }
      if (!queuedOffline && editor === "edit" && decisionEditQueue && decisionEditQueue.ids[decisionEditQueue.index] === Number(editId)) {
        const nextIndex = decisionEditQueue.index + 1;
        const nextId = decisionEditQueue.ids[nextIndex];
        if (nextId) {
          const nextRow = rows.find(row => row.id === nextId);
          if (nextRow) {
            setDecisionEditQueue({ ...decisionEditQueue, index: nextIndex });
            openEdit(nextRow);
            requestAnimationFrame(() => setMessage(`تم الحفظ · التالي ${nextIndex + 1} من ${decisionEditQueue.ids.length}`));
            return;
          }
        }
        setDecisionEditQueue(null);
        back();
        requestAnimationFrame(() => setMessage("تمت معالجة جميع المواعيد المرتبطة بهذه المشكلة."));
        return;
      }
      back();
    } catch (e: any) {
      const guideOp = guideOperationRef.current;
      trackedSaveFeatures.forEach(featureId => {
        if (guideOp?.featureId === featureId) return;
        const trackingUserId = Number(user?.SystemUserId || 0);
        recordFeatureEvent(trackingUserId, featureId, "failed", { durationMs:Date.now()-saveStartedAt, stepCount:4, retries:1 });
        const journeyId = featureId === "schedule.action.change-time" ? "journey.schedule.change-time" : featureId === "schedule.action.change-course" ? "journey.schedule.change-course" : featureId === "schedule.action.change-instructor" ? "journey.schedule.change-instructor" : "journey.schedule.move-room";
        failGuideJourney(trackingUserId, journeyId, featureId === "schedule.action.move-room" ? "schedule.move.failed" : "schedule.edit.failed");
      });
      if (guideOp && (guideOp.featureId === "schedule.action.change-time" || guideOp.featureId === "schedule.action.change-course" || guideOp.featureId === "schedule.action.change-instructor")) {
        emitGuideResult({ featureId:guideOp.featureId, ok:false, signal:"schedule.edit.failed", transactionId:guideOp.transactionId });
      }
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
      const timingNote = historicalTimingNote(payload);
      setPhysicsNotice(timingNote || "");
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
    if (!(await visualConfirm({
      title: practiceMode ? "حذف من النسخة التجريبية" : "حذف الموعد",
      message: practiceMode ? "سيُحذف هذا الموعد من النسخة التجريبية فقط دون المساس بالجدول الحقيقي." : "سيُحذف هذا الموعد من الجدول الحالي.",
      confirmLabel: practiceMode ? "حذف تجريبي" : "حذف",
      tone: "danger",
      compact: true,
    }))) return;
    if (practiceMode) {
      setRows(current => current.filter(item => item.id !== id));
      setMessage("تم الحذف داخل «وضع تجربة» فقط. لم يتغير جدولك الحقيقي.");
      if (guideOperationRef.current?.featureId === "schedule.practice") emitGuideResult({ featureId:"schedule.practice", ok:true, signal:"schedule.practice.changed" });
      else recordFeatureEvent(Number(user?.SystemUserId || 0), "schedule.practice", "completed", { stepCount: 1 });
      return;
    }
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
    if (!filterCollege || !filterTerm) {
      appliedScope.current = "";
      setRows([]);
      return;
    }
    if (appliedScope.current === `${filterCollege}|${filterSection}|${filterTerm}`) return;
    const timer = window.setTimeout(() => {
      setError(null);
      loadWorkspace(filterCollege, filterSection, filterTerm).catch((error: any) => setError(friendlyError(error)));
    }, 90);
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
    if (!(await visualConfirm({
      title: "استرجاع ما قبل النسخ",
      message: "سيتم استرجاع جدول الفصل الوجهة إلى حالته قبل آخر عملية نسخ.",
      confirmLabel: "استرجاع",
      tone: "warning",
    }))) return;
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
    const timingNote = historicalTimingNote(candidate);
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
      ? `\n\nRipple Forecast: ${decisionRipple.headline}${Array.isArray(decisionRipple.effects) ? `\n${decisionRipple.effects.map((x: any) => x.text).join("\n")}` : ""}`
      : "";
    if (
      !options?.skipConfirm &&
      !(await visualConfirm({
        title: "تأكيد نقل الموعد",
        message: `نقل موعد ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "المقرر"}${dayText} والوقت ${targetStart}؟${forecastNote}`,
        confirmLabel: "نقل",
        tone: "warning",
      }))
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
      setPhysicsNotice(timingNote || "");
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
    const pickedStart = target.start;
    const chosenStart = await chooseHistoricalDropTime(row, day, pickedStart);
    if (!chosenStart) {
      setPhysicsNotice("");
      return;
    }
    const effectiveTarget = chosenStart === pickedStart ? target : { ...target, start: chosenStart };
    // A whole selection travels together, keeping the shape it already had.
    const party = multiSelect.has(row.id)
      ? rows.filter(item => multiSelect.has(item.id))
      : [row];
    warnIfHeldElsewhere(party.map(item => item.id));
    const shift = mins(effectiveTarget.start) - mins(row.fstarttime);
    const sourceDay = (days.find(d => Boolean(row[d.key]))?.key || day) as DayKey;
    const dayChanged = sourceDay !== day;

    /**
     * Crossing rhythms is a real move, asked out loud.
     *
     * A Sunday-Tuesday-Thursday lecture dropped on Monday is not asking to
     * teach four days — it is asking to live on the other rhythm. When the
     * carried card has several days and the target day is outside them, the
     * whole day-set switches to the target's pattern (1-3-5 ⇄ 2-4), and its
     * duration follows the 50/80-minute family after one confirmation.
     */
    const carriedDays = days.filter(d => Boolean(row[d.key])).map(d => d.key as DayKey);
    const rhythmSwitch = rhythmSwitchForTarget(row, day);
    if (rhythmSwitch) {
      const fromLabels = carriedDays.map(k => days.find(d => d.key === k)?.label).join(" - ");
      const toLabels = rhythmSwitch.map(k => days.find(d => d.key === k)?.label).join(" - ");
      const title = row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "المحاضرة";
      if (!(await visualConfirm({ title: `تحويل نمط «${title}»`, message: `تُدرَّس ${fromLabels}.
نقلها إلى ${days.find(d => d.key === day)?.label} يحوّل أيامها كلها إلى نمط ${toLabels} ويضبط مدة اللقاء تلقائياً حسب اليوم.`, confirmLabel: "تحويل", tone: "warning" }))) {
        setPhysicsNotice("");
        return;
      }
    }

    const moves = party.map(item => {
      const singleDay = days.filter(d => Boolean(item[d.key])).length === 1;
      const start = item.id === row.id ? effectiveTarget.start : timeFromMins(mins(item.fstarttime) + shift);
      const candidate = buildMoveCandidate(item, { day, start });
      // Only the carried card changes day; the rest keep theirs and shift in time.
      if (item.id !== row.id && singleDay && dayChanged) {
        days.forEach(d => { (candidate as any)[d.key] = Boolean(item[d.key]); });
      }
      // The carried multi-day card takes the whole target rhythm.
      if (item.id === row.id && rhythmSwitch) {
        days.forEach(d => { (candidate as any)[d.key] = rhythmSwitch.includes(d.key as DayKey); });
        const originalDuration = Math.max(0, mins(item.fendtime) - mins(item.fstarttime));
        if (originalDuration <= 100) {
          candidate.fendtime = timeFromMins(Math.min(SCHEDULE_DAY_END, mins(candidate.fstarttime) + expectedMinutesForDay(day as RegDayKey)));
        }
      }
      return { before: item, after: candidate };
    });
    const moveTimingNotes = [...new Set(
      moves.map(move => historicalTimingNote(move.after)).filter((note): note is string => Boolean(note)),
    )];
    const leadAfter = moves.find(move => move.before.id === row.id)?.after || moves[0]?.after || row;
    const motionSignature = {
      before: `${arabicDays(row) || "بلا يوم"} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`,
      after: `${arabicDays(leadAfter) || (days.find(d => d.key === day)?.label || day)} · ${formatScheduleTimeRange(leadAfter.fstarttime, leadAfter.fendtime)}`,
      place: [leadAfter.AdRoomCode, leadAfter.AdRoomHall].filter(Boolean).join("/") || "بلا قاعة",
      partyCount: party.length,
    };

    // Anything that would land outside the day is not a move, it is a mistake.
    const outside = moves.find(m => mins(m.after.fstarttime) < gridWindow.start || mins(m.after.fendtime) > gridWindow.end);
    if (outside) {
      setPhysicsNotice("");
      setError("هذا الموضع يخرج عن ساعات اليوم؛ لم يتغير شيء.");
      return;
    }

    if (practiceMode) {
      const patched = new Map(moves.map(move => [move.before.id, move.after]));
      setRows(current => current.map(item => patched.get(item.id) || item));
      markChanged(row.id);
      leaveMoveTraces(moves);
      setPhysicsNotice("وضع تجربة · النقل محلي ومؤقت");
      setMessage("نجحت التجربة. لم يتغير جدولك الحقيقي.");
      if (guideOperationRef.current?.featureId === "schedule.practice") emitGuideResult({ featureId:"schedule.practice", ok:true, signal:"schedule.practice.changed" });
      else recordFeatureEvent(Number(user?.SystemUserId || 0), "schedule.practice", "completed", { stepCount: 1 });
      return;
    }

    const moveStartedAt = Date.now();
    const guideMoveActive = guideOperationRef.current?.featureId === "schedule.action.move-room";
    const guideUserId = Number(user?.SystemUserId || 0);
    recordFeatureEvent(guideUserId, "schedule.action.move-room", "attempt");
    recordFeatureEvent(guideUserId, "schedule.action.move-room", "started");
    if (!guideMoveActive) {
      ensureGuideJourney(guideUserId, "journey.schedule.move-room");
      advanceGuideJourney(guideUserId, "journey.schedule.move-room", "schedule.row.selected");
      if (viewMode === "rooms") advanceGuideJourney(guideUserId, "journey.schedule.move-room", "schedule.view.rooms.active");
      advanceGuideJourney(guideUserId, "journey.schedule.move-room", "schedule.move.destination.selected");
      advanceGuideJourney(guideUserId, "journey.schedule.move-room", "schedule.move.verified");
    }
    setSaving(true);
    setError(null);
    markPendingWrites(moves.map(move => move.before.id), true);
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
      setPhysicsNotice(moveTimingNotes.join(" · "));

      // Cleanup (Post-Move): Remove large status cards/banners at the top of the screen
      // (Decision Cards/Timing Notes inside the editor) after a move operation
      // to reduce visual pollution.
      if (editor !== "index") {
        setDecisionEditQueue(null);
        back();
      }

      const label = days.find(d => d.key === day)?.label || "";
      const movedIds = moves.map(m => m.before.id);
      const undoId = offerUndo(
        moves.length > 1
          ? `نُقل ${countOf(moves.length, AR.appointment)} إلى ${label} ${scheduleClockForDisplay(effectiveTarget.start)}`
          : `نُقل ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "الموعد"} إلى ${label} ${scheduleClockForDisplay(effectiveTarget.start)}`,
        moves.map(move => restoreStep(move.before)),
      );
      stampDecisionFingerprint({
        summary: request.decision?.summary || (moves.length > 1 ? `نقل جماعي إلى ${label} ${scheduleClockForDisplay(effectiveTarget.start)}` : `نقل إلى ${label} ${scheduleClockForDisplay(effectiveTarget.start)}`),
        before: motionSignature.before,
        after: motionSignature.after,
        place: motionSignature.place,
        quality: request.decision?.quality || "good",
        count: motionSignature.partyCount,
        when: Date.now(),
      });
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
        if (outcome?.queuedOffline) {
          setPhysicsNotice([moveTimingNotes.join(" · "), "حُفظ النقل محلياً · بانتظار المزامنة"].filter(Boolean).join(" · "));
        } else if (Array.isArray(outcome?.rows) && outcome.rows.length) {
          const confirmed = new Map<number, FSchedule>(outcome.rows.map((item: FSchedule) => [item.id, item]));
          setRows(current => current.map(item => confirmed.get(item.id) || item));
        }
        const guideOp = guideOperationRef.current;
        if (guideOp?.featureId === "schedule.action.move-room") {
          emitGuideResult({
            featureId:"schedule.action.move-room",
            ok:true,
            signal:"schedule.move.completed",
            transactionId:guideOp.transactionId,
            rollbackCommand:undoId ? { scope:"schedule", type:"undoById", value:undoId } : undefined,
            label:moves.length > 1 ? "نقل جماعي" : "نقل المقرر",
            stepCount:5,
          });
        } else {
          recordFeatureEvent(guideUserId, "schedule.action.move-room", "completed", { durationMs:Date.now()-moveStartedAt, stepCount:5, retries:0 });
          if (!guideMoveActive) {
            advanceGuideJourney(guideUserId, "journey.schedule.move-room", "schedule.move.completed");
            completeGuideJourney(guideUserId, "journey.schedule.move-room");
          }
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
      const guideOp = guideOperationRef.current;
      if (guideOp?.featureId === "schedule.action.move-room") emitGuideResult({ featureId:"schedule.action.move-room", ok:false, signal:"schedule.move.failed", transactionId:guideOp.transactionId });
      else {
        recordFeatureEvent(guideUserId, "schedule.action.move-room", "failed", { durationMs:Date.now()-moveStartedAt, stepCount:5, retries:Math.max(0,guideFailureTimesRef.current.length) });
        if (!guideMoveActive) failGuideJourney(guideUserId, "journey.schedule.move-room", "schedule.move.failed");
      }
      telemetryGuide("journey|schedule.action.move-room|5|commit|failed");
      // A refusal to overwrite is a decision to hand back, not a message to show.
      if (e?.revisionConflict) setClash({ current: e.current, yours: null });
      else {
        if (!presentMoveRefusal(e, Number(row?.id || 0), placementFieldKey(day, chosenStart, undefined))) setError(friendlyError(e));
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
      markPendingWrites(moves.map(move => move.before.id), false);
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
    start = await chooseHistoricalDropTime(row, day, start);
    if (!start) {
      setPhysicsNotice("");
      return;
    }
    const rhythmSwitch = rhythmSwitchForTarget(row, day);
    if (rhythmSwitch) {
      const carriedDays = days.filter(item => Boolean((row as any)[item.key])).map(item => item.key as DayKey);
      const fromLabels = carriedDays.map(key => days.find(item => item.key === key)?.label).join(" - ");
      const toLabels = rhythmSwitch.map(key => days.find(item => item.key === key)?.label).join(" - ");
      const title = row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "المحاضرة";
      if (!(await visualConfirm({
        title: `تحويل نمط «${title}»`,
        message: `تُدرَّس ${fromLabels}.
نقلها إلى ${days.find(item => item.key === day)?.label} يحوّل أيامها كلها إلى نمط ${toLabels} ويضبط مدة اللقاء تلقائياً حسب اليوم.`,
        confirmLabel: "تحويل",
        tone: "warning",
      }))) {
        setPhysicsNotice("");
        return;
      }
    }
    const target: SchedulePhysicsTarget = {
      day, start,
      label: days.find(item => item.key === day)?.label || "",
      room: { code: building, hall },
    };
    const after = buildPhysicsTargetCandidate(row, target);
    const unchanged =
      row.fstarttime === after.fstarttime && row.fendtime === after.fendtime &&
      roomIdentity(row.AdRoomCode, row.AdRoomHall).key === roomIdentity(after.AdRoomCode, after.AdRoomHall).key &&
      days.every(item => Boolean((row as any)[item.key]) === Boolean((after as any)[item.key]));
    if (unchanged) return;
    warnIfHeldElsewhere([row.id]);
    const dayPatternChanged = days.some(item => Boolean((row as any)[item.key]) !== Boolean((after as any)[item.key]));
    const roomMoveTimingNote = (row.fstarttime !== after.fstarttime || dayPatternChanged) ? historicalTimingNote(after) : null;
    setSaving(true);
    setError(null);
    markPendingWrites([row.id], true);
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
      setPhysicsNotice(roomMoveTimingNote || "");
      const place = [building, hall].filter(Boolean).join("/") || "بلا قاعة";
      const undoId = offerUndo(
        `نُقل ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "الموعد"} إلى ${place} ${start}`,
        [restoreStep(row)],
      );
      stampDecisionFingerprint({
        summary: `نقل داخل المباني والقاعات إلى ${place} ${start}`,
        before: `${arabicDays(row) || "بلا يوم"} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`,
        after: `${arabicDays(after) || (days.find(d => d.key === day)?.label || day)} · ${formatScheduleTimeRange(after.fstarttime, after.fendtime)}`,
        place,
        quality: "good",
        count: 1,
        when: Date.now(),
      });
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
              rev: row.rev,
              fields: {
                fsunday: Boolean((after as any).fsunday),
                fmonday: Boolean((after as any).fmonday),
                ftuesday: Boolean((after as any).ftuesday),
                fwednesday: Boolean((after as any).fwednesday),
                fthursday: Boolean((after as any).fthursday),
                fstarttime: after.fstarttime,
                fendtime: after.fendtime,
                AdRoomCode: after.AdRoomCode,
                AdRoomHall: after.AdRoomHall,
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
        if (roomMoveTimingNote) setPhysicsNotice("");
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
        // The source echo is optimistic just like the moved card. A refused
        // room drop must erase it too, otherwise the board claims a journey
        // that never happened.
        setMoveTraces([]);
        throw refusal;
      }
    } catch (e: any) {
      // A refusal to overwrite is a decision to hand back, not a message to show.
      if (e?.revisionConflict) setClash({ current: e.current, yours: null });
      else {
        if (!presentMoveRefusal(e, Number(row?.id || 0), placementFieldKey(day, start, physicsRoomKey({ code: building, hall })))) setError(friendlyError(e));
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
      markPendingWrites([row.id], false);
      setSaving(false);
    }
  };

  const undoPhysicsDecision = async () => {
    if (showMobileReadOnlyGate()) return;
    if (!isPowerAdmin || !undoPoint) return;
    if (
      !(await visualConfirm({
        title: undoPoint.decisionLabel || "استرجاع قرار النقل",
        message: "سيحفظ النظام نقطة أمان جديدة قبل التراجع.",
        confirmLabel: "استرجاع",
        tone: "warning",
      }))
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
  /** A finished term keeps its schedule, but loses the tools that only make
   *  sense while teaching is still ahead. */
  const selectedTermClosed = useMemo(
    () => isTermClosed(terms.find(term => term.AdTermId === filterTerm), terms),
    [terms, filterTerm],
  );

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
    const newest = Number(sortTermsNewest(terms)[0]?.AdTermId || 0);
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
      roomCode: string;
      roomHall: string;
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
          roomCode: String(row.AdRoomCode ?? "").trim(),
          roomHall: String(row.AdRoomHall ?? "").trim(),
          buildingKey: room.buildingKey,
          hallKey: room.hallKey,
          label: room.label,
        });
      }
    });
    const allRooms = [...roomsSeen.values()].sort(byRoomIdentity);
    const buildingCounts = new Map<string, number>();
    allRooms.forEach(room => buildingCounts.set(room.buildingKey, (buildingCounts.get(room.buildingKey) || 0) + 1));
    const allBuildings = [...new Map(allRooms
      .filter(room => room.buildingKey)
      .map(room => [room.buildingKey, { key: room.buildingKey, label: room.building, count: buildingCounts.get(room.buildingKey) || 0 }] as const)
    ).values()].sort((a, b) => byRoomPart(a.label, b.label));
    // One pass builds every room/day bucket. The full-week view therefore
    // costs one O(rows × five-days) index, not five complete room renders.
    const byDayRoom = new Map<string, FSchedule[]>();
    const noRoomByDay = new Map<DayKey, FSchedule[]>();
    const roomCounts = new Map<string, number>();
    filteredRows.forEach(row => {
      if (!row.fstarttime || !row.fendtime || mins(row.fendtime) <= mins(row.fstarttime)) return;
      const room = roomIdentity(row.AdRoomCode, row.AdRoomHall);
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
    /* One room/day can contain genuine clashes.  Those clashes must grow the
       row vertically instead of sitting on top of one another or forcing the
       time axis to lie about duration.  The horizontal coordinate remains the
       real clock; only a local vertical lane is added when two cards overlap. */
    const layoutTrackRows = (trackRows: FSchedule[]) => {
      const laneEnds: number[] = [];
      const items = trackRows
        .slice()
        .sort((a, b) => mins(a.fstarttime) - mins(b.fstarttime) || mins(a.fendtime) - mins(b.fendtime))
        .map(row => {
          const from = mins(row.fstarttime);
          const to = mins(row.fendtime);
          let lane = laneEnds.findIndex(endAt => endAt <= from);
          if (lane < 0) { lane = laneEnds.length; laneEnds.push(to); }
          else laneEnds[lane] = to;
          return { row, lane };
        });
      return { items, lanes: Math.max(1, laneEnds.length) };
    };
    const byDayRoomLayout = new Map<string, { items: Array<{ row: FSchedule; lane: number }>; lanes: number }>();
    byDayRoom.forEach((trackRows, key) => byDayRoomLayout.set(key, layoutTrackRows(trackRows)));
    const noRoomLayout = new Map<DayKey, { items: Array<{ row: FSchedule; lane: number }>; lanes: number }>();
    noRoomByDay.forEach((trackRows, key) => noRoomLayout.set(key, layoutTrackRows(trackRows)));
    const hourMarks: number[] = [];
    for (let m = gridWindow.start; m <= gridWindow.end; m += 60) hourMarks.push(m);
    if (hourMarks[hourMarks.length - 1] !== gridWindow.end) hourMarks.push(gridWindow.end);
    return {
      displayDays,
      allRooms,
      allBuildings,
      byDayRoom,
      byDayRoomLayout,
      noRoomLayout,
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
  const previousBoardViewRef = useRef(viewMode);
  useEffect(() => {
    const previous = previousBoardViewRef.current;
    if (previous === viewMode) return;
    previousBoardViewRef.current = viewMode;

    // Week and rooms are separate canvases. A room/building/day selection from
    // one projection must never leak into the other and make the next board look
    // partially filtered on arrival.
    if (viewMode === "week") {
      setMatrixDay("week");
      setMatrixBuildings(new Set());
      setMatrixRooms(new Set());
    } else if (viewMode === "rooms") {
      setExpandedDay(null);
      setReviewFocus(new Set());
      setMultiSelect(new Set());
      setPicking(false);
    }
  }, [viewMode]);
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
  const weekLayout = useMemo(() => {
    type Placed = { row: FSchedule; top: number; height: number; lane: number; span: number; lanes: number };
    const layout: Record<string, { items: Placed[]; busiest: number }> = {};

    const geometry = (row: FSchedule) => ({
      top: ((mins(row.fstarttime) - gridWindow.start) / SCHEDULE_SLOT_MINUTES) * SLOT_H,
      height: Math.max(SLOT_H - 4, ((mins(row.fendtime) - mins(row.fstarttime)) / SCHEDULE_SLOT_MINUTES) * SLOT_H - 3),
    });

    for (const day of days) {
      const all = weekRows
        .filter((item) => Boolean(item[day.key]) && item.fstarttime && item.fendtime)
        .slice()
        .sort((a, b) => mins(a.fstarttime) - mins(b.fstarttime) || mins(b.fendtime) - mins(a.fendtime));

      // Long workshops stay in the exact same horizontal card language as
      // every other lecture.  A previous rail treatment removed them from the
      // lane geometry and printed them vertically; that saved paper only by
      // creating a second reading system.  The adaptive day width below is the
      // place where density is solved now, so duration never changes identity.
      const items = all;

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
      const busiest = Math.max(1, peakConcurrency(all.map(item => ({ start: mins(item.fstarttime), end: mins(item.fendtime) }))));
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
            placed.push({ row: item, ...geometry(item), lane, span, lanes });
          }
        }
      }
      layout[day.key] = { items: placed, busiest };
    }
    return layout;
  }, [weekRows, gridWindow]);

  /**
   * Dense weeks stay literal.
   *
   * Every lecture remains a real card in the overview.  Crowding is solved by
   * giving the affected day enough horizontal paper for its actual peak lanes,
   * then making that wider canvas deliberately navigable.  We never replace a
   * lecture with a summary, rotate its text or shrink its identity into
   * microtype.
   */
  const weekDensity = useMemo(
    () => buildWeekDensityPlan(days.map(day => ({ key: day.key as DayKey, peak: weekLayout[day.key]?.busiest || 1 }))),
    [weekLayout],
  );

  /**
   * Where a card sits across the width of its day.
   *
   * The day owns enough paper for every lane to keep its readable floor.  The
   * same lane geometry is used in overview and focus; focus simply gives that
   * one day all of the width it needs instead of changing the card language.
   */
  const laneStyle = (placed: { lane: number; span: number; lanes: number }): React.CSSProperties => {
    if (placed.lanes <= 1) return {};
    const unit = `(100% / ${placed.lanes})`;
    return {
      insetInlineStart: `calc(${placed.lane} * ${unit} + 1px)`,
      insetInlineEnd: "auto",
      width: `calc(${placed.span} * ${unit} - 2px)`,
      zIndex: 20 + placed.lane,
    };
  };
  const weekGridStyle = useMemo(() => {
    const style: React.CSSProperties & Record<string, string | number> = {
      ["--week-overview-width"]: `${weekDensity.totalWidth}px`,
    };
    weekDensity.days.forEach((day, index) => {
      style[`--week-day-${index}`] = `${day.width}px`;
    });
    const focusPeak = expandedDay ? (weekLayout[expandedDay]?.busiest || 1) : 1;
    style["--week-focus-width"] = `${readableWeekDayWidth(focusPeak)}px`;
    return style;
  }, [weekDensity, expandedDay, weekLayout]);
  const weekStripConfig = useMemo(() => {
    const durations = weekRows
      .map(row => mins(row.fendtime) - mins(row.fstarttime))
      .filter(duration => Number.isFinite(duration) && duration > 0);
    const minDuration = durations.length ? Math.min(...durations) : 50;
    const hourWidth = readableWeekStripHourWidth(minDuration);
    // 20:00 is a hard visual boundary. Readability is solved vertically by the
    // adaptive identity card, never by borrowing pixels beyond the lecture's
    // actual end time.
    const visualEnd = SCHEDULE_DAY_END;
    const terminalPad = 0;
    // Only the final academic hour gets a little more paper. 19:00–20:00 is
    // 14px wider than the other hours, but 20:00 stays a hard boundary.
    const terminalHourBonus = 86;
    const terminalHourStart = Math.max(gridWindow.start, visualEnd - 30);
    const spanMinutes = Math.max(SCHEDULE_SLOT_MINUTES, visualEnd - gridWindow.start);
    const timeWidth = Math.round((spanMinutes / 60) * hourWidth) + terminalHourBonus;
    const timelineWidth = timeWidth;
    const labelWidth = 96;
    // The identity is now a literal single-line row, so density can be paid for
    // by geometry rather than typography.
    const laneHeight = 38;
    const cardHeight = 27;
    const compactTwoLineHeight = 36;
    const gutter = 4;
    const canvasWidth = labelWidth + timelineWidth;
    const peaks = days.map(day => ({ peak: weekLayout[day.key]?.busiest || 1 }));
    const dense = shouldUseWeekStrips(peaks, weekDensity.totalWidth);
    return { minDuration, hourWidth, visualEnd, terminalPad, terminalHourBonus, terminalHourStart, spanMinutes, timeWidth, timelineWidth, labelWidth, laneHeight, cardHeight, compactTwoLineHeight, gutter, canvasWidth, dense };
  }, [weekRows, gridWindow, weekLayout, weekDensity.totalWidth]);
  const denseWeekStrips = weekStripConfig.dense && !experience.ghostEnabled;
  const weekStripStyle = useMemo(() => ({
    ["--week-overview-width" as any]: `${weekStripConfig.canvasWidth}px`,
    ["--week-strip-canvas" as any]: `${weekStripConfig.canvasWidth}px`,
    ["--week-strip-label" as any]: `${weekStripConfig.labelWidth}px`,
    ["--week-strip-timeline" as any]: `${weekStripConfig.timelineWidth}px`,
    ["--week-strip-lane" as any]: `${weekStripConfig.laneHeight}px`,
    ["--week-strip-card" as any]: `${weekStripConfig.cardHeight}px`,
    ["--week-strip-hour" as any]: `${weekStripConfig.hourWidth}px`,
    ["--week-strip-terminal-pad" as any]: `${weekStripConfig.terminalPad}px`,
  }) as React.CSSProperties, [weekStripConfig]);

  const weekTopScrollRef = useRef<HTMLDivElement | null>(null);
  const weekRulerScrollRef = useRef<HTMLDivElement | null>(null);
  const weekMainScrollRef = useRef<HTMLDivElement | null>(null);
  const roomsRulerScrollRef = useRef<HTMLDivElement | null>(null);
  const roomsMainScrollRef = useRef<HTMLDivElement | null>(null);
  /*
   * One timeline, several scrollers.
   *
   * Week and Rooms both draw a single horizontal timeline across stacked
   * surfaces: a slim proxy scrollbar above, a sticky hour ruler, and the grid
   * itself. They have to move as one — but they are *not* interchangeable.
   * The grid reserves a scrollbar gutter the ruler does not, so its scrollable
   * range is about a dozen pixels longer. Mirroring an offset a shorter
   * surface cannot reach makes the browser clamp it silently.
   *
   * The previous mirror handed "ownership" to whichever surface scrolled last
   * and released it on a 150ms timer. That is the bug the user filmed: the
   * clamped follower kept its own, shorter offset, and the first scroll event
   * that arrived after the timer expired — the tail of a trackpad fling, a
   * scrollbar reflow, anything — made the follower the new owner and wrote its
   * clamped offset back into the surface the hand had just dragged. The grid
   * drifted to the right on its own after the gesture had ended.
   *
   * So ownership is not timed any more; it is not needed at all. Every
   * programmatic write remembers the offset the follower *actually landed on*,
   * and the scroll event that write provokes is recognised by that offset and
   * dropped. A mirrored surface can therefore never become a source, and no
   * clamped value can ever travel back upstream. Only a hand moves the grid.
   */
  /** Where the mirror last parked each surface. A surface still sitting on
   *  that offset was put there by us, so its scroll events are echoes — not a
   *  hand. The entry survives until the surface genuinely moves elsewhere,
   *  which is what keeps a follower parked at its clamped end from being read
   *  as a new gesture every time the browser re-fires its scroll event. */
  const scrollEchoRef = useRef<WeakMap<Element, number>>(new WeakMap());
  const mirrorHorizontalScroll = (source: HTMLElement | null | undefined, targets: Array<HTMLElement | null>) => {
    if (!source) return;
    const echo = scrollEchoRef.current;
    const value = source.scrollLeft;
    const driven = echo.get(source);
    if (driven !== undefined && Math.abs(driven - value) <= 1) return;
    echo.delete(source);
    for (const target of targets) {
      if (!target || target === source) continue;
      if (Math.abs(target.scrollLeft - value) > 1) target.scrollLeft = value;
      // Record where it *actually* landed, not what we asked for: a surface
      // with a shorter range clamps, and the clamped offset is the one its own
      // scroll event will report.
      echo.set(target, target.scrollLeft);
    }
  };
  const syncWeekScroll = (source: "top" | "ruler" | "main", _value?: number) => {
    const element = source === "top"
      ? weekTopScrollRef.current
      : source === "ruler"
        ? weekRulerScrollRef.current
        : weekMainScrollRef.current;
    mirrorHorizontalScroll(element, [weekTopScrollRef.current, weekRulerScrollRef.current, weekMainScrollRef.current]);
  };
  const syncRoomsScroll = (source: "ruler" | "main", _value?: number) => {
    const element = source === "ruler" ? roomsRulerScrollRef.current : roomsMainScrollRef.current;
    mirrorHorizontalScroll(element, [roomsRulerScrollRef.current, roomsMainScrollRef.current]);
  };

  const weekStripHourMarks = useMemo(() => {
    const marks: number[] = [];
    for (let mark = gridWindow.start; mark <= weekStripConfig.visualEnd; mark += 60) marks.push(mark);
    if (marks[marks.length - 1] !== weekStripConfig.visualEnd) marks.push(weekStripConfig.visualEnd);
    return marks;
  }, [gridWindow.start, weekStripConfig.visualEnd]);
  const weekStripOffset = (minutesAt: number) => {
    const clamped = Math.max(gridWindow.start, Math.min(weekStripConfig.visualEnd, minutesAt));
    const base = ((clamped - gridWindow.start) / 60) * weekStripConfig.hourWidth;
    if (clamped <= weekStripConfig.terminalHourStart) return base;
    return base + ((clamped - weekStripConfig.terminalHourStart) / 30) * weekStripConfig.terminalHourBonus;
  };
  const weekStripSpanWidth = (from: number, to: number) =>
    Math.max(2, weekStripOffset(to) - weekStripOffset(from));
  const weekStripDayHeight = (peak: number) => {
    const lanes = Math.max(1, peak);
    return Math.max(
      72,
      weekStripConfig.gutter * 2 + weekStripConfig.compactTwoLineHeight + Math.max(0, lanes - 1) * weekStripConfig.laneHeight,
    );
  };
  const estimateArabicInlineWidth = (value: string, pxPerGlyph: number) => {
    let width = 0;
    for (const ch of String(value || "")) {
      if (/\s/.test(ch)) width += pxPerGlyph * 0.48;
      else if (/[.،,:;·—\-]/.test(ch)) width += pxPerGlyph * 0.55;
      else if (/[0-9]/.test(ch)) width += pxPerGlyph * 0.72;
      else width += pxPerGlyph;
    }
    return width;
  };
  const weekStripIdentityMode = (row: FSchedule, title: string, instructor: string, code: string) => {
    const from = Math.max(gridWindow.start, mins(row.fstarttime));
    const rawTo = mins(row.fendtime);
    const to = Math.min(weekStripConfig.visualEnd, rawTo);
    const inset = 4;
    const naturalWidth = Math.max(2, weekStripSpanWidth(from, to) - inset * 2);
    const available = naturalWidth - 12;
    // Conservative estimate: if this says "single", the three identities have
    // genuine breathing room. Otherwise the instructor receives its own line.
    const oneLineNeed =
      estimateArabicInlineWidth(title, 6.15) +
      estimateArabicInlineWidth(instructor, 5.15) +
      estimateArabicInlineWidth(code, 5.1) +
      43;
    // Terminal-hour exception: after 19:00 the visual tail is intentionally
    // non-linear. Give the code extra collision clearance there only; if the
    // three identities still fit they stay on one line, otherwise the existing
    // adaptive two-line nameplate takes over instead of letting code touch text.
    const terminalClearance = from >= 19 * 60 ? 18 : 0;
    return oneLineNeed + terminalClearance <= available ? "single" : "double";
  };

  const weekStripCodeRow = (row: FSchedule, title: string, code: string, mode: "single" | "double") => {
    if (mode !== "double") return "headline" as const;
    const from = Math.max(gridWindow.start, mins(row.fstarttime));
    const to = Math.min(weekStripConfig.visualEnd, mins(row.fendtime));
    const naturalWidth = Math.max(2, weekStripSpanWidth(from, to) - 8);
    const availableHeadline = naturalWidth - 14;
    const headlineNeed = estimateArabicInlineWidth(title, 6.05) + estimateArabicInlineWidth(code, 5.1) + 18;
    // On a genuinely tight card the catalogue code is secondary identity. Put
    // it beside the instructor, giving the Arabic course title the full first
    // row instead of letting two identities compete for the same pixels.
    return headlineNeed > availableHeadline ? "secondary" as const : "headline" as const;
  };

  const weekStripCardStyle = (placed: { row: FSchedule; lane: number }, identityMode: "single" | "double" = "single"): React.CSSProperties => {
    const from = Math.max(gridWindow.start, mins(placed.row.fstarttime));
    const rawTo = mins(placed.row.fendtime);
    const to = Math.min(weekStripConfig.visualEnd, rawTo);
    const inset = 4;
    const naturalWidth = Math.max(2, weekStripSpanWidth(from, to) - inset * 2);
    const renderedHeight = identityMode === "double"
      ? weekStripConfig.compactTwoLineHeight
      : weekStripConfig.cardHeight;
    const centeredTop = weekStripConfig.gutter
      + placed.lane * weekStripConfig.laneHeight
      + Math.max(0, Math.floor((weekStripConfig.laneHeight - renderedHeight) / 2));
    return {
      insetInlineStart: `${weekStripOffset(from) + inset}px`,
      insetInlineEnd: "auto",
      top: `${centeredTop}px`,
      width: `${naturalWidth}px`,
      height: `${renderedHeight}px`,
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
  const renderWeekCardBody = (r: FSchedule, d: { key: DayKey; label: string }, style: React.CSSProperties, widthShare = 1) => {
    const c = courseById.get(r.AdCourseId);
    const i = instructorById.get(r.AdInstructorId);
    const code = c?.CourseCode || r.AdCourseName || "—";
    const title = r.AdCourseName || c?.CourseName || code;
    const label = { text: title, shortened: false };
    const who = i?.AdInstructorName || "بدون أستاذ";
    const place = placeOf(r);
    /* Computed once: the card wears it as colour, and — when the reader has
       asked for it — as a weave keyed to the same number. */
    const cardHue = hueFor(code, title, i?.AdInstructorName, placeOf(r));
    // The drag lives on pointerdown. Recording where the press began has to be
    // merged with it rather than declared after it — a second onPointerDown prop
    // silently replaces the first, which is exactly how dragging was lost.
    const rowPending = pendingWriteIds.has(r.id);
    const denseIdentityMode = denseWeekStrips ? weekStripIdentityMode(r, title, who, String(code)) : "single";
    const denseCodeRow = denseWeekStrips ? weekStripCodeRow(r, title, String(code), denseIdentityMode) : "headline";
    const classicCodeSecondary = !denseWeekStrips && (
      widthShare < .86 || estimateArabicInlineWidth(title, 6.1) + estimateArabicInlineWidth(String(code), 5.1) > 126
    );
    const grip = rowPending ? {} : physics.bindEvent(r, d.key);
    return (
      <article
        {...grip}
        draggable={!physics.supported && !rowPending}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/schedule-id", String(r.id));
          e.dataTransfer.effectAllowed = "move";
          beginRipple(r);
        }}
        onDragEnd={clearRipple}
        onPointerDown={(e) => {
          pressOrigin.current = { x: e.clientX, y: e.clientY };
          if (rowPending) {
            setPhysicsNotice("هذا الموعد ما زال بانتظار تثبيت نقله السابق. يمكنك سحب بقية المواعيد الآن، ثم العودة إليه بعد اكتمال الحفظ.");
            return;
          }
          grip.onPointerDown?.(e);
        }}
        onClick={(e) => {
          // A drag ends in a click too; only a press that stayed put means "open".
          // Geometry alone was not enough — a card nudged five pixels and settled
          // back still read as a click and opened the whole lecture on top of a
          // move. The drag itself is now asked whether it just happened.
          if (physics.didDrag() || physicsActive || rowPending) return;
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
        data-row-id={r.id}
        /* «أشر لي» describes what it is pointed at. Without this the card fell
           back to the generic "an interactive element" sentence, which is the
           least useful thing to say about the object the whole screen is made
           of. */
        data-guide-description="بطاقة موعد داخل الجدول: اضغطها لقراءة الموعد وتحليله، أو اسحبها إلى يوم أو ساعة أو قاعة أخرى لنقلها بعد فحص التعارض."
        data-code-row={classicCodeSecondary ? "secondary" : undefined}
        className={`week-event ${lensClass(r)} ${xrayClass(r)} ${physicsRelationClass(r)} ${draggingId === r.id ? "ripple-source" : ""} ${physicsActive && physicsOrigin?.id === r.id ? "physics-source-lift" : ""} ${justChangedId === r.id ? "just-changed" : ""} ${reviewFocus.has(r.id) ? "review-flagged" : ""} ${multiSelect.has(r.id) ? "week-picked" : ""} ${liveClash.ids.has(r.id) ? "live-clash" : ""} ${keyMove?.rowId === r.id ? "week-keymove-source" : ""} ${hueFocusClass(r)}`}
        style={{ ...style, ["--hue" as any]: cardHue, ...textureFor(cardHue) }}
        onPointerEnter={(e) => { if (!physicsActive) openPeek(r, e.currentTarget); }}
        onPointerLeave={() => closePeek(r.id)}
        onFocus={(e) => openPeek(r, e.currentTarget)}
        onBlur={() => closePeek(r.id)}
      >
        <GripVertical data-physics-handle="true" className="week-drag-handle" />
        {denseWeekStrips ? (
          <div
            className="week-identity-line"
            data-mode={denseIdentityMode}
            data-code-row={denseCodeRow}
            data-terminal-stack={denseIdentityMode === "double" && mins(r.fstarttime) >= 19 * 60 ? "true" : undefined}
          >
            <strong className="week-title" data-short={label.shortened ? "true" : undefined}>{label.text}</strong>
            <span className="week-who" title={who}>{who}{visitingIds.has(r.AdInstructorId) ? <i className="week-visiting" title="أستاذ منتدب">م</i> : null}</span>
            <em className="week-code" dir="ltr">{code}</em>
          </div>
        ) : (
          <>
            <strong className="week-title" data-short={label.shortened ? "true" : undefined}>{label.text}</strong>
            <span className="week-who" title={who}>{who}{visitingIds.has(r.AdInstructorId) ? <i className="week-visiting" title="أستاذ منتدب">م</i> : null}</span>
            <small className="week-when"><time dir="ltr">{formatScheduleTimeRange(r.fstarttime, r.fendtime)}</time>{place ? <i>{place}</i> : null}</small>
            <em className="week-code" dir="ltr">{code}</em>
          </>
        )}
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
              data-guide-target="schedule.undo"
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

  /**
   * Everything a card's drawing depends on, flattened into one string.
   *
   * Two kinds of value live here. The obvious kind is what the card *shows* —
   * its course, its hour, its hue, its classes, its geometry. The second kind is
   * what its *handlers read*: `picking` decides whether a press selects or
   * opens, and the drag engine is switched off by view, mode and keyboard-carry.
   * A stale handler acting on a stale flag would be a far worse bug than a
   * missed render, so those are in the signature too.
   *
   * Sets and maps are never serialised whole: what matters to THIS card is its
   * own membership, and that is what is read.
   */
  const weekCardSignature = (r: FSchedule, d: { key: DayKey; label: string }, style: React.CSSProperties, widthShare: number) => {
    const c = courseById.get(r.AdCourseId);
    const i = instructorById.get(r.AdInstructorId);
    const code = c?.CourseCode || r.AdCourseName || "—";
    const title = r.AdCourseName || c?.CourseName || code;
    const who = i?.AdInstructorName || "بدون أستاذ";
    const rowPending = pendingWriteIds.has(r.id);
    const denseIdentityMode = denseWeekStrips ? weekStripIdentityMode(r, title, who, String(code)) : "single";
    const undoId = recentMoves[r.id];
    return [
      // board-wide: anything that changes how every card draws or behaves
      denseWeekStrips, hueBy, picking, physicsActive, physics.supported,
      mode, editor, viewMode, presentationMode, keyMove?.rowId ?? "",
      // the row itself
      r.id, (r as any).rev ?? 0, r.AdCourseId, r.AdInstructorId, r.SCode,
      r.fstarttime, r.fendtime, r.AdRoomCode, r.AdRoomHall, r.AdCourseName,
      r.fsunday, r.fmonday, r.ftuesday, r.fwednesday, r.fthursday,
      // what the row resolves to
      code, title, who, placeOf(r), hueFor(code, title, i?.AdInstructorName, placeOf(r)),
      // geometry and layout mode
      d.key, widthShare, denseIdentityMode,
      denseWeekStrips ? weekStripCodeRow(r, title, String(code), denseIdentityMode) : "headline",
      style.insetInlineStart, style.insetInlineEnd, style.top, style.width, style.height, style.zIndex,
      // this row's membership of every live set
      rowPending, draggingId === r.id, physicsOrigin?.id === r.id, justChangedId === r.id,
      reviewFocus.has(r.id), multiSelect.has(r.id), liveClash.ids.has(r.id),
      visitingIds.has(r.AdInstructorId), undoId || "",
      undoId ? String(Boolean(undoLog.find(item => item.id === undoId && !item.usedAt))) : "",
      // the class helpers already encode lens, x-ray, relation and hue focus
      lensClass(r), xrayClass(r), physicsRelationClass(r), hueFocusClass(r),
    ].join("\u0001");
  };

  const renderWeekCard = (r: FSchedule, d: { key: DayKey; label: string }, style: React.CSSProperties, widthShare = 1) => (
    <WeekCardBoundary
      key={`${d.key}-${r.id}`}
      sig={weekCardSignature(r, d, style, widthShare)}
      draw={() => renderWeekCardBody(r, d, style, widthShare)}
    />
  );
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
    return [...seen.values()].sort((a, b) => byArabic(a.label, b.label) || b.count - a.count);
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
   * Arrows, because not every desk has a trackpad.
   *
   * The ribbon scrolls by wheel and by drag, but a plain two-button mouse has
   * neither a horizontal wheel nor a swipe — and the fade at the edge says
   * "there is more" without offering any way to reach it. These two buttons are
   * that way. They appear only while the ribbon actually overflows, and each
   * press moves it by most of a screenful so a long key can be crossed in a few
   * clicks.
   */
  const LegendScroller = ({ children, label }: { children: React.ReactNode; label: string }) => {
    const rail = useRef<HTMLDivElement | null>(null);
    const [reach, setReach] = useState({ start: false, end: false });
    const measure = useCallback(() => {
      const node = rail.current;
      if (!node) return;
      // In RTL, scrollLeft runs negative; magnitude is what matters either way.
      const offset = Math.abs(node.scrollLeft);
      const max = node.scrollWidth - node.clientWidth;
      setReach({ start: offset > 4, end: max - offset > 4 });
    }, []);
    useEffect(() => {
      measure();
      const node = rail.current;
      if (!node || typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      return () => observer.disconnect();
    }, [measure, children]);
    const nudge = (direction: 1 | -1) => {
      const node = rail.current;
      if (!node) return;
      node.scrollBy({ left: direction * Math.max(160, node.clientWidth * 0.8), behavior: "smooth" });
    };
    return (
      <div className="week-legend-rail">
        <button
          type="button" className="week-legend-arrow" data-edge="start" hidden={!reach.start}
          data-guide-ignore="تمرير مفتاح الألوان أفقياً فقط" onClick={() => nudge(1)}
          aria-label="عرض ما قبله" title="عرض ما قبله"
        ><ChevronRight aria-hidden="true" /></button>
        <div className="week-legend-chips" ref={rail} onWheel={horizontalWheel} onScroll={measure} title={label}>
          {children}
        </div>
        <button
          type="button" className="week-legend-arrow" data-edge="end" hidden={!reach.end}
          data-guide-ignore="تمرير مفتاح الألوان أفقياً فقط" onClick={() => nudge(-1)}
          aria-label="عرض ما بعده" title="عرض ما بعده"
        ><ChevronLeft aria-hidden="true" /></button>
      </div>
    );
  };

  /** A normal mouse wheel moves long filter ribbons horizontally on desktop. */
  const horizontalWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const node = event.currentTarget;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || node.scrollWidth <= node.clientWidth) return;
    event.preventDefault();
    node.scrollLeft += event.deltaY;
  };

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
  useEffect(() => {
    if (!xraySelected || viewMode !== "list") return;
    const id = window.requestAnimationFrame(() => {
      xraySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [xraySelected, viewMode]);
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
    const candidate = buildPhysicsTargetCandidate(row, target);
    const before = localPhysicsBlockers(row, row).length;
    const blockers = localPhysicsBlockers(row, candidate);
    const delta = blockers.length - before;
    const timingNote = historicalTimingNote(candidate);
    const targetLoad = rows.filter(item =>
      days.some(day => Boolean((candidate as any)[day.key]) && Boolean((item as any)[day.key])) &&
      mins(item.fstarttime) < mins(candidate.fendtime) && mins(item.fendtime) > mins(candidate.fstarttime)
    ).length;
    const ripple = {
      headline: blockers.length
        ? "غير متاح مبدئيًا — يوجد حجز ظاهر في هذا الموضع."
        : timingNote
          ? "الموضع متاح، لكنه خارج توقيت الأيام المعتاد."
          : "متاح مبدئيًا — أتأكد الآن من أثره على النطاق الكامل.",
      delta: {
        conflicts: delta,
        professorGap: 0,
        quality: blockers.length ? -4 : delta < 0 ? 3 : 0,
        dayPressure: Math.max(0, targetLoad - 1) * 4,
      },
      effects: blockers.length
        ? blockers.slice(0, 2).map(item => ({ tone: "warn", text: `${item.message} — ${item.detail}` }))
        : timingNote
          ? [
              { tone: "warn", text: timingNote },
              { tone: "good", text: "لا يظهر مانع في القاعة أو الأستاذ ضمن الجدول الحالي." },
            ]
          : [{ tone: "good", text: "لا يظهر مانع في القاعة أو الأستاذ ضمن الجدول الحالي." }],
    };
    const key = `${row.id}:${target.day}:${target.start}:${physicsRoomKey(target.room) ?? "week"}`;
    return buildDecision(
      key,
      ripple,
      null,
      null,
      blockers as any,
      blockers.length > 0,
      blockers[0] ? `${blockers[0].message} — ${blockers[0].detail}` : "",
    );
  };
  const confirmPhysicsTarget = async (
    row: FSchedule,
    target: SchedulePhysicsTarget,
    signal: AbortSignal,
  ): Promise<SchedulePhysicsDecision> => {
    const candidate = buildPhysicsTargetCandidate(row, target);
    const payload: any = { ...candidate };
    delete payload.id;
    delete payload.AdCourseName;
    const response = await fetchJson("/api/schedules/check-conflicts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, excludeId: row.id }),
      signal,
    });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const conflicts = Array.isArray(response?.conflicts) ? response.conflicts : [];
    const local = previewPhysicsTarget(row, target);
    const key = `${row.id}:${Number((row as any).rev || 0)}:${Number(row.AdInstructorId || 0)}:${target.day}:${target.start}:${physicsRoomKey(target.room) ?? "week"}`;
    /* `item?.blocking !== false` was the wall that refused every green cell:
       no server conflict carries a `blocking` field at all, so the test was
       true for EVERY item — a hall's history, a rhythm remark, a travel note —
       and a drop with «لا يوجد تعارض» on its own card still bounced home. One
       predicate decides what may stop a move, the same one the refusal card
       and the classifier already use. */
    const blocking = conflicts.filter(isBlockingConflict);
    if (!conflicts.length) return { ...local, key, loading: false };
    return buildDecision(
      key,
      local.ripple,
      null,
      null,
      conflicts,
      blocking.length > 0,
      blocking[0] ? [blocking[0]?.message, blocking[0]?.detail].filter(Boolean).join(" — ") : "",
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
      presentationMode ||
      // One card, one hand: while the keyboard is carrying a lecture the
      // pointer layer is switched off entirely, so a stray press cannot pick up
      // a second copy of the same thing.
      Boolean(keyMove),
    // Week only: keep the accepted physics constants, but never let a newly
    // measured RTL target pull the card opposite to the user's live X motion.
    preservePointerDirectionX: viewMode === "week",
    previewTarget: previewPhysicsTarget,
    confirmTarget: confirmPhysicsTarget,
    evaluateTarget: evaluatePhysicsTarget,
    onStart: (row) => {
      setPhysicsNotice("");
      /* A refusal describes the attempt that just failed. Lifting another card
         starts a new question, so the old answer must go - it was standing over
         three later moves and describing none of them. */
      setRefusal(null);
      const known = refusedCells.current.get(Number(row.id));
      setPhysicsField(known ? Object.fromEntries([...known].map(cell => [cell, "impossible"])) : {});
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
      setPhysicsField((prev) => {
        const cell = placementFieldKey(target.day as DayKey, target.start, physicsRoomKey(target.room));
        /* A local "impossible" is trustworthy - it saw the clash itself. A local
           "good" is only an absence of evidence, so it is not painted onto the
           trail until the server confirms it. */
        if (decision.loading && (decision.quality === "excellent" || decision.quality === "good")) return prev;
        return { ...prev, [cell]: decision.quality };
      });
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
      setRefusal(null);
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
    onInvalid: (decision, target) => {
      clearRipple();
      /* A refusal is the ground truth about that square. Wiping the whole field
         used to erase it too, so the square went back to looking available the
         moment the card returned - and a second attempt met the same wall. The
         refused square is kept, marked impossible, and it stays that way for
         the rest of the session. */
      const refusedRow = Number(decision?.key?.split(":")[0]) || 0;
      const refusedCell = target
        ? placementFieldKey(target.day as DayKey, target.start, physicsRoomKey((target as any).room))
        : "";
      if (refusedRow && refusedCell) {
        const known = refusedCells.current.get(refusedRow) || new Set<string>();
        known.add(refusedCell);
        refusedCells.current.set(refusedRow, known);
      }
      setPhysicsField(refusedCell ? { [refusedCell]: "impossible" } : {});
      presence.send({ holding: null, cell: null });
      /* The structured blockers, not the sentences built from them: the pieces
         are what make a short line possible. */
      const raw = Array.isArray(decision?.conflicts) && decision.conflicts.length
        ? decision.conflicts
        : (decision?.reasons || []).map((text: string) => ({ message: String(text) }));
      const list = condenseRefusalReasons(raw as any);
      const summary = decision?.summary || "هذا الموضع غير متاح وفق قواعد الجدول.";
      /* No blocking wall left after filtering means nothing actually refused
         this move — only advice did. Falling back to the decision summary here
         used to reprint that advice under «تعذّر النقل», which is how a remark
         about a hall's history ended up reading as a refusal. */
      if (list.length) setRefusal({ reasons: list, summary });
      else { setRefusal(null); setPhysicsNotice(summary); }
      /* The screen-reader line stays a sentence — one utterance, not four. */
      setPhysicsNotice(`رفض النقل: ${list.map(item => item.text).join(". ") || summary}`);
    },
  });
  const focusGeometryRef = useRef(focusMode);
  useEffect(() => {
    if (focusGeometryRef.current === focusMode) return;
    // Focus changes only the shell, but that still changes viewport geometry.
    // A pointer session must never carry source/target rects across that switch.
    // Cancel once, then every new gesture is measured from the current canvas.
    physics.cancel();
    clearRipple();
    setPhysicsField({});
    presence.send({ holding: null, cell: null });
    focusGeometryRef.current = focusMode;
  }, [focusMode, physics.cancel, presence]);

  /* Focus no longer accumulates feedback behind the fullscreen board. A stale
     success is cleared on entry; feedback produced while focused is rendered
     in the compact stack below and expires after it has been read. */
  useEffect(() => {
    if (focusMode) setMessage(null);
  }, [focusMode]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 5200);
    return () => window.clearTimeout(timer);
  }, [message]);

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
    if (!focusExitPending) return;
    if (!focusMode) { setFocusExitPending(false); return; }

    // First cancel any live/armed gesture. The physics layer is portal-based;
    // keeping focus mounted here prevents its verdict from appearing against a
    // different geometry while the gesture is unwinding.
    if (physics.state.phase !== "idle") {
      physics.cancel();
      clearRipple();
      setPhysicsField({});
      presence.send({ holding: null, cell: null });
      return;
    }

    // Writes can finish a few frames after pointer-up and may surface a revision
    // clash. Give that response a short settlement window; if a clash appears,
    // focus stays mounted until the dialog is resolved, so the dialog is truly
    // above the focused board rather than "outside" it.
    if (pendingWriteIds.size || clash) return;
    const timer = window.setTimeout(() => {
      if (pendingWriteIds.size || clash) return;
      setFocusMode(false);
      setFocusExitPending(false);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [focusExitPending, focusMode, physics.state.phase, physics.cancel, pendingWriteIds.size, clash, presence]);
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
    const surface = document.querySelector<HTMLElement>(".week-scroll-main, .rooms-main-scroll") || document.querySelector<HTMLElement>(".week-surface");
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
          let scrolledHorizontally = false;
          if (pointerX < rect.left + EDGE && pointerX > rect.left - 8) {
            surface.scrollBy(-Math.ceil(MAX_STEP * Math.min(1, (rect.left + EDGE - pointerX) / EDGE)), 0);
            scrolledHorizontally = true;
          } else if (pointerX > rect.right - EDGE && pointerX < rect.right + 8) {
            surface.scrollBy(Math.ceil(MAX_STEP * Math.min(1, (pointerX - (rect.right - EDGE)) / EDGE)), 0);
            scrolledHorizontally = true;
          }
          // Horizontal auto-scroll moves the slot rectangles under a stationary
          // pointer. Refresh the existing hit-test in BOTH week and rooms so
          // magnetism never keeps pulling toward the pre-scroll rectangle.
          // This preserves the current spring/damping/magnetism values; only
          // the target geometry is kept current while the canvas itself moves.
          if (scrolledHorizontally) physics.refreshTarget();
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
  }, [physicsActive, physics.refreshTarget]);
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
    const candidate: any = buildPhysicsTargetCandidate(row, target);
    const targetRoom = (target as any)?.room as { code?: string; hall?: string } | undefined;
    const place = targetRoom
      ? ([targetRoom.code, targetRoom.hall].filter(Boolean).join("/") || "بلا قاعة")
      : ([row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") || "بلا قاعة");
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
    const tier = new Map<string, "free" | "room" | "blocked">();
    const suggestions: Array<{ day: DayKey; start: string; score: number; roomKey?: string }> = [];
    const carried = physics.state.row;
    if (!carried || physics.state.phase === "idle") return { blocked, tier, suggestions };

    const instructorRows = rows.filter(item =>
      item.id !== carried.id && Boolean(carried.AdInstructorId) && item.AdInstructorId === carried.AdInstructorId);
    const roomTargets = new Map<string, { key: string; code: string; hall: string }>();
    if (viewMode === "rooms") {
      rows.forEach(item => {
        const identity = roomIdentity(item.AdRoomCode, item.AdRoomHall);
        if (!identity.buildingKey && !identity.hallKey) return;
        if (!roomTargets.has(identity.key)) {
          roomTargets.set(identity.key, {
            key: identity.key,
            code: String(item.AdRoomCode ?? "").trim(),
            hall: String(item.AdRoomHall ?? "").trim(),
          });
        }
      });
      if (rows.some(item => {
        const identity = roomIdentity(item.AdRoomCode, item.AdRoomHall);
        return !identity.buildingKey && !identity.hallKey;
      })) roomTargets.set("|", { key: "|", code: "", hall: "" });
    }

    const scoreAt = (day: DayKey, from: number, to: number) => {
      let score = 100;
      const sameDay = instructorRows
        .filter(item => Boolean((item as any)[day]))
        .map(item => ({ from: mins(item.fstarttime), to: mins(item.fendtime) }));
      if (sameDay.length) {
        const nearest = Math.min(...sameDay.map(other =>
          other.to <= from ? from - other.to : other.from >= to ? other.from - to : 0));
        score -= Math.min(40, Math.round(nearest / 15) * 4);
      } else {
        score -= 12;
      }
      // The regulation gives 50 minutes on Sun/Tue/Thu and 80 on Mon/Wed.
      if (to - from !== expectedMinutesForDay(day as RegDayKey)) score -= 18;
      if (from < 8 * 60 || from >= 14 * 60) score -= 8;
      return score;
    };

    const readTarget = (day: DayKey, slot: string, room?: { key: string; code: string; hall: string }) => {
      const key = placementFieldKey(day, slot, room?.key);
      const from = mins(slot);
      const target: SchedulePhysicsTarget = {
        day, start: slot, label: days.find(item => item.key === day)?.label || "",
        ...(room ? { room: { code: room.code, hall: room.hall } } : {}),
      };
      const candidate = buildPhysicsTargetCandidate(carried, target);
      /* Measure the lecture the way the MOVE will actually shape it.
         A move between day families rewrites the length — fifty minutes on
         Sun/Tue/Thu, eighty on Mon/Wed — so testing the carried length against
         the end of the day painted the last columns red while the move itself
         succeeded and the card correctly read «متاح». The paint and the verdict
         now measure the same appointment. */
      const to = Math.max(mins(candidate.fendtime), from + 1);
      if (to > gridWindow.end) {
        blocked.set(key, "المحاضرة أطول من الوقت المتبقي في هذا اليوم");
        tier.set(key, "blocked");
        return;
      }
      const blockers = localPhysicsBlockers(carried, candidate);
      const instructorClash = blockers.find(item => item.type === "instructor");
      const roomClash = blockers.find(item => item.type === "room");
      if (instructorClash) {
        blocked.set(key, `${instructorClash.message} — ${instructorClash.detail}`);
        tier.set(key, "blocked");
        return;
      }
      if (roomClash) {
        blocked.set(key, `${roomClash.message} — ${roomClash.detail}`);
        // In week view an occupied current room means "this hour can work in a
        // different room". On the rooms board the square IS that exact room,
        // so an occupied square is a wall, never an amber invitation.
        tier.set(key, viewMode === "rooms" ? "blocked" : "room");
        return;
      }
      tier.set(key, "free");
      suggestions.push({ day, start: slot, score: scoreAt(day, from, to), ...(room ? { roomKey: room.key } : {}) });
    };

    for (const day of days) {
      for (const slot of timeSlots) {
        if (viewMode === "rooms") {
          roomTargets.forEach(room => readTarget(day.key as DayKey, slot, room));
        } else {
          readTarget(day.key as DayKey, slot);
        }
      }
    }
    suggestions.sort((a, b) => b.score - a.score);
    return { blocked, tier, suggestions: suggestions.slice(0, 3) };
  }, [physics.state.row, physics.state.phase, rows, viewMode, timeSlots, gridWindow, localPhysicsBlockers]);
  const dragSuggestions = dragField.suggestions;
  const suggestionRank = useMemo(() => {
    const map = new Map<string, number>();
    dragSuggestions.forEach((item, index) => map.set(placementFieldKey(item.day, item.start, item.roomKey), index + 1));
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
      rows.find(item =>
        item.id !== row.id && test(item) && (item as any)[day] &&
        mins(item.fstarttime) < to && mins(item.fendtime) > from);
    const busyInstructor = row.AdInstructorId
      ? clash(item => item.AdInstructorId === row.AdInstructorId) : undefined;
    if (busyInstructor)
      return { tier: "blocked", why: `الأستاذ مرتبط بـ${nameOf(busyInstructor)} ${scheduleClockForDisplay(busyInstructor.fstarttime)}` };
    const busyHall = row.AdRoomCode
      ? clash(item => sameRoom(item, row)) : undefined;
    if (busyHall)
      return { tier: "blocked", why: `القاعة محجوزة لـ${nameOf(busyHall)} ${scheduleClockForDisplay(busyHall.fstarttime)}` };

    /* Same scoring the drag uses, in the same order of importance. */
    let score = 100;
    const reasons: string[] = [];
    const sameDay = rows
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
  }, [rows, gridWindow, courseById]);

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
    setKeyMoveSay(`تم نقل الموعد إلى ${label} ${scheduleClockForDisplay(keyMove.start)}.`);
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
    setKeyMoveSay(`${label} ${scheduleClockForDisplay(keyMove.start)} — ${keyMoveReading.why}`);
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
    const roomKey = room === undefined
      ? undefined
      : (() => {
          const [code = "", hall = ""] = room.split("|");
          return roomIdentity(code, hall).key;
        })();
    const key = placementFieldKey(day, start, roomKey);
    const rank = suggestionRank.get(key);
    // Lifting the card shades every square the local reading has ruled out, so
    // the shape of what is free is visible before the pointer goes anywhere.
    // Where the server has since given a verdict for a square the pointer
    // actually visited, that verdict wins — it knows rules this reading cannot.
    const sampled = physicsField[key] || (dragField.blocked.has(key) ? "impossible" : "");
    const shade = dragField.tier.get(key);
    const target = physics.state.target;
    const targetRoomKey = physicsRoomKey(target?.room);
    const active =
      target?.day === day &&
      target?.start === start &&
      (roomKey === undefined ? targetRoomKey === undefined : targetRoomKey === roomKey);
    /* A green square is a promise the save will succeed, so it is withheld
       until the server has actually said so. While the verdict is in flight the
       target reads as "under review" - never as approval. */
    const live = physics.state.decision?.quality || sampled || "unknown";
    const awaiting = Boolean(physics.state.decision?.loading);
    const quality = active
      ? (awaiting && (live === "excellent" || live === "good") ? "pending" : live)
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
    const cancelIdle = whenIdle(() => {
      void fetch(`/api/intelligence/settled-drift?collegeId=${filterCollege}&sectionId=${filterSection}`,
        { credentials: "include" })
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
          if (!alive) return;
          setDrift(data?.watching && data.total ? data : null);
        })
        .catch(() => undefined);
    });
    return () => { alive = false; cancelIdle(); };
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
  /* The inbox is read on arrival, but it is not what the reader opened the
     department to see — so it waits its turn behind the board. A direct call
     (after answering a note) still runs immediately through loadInbox itself. */
  useEffect(() => whenIdle(loadInbox), [loadInbox]);

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
      setMessage(`نُفِّذت السلسلة — ${countOf(repair.moves.length, AR.move)}، والتداخل من ${repair.before} إلى ${repair.after}.`);
    } catch (e: any) {
      if (e?.revisionConflict) setClash({ current: e.current, yours: null });
      else if (!presentMoveRefusal(e, 0, "")) setError(friendlyError(e));
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
      { id: "view.rooms", group: "التنقل", label: "عرض المباني والقاعات", keywords: ["rooms", "قاعات", "مبنى"], icon: <MapPin />, execute: () => changeView("rooms") },
      {
        id: "view.today", group: "التنقل", label: "افتح يوم اليوم وحده",
        keywords: ["today", "اليوم"], icon: <Focus />, enabled: Boolean(todayKey),
        execute: () => { if (!inWeek) changeView("week"); setExpandedDay(current => (current === todayKey ? null : todayKey)); },
      },
      { id: "search.focus", group: "التنقل", label: "البحث في الجدول", keywords: ["search", "بحث"], shortcut: "/", icon: <Search />, execute: () => { searchRef.current?.scrollIntoView({ block: "center" }); searchRef.current?.focus(); } },
      { id: "schedule.create", group: "الجدول", label: "إضافة موعد", keywords: ["add", "new", "اضافة", "جديد"], icon: <Plus />, execute: () => openCreate() },
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
      { id: "schedule.focus", group: "العرض", label: focusMode ? "إنهاء التركيز" : "وضع التركيز", keywords: ["focus", "تركيز"], icon: <Focus />, execute: () => { physics.cancel(); setFocusMode(!focusMode); setPresentationMode(false); } },
      { id: "schedule.present", group: "العرض", label: presentationMode ? "إنهاء العرض" : "وضع العرض", keywords: ["present", "عرض", "شاشة"], icon: <Expand />, execute: () => { setPresentationMode(!presentationMode); setFocusMode(false); if (!presentationMode) changeView("week"); } },
      { id: "hue.course", group: "العرض", label: "التلوين حسب المقرر", keywords: ["colour", "color", "لون", "مقرر"], icon: <Palette />, enabled: hueBy !== "course", execute: () => setHueBy("course") },
      { id: "hue.instructor", group: "العرض", label: "التلوين حسب الأستاذ", keywords: ["colour", "color", "لون", "استاذ"], icon: <Palette />, enabled: hueBy !== "instructor", execute: () => setHueBy("instructor") },
      { id: "hue.room", group: "العرض", label: "التلوين حسب القاعة", keywords: ["colour", "color", "لون", "قاعة"], icon: <Palette />, enabled: hueBy !== "room", execute: () => setHueBy("room") },
      { id: "hue.reset", group: "العرض", label: "إظهار كل الطبقات", keywords: ["reset", "اظهار", "طبقات"], icon: <Eye />, enabled: hueHidden.size > 0 || hueFocus.size > 0, execute: () => { setHueHidden(new Set()); setHueFocus(new Set()); } },
      { id: "views.save", group: "العروض المحفوظة", label: "حفظ العرض الحالي", keywords: ["save", "view", "حفظ", "عرض"], icon: <Bookmark />, execute: () => setViewDialog({ mode: "create" }) },
    ];
    const guideRoot = Boolean(user?.IsRootAdmin || user?.SystemUserId === 1);
    const guideSession = { permissions, root: guideRoot, admin: isPowerAdmin };
    const paletteCovered = new Set(["schedule.view.list","schedule.view.week","schedule.view.rooms","schedule.tool.review"]);
    const allowedRegistry = allAllowedGuideFeatures(permissions, guideRoot, isPowerAdmin);
    allowedRegistry.forEach(feature => {
      const action = GUIDE_ACTIONS.find(item => item.featureId === feature.id) || null;
      if (action && !canRunGuideAction(action, guideSession)) return;
      if (feature.view === "schedules" && action && !paletteCovered.has(feature.id) && action.risk !== "sensitive") {
        const command = action.prepare || action.command;
        if (command) {
          const needsSelection=["schedule.action.change-time","schedule.action.change-course","schedule.action.change-instructor","schedule.action.find-room"].includes(feature.id);
          list.push({
            id:`guide.${feature.id}`,
            group:"المرشد",
            label:feature.title,
            keywords:[...feature.keywords,"مرشد","كيف"],
            icon:<Sparkles />,
            enabled:needsSelection ? Boolean(context?.selected?.id) : true,
            execute:()=>{ window.dispatchEvent(new CustomEvent("schedule-smart-guide-command",{detail:{...command,featureId:feature.id}})); },
          });
        }
      } else if (feature.view && feature.view !== "schedules" && onNavigate && feature.id.startsWith("page.")) {
        list.push({
          id:`guide.navigate.${feature.id}`,
          group:"وجهات المرشد",
          label:`فتح ${feature.title}`,
          keywords:[...feature.keywords,"افتح","انتقل","كيف"],
          icon:<Sparkles />,
          execute:()=>onNavigate(feature.view!),
        });
      }
    });
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
  }, [viewMode, todayKey, picking, pendingUndo, liveClash, focusMode, presentationMode, hueBy, hueHidden, hueFocus, savedViews, activeView, viewDirty, isPowerAdmin, phoneReadOnly, context?.selected?.id, changeView, applyView, captureView, viewsStore, permissions, onNavigate, user?.IsRootAdmin, user?.SystemUserId]);

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
                <time dir="ltr">{scheduleClockForDisplay(item.time)}</time>
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
                {note.time ? <time dir="ltr">{scheduleClockForDisplay(note.time)}</time> : null}
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
                        onClick={() => void openContext(r)}
                      >
                        <time dir="ltr">
                          <b>{scheduleClockForDisplay(r.fstarttime)}</b><span>-</span><small>{scheduleClockForDisplay(r.fendtime)}</small>
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
  const copyView = (
      <div className="content-stack copy-page">
<PageTitle
          eyebrow="أداة إدارية ذكية"
          subtitle="معاينة كاملة قبل التنفيذ"
        >
          نسخ جدول فصل دراسي
        </PageTitle>
        {error ? <Notice>{error}<button type="button" className="inline-guide-explain no-print" onClick={() => window.dispatchEvent(new CustomEvent("schedule-smart-guide-open", { detail: { hint: { key: "schedule:error:explain", title: "سأوضح سبب المشكلة", detail: error, level: "strong" }, context: { currentFeatureId: "schedule.action.move-room", whatHappens: error } } }))}>اشرح السبب</button></Notice> : null}
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
                    /* A new term is usually last year's same semester with light
                       edits, so an EMPTY source is worth filling in for the
                       reader. But it was filled in every time — including over
                       a source they had just chosen by hand: pick «الفصل الأول
                       2017/2018», then pick a destination, and the source you
                       chose was silently replaced. A suggestion may only speak
                       into a blank; once a person has answered, the answer
                       stands. */
                    if (copyFromTerm) return;
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
  const editorView = (
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
                    data-guide-editor-field="course-name"
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
                  {!courseNames.length && form.AdSectionId ? <small className="field-inline-hint">لا تظهر مقررات لهذا القسم بعد. جرّبتُ الآن الجلب المباشر للقسم الحالي؛ إن استمرت القائمة فارغة فراجع بيانات المقررات في القسم نفسه.</small> : null}
                </Field>
                <Field
                  label={<span className="field-label-line"><span className="field-label-required-inline">رمز المقرر الدراسي <span className="required" aria-hidden="true">*</span></span>{!editId && sectionHint ? <small className="field-inline-hint">{sectionHint}</small> : null}</span>}
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
                      const value = normalizeArabicDigits(e.target.value);
                      if (englishDigits(value)) setForm((p) => ({ ...p, SCode: value }));
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
                  <div data-guide-editor-field="instructor">
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
                  </div>
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
                        data-guide-target="schedule.action.quick-fill"
                        data-guide-title="املأ كالمعتاد"
                        data-guide-description="يعبّئ الأيام والوقت والمكان من النمط المعتاد لهذا المقرر لتختصر الإدخال اليدوي، ثم تراجع القيم قبل الحفظ."
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
                  <div className="schedule-time-control" dir="ltr">
                    <input
                      data-guide-editor-field="time"
                      type="time"
                      min={SCHEDULE_DAY_START_TIME}
                      max={SCHEDULE_DAY_END_TIME}
                      step={60}
                      value={form.fstarttime}
                      onChange={(e) => {
                        setScheduleTouched(true);
                        setForm((p) => ({ ...p, fstarttime: e.target.value }));
                      }}
                      required
                    />
                  </div>
                </Field>
                <Field label="نهاية الوقت" required>
                  <div className="schedule-time-control" dir="ltr">
                    <input
                      type="time"
                      min={SCHEDULE_DAY_START_TIME}
                      max={SCHEDULE_DAY_END_TIME}
                      step={60}
                      value={form.fendtime}
                      onChange={(e) => {
                        setScheduleTouched(true);
                        setForm((p) => ({ ...p, fendtime: e.target.value }));
                      }}
                      required
                    />
                  </div>
                </Field>
                <div className="schedule-location-pair">
                  <div className="schedule-location-field schedule-location-field--building">
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
                  </div>
                  <div className="schedule-location-field schedule-location-field--hall">
                    <Field label="رقم القاعة" required>
                      <div className="schedule-hall-input-row">
                        <input
                          value={form.AdRoomHall}
                          list="schedule-halls"
                          onChange={(e) =>
                            setForm((p) => ({ ...p, AdRoomHall: e.target.value }))
                          }
                          required
                        />
                        {hallOptions.length ? (
                          <details className="schedule-hall-picker">
                            <summary
                              data-guide-ignore="اختيار قاعة سريع داخل محرر الموعد؛ المرشد يشرح حقل القاعة الأساسي"
                              aria-label={`عرض قاعات المبنى ${form.AdRoomCode}`}
                              title={`اختيار سريع من ${hallOptions.length.toLocaleString("ar-KW-u-nu-latn")} قاعة في المبنى ${form.AdRoomCode}`}
                            >
                              <MapPin aria-hidden="true" />
                              <span className="schedule-hall-picker-count" dir="ltr">{hallOptions.length}</span>
                            </summary>
                            <div className="schedule-hall-picker-popover" role="group" aria-label={`قاعات المبنى ${form.AdRoomCode}`}>
                              <header>
                                <div>
                                  <small>اختيار سريع</small>
                                  <strong>قاعات المبنى <bdi dir="ltr">{form.AdRoomCode}</bdi></strong>
                                  {hallAvailabilityReady ? <p className="schedule-hall-picker-status"><b>{availableHallCount.toLocaleString("ar-KW-u-nu-latn")}</b> متاحة · <b>{busyHallCount.toLocaleString("ar-KW-u-nu-latn")}</b> مشغولة</p> : <p className="schedule-hall-picker-status">اختر الأيام والوقت لمعرفة المتاح فوراً</p>}
                                </div>
                                <span>{hallOptions.length.toLocaleString("ar-KW-u-nu-latn")}</span>
                              </header>
                              <div className="schedule-hall-picker-grid">
                                {hallAvailability.map(item => {
                                  const occupant = item.occupants[0];
                                  const occupantCourse = occupant
                                    ? (occupant.AdCourseName || courseById.get(Number(occupant.AdCourseId || 0))?.CourseName || "مقرر")
                                    : "";
                                  const occupantInstructor = occupant
                                    ? (instructorById.get(Number(occupant.AdInstructorId || 0))?.AdInstructorName || "")
                                    : "";
                                  const isActive = String(form.AdRoomHall) === String(item.hall);
                                  const previewOpen = hallBusyPreview === item.hall;
                                  return (
                                    <div className={`schedule-hall-choice ${item.occupied ? "is-busy" : "is-free"}`} key={item.hall}>
                                      <button
                                        type="button"
                                        data-guide-ignore="خيار قاعة داخل قائمة الاختيار السريع التابعة لحقل القاعة"
                                        className={`${isActive ? "active" : ""} ${item.occupied ? "busy" : "free"}`}
                                        aria-label={item.occupied ? `القاعة ${item.hall} مشغولة؛ اضغط لمعرفة الموعد` : `اختيار القاعة ${item.hall}`}
                                        onClick={(event) => {
                                          if (item.occupied) {
                                            setHallBusyPreview(current => current === item.hall ? null : item.hall);
                                            return;
                                          }
                                          setHallBusyPreview(null);
                                          setForm((current) => ({ ...current, AdRoomHall: item.hall }));
                                          event.currentTarget.closest("details")?.removeAttribute("open");
                                        }}
                                      >
                                        <MapPin aria-hidden="true" />
                                        <bdi dir="ltr">{item.hall}</bdi>
                                        {item.occupied ? <span className="schedule-hall-busy-dot" aria-hidden="true" /> : null}
                                      </button>
                                      {previewOpen && occupant ? (
                                        <div className="schedule-hall-busy-card" role="status">
                                          <div className="schedule-hall-busy-card-head">
                                            <strong><bdi dir="ltr">{item.hall}</bdi> مشغولة</strong>
                                            <span dir="ltr">{formatScheduleTimeRange(occupant.fstarttime, occupant.fendtime)}</span>
                                          </div>
                                          <p>{occupantCourse}</p>
                                          {occupantInstructor ? <small>{occupantInstructor}</small> : null}
                                          <button type="button" className="schedule-hall-busy-open" data-guide-ignore="تنقل ثانوي من معاينة إشغال القاعة إلى تفاصيل الموعد الموجود؛ لا يغيّر بيانات الجدول" onClick={() => revealHallOccupant(occupant)}>عرض الموعد</button>
                                          {item.occupants.length > 1 ? <em>+{(item.occupants.length - 1).toLocaleString("ar-KW-u-nu-latn")} موعد متداخل</em> : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </details>
                        ) : null}
                      </div>
                      <datalist id="schedule-halls">
                        {hallOptions.map(hall => <option key={hall} value={hall} />)}
                      </datalist>
                    </Field>
                  </div>
                </div>
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
                    <button type="button" data-guide-feature-id="schedule.action.move-room" onClick={() => setForm(p => ({ ...p, AdRoomCode: "", AdRoomHall: "" }))}>
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
          <aside className={`conflict-panel ${validationIssues.length || blockingConflicts.length ? "conflict-panel--alert" : "conflict-panel--clear"}`}>
            <div className={`conflict-head ${validationIssues.length || blockingConflicts.length ? "conflict-head--alert" : "conflict-head--clear"}`}>
              <span>
                {validationIssues.length || blockingConflicts.length ? <AlertTriangle /> : <CheckCircle2 />}
              </span>
              <div>
                <strong>فحص موانع الحفظ</strong>
                <small>
                  {validationIssues.length?"تحقق من الوقت والأيام":checking?"جاري الفحص...":blockingConflicts.length?"تعارض يمنع الحفظ":editorTimingReviewCard?"ملاحظة تاريخية تحتاج مراجعة":"لا يوجد مانع ظاهر"}
                </small>
              </div>
            </div>
            {hasEditorDecisionAccordions ? (
              <div className="decision-accordion-list" aria-label="تفاصيل المراجعة">
                {editorRoomConflictCards.length ? (
                  <details className="decision-accordion">
                    <summary className="decision-accordion-summary">
                      <span className="decision-accordion-title"><Building2 /> تعارض قاعة</span>
                      <em>{countOf(editorRoomConflictCards.length, AR.note)}</em>
                    </summary>
                    <div className="decision-accordion-body">
                      <div className="decision-stack" aria-label="تعارض قاعة">
                        {editorRoomConflictCards.map(renderEditorConflictCard)}
                      </div>
                    </div>
                  </details>
                ) : null}
                {editorInstructorConflictCards.length ? (
                  <details className="decision-accordion">
                    <summary className="decision-accordion-summary">
                      <span className="decision-accordion-title"><UsersRound /> تعارض أستاذ</span>
                      <em>{countOf(editorInstructorConflictCards.length, AR.note)}</em>
                    </summary>
                    <div className="decision-accordion-body">
                      <div className="decision-stack" aria-label="تعارض أستاذ">
                        {editorInstructorConflictCards.map(renderEditorConflictCard)}
                      </div>
                    </div>
                  </details>
                ) : null}
                {editorRegulation.length ? (
                  <details className="decision-accordion">
                    <summary className="decision-accordion-summary">
                      <span className="decision-accordion-title"><ClipboardCheck /> ملاحظات اللائحة · {DECISION_1912_LABEL}</span>
                      <em>{countOf(editorRegulation.length, AR.note)}</em>
                    </summary>
                    <div className="decision-accordion-body">
                      <section className="decision-section decision-section--regulation" role="status" aria-label={`ملاحظات اللائحة · ${DECISION_1912_LABEL}`}>
                        <div className="decision-note-list">
                          {editorRegulationCards.map((finding) => (
                            <article key={finding.rule} className={`decision-note decision-note--${finding.severity} decision-note--feature`}>
                              <div className="decision-feature-topline">
                                <span className="decision-card-kicker">ملاحظات اللائحة · {DECISION_1912_LABEL}</span>
                                <em className="decision-card-flag">{finding.article || "معلومة"}</em>
                              </div>
                              <div className="decision-feature-hero">
                                <div className="decision-note-body">
                                  <strong>{finding.title}</strong>
                                  {finding.detail ? <details className="decision-note-details"><summary>التفاصيل</summary><p>{finding.detail}</p></details> : null}
                                </div>
                                <div className="decision-note-icon" aria-hidden="true">
                                  {finding.icon === "history" ? <History /> : finding.icon === "room" ? <Building2 /> : <Lightbulb />}
                                </div>
                              </div>
                              {finding.metric ? (
                                <div className="regulation-metric-strip" aria-hidden="true">
                                  <div><span>الحالي</span><strong>{finding.metric.current.toLocaleString("ar-KW-u-nu-latn")} {finding.metric.unit}</strong></div>
                                  <div className="regulation-metric-emphasis"><span>{finding.metric.delta > 0 ? "أكثر بـ" : finding.metric.delta < 0 ? "أقل بـ" : "مطابق"}</span><strong>{Math.abs(finding.metric.delta).toLocaleString("ar-KW-u-nu-latn")} {finding.metric.unit}</strong></div>
                                  <div><span>المعتاد</span><strong>{finding.metric.usual.toLocaleString("ar-KW-u-nu-latn")} {finding.metric.unit}</strong></div>
                                </div>
                              ) : (
                                <div className="regulation-facts" aria-hidden="true">
                                  <div><span>مدة اللقاء</span><strong>{finding.currentDurationLabel}</strong></div>
                                  <div><span>الأيام</span><strong>{finding.selectedDaysLabel}</strong></div>
                                  <div><span>المرجع</span><strong>{finding.article || "لائحة"}</strong></div>
                                </div>
                              )}
                            </article>
                          ))}
                        </div>
                      </section>
                    </div>
                  </details>
                ) : null}
                {editorGenericConflictCards.length || editorSupplementalCards.length ? (
                  <details className="decision-accordion">
                    <summary className="decision-accordion-summary">
                      <span className="decision-accordion-title"><Layers /> ملاحظة</span>
                      <em>{countOf(editorGenericConflictCards.length + editorSupplementalCards.length, AR.note)}</em>
                    </summary>
                    <div className="decision-accordion-body">
                      {editorGenericConflictCards.length ? (
                        <div className="decision-stack" aria-label="ملاحظة">
                          {editorGenericConflictCards.map(renderEditorConflictCard)}
                        </div>
                      ) : null}
                      {editorSupplementalCards.length ? (
                        <div className="decision-note-list" aria-label="ملاحظات سياقية">
                          {editorSupplementalCards.map(finding => (
                            <article key={finding.rule} className={`decision-note decision-note--${finding.severity} decision-note--feature`}>
                              <div className="decision-feature-topline">
                                <span className="decision-card-kicker">{finding.sourceLabel}</span>
                                <em className="decision-card-flag">{finding.article && finding.article !== finding.sourceLabel ? finding.article : "مرجع تاريخي"}</em>
                              </div>
                              <div className="decision-feature-hero">
                                <div className="decision-note-body">
                                  <strong>{finding.title}</strong>
                                  {finding.detail ? <details className="decision-note-details"><summary>التفاصيل</summary><p>{finding.detail}</p></details> : null}
                                </div>
                                <div className="decision-note-icon" aria-hidden="true">
                                  {finding.icon === "history" ? <History /> : finding.icon === "room" ? <Building2 /> : <Lightbulb />}
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                ) : null}
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
    focusMode ||
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
    historicalChoice ||
    mobileViewGate
  );
  const liveEditors = peers.filter(peer => peer.editing).length;
  const liveHolders = peers.filter(peer => peer.holding).length;
  const liveCollaborators = peers.filter(peer => peer.cell || peer.holding || peer.editing).length;

  useEffect(() => {
    if (!error) return;
    const now = Date.now();
    guideFailureTimesRef.current = [...guideFailureTimesRef.current.filter(value => now - value < 45_000), now].slice(-6);
    const profile = loadGuideProfile(Number(user?.SystemUserId || 0));
    const moveFeature = featureById("schedule.action.move-room");
    const moveLike = /تعارض|موضع|قاعة|أستاذ|نقل|السحب|الوقت/.test(error);
    const feature = moveLike ? moveFeature || null : null;
    const failureCount = guideFailureTimesRef.current.length;
    const baseline = profile.mastery?.["schedule.action.move-room"]?.baseline;
    const retryBaseline = Number(baseline?.averageRetries || 0);
    const unusualRetry = moveLike && failureCount >= Math.max(2, Math.ceil(retryBaseline + 2));
    const friction = evaluateGuideFriction(profile, feature, [
      { type:"validation-repetition", count:failureCount, weight:1.35, knownFailure:/تعارض|تعذر|لا يمكن/.test(error) },
      ...(moveLike ? [{ type:"journey-failure", count:Math.max(1,failureCount-1), weight:1.2, knownFailure:true }] : []),
      ...(unusualRetry ? [{ type:"personal-baseline-anomaly", count:1, weight:2.1, knownFailure:true }] : []),
    ]);
    if (friction.confidence === "low") return;
    const reason = classifyGuideReason({ mastery:friction.mastery, blocked:true, anomaly:failureCount >= (friction.mastery >= .72 ? 3 : 2) });
    const expertAnomaly = friction.mastery >= .72 && failureCount >= 3;
    setGuideDetectedHelp({
      key: moveLike ? "schedule.move.repeated-failure" : "schedule.repeated-error",
      featureId: moveLike ? "schedule.action.move-room" : undefined,
      title: expertAnomaly ? "هذه العملية لا تسير كالمعتاد" : reason === "BLOCKED" ? "هناك ما يمنع إكمال هذه الخطوة" : "تكررت المشكلة في هذه الخطوة",
      detail: error,
      level: friction.confidence === "high" ? "strong" : "soft",
    });
    telemetryGuide(`${moveLike ? "نقل مقرر" : "الجدول"}|${friction.confidence}|${reason}`);
  }, [error, user?.SystemUserId]);
  useEffect(() => {
    if (!mobileViewGate) return;
    setGuideDetectedHelp({
      title: "هذا العرض للقراءة فقط على الهاتف",
      detail: "إذا أردت التعديل الآن استخدم «قائمة»، أو أكمل من الكمبيوتر للسحب والنقل المباشر.",
      level: "soft",
    });
  }, [mobileViewGate]);
  useEffect(() => {
    if (error || mobileViewGate || rowsLoading) return;
    setGuideDetectedHelp(null);
  }, [error, mobileViewGate, rowsLoading, viewMode, filterCollege, filterSection, filterTerm]);
  const currentGuideTask = useMemo(() => {
    const selectedRow = context?.selected || null;
    if (selectedRow) {
      return {
        id: `work:schedule-row:${Number(selectedRow.id || 0)}`,
        title: `متابعة «${selectedRow.AdCourseName || selectedRow.CourseName || "المقرر المحدد"}»`,
        featureId: "schedule.action.move-room",
        command: { scope: "schedule", type: "focusRow", value: String(Number(selectedRow.id || 0)) },
      };
    }
    if (transferOpen) {
      return {
        title: "أدوات البيانات",
        target: "schedule.tool.data",
        command: { scope: "schedule", type: "openTransfer" },
      };
    }
    if (reviewOpen) {
      return {
        title: "مراجعة الاعتماد",
        target: "schedule.tool.review",
        command: { scope: "schedule", type: "openReview" },
      };
    }
    if (viewMode === "rooms") {
      return {
        title: "العمل داخل المباني والقاعات",
        target: "schedule.view.rooms",
        command: { scope: "schedule", type: "changeView", value: "rooms" },
      };
    }
    if (viewMode === "week") {
      return {
        title: "العمل داخل عرض الأسبوع",
        target: "schedule.view.week",
        command: { scope: "schedule", type: "changeView", value: "week" },
      };
    }
    return {
      title: "العمل داخل القائمة",
      target: "schedule.view.list",
      command: { scope: "schedule", type: "changeView", value: "list" },
    };
  }, [context?.selected?.id, reviewOpen, transferOpen, viewMode]);
  const scheduleGuideSummary = useMemo(() => {
    if (rowsLoading) return "يقرأ الجدول الآن ويجهز العناصر الظاهرة على الشاشة.";
    if (error) return error;
    if (liveClash.pairs) return `يوجد ${countOf(liveClash.pairs, AR.clash)} تحتاج إلى مراجعة قبل الاعتماد.`;
    if (mobileViewGate) return "أنت على الهاتف داخل عرض للقراءة فقط؛ التعديل المباشر متاح من القائمة أو من الكمبيوتر.";
    if (viewMode === "rooms") return "أنت الآن داخل المباني والقاعات — أفضل عرض لنقل المقررات ومقارنة الإشغال.";
    if (viewMode === "week") return "أنت الآن داخل عرض الأسبوع — الخريطة الزمنية الكاملة للنطاق المفتوح.";
    return "أنت الآن داخل القائمة — أفضل نقطة للبحث السريع والتحرير المباشر.";
  }, [rowsLoading, error, liveClash.pairs, mobileViewGate, viewMode]);
  useEffect(() => {
    const userId = Number(user?.SystemUserId || 0);
    const profile = loadGuideProfile(userId);
    const featureId = viewMode === "rooms" ? "schedule.view.rooms" : viewMode === "week" ? "schedule.view.week" : "schedule.view.list";
    const feature = featureById(featureId);
    const expert = feature ? masteryScore(profile, feature) >= .72 : false;
    const termLabel = terms.find(term => term.AdTermId === filterTerm)?.AdTermName || "";
    const selected = context?.selected || null;
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-context", {
      detail: {
        scope: "schedule",
        view: "schedules",
        title: "الجدول الدراسي",
        collegeId: filterCollege || undefined,
        sectionId: filterSection || undefined,
        termId: filterTerm || undefined,
        currentFeatureId: viewMode === "rooms" ? "schedule.view.rooms" : viewMode === "week" ? "schedule.view.week" : "schedule.view.list",
        summary: scheduleGuideSummary,
        placeLabel: viewMode === "rooms" ? "المباني والقاعات" : viewMode === "week" ? "عرض الأسبوع" : "عرض القائمة",
        stageLabel: filterScopeLabel || "بدون نطاق",
        scopeLabel: [filterScopeLabel, termLabel].filter(Boolean).join(" · "),
        whatHappens: scheduleGuideSummary,
        lastAction: error || message || returnNote || "",
        unsaved: Boolean(saving || offlinePending),
        currentTask: currentGuideTask,
        selected: selected ? {
          id: Number(selected.id || 0),
          course: String(selected.AdCourseName || selected.CourseName || "المقرر المحدد"),
          room: [selected.AdRoomCode, selected.AdRoomHall].filter(Boolean).join(" · "),
          start: String(selected.fstarttime || ""),
          conflict: liveClash.ids.has(Number(selected.id || 0)),
        } : null,
        metrics: {
          isExpert: expert,
          mastery: feature ? masteryScore(profile, feature) : 0,
        },
        detectedHelp: guideDetectedHelp,
      },
    }));
  }, [context?.selected?.id, currentGuideTask, error, filterCollege, filterScopeLabel, filterSection, filterTerm, guideDetectedHelp, liveClash.pairs, message, offlinePending, returnNote, saving, scheduleGuideSummary, terms, user?.SystemUserId, viewMode]);
  useEffect(() => {
    const onGuideCommand = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.scope && detail.scope !== "schedule") return;
      const declaredFeatureId = String(detail.featureId || "");
      const rememberGuideOperation = (featureId:string, expected?:string) => {
        if (!featureId) return;
        guideOperationRef.current = { featureId, transactionId: detail.transactionId ? String(detail.transactionId) : undefined, startedAt: Date.now(), task: String(detail.task || ""), expected };
      };
      const revealGuideRowThen = (row: FSchedule, next: () => void) => {
        const needsWeek = viewMode !== "week";
        if (needsWeek) changeView("week");
        setReviewFocus(new Set([Number(row.id)]));
        let attempts = 0;
        const seek = () => {
          window.requestAnimationFrame(() => {
            // When the guide arrived from another view, wait for the week DOM
            // itself — otherwise the same row id could be found in the outgoing
            // list/rooms DOM and the hand-off would point at the wrong card.
            const weekReady = !needsWeek || Boolean(document.querySelector(".week-surface"));
            const card = weekReady ? document.querySelector<HTMLElement>(`[data-row-id="${Number(row.id)}"]`) : null;
            if (!card && attempts++ < 30) { seek(); return; }
            if (!card) { next(); return; }
            card.scrollIntoView({ behavior:"smooth", block:"center", inline:"center" });
            card.setAttribute("data-guide-hot", "true");
            card.setAttribute("data-guide-edit-target", "true");
            const pin = document.createElement("span");
            pin.className = "guide-edit-target-pin";
            pin.textContent = "هنا";
            pin.setAttribute("aria-hidden", "true");
            card.appendChild(pin);
            window.setTimeout(() => {
              card.removeAttribute("data-guide-hot");
              card.removeAttribute("data-guide-edit-target");
              pin.remove();
              next();
            }, 760);
          });
        };
        seek();
      };
      if (detail.type === "changeView" && detail.value) {
        const featureId = declaredFeatureId || (detail.value === "rooms" ? "schedule.view.rooms" : detail.value === "week" ? "schedule.view.week" : "schedule.view.list");
        rememberGuideOperation(featureId, `view:${String(detail.value)}`);
        changeView(String(detail.value));
        return;
      }
      if (detail.type === "openReview") {
        rememberGuideOperation(declaredFeatureId || "schedule.tool.review", "review");
        setWorkspaceToolsOpen(true);
        setReviewOpen(true);
        return;
      }
      if (detail.type === "openTransfer") {
        rememberGuideOperation(declaredFeatureId || "schedule.tool.data", "transfer");
        setWorkspaceToolsOpen(true);
        if (!showMobileReadOnlyGate()) setTransferOpen(true);
        else emitGuideResult({ featureId:declaredFeatureId || "schedule.tool.data", ok:false, signal:"schedule.transfer.blocked", transactionId:detail.transactionId });
        return;
      }
      if (detail.type === "showTarget") {
        if (detail.target === "schedule.tool.review" || detail.target === "schedule.tool.data") {
          setWorkspaceToolsOpen(true);
        }
        return;
      }
      if (detail.type === "openEditRow" && detail.value) {
        const id = Number(detail.value || 0);
        const row = rows.find(item => Number(item.id) === id);
        if (row) openEdit(row);
        return;
      }
      if (detail.type === "openEditSelected") {
        const task = String(detail.task || "time");
        const featureId = declaredFeatureId || (task === "instructor" ? "schedule.action.change-instructor" : task === "course" ? "schedule.action.change-course" : "schedule.action.change-time");
        rememberGuideOperation(featureId, "editor");
        const id = Number(detail.value || context?.selected?.id || 0);
        const row = rows.find(item => Number(item.id) === id);
        if (row) {
          setMessage("هذا هو الموعد المقصود — سأفتح الحقل المطلوب بعد تحديده بصريًا.");
          revealGuideRowThen(row, () => {
            openEdit(row);
            setMessage(task === "instructor" ? "اختر الأستاذ الجديد ثم راجع التعارضات قبل الحفظ." : task === "course" ? "اختر المقرر الجديد ثم راجع البيانات والتعارضات قبل الحفظ." : "عدّل الوقت ثم راجع النتيجة قبل الحفظ.");
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
              const selector = task === "instructor" ? '[data-guide-editor-field="instructor"]' : task === "course" ? '[data-guide-editor-field="course-name"]' : '[data-guide-editor-field="time"]';
              const field = document.querySelector<HTMLElement>(selector);
              const focusable = field?.matches("input,select,button,[tabindex]") ? field : field?.querySelector<HTMLElement>('input,select,button,[tabindex]:not([tabindex="-1"])');
              field?.scrollIntoView({behavior:"smooth",block:"center"});
              focusable?.focus?.();
            }));
          });
        } else {
          setMessage("حدد مقررًا أولًا، ثم أعد طلب المساعدة.");
          emitGuideResult({ featureId, ok:false, signal:"schedule.editor.no-selection", transactionId:detail.transactionId });
        }
        return;
      }
      if (detail.type === "focusRow" && detail.value) {
        const id = Number(detail.value || 0);
        const row = rows.find(item => Number(item.id) === id);
        if (!row) return;
        if (viewMode === "list") changeView("week");
        setReviewFocus(new Set([id]));
        window.setTimeout(() => {
          document.querySelector<HTMLElement>(`[data-row-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }, 180);
        return;
      }
      if (detail.type === "findAlternative" && detail.value) {
        const id = Number(detail.value || 0);
        const row = rows.find(item => Number(item.id) === id);
        if (!row) return;
        try {
          const chain = findRepairChain(row, rows);
          if (chain) { setRepairReason("بدائل مناسبة لهذا المقرر"); setRepair(chain); }
          else setMessage("لم أجد بديلًا مباشرًا دون إنشاء تعارض جديد. افتح المباني والقاعات لمقارنة الخيارات يدويًا.");
        } catch { setMessage("تعذر تجهيز البدائل تلقائيًا؛ لم يتغير شيء في الجدول."); }
        return;
      }
      if (detail.type === "findAlternativeSelected") {
        rememberGuideOperation(declaredFeatureId || "schedule.action.find-room", "alternatives");
        const id = Number(detail.value || context?.selected?.id || 0);
        const row = rows.find(item => Number(item.id) === id);
        changeView("rooms");
        if (!row) {
          setMessage("تم فتح المباني والقاعات. حدد مقررًا لأبحث عن البدائل المناسبة له.");
          emitGuideResult({ featureId:"schedule.action.find-room", ok:false, signal:"schedule.alternatives.no-selection", transactionId:detail.transactionId });
          return;
        }
        setReviewFocus(new Set([id]));
        try {
          const chain = findRepairChain(row, rows);
          if (chain) { setRepairReason("بدائل مناسبة لهذا المقرر"); setRepair(chain); }
          else setMessage("لم أجد بديلًا مباشرًا دون إنشاء تعارض جديد. يمكنك مقارنة القاعات الظاهرة يدويًا دون تغيير الجدول.");
          emitGuideResult({ featureId:"schedule.action.find-room", ok:true, signal:"schedule.alternatives.ready", transactionId:detail.transactionId, stepCount:2 });
        } catch {
          setMessage("تعذر تجهيز البدائل تلقائيًا؛ لم يتغير شيء في الجدول.");
          emitGuideResult({ featureId:"schedule.action.find-room", ok:false, signal:"schedule.alternatives.failed", transactionId:detail.transactionId });
        }
        return;
      }
      if (detail.type === "assistMoveRoom") {
        const featureId=declaredFeatureId || "schedule.action.move-room";
        rememberGuideOperation(featureId, "move-prepared");
        const id = Number(detail.value || context?.selected?.id || 0);
        const row = rows.find(item => Number(item.id) === id);
        changeView("rooms");
        if (!id || !row) {
          setMessage(!id ? "تم فتح عرض المباني والقاعات. حدّد مقررًا أولًا ثم أعد طلب النقل؛ لم تبدأ أي معاملة." : "المقرر المحدد لم يعد موجودًا في البيانات الحالية. حدّد مقررًا ظاهرًا ثم أعد طلب النقل.");
          emitGuideResult({ featureId, ok:false, signal:!id ? "schedule.move.no-selection" : "schedule.move.row-missing", transactionId:detail.transactionId });
          return;
        }
        setReviewFocus(new Set([id]));
        try {
          const chain = findRepairChain(row, rows);
          if (chain) { setRepairReason("اقتراحات آمنة قبل النقل"); setRepair(chain); }
        } catch {}
        setMessage("تم تجهيز عرض المباني والقاعات وإبراز المقرر. اختر الوجهة المناسبة؛ لن يُعتمد أي تغيير قبل حركتك الفعلية.");
        emitGuideResult({ featureId, ok:true, signal:"schedule.move.prepared", final:false, transactionId:detail.transactionId, stepCount:2 });
        return;
      }
      if (detail.type === "undoById" && detail.value) {
        const entry = undoLog.find(item => item.id === String(detail.value) && !item.usedAt);
        if (entry) void runUndoEntry(entry);
        return;
      }
      if (detail.type === "practice.start") {
        if (!practiceMode) {
          practiceSnapshotRef.current = rows.map(item => ({ ...item }));
          setPracticeMode(true);
          setMessage("وضع تجربة مفعّل. يمكنك السحب والتعديل والحذف دون تغيير الجدول الحقيقي.");
        }
        rememberGuideOperation(declaredFeatureId || "schedule.practice", "practice");
        window.setTimeout(() => emitGuideResult({ featureId:"schedule.practice", ok:true, signal:"schedule.practice.active", transactionId:detail.transactionId, rollbackCommand:{scope:"schedule",type:"practice.stop"}, label:"تجربة آمنة" }), 0);
        return;
      }
      if (detail.type === "practice.stop") {
        if (practiceSnapshotRef.current) setRows(practiceSnapshotRef.current.map(item => ({ ...item })));
        practiceSnapshotRef.current = null;
        setPracticeMode(false);
        setGuideGhostDiff(null);
        setMessage("انتهى وضع التجربة. لم يتغير جدولك الحقيقي.");
        return;
      }
      if (detail.type === "previewSimulation" && detail.payload) {
        const id = Number(detail.payload.id || context?.selected?.id || 0);
        const before = rows.find(item => Number(item.id) === id);
        if (!before) { setMessage("حدد مقررًا أولًا لمعاينة التغيير."); return; }
        const after:any = { ...before };
        if (detail.payload.day) days.forEach(dayItem => { after[dayItem.key] = dayItem.key === detail.payload.day; });
        if (detail.payload.time) {
          const duration = Math.max(30, mins(before.fendtime) - mins(before.fstarttime));
          after.fstarttime = String(detail.payload.time);
          after.fendtime = timeFromMins(mins(after.fstarttime) + duration);
        }
        if (detail.payload.roomCode) after.AdRoomCode = String(detail.payload.roomCode);
        if (detail.payload.roomHall) after.AdRoomHall = String(detail.payload.roomHall);
        if (detail.payload.instructorId) after.AdInstructorId = Number(detail.payload.instructorId);
        const issues = findConflicts([after], rows.filter(item => item.id !== before.id));
        setGuideGhostDiff({ before, after, conflicts:issues.length, summary:issues.length ? `ستظهر ${issues.length.toLocaleString("ar-KW-u-nu-latn")} ملاحظة تعارض في هذه المعاينة.` : "لا يظهر تعارض مانع في هذه المعاينة." });
        setReviewFocus(new Set([id]));
        changeView("week");
        return;
      }
      if (detail.type === "demo" && detail.task === "move-room") {
        changeView("rooms");
        setMessage("تم تجهيز عرض المباني والقاعات. هنا تستطيع نقل المقرر أو مقارنة القاعات بصريًا.");
        return;
      }
      if (detail.type === "assist" && detail.task === "move-room") {
        changeView("rooms");
        setMessage("تم تجهيز عرض المباني والقاعات. اختر القاعة الجديدة أو اسحب البطاقة؛ وسيبقى الاعتماد النهائي تحت قرارك.");
      }
    };
    window.addEventListener("schedule-smart-guide-command", onGuideCommand as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-command", onGuideCommand as EventListener);
  }, [changeView, context?.selected?.id, emitGuideResult, practiceMode, rows, showMobileReadOnlyGate, undoLog, viewMode]);
  useEffect(() => {
    const op = guideOperationRef.current;
    if (!op?.expected?.startsWith("view:")) return;
    const expected = op.expected.slice(5);
    if (viewMode !== expected) return;
    emitGuideResult({ featureId:op.featureId, ok:true, signal:`schedule.view.${expected}.active`, transactionId:op.transactionId, stepCount:1 });
  }, [emitGuideResult, viewMode]);
  useEffect(() => {
    const op = guideOperationRef.current;
    if (op?.expected === "review" && reviewOpen) emitGuideResult({ featureId:op.featureId, ok:true, signal:"schedule.review.open", transactionId:op.transactionId, stepCount:1 });
  }, [emitGuideResult, reviewOpen]);
  useEffect(() => {
    if (!reviewOpen) { normalReviewTrackedRef.current = false; return; }
    const op = guideOperationRef.current;
    if (op?.expected === "review" || normalReviewTrackedRef.current) return;
    normalReviewTrackedRef.current = true;
    const trackingUserId = Number(user?.SystemUserId || 0);
    recordFeatureEvent(trackingUserId, "schedule.tool.review", "attempt");
    recordFeatureEvent(trackingUserId, "schedule.tool.review", "started");
    ensureGuideJourney(trackingUserId, "journey.schedule.review");
    advanceGuideJourney(trackingUserId, "journey.schedule.review", "schedule.review.open");
    recordFeatureEvent(trackingUserId, "schedule.tool.review", "completed", { stepCount:1, retries:0 });
    completeGuideJourney(trackingUserId, "journey.schedule.review");
  }, [reviewOpen, user?.SystemUserId]);
  useEffect(() => {
    const q = quickSearch.trim();
    if (!q) { normalSearchTrackedRef.current = null; return; }
    const trackingUserId = Number(user?.SystemUserId || 0);
    let state = normalSearchTrackedRef.current;
    if (!state || state.query !== q) {
      state = { query:q, startedAt:Date.now(), completed:false };
      normalSearchTrackedRef.current = state;
      recordFeatureEvent(trackingUserId, "schedule.search.quick", "attempt");
      recordFeatureEvent(trackingUserId, "schedule.search.quick", "started");
      ensureGuideJourney(trackingUserId, "journey.schedule.search");
      advanceGuideJourney(trackingUserId, "journey.schedule.search", "schedule.search.query");
    }
    if (filteredRows.length > 0 && !state.completed) {
      advanceGuideJourney(trackingUserId, "journey.schedule.search", "schedule.search.result");
      recordFeatureEvent(trackingUserId, "schedule.search.quick", "completed", { durationMs:Date.now()-state.startedAt, stepCount:2, retries:0 });
      completeGuideJourney(trackingUserId, "journey.schedule.search");
      normalSearchTrackedRef.current = { ...state, completed:true };
    }
  }, [filteredRows.length, quickSearch, user?.SystemUserId]);
  useEffect(() => {
    const op = guideOperationRef.current;
    if (op?.expected === "transfer" && transferOpen) emitGuideResult({ featureId:op.featureId, ok:true, signal:"schedule.transfer.open", transactionId:op.transactionId, stepCount:1 });
  }, [emitGuideResult, transferOpen]);
  useEffect(() => {
    const op = guideOperationRef.current;
    if (op?.expected !== "editor" || editor === "index") return;
    emitGuideResult({ featureId:op.featureId, ok:true, signal:"schedule.editor.open", final:false, transactionId:op.transactionId, stepCount:2 });
  }, [editor, emitGuideResult]);

  /* Keep every hook above every mode-specific return. React #300 was caused by
     create/edit (and copy) returning before the guide hooks below had a chance
     to run, so switching from the index to the editor changed the hook count.
     The views are prepared earlier, but selected only after the hook list is
     complete. */
  if (mode === "copy") return copyView;
  if (editor !== "index") return editorView;

  return (
    <div className={`content-stack schedule-page ${phoneReadOnly ? "schedule-phone" : ""}`.trim()}>
      {/* Lifted clear of the board's horizontal scroller so nothing can clip it,
          and given one line per wall instead of a sentence stitched with dashes. */}
      {refusal ? (
        <div className="move-refusal no-print" role="alertdialog" aria-live="assertive" aria-label="تعذر نقل الموعد">
          <span className="move-refusal-mark" aria-hidden="true"><ShieldAlert /></span>
          <div className="move-refusal-body">
            <strong>تعذّر النقل</strong>
            <ul>
              {refusal.reasons.map((item, index) => (
                <li key={`${item.kind}-${index}`} className={`is-${item.kind}`} title={item.text}>
                  {item.kind === "room" ? <Building2 aria-hidden="true" />
                    : item.kind === "instructor" ? <UsersRound aria-hidden="true" />
                      : item.kind === "cohort" ? <GraduationCap aria-hidden="true" />
                        : <AlertTriangle aria-hidden="true" />}
                  <b>{item.entity}</b>
                  {item.state ? <em>{item.state}</em> : null}
                </li>
              ))}
            </ul>
            <small>الموعد لم يتحرّك.</small>
          </div>
          <button type="button" onClick={() => setRefusal(null)} aria-label="إغلاق" title="إغلاق"
            data-guide-ignore="إغلاق رسالة رفض النقل فقط ولا يغيّر الجدول"><X aria-hidden="true" /></button>
        </div>
      ) : null}
      {focusMode ? (
        <button
          type="button"
          className="schedule-focus-exit no-print"
          data-guide-ignore="زر خروج خافت من وضع التركيز؛ Escape ينفذ الإجراء نفسه"
          onClick={() => {
            setFocusExitPending(true);
          }}
          aria-label="إنهاء وضع التركيز"
          title="إنهاء التركيز · Esc"
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
      <PageTitle
        eyebrow="مركز الجدول"
        subtitle="نطاق · مراجعة · نشر"
        action={<AddButton onClick={openCreate}>إضافة موعد</AddButton>}
      >
        الجدول الدراسي
      </PageTitle>
      {practiceMode ? (
        <div className="schedule-practice-strip no-print" data-guide-target="schedule.practice" role="status">
          <ShieldCheck aria-hidden="true" />
          <span><strong>وضع تجربة</strong><small>كل تغيير مؤقت على هذا الجهاز فقط.</small></span>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail:{ scope:"schedule", type:"practice.stop", featureId:"schedule.practice" } }))}>إنهاء</button>
        </div>
      ) : null}
      {guideGhostDiff ? (
        <section className="schedule-guide-ghost-diff no-print" aria-label="معاينة التغيير دون حفظ">
          <header><Eye aria-hidden="true" /><div><small>معاينة فقط</small><strong>{guideGhostDiff.before.AdCourseName || "المقرر المحدد"}</strong></div><button type="button" onClick={() => setGuideGhostDiff(null)} aria-label="إلغاء المعاينة"><X /></button></header>
          <div className="schedule-guide-ghost-flow">
            <span><small>قبل</small><b>{arabicDays(guideGhostDiff.before)} · {formatScheduleTimeRange(guideGhostDiff.before.fstarttime, guideGhostDiff.before.fendtime)}</b><em>{[guideGhostDiff.before.AdRoomCode,guideGhostDiff.before.AdRoomHall].filter(Boolean).join("/")}</em></span>
            <ChevronLeft aria-hidden="true" />
            <span className="after"><small>بعد</small><b>{arabicDays(guideGhostDiff.after)} · {formatScheduleTimeRange(guideGhostDiff.after.fstarttime, guideGhostDiff.after.fendtime)}</b><em>{[guideGhostDiff.after.AdRoomCode,guideGhostDiff.after.AdRoomHall].filter(Boolean).join("/")}</em></span>
          </div>
          <p className={guideGhostDiff.conflicts ? "warn" : "ok"}>{guideGhostDiff.summary}</p>
          <footer><button type="button" onClick={() => setGuideGhostDiff(null)}>إلغاء</button><button type="button" data-guide-ignore="اعتماد يدوي من معاينة شبحية يفتح المحرر ولا يحفظ تلقائيًا" className="primary" onClick={() => { setGuideGhostDiff(null); const row=rows.find(item=>item.id===guideGhostDiff.before.id); if(row) openEdit(row); }}>اعتماد يدوي</button></footer>
        </section>
      ) : null}
      {historicalChoice ? (
        <div className="historical-time-backdrop no-print" role="dialog" aria-modal="true" aria-label="تنبيه التوقيت التاريخي">
          <section className="historical-time-dialog">
            <button type="button" className="historical-time-close" data-guide-ignore="إلغاء نافذة اقتراح التوقيت فقط وإرجاع الموعد لمكانه السابق؛ لا ينفذ نقلاً" onClick={() => settleHistoricalTimeChoice("cancel")} aria-label="إلغاء النقل والعودة للوضع السابق" title="إلغاء"><X /></button>
            <header><span><Clock3 aria-hidden="true" /></span><div><small>{historicalChoice.source}</small><strong>{historicalChoice.dayLabel} · وقت غير معتاد</strong></div></header>
            <div className="historical-time-compare" dir="ltr"><b>{scheduleClockForDisplay(historicalChoice.picked)}</b><ChevronLeft aria-hidden="true" /><strong>{scheduleClockForDisplay(historicalChoice.preferred)}</strong></div>
            <p>النمط الأقرب يشير إلى <b dir="ltr">{scheduleClockForDisplay(historicalChoice.preferred)}</b>. الوقت الذي اخترته <b dir="ltr">{scheduleClockForDisplay(historicalChoice.picked)}</b> يبقى مسموحاً.</p>
            <footer><button type="button" data-guide-ignore="اختيار صريح داخل تنبيه التوقيت لتثبيت الموعد المسحوب كما اختاره المستخدم" onClick={() => settleHistoricalTimeChoice("picked")}>ثبّت {scheduleClockForDisplay(historicalChoice.picked)}</button><button type="button" className="primary" data-guide-ignore="اختيار صريح داخل تنبيه التوقيت لاعتماد الوقت التاريخي المقترح بدلاً من الوقت المسحوب" onClick={() => settleHistoricalTimeChoice("preferred")}>استخدم {scheduleClockForDisplay(historicalChoice.preferred)}</button></footer>
          </section>
        </div>
      ) : null}
      {mobileViewGate ? (
        <div className="mobile-desktop-gate no-print" role="dialog" aria-modal="true" aria-label="بعض عروض الجدول للقراءة فقط على الهاتف">
          <div className="mobile-desktop-gate-card">
            <span className="mobile-desktop-gate-icon">
              {mobileViewGate === "week" ? <CalendarDays /> : <MapPin />}
            </span>
            <div>
              <strong>{mobileViewGate === "week" ? "عرض الأسبوع" : "عرض المباني والقاعات"} للقراءة فقط على الهاتف</strong>
              {/* Two facts and a way out — a state, a limit, and where to go
                  instead. The sentence spent twenty-nine words saying that,
                  and the reader wanted to know which of the three applied to
                  them. Three marks answer that at a glance. */}
              <ul className="gate-facts">
                <li><Eye aria-hidden="true" /><b>القراءة</b><span>كاملة هنا</span></li>
                <li><Move aria-hidden="true" /><b>السحب</b><span>من الكمبيوتر</span></li>
                <li><ListIcon aria-hidden="true" /><b>للتعديل</b><span>افتح «قائمة»</span></li>
              </ul>
            </div>
            <button type="button" onClick={() => setMobileViewGate(null)}>فهمت · متابعة العرض</button>
          </div>
        </div>
      ) : null}
      {returnNote || error || message ? <div className="schedule-feedback-stack" aria-live="polite">
        {returnNote ? <Notice type="success">{returnNote}</Notice> : null}
        {error ? <Notice>{error}</Notice> : null}
        {message ? <Notice type="success">{message}</Notice> : null}
      </div> : null}
      {!networkOnline || offlinePending || liveCollaborators || liveEditors + liveHolders ? (
        <div className="schedule-ops-strip no-print" aria-label="حالة العمل الذكي">
          {!networkOnline ? <span className="schedule-ops-pill warn"><Radio aria-hidden="true"/><b>دون اتصال · التغييرات الآمنة محلية</b></span> : null}
          {offlinePending ? <span className="schedule-ops-pill warn"><Upload aria-hidden="true"/><b>{offlinePending.toLocaleString("ar-KW-u-nu-latn")} بانتظار المزامنة</b></span> : null}
          {liveCollaborators ? <span className="schedule-ops-pill"><UsersRound aria-hidden="true"/><b>{liveCollaborators.toLocaleString("ar-KW-u-nu-latn")} يعمل الآن</b></span> : null}
          {liveEditors + liveHolders ? <span className="schedule-ops-pill"><Bookmark aria-hidden="true"/><b>{(liveEditors + liveHolders).toLocaleString("ar-KW-u-nu-latn")} بطاقة تحت التحرير</b></span> : null}
        </div>
      ) : null}
      {/* Silent intelligence: routine timing/physics feedback no longer owns
          vertical space above the timetable. The same state is kept for assistive
          technology and diagnostics; blocking problems still use the existing
          conflict/error UI, and undo remains in the compact undo bar. */}
      {physicsNotice ? <span className="sr-only" role="status" aria-live="polite">{physicsNotice}</span> : null}
      <div className="schedule-overview-stack no-print">
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
      </div>
      <Surface className="schedule-control">
        <div className="filter-strip">
          <Field label="الكلية"><select data-guide-target="schedule.filter.college" value={filterCollege || ""} onChange={(e)=>{const id=Number(e.target.value)||0;setFilterCollege(id);setFilterSection(id && !isPowerAdmin ? (resolveScopeSelection(scopes,id,false).defaultSectionId||0) : 0)}}><option value="">اختر الكلية</option>{filterColleges.map(c=><option key={c.AdCollegeId} value={c.AdCollegeId}>{c.AdCollegeName}</option>)}</select></Field>
          {isPowerAdmin || !filterScope.lockSection ? <Field label="القسم العلمي"><select data-guide-target="schedule.filter.section" value={filterSection || ""} disabled={!filterCollege} onChange={(e)=>setFilterSection(Number(e.target.value)||0)}><option value="">كل الأقسام</option>{filterSections.map(s=><option key={s.AdSectionId} value={s.AdSectionId}>{s.AdSectionName}</option>)}</select></Field> : null}
          <Field label="الفصل الدراسي">
            <select
              data-guide-target="schedule.filter.term"
              value={filterTerm || ""}
              onChange={(e) => setFilterTerm(Number(e.target.value) || 0)}
            >
              <option value="">اختر الفصل</option>
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
            <button data-guide-target="schedule.view.list" type="button" className={viewMode === "list" ? "active" : ""} aria-pressed={viewMode === "list"} onClick={() => changeView("list")}>
              <LayoutList aria-hidden="true" /> قائمة
            </button>
            {!phoneReadOnly ? (<>
              <button data-guide-target="schedule.view.week" type="button" className={viewMode === "week" ? "active" : ""} aria-pressed={viewMode === "week"} onClick={() => changeView("week")}>
                <CalendarDays aria-hidden="true" /> أسبوع
              </button>
              <button data-guide-target="schedule.view.rooms" type="button" className={viewMode === "rooms" ? "active" : ""} aria-pressed={viewMode === "rooms"} onClick={() => changeView("rooms")}>
                <MapPin aria-hidden="true" /> المباني والقاعات
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
            onDelete={async view => {
              if (!(await visualConfirm({ title: `حذف العرض «${view.name}»`, message: "سيُحذف هذا العرض المحفوظ من قائمتك.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
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
              data-guide-ignore="يبرز التداخلات القائمة على الأسبوع للقراءة فقط ولا يعدّل الجدول"
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
              {/* The count alone said nothing about what pressing it would do,
                  so the chip read as a warning with no exit. */}
              <em>اعرضها على الأسبوع</em>
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
          <label className="schedule-quick-search" role="search" data-guide-target="schedule.search.quick">
            <Search aria-hidden="true" />
            <input
              type="search"
              ref={searchRef}
              value={quickSearch}
              onChange={e => setQuickSearch(e.target.value)}
              placeholder="بحث سريع"
              aria-label="بحث سريع داخل مواعيد الجدول"
            />
            {quickSearch ? <button type="button" data-guide-ignore="مسح البحث السريع فقط" onClick={() => setQuickSearch("")} aria-label="مسح البحث السريع" title="مسح"><X aria-hidden="true" /></button> : null}
          </label>
          <div className="schedule-tool-actions" role="group" aria-label="أدوات الجدول الإضافية">
            {/* The schedule lens was retired: its one distinct trick — dimming
                instead of removing — did not earn a permanent button in a busy
                toolbar when the quick search answers the same question by name
                and the query centre covers the structured cases in full. */}
            <GhostButton
              type="button"
              className={workspaceToolsOpen ? "schedule-tools-toggle is-close" : "schedule-tools-toggle"}
              data-guide-target="schedule.tool.more"
              onClick={() => setWorkspaceToolsOpen(open => !open)}
              aria-expanded={workspaceToolsOpen}
              aria-label={workspaceToolsOpen ? "إغلاق الأدوات" : "المزيد من الأدوات"}
              title={workspaceToolsOpen ? "إغلاق الأدوات" : "إظهار أدوات التركيز والمراجعة والنشر"}
            >
              {workspaceToolsOpen ? <X aria-hidden="true" /> : <><Layers aria-hidden="true" /> المزيد</>}
            </GhostButton>
            {!phoneReadOnly && (workspaceToolsOpen || focusMode) ? <GhostButton
              type="button"
              data-guide-ignore="تبديل وضع التركيز فقط؛ لا يغير بيانات الجدول"
              onClick={() => {
                physics.cancel();
                setFocusMode(!focusMode);
                setPresentationMode(false);
              }}
              aria-pressed={focusMode}
            >
              <Focus /> {focusMode ? "إنهاء التركيز" : "تركيز"}
            </GhostButton> : null}
            {workspaceToolsOpen ? <GhostButton
              type="button"
              onClick={() => setViewDialog({ mode: "create" })}
              title="احفظ الكلية والقسم والفصل وطريقة العرض والتلوين والطبقات باسم تعود إليه"
            >
              <Bookmark aria-hidden="true" /> حفظ العرض الحالي
            </GhostButton> : null}
            {workspaceToolsOpen ? <GhostButton data-guide-target="schedule.tool.review" type="button" onClick={() => setReviewOpen(true)} title="فحص الجدول كاملاً قبل الاعتماد">
              <ClipboardCheck /> مراجعة الاعتماد
            </GhostButton> : null}
            {workspaceToolsOpen && filterTerm ? <GhostButton
              type="button"
              data-guide-ignore="أداة قراءة فقط: تعرض النوافذ الأسبوعية المشتركة ولا تغيّر الجدول"
              onClick={() => setMeetingOpen(true)}
              title="اختر أساتذة ليعرض الجدول النوافذ الأسبوعية التي يتفرغون فيها معاً"
            >
              <UsersRound /> متى نلتقي؟
            </GhostButton> : null}
            {workspaceToolsOpen ? <GhostButton
              type="button"
              data-guide-target="schedule.tool.data"
              onClick={() => { if (!showMobileReadOnlyGate()) setTransferOpen(true); }}
              title="استيراد وتصدير واستبدال أستاذ والمنتدبون"
            >
              <ArrowLeftRight /> أدوات البيانات
            </GhostButton> : null}
            {/* Borrowing a room from another department only means something while
                the term is still being taught. On a term marked as finished the
                whole market is withdrawn rather than left to offer windows in a
                week nobody will attend. */}
            {workspaceToolsOpen && mode === "schedule" && workspaceReady && filterCollege && filterSection && filterTerm && !selectedTermClosed ? (
              <div className="schedule-control-barter schedule-control-barter--inside-more">
                <HallBarterBoard
                  collegeId={filterCollege}
                  sectionId={filterSection}
                  termId={filterTerm}
                  liveSerial={liveFeedSerial}
                  onReservationsChange={setHallBarterReservations}
                />
              </div>
            ) : null}
            {workspaceToolsOpen && permissions.includes(7) ? (
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
      </Surface>
      <ScheduleExperienceLayer
        experience={experience}
        isPowerAdmin={isPowerAdmin}
        onOpenRow={openEdit}
        onOpenRows={openDecisionRows}
        onEnsureWeek={() => setViewMode("week")}
        rows={filteredRows}
        headless
      />
      {(rowsLoading && !rows.length) || rowsForeign ? (
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
                    onClick={() => void openContext(s)}
                    onDoubleClick={() => openEdit(s)}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { void openContext(s); return; }
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
        <Surface className="rooms-surface" data-guide-target="schedule.rooms.board">
          {(() => {
            /* --- The paper timetable, alive -----------------------------------
               The sheet this program replaces lists rooms as rows and the day
               as columns of hours — the mind of the building itself. Same here:
               room is now a five-day card: the paper's day column becomes five
               living lanes sharing one hour line. A reader can still fold it
               down to one day, but the default finally answers the real room
               question: what happens here across the whole week? */
            const { displayDays, allBuildings, allRooms, byDayRoom, byDayRoomLayout, noRoomByDay, noRoomLayout, roomCounts, hourMarks, span } = roomsMatrix;
            /* Pinning rooms narrows the matrix to the ones being worked on —
               a building's four labs instead of every room in the college. */
            const tracedRooms = moveTraces
              .filter(trace => trace.roomKey !== "|")
              .map(trace => ({
                key: trace.roomKey,
                building: trace.roomBuilding,
                hall: trace.roomHall,
                roomCode: trace.roomBuilding,
                roomHall: trace.roomHall,
                buildingKey: trace.roomBuildingKey,
                hallKey: trace.roomHallKey,
                label: trace.roomLabel,
              }));
            // Keep a room on screen for the seven-second afterglow even if the
            // moved lecture was its last appointment. Without this merge the
            // source row vanished at the exact instant we tried to say
            // «نُقل من هنا», which made room-to-room moves feel less physical
            // than the week view.
            const roomsWithAfterglow = [...new Map(
              [...allRooms, ...tracedRooms].map(room => [room.key, room] as const),
            ).values()].sort(byRoomIdentity);
            const buildingScopedRooms = matrixBuildings.size
              ? roomsWithAfterglow.filter(room => matrixBuildings.has(room.buildingKey))
              : roomsWithAfterglow;
            const roomFilterKey = normalizeRoomToken(roomFilterQuery);
            const roomFilterMatches = roomFilterKey
              ? buildingScopedRooms.filter(room =>
                  normalizeRoomToken(`${room.building} ${room.hall} ${room.label}`).includes(roomFilterKey),
                )
              : buildingScopedRooms;
            const roomList = matrixRooms.size
              ? roomFilterMatches.filter(room => matrixRooms.has(room.key))
              : roomFilterMatches;
            // The rooms board and dense week now literally share the same
            // horizontal clock geometry. There is no second formula to drift:
            // same hour width, same 19:30 terminal expansion, same pixel for
            // every label and vertical guide.
            const ROOM_DAY_LABEL_WIDTH = Math.max(weekStripConfig.labelWidth, 96);
            const ROOM_FIXED_WIDTH = ROOM_DAY_LABEL_WIDTH;
            const ROOM_LANE_HEIGHT = 48;
            const roomOffset = weekStripOffset;
            const timelineWidth = weekStripConfig.timelineWidth;
            const roomsCanvasWidth = ROOM_FIXED_WIDTH + timelineWidth;
            const pct = (minutesAt: number) => (roomOffset(minutesAt) / timelineWidth) * 100;
            const roomSpanPct = (from: number, to: number) => Math.max(0.18, ((roomOffset(to) - roomOffset(from)) / timelineWidth) * 100);
            const trackHeight = (lanes: number) => Math.max(54, 8 + Math.max(1, lanes) * ROOM_LANE_HEIGHT);
            const roomTraceStyle = (trace: { from: number; to: number }): React.CSSProperties => {
              // Use the exact same positioning system as renderTrackCard
              // to ensure the trace is always bound to the original slot geometry.
              return {
                right: `${pct(trace.from)}%`,
                width: `${Math.max(0.18, roomSpanPct(trace.from, trace.to))}%`,
              };
            };
            const layoutFor = (day: DayKey, roomKey: string) => byDayRoomLayout.get(`${day}|${roomKey}`) || { items: [], lanes: 1 };
            const renderTrackCard = (row: FSchedule, sourceDay: DayKey, placement?: { lane: number }) => {
              const course = courseById.get(row.AdCourseId);
              const instructor = instructorById.get(row.AdInstructorId);
              const code = String(course?.CourseCode || "").trim() || "—";
              const title = row.AdCourseName || course?.CourseName || code;
              const who = instructor?.AdInstructorName ? firstLast(instructor.AdInstructorName) : "بدون أستاذ";
              const activeRoomDays = days.filter(day => Boolean((row as any)[day.key]));
              const dayNames = activeRoomDays.map(day => day.label).join(" · ") || "بلا يوم";
              const undoId = recentMoves[row.id];
              const undoEntry = undoId ? undoLog.find(item => item.id === undoId && !item.usedAt) : null;
              const actualFrom = mins(row.fstarttime), actualTo = mins(row.fendtime);
              const cardStyle: React.CSSProperties = {
                ["--hue" as any]: hueFor(code, title, instructor?.AdInstructorName, placeOf(row)),
                right: `${pct(actualFrom)}%`,
                width: `${Math.max(0.18, roomSpanPct(actualFrom, actualTo))}%`,
                ...(placement ? {
                  top: `${4 + placement.lane * ROOM_LANE_HEIGHT}px`,
                  bottom: "auto",
                  height: "56px",
                } : {}),
              };
              // The card is bound to the same drag engine the week uses, so it
              // lifts, floats, is judged and lands with the identical behaviour
              // — not an imitation of it.
              const rowPending = pendingWriteIds.has(row.id);
              const trackGrip = rowPending ? {} : physics.bindEvent(row, sourceDay as any);
              return (
                <article
                  {...trackGrip}
                  key={row.id}
                  data-row-id={row.id}
                  data-guide-description="بطاقة موعد داخل الجدول: اضغطها لقراءة الموعد وتحليله، أو اسحبها إلى يوم أو ساعة أو قاعة أخرى لنقلها بعد فحص التعارض."
                  className={`rooms-card ${lensClass(row)} ${xrayClass(row)} ${physicsRelationClass(row)} ${draggingId === row.id ? "ripple-source" : ""} ${justChangedId === row.id ? "just-changed" : ""} ${liveClash.ids.has(row.id) ? "live-clash" : ""} ${physicsActive && physicsOrigin?.id === row.id ? "physics-source-lift" : ""} ${keyMove?.rowId === row.id ? "week-keymove-source" : ""} ${rowPending ? "schedule-row-pending" : ""} ${hueFocusClass(row)}`}
                  style={cardStyle}
                  draggable={!physics.supported && !rowPending}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/schedule-id", String(row.id));
                    e.dataTransfer.effectAllowed = "move";
                    beginRipple(row);
                  }}
                  onDragEnd={clearRipple}
                  title={`${title} · ${instructor?.AdInstructorName || "بدون أستاذ"} · ${dayNames} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`}
                  aria-label={`${title} · ${instructor?.AdInstructorName || "بدون أستاذ"} · ${dayNames} · ${formatScheduleTimeRange(row.fstarttime, row.fendtime)}`}
                  onPointerDown={(e) => {
                    pressOrigin.current = { x: e.clientX, y: e.clientY };
                    if (rowPending) {
                      e.preventDefault();
                      e.stopPropagation();
                      setPhysicsNotice("هذا الموعد ما زال بانتظار تثبيت نقله السابق. يمكنك سحب بقية المواعيد الآن، ثم العودة إليه بعد اكتمال الحفظ.");
                      return;
                    }
                    trackGrip.onPointerDown?.(e);
                  }}
                  onClick={(e) => {
                    if (rowPending || physics.didDrag() || physicsActive) return;
                    const from = pressOrigin.current;
                    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return;
                    void openContext(row);
                  }}
                  onPointerEnter={(e) => { if (!physicsActive) openPeek(row, e.currentTarget); }}
                  onPointerLeave={() => closePeek(row.id)}
                  onFocus={(e) => openPeek(row, e.currentTarget)}
                  onBlur={() => closePeek(row.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { void openContext(row); return; }
                    if (e.key === " " || e.key === "Spacebar") { e.preventDefault(); pickUpWithKeyboard(row); }
                  }}
                >
                  <GripVertical data-physics-handle="true" className="rooms-drag-handle" aria-hidden="true" />
                  <div className="rooms-identity-line">
                    <b>{courseLabel(title, 0.82).text}</b>
                    <em dir="ltr">{code}</em>
                  </div>
                  <span title={instructor?.AdInstructorName || "بدون أستاذ"}>{who}</span>
                  {undoEntry ? (
                    <button
                      type="button"
                      className="week-moved-pill"
                      data-guide-target="schedule.undo"
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
              if (!row) return;
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
                  {physicsActive && dragComparison ? (
                    <div className="rooms-drag-compare" aria-live="polite">
                      <GripVertical aria-hidden="true" />
                      <span><b dir="ltr">{dragComparison.before}</b><ChevronLeft aria-hidden="true" /><b dir="ltr">{dragComparison.after}</b></span>
                      <em dir="ltr">{dragComparison.place}</em>
                    </div>
                  ) : null}
                </div>
                {!focusMode ? (
                  <div className={`week-note rooms-note ${physicsActive ? "gravity-note-active" : ""}`}>
                    <GripVertical aria-hidden="true" />
                    <span aria-live="polite">
                      {physicsActive && dragComparison
                        ? `قبل: ${dragComparison.before} · بعد: ${dragComparison.after} · القاعة ${dragComparison.place}`
                        : phoneReadOnly
                          ? "على الهاتف يبقى عرض المباني والقاعات للقراءة فقط، والتعديل والإضافة متاحان من «قائمة»."
                          : "اسحب الموعد لتنقله كاملًا بأيامه المسجلة · اضغط أي فراغ لإضافة موعد داخل القاعة · انتقل بـTab إلى محاضرة واضغط مسافة لتحريكها بالأسهم · التراجع متاح بعد كل نقل."}
                    </span>
                  </div>
                ) : null}
                {allBuildings.length > 0 ? (
                  <div className="rooms-filter-block">
                    <div className="rooms-filter-copy">
                      <div><Building2 /><strong>فلتر المباني</strong></div>
                      <small>{phoneReadOnly ? "المباني معروضة للقراءة فقط على الهاتف؛ التصفية والتحريك من الكمبيوتر." : matrixBuildings.size ? `اخترت ${matrixBuildings.size.toLocaleString("ar-KW-u-nu-latn")} من ${allBuildings.length.toLocaleString("ar-KW-u-nu-latn")} مبنى — اضغط لإضافة مبنى أو إزالته.` : "كل المباني ظاهرة — اختر مبنى واحدًا أو عدة مبانٍ قبل تصفية القاعات."}</small>
                    </div>
                    <div className="rooms-picker" role="group" aria-label="اختيار مبنى واحد أو عدة مبانٍ">
                      <button
                        type="button"
                        className={`rooms-chip ${matrixBuildings.size ? "" : "on"}`}
                        aria-pressed={matrixBuildings.size === 0}
                        data-guide-ignore="مرشح بصري للمباني داخل لوحة القاعات؛ لا يغير بيانات الجدول"
                        onClick={(e) => {
                          setMatrixBuildings(new Set());
                          requestAnimationFrame(() => e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
                        }}
                      >
                        كل المباني
                      </button>
                      {allBuildings.map(building => (
                        <button
                          type="button"
                          key={building.key}
                          className={`rooms-chip ${matrixBuildings.has(building.key) ? "on" : ""}`}
                          aria-pressed={matrixBuildings.has(building.key)}
                          data-guide-ignore="مرشح بصري لمبنى داخل لوحة القاعات؛ لا يغير بيانات الجدول"
                          title={`${matrixBuildings.has(building.key) ? "إخفاء" : "إظهار"} ${building.label}`}
                          onClick={(e) => {
                            setMatrixBuildings(current => {
                              const next = new Set(current);
                              if (next.has(building.key)) next.delete(building.key); else next.add(building.key);
                              return next;
                            });
                            requestAnimationFrame(() => e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
                          }}
                        >
                          <span dir="ltr">{building.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {buildingScopedRooms.length > 1 ? (
                  <div className="rooms-filter-block">
                    <div className="rooms-filter-copy">
                      <div><MapPin /><strong>القاعات المعروضة</strong></div>
                      <small>{phoneReadOnly
                        ? "القاعات معروضة للقراءة فقط على الهاتف؛ التصفية والتحريك من الكمبيوتر."
                        : roomFilterKey
                          ? `نتيجة الفلتر: ${countOf(roomFilterMatches.length, AR.room)} من ${countOf(buildingScopedRooms.length, AR.room)}.`
                          : matrixRooms.size
                            ? `اخترت ${matrixRooms.size} من ${countOf(buildingScopedRooms.length, AR.room)} — اضغط لإضافة قاعة أو إزالتها.`
                            : matrixBuildings.size
                              ? "كل قاعات المباني المختارة ظاهرة — اختر قاعة واحدة أو مجموعة قاعات للمقارنة."
                              : "كل القاعات ظاهرة — اختر قاعة واحدة أو مجموعة قاعات للمقارنة."}</small>
                      {!phoneReadOnly ? (
                        <label className="week-legend-search rooms-filter-search">
                          <Search aria-hidden="true" />
                          <input
                            type="search"
                            value={roomFilterQuery}
                            onChange={(e) => setRoomFilterQuery(e.target.value)}
                            placeholder="فلتر القاعات…"
                            aria-label="فلتر القاعات بالرمز أو المبنى أو رقم القاعة"
                            autoComplete="off"
                            spellCheck={false}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="rooms-picker" role="group" aria-label="اختيار قاعة واحدة أو عدة قاعات">
                      <button
                        type="button"
                        className={`rooms-chip ${matrixRooms.size ? "" : "on"}`}
                        aria-pressed={matrixRooms.size === 0}
                        data-guide-ignore="مرشح بصري للقاعات داخل لوحة القاعات؛ لا يغير بيانات الجدول"
                        onClick={(e) => {
                          setMatrixRooms(new Set());
                          requestAnimationFrame(() => e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
                        }}
                      >
                        كل القاعات
                      </button>
                      {roomFilterMatches.map(room => (
                        <button
                          type="button"
                          key={room.key}
                          className={`rooms-chip ${matrixRooms.has(room.key) ? "on" : ""}`}
                          aria-pressed={matrixRooms.has(room.key)}
                          data-guide-ignore="مرشح بصري لقاعة داخل لوحة القاعات؛ لا يغير بيانات الجدول"
                          title={`${matrixRooms.has(room.key) ? "إخفاء" : "إظهار"} ${displayRoomBadge(room)}`}
                          onClick={(e) => {
                            setMatrixRooms(current => {
                              const next = new Set(current);
                              if (next.has(room.key)) next.delete(room.key); else next.add(room.key);
                              return next;
                            });
                            requestAnimationFrame(() => e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
                          }}
                        >
                          <span dir="ltr">{displayRoomBadge(room)}</span>
                        </button>
                      ))}
                      {roomFilterKey && roomFilterMatches.length === 0 ? (
                        <span className="rooms-filter-empty">لا توجد قاعة مطابقة.</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {hueLegend.length > 1 ? (
                  <div className="week-legend rooms-legend" role="group" aria-label="مفتاح ألوان المباني والقاعات">
                    <div className="week-legend-basis" role="group" aria-label="معنى اللون">
                      {([
                        { key: "course", label: "المقررات" },
                        { key: "instructor", label: "الأساتذة" },
                        { key: "room", label: "المباني والقاعات" },
                      ] as const).map(basis => (
                        <button
                          key={basis.key}
                          type="button"
                          className={hueBy === basis.key ? "is-on" : ""}
                          aria-pressed={hueBy === basis.key}
                          onClick={() => setHueBy(basis.key)}
                          title={`لوّن المباني والقاعات حسب ${basis.label}`}
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
                    <LegendScroller label="استخدم السهمين أو عجلة الماوس للتنقل يميناً ويساراً">
                      {legendShown.length === 0 ? <span className="week-legend-none">لا مطابقة</span> : null}
                      {legendShown.map(item => {
                        const folded = hueHidden.has(item.key);
                        return (
                          <span className={`week-legend-item ${folded ? "is-folded" : ""}`} key={item.key} style={{ ["--hue" as any]: item.hue, ...textureFor(item.hue) }}>
                            <button
                              type="button"
                              className={`week-legend-chip ${hueFocus.has(item.key) ? "is-on" : ""}`}
                              aria-pressed={hueFocus.has(item.key)}
                              disabled={folded}
                              title={`${item.label} — ${countOf(item.count, AR.appointment)} · اضغط لإبرازها في المباني والقاعات`}
                              onClick={() => toggleHueFocus(item.key)}
                            >
                              <i aria-hidden="true" /><span>{item.label}</span><em className="num">{item.count.toLocaleString("ar-KW-u-nu-latn")}</em>
                            </button>
                            <button
                              type="button"
                              className="week-legend-eye"
                              aria-pressed={folded}
                              aria-label={folded ? `إظهار ${item.label}` : `إخفاء ${item.label} من المباني والقاعات`}
                              title={folded ? `إظهار ${item.label}` : `إخفاء ${item.label} مؤقتاً — لا يُحذف شيء`}
                              onClick={() => toggleHueHidden(item.key)}
                            >
                              {folded ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                            </button>
                          </span>
                        );
                      })}
                    </LegendScroller>
                    {hueHidden.size ? (
                      <button type="button" className="week-legend-clear is-folded-clear" onClick={() => setHueHidden(new Set())}>
                        <EyeOff aria-hidden="true" />أعد المطوي <b className="num">{hueHidden.size.toLocaleString("ar-KW-u-nu-latn")}</b>
                      </button>
                    ) : null}
                    {hueFocus.size ? (
                      <button type="button" className="week-legend-clear" onClick={() => setHueFocus(new Set())}>
                        <X aria-hidden="true" />عرض الكل {hueFocus.size > 1 ? <b className="num">{hueFocus.size.toLocaleString("ar-KW-u-nu-latn")}</b> : null}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <div
                  ref={roomsRulerScrollRef}
                  className="rooms-ruler-scroll"
                  onScroll={(e) => syncRoomsScroll("ruler", e.currentTarget.scrollLeft)}
                  aria-label="شريط ساعات القاعات"
                >
                  <div
                    className={`rooms-scale ${matrixDay === "week" ? "rooms-scale-week" : ""}`}
                    style={{
                      ["--rooms-canvas-width" as any]: `${roomsCanvasWidth}px`,
                      ["--rooms-day-label" as any]: `${ROOM_DAY_LABEL_WIDTH}px`,
                      ["--rooms-fixed-label" as any]: `${ROOM_FIXED_WIDTH}px`,
                    }}
                    aria-hidden="true"
                  >
                    <small className="rooms-scale-identity">
                      <span className="schedule-ruler-day-title">{matrixDay === "week" ? "اليوم" : ""}</span>
                    </small>
                    <div style={{ width: `${timelineWidth}px` }}>
                      {timeSlots.map(slot => (
                        <i
                          key={`rooms-scale-line-${slot}`}
                          className={`rooms-scale-line schedule-time-line ${mins(slot) % 60 === 0 ? "major rooms-scale-line-major" : "half rooms-scale-line-half"} ${slot === SCHEDULE_DAY_END_TIME ? "terminal rooms-scale-line-terminal" : ""}`}
                          style={{ insetInlineStart: `${roomOffset(mins(slot))}px` }}
                        />
                      ))}
                      {hourMarks.filter(mark => mark !== gridWindow.end).map(mark => (
                        <span
                          className={`schedule-time-label ${mark === gridWindow.start ? "schedule-time-label-start" : ""}`}
                          key={mark}
                          style={{ right: `${roomOffset(mark)}px` }}
                          dir="ltr"
                        >
                          {scheduleClockForDisplay(timeFromMins(mark))}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  ref={roomsMainScrollRef}
                  className="rooms-main-scroll"
                  onScroll={(e) => syncRoomsScroll("main", e.currentTarget.scrollLeft)}
                >
                  <div
                    className="rooms-rows"
                    style={{
                      ["--rooms-canvas-width" as any]: `${roomsCanvasWidth}px`,
                      ["--rooms-day-label" as any]: `${ROOM_DAY_LABEL_WIDTH}px`,
                      ["--rooms-fixed-label" as any]: `${ROOM_FIXED_WIDTH}px`,
                    }}
                  >
                  {roomList.map(room => (
                    <section className="rooms-week-room" key={room.key} aria-label={`القاعة ${room.label}`} title={room.label}>
                      <div className="rooms-week-days">
                        {displayDays.map((day, dayIndex) => {
                          const roomLayout = layoutFor(day.key as DayKey, room.key);
                          const roomTrackHeight = trackHeight(roomLayout.lanes);
                          return (
                            <div className="rooms-row" key={`${room.key}|${day.key}`} style={{ minHeight: roomTrackHeight }}>
                              <small
                                className={`rooms-day-label ${dayIndex === 0 ? "has-room-identity" : ""}`}
                                title={dayIndex === 0 ? `مبنى ${room.building || "—"} · قاعة ${room.hall || room.label || "—"} · ${day.label}` : day.label}
                              >
                                {dayIndex === 0 ? (
                                  <span className="rooms-room-identity-compact" aria-label={`مبنى ${room.building || "—"}، قاعة ${room.hall || room.label || "—"}`}>
                                    <Building2 aria-hidden="true" />
                                    <b dir="ltr">{room.building || "—"}</b>
                                    <i aria-hidden="true">›</i>
                                    <strong dir="ltr">{room.hall || room.label || "—"}</strong>
                                  </span>
                                ) : null}
                                <span className="rooms-day-name">{day.label}</span>
                              </small>
                              <div
                                className="rooms-track"
                                style={{ height: roomTrackHeight }}
                                data-physics-day-column="true"
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={trackDrop(room.roomCode, room.roomHall, day.key as DayKey)}
                              >
                                {timeSlots.map(slot => (
                                  <i
                                    key={`slot-${slot}`}
                                    className={`rooms-slot ${physicsSlotClass(day.key as DayKey, slot, `${room.roomCode}|${room.roomHall}`)}`}
                                    data-physics-slot="true"
                                    data-physics-day={day.key}
                                    data-physics-start={slot}
                                    data-physics-label={`${day.label} · ${room.label}`}
                                    data-physics-room={`${room.roomCode}|${room.roomHall}`}
                                    style={{ right: `${pct(mins(slot))}%`, width: `${roomSpanPct(mins(slot), mins(slot) + SCHEDULE_SLOT_MINUTES)}%` }}
                                    role="button"
                                    tabIndex={-1}
                                    title={`إضافة موعد · ${day.label} ${slot} · ${room.label}`}
                                    onPointerDown={(e) => {
                                      if (physicsActive || e.target !== e.currentTarget || e.button !== 0) return;
                                      const trackKey = `${room.key}|${day.key}`;
                                      paintRef.current = { day: day.key as DayKey, anchor: mins(slot), roomCode: room.roomCode, roomHall: room.roomHall, trackKey };
                                      setPaint({ day: day.key as DayKey, from: slot, to: timeFromMins(mins(slot) + SCHEDULE_SLOT_MINUTES), roomCode: room.roomCode, roomHall: room.roomHall, trackKey });
                                    }}
                                    onPointerEnter={() => {
                                      if (physicsActive) return;
                                      const stroke = paintRef.current;
                                      const trackKey = `${room.key}|${day.key}`;
                                      if (!stroke || stroke.day !== day.key || stroke.trackKey !== trackKey) return;
                                      const here = mins(slot);
                                      setPaint({
                                        day: day.key as DayKey,
                                        from: timeFromMins(Math.min(stroke.anchor, here)),
                                        to: timeFromMins(Math.max(stroke.anchor, here) + SCHEDULE_SLOT_MINUTES),
                                        roomCode: room.roomCode, roomHall: room.roomHall, trackKey,
                                      });
                                    }}
                                  />
                                ))}
                                {timeSlots.map(slot => <i key={slot} className={`rooms-hourline ${mins(slot) % 60 === 0 ? "rooms-hourline-major" : "rooms-hourline-half"} ${slot === SCHEDULE_DAY_END_TIME ? "rooms-hourline-terminal" : ""}`} style={{ right: `${pct(mins(slot))}%` }} />)}
                                {moveTraces
                                  .filter(trace => trace.dayKey === day.key && trace.roomKey === room.key)
                                  .map(trace => (
                                    <div
                                      key={`room-trace-${trace.key}`}
                                      className="week-move-trace rooms-move-trace"
                                      style={roomTraceStyle(trace)}
                                      aria-hidden="true"
                                      title={`${trace.label} · نُقل من هنا`}
                                    >
                                      <span><CornerUpRight aria-hidden="true" />نُقل من هنا</span>
                                    </div>
                                  ))}
                                {paint?.trackKey === `${room.key}|${day.key}` ? (
                                  <div className="rooms-paint" style={{ right: `${pct(mins(paint.from))}%`, width: `${Math.max(roomSpanPct(mins(paint.from), mins(paint.to)), roomSpanPct(mins(paint.from), mins(paint.from) + SCHEDULE_SLOT_MINUTES))}%` }} aria-hidden="true">
                                    <b dir="ltr">{formatScheduleTimeRange(paint.from, paint.to)}</b><span>موعد جديد</span>
                                  </div>
                                ) : null}
                                {todayKey === day.key && nowMinutes >= gridWindow.start && nowMinutes <= gridWindow.end ? <i className="rooms-now" style={{ right: `${pct(nowMinutes)}%` }} title={`الآن · ${scheduleClockForDisplay(timeFromMins(nowMinutes))}`}><b dir="ltr">{scheduleClockForDisplay(timeFromMins(nowMinutes))}</b></i> : null}
                                {roomLayout.items.map(({ row, lane }) => renderTrackCard(row, day.key as DayKey, { lane }))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  {displayDays.some(day => (noRoomByDay.get(day.key as DayKey) || []).length || moveTraces.some(trace => trace.roomKey === "|" && trace.dayKey === day.key)) ? (
                    <section className="rooms-week-room rooms-row-none" aria-label="بلا قاعة" title="بلا قاعة">
                      <div className="rooms-week-days">
                        {displayDays.map(day => {
                          const homelessLayout = noRoomLayout.get(day.key as DayKey) || { items: [], lanes: 1 };
                          const homelessTrackHeight = trackHeight(homelessLayout.lanes);
                          return (
                          <div className="rooms-row" key={`none|${day.key}`} style={{ minHeight: homelessTrackHeight }}>
                            <small className="rooms-day-label">{day.label}</small>
                            <div className="rooms-track" style={{ height: homelessTrackHeight }} data-physics-day-column="true" onDragOver={(e) => e.preventDefault()} onDrop={trackDrop("", "", day.key as DayKey)}>
                              {timeSlots.map(slot => (
                                <i
                                  key={`none-slot-${slot}`}
                                  className={`rooms-slot ${physicsSlotClass(day.key as DayKey, slot, "|")}`}
                                  data-physics-slot="true"
                                  data-physics-day={day.key}
                                  data-physics-start={slot}
                                  data-physics-label={`${day.label} · بلا قاعة`}
                                  data-physics-room="|"
                                  style={{ right: `${pct(mins(slot))}%`, width: `${roomSpanPct(mins(slot), mins(slot) + SCHEDULE_SLOT_MINUTES)}%` }}
                                  role="button"
                                  tabIndex={-1}
                                  title={`إضافة موعد · ${day.label} ${slot} · بلا قاعة`}
                                  onPointerDown={(e) => {
                                    if (physicsActive || e.target !== e.currentTarget || e.button !== 0) return;
                                    const trackKey = `none|${day.key}`;
                                    paintRef.current = { day: day.key as DayKey, anchor: mins(slot), roomCode: "", roomHall: "", trackKey };
                                    setPaint({ day: day.key as DayKey, from: slot, to: timeFromMins(mins(slot) + SCHEDULE_SLOT_MINUTES), roomCode: "", roomHall: "", trackKey });
                                  }}
                                  onPointerEnter={() => {
                                    if (physicsActive) return;
                                    const stroke = paintRef.current;
                                    const trackKey = `none|${day.key}`;
                                    if (!stroke || stroke.day !== day.key || stroke.trackKey !== trackKey) return;
                                    const here = mins(slot);
                                    setPaint({ day: day.key as DayKey, from: timeFromMins(Math.min(stroke.anchor, here)), to: timeFromMins(Math.max(stroke.anchor, here) + SCHEDULE_SLOT_MINUTES), roomCode: "", roomHall: "", trackKey });
                                  }}
                                />
                              ))}
                              {timeSlots.map(slot => <i key={slot} className={`rooms-hourline ${mins(slot) % 60 === 0 ? "rooms-hourline-major" : "rooms-hourline-half"} ${slot === SCHEDULE_DAY_END_TIME ? "rooms-hourline-terminal" : ""}`} style={{ right: `${pct(mins(slot))}%` }} />)}
                              {moveTraces
                                .filter(trace => trace.dayKey === day.key && trace.roomKey === "|")
                                .map(trace => (
                                  <div
                                    key={`room-trace-${trace.key}`}
                                    className="week-move-trace rooms-move-trace"
                                    style={roomTraceStyle(trace)}
                                    aria-hidden="true"
                                    title={`${trace.label} · نُقل من هنا`}
                                  >
                                    <span><CornerUpRight aria-hidden="true" />نُقل من هنا</span>
                                  </div>
                                ))}
                              {paint?.trackKey === `none|${day.key}` ? <div className="rooms-paint" style={{ right: `${pct(mins(paint.from))}%`, width: `${Math.max(roomSpanPct(mins(paint.from), mins(paint.to)), roomSpanPct(mins(paint.from), mins(paint.from) + SCHEDULE_SLOT_MINUTES))}%` }} aria-hidden="true"><b dir="ltr">{formatScheduleTimeRange(paint.from, paint.to)}</b><span>موعد جديد</span></div> : null}
                              {homelessLayout.items.map(({ row, lane }) => renderTrackCard(row, day.key as DayKey, { lane }))}
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </section>
                  ) : null}
                  {!roomList.length && !displayDays.some(day => (noRoomByDay.get(day.key as DayKey) || []).length || moveTraces.some(trace => trace.roomKey === "|" && trace.dayKey === day.key)) ? (
                    <p className="rooms-empty">لا قاعات مسجلة في هذا النطاق بعد — أسنِد قاعة لأي محاضرة وستظهر هنا صفاً كاملاً.</p>
                  ) : null}
                  </div>
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
            data-guide-target="schedule.week.board"
            className={`week-surface ${denseWeekStrips ? "week-strip-mode" : ""} ${physicsActive ? "physics-lens-active" : ""} ${picking ? "week-picking" : ""} ${rowsLoading && rows.length ? "week-refreshing" : ""}`}
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
                  ? `قبل: ${dragComparison.before} · بعد: ${dragComparison.after} · القاعة ${dragComparison.place}${dragComparison.partyCount > 1 ? ` · قائد مجموعة من ${dragComparison.partyCount} مواعيد` : ""}`
                  : phoneReadOnly
                    ? "على الهاتف يمكنك التعديل والإضافة من «قائمة»، أما عرض الأسبوع فيبقى للقراءة فقط حتى لا يتحول اللمس إلى نقلٍ غير مقصود."
                  : picking
                    ? "النقل الجماعي: اختر المواعيد المطلوبة، ثم اسحب أي واحد منها — تنتقل المجموعة معاً بعد فحص الموانع."
                    : "اسحب الموعد لتنقله كاملًا بأيامه المسجلة · اسحب على عمود فارغ لإنشاء موعد · أو انتقل بـTab إلى محاضرة واضغط مسافة لتحريكها بالأسهم · التراجع متاح بعد كل نقل."}
              </span>
              {false ? <button
                type="button"
                data-guide-feature-id="schedule.action.move-room"
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
                    { key: "room", label: "المباني والقاعات" },
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
                <LegendScroller label="استخدم السهمين أو عجلة الماوس للتنقل يميناً ويساراً">
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
                </LegendScroller>
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
                  title={`${expandedDay === d.key ? "العودة إلى الأسبوع كاملاً" : `عرض ${d.label} وحده`} · ساعة تدريس ${Math.round((dayLoad.minutesByDay[d.key] || 0) / 60)}`}
                >
                  <span>{d.label}</span>
                  <b title="عدد المواعيد في هذا اليوم">{dayCounts[d.key] || 0}</b>
                </button>
              ))}
              {expandedDay ? (
                <button
                  type="button"
                  className="week-daystrip-all"
                  data-guide-ignore="زر رجوع بصري من اليوم المركّز إلى عرض الأيام؛ لا يغيّر بيانات الجدول"
                  onClick={() => setExpandedDay(null)}
                  title="عرض الأسبوع كاملاً"
                >
                  <Expand aria-hidden="true" />اليوم
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
                          void openContext(r);
                        }}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") void openContext(r); }}
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
            {denseWeekStrips ? (
              <>
                {/*
                  Dense-week projection.

                  The classic calendar remains the right picture while every day
                  can afford readable columns. Once the week becomes a panorama,
                  the projection rotates instead of the type shrinking: time runs
                  horizontally, the five days become calm horizontal bands, and
                  concurrency consumes vertical paper. It is the same timetable,
                  the same cards and the same drag engine — only the surrounding
                  geometry changes.
                */}
                <div
                  ref={weekTopScrollRef}
                  className="week-scroll-top week-strip-scroll-top no-print"
                  data-expanded={expandedDay || undefined}
                  style={weekStripStyle}
                  onScroll={(e) => syncWeekScroll("top", e.currentTarget.scrollLeft)}
                  aria-label="تمرير أفقي أعلى الجدول"
                  data-guide-ignore="شريط تمرير بصري للوحة الأسبوع ولا ينفذ أي إجراء على بيانات الجدول"
                >
                  <div className="week-scroll-spacer" aria-hidden="true" />
                </div>
                <div
                  ref={weekRulerScrollRef}
                  className="week-ruler-scroll"
                  style={weekStripStyle}
                  onScroll={(e) => syncWeekScroll("ruler", e.currentTarget.scrollLeft)}
                  aria-label="شريط ساعات الأسبوع"
                >
                  <div className="week-strip-ruler" style={{ width: `${weekStripConfig.canvasWidth}px` }}>
                    <div className="week-strip-ruler-label">
                      <span className="schedule-ruler-day-title">اليوم</span>
                    </div>
                    <div
                      className="week-strip-ruler-track"
                      style={{ width: `${weekStripConfig.timelineWidth}px` }}
                      aria-hidden="true"
                    >
                      {timeSlots.map((slot) => (
                        <i
                          key={`week-sticky-ruler-line-${slot}`}
                          className={`week-strip-ruler-line schedule-time-line ${mins(slot) % 60 === 0 ? "major" : "half"} ${slot === SCHEDULE_DAY_END_TIME ? "terminal" : ""}`}
                          style={{ insetInlineStart: `${weekStripOffset(mins(slot))}px` }}
                          aria-hidden="true"
                        />
                      ))}
                      {weekStripHourMarks.filter((mark) => mark !== gridWindow.end).map((mark) => (
                        <span
                          key={`week-sticky-ruler-${mark}`}
                          className={`schedule-time-label ${mark === gridWindow.start ? "schedule-time-label-start" : ""}`}
                          style={{ right: `${weekStripOffset(mark)}px` }}
                          dir="ltr"
                        >
                          {scheduleClockForDisplay(timeFromMins(mark))}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  ref={weekMainScrollRef}
                  className="week-scroll-main week-strips-scroll"
                  onScroll={(e) => syncWeekScroll("main", e.currentTarget.scrollLeft)}
                >
                  <div
                    className="week-strips"
                    style={weekStripStyle}
                    data-expanded={expandedDay || undefined}
                  >
                    {(expandedDay ? days.filter(day => day.key === expandedDay) : days).map((d) => {
                      const layout = weekLayout[d.key] || { items: [], busiest: 1 };
                      const dayHeight = weekStripDayHeight(layout.busiest);
                      return (
                        <section
                          className="week-strip-day-row"
                          data-today={todayKey === d.key ? "true" : undefined}
                          data-busiest={layout.busiest}
                          style={{ minHeight: `${dayHeight}px` }}
                          key={`week-strip-${d.key}`}
                        >
                          <div
                            className="week-strip-day-label"
                            style={{ ["--reading" as any]: `${dayLoad.share[d.key] || 0}%` }}
                          >
                            <strong>{d.label}</strong>
                            <span><b>{dayCounts[d.key] || 0}</b> موعدًا</span>
                            <small>ذروة {layout.busiest} معًا</small>
                          </div>
                          <div
                            className="week-strip-track"
                            style={{
                              width: `${weekStripConfig.timelineWidth}px`,
                              height: `${dayHeight}px`,
                            }}
                            data-physics-day-column="true"
                            data-physics-day={d.key}
                          >
                            {weekStripHourMarks.map((mark) => (
                              <i
                                key={`week-strip-grid-${d.key}-${mark}`}
                                className={`week-strip-hourline ${mark === gridWindow.end ? "terminal" : ""}`}
                                style={{ insetInlineStart: `${weekStripOffset(mark)}px` }}
                                aria-hidden="true"
                              />
                            ))}
                            {hallBarterReservations
                              .filter((reservation) => reservation.status === "approved" && reservation.day === d.key)
                              .map((reservation) => {
                                const start = Math.max(gridWindow.start, mins(reservation.startTime));
                                const end = Math.min(gridWindow.end, mins(reservation.endTime));
                                if (end <= gridWindow.start || start >= gridWindow.end) return null;
                                const borrowing = reservation.requesterCollegeId === filterCollege && reservation.requesterSectionId === filterSection;
                                return (
                                  <div
                                    key={`week-strip-hall-barter-${reservation.id}-${d.key}`}
                                    className={`week-strip-hall-barter ${borrowing ? "borrowed" : "lent"}`}
                                    style={{
                                      insetInlineStart: `${weekStripOffset(start)}px`,
                                      width: `${weekStripSpanWidth(start, end)}px`,
                                    }}
                                    title={`${borrowing ? "نافذة قاعة مستعارة لقسمك" : "نافذة قاعة معارة"} · ${reservation.roomCode}/${reservation.roomHall} · ${formatScheduleTimeRange(reservation.startTime, reservation.endTime)}`}
                                    aria-hidden="true"
                                  />
                                );
                              })}
                            {timeSlots.map((t) => {
                              const slotStart = mins(t);
                              return (
                                <div
                                  data-physics-slot="true"
                                  data-physics-day={d.key}
                                  data-physics-start={t}
                                  data-physics-label={d.label}
                                  className={`week-strip-slot ${ripple?.targetDay === d.key && ripple?.targetStart === t ? "ripple-target" : ""} ${physicsSlotClass(d.key, t)} ${lensRoomActive && !lensRoomBusy.has(`${d.key}|${t}`) ? "room-free" : ""} ${decisionSlot(d.key as DayKey, t) ? `field-${decisionSlot(d.key as DayKey, t)!.tier}` : ""}`}
                                  key={`week-strip-slot-${d.key}-${t}`}
                                  style={{
                                    insetInlineStart: `${weekStripOffset(slotStart)}px`,
                                    width: `${weekStripSpanWidth(slotStart, Math.min(gridWindow.end, slotStart + SCHEDULE_SLOT_MINUTES))}px`,
                                  }}
                                  onDragOver={(e) => e.preventDefault()}
                                  role="button"
                                  tabIndex={-1}
                                  data-guide-ignore="خانة زمنية مباشرة في إسقاط الأسبوع الكثيف وتستخدم نفس سلوك السحب والإضافة الموثق في شبكة الأسبوع"
                                  title={
                                    slotBlockReason(d.key as DayKey, t) ||
                                    (decisionSlot(d.key as DayKey, t)
                                      ? `${d.label} ${t} — ${decisionSlot(d.key as DayKey, t)!.why}`
                                      : `إضافة موعد · ${d.label} ${t}`)
                                  }
                                  onPointerDown={(e) => {
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
                              );
                            })}
                            {keyMove && keyMove.day === d.key && keyMoveRow ? (
                              <div
                                className={`week-strip-keymove tier-${keyMoveReading?.tier || "fair"}`}
                                style={{
                                  insetInlineStart: `${weekStripOffset(mins(keyMove.start))}px`,
                                  width: `${weekStripSpanWidth(mins(keyMove.start), mins(keyMove.start) + Math.max(SCHEDULE_SLOT_MINUTES, mins(keyMoveRow.fendtime) - mins(keyMoveRow.fstarttime)))}px`,
                                }}
                                aria-hidden="true"
                              >
                                <b dir="ltr">{scheduleClockForDisplay(keyMove.start)}</b>
                              </div>
                            ) : null}
                            {paint && paint.day === d.key ? (
                              <div
                                className="week-strip-paint"
                                style={{
                                  insetInlineStart: `${weekStripOffset(mins(paint.from))}px`,
                                  width: `${weekStripSpanWidth(mins(paint.from), mins(paint.to))}px`,
                                }}
                                aria-hidden="true"
                              >
                                <b dir="ltr">{formatScheduleTimeRange(paint.from, paint.to)}</b>
                                <span>موعد جديد</span>
                              </div>
                            ) : null}
                            {todayKey === d.key &&
                            termIsRunning &&
                            nowMinutes >= gridWindow.start &&
                            nowMinutes <= gridWindow.end ? (
                              <div
                                className="week-strip-now no-print"
                                style={{ insetInlineStart: `${weekStripOffset(nowMinutes)}px` }}
                                aria-hidden="true"
                              >
                                <span><time dir="ltr">{scheduleClockForDisplay(timeFromMins(nowMinutes))}</time></span>
                              </div>
                            ) : null}
                            {moveTraces
                              .filter((trace) => trace.dayKey === d.key)
                              .map((trace) => (
                                <div
                                  key={`week-strip-trace-${trace.key}`}
                                  className="week-strip-move-trace"
                                  style={{
                                    insetInlineStart: `${weekStripOffset(trace.from)}px`,
                                    width: `${weekStripSpanWidth(trace.from, trace.to)}px`,
                                  }}
                                  aria-hidden="true"
                                >
                                  <span><CornerUpRight aria-hidden="true" />نُقل من هنا</span>
                                </div>
                              ))}
                            {layout.items.map((placed) => {
                              const course = courseById.get(placed.row.AdCourseId);
                              const instructor = instructorById.get(placed.row.AdInstructorId);
                              const code = String(course?.CourseCode || placed.row.AdCourseName || "—");
                              const title = placed.row.AdCourseName || course?.CourseName || code;
                              const who = instructor?.AdInstructorName || "بدون أستاذ";
                              const identityMode = weekStripIdentityMode(placed.row, title, who, code);
                              return renderWeekCard(
                                placed.row,
                                d,
                                weekStripCardStyle(placed, identityMode),
                                1,
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <>
            <div
              ref={weekTopScrollRef}
              className="week-scroll-top no-print"
              data-expanded={expandedDay || undefined}
              style={weekGridStyle}
              onScroll={(e) => syncWeekScroll("top", e.currentTarget.scrollLeft)}
              aria-label="تمرير أفقي أعلى الجدول"
              data-guide-ignore="شريط تمرير بصري للوحة الأسبوع ولا ينفذ أي إجراء على بيانات الجدول"
            >
              <div className="week-scroll-spacer" aria-hidden="true" />
            </div>
            <div
              ref={weekMainScrollRef}
              className="week-scroll-main"
              onScroll={(e) => syncWeekScroll("main", e.currentTarget.scrollLeft)}
            >
            <div
              className={`week-calendar ${physicsActive ? "gravity-field-active" : ""}`}
              data-expanded={expandedDay || undefined}
              style={weekGridStyle}
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
                        <b dir="ltr">{scheduleClockForDisplay(keyMove.start)}</b>
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
                        <span><time>{scheduleClockForDisplay(timeFromMins(nowMinutes))}</time></span>
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
                    {(weekLayout[d.key]?.items || []).map((placed) =>
                      renderWeekCard(placed.row, d, {
                        top: placed.top,
                        height: placed.height,
                        ...laneStyle(placed),
                      }, placed.span / placed.lanes),
                    )}
                  </div>
                );
              })}
            </div>
            </div>
              </>
            )}
          </Surface>
        </>
      )}
      {/* Shared interaction overlays live outside the individual view branches.
          Rooms and week now open the same Quick Create card, the same peek and
          the same physics overlay immediately in the view where the gesture
          happened; no state is left waiting for a later switch to week. */}
      <WeekPeekLayer
        ref={peekRef}
        describe={(row) => ({
          title: row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "مقرر",
          who: `${instructorById.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ"}${visitingIds.has(row.AdInstructorId) ? " · منتدب" : ""}`,
          code: courseById.get(row.AdCourseId)?.CourseCode || "—",
          section: String(row.SCode || "—"),
          days: arabicDays(row),
          from: row.fstarttime,
          to: row.fendtime,
          room: [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/"),
          hue: hueFor(
            courseById.get(row.AdCourseId)?.CourseCode || row.AdCourseName || "—",
            row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "",
            instructorById.get(row.AdInstructorId)?.AdInstructorName,
            placeOf(row),
          ),
        })}
      />
      {quick ? (
        <QuickCreatePopover
          seed={quick}
          courses={quickCourses}
          instructors={instructors}
          buildings={buildingOptions}
          hallsFor={hallsOf}
          conflictOf={quickConflict}
          nextSectionCode={(courseId) => nextSectionCode(courseId, Number(filterTerm) || 0)}
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
        course={physics.state.row ? courseById.get(physics.state.row.AdCourseId) : undefined}
        instructor={physics.state.row ? instructorById.get(physics.state.row.AdInstructorId) : undefined}
        isPowerAdmin={isPowerAdmin}
        variant={viewMode === "rooms" ? "rooms" : viewMode === "list" ? "list" : "week"}
      />
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
                onClick={() => changeView("rooms")} title="عرض المباني والقاعات" aria-label="عرض المباني والقاعات"
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
              className={`dock-act ${focusMode ? "on" : ""}`}
              aria-pressed={focusMode}
              data-guide-target="schedule.tool.focus"
              onClick={() => {
                physics.cancel();
                setFocusMode(current => !current);
                setPresentationMode(false);
              }}
              title={focusMode ? "إنهاء التركيز" : "التركيز"}
              aria-label={focusMode ? "إنهاء وضع التركيز" : "تفعيل وضع التركيز"}
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
          <span dir="ltr">{days.find(d => d.key === keyMove.day)?.label} · {scheduleClockForDisplay(keyMove.start)}</span>
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
              <span><b className="visual-metric-flow"><span>{repair.before.toLocaleString("ar-KW-u-nu-latn")}</span><ChevronLeft aria-hidden="true" /><span>{repair.after.toLocaleString("ar-KW-u-nu-latn")}</span></b> تداخل</span>
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
                      <bdi>{arabicDays(move.before) || "بلا يوم"} · {formatScheduleTimeRange(move.before.fstarttime, move.before.fendtime)}</bdi>
                      <ChevronLeft className="visual-inline-arrow" aria-hidden="true" />
                      <bdi>{days.find(d => d.key === move.day)?.label} · {formatScheduleTimeRange(move.start, move.end)} · {move.roomCode}/{move.roomHall}</bdi>
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
          <button data-guide-target="schedule.undo" type="button" onClick={() => void runUndoEntry(undoAction)} disabled={Boolean(undoBusy)}>
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
          data-guide-target="schedule.undo.log"
          onClick={() => setUndoLogOpen(true)}
          title="سجل تغييرات اليوم"
        >
          <History aria-hidden="true" />
          {logNamed ? null : <span>سجل اليوم</span>}
          <b dir="ltr">{pendingUndo.length > 99 ? "99+" : pendingUndo.length}</b>
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
          onChanged={() => { void loadRows(); }}
          onClose={() => setTransferOpen(false)}
        />
      ) : null}
      {dayToolRow ? (
        <DaySubstitute
          row={dayToolRow as any}
          instructorName={instructorById.get(dayToolRow.AdInstructorId)?.AdInstructorName}
          onClose={() => setDayToolRow(null)}
        />
      ) : null}
      {meetingOpen ? (
        <MeetingSlots
          instructors={instructors.map(person => ({ AdInstructorId: person.AdInstructorId, AdInstructorName: person.AdInstructorName }))}
          termId={filterTerm}
          onClose={() => setMeetingOpen(false)}
        />
      ) : null}
      {reviewOpen ? (
        <ScheduleReview
          rows={rows}
          courses={courseById}
          instructors={instructorById}
          previousRows={previousTermRows}
          nature={nature}
          scopeLine={[
            terms.find((t) => t.AdTermId === filterTerm)?.AdTermName,
            colleges.find((c) => c.AdCollegeId === filterCollege)?.AdCollegeName,
            sections.find((x) => x.AdSectionId === filterSection)?.AdSectionName,
          ].filter(Boolean).join(" · ")}
          collegeId={filterCollege}
          sectionId={filterSection}
          termId={filterTerm}
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
          <aside className="schedule-context" data-context-tab={contextTab}>
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
                {DAY_SUBSTITUTE_ENABLED ? (
                  <button
                    type="button"
                    className="btn btn-secondary context-day-tool"
                    data-guide-ignore="يفتح أداة استثناءات اليوم الواحد — لا يغيّر الموعد الأسبوعي"
                    title="إلغاء أو تغطية هذه المحاضرة ليوم واحد محدد"
                    onClick={() => setDayToolRow(context.selected)}
                  >
                    <CalendarDays /> بديل اليوم
                  </button>
                ) : null}
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
            <nav className="context-tabs" aria-label="أقسام تفاصيل الموعد">
              <button type="button" data-guide-ignore="تبويب داخلي لتنظيم تفاصيل الموعد فقط" className={contextTab === "overview" ? "active" : ""} aria-pressed={contextTab === "overview"} onClick={() => setContextTab("overview")}><Sparkles aria-hidden="true" /><span>نظرة</span></button>
              <button type="button" data-guide-ignore="تبويب داخلي لتنظيم تفاصيل الموعد فقط" className={contextTab === "analysis" ? "active" : ""} aria-pressed={contextTab === "analysis"} onClick={() => setContextTab("analysis")}><BrainCircuit aria-hidden="true" /><span>التحليل</span></button>
              <button type="button" data-guide-ignore="تبويب داخلي لتنظيم تفاصيل الموعد فقط" className={contextTab === "context" ? "active" : ""} aria-pressed={contextTab === "context"} onClick={() => setContextTab("context")}><Layers aria-hidden="true" /><span>السياق</span></button>
            </nav>
            <div className="context-intelligence-summary context-tab-overview">
              <article className="context-why-here context-why-compact" title={context.whyHere || undefined}>
                <span><HelpCircle aria-hidden="true" /></span>
                <div><small>{/مختلف|غير معتاد|تاريخ/i.test(context.whyHere || "") ? "خارج المعتاد" : "ضمن النمط"}</small><strong>{/مانع|تعارض/i.test(context.whyHere || "") ? "يحتاج تحقق" : "بدون مانع"}</strong></div>
              </article>
              <article title={context.courseLife ? `من ${context.courseLife.firstTerm} إلى ${context.courseLife.latestTerm} · ${context.courseLife.observations} حالة` : undefined}>
                <span><History aria-hidden="true" /></span>
                <div><small>حياة المقرر</small><strong>{context.courseLife ? `${formatTermLabel(context.courseLife.terms)} · ${context.courseLife.stability}% ثبات` : "تاريخ قليل"}</strong></div>
              </article>
              <article title={context.offeringLife ? `من ${context.offeringLife.firstTerm} إلى ${context.offeringLife.latestTerm}` : undefined}>
                <span><CalendarDays aria-hidden="true" /></span>
                <div><small>حياة الشعبة</small><strong>{context.offeringLife ? (context.offeringLife.currentJourney ? `${context.offeringLife.currentJourney.snapshots || 0} نسخة · ${formatChangeLabel(context.offeringLife.currentJourney.changes || 0)}` : formatLifeSummary(context.offeringLife.terms, context.offeringLife.changes)) : "أول ظهور"}</strong></div>
              </article>
              <article className={`decision-cost-${context.decisionCost?.level || "low"}`} title={(context.decisionCost?.factors || []).join(" · ") || undefined}>
                <span><BrainCircuit aria-hidden="true" /></span>
                <div><small>تكلفة التغيير</small><strong>{context.decisionCost?.score ?? 0}/100</strong></div>
                <i style={{ ["--cost" as any]: `${context.decisionCost?.score || 0}%` }} />
              </article>
            </div>
            {/* One line, and only when the archive earned it. Pressing it opens
                the full anatomy — already in hand, so it opens at once. */}
            {moveNote ? (
              <button
                type="button"
                className="context-move-note context-tab-overview"
                data-guide-ignore="يفتح تشريح القرار المحمّل مسبقاً — عرض فقط ولا يغيّر الجدول"
                onClick={() => { setContextTab("analysis"); void loadReplay(context.selected); }}
              >
                <span className="context-move-mark" aria-hidden="true"><History /></span>
                <span className="context-move-copy">
                  <small>
                    {moveNote.moves > 1
                      ? `انتقل ${moveNote.moves.toLocaleString("ar-KW-u-nu-latn")} مرات · آخر مرة`
                      : "انتقل مرة واحدة · السبب"}
                  </small>
                  <strong>{moveNote.text}</strong>
                </span>
                <ChevronLeft className="context-move-go" aria-hidden="true" />
              </button>
            ) : null}
            {(context.courseLife || context.offeringLife) ? (
              <details className="context-life-details context-tab-analysis">
                <summary><History aria-hidden="true" /><span>السيرة التاريخية</span><ChevronDown aria-hidden="true" /></summary>
                <div className="context-life-details-grid">
                  {context.courseLife ? <section>
                    <header><History/><strong>المقرر</strong><b>{context.courseLife.confidence === "high" ? "ثقة عالية" : context.courseLife.confidence === "medium" ? "ثقة متوسطة" : "تاريخ محدود"}</b></header>
                    <div className="context-life-range"><span>الفترة التاريخية</span><strong><i>{context.courseLife.firstTerm}</i><ChevronLeft aria-hidden="true"/><i>{context.courseLife.latestTerm}</i></strong></div>
                    <div><span>الوقت المعتاد</span><strong dir="ltr">{scheduleClockForDisplay(context.courseLife.usualStart)}</strong></div>
                    <div><span>المدة</span><strong><b dir="ltr">{context.courseLife.usualDuration || "—"}</b>{context.courseLife.usualDuration ? " دقيقة" : ""}</strong></div>
                    <div className="context-life-wide"><span>القاعة المعتادة</span><strong dir="ltr">{context.courseLife.usualRoom || "—"}</strong></div>
                  </section> : null}
                  {context.offeringLife ? <section>
                    <header><CalendarDays/><strong>الشعبة</strong><b dir="ltr">{context.offeringLife.stability}% <span>ثبات</span></b></header>
                    <div><span>النسخ الحالية</span><strong dir="ltr">{context.offeringLife.currentJourney?.snapshots || 0}</strong></div>
                    <div><span>التغييرات</span><strong dir="ltr">{context.offeringLife.currentJourney?.changes ?? context.offeringLife.changes ?? 0}</strong></div>
                    <div><span>الوقت المعتاد</span><strong dir="ltr">{scheduleClockForDisplay(context.offeringLife.usualStart)}</strong></div>
                    <div><span>القاعة المعتادة</span><strong dir="ltr">{context.offeringLife.usualRoom || "—"}</strong></div>
                  </section> : null}
                </div>
              </details>
            ) : null}
            <button
              type="button"
              className="decision-replay-trigger context-tab-analysis"
              data-guide-ignore="تفصيل ثانوي داخل تبويب تحليل الموعد"
              onClick={() => void loadReplay(context.selected)}
              disabled={replayLoading}
            >
              <History />
              {replayLoading
                ? "أعيد بناء تشريح القرار…"
                : "كيف وصل القرار إلى هذا الشكل؟"}
            </button>
            {replay ? (
              <div className="decision-replay context-tab-analysis">
                <div className="replay-head">
                  <div>
                    <span>تشريح القرار</span>
                    <strong>لماذا استقر هنا ومتى تغيّر</strong>
                  </div>
                  <button
                    type="button"
                    aria-label="إغلاق تشريح القرار"
                    title="إغلاق تشريح القرار"
                    data-guide-ignore="إغلاق تفصيل ثانوي لتشريح القرار فقط ولا يغير بيانات الجدول"
                    onClick={closeReplay}
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
                {replayLoading ? (
                  <div className="replay-empty-state replay-empty-state-rich is-loading">
                    <strong>القراءة الحالية جاهزة</strong>
                    {replay.subtitle ? <span>{replay.subtitle}</span> : null}
                    <p>{replay.summary || "أستكمل السجل التاريخي في الخلفية…"}</p>
                    <small>أستكمل السجل التاريخي…</small>
                  </div>
                ) : replay.events?.length ? (
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
                  <div className="replay-empty-state replay-empty-state-rich">
                    <strong>{replay.emptyMessage || replay.summary || "لا يوجد سجل انتقالات محفوظ لهذا الموعد بعد."}</strong>
                    {replay.subtitle ? <span>{replay.subtitle}</span> : null}
                    {replay.error ? <em>{replay.error}</em> : <p>إذا بقي الموعد ثابتاً فسأعرضه لك مباشرةً، وإذا تغيّر لاحقاً سيظهر الخط الزمني هنا خطوةً خطوة.</p>}
                    {replay.error ? <button type="button" className="replay-retry" data-guide-ignore="إعادة محاولة قراءة سجل تشريح القرار فقط ولا تنفذ أي تغيير" onClick={() => void loadReplay(context.selected)}>إعادة المحاولة</button> : null}
                  </div>
                )}
              </div>
            ) : null}
            <div className="context-relations context-tab-overview">
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
            <div className="context-schedules context-tab-context">
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
              <div className="context-alternatives context-tab-context">
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
              <div className="context-memory context-tab-analysis">
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
            {TEAM_NOTES_ENABLED ? (
            <div className="context-comments context-tab-context">
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
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
