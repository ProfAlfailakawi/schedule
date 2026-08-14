import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, CalendarDays, ChevronDown, Clock3, Download, LayoutList,
  Landmark, Printer, Scale, Search, SlidersHorizontal, Table2, UserRound, X
} from "lucide-react";
import { parseNaturalQuery } from "../utils/naturalQuery";
import { EmptyState, Field, GhostButton, Notice, PageTitle, PrimaryButton, PrintLetterhead, SecondaryButton } from "./ui";
import { AdCollege, AdCourse, AdInstructor, AdSection, AdTerm, FSchedule } from "../types";
import { runVisualTransition } from "../utils/visualTransition";
import { coerceScopeValues, resolveScopeSelection } from "../utils/scopeContext";
import { byArabic, sortByName } from "../utils/sorting";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START, SCHEDULE_DAY_START_TIME, SCHEDULE_SLOT_MINUTES } from "../utils/scheduleTime";

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
type PrintKind =
  | "DepartmentSchedule" | "ListofTeacherCourse" | "InstructorWithRoom" | "TeacherWithCourse"
  | "InstructorReport2" | "WeekWithInstructor" | "RoomReport2" | "WeekWithInstructorByDept"
  | "TimeReport2" | "RoomTimeReport2" | "RoomLoad" | "RoomMatrix" | "Fairness" | null;

interface Props {
  mode: ReportMode;
  user?: { SystemUserId: number; IsAdminUser?: boolean };
  scopes?: any[];
  availableModes?: ReportMode[];
}

interface Filters {
  collegeId: number; sectionId: number; termId: number;
  instructorId: number; civil: string;
  building: string; hall: string;
  courseId: number; courseCode: string;
  startTime: string; endTime: string;
  sun: boolean; mon: boolean; tue: boolean; wed: boolean; thr: boolean;
}

