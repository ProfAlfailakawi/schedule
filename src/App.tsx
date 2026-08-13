import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChevronLeft,
  Command,
  CopyPlus,
  FileSearch,
  FileText,
  House,
  Info,
  Library,
  LogOut,
  Menu,
  Moon,
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

import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import type { ReportMode } from "./components/Reports";
import type { AdminMode } from "./components/AdminUsers";
import type { AcademicTab } from "./components/AcademicConsole";
import { safeStorage } from "./utils/safeStorage";

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
const AcademicConsole = safeLazy(() => import("./components/AcademicConsole"));
const Schedules = safeLazy(() => import("./components/Schedules"));
const Reports = safeLazy(() => import("./components/Reports"));
const AdminUsers = safeLazy(() => import("./components/AdminUsers"));
const About = safeLazy(() => import("./components/About"));
const IntelligenceWorkspace = safeLazy(() => import("./components/IntelligenceWorkspace"));
import { PrimaryButton } from "./components/ui";

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
const adminViews: AdminMode[] = ["users", "permissions", "scopes", "audit"];
const academicViews: AcademicTab[] = ["terms", "colleges", "sections", "instructors", "courses"];
/** Permission id that unlocks each academic catalogue. */
const ACADEMIC_PERM: Record<AcademicTab, number> = {
  terms: 5,
  colleges: 2,
  sections: 4,
  instructors: 3,
  courses: 6,
};

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
  about: "/Public/Aboutus",
};
const viewByPath = new Map(
  Object.entries(pathByView).map(([view, path]) => [
    path.toLowerCase(),
    view as View,
  ]),
);

