import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  BrainCircuit,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Command,
  Dna,
  FileClock,
  FileSpreadsheet,
  Gauge,
  History,
  Lightbulb,
  LockKeyhole,
  MessageSquareText,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trash2,
  Upload,
  UsersRound,
  WandSparkles,
  Link2,
  QrCode,
  Printer,
  Plus,
  X,
} from "lucide-react";
import {
  Badge,
  Field,
  GhostButton,
  MetaPill,
  Notice,
  Num,
  PageTitle,
  PrimaryButton,
  RecordCard,
  RecordDeck,
  SecondaryButton,
  Segmented,
  Surface,
  visualConfirm,
} from "./ui";
import type {
  AdCollege,
  AdCourse,
  AdInstructor,
  AdSection,
  AdTerm,
  FSchedule,
} from "../types";
import IntelligenceContextBar from "./IntelligenceContextBar";
import { AR, countOf, nounFor } from "../utils/arabicCount";
import { coerceScopeValues, resolveScopeSelection } from "../utils/scopeContext";
import { sortByName } from "../utils/sorting";
import { sortTermsNewest } from "../utils/termSequence";
import { parseNaturalQuery } from "../utils/naturalQuery";
import {
  IntelligenceVersionCanvas as VersionCanvas,
  IntelligenceVersionDiffTable,
  intelligenceDayLabels as dayLabels,
  intelligenceMinutes as twinMinutes,
} from "./IntelligenceVersionCanvas";
import { formatScheduleTimeRange, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME, SCHEDULE_SLOT_MINUTES } from "../utils/scheduleTime";
import { setTelemetryScope, telemetryApi, telemetryBreadcrumb, telemetryError, telemetryTiming } from "../utils/clientTelemetry";

/**
 * A professor's week, laid out where it actually falls.
 *
 * Every other reading of a gap in this application is a quantity — an average
 * on the dashboard, a maximum beside a name, a count in a report. A quantity
 * cannot separate the two shapes that matter most: three hours of dead air
 * before the first class, which is an early start and nothing worse, and three
 * hours wedged between two classes, which is an afternoon spent waiting on
 * campus. Both read "3س فراغ".
 *
 * So this returns position, not size: for each taught day, the blocks in the
 * order they occur and the empty stretches between them, as percentages of the
 * professor's own teaching window. Long waits are marked; short turnarounds are
 * left alone, because a thirty-minute gap is a walk between buildings.
 */
const WAIT_THRESHOLD = 60;
function professorWeekShape(rows: any[]) {
  const dayKeys = Object.keys(dayLabels);
  const spans: Array<{ day: string; start: number; end: number }> = [];
  rows.forEach(row => {
    const start = twinMinutes(row.fstarttime), end = twinMinutes(row.fendtime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    dayKeys.forEach(day => { if (row[day]) spans.push({ day, start, end }); });
  });
  if (!spans.length) return null;
  const from = Math.floor(Math.min(...spans.map(s => s.start)) / 60) * 60;
  const to = Math.ceil(Math.max(...spans.map(s => s.end)) / 60) * 60;
  const width = Math.max(60, to - from);
  const pct = (value: number) => ((value - from) / width) * 100;
  const days = dayKeys.map(day => {
    const blocks = spans.filter(s => s.day === day).sort((a, b) => a.start - b.start);
    const waits: Array<{ left: number; width: number; minutes: number }> = [];
    for (let i = 1; i < blocks.length; i += 1) {
      const minutes = blocks[i].start - blocks[i - 1].end;
      if (minutes >= WAIT_THRESHOLD) {
        waits.push({ left: pct(blocks[i - 1].end), width: pct(blocks[i].start) - pct(blocks[i - 1].end), minutes });
      }
    }
    return {
      day,
      label: (dayLabels as any)[day],
      blocks: blocks.map(b => ({ left: pct(b.start), width: pct(b.end) - pct(b.start) })),
      waits,
      longest: waits.reduce((most, w) => Math.max(most, w.minutes), 0),
    };
  }).filter(d => d.blocks.length);
  const hours: number[] = [];
  for (let m = from; m <= to; m += 60) hours.push(m);
  return { from, to, days, hours };
}

type Tab = "command" | "copilot" | "twin" | "history" | "import";
type InsightScene =
  | "quality"
  | "attention"
  | "density"
  | "spatial"
  | "rooms"
  | "professors"
  | "health"
  | "genome"
  /* Carved out of the quality panel, which was the last reading still holding
     two cards. One reading, one card, one screen — a panel that stacks two is
     exactly the thing this strip exists to end. */
  | "approval"
  /* ما قاله الطلاب: الطلب، والتقاطع، والنقلة التي تُزيله. */
  | "students";
/* «جرّب» — every card it holds, including the three that used to appear on
   their own the moment a scenario existed. */
type TwinCard = "hero" | "lab" | "board" | "editor" | "ledger";
type ApproveCard = "compare" | "drafts" | "versions";
type ChatItem = { prompt: string; answer: any };
interface Props {
  user: any;
  scopes: any[];
}
/**
 * ── بطاقة واحدة، صفحة واحدة ─────────────────────────────────────────────────
 *
 * Three screens here kept re-inventing the same thing badly. «افهم» got a
 * dashboard of tiles that open as pages; «جرّب» and «اعتمد» got a strip of
 * chips — and a strip only ever governed the cards it knew about. Everything
 * else stayed stacked underneath it, so choosing «مختبر القرار» still left the
 * board, the what-if editor and the change ledger sitting below, and the page
 * did not move an inch when you pressed.
 *
 * One mechanism now, used by all three: a deck. Closed, it is a dashboard of
 * small cards. Open, it is a single card as a full page, with the way back
 * pinned above everything.
 */
interface DeckCard {
  value: string;
  label: string;
  detail: string;
  metric?: string;
  icon?: React.ReactNode;
}

/**
 * Put whatever just appeared at the top of the screen.
 *
 * Measured after paint, and only on an element that is actually on screen: a
 * `display:none` element measures zero, which silently reads as "you are
 * already there" and leaves the page exactly where it was. That was the whole
 * bug — pressing a card changed the content a thousand pixels below the fold
 * and never scrolled to it.
 */
const liftToTop = (instant: boolean) =>
  requestAnimationFrame(() => {
    const target = [
      ...document.querySelectorAll<HTMLElement>(".insight-page-head, .insight-preview-rail"),
    ].find(el => el.getClientRects().length > 0);
    if (!target) return;
    const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - 8);
    if (Math.abs(window.scrollY - top) < 8) return;
    window.scrollTo({ top, behavior: instant ? "auto" : "smooth" });
  });

const CardDeck = ({ cards, value, onChange, backLabel, title, hint }: {
  cards: DeckCard[];
  value: string | null;
  onChange: (next: string | null) => void;
  backLabel: string;
  title: string;
  hint: string;
}) => {
  const active = cards.find(card => card.value === value) || null;
  if (active)
    return (
      <header className="insight-page-head">
        <button type="button" className="insight-back" onClick={() => onChange(null)}>
          <ChevronLeft aria-hidden="true" />
          {backLabel}
        </button>
        <div className="insight-page-title">
          <span className="surface-kicker">{active.detail}</span>
          <span className="insight-title-line"><strong>{active.label}</strong>{active.metric ? <b className="insight-page-metric">{active.metric}</b> : null}</span>
        </div>
      </header>
    );
  return (
    <nav className="insight-preview-rail no-print" aria-label={title}>
      <div className="insight-preview-head">
        <span className="surface-kicker">{title}</span>
        <strong>اختر بطاقة</strong>
        <small>{hint}</small>
      </div>
      <div className="insight-preview-list" role="list">
        {cards.map(card => (
          <button
            key={card.value}
            type="button"
            className="insight-preview"
            role="listitem"
            aria-label={`${card.label} — ${card.detail}`}
            onClick={() => onChange(card.value)}
          >
            {card.icon ? (
              <span className="insight-preview-icon" aria-hidden="true">{card.icon}</span>
            ) : null}
            <span className="insight-preview-copy">
              <strong>{card.label}</strong>
              <small>{card.detail}</small>
            </span>
            {card.metric ? <b>{card.metric}</b> : null}
          </button>
        ))}
      </div>
    </nav>
  );
};

const smartMessage = (value: any) => {
  const text = String(value?.message || value || "حدث خطأ غير متوقع");
  if (/Failed to fetch|NetworkError/i.test(text))
    return "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة؛ لم يتم حفظ أي تغيير.";
  if (/API endpoint not found/i.test(text))
    return "جزء من التحديث لم يُرفع على الخادم بعد. ارفع ملفات الحزمة الجديدة كاملة مع الحفاظ على المسارات.";
  const issues = Array.isArray(value?.issues) ? value.issues.filter(Boolean).slice(0, 4) : [];
  return issues.length ? `${text}: ${issues.join(" · ")}` : text;
};