const fresh = (): Filters => ({
  collegeId: 0, sectionId: 0, termId: 0, instructorId: 0, civil: "",
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

const LENSES: Array<{ id: Lens; label: string; icon: React.ReactNode }> = [
  { id: "list", label: "الكل", icon: <LayoutList /> },
  { id: "week", label: "الأسبوع", icon: <CalendarDays /> },
  { id: "instructor", label: "الأساتذة", icon: <UserRound /> },
  { id: "room", label: "القاعات", icon: <Building2 /> },
  { id: "matrix", label: "القاعات × الأوقات", icon: <Table2 /> },
  { id: "time", label: "الأوقات", icon: <Clock3 /> },
  { id: "fairness", label: "العدالة", icon: <Scale /> },
  /* Main administrator only — see `shownLenses`. It is the one reading nobody
     else is allowed to see, so it must not appear as a locked door to them. */
  { id: "balance", label: "ميزان الأقسام", icon: <Landmark /> }
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

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");
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
const share = (value: number, max: number) => `${Math.min(100, Math.round((value / Math.max(1, max)) * 100))}%`;

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
  let saved: any = {};
  try { saved = JSON.parse(localStorage.getItem(prefKey) || "{}"); } catch { /* first run */ }

  const [lens, setLens] = useState<Lens>(() => (LENSES.some(x => x.id === saved.lens) ? saved.lens : LENS_FOR_MODE[mode] || "list"));
  const [colleges, setColleges] = useState<AdCollege[]>([]);
  const [sections, setSections] = useState<AdSection[]>([]);
  const [terms, setTerms] = useState<AdTerm[]>([]);
  const [instructors, setInstructors] = useState<AdInstructor[]>([]);
  const [courses, setCourses] = useState<AdCourse[]>([]);
  const [all, setAll] = useState<FSchedule[]>([]);
  const [filters, setFilters] = useState<Filters>(() => ({ ...fresh(), ...(saved.filters || {}) }));
  const [moreOpen, setMoreOpen] = useState(false);
  const [printKind, setPrintKind] = useState<PrintKind>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [visibleLimit, setVisibleLimit] = useState(150);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);
  const [occupancy, setOccupancy] = useState<any>(null);
  const [roomDay, setRoomDay] = useState<number | "week">("week");
  /** Which square of the occupancy grid the reader asked about. */
  const [roomPick, setRoomPick] = useState<{ room: string; point: number | null } | null>(null);
  const [ask, setAsk] = useState("");
  const [askNote, setAskNote] = useState<string | null>(null);

  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);

  useEffect(() => { setLens(LENS_FOR_MODE[mode] || "list"); }, [mode]);
  useEffect(() => {
    // Persist the whole filter set, not just scope — every active chip
    // (instructor, course, civil id, time window, days) survives a reload and a
    // closed detail, matching the restore which already spreads all of them.
    localStorage.setItem(prefKey, JSON.stringify({ lens, filters }));
  }, [lens, filters]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const responses = await Promise.all(["colleges", "sections", "terms", "instructors", "courses"].map(x => fetch(`/api/${x}`)));
        if (responses.some(r => !r.ok)) throw new Error("تعذر تحميل البيانات");
        const data = await Promise.all(responses.map(r => r.json()));
        const sortedTerms = [...data[2]].sort((a: AdTerm, b: AdTerm) => Number(b.AdTermId) - Number(a.AdTermId));
        setColleges(sortByName(data[0], (row: AdCollege) => row.AdCollegeName));
        setSections(sortByName(data[1], (row: AdSection) => row.AdSectionName));
        setTerms(sortedTerms);
        setInstructors(sortByName(data[3], (row: AdInstructor) => row.AdInstructorName));
        setCourses(sortByName(data[4], (row: AdCourse) => row.CourseName));
        const latestTermId = Number(sortedTerms[0]?.AdTermId || 0);
        let collegeId = Number(saved?.filters?.collegeId || 0), sectionId = Number(saved?.filters?.sectionId || 0);
        if (isPowerAdmin) {
          if (!collegeId || !data[0].some((c: AdCollege) => c.AdCollegeId === collegeId)) collegeId = Number(data[1][0]?.AdCollegeId || data[0][0]?.AdCollegeId || 0);
          if (!sectionId || data[1].find((s: AdSection) => s.AdSectionId === sectionId)?.AdCollegeId !== collegeId) sectionId = Number(data[1].find((s: AdSection) => s.AdCollegeId === collegeId)?.AdSectionId || 0);
        } else {
          const scoped = coerceScopeValues(scopes, collegeId, sectionId, false);
          collegeId = scoped.collegeId; sectionId = scoped.sectionId;
        }
        setFilters(prev => ({ ...prev, collegeId, sectionId, termId: prev.termId || latestTermId }));
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
    if (!filters.termId) return Promise.resolve();
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
    if (!filters.termId) return;
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

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource("/api/schedules/events");
    const onChange = () => setLiveNudge(true);
    source.addEventListener("schedules", onChange);
    return () => { source.removeEventListener("schedules", onChange); source.close(); };
  }, []);

  useEffect(() => {
    if (!sections.length || isPowerAdmin) return;
    setFilters(prev => {
      const next = coerceScopeValues(scopes, prev.collegeId, prev.sectionId, false);
      if (next.collegeId === prev.collegeId && next.sectionId === prev.sectionId) return prev;
      return { ...prev, collegeId: next.collegeId, sectionId: next.sectionId };
    });
  }, [sections.length, scopes, isPowerAdmin]);

  const scopeState = resolveScopeSelection(scopes, filters.collegeId, isPowerAdmin);
  const sectionOptions = useMemo(() => sortByName(sections.filter(s => !filters.collegeId || s.AdCollegeId === filters.collegeId), (s: AdSection) => s.AdSectionName), [sections, filters.collegeId]);
  const courseOptions = useMemo(() => sortByName(courses.filter(c => !filters.sectionId || c.AdSectionId === filters.sectionId), (c: AdCourse) => c.CourseName), [courses, filters.sectionId]);
  const instructorById = useMemo(() => new Map(instructors.map(x => [x.AdInstructorId, x])), [instructors]);
  const courseById = useMemo(() => new Map(courses.map(x => [x.AdCourseId, x])), [courses]);
  const collegeById = useMemo(() => new Map(colleges.map(x => [x.AdCollegeId, x])), [colleges]);
  const sectionById = useMemo(() => new Map(sections.map(x => [x.AdSectionId, x])), [sections]);
  const termById = useMemo(() => new Map(terms.map(x => [x.AdTermId, x])), [terms]);

  const buildings = useMemo(() => Array.from(new Set(all.map(s => s.AdRoomCode).filter(Boolean))).sort(byArabic), [all]);
  const halls = useMemo(() => Array.from(new Set(all.filter(s => !filters.building || s.AdRoomCode === filters.building).map(s => s.AdRoomHall).filter(Boolean))).sort(byArabic), [all, filters.building]);

  /** One predicate serves every lens. Nothing is mode-specific any more. */
  const results = useMemo(() => {
    let rows = [...all];
    if (filters.collegeId) rows = rows.filter(s => s.AdCollegeId === filters.collegeId);
    if (filters.sectionId) rows = rows.filter(s => s.AdSectionId === filters.sectionId);
    if (filters.termId) rows = rows.filter(s => s.AdTermId === filters.termId);
    if (filters.instructorId) rows = rows.filter(s => s.AdInstructorId === filters.instructorId);
    if (filters.civil.trim()) rows = rows.filter(s => (instructorById.get(s.AdInstructorId)?.AdInstructorCivil || "").includes(filters.civil.trim()));
    if (filters.building) rows = rows.filter(s => String(s.AdRoomCode || "").includes(filters.building));
    if (filters.hall) rows = rows.filter(s => String(s.AdRoomHall || "").includes(filters.hall));
    if (filters.startTime && filters.endTime) {
      /* A lecture that lives entirely inside the window is the most obvious
         answer to "what is on between ten and twelve", and the old test — which
         only matched appointments straddling an endpoint — was the one shape
         that missed it. This is the same overlap rule the conflict detector
         uses: any shared minute counts, and touching edges do not. */
      rows = rows.filter(s => s.fstarttime < filters.endTime && s.fendtime > filters.startTime);
    }
    if (filters.courseId) rows = rows.filter(s => s.AdCourseId === filters.courseId);
    if (filters.courseCode.trim()) rows = rows.filter(s => (courseById.get(s.AdCourseId)?.CourseCode || "") === filters.courseCode.trim());
    const chosenDays = DAYS.filter(day => filters[day.key]);
    if (chosenDays.length) rows = rows.filter(s => chosenDays.some(day => (s as any)[day.flag]));
    return rows.sort((a, b) => String(a.fstarttime).localeCompare(String(b.fstarttime)) || byArabic(a.AdCourseName, b.AdCourseName));
  }, [all, filters, instructorById, courseById]);

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
      next.building = code; next.hall = hall;
      said.push(`${code}-${hall}`);
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
  if (filters.building) chips.push({ key: "building", label: `المبنى: ${filters.building}`, clear: () => setFilters(prev => ({ ...prev, building: "", hall: "" })) });
  if (filters.hall) chips.push({ key: "hall", label: `القاعة: ${filters.hall}`, clear: () => set("hall", "") });
  if (selectedCourse) chips.push({ key: "course", label: `المقرر: ${selectedCourse.CourseName}`, clear: () => set("courseId", 0) });
  if (filters.courseCode) chips.push({ key: "course-code", label: `رمز المقرر: ${filters.courseCode}`, clear: () => set("courseCode", "") });
  if (filters.startTime && filters.endTime) chips.push({
    key: "time",
    label: `الفترة: ${filters.startTime}–${filters.endTime}`,
    clear: () => setFilters(prev => ({ ...prev, startTime: "", endTime: "" }))
  });
  DAYS.filter(day => filters[day.key]).forEach(day => chips.push({
    key: `day-${day.key}`,
    label: `اليوم: ${day.label}`,
    clear: () => set(day.key, false)
  }));

  const collegeName = collegeById.get(filters.collegeId)?.AdCollegeName || "";
  const scopeLine = [
    termById.get(filters.termId)?.AdTermName,
    collegeName,
    sectionById.get(filters.sectionId)?.AdSectionName
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
      .sort((a, b) => byArabic(a.name, b.name));
  }, [results, instructorById]);

  const byRoom = useMemo(() => {
    const groups = new Map<string, FSchedule[]>();
    results.forEach(row => {
      const key = `${row.AdRoomCode || "—"} / ${row.AdRoomHall || "—"}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    });
    return [...groups.entries()]
      .map(([key, rows]) => ({ id: key, name: key, rows, count: rows.length, load: rows.reduce((t, r) => t + duration(r), 0) }))
      .sort((a, b) => byArabic(a.name, b.name));
  }, [results]);

  const byTime = useMemo(() => {
    const groups = new Map<string, FSchedule[]>();
    results.forEach(row => groups.set(row.fstarttime, [...(groups.get(row.fstarttime) || []), row]));
    return [...groups.entries()].map(([key, rows]) => ({ key, rows, count: rows.length })).sort((a, b) => a.key.localeCompare(b.key));
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
    if (lens !== "room" || !filters.termId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ termId: String(filters.termId) });
    if (filters.collegeId) query.set("collegeId", String(filters.collegeId));
    if (filters.sectionId) query.set("sectionId", String(filters.sectionId));
    (async () => {
      try {
        const response = await fetch(`/api/reports/room-load?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error("تعذر قراءة إشغال القاعات");
        setOccupancy(await response.json());
      } catch (e: any) { if (e?.name !== "AbortError") setError(e.message); }
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
    const placed = results.filter(row => row.fstarttime && row.fendtime && (row.AdRoomCode || row.AdRoomHall));
    if (!placed.length) return null;

    const buildings = [...new Set(placed.map(row => String(row.AdRoomCode || "").trim()).filter(Boolean))].sort(byArabic);
    const scoped = placed.filter(row =>
      (!matrixBuilding || String(row.AdRoomCode || "").trim() === matrixBuilding) &&
      (!matrixHall || String(row.AdRoomHall || "").trim().toLowerCase().includes(matrixHall.trim().toLowerCase())));

    const from = GRID_START;
    const to = GRID_END;
    const columns: number[] = [];
    for (let point = from; point < Math.max(to, from + 60); point += 60) columns.push(point);

    type Hall = { key: string; building: string; hall: string };
    const halls: Hall[] = [...new Map<string, Hall>(scoped.map(row => {
      const key = `${String(row.AdRoomCode || "").trim()}|${String(row.AdRoomHall || "").trim()}`;
      return [key, { key, building: String(row.AdRoomCode || "").trim(), hall: String(row.AdRoomHall || "").trim() }] as const;
    })).values()].sort((a, b) => byArabic(a.building, b.building) || byArabic(a.hall, b.hall));

    const lines = halls.flatMap(room => DAY_GROUPS.map(group => {
      const inRoom = scoped.filter(row =>
        String(row.AdRoomCode || "").trim() === room.building &&
        String(row.AdRoomHall || "").trim() === room.hall &&
        group.days.some(index => Boolean((row as any)[DAYS[index].flag])));
      const cells = columns.map(point => ({
        point,
        rows: inRoom.filter(row => minutes(row.fstarttime) < point + 60 && minutes(row.fendtime) > point),
      }));
      return { id: `${room.key}|${group.id}`, room, group, cells, used: inRoom.length };
    })).filter(line => line.used > 0);

    return { columns, lines, buildings, total: scoped.length };
  }, [results, matrixBuilding, matrixHall]);

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
    return { slots, rooms: rooms.sort((a: any, b: any) => b.rate - a.rate || byArabic(a.name, b.name)), totalRate, days };
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
  const excel = () => { window.location.href = `/api/reports/excel/ScheduleExcel?${queryString()}`; };
  const print = (kind: Exclude<PrintKind, null>) => {
    setPrintKind(kind);
    setPrintOpen(false);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };

  const PRINTS: Array<{ kind: Exclude<PrintKind, null>; label: string }> = [
    { kind: "DepartmentSchedule", label: "جدول القسم" },
    { kind: "WeekWithInstructor", label: "شبكة الأسبوع" },
    { kind: "ListofTeacherCourse", label: "كشف المزاولة" },
    { kind: "InstructorWithRoom", label: "الأساتذة مفصل" },
    { kind: "RoomReport2", label: "المباني والقاعات" },
    { kind: "RoomLoad", label: "إشغال القاعات والفراغات" },
    { kind: "RoomMatrix", label: "جدول القاعات × الأوقات" },
    { kind: "TimeReport2", label: "الأوقات" },
    { kind: "Fairness", label: "عدالة العبء" }
  ];

  const groups = lens === "instructor" ? byInstructor : lens === "room" ? byRoom : [];
  const maxLoad = Math.max(1, ...groups.map(group => group.load));
  const maxSlot = Math.max(1, ...byTime.map(slot => slot.count));
  const selectedResult = selectedResultId === null ? null : results.find(row => row.id === selectedResultId) || null;
  const pickedCourse = selectedResult ? courseById.get(selectedResult.AdCourseId) : null;
  const pickedInstructor = selectedResult ? instructorById.get(selectedResult.AdInstructorId) : null;
  // The detail reads as a side panel, so the results list keeps its place and
  // its scroll. Escape closes it back to exactly where the reader left off.
  useEffect(() => {
    if (selectedResultId === null) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedResultId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedResultId]);
  // The room-occupancy reading is the same side panel; Escape closes it too.
  useEffect(() => {
    if (!roomPick) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setRoomPick(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [roomPick]);

  const selectLens = (next: Lens) => runVisualTransition(() => {
    setLens(next);
    setOpenGroup(null);
    setRoomPick(null);
  });

  const moveLensFocus = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = LENSES.length - 1;
    let target = index;
    if (event.key === "Home") target = 0;
    else if (event.key === "End") target = last;
    else if (event.key === "ArrowLeft") target = index === last ? 0 : index + 1;
    else if (event.key === "ArrowRight") target = index === 0 ? last : index - 1;
    else return;
    event.preventDefault();
    const next = LENSES[target];
    selectLens(next.id);
    requestAnimationFrame(() => document.getElementById(`query-lens-tab-${next.id}`)?.focus());
  };

  return (
    <div className="content-stack query-page">
      <PageTitle eyebrow="الاستعلامات والتقارير" subtitle="سؤال واحد · سبع عدسات">مركز الاستعلام</PageTitle>

      {error ? (
        <Notice>
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
          {!scopeState.lockCollege ? (
            <Field label="الكلية">
              <select
                value={filters.collegeId || ""}
                onChange={event => {
                  const id = Number(event.target.value) || 0;
                  set("collegeId", id);
                  set("sectionId", isPowerAdmin
                    ? (sections.find(s => s.AdCollegeId === id)?.AdSectionId || 0)
                    : (resolveScopeSelection(scopes, id, false).defaultSectionId || 0));
                }}
              >
                <option value="">الكل</option>
                {colleges.map(row => <option key={row.AdCollegeId} value={row.AdCollegeId}>{row.AdCollegeName}</option>)}
              </select>
            </Field>
          ) : null}
          {!scopeState.lockSection ? (
            <Field label="القسم">
              <select value={filters.sectionId || ""} disabled={!filters.collegeId} onChange={event => set("sectionId", Number(event.target.value) || 0)}>
                <option value="">الكل</option>
                {sectionOptions.map(row => <option key={row.AdSectionId} value={row.AdSectionId}>{row.AdSectionName}</option>)}
              </select>
            </Field>
          ) : null}
          <Field label="الفصل">
            <select value={filters.termId || ""} onChange={event => set("termId", Number(event.target.value) || 0)}>
              {terms.map(row => <option key={row.AdTermId} value={row.AdTermId}>{row.AdTermName}</option>)}
            </select>
          </Field>
          <GhostButton
            type="button"
            onClick={() => setMoreOpen(v => !v)}
            aria-expanded={moreOpen}
            aria-controls="query-more-filters"
            aria-label={`مرشحات إضافية${chips.length ? `، ${chips.length} نشطة` : ""}`}
            title="مرشحات إضافية"
          >
            <SlidersHorizontal aria-hidden="true" />
            المزيد
            {chips.length ? <b className="tool-count">{chips.length}</b> : null}
          </GhostButton>
        </div>

        {moreOpen ? (
          <div className="query-more query-advanced-filters" id="query-more-filters" role="group" aria-label="مرشحات إضافية">
            <Field label="أستاذ">
              <select value={filters.instructorId || ""} onChange={event => set("instructorId", Number(event.target.value) || 0)}>
                <option value="">الكل</option>
                {instructors.map(row => <option key={row.AdInstructorId} value={row.AdInstructorId}>{row.AdInstructorName}</option>)}
              </select>
            </Field>
            <Field label="الرقم المدني">
              <input value={filters.civil} inputMode="numeric" onChange={event => set("civil", event.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="المبنى">
              <select value={filters.building} onChange={event => { set("building", event.target.value); set("hall", ""); }}>
                <option value="">الكل</option>
                {buildings.map(value => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="القاعة">
              <select value={filters.hall} onChange={event => set("hall", event.target.value)}>
                <option value="">الكل</option>
                {halls.map(value => <option key={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="المقرر">
              <select value={filters.courseId || ""} onChange={event => set("courseId", Number(event.target.value) || 0)}>
                <option value="">الكل</option>
                {courseOptions.map(row => <option key={row.AdCourseId} value={row.AdCourseId}>{row.CourseName}</option>)}
              </select>
            </Field>
            <Field label="الفترة">
              <div className="time-pair">
                <input type="time" min={SCHEDULE_DAY_START_TIME} max={SCHEDULE_DAY_END_TIME} step={SCHEDULE_SLOT_MINUTES * 60} value={filters.startTime} onChange={event => set("startTime", event.target.value)} aria-label="من" />
                <input type="time" min={SCHEDULE_DAY_START_TIME} max={SCHEDULE_DAY_END_TIME} step={SCHEDULE_SLOT_MINUTES * 60} value={filters.endTime} onChange={event => set("endTime", event.target.value)} aria-label="إلى" />
              </div>
            </Field>
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
            title={item.label}
          >
            {React.cloneElement(item.icon as React.ReactElement, { "aria-hidden": true })}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

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
          <div className="query-canvas-actions">
            <div className="print-menu">
              <SecondaryButton
                type="button"
                onClick={() => setPrintOpen(v => !v)}
                aria-expanded={printOpen}
                aria-controls="query-print-menu"
                aria-haspopup="menu"
              >
                <Printer aria-hidden="true" />طباعة<ChevronDown aria-hidden="true" />
              </SecondaryButton>
              {printOpen ? (
                <div className="print-menu-pop" id="query-print-menu" role="menu" aria-label="نماذج الطباعة">
                  {PRINTS.map(item => <button key={item.kind} type="button" role="menuitem" onClick={() => print(item.kind)}>{item.label}</button>)}
                </div>
              ) : null}
            </div>
            <SecondaryButton type="button" onClick={excel}><Download aria-hidden="true" />Excel</SecondaryButton>
          </div>
        </header>

        {loading || pending ? (
          <QuerySkeleton />
        ) : !results.length ? (
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
                  <time dir="ltr">{row.fstarttime}–{row.fendtime}</time>
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
          {selectedResult ? (
            <>
              <div className="query-detail-backdrop no-print" onMouseDown={() => setSelectedResultId(null)} aria-hidden="true" />
              <aside
                className="occupancy-pick query-detail-panel no-print"
                id="query-result-detail-panel"
                role="dialog"
                aria-label={`تفاصيل ${pickedCourse?.CourseName || selectedResult.AdCourseName || "الموعد"}`}
              >
                <header>
                  <div>
                    <small>تفاصيل الموعد</small>
                    <strong>{pickedCourse?.CourseName || selectedResult.AdCourseName || "—"}</strong>
                  </div>
                  <span className="occupancy-pick-count">الشعبة {selectedResult.SCode || "—"}</span>
                  <button type="button" onClick={() => setSelectedResultId(null)} aria-label="إغلاق التفاصيل" title="إغلاق">
                    <X aria-hidden="true" />
                  </button>
                </header>
                <div className="occupancy-pick-rows">
                  <article>
                    <strong>{pickedInstructor?.AdInstructorName || "بدون أستاذ"}</strong>
                    <span>{sectionById.get(selectedResult.AdSectionId)?.AdSectionName || "بدون قسم"}</span>
                    <em>{dayText(selectedResult) || "بلا أيام"}</em>
                    <time dir="ltr">{selectedResult.fstarttime}–{selectedResult.fendtime}</time>
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
          ) : null}
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
                      <time dir="ltr">{row.fstarttime}<i>{row.fendtime}</i></time>
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
                <select value={matrixBuilding} onChange={e => setMatrixBuilding(e.target.value)}>
                  <option value="">كل المباني</option>
                  {(matrix?.buildings || []).map(code => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <label>
                <span>القاعة</span>
                <input value={matrixHall} onChange={e => setMatrixHall(e.target.value)} placeholder="F10 مثلاً" />
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
                        <th key={point} dir="ltr">{clock(point)}<i>{clock(point + 60)}</i></th>
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
            {roomLoad ? (
              <div className="occupancy-grid" style={{ "--slots": roomLoad.slots.length } as React.CSSProperties}>
                <div className="occupancy-ruler">
                  <span />
                  {roomLoad.slots.map(point => <b key={point} dir="ltr">{String(Math.floor(point / 60)).padStart(2, "0")}</b>)}
                  <span />
                </div>
                {roomLoad.rooms.map((room: any) => (
                  <div key={room.key} className={`occupancy-row ${room.mine ? "mine" : ""} ${roomPick?.room === room.name ? "picked" : ""}`}>
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
                        data-mine={cell.mine ? "1" : undefined}
                        className={roomPick?.room === room.name && roomPick?.point === cell.point ? "picked" : ""}
                        title={`${room.name} · ${clock(cell.point)} · ${cell.taken ? `${cell.taken} يوم` : "فاضية"}`}
                        aria-label={`${room.name} الساعة ${clock(cell.point)}`}
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
                      <small>{roomPick.point == null ? "كل مواعيد القاعة" : `الساعة ${clock(roomPick.point)}`}</small>
                      <strong>{roomPick.room}</strong>
                    </div>
                    <span className="occupancy-pick-count">{num(picked.length)} موعد</span>
                    <button type="button" onClick={() => setRoomPick(null)} aria-label="إغلاق">✕</button>
                  </header>
                  {picked.length ? (
                    <div className="occupancy-pick-rows">
                      {picked.map(row => (
                        <article key={row.id}>
                          <strong>{row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "—"}</strong>
                          <span>{instructorById.get(row.AdInstructorId)?.AdInstructorName || "بدون أستاذ"}</span>
                          <em>{dayText(row)}</em>
                          <time dir="ltr">{row.fstarttime}–{row.fendtime}</time>
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
                          <time key={index} dir="ltr">{clock(window.from)}–{clock(window.to)}</time>
                        ))}
                      </div>
                    </article>
                  ))}
              </div>
            ) : null}
            <div className="lens-groups">
              {groups.map(group => (
                <article key={group.id} className={openGroup === group.id ? "open" : ""}>
                  <button
                    type="button"
                    aria-expanded={openGroup === group.id}
                    aria-controls={`query-room-group-${encodeURIComponent(group.id)}`}
                    onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
                  >
                    <span className="group-avatar"><Building2 /></span>
                    <strong>{group.name}</strong>
                    <span className="group-bar"><i style={{ width: share(group.load, maxLoad) }} /></span>
                    <b>{num(group.count)}</b>
                    <em>{num(Math.round(group.load / 60))}س</em>
                    <ChevronDown aria-hidden="true" />
                  </button>
                  {openGroup === group.id ? (
                    <div className="group-rows" id={`query-room-group-${encodeURIComponent(group.id)}`}>
                      {group.rows.map(row => (
                        <div key={row.id}>
                          <span className="code-chip">{courseById.get(row.AdCourseId)?.CourseCode || "—"}</span>
                          <span>{instructorById.get(row.AdInstructorId)?.AdInstructorName || "—"}</span>
                          <time dir="ltr">{row.fstarttime}–{row.fendtime}</time>
                          <small>{dayText(row)}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
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
                        <time dir="ltr">{row.fstarttime}–{row.fendtime}</time>
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
            {byTime.map(slot => (
              <article key={slot.key}>
                <time dir="ltr">{slot.key}</time>
                <span className="slot-bar"><i style={{ width: share(slot.count, maxSlot) }} /></span>
                <b>{num(slot.count)}</b>
                <div className="slot-rooms">
                  {Array.from(new Set(slot.rows.map(row => row.AdRoomCode))).slice(0, 8).map(room => <span key={room}>{room}</span>)}
                </div>
              </article>
            ))}
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
              <PrimaryButton type="button" onClick={() => print("Fairness")}><Printer />اعتماد</PrimaryButton>
            </div>
            <div className="fairness-rows">
              {fairness.rows.map(row => (
                <div key={row.id} className={row.delta > 60 ? "over" : row.delta < -60 ? "under" : ""}>
                  <span>{row.name}</span>
                  <i><b style={{ width: share(row.load, fairness.rows[0].load) }} /></i>
                  <em>{num(Math.round(row.load / 60))}س</em>
                  <small dir="ltr">{row.delta > 0 ? "+" : ""}{num(Math.round(row.delta / 60))}</small>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="query-empty"><EmptyState title="لا بيانات كافية" /></div>
        )}
      </section>

      <div className="print-only">
        <PrintSheet
          kind={printKind}
          rows={results}
          fairness={fairness}
          matrix={matrix}
          roomLoad={roomLoad}
          roomDay={roomDay}
          scopeLine={scopeLine}
          collegeName={collegeName}
          courseById={courseById}
          instructorById={instructorById}
        />
      </div>
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

/** Print output. Every legacy sheet is still reachable, now from one menu. */
function PrintSheet({ kind, rows, fairness, matrix, roomLoad, roomDay, scopeLine, collegeName, courseById, instructorById }: {
  kind: PrintKind; rows: FSchedule[]; fairness: any; matrix: any; roomLoad: any; roomDay: number | "week"; scopeLine: string; collegeName: string;
  courseById: Map<number, AdCourse>; instructorById: Map<number, AdInstructor>;
}) {
  if (!kind) return null;
  const titles: Record<Exclude<PrintKind, null>, string> = {
    DepartmentSchedule: "تقرير القسم العلمي الشامل",
    ListofTeacherCourse: "كشف المزاولة",
    InstructorWithRoom: "تقرير الأساتذة مفصل",
    TeacherWithCourse: "استمارة المزاولة",
    InstructorReport2: "تقرير الأستاذ",
    WeekWithInstructor: "الجدول الأسبوعي",
    RoomReport2: "تقرير المباني والقاعات",
    WeekWithInstructorByDept: "الجدول الأسبوعي — القسم",
    TimeReport2: "تقرير الوقت",
    RoomTimeReport2: "تقرير الوقت والقاعات",
    RoomLoad: "إشغال القاعات والفراغات",
    RoomMatrix: "جدول القاعات والأوقات",
    Fairness: "تقرير عدالة توزيع العبء"
  };
  const totalHours = rows.reduce((total, row) => total + duration(row) * DAYS.filter(day => (row as any)[day.flag]).length, 0);

  if (kind === "Fairness") {
    return (
      <div className="print-report print-upright">
        <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} />
        <table>
          <colgroup><col style={{ width: "8%" }} /><col /><col style={{ width: "13%" }} /><col style={{ width: "11%" }} /><col style={{ width: "13%" }} /><col style={{ width: "13%" }} /></colgroup>
          <thead><tr><th>م</th><th>أستاذ المقرر</th><th>المواعيد</th><th>الأيام</th><th>الساعات</th><th>الفرق</th></tr></thead>
          <tbody>
            {(fairness?.rows || []).map((row: any, index: number) => (
              <tr key={row.id}>
                <td>{index + 1}</td><td>{row.name}</td><td className="num">{row.count}</td><td className="num">{row.days}</td>
                <td className="num">{Math.round(row.load / 60)}</td>
                <td dir="ltr">{row.delta > 0 ? "+" : ""}{Math.round(row.delta / 60)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="print-summary">
          <span>مؤشر العدالة: <b>{fairness?.score ?? "—"} / 100</b></span>
          <span>متوسط النصاب: <b>{Math.round((fairness?.average || 0) / 60)} ساعة</b></span>
          <span>عدد الأساتذة: <b>{fairness?.rows?.length ?? 0}</b></span>
        </div>
        <div className="print-signatures">
          <div><span>منسق الجدول</span><i /></div>
          <div><span>رئيس القسم العلمي</span><i /></div>
          <div><span>التاريخ</span><i /></div>
        </div>
      </div>
    );
  }

  if (kind === "RoomMatrix") {
    // The paper sheet as paper: a hall per line, the hours across, landscape.
    if (!matrix?.lines?.length) {
      return (
        <div className="print-report">
          <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} />
          <p>لا توجد قاعات في هذا النطاق.</p>
        </div>
      );
    }
    return (
      <div className="print-report print-matrix print-wide">
        <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} />
        <table>
          <thead>
            <tr>
              <th>القاعة</th>
              <th>الأيام</th>
              {matrix.columns.map((point: number) => (
                <th key={point} dir="ltr">{clock(point)}–{clock(point + 60)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.lines.map((line: any) => (
              <tr key={line.id}>
                <th>{line.room.hall || "—"}<small>{line.room.building}</small></th>
                <td>{line.group.label}</td>
                {line.cells.map((cell: any) => (
                  <td key={cell.point}>
                    {cell.rows.map((row: FSchedule) => (
                      <span key={row.id}>
                        <b>{row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "—"}</b>
                        <i>{instructorById.get(row.AdInstructorId)?.AdInstructorName || "—"}</i>
                        <u dir="ltr">{courseById.get(row.AdCourseId)?.CourseCode || "—"} · {row.SCode}</u>
                      </span>
                    ))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="print-summary">
          <span>عدد القاعات: <b>{new Set(matrix.lines.map((line: any) => line.room.key)).size}</b></span>
          <span>عدد المواعيد: <b>{matrix.total}</b></span>
        </div>
      </div>
    );
  }

  if (kind === "RoomLoad") {
    const dayLabel = roomDay === "week" ? "الأسبوع" : DAYS[roomDay].label;
    return (
      <div className="print-report print-occupancy print-wide">
        <PrintLetterhead title={titles[kind]} scope={[scopeLine, dayLabel].filter(Boolean).join(" · ")} college={collegeName} />
        <table>
          <thead>
            <tr>
              <th style={{ width: "16%" }}>القاعة</th>
              {(roomLoad?.slots || []).map((point: number) => (
                <th key={point} className="hour" dir="ltr">{String(Math.floor(point / 60)).padStart(2, "0")}</th>
              ))}
              <th style={{ width: "9%" }}>الإشغال</th>
            </tr>
          </thead>
          <tbody>
            {(roomLoad?.rooms || []).map((room: any) => (
              <tr key={room.key}>
                <td className="room">{room.name}</td>
                {room.cells.map((cell: any) => <td key={cell.point} className="cell" data-taken={cell.taken ? 1 : 0} />)}
                <td className="num">{room.rate}٪</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="print-summary">
          <span>عدد القاعات: <b>{roomLoad?.rooms?.length ?? 0}</b></span>
          <span>متوسط الإشغال: <b>{roomLoad?.totalRate ?? 0}٪</b></span>
          <span>المربع المعبأ = ساعة مشغولة، والفارغ = فراغ متاح للحجز.</span>
        </div>
      </div>
    );
  }

  if (kind === "WeekWithInstructor" || kind === "WeekWithInstructorByDept") {
    return (
      // Five day columns need the wide page; the default is portrait now.
      <div className="print-report print-wide">
        <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} />
        <table className="print-week">
          <colgroup>{DAYS.map(day => <col key={day.key} style={{ width: "20%" }} />)}</colgroup>
          <thead><tr>{DAYS.map(day => <th key={day.key}>{day.label}</th>)}</tr></thead>
          <tbody>
            <tr>
              {DAYS.map(day => (
                <td key={day.key}>
                  {rows.filter(row => (row as any)[day.flag])
                    .sort((a, b) => a.fstarttime.localeCompare(b.fstarttime))
                    .map(row => (
                      <span className="slot" key={`${day.key}-${row.id}`}>
                        <b>{courseById.get(row.AdCourseId)?.CourseCode || row.AdCourseName}</b>
                        <time dir="ltr">{row.fstarttime}–{row.fendtime}</time>
                        <time>{row.AdRoomCode}/{row.AdRoomHall}</time>
                      </span>
                    ))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <div className="print-summary"><span>عدد المواعيد: <b>{rows.length}</b></span></div>
      </div>
    );
  }

  if (kind === "ListofTeacherCourse" || kind === "TeacherWithCourse") {
    return (
      <div className="print-report print-wide">
        <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} />
        <table>
          <colgroup><col style={{ width: "4%" }} /><col style={{ width: "17%" }} /><col style={{ width: "10%" }} /><col /><col style={{ width: "9%" }} /><col style={{ width: "11%" }} /><col style={{ width: "16%" }} /><col style={{ width: "7%" }} /></colgroup>
          <thead><tr><th>م</th><th>الاسم</th><th>الرقم المدني</th><th>المقرر الدراسي</th><th>رمز المقرر</th><th>الوقت</th><th>الأيام</th><th>الوحدات</th></tr></thead>
          <tbody>{rows.map((row, index) => {
            const instructor = instructorById.get(row.AdInstructorId), course = courseById.get(row.AdCourseId);
            return (
              <tr key={row.id}>
                <td>{index + 1}</td><td>{instructor?.AdInstructorName || ""}</td><td dir="ltr">{instructor?.AdInstructorCivil || ""}</td>
                <td>{course?.CourseName || row.AdCourseName || ""}</td><td dir="ltr">{course?.CourseCode || ""}</td>
                <td dir="ltr">{row.fstarttime}-{row.fendtime}</td><td>{dayText(row)}</td><td className="num">{course?.CourseCredit ?? ""}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <div className="print-summary">
          <span>عدد الصفوف: <b>{rows.length}</b></span>
          <span>مجموع الساعات الأسبوعية: <b>{Math.round(totalHours / 60)}</b></span>
        </div>
        <div className="print-signatures">
          <div><span>منسق الجدول</span><i /></div>
          <div><span>رئيس القسم العلمي</span><i /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="print-report print-wide">
      <PrintLetterhead title={titles[kind]} scope={scopeLine} college={collegeName} />
      <table>
        <colgroup>
          <col style={{ width: "3%" }} /><col style={{ width: "6.5%" }} /><col style={{ width: "5%" }} /><col style={{ width: "16%" }} />
          <col style={{ width: "5.5%" }} /><col style={{ width: "5.5%" }} /><col style={{ width: "5%" }} />
          <col style={{ width: "9.5%" }} /><col style={{ width: "11%" }} /><col style={{ width: "7.5%" }} />
          <col style={{ width: "14%" }} /><col style={{ width: "11.5%" }} />
        </colgroup>
        <thead><tr>{["م", "رمز المقرر", "الشعبة", "المقرر", "وحدات", "ساعات", "سعة", "الوقت", "الأيام", "القاعة", "أستاذ المقرر", "الرقم المدني"].map(head => <th key={head}>{head}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => {
          const instructor = instructorById.get(row.AdInstructorId), course = courseById.get(row.AdCourseId);
          return (
            <tr key={row.id}>
              <td>{index + 1}</td><td dir="ltr">{course?.CourseCode || ""}</td><td dir="ltr">{row.SCode}</td>
              <td>{course?.CourseName || row.AdCourseName || ""}</td><td className="num">{course?.CourseCredit ?? ""}</td>
              <td className="num">{course?.CourseHours ?? ""}</td><td className="num">{course?.MaxStudent ?? ""}</td>
              <td dir="ltr">{row.fstarttime}-{row.fendtime}</td><td>{dayText(row)}</td>
              <td dir="ltr">{[row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/")}</td>
              <td>{instructor?.AdInstructorName || ""}</td><td dir="ltr">{instructor?.AdInstructorCivil || ""}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="print-summary">
        <span>عدد المواعيد: <b>{rows.length}</b></span>
        <span>مجموع الساعات الأسبوعية: <b>{Math.round(totalHours / 60)}</b></span>
      </div>
      <div className="print-signatures">
        <div><span>منسق الجدول</span><i /></div>
        <div><span>رئيس القسم العلمي</span><i /></div>
      </div>
    </div>
  );
}