const IDLE_LOGOUT_MS = 15 * 60 * 1000;
const IDLE_ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  "pointerdown",
  "pointermove",
  "keydown",
  "scroll",
  "touchstart",
];

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null),
    [permissions, setPermissions] = useState<number[]>([]),
    [scopes, setScopes] = useState<any[]>([]),
    [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<View>(
    () => viewByPath.get(window.location.pathname.toLowerCase()) || "dashboard",
  );
  /** Which nav groups the reader has pressed open or shut, by group id. */
  const [navGroups, setNavGroups] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false),
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
    return "dark";
  });
  const [dataMode, setDataMode] = useState<{ mode: string; real: boolean } | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine),
    [onboardingStep, setOnboardingStep] = useState(-1),
    [usage, setUsage] = useState<Record<string, number>>({}),
    [entityFavorites, setEntityFavorites] = useState<FavoriteEntity[]>([]);
  const searchInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    safeStorage.set("schedule-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (!user) return;
    let lastActivityAt = Date.now();
    let lastHeartbeatAt = 0;
    let timer = 0;
    let heartbeatBusy = false;
    const HEARTBEAT_EVERY_MS = 4 * 60 * 1000;
    const arm = () => {
      window.clearTimeout(timer);
      const remaining = Math.max(0, IDLE_LOGOUT_MS - (Date.now() - lastActivityAt));
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
      if (Date.now() - lastActivityAt >= IDLE_LOGOUT_MS) {
        void logout();
        return;
      }
      markActivity();
    };
    document.addEventListener("visibilitychange", visibility);
    arm();
    return () => {
      window.clearTimeout(timer);
      IDLE_ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, markActivity),
      );
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [user?.SystemUserId]);
  useEffect(() => {
    const up = () => setOnline(true),
      down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me"),
          data = await res.json();
        if (res.ok && data.user) {
          setUser(data.user);
          setPermissions(
            Array.isArray(data.permissions) ? data.permissions : [],
          );
          setScopes(Array.isArray(data.scopes) ? data.scopes : []);
          setDataMode(data.data || null);
        }
      } catch {
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
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInput.current?.focus(), 30);
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

  const hasPerm = (id: number) => permissions.includes(id),
    hasAny = (...ids: number[]) => ids.some(hasPerm);
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
  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);
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
  const go = (view: View) => {
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
    setPermissions(data.permissions || []);
    setScopes(data.scopes || []);
    setDataMode(data.data || null);
    setActiveView("dashboard");
    window.history.replaceState({}, "", pathByView.dashboard);
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    navigator.serviceWorker?.controller?.postMessage({
      type: "CLEAR_API_CACHE",
    });
    setUser(null);
    setPermissions([]);
    setScopes([]);
    setActiveView("dashboard");
    window.history.replaceState({}, "", "/");
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
      } else if (e.altKey && e.key === "3" && smartSearchView) {
        e.preventDefault();
        go(smartSearchView);
      } else if (e.altKey && e.key === "4" && smartReportView) {
        e.preventDefault();
        go(smartReportView);
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
  if (loading)
    return (
      <div className="app-loading">
        <span />
      </div>
    );
  if (!user) return <Login onLoginSuccess={login} />;

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
          <Schedules mode="schedule" user={user} scopes={scopes} />
        ) : (
          unauthorized()
        );
      case "scheduleCopy":
        return isPowerAdmin && hasPerm(7) && user.SystemUserId === 1 ? (
          <Schedules mode="copy" user={user} scopes={scopes} />
        ) : (
          unauthorized()
        );
      case "intelligence":
        return isPowerAdmin && hasPerm(7) ? (
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
          <AdminUsers mode="users" onNavigate={go} permissions={permissions} />
        ) : (
          unauthorized()
        );
      case "permissions":
        return isPowerAdmin && hasPerm(12) ? (
          <AdminUsers
            mode="permissions"
            onNavigate={go}
            permissions={permissions}
          />
        ) : (
          unauthorized()
        );
      case "scopes":
        return isPowerAdmin && hasPerm(15) ? (
          <AdminUsers mode="scopes" onNavigate={go} permissions={permissions} />
        ) : (
          unauthorized()
        );
      case "audit":
        return isPowerAdmin && allowed.admin ? (
          <AdminUsers mode="audit" onNavigate={go} permissions={permissions} />
        ) : (
          unauthorized()
        );
      case "about":
        return isPowerAdmin ? <About /> : unauthorized();
      default:
        return unauthorized();
    }
  };

  const NavButton = ({
    view,
    icon,
    label,
    active,
  }: {
    view: View;
    icon: React.ReactNode;
    label: string;
    active?: boolean;
  }) => {
    const on = active ?? activeView === view;
    return (
      <button
        type="button"
        className={`side-nav-link ${on ? "active" : ""}`}
        onClick={() => go(view)}
      >
        {icon}
        <span>{label}</span>
        {on ? <ChevronLeft className="nav-arrow" /> : null}
      </button>
    );
  };
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
  const NavSection = ({
    id,
    title,
    rail,
    holdsActive,
    className,
    children,
  }: {
    id: string;
    title: string;
    rail: string;
    holdsActive: boolean;
    className?: string;
    children: React.ReactNode;
  }) => {
    const open = navGroups[id] ?? holdsActive;
    return (
      <div className={`nav-section ${className || ""}`} data-rail={rail} data-open={open ? "true" : undefined}>
        <button
          type="button"
          className="nav-section-title"
          aria-expanded={open}
          onClick={() => setNavGroups(current => ({ ...current, [id]: !open }))}
          title={open ? `طيّ ${title}` : `فتح ${title}`}
        >
          <span>{title}</span>
          <ChevronLeft className="nav-section-chevron" aria-hidden="true" />
        </button>
        {/* One wrapper, because the 0fr→1fr fold measures a single grid row. */}
        <div className="nav-section-body"><div>{children}</div></div>
      </div>
    );
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
    reportDepartment: "تقرير القسم",
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
            label: "راجع التعارضات الآن",
            hint: isPowerAdmin
              ? "افتح مركز القرار"
              : "افتح الجدول ومساعد التعارضات",
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
    {
      label: "تقرير القسم العلمي",
      hint: "التقرير الرسمي",
      keywords: "تقرير قسم طباعة",
      icon: <FileText />,
      run: () => go("reportDepartment"),
      show: hasPerm(14),
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
  const onboardingSteps = isPowerAdmin
    ? [
        {
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
          copy: "تظل آخر البيانات متاحة للقراءة، بينما النشر والتغييرات الحساسة تتوقف حتى يعود الاتصال.",
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
          title: "قسمك فقط… مع كشف التعارضات بأمان",
          copy: "التعارض الخارجي محجوب لكنه محمي.",
        },
        {
          icon: <WifiOff />,
          eyebrow: "حماية الحفظ",
          title: "لا كتابة أثناء انقطاع الاتصال",
          copy: "يمكنك القراءة من آخر نسخة متاحة، وتعود عمليات الحفظ تلقائياً عندما يعود الاتصال.",
        },
      ];
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

  return (
    <div
      className={`app-shell ${contextRail ? "context-rail-active" : ""} task-${taskFamily} role-${isPowerAdmin ? "admin" : "scheduler"}`}
      dir="rtl"
      data-role={isPowerAdmin ? "admin" : "scheduler"}
    >
      <header className={`mobile-topbar no-print ${online ? "" : "offline"}`}>
        <button onClick={() => setSidebarOpen(true)} aria-label="القائمة">
          <Menu />
        </button>
        <button className="mobile-brand" onClick={() => go("dashboard")}>
          SCHEDULE
        </button>
        <button onClick={() => setSearchOpen(true)} aria-label="البحث">
          <Search />
        </button>
      </header>
      {!sidebarOpen ? (
        <button className="sidebar-launcher no-print" type="button" onClick={() => setSidebarOpen(true)} aria-label="فتح القائمة" title="فتح القائمة">
          <Menu />
        </button>
      ) : null}
      <aside
        className={`sidebar no-print ${sidebarOpen ? "open" : ""} ${contextRail ? "context-rail" : ""}`}
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
            title="إغلاق القائمة"
            onClick={() => setSidebarOpen(false)}
          >
            <X />
          </button>
        </div>
        <button
          className="command-search"
          type="button"
          onClick={() => setSearchOpen(true)}
        >
          <Search />
          <span>بحث شامل...</span>
          <kbd>
            <Command /> K
          </kbd>
        </button>
        <nav className="side-nav" aria-label="القائمة الرئيسية">
          <NavSection
            id="core"
            title="مساحة العمل"
            rail="core"
            className="nav-section-core"
            holdsActive={
              activeView === "dashboard" ||
              activeView === "schedules" ||
              searchViews.includes(activeView as ReportMode) ||
              reportViews.includes(activeView as ReportMode)
            }
          >
            <NavButton view="dashboard" icon={<House />} label="لوحة العمل" />
            {allowed.schedule ? (
              <NavButton
                view="schedules"
                icon={<CalendarDays />}
                label="فتح الجدول"
              />
            ) : null}
            {smartSearchView || smartReportView ? (
              <NavButton
                view={(smartSearchView || smartReportView) as View}
                active={searchViews.includes(activeView as ReportMode) || reportViews.includes(activeView as ReportMode)}
                icon={<FileSearch />}
                label="الاستعلامات والتقارير"
              />
            ) : null}
          </NavSection>
          {isPowerAdmin && allowed.schedule ? (
            <NavSection
              id="schedule"
              title="أدوات القرار"
              rail="schedule"
              className="admin-only-nav"
              holdsActive={activeView === "intelligence"}
            >
              <NavButton
                view="intelligence"
                icon={<WandSparkles />}
                label="مركز القرار"
              />
            </NavSection>
          ) : null}
          {isPowerAdmin && academicEntry ? (
            <NavSection
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
                view={academicEntry}
                active={academicViews.includes(activeView as AcademicTab)}
                icon={<Library />}
                label="البيانات الأكاديمية"
              />
              {allowed.admin ? (
                <NavButton
                  view="users"
                  active={adminViews.includes(activeView as AdminMode)}
                  icon={<SlidersHorizontal />}
                  label="إدارة النظام"
                />
              ) : null}
              {allowed.schedule && user.SystemUserId === 1 ? (
                <NavButton
                  view="scheduleCopy"
                  icon={<CopyPlus />}
                  label="نسخ فصل"
                />
              ) : null}
              <NavButton view="about" icon={<Info />} label="عن البرنامج" />
            </NavSection>
          ) : isPowerAdmin && allowed.admin ? (
            <NavSection
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
                view="users"
                active={adminViews.includes(activeView as AdminMode)}
                icon={<SlidersHorizontal />}
                label="إدارة النظام"
              />
              {allowed.schedule && user.SystemUserId === 1 ? (
                <NavButton
                  view="scheduleCopy"
                  icon={<CopyPlus />}
                  label="نسخ فصل"
                />
              ) : null}
              <NavButton view="about" icon={<Info />} label="عن البرنامج" />
            </NavSection>
          ) : null}
        </nav>
        {/* One card carries who you are, whether saving is safe, the theme and
            the way out — three sentences of chrome reduced to a dot and two
            glyphs, which also keeps the rail inside a 720px-tall laptop. */}
        <div className="sidebar-footer">
          <div className="user-card">
            <div
              className={`user-avatar ${online ? "online" : "offline"}`}
              title={online ? "متصل وآمن للحفظ" : "دون اتصال · قراءة فقط"}
            >
              {user.Name.trim().charAt(0) || "م"}
              <i aria-hidden="true" />
            </div>
            <div>
              <strong>{user.Name}</strong>
              <small>
                {isPowerAdmin ? "إدارة كاملة" : "مسؤول الجدول · قسمك فقط"}
              </small>
            </div>
            <span className="sr-only" role="status">
              {online ? "متصل وآمن للحفظ" : "دون اتصال · القراءة فقط"}
            </span>
            <div className="user-card-tools">
              <button
                type="button"
                aria-label={
                  theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"
                }
                title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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
          className="sidebar-backdrop no-print"
          onClick={() => setSidebarOpen(false)}
          aria-label="إغلاق القائمة"
        />
      ) : null}
      {dataMode && !dataMode.real ? (
        <div className="fake-data-banner no-print" role="alert">
          <strong>بيانات تجريبية</strong>
          <span>هذه ليست قاعدة بيانات الجامعة. أي تعديل هنا لن يظهر في الجدول الحقيقي.</span>
        </div>
      ) : null}
      <main className="app-main">
        <div className="content-frame">
          <Suspense fallback={<div className="view-loading" aria-busy="true"><span /></div>}>{renderView()}</Suspense>
        </div>
      </main>

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
                          <time dir="ltr">{gap.from}–{gap.to}</time>
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
                          <time dir="ltr">{row.start}–{row.end}</time>
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
                      <i>الاستعلامات</i>
                      <kbd>Alt 4</kbd>
                      <i>التقارير</i>
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
          <section className="onboarding-card">
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
