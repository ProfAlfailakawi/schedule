import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildingNumberLabel } from "../utils/locationCollegePrefixes";
import { flushSync } from "react-dom";
import {
  Building2, CalendarDays, ChevronDown, ClipboardList, Clock3, LayoutList,
  Landmark, Printer, Scale, Search, SlidersHorizontal, Table2, UserRound, X
} from "lucide-react";
import { parseNaturalQuery } from "../utils/naturalQuery";
import { EmptyState, Field, GhostButton, Notice, PageTitle, PrintLetterhead, PrintPortal, SecondaryButton } from "./ui";
import { AdCollege, AdCourse, AdInstructor, AdSection, AdTerm, FSchedule, MasterBuilding, MasterRoom } from "../types";
import { runVisualTransition } from "../utils/visualTransition";
import { coerceScopeValues, resolveScopeSelection } from "../utils/scopeContext";
import { byArabic, sortByName, sortKey } from "../utils/sorting";
import { sortTermsNewest } from "../utils/termSequence";
import { formatScheduleTimeRange, scheduleClockForDisplay, SCHEDULE_DAY_END, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START, SCHEDULE_DAY_START_TIME, SCHEDULE_SLOT_MINUTES } from "../utils/scheduleTime";
import { AR, countOf } from "../utils/arabicCount";
import { byRoom, byRoomLabel, byRoomPart } from "../utils/sorting";
import InstructorPicker from "./InstructorPicker";
import AuthorityPdfReport, { AuthorityReport } from "./AuthorityPdfReport";
import { roomIdentityKey, roomDisplay, resolveBuilding, resolveRoom } from "../utils/locationRegistry";

/**
 * One question, seven lenses.
 *
 * The legacy screen carried ten modes, each with its own filter set, its own
 * layout and its own print path. They all answered the same question — "which
 * appointments match?" — and differed only in how the answer was grouped. This
 * page keeps one filter bar and one result set, and lets the lens decide the
 * shape of the answer. Every legacy route still opens on the lens it used to,
 * so deep links and permissions keep working unchanged.
 */
export type ReportMode =
  | "searchInstructor" | "searchRoom" | "searchTime" | "searchRoomTime" | "searchAdvanced"
  | "reportDepartment" | "reportInstructor" | "reportRoom" | "reportTime" | "reportRoomTime";

type Lens = "list" | "week" | "instructor" | "room" | "matrix" | "time" | "fairness" | "balance";
type PrintKind = Lens | "comprehensive" | null;

/* Safari is the one printing engine here that ignores `@page size` (so wide
   sheets meet portrait paper) — detected once, and only ever used to OFFER a
   remedy, never to change behaviour silently. */
const SAFARI_PRINT_ENGINE = typeof navigator !== "undefined"
  && /AppleWebKit/i.test(navigator.userAgent || "")
  && !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|Android)/i.test(navigator.userAgent || "");

interface Props {
  mode: ReportMode;
  user?: { SystemUserId: number; IsAdminUser?: boolean };
  scopes?: any[];
  availableModes?: ReportMode[];
}

interface Filters {
  collegeId: number; sectionId: number; termId: number;
  instructorId: number; civil: string; instructorQuery: string;
  building: string; hall: string;
  courseId: number; courseCode: string;
  startTime: string; endTime: string;
  sun: boolean; mon: boolean; tue: boolean; wed: boolean; thr: boolean;
}

const fresh = (): Filters => ({
  collegeId: 0, sectionId: 0, termId: 0, instructorId: 0, civil: "", instructorQuery: "",
  building: "", hall: "", courseId: 0, courseCode: "",
  startTime: "", endTime: "", sun: false, mon: false, tue: false, wed: false, thr: false
});

const LENS_FOR_MODE: Record<ReportMode, Lens> = {
  searchInstructor: "instructor", reportInstructor: "instructor",
  searchRoom: "room", reportRoom: "room",
  searchTime: "time", reportTime: "time",
  searchRoomTime: "time", reportRoomTime: "time",
  searchAdvanced: "list", reportDepartment: "list"
};

/**
 * ── العدسات، وما تحمله كل واحدة ─────────────────────────────────────────────
 *
 * Every tab carried its own label twice: once as the word on it, and again as
 * the tooltip. A tooltip that repeats the label tells a first-time reader
 * nothing, and two of these words tell them nothing on their own either —
 * «العدالة» does not say what is being weighed, and «ميزان الأقسام» does not
 * say what is on the scales. The reader had to open them to find out.
 *
 * So each one now states what it holds, and that sentence is what hovering
 * shows. «العدالة» also gains the noun it was missing: it measures the spread
 * of weekly teaching load between staff, and nothing else.
 */
const LENSES: Array<{ id: Lens; label: string; hint: string; icon: React.ReactNode }> = [
  { id: "list", label: "الكل", hint: "كل مواعيد النطاق في قائمة واحدة", icon: <LayoutList /> },
  { id: "week", label: "الأسبوع", hint: "الأسبوع كشبكة أيام وأوقات", icon: <CalendarDays /> },
  { id: "instructor", label: "الأساتذة", hint: "مواعيد كل أستاذ وحمله الأسبوعي", icon: <UserRound /> },
  { id: "room", label: "القاعات", hint: "ما تشغله كل قاعة ومتى تفرغ", icon: <Building2 /> },
  { id: "matrix", label: "القاعات × الأوقات", hint: "شبكة تقاطع كل قاعة مع كل وقت", icon: <Table2 /> },
  { id: "time", label: "الأوقات", hint: "توزّع المواعيد على ساعات اليوم", icon: <Clock3 /> },
  { id: "fairness", label: "عدالة الحمل", hint: "تفاوت الحمل الأسبوعي بين الأساتذة", icon: <Scale /> },
  /* Main administrator only — see `shownLenses`. It is the one reading nobody
     else is allowed to see, so it must not appear as a locked door to them. */
  { id: "balance", label: "ميزان الأقسام", hint: "كل أقسام الفصل، قسمٌ في كل سطر", icon: <Landmark /> }
];

const DAYS = [
  { key: "sun" as const, flag: "fsunday" as const, label: "الأحد" },
  { key: "mon" as const, flag: "fmonday" as const, label: "الاثنين" },
  { key: "tue" as const, flag: "ftuesday" as const, label: "الثلاثاء" },
  { key: "wed" as const, flag: "fwednesday" as const, label: "الأربعاء" },
  { key: "thr" as const, flag: "fthursday" as const, label: "الخميس" }
];

/** The teaching window every occupancy grid is measured against. */
const GRID_START = SCHEDULE_DAY_START;
const GRID_END = SCHEDULE_DAY_END;
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const QUERY_TIME_OPTIONS = Array.from(
  { length: Math.floor((GRID_END - GRID_START) / SCHEDULE_SLOT_MINUTES) + 1 },
  (_, index) => clock(GRID_START + index * SCHEDULE_SLOT_MINUTES)
);

function QueryTimeSelect({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <select
      className="query-time-24h"
      value={value}
      onChange={event => onChange(event.target.value)}
      aria-label={label}
      data-time-format="24h"
    >
      <option value="">--:--</option>
      {QUERY_TIME_OPTIONS.map(option => <option key={`${label}-${option}`} value={option}>{scheduleClockForDisplay(option)}</option>)}
    </select>
  );
}

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
/**
 * ── كم سطراً تتسع الورقة فعلاً ───────────────────────────────────────────────
 *
 * These counts were tuned against what a page LOOKED like, not against the
 * sheet it lands on, and the difference produced a blank page after every
 * printout. Measured: one list page of sixteen rows is 277.6mm tall, while the
 * paper offers 210mm in landscape and about 271mm in a portrait dialog with
 * default margins — so every logical page spilled a sliver onto a sheet of its
 * own, and the reader met a trail of near-empty pages.
 *
 * Each number below is now the measured maximum that fits a landscape sheet
 * with room to spare for long Arabic names (verified by rendering to PDF and
 * counting sheets: 10 rows fit, 11 spill). Portrait sheets keep their own,
 * larger budget. The layout, typography and every design decision are
 * untouched — only how many items are asked to stand on one page.
 */
const PAGE_ROWS = {
  /* Measured on real sheets at 297×210mm, then tuned so a page is FULL without
     ever spilling. The first pass fixed the spill and left some reports at 41%
     of the paper — which turns one page of content into three. Percentages
     below are the measured fill after this tuning. */
  list: 10,           // 93% full · 13.9mm a row, and rows wrap on long names
  instructorRows: 7,  // one teacher per sheet, deliberately — this report reads best that way
  roomOccupancy: 18,  // a heat row is 7.1mm and the sheet's furniture 62.6mm — twenty fit, eighteen fit with room for long hall names
  roomFree: 14,       // free-window blocks
  /* The directory is one room to a LINE now, not four little boxes to a line:
     measured at 7.4mm a row against 58.4mm of page furniture, so nineteen fit
     and the old box-era number would have spilled. */
  roomDirectory: 17,
  matrixLines: 4,     // a hall × hours band per line
  timeGroups: 10,     // 9.3mm a group
  fairnessRows: 11,   // the score block costs 122mm before a single row is drawn: 12 rows measured 211mm, 11 fit
  balanceRows: 14,    // 8.0mm a department
} as const;

