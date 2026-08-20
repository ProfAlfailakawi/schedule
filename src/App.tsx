import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChevronLeft,
  Command,
  CopyPlus,
  FileSearch,
  FileText,
  FlaskConical,
  House,
  Info,
  Library,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UsersRound,
  WandSparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { controlLabel } from "./utils/controlLabel";

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import type { ReportMode } from "./components/Reports";
import type { AdminMode } from "./components/AdminUsers";
import type { AcademicTab } from "./components/AcademicConsole";
import { safeStorage } from "./utils/safeStorage";
import { warmStart } from "./utils/warmStart";
import { formatScheduleTimeRange } from "./utils/scheduleTime";
import { installClientTelemetry, setTelemetryOwner, telemetryBreadcrumb, telemetryGuide } from "./utils/clientTelemetry";

function safeLazy<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      console.warn("Lazy chunk import failed:", err);
      const key = "miras_chunk_reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      throw err;
    })
  );
}

// The dashboard is the landing screen and stays in the first payload. Every other
// workspace is fetched the moment it is first opened, which keeps the initial
// download small on the slow campus connections this runs on.
const loadAcademicConsole = () => import("./components/AcademicConsole");
const loadSchedules = () => import("./components/Schedules");
const loadReports = () => import("./components/Reports");
const loadAdminUsers = () => import("./components/AdminUsers");
const loadAbout = () => import("./components/About");
const loadIntelligence = () => import("./components/IntelligenceWorkspace");
/**
 * The board's own preference key, which carries the reader's id. Duplicated
 * here on purpose: the warm start must run before any component exists, so it
 * cannot ask the board what it calls its own shelf.
 */
function scheduleScopeQuery(userId: number): string {
  const query = new URLSearchParams();
  try {
    const pref = JSON.parse(localStorage.getItem(`schedule-workspace-prefs-${userId}`) || "{}");
    if (Number(pref.filterCollege)) query.set("collegeId", String(Number(pref.filterCollege)));
    if (Number(pref.filterSection)) query.set("sectionId", String(Number(pref.filterSection)));
    if (Number(pref.filterTerm)) query.set("termId", String(Number(pref.filterTerm)));
  } catch { /* an unreadable shelf just means an unscoped warm start */ }
  query.set("resolve", "1");
  return query.toString();
}

/** The id of whoever was last signed in here — enough to name the shelf. */
function lastUserId(): number {
  try { return Number(JSON.parse(localStorage.getItem("schedule-last-user") || "0")) || 0; }
  catch { return 0; }
}

/* A cold load that lands directly on the board: the question goes out here, at
   module scope, which on the measured timeline is roughly seven hundred
   milliseconds before the board could have asked it. */
if (typeof window !== "undefined" && /\/fschedule\/index/i.test(window.location.pathname)) {
  void loadSchedules();
  void warmStart(`/api/schedules/workspace?${scheduleScopeQuery(lastUserId())}`).catch(() => undefined);
}

const AcademicConsole = safeLazy(loadAcademicConsole);
const Schedules = safeLazy(loadSchedules);
const Reports = safeLazy(loadReports);
const AdminUsers = safeLazy(loadAdminUsers);
const About = safeLazy(loadAbout);
const loadJourney = () => import("./components/ScheduleJourney");
const ScheduleJourney = safeLazy(loadJourney);
const IntelligenceWorkspace = safeLazy(loadIntelligence);
import { PrimaryButton } from "./components/ui";
import SmartGuide from "./components/SmartGuide";
import { canProactivelyHint, allAllowedGuideFeatures, guideUnreadSummary, featureById, loadGuideProfile, masteryScore, noteFriction, noteHint, recordFeatureEvent, recordFeatureDwell, recordRoute, setGuideTask, setLauncherIntroduced, evaluateGuideFriction, classifyGuideReason, predictedNextFeature, canAccessGuideFeature } from "./guide/smartGuide";

type View =
  | "dashboard"
  | "terms"
  | "colleges"
  | "sections"
  | "instructors"
  | "courses"
  | "schedules"
  | "scheduleCopy"
  | "intelligence"
  | ReportMode
  | AdminMode
  | "about";
interface SessionUser {
  SystemUserId: number;
  Name: string;
  IsAdminUser: boolean;
  IsActive: boolean;
  IsLocked: boolean;
  AdInstructorId?: number;
  IsRootAdmin?: boolean;
  IsDemo?: boolean;
}
interface SearchHit {
  id: number | string;
  kind: "schedule" | "instructor" | "course" | "room";
  title: string;
  subtitle: string;
  meta: string;
  building?: string;
  hall?: string;
}
interface FavoriteEntity {
  key: string;
  count: number;
  hit: SearchHit;
}

const searchViews: ReportMode[] = [
  "searchInstructor",
  "searchRoom",
  "searchTime",
  "searchRoomTime",
  "searchAdvanced",
];
const reportViews: ReportMode[] = [
  "reportDepartment",
  "reportInstructor",
  "reportRoom",
  "reportTime",
  "reportRoomTime",
];
const adminViews: AdminMode[] = ["users", "permissions", "scopes", "audit", "backup"];
const academicViews: AcademicTab[] = ["terms", "colleges", "sections", "instructors", "courses"];
/** Permission id that unlocks each academic catalogue. */
const ACADEMIC_PERM: Record<AcademicTab, number> = {
  terms: 5,
  colleges: 2,
  sections: 4,
  instructors: 3,
  courses: 6,
};

/**
 * Forget every cached read from the previous session.
 *
 * The service worker keeps answers to /api/schedules, /api/dashboard and the
 * rest so an offline launch has something real to show. That is right within
 * one session and wrong across two: a session that ended WITHOUT the logout
 * button — an expired cookie, a closed browser, a second account on the same
 * device — left its answers behind, and the next person to sign in could be
 * served the previous person's schedule the first time the network hiccuped.
 *
 * So the cache is emptied when identity changes, at BOTH ends: on the way out
 * and on the way in. The message is the normal path; the direct delete is the
 * belt, because a freshly installed worker has no controller yet and would
 * silently ignore the message.
 */
async function forgetCachedReads() {
  try { navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_API_CACHE" }); } catch { /* no worker */ }
  try {
    if (typeof caches === "undefined") return;
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("schedule-api")).map(name => caches.delete(name)));
  } catch { /* storage denied — the network path still answers */ }
}

const pathByView: Record<View, string> = {
  dashboard: "/Home/Index",
  terms: "/AdTerm/Index",
  colleges: "/AdCollege/Index",
  sections: "/AdSection/Index",
  instructors: "/AdInstructor/Index",
  courses: "/AdCourse/Index",
  schedules: "/FSchedule/Index",
  scheduleCopy: "/FSchedule/CopySchedule",
  intelligence: "/Schedule/Intelligence",
  searchInstructor: "/FSchedule/InstructorReport",
  searchRoom: "/FSchedule/RoomReport",
  searchTime: "/FSchedule/TimeReport",
  searchRoomTime: "/FSchedule/RoomTimeReport",
  searchAdvanced: "/FSchedule/MainReport",
  reportDepartment: "/FSchedule/MainScheduleReport",
  reportInstructor: "/FSchedule/InstructorReportRPT",
  reportRoom: "/FSchedule/RoomReportRPT",
  reportTime: "/FSchedule/TimeReportRPT",
  reportRoomTime: "/FSchedule/RoomTimeReportRPT",
  users: "/SystemUser/Index",
  permissions: "/FormSecurity/Index",
  scopes: "/AdCollegeUserAssign/Index",
  audit: "/System/AuditLog",
  backup: "/System/Backup",
  about: "/Public/Aboutus",
};
const viewByPath = new Map(
  Object.entries(pathByView).map(([view, path]) => [
    path.toLowerCase(),
    view as View,
  ]),
);

/** The pointer reaches a destination before the click. Use that small lead to
 * fetch its code chunk; dynamic imports are cached, so this never downloads a
 * screen twice and makes every navigation icon feel immediate. */
/**
 * The schedule board's own first question, asked before the board exists.
 *
 * The scope comes from the same preference the board itself reads, so the
 * request is the one it would have made — and when it mounts it finds the
 * answer waiting instead of starting the wait.
 */
export function warmScheduleWorkspace(userId: number) {
  void warmStart(`/api/schedules/workspace?${scheduleScopeQuery(userId)}`).catch(() => undefined);
}

function prefetchView(view: View) {
  if (view === "schedules" || view === "scheduleCopy") { void loadSchedules(); warmScheduleWorkspace(lastUserId()); }
  else if (view === "intelligence") void loadIntelligence();
  else if (academicViews.includes(view as AcademicTab)) void loadAcademicConsole();
  else if (searchViews.includes(view as ReportMode) || reportViews.includes(view as ReportMode)) void loadReports();
  else if (adminViews.includes(view as AdminMode)) void loadAdminUsers();
  else if (view === "about") void loadAbout();
}

const IDLE_LOGOUT_MS = 15 * 60 * 1000;
/** How long before the door closes the reader is warned it is closing. */
const IDLE_WARNING_MS = 60 * 1000;
/**
 * `pointermove` is deliberately absent.
 *
 * It fired on every pixel of a schedule drag — each one clearing and re-arming
 * a timer and re-checking the heartbeat — for no information the other four do
 * not already carry. A person who is reading rather than moving the mouse is
 * covered by the warning below, which is the honest answer to "am I still
 * here?" rather than a mouse twitch.
 */
const IDLE_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "keydown",
  "scroll",
  "touchstart",
];

/**
 * The rail's parts live at module scope — and that is load-bearing.
 *
 * Defined inside App, each of these was a brand-new component type on every
 * single App render, so React threw the whole navigation away and rebuilt it:
 * typing one letter into the spotlight tore down the sidebar, every nav group
 * and the phone dock, restarting the 0fr→1fr fold animation mid-keystroke. The
 * same happened on every theme toggle and every online/offline flip. Hoisted,
 * the types are stable, the rail simply re-renders, and the folds stay still.
 */
function NavButton({
  view,
  icon,
  label,
  visualLabel,
  active,
  activeView,
  onGo,
}: {
  view: View;
  icon: React.ReactNode;
  label: string;
  visualLabel?: string;
  active?: boolean;
  activeView: View;
  onGo: (view: View) => void;
}) {
  const on = active ?? activeView === view;
  const visibleText = view === "dashboard" ? "" : (visualLabel ?? label);
  return (
    <button
      type="button"
      className={`side-nav-link ${on ? "active" : ""}`}
      aria-current={on ? "page" : undefined}
      aria-label={label}
      title={label}
      onPointerEnter={() => prefetchView(view)}
      onFocus={() => prefetchView(view)}
      onClick={() => onGo(view)}
    >
      {icon}
      {visibleText ? <span>{visibleText}</span> : null}
      {on ? <ChevronLeft className="nav-arrow" /> : null}
    </button>
  );
}

function MobileDockLink({
  view,
  icon,
  label,
  active,
  activeView,
  onGo,
}: {
  view: View;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  activeView: View;
  onGo: (view: View) => void;
}) {
  const on = active ?? activeView === view;
  return (
    <button
      type="button"
      className={`mobile-dock-link ${on ? "active" : ""}`}
      aria-current={on ? "page" : undefined}
      aria-label={label}
      onPointerEnter={() => prefetchView(view)}
      onFocus={() => prefetchView(view)}
      onClick={() => onGo(view)}
    >
      <span className="mobile-dock-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="mobile-dock-label">{label}</span>
    </button>
  );
}

/**
 * A nav group that folds.
 *
 * Four headings stacked above eight links made the rail a wall of text to
 * read top to bottom before choosing. Folded, it is four words — and the one
 * group holding the screen you are on is the one left open, so the rail
 * always shows where you are without showing everywhere you could be.
 *
 * `holdsActive` is the default, not the state: once a group is pressed the
 * reader's choice is kept, and only that group's own entry is remembered, so
 * moving to another screen still opens the group that screen lives in.
 */
/**
 * The rail's fold, readable by a component.
 *
 * The stylesheet decides a great deal from `html[data-rail]`, and the sidebar's
 * groups have to agree with it — a body the CSS has drawn open must not be
 * marked inert. Rather than thread the flag through four call sites, the groups
 * subscribe to the same attribute the stylesheet reads.
 */