export default function IntelligenceWorkspace({ user, scopes }: Props) {
  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);
  const [colleges, setColleges] = useState<AdCollege[]>([]),
    [sections, setSections] = useState<AdSection[]>([]),
    [terms, setTerms] = useState<AdTerm[]>([]),
    [courses, setCourses] = useState<AdCourse[]>([]),
    [instructors, setInstructors] = useState<AdInstructor[]>([]);
  const [collegeId, setCollegeId] = useState(0),
    [sectionId, setSectionId] = useState(0),
    [termId, setTermId] = useState(0),
    [tab, setTab] = useState<Tab>(() => {
      const v = sessionStorage.getItem(
        "schedule-intelligence-tab",
      ) as Tab | null;
      sessionStorage.removeItem("schedule-intelligence-tab");
      return v &&
        ["command", "copilot", "twin", "history", "import"].includes(v)
        ? v
        : "command";
    });
  const [overview, setOverview] = useState<any>(null),
    [rows, setRows] = useState<FSchedule[]>([]),
    [drafts, setDrafts] = useState<any[]>([]),
    [versions, setVersions] = useState<any[]>([]),
    [operationsReview, setOperationsReview] = useState<any>(null),
    [experienceHealth, setExperienceHealth] = useState<any>(null),
    [decisionInbox, setDecisionInbox] = useState<any>({ manual: [], inferred: [], totalOpen: 0 }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  /**
   * ── الوصول إلى المشهد، لا تغييره فقط ────────────────────────────────────
   *
   * Choosing a reading changed which panel was rendered and left the page
   * exactly where it stood. Measured on the live board: pressing «الأساتذة»
   * from 5,886px down moved the page ZERO pixels, and the panel it had just
   * opened began 1,273 pixels ABOVE the viewport — so what the reader saw was
   * whatever happened to sit at that scroll height, which was a different
   * reading entirely. The tab worked; the page never went there, and that is
   * indistinguishable from a tab that does nothing.
   *
   * The destination is the STRIP, not the panel. Measuring the panel looked
   * right and worked once in four: the measurement happens before React has
   * hidden the previous panel, so the page is a different height by the time
   * the scroll lands. Exactly one panel is ever visible and it always begins
   * under the strip — so bringing the strip to the top of the window puts the
   * chosen reading under it every time. A fixed anchor cannot go stale.
   */
  /**
   * ── شريط داخل المشهد ────────────────────────────────────────────────────
   *
   * The reading tabs solved stacking for «افهم» and left the other two scenes
   * exactly as they were: «جرّب» stacks three cards and «اعتمد» three more,
   * each one a full screen tall, with nothing to say which is which until you
   * have scrolled past the previous one.
   *
   * The same strip answers it. One card at a time, chosen by name — not a
   * second mechanism, the same one these readings already use.
   */
  /* null is the dashboard. Every card below — including the ones that used to
     sit stacked under the strip with no way to choose them — is now a page. */
  const [twinCard, setTwinCard] = useState<TwinCard | null>(null);
  const [approveCard, setApproveCard] = useState<ApproveCard | null>(null);

  const showScene = (value: InsightScene | null) => {
    setInsightScene(value);
    liftToTop(reduceMotion.current);
  };
  const showTwinCard = (value: TwinCard | null) => {
    setTwinCard(value);
    liftToTop(reduceMotion.current);
  };
  const showApproveCard = (value: ApproveCard | null) => {
    setApproveCard(value);
    liftToTop(reduceMotion.current);
  };

  const [heatMode, setHeatMode] = useState("department"),
    [detail, setDetail] = useState<any>(null),
    /* null = the dashboard itself. A reading is a page that opens ON TOP of it
       and closes back to it — not a section further down the same scroll.
       Publishing can hand off directly to the students reading; consume that
       one-shot request here so the shortcut lands on the exact destination. */
    [insightScene, setInsightScene] = useState<InsightScene | null>(() => {
      try {
        const requested = sessionStorage.getItem("schedule-intelligence-insight") as InsightScene | null;
        sessionStorage.removeItem("schedule-intelligence-insight");
        return requested && ["quality", "approval", "attention", "density", "spatial", "rooms", "professors", "health", "students", "genome"].includes(requested)
          ? requested
          : null;
      } catch { return null; }
    });
  useEffect(() => { if (!isPowerAdmin && heatMode !== "department") setHeatMode("department"); }, [isPowerAdmin, heatMode]);
  const [prompt, setPrompt] = useState(""),
    [chat, setChat] = useState<ChatItem[]>([]),
    chatEnd = useRef<HTMLDivElement | null>(null);
  const drawerClose = useRef<HTMLButtonElement | null>(null),
    drawerReturnFocus = useRef<HTMLElement | null>(null),
    reduceMotion = useRef(false);
  const [scenario, setScenario] = useState<FSchedule[] | null>(null),
    [scenarioEval, setScenarioEval] = useState<any>(null),
    [scenarioId, setScenarioId] = useState<number | "">(""),
    [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [guideSimulationMeta, setGuideSimulationMeta] = useState<null | { before:FSchedule; after:FSchedule; request:any }>(null);
  const intelligenceGuideOperationRef = useRef<null | { featureId:string; transactionId?:string; startedAt:number; expected:string }>(null);
  const [compareFrom, setCompareFrom] = useState(0),
    [compareTo, setCompareTo] = useState(0),
    [termCompare, setTermCompare] = useState<any>(null);
  const [versionFrom, setVersionFrom] = useState(""),
    [versionTo, setVersionTo] = useState(""),
    [versionCompare, setVersionCompare] = useState<any>(null),
    [timeTravel, setTimeTravel] = useState(50);
  const [importPreview, setImportPreview] = useState<any>(null),
    [importFile, setImportFile] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  // Help never opens on its own; one deliberate question mark owns it.
  const [decisionCompose, setDecisionCompose] = useState(false);
  const [decisionTitle, setDecisionTitle] = useState("");
  const [versionScrubIndex, setVersionScrubIndex] = useState(0);
  /* ما قاله الطلاب — والنقلة التي تُصلحه.
     Loaded with everything else, and empty is the ordinary state: a department
     that has never opened the survey sees the door and nothing more. */
  const [demand, setDemand] = useState<any>(null);
  const [genome, setGenome] = useState<any>(null),
    [constraints, setConstraints] = useState<any[]>([]),
    [innovationMode, setInnovationMode] = useState<
      "constraints" | "war" | "autopilot" | "policy"
    >("constraints"),
    [warRoom, setWarRoom] = useState<any>(null),
    [warRowId, setWarRowId] = useState<number | "">(""),
    [warBusy, setWarBusy] = useState(false),
    [autopilotGoal, setAutopilotGoal] = useState(
      "قلل الفراغات ومواضع التحقق بأقل تغيير ممكن، وحافظ على القاعات والأيام الحالية",
    ),
    [autopilot, setAutopilot] = useState<any>(null),
    [autopilotBusy, setAutopilotBusy] = useState(false);
  const [policyDraft, setPolicyDraft] = useState<any>({ type: "day_off", day: "fwednesday", time: "17:00", building: "", growth: 10, scope: isPowerAdmin ? "university" : "department" });
  const [policyResult, setPolicyResult] = useState<any>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [constraintDraft, setConstraintDraft] = useState<any>({
    type: "instructor_latest_end",
    AdInstructorId: 0,
    AdCourseId: 0,
    day: "fwednesday",
    time: "14:00",
    roomCode: "",
    roomHall: "",
    maxMinutes: 120,
  });
  const fetchJson = async (url: string, options?: RequestInit) => {
    const method=String(options?.method||"GET").toUpperCase();
    if (method !== "GET" && !navigator.onLine)
      throw new Error("أنت الآن دون اتصال. القراءة متاحة، لكن الحفظ والنشر ينتظر عودة الاتصال.");
    telemetryBreadcrumb(`${method} ${url.split("?")[0]}`);
    const started=performance.now();
    let r:Response;
    try{r=await fetch(url,{...options,credentials:options?.credentials||"include"});telemetryApi(url.split("?")[0],performance.now()-started,r.status,r.ok);}
    catch(error){telemetryError(url.split("?")[0],error,performance.now()-started);throw error;}
    const body = await r.text();
    let d: any = {};
    if (body) {
      try { d = JSON.parse(body); }
      catch { const error=new Error(r.ok ? "وصل رد غير متوقع من الخادم. أعد المحاولة بعد لحظات." : `الخادم مشغول حالياً (${r.status}). أعد المحاولة بعد قليل.`);telemetryError("response.parse",error);throw error; }
    }
    if (!r.ok)
      throw Object.assign(new Error(d.error || "تعذر تنفيذ العملية"), { issues: d.issues });
    return d;
  };
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
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reduceMotion.current = query.matches;
    };
    sync();
    query.addEventListener?.("change", sync);
    return () => query.removeEventListener?.("change", sync);
  }, []);
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        /**
         * A power-only panel must not take the whole room down with it.
         *
         * `lookups` is reserved for the main administrator, and `Promise.all`
         * rejects on the first refusal — so a department coordinator, who is
         * allowed on this screen and needs most of it, used to arrive at a
         * blank page with a permission error and no way forward. The optional
         * pieces now fail alone: their panels stay quiet, the rest opens.
         */
        const [c, s, t, lookups] = await Promise.all([
          fetchJson("/api/colleges"),
          fetchJson("/api/sections"),
          fetchJson("/api/terms"),
          fetchJson("/api/intelligence/lookups").catch(() => null),
        ]);
        setColleges(sortByName(c, (row:any)=>row.AdCollegeName));
        setSections(sortByName(s, (row:any)=>row.AdSectionName));
        const sortedTerms = sortTermsNewest<AdTerm>(t);
        setTerms(sortedTerms);
        setCourses(sortByName(lookups?.courses || [], (row:any)=>row.CourseName));
        setInstructors(sortByName(lookups?.instructors || [], (row:any)=>row.AdInstructorName));
        // Context is deliberately explicit. A visible default that has not
        // actually loaded is worse than an empty selector: it makes the page
        // look broken on first entry. Consume any old handoff and start clean.
        try { sessionStorage.removeItem("schedule-intelligence-scope"); } catch {}
        let guideRequest:any = null;
        try { guideRequest = JSON.parse(sessionStorage.getItem("schedule-guide-simulation") || "null"); } catch {}
        const guideFresh = guideRequest && Date.now() - Number(guideRequest.createdAt || 0) < 10 * 60 * 1000;
        setCollegeId(guideFresh ? Number(guideRequest.collegeId || 0) : 0);
        setSectionId(guideFresh ? Number(guideRequest.sectionId || 0) : 0);
        setTermId(guideFresh ? Number(guideRequest.termId || 0) : 0);
        setCompareTo(sortedTerms[0]?.AdTermId || 0);
        setCompareFrom(sortedTerms[1]?.AdTermId || sortedTerms[0]?.AdTermId || 0);
      } catch (e: any) {
        setError(smartMessage(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const availableSections = useMemo(
    () => sections.filter((s) => !collegeId || s.AdCollegeId === collegeId),
    [sections, collegeId],
  );
  const contextQuery = useMemo(
    () =>
      new URLSearchParams({
        collegeId: String(collegeId),
        sectionId: String(sectionId),
        termId: String(termId),
      }).toString(),
    [collegeId, sectionId, termId],
  );
  useEffect(() => {
    setTelemetryScope({collegeId,sectionId,termId});
    if(collegeId&&sectionId&&termId)telemetryBreadcrumb(`مركز الذكاء ${collegeId}/${sectionId}/${termId}`);
  },[collegeId,sectionId,termId]);
  /** Only the newest read may paint. Switching scope quickly used to let an
   *  older answer land last and describe another department's numbers under
   *  the new department's name. */
  const reloadSerial = useRef(0);
  const intelligenceReadyScope = useRef("");
  const reload = async () => {
    if (!collegeId || !sectionId || !termId) return;
    const uiStarted = performance.now();
    const serial = ++reloadSerial.current;
    setLoading(true);
    setError(null);
    let painted = false;
    try {
      // The board and its score are the first paint. Everything else is useful
      // context, not a reason to hold the whole intelligence room behind a
      // spinner. This keeps the page responsive even when history/telemetry is
      // cold in Firestore.
      const [o, r] = await Promise.all([
        fetchJson(`/api/intelligence/overview?${contextQuery}`),
        fetchJson(`/api/schedules?${contextQuery}`),
      ]);
      if (serial !== reloadSerial.current) return;
      setOverview(o);
      setRows(r);
      if (!scenario) setScenarioId(r[0]?.id || "");
      painted = true;
      setLoading(false);
      const readyKey = `${collegeId}:${sectionId}:${termId}`;
      if (intelligenceReadyScope.current !== readyKey) {
        intelligenceReadyScope.current = readyKey;
        requestAnimationFrame(() => telemetryTiming("intelligence.ready", performance.now() - uiStarted));
      }

      // Secondary evidence arrives in parallel and quietly fills only the cards
      // that use it. A slow history query can no longer make «مركز الذكاء» feel
      // blank or make a department think the feature is missing.
      const [d, v, g, cx, dm, ops, decisions, ux] = await Promise.all([
        fetchJson(`/api/intelligence/drafts?${contextQuery}`).catch(() => []),
        fetchJson(`/api/intelligence/versions?${contextQuery}`).catch(() => []),
        fetchJson(`/api/intelligence/genome?${contextQuery}`).catch(() => null),
        fetchJson(`/api/intelligence/constraints?${contextQuery}`).catch(() => []),
        fetchJson(`/api/schedules/demand?${contextQuery}`).catch(() => null),
        fetchJson(`/api/intelligence/operations-review?${contextQuery}`).catch(() => null),
        fetchJson(`/api/intelligence/open-decisions?${contextQuery}`).catch(() => ({manual:[],inferred:[],totalOpen:0})),
        fetchJson(`/api/intelligence/experience-health?${contextQuery}`).catch(() => null),
      ]);
      if (serial !== reloadSerial.current) return;
      setDrafts(Array.isArray(d) ? d : []);
      setVersions(Array.isArray(v) ? v : []);
      setGenome(g);
      setConstraints(Array.isArray(cx) ? cx : []);
      setDemand(dm);
      setOperationsReview(ops);
      setDecisionInbox(decisions || {manual:[],inferred:[],totalOpen:0});
      setExperienceHealth(ux);
      setVersionScrubIndex(Math.max(0,(Array.isArray(v)?v.length:0)-1));
    } catch (e: any) {
      if (serial === reloadSerial.current) setError(smartMessage(e));
    } finally {
      if (!painted && serial === reloadSerial.current) setLoading(false);
    }
  };
  useEffect(() => {
    setScenario(null);
    setScenarioEval(null);
    setActiveDraftId(null);
    setVersionCompare(null);
    setDetail(null);
    setWarRoom(null);
    setAutopilot(null);
    setWarRowId("");
    if (collegeId && sectionId && termId) {
      void reload();
    } else {
      // An incomplete scope is a true idle state, never the previous scope
      // dimmed behind empty selectors. This also removes the visual flash that
      // used to occur while switching college/term.
      setOverview(null);
      setRows([]);
      setDrafts([]);
      setVersions([]);
      setGenome(null);
      setConstraints([]);
      setDemand(null);
      setOperationsReview(null);
      setDecisionInbox({ manual: [], inferred: [], totalOpen: 0 });
      setExperienceHealth(null);
    }
  }, [collegeId, sectionId, termId]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({
      behavior: reduceMotion.current ? "auto" : "smooth",
    });
  }, [chat]);
  const detailOpen = Boolean(detail);
  useEffect(() => {
    if (!detailOpen) return;
    drawerReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => drawerClose.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      drawerReturnFocus.current?.focus();
      drawerReturnFocus.current = null;
    };
  }, [detailOpen]);
  useEffect(()=>{if(versions.length>=2){setVersionFrom(v=>v||String(versions[1].id));setVersionTo(v=>v||String(versions[0].id));}},[versions]);
  useEffect(() => {
    if (!scenario) return;
    const timer = window.setTimeout(async () => {
      try {
        const d = await fetchJson("/api/intelligence/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collegeId,
            sectionId,
            termId,
            rows: scenario,
          }),
        });
        setScenarioEval(d);
      } catch (e: any) {
        setError(smartMessage(e));
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [scenario, collegeId, sectionId, termId]);
  const heatData =
    heatMode === "university"
      ? overview?.universityHeatmap || []
      : overview?.heatmap || [];
  const heatMax = Math.max(1, ...heatData.map((x: any) => x.count));
  // Only the hours that carry teaching. A campus that finishes at noon should
  // not read its density map through nine empty rows.
  const heatTimes = useMemo(() => {
    const all = Array.from(new Set(heatData.map((x: any) => x.time))).sort() as string[];
    const busy = new Set(heatData.filter((x: any) => Number(x.count) > 0).map((x: any) => x.time));
    if (!busy.size) return all;
    const first = all.findIndex((time) => busy.has(time));
    let last = all.length - 1;
    while (last > first && !busy.has(all[last])) last -= 1;
    return all.slice(Math.max(0, first - 1), Math.min(all.length, last + 2));
  }, [heatData]);
  const selectedScenario = useMemo(
    () => scenario?.find((r) => r.id === Number(scenarioId)) || null,
    [scenario, scenarioId],
  );
  const twinSlots = useMemo(
    () =>
      Array.from({ length: 21 }, (_, i) => {
        const mins = 8 * 60 + i * 30;
        return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      }),
    [],
  );
  const originalById = useMemo(
    () => new Map(rows.map((r) => [r.id, r])),
    [rows],
  );
  const changedRows = useMemo(
    () =>
      !scenario
        ? []
        : scenario.filter((r) => {
            const o = originalById.get(r.id);
            return (
              !o ||
              o.fstarttime !== r.fstarttime ||
              o.fendtime !== r.fendtime ||
              o.AdRoomCode !== r.AdRoomCode ||
              o.AdRoomHall !== r.AdRoomHall ||
              o.fsunday !== r.fsunday ||
              o.fmonday !== r.fmonday ||
              o.ftuesday !== r.ftuesday ||
              o.fwednesday !== r.fwednesday ||
              o.fthursday !== r.fthursday
            );
          }),
    [scenario, originalById],
  );
  const twinTime = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const moveTwinTime = (id: number, start: string) => {
    if (!scenario) return;
    const row = scenario.find((r) => r.id === id);
    if (!row) return;
    const duration = Math.max(
      30,
      twinMinutes(row.fendtime) - twinMinutes(row.fstarttime),
    );
    const startMinutes = twinMinutes(start);
    setScenario(
      (s) =>
        s?.map((r) =>
          r.id === id
            ? {
                ...r,
                fstarttime: start,
                fendtime: twinTime(startMinutes + duration),
              }
            : r,
        ) || null,
    );
    setScenarioId(id);
  };
  const readinessLabel =
    overview?.readiness === "ready"
      ? "جاهز للاعتماد"
      : overview?.readiness === "review"
        ? "جاهز بعد مراجعة"
        : overview?.readiness === "blocked"
          ? "يوجد ما يمنع الاعتماد"
          : "يحتاج تحسين";
  const sendCopilot = async (text = prompt) => {
    const q = text.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setPrompt("");
    try {
      // Idea 3: an imperative like "انقل 101 إلى 11:00" becomes a previewed move,
      // not just an answer. Everything else stays a normal read-only question.
      if (parseNaturalQuery(q).intent === "move") {
        const move = await fetchJson("/api/intelligence/nl-move", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeId, sectionId, termId, q }),
        });
        setChat((p) => [...p, { prompt: q, move } as any]);
        return;
      }
      const answer = await fetchJson("/api/intelligence/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, prompt: q }),
      });
      setChat((p) => [...p, { prompt: q, answer }]);
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  // Applying a previewed natural-language move is a second, deliberate press —
  // the same atomic door as a drag, so the same conflict rules protect it.
  const applyMove = async (mv: any, index: number) => {
    if (!mv?.move) return;
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/schedules/move-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strict: false, moves: [mv.move] }),
      });
      setChat((p) => p.map((item, i) => (i === index ? ({ ...item, move: { ...(item as any).move, applied: true } } as any) : item)));
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const evaluateScenario = async (next = scenario) => {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      setScenarioEval(
        await fetchJson("/api/intelligence/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeId, sectionId, termId, rows: next }),
        }),
      );
    } catch (e: any) {
      setError(smartMessage(e));
      if (e.issues) setMessage(e.issues.slice(0, 3).join(" · "));
    } finally {
      setBusy(false);
    }
  };
  const startTwin = async () => {
    const copy = rows.map((r) => ({ ...r }));
    setActiveDraftId(null);
    setScenario(copy);
    setScenarioId(copy[0]?.id || "");
    await evaluateScenario(copy);
    setTwinCard("board");
  };
  const autoSchedule = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await fetchJson("/api/intelligence/auto-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId }),
      });
      setActiveDraftId(null);
      setScenario(d.rows);
      setScenarioEval({ baseline: d.before, scenario: d.after });
      setScenarioId(d.rows[0]?.id || "");
      setMessage(d.summary);
      setTab("twin");
      setTwinCard("board");
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  /**
   * Take a student-clash proposal into the trial copy — applied, not saved.
   *
   * The engine's answer stops at "this would work"; a person still decides. So
   * the press lands where deciding is safe: a duplicate week with the move
   * already made, the before/after score beside it, and publishing behind the
   * two doors it has always been behind. The real schedule is untouched until
   * somebody saves a draft and publishes it.
   */
  /* ── باب الطلاب ─────────────────────────────────────────────────────────
     The survey could be answered but never issued — the public routes existed
     and nothing anywhere could create their link. A door with no handle. The
     handle belongs on the page that reads the answers, so collecting more of
     them and reading them are one place, not two. */
  const [surveyQr, setSurveyQr] = useState<{ id: string; svg: string } | null>(null);
  const [surveyCopied, setSurveyCopied] = useState<string | null>(null);
  const surveyUrl = (id: string) => `${window.location.origin}/q/${id}`;

  const issueSurvey = async () => {
    setBusy(true);
    setError(null);
    try {
      /* Scoped to ONE section, which is what makes the cohort unambiguous: the
         boys' link and the girls' link are two links on two sections, and no
         gender is ever guessed from a name. */
      await fetchJson("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, kind: "survey", days: 30 }),
      });
      setMessage("صدر رابط الاستبيان لهذا القسم — صالح ثلاثين يوماً. انسخه أو اعرض رمز QR وعلّقه للطلاب.");
      await reload();
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const showSurveyQr = async (id: string) => {
    if (surveyQr?.id === id) { setSurveyQr(null); return; }
    try {
      // ~50KB, so it only ships when somebody actually asks for a code.
      type QrFactory = (t: number, e: "L" | "M" | "Q" | "H") => {
        addData(s: string): void; make(): void;
        createSvgTag(o?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
      };
      const factory = (await import("../utils/qrcodeGenerator")).default as unknown as QrFactory;
      const code = factory(0, "M");
      code.addData(surveyUrl(id));
      code.make();
      setSurveyQr({ id, svg: code.createSvgTag({ scalable: true, margin: 1 }) });
    } catch { setError("تعذّر توليد رمز QR."); }
  };

  const copySurvey = async (id: string) => {
    const url = surveyUrl(id);
    try { await navigator.clipboard.writeText(url); }
    catch {
      const field = document.createElement("input");
      field.value = url;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setSurveyCopied(id);
    window.setTimeout(() => setSurveyCopied(current => (current === id ? null : current)), 1800);
  };

  /**
   * Open a proposed section inside the trial copy — added, not saved.
   *
   * Same doctrine as every other proposal here: the engine's answer ends at
   * "this would fit". The row appears in the duplicate week with a negative id
   * so nothing can mistake it for something the database has seen, and it stays
   * a draft until a person saves and publishes it.
   */
  const openSectionDraft = async (proposal: any, slot: any) => {
    const base = (scenario || rows).map(row => ({ ...row }));
    const sibling = base.find(row => Number(row.AdCourseId) === Number(proposal.courseId)) || base[0];
    if (!sibling) return;
    const fresh: any = {
      ...sibling,
      id: -Math.abs(Date.now() % 100000) - proposal.courseId,
      // Comes from the engine: the save path refuses anything non-numeric.
      SCode: String(slot.sectionCode || proposal.openSections + slot.index),
      AdRoomCode: slot.roomCode,
      AdRoomHall: slot.roomHall,
      AdInstructorId: slot.instructorId || 0,
      fstarttime: slot.start,
      fendtime: slot.end,
      fsunday: slot.day === "fsunday",
      fmonday: slot.day === "fmonday",
      ftuesday: slot.day === "ftuesday",
      fwednesday: slot.day === "fwednesday",
      fthursday: slot.day === "fthursday",
    };
    const applied = [...base, fresh];
    setActiveDraftId(null);
    setScenario(applied);
    setScenarioId(fresh.id);
    setTab("twin");
    showTwinCard("editor");
    setMessage(
      `أُضيفت شعبة «${proposal.courseName}» داخل النسخة التجريبية فقط: ${slot.dayLabel} ${slot.start}` +
      `${slot.roomCode ? ` · ${slot.roomCode}${slot.roomHall ? "/" + slot.roomHall : ""}` : ""}. ` +
      (slot.instructorId ? "" : "اختر لها أستاذاً. ") +
      "لا شيء منشور — راجعها ثم احفظها كمسودة.",
    );
    await evaluateScenario(applied);
  };

  const openRepair = async (fix: any) => {
    const base = (scenario || rows).map(row => ({ ...row }));
    const applied = base.map(row =>
      row.id === fix.rowId
        ? {
            ...row,
            fsunday: fix.to.day === "fsunday",
            fmonday: fix.to.day === "fmonday",
            ftuesday: fix.to.day === "ftuesday",
            fwednesday: fix.to.day === "fwednesday",
            fthursday: fix.to.day === "fthursday",
            fstarttime: fix.to.start,
            fendtime: fix.to.end,
          }
        : row,
    );
    setActiveDraftId(null);
    setScenario(applied);
    setScenarioId(fix.rowId);
    setTab("twin");
    showTwinCard("editor");
    /* Said out loud because the number beside it will not say it: درجة الجودة
       counts rooms, teachers, gaps and balance — it has never counted student
       clashes, so a move that removes one can read «+0» and look pointless. */
    setMessage(
      `طُبِّقت النقلة داخل النسخة التجريبية فقط: «${fix.courseName}» إلى ${fix.to.dayLabel} ${fix.to.start}. ` +
      `يزول تقاطع ${countOf(fix.shared, AR.student)}. ` +
      "درجة الجودة لا تحسب تقاطع الطلاب بعد، فقد تبقى كما هي — لا شيء منشور حتى تحفظها كمسودة وتنشرها.",
    );
    await evaluateScenario(applied);
  };

  const patchScenario = (fields: Partial<FSchedule>) => {
    if (!scenario || !selectedScenario) return;
    setScenario(
      scenario.map((r) =>
        r.id === selectedScenario.id ? { ...r, ...fields } : r,
      ),
    );
  };
  const saveDraft = async (
    source = "what-if",
    draftRows = scenario,
    customName = "",
  ) => {
    if (!draftRows) return;
    setBusy(true);
    setError(null);
    try {
      const existing =
        source === "what-if" && activeDraftId
          ? drafts.find((d) => String(d.id) === String(activeDraftId))
          : null;
      const d =
        existing && existing.status === "draft"
          ? await fetchJson(`/api/intelligence/drafts/${existing.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rows: draftRows }),
            })
          : await fetchJson("/api/intelligence/drafts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                collegeId,
                sectionId,
                termId,
                source,
                name:
                  customName ||
                  `${source === "auto" ? "اقتراح تلقائي" : source === "import" ? "استيراد Excel" : "سيناريو"} — ${new Date().toLocaleString("ar-KW-u-nu-latn")}`,
                rows: draftRows,
              }),
            });
      setActiveDraftId(String(d.id));
      setMessage(
        existing
          ? `تم تحديث «${d.name}» داخل المسودة المشتركة للقسم. الجدول الفعلي لم يتغير.`
          : `تم حفظ «${d.name}» كمسودة مشتركة للقسم، ولم يتغير الجدول الفعلي.`,
      );
      await reload();
      return d;
    } catch (e: any) {
      setError(smartMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const openDraft = async (d: any) => {
    const draftRows = Array.isArray(d?.rows) ? d.rows.map((r:any)=>({...r})) : [];
    if (!draftRows.length) { setError("هذه المسودة لا تحتوي مواعيد قابلة للفتح."); return; }
    setActiveDraftId(String(d.id));
    setScenario(draftRows);
    setScenarioId(draftRows[0]?.id || "");
    setTab("twin");
    await evaluateScenario(draftRows);
  };
  const publishDraft = async (d: any) => {
    if (!online) {
      setError("النشر متوقف أثناء عدم الاتصال لحماية الجدول.");
      return;
    }
    // One deliberate click publishes. The server always captures a rollback
    // point first, so a browser-native confirmation dialog adds friction but
    // no extra safety — and on iOS it can be suppressed permanently.
    setBusy(true);
    try {
      await fetchJson(`/api/intelligence/drafts/${d.id}/publish`, {
        method: "POST",
        headers: { "x-schedule-confirm": "publish" },
      });
      setMessage("تم النشر بنجاح، وحُفظت نسخة زمنية قبل التغيير.");
      setScenario(null);
      setScenarioEval(null);
      setActiveDraftId(null);
      await reload();
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const restoreVersion = async (v: any) => {
    // Restore is itself versioned before it runs, so it is reversible without
    // relying on a native confirm dialog.
    setBusy(true);
    try {
      await fetchJson(`/api/intelligence/versions/${v.id}/restore`, {
        method: "POST",
        headers: { "x-schedule-confirm": "restore" },
      });
      setMessage("تم الاسترجاع، والنسخة التي كانت قبل الاسترجاع محفوظة أيضاً.");
      await reload();
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const compareVersionPair = async (fromId: string, toId: string, quiet = false) => {
    if (!fromId || !toId || fromId === toId) return;
    if (!quiet) setBusy(true);
    try {
      setVersionCompare(await fetchJson(`/api/intelligence/versions/compare?fromId=${encodeURIComponent(fromId)}&toId=${encodeURIComponent(toId)}`));
      setVersionFrom(fromId); setVersionTo(toId); setTimeTravel(50);
    } catch (e: any) {
      if (!quiet) setError(smartMessage(e));
    } finally {
      if (!quiet) setBusy(false);
    }
  };
  const compareVersions = async () => {
    if (!versionFrom || !versionTo) { setError("اختر نسختين للمقارنة."); return; }
    if (versionFrom === versionTo) { setError("اختر نسختين مختلفتين للمقارنة."); return; }
    await compareVersionPair(versionFrom, versionTo);
  };
  useEffect(() => {
    if (approveCard !== "versions" || versions.length < 2) return;
    const chronological=[...versions].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
    const index=Math.max(1,Math.min(chronological.length-1,versionScrubIndex));
    const timer=window.setTimeout(()=>{void compareVersionPair(String(chronological[index-1].id),String(chronological[index].id),true);},220);
    return()=>window.clearTimeout(timer);
  },[versionScrubIndex,approveCard,versions.length]);
  const addOpenDecision = async () => {
    const title=decisionTitle.trim(); if(title.length<3)return;
    setBusy(true);
    try{
      await fetchJson("/api/intelligence/open-decisions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionId,termId,title,priority:"medium",source:"manual"})});
      setDecisionTitle("");setDecisionCompose(false);
      setDecisionInbox(await fetchJson(`/api/intelligence/open-decisions?${contextQuery}`));
    }catch(e:any){setError(smartMessage(e));}finally{setBusy(false);}
  };
  const closeOpenDecision = async (item:any) => {
    if(!item?.id||String(item.id).startsWith("inferred:"))return;
    try{
      await fetchJson(`/api/intelligence/open-decisions/${encodeURIComponent(item.id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionId,termId,status:item.status==="done"?"open":"done"})});
      setDecisionInbox(await fetchJson(`/api/intelligence/open-decisions?${contextQuery}`));
    }catch(e:any){setError(smartMessage(e));}
  };
  const proposeUnwrittenRule = async (rule:any) => {
    if(!rule?.title)return;
    setBusy(true);
    try{
      await fetchJson("/api/intelligence/open-decisions",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionId,termId,title:`قاعدة مقترحة: ${String(rule.title).slice(0,110)}`,detail:`مكتشفة من التاريخ بثقة ${Number(rule.confidence||0)}٪ · ${String(rule.detail||"").slice(0,220)}`,priority:Number(rule.confidence||0)>=90?"high":"medium",source:"assistant"})});
      setDecisionInbox(await fetchJson(`/api/intelligence/open-decisions?${contextQuery}`));
      setMessage("أُضيفت القاعدة المقترحة إلى دفتر القرارات للمراجعة.");
    }catch(e:any){setError(smartMessage(e));}finally{setBusy(false);}
  };
  const runPolicy = async () => {
    setPolicyBusy(true);setError(null);
    try{
      setPolicyResult(await fetchJson("/api/intelligence/policy-simulate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({collegeId,sectionId,termId,...policyDraft,scope:isPowerAdmin?policyDraft.scope:"department"})}));
    }catch(e:any){setError(smartMessage(e));}finally{setPolicyBusy(false);}
  };
  const compareTerms = async () => {
    if (!compareFrom || !compareTo) return;
    setBusy(true);
    try {
      const p = new URLSearchParams({
        collegeId: String(collegeId),
        sectionId: String(sectionId),
        fromTermId: String(compareFrom),
        toTermId: String(compareTo),
      });
      setTermCompare(await fetchJson(`/api/intelligence/compare-terms?${p}`));
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const loadRoom = async (room: any) => {
    setBusy(true);
    try {
      const p = new URLSearchParams({
        code: room.code,
        hall: room.hall,
        termId: String(termId),
      });
      setDetail({
        type: "room",
        data: await fetchJson(`/api/intelligence/room?${p}`),
      });
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const loadProfessor = async (prof: any) => {
    setBusy(true);
    try {
      setDetail({
        type: "professor",
        data: await fetchJson(
          `/api/intelligence/professor/${prof.id}?termId=${termId}`,
        ),
      });
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const importExcel = async (file: File) => {
    setImportFile(file.name);
    setImportPreview(null);
    setBusy(true);
    setError(null);
    try {
      // The spreadsheet parser is ~400KB. It loads the first time someone
      // actually imports a file, not on every page view.
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const d = await fetchJson("/api/intelligence/import-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, rows: data }),
      });
      setImportPreview(d);
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const createImportDraft = async () => {
    if (!importPreview?.valid) return;
    const d = await saveDraft("import", importPreview.rows);
    if (d) {
      setImportPreview(null);
      setTab("history");
    }
  };

  const scopedCourses = useMemo(
    () => sortByName(
      courses.filter((c) => c.AdCollegeId === collegeId && c.AdSectionId === sectionId),
      (c: any) => c.CourseName,
    ),
    [courses, collegeId, sectionId],
  );
  const reloadConstraints = async () =>
    setConstraints(
      await fetchJson(`/api/intelligence/constraints?${contextQuery}`),
    );
  const createConstraint = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/intelligence/constraints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          ...constraintDraft,
        }),
      });
      await reloadConstraints();
      setMessage(
        "تمت إضافة القاعدة إلى لوحة القيود. ستدخل فوراً في تقييم النسخة التجريبية وغرفة القرار والتحسين الآلي.",
      );
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const toggleConstraint = async (c: any) => {
    try {
      await fetchJson(`/api/intelligence/constraints/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          enabled: !c.enabled,
        }),
      });
      await reloadConstraints();
    } catch (e: any) {
      setError(smartMessage(e));
    }
  };
  const deleteConstraint = async (c: any) => {
    if (!(await visualConfirm({ title: `حذف القاعدة «${c.label}»`, message: "ستُحذف هذه القاعدة من لوحة القيود.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    try {
      await fetchJson(`/api/intelligence/constraints/${c.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId }),
      });
      await reloadConstraints();
    } catch (e: any) {
      setError(smartMessage(e));
    }
  };
  const runWarRoom = async () => {
    setWarBusy(true);
    setError(null);
    try {
      setWarRoom(
        await fetchJson("/api/intelligence/war-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collegeId,
            sectionId,
            termId,
            rowId: warRowId || undefined,
          }),
        }),
      );
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setWarBusy(false);
    }
  };
  const runAutopilot = async () => {
    setAutopilotBusy(true);
    setError(null);
    try {
      setAutopilot(
        await fetchJson("/api/intelligence/autopilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collegeId,
            sectionId,
            termId,
            goal: autopilotGoal,
          }),
        }),
      );
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setAutopilotBusy(false);
    }
  };
  const openScenarioOption = async (option: any) => {
    setActiveDraftId(null);
    setScenario(option.rows.map((r: any) => ({ ...r })));
    setScenarioId(option.rows[0]?.id || "");
    setInnovationMode("constraints");
    await evaluateScenario(option.rows);
    setTwinCard("board");
  };
  const saveOptionAsDraft = async (option: any, label: string) => {
    const d = await saveDraft(
      "auto",
      option.rows,
      `${label} — ${new Date().toLocaleString("ar-KW-u-nu-latn")}`,
    );
    if (d)
      setMessage(
        `${label} أصبح مسودة فقط. لم يُنشر أي تغيير على الجدول الحقيقي.`,
      );
  };

  const openScheduleWorkspace = (message?: string) => {
    if (message) sessionStorage.setItem("schedule-return-note", message);
    sessionStorage.setItem("schedule-command", "focus");
    window.location.assign("/FSchedule/Index");
  };

  const scopedContext = resolveScopeSelection(scopes, collegeId, isPowerAdmin);
  const contextColleges = isPowerAdmin ? colleges : colleges.filter((college) => resolveScopeSelection(scopes, 0, false).collegeIds.includes(Number(college.AdCollegeId)));
  const ContextBar = () => (
    <IntelligenceContextBar
      collegeId={collegeId}
      sectionId={sectionId}
      termId={termId}
      colleges={contextColleges}
      sections={sections}
      availableSections={availableSections}
      terms={terms}
      online={online}
      lockCollege={scopedContext.lockCollege}
      lockSection={scopedContext.lockSection}
      hideSection={!isPowerAdmin}
      onCollegeChange={(nextCollegeId, firstSectionId) => {
        setCollegeId(nextCollegeId);
        setSectionId(nextCollegeId ? (isPowerAdmin ? firstSectionId : (resolveScopeSelection(scopes, nextCollegeId, false).defaultSectionId || firstSectionId)) : 0);
      }}
      onSectionChange={setSectionId}
      onTermChange={setTermId}
    />
  );
  const scene: "understand" | "try" | "approve" =
    tab === "command" || tab === "copilot"
      ? "understand"
      : tab === "history"
        ? "approve"
        : "try";
  const changeScene = (value: string) =>
    setTab(
      value === "understand" ? "command" : value === "try" ? "twin" : "history",
    );

  const intelligenceGuideTask = useMemo(() => tab === "copilot" ? ({
    title: "اسأل الجدول",
    featureId: "intelligence.ask-table",
    target: "intelligence.ask-table",
    command: { scope: "intelligence", type: "tab", value: "copilot" },
  }) : ({
    title: scene === "understand" ? "فهم حالة الجدول" : scene === "try" ? "تجربة السيناريو" : "اعتماد القرار",
    featureId: scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve",
    target: scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve",
    command: { scope: "intelligence", type: "scene", value: scene },
  }), [scene, tab]);
  const intelligenceGuideSummary = !collegeId || !termId
    ? "اختر الكلية والفصل أولًا ليبدأ مركز الذكاء في القراءة والتجربة والاعتماد."
    : scene === "understand"
      ? "أنت الآن داخل «افهم» لقراءة الجودة والضغط والأسئلة الذكية."
      : scene === "try"
        ? "أنت الآن داخل «جرّب» لتجربة ماذا لو؟ دون لمس الجدول الحقيقي."
        : "أنت الآن داخل «اعتمد» لمقارنة النسخ وتثبيت القرار النهائي.";
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-context", {
      detail: {
        scope: "intelligence",
        view: "intelligence",
        title: "مركز الذكاء",
        collegeId: collegeId || undefined,
        sectionId: sectionId || undefined,
        termId: termId || undefined,
        currentFeatureId: tab === "copilot" ? "intelligence.ask-table" : scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve",
        summary: intelligenceGuideSummary,
        placeLabel: scene === "understand" ? "افهم" : scene === "try" ? "جرّب" : "اعتمد",
        stageLabel: scene === "understand" ? "افهم" : scene === "try" ? "جرّب" : "اعتمد",
        scopeLabel: [colleges.find(item => item.AdCollegeId === collegeId)?.AdCollegeName, terms.find(item => item.AdTermId === termId)?.AdTermName].filter(Boolean).join(" · "),
        whatHappens: intelligenceGuideSummary,
        currentTask: intelligenceGuideTask,
        metrics: { isExpert: false },
        detectedHelp: !collegeId || !termId
          ? {
              title: "ابدأ من النطاق أولًا",
              detail: "اختر الكلية والفصل، وبعد ذلك سيعرف المرشد ما الذي يعرضه لك في هذا المركز.",
              level: "soft",
            }
          : null,
      },
    }));
  }, [collegeId, colleges, intelligenceGuideSummary, intelligenceGuideTask, scene, sectionId, tab, termId, terms]);
  useEffect(() => {
    const onGuideCommand = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.scope !== "intelligence") return;
      const featureId = String(detail.featureId || "");
      if (detail.type === "scene" && detail.value) {
        const value=String(detail.value);
        if (featureId) intelligenceGuideOperationRef.current={ featureId, transactionId:detail.transactionId ? String(detail.transactionId) : undefined, startedAt:Date.now(), expected:value === "understand" ? "intelligence.scene.understand" : value === "try" ? "intelligence.scene.try" : "intelligence.scene.approve" };
        changeScene(value);
      }
      if (detail.type === "tab" && detail.value && ["command","copilot","twin","history","import"].includes(String(detail.value))) {
        const value=String(detail.value);
        if (featureId) intelligenceGuideOperationRef.current={ featureId, transactionId:detail.transactionId ? String(detail.transactionId) : undefined, startedAt:Date.now(), expected:value === "copilot" ? "intelligence.ask-table" : featureId };
        setTab(value as Tab);
      }
    };
    window.addEventListener("schedule-smart-guide-command", onGuideCommand as EventListener);
    return () => window.removeEventListener("schedule-smart-guide-command", onGuideCommand as EventListener);
  }, []);
  useEffect(() => {
    const operation=intelligenceGuideOperationRef.current;
    if(!operation)return;
    const current=tab === "copilot" ? "intelligence.ask-table" : scene === "understand" ? "intelligence.scene.understand" : scene === "try" ? "intelligence.scene.try" : "intelligence.scene.approve";
    if(current!==operation.expected)return;
    intelligenceGuideOperationRef.current=null;
    window.dispatchEvent(new CustomEvent("schedule-smart-guide-action-result",{detail:{featureId:operation.featureId,ok:true,signal:current,transactionId:operation.transactionId,durationMs:Date.now()-operation.startedAt,stepCount:1}}));
  }, [scene,tab]);
  useEffect(() => {
    if (!rows.length || !collegeId || !termId) return;
    let request: any = null;
    try { request = JSON.parse(sessionStorage.getItem("schedule-guide-simulation") || "null"); } catch {}
    if (!request || Date.now() - Number(request.createdAt || 0) > 10 * 60 * 1000) return;
    try { sessionStorage.removeItem("schedule-guide-simulation"); } catch {}
    const run = async () => {
      const copy = rows.map((row) => ({ ...row }));
      const requestedId = Number(request.selectedId || 0);
      const selectedId = requestedId && copy.some(row => Number(row.id) === requestedId) ? requestedId : Number(copy[0]?.id || 0);
      const index = copy.findIndex(row => Number(row.id) === selectedId);
      const before = index >= 0 ? { ...copy[index] } : null;
      const intent = request.intent || {};
      if (before && index >= 0) {
        const after:any = { ...before };
        const day = String(intent?.entities?.day || "");
        if (["fsunday","fmonday","ftuesday","fwednesday","fthursday"].includes(day)) {
          ["fsunday","fmonday","ftuesday","fwednesday","fthursday"].forEach(key => { after[key] = key === day; });
        }
        const time = String(intent?.entities?.time || "");
        if (/^\d{2}:\d{2}$/.test(time)) {
          const toMinutes = (value:string) => { const [h,m]=String(value||"0:0").split(":").map(Number); return h*60+m; };
          const fromMinutes = (value:number) => `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
          const duration = Math.max(30, toMinutes(before.fendtime) - toMinutes(before.fstarttime));
          after.fstarttime = time;
          after.fendtime = fromMinutes(Math.min(23*60+59, toMinutes(time) + duration));
        }
        if (intent?.entities?.room) after.AdRoomCode = String(intent.entities.room);
        if (intent?.constraints?.findAlternativeRoom && !intent?.entities?.room) {
          const activeDays = ["fsunday","fmonday","ftuesday","fwednesday","fthursday"].filter(key => Boolean(after[key]));
          const toMinutes = (value:string) => { const [h,m]=String(value||"0:0").split(":").map(Number); return h*60+m; };
          const start = toMinutes(after.fstarttime);
          const end = toMinutes(after.fendtime);
          const unique = new Map<string,{code:string;hall:string}>();
          (overview?.rooms || []).forEach((room:any) => {
            const code=String(room?.code||"").trim(), hall=String(room?.hall||"").trim();
            if(code&&hall) unique.set(`${code}|${hall}`,{code,hall});
          });
          copy.forEach((row:any) => {
            const code=String(row?.AdRoomCode||"").trim(), hall=String(row?.AdRoomHall||"").trim();
            if(code&&hall) unique.set(`${code}|${hall}`,{code,hall});
          });
          const occupied = (room:{code:string;hall:string}) => copy.some((row:any,rowIndex:number) => {
            if(rowIndex===index) return false;
            if(String(row.AdRoomCode||"").trim()!==room.code || String(row.AdRoomHall||"").trim()!==room.hall) return false;
            if(!activeDays.some(day => Boolean(row[day]))) return false;
            const rowStart=toMinutes(row.fstarttime), rowEnd=toMinutes(row.fendtime);
            return start < rowEnd && end > rowStart;
          });
          const candidates=[...unique.values()]
            .filter(room => !(room.code===String(before.AdRoomCode||"").trim() && room.hall===String(before.AdRoomHall||"").trim()))
            .filter(room => !occupied(room))
            .sort((a,b) => {
              const aSame=a.code===String(before.AdRoomCode||"").trim()?0:1;
              const bSame=b.code===String(before.AdRoomCode||"").trim()?0:1;
              return aSame-bSame || a.code.localeCompare(b.code,"ar") || a.hall.localeCompare(b.hall,"ar");
            });
          if(candidates[0]) {
            after.AdRoomCode=candidates[0].code;
            after.AdRoomHall=candidates[0].hall;
          }
        }
        if (Number(intent?.entities?.instructorId || 0) && !intent?.constraints?.keepInstructor) after.AdInstructorId = Number(intent.entities.instructorId);
        copy[index] = after;
        setGuideSimulationMeta({ before, after:{...after}, request });
        try { sessionStorage.setItem("schedule-guide-ghost-preview", JSON.stringify({ id:before.id, before, after, createdAt:Date.now() })); } catch {}
      }
      setActiveDraftId(null);
      setScenario(copy);
      setScenarioId(selectedId || "");
      setTab("twin");
      setTwinCard("board");
      await evaluateScenario(copy);
      const subject = String(request.selectedCourse || "").trim();
      const taskLabel = request.task === "move-room" || request.task === "schedule.action.move-room" ? "نقل القاعة" : request.task === "change-time" || request.task === "schedule.action.change-time" ? "تغيير الوقت" : request.task === "change-instructor" || request.task === "schedule.action.change-instructor" ? "تغيير الأستاذ" : "التغيير المطلوب";
      setMessage(`${subject ? `أنشأت نسخة تجريبية للمقرر «${subject}»` : "أنشأت نسخة تجريبية من الجدول"} وطبقت فيها ${taskLabel}. الجدول الحقيقي لم يتغير.`);
    };
    void run();
  }, [collegeId, overview?.rooms, rows, sectionId, termId]);
  const insightScenes: Array<{
    value: InsightScene;
    label: string;
    detail: string;
    metric: string;
    icon: React.ReactNode;
  }> = overview
    ? [
        {
          value: "quality",
          label: "الجودة والجاهزية",
          detail: readinessLabel,
          metric: `${overview.score}/100`,
          icon: <Gauge />,
        },
        {
          value: "approval",
          label: "قبل الاعتماد",
          detail: "ما يمنع النشر، ومتى نُشر آخر مرة",
          metric: String(overview.blockers ?? overview.metrics?.criticalConflicts ?? 0),
          icon: <ShieldCheck />,
        },
        {
          value: "attention",
          label: "الانتباه",
          detail: "المواضع التي تستحق قرارك أولاً",
          metric: String(overview.alerts?.length || 0),
          icon: <AlertTriangle />,
        },
        {
          value: "density",
          label: "الكثافة",
          detail: "شكل الضغط عبر الأيام والأوقات",
          metric: String(
            Math.max(
              0,
              ...heatData.map((item: any) => Number(item.count) || 0),
            ),
          ),
          icon: <BarChart3 />,
        },
        ...(overview.spatialBurnout
          ? [
              {
                value: "spatial" as const,
                label: "الحركة المكانية",
                detail: "راحة الانتقال بين المباني والقاعات",
                metric: `${overview.spatialBurnout.score}/100`,
                icon: <Building2 />,
              },
            ]
          : []),
        {
          value: "rooms",
          label: "القاعات",
          detail: "الاستخدام والنوافذ المتاحة",
          metric: String(overview.rooms?.length || 0),
          icon: <Building2 />,
        },
        {
          value: "professors",
          label: "الأساتذة",
          detail: "الحمل الأسبوعي والفراغات الطويلة",
          metric: String(overview.professorLoads?.length || 0),
          icon: <UsersRound />,
        },
        ...(isPowerAdmin ? [{
          value: "health" as const,
          label: "صحة البيانات",
          detail: "النواقص والتكرار قبل أن تصبح مشكلة",
          metric: overview.dataHealth?.healthy
            ? "سليمة"
            : String(overview.dataHealth?.invalidRows || 0),
          icon: <CheckCircle2 />,
        }] : []),
        ...(demand
          ? [
              {
                value: "students" as const,
                label: "طلبات الطلاب",
                detail: "كم شعبة نفتح، وأين نضعها",
                metric: String(demand.respondents
                  || demand.openings?.proposals?.reduce((sum: number, item: any) => sum + item.needed, 0)
                  || demand.repairs?.length || demand.pairs?.length || demand.prediction?.pairs?.length || 0),
                icon: <UsersRound />,
              },
            ]
          : []),
        ...(genome
          ? [
              {
                value: "genome" as const,
                label: "بصمة القسم",
                detail: "النمط المتكرر عبر الفصول",
                metric:
                  genome.compatibility == null
                    ? "—"
                    : `${genome.compatibility}%`,
                icon: <Dna />,
              },
            ]
          : []),
      ]
    : [];
  /* Escape closes an open reading, exactly as it closes every other overlay
     on this workspace. */
  useEffect(() => {
    if (!insightScene) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setInsightScene(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [insightScene]);

  const activeInsight = insightScenes.find((item) => item.value === insightScene) || null;
  const activeInsightKey = activeInsight?.value || "";
  const chronologicalVersions = useMemo(() => [...versions].sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))), [versions]);
  const versionActivityHeatmap = useMemo(() => {
    const labels=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"],hours=Array.from({length:16},(_,i)=>i+7),counts=new Map<string,number>();
    versions.forEach(version=>{const stamp=new Date(version.createdAt);if(Number.isNaN(stamp.getTime()))return;const hour=stamp.getHours();if(hour<7||hour>22)return;const key=`${stamp.getDay()}-${hour}`;counts.set(key,(counts.get(key)||0)+1);});
    const max=Math.max(0,...counts.values());
    return{labels,hours,max,cells:labels.map((label,day)=>({label,hours:hours.map(hour=>({hour,count:counts.get(`${day}-${hour}`)||0}))}))};
  },[versions]);

  const handleDividerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const stage = e.currentTarget.parentElement;
    if (!stage) return;

    const updatePosition = (clientX: number) => {
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0) return;
      const offset = clientX - rect.left;
      const pct = Math.max(0, Math.min(100, Math.round((offset / rect.width) * 100)));
      setTimeTravel(pct);
    };

    const handlePointerMove = (ev: PointerEvent) => {
      updatePosition(ev.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };
  const moveInsightFocus = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let next = index;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = (index + 1) % insightScenes.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = (index - 1 + insightScenes.length) % insightScenes.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = insightScenes.length - 1;
    else return;
    event.preventDefault();
    const value = insightScenes[next]?.value;
    if (!value) return;
    showScene(value);
    window.requestAnimationFrame(() =>
      document.getElementById(`insight-tab-${value}`)?.focus(),
    );
  };

  return (
    <div className={`content-stack intelligence-page scene-${scene} visual-minimal`}>
      <PageTitle
        eyebrow="ذكاء الجدول"
        subtitle="افهم · جرّب · اعتمد"
      >
        مركز الذكاء
      </PageTitle>
      <ContextBar />
      {guideSimulationMeta ? (
        <section className="guide-simulation-brief no-print">
          <header><ShieldCheck aria-hidden="true" /><div><small>محاكاة حقيقية · لا حفظ</small><strong>{guideSimulationMeta.before.AdCourseName || "المقرر المحدد"}</strong></div></header>
          <div className="guide-simulation-flow">
            <span><small>قبل</small><b>{Object.keys(dayLabels).filter(key => (guideSimulationMeta.before as any)[key]).map(key => (dayLabels as any)[key]).join(" · ") || "—"}</b><em>{formatScheduleTimeRange(guideSimulationMeta.before.fstarttime, guideSimulationMeta.before.fendtime)}</em></span>
            <ChevronLeft aria-hidden="true" />
            <span className="after"><small>بعد</small><b>{Object.keys(dayLabels).filter(key => (guideSimulationMeta.after as any)[key]).map(key => (dayLabels as any)[key]).join(" · ") || "—"}</b><em>{formatScheduleTimeRange(guideSimulationMeta.after.fstarttime, guideSimulationMeta.after.fendtime)}</em></span>
          </div>
          <p>{scenarioEval?.scenario?.conflicts || scenarioEval?.scenario?.conflictCount ? "توجد آثار تحتاج مراجعة في النسخة التجريبية." : "النسخة التجريبية جاهزة للمقارنة، والجدول الحقيقي لم يتغير."}</p>
          <footer>
            <button type="button" onClick={async () => {
              if (!scenario || !guideSimulationMeta) return;
              const copy=scenario.map(item=>({...item})); const index=copy.findIndex(item=>item.id===guideSimulationMeta.after.id); if(index<0)return;
              const before={...copy[index]}; const after:any={...before};
              const toMinutes=(value:string)=>{const [h,m]=String(value||"0:0").split(":").map(Number);return h*60+m;}; const fromMinutes=(value:number)=>`${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;
              const duration=Math.max(30,toMinutes(before.fendtime)-toMinutes(before.fstarttime)); const nextStart=fromMinutes(Math.min(22*60,toMinutes(before.fstarttime)+30)); after.fstarttime=nextStart; after.fendtime=fromMinutes(toMinutes(nextStart)+duration); copy[index]=after; setScenario(copy); setGuideSimulationMeta(current=>current?{...current,after}:current); await evaluateScenario(copy);
            }}>جرّب بديلًا</button>
            <button type="button" onClick={() => { try { sessionStorage.setItem("schedule-guide-ghost-preview", JSON.stringify({ id:guideSimulationMeta.before.id, before:guideSimulationMeta.before, after:guideSimulationMeta.after, createdAt:Date.now() })); } catch {} openScheduleWorkspace("هذه معاينة من مساحة «جرّب». راجعها على الجدول ثم اعتمدها يدويًا إذا رغبت."); }}>معاينة على الجدول</button>
            <button type="button" data-guide-ignore="يحفظ المحاكاة كمسودة تجريبية فقط ولا ينشر أي تغيير حقيقي" className="primary" onClick={async () => { if(!scenario)return; const draft=await saveDraft("guide-simulation",scenario,"محاكاة المرشد"); if(draft)setMessage("حُفظ الحل كمسودة فقط. راجعه في «اعتمد» قبل أي نشر."); }}>اعتماد كمسودة</button>
          </footer>
        </section>
      ) : null}
      {!collegeId || !termId ? (
        <Surface className="intel-context-idle" aria-live="polite">
          <Target aria-hidden="true" />
          <div><strong>اختر الكلية والفصل</strong><span>تبدأ القراءات بعد تحديد النطاق؛ لا يوجد اختيار تلقائي.</span></div>
        </Surface>
      ) : null}
      <nav className="intelligence-scenes no-print" aria-label="مراحل مركز الذكاء">
        <Segmented
          value={scene}
          onChange={changeScene}
          options={[
            {
              value: "understand",
              label: (
                <span data-guide-target="intelligence.scene.understand">
                  <BrainCircuit /> افهم
                </span>
              ),
            },
            {
              value: "try",
              label: (
                <span data-guide-target="intelligence.scene.try">
                  <Network /> جرّب
                </span>
              ),
            },
            {
              value: "approve",
              label: (
                <span data-guide-target="intelligence.scene.approve">
                  <ShieldCheck /> اعتمد
                </span>
              ),
            },
          ]}
        />
        <span className="scene-caption">
          {scene === "understand"
            ? "جودة · تنبيهات · قاعات · أساتذة"
            : scene === "try"
              ? "تجريبي · خارج الجدول الحقيقي"
              : "مسودات · نشر · نسخ · تراجع"}
        </span>
      </nav>
      {scene === "understand" ? (
        <nav className="scene-subnav no-print" aria-label="أدوات الفهم">
          <button
            type="button"
            className={tab === "command" ? "active" : ""}
            aria-pressed={tab === "command"}
            onClick={() => setTab("command")}
          >
            <Gauge /> قراءة القرار
          </button>
          <button
            type="button"
            data-guide-target="intelligence.ask-table"
            className={tab === "copilot" ? "active" : ""}
            aria-pressed={tab === "copilot"}
            onClick={() => setTab("copilot")}
          >
            <BrainCircuit /> اسأل الجدول
          </button>
        </nav>
      ) : scene === "try" ? (
        <nav className="scene-subnav no-print" aria-label="أدوات التجربة">
          <button
            type="button"
            className={tab === "twin" ? "active" : ""}
            aria-pressed={tab === "twin"}
            onClick={() => setTab("twin")}
          >
            <Network /> النسخة التجريبية
          </button>
          <button
            type="button"
            data-guide-ignore="تبويب فرعي داخل مساحة جرّب وتغطيه ميزة مركز الذكاء"
            className={tab === "import" ? "active" : ""}
            aria-pressed={tab === "import"}
            onClick={() => setTab("import")}
          >
            <FileSpreadsheet /> استيراد آمن
          </button>
        </nav>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice type="success">{message}</Notice> : null}
      {loading && !overview ? (
        <div className="intel-loading" role="status" aria-live="polite">
          <span />
          <strong>أقرأ الجدول وأبني صورة القرار...</strong>
        </div>
      ) : null}

      {tab === "command" && overview ? (
        <div className="intel-command-grid intel-insight-workspace">
          <nav
            className="insight-preview-rail no-print"
            aria-label="مشاهد قراءة القرار"
          >
            <div className="insight-preview-head">
              <span className="surface-kicker">مشاهد الذكاء</span>
              <strong>اختر قراءة</strong>
              <small>كل قراءة تفتح صفحتها — رقم واحد أولاً، ثم التفاصيل.</small>
            </div>
            <div className="insight-preview-list" role="list">
              {insightScenes.map((item, index) => {
                const selected = activeInsightKey === item.value;
                return (
                  <button
                    type="button"
                    key={item.value}
                    id={`insight-tab-${item.value}`}
                    className={`insight-preview ${selected ? "active" : ""}`}
                    role="listitem"
                    aria-label={`${item.label} — ${item.detail}`}
                    onClick={() => showScene(item.value)}
                    onKeyDown={(event) => moveInsightFocus(event, index)}
                  >
                    <span className="insight-preview-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="insight-preview-copy">
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <b>{item.metric}</b>
                  </button>
                );
              })}
            </div>
          </nav>
          {/*
            ── القراءة صفحة، لا قسم أسفل الصفحة ──────────────────────────────
            Tabs were not enough, and the reason is simple: a panel is a
            thousand pixels tall, so switching between them still felt like
            scrolling one long page. A reading opens as its own page over the
            dashboard now, with a way back — the dashboard stays one place, and
            nothing is ever under anything else.
          */}
          <section
            className={`insight-canvas${activeInsight ? " open" : ""}`}
            aria-label={activeInsight?.label || "قراءة القرار"}
            aria-hidden={activeInsight ? undefined : true}
          >
            {activeInsight ? (
              <header className="insight-page-head">
                <button type="button" className="insight-back" onClick={() => showScene(null)}>
                  <ChevronLeft aria-hidden="true" />
                  العودة إلى مركز القراءات
                </button>
                <div className="insight-page-title">
                  <span className="surface-kicker">{activeInsight.detail}</span>
                  <span className="insight-title-line"><strong>{activeInsight.label}</strong><b className="insight-page-metric"><Num value={activeInsight.metric} /></b></span>
                </div>
              </header>
            ) : null}
            <p className="sr-only" role="status" aria-live="polite">
              المشهد الحالي: {activeInsight?.label}. {activeInsight?.detail}
            </p>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-quality"
              role="tabpanel"
              aria-labelledby="insight-tab-quality"
              hidden={activeInsightKey !== "quality"}
              tabIndex={activeInsightKey === "quality" ? 0 : -1}
            >
          <Surface className="quality-hero">
            <div
              className="quality-orbit"
              style={{ "--score": `${overview.score}%` } as React.CSSProperties}
            >
              <div>
                <Num value={overview.score} className="quality-orbit-score" />
                <small>من 100</small>
              </div>
            </div>
            <div className="quality-copy">
              <span className="surface-kicker">مؤشر جودة الجدول</span>
              <h2>{readinessLabel}</h2>
              <p>
                الدرجة تجمع موانع الاعتماد، فراغات الأساتذة، توازن الأيام، الأوقات
                المتأخرة وصحة البيانات.
              </p>
              {/*
                Where the hundred went.
                The old row printed "-0" beside every factor that cost nothing,
                which reads as an error and says nothing: a minus sign in front
                of zero is not a deduction. Each factor is now a bar showing how
                much of the score it took, the ones that took nothing say so in
                words, and the whole row adds up to the number in the ring.
              */}
              <details className="insight-disclosure quality-breakdown">
                <summary>كيف تكوّنت الدرجة؟</summary>
                <div
                  className="quality-factors"
                  role="img"
                  aria-label="توزيع نقاط الجودة"
                >
                  {overview.factors.map((f: any) => {
                    const cost = Math.max(0, Number(f.penalty) || 0);
                    return (
                      <span key={f.label} className={cost ? "costly" : "clean"}>
                        <em>{f.label}</em>
                        <i aria-hidden="true">
                          <b
                            style={{ width: `${Math.min(100, cost * 2)}%` }}
                          />
                        </i>
                        <u>{cost ? `−${cost}` : "سليم"}</u>
                      </span>
                    );
                  })}
                </div>
              </details>
            </div>
            <div className="quality-actions">
              <PrimaryButton onClick={autoSchedule} disabled={busy}>
                <WandSparkles /> تحسين تلقائي
              </PrimaryButton>
              <SecondaryButton onClick={() => setTab("copilot")}>
                <BrainCircuit /> اسأل المساعد
              </SecondaryButton>
            </div>
          </Surface>
            </div>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-approval"
              role="tabpanel"
              aria-labelledby="insight-tab-approval"
              hidden={activeInsightKey !== "approval"}
              tabIndex={activeInsightKey === "approval" ? 0 : -1}
            >
          <Surface className="approval-center">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">قبل الاعتماد</span>
                <h2>مركز القيادة</h2>
              </div>
              <ShieldCheck />
            </div>
            <div className="approval-metrics">
              <article
                className={overview.metrics.criticalConflicts ? "danger" : "ok"}
              >
                <strong>{overview.metrics.criticalConflicts}</strong>
                <span>موضع يحتاج تحقق</span>
              </article>
              <article>
                <strong>{overview.metrics.invalidRows}</strong>
                <span>سجل يحتاج مراجعة</span>
              </article>
              <article>
                <strong>{overview.draftCount}</strong>
                <span>مسودة داخلية</span>
              </article>
              <article>
                <strong>{overview.metrics.avgInstructorGap}</strong>
                <span>دقيقة متوسط الفراغ</span>
              </article>
            </div>
            <div className="approval-status approval-status-grid">
              <article className={overview.metrics.criticalConflicts ? "blocked" : "ready"}>
                <small>حالة الاعتماد</small>
                <strong>{overview.metrics.criticalConflicts ? "يمنع الاعتماد" : "جاهز للاعتماد"}</strong>
                <span>{overview.metrics.criticalConflicts ? `${overview.metrics.criticalConflicts.toLocaleString("ar-KW-u-nu-latn")} موضع يحتاج تحقق` : "لا توجد موانع اعتماد ظاهرة"}</span>
              </article>
              <article className="publication-state">
                <small>حالة النشر</small>
                <strong>{overview.publication ? "تم النشر" : "لم يُنشر بعد"}</strong>
                <span>{overview.publication ? new Date(overview.publication.publishedAt).toLocaleString("ar-KW-u-nu-latn") : "النشر مستقل عن نتيجة الاعتماد"}</span>
              </article>
            </div>
          </Surface>
            </div>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-attention"
              role="tabpanel"
              aria-labelledby="insight-tab-attention"
              hidden={activeInsightKey !== "attention"}
              tabIndex={activeInsightKey === "attention" ? 0 : -1}
            >
          <Surface className="attention-center">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">يحتاج انتباهك</span>
                <h2>تنبيهات ذكية</h2>
              </div>
              <AlertTriangle />
            </div>
            <div className="smart-alerts">
              {overview.alerts.slice(0, 3).map((a: any, i: number) => {
                const icon = /اعتماد|تعارض|حجز|مزدوج/.test(a.title) ? <ShieldAlert />
                  : /فراغ|موعد|وقت/.test(a.title) ? <CalendarClock />
                  : /توزيع|أيام/.test(a.title) ? <BarChart3 />
                  : a.severity === "ok" ? <CheckCircle2 /> : <AlertTriangle />;
                return (
                  <article key={i} className={`smart-alert-card ${a.severity}`}>
                    <span className="smart-alert-icon">{icon}</span>
                    <div><strong>{a.title}</strong><p>{a.detail}</p></div>
                  </article>
                );
              })}
            </div>
            {overview.alerts.length > 3 ? (
              <details className="insight-disclosure alert-disclosure">
                <summary>
                  عرض {overview.alerts.length - 3} تنبيهات إضافية
                </summary>
                <div className="smart-alerts">
                  {overview.alerts.slice(3).map((a: any, i: number) => (
                    <article key={i + 3} className={`smart-alert-card ${a.severity}`}>
                      <span className="smart-alert-icon"><AlertTriangle /></span>
                      <div><strong>{a.title}</strong><p>{a.detail}</p></div>
                    </article>
                  ))}
                </div>
              </details>
            ) : null}
          </Surface>
            </div>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-density"
              role="tabpanel"
              aria-labelledby="insight-tab-density"
              hidden={activeInsightKey !== "density"}
              tabIndex={activeInsightKey === "density" ? 0 : -1}
            >
          <Surface className="heatmap-card">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">خريطة الكثافة</span>
                <h2>
                  {heatMode === "university" ? "حركة الجامعة" : "حركة القسم"}
                </h2>
              </div>
              {isPowerAdmin ? (
                <Segmented
                  value={heatMode}
                  onChange={setHeatMode}
                  options={[
                    { value: "department", label: "القسم" },
                    { value: "university", label: "الجامعة" },
                  ]}
                />
              ) : null}
            </div>
            <div className="schedule-heatmap">
              <div className="heat-corner">الوقت</div>
              {Object.values(dayLabels).map((d: any) => (
                <strong key={d}>{d}</strong>
              ))}
              {heatTimes.map((time) => (
                <React.Fragment key={time}>
                  <span className="heat-time" dir="ltr">
                    {time}
                  </span>
                  {Object.keys(dayLabels).map((day) => {
                    const cell = heatData.find(
                      (x: any) => x.day === day && x.time === time,
                    );
                    const ratio = (cell?.count || 0) / heatMax;
                    return (
                      <span
                        key={`${day}-${time}`}
                        className="heat-cell"
                        style={{ "--heat": ratio } as React.CSSProperties}
                        role="img"
                        aria-label={`${dayLabels[day]}، الساعة ${time}، ${countOf(cell?.count || 0, AR.appointment)}`}
                        title={`${dayLabels[day]} ${time}: ${cell?.count || 0}`}
                      >
                        <i aria-hidden="true" />
                        {(cell?.count || 0) > 0 ? <b>{cell?.count}</b> : null}
                      </span>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
            <div className="heat-legend">
              <span>هادئ</span>
              <i />
              <i />
              <i />
              <i />
              <span>ذروة</span>
            </div>
            <details className="insight-disclosure">
              <summary>كيف وصلنا لهذه النتيجة؟</summary>
              <p className="insight-method">تُحسب الكثافة بعدّ المواعيد المتزامنة في كل خانة (يوم × ساعة) داخل النطاق المختار، ثم تُقارن كل خانة بالخانة الأعلى ازدحامًا لتحديد شدّة التلوين.</p>
            </details>
          </Surface>
            </div>
          {overview.spatialBurnout ? (
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-spatial"
              role="tabpanel"
              aria-labelledby="insight-tab-spatial"
              hidden={activeInsightKey !== "spatial"}
              tabIndex={activeInsightKey === "spatial" ? 0 : -1}
            >
            <Surface className="spatial-burnout-card">
              <div className="surface-head">
                <div>
                  <span className="surface-kicker">الحركة المكانية</span>
                  <h2>راحة الحركة</h2>
                </div>
                <Building2 />
              </div>
              <div className="spatial-score-row">
                <div className={`spatial-score ${overview.spatialBurnout.highRisk ? "danger" : overview.spatialBurnout.guardedRisk ? "guarded" : "safe"}`}>
                  <Num value={overview.spatialBurnout.score} suffix=" / 100" className="spatial-score-value" />
                  <small>{overview.spatialBurnout.highRisk ? "الحركة مرهقة" : overview.spatialBurnout.guardedRisk ? "تحتاج مراجعة" : "حركة مريحة"}</small>
                </div>
                <div className="spatial-metrics">
                  <article><span className="spatial-metric-icon"><AlertTriangle /></span><b><Num value={overview.spatialBurnout.highRisk} /></b><span>انتقال مرهق</span></article>
                  <article><span className="spatial-metric-icon"><CalendarClock /></span><b><Num value={overview.spatialBurnout.guardedRisk} /></b><span>انتقال ضيق</span></article>
                  <article><span className="spatial-metric-icon"><Building2 /></span><b><Num value={overview.roomCastling?.length || 0} /></b><span>تبديل آمن</span></article>
                </div>
              </div>
              {overview.spatialBurnout.risks?.length ? (
                <div className="spatial-risk-list">
                  {overview.spatialBurnout.risks.slice(0, 5).map((risk: any) => (
                    <article key={`${risk.instructorId}-${risk.day}-${risk.fromRowId}-${risk.toRowId}`} className={risk.level}>
                      <span className="risk-mark"><AlertTriangle /></span>
                      <div><strong>{risk.instructorName}</strong><small className="visual-flow-inline">{risk.dayLabel} · <b>{risk.fromBuilding}</b><ArrowLeftRight aria-hidden="true" /><b>{risk.toBuilding}</b></small></div>
                      <b>{risk.gapMinutes}د <small>متاح</small></b>
                      <span>{risk.requiredMinutes}د مطلوبة</span>
                    </article>
                  ))}
                </div>
              ) : <div className="spatial-clear"><CheckCircle2 /><div><strong>لا توجد انتقالات مرهقة</strong><span>الفواصل تستوعب زمن الحركة.</span></div></div>}
              {overview.roomCastling?.length ? (
                <div className="castling-strip castling-cards">
                  <div className="castling-head"><span className="castling-mark"><Building2 /></span><div><strong>تبديل القاعات</strong><span>اقتراحات أقرب دون تغيير الوقت</span></div></div>
                  <div className="castling-options">
                  {overview.roomCastling.slice(0, 3).map((proposal: any, index: number) => (
                    <button key={`${proposal.rowId}-${index}`} type="button" onClick={() => {
                      const changes = new Map((proposal.changes || []).map((c: any) => [Number(c.id), c]));
                      const next = rows.map(row => { const change: any = changes.get(Number(row.id)); return change ? { ...row, AdRoomCode: change.AdRoomCode, AdRoomHall: change.AdRoomHall } : row; });
                      setScenario(next); setScenarioEval(null); setTab("twin"); setTwinCard("board"); setMessage(`تم فتح «${proposal.title}» كتجربة فقط — لا شيء محفوظ.`);
                    }}>
                      <span className="castling-person"><UsersRound />{proposal.instructorName}</span>
                      <strong dir="ltr">{proposal.before.roomCode}/{proposal.before.roomHall} <ArrowLeftRight /> {proposal.after.roomCode}/{proposal.after.roomHall}</strong>
                      <small><CheckCircle2 /> متاح وآمن</small>
                      <ChevronLeft className="castling-open" />
                    </button>
                  ))}
                  </div>
                </div>
              ) : null}
              <details className="insight-disclosure">
                <summary>كيف وصلنا لهذه النتيجة؟</summary>
                <p className="insight-method">نقارن الفراغ المتاح بزمن الانتقال المطلوب بين المباني؛ كل انتقال أضيق من اللازم يخفض راحة الحركة.</p>
              </details>
            </Surface>
            </div>
          ) : null}
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-rooms"
              role="tabpanel"
              aria-labelledby="insight-tab-rooms"
              hidden={activeInsightKey !== "rooms"}
              tabIndex={activeInsightKey === "rooms" ? 0 : -1}
            >
          <Surface className="room-intelligence">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">ذكاء القاعات</span>
                <h2>القاعات الأكثر استخداماً</h2>
              </div>
              <Building2 />
            </div>
            <div className="intel-rank-list">
              {overview.rooms.slice(0, 8).map((r: any) => (
                <button key={r.key} onClick={() => loadRoom(r)}>
                  <span className="rank-icon">
                    <Building2 />
                  </span>
                  <div>
                    <strong>
                      {r.code} / {r.hall}
                    </strong>
                    <small>
                      {r.sessions} مواعيد · استخدام تقديري {r.utilization}%
                    </small>
                    <i>
                      <b style={{ width: `${r.utilization}%` }} />
                    </i>
                  </div>
                  <ChevronLeft />
                </button>
              ))}
            </div>
            <details className="insight-disclosure">
              <summary>كيف وصلنا لهذه النتيجة؟</summary>
              <p className="insight-method">الاستخدام التقديري لكل قاعة = ساعات إشغالها ÷ ساعات اليوم الرسمية (20:00 - 8:00) على مدى أيام النطاق، والترتيب حسب عدد المواعيد.</p>
            </details>
          </Surface>
            </div>
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-professors"
              role="tabpanel"
              aria-labelledby="insight-tab-professors"
              hidden={activeInsightKey !== "professors"}
              tabIndex={activeInsightKey === "professors" ? 0 : -1}
            >
          <Surface className="professor-intelligence">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">حمل أعضاء هيئة التدريس</span>
                <h2>حمل أعضاء هيئة التدريس</h2>
              </div>
              <UsersRound />
            </div>
            <div className="professor-load-list">
              {[...overview.professorLoads].sort((a: any, b: any) => new Intl.Collator("ar", { sensitivity: "base" }).compare(String(a.name || ""), String(b.name || ""))).map((p: any) => (
                <button key={p.id} onClick={() => loadProfessor(p)}>
                  <span className="prof-avatar">{p.name.trim().charAt(0)}</span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.weeklyHours} ساعة · {p.days} أيام
                    </small>
                  </div>
                  <span className={p.maxGap >= 180 ? "gap-warn" : ""}>
                    {p.maxGap
                      ? `${Math.floor(p.maxGap / 60)}س ${p.maxGap % 60}د فراغ`
                      : "بلا فراغ طويل"}
                  </span>
                  <ChevronLeft />
                </button>
              ))}
            </div>
            <details className="insight-disclosure">
              <summary>كيف وصلنا لهذه النتيجة؟</summary>
              <p className="insight-method">يجمع الحمل الساعات الأسبوعية وعدد أيام الحضور لكل عضو، مع أطول فراغٍ متصل بين محاضرتين في اليوم نفسه.</p>
            </details>
          </Surface>
            </div>
            {isPowerAdmin ? <div
              className="content-stack insight-scene-panel"
              id="insight-panel-health"
              role="tabpanel"
              aria-labelledby="insight-tab-health"
              hidden={activeInsightKey !== "health"}
              tabIndex={activeInsightKey === "health" ? 0 : -1}
            >
          <Surface className="data-health">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">صحة البيانات</span>
                <h2>صحة البيانات</h2>
              </div>
              <CheckCircle2 />
            </div>
            <div className={`health-verdict ${overview.dataHealth.healthy ? "ok" : "review"}`}>
              {overview.dataHealth.healthy ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
              <strong>{overview.dataHealth.healthy ? "سليمة" : "تحتاج مراجعة"}</strong>
            </div>
            {/* Three counts, read at a glance instead of a run-on line — each
                tile is quiet when zero and lit when it holds something. */}
            <div className="health-tiles">
              <article className={overview.dataHealth.invalidRows ? "hit" : ""}>
                <b>{Number(overview.dataHealth.invalidRows).toLocaleString("ar-KW-u-nu-latn")}</b>
                <span>ناقص</span>
              </article>
              <article className={overview.dataHealth.duplicates ? "hit" : ""}>
                <b>{Number(overview.dataHealth.duplicates).toLocaleString("ar-KW-u-nu-latn")}</b>
                <span>تكرار</span>
              </article>
              <article className={overview.dataHealth.unscheduledCourses ? "hit" : ""}>
                <b>{Number(overview.dataHealth.unscheduledCourses).toLocaleString("ar-KW-u-nu-latn")}</b>
                <span>مقرر بلا موعد</span>
              </article>
            </div>
            <div className="health-advanced-row">
              <article className={operationsReview?.anomalies?.length ? "hit" : ""}><span>منطقياً</span><b>{Number(operationsReview?.anomalies?.length||0).toLocaleString("ar-KW-u-nu-latn")}</b><small>شذوذ محتمل</small></article>
              <article className={experienceHealth?.score<75 ? "hit" : ""}><span>تجربة القسم</span><b>{experienceHealth?.score ?? "—"}</b><small>{experienceHealth?.label || "تُقاس مع الاستخدام"}</small></article>
              <article><span>زمن P95</span><b>{experienceHealth?.p95 ? `${experienceHealth.p95}ms` : "—"}</b><small>أبطأ 5٪</small></article>
              <article className={experienceHealth?.failures ? "hit" : ""}><span>أخطاء الواجهة</span><b>{experienceHealth?.failures ?? 0}</b><small>آخر 14 يوماً</small></article>
            </div>
            {operationsReview?.anomalies?.length ? <details className="insight-disclosure"><summary>الشذوذ المنطقي ({operationsReview.anomalies.length})</summary><ul className="health-anomaly-list">{operationsReview.anomalies.slice(0,6).map((item:any,index:number)=><li key={`${item.kind}-${item.rowId||index}`} className={item.severity}><strong>{item.title}</strong><span>{item.detail}</span></li>)}</ul></details>:null}
            {experienceHealth?.replays?.length ? <details className="insight-disclosure"><summary>Replay للأعطال الأخيرة ({experienceHealth.replays.length})</summary><div className="failure-replays">{experienceHealth.replays.slice(0,4).map((item:any,index:number)=><article key={`${item.timestamp}-${index}`}><strong>{item.name}</strong><small>{new Date(item.timestamp).toLocaleString("ar-KW-u-nu-latn")}</small><p>{item.message}</p><ol>{(item.breadcrumbs||[]).slice(-6).map((b:any,i:number)=><li key={i}>{b.action}</li>)}</ol></article>)}</div></details>:null}
            {experienceHealth?.slowest?.length ? <details className="insight-disclosure"><summary>أبطأ مسارات الخادم</summary><div className="slow-endpoints">{experienceHealth.slowest.map((item:any)=><span key={item.path}><code>{item.path}</code><b>{item.avg}ms</b></span>)}</div></details>:null}
            <p>
              هذه القراءة لا تحذف ولا تصحح شيئاً تلقائياً؛ هدفها فقط كشف ما قد
              يفوت أثناء العمل السريع.
            </p>
            <details className="insight-disclosure">
              <summary>كيف وصلنا لهذه النتيجة؟</summary>
              <p className="insight-method">الفحص يعدّ الصفوف الناقصة، والتكرارات (نفس المقرر والشعبة والوقت)، والمقررات بلا موعد داخل النطاق المختار — دون أي تعديل تلقائي.</p>
            </details>
          </Surface>
            </div> : null}
          {demand ? (
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-students"
              role="tabpanel"
              aria-labelledby="insight-tab-students"
              hidden={activeInsightKey !== "students"}
              tabIndex={activeInsightKey === "students" ? 0 : -1}
            >
            <Surface className="demand-reading">
              <div className="surface-head">
                <div>
                  <span className="surface-kicker">ما قاله الطلاب</span>
                  <h2>كم شعبة نفتح، وأين نضعها</h2>
                  <span className={`demand-cohort cohort-${demand.cohort || "mixed"}`}>
                    <i aria-hidden="true" />
                    {demand.cohortLabel || "طلبة القسم"}
                    {demand.sectionName ? ` · ${demand.sectionName}` : ""}
                  </span>
                </div>
                <UsersRound />
              </div>

              {/* ── باب الطلاب ───────────────────────────────────────────
                  الرابط ورمزه في نفس الصفحة التي تقرأ إجاباتهم. */}
              <div className="demand-door">
                {(demand.survey || []).length ? (
                  (demand.survey || []).map((link: any) => (
                    <article key={link.id} className="demand-door-card">
                      <div className="demand-door-copy">
                        <span className="surface-kicker">رابط الاستبيان</span>
                        <strong>{link.label}</strong>
                        <small>
                          ينتهي {new Date(link.expiresAt).toLocaleDateString("ar-KW-u-nu-latn")} ·
                          فُتح <Num value={link.views} /> {nounFor(link.views, AR.visit)}
                        </small>
                        <code dir="ltr" className="demand-door-url">{surveyUrl(link.id)}</code>
                        <div className="demand-actions">
                          <SecondaryButton onClick={() => copySurvey(link.id)}>
                            <Link2 /> {surveyCopied === link.id ? "نُسخ" : "انسخ الرابط"}
                          </SecondaryButton>
                          <SecondaryButton onClick={() => showSurveyQr(link.id)}>
                            <QrCode /> {surveyQr?.id === link.id ? "أخفِ الرمز" : "رمز QR"}
                          </SecondaryButton>
                          {surveyQr?.id === link.id ? (
                            <GhostButton onClick={() => window.print()}>
                              <Printer /> اطبع الرمز
                            </GhostButton>
                          ) : null}
                        </div>
                      </div>
                      {surveyQr?.id === link.id ? (
                        <figure
                          className="demand-qr"
                          dangerouslySetInnerHTML={{ __html: surveyQr.svg }}
                          aria-label="رمز الاستبيان"
                        />
                      ) : null}
                    </article>
                  ))
                ) : (
                  <article className="demand-door-card empty">
                    <div className="demand-door-copy">
                      <span className="surface-kicker">باب الطلاب</span>
                      <strong>لا يوجد رابط استبيان لهذا القسم بعد</strong>
                      <small>
                        الرابط مربوط بهذا القسم وحده، ولهذا يعرف مَن يجيب دون أن يُسأل أحد عن
                        جنسه: قسم البنين رابط، وقسم البنات رابط آخر. لا تُحفظ الأسماء ولا الأرقام
                        المدنية — يُتحقق من الرقم ثم يُشفَّر ويُنسى.
                      </small>
                      <div className="demand-actions">
                        <PrimaryButton onClick={issueSurvey} disabled={busy}>
                          <QrCode /> أصدر رابط الاستبيان
                        </PrimaryButton>
                      </div>
                    </div>
                  </article>
                )}
              </div>

              {/* ── التوقّع ──────────────────────────────────────────────────
                  فصلٌ بلا إجابات بعد يرث توقُّعاً من الفصل الذي قبله. مكتوبٌ
                  عليه أنه توقُّع في كل مكان يظهر فيه، ويسقط فوراً عند أول إجابة
                  حقيقية. */}
              {!demand.respondents && demand.prediction?.courses?.length ? (
                <div className="demand-forecast">
                  <p className="demand-headline forecast">
                    <Sparkles aria-hidden="true" /> {demand.prediction.headline}
                  </p>
                  <div className="demand-bars">
                    {demand.prediction.courses.slice(0, 8).map((course: any) => (
                      <article key={course.courseId}>
                        <span className="demand-course-label" title={course.because}>
                          <b>{course.name}</b>
                          <small dir="ltr">{course.code || course.courseId}</small>
                        </span>
                        <i><b style={{ width: `${Math.min(100, Math.max(6, Math.round((course.expected / demand.prediction.from) * 100)))}%` }} /></i>
                        <strong dir="ltr">~{course.expected}/{demand.prediction.from}</strong>
                      </article>
                    ))}
                  </div>
                  {demand.prediction.pairs?.length ? (
                    <ul className="demand-stuck">
                      {demand.prediction.pairs.slice(0, 5).map((pair: any, index: number) => (
                        <li key={index}>
                          يُتوقَّع أن يحتاج «{pair.nameA}» و«{pair.nameB}» معاً
                          نحو <b>{countOf(pair.expected, AR.student)}</b> — ضعهما في وقتين مختلفين من الآن.
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {/* من جديد ومن عائد — السؤال الذي طرحه القسم بنفسه. */}
              {demand.turnover?.total ? (
                <p className="demand-turnover">
                  <UsersRound aria-hidden="true" /> {demand.turnover.headline}
                </p>
              ) : null}

              {/* الرقم أولاً، ثم التفصيل — كبقية القراءات. */}
              <div className="demand-figures">
                <article>
                  <span>أجاب</span>
                  <strong><Num value={demand.respondents} /></strong>
                  <small>
                    {demand.respondents ? `${nounFor(demand.respondents, AR.student)} · ${demand.cohortLabel || "طلبة القسم"}` : `لم يجب أحد بعد · ${demand.cohortLabel || "طلبة القسم"}`}
                  </small>
                </article>
                <article>
                  <span>مقررات مطلوبة</span>
                  <strong><Num value={demand.courses?.length || 0} /></strong>
                  <small>من إجاباتهم</small>
                </article>
                <article className={demand.pairs?.length ? "warn" : ""}>
                  <span>لا يجوز أن تتقاطع</span>
                  <strong><Num value={demand.pairs?.length || 0} /></strong>
                  <small>{nounFor(demand.pairs?.length || 0, AR.pair)}</small>
                </article>
                <article className={demand.repairs?.length ? "good" : ""}>
                  <span>نقلات جاهزة</span>
                  <strong><Num value={demand.repairs?.length || 0} /></strong>
                  <small>بلا أثر جانبي</small>
                </article>
              </div>

              {/* ── الشعب ────────────────────────────────────────────────────
                  السؤال الذي يُرسَل الاستبيان لأجله: الطلب مقابل سعة المقرر،
                  ثم مكانٌ نظيف لكل شعبة جديدة. */}
              {demand.openings?.proposals?.length ? (
                <div className="demand-openings">
                  <p className="demand-headline">{demand.openings.headline}</p>
                  {demand.openings.proposals.map((item: any) => (
                    <article key={item.courseId} className="opening-card">
                      <header>
                        <div>
                          <b>{item.courseName}</b>
                          <span>{item.courseCode}{item.predicted ? " · توقُّع" : ""}</span>
                        </div>
                        <strong className="opening-need">
                          +<Num value={item.needed} /> {nounFor(item.needed, AR.section)}
                        </strong>
                      </header>

                      {/* الحساب ظاهرٌ كاملاً: الطلب ÷ السعة − المفتوح. */}
                      <div className="opening-math">
                        <span><small>طلبوه</small><b><Num value={item.demand} /></b></span>
                        <em>÷</em>
                        <span><small>سعة الشعبة</small><b><Num value={item.capacity} /></b></span>
                        <em>−</em>
                        <span><small>المفتوح</small><b><Num value={item.openSections} /></b></span>
                        <em>=</em>
                        <span className="opening-gap">
                          <small>بلا مقعد</small><b><Num value={item.shortfall} /></b>
                        </span>
                      </div>

                      {item.placements.length ? (
                        <div className="opening-slots">
                          {item.placements.map((slot: any) => (
                            <div key={slot.index} className="opening-slot">
                              <span className="opening-slot-day">{slot.dayLabel}</span>
                              <b dir="ltr">{formatScheduleTimeRange(slot.start, slot.end)}</b>
                              <span className="opening-slot-room">
                                {slot.roomCode}{slot.roomHall ? `/${slot.roomHall}` : ""}
                              </span>
                              <span className={`opening-slot-who${slot.instructorId ? "" : " vacant"}`}>
                                {slot.instructorName || "بلا أستاذ"}
                              </span>
                              <SecondaryButton onClick={() => openSectionDraft(item, slot)}>
                                <Plus /> افتحها في النسخة التجريبية
                              </SecondaryButton>
                              {slot.note ? <small className="opening-note">{slot.note}</small> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="opening-note">
                          لم أجد وقتاً يخلو من كل التعارضات — كل ساعة يستخدمها قسمك مشغولة
                          بأستاذٍ أو قاعة، أو تتقاطع مع مقرر يحتاجه هؤلاء الطلاب أنفسهم.
                        </p>
                      )}
                    </article>
                  ))}
                  {demand.openings.noCeiling?.length ? (
                    <p className="opening-note">
                      {demand.openings.noCeiling.length} من المقررات المطلوبة بلا «الحد الأعلى للطلبة» —
                      سجّله في شاشة المقررات ليُحسب عدد الشعب.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* ── الاقتراح ─────────────────────────────────────────────────
                  Each card is one move that was tried against the real week and
                  produced nothing new. Pressing it opens the lecture; nothing
                  moves until a person saves it. */}
              {demand.repairs?.length ? (
                <div className="demand-repairs">
                  <p className="demand-headline">{demand.headline}</p>
                  {demand.repairs.map((fix: any) => (
                    <article key={`${fix.rowId}-${fix.to.day}-${fix.to.start}`} className="demand-repair">
                      <header>
                        <b>{fix.courseName}</b>
                        <span>شعبة {fix.sectionCode}{fix.room ? ` · ${fix.room}` : ""}</span>
                      </header>
                      <div className="demand-move" dir="rtl">
                        <span className="demand-from">
                          <small>{fix.from.dayLabel}</small>
                          <b dir="ltr">{fix.from.start}</b>
                        </span>
                        <ArrowLeftRight aria-hidden="true" />
                        <span className="demand-to">
                          <small>{fix.to.dayLabel}</small>
                          <b dir="ltr">{fix.to.start}</b>
                        </span>
                      </div>
                      <p className="demand-why">
                        يزول تقاطعه مع <b>{fix.againstCourseName}</b> عند{" "}
                        <b>{countOf(fix.shared, AR.student)}</b> — ولا ينشأ تعارض جديد.
                      </p>
                      <div className="demand-actions">
                        <SecondaryButton onClick={() => openRepair(fix)}>
                          <WandSparkles /> جرّبها في النسخة التجريبية
                        </SecondaryButton>
                      </div>
                    </article>
                  ))}
                </div>
              ) : demand.unsolved?.length ? (
                <p className="demand-headline">{demand.headline}</p>
              ) : demand.pairs?.length ? (
                <p className="demand-headline">
                  لا يوجد تقاطع فعلي على الطلاب في هذا الفصل — الأزواج المشتركة كلها في أوقات مختلفة.
                </p>
              ) : null}

              {/* المقررات الأكثر طلباً — شريط بسيط، بالقاعدة إلى جانب كل رقم. */}
              {demand.courses?.length ? (
                <div className="demand-bars">
                  {demand.courses.slice(0, 8).map((course: any) => (
                    <article key={course.courseId}>
                      <span className="demand-course-label">
                        <b>{course.name}</b>
                        <small dir="ltr">{course.code || course.courseId}</small>
                      </span>
                      <i><b style={{ width: `${Math.max(4, course.share)}%` }} /></i>
                      <strong dir="ltr">{course.students}/{demand.respondents}</strong>
                    </article>
                  ))}
                </div>
              ) : null}

              {demand.unsolved?.length ? (
                <details className="insight-disclosure">
                  <summary>تقاطعات بلا حلٍّ نظيف ({demand.unsolved.length})</summary>
                  <ul className="demand-stuck">
                    {demand.unsolved.map((item: any, index: number) => (
                      <li key={index}>
                        «{item.a}» و«{item.b}» — {countOf(item.shared, AR.student)}.
                        كل نقلة مُتاحة تُنشئ تعارضاً آخر؛ الأمر يحتاج قراراً بشرياً.
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {demand.succession?.links?.length ? (
                <details className="insight-disclosure">
                  <summary>تسلسل المقررات — ما الذي يأتي بعد ماذا ({demand.succession.links.length})</summary>
                  <p className="insight-method">{demand.succession.headline}</p>
                  <ul className="demand-sequence">
                    {demand.succession.links.map((link: any) => (
                      <li key={`${link.from}-${link.to}`}>
                        <b>{link.fromName}</b>
                        <ArrowLeftRight aria-hidden="true" />
                        <b>{link.toName}</b>
                        <em dir="ltr">{link.students}/{link.base}</em>
                      </li>
                    ))}
                  </ul>
                  <p className="insight-method">
                    مقروءة من طلابٍ أجابوا في أكثر من فصل. لا تُعرَض علاقة أقل من ثلاثة
                    طلاب — لا لأن الرقم صغير، بل لأنه عندها يصف مسار شخصٍ بعينه.
                    ولا يُحفظ اسم ولا رقم مدني في أي مرحلة.
                  </p>
                </details>
              ) : null}

              <details className="insight-disclosure">
                <summary>كيف وصلنا إلى هذه النقلات؟</summary>
                <p className="insight-method">فحصنا أسبوع الفصل كاملًا واخترنا النقلات التي تزيل التقاطع دون إنشاء تعارض جديد.</p>
              </details>
            </Surface>
            </div>
          ) : null}
          {genome ? (
            <div
              className="content-stack insight-scene-panel"
              id="insight-panel-genome"
              role="tabpanel"
              aria-labelledby="insight-tab-genome"
              hidden={activeInsightKey !== "genome"}
              tabIndex={activeInsightKey === "genome" ? 0 : -1}
            >
            <Surface className="schedule-genome">
              <div className="surface-head">
                <div>
                  <span className="surface-kicker">بصمة الجدول</span>
                  <h2>نمط القسم عبر الفصول</h2>
                </div>
                <Dna />
              </div>
              <div className="genome-core">
                <div className="genome-score">
                  <span>مطابقة النمط</span>
                  <strong>
                    {genome.compatibility == null
                      ? "—"
                      : `${genome.compatibility}%`}
                  </strong>
                  <small>
                    {genome.available
                      ? `${countOf(genome.history.length, AR.term)} سابق في البصمة`
                      : "البصمة تبدأ من هذا الفصل"}
                  </small>
                </div>
                <div className="genome-days">
                  {Object.entries(genome.dna?.dayShares || {}).map(
                    ([key, value]: any) => (
                      <article key={key}>
                        <span>{dayLabels[key]}</span>
                        <i>
                          <b
                            style={{
                              width: `${Math.min(100, Number(value) || 0)}%`,
                            }}
                          />
                        </i>
                        <strong>{value}%</strong>
                      </article>
                    ),
                  )}
                </div>
                <div className="genome-rooms">
                  <span>القاعات المعتادة</span>
                  {(genome.dna?.rooms || []).slice(0, 5).map((r: any) => (
                    <b key={r.key}>{r.key.replace("|", "/")}</b>
                  ))}
                </div>
              </div>
              <details className="insight-disclosure genome-details">
                <summary>تفاصيل القراءة</summary>
              <div className="genome-patterns">
                <section>
                  <span>نمط ساعات البداية</span>
                  <div>
                    {Object.entries(genome.dna?.timeShares || {}).sort((a:any,b:any)=>Number(b[1])-Number(a[1])).slice(0, 4).map(
                      ([key, value]: any) => (
                        <b key={key}>
                          <small>{/^(\d{2})-(\d{2})$/.test(key) ? formatScheduleTimeRange(`${key.slice(0, 2)}:00`, `${key.slice(3, 5)}:00`) : key.replace(/^0/, "")}</small>
                          <strong>{value}%</strong>
                        </b>
                      ),
                    )}
                  </div>
                </section>
                <section>
                  <span>أماكن الاختناق التاريخية</span>
                  <div>
                    {(genome.dna?.bottlenecks || [])
                      .slice(0, 3)
                      .map((b: any) => (
                        <b key={`${b.day}-${b.time}`}>
                          <small>
                            {b.label || dayLabels[b.day]} · {b.time}
                          </small>
                          <strong>{b.avgLoad}</strong>
                        </b>
                      ))}
                  </div>
                </section>
              </div>
              <div className="genome-deviations">
                {(genome.deviations || [])
                  .slice(0, 2)
                  .map((d: any, i: number) => (
                    <article className={d.severity || "info"} key={i}>
                      <i />
                      <div>
                        <strong>{d.title}</strong>
                        <p>{d.detail}</p>
                      </div>
                    </article>
                  ))}
              </div>
              </details>
              {operationsReview?.unwrittenRules?.length ? (
                <div className="unwritten-rules">
                  <div className="unwritten-rules-head"><Sparkles /><span><small>قواعد لم يكتبها أحد</small><strong>مكتشفة من التاريخ</strong></span></div>
                  <div className="unwritten-rules-list">{operationsReview.unwrittenRules.slice(0,6).map((rule:any)=><article key={rule.id}><b>{rule.confidence}%</b><span><strong>{rule.title}</strong><small>{rule.detail}</small></span><button type="button" onClick={()=>void proposeUnwrittenRule(rule)} disabled={busy} title="أضفها كقاعدة مقترحة إلى دفتر القرارات" aria-label={`اقتراح قاعدة: ${rule.title}`}><Plus /></button></article>)}</div>
                </div>
              ) : null}
              <div className="genome-foot">
                <History />
                <span>
                  متوسط الفراغ التاريخي:{" "}
                  <b>{genome.dna?.avgGap ?? "—"} دقيقة</b>. هذه قراءة نمطية
                  وليست قاعدة إلزامية.
                </span>
              </div>
            </Surface>
            </div>
          ) : null}
          </section>
        </div>
      ) : null}

      {tab === "copilot" ? (
        <div className="copilot-layout">
          <Surface className="copilot-panel">
            <div className="copilot-head">
              <span className="copilot-mark">
                <BrainCircuit />
              </span>
              <div>
                <span className="surface-kicker">مساعد الجدول</span>
                <h2>اسأل الجدول نفسه</h2>
                <p>تحليل فقط · بلا تعديل</p>
              </div>
              <Badge tone="success">تحليل فقط</Badge>
            </div>
            <div className="prompt-chips">
              {[
                "ليش يوم الاثنين مزدحم؟",
                "منو عنده أكثر من 3 ساعات فراغ؟",
                "شنو أفضل القاعات الأقل استخداماً؟",
                "أعطني أفضل توزيع يقلل الفراغات",
              ].map((x) => (
                <button key={x} onClick={() => sendCopilot(x)} disabled={busy}>
                  <Lightbulb />
                  {x}
                </button>
              ))}
            </div>
            <div className="copilot-thread">
              {chat.length ? (
                chat.map((item, i) => (
                  <React.Fragment key={i}>
                    <div className="chat-user">
                      <span>{user.Name.trim().charAt(0) || "د"}</span>
                      <p>{item.prompt}</p>
                    </div>
                    <div className="chat-assistant">
                      <span>
                        <Sparkles />
                      </span>
                      {(item as any).move ? (
                        <div className="nl-move">
                          {(item as any).move.ok ? (() => {
                            const mv = (item as any).move;
                            return (
                              <>
                                <strong>{mv.preview.course}{mv.preview.section ? ` · شعبة ${mv.preview.section}` : ""}</strong>
                                <div className="nl-move-change">
                                  <span className="nl-from"><i>من</i>{mv.preview.before.days} · <time dir="ltr">{formatScheduleTimeRange(mv.preview.before.start, mv.preview.before.end)}</time></span>
                                  <ArrowLeft aria-hidden="true" />
                                  <span className="nl-to"><i>إلى</i>{mv.preview.after.days} · <time dir="ltr">{formatScheduleTimeRange(mv.preview.after.start, mv.preview.after.end)}</time></span>
                                </div>
                                {mv.conflicts?.length ? (
                                  <ul className="nl-move-conflicts">
                                    {mv.conflicts.slice(0, 4).map((c: any, j: number) => (
                                      <li key={j} className={c.soft ? "soft" : c.severity}>{c.message}</li>
                                    ))}
                                  </ul>
                                ) : <p className="nl-move-clear">لا مانع ظاهر لهذا النقل.</p>}
                                {mv.applied ? (
                                  <span className="nl-move-done"><CheckCircle2 aria-hidden="true" /> تم النقل بنجاح</span>
                                ) : mv.canApply ? (
                                  <button type="button" data-guide-feature-id="schedule.action.move-room" className="nl-move-apply" disabled={busy} onClick={() => applyMove(mv, i)}><WandSparkles aria-hidden="true" /> طبّق النقل</button>
                                ) : (
                                  <span className="nl-move-blocked"><ShieldAlert aria-hidden="true" /> {mv.blockedReason || "يوجد تعارض يمنع النقل"}</span>
                                )}
                              </>
                            );
                          })() : (
                            <p className="nl-move-hint">{(item as any).move.hint || "لم أفهم أمر النقل."}</p>
                          )}
                        </div>
                      ) : (
                        <div className="nl-answer">
                          <strong>{item.answer?.title}</strong>

                          {/* The assistant already measured these; a paragraph
                              is the slowest way to hand over a number. */}
                          {item.answer?.figures?.length ? (
                            <div className="nl-figures">
                              {item.answer.figures.map((f: any, j: number) => (
                                <article key={j} className={`nl-figure tone-${f.tone || "plain"}`}>
                                  <b><Num value={f.value} /></b>
                                  {f.hint ? <i>{f.hint}</i> : null}
                                  <span>{f.label}</span>
                                </article>
                              ))}
                            </div>
                          ) : null}

                          {/* A change is two numbers and an arrow between them. */}
                          {item.answer?.shift ? (
                            <div className={`nl-shift ${item.answer.shift.better ? "better" : "worse"}`}>
                              <span>{item.answer.shift.label}</span>
                              <b><Num value={item.answer.shift.before} /></b>
                              <ArrowLeft aria-hidden="true" />
                              <b className="to"><Num value={item.answer.shift.after} /></b>
                            </div>
                          ) : null}

                          {/* Six bars are read in the time one sentence takes. */}
                          {item.answer?.bars?.length ? (
                            <div className="nl-bars">
                              {item.answer.bars.map((b: any, j: number) => (
                                <div key={j} className="nl-bar">
                                  <span>{b.label}</span>
                                  <div><i style={{ width: `${Math.max(2, Math.min(100, (b.value / (b.max || 1)) * 100))}%` }} /></div>
                                  <em><Num value={b.caption ?? b.value} /></em>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <p>{item.answer?.summary}</p>
                          {item.answer?.bullets?.length ? (
                            <ul>
                              {item.answer.bullets.map((b: string, j: number) => (
                                <li key={j}>{b}</li>
                              ))}
                            </ul>
                          ) : null}
                          <small>
                            <ShieldCheck />
                            {item.answer?.guardrail}
                          </small>
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                ))
              ) : (
                <div className="copilot-empty">
                  <BrainCircuit />
                  <strong>اسأله كما تسأل زميلك</strong>
                  <span>مثال: انقل 101 إلى 11:00</span>
                </div>
              )}
              <div ref={chatEnd} />
            </div>
            <form
              className="copilot-compose"
              onSubmit={(e) => {
                e.preventDefault();
                sendCopilot();
              }}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="اكتب سؤالك عن جدول هذا القسم..."
                rows={2}
              />
              <button
                type="submit"
                aria-label="إرسال السؤال"
                title="إرسال السؤال"
                disabled={busy || !prompt.trim()}
              >
                <Send />
              </button>
            </form>
          </Surface>
          <aside className="copilot-context">
            <Surface>
              <span className="surface-kicker">حدود المعرفة</span>
              <h3>{overview?.context?.sectionName}</h3>
              <p>قسمك فقط · الحجوزات الخارجية محسوبة دون كشف تفاصيلها.</p>
            </Surface>
            <Surface className="decision-inbox-mini">
              <div className="decision-inbox-mini-head"><div><span className="surface-kicker">دفتر القرارات</span><h3>{Number(decisionInbox?.totalOpen||0).toLocaleString("ar-KW-u-nu-latn")} مفتوح</h3></div><button type="button" onClick={()=>setDecisionCompose(value=>!value)} aria-label="إضافة قرار"><Plus /></button></div>
              {decisionCompose?<form onSubmit={e=>{e.preventDefault();void addOpenDecision();}} className="decision-inbox-compose"><input autoFocus value={decisionTitle} onChange={e=>setDecisionTitle(e.target.value)} placeholder="قرار يحتاج حسم…" maxLength={140}/><button disabled={busy||decisionTitle.trim().length<3}><Save /></button></form>:null}
              <div className="decision-inbox-list">
                {[...(decisionInbox?.manual||[]).filter((item:any)=>item.status==="open"),...(decisionInbox?.inferred||[])].slice(0,5).map((item:any)=><button key={item.id} type="button" className={`priority-${item.priority||"medium"}`} onClick={()=>{if(!String(item.id).startsWith("inferred:"))void closeOpenDecision(item);}} title={String(item.id).startsWith("inferred:")?"مستنتج تلقائياً من الجدول":"اضغط لإغلاق القرار"}><i/><span><strong>{item.title}</strong>{item.detail?<small>{item.detail}</small>:null}</span>{String(item.id).startsWith("inferred:")?<Sparkles/>:<CheckCircle2/>}</button>)}
              </div>
            </Surface>
            <Surface>
              <span className="surface-kicker">أوامر مفيدة</span>
              {/* These were <span>s: they looked pressable and did nothing.
                  Each now writes its own question into the box. */}
              <div className="mini-command-list">
                {[
                  "أين الفراغات الطويلة عند الأساتذة؟",
                  "إذا نقلت 101 إلى الساعة 11 شنو يتأثر؟",
                  "اقترح أفضل توزيع يقلل الفراغ",
                  "اقرأ القاعات وأقلها استخداماً",
                ].map(text => (
                  <button key={text} type="button" onClick={() => setPrompt(text)}>
                    <Command aria-hidden="true" />
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </Surface>
          </aside>
        </div>
      ) : null}

      {tab === "twin" ? (
        <div className="twin-layout">
          <CardDeck
            value={twinCard}
            onChange={(next) => showTwinCard(next as TwinCard | null)}
            backLabel="العودة إلى بطاقات التجربة"
            title="بطاقات التجربة"
            hint="كل بطاقة تفتح صفحتها وحدها — لا شيء تحت شيء."
            cards={[
              { value: "hero", label: "النسخة التجريبية", detail: "حالة النسخة وما غيّرته فيها", icon: <Dna />,
                metric: scenario ? String(changedRows.length) : undefined },
              ...(scenario
                ? [
                    { value: "board", label: "لوحة التجربة", detail: "حرّك الوقت وشاهد النتيجة لحظياً", icon: <CalendarClock />,
                      metric: String(scenarioEval?.scenario?.score ?? overview?.score ?? "") },
                    { value: "ledger", label: "سجل التغييرات", detail: "ما غيّرته، موعداً موعداً", icon: <FileClock />,
                      metric: String(changedRows.length) },
                  ]
                : []),
            ]}
          />
          {twinCard === "hero" ? (
          <Surface className="twin-hero">
            <div>
              <span className="surface-kicker">نسخة الجدول التجريبية</span>
              <h2>
                {scenario
                  ? activeDraftId
                    ? "أنت تعدّل مسودة القسم المشتركة"
                    : "أنت تعمل الآن على نسخة وهمية"
                  : "جرّب أي شيء بدون لمس الجدول الحقيقي"}
              </h2>
              <p>
                {scenario
                  ? `غيّرت ${countOf(changedRows.length, AR.appointment)} داخل السيناريو حتى الآن. لا شيء منها منشور.`
                  : "انسخ الجدول إلى مساحة تجريبية، حرّك الأوقات والقاعات، قارن النتيجة، وبعدها فقط احفظه كمسودة أو انشره."}
              </p>
            </div>
            <div className="twin-actions">
              {!scenario ? (
                <>
                  <PrimaryButton onClick={startTwin}>
                    <Play /> ابدأ نسخة مطابقة
                  </PrimaryButton>
                  <SecondaryButton onClick={autoSchedule} disabled={busy}>
                    <WandSparkles /> ولّد اقتراحاً ذكياً
                  </SecondaryButton>
                </>
              ) : (
                <>
                  <SecondaryButton
                    onClick={() => evaluateScenario()}
                    disabled={busy}
                  >
                    <RefreshCw /> أعد التقييم
                  </SecondaryButton>
                  <PrimaryButton
                    onClick={async () => {
                      const draft = await saveDraft("what-if");
                      if (draft) openScheduleWorkspace(`تم حفظ «${draft.name}» كمسودة. أنت الآن في الجدول الحقيقي؛ المسودة لم تُنشر بعد.`);
                    }}
                    disabled={busy || !changedRows.length}
                  >
                    <Save /> احفظ كمسودة
                  </PrimaryButton>
                  <GhostButton onClick={() => openScheduleWorkspace("عدت إلى الجدول الحقيقي. النسخة التجريبية لم تغيّر أي موعد منشور.")}>
                    <CalendarClock /> افتح الجدول الحقيقي
                  </GhostButton>
                  <GhostButton
                    onClick={() => {
                      setScenario(null);
                      setScenarioEval(null);
                      setActiveDraftId(null);
                    }}
                  >
                    إغلاق النسخة
                  </GhostButton>
                </>
              )}
            </div>
          </Surface>
          ) : null}
          {twinCard === "lab" ? (
          <Surface className="innovation-suite">
            <div className="innovation-suite-head">
              <div>
                <span className="surface-kicker">مختبر القرار</span>
                <h2>مختبر القرار المتقدم</h2>
                <p>
                  القواعد، غرفة الاجتماع، والتحسين الآلي كلها تعمل داخل النسخة التجريبية
                  فقط. لا توجد هنا أي قناة نشر تلقائي.
                </p>
              </div>
              <LockKeyhole />
            </div>
            <div className="innovation-tabs">
              <button
                className={innovationMode === "constraints" ? "active" : ""}
                onClick={() => setInnovationMode("constraints")}
              >
                <SlidersHorizontal /> لوحة القيود{" "}
                <b>{constraints.length}</b>
              </button>
              <button
                className={innovationMode === "war" ? "active" : ""}
                onClick={() => setInnovationMode("war")}
              >
                <UsersRound /> غرفة القرار
              </button>
              <button
                className={innovationMode === "autopilot" ? "active" : ""}
                onClick={() => setInnovationMode("autopilot")}
              >
                <WandSparkles /> التحسين الآلي
              </button>
              <button
                className={innovationMode === "policy" ? "active" : ""}
                onClick={() => setInnovationMode("policy")}
              >
                <BarChart3 /> مختبر السياسات
              </button>
            </div>
            {innovationMode === "constraints" ? (
              <div className="constraint-canvas">
                <div className="constraint-builder">
                  <div className="constraint-builder-copy">
                    <Dna />
                    <div>
                      <strong>حوّل قواعد القسم البشرية إلى قيود مفهومة</strong>
                      <span>
                        لا محاضرات بعد وقت محدد، يوم بحث، قاعة إلزامية، أو حد
                        أقصى للفراغ.
                      </span>
                    </div>
                  </div>
                  <div className="constraint-form">
                    <Field label="نوع القاعدة">
                      <select
                        value={constraintDraft.type}
                        onChange={(e) =>
                          setConstraintDraft((p: any) => ({
                            ...p,
                            type: e.target.value,
                          }))
                        }
                      >
                        <option value="instructor_latest_end">
                          أستاذ · آخر وقت
                        </option>
                        <option value="instructor_day_off">
                          أستاذ · يوم محجوز
                        </option>
                        <option value="department_day_off">
                          القسم · يوم بحث/محجوز
                        </option>
                        <option value="course_room">مقرر · قاعة إلزامية</option>
                        <option value="max_instructor_gap">
                          حد أقصى للفراغ
                        </option>
                      </select>
                    </Field>
                    {constraintDraft.type === "course_room" ? (
                      <Field label="المقرر">
                        <select
                          value={constraintDraft.AdCourseId || ""}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              AdCourseId: Number(e.target.value) || 0,
                            }))
                          }
                        >
                          <option value="">اختر المقرر...</option>
                          {scopedCourses.map((c) => (
                            <option key={c.AdCourseId} value={c.AdCourseId}>
                              {c.CourseCode} — {c.CourseName}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : constraintDraft.type === "department_day_off" ? (
                      <div className="constraint-rule-note">
                        <CalendarClock />
                        <span>
                          <strong>قاعدة على القسم كله</strong>
                          <small>
                            كل موعد في هذا اليوم = مخالفة.
                          </small>
                        </span>
                      </div>
                    ) : (
                      <Field label="أستاذ المقرر">
                        <select
                          value={constraintDraft.AdInstructorId || ""}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              AdInstructorId: Number(e.target.value) || 0,
                            }))
                          }
                        >
                          {constraintDraft.type === "max_instructor_gap" ? (
                            <option value="">كل الأساتذة</option>
                          ) : (
                            <option value="">اختر الأستاذ...</option>
                          )}
                          {instructors.map((i) => (
                            <option
                              key={i.AdInstructorId}
                              value={i.AdInstructorId}
                            >
                              {i.AdInstructorName}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {constraintDraft.type === "instructor_latest_end" ? (
                      <Field label="آخر نهاية">
                        <input
                          type="time"
                          min={SCHEDULE_DAY_START_TIME}
                          max={SCHEDULE_DAY_END_TIME}
                          step={SCHEDULE_SLOT_MINUTES * 60}
                          value={constraintDraft.time}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              time: e.target.value,
                            }))
                          }
                        />
                      </Field>
                    ) : null}
                    {constraintDraft.type === "instructor_day_off" ||
                    constraintDraft.type === "department_day_off" ? (
                      <Field label="اليوم">
                        <select
                          value={constraintDraft.day}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              day: e.target.value,
                            }))
                          }
                        >
                          {Object.entries(dayLabels).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label as string}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    {constraintDraft.type === "course_room" ? (
                      <>
                        <Field label="المبنى">
                          <input
                            value={constraintDraft.roomCode}
                            onChange={(e) =>
                              setConstraintDraft((p: any) => ({
                                ...p,
                                roomCode: e.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="القاعة">
                          <input
                            value={constraintDraft.roomHall}
                            onChange={(e) =>
                              setConstraintDraft((p: any) => ({
                                ...p,
                                roomHall: e.target.value,
                              }))
                            }
                          />
                        </Field>
                      </>
                    ) : null}
                    {constraintDraft.type === "max_instructor_gap" ? (
                      <Field label="الدقائق">
                        <input
                          type="number"
                          min="30"
                          max="480"
                          step="30"
                          value={constraintDraft.maxMinutes}
                          onChange={(e) =>
                            setConstraintDraft((p: any) => ({
                              ...p,
                              maxMinutes: Number(e.target.value) || 120,
                            }))
                          }
                        />
                      </Field>
                    ) : null}
                    <PrimaryButton onClick={createConstraint} disabled={busy}>
                      <Save /> أضف القاعدة
                    </PrimaryButton>
                  </div>
                </div>
                <div className="constraint-list">
                  <div className="constraint-list-head">
                    <strong>القواعد الفعالة لهذا الفصل</strong>
                    {scenarioEval?.constraints ? (
                      <Badge
                        tone={
                          scenarioEval.constraints.scenario.total
                            ? "warning"
                            : "success"
                        }
                      >
                        {scenarioEval.constraints.scenario.total
                          ? `${countOf(scenarioEval.constraints.scenario.total, AR.breach)} في السيناريو`
                          : "السيناريو يحترمها كلها"}
                      </Badge>
                    ) : null}
                  </div>
                  {constraints.length ? (
                    constraints.map((c) => (
                      <article
                        className={c.enabled ? "enabled" : "disabled"}
                        key={c.id}
                      >
                        <button
                          className="constraint-toggle"
                          onClick={() => toggleConstraint(c)}
                        >
                          <i />
                          {c.enabled ? "فعالة" : "متوقفة"}
                        </button>
                        <div>
                          <strong>{c.label}</strong>
                          <small>
                            {c.userName} ·{" "}
                            {new Date(c.createdAt).toLocaleDateString("ar-KW-u-nu-latn")}
                          </small>
                        </div>
                        <button
                          data-guide-ignore="حذف قاعدة محلية داخل النسخة التجريبية وله تأكيده الخاص"
                          className="constraint-delete"
                          onClick={() => deleteConstraint(c)}
                          title="حذف القاعدة"
                        >
                          <Trash2 />
                        </button>
                      </article>
                    ))
                  ) : (
                    <div className="innovation-empty">
                      لا توجد قواعد بعد. أضف أول قاعدة بشرية وستبدأ النسخة التجريبية
                      بمحاسبة السيناريوهات عليها.
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            {innovationMode === "war" ? (
              <div className="war-room">
                <div className="war-control">
                  <div>
                    <span className="war-mark">
                      <UsersRound />
                    </span>
                    <strong>غرفة قرار اللجنة</strong>
                    <p>
                      اختر المشكلة، ثم اعرض ثلاثة حلول على اللجنة جنباً إلى جنب.
                      اختيار اللجنة يتحول إلى مسودة فقط.
                    </p>
                  </div>
                  <div className="war-picker">
                    <Field label="المشكلة">
                      <select
                        value={warRowId}
                        onChange={(e) =>
                          setWarRowId(Number(e.target.value) || "")
                        }
                      >
                        <option value="">أكبر مشكلة يكتشفها النظام</option>
                        {Array.from(
                          new Map(
                            (overview?.conflicts || []).map((c: any) => [
                              c.rowId,
                              c,
                            ]),
                          ).values(),
                        )
                          .slice(0, 12)
                          .map((c: any) => (
                            <option key={c.rowId} value={c.rowId}>
                              {c.message} · موعد #{c.rowId}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <PrimaryButton onClick={runWarRoom} disabled={warBusy}>
                      {warBusy ? <RefreshCw /> : <Play />}
                      {warBusy ? "أبني السيناريوهات…" : "افتح غرفة القرار"}
                    </PrimaryButton>
                  </div>
                </div>
                {warRoom ? (
                  <>
                    <div className="war-baseline">
                      <span>الوضع الحالي</span>
                      <b>{warRoom.baseline.score}/100</b>
                      <small>
                        {warRoom.baseline.conflicts} مانع ·{" "}
                        {warRoom.baseline.avgGap}د فراغ
                      </small>
                    </div>
                    <div className="war-options">
                      {warRoom.options.map((o: any) => (
                        <article
                          key={o.id}
                          className={o.rank === 1 ? "recommended" : ""}
                        >
                          <span className="war-rank">0{o.rank}</span>
                          <h3>{o.title}</h3>
                          <p>{o.reason}</p>
                          <div className="war-metrics">
                            <span>
                              <b>{o.score}</b> جودة
                            </span>
                            <span>
                              <b>
                                {o.deltaScore > 0
                                  ? `+${o.deltaScore}`
                                  : o.deltaScore}
                              </b>{" "}
                              فرق
                            </span>
                            <span>
                              <b>{o.conflicts}</b> مانع
                            </span>
                            <span>
                              <b>{o.avgGap}د</b> فراغ عام
                            </span>
                            <span
                              title={o.professorImpact?.name}
                              className={
                                o.professorImpact?.gapDelta > 0
                                  ? "warn"
                                  : o.professorImpact?.gapDelta < 0
                                    ? "ok"
                                    : ""
                              }
                            >
                              <b>
                                {o.professorImpact?.gapDelta > 0
                                  ? `+${o.professorImpact.gapDelta}`
                                  : o.professorImpact?.gapDelta || 0}
                                د
                              </b>{" "}
                              أثر الأستاذ
                            </span>
                            <span
                              title={`من ${o.roomImpact?.from || "—"} إلى ${o.roomImpact?.to || "—"}`}
                            >
                              <b>{o.roomImpact?.changed ? "تغيير" : "ثابتة"}</b>{" "}
                              القاعة
                            </span>
                            <span
                              className={o.constraintViolations ? "warn" : "ok"}
                            >
                              <b>{o.constraintViolations}</b> كسر قاعدة
                            </span>
                          </div>
                          <div className="war-actions">
                            <SecondaryButton
                              onClick={() => openScenarioOption(o)}
                            >
                              افتح في Twin
                            </SecondaryButton>
                            <PrimaryButton
                              data-guide-ignore="يحفظ خيار اللجنة كمسودة تجريبية فقط"
                              onClick={() =>
                                saveOptionAsDraft(o, `خيار اللجنة ${o.rank}`)
                              }
                            >
                              <Save /> اختيار اللجنة <ChevronLeft className="visual-inline-arrow" aria-hidden="true" /> مسودة
                            </PrimaryButton>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="innovation-empty">
                    غرفة القرار لا تغيّر شيئاً. ستبني ثلاثة مسارات قابلة
                    للمقارنة فقط.
                  </div>
                )}
              </div>
            ) : null}
            {innovationMode === "policy" ? (
              <div className="policy-lab">
                <div className="policy-lab-head">
                  <span className="policy-orb"><BarChart3 /></span>
                  <div><strong>اختبر السياسة قبل إصدارها</strong><p>{isPowerAdmin ? "الجامعة أو القسم · آخر 10 سنوات كمرجع" : "قسمك · آخر 10 سنوات كمرجع"}</p></div>
                  <Badge tone="success">محاكاة فقط</Badge>
                </div>
                <div className="policy-controls">
                  <Field label="السياسة">
                    <select value={policyDraft.type} onChange={e=>setPolicyDraft((p:any)=>({...p,type:e.target.value}))}>
                      <option value="day_off">يوم بلا محاضرات</option>
                      <option value="close_building">إغلاق مبنى</option>
                      <option value="no_classes_after">لا محاضرات بعد وقت</option>
                      <option value="growth">نمو الطلب</option>
                    </select>
                  </Field>
                  {policyDraft.type==="day_off"?<Field label="اليوم"><select value={policyDraft.day} onChange={e=>setPolicyDraft((p:any)=>({...p,day:e.target.value}))}>{Object.entries(dayLabels).map(([key,label])=><option key={key} value={key}>{String(label)}</option>)}</select></Field>:null}
                  {policyDraft.type==="close_building"?<Field label="المبنى"><input value={policyDraft.building} onChange={e=>setPolicyDraft((p:any)=>({...p,building:e.target.value}))} placeholder="B7" /></Field>:null}
                  {policyDraft.type==="no_classes_after"?<Field label="آخر وقت"><input type="time" value={policyDraft.time} onChange={e=>setPolicyDraft((p:any)=>({...p,time:e.target.value}))} /></Field>:null}
                  {policyDraft.type==="growth"?<Field label="النمو %"><input type="number" min="1" max="100" value={policyDraft.growth} onChange={e=>setPolicyDraft((p:any)=>({...p,growth:Number(e.target.value)||1}))} /></Field>:null}
                  {isPowerAdmin?<Field label="النطاق"><select value={policyDraft.scope} onChange={e=>setPolicyDraft((p:any)=>({...p,scope:e.target.value}))}><option value="university">الجامعة</option><option value="department">القسم الحالي</option></select></Field>:null}
                  <PrimaryButton onClick={runPolicy} disabled={policyBusy||(policyDraft.type==="close_building"&&!policyDraft.building.trim())}>{policyBusy?<RefreshCw/>:<Play/>}{policyBusy?"أحاكي…":"اختبر"}</PrimaryButton>
                </div>
                {policyResult?<div className="policy-result">
                  <div className="policy-result-hero"><strong>{Number(policyResult.affected||0).toLocaleString("ar-KW-u-nu-latn")}</strong><span>{policyDraft.type==="growth"?"موعد/شعبة إضافية تقديرياً":"موعداً سيتأثر"}</span><i style={{["--policy-share" as any]:`${Math.min(100,Number(policyResult.share||0))}%`}} /></div>
                  <div className="policy-metrics"><article><b>{policyResult.share}%</b><span>الحالي</span></article><article><b>{policyResult.historicalShare}%</b><span>تاريخياً</span></article><article><b>{policyResult.impact?.sections||0}</b><span>أقسام</span></article><article><b>{policyResult.impact?.instructors||0}</b><span>أساتذة</span></article></div>
                  <p>{policyResult.summary}</p><small><ShieldCheck /> {policyResult.guardrail}</small>
                </div>:<div className="innovation-empty">اختر سياسة واحدة. سترى أثرها على الواقع الحالي وعلى التاريخ قبل أن تتحول إلى قاعدة.</div>}
              </div>
            ) : null}
            {innovationMode === "autopilot" ? (
              <div className="autopilot-lab">
                <div className="autopilot-command">
                  <div>
                    <span className="autopilot-orb">
                      <WandSparkles />
                    </span>
                    <div>
                      <strong>تحسين آلي ببوابة بشرية</strong>
                      <p>
                        اكتب هدفك · يعرض أفضل ثلاثة.
                      </p>
                    </div>
                  </div>
                  <textarea
                    rows={3}
                    value={autopilotGoal}
                    onChange={(e) => setAutopilotGoal(e.target.value)}
                    placeholder="مثال: قلل الفراغات، لا تغيّر الأيام…"
                  />
                  <div className="autopilot-guard">
                    <ShieldCheck />
                    <span>
                      لا يغيّر الأيام ولا القاعات في هذا الإصدار الآمن، ولا يملك
                      endpoint للنشر.
                    </span>
                    <PrimaryButton
                      onClick={runAutopilot}
                      disabled={autopilotBusy || !autopilotGoal.trim()}
                    >
                      {autopilotBusy ? <RefreshCw /> : <Sparkles />}
                      {autopilotBusy ? "أجرب السيناريوهات…" : "شغّل التحسين الآلي"}
                    </PrimaryButton>
                  </div>
                </div>
                {autopilot ? (
                  <>
                    <div className="autopilot-summary">
                      <strong>{autopilot.explored}</strong>
                      <span>سيناريو تم توليده</span>
                      <i />
                      <small>
                        البوابة البشرية فعالة · النشر = مستحيل من هذه الأداة
                      </small>
                    </div>
                    <div className="autopilot-options">
                      {autopilot.options.map((o: any) => (
                        <article key={o.id}>
                          <div className="auto-option-head">
                            <span>#{o.rank}</span>
                            <div>
                              <strong>{o.title}</strong>
                              <small>{o.changed} موعد يتغير</small>
                            </div>
                            <b>{o.score}/100</b>
                          </div>
                          <div className="auto-metrics">
                            <span>{o.conflicts} مانع</span>
                            <span>{o.avgGap}د فراغ</span>
                            <span>{o.imbalance}% عدم توازن</span>
                            <span
                              className={o.constraintViolations ? "warn" : "ok"}
                            >
                              {o.constraintViolations} مخالفة قاعدة
                            </span>
                          </div>
                          <ul>
                            {o.explanation.map((x: string, i: number) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                          <div className="war-actions">
                            <SecondaryButton
                              onClick={() => openScenarioOption(o)}
                            >
                              افتح السيناريو
                            </SecondaryButton>
                            <PrimaryButton
                              onClick={async () => {
                                await saveOptionAsDraft(o, `خطة تلقائية ${o.rank}`);
                                openScheduleWorkspace("حُفظت الخطة التلقائية كمسودة فقط. أنت الآن في الجدول الحقيقي للمراجعة.");
                              }}
                            >
                              <Save /> احفظ كمسودة
                            </PrimaryButton>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="innovation-empty">
                    التحسين الآلي لن يلمس الجدول الحقيقي. حتى أفضل نتيجة تحتاج منك
                    تحويلها إلى مسودة ثم مراجعتها ثم نشرها يدوياً من شاشة
                    الاعتماد.
                  </div>
                )}
              </div>
            ) : null}
          </Surface>
          ) : null}
          {scenario && twinCard === "board" ? (
            <>
              <section className="twin-score-row" aria-label="مقارنة جودة الجدول والسيناريو">
                <article className="twin-score-card baseline">
                  <span>الجدول الحالي</span>
                  <strong><Num value={scenarioEval?.baseline?.score ?? overview?.score} /></strong>
                  <small>من 100</small>
                </article>
                <span className="twin-score-arrow" aria-hidden="true"><ArrowLeftRight /></span>
                <button
                  type="button"
                  className="twin-delta twin-score-action"
                  onClick={() => void evaluateScenario()}
                  disabled={busy}
                  aria-label="إعادة حساب فرق الجودة"
                  title="إعادة حساب الجودة الآن"
                >
                  <b>
                    {scenarioEval
                      ? <Num
                          prefix={(scenarioEval.scenario.score || 0) - (scenarioEval.baseline.score || 0) >= 0 ? "+" : ""}
                          value={(scenarioEval.scenario.score || 0) - (scenarioEval.baseline.score || 0)} />
                      : "—"}
                  </b>
                  <span>{busy ? "أحسب الجودة…" : "فرق الجودة"}</span>
                </button>
                {scenarioEval?.constraints ? (
                  <div
                    className={`twin-constraint-score ${scenarioEval.constraints.scenario.total ? "warn" : "ok"}`}
                  >
                    <b>{scenarioEval.constraints.scenario.total}</b>
                    <span>مخالفات القيود</span>
                  </div>
                ) : null}
              </section>
              <Surface className="twin-visual-board">
                <div className="surface-head">
                  <div>
                    <span className="surface-kicker">المساحة البصرية التجريبية</span>
                    <h2>حرّك الوقت… وشاهد النتيجة لحظياً</h2>
                  </div>
                  <div className="twin-board-head-actions">
                    <button type="button" className="twin-editor-link" onClick={() => showTwinCard("editor")}>
                      تعديل السيناريو
                    </button>
                    <span className="twin-live">
                      <i /> تقييم تلقائي
                    </span>
                  </div>
                </div>
                <p className="soft-copy">
                  اسحب أي موعد إلى نصف ساعة أخرى. أيام اللقاء تبقى كما هي
                  للحماية؛ غيّر الأيام من محرر السيناريو إذا كان القرار مقصوداً.
                </p>
                <div className="twin-week-scroll">
                  <div className="twin-week-grid">
                    <div className="twin-grid-corner">الوقت</div>
                    {Object.entries(dayLabels).map(([key, label]) => (
                      <strong className="twin-day-head" key={key}>
                        {label as string}
                      </strong>
                    ))}
                    {twinSlots.map((time) => (
                      <React.Fragment key={time}>
                        <span className="twin-time" dir="ltr">
                          {time}
                        </span>
                        {Object.keys(dayLabels).map((day) => (
                          <div
                            className="twin-drop-cell"
                            key={`${day}-${time}`}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              const id = Number(
                                e.dataTransfer.getData("text/twin-id"),
                              );
                              if (id) moveTwinTime(id, time);
                            }}
                          >
                            {scenario
                              .filter(
                                (r) =>
                                  Boolean((r as any)[day]) &&
                                  r.fstarttime === time,
                              )
                              .map((r) => (
                                <article
                                  className="twin-event"
                                  draggable
                                  key={`${day}-${r.id}`}
                                  onDragStart={(e) =>
                                    e.dataTransfer.setData(
                                      "text/twin-id",
                                      String(r.id),
                                    )
                                  }
                                  onClick={() => setScenarioId(r.id)}
                                  title={`${r.AdCourseName} · شعبة ${r.SCode}`}
                                >
                                  <strong>{r.AdCourseName}</strong>
                                  <span>
                                    {r.SCode} · {r.AdRoomCode}/{r.AdRoomHall}
                                  </span>
                                </article>
                              ))}
                          </div>
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </Surface>
            </>
          ) : null}
          {scenario && twinCard === "editor" ? (
              <div className="twin-workbench">
                <Surface className="scenario-editor">
                  <div className="surface-head">
                    <div>
                      <span className="surface-kicker">ماذا لو؟</span>
                      <h2>عدّل موعداً داخل النسخة</h2>
                    </div>
                    <Network />
                  </div>
                  <Field label="الموعد">
                    <select
                      value={scenarioId}
                      onChange={(e) =>
                        setScenarioId(Number(e.target.value) || "")
                      }
                    >
                      <option value="">اختر ...</option>
                      {scenario.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.AdCourseName} — شعبة {r.SCode}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {selectedScenario ? (
                    <div className="scenario-fields">
                      <Field label="البداية">
                        <input
                          type="time"
                          min={SCHEDULE_DAY_START_TIME}
                          max={SCHEDULE_DAY_END_TIME}
                          step={SCHEDULE_SLOT_MINUTES * 60}
                          value={selectedScenario.fstarttime}
                          onChange={(e) =>
                            patchScenario({ fstarttime: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="النهاية">
                        <input
                          type="time"
                          min={SCHEDULE_DAY_START_TIME}
                          max={SCHEDULE_DAY_END_TIME}
                          step={SCHEDULE_SLOT_MINUTES * 60}
                          value={selectedScenario.fendtime}
                          onChange={(e) =>
                            patchScenario({ fendtime: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="المبنى">
                        <input
                          value={selectedScenario.AdRoomCode}
                          onChange={(e) =>
                            patchScenario({ AdRoomCode: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="القاعة">
                        <input
                          value={selectedScenario.AdRoomHall}
                          onChange={(e) =>
                            patchScenario({ AdRoomHall: e.target.value })
                          }
                        />
                      </Field>
                      <div className="scenario-days">
                        {Object.entries(dayLabels).map(([key, label]) => (
                          <label key={key}>
                            <input
                              type="checkbox"
                              checked={Boolean((selectedScenario as any)[key])}
                              onChange={(e) =>
                                patchScenario({
                                  [key]: e.target.checked,
                                } as any)
                              }
                            />
                            <span>{label as string}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <p className="safety-note">
                    <ShieldCheck /> أي تعديل هنا محلي داخل السيناريو حتى تضغط
                    «احفظ كمسودة» ثم «نشر» صراحة.
                  </p>
                </Surface>
              </div>
          ) : null}
          {scenario && twinCard === "ledger" ? (
              <div className="twin-workbench">
                <Surface className="change-ledger">
                  <div className="surface-head">
                    <div>
                      <span className="surface-kicker">سجل التعديلات</span>
                      <h2>{changedRows.length === 1 ? "تعديل واحد" : `${changedRows.length} تعديلات`}</h2>
                    </div>
                    <FileClock />
                  </div>
                  <div className="change-list">
                    {changedRows.length ? (
                      changedRows.slice(0, 30).map((r) => {
                        const o = originalById.get(r.id);
                        return (
                          <article key={r.id} className="change-card">
                            <div className="change-card-main">
                              <div className="change-card-title"><strong>{r.AdCourseName}</strong><Badge tone="neutral">شعبة {r.SCode}</Badge></div>
                              <div className="change-time-flow">
                                <span><small>قبل</small><time dir="ltr">{formatScheduleTimeRange(o?.fstarttime, o?.fendtime)}</time></span>
                                <ArrowLeftRight aria-hidden="true" />
                                <span className="after"><small>بعد</small><time dir="ltr">{formatScheduleTimeRange(r.fstarttime, r.fendtime)}</time></span>
                              </div>
                            </div>
                            {o?.AdRoomCode !== r.AdRoomCode ||
                            o?.AdRoomHall !== r.AdRoomHall ? (
                              <Badge tone="info">
                                <span className="change-room-flow">
                                  <small>قاعة</small>
                                  <bdi>{o?.AdRoomCode}/{o?.AdRoomHall}</bdi>
                                  <ArrowLeftRight aria-hidden="true" />
                                  <bdi>{r.AdRoomCode}/{r.AdRoomHall}</bdi>
                                </span>
                              </Badge>
                            ) : null}
                          </article>
                        );
                      })
                    ) : (
                      <div className="empty-state-compact">
                        مطابقة للجدول الحقيقي.
                      </div>
                    )}
                  </div>
                </Surface>
              </div>
          ) : null}
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="history-layout">
          <CardDeck
            value={approveCard}
            onChange={(next) => showApproveCard(next as ApproveCard | null)}
            backLabel="العودة إلى بطاقات الاعتماد"
            title="بطاقات الاعتماد"
            hint="كل بطاقة تفتح صفحتها وحدها — لا شيء تحت شيء."
            cards={[
              { value: "compare", label: "مقارنة الفصول", detail: "ما تغيّر بين فصل وفصل", icon: <ArrowLeftRight /> },
              { value: "drafts", label: "المسودات", detail: "ما لم يُنشر بعد", icon: <FileClock />,
                metric: String(drafts.length || 0) },
              { value: "versions", label: "سجل النسخ", detail: "كل نشرة سابقة ومن نشرها", icon: <History /> },
            ]}
          />
          {approveCard === "compare" ? (
          <Surface className="term-compare">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">مقارنة الفصول</span>
                <h2>ماذا تغيّر؟</h2>
              </div>
              <ArrowLeftRight />
            </div>
            <div className="compare-controls">
              <select
                value={compareFrom || ""}
                onChange={(e) => setCompareFrom(Number(e.target.value) || 0)}
              >
                {terms.map((t) => (
                  <option key={t.AdTermId} value={t.AdTermId}>
                    {t.AdTermName}
                  </option>
                ))}
              </select>
              <ArrowLeftRight />
              <select
                value={compareTo || ""}
                onChange={(e) => setCompareTo(Number(e.target.value) || 0)}
              >
                {terms.map((t) => (
                  <option key={t.AdTermId} value={t.AdTermId}>
                    {t.AdTermName}
                  </option>
                ))}
              </select>
              <SecondaryButton onClick={compareTerms}>قارن</SecondaryButton>
            </div>
            {termCompare ? (
              <div className="compare-result">
                <article>
                  <strong>
                    <span className="visual-metric-flow"><b>{termCompare.fromCount}</b><ArrowLeftRight aria-hidden="true" /><b>{termCompare.toCount}</b></span>
                  </strong>
                  <span>عدد المواعيد</span>
                </article>
                <article>
                  <strong>
                    <span className="visual-metric-flow"><b>{termCompare.fromScore}</b><ArrowLeftRight aria-hidden="true" /><b>{termCompare.toScore}</b></span>
                  </strong>
                  <span>مؤشر الجودة</span>
                </article>
                <article>
                  <strong>
                    +{termCompare.added} / -{termCompare.removed}
                  </strong>
                  <span>تغييرات تركيبية</span>
                </article>
                <article>
                  <strong>
                    <span className="visual-metric-flow"><b>{termCompare.uniqueRoomsFrom}</b><ArrowLeftRight aria-hidden="true" /><b>{termCompare.uniqueRoomsTo}</b></span>
                  </strong>
                  <span>القاعات المستخدمة</span>
                </article>
              </div>
            ) : (
              <p className="soft-copy">
                مقارنة فصلين · بدون تغيير.
              </p>
            )}
            {termCompare && (termCompare.appeared?.length || termCompare.disappeared?.length || termCompare.moved?.length) ? (
              <div className="compare-diff">
                {[
                  { key: "appeared", title: "أُضيف", tone: "add", rows: termCompare.appeared || [] },
                  { key: "moved", title: "انتقل", tone: "move", rows: termCompare.moved || [] },
                  { key: "disappeared", title: "اختفى", tone: "drop", rows: termCompare.disappeared || [] }
                ].map(group => (
                  <section key={group.key} className={`compare-column tone-${group.tone}`}>
                    <h3>
                      {group.title}
                      <b>{Number(group.rows.length).toLocaleString("ar-KW-u-nu-latn")}</b>
                    </h3>
                    {group.rows.length ? (
                      <div className="compare-rows">
                        {group.rows.slice(0, 24).map((row: any) => (
                          <article key={`${group.key}-${row.id}`}>
                            <header>
                              <span className="code-chip">{row.code || "—"}</span>
                              <strong>{row.name}</strong>
                              {row.section ? <small>{row.section}</small> : null}
                            </header>
                            {group.key === "moved" ? (
                              <div className="compare-move">
                                {row.fields.map((field: string) => {
                                  const pick = (side: any) =>
                                    field === "الأيام" ? side.days : field === "الوقت" ? side.time : field === "القاعة" ? side.room : side.instructor;
                                  return (
                                    <p key={field}>
                                      <i>{field}</i>
                                      <del dir="auto">{pick(row.before) || "—"}</del>
                                      <ArrowLeft aria-hidden="true" />
                                      <ins dir="auto">{pick(row.after) || "—"}</ins>
                                    </p>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="compare-facts">
                                <time dir="ltr">{row.time}</time>
                                <span>{row.room || "—"}</span>
                                <span>{row.instructor || "—"}</span>
                              </p>
                            )}
                          </article>
                        ))}
                        {group.rows.length > 24 ? <p className="compare-more">و{Number(group.rows.length - 24).toLocaleString("ar-KW-u-nu-latn")} غيرها</p> : null}
                      </div>
                    ) : (
                      <p className="compare-none">لا شيء</p>
                    )}
                  </section>
                ))}
              </div>
            ) : null}
          </Surface>
          ) : null}
          {approveCard === "drafts" ? (
          <Surface className="drafts-card">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">وضع النشر</span>
                <h2>المسودات الداخلية</h2>
              </div>
              <Save />
            </div>
            <p className="soft-copy">
              المسودة لا تغيّر الجدول الذي يعتمد عليه القسم. المسؤولون المخولون
              يستطيعون مراجعتها داخل نفس النطاق.
            </p>
            <div className="draft-list">
              {drafts.length ? (
                drafts.map((d) => (
                  <article key={d.id} className={d.status}>
                    <span className="draft-source">
                      {d.source === "auto" ? (
                        <WandSparkles />
                      ) : d.source === "import" ? (
                        <FileSpreadsheet />
                      ) : (
                        <Network />
                      )}
                    </span>
                    <div>
                      <strong>{d.name}</strong>
                      <small>
                        {new Date(d.updatedAt).toLocaleString("ar-KW-u-nu-latn")} ·{" "}
                        {d.rows.length} موعد · {d.userName}
                      </small>
                    </div>
                    <Badge
                      tone={d.status === "published" ? "success" : "warning"}
                    >
                      {d.status === "published" ? "منشورة" : "مسودة"}
                    </Badge>
                    <div className="draft-actions">
                      <GhostButton onClick={() => openDraft(d)}>
                        فتح
                      </GhostButton>
                      {d.status === "draft" ? (
                        <PrimaryButton
                          data-guide-target="intelligence.publish-draft"
                          data-guide-feature-id="intelligence.publish-draft"
                          onClick={() => publishDraft(d)}
                          disabled={!online || busy}
                        >
                          نشر
                        </PrimaryButton>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state-compact">
                  لا توجد مسودات لهذا الفصل.
                </div>
              )}
            </div>
          </Surface>
          ) : null}
          {approveCard === "versions" ? (
          <Surface className="versions-card">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">سجل النسخ</span>
                <h2>النسخ الزمنية</h2>
              </div>
              <History />
            </div>
            {operationsReview?.accuracy ? (
              <div className="accuracy-strip">
                <article><span>دقة الجدول</span><strong>{operationsReview.accuracy.available ? `${operationsReview.accuracy.accuracy}%` : "—"}</strong><small>{operationsReview.accuracy.available ? `${operationsReview.accuracy.unchanged} بقيت كما اعتمدت` : "تحتاج نسخة محفوظة"}</small></article>
                <article><span>تغيّر</span><strong>{operationsReview.accuracy.changed || 0}</strong><small>موعداً</small></article>
                <article><span>أضيف / حُذف</span><strong>+{operationsReview.accuracy.added || 0} / -{operationsReview.accuracy.removed || 0}</strong><small>هوية شعبة</small></article>
              </div>
            ) : null}
            {chronologicalVersions.length >= 2 ? (
              <div className="version-scrubber">
                <div><span className="surface-kicker">الوضع الزمني</span><strong>{new Date(chronologicalVersions[Math.max(1,Math.min(chronologicalVersions.length-1,versionScrubIndex))]?.createdAt).toLocaleString("ar-KW-u-nu-latn")}</strong></div>
                <input type="range" min="1" max={Math.max(1,chronologicalVersions.length-1)} value={Math.max(1,Math.min(chronologicalVersions.length-1,versionScrubIndex))} onChange={e=>setVersionScrubIndex(Number(e.target.value))} aria-label="اسحب عبر تاريخ الجدول" />
                <small>{chronologicalVersions.length} محطات محفوظة</small>
              </div>
            ) : null}
            <div className="version-compare">
              <select
                value={versionFrom}
                onChange={(e) => setVersionFrom(e.target.value)}
              >
                <option value="">نسخة البداية...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {new Date(v.createdAt).toLocaleString("ar-KW-u-nu-latn")} — {v.label}
                  </option>
                ))}
              </select>
              <ArrowLeftRight />
              <select
                value={versionTo}
                onChange={(e) => setVersionTo(e.target.value)}
              >
                <option value="">نسخة المقارنة...</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {new Date(v.createdAt).toLocaleString("ar-KW-u-nu-latn")} — {v.label}
                  </option>
                ))}
              </select>
              <SecondaryButton onClick={compareVersions}>قارن</SecondaryButton>
            </div>
            {versionCompare ? (
              <>
                <div className="version-diff">
                  <article>
                    <strong>+{versionCompare.added}</strong>
                    <span>أضيف</span>
                  </article>
                  <article>
                    <strong>-{versionCompare.removed}</strong>
                    <span>أزيل</span>
                  </article>
                  <article>
                    <strong>{versionCompare.unchanged}</strong>
                    <span>لم يتغير</span>
                  </article>
                </div>
                <div className="time-travel-compare">
                  <div className="time-travel-head">
                    <div>
                      <span className="surface-kicker">
                        مقارنة النسخ الزمنية
                      </span>
                      <h3>مقارنة بصرية بين النسختين</h3>
                    </div>
                    <div className="time-travel-meta">
                      <span>{versionCompare.from.label || "نسخة البداية"}</span>
                      <ArrowLeftRight />
                      <span>{versionCompare.to.label || "نسخة المقارنة"}</span>
                    </div>
                  </div>

                  <div className="time-travel-control-bar">
                    <div className="time-travel-control-presets">
                      <button
                        type="button"
                        className={`time-preset-btn ${timeTravel === 0 ? "active" : ""}`}
                        onClick={() => setTimeTravel(0)}
                      >
                        النسخة الأولى (0%)
                      </button>
                      <button
                        type="button"
                        className={`time-preset-btn ${timeTravel === 50 ? "active" : ""}`}
                        onClick={() => setTimeTravel(50)}
                      >
                        مقارنة بالمنتصف (50%)
                      </button>
                      <button
                        type="button"
                        className={`time-preset-btn ${timeTravel === 100 ? "active" : ""}`}
                        onClick={() => setTimeTravel(100)}
                      >
                        النسخة الثانية (100%)
                      </button>
                    </div>

                    <div className="time-travel-slider-wrapper">
                      <input
                        className="time-travel-range-input"
                        type="range"
                        min="0"
                        max="100"
                        value={timeTravel}
                        onChange={(e) => setTimeTravel(Number(e.target.value))}
                        aria-label="مقارنة النسختين"
                      />
                      <span className="time-travel-slider-badge">{timeTravel}%</span>
                    </div>
                  </div>

                  <div className="time-travel-scroll-container">
                    <div className="time-travel-stage">
                      <div className="time-travel-before">
                        <VersionCanvas
                          rows={versionCompare.from.rows || []}
                          label={versionCompare.from.label ? `النسخة السابقة (${versionCompare.from.label})` : "قبل"}
                          isAfter={false}
                        />
                      </div>
                      <div
                        className="time-travel-after"
                        style={{ clipPath: `inset(0 ${100 - timeTravel}% 0 0)` }}
                      >
                        <VersionCanvas
                          rows={versionCompare.to.rows || []}
                          label={versionCompare.to.label ? `النسخة المحدثة (${versionCompare.to.label})` : "بعد"}
                          isAfter={true}
                        />
                      </div>
                      <div
                        className="time-travel-divider"
                        style={{ left: `${timeTravel}%` }}
                        onPointerDown={handleDividerPointerDown}
                        title="اسحب لمقارنة النسختين"
                      >
                        <span className="time-travel-handle">
                          <ArrowLeftRight aria-hidden="true" />
                        </span>
                      </div>
                    </div>
                  </div>

                  <IntelligenceVersionDiffTable comparison={versionCompare} />
                </div>
              </>
            ) : null}
            <div className="timeline-versions">
              {versions.length ? (
                versions.map((v, i) => (
                  <article key={v.id}>
                    <span className="version-dot" />
                    <div>
                      <strong>{v.label}</strong>
                      <small>
                        {new Date(v.createdAt).toLocaleString("ar-KW-u-nu-latn")} ·{" "}
                        {v.userName} · {v.rowCount} موعد
                      </small>
                    </div>
                    <Badge
                      tone={
                        v.source === "publish"
                          ? "success"
                          : v.source === "undo"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {v.source}
                    </Badge>
                    <GhostButton
                      onClick={() => restoreVersion(v)}
                      disabled={!online || busy}
                    >
                      <RotateCcw /> استرجاع
                    </GhostButton>
                  </article>
                ))
              ) : (
                <div className="empty-state-compact">
                  نسخة قبل كل تعديل.
                </div>
              )}
            </div>
            {operationsReview?.accuracy?.postmortem?.length ? (
              <div className="postmortem-card"><div><FileClock/><span><small>تشريح الفصل</small><strong>ماذا تعلّمنا من النسخ؟</strong></span></div><ul>{operationsReview.accuracy.postmortem.slice(0,4).map((line:string,index:number)=><li key={index}>{line}</li>)}</ul></div>
            ) : null}
            {versions.length ? (
              <div className="edit-heatmap"><div className="edit-heatmap-head"><span><small>حرارة التعديلات البشرية</small><strong>متى يكثر التغيير</strong></span><Badge>{versions.length} نسخة</Badge></div><div className="edit-heatmap-grid"><i/>{versionActivityHeatmap.hours.map(hour=><small key={hour}>{String(hour).padStart(2,"0")}</small>)}{versionActivityHeatmap.cells.map(day=><React.Fragment key={day.label}><b>{day.label}</b>{day.hours.map(cell=>{const strength=versionActivityHeatmap.max?cell.count/versionActivityHeatmap.max:0;return <span key={`${day.label}-${cell.hour}`} title={`${day.label} ${cell.hour}:00 · ${cell.count} تعديل`} style={{["--heat-pct" as any]:`${Math.max(10,Math.round(strength*85))}%`}}>{cell.count||""}</span>;})}</React.Fragment>)}</div></div>
            ) : null}
          </Surface>
          ) : null}
        </div>
      ) : null}

      {tab === "import" ? (
        <div className="import-layout">
          <Surface className="import-drop">
            <div className="import-icon">
              <Upload />
            </div>
            <span className="surface-kicker">استيراد Excel</span>
            <h2>ارفع الجدول وراجعه قبل الحفظ</h2>
            <p>يدعم تنسيق تقارير SCHEDULE.</p>
            <label className="file-button">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importExcel(f);
                }}
              />
              <FileSpreadsheet />
              {importFile || "اختر ملف Excel"}
            </label>
            <small>
              <ShieldCheck /> معاينة أولاً، دون تعديل الجدول.
            </small>
          </Surface>
          {importPreview ? (
            <Surface className="import-preview">
              <div className="surface-head">
                <div>
                  <span className="surface-kicker">معاينة</span>
                  <h2>{importPreview.count} صفاً تم قراءتها</h2>
                </div>
                <Badge tone={importPreview.valid ? "success" : "danger"}>
                  {importPreview.valid
                    ? "جاهز كمسودة"
                    : countOf(importPreview.issues.length, AR.note)}
                </Badge>
              </div>
              {importPreview.issues.length ? (
                <div className="import-issues">
                  {importPreview.issues
                    .slice(0, 12)
                    .map((x: string, i: number) => (
                      <span key={i}>
                        <AlertTriangle />
                        {x}
                      </span>
                    ))}
                </div>
              ) : (
                <Notice type="success">
                  لا أخطاء ظاهرة.
                </Notice>
              )}
              <RecordDeck className="import-records">
                {importPreview.preview.slice(0, 12).map((r: any) => (
                  <RecordCard
                    key={r.id}
                    icon={<FileSpreadsheet />}
                    title={r.AdCourseName || "مقرر"}
                    subtitle={`شعبة ${r.SCode || "—"}`}
                    meta={
                      <>
                        <MetaPill
                          label="الوقت"
                          value={formatScheduleTimeRange(r.fstarttime, r.fendtime)}
                          dir="ltr"
                        />
                        <MetaPill
                          label="المكان"
                          value={`${r.AdRoomCode || "—"}/${r.AdRoomHall || "—"}`}
                        />
                      </>
                    }
                  />
                ))}
              </RecordDeck>
              <div className="import-actions">
                <SecondaryButton
                  onClick={() => {
                    setImportPreview(null);
                    setImportFile("");
                  }}
                >
                  إلغاء
                </SecondaryButton>
                <PrimaryButton
                  onClick={createImportDraft}
                  disabled={!importPreview.valid || busy}
                >
                  <Save /> تحويل إلى مسودة
                </PrimaryButton>
              </div>
            </Surface>
          ) : null}
        </div>
      ) : null}

      {detail ? (
        <div
          className="intel-drawer-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDetail(null);
          }}
        >
          <aside className="intel-drawer">
            <button
              className="drawer-close"
              type="button"
              aria-label="إغلاق التفاصيل"
              title="إغلاق التفاصيل"
              onClick={() => setDetail(null)}
            >
              <X />
            </button>
            {detail.type === "room" ? (
              <>
                <div className="drawer-title">
                  <span>
                    <Building2 />
                  </span>
                  <div>
                    <small>ذكاء القاعات</small>
                    <h2>
                      مبنى {detail.data.code} · قاعة {detail.data.hall}
                    </h2>
                  </div>
                </div>
                <div className="room-drawer-infographic">
                  <div className="drawer-metrics room-kpis">
                    <article><span><CalendarClock /></span><strong>{detail.data.totalAppointments}</strong><small>موعد في الفصل</small></article>
                    <article><span><Clock3 /></span><strong>{detail.data.freeWindows.length}</strong><small>نافذة متاحة</small></article>
                  </div>
                  <section className="room-usage-block">
                    <header><div><small>الجهة الأبرز</small><strong>الأكثر استخدامًا</strong></div><Building2 /></header>
                    <div className="room-usage-grid">
                      {detail.data.departments.slice(0, 6).map((x: any, i: number) => (
                        <article key={i}><strong>{x.name}</strong><span>{x.count.toLocaleString("ar-KW-u-nu-latn")} لقاء</span></article>
                      ))}
                    </div>
                  </section>
                  <section className="room-windows-block">
                    <header><div><small>الفترات القريبة</small><strong>النوافذ المتاحة</strong></div><CalendarClock /></header>
                    <div className="room-window-days">
                      {Object.entries(detail.data.freeWindows.slice(0, 14).reduce((acc: Record<string, any[]>, x: any) => { (acc[x.day] ||= []).push(x); return acc; }, {})).map(([day, windows]: any) => (
                        <article key={day}><b>{day}</b><div>{windows.map((x: any, i: number) => <span key={i} dir="ltr">{formatScheduleTimeRange(x.start, x.end)}</span>)}</div></article>
                      ))}
                    </div>
                  </section>
                  <p className="drawer-privacy room-privacy"><ShieldCheck />تُحسب الحجوزات الأخرى لمنع التعارض مع إبقاء تفاصيلها مخفية.</p>
                </div>
              </>
            ) : (
              <>
                <div className="drawer-title">
                  <span>
                    <UsersRound />
                  </span>
                  <div>
                    <small>حمل الأستاذ</small>
                    <h2>{detail.data.instructor?.AdInstructorName}</h2>
                  </div>
                </div>
                <div className="drawer-metrics">
                  <article>
                    <strong>{detail.data.load?.weeklyHours || 0}</strong>
                    <span>ساعة أسبوعية</span>
                  </article>
                  <article>
                    <strong>{detail.data.load?.days || 0}</strong>
                    <span>أيام تدريس</span>
                  </article>
                  <article>
                    <strong>{detail.data.externalCommitments}</strong>
                    <span>التزام خارج نطاقك</span>
                  </article>
                </div>
                {(() => {
                  const shape = professorWeekShape(detail.data.visibleRows || []);
                  if (!shape) return null;
                  return (
                    <>
                      <h3>شكل الأسبوع</h3>
                      <div className="week-shape" aria-label="توزيع المواعيد والانتظار عبر الأسبوع">
                        <div className="week-shape-scale" aria-hidden="true">
                          {shape.hours.map(m => (
                            <span key={m} dir="ltr">{String(Math.floor(m / 60)).padStart(2, "0")}</span>
                          ))}
                        </div>
                        {shape.days.map(day => (
                          <div className="week-shape-row" key={day.day}>
                            <small>{day.label}</small>
                            <div className="week-shape-track">
                              {day.waits.map((wait, i) => (
                                <i
                                  key={`w${i}`}
                                  className="week-shape-wait"
                                  style={{ insetInlineStart: `${wait.left}%`, width: `${wait.width}%` }}
                                  title={`انتظار ${Math.floor(wait.minutes / 60)}س ${wait.minutes % 60}د`}
                                >
                                  {wait.width > 12 ? `${Math.round(wait.minutes / 60 * 10) / 10}س` : ""}
                                </i>
                              ))}
                              {day.blocks.map((block, i) => (
                                <b
                                  key={`b${i}`}
                                  style={{ insetInlineStart: `${block.left}%`, width: `${block.width}%` }}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="week-shape-legend" aria-label="مفتاح شكل الأسبوع">
                          <span className="teaching"><i />محاضرة</span>
                          <span className="waiting"><i />انتظار طويل</span>
                          <span className="idle"><i />وقت خامل</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
                <h3>المواعيد الظاهرة ضمن صلاحياتك</h3>
                <div className="drawer-schedule-list">
                  {detail.data.visibleRows.map((r: any) => (
                    <article key={r.id} className="drawer-schedule-card">
                      <div className="drawer-schedule-title"><strong>{r.AdCourseName}</strong><Badge tone="neutral">شعبة {r.SCode}</Badge></div>
                      <div className="drawer-schedule-meta">
                        <span><CalendarClock />{Object.keys(dayLabels).filter((k) => r[k]).map((k) => dayLabels[k]).join(" · ") || "—"}</span>
                        <time dir="ltr">{formatScheduleTimeRange(r.fstarttime, r.fendtime)}</time>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