const COMPREHENSIVE_FIRST_PAGE_ROWS = 23;
const COMPREHENSIVE_NEXT_PAGE_ROWS = 23;
const minutes = (value: string) => { const [h, m] = String(value || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const duration = (row: FSchedule) => Math.max(0, minutes(row.fendtime) - minutes(row.fstarttime));
/**
 * The days of an appointment, as days.
 *
 * `fdetail` is a free-text field the legacy screen used for anything, and in
 * imported terms it often holds the day numbers — "1,3,5" — which is the one
 * thing this column must never show: a person reading a timetable does not
 * know that Sunday is 1. The flags are the truth, so they are read first, and
 * the free text is only used when it is genuinely a sentence.
 */
const dayFlags = (row: FSchedule) => DAYS.filter(day => (row as any)[day.flag]);
const dayText = (row: FSchedule) => {
  const named = dayFlags(row).map(day => day.label);
  if (named.length) return named.join(" · ");
  const detail = String(row.fdetail || "").trim();
  return /[\u0600-\u06FF]/.test(detail) ? detail : "";
};
/**
 * The days of a lecture, printed as days.
 *
 * A cell that simply held «الأحد · الاثنين» was wrapped by the browser at the
 * nearest opportunity, and Arabic offers no hyphen to soften it — so a narrow
 * column split «الأربعاء» into «الأر / بعاء». Each name is its own unbreakable
 * unit here and the separator is the only place a line may end, which is the
 * one break an Arabic reader would have made themselves.
 */
const dayCell = (row: FSchedule) => {
  const named = dayFlags(row).map(day => day.label);
  if (!named.length) {
    const detail = String(row.fdetail || "").trim();
    return /[\u0600-\u06FF]/.test(detail) ? detail : "";
  }
  return named.map((label, index) => (
    <React.Fragment key={label}>
      {index ? " · " : null}
      <bdi>{label}</bdi>
    </React.Fragment>
  ));
};
const share = (value: number, max: number) => `${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%`;


/**
 * Native selects expose even tiny data inconsistencies to the user. Imported
 * room/catalogue values can differ only by trailing spaces, bidi marks,
 * Unicode width, or Arabic/Persian digit forms; visually they are identical,
 * so a Set on the raw database string still rendered "9" twice. Normalize the
 * visible value once, and use the same canonical key everywhere a query filter
 * compares it.
 */
const cleanOptionText = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, "")
  .replace(/\s+/g, " ")
  .trim();
const optionKey = (value: unknown) => cleanOptionText(value)
  .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
  .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .toLocaleLowerCase("ar");
const uniqueTextOptions = (values: unknown[]) => {
  const seen = new Set<string>();
  return values.reduce<string[]>((list, value) => {
    const label = cleanOptionText(value);
    const key = optionKey(label);
    if (!key || seen.has(key)) return list;
    seen.add(key);
    list.push(label);
    return list;
  }, []);
};
const dedupeVisibleOptions = <T,>(
  rows: T[],
  keyOf: (row: T) => string,
  selectedId: number,
  idOf: (row: T) => number,
) => {
  const visible = new Map<string, T>();
  rows.forEach(row => {
    const key = keyOf(row);
    if (!key) return;
    const existing = visible.get(key);
    if (!existing || (selectedId && idOf(row) === selectedId)) visible.set(key, row);
  });
  return Array.from(visible.values());
};

/**
 * The answer, drawn as light while the query runs.
 *
 * «جارٍ التحميل» in the middle of an empty pane says only that something is
 * happening; a list of placeholder rows says what is coming and holds the
 * scroll position steady when the real rows land in their place. Inert — no
 * data, no interaction.
 */
function QuerySkeleton() {
  return (
    <div className="query-skeleton" role="status" aria-busy="true">
      <span className="sr-only">يجري تنفيذ الاستعلام</span>
      {Array.from({ length: 7 }).map((_, i) => (
        <div className="qsk-row" key={i} style={{ ["--i" as any]: i }}>
          <span className="qsk-rank" />
          <span className="qsk-core">
            <i className="qsk-line" style={{ width: `${58 - (i % 3) * 10}%` }} />
            <i className="qsk-line qsk-dim" style={{ width: `${34 + (i % 4) * 8}%` }} />
          </span>
          <span className="qsk-time" />
          <span className="qsk-tag" />
        </div>
      ))}
    </div>
  );
}

export default function Reports({ mode, user, scopes = [] }: Props) {
  const prefKey = `schedule-unified-prefs-${user?.SystemUserId || 0}`;
  const workspacePrefKey = `schedule-workspace-prefs-${user?.SystemUserId || 0}`;
  let saved: any = {};
  let workspaceSaved: any = {};
  try { saved = JSON.parse(localStorage.getItem(prefKey) || "{}"); } catch { /* first run */ }
  try { workspaceSaved = JSON.parse(localStorage.getItem(workspacePrefKey) || "{}"); } catch { /* first run */ }

  const [lens, setLens] = useState<Lens>(() => (LENSES.some(x => x.id === saved.lens) ? saved.lens : LENS_FOR_MODE[mode] || "list"));
  const [colleges, setColleges] = useState<AdCollege[]>([]);
  const [sections, setSections] = useState<AdSection[]>([]);
  const [terms, setTerms] = useState<AdTerm[]>([]);
  const [instructors, setInstructors] = useState<AdInstructor[]>([]);
  const [courses, setCourses] = useState<AdCourse[]>([]);
  const [all, setAll] = useState<FSchedule[]>([]);
  const [locationRegistry, setLocationRegistry] = useState<{buildings:MasterBuilding[];rooms:MasterRoom[]}>({buildings:[],rooms:[]});
  const [filters, setFilters] = useState<Filters>(() => ({
    ...fresh(),
    ...(saved.filters || {}),
    collegeId: Number(saved.filters?.collegeId || workspaceSaved.filterCollege || 0) || 0,
    sectionId: Number(saved.filters?.sectionId || workspaceSaved.filterSection || 0) || 0,
    termId: Number(saved.filters?.termId || workspaceSaved.filterTerm || 0) || 0,
    instructorId: 0,
    instructorQuery: "",
    civil: "",
    building: cleanOptionText(saved.filters?.building || ""),
    hall: cleanOptionText(saved.filters?.hall || ""),
  }));
  const [moreOpen, setMoreOpen] = useState(false);
  const [printKind, setPrintKind] = useState<Exclude<PrintKind, null>>(() => (LENSES.some(x => x.id === saved.lens) ? saved.lens : LENS_FOR_MODE[mode] || "list"));
  const [authorityReport, setAuthorityReport] = useState<AuthorityReport | null>(null);
  const [authorityReportBusy, setAuthorityReportBusy] = useState(false);
  const [authorityReportAvailable, setAuthorityReportAvailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState(150);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<any>(null);
  const [occupancyLoading, setOccupancyLoading] = useState(false);
  const [roomDay, setRoomDay] = useState<number | "week">("week");
  /** Which square of the occupancy grid the reader asked about. */
  const [roomPick, setRoomPick] = useState<{ room: string; point: number | null } | null>(null);
  const [ask, setAsk] = useState("");
  const [askNote, setAskNote] = useState<string | null>(null);
  const [mobileWideNotice, setMobileWideNotice] = useState<Lens | null>(null);

  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);

  useEffect(() => {
    const nextLens = LENS_FOR_MODE[mode] || "list";
    setLens(nextLens);
    setPrintKind(nextLens);
  }, [mode]);
  useEffect(() => {
    // Persist the whole filter set, not just scope — every active chip
    // (instructor, course, civil id, time window, days) survives a reload and a
    // closed detail, matching the restore which already spreads all of them.
    localStorage.setItem(prefKey, JSON.stringify({ lens, filters }));
    // One shared academic context for the whole product. Merge rather than
    // replace so opening Reports never erases the schedule's view/colour prefs.
    let shared: any = {};
    try { shared = JSON.parse(localStorage.getItem(workspacePrefKey) || "{}"); } catch {}
    localStorage.setItem(workspacePrefKey, JSON.stringify({
      ...shared,
      filterCollege: Number(filters.collegeId || 0) || 0,
      filterSection: Number(filters.sectionId || 0) || 0,
      filterTerm: Number(filters.termId || 0) || 0,
    }));
  }, [prefKey, workspacePrefKey, lens, filters]);

  useEffect(() => {
    if(!filters.collegeId){ setLocationRegistry({buildings:[],rooms:[]}); return; }
    const controller=new AbortController();
    const qs=new URLSearchParams({collegeId:String(filters.collegeId)});
    if(filters.sectionId)qs.set("sectionId",String(filters.sectionId));
    fetch(`/api/location-registry?${qs}`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw new Error("تعذر تحميل سجل المباني والقاعات");return response.json();})
      .then(data=>setLocationRegistry({buildings:Array.isArray(data.buildings)?data.buildings:[],rooms:Array.isArray(data.rooms)?data.rooms:[]}))
      .catch(error=>{if(error?.name!=="AbortError")setError(String(error?.message||error));});
    return()=>controller.abort();
  },[filters.collegeId,filters.sectionId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const responses = await Promise.all(["colleges", "sections", "terms", "instructors", "courses"].map(x => fetch(`/api/${x}`)));
        if (responses.some(r => !r.ok)) throw new Error("تعذر تحميل البيانات");
        const data = await Promise.all(responses.map(r => r.json()));
        const sortedTerms = sortTermsNewest<AdTerm>(data[2]);
        setColleges(sortByName(data[0], (row: AdCollege) => row.AdCollegeName));
        setSections(sortByName(data[1], (row: AdSection) => row.AdSectionName));
        setTerms(sortedTerms);
        setInstructors(sortByName(data[3], (row: AdInstructor) => row.AdInstructorName));
        setCourses(sortByName(data[4], (row: AdCourse) => row.CourseName));
        // Keep the last academic workspace active after login/navigation. The
        // old code restored it in useState and then immediately zeroed it here,
        // which is why Reports looked like a first visit every time.
        setFilters(prev => {
          let collegeId = Number(prev.collegeId || 0) || 0;
          let sectionId = Number(prev.sectionId || 0) || 0;
          let termId = Number(prev.termId || 0) || 0;
          if (isPowerAdmin) {
            if (collegeId && !data[0].some((row: AdCollege) => Number(row.AdCollegeId) === collegeId)) collegeId = 0;
            const section = data[1].find((row: AdSection) => Number(row.AdSectionId) === sectionId);
            if (!section || (collegeId && Number(section.AdCollegeId) !== collegeId)) sectionId = 0;
          } else {
            const scoped = coerceScopeValues(scopes, collegeId, sectionId, false);
            collegeId = scoped.collegeId;
            sectionId = scoped.sectionId;
          }
          if (termId && !sortedTerms.some(row => Number(row.AdTermId) === termId)) termId = Number(sortedTerms[0]?.AdTermId || 0);
          return { ...prev, collegeId, sectionId, termId };
        });
      } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    })();
  }, []);

  /** Once a department is chosen, its own courses replace the whole catalogue. */
  useEffect(() => {
    if (!filters.sectionId) return;
    let alive = true;
    fetch(`/api/courses?sectionId=${filters.sectionId}`)
      .then(response => (response.ok ? response.json() : null))
      .then(list => {
        if (!alive || !Array.isArray(list) || !list.length) return;
        setCourses(sortByName(list, (row: AdCourse) => row.CourseName));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [filters.sectionId]);

  /**
   * The scope's rows, re-read when the scope changes — and when a colleague
   * changes the schedule underneath it.
   *
   * `pending` exists because switching department used to leave the previous
   * scope's answer on screen, complete with its count and a live print button,
   * until the new payload arrived — a report printed in that window carries the
   * wrong department's name over the right department's heading.
   */
  const [pending, setPending] = useState(false);
  const [liveNudge, setLiveNudge] = useState(false);
  const reportEventsRef = useRef<EventSource | null>(null);
  /**
   * ميزان الأقسام — every department of the term on one line each.
   *
   * Read only when the lens is opened, because it is the one reading that
   * deliberately steps outside the chosen scope, and only the main
   * administrator may ask for it at all.
   */
  const [balance, setBalance] = useState<any>(null);
  const [balanceSort, setBalanceSort] = useState<{ key: string; desc: boolean }>({ key: "rows", desc: true });
  const readScope = useCallback((signal?: AbortSignal, quiet = false) => {
    if (!filters.collegeId || !filters.termId) { setAll([]); return Promise.resolve(); }
    const query = new URLSearchParams({ termId: String(filters.termId) });
    if (filters.collegeId) query.set("collegeId", String(filters.collegeId));
    if (filters.sectionId) query.set("sectionId", String(filters.sectionId));
    if (!quiet) setPending(true);
    return fetch(`/api/schedules?${query}`, { signal })
      .then(response => {
        if (!response.ok) throw new Error("تعذر تحميل مواعيد النطاق الحالي");
        return response.json();
      })
      .then(rows => {
        setAll(rows);
        setLiveNudge(false);
        // A read that worked is the end of the previous failure. The banner used
        // to be set three times and cleared never, so one hiccup pinned a red
        // notice to the screen for the rest of the session.
        setError(null);
      })
      .catch((e: any) => { if (e?.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!quiet) setPending(false); });
  }, [filters.collegeId, filters.sectionId, filters.termId]);

  useEffect(() => {
    if (!filters.collegeId || !filters.termId) { setAll([]); return; }
    const controller = new AbortController();
    void readScope(controller.signal);
    return () => controller.abort();
  }, [readScope, filters.termId]);

  /**
   * A report is a photograph of a moving thing.
   *
   * The schedule workspace refreshes itself the moment anyone saves; this screen
   * did not, so a coordinator could print a departmental sheet from rows that
   * changed ten minutes ago while the schedule tab beside it showed the change
   * live. The same channel is used here — but a report is often mid-read or
   * mid-print, so nothing moves under the reader's hands: a quiet line offers
   * the refresh and the reader decides when to take it.
   */
  /* The balance lens exists only for the account that can act on it. */
  const shownLenses = useMemo(
    () => LENSES.filter(item => item.id !== "balance" || isPowerAdmin),
    [isPowerAdmin],
  );
  useEffect(() => {
    if (lens !== "balance" || !isPowerAdmin || !filters.termId) return;
    const controller = new AbortController();
    fetch(`/api/reports/department-balance?termId=${filters.termId}`, { signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (data) { setBalance(data); setError(null); } })
      .catch((e: any) => { if (e?.name !== "AbortError") setError("تعذّر قراءة ميزان الأقسام"); });
    return () => controller.abort();
  }, [lens, isPowerAdmin, filters.termId, liveNudge]);

  const closeReportEvents = useCallback(() => {
    const source = reportEventsRef.current;
    if (!source) return;
    source.close();
    reportEventsRef.current = null;
  }, []);
  const openReportEvents = useCallback(() => {
    if (typeof EventSource === "undefined" || reportEventsRef.current) return;
    const source = new EventSource("/api/schedules/events");
    const onChange = () => {
      setLiveNudge(true);
      /* A deleted timetable must also delete its stale comparison button from
         this screen. Re-read the scoped rows quietly on the live event instead
         of waiting for the reader to press Refresh. */
      void readScope(undefined, true);
    };
    source.addEventListener("schedules", onChange);
    source.addEventListener("error", () => {
      if (source.readyState === EventSource.CLOSED && reportEventsRef.current === source) reportEventsRef.current = null;
    });
    reportEventsRef.current = source;
  }, [readScope]);
  useEffect(() => {
    openReportEvents();
    return closeReportEvents;
  }, [openReportEvents, closeReportEvents]);

  useEffect(() => {
    if (!sections.length || isPowerAdmin || !filters.collegeId) return;
    setFilters(prev => {
      const next = coerceScopeValues(scopes, prev.collegeId, prev.sectionId, false);
      if (next.collegeId === prev.collegeId && next.sectionId === prev.sectionId) return prev;
      return { ...prev, collegeId: next.collegeId, sectionId: next.sectionId };
    });
  }, [sections.length, scopes, isPowerAdmin, filters.collegeId]);

  const scopeState = resolveScopeSelection(scopes, filters.collegeId, isPowerAdmin);
  const baseScope = resolveScopeSelection(scopes, 0, isPowerAdmin);
  const collegeOptions = useMemo(() => dedupeVisibleOptions(
    sortByName(isPowerAdmin ? colleges : colleges.filter(c => baseScope.collegeIds.includes(Number(c.AdCollegeId))), (c: AdCollege) => c.AdCollegeName),
    row => optionKey(row.AdCollegeName), filters.collegeId, row => Number(row.AdCollegeId),
  ), [colleges, isPowerAdmin, baseScope.collegeIds.join("|"), filters.collegeId]);
  const sectionOptions = useMemo(() => dedupeVisibleOptions(
    sortByName(sections.filter(s => (!filters.collegeId || s.AdCollegeId === filters.collegeId) && (isPowerAdmin || scopeState.sectionIds.includes(Number(s.AdSectionId)))), (s: AdSection) => s.AdSectionName),
    row => `${Number(row.AdCollegeId) || 0}|${optionKey(row.AdSectionName)}`, filters.sectionId, row => Number(row.AdSectionId),
  ), [sections, filters.collegeId, filters.sectionId, isPowerAdmin, scopeState.sectionIds.join("|")]);
  /**
   * A course can exist more than once in imported catalogues (different legacy
   * IDs / code variants) while carrying the exact same visible name inside the
   * same department.  The report selector is a human-facing list, so one
   * visible course must be one option.  Keep the department in the key to avoid
   * collapsing genuinely different departments when an administrator is
   * working across the college.
   */
  const courseIdentityKey = useCallback((row: AdCourse) => {
    const sectionId = Number(row.AdSectionId) || 0;
    const visibleName = optionKey(row.CourseName);
    const fallbackCode = optionKey(row.CourseCode);
    return `${sectionId}|${visibleName || fallbackCode}`;
  }, []);
  const courseOptions = useMemo(() => {
    // Cascading query logic: once a room/building is chosen, a course selector
    // must describe that physical context, not the whole department catalogue.
    const contextualRows = all.filter(row =>
      (!filters.collegeId || Number(row.AdCollegeId) === Number(filters.collegeId)) &&
      (!filters.sectionId || Number(row.AdSectionId) === Number(filters.sectionId)) &&
      (!filters.termId || Number(row.AdTermId) === Number(filters.termId)) &&
      rowMatchesBuilding(row, filters.building) &&
      rowMatchesRoom(row, filters.hall)
    );
    const allowedIds = (filters.building || filters.hall)
      ? new Set(contextualRows.map(row => Number(row.AdCourseId)).filter(Boolean))
      : null;
    const source = courses.filter(c =>
      (!filters.sectionId || c.AdSectionId === filters.sectionId) &&
      (!allowedIds || allowedIds.has(Number(c.AdCourseId)) || Number(c.AdCourseId) === Number(filters.courseId))
    );
    return dedupeVisibleOptions(
      sortByName(source, (c: AdCourse) => c.CourseName),
      row => courseIdentityKey(row), filters.courseId, row => Number(row.AdCourseId),
    );
  }, [all, courses, filters.collegeId, filters.sectionId, filters.termId, filters.building, filters.hall, filters.courseId, courseIdentityKey, rowMatchesBuilding, rowMatchesRoom]);
  const termOptions = useMemo(() => dedupeVisibleOptions<AdTerm>(
    terms,
    row => optionKey(row.AdTermName), filters.termId, row => Number(row.AdTermId),
  ), [terms, filters.termId]);
  const instructorOptions = useMemo(() => dedupeVisibleOptions<AdInstructor>(
    instructors,
    row => optionKey(row.AdInstructorCivil) || optionKey(row.AdInstructorName), filters.instructorId, row => Number(row.AdInstructorId),
  ), [instructors, filters.instructorId]);
  const rowLocation = useCallback((row: FSchedule) => {
    let building = row.buildingId ? locationRegistry.buildings.find(item => item.id === row.buildingId) : undefined;
    if (!building && row.AdRoomCode) {
      const resolved = resolveBuilding(locationRegistry, row.AdRoomCode, { collegeId:Number(row.AdCollegeId)||undefined, sectionId:Number(row.AdSectionId)||undefined });
      if (resolved.status === "CONFIRMED") building = resolved.value;
    }
    let room = row.roomId ? locationRegistry.rooms.find(item => item.id === row.roomId) : undefined;
    if (!room && building && row.AdRoomHall) {
      const resolved = resolveRoom(locationRegistry, row.AdRoomHall, building.id, { collegeId:Number(row.AdCollegeId)||undefined, sectionId:Number(row.AdSectionId)||undefined, buildingId:building.id });
      if (resolved.status === "CONFIRMED") room = resolved.value;
    }
    return { building, room };
  }, [locationRegistry]);
  const rowMatchesBuilding = useCallback((row: FSchedule, buildingId: string) => !buildingId || rowLocation(row).building?.id === buildingId, [rowLocation]);
  const rowMatchesRoom = useCallback((row: FSchedule, roomId: string) => !roomId || rowLocation(row).room?.id === roomId, [rowLocation]);
  const instructorById = useMemo(() => new Map(instructors.map(x => [x.AdInstructorId, x])), [instructors]);
  const courseById = useMemo(() => new Map(courses.map(x => [x.AdCourseId, x])), [courses]);
  const collegeById = useMemo(() => new Map(colleges.map(x => [x.AdCollegeId, x])), [colleges]);
  const sectionById = useMemo(() => new Map(sections.map(x => [x.AdSectionId, x])), [sections]);
  const termById = useMemo(() => new Map(terms.map(x => [x.AdTermId, x])), [terms]);
  const departmentInstructorIds = useMemo(() => Array.from(new Set(all.filter(row => (!filters.sectionId || Number(row.AdSectionId) === Number(filters.sectionId)) && (!filters.termId || Number(row.AdTermId) === Number(filters.termId))).map(row => Number(row.AdInstructorId)).filter(Boolean))), [all, filters.sectionId, filters.termId]);

  const buildings = useMemo(() => {
    const ids = new Set<string>();
    all.forEach(row => { const building=rowLocation(row).building; if(building?.active) ids.add(building.id); });
    if (filters.building) ids.add(filters.building);
    return locationRegistry.buildings.filter(item=>ids.has(item.id)).sort((a,b)=>byRoomPart(a.officialCode,b.officialCode));
  }, [all, locationRegistry.buildings, filters.building, rowLocation]);
  const halls = useMemo(() => {
    if(!filters.building)return [] as MasterRoom[];
    const ids = new Set<string>();
    all.filter(row=>rowMatchesBuilding(row,filters.building)).forEach(row=>{const room=rowLocation(row).room;if(room?.active)ids.add(room.id);});
    if(filters.hall)ids.add(filters.hall);
    return locationRegistry.rooms.filter(room=>room.buildingId===filters.building&&ids.has(room.id)).sort((a,b)=>byRoomPart(a.canonicalCode,b.canonicalCode));
  }, [all, locationRegistry.rooms, filters.building, filters.hall, rowLocation, rowMatchesBuilding]);

  /** One predicate serves every lens. Nothing is mode-specific any more. */
  const results = useMemo(() => {
    let rows = [...all];
    if (filters.collegeId) rows = rows.filter(s => s.AdCollegeId === filters.collegeId);
    if (filters.sectionId) rows = rows.filter(s => s.AdSectionId === filters.sectionId);
    if (filters.termId) rows = rows.filter(s => s.AdTermId === filters.termId);
    if (filters.instructorId) rows = rows.filter(s => s.AdInstructorId === filters.instructorId);
    if (filters.civil.trim()) rows = rows.filter(s => (instructorById.get(s.AdInstructorId)?.AdInstructorCivil || "").includes(filters.civil.trim()));
    if (filters.instructorQuery.trim()) {
      const raw = filters.instructorQuery.trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
      const numberQuery = /^\d+$/.test(raw);
      const nameQuery = sortKey(raw).toLowerCase();
      rows = rows.filter(s => {
        const instructor = instructorById.get(s.AdInstructorId);
        return numberQuery
          ? String(instructor?.AdInstructorCivil || "").includes(raw)
          : sortKey(instructor?.AdInstructorName || "").toLowerCase().includes(nameQuery);
      });
    }
    if (filters.building) rows = rows.filter(s => rowMatchesBuilding(s, filters.building));
    if (filters.hall) rows = rows.filter(s => rowMatchesRoom(s, filters.hall));
    if (filters.startTime && filters.endTime) {
      /* A lecture that lives entirely inside the window is the most obvious
         answer to "what is on between ten and twelve", and the old test — which
         only matched appointments straddling an endpoint — was the one shape
         that missed it. This is the same overlap rule the conflict detector
         uses: any shared minute counts, and touching edges do not. */
      rows = rows.filter(s => s.fstarttime < filters.endTime && s.fendtime > filters.startTime);
    }
    if (filters.courseId) {
      const chosen = courseById.get(filters.courseId);
      const chosenIdentity = chosen ? courseIdentityKey(chosen) : "";
      rows = rows.filter(s => {
        if (!chosenIdentity) return Number(s.AdCourseId) === Number(filters.courseId);
        const rowCourse = courseById.get(s.AdCourseId);
        return rowCourse ? courseIdentityKey(rowCourse) === chosenIdentity : Number(s.AdCourseId) === Number(filters.courseId);
      });
    }
    if (filters.courseCode.trim()) rows = rows.filter(s => (courseById.get(s.AdCourseId)?.CourseCode || "") === filters.courseCode.trim());
    const chosenDays = DAYS.filter(day => filters[day.key]);
    if (chosenDays.length) rows = rows.filter(s => chosenDays.some(day => (s as any)[day.flag]));
    return rows.sort((a, b) =>
      byArabic(courseById.get(a.AdCourseId)?.CourseName || a.AdCourseName, courseById.get(b.AdCourseId)?.CourseName || b.AdCourseName) ||
      byArabic(a.SCode, b.SCode) ||
      String(a.fstarttime).localeCompare(String(b.fstarttime)) ||
      Number(a.id) - Number(b.id)
    );
  }, [all, filters, instructorById, courseById, courseIdentityKey]);

  const set = (key: keyof Filters, value: any) => setFilters(prev => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(prev => ({ ...fresh(), collegeId: prev.collegeId, sectionId: prev.sectionId, termId: prev.termId }));

  /**
   * Ask in plain Arabic.
   *
   * "قاعات فاضية الثلاثاء 10", "جدول د. أحمد", "فراغات نورة الأحد", "ب-101" —
   * the sentence is parsed on the spot and turned into the filters and the lens
   * that answer it. Nothing is sent anywhere, so the answer appears as fast as
   * it can be typed, and every question stays reproducible.
   */
  const runAsk = (text: string) => {
    const question = parseNaturalQuery(text);
    if (question.intent === "unknown" && !question.name) { setAskNote("لم أفهم السؤال — جرّب: قاعات فاضية الثلاثاء 10"); return; }

    const next: Filters = { ...fresh(), collegeId: filters.collegeId, sectionId: filters.sectionId, termId: filters.termId };
    const said: string[] = [];

    if (question.day !== null) { next[DAYS[question.day].key] = true; said.push(DAYS[question.day].label); }
    if (question.time) {
      const [hour, minute] = question.time.split(":").map(Number);
      next.startTime = question.time;
      next.endTime = `${String(Math.min(23, hour + 1)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      said.push(question.time);
    }
    if (question.room) {
      const [code, hall] = question.room.split("-");
      const building=locationRegistry.buildings.find(item=>optionKey(item.officialCode)===optionKey(code));
      const room=building?locationRegistry.rooms.find(item=>item.buildingId===building.id&&optionKey(item.canonicalCode)===optionKey(hall)):undefined;
      if(building)next.building=building.id;if(room)next.hall=room.id;
      said.push(building&&room?`${building.officialCode}-${room.canonicalCode}`:`${code}-${hall}`);
    }
    const named = question.name
      ? instructors.find(row => String(row.AdInstructorName || "").includes(question.name as string))
      : null;
    if (named) { next.instructorId = named.AdInstructorId; said.push(named.AdInstructorName); }

    const target: Lens =
      question.intent === "freeRooms" ? "room"
      : question.intent === "room" ? "room"
      : question.intent === "gaps" ? "week"
      : named ? "instructor"
      : question.intent === "time" ? "time"
      : lens;

    // A free-room question is about availability, not about one department's
    // rows, so it drops the instructor filter and opens on the chosen day.
    if (question.intent === "freeRooms") { next.instructorId = 0; setRoomDay(question.day ?? "week"); }

    runVisualTransition(() => { setFilters(next); setLens(target); setOpenGroup(null); });
    setAskNote(said.length ? said.join(" · ") : null);
  };

  /**
   * Active, removable filters. Scope stays visible in the primary row; these
   * chips mirror only the optional filters hidden behind “more”, so a reader
   * can always see (and remove) what is narrowing the result set.
   */
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  const selectedInstructor = filters.instructorId ? instructorById.get(filters.instructorId) : null;
  const selectedCourse = filters.courseId ? courseById.get(filters.courseId) : null;
  if (selectedInstructor) chips.push({ key: "instructor", label: `الأستاذ: ${selectedInstructor.AdInstructorName}`, clear: () => set("instructorId", 0) });
  if (filters.civil) chips.push({ key: "civil", label: `الرقم المدني: ${filters.civil}`, clear: () => set("civil", "") });
  if (filters.instructorQuery) chips.push({ key: "instructor-query", label: `الأستاذ: ${filters.instructorQuery}`, clear: () => set("instructorQuery", "") });
  if (filters.building) chips.push({ key: "building", label: `المبنى: ${locationRegistry.buildings.find(b=>b.id===filters.building)?.officialCode||"رسمي"}`, clear: () => setFilters(prev => ({ ...prev, building: "", hall: "" })) });
  if (filters.hall) chips.push({ key: "hall", label: `القاعة: ${locationRegistry.rooms.find(r=>r.id===filters.hall)?.canonicalCode||"رسمية"}`, clear: () => set("hall", "") });
  if (selectedCourse) chips.push({ key: "course", label: `المقرر: ${selectedCourse.CourseName}`, clear: () => set("courseId", 0) });
  if (filters.courseCode) chips.push({ key: "course-code", label: `الرقم الأكاديمي: ${filters.courseCode}`, clear: () => set("courseCode", "") });
  if (filters.startTime && filters.endTime) chips.push({
    key: "time",
    label: `الفترة: ${formatScheduleTimeRange(filters.startTime, filters.endTime)}`,
    clear: () => setFilters(prev => ({ ...prev, startTime: "", endTime: "" }))
  });
  DAYS.filter(day => filters[day.key]).forEach(day => chips.push({
    key: `day-${day.key}`,
    label: `اليوم: ${day.label}`,
    clear: () => set(day.key, false)
  }));

  const resultCollegeIds = [...new Set(results.map(row => Number(row.AdCollegeId || 0)).filter(Boolean))];
  const resultSectionIds = [...new Set(results.map(row => Number(row.AdSectionId || 0)).filter(Boolean))];
  const resolvedCollegeId = filters.collegeId || (resultCollegeIds.length === 1 ? resultCollegeIds[0] : 0);
  const resolvedSectionId = filters.sectionId || (resultSectionIds.length === 1 ? resultSectionIds[0] : 0);
  const collegeName = collegeById.get(resolvedCollegeId)?.AdCollegeName || (resultCollegeIds.length > 1 ? "عدة كليات" : "");
  const collegeCode = collegeById.get(resolvedCollegeId)?.AdCollegeCode || "";
  const termName = termById.get(filters.termId)?.AdTermName || "";
  const section = sectionById.get(resolvedSectionId);
  const sectionName = section?.AdSectionName || (resultSectionIds.length > 1 ? "عدة أقسام" : "");
  const sectionCode = section?.AdSectionCode || "";
  const scopeLine = [
    termName,
    collegeName,
    sectionName
  ].filter(Boolean).join(" · ");

  // --- grouped views -------------------------------------------------------

  const byInstructor = useMemo(() => {
    const groups = new Map<number, FSchedule[]>();
    results.forEach(row => groups.set(row.AdInstructorId, [...(groups.get(row.AdInstructorId) || []), row]));
    return [...groups.entries()]
      .map(([id, rows]) => ({
        id: String(id), name: instructorById.get(id)?.AdInstructorName || "بدون أستاذ",
        rows, count: rows.length,
        load: rows.reduce((total, row) => total + duration(row) * DAYS.filter(day => (row as any)[day.flag]).length, 0),
        days: new Set(rows.flatMap(row => DAYS.filter(day => (row as any)[day.flag]).map(day => day.key))).size
      }))
      .sort((a, b) => byRoomLabel(a.name, b.name));
  }, [results, instructorById]);

  const byTime = useMemo(() => {
    const groups = new Map<string, FSchedule[]>();
    results.forEach(row => groups.set(row.fstarttime, [...(groups.get(row.fstarttime) || []), row]));
    return [...groups.entries()]
      .map(([key, rows]) => {
        const courses = new Set(rows.map(row => Number(row.AdCourseId || 0)).filter(Boolean)).size;
        const instructors = new Set(rows.map(row => Number(row.AdInstructorId || 0)).filter(Boolean)).size;
        const rooms = [...new Map(rows.map(row => [roomIdentityKey(row), roomDisplay(row)] as const).filter(([key])=>Boolean(key))).values()].sort(byRoomLabel);
        const days = new Set(rows.flatMap(row => DAYS.filter(day => (row as any)[day.flag]).map(day => day.key))).size;
        return { key, rows, count: rows.length, courses, instructors, rooms, days };
      })
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [results]);

  const fairness = useMemo(() => {
    if (!byInstructor.length) return null;
    const loads = byInstructor.map(x => x.load);
    const average = loads.reduce((a, b) => a + b, 0) / loads.length;
    const spread = Math.max(...loads) - Math.min(...loads);
    const deviation = Math.sqrt(loads.reduce((total, value) => total + (value - average) ** 2, 0) / loads.length);
    const score = Math.max(0, Math.min(100, Math.round(100 - (average ? (deviation / average) * 100 : 0))));
    return { average, spread, deviation, score, rows: byInstructor.map(row => ({ ...row, delta: row.load - average })).sort((a, b) => b.load - a.load) };
  }, [byInstructor]);

  const weekGrid = useMemo(() => DAYS.map(day => ({
    ...day,
    rows: results.filter(row => (row as any)[day.flag]).sort((a, b) => a.fstarttime.localeCompare(b.fstarttime))
  })), [results]);

  // --- room occupancy ------------------------------------------------------
  // A hall booked by another college is still busy, so occupancy is read from a
  // dedicated endpoint that sees the whole term but returns only times.
  useEffect(() => {
    if (lens !== "room" || !filters.termId) { setOccupancyLoading(false); return; }
    const controller = new AbortController();
    const query = new URLSearchParams({ termId: String(filters.termId) });
    if (filters.collegeId) query.set("collegeId", String(filters.collegeId));
    if (filters.sectionId) query.set("sectionId", String(filters.sectionId));
    setOccupancyLoading(true);
    (async () => {
      try {
        const response = await fetch(`/api/reports/room-load?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("تعذر قراءة إشغال القاعات");
        setOccupancy(await response.json());
        setError(null);
      } catch (e: any) {
        if (e?.name !== "AbortError") { setOccupancy(null); setError(e.message); }
      } finally {
        if (!controller.signal.aborted) setOccupancyLoading(false);
      }
    })();
    return () => controller.abort();
  }, [lens, filters.termId, filters.collegeId, filters.sectionId]);

  /**
   * The paper sheet, rebuilt.
   *
   * Departments have kept this table on paper for years and it is the right
   * shape for the question it answers: a hall down the side, the teaching hours
   * across the top, and every cell naming what occupies it. Reading a week from
   * a room's point of view — is F12 free at eleven, and if not, who is in it —
   * is not something a day column can answer, and it is the question a
   * timetable coordinator is asked most often.
   *
   * Each hall repeats once per group of days, exactly as the paper does, so the
   * Sunday/Tuesday/Thursday pattern and the Monday/Wednesday pattern each get
   * their own line rather than being folded together into an unreadable cell.
   */
  const [matrixBuilding, setMatrixBuilding] = useState("");
  const [matrixHall, setMatrixHall] = useState("");
  const matrix = useMemo(() => {
    const DAY_GROUPS: Array<{ id: string; label: string; days: number[] }> = [
      { id: "ste", label: "الأحد · الثلاثاء · الخميس", days: [0, 2, 4] },
      { id: "mw", label: "الاثنين · الأربعاء", days: [1, 3] },
    ];
    const placed = results.filter(row => row.fstarttime && row.fendtime && row.buildingId && row.roomId && row.locationStatus !== "PENDING_ROOM" && row.locationStatus !== "LOCATION_REVIEW_REQUIRED" && row.locationStatus !== "INVALID_HISTORICAL");
    if (!placed.length) return null;

    const usedBuildingIds = new Set(placed.map(row => String(row.buildingId)));
    const buildings = locationRegistry.buildings.filter(building => usedBuildingIds.has(building.id)).sort((a,b)=>byRoomPart(a.officialCode,b.officialCode));
    const scoped = placed.filter(row =>
      (!matrixBuilding || String(row.buildingId) === matrixBuilding) &&
      (!matrixHall || String(row.roomId) === matrixHall));

    const from = GRID_START;
    const to = GRID_END;
    const columns: number[] = [];
    for (let point = from; point < Math.max(to, from + 60); point += 60) columns.push(point);

    type Hall = { key: string; building: string; hall: string };
    const halls: Hall[] = [...new Map<string, Hall>(scoped.map(row => {
      const building = cleanOptionText(row.AdRoomCode);
      const hall = cleanOptionText(row.AdRoomHall);
      const key = roomIdentityKey(row);
      return [key, { key, building, hall }] as const;
    })).values()].sort((a, b) => byRoom(a.building, a.hall, b.building, b.hall));

    const lines = halls.flatMap(room => DAY_GROUPS.map(group => {
      const inRoom = scoped.filter(row =>
        roomIdentityKey(row) === room.key &&
        group.days.some(index => Boolean((row as any)[DAYS[index].flag])));
      const cells = columns.map(point => ({
        point,
        rows: inRoom.filter(row => minutes(row.fstarttime) < point + 60 && minutes(row.fendtime) > point),
      }));
      return { id: `${room.key}|${group.id}`, room, group, cells, used: inRoom.length };
    })).filter(line => line.used > 0);

    return { columns, lines, buildings, total: scoped.length };
  }, [results, matrixBuilding, matrixHall, locationRegistry.buildings]);

  const roomLoad = useMemo(() => {
    if (!occupancy?.rooms?.length) return null;
    const dayStart = GRID_START;
    const dayEnd = GRID_END;
    const slots: number[] = [];
    for (let point = dayStart; point < dayEnd; point += 60) slots.push(point);
    const days = roomDay === "week" ? [0, 1, 2, 3, 4] : [roomDay];
    const capacity = slots.length * days.length;

    const rooms = occupancy.rooms.map((room: any) => {
      const busy = (room.busy || []).filter((slot: any) => days.includes(slot.day));
      // One cell per hour: 0 = free, otherwise how many of the chosen days are taken.
      const cells = slots.map(point => {
        const taken = days.filter(day => busy.some((slot: any) => slot.day === day && slot.from < point + 60 && slot.to > point));
        const mine = days.some(day => busy.some((slot: any) => slot.day === day && slot.mine && slot.from < point + 60 && slot.to > point));
        return { point, taken: taken.length, mine };
      });
      const used = cells.reduce((total, cell) => total + cell.taken, 0);
      // Free windows are runs of untouched hours, and only worth naming at 60m+.
      const windows: Array<{ day: number; from: number; to: number }> = [];
      days.forEach(day => {
        let run: number | null = null;
        slots.forEach(point => {
          const free = !busy.some((slot: any) => slot.day === day && slot.from < point + 60 && slot.to > point);
          if (free && run === null) run = point;
          if (!free && run !== null) { windows.push({ day, from: run, to: point }); run = null; }
        });
        if (run !== null) windows.push({ day, from: run, to: dayEnd });
      });
      return {
        key: `${room.room}|${room.hall}`,
        name: `${room.room}/${room.hall}`,
        mine: Boolean(room.mine),
        cells, windows,
        usedHours: used,
        rate: Math.round((used / Math.max(1, capacity)) * 100)
      };
    });
    const totalRate = Math.round(rooms.reduce((total: number, room: any) => total + room.rate, 0) / Math.max(1, rooms.length));
    /* The grid is a MAP of the estate, not a ranking of it: a reader looks up
       a hall by its number, so the rows run in room order — building then
       hall, numerically. It used to lead with the busiest room, which is why
       «9/F13» sat above «7/F31» and the sheet read as if it had no order at
       all. The occupancy share is still on every row for whoever wants it. */
    return { slots, rooms: rooms.sort((a: any, b: any) => byRoomLabel(a.name, b.name)), totalRate, days };
  }, [occupancy, roomDay]);

  // --- output --------------------------------------------------------------

  /** Every filter the screen is showing travels with the export, so the
   *  spreadsheet is the same answer in another format — not a wider one. */
  const queryString = () => {
    const params = new URLSearchParams();
    if (filters.termId) params.set("termId", String(filters.termId));
    if (filters.collegeId) params.set("collegeId", String(filters.collegeId));
    if (filters.sectionId) params.set("sectionId", String(filters.sectionId));
    if (filters.instructorId) params.set("instructorId", String(filters.instructorId));
    if (filters.building) params.set("building", filters.building);
    if (filters.hall) params.set("hall", filters.hall);
    if (filters.courseId) params.set("courseId", String(filters.courseId));
    if (filters.courseCode.trim()) params.set("courseCode", filters.courseCode.trim());
    if (filters.civil.trim()) params.set("civil", filters.civil.trim());
    if (filters.startTime && filters.endTime) {
      params.set("startTime", filters.startTime);
      params.set("endTime", filters.endTime);
    }
    DAYS.forEach(day => { if (filters[day.key]) params.set(day.key, "true"); });
    return params.toString();
  };
  const printReport = (kind: Exclude<PrintKind, null> = lens) => {
    /* Safari/WebKit has a long-standing failure mode where an active EventSource
       can make window.print() silently do nothing. Pause the live schedule stream
       synchronously inside the same tap, commit the requested sheet synchronously,
       then invoke the browser print command without RAF/timers/await. */
    closeReportEvents();
    if (printKind !== kind) {
      flushSync(() => {
        setPrintKind(kind);
      });
    }

    const root = document.documentElement;
    root.dataset.printKind = kind;
    /* ── ورقة واحدة لكل التقارير: عرضية ─────────────────────────────────
       Every report in this program is designed on a wide sheet, and the two
       that were set portrait were the two that kept arriving broken: a wide
       design meeting a narrow page loses its left edge, and the reader has to
       know about a switch to get their own document printed properly.
       So there is no switch and no exception any more. Chrome asks for the
       landscape page through `@page`; Safari ignores that, so the sheet is
       painted rotated inside Safari's portrait page — geometry only, and
       invisible to every other engine. */
    if (SAFARI_PRINT_ENGINE) root.dataset.printRotate = "1";
    let leftForPrint = false;
    let resumed = false;
    /* Two different things end here, and they must not end together.
       Restoring the live stream is safe at any moment. STRIPPING THE PRINT
       ATTRIBUTES IS NOT: a preview can still be open, and Safari re-lays the
       preview out when the document changes — so a timer that cleared them
       mid-preview re-flowed the sheets and produced the broken portrait
       letterheads. The attributes now come off only when the printing is
       really over: afterprint, or the moment the reader comes back to the
       page. The timer restores the stream and nothing else. */
    const clearPrintFlags = () => {
      delete root.dataset.printKind;
      delete root.dataset.printRotate;
    };
    const resume = () => {
      if (resumed) return;
      resumed = true;
      window.removeEventListener("afterprint", resume);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearPrintFlags();
      openReportEvents();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") leftForPrint = true;
      else if (leftForPrint) resume();
    };
    window.addEventListener("afterprint", resume, { once: true });
    document.addEventListener("visibilitychange", onVisibilityChange);

    let invoked = false;
    if (SAFARI_PRINT_ENGINE && typeof document.execCommand === "function") {
      try { invoked = document.execCommand("print"); } catch { invoked = false; }
    }
    if (!invoked) window.print();

    /* If a browser no-ops the print command, don't leave live updates paused —
       but leave the sheet exactly as the printer sees it. */
    window.setTimeout(() => { if (!leftForPrint && !resumed) openReportEvents(); }, 2500);
  };

  useEffect(() => {
    let cancelled = false;
    const { collegeId, sectionId, termId } = filters;
    if (!collegeId || !sectionId || !termId || !all.length) { setAuthorityReportAvailable(false); return; }
    const query = new URLSearchParams({ collegeId:String(collegeId), sectionId:String(sectionId), termId:String(termId), meta:"1" });
    fetch(`/api/reports/authority-pdf-diff?${query}`)
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!cancelled) setAuthorityReportAvailable(Boolean(data?.hasChanges)); })
      .catch(() => { if (!cancelled) setAuthorityReportAvailable(false); });
    return () => { cancelled = true; };
  }, [filters.collegeId, filters.sectionId, filters.termId, all.length]);

  const printAuthorityReport = async () => {
    if (!filters.collegeId || !filters.sectionId || !filters.termId) {
      setError("اختر الفصل والكلية والقسم أولاً لفتح تقرير تغييرات الجدول.");
      return;
    }
    setAuthorityReportBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        collegeId: String(filters.collegeId),
        sectionId: String(filters.sectionId),
        termId: String(filters.termId),
      });
      const response = await fetch(`/api/reports/authority-pdf-diff?${query}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "تعذر إعداد تقرير تغييرات الجدول");

      closeReportEvents();
      flushSync(() => setAuthorityReport(data as AuthorityReport));

      const root = document.documentElement;
      root.dataset.printKind = "authority-pdf";
      if (SAFARI_PRINT_ENGINE) root.dataset.printRotate = "1";
      let leftForPrint = false;
      let resumed = false;
      const clearPrintFlags = () => {
        delete root.dataset.printKind;
        delete root.dataset.printRotate;
      };
      const resume = () => {
        if (resumed) return;
        resumed = true;
        window.removeEventListener("afterprint", resume);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        clearPrintFlags();
        openReportEvents();
      };
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") leftForPrint = true;
        else if (leftForPrint) resume();
      };
      window.addEventListener("afterprint", resume, { once: true });
      document.addEventListener("visibilitychange", onVisibilityChange);

      let invoked = false;
      if (SAFARI_PRINT_ENGINE && typeof document.execCommand === "function") {
        try { invoked = document.execCommand("print"); } catch { invoked = false; }
      }
      if (!invoked) window.print();
      window.setTimeout(() => { if (!leftForPrint && !resumed) openReportEvents(); }, 2500);
    } catch (e: any) {
      setError(e?.message || "تعذر إعداد تقرير تغييرات الجدول");
    } finally {
      setAuthorityReportBusy(false);
    }
  };

  const groups = lens === "instructor" ? byInstructor : [];
  const maxLoad = Math.max(1, ...byInstructor.map(group => group.load));
  const maxSlot = Math.max(1, ...byTime.map(slot => slot.count));
  const selectedResult = selectedResultId === null ? null : results.find(row => row.id === selectedResultId) || null;
  const pickedCourse = selectedResult ? courseById.get(selectedResult.AdCourseId) : null;
  const pickedInstructor = selectedResult ? instructorById.get(selectedResult.AdInstructorId) : null;
  const selectedResultDetail = selectedResult ? (
    <>
      <div className="query-detail-backdrop no-print" onMouseDown={() => setSelectedResultId(null)} aria-hidden="true" />
      <aside
        className="occupancy-pick query-detail-panel no-print"
        id="query-result-detail-panel"
        role="dialog"
        aria-label={`تفاصيل ${pickedCourse?.CourseName || selectedResult.AdCourseName || "الموعد"}`}
      >
        <header>
          <div><small>تفاصيل الموعد</small><strong>{pickedCourse?.CourseName || selectedResult.AdCourseName || "—"}</strong></div>
          <span className="occupancy-pick-count">الشعبة {selectedResult.SCode || "—"}</span>
          <button type="button" onClick={() => setSelectedResultId(null)} aria-label="إغلاق التفاصيل" title="إغلاق"><X aria-hidden="true" /></button>
        </header>
        <div className="occupancy-pick-rows">
          <article>
            <strong>{pickedInstructor?.AdInstructorName || "بدون أستاذ"}</strong>
            <span>{sectionById.get(selectedResult.AdSectionId)?.AdSectionName || "بدون قسم"}</span>
            <em>{dayText(selectedResult) || "بلا أيام"}</em>
            <time dir="ltr">{formatScheduleTimeRange(selectedResult.fstarttime, selectedResult.fendtime)}</time>
          </article>
          <article>
            <strong>{pickedCourse?.CourseCode || "بدون رمز"}</strong>
            <span>{collegeById.get(selectedResult.AdCollegeId)?.AdCollegeName || "بدون كلية"}</span>
            <em>{[selectedResult.AdRoomCode, selectedResult.AdRoomHall].filter(Boolean).join("/") || "بدون قاعة"}</em>
            <span>{selectedResult.fdetail || "لا توجد ملاحظات"}</span>
          </article>
        </div>
      </aside>
    </>
  ) : null;
  // The detail reads as a side panel, so the results list keeps its place and
  // its scroll. Escape closes it back to exactly where the reader left off.
  useEffect(() => {
    if (selectedResultId === null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedResultId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedResultId]);
  useEffect(() => {
    setSelectedResultId(null);
  }, [lens]);
  // The room-occupancy reading is the same side panel; Escape closes it too.
  useEffect(() => {
    if (!roomPick) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setRoomPick(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roomPick]);

  const selectLens = (next: Lens) => {
    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
    if (phone && (next === "week" || next === "room" || next === "matrix")) {
      setMobileWideNotice(next);
      return;
    }
    runVisualTransition(() => {
      setLens(next);
      setPrintKind(next);
      setOpenGroup(null);
      setRoomPick(null);
    });
  };

  useEffect(() => {
    const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
    if (phone && (lens === "week" || lens === "room" || lens === "matrix")) {
      setLens("list");
      setPrintKind("list");
    }
  }, []);

  const moveLensFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = shownLenses.length - 1;
    let target = index;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = last;
    else if (event.key === "ArrowLeft") target = index === last ? 0 : index + 1;
    else if (event.key === "ArrowRight") target = index === 0 ? last : index - 1;
    else return;
    event.preventDefault();
    const next = shownLenses[target];
    selectLens(next.id);
    requestAnimationFrame(() => document.getElementById(`query-lens-tab-${next.id}`)?.focus());
  };

  return (
    <div className="content-stack query-page visual-minimal">
      <PageTitle eyebrow="الاستعلامات والتقارير" subtitle={`سؤال واحد · ${shownLenses.length === 8 ? "ثماني عدسات" : "سبع عدسات"}`}>مركز الاستعلام</PageTitle>

      {error ? (
        <Notice onDismiss={() => setError(null)}>
          {error}
          {/* A failure with no way forward is a dead end; one press retries the
              read that failed rather than making the reader reload the page. */}
          <button type="button" className="notice-retry" onClick={() => { setError(null); void readScope(); }}>
            إعادة المحاولة
          </button>
        </Notice>
      ) : null}
      {liveNudge ? (
        <button type="button" className="query-live-nudge no-print" onClick={() => void readScope()}>
          <span className="query-live-dot" aria-hidden="true" />
          تغيّر الجدول بعد فتح هذا التقرير — اضغط للتحديث
        </button>
      ) : null}

      <section className="query-bar no-print" aria-label="نطاق السؤال">
        <form
          className="query-ask"
          onSubmit={event => { event.preventDefault(); runAsk(ask); }}
          role="search"
        >
          <Search aria-hidden="true" />
          <input
            value={ask}
            onChange={event => setAsk(event.target.value)}
            onKeyDown={event => {
              // Implicit form submission is unreliable in a form whose only
              // other control is the clear button, so Enter is handled here.
              if (event.key !== "Enter") return;
              event.preventDefault();
              runAsk(event.currentTarget.value);
            }}
            placeholder="اسأل: قاعات فاضية الثلاثاء 10"
            aria-label="اسأل بالعربية"
            aria-describedby={askNote ? "query-ask-note" : undefined}
            enterKeyHint="search"
          />
          {ask ? (
            <button type="button" onClick={() => { setAsk(""); setAskNote(null); resetFilters(); }} aria-label="مسح السؤال" title="مسح">
              <X />
            </button>
          ) : null}
        </form>
        {askNote ? <p className="query-ask-note" id="query-ask-note" role="status">{askNote}</p> : null}

        <div className="query-scope query-primary-filters" aria-label="المرشحات الأساسية">
          <Field label="الكلية">
            <select
              value={filters.collegeId || ""}
              onChange={event => {
                const id = Number(event.target.value) || 0;
                setFilters(prev => ({ ...prev, collegeId: id, sectionId: id && !isPowerAdmin ? (resolveScopeSelection(scopes, id, false).defaultSectionId || 0) : 0 }));
              }}
            >
              <option value="">اختر الكلية</option>
              {collegeOptions.map(row => <option key={row.AdCollegeId} value={row.AdCollegeId}>{cleanOptionText(row.AdCollegeName)}</option>)}
            </select>
          </Field>
          {isPowerAdmin || !scopeState.lockSection ? (
            <Field label="القسم">
              <select value={filters.sectionId || ""} disabled={!filters.collegeId} onChange={event => set("sectionId", Number(event.target.value) || 0)}>
                <option value="">كل الأقسام</option>
                {sectionOptions.map(row => <option key={row.AdSectionId} value={row.AdSectionId}>{cleanOptionText(row.AdSectionName)}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="الفصل">
            <select value={filters.termId || ""} onChange={event => set("termId", Number(event.target.value) || 0)}>
              <option value="">اختر الفصل</option>
              {termOptions.map(row => <option key={row.AdTermId} value={row.AdTermId}>{cleanOptionText(row.AdTermName)}</option>)}
            </select>
          </Field>
          <GhostButton
            type="button"
            onClick={() => setMoreOpen(v => !v)}
            aria-expanded={moreOpen}
            aria-controls="query-more-filters"
            aria-label={`مرشحات إضافية${chips.length ? `، ${countOf(chips.length, AR.filter)} نشط` : ""}`}
            title="مرشحات إضافية"
          >
            <SlidersHorizontal aria-hidden="true" />
            المزيد
            {chips.length ? <b className="tool-count">{chips.length}</b> : null}
          </GhostButton>
        </div>

        {moreOpen ? (
          <div className="query-more query-advanced-filters" id="query-more-filters" role="group" aria-label="مرشحات إضافية">
            <Field label="الأستاذ أو الرقم المدني">
              <InstructorPicker
                value={filters.instructorId}
                onChange={(id) => setFilters(prev => ({ ...prev, instructorId: id, instructorQuery: "", civil: "" }))}
                instructors={instructorOptions}
                departmentIds={departmentInstructorIds}
                collegeId={filters.collegeId}
                sectionId={filters.sectionId}
                termId={filters.termId}
              />
            </Field>
            <Field label="المبنى">
              <select value={filters.building} onChange={event => { set("building", event.target.value); set("hall", ""); }}>
                <option value="">الكل</option>
                {buildings.map(value => <option key={value.id} value={value.id}>{buildingNumberLabel(value)}</option>)}
              </select>
            </Field>
            <Field label="القاعة">
              <select value={filters.hall} onChange={event => set("hall", event.target.value)}>
                <option value="">الكل</option>
                {halls.map(value => <option key={value.id} value={value.id}>{value.canonicalCode}</option>)}
              </select>
            </Field>
            {/* Wrapped so the course can claim two columns of the filter grid:
                a 190px lane clipped «أسس نفسية لتكنولوجيا التعليم» to «أسس نفسية
                لتكنولوجيا التعل…», and a native select cannot wrap its way out.
                The title carries the whole name for the rare one that is longer
                still, so nothing is ever unreadable. */}
            <div className="field query-course-field">
              <label>المقرر</label>
              <select
                value={filters.courseId || ""}
                onChange={event => set("courseId", Number(event.target.value) || 0)}
                title={selectedCourse ? cleanOptionText(selectedCourse.CourseName) : "كل المقررات"}
              >
                <option value="">الكل</option>
                {courseOptions.map(row => <option key={row.AdCourseId} value={row.AdCourseId}>{cleanOptionText(row.CourseName)}</option>)}
              </select>
            </div>
            <div className="field query-period-field">
              <label>الفترة</label>
              <div className="time-pair query-period-pair">
                <label className="query-period-input"><span>من</span><QueryTimeSelect value={filters.startTime} onChange={value => set("startTime", value)} label="من" /></label>
                <label className="query-period-input"><span>إلى</span><QueryTimeSelect value={filters.endTime} onChange={value => set("endTime", value)} label="إلى" /></label>
              </div>
            </div>
            <div className="field wide">
              <label>الأيام</label>
              <div className="checkbox-row day-pills">
                {DAYS.map(day => (
                  <label key={day.key}>
                    <input type="checkbox" checked={filters[day.key]} onChange={event => set(day.key, event.target.checked)} />
                    <span>{day.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {chips.length ? (
          <div className="query-chips query-active-filters" aria-label="المرشحات النشطة" aria-live="polite">
            {chips.map(chip => (
              <span className="query-filter-chip" key={chip.key}>
                <span>{chip.label}</span>
                <button type="button" onClick={chip.clear} aria-label={`إزالة مرشح ${chip.label}`} title={`إزالة ${chip.label}`}>
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))}
            <button type="button" onClick={resetFilters} aria-label="مسح كل المرشحات الإضافية" title="مسح كل المرشحات"><X aria-hidden="true" /></button>
          </div>
        ) : null}
      </section>

      <nav className="lens-strip no-print" role="tablist" aria-label="طريقة عرض النتائج" aria-orientation="horizontal">
        {shownLenses.map((item, index) => (
          <button
            key={item.id}
            type="button"
            id={`query-lens-tab-${item.id}`}
            role="tab"
            className={lens === item.id ? "active" : ""}
            aria-selected={lens === item.id}
            aria-controls="query-lens-panel"
            tabIndex={lens === item.id ? 0 : -1}
            onClick={() => selectLens(item.id)}
            onKeyDown={event => moveLensFocus(event, index)}
            title={item.hint}
          >
            {React.cloneElement(item.icon as React.ReactElement, { "aria-hidden": true })}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {mobileWideNotice ? (
        <div className="mobile-desktop-gate no-print" role="dialog" aria-modal="true" aria-label="هذا العرض يحتاج كمبيوتر">
          <div className="mobile-desktop-gate-card">
            <span className="mobile-desktop-gate-icon"><Table2 aria-hidden="true" /></span>
            <div className="mobile-desktop-gate-copy">
              <strong>{mobileWideNotice === "week" ? "عرض الأسبوع" : mobileWideNotice === "room" ? "إشغال القاعات" : "القاعات × الأوقات"}</strong>
              <p>هذا العرض يعتمد على مساحة أفقية كبيرة. على الهاتف ثبّتناه بدل أن نضغطه أو نجعلك تطارد أعمدة صغيرة.</p>
              <div className="mobile-desktop-gate-steps" aria-hidden="true">
                <span><Search /><b>افتحه من الكمبيوتر</b></span>
                <span><Table2 /><b>شاهد الأعمدة كاملة</b></span>
                <span><Printer /><b>اطبع أو صدّر بوضوح</b></span>
              </div>
            </div>
            <button type="button" onClick={() => setMobileWideNotice(null)}>حسنًا</button>
          </div>
        </div>
      ) : null}

      <section
        className="query-canvas"
        id="query-lens-panel"
        role="tabpanel"
        aria-labelledby={`query-lens-tab-${lens}`}
        tabIndex={0}
      >
        <header className="query-canvas-head no-print">
          <div className="query-count" aria-live="polite" aria-atomic="true">
            <b>{num(results.length)}</b>
            <span>موعد</span>
            {scopeLine ? <small>{scopeLine}</small> : null}
          </div>
          {results.length && !pending ? <div className="query-canvas-actions">
            <button
              type="button"
              className="query-print-icon"
              onClick={() => printReport(lens)}
              aria-label="طباعة هذا العرض"
              title="طباعة هذا العرض"
            >
              <Printer aria-hidden="true" />
            </button>
            <SecondaryButton type="button" onClick={() => printReport("comprehensive")} title="وثيقة القسم الرسمية بكل تفاصيل الجدول">
              <Table2 aria-hidden="true" />التقرير الشامل
            </SecondaryButton>
            {!pending && all.length && authorityReportAvailable ? (
              <SecondaryButton type="button" data-guide-ignore="طباعة تقرير قراءة فقط داخل مركز الاستعلامات" onClick={() => void printAuthorityReport()} disabled={authorityReportBusy} title="يقارن النسخة الأصلية المستوردة بالجدول الحالي ويعرض ما أضيف أو حُذف أو عُدّل">
                <ClipboardList aria-hidden="true" />{authorityReportBusy ? "يجهّز التقرير…" : "تقرير تغييرات الجدول"}
              </SecondaryButton>
            ) : null}
          </div> : null}
        </header>


        {loading || pending ? (
          <QuerySkeleton />
        ) : !results.length && lens !== "room" && lens !== "balance" ? (
          <div className="query-empty">
            <EmptyState
              title={error ? "تعذّرت القراءة" : "لا نتائج"}
              detail={error ? "لم تصل بيانات النطاق — أعد المحاولة من الشريط أعلاه." : "خفّف المرشحات"}
            />
          </div>
        ) : lens === "list" ? (
          <>
          <div className="lens-list">
            {results.slice(0, visibleLimit).map((row, index) => {
              const course = courseById.get(row.AdCourseId);
              const instructor = instructorById.get(row.AdInstructorId);
              const isSelected = selectedResultId === row.id;
              return (
                <article
                  key={row.id}
                  className={isSelected ? "is-selected" : undefined}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isSelected}
                  aria-controls={isSelected ? "query-result-detail-panel" : undefined}
                  onClick={() => setSelectedResultId(current => current === row.id ? null : row.id)}
                  onKeyDown={event => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setSelectedResultId(current => current === row.id ? null : row.id);
                  }}
                >
                  <span className="lens-index">{String(index + 1).padStart(2, "0")}</span>
                  <div className="lens-main">
                    <strong>{course?.CourseName || row.AdCourseName}</strong>
                    <div className="lens-tags">
                      <span className="code-chip">{course?.CourseCode || "—"}</span>
                      <span>{row.SCode}</span>
                      <span><UserRound aria-hidden="true" />{instructor?.AdInstructorName || "—"}</span>
                    </div>
                  </div>
                  <time dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
                  <span className="lens-room"><Building2 aria-hidden="true" />{row.AdRoomCode || "—"}/{row.AdRoomHall || "—"}</span>
                  <span className="lens-days">
                    {dayFlags(row).length
                      ? dayFlags(row).map(day => <i key={day.key} title={day.label}>{day.label}</i>)
                      : <b>بلا أيام</b>}
                  </span>
                </article>
              );
            })}
            {results.length > visibleLimit ? (
              <div className="lens-more"><SecondaryButton onClick={() => setVisibleLimit(v => v + 150)}>المزيد</SecondaryButton></div>
            ) : null}
          </div>
          </>
        ) : lens === "week" ? (
          <div className="lens-week">
            {/*
              The week, said in full.
              The column used to print an hour, a catalogue number and a room —
              which is the timetable with everything a person reads it for
              removed. Every row now names the course, who teaches it, and when
              it ends as well as when it begins.
            */}
            {weekGrid.map(day => (
              <section key={day.key}>
                <h3>{day.label}<b>{num(day.rows.length)}</b></h3>
                <div>
                  {day.rows.length ? day.rows.map(row => (
                    <article key={`${day.key}-${row.id}`}>
                      <time dir="ltr">{scheduleClockForDisplay(row.fstarttime)}<i>{scheduleClockForDisplay(row.fendtime)}</i></time>
                      <div>
                        <strong>{row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "—"}</strong>
                        <span>{instructorById.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ"}</span>
                      </div>
                      <small>
                        <b>{courseById.get(row.AdCourseId)?.CourseCode || "—"}</b>
                        {[row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") || "—"}
                      </small>
                    </article>
                  )) : <p>لا مواعيد في هذا اليوم</p>}
                </div>
              </section>
            ))}
          </div>
        ) : lens === "matrix" ? (
          <div className="lens-matrix">
            <div className="matrix-controls no-print">
              <label>
                <span>المبنى</span>
                <select value={matrixBuilding} onChange={e => { setMatrixBuilding(e.target.value); setMatrixHall(""); }}>
                  <option value="">كل المباني</option>
                  {(matrix?.buildings || []).map(building => <option key={building.id} value={building.id}>{buildingNumberLabel(building)}</option>)}
                </select>
              </label>
              <label>
                <span>القاعة</span>
                <select value={matrixHall} onChange={e => setMatrixHall(e.target.value)}>
                  <option value="">كل القاعات</option>
                  {locationRegistry.rooms.filter(room => (!matrixBuilding || room.buildingId === matrixBuilding) && results.some(row => row.roomId === room.id)).sort((a,b)=>byRoomPart(a.canonicalCode,b.canonicalCode)).map(room => <option key={room.id} value={room.id}>{room.canonicalCode}</option>)}
                </select>
              </label>
              {matrix ? <span className="matrix-count">{num(matrix.lines.length)} صف · {num(matrix.total)} موعد</span> : null}
            </div>
            {matrix && matrix.lines.length ? (
              <div className="matrix-scroll">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th className="matrix-corner">القاعة</th>
                      <th className="matrix-days">الأيام</th>
                      {matrix.columns.map(point => (
                        <th key={point} dir="ltr">{scheduleClockForDisplay(clock(point))}<i>{scheduleClockForDisplay(clock(point + 60))}</i></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.lines.map(line => (
                      <tr key={line.id}>
                        <th className="matrix-room">
                          <b>{line.room.hall || "—"}</b>
                          <small>{line.room.building}</small>
                        </th>
                        <td className="matrix-daygroup">{line.group.label}</td>
                        {line.cells.map(cell => (
                          <td key={cell.point} className={cell.rows.length ? "taken" : ""}>
                            {cell.rows.map(row => (
                              <span key={row.id} className="matrix-slot">
                                <b>{row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "—"}</b>
                                <em>{instructorById.get(row.AdInstructorId)?.AdInstructorName || "—"}</em>
                                <i dir="ltr">{courseById.get(row.AdCourseId)?.CourseCode || "—"} · {row.SCode}</i>
                              </span>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="query-empty"><EmptyState title="لا قاعات في هذا النطاق" /></div>
            )}
          </div>
        ) : lens === "room" ? (
          <div className="lens-rooms">
            <div className="occupancy-head no-print">
              <div className="occupancy-days">
                <button type="button" className={roomDay === "week" ? "active" : ""} aria-pressed={roomDay === "week"} onClick={() => setRoomDay("week")}>الأسبوع</button>
                {DAYS.map((day, index) => (
                  <button key={day.key} type="button" className={roomDay === index ? "active" : ""} aria-pressed={roomDay === index} onClick={() => setRoomDay(index)}>{day.label}</button>
                ))}
              </div>
              {roomLoad ? (
                <div className="occupancy-legend" aria-hidden="true">
                  <i data-level="0" /><i data-level="1" /><i data-level="3" /><i data-level="5" />
                  <span>{num(roomLoad.totalRate)}٪</span>
                </div>
              ) : null}
            </div>
            {occupancyLoading ? (
              <div className="occupancy-loading"><QuerySkeleton /></div>
            ) : roomLoad ? (
              <div className="occupancy-grid" style={{ "--slots": roomLoad.slots.length } as React.CSSProperties}>
                <div className="occupancy-ruler">
                  <span />
                  {roomLoad.slots.map(point => <b key={point} dir="ltr">{String(Math.floor(point / 60)).padStart(2, "0")}</b>)}
                  <span />
                </div>
                {roomLoad.rooms.map((room: any) => (
                  <div key={room.key} className={`occupancy-row ${room.mine ? "mine" : ""} ${Number(room.rate) >= 60 ? "busy" : ""} ${roomPick?.room === room.name ? "picked" : ""}`}>
                    <button
                      type="button"
                      className="occupancy-name"
                      title={`كل مواعيد ${room.name}`}
                      aria-expanded={roomPick?.room === room.name && roomPick?.point == null}
                      aria-controls={roomPick?.room === room.name ? "query-room-detail" : undefined}
                      onClick={() => setRoomPick(current =>
                        current?.room === room.name && current?.point == null ? null : { room: room.name, point: null })}
                    >
                      {room.name}
                    </button>
                    {room.cells.map((cell: any) => (
                      <button
                        type="button"
                        key={cell.point}
                        data-level={Math.min(5, cell.taken)}
                        data-count={cell.taken}
                        data-mine={cell.mine ? "1" : undefined}
                        className={roomPick?.room === room.name && roomPick?.point === cell.point ? "picked" : ""}
                        title={`${room.name} · ${scheduleClockForDisplay(clock(cell.point))} · ${cell.taken ? `يوم ${cell.taken}` : "فاضية"}`}
                        aria-label={`${room.name} الساعة ${scheduleClockForDisplay(clock(cell.point))}، ${cell.taken ? `يوم ${cell.taken}` : "فاضية"}`}
                        aria-pressed={roomPick?.room === room.name && roomPick?.point === cell.point}
                        onClick={() => setRoomPick(current =>
                          current?.room === room.name && current?.point === cell.point
                            ? null
                            : { room: room.name, point: cell.point })}
                      />
                    ))}
                    <b className="occupancy-rate">{num(room.rate)}٪</b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="query-empty"><EmptyState title="لا بيانات إشغال" /></div>
            )}
            {/*
              A heat square is a question, so it should have an answer.
              The grid used to be a picture: it could show that an hour was busy
              and had no way to say who was in it. Clicking a square — or a room
              name — now opens exactly the appointments behind it.
            */}
            {roomPick ? (() => {
              const picked = results.filter(row => {
                if (`${row.AdRoomCode}/${row.AdRoomHall}` !== roomPick.room) return false;
                if (roomPick.point == null) return true;
                const from = minutes(row.fstarttime), to = minutes(row.fendtime);
                const dayOk = roomDay === "week" || Boolean((row as any)[DAYS[roomDay as number].flag]);
                return dayOk && from < roomPick.point + 60 && to > roomPick.point;
              }).sort((a, b) => a.fstarttime.localeCompare(b.fstarttime));
              return (
                <>
                <div className="query-detail-backdrop no-print" onMouseDown={() => setRoomPick(null)} aria-hidden="true" />
                <div className="occupancy-pick query-detail-panel no-print" id="query-room-detail" role="dialog" aria-label={`تفاصيل إشغال ${roomPick.room}`}>
                  <header>
                    <div>
                      <small>{roomPick.point == null ? "كل مواعيد القاعة" : `الساعة ${scheduleClockForDisplay(clock(roomPick.point))}`}</small>
                      <strong>{roomPick.room}</strong>
                    </div>
                    <span className="occupancy-pick-count">{num(picked.length)} موعد</span>
                    <button type="button" data-guide-ignore="إغلاق تفاصيل إشغال القاعة فقط" onClick={() => setRoomPick(null)} aria-label="إغلاق" title="إغلاق"><X aria-hidden="true" /></button>
                  </header>
                  {picked.length ? (
                    <div className="occupancy-pick-rows">
                      {picked.map(row => (
                        <article key={row.id}>
                          <strong>{row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "—"}</strong>
                          <span>{instructorById.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ"}</span>
                          <em>{dayText(row)}</em>
                          <time dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
                        </article>
                      ))}
                    </div>
                  ) : (() => {
                    /**
                     * "Empty" and "not yours to see" are different answers.
                     *
                     * The heat grid is drawn from the whole campus on purpose —
                     * a hall booked by another college is genuinely busy — but
                     * this panel can only list the rows inside your own scope.
                     * When the square is dark and the list is empty, the honest
                     * sentence is "booked outside your scope", not "empty":
                     * telling a coordinator an occupied hall is free is exactly
                     * how a room gets double-booked.
                     */
                    const room = roomLoad?.rooms?.find((item: any) => item.name === roomPick.room);
                    const takenElsewhere = roomPick.point == null
                      ? Number(room?.cells?.reduce((sum: number, cell: any) => Math.max(sum, Number(cell.taken) || 0), 0) || 0)
                      : Number(room?.cells?.find((cell: any) => cell.point === roomPick.point)?.taken || 0);
                    if (takenElsewhere > 0) return (
                      <p className="occupancy-pick-external">
                        <b>محجوزة خارج نطاقك</b>
                        <span>
                          {roomPick.point == null ? "هذه القاعة مستخدمة" : "القاعة مشغولة في هذا الوقت"}
                          {` في ${num(takenElsewhere)} ${takenElsewhere === 1 ? "يوم" : "أيام"} من قسم آخر — التفاصيل لا تظهر خارج نطاقك، لكن الحجز قائم.`}
                        </span>
                      </p>
                    );
                    return <p className="occupancy-pick-empty">فاضية في هذا الوقت — لا يوجد أي حجز.</p>;
                  })()}
                </div>
                </>
              );
            })() : null}
            {roomLoad && roomDay !== "week" ? (
              <div className="occupancy-windows">
                {roomLoad.rooms
                  .filter((room: any) => room.windows.length)
                  .slice(0, 40)
                  .map((room: any) => (
                    <article key={room.key}>
                      <strong>{room.name}</strong>
                      <div>
                        {room.windows.map((window: any, index: number) => (
                          <time key={index} dir="ltr">{formatScheduleTimeRange(clock(window.from), clock(window.to))}</time>
                        ))}
                      </div>
                    </article>
                  ))}
              </div>
            ) : null}
          </div>
        ) : lens === "instructor" ? (
          <div className="lens-groups">
            {groups.map(group => (
              <article key={group.id} className={openGroup === group.id ? "open" : ""}>
                <button
                  type="button"
                  aria-expanded={openGroup === group.id}
                  aria-controls={`query-instructor-group-${group.id}`}
                  onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                >
                  <span className="group-avatar"><UserRound /></span>
                  <strong>{group.name}</strong>
                  <span className="group-bar"><i style={{ width: share(group.load, maxLoad) }} /></span>
                  <b>{num(group.count)}</b>
                  <em>{num(Math.round(group.load / 60))}س</em>
                  <ChevronDown aria-hidden="true" />
                </button>
                {openGroup === group.id ? (
                  <div className="group-rows" id={`query-instructor-group-${group.id}`}>
                    {group.rows.map(row => (
                      <div key={row.id}>
                        <span className="code-chip">{courseById.get(row.AdCourseId)?.CourseCode || "—"}</span>
                        <span>{row.AdCourseName}</span>
                        <time dir="ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
                        <small>{dayText(row)}</small>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : lens === "time" ? (
          <div className="lens-times">
            {byTime.map(slot => {
              const expanded = openGroup === slot.key;
              return (
                <article key={slot.key} className={expanded ? "open" : ""}>
                  <button
                    type="button"
                    className="lens-time-toggle"
                    data-guide-ignore="يفتح ملخص الوقت داخل مركز الاستعلام فقط ولا يغيّر بيانات الجدول"
                    aria-expanded={expanded}
                    aria-controls={`query-time-slot-${slot.key}`}
                    onClick={() => setOpenGroup(current => current === slot.key ? null : slot.key)}
                  >
                    <time dir="ltr">{scheduleClockForDisplay(slot.key)}</time>
                    <span className="slot-bar"><i style={{ width: share(slot.count, maxSlot) }} /></span>
                    <b>{num(slot.count)}</b>
                    <div className="slot-rooms">
                      {slot.rooms.slice(0, 4).map(room => <span key={room}>{room}</span>)}
                      {slot.rooms.length > 4 ? <span>+{num(slot.rooms.length - 4)}</span> : null}
                    </div>
                    <div className="time-slot-facts" aria-hidden="true">
                      <span>{num(slot.courses)} مقرر</span>
                      <span>{num(slot.instructors)} أستاذ</span>
                      <span>{num(slot.days)} أيام</span>
                    </div>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  {expanded ? (
                    <div className="time-slot-panel" id={`query-time-slot-${slot.key}`}>
                      <div className="time-slot-panel-head">
                        <div><strong>{scheduleClockForDisplay(slot.key)}</strong><small>{num(slot.count)} موعد · {num(slot.courses)} مقرر · {num(slot.instructors)} أستاذ</small></div>
                        <span>{slot.rooms.length ? countOf(slot.rooms.length, AR.room) : "بدون قاعات"}</span>
                      </div>
                      <div className="time-slot-grid">
                        {slot.rows.map(row => {
                          const course = courseById.get(row.AdCourseId);
                          const instructor = instructorById.get(row.AdInstructorId);
                          return (
                            <button
                              type="button"
                              key={row.id}
                              className="time-slot-card"
                              data-guide-ignore="يفتح/يغلق بطاقة الموعد داخل مركز الاستعلام فقط ولا يغيّر بيانات الجدول"
                              onClick={() => setSelectedResultId(current => current === row.id ? null : row.id)}
                              aria-expanded={selectedResultId === row.id}
                              aria-controls="query-result-detail-panel"
                            >
                              <strong>{course?.CourseName || row.AdCourseName || "—"}</strong>
                              <div>
                                <span className="code-chip">{course?.CourseCode || "—"}</span>
                                <span>شعبة {row.SCode || "—"}</span>
                              </div>
                              <small>{instructor?.AdInstructorName || "بدون أستاذ"}</small>
                              <em>{[row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") || "بدون قاعة"}</em>
                              <i>{dayText(row) || "بلا أيام"}</i>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : lens === "balance" ? (
          <BalancePanel
            balance={balance}
            sort={balanceSort}
            onSort={setBalanceSort}
            num={num}
          />
        ) : fairness ? (
          <div className="lens-fairness">
            <div className="fairness-summary">
              <div className="fairness-score"><b>{num(fairness.score)}</b><small>/ 100</small></div>
              <div className="fairness-facts">
                <div><small>متوسط النصاب</small><strong>{num(Math.round(fairness.average / 60))} س</strong></div>
                <div><small>الفارق</small><strong>{num(Math.round(fairness.spread / 60))} س</strong></div>
                <div><small>أساتذة</small><strong>{num(fairness.rows.length)}</strong></div>
              </div>
            </div>
            <div className="fairness-rows">
              {fairness.rows.map(row => (
                <div key={row.id}>
                  <span>{row.name}</span>
                  <i><b style={{ width: share(row.load, fairness.rows[0].load) }} /></i>
                  <em>{num(Math.round(row.load / 60))}س</em>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="query-empty"><EmptyState title="لا بيانات كافية" /></div>
        )}
        {selectedResultDetail}
      </section>

      <PrintPortal>
        <PrintSheet
          kind={printKind}
          rows={results}
          fairness={fairness}
          matrix={matrix}
          roomLoad={roomLoad}
          roomDay={roomDay}
          balance={balance}
          scopeLine={scopeLine}
          collegeName={collegeName}
          termName={termName}
          sectionName={sectionName}
          sectionCode={sectionCode}
          courseById={courseById}
          instructorById={instructorById}
        />
      </PrintPortal>
      <PrintPortal className="authority-pdf-print-host">
        {authorityReport ? (
          <AuthorityPdfReport
            report={authorityReport}
            termName={termName}
            collegeName={collegeName}
            collegeCode={collegeCode}
            sectionName={sectionName}
            sectionCode={sectionCode}
            courseById={courseById}
            instructorById={instructorById}
          />
        ) : null}
      </PrintPortal>
    </div>
  );
}

/**
 * ميزان الأقسام — the comparison that was never on a screen.
 *
 * Every other report answers for one department, so the person who can see all
 * of them was comparing by eye: open the fairness lens, note the number, change
 * the department, repeat. Here each department is one line — what it carries,
 * who carries it, how evenly, and what is still blocking it — and the sorting
 * is the point, because the question is always "which one is the outlier".
 */
function BalancePanel({ balance, sort, onSort, num }: {
  balance: any;
  sort: { key: string; desc: boolean };
  onSort: React.Dispatch<React.SetStateAction<{ key: string; desc: boolean }>>;
  num: (value: number) => string;
}) {
  const COLUMNS = [
    { key: "sectionName", label: "القسم العلمي" },
    { key: "rows", label: "المواعيد" },
    { key: "instructors", label: "الأساتذة" },
    { key: "rooms", label: "القاعات" },
    { key: "morningPct", label: "صباحي" },
    { key: "fairness", label: "العدالة" },
    { key: "quality", label: "الجودة" },
    { key: "conflicts", label: "موانع" },
  ];
  const ordered = useMemo(() => {
    const list = [...(balance?.departments || [])];
    const direction = sort.desc ? -1 : 1;
    return list.sort((a: any, b: any) =>
      sort.key === "sectionName"
        ? byArabic(a.sectionName, b.sectionName) * direction
        : (Number(a[sort.key]) - Number(b[sort.key])) * direction);
  }, [balance, sort]);

  if (!balance) return <QuerySkeleton />;
  return (
    <div className="balance-lens">
      <header className="balance-head">
        <div>
          <span className="surface-kicker">ميزان الأقسام · {balance.termName}</span>
          <h3>{num(balance.totals.departments)} قسماً · {num(balance.totals.rows)} موعداً</h3>
        </div>
        {balance.totals.conflicts ? (
          <span className="balance-flag">{num(balance.totals.conflicts)} مانع اعتماد على مستوى الجامعة</span>
        ) : (
          <span className="balance-clear">لا موانع اعتماد في أي قسم</span>
        )}
      </header>
      <div className="balance-scroll">
        <table className="balance-table">
          <thead>
            <tr>
              {COLUMNS.map(column => (
                <th key={column.key} aria-sort={sort.key === column.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <button
                    type="button"
                    className={sort.key === column.key ? "sorted" : ""}
                    onClick={() => onSort(current =>
                      current.key === column.key ? { key: column.key, desc: !current.desc } : { key: column.key, desc: true })}
                  >
                    {column.label}
                    {sort.key === column.key ? <i aria-hidden="true">{sort.desc ? "▾" : "▴"}</i> : null}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((item: any) => (
              <tr key={item.sectionId} className={item.conflicts ? "has-conflicts" : ""}>
                <td>
                  <strong>{item.sectionName}</strong>
                  <small>{item.collegeName}</small>
                </td>
                <td>{num(item.rows)}</td>
                <td>{num(item.instructors)}</td>
                <td>{num(item.rooms)}</td>
                <td>
                  {/* Morning against evening as one bar, rather than two numbers
                      to subtract in your head. */}
                  <span className="balance-split" title={`صباحي ${item.morningPct}٪ · مسائي ${item.eveningPct}٪`}>
                    <i style={{ width: `${item.morningPct}%` }} />
                  </span>
                  <b>{num(item.morningPct)}٪</b>
                </td>
                <td>
                  <span className={`balance-score ${item.fairness >= 78 ? "good" : item.fairness >= 62 ? "warn" : "bad"}`}>
                    {num(item.fairness)}
                  </span>
                  {item.heaviest ? <small title="الأثقل حملاً">{item.heaviest}</small> : null}
                </td>
                <td>
                  <span className={`balance-score ${item.quality >= 85 ? "good" : item.quality >= 70 ? "warn" : "bad"}`}>
                    {num(item.quality)}
                  </span>
                </td>
                <td>{item.conflicts ? <b className="balance-bad">{num(item.conflicts)}</b> : <span className="balance-ok">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Print the question that is on screen — not a catalogue of legacy reports.
 *
 * The inquiry centre already owns the information architecture: list, week,
 * instructors, rooms, room×time, times, fairness and the administrator's
 * department balance. Printing now follows that exact architecture. The only
 * extra document is the comprehensive schedule: it is the formal archival
 * sheet, and deliberately has a richer hierarchy than any on-screen lens.
 */
const placeOfRow = (row: FSchedule) =>
  [String(row.AdRoomCode || "").trim(), String(row.AdRoomHall || "").trim()].filter(Boolean).join("/") || "بلا قاعة";

function groupRows(rows: FSchedule[], keyOf: (row: FSchedule) => string) {
  const groups = new Map<string, FSchedule[]>();
  rows.forEach(row => {
    const key = keyOf(row) || "—";
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  });
  return [...groups.entries()]
    .map(([key, group]) => ({ key, rows: group }))
    .sort((a, b) => byRoomLabel(a.key, b.key));
}

function paginateComprehensiveRows(rows: FSchedule[]) {
  if (!rows.length) return [[]] as FSchedule[][];
  if (rows.length <= COMPREHENSIVE_FIRST_PAGE_ROWS) return [rows];
  const pages: FSchedule[][] = [rows.slice(0, COMPREHENSIVE_FIRST_PAGE_ROWS)];
  let cursor = COMPREHENSIVE_FIRST_PAGE_ROWS;
  while (cursor < rows.length) {
    pages.push(rows.slice(cursor, cursor + COMPREHENSIVE_NEXT_PAGE_ROWS));
    cursor += COMPREHENSIVE_NEXT_PAGE_ROWS;
  }
  return pages;
}

function paginateItems<T>(items: T[], size: number): T[][] {
  if (!items.length) return [];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

function PrintPageMeta({ page, total, college, date }: { page: number; total: number; college: string; date: string }) {
  return (
    <footer className="print-explicit-page-meta">
      <span>{college || "الجدول الأكاديمي"}</span>
      <bdi dir="ltr">{page} / {total}</bdi>
      <time dir="ltr">{date}</time>
    </footer>
  );
}

function PrintSheet({ kind, rows, fairness, matrix, roomLoad, roomDay, balance, scopeLine, collegeName, termName, sectionName, sectionCode, courseById, instructorById }: {
  kind: PrintKind;
  rows: FSchedule[];
  fairness: any;
  matrix: any;
  roomLoad: any;
  roomDay: number | "week";
  balance: any;
  scopeLine: string;
  collegeName: string;
  termName: string;
  sectionName: string;
  sectionCode: string;
  courseById: Map<number, AdCourse>;
  instructorById: Map<number, AdInstructor>;
}) {
  if (!kind) return null;

  const distinctCourses = new Set(rows.map(row => row.AdCourseId).filter(Boolean)).size;
  const distinctInstructors = new Set(rows.map(row => row.AdInstructorId).filter(Boolean)).size;
  const titles: Record<Exclude<PrintKind, null>, string> = {
    list: "نتائج الاستعلام",
    week: "الأسبوع",
    instructor: "الأساتذة",
    room: "إشغال القاعات والفراغات",
    matrix: "القاعات × الأوقات",
    time: "الأوقات",
    fairness: "عدالة توزيع العبء",
    balance: "ميزان الأقسام",
    comprehensive: "تقرير الجدول الشامل",
  };
  const courseOf = (row: FSchedule) => courseById.get(row.AdCourseId);
  const instructorOf = (row: FSchedule) => instructorById.get(row.AdInstructorId);
  const issued = new Date();
  const issueDate = `${String(issued.getDate()).padStart(2, "0")}/${String(issued.getMonth() + 1).padStart(2, "0")}/${issued.getFullYear()}`;
  const dayCodeCell = (row: FSchedule) => dayFlags(row).map(day => String(DAYS.findIndex(candidate => candidate.flag === day.flag) + 1)).join(",") || "—";

  if (kind === "comprehensive") {
    const comprehensiveRows = [...rows].sort((a, b) =>
      byArabic(courseOf(a)?.CourseName || a.AdCourseName, courseOf(b)?.CourseName || b.AdCourseName) ||
      byArabic(a.SCode, b.SCode) ||
      String(a.fstarttime).localeCompare(String(b.fstarttime)) ||
      Number(a.id) - Number(b.id)
    );
    const pages = paginateComprehensiveRows(comprehensiveRows);
    const legendItems = DAYS.map((day, index) => `${index + 1}=${day.label}`);

    return (
      <div className="print-report print-wide print-query-report print-comprehensive print-comprehensive-book">
        {rows.length ? (
          <div className="print-comprehensive-pages">
            {pages.map((pageRows, pageIndex) => (
              <section className="print-comprehensive-page" key={`page-${pageIndex + 1}`}>
                <header className="print-comprehensive-classic-head">
                  <div className="print-comprehensive-head-top">
                    <div className="print-comprehensive-side print-comprehensive-side-right">
                      <div><span>رمز القسم العلمي</span><strong>{sectionCode || "—"}</strong></div>
                      <div><span>القسم العلمي</span><strong>{sectionName || "—"}</strong></div>
                    </div>
                    <div className="print-comprehensive-title-block">
                      <h1>تقرير القسم العلمي الشامل</h1>
                      <p>الكلية: {collegeName || "—"}</p>
                    </div>
                    <div className="print-comprehensive-side print-comprehensive-side-left">
                      <div><span>الفصل الدراسي</span><strong>{termName || scopeLine || "—"}</strong></div>
                      <div><span>تاريخ الإصدار</span><strong><bdi dir="ltr">{issueDate}</bdi></strong></div>
                    </div>
                  </div>
                </header>

                <div className="print-comprehensive-grid" role="table" aria-label="تفاصيل المقررات والجدول">
                  <div className="print-comprehensive-grid-row print-comprehensive-grid-head" role="row">
                    {[
                      "م",
                      "رمز المقرر",
                      "الشعبة",
                      "المقرر الدراسي",
                      "الوحدات",
                      "الساعات",
                      "السعة",
                      "الوقت",
                      "الأيام",
                      "المبنى",
                      "القاعة",
                      "أستاذ المقرر",
                      "الرقم المدني",
                    ].map(head => <div role="columnheader" key={head}>{head}</div>)}
                  </div>
                  <div className="print-comprehensive-grid-body" role="rowgroup">
                    {pageRows.map((row, index) => {
                      const course = courseOf(row);
                      const instructor = instructorOf(row);
                      const serial = pageIndex === 0
                        ? index + 1
                        : COMPREHENSIVE_FIRST_PAGE_ROWS + ((pageIndex - 1) * COMPREHENSIVE_NEXT_PAGE_ROWS) + index + 1;
                      return (
                        <div className="print-comprehensive-grid-row" role="row" key={row.id}>
                          <div role="cell" className="print-num">{serial}</div>
                          <div role="cell" className="print-ltr print-course-id">{row.AdCourseId || "—"}</div>
                          <div role="cell" className="print-ltr">{row.SCode || "—"}</div>
                          <div role="cell" className="print-wrap print-course-name">{course?.CourseName || row.AdCourseName || "—"}</div>
                          <div role="cell" className="num print-course-units">{course ? course.CourseCredit : "—"}</div>
                          <div role="cell" className="num print-course-hours">{course ? course.CourseHours : "—"}</div>
                          <div role="cell" className="num print-course-capacity">{course ? course.MaxStudent : "—"}</div>
                          <div role="cell" className="print-ltr print-nowrap print-course-time">{row.fstarttime && row.fendtime ? formatScheduleTimeRange(row.fstarttime, row.fendtime) : "—"}</div>
                          <div role="cell" className="print-ltr">{dayCodeCell(row)}</div>
                          <div role="cell" className="print-ltr">{String(row.AdRoomCode || "").trim() || "—"}</div>
                          <div role="cell" className="print-ltr">{String(row.AdRoomHall || "").trim() || "—"}</div>
                          <div role="cell" className="print-wrap print-instructor-name">{instructor?.AdInstructorName || "بدون أستاذ"}</div>
                          <div role="cell" className="print-ltr print-civil">{instructor?.AdInstructorCivil || "—"}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <footer className="print-comprehensive-page-footer">
                  <div className="print-comprehensive-signatures">
                    <div><span>توقيع رئيس لجنة الجدول</span><i /></div>
                    <div><span>توقيع رئيس القسم العلمي</span><i /></div>
                    <div><span>توقيع العميد</span><i /></div>
                  </div>
                  <div className="print-comprehensive-legend-stack">
                    <div className="print-comprehensive-legend">
                      {legendItems.map(item => <span key={item}>{item}</span>)}
                    </div>
                    <div className="print-comprehensive-page-number"><bdi dir="ltr">{pageIndex + 1} / {pages.length}</bdi></div>
                  </div>
                </footer>
              </section>
            ))}
          </div>
        ) : <p className="print-empty">لا توجد مواعيد ضمن النطاق المحدد.</p>}
      </div>
    );
  }

  if (kind === "list") {
    const pages = paginateItems(rows, PAGE_ROWS.list);
    return (
      <div className="print-report print-wide print-query-report print-query-list-report">
        {pages.length ? pages.map((pageRows, pageIndex) => (
          <section className="print-explicit-page" key={`list-page-${pageIndex + 1}`}>
            <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} footer={false} />
            <div className="print-query-summaryline">
              <span><b>{rows.length}</b> موعد</span>
              <span><b>{distinctCourses}</b> مقرر</span>
              <span><b>{distinctInstructors}</b> أستاذ</span>
            </div>
            <div className="print-query-list">
              {pageRows.map((row, index) => {
                const course = courseOf(row), instructor = instructorOf(row);
                const serial = pageIndex * PAGE_ROWS.list + index + 1;
                return (
                  <article key={row.id}>
                    <span className="print-list-index">{String(serial).padStart(2, "0")}</span>
                    <div className="print-list-core">
                      <strong>{course?.CourseName || row.AdCourseName || "—"}</strong>
                      <span><bdi className="print-ltr">{course?.CourseCode || "—"}</bdi><i>شعبة {row.SCode || "—"}</i><em>{instructor?.AdInstructorName || "بدون أستاذ"}</em></span>
                    </div>
                    <time className="print-ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</time>
                    <span className="print-ltr print-list-room">{placeOfRow(row)}</span>
                    <span className="print-days print-list-days">{dayCell(row)}</span>
                  </article>
                );
              })}
            </div>
            <PrintPageMeta page={pageIndex + 1} total={pages.length} college={collegeName} date={issueDate} />
          </section>
        )) : <p className="print-empty">لا توجد نتائج ضمن النطاق المحدد.</p>}
      </div>
    );
  }

  if (kind === "week") {
    const dayBuckets = DAYS.map(day => ({
      ...day,
      rows: rows.filter(row => Boolean((row as any)[day.flag])).sort((a, b) => a.fstarttime.localeCompare(b.fstarttime)),
    }));
    const pageCount = Math.max(1, ...dayBuckets.map(day => Math.ceil(day.rows.length / 4)));
    return (
      <div className="print-report print-wide print-query-report print-query-week-report">
        {Array.from({ length: pageCount }, (_, pageIndex) => (
          <section className="print-explicit-page" key={`week-page-${pageIndex + 1}`}>
            <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} footer={false} />
            <div className="print-query-week">
              {dayBuckets.map(day => {
                const dayRows = day.rows.slice(pageIndex * 4, pageIndex * 4 + 4);
                return (
                  <section key={day.key}>
                    <h2>{day.label}<b>{day.rows.length}</b></h2>
                    <div>
                      {dayRows.length ? dayRows.map(row => (
                        <article key={`${day.key}-${row.id}`}>
                          <time className="print-ltr"><b>{scheduleClockForDisplay(row.fstarttime)}</b><span>{scheduleClockForDisplay(row.fendtime)}</span></time>
                          <div><strong>{courseOf(row)?.CourseName || row.AdCourseName || "—"}</strong><span>{instructorOf(row)?.AdInstructorName || "بدون أستاذ"}</span></div>
                          <small><bdi className="print-ltr">{courseOf(row)?.CourseCode || "—"} · {row.SCode || "—"}</bdi><bdi className="print-ltr">{placeOfRow(row)}</bdi></small>
                        </article>
                      )) : <p>—</p>}
                    </div>
                  </section>
                );
              })}
            </div>
            <PrintPageMeta page={pageIndex + 1} total={pageCount} college={collegeName} date={issueDate} />
          </section>
        ))}
      </div>
    );
  }

  if (kind === "instructor") {
    const groups = groupRows(rows, row => instructorOf(row)?.AdInstructorName || "بدون أستاذ");
    const pages = groups.flatMap(group => paginateItems(group.rows, PAGE_ROWS.instructorRows).map(groupRows => ({ group, rows: groupRows })));
    return (
      <div className="print-report print-wide print-query-report print-query-groups-report">
        {pages.length ? pages.map((page, pageIndex) => {
          const instructor = instructorOf(page.group.rows[0]);
          const load = page.group.rows.reduce((total, row) => total + duration(row) * Math.max(1, dayFlags(row).length), 0);
          const days = new Set(page.group.rows.flatMap(row => dayFlags(row).map(day => day.key))).size;
          return (
            <section className="print-explicit-page" key={`${page.group.key}-${pageIndex}`}>
              <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} footer={false} />
              <section className="print-query-group">
                <header>
                  <div><strong>{page.group.key}</strong>{instructor?.AdInstructorCivil ? <small className="print-ltr">{instructor.AdInstructorCivil}</small> : null}</div>
                  <span><b>{page.group.rows.length}</b> موعد</span><span><b>{Math.round(load / 60)}</b> س</span><span><b>{days}</b> أيام</span>
                </header>
                <table>
                  <colgroup><col style={{ width: "38%" }} /><col style={{ width: "20%" }} /><col style={{ width: "19%" }} /><col style={{ width: "13%" }} /><col style={{ width: "10%" }} /></colgroup>
                  <thead><tr><th>المقرر</th><th>الأيام</th><th>الوقت</th><th>القاعة</th><th>الشعبة</th></tr></thead>
                  <tbody>{page.rows.map(row => <tr key={row.id}>
                    <td className="print-course-block"><strong>{courseOf(row)?.CourseName || row.AdCourseName || "—"}</strong><span><bdi className="print-ltr">{courseOf(row)?.CourseCode || "—"}</bdi></span></td>
                    <td className="print-days">{dayCell(row)}</td>
                    <td className="print-ltr">{formatScheduleTimeRange(row.fstarttime, row.fendtime)}</td>
                    <td className="print-ltr">{placeOfRow(row)}</td>
                    <td className="print-ltr">{row.SCode || "—"}</td>
                  </tr>)}</tbody>
                </table>
              </section>
              <PrintPageMeta page={pageIndex + 1} total={pages.length} college={collegeName} date={issueDate} />
            </section>
          );
        }) : <p className="print-empty">لا توجد بيانات أساتذة ضمن النطاق المحدد.</p>}
      </div>
    );
  }

  if (kind === "room") {
    const selectedDayLabel = roomDay === "week" ? "الأسبوع" : DAYS[roomDay]?.label || "";
    const resultByRoom = new Map<string, FSchedule[]>();
    rows.forEach(row => {
      const key = placeOfRow(row);
      if (key === "بلا قاعة") return;
      const bucket = resultByRoom.get(key);
      if (bucket) bucket.push(row); else resultByRoom.set(key, [row]);
    });
    const roomPages = roomLoad?.rooms?.length ? paginateItems(roomLoad.rooms, PAGE_ROWS.roomOccupancy) : [];
    const freeRooms = roomDay !== "week" && roomLoad?.rooms?.length ? roomLoad.rooms.filter((room: any) => room.windows.length) : [];
    const freePages = paginateItems(freeRooms, PAGE_ROWS.roomFree);
    const directory = [...resultByRoom.entries()].sort(([a], [b]) => byRoomLabel(a, b));
    const directoryPages = paginateItems(directory, PAGE_ROWS.roomDirectory);
    const totalPages = roomPages.length + freePages.length + directoryPages.length;
    const scope = `${scopeLine}${scopeLine ? " · " : ""}${selectedDayLabel}`;
    return (
      <div className="print-report print-wide print-query-report print-room-occupancy-report">
        {totalPages ? (
          <>
            {roomPages.map((pageRooms: any[], pageIndex) => (
              <section className="print-explicit-page" key={`room-occupancy-${pageIndex + 1}`}>
                <PrintLetterhead title={titles[kind]} scope={scope} college={collegeName} footer={false} />
                <div className="print-query-summaryline">
                  <span><b>{roomLoad.rooms.length}</b> قاعة</span>
                  <span><b>{roomLoad.totalRate}</b>٪ متوسط الإشغال</span>
                  <span>المربع الداكن = إشغال أعلى</span>
                </div>
                <table className="print-occupancy-table">
                  <colgroup><col style={{ width: "12%" }} />{roomLoad.slots.map((point: number) => <col key={point} />)}<col style={{ width: "7%" }} /></colgroup>
                  <thead><tr><th>القاعة</th>{roomLoad.slots.map((point: number) => <th key={point} className="print-ltr">{scheduleClockForDisplay(clock(point))}</th>)}<th>الإشغال</th></tr></thead>
                  <tbody>{pageRooms.map((room: any) => <tr key={room.key}>
                    <th className="print-ltr">{room.name}</th>
                    {/* The number lives in its own element so the sheet can give
                        it the badge the screen gives it — this grid is the one
                        readers meet first, and it earns the extra care. */}
                    {room.cells.map((cell: any) => (
                      <td key={cell.point} className={`print-heat print-heat-${Math.min(5, cell.taken)}`}>
                        {cell.taken > 1 ? <span>{cell.taken}</span> : null}
                      </td>
                    ))}
                    <td className="print-ltr"><strong>{room.rate}%</strong></td>
                  </tr>)}</tbody>
                </table>
                <PrintPageMeta page={pageIndex + 1} total={totalPages} college={collegeName} date={issueDate} />
              </section>
            ))}
            {freePages.map((pageRooms: any[], freeIndex) => {
              const pageNumber = roomPages.length + freeIndex + 1;
              return (
                <section className="print-explicit-page" key={`room-free-${freeIndex + 1}`}>
                  <PrintLetterhead title={`${titles[kind]} — الفترات المتاحة`} scope={scope} college={collegeName} footer={false} />
                  <section className="print-free-windows">
                    <h2>الفترات المتاحة</h2>
                    <div>{pageRooms.map((room: any) => (
                      <article key={room.key}><strong className="print-ltr">{room.name}</strong><span>{room.windows.map((window: any, index: number) => <time className="print-ltr" key={index}>{formatScheduleTimeRange(clock(window.from), clock(window.to))}</time>)}</span></article>
                    ))}</div>
                  </section>
                  <PrintPageMeta page={pageNumber} total={totalPages} college={collegeName} date={issueDate} />
                </section>
              );
            })}
            {directoryPages.map((pageEntries, directoryIndex) => {
              const pageNumber = roomPages.length + freePages.length + directoryIndex + 1;
              return (
                <section className="print-explicit-page" key={`room-directory-${directoryIndex + 1}`}>
                  <PrintLetterhead title={`${titles[kind]} — دليل القاعات`} scope={scope} college={collegeName} footer={false} />
                  {/* The directory used to be a field of small boxes in four
                      columns: on paper it read as scattered fragments rather
                      than a list you could run your eye down. It is the same
                      three facts, set as a proper table in the same hand as
                      the grid on the opening page — one room to a line, its
                      count and its weekly hours in their own columns. */}
                  <section className="print-room-directory">
                    <h2>مواعيد القاعات في نطاق الاستعلام</h2>
                    <table className="print-room-directory-table">
                      <thead>
                        <tr><th>القاعة</th><th>المواعيد</th><th>الساعات أسبوعياً</th><th>الأيام المشغولة</th></tr>
                      </thead>
                      <tbody>
                        {pageEntries.map(([room, roomRows]) => {
                          const hours = Math.round(roomRows.reduce((t, row) => t + duration(row) * Math.max(1, dayFlags(row).length), 0) / 60);
                          const days = new Set<string>();
                          roomRows.forEach(row => dayFlags(row).forEach(day => days.add(day.flag)));
                          return (
                            <tr key={room}>
                              <th className="print-ltr">{room}</th>
                              <td>{roomRows.length}</td>
                              <td>{hours}</td>
                              <td>{days.size}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                  <PrintPageMeta page={pageNumber} total={totalPages} college={collegeName} date={issueDate} />
                </section>
              );
            })}
          </>
        ) : <p className="print-empty">لا توجد بيانات إشغال للقاعات ضمن النطاق المحدد.</p>}
      </div>
    );
  }

  if (kind === "matrix") {
    const pages = matrix?.lines?.length ? paginateItems(matrix.lines, PAGE_ROWS.matrixLines) : [];
    return (
      <div className="print-report print-wide print-query-report print-query-matrix-report">
        {pages.length ? pages.map((pageLines: any[], pageIndex) => (
          <section className="print-explicit-page" key={`matrix-page-${pageIndex + 1}`}>
            <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} footer={false} />
            <table className="print-matrix-new">
              <colgroup><col style={{ width: "8%" }} /><col style={{ width: "11%" }} />{matrix.columns.map((point: number) => <col key={point} />)}</colgroup>
              <thead><tr><th>القاعة</th><th>الأيام</th>{matrix.columns.map((point: number) => <th key={point} className="print-ltr">{scheduleClockForDisplay(clock(point))}<small>{scheduleClockForDisplay(clock(point + 60))}</small></th>)}</tr></thead>
              <tbody>{pageLines.map((line: any) => <tr key={line.id}>
                <th><strong>{line.room.hall || "—"}</strong><small>{line.room.building}</small></th>
                <td>{line.group.label}</td>
                {line.cells.map((cell: any) => <td key={cell.point} className={cell.rows.length ? "taken" : ""}>{cell.rows.map((row: FSchedule) => <span className="print-matrix-slot" key={row.id}><b>{courseOf(row)?.CourseName || row.AdCourseName || "—"}</b><em>{instructorOf(row)?.AdInstructorName || "—"}</em><i className="print-ltr">{courseOf(row)?.CourseCode || "—"} · {row.SCode || "—"}</i></span>)}</td>)}
              </tr>)}</tbody>
            </table>
            <PrintPageMeta page={pageIndex + 1} total={pages.length} college={collegeName} date={issueDate} />
          </section>
        )) : <p className="print-empty">لا توجد قاعات × أوقات ضمن النطاق المحدد.</p>}
      </div>
    );
  }

  if (kind === "time") {
    const groups = groupRows(rows, row => row.fstarttime).sort((a, b) => a.key.localeCompare(b.key));
    const maxCount = Math.max(1, ...groups.map(group => group.rows.length));
    const pages = paginateItems(groups, PAGE_ROWS.timeGroups);
    return (
      <div className="print-report print-wide print-query-report print-time-report">
        {pages.length ? pages.map((pageGroups, pageIndex) => (
          <section className="print-explicit-page" key={`time-page-${pageIndex + 1}`}>
            <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} footer={false} />
            <div className="print-time-list">{pageGroups.map(group => {
              const rooms = [...new Set(group.rows.map(row => placeOfRow(row)).filter(room => room !== "بلا قاعة"))];
              return <article key={group.key}>
                <time className="print-ltr">{group.key}</time>
                <i><b style={{ width: `${Math.round((group.rows.length / maxCount) * 100)}%` }} /></i>
                <strong>{group.rows.length}</strong>
                <div>{rooms.slice(0, 12).map(room => <span className="print-ltr" key={room}>{room}</span>)}</div>
              </article>;
            })}</div>
            <PrintPageMeta page={pageIndex + 1} total={pages.length} college={collegeName} date={issueDate} />
          </section>
        )) : <p className="print-empty">لا توجد أوقات ضمن النطاق المحدد.</p>}
      </div>
    );
  }

  if (kind === "fairness") {
    /* Keep the portrait fairness sheet deliberately airy. Ten rows per logical
       page fits the letterhead, score block and page meta as one indivisible
       unit in WebKit/Chromium, while 39 instructors still need only four pages
       (10/10/10/9) instead of producing a stranded footer/blank sheet. */
    const pages = fairness?.rows?.length ? paginateItems(fairness.rows, PAGE_ROWS.fairnessRows) : [];
    return (
      <div className="print-report print-wide print-query-report print-fairness-new">
        {pages.length ? pages.map((pageRows: any[], pageIndex) => (
          <section className="print-explicit-page" key={`fairness-page-${pageIndex + 1}`}>
            <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} footer={false} />
            <section className="print-fairness-hero">
              <div><strong>{fairness.score}</strong><span>/ 100</span><small>مؤشر العدالة</small></div>
              <dl><div><dt>متوسط النصاب</dt><dd>{Math.round(fairness.average / 60)} س</dd></div><div><dt>الفارق</dt><dd>{Math.round(fairness.spread / 60)} س</dd></div><div><dt>الأساتذة</dt><dd>{fairness.rows.length}</dd></div></dl>
            </section>
            <div className="print-fairness-rows">
              {pageRows.map((row: any) => <div key={row.id}>
                <span>{row.name}</span>
                <i><b style={{ width: `${Math.max(4, Math.round((row.load / Math.max(1, fairness.rows[0].load)) * 100))}%` }} /></i>
                <em>{Math.round(row.load / 60)} س</em>
                <small className="print-ltr">{row.delta > 0 ? "+" : ""}{Math.round(row.delta / 60)}</small>
              </div>)}
            </div>
            {pageIndex === pages.length - 1 ? <div className="print-signatures"><div><span>منسق الجدول</span><i /></div><div><span>رئيس القسم العلمي</span><i /></div></div> : null}
            <PrintPageMeta page={pageIndex + 1} total={pages.length} college={collegeName} date={issueDate} />
          </section>
        )) : <p className="print-empty">لا توجد بيانات كافية لحساب العدالة.</p>}
      </div>
    );
  }

  if (kind === "balance") {
    const pages = balance?.departments?.length ? paginateItems(balance.departments, PAGE_ROWS.balanceRows) : [];
    return (
      <div className="print-report print-wide print-query-report print-balance-report">
        {pages.length ? pages.map((pageDepartments: any[], pageIndex) => (
          <section className="print-explicit-page" key={`balance-page-${pageIndex + 1}`}>
            <PrintLetterhead title={titles[kind]} scope={balance?.termName || scopeLine} college={collegeName} footer={false} />
            <div className="print-query-summaryline"><span><b>{balance.totals.departments}</b> قسم</span><span><b>{balance.totals.rows}</b> موعد</span><span><b>{balance.totals.conflicts}</b> مانع اعتماد</span></div>
            <table>
              <thead><tr><th>القسم العلمي</th><th>المواعيد</th><th>الأساتذة</th><th>القاعات</th><th>صباحي</th><th>العدالة</th><th>الجودة</th><th>موانع</th></tr></thead>
              <tbody>{pageDepartments.map((item: any) => <tr key={item.sectionId}>
                <td className="print-wrap"><strong>{item.sectionName}</strong><small>{item.collegeName}</small></td><td>{item.rows}</td><td>{item.instructors}</td><td>{item.rooms}</td><td>{item.morningPct}%</td><td>{item.fairness}</td><td>{item.quality}</td><td>{item.conflicts || "—"}</td>
              </tr>)}</tbody>
            </table>
            <PrintPageMeta page={pageIndex + 1} total={pages.length} college={collegeName} date={issueDate} />
          </section>
        )) : <p className="print-empty">لا توجد بيانات ميزان أقسام لهذا الفصل.</p>}
      </div>
    );
  }

  return null;
}