function readRailFolded() {
  return typeof document !== "undefined" && document.documentElement.dataset.rail === "closed";
}
function subscribeRail(onChange: () => void) {
  if (typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-rail"] });
  return () => observer.disconnect();
}
function NavSection({
  id,
  title,
  rail,
  holdsActive,
  className,
  children,
  navGroups,
  onToggle,
}: {
  id: string;
  title: string;
  rail: string;
  holdsActive: boolean;
  className?: string;
  children: React.ReactNode;
  navGroups: Record<string, boolean>;
  onToggle: (id: string, open: boolean) => void;
}) {
  // The rail opens closed. A section reveals itself only when pressed, and the
  // group holding the current screen no longer forces itself open — that
  // auto-expand was the reader's complaint. Where you are is still shown, as a
  // marked header (contains-active-route), not as an opened wall of links.
  const open = navGroups[id] ?? false;
  /* Whether the rail itself is folded to its spine — read from the same flag the
     stylesheet reads, so the two can never disagree about it again. */
  const railFolded = useSyncExternalStore(subscribeRail, readRailFolded, () => false);
  const bodyId = `nav-section-${id}`;
  return (
    <div
      className={`nav-section ${
        holdsActive ? "contains-active-route" : ""
      } ${className || ""}`}
      data-rail={rail}
      data-open={open ? "true" : undefined}
      data-active={holdsActive ? "true" : undefined}
    >
      <button
        type="button"
        className={`nav-section-title ${
          holdsActive ? "has-active-route" : ""
        }`}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(id, open)}
        title={open ? `طيّ ${title}` : `فتح ${title}`}
      >
        <span>{title}</span>
        <ChevronLeft className="nav-section-chevron" aria-hidden="true" />
      </button>
      {/* One wrapper, because the 0fr→1fr fold measures a single grid row. */}
      {/* Drawn and dead was the worst of both: while the rail rests as a spine
          the CSS above stands every group open, yet `open` is false, so those
          glyphs were painted, unclickable, untabbable and missing from the
          accessibility tree — against the rail's own promise that "every icon
          still navigates on its own". A body is inert only when it is folded
          for real, which is now the same condition in both languages. */}
      <div
        className="nav-section-body"
        id={bodyId}
        aria-hidden={!open && !railFolded}
        inert={!open && !railFolded ? true : undefined}
      >
        <div>{children}</div>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => { installClientTelemetry(); telemetryBreadcrumb("فتح التطبيق"); }, []);
  const [user, setUser] = useState<SessionUser | null>(null),
    [permissions, setPermissions] = useState<number[]>([]),
    [scopes, setScopes] = useState<any[]>([]),
    [loading, setLoading] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideContext, setGuideContext] = useState<any>(null);
  const [guideHint, setGuideHint] = useState<{ key?: string; featureId?: string; title: string; detail?: string; level?: "soft" | "strong" } | null>(null);
  const [guideProfileRevision, setGuideProfileRevision] = useState(0);
  const [ambientDismissedKey, setAmbientDismissedKey] = useState("");
  useEffect(() => { setTelemetryOwner(Number(user?.SystemUserId || 0)); }, [user?.SystemUserId]);
  /**
   * ── الشاشات الثقيلة تُحمَّل قبل أن تُطلب ──────────────────────────────────
   *
   * Every workspace except the dashboard is a lazy chunk, fetched the moment
   * it is first opened — which means the most-used screen in the product, the
   * schedule board (~133KB gzipped), made its reader watch a download bar on
   * every fresh session at the exact moment they asked to work.
   *
   * The session sits idle on the dashboard for seconds after sign-in; those
   * seconds now pay for the navigation. The chunks come down in the order a
   * coordinator actually reaches for them — the board first, then the
   * intelligence centre, then reports — each on its own idle beat so none of
   * them competes with whatever the dashboard itself is still fetching. A
   * chunk that arrives here is a no-op when the route later imports it: same
   * promise, already resolved, so navigation becomes render-only.
   *
   * Failures are swallowed on purpose: this is a warm-up, not a dependency,
   * and the route's own import (with its reload guard in safeLazy) remains
   * the authority if the network dropped a prefetch.
   */
  useEffect(() => {
    if (!user) return;
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    const handles: Array<() => void> = [];
    const onIdle = (run: () => void, timeout: number) => {
      if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(run, { timeout });
        handles.push(() => w.cancelIdleCallback?.(id));
      } else {
        const id = window.setTimeout(run, Math.min(timeout, 1200));
        handles.push(() => window.clearTimeout(id));
      }
    };
    onIdle(() => {
      void loadSchedules().catch(() => undefined);
      /* The ANSWER, not only the code: the workspace read starts now, lands on
         the warm-start shelf, and the board's loader claims it on arrival —
         so the first visit to the schedule finds both its chunk and its data
         already in hand. */
      warmScheduleWorkspace(Number(user.SystemUserId || 0));
    }, 1500);
    onIdle(() => { void loadIntelligence().catch(() => undefined); }, 4000);
    onIdle(() => { void loadReports().catch(() => undefined); }, 7000);
    return () => handles.forEach(cancel => cancel());
  }, [user?.SystemUserId]);

  useEffect(() => {
    const refresh = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.userId || Number(detail.userId) === Number(user?.SystemUserId || 0)) setGuideProfileRevision(value => value + 1);
    };
    window.addEventListener("schedule-smart-guide-profile", refresh as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-profile", refresh as EventListener);
  }, [user?.SystemUserId]);

  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      setGuideContext(detail);
      if (user?.SystemUserId && detail?.currentTask) {
        const currentProfile = loadGuideProfile(Number(user.SystemUserId));
        const activeGuideTask = currentProfile.currentTask?.id?.startsWith("tour:") || currentProfile.currentTask?.id?.startsWith("assist:");
        if (!activeGuideTask) {
          setGuideTask(Number(user.SystemUserId), {
            ...detail.currentTask,
            id: detail.currentTask.id || `work:${detail.scope || "app"}`,
            startedAt: Number(currentProfile.currentTask?.startedAt || Date.now()),
            updatedAt: Date.now(),
          });
        }
      }
      if (!detail?.detectedHelp?.title || !user?.SystemUserId) return;
      const severity = detail.detectedHelp.level === "strong" ? "strong" : "soft";
      const key = String(detail.detectedHelp.key || `${detail.scope || "app"}:${detail.detectedHelp.title}`);
      const profile = loadGuideProfile(Number(user.SystemUserId));
      const feature = featureById(detail.detectedHelp.featureId || "");
      const mastery = feature ? masteryScore(profile, feature) : 0;
      // Expert users only get a soft interruption when the event is genuinely
      // unusual. Strong errors still surface because expertise does not make a
      // broken operation normal.
      if (severity === "soft" && mastery >= .72) return;
      if (!canProactivelyHint(profile, key, severity)) return;
      noteHint(Number(user.SystemUserId), key, false);
      setGuideHint({
        key,
        featureId: detail.detectedHelp.featureId || undefined,
        title: detail.detectedHelp.title,
        detail: detail.detectedHelp.detail || "",
        level: severity,
      });
    };
    window.addEventListener("schedule-smart-guide-context", onContext as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-context", onContext as EventListener);
  }, [user?.SystemUserId]);
  useEffect(() => {
    const openGuide = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.context) setGuideContext((current:any) => ({ ...(current || {}), ...detail.context }));
      if (detail.hint?.title) setGuideHint({ key:detail.hint.key, featureId:detail.hint.featureId, title:detail.hint.title, detail:detail.hint.detail || "", level:detail.hint.level === "strong" ? "strong" : "soft" });
      setGuideOpen(true);
    };
    window.addEventListener("schedule-smart-guide-open", openGuide as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-open", openGuide as EventListener);
  }, []);
  const [activeView, setActiveView] = useState<View>(
    () => viewByPath.get(window.location.pathname.toLowerCase()) || "dashboard",
  );
  useEffect(() => { telemetryBreadcrumb(`واجهة: ${activeView}`); setGuideContext(null); setGuideHint(null); }, [activeView]);
  useEffect(() => {
    const userId = Number(user?.SystemUserId || 0);
    if (!userId || activeView === "schedules" || activeView === "intelligence") return;
    const profile = loadGuideProfile(userId);
    const activeGuideTask = profile.currentTask?.id?.startsWith("tour:") || profile.currentTask?.id?.startsWith("assist:");
    const recentTask = profile.currentTask && Date.now() - Number(profile.currentTask.updatedAt || 0) < 24 * 60 * 60 * 1000;
    if (activeGuideTask || (recentTask && profile.currentTask?.id !== `work:page:${activeView}`)) return;
    const page = featureById(`page.${activeView}`);
    setGuideTask(userId, {
      id: `work:page:${activeView}`,
      title: page?.title || "متابعة الشاشة الحالية",
      featureId: page?.id,
      command: { scope: "app", type: "navigate", value: activeView },
      startedAt: Number(profile.currentTask?.startedAt || Date.now()),
      updatedAt: Date.now(),
    });
  }, [activeView, user?.SystemUserId]);

  const previousGuideView = useRef<View | null>(null);
  const guideDwellStartedRef = useRef(Date.now());
  const recentGuideViews = useRef<Array<{ view: View; at: number }>>([]);
  useEffect(() => {
    const userId = Number(user?.SystemUserId || 0);
    if (!userId) { previousGuideView.current = activeView; return; }
    const previous = previousGuideView.current;
    const before = loadGuideProfile(userId);
    const now = Date.now();
    if (previous && previous !== activeView) {
      recordFeatureDwell(userId, `page.${previous}`, now - guideDwellStartedRef.current);
      recordRoute(userId, previous, activeView);
      guideDwellStartedRef.current = now;
    }
    previousGuideView.current = activeView;
    recentGuideViews.current = [...recentGuideViews.current.filter(item => now - item.at < 15000), { view: activeView, at: now }].slice(-8);
    const sequence = recentGuideViews.current.map(item => item.view);
    if (sequence.length >= 5) {
      const a = sequence[sequence.length - 1], b = sequence[sequence.length - 2];
      const alternating = sequence.slice(-5).every((view, index, arr) => index === 0 || view !== arr[index - 1])
        && new Set(sequence.slice(-5)).size <= 2;
      const historical = Number(before.routes[`${a}>${b}`] || 0) + Number(before.routes[`${b}>${a}`] || 0);
      const page = featureById(`page.${activeView}`);
      const friction = evaluateGuideFriction(before, page, [{ type:"route-bounce", count:alternating ? 2 : 0, weight:1.45 }]);
      const reason = classifyGuideReason({ mastery:friction.mastery, anomaly:alternating && historical < 5 });
      // Familiar back-and-forth is a workflow, not confusion. Only an unfamiliar
      // route anomaly can produce a hint; AB therefore becomes completely silent
      // once week↔rooms is a proven successful habit.
      if (alternating && historical < 5 && reason !== "NORMAL_EXPERT_BEHAVIOR" && friction.confidence !== "low" && canProactivelyHint(before, `route-bounce:${a}:${b}`, friction.confidence)) {
        noteHint(userId, `route-bounce:${a}:${b}`, false);
        noteFriction(userId, `تنقل متكرر · ${String(a)} ↔ ${String(b)}`);
        telemetryBreadcrumb(`المرشد · تنقل متكرر ${String(a)}↔${String(b)}`); telemetryGuide(`journey|page.${String(activeView)}|1|route-bounce|${friction.confidence}`);
        setGuideHint({ key:`route-bounce:${a}:${b}`, title:"يبدو أنك تبحث بين شاشتين", detail:"إذا كنت تبحث عن وظيفة محددة، يمكن للمرشد أن يوصلك إليها مباشرةً. وإذا كان هذا مسارك المعتاد فسيتعلمه ولن يكرر الاقتراح.", level:friction.confidence === "high" ? "strong" : "soft" });
      }
    }
  }, [activeView, user?.SystemUserId]);

  useEffect(() => {
    const userId = Number(user?.SystemUserId || 0);
    if (!userId || activeView === "schedules" || activeView === "intelligence") return;
    const page = featureById(`page.${activeView}`);
    const dirty = new Set<HTMLElement>();
    const menuToggles = new Map<string, number[]>();
    let selectedLabel = "";
    let lastErrorText = "";
    let lastErrorAt = 0;
    let explorationAfterError = 0;
    let publishTimer = 0;

    const visible = (element: Element | null): element is HTMLElement => {
      if (!(element instanceof HTMLElement)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const labelOf = (element: HTMLElement | null) => controlLabel(element, 110);
    const currentDialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"],.modal,.dialog,.drawer')].find(visible) || null;
    const currentError = () => [...document.querySelectorAll<HTMLElement>('[role="alert"],.notice,.error,.field-error,.validation-error')].filter(visible).map(labelOf).find(text => /تعذر|خطأ|غير صالح|مطلوب|لا يمكن|فشل|تعارض/.test(text)) || "";
    const publish = () => {
      window.clearTimeout(publishTimer);
      publishTimer = window.setTimeout(() => {
        const dialog = currentDialog();
        const activeTarget = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-guide-target]")?.getAttribute("data-guide-target") || "";
        const errorText = currentError();
        if (errorText && errorText !== lastErrorText) {
          lastErrorText = errorText;
          lastErrorAt = Date.now();
          explorationAfterError = 0;
        }
        const pieces = [
          dialog ? `نافذة مفتوحة: ${labelOf(dialog).slice(0, 64)}` : "",
          dirty.size ? "توجد تغييرات لم تُحفظ بعد" : "",
          errorText ? `يوجد تنبيه: ${errorText.slice(0, 82)}` : "",
        ].filter(Boolean);
        setGuideContext((current: any) => ({
          ...(current?.view === activeView ? current : {}),
          view: activeView,
          scope: "app",
          title: page?.title || "هذه الشاشة",
          summary: page?.summary || "",
          whatHappens: pieces.join(" · ") || page?.summary || "أقرأ الشاشة الحالية وأحدد ما تحتاجه دون إزعاجك.",
          currentFeatureId: activeTarget && featureById(activeTarget) ? activeTarget : page?.id,
          selected: selectedLabel ? { course: selectedLabel } : null,
          openDialog: dialog ? labelOf(dialog).slice(0, 90) : "",
          unsaved: dirty.size > 0,
          error: errorText,
        }));
      }, 60);
    };
    const onInput = (event: Event) => {
      const element = event.target instanceof HTMLElement ? event.target : null;
      if (!element || element.closest(".smart-guide") || !element.closest("form,.content-stack,.inspector-pane,.academic-inspector")) return;
      if (element.matches('input[type="search"],input[role="searchbox"]')) return;
      dirty.add(element);
      publish();
    };
    const onClick = (event: MouseEvent) => {
      const raw = event.target instanceof HTMLElement ? event.target : null;
      if (!raw || raw.closest(".smart-guide")) return;
      const card = raw.closest<HTMLElement>(".record-card,.master-list button,.catalog-master button,[aria-selected='true']");
      if (card) selectedLabel = labelOf(card);
      const control = raw.closest<HTMLElement>("button,a,[role='button']");
      if (control) {
        const label = labelOf(control);
        if (/حفظ|تطبيق|موافق|اعتماد|نشر|تحديث/.test(label)) dirty.clear();
        if (control.hasAttribute("aria-expanded")) {
          const key = control.getAttribute("data-guide-target") || `${activeView}:${label}`;
          window.setTimeout(() => {
            const now = Date.now();
            const recent = [...(menuToggles.get(key) || []).filter(value => now - value < 14000), now];
            menuToggles.set(key, recent);
            const profile = loadGuideProfile(userId);
            const pageMastery = page ? masteryScore(profile, page) : 0;
            const threshold = pageMastery >= .72 ? 7 : 4;
            const friction = evaluateGuideFriction(profile, page, [{ type:"menu-loop", count:Math.max(0,recent.length-threshold+1), weight:1.7 }]);
            const reason = classifyGuideReason({ mastery:friction.mastery, anomaly:recent.length >= threshold });
            if (recent.length >= threshold && friction.confidence !== "low" && reason !== "NORMAL_EXPERT_BEHAVIOR" && canProactivelyHint(profile, `menu-loop:${key}`, friction.confidence)) {
              noteHint(userId, `menu-loop:${key}`, false);
              noteFriction(userId, `فتح وإغلاق متكرر · ${activeView}`);
              setGuideHint({
                key: `menu-loop:${key}`,
                title: friction.confidence === "high" ? "هذا المسار لا يسير كالمعتاد" : "يمكنني الوصول بك مباشرةً",
                detail: label ? `تكرر فتح «${label}» وإغلاقه دون إكمال خطوة. يمكنني تحديد المكان أو فتح الوظيفة المناسبة.` : "تكرر فتح القوائم دون إكمال خطوة واضحة.",
                level: friction.confidence === "high" ? "strong" : "soft",
              });
            }
          }, 0);
        }
      }
      if (lastErrorAt && Date.now() - lastErrorAt < 22000) {
        explorationAfterError += 1;
        if (explorationAfterError >= 3) {
          const profile = loadGuideProfile(userId);
          const friction = evaluateGuideFriction(profile, page, [{ type:"exploration-after-error", count:explorationAfterError, weight:1.4, knownFailure:true }]);
          if (friction.confidence === "high" && canProactivelyHint(profile, `after-error:${activeView}:${lastErrorText.slice(0,24)}`, friction.confidence)) {
            noteHint(userId, `after-error:${activeView}:${lastErrorText.slice(0,24)}`, false);
            noteFriction(userId, `استكشاف بعد خطأ · ${activeView}`);
            setGuideHint({
              key: `after-error:${activeView}:${lastErrorText.slice(0,24)}`,
              title: "أستطيع تفسير سبب المشكلة",
              detail: lastErrorText ? `ظهر تنبيه ثم استمر البحث داخل الشاشة. يمكنني شرح «${lastErrorText.slice(0,70)}» وتحديد الخطوة الصحيحة.` : "ظهر خطأ قبل قليل ويمكنني تفسيره وتحديد الخطوة الصحيحة.",
              level: "strong",
            });
            explorationAfterError = 0;
          }
        }
      }
      publish();
    };
    const observer = new MutationObserver(() => publish());
    const observedRoot = document.querySelector(".app-main") || document.body;
    observer.observe(observedRoot, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-expanded", "aria-invalid"] });
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("click", onClick, true);
    publish();
    return () => {
      window.clearTimeout(publishTimer);
      observer.disconnect();
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [activeView, user?.SystemUserId]);

  useEffect(() => {
    const userId = Number(user?.SystemUserId || 0);
    if (!userId) return;
    const repeated = new Map<string, number[]>();
    const hesitation = new Map<string, number>();
    let hoverTimer: number | null = null;
    let hoverKey = "";
    let hoverClicked = false;
    const labelOf = (element: HTMLElement) => controlLabel(element, 72);
    const onClick = (event: MouseEvent) => {
      const raw = event.target instanceof HTMLElement ? event.target : null;
      const control = raw?.closest<HTMLElement>("[data-guide-target],button,a,[role='button']");
      if (!control || control.closest(".smart-guide")) return;
      if (activeView !== "schedules" && activeView !== "intelligence") {
        const card = raw?.closest<HTMLElement>(".record-card,.catalog-master button,.master-list button");
        if (card) {
          const label = controlLabel(card, 96);
          const page = featureById(`page.${activeView}`);
          setGuideContext({ view: activeView, title: page?.title || "هذه الشاشة", summary: page?.summary || "", currentFeatureId: page?.id, selected: label ? { course: label } : null, whatHappens: page?.summary || "" });
        }
      }
      hoverClicked = true;
      const clickedControlLabel = labelOf(control);
      const naturallyRepeatable = /التالي|السابق|اليوم|الأسبوع التالي|الأسبوع السابق|تكبير|تصغير|تمرير|صفحة تالية|صفحة سابقة/.test(clickedControlLabel);
      const explicit = control.getAttribute("data-guide-target") || control.closest<HTMLElement>("[data-guide-target]")?.getAttribute("data-guide-target") || "";
      if (explicit && featureById(explicit)) recordFeatureEvent(userId, explicit, "attempt");
      const key = explicit || `${activeView}:${clickedControlLabel}`;
      if (naturallyRepeatable) return;
      const now = Date.now();
      const list = [...(repeated.get(key) || []).filter(value => now - value < 8000), now];
      repeated.set(key, list);
      const profile = loadGuideProfile(userId);
      const feature = explicit ? featureById(explicit) : null;
      const expert = feature ? masteryScore(profile, feature) >= .72 : false;
      const threshold = expert ? 7 : 4;
      const friction = evaluateGuideFriction(profile, feature, [{ type:"repeated-control", count:list.length >= threshold ? list.length - threshold + 1 : 0, weight:1.8 }]);
      const reason = classifyGuideReason({ mastery:friction.mastery, anomaly:list.length >= threshold, versionChanged:Boolean(feature && profile.mastery[feature.id]?.versionSeen && profile.mastery[feature.id].versionSeen < feature.version) });
      if (list.length >= threshold && friction.confidence !== "low" && reason !== "NORMAL_EXPERT_BEHAVIOR" && canProactivelyHint(profile, `repeat:${key}`, friction.confidence)) {
        noteHint(userId, `repeat:${key}`, false);
        noteFriction(userId, explicit ? `تكرار · ${explicit}` : `تكرار · ${activeView}`);
        telemetryBreadcrumb(`المرشد · تكرار ${explicit || activeView}`); telemetryGuide(`journey|${explicit || activeView}|1|control|repeat`);
        setGuideHint({ key:`repeat:${key}`, title: friction.confidence === "high" ? "هذه الخطوة لا تسير كالمعتاد" : "يمكنني مساعدتك هنا", detail: clickedControlLabel ? `تكرر استخدام «${clickedControlLabel}» دون انتقال واضح. يمكنني شرحها أو نقلك إلى المكان الصحيح.` : "تكررت المحاولة نفسها أكثر من المعتاد.", level: friction.confidence === "high" ? "strong" : "soft" });
      }
    };
    const onPointerOver = (event: PointerEvent) => {
      const raw = event.target instanceof HTMLElement ? event.target : null;
      const control = raw?.closest<HTMLElement>("button,[role='button']");
      if (!control || control.closest(".smart-guide")) return;
      const label = labelOf(control);
      if (!/حذف|نشر|اعتماد|استعادة|استعاده|استبدال|مسح/.test(label)) return;
      if (hoverTimer != null) window.clearTimeout(hoverTimer);
      hoverKey = `${activeView}:${label}`; hoverClicked = false;
      hoverTimer = window.setTimeout(() => {
        const count = Number(hesitation.get(hoverKey) || 0) + 1; hesitation.set(hoverKey, count);
        if (count < 2 || hoverClicked) return;
        const profile = loadGuideProfile(userId);
        const featureId = control.getAttribute("data-guide-target") || "";
        const feature = featureId ? featureById(featureId) : featureById(`page.${activeView}`);
        const friction = evaluateGuideFriction(profile, feature, [{ type:"sensitive-hesitation", count, weight:1.35 }]);
        const reason = classifyGuideReason({ mastery:friction.mastery, hesitation:true });
        if (reason !== "HESITANT" || friction.confidence === "low" || !canProactivelyHint(profile, `hesitate:${hoverKey}`, friction.confidence)) return;
        noteHint(userId, `hesitate:${hoverKey}`, false);
        noteFriction(userId, `تردد · ${activeView}`);
        telemetryBreadcrumb(`المرشد · تردد ${activeView}`); telemetryGuide(`تردد قبل إجراء · ${activeView}`);
        setGuideHint({ key:`hesitate:${hoverKey}`, title:"إذا كنت مترددًا، يمكنني توضيح النتيجة قبل الضغط", detail:`«${label}» إجراء مؤثر. المرشد يشرح لك ما سيحدث أولًا ولا ينفذ إجراءً حساسًا بدون قرارك.`, level:"soft" });
      }, 1600);
    };
    const onGeneralHover = (event: PointerEvent) => {
      const raw = event.target instanceof HTMLElement ? event.target : null;
      const control = raw?.closest<HTMLElement>("[data-guide-target]");
      if (!control || control.closest(".smart-guide")) return;
      const explicit = control.getAttribute("data-guide-target") || "";
      const feature = featureById(explicit);
      if (!feature) return;
      const current = loadGuideProfile(userId);
      if (masteryScore(current, feature) >= .25) return;
      const label = labelOf(control);
      if (/حذف|نشر|اعتماد|استعادة|استعاده|استبدال|مسح/.test(label)) return;
      if (hoverTimer != null) window.clearTimeout(hoverTimer);
      hoverClicked = false;
      hoverTimer = window.setTimeout(() => {
        if (hoverClicked) return;
        const profile = loadGuideProfile(userId);
        if (!canProactivelyHint(profile, `hover:${explicit}`, "soft")) return;
        noteHint(userId, `hover:${explicit}`, false);
        setGuideHint({ key:`hover:${explicit}`, title:`هل تريد شرح «${feature.title}»؟`, detail:"يمكنني تحديدها على الشاشة وشرحها بخطوات قصيرة.", level:"soft" });
      }, 3600);
    };
    const onPointerOut = () => { if (hoverTimer != null) window.clearTimeout(hoverTimer); hoverTimer = null; };
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerover", onPointerOver, true);
    document.addEventListener("pointerover", onGeneralHover, true);
    document.addEventListener("pointerout", onPointerOut, true);
    return () => { if (hoverTimer != null) window.clearTimeout(hoverTimer); document.removeEventListener("click", onClick, true); document.removeEventListener("pointerover", onPointerOver, true); document.removeEventListener("pointerover", onGeneralHover, true); document.removeEventListener("pointerout", onPointerOut, true); };
  }, [activeView, user?.SystemUserId]);
  /** Which nav groups the reader has pressed open or shut, by group id. */
  // The primary workspace group opens by default so the daily destinations —
  // dashboard, schedule, queries — are one press away; the secondary groups
  // (decision tools, reference & administration) stay folded until asked for,
  // which is what the reader wanted when the admin group used to spring open.
  const [navGroups, setNavGroups] = useState<Record<string, boolean>>({});
  /* «عن البرنامج» is no longer a destination in the menu. What it was about —
     what this system has become — now lives behind the identity line at the
     foot of the rail, where it belongs: a thing you glance at, not a place you
     navigate to. */
  const [journeyOpen, setJourneyOpen] = useState(false);
  /* The rail starts present on a desk and folded on a phone; after that its
     state is the reader's, on every width alike. */
  const [sidebarOpen, setSidebarOpen] = useState(
      () => typeof window !== "undefined" && window.matchMedia("(min-width:1120px)").matches,
    ),
    [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(""),
    [searching, setSearching] = useState(false),
    [searchResults, setSearchResults] = useState<SearchHit[]>([]),
    [commandThinking, setCommandThinking] = useState(false),
    [commandInsight, setCommandInsight] = useState<any>(null),
    [naturalAnswer, setNaturalAnswer] = useState<any>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = safeStorage.get("schedule-theme");
    if (stored === "dark" || stored === "light") return stored;
    // Default to day/light mode; only an explicit user choice switches to dark.
    return "light";
  });
  const [dataMode, setDataMode] = useState<{ mode: string; real: boolean } | null>(null);
  /** True for the last minute before an idle sign-out, so the screen can say so. */
  const [idleWarning, setIdleWarning] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine),
    [onboardingStep, setOnboardingStep] = useState(-1),
    [usage, setUsage] = useState<Record<string, number>>({}),
    [entityFavorites, setEntityFavorites] = useState<FavoriteEntity[]>([]);
  const searchInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  // On phones the master list and its detail panel stack in one column, so
  // tapping a row updated a panel far below the fold and the tap read as nothing
  // happening ("where's the screen? we're at the very bottom"). One delegated
  // listener brings the detail into view on every list tap, across every
  // master/detail screen, with no per-screen wiring.
  useEffect(() => {
    const onPointerUp = (event: Event) => {
      if (!window.matchMedia("(max-width:1100px)").matches) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.(".record-card, .master-list button, .catalog-master button")) return;
      const detail = document.querySelector<HTMLElement>(".academic-inspector, .inspector-pane");
      if (!detail) return;
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => detail.scrollIntoView({ behavior: "smooth", block: "start" })),
      );
    };
    document.addEventListener("click", onPointerUp);
    return () => document.removeEventListener("click", onPointerUp);
  }, []);
  // Persist ONLY an explicit user choice, so the day-mode default is never
  // silently written to storage on first load (Note 31: always day unless changed).
  const chooseTheme = (next: "light" | "dark") => {
    setTheme(next);
    safeStorage.set("schedule-theme", next);
  };
  useEffect(() => {
    if (!user) return;
    let lastActivityAt = Date.now();
    let lastHeartbeatAt = 0;
    let timer = 0;
    let warnTimer = 0;
    let heartbeatBusy = false;
    const HEARTBEAT_EVERY_MS = 4 * 60 * 1000;
    const idleLogoutMs = user.IsDemo ? 60 * 60 * 1000 : IDLE_LOGOUT_MS;
    /**
     * The session ends with a warning, not a trapdoor.
     *
     * Fifteen silent minutes used to end in an instant logout that took a
     * half-written appointment with it — the reader was reading, not idle, and
     * the screen gave no sign anything was about to happen. A minute before the
     * end the countdown appears and one press of anything at all keeps the
     * session; ignoring it still signs out, which is the point of the rule.
     */
    const arm = () => {
      window.clearTimeout(timer);
      window.clearTimeout(warnTimer);
      setIdleWarning(false);
      const remaining = Math.max(0, idleLogoutMs - (Date.now() - lastActivityAt));
      warnTimer = window.setTimeout(() => setIdleWarning(true), Math.max(0, remaining - IDLE_WARNING_MS));
      timer = window.setTimeout(() => void logout(), remaining);
    };
    const heartbeat = async () => {
      const now = Date.now();
      if (heartbeatBusy || now - lastHeartbeatAt < HEARTBEAT_EVERY_MS) return;
      heartbeatBusy = true;
      lastHeartbeatAt = now;
      try {
        const response = await fetch("/api/auth/heartbeat", { method: "POST" });
        if (response.status === 401 || response.status === 403) void logout();
      } catch {
        // Network loss must not turn user activity into a forced logout. The server
        // remains authoritative and will validate the session on the next request.
      } finally {
        heartbeatBusy = false;
      }
    };
    const markActivity = () => {
      lastActivityAt = Date.now();
      arm();
      void heartbeat();
    };
    IDLE_ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, markActivity, { passive: true }),
    );
    const visibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityAt >= idleLogoutMs) {
        void logout();
        return;
      }
      markActivity();
    };
    document.addEventListener("visibilitychange", visibility);
    arm();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(warnTimer);
      IDLE_ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, markActivity),
      );
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [user?.SystemUserId]);
  /**
   * ── What «متصل» is allowed to mean ────────────────────────────────────────
   *
   * `navigator.onLine` reports whether the machine has a network interface, and
   * reports it generously: a laptop on a captive café wifi with no route out
   * still says yes. The screen was turning that into «متصل وآمن للحفظ» — a
   * promise about a server it had never spoken to.
   *
   * There are four honest states, not two, and only the server can tell them
   * apart. The browser's own signal is kept as the fast path — when the
   * interface drops there is no point asking — and the heartbeat decides the
   * rest, quietly, and only while the tab is being looked at.
   */
  const [health, setHealth] = useState<"online" | "reconnecting" | "offline" | "database-down">(
    () => (navigator.onLine ? "online" : "offline"),
  );
  const [healthProbe, setHealthProbe] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const beat = async () => {
      if (!alive) return;
      if (!navigator.onLine) { setHealth("offline"); return; }
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!alive) return;
        if (!response.ok) setHealth("reconnecting");
        else if (data && data.ok === false) setHealth("database-down");
        else setHealth("online");
      } catch {
        // The interface says yes and the server did not answer: that is exactly
        // the state the old reading could never see.
        if (alive) setHealth("reconnecting");
      }
    };
    const schedule = () => {
      window.clearTimeout(timer);
      // A tab nobody is looking at asks nothing.
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(async () => { await beat(); schedule(); }, 30_000);
    };
    const wake = () => { void beat(); schedule(); };
    const down = () => setHealth("offline");
    void beat();
    schedule();
    window.addEventListener("online", wake);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [healthProbe]);
  useEffect(() => { setOnline(health === "online"); }, [health]);
  const healthLabel =
    health === "online" ? "متصل بالخادم · الحفظ متاح"
      : health === "reconnecting" ? "تعذر الوصول إلى الخادم · متوقف مؤقتاً"
        : health === "database-down" ? "الخدمة غير متاحة · متوقفة مؤقتاً"
          : "لا يوجد اتصال بالإنترنت";
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me"),
          data = await res.json();
        if (res.ok && data.user) {
          /**
           * ── متى يُنسى ما قُرئ سابقاً ──────────────────────────────────
           *
           * A new sign-in must never inherit the last one's answers — that is
           * still true, and it is why this exists. But this effect does not
           * run on sign-in; it runs on every boot that finds a live session.
           * Wiping the read cache here therefore wiped it on every reload, on
           * every return to the tab, for the same person on the same account —
           * and the schedule, which the worker had been serving instantly from
           * cache, went back to Firestore every single time.
           *
           * The fix is the identity this code already writes on the next line.
           * Forget the previous reads only when the account is genuinely a
           * different one, or when there is nothing to compare against.
           */
          const signedIn = String(data.user?.SystemUserId || 0);
          let previous = "";
          try { previous = localStorage.getItem("schedule-last-user") || ""; } catch { /* private mode */ }
          if (previous !== signedIn) void forgetCachedReads();
    setUser(data.user);
    try { localStorage.setItem("schedule-last-user", signedIn); } catch { /* private mode */ }
          setPermissions(
            Array.isArray(data.permissions) ? data.permissions : [],
          );
          setScopes(Array.isArray(data.scopes) ? data.scopes : []);
          setDataMode(data.data || null);
        }
      } catch {
        setHealth(navigator.onLine ? "reconnecting" : "offline");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    const pop = () =>
      setActiveView(
        viewByPath.get(window.location.pathname.toLowerCase()) || "dashboard",
      );
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        // The tour is a courtesy, not a gate: Escape leaves it like any dialog.
        setOnboardingStep(current => (current >= 0 ? -1 : current));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInput.current?.focus(), 30);
  }, [searchOpen]);
  /**
   * A command palette you can finish with the keyboard.
   *
   * Opening with ⌘K and then being made to reach for the mouse is the palette
   * failing at the one thing it is for. Down and Up walk the offered commands
   * and results, Enter takes the highlighted one, and Tab is kept inside the
   * dialog so it cannot wander into the page behind it — which it could, since
   * the panel declares `aria-modal` and nothing enforced it. Focus returns to
   * whatever the reader was on when the palette closes.
   *
   * The highlight is applied directly to the rendered buttons rather than held
   * in React state: the list is rebuilt as the query changes, and this way a
   * keystroke never costs a re-render of the whole shell.
   */
  useEffect(() => {
    if (!searchOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    let cursor = -1;
    const rows = () => Array.from(
      document.querySelectorAll<HTMLElement>(
        ".spotlight-body .command-actions > button, .spotlight-body .spotlight-results > button, .spotlight-body .favorite-grid > button",
      ),
    );
    const paint = (items: HTMLElement[]) => {
      items.forEach((item, index) => item.classList.toggle("spot-cursor", index === cursor));
      if (cursor >= 0) items[cursor]?.scrollIntoView({ block: "nearest" });
    };
    const onKey = (event: KeyboardEvent) => {
      const items = rows();
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!items.length) return;
        event.preventDefault();
        cursor = event.key === "ArrowDown"
          ? (cursor + 1) % items.length
          : (cursor <= 0 ? items.length - 1 : cursor - 1);
        paint(items);
        return;
      }
      if (event.key === "Enter" && cursor >= 0 && items[cursor]) {
        event.preventDefault();
        items[cursor].click();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = document.querySelector<HTMLElement>(".spotlight");
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter(element => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      rows().forEach(item => item.classList.remove("spot-cursor"));
      opener?.focus?.();
    };
  }, [searchOpen]);
  useEffect(() => {
    if (!searchOpen) {
      setQuery("");
      setSearchResults([]);
      setCommandInsight(null);
      setNaturalAnswer(null);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
            signal: controller.signal,
          }),
          d = await r.json();
        if (r.ok)
          setSearchResults([
            ...(d.schedules || []),
            ...(d.instructors || []),
            ...(d.courses || []),
            ...(d.rooms || []),
          ]);
      } catch (e: any) {
        if (e?.name !== "AbortError") setSearchResults([]);
      } finally {
        setSearching(false);
      }
      // A written question ("قاعات فاضية الثلاثاء 10") is answered directly
      // instead of being turned into a list of filters to set by hand.
      if (allowed.schedule && /فاض|فارغ|متاح|شاغر|فراغ|الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|\d/.test(q)) {
        try {
          const nr = await fetch(`/api/search/natural?q=${encodeURIComponent(q)}`, { signal: controller.signal });
          const nd = await nr.json();
          setNaturalAnswer(nr.ok && nd.intent !== "unknown" ? nd : null);
        } catch (e: any) {
          if (e?.name !== "AbortError") setNaturalAnswer(null);
        }
      } else {
        setNaturalAnswer(null);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchOpen]);

  /**
   * Stable across renders — and that stability is load-bearing.
   *
   * As a fresh arrow function on every App render, this changed the identity of
   * everything derived from it. The academic console keyed an effect on that
   * identity, so all five catalogues — including the 1,400-course and 743-name
   * payloads — were re-downloaded on every re-render of the shell: a theme
   * toggle, an online/offline flip, a keystroke in the spotlight. Now the
   * function only changes when the permissions themselves do.
   */
  const hasPerm = useCallback((id: number) => permissions.includes(id), [permissions]);
  const hasAny = useCallback((...ids: number[]) => ids.some(hasPerm), [hasPerm]);
  const allowed = useMemo(
    () => ({
      menu: hasAny(2, 3, 4, 5),
      courses: hasPerm(6),
      schedule: hasPerm(7),
      search: hasAny(14, 8, 9, 10),
      reports: hasAny(14, 8, 9, 10),
      admin: hasAny(11, 12, 15),
    }),
    [permissions],
  );
  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.IsRootAdmin);
  const availableSearchModes = searchViews.filter((v) =>
    v === "searchAdvanced"
      ? hasPerm(17)
      : v === "searchInstructor"
        ? hasPerm(8)
        : v === "searchRoom"
          ? hasPerm(9)
          : v === "searchTime"
            ? hasPerm(10)
            : hasPerm(16),
  );
  const availableReportModes = reportViews.filter((v) =>
    v === "reportDepartment"
      ? hasPerm(14)
      : v === "reportInstructor"
        ? hasPerm(8)
        : v === "reportRoom"
          ? hasPerm(9)
          : v === "reportTime"
            ? hasPerm(10)
            : hasPerm(16),
  );
  const smartSearchView = (
    availableSearchModes.includes("searchAdvanced")
      ? "searchAdvanced"
      : availableSearchModes[0]
  ) as View | undefined;
  const smartReportView = (
    availableReportModes.includes("reportDepartment")
      ? "reportDepartment"
      : availableReportModes[0]
  ) as View | undefined;
  const recordUse = (view: View) => {
    if (!user) return;
    setUsage((prev) => {
      const next = { ...prev, [view]: (prev[view] || 0) + 1 };
      safeStorage.set(`schedule-usage-${user.SystemUserId}`, JSON.stringify(next));
      return next;
    });
  };
  /**
   * A press anywhere that is not the rail closes the rail.
   *
   * The menu is a place to choose from, not a place to be — once attention
   * moves to the work, the first touch on the work should clear the way
   * without asking for a second, aimed click on a close button.
   */
  /* The stylesheet folds the rail off `data-rail`; the state writes it. */
  useEffect(() => {
    document.documentElement.dataset.rail = sidebarOpen ? "open" : "closed";
  }, [sidebarOpen]);
  useEffect(() => {
    if (!sidebarOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".sidebar") || target.closest(".sidebar-launcher") || target.closest(".mobile-topbar")) return;
      setSidebarOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [sidebarOpen]);
  const go = (view: View) => {
    prefetchView(view);
    recordUse(view);
    setActiveView(view);
    setSidebarOpen(false);
    setSearchOpen(false);
    if (window.location.pathname !== pathByView[view])
      window.history.pushState({}, "", pathByView[view]);
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const runScheduleCommand = (action: "new" | "focus" | "presentation") => {
    sessionStorage.setItem("schedule-command", action);
    go("schedules");
  };
  const login = (data: {
    user: SessionUser;
    permissions: number[];
    scopes: any[];
    data?: { mode: string; real: boolean };
  }) => {
    setUser(data.user);
    try { localStorage.setItem("schedule-last-user", String(data.user?.SystemUserId || 0)); } catch { /* private mode */ }
    setPermissions(data.permissions || []);
    setScopes(data.scopes || []);
    setDataMode(data.data || null);
    setActiveView("dashboard");
    window.history.replaceState({}, "", pathByView.dashboard);
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    await forgetCachedReads();
    setUser(null);
    setPermissions([]);
    setScopes([]);
    setActiveView("dashboard");
    window.history.replaceState({}, "", "/");
  };
  const resetDemo = async () => {
    if (!user?.IsDemo) return;
    if (!window.confirm("إعادة البيئة التجريبية إلى حالتها الأصلية؟ ستُحذف تعديلات هذه الجلسة فقط.")) return;
    const response = await fetch("/api/demo/reset", { method: "POST" });
    if (!response.ok) return;
    await forgetCachedReads();
    window.location.assign("/");
  };
  useEffect(() => {
    if (!user) return;
    setUsage(safeStorage.json(`schedule-usage-${user.SystemUserId}`, {}));
    setEntityFavorites(safeStorage.json(`schedule-entity-favorites-${user.SystemUserId}`, []));
    if (!safeStorage.get(`schedule-onboarding-v3-${user.SystemUserId}`)) setOnboardingStep(0);
  }, [user?.SystemUserId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.altKey && e.key === "1") {
        e.preventDefault();
        go("dashboard");
      } else if (e.altKey && e.key === "2" && allowed.schedule) {
        e.preventDefault();
        go("schedules");
      } else if (e.altKey && e.key === "3" && (smartSearchView || smartReportView)) {
        e.preventDefault();
        go((smartSearchView || smartReportView) as View);
      } else if (
        e.altKey &&
        e.key.toLowerCase() === "i" &&
        allowed.schedule &&
        isPowerAdmin
      ) {
        e.preventDefault();
        go("intelligence");
      } else if (e.altKey && e.key.toLowerCase() === "n" && allowed.schedule) {
        e.preventDefault();
        runScheduleCommand("new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user, allowed.schedule, smartSearchView, smartReportView, isPowerAdmin]);
  const connectionGate = (standalone = false) => {
    const copy = health === "offline"
      ? { title: "لا يوجد اتصال بالإنترنت", detail: "تحقق من الاتصال ثم أعد المحاولة." }
      : health === "database-down"
        ? { title: "الخدمة غير متاحة الآن", detail: "حاول مرة أخرى بعد قليل." }
        : { title: "تعذر الوصول إلى البرنامج", detail: "نتحقق من الاتصال بالخادم." };
    return (
      <div className={`connection-gate no-print ${standalone ? "standalone" : ""}`} role="alertdialog" aria-modal="true" aria-live="assertive">
        <div className="connection-gate-card">
          <span className="connection-gate-icon" aria-hidden="true"><WifiOff /></span>
          <div>
            <strong>{copy.title}</strong>
            <span>{copy.detail}</span>
          </div>
          <button
            type="button"
            className="connection-gate-retry"
            onClick={() => {
              setHealth(navigator.onLine ? "reconnecting" : "offline");
              setHealthProbe(value => value + 1);
            }}
          >
            <RefreshCw aria-hidden="true" />
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    if (health !== "online") return connectionGate(true);
    return (
      <div className="app-loading">
        <span />
      </div>
    );
  }
  if (!user) {
    if (health !== "online") return connectionGate(true);
    return <Login onLoginSuccess={login} />;
  }

  const unauthorized = () => (
    <Dashboard
      user={user}
      scopes={scopes}
      canManageSchedule={hasPerm(7)}
      searchView={smartSearchView}
      reportView={smartReportView}
      onNavigate={(view: string) => go(view as View)}
    />
  );
  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return (
          <Dashboard
            user={user}
            scopes={scopes}
            canManageSchedule={hasPerm(7)}
            searchView={smartSearchView}
            reportView={smartReportView}
            onNavigate={(view: string) => go(view as View)}
          />
        );
      case "terms":
      case "colleges":
      case "sections":
      case "instructors":
      case "courses":
        return isPowerAdmin && hasPerm(ACADEMIC_PERM[activeView]) ? (
          <AcademicConsole
            tab={activeView}
            onTab={(next) => go(next)}
            hasPerm={hasPerm}
          />
        ) : (
          unauthorized()
        );
      case "schedules":
        return hasPerm(7) ? (
          <Schedules mode="schedule" user={user} scopes={scopes} permissions={permissions} onNavigate={(view) => go(view as View)} />
        ) : (
          unauthorized()
        );
      case "scheduleCopy":
        return isPowerAdmin && hasPerm(7) && user.IsRootAdmin ? (
          <Schedules mode="copy" user={user} scopes={scopes} permissions={permissions} onNavigate={(view) => go(view as View)} />
        ) : (
          unauthorized()
        );
      case "intelligence":
        return hasPerm(7) ? (
          <IntelligenceWorkspace user={user} scopes={scopes} />
        ) : (
          unauthorized()
        );
      case "searchInstructor":
        return hasPerm(8) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "searchRoom":
        return hasPerm(9) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "searchTime":
        return hasPerm(10) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "searchRoomTime":
        return hasPerm(16) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "searchAdvanced":
        return hasPerm(17) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "reportDepartment":
        return hasPerm(14) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "reportInstructor":
        return hasPerm(8) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "reportRoom":
        return hasPerm(9) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "reportTime":
        return hasPerm(10) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "reportRoomTime":
        return hasPerm(16) ? (
          <Reports
            mode={activeView}
            user={user}
            scopes={scopes}
            availableModes={[...availableSearchModes, ...availableReportModes]}
          />
        ) : (
          unauthorized()
        );
      case "users":
        return isPowerAdmin && hasPerm(11) ? (
          <AdminUsers mode="users" onNavigate={go} permissions={permissions} rootAdmin={Boolean(user.IsRootAdmin)} demoReadOnly={Boolean(user.IsDemo)} />
        ) : (
          unauthorized()
        );
      case "permissions":
        return isPowerAdmin && hasPerm(12) ? (
          <AdminUsers
            mode="permissions"
            onNavigate={go}
            permissions={permissions}
            rootAdmin={Boolean(user.IsRootAdmin)}
            demoReadOnly={Boolean(user.IsDemo)}
          />
        ) : (
          unauthorized()
        );
      case "scopes":
        return isPowerAdmin && hasPerm(15) ? (
          <AdminUsers mode="scopes" onNavigate={go} permissions={permissions} rootAdmin={Boolean(user.IsRootAdmin)} demoReadOnly={Boolean(user.IsDemo)} />
        ) : (
          unauthorized()
        );
      case "audit":
        return isPowerAdmin && allowed.admin ? (
          <AdminUsers mode="audit" onNavigate={go} permissions={permissions} rootAdmin={Boolean(user.IsRootAdmin)} demoReadOnly={Boolean(user.IsDemo)} />
        ) : (
          unauthorized()
        );
      case "backup":
        return user.IsRootAdmin ? (
          <AdminUsers mode="backup" onNavigate={go} permissions={permissions} rootAdmin demoReadOnly={Boolean(user.IsDemo)} />
        ) : (
          unauthorized()
        );
      case "about":
        return isPowerAdmin ? <About /> : unauthorized();
      default:
        return unauthorized();
    }
  };

  const hitIcon = (kind: SearchHit["kind"]) =>
    kind === "instructor" ? (
      <UsersRound />
    ) : kind === "course" ? (
      <BookOpen />
    ) : kind === "room" ? (
      <Building2 />
    ) : (
      <CalendarDays />
    );
  const rememberEntity = (hit: SearchHit) => {
    if (!user) return;
    const key = `${hit.kind}:${hit.id}:${hit.building || ""}:${hit.hall || ""}`;
    setEntityFavorites((prev) => {
      const map = new Map<string, FavoriteEntity>(
        prev.map((x) => [x.key, { ...x }] as const),
      );
      const current: FavoriteEntity = map.get(key) || { key, count: 0, hit };
      current.count += 1;
      current.hit = hit;
      map.set(key, current);
      const next: FavoriteEntity[] = [...map.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      safeStorage.set(`schedule-entity-favorites-${user.SystemUserId}`, JSON.stringify(next));
      return next;
    });
  };
  const openHit = (hit: SearchHit) => {
    rememberEntity(hit);
    if (hit.kind === "schedule" && hasPerm(7)) {
      sessionStorage.setItem("schedule-open-context-id", String(hit.id));
      go("schedules");
      return;
    }
    if (hit.kind === "instructor" && hasPerm(8)) {
      sessionStorage.setItem(
        "schedule-report-prefill",
        JSON.stringify({
          mode: "searchInstructor",
          instructorId: Number(hit.id),
        }),
      );
      go("searchInstructor");
      return;
    }
    if (hit.kind === "room" && hasPerm(9)) {
      sessionStorage.setItem(
        "schedule-report-prefill",
        JSON.stringify({
          mode: "searchRoom",
          building: hit.building || "",
          hall: hit.hall || "",
        }),
      );
      go("searchRoom");
      return;
    }
    if (hit.kind === "course" && hasPerm(17)) {
      sessionStorage.setItem(
        "schedule-report-prefill",
        JSON.stringify({ mode: "searchAdvanced", courseId: Number(hit.id) }),
      );
      go("searchAdvanced");
      return;
    }
    if (hasPerm(7)) go("schedules");
    else if (hasPerm(17)) go("searchAdvanced");
  };

  // The academic console opens on the first catalogue this account can reach,
  // so a coordinator without "terms" still lands somewhere useful.
  const academicEntry = academicViews.find((view) => hasPerm(ACADEMIC_PERM[view]));
  const viewLabels: Partial<Record<View, string>> = {
    dashboard: "لوحة العمل",
    schedules: "إدارة الجدول",
    intelligence: "مركز الذكاء",
    reportDepartment: "الاستعلامات والتقارير",
    searchAdvanced: "البحث المتقدم",
    instructors: "أساتذة المقررات",
    courses: "المقررات الدراسية",
  };
  const favoriteViews = (Object.entries(usage) as [View, number][])
    .filter(
      ([v]) =>
        viewLabels[v] &&
        ((v !== "intelligence" && v !== "schedules") || allowed.schedule),
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const commandHour = (() => {
    const m = query.match(/(?:الساعة|ساعه|وقت)\s*(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    const h = Math.min(23, Number(m[1])),
      mm = Math.min(59, Number(m[2] || 0));
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  })();
  const looksNaturalCommand =
    /(فراغ|مشكلة|تعارض|مزدحم|افضل|أفضل|وين|ليش|لماذا|اذا|إذا|اقترح|حلل|حلّل|قاعة|نقل)/.test(
      query.trim(),
    );
  const runNaturalCommand = async () => {
    const q = query.trim();
    if (q.length < 2 || !allowed.schedule) return;
    setCommandThinking(true);
    setCommandInsight(null);
    try {
      const o = await fetch("/api/intelligence/overview");
      const od = await o.json();
      if (!o.ok) throw new Error(od.error || "تعذر قراءة نطاق الجدول");
      const r = await fetch("/api/intelligence/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId: od.context?.collegeId,
          sectionId: od.context?.sectionId,
          termId: od.context?.termId,
          prompt: q,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "تعذر تحليل الأمر");
      setCommandInsight(d);
    } catch (e: any) {
      setCommandInsight({
        title: "تعذر تنفيذ الأمر",
        summary: e?.message || "حاول مرة أخرى",
        bullets: [],
      });
    } finally {
      setCommandThinking(false);
    }
  };
  const openCommandScene = () => {
    const q = query.trim();
    if (
      commandHour &&
      /(قاعة|قاعه)/.test(q) &&
      availableSearchModes.includes("searchRoomTime")
    ) {
      const [hh, mm] = commandHour.split(":").map(Number);
      sessionStorage.setItem(
        "schedule-report-prefill",
        JSON.stringify({
          mode: "searchRoomTime",
          startTime: commandHour,
          endTime: `${String(Math.min(23, hh + 1)).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
        }),
      );
      go("searchRoomTime");
      return;
    }
    if (isPowerAdmin && /(مشكلة|تعارض|مزدحم|ليش|لماذا|حلل|حلّل)/.test(q)) {
      sessionStorage.setItem("schedule-intelligence-tab", "command");
      go("intelligence");
      return;
    }
    go("schedules");
  };
  const commandSceneLabel =
    commandHour && /(قاعة|قاعه)/.test(query)
      ? "افتح استعلام القاعات"
      : isPowerAdmin && /(مشكلة|تعارض|مزدحم|ليش|لماذا|حلل|حلّل)/.test(query)
        ? "افتح مشهد القرار"
        : "افتح الجدول على هذا السياق";
  const commandActions = [
    ...(looksNaturalCommand && allowed.schedule
      ? [
          {
            label: "نفّذ العبارة كأمر ذكي",
            hint: "يفهم السؤال من بيانات قسمك الحالية بدون تغيير أي موعد",
            keywords: `ذكاء طبيعي سؤال أمر ${query}`,
            icon: <WandSparkles />,
            run: runNaturalCommand,
            show: true,
          },
        ]
      : []),
    ...(commandHour &&
    /(قاعة|قاعه)/.test(query) &&
    availableSearchModes.includes("searchRoomTime")
      ? [
          {
            label: `ابحث عن القاعات حول ${commandHour}`,
            hint: "يفتح استعلام القاعة والوقت مع تعبئة الوقت تلقائياً",
            keywords: "افضل أفضل قاعة وقت",
            icon: <Building2 />,
            run: () => {
              const [hh, mm] = commandHour.split(":").map(Number);
              const endH = Math.min(23, hh + 1);
              sessionStorage.setItem(
                "schedule-report-prefill",
                JSON.stringify({
                  mode: "searchRoomTime",
                  startTime: commandHour,
                  endTime: `${String(endH).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
                }),
              );
              go("searchRoomTime");
            },
            show: true,
          },
        ]
      : []),
    ...(query.trim().includes("مسودة") && isPowerAdmin
      ? [
          {
            label: "افتح آخر المسودات",
            hint: "سجل النسخ · المسودات · النشر",
            keywords: "مسودة draft",
            icon: <FileSearch />,
            run: () => {
              sessionStorage.setItem("schedule-intelligence-tab", "history");
              go("intelligence");
            },
            show: true,
          },
        ]
      : []),
    ...(query.trim().includes("قارن") && isPowerAdmin
      ? [
          {
            label: "مقارنة الفصول",
            hint: "قارن فصلين قبل اتخاذ القرار",
            keywords: "قارن مقارنة فصلين",
            icon: <FileText />,
            run: () => {
              sessionStorage.setItem("schedule-intelligence-tab", "command");
              go("intelligence");
            },
            show: true,
          },
        ]
      : []),
    ...(query.trim().includes("تعارض")
      ? [
          {
            label: "راجع موانع الحفظ الآن",
            hint: isPowerAdmin
              ? "افتح مركز الذكاء"
              : "افتح الجدول وفحص الموانع",
            keywords: "تعارض تعارضات",
            icon: <ShieldCheck />,
            run: () => {
              if (isPowerAdmin) {
                sessionStorage.setItem("schedule-intelligence-tab", "command");
                go("intelligence");
              } else go("schedules");
            },
            show: allowed.schedule,
          },
        ]
      : []),
    {
      label: "افتح مركز الذكاء",
      hint: "نسخة تجريبية · مساعد ذكي · جودة الجدول",
      keywords: "ذكاء مساعد twin محاكاة جودة",
      icon: <WandSparkles />,
      run: () => go("intelligence"),
      show: allowed.schedule && isPowerAdmin,
    },
    {
      label: "الاستعلامات والتقارير",
      hint: "ابحث ثم اطبع أو صدّر من نفس الشاشة",
      keywords: "بحث استعلام تقرير تقارير طباعة",
      icon: <FileSearch />,
      run: () => (smartSearchView || smartReportView) && go((smartSearchView || smartReportView) as View),
      show: Boolean(smartSearchView || smartReportView),
    },
    {
      label: "أضف موعداً دراسياً",
      hint: "يفتح نموذج الإضافة الحالي",
      keywords: "اضف أضف موعد شعبة مقرر",
      icon: <CalendarDays />,
      run: () => runScheduleCommand("new"),
      show: allowed.schedule,
    },
    {
      label: "وضع التركيز",
      hint: "مساحة واسعة لبناء الجدول",
      keywords: "تركيز focus",
      icon: <Sparkles />,
      run: () => runScheduleCommand("focus"),
      show: allowed.schedule,
    },
    {
      label: "وضع العرض",
      hint: "للجنة أو شاشة الاجتماع",
      keywords: "عرض presentation اجتماع",
      icon: <FileText />,
      run: () => runScheduleCommand("presentation"),
      show: allowed.schedule,
    },
  ].filter(
    (x) =>
      x.show &&
      (!query.trim() ||
        `${x.label} ${x.keywords}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  const finishOnboarding = () => {
    if (user) safeStorage.set(`schedule-onboarding-v3-${user.SystemUserId}`, "done");
    setOnboardingStep(-1);
  };
  const noKeyboard = typeof window !== "undefined"
    && (window.matchMedia?.("(pointer: coarse)").matches ?? false)
    && !(window.matchMedia?.("(any-hover: hover)").matches ?? false);
  const onboardingSteps = isPowerAdmin
    ? [
        /* The first card of the tour taught a keyboard shortcut. On a phone
           there is no keyboard to press it with, so the very first thing a new
           reader was told was the one thing they could not do. Same idea, named
           by the door that actually exists on their device. */
        noKeyboard
          ? {
              icon: <Search />,
              eyebrow: "أسرع وصول",
              title: "كل البرنامج في بحث واحد",
              copy: "دكتور · مقرر · قاعة · أمر طبيعي",
            }
          : {
              icon: <Command />,
              eyebrow: "أسرع وصول",
              title: "كل البرنامج تحت ⌘K",
              copy: "دكتور · مقرر · قاعة · أمر طبيعي",
            },
        {
          icon: <WandSparkles />,
          eyebrow: "مختبر القرار",
          title: "جرّب قبل ما تغيّر",
          copy: "كل تغيير يبقى مسودة حتى تعتمده.",
        },
        {
          icon: <ShieldCheck />,
          eyebrow: "عزل الصلاحيات",
          title: "مسؤول القسم يرى ما يحتاجه فقط",
          copy: "لك كل الشاشات؛ المنسّق يرى قسمه فقط.",
        },
        {
          icon: <WifiOff />,
          eyebrow: "حماية إضافية",
          title: "إذا انقطع الإنترنت، الحفظ يتوقف",
          copy: "يتوقف البرنامج مؤقتاً لحماية العمل، ويعود تلقائياً عندما يرجع الاتصال.",
        },
      ]
    : [
        {
          icon: <CalendarDays />,
          eyebrow: "مساحة عمل محدودة",
          title: "كل ما تحتاجه للجدول في أربع وجهات",
          copy: "لوحة · جدول · تقارير.",
        },
        {
          icon: <Command />,
          eyebrow: "أسرع وصول",
          title: "اسأل البرنامج مباشرة",
          copy: "مثال: «فراغات د. أحمد الثلاثاء»",
        },
        {
          icon: <ShieldCheck />,
          eyebrow: "خصوصية القسم",
          title: "قسمك فقط… مع حماية الحجز بالكامل",
          copy: "حجوزات الأقسام الأخرى محسوبة دون كشف تفاصيلها.",
        },
        {
          icon: <WifiOff />,
          eyebrow: "حماية الحفظ",
          title: "لا كتابة أثناء انقطاع الاتصال",
          copy: "يتوقف البرنامج مؤقتاً عند انقطاع الاتصال، ويعود تلقائياً عندما يرجع الإنترنت.",
        },
      ];
  const guideProfile = user ? loadGuideProfile(Number(user.SystemUserId)) : null;
  const guideIntroduced = Boolean(guideProfile?.launcherIntroduced);
  const guideAllowedFeatures = user ? allAllowedGuideFeatures(permissions, Boolean(user.IsRootAdmin), Boolean(user.IsAdminUser || user.IsRootAdmin)) : [];
  const guideUnread = user && guideProfile ? guideUnreadSummary(guideProfile, guideAllowedFeatures, activeView) : { product:[], runtime:[], total:0 };
  const guideNewCount = guideUnread.total;
  const ambientPrediction = user && guideProfile && guideProfile.hintMode !== "off" ? predictedNextFeature(guideProfile, guideContext?.currentFeatureId || `page.${activeView}`) : null;
  const ambientThreshold = guideProfile?.hintMode === "quiet" ? .92 : .86;
  const ambientFeature = ambientPrediction?.confidence >= ambientThreshold ? featureById(ambientPrediction.id) : null;
  const ambientAllowed = Boolean(guideProfile?.hintMode !== "off" && ambientFeature && user && canAccessGuideFeature(ambientFeature, { permissions, root:Boolean(user.IsRootAdmin), admin:Boolean(user.IsAdminUser || user.IsRootAdmin) }));
  const ambientKey = ambientFeature ? `${activeView}:${guideContext?.currentFeatureId || ""}:${ambientFeature.id}` : "";
  void guideProfileRevision;
  const taskFamily =
    activeView === "dashboard"
      ? "home"
      : activeView === "schedules" ||
          activeView === "scheduleCopy" ||
          activeView === "intelligence"
        ? "schedule"
        : searchViews.includes(activeView as ReportMode)
          ? "search"
          : reportViews.includes(activeView as ReportMode)
            ? "reports"
            : adminViews.includes(activeView as AdminMode)
              ? "admin"
              : (
                    [
                      "terms",
                      "colleges",
                      "sections",
                      "instructors",
                      "courses",
                    ] as View[]
                  ).includes(activeView)
                ? "catalog"
                : "other";
  const contextRail = taskFamily !== "home" && taskFamily !== "other";
  const mobileMoreHoldsActive =
    activeView !== "dashboard" &&
    activeView !== "schedules" &&
    !searchViews.includes(activeView as ReportMode) &&
    !reportViews.includes(activeView as ReportMode) &&
    !(isPowerAdmin && allowed.schedule && activeView === "intelligence");

  return (
    <div
      className={`app-shell ${contextRail ? "context-rail-active" : ""} task-${taskFamily} role-${isPowerAdmin ? "admin" : "scheduler"}`}
      dir="rtl"
      data-role={isPowerAdmin ? "admin" : "scheduler"}
      data-demo={user.IsDemo ? "true" : "false"}
    >
      <header className={`mobile-topbar no-print ${online ? "" : "offline"}`}>
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="فتح القائمة"
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
        >
          <Menu />
        </button>
        <button
          type="button"
          className="mobile-brand"
          onClick={() => go("dashboard")}
          aria-label="العودة إلى لوحة العمل"
          aria-current={activeView === "dashboard" ? "page" : undefined}
        >
          SCHEDULE
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="فتح البحث الشامل"
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
        >
          <Search />
        </button>
      </header>
      {!sidebarOpen ? (
        <button
          className="sidebar-launcher no-print"
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="فتح القائمة"
          aria-controls="app-sidebar"
          aria-expanded={false}
          title="فتح القائمة"
        >
          <Menu />
        </button>
      ) : null}
      <aside
        id="app-sidebar"
        className={`sidebar no-print ${sidebarOpen ? "open" : ""} ${contextRail ? "context-rail" : ""}`}
        aria-label="التنقل والحساب"
      >
        <div className="sidebar-brand">
          <button
            onClick={() => go("dashboard")}
            aria-label="العودة إلى لوحة العمل"
          >
            <span className="brand-mark">
              <CalendarDays />
            </span>
            <span>
              <strong>SCHEDULE</strong>
              <small>التحكم الأكاديمي</small>
            </span>
          </button>
          <button
            className="sidebar-close"
            type="button"
            aria-label="إغلاق القائمة"
            aria-controls="app-sidebar"
            aria-expanded={sidebarOpen}
            title="إغلاق القائمة"
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </button>
        </div>
        {user.IsDemo ? (
          <div className="demo-rail-chip" role="status" aria-label="بيئة Demo معزولة">
            <FlaskConical aria-hidden="true" /><span>DEMO</span><i aria-hidden="true" />
            <button type="button" onClick={resetDemo} title="إعادة البيئة التجريبية" aria-label="إعادة البيئة التجريبية" data-guide-ignore="إجراء خاص ببيئة Demo يعيد البيانات المصطنعة فقط ولا يمثل ميزة تشغيلية في النظام الحقيقي"><RefreshCw /></button>
          </div>
        ) : null}
        <button
          className="command-search"
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={searchOpen}
          aria-label="بحث شامل"
          title="بحث شامل"
        >
          <Search />
          <span>بحث شامل...</span>
          <kbd>
            <Command /> K
          </kbd>
        </button>
        <nav className="side-nav" aria-label="القائمة الرئيسية">
          {/* الوجهات الأساسية تظهر مباشرة دائمًا بلا عنوان وسيط أو سهم/قائمة داخلية. */}
          <div className="nav-section nav-section-core" data-rail="core" aria-label="التنقل الأساسي">
            {allowed.schedule ? (
              <NavButton
                activeView={activeView}
                onGo={go}
                view="schedules"
                icon={<CalendarDays />}
                label="الجدول الدراسي"
              />
            ) : null}
            {smartSearchView || smartReportView ? (
              <NavButton
                activeView={activeView}
                onGo={go}
                view={(smartSearchView || smartReportView) as View}
                active={searchViews.includes(activeView as ReportMode) || reportViews.includes(activeView as ReportMode)}
                icon={<FileSearch />}
                label="الاستعلامات والتقارير"
              />
            ) : null}
            {allowed.schedule ? (
              <NavButton
                activeView={activeView}
                onGo={go}
                view="intelligence"
                icon={<WandSparkles />}
                label="مركز الذكاء"
              />
            ) : null}
          </div>
          {isPowerAdmin && academicEntry ? (
            <NavSection
            navGroups={navGroups}
            onToggle={(id, open) =>
              // Each group opens and closes on its own; the default already
              // keeps the rail tidy (core open, the rest folded), so a manual
              // press should touch only the group it was aimed at.
              setNavGroups(current => ({ ...current, [id]: !open }))
            }
              id="catalog"
              title="المرجع والإدارة"
              rail="catalog"
              className="admin-only-nav"
              holdsActive={
                academicViews.includes(activeView as AcademicTab) ||
                adminViews.includes(activeView as AdminMode) ||
                activeView === "scheduleCopy" ||
                activeView === "about"
              }
            >
              <NavButton
                activeView={activeView}
                onGo={go}
                view={academicEntry}
                active={academicViews.includes(activeView as AcademicTab)}
                icon={<Library />}
                label="البيانات الأكاديمية"
              />
              {allowed.admin ? (
                <NavButton
                  activeView={activeView}
                  onGo={go}
                  view="users"
                  active={adminViews.includes(activeView as AdminMode)}
                  icon={<SlidersHorizontal />}
                  label="إدارة النظام"
                />
              ) : null}
              {allowed.schedule && user.IsRootAdmin ? (
                <NavButton
                  activeView={activeView}
                  onGo={go}
                  view="scheduleCopy"
                  icon={<CopyPlus />}
                  label="نسخ فصل"
                />
              ) : null}
            </NavSection>
          ) : isPowerAdmin && allowed.admin ? (
            <NavSection
            navGroups={navGroups}
            onToggle={(id, open) =>
              // Each group opens and closes on its own; the default already
              // keeps the rail tidy (core open, the rest folded), so a manual
              // press should touch only the group it was aimed at.
              setNavGroups(current => ({ ...current, [id]: !open }))
            }
              id="admin"
              title="إدارة النظام"
              rail="admin"
              className="admin-only-nav"
              holdsActive={
                adminViews.includes(activeView as AdminMode) ||
                activeView === "scheduleCopy" ||
                activeView === "about"
              }
            >
              <NavButton
                activeView={activeView}
                onGo={go}
                view="users"
                active={adminViews.includes(activeView as AdminMode)}
                icon={<SlidersHorizontal />}
                label="إدارة النظام"
              />
              {allowed.schedule && user.IsRootAdmin ? (
                <NavButton
                  activeView={activeView}
                  onGo={go}
                  view="scheduleCopy"
                  icon={<CopyPlus />}
                  label="نسخ فصل"
                />
              ) : null}
            </NavSection>
          ) : null}
        </nav>
        {/* One card carries who you are, whether saving is safe, the theme and
            the way out — three sentences of chrome reduced to a dot and two
            glyphs, which also keeps the rail inside a 720px-tall laptop. */}
        {journeyOpen ? (
          <Suspense fallback={null}>
            <ScheduleJourney onClose={() => setJourneyOpen(false)} />
          </Suspense>
        ) : null}
        <div className="sidebar-footer">
          {/* The system's own identity, and the quietest possible door into its
              memory. Not a button — a line that answers when it is pressed. */}
          <button type="button" className="rail-identity" onClick={() => setJourneyOpen(true)} title="رحلة SCHEDULE — ما صنعه النظام عبر السنوات" data-guide-ignore="مدخل تعريفي تسويقي إلى رحلة SCHEDULE ولا ينفذ إجراءً على بيانات الجدول">
            <span className="rail-identity-name">SCHEDULE</span>
            <span className="rail-identity-line">أكثر من عقد من العمل الأكاديمي</span>
            <span className="rail-identity-go" aria-hidden="true"><ChevronLeft /></span>
          </button>
          <div className="user-card">
            <div
              className={`user-avatar health-${health}`}
              title={healthLabel}
            >
              {user.Name.trim().charAt(0) || "م"}
              <i aria-hidden="true" />
            </div>
            <div className="user-card-identity">
              <strong>{user.Name}</strong>
              {isPowerAdmin || !/^\s*قسم(?:\s|$)/.test(user.Name || "") ? (
                <small className="user-card-section">
                  {isPowerAdmin ? "إدارة كاملة" : (scopes[0]?.AdSectionName || "القسم العلمي")}
                </small>
              ) : null}
            </div>
            <span className="sr-only" role="status">{healthLabel}</span>
            <div className="user-card-tools">
              <button
                type="button"
                aria-label={
                  theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"
                }
                title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
                onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun /> : <Moon />}
              </button>
              <button
                type="button"
                onClick={logout}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
              >
                <LogOut />
              </button>
            </div>
          </div>
        </div>
      </aside>
      {sidebarOpen ? (
        <button
          type="button"
          className="sidebar-backdrop no-print"
          onClick={() => setSidebarOpen(false)}
          aria-label="إغلاق القائمة"
        />
      ) : null}
      {health !== "online" ? connectionGate() : null}
      {/* The last minute, said out loud. Any key, tap or scroll dismisses it —
          the same activity that keeps the session alive — so the button is a
          courtesy for a reader who has stopped touching anything, not a toll. */}
      {idleWarning ? (
        <div className="idle-warning no-print" role="alertdialog" aria-live="assertive" aria-label="الجلسة على وشك الانتهاء">
          <span className="idle-warning-ring" aria-hidden="true" />
          <div>
            <strong>الجلسة تنتهي خلال دقيقة</strong>
            <span>{user.IsDemo ? "تنتهي جلسة Demo بعد 60 دقيقة من عدم النشاط. أي ضغطة تكفي لمتابعة التجربة." : "لحمايتك، يُغلق الحساب بعد 15 دقيقة بلا حركة. أي ضغطة تكفي لمتابعة العمل."}</span>
          </div>
          <PrimaryButton type="button" onClick={() => setIdleWarning(false)}>
            أكمل العمل
          </PrimaryButton>
        </div>
      ) : null}
      <main className="app-main">
        <div className="content-frame">
          <Suspense fallback={<div className="view-loading" aria-busy="true"><span /></div>}>{renderView()}</Suspense>
        </div>
      </main>

      <nav className="mobile-bottom-dock no-print" aria-label="التنقل السريع">
        <MobileDockLink activeView={activeView} onGo={go} view="dashboard" icon={<House />} label="الرئيسية" />
        {allowed.schedule ? (
          <MobileDockLink
            activeView={activeView}
            onGo={go}
            view="schedules"
            icon={<CalendarDays />}
            label="الجدول"
          />
        ) : null}
        {smartSearchView || smartReportView ? (
          <MobileDockLink
            activeView={activeView}
            onGo={go}
            view={(smartSearchView || smartReportView) as View}
            icon={<FileSearch />}
            label="الاستعلامات"
            active={
              searchViews.includes(activeView as ReportMode) ||
              reportViews.includes(activeView as ReportMode)
            }
          />
        ) : null}
        {isPowerAdmin && allowed.schedule ? (
          <MobileDockLink
            activeView={activeView}
            onGo={go}
            view="intelligence"
            icon={<WandSparkles />}
            label="الذكاء"
          />
        ) : null}
        <button
          type="button"
          className={`mobile-dock-link mobile-dock-more ${
            mobileMoreHoldsActive ? "context-active" : ""
          } ${sidebarOpen ? "active" : ""}`}
          aria-label={
            mobileMoreHoldsActive
              ? "المزيد، الوجهة الحالية داخل القائمة"
              : "فتح المزيد"
          }
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(true)}
        >
          <span className="mobile-dock-icon" aria-hidden="true">
            <Menu />
          </span>
          <span className="mobile-dock-label">المزيد</span>
        </button>
      </nav>

      {ambientAllowed && ambientFeature && ambientKey !== ambientDismissedKey && !guideOpen && !guideHint ? (
        <button type="button" className="smart-guide-ambient-next no-print" onClick={() => {
          setAmbientDismissedKey(ambientKey);
          const command = ambientFeature.safeAction;
          if (command?.scope === "app" && command.type === "navigate" && command.value) go(command.value as View);
          else if (command) window.dispatchEvent(new CustomEvent("schedule-smart-guide-command", { detail:{ ...command, featureId:ambientFeature.id } }));
          else if (ambientFeature.view) go(ambientFeature.view as View);
          else setGuideOpen(true);
        }} aria-label={`الخطوة التالية المقترحة: ${ambientFeature.title}`}>
          <Sparkles aria-hidden="true" /><span>{ambientFeature.title}</span><ChevronLeft aria-hidden="true" />
        </button>
      ) : null}
      {guideOpen ? (
        <SmartGuide
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          activeView={activeView}
          user={user}
          permissions={permissions}
          root={Boolean(user.IsRootAdmin)}
          hint={guideHint}
          onDismissHint={() => setGuideHint(null)}
          context={guideContext}
          onNavigate={(view) => go(view as View)}
        />
      ) : null}
      <button
        type="button"
        data-guide-ignore="زر المرشد نفسه لا يحتاج تعريفًا داخل المرشد"
        className={`smart-guide-fab no-print ${guideIntroduced ? "icon-only" : ""} ${guideHint ? "has-hint" : ""} ${guideOpen ? "active" : ""}`}
        onClick={() => {
          if (guideOpen) {
            window.dispatchEvent(new CustomEvent("schedule-smart-guide-restore"));
            return;
          }
          if (!guideIntroduced && user) setLauncherIntroduced(Number(user.SystemUserId), true);
          setGuideOpen(true);
        }}
        aria-label={guideHint ? `${guideHint.title} — افتح المرشد` : guideNewCount ? `افتح مرشد SCHEDULE — لديك ${guideNewCount} عناصر جديدة: ${guideUnread.product.length} تحديثات للميزات و${guideUnread.runtime.length} عناصر جديدة في هذه الشاشة` : "افتح مرشد SCHEDULE"}
        title={guideHint ? `${guideHint.title}` : guideNewCount ? `${guideNewCount} جديد — اضغط لمعرفة ما هو` : "مرشد SCHEDULE"}
      >
        <span className="smart-guide-fab-mark" aria-hidden="true"><Sparkles /></span>
        {!guideIntroduced ? (
          <span className="smart-guide-fab-copy">
            <small>{guideHint ? "مساعدة مقترحة" : guideNewCount ? `${guideNewCount.toLocaleString("ar-KW-u-nu-latn")} جديد` : "مرشد حي"}</small>
            <strong>كيف؟</strong>
          </span>
        ) : null}
        {guideHint ? <i className="smart-guide-fab-pulse" aria-hidden="true" /> : !guideOpen && guideNewCount ? <i className="smart-guide-fab-new" aria-hidden="true">{`${guideNewCount.toLocaleString("ar-KW-u-nu-latn")} جديد`}</i> : null}
      </button>

      {searchOpen ? (
        <div
          className="spotlight-backdrop no-print"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
        >
          <section
            className="spotlight"
            role="dialog"
            aria-modal="true"
            aria-label="البحث الشامل"
          >
            <div className="spotlight-input">
              <Search />
              <input
                ref={searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث في كل شيء…"
              />
              <button
                type="button"
                aria-label="إغلاق البحث"
                title="إغلاق البحث"
                onClick={() => setSearchOpen(false)}
              >
                <X />
              </button>
            </div>
            <div className="spotlight-body">
              {naturalAnswer ? (
                <section className="answer-card" aria-label="إجابة مباشرة">
                  <header>
                    <Sparkles aria-hidden="true" />
                    <strong>{naturalAnswer.title}</strong>
                    <b>{Number(naturalAnswer.count || 0).toLocaleString("ar-KW-u-nu-latn")}</b>
                  </header>
                  {naturalAnswer.rooms?.length ? (
                    <div className="answer-rooms">
                      {naturalAnswer.rooms.slice(0, 24).map((room: any) => (
                        <span key={`${room.room}-${room.hall}`}>{room.room}<small>{room.hall}</small></span>
                      ))}
                    </div>
                  ) : null}
                  {naturalAnswer.gaps?.length ? (
                    <div className="answer-gaps">
                      {naturalAnswer.gaps.slice(0, 12).map((gap: any, index: number) => (
                        <div key={index}>
                          <span>{gap.day}</span>
                          <time dir="ltr">{formatScheduleTimeRange(gap.from, gap.to)}</time>
                          <b>{gap.minutes}د</b>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {naturalAnswer.rows?.length ? (
                    <div className="answer-rows">
                      {naturalAnswer.rows.slice(0, 12).map((row: any) => (
                        <div key={row.id}>
                          <span className="code-chip">{row.code || "—"}</span>
                          <strong>{row.name}</strong>
                          <time dir="ltr">{formatScheduleTimeRange(row.start, row.end)}</time>
                          <small>{row.room}/{row.hall}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
              {commandThinking ? (
                <div className="command-intelligence-card thinking">
                  <WandSparkles />
                  <div>
                    <strong>أقرأ الجدول وأفهم سؤالك…</strong>
                    <span>ضمن نطاقك فقط</span>
                  </div>
                </div>
              ) : commandInsight ? (
                <div className="command-intelligence-card">
                  <WandSparkles />
                  <div>
                    <small>ذكاء الأوامر</small>
                    <strong>{commandInsight.title}</strong>
                    <p>{commandInsight.summary}</p>
                    {commandInsight.bullets?.length ? (
                      <div>
                        {commandInsight.bullets
                          .slice(0, 5)
                          .map((x: string, i: number) => (
                            <span key={i}>{x}</span>
                          ))}
                      </div>
                    ) : null}
                    <button
                      className="command-scene-jump"
                      type="button"
                      onClick={openCommandScene}
                    >
                      {commandSceneLabel}
                      <ChevronLeft />
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-label="إغلاق نتيجة التحليل"
                    title="إغلاق نتيجة التحليل"
                    onClick={() => setCommandInsight(null)}
                  >
                    <X />
                  </button>
                </div>
              ) : null}
              {commandActions.length ? (
                <div className="command-actions">
                  <span className="command-group-title">أوامر</span>
                  {commandActions.map((a, index) => (
                    <button key={index} onClick={a.run}>
                      <span className="result-icon">{a.icon}</span>
                      <span className="result-copy">
                        <strong>{a.label}</strong>
                        <small>{a.hint}</small>
                      </span>
                      <ChevronLeft />
                    </button>
                  ))}
                </div>
              ) : null}
              {query.trim().length < 2 ? (
                <div className="spotlight-home">
                  {favoriteViews.length || entityFavorites.length ? (
                    <>
                      <span className="command-group-title">
                        الأكثر استخداماً عندك
                      </span>
                      <div className="favorite-grid">
                        {entityFavorites.slice(0, 4).map((x) => (
                          <button key={x.key} onClick={() => openHit(x.hit)}>
                            {hitIcon(x.hit.kind)}
                            <span>{x.hit.title}</span>
                            <small>{x.hit.meta}</small>
                          </button>
                        ))}
                        {favoriteViews.slice(0, 4).map(([v]) => (
                          <button key={v} onClick={() => go(v)}>
                            <Sparkles />
                            <span>{viewLabels[v]}</span>
                            <small>مساحة عمل</small>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}
                  <div className="spotlight-empty">
                    <Command />
                    <strong>اكتب أي شيء… أو نفّذ أمراً</strong>
                    <span>
                      اسم دكتور، مقرر، قاعة، أو أوامر مثل «أضف موعد» و«وضع
                      التركيز».
                    </span>
                    <div className="shortcut-strip">
                      <kbd>Alt 1</kbd>
                      <i>الرئيسية</i>
                      <kbd>Alt 2</kbd>
                      <i>الجدول</i>
                      <kbd>Alt 3</kbd>
                      <i>الاستعلامات والتقارير</i>
                      <kbd>Alt N</kbd>
                      <i>إضافة</i>
                    </div>
                  </div>
                </div>
              ) : searching ? (
                <div className="spotlight-loading">
                  <span />
                  جاري البحث...
                </div>
              ) : searchResults.length ? (
                <div className="spotlight-results">
                  {searchResults.map((hit, index) => (
                    <button
                      key={`${hit.kind}-${hit.id}-${index}`}
                      onClick={() => openHit(hit)}
                    >
                      <span className="result-icon">{hitIcon(hit.kind)}</span>
                      <span className="result-copy">
                        <strong>{hit.title}</strong>
                        <small>{hit.subtitle}</small>
                      </span>
                      <span className="result-meta">{hit.meta}</span>
                      <ChevronLeft />
                    </button>
                  ))}
                </div>
              ) : !commandActions.length ? (
                <div className="spotlight-empty">
                  <Search />
                  <strong>لا توجد نتائج</strong>
                  <span>
                    اسم · رقم مدني · رمز · قاعة
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {onboardingStep >= 0 ? (
        <div className="onboarding-backdrop no-print">
          {/* The first thing a new user meets should announce itself to a
              screen reader and answer Escape like every other dialog here. */}
          <section
            className="onboarding-card"
            role="dialog"
            aria-modal="true"
            aria-label="جولة تعريفية"
          >
            {onboardingSteps.map((step, index) =>
              index === onboardingStep ? (
                <React.Fragment key={index}>
                  <div className="onboarding-icon">{step.icon}</div>
                  <span className="page-eyebrow">{step.eyebrow}</span>
                  <h2>{step.title}</h2>
                  <p>{step.copy}</p>
                  <div className="onboarding-progress">
                    {onboardingSteps.map((_, i) => (
                      <i
                        key={i}
                        className={i === onboardingStep ? "active" : ""}
                      />
                    ))}
                  </div>
                  <div className="onboarding-actions">
                    <button onClick={finishOnboarding}>تخطي</button>
                    <PrimaryButton
                      onClick={() =>
                        onboardingStep === onboardingSteps.length - 1
                          ? finishOnboarding()
                          : setOnboardingStep(onboardingStep + 1)
                      }
                    >
                      {onboardingStep === onboardingSteps.length - 1
                        ? "ابدأ"
                        : "التالي"}
                      <ChevronLeft />
                    </PrimaryButton>
                  </div>
                </React.Fragment>
              ) : null,
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
