import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BrainCircuit,
  Building2,
  CalendarDays,
  ClipboardCheck,
  CheckCircle2,
  Clock3,
  Expand,
  Eye,
  Focus,
  GripVertical,
  History,
  Hourglass,
  Layers,
  LayoutList,
  Lightbulb,
  MapPin,
  MessageSquareText,
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
import SchedulePublish from "./SchedulePublish";
import ScheduleExperienceLayer, {
  useScheduleExperience,
} from "./ScheduleExperienceLayer";
import SchedulePhysicsLayer from "./SchedulePhysics/SchedulePhysicsLayer";
import ScheduleDecisionPreview from "./SchedulePhysics/ScheduleDecisionPreview";
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
import ScheduleReview from "./ScheduleReview";
import InstructorPicker from "./InstructorPicker";
import ScheduleTransfer from "./ScheduleTransfer";
import { adviseDayPattern, patternsForHours, type DayKey as RegDayKey, type WeeklyPattern } from "../utils/scheduleRegulations";
export type ScheduleMode = "schedule" | "copy";
interface Props {
  mode: ScheduleMode;
  user: any;
  scopes?: any[];
}
type EditorMode = "index" | "create" | "edit";
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
  const [editor, setEditor] = useState<EditorMode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [form, setForm] = useState(blank()),
    [courseName, setCourseName] = useState(""),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null),
    [saving, setSaving] = useState(false),
    [viewMode, setViewMode] = useState(
      savedPrefs.viewMode === "week" ? "week" : "list",
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
  const rippleTimer = useRef<number | undefined>(undefined),
    rippleKey = useRef("");
  const isPowerAdmin = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);
  const [filterCollege, setFilterCollege] = useState(
      Number(savedPrefs.filterCollege) || 0,
    ),
    [filterSection, setFilterSection] = useState(
      Number(savedPrefs.filterSection) || 0,
    ),
    [filterTerm, setFilterTerm] = useState(Number(savedPrefs.filterTerm) || 0),
    [visibleLimit, setVisibleLimit] = useState(120);
  const [copyCollege, setCopyCollege] = useState(0),
    [copySection, setCopySection] = useState(0),
    [copyFromTerm, setCopyFromTerm] = useState(0),
    [copyToTerm, setCopyToTerm] = useState(0),
    [copyPreview, setCopyPreview] = useState<any | null>(null),
    [copyUndoPoint, setCopyUndoPoint] = useState<any | null>(null),
    [previewing, setPreviewing] = useState(false);
  const [physicsPreview, setPhysicsPreview] =
      useState<SchedulePhysicsDropRequest | null>(null),
    [physicsNotice, setPhysicsNotice] = useState(""),
    [undoPoint, setUndoPoint] = useState<any>(null),
    [physicsField, setPhysicsField] = useState<Record<string, string>>({});
  const fetchJson = async (url: string, options?: RequestInit) => {
    if (options?.method && options.method !== "GET" && !navigator.onLine)
      throw new Error(
        "أنت الآن دون اتصال. العرض متاح، لكن الحفظ متوقف لحماية الجدول.",
      );
    const res = await fetch(url, options),
      data = await res.json();
    if (!res.ok) throw new Error(data.error || "تعذر تحميل البيانات");
    return data;
  };
  /**
   * The department's own courses, not the university's.
   *
   * Resolving a course id to a name needed the catalogue, and the catalogue was
   * fetched whole — fourteen hundred records to name the forty that belong to
   * the open department. Once a department is chosen its slice is fetched
   * instead, which is the same information at a fortieth of the weight.
   */
  useEffect(() => {
    if (!filterSection) return;
    let alive = true;
    // The department's own staff, not the university register.
    fetchJson(`/api/instructors?sectionId=${filterSection}&termId=${filterTerm || 0}`)
      .then((list: any[]) => {
        if (!alive || !Array.isArray(list) || !list.length) return;
        setInstructors(sortByName(list, (row: any) => row.AdInstructorName));
      })
      .catch(() => undefined);
    fetchJson(`/api/courses?sectionId=${filterSection}`)
      .then((list: any[]) => {
        if (!alive || !Array.isArray(list) || !list.length) return;
        setCourses(sortByName(list, (row: any) => row.CourseName));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [filterSection, filterTerm]);

  const loadLookups = async () => {
    const [c, s, rawTerms, co, i] = await Promise.all([
      fetchJson("/api/colleges"),
      fetchJson("/api/sections"),
      fetchJson("/api/terms"),
      fetchJson("/api/courses"),
      fetchJson("/api/instructors"),
    ]);
    const t = [...rawTerms].sort((a: AdTerm, b: AdTerm) => Number(b.AdTermId) - Number(a.AdTermId));
    setColleges(sortByName(c, (row:any)=>row.AdCollegeName));
    setSections(sortByName(s, (row:any)=>row.AdSectionName));
    setTerms(t);
    setCourses(sortByName(co, (row:any)=>row.CourseName));
    setInstructors(sortByName(i, (row:any)=>row.AdInstructorName));
    return { colleges: c as AdCollege[], sections: s as AdSection[], terms: t as AdTerm[], courses: co as AdCourse[], instructors: i as AdInstructor[] };
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
  const [lens, setLens] = useState<{ instructorId: number; building: string; hall: string; from: string; to: string }>(
    { instructorId: 0, building: "", hall: "", from: "", to: "" }
  );
  const lensActive = Boolean(lens.instructorId || lens.building || lens.hall || (lens.from && lens.to));
  const lensMatches = (row: FSchedule) => {
    if (!lensActive) return true;
    if (lens.instructorId && Number(row.AdInstructorId) !== lens.instructorId) return false;
    if (lens.building && String(row.AdRoomCode || "") !== lens.building) return false;
    if (lens.hall && String(row.AdRoomHall || "") !== lens.hall) return false;
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
    const map = new Map<string, Set<string>>();
    rows.forEach(row => {
      const code = String(row.AdRoomCode || "").trim();
      const hall = String(row.AdRoomHall || "").trim();
      if (!code || !hall) return;
      if (!map.has(code)) map.set(code, new Set());
      map.get(code)!.add(hall);
    });
    return map;
  }, [rows]);
  const buildingOptions = useMemo(() => [...estate.keys()].sort(byArabic), [estate]);
  const hallOptions = useMemo(() => {
    const code = String(form.AdRoomCode || "").trim();
    if (!code) return [] as string[];
    return [...(estate.get(code) || [])].sort(byArabic);
  }, [estate, form.AdRoomCode]);

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
   * One minute to change your mind.
   *
   * Every save here was final, which makes people hesitate before doing the
   * ordinary thing — and hesitation is what makes a tool feel heavy. The
   * inverse of the last change is kept for a minute: deleting what was created,
   * restoring what was edited, re-creating what was deleted. It is offered, not
   * imposed, and it expires on its own so it can never undo something the
   * person has long stopped thinking about.
   */
  const [undoAction, setUndoAction] = useState<{ label: string; run: () => Promise<void>; until: number } | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  useEffect(() => {
    if (!undoAction) return;
    const timer = window.setTimeout(() => setUndoAction(null), Math.max(0, undoAction.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undoAction]);
  const runUndo = async () => {
    if (!undoAction) return;
    setUndoBusy(true);
    try {
      await undoAction.run();
      await loadRows();
      setMessage("تم التراجع عن آخر تغيير");
      setUndoAction(null);
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setUndoBusy(false);
    }
  };
  const offerUndo = (label: string, run: () => Promise<void>) =>
    setUndoAction({ label, run, until: Date.now() + 60_000 });

  const [reviewOpen, setReviewOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  /** Appointments the review asked to see; they glow until something else happens. */
  const [reviewFocus, setReviewFocus] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!reviewFocus.size) return;
    const timer = window.setTimeout(() => setReviewFocus(new Set()), 20000);
    return () => window.clearTimeout(timer);
  }, [reviewFocus]);
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
  const loadRows = async () => {
    const p = new URLSearchParams();
    if (filterCollege) p.set("collegeId", String(filterCollege));
    if (filterSection) p.set("sectionId", String(filterSection));
    if (filterTerm) p.set("termId", String(filterTerm));
    const token = ++loadToken.current;
    setRowsLoading(true);
    try {
      const data = await fetchJson(`/api/schedules${p.size ? `?${p}` : ""}`);
      if (token === loadToken.current) setRows(data);
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
    setVisibleLimit(120);
    setCopyCollege(0);
    setCopySection(0);
    setCopyFromTerm(0);
    setCopyToTerm(0);
    setCopyPreview(null);
    setCopyUndoPoint(null);
    (async () => {
      try {
        const lookup = await loadLookups();
        let pref: any = {};
        try {
          pref = JSON.parse(localStorage.getItem(prefsKey) || "{}");
        } catch {}
        if (!lastSavedHydrated.current) {
          lastSavedHydrated.current = true;
          if (pref.lastSaved) lastSavedRef.current = pref.lastSaved;
        }
        const latestTermId = Number(lookup.terms[0]?.AdTermId || 0);
        const savedCollege = Number(pref.filterCollege) || 0;
        const savedSection = Number(pref.filterSection) || 0;
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
        if (mode === "schedule") {
          setFilterCollege(defaultCollege);
          setFilterSection(defaultSection);
          // A stale preference must never silently reopen a decade-old term.
          setFilterTerm(latestTermId);
          setViewMode(pref.viewMode === "week" ? "week" : "list");
          const qp = new URLSearchParams({ termId: String(latestTermId) });
          if (defaultCollege) qp.set("collegeId", String(defaultCollege));
          if (defaultSection) qp.set("sectionId", String(defaultSection));
          setRows(await fetchJson(`/api/schedules?${qp}`));
        } else if (mode === "copy") {
          setCopyCollege(defaultCollege);
          setCopySection(defaultSection);
          setCopyToTerm(latestTermId);
          setCopyFromTerm(Number(lookup.terms.find(term => term.AdTermId !== latestTermId)?.AdTermId || 0));
        }
      } catch (e: any) {
        setError(friendlyError(e));
      }
    })();
  }, [mode, user?.SystemUserId]);
  useEffect(() => {
    if (mode !== "schedule") return;
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
      }),
    );
    setVisibleLimit(120);
  }, [
    filterCollege,
    filterSection,
    filterTerm,
    viewMode,
    form.AdRoomCode,
    form.AdRoomHall,
    mode,
    prefsKey,
  ]);
  const formSections = useMemo(
      () =>
        sections.filter(
          (s) => !form.AdCollegeId || s.AdCollegeId === form.AdCollegeId,
        ),
      [sections, form.AdCollegeId],
    ),
    formCourses = useMemo(
      () => courses.filter((c) => c.AdSectionId === form.AdSectionId),
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
  const collegeById = new Map<number, AdCollege>(
      colleges.map((v) => [v.AdCollegeId, v] as const),
    ),
    courseById = new Map<number, AdCourse>(
      courses.map((v) => [v.AdCourseId, v] as const),
    ),
    instructorById = new Map<number, AdInstructor>(
      instructors.map((v) => [v.AdInstructorId, v] as const),
    ),
    selectedInstructor = instructorById.get(form.AdInstructorId);
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
  const openCreate = (seed?: { day?: DayKey; start?: string }) => {
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
        next.fendtime = timeFromMins(Math.min(23 * 60 + 30, mins(seed.start) + 60));
      }
      setForm(next);
      setCourseName("");
      setEditId(null);
      setEditor("create");
    },
    openEdit = (row: FSchedule) => {
      setError(null);
      setMessage(null);
      setConflicts([]);
      setSolutions([]);
      setEditId(row.id);
      const { id: _id, AdCourseName: name, ...values } = row;
      setForm(values);
      setCourseName(name || courseById.get(row.AdCourseId)?.CourseName || "");
      setEditor("edit");
    },
    back = () => {
      setEditor("index");
      setEditId(null);
      setError(null);
      setConflicts([]);
      setSolutions([]);
      setForm(blank());
      setCourseName("");
    };
  const setNumber = (key: keyof typeof form, raw: string) =>
    setForm((prev) => ({ ...prev, [key]: Number(raw) || 0 }));
  const englishDigits = (v: string) => /^\d*$/.test(v);
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
  const timeRangeInvalid = Boolean(form.fstarttime&&form.fendtime)&&mins(form.fendtime)<=mins(form.fstarttime);
  const validationIssues=[!selectedFormDays.length?"يجب اختيار يوم واحد على الأقل للمحاضرة.":"",timeRangeInvalid?"وقت النهاية يجب أن يكون بعد وقت البداية.":""].filter(Boolean);
  const blockingConflicts=conflicts.filter(c=>c?.severity==="high"||c?.type==="duplicate");
  const filteredRows=useMemo(()=>{const q=quickSearch.trim().toLowerCase();if(!q)return rows;return rows.filter(r=>{const c=courseById.get(r.AdCourseId),i=instructorById.get(r.AdInstructorId);return[r.AdCourseName,c?.CourseName,c?.CourseCode,r.SCode,i?.AdInstructorName,i?.AdInstructorCivil,r.AdRoomCode,r.AdRoomHall,arabicDays(r)].join(" ").toLowerCase().includes(q)})},[rows,quickSearch,courseById,instructorById]);
  /**
   * The shapes this course is allowed to take.
   *
   * Read from the course's own weekly hours, so the answer is about this course
   * and not about lectures in general. Applying one rewrites the days and the
   * end time together, which is the only way a move between day families can
   * leave the course still adding up to its credit hours.
   */
  const approvedPatterns = useMemo<WeeklyPattern[]>(() => {
    const course = courseById.get(Number(form.AdCourseId) || 0);
    const hours = Number(course?.CourseHours || course?.CourseCredit || 0);
    return hours ? patternsForHours(hours) : [];
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
      // Every meeting starts at the same hour (م.٨/٩); the first one sets the length.
      const start = next.fstarttime || "08:00";
      next.fstarttime = start;
      const [h, m] = start.split(":").map(Number);
      const total = Math.min(23 * 60 + 30, (h || 0) * 60 + (m || 0) + pattern.minutesPerDay[0]);
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
    () => [...new Set(filteredRows.map(row => String(row.AdRoomCode || "")).filter(Boolean))].sort(byArabic),
    [filteredRows]
  );
  const weekHalls = useMemo(
    () => [...new Set(filteredRows.filter(row => !lens.building || row.AdRoomCode === lens.building)
      .map(row => String(row.AdRoomHall || "")).filter(Boolean))].sort(byArabic),
    [filteredRows, lens.building]
  );
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
          if (e?.name !== "AbortError") { setConflicts([]); setError(friendlyError(e)); }
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
        body: JSON.stringify({ ...form }),
      });
      if (editor === "edit" && before) {
        const { id: _id, AdCourseName: _name, ...previousValues } = before as any;
        offerUndo("تراجع عن التعديل", async () => {
          await fetchJson(`/api/schedules/${editId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(previousValues),
          });
        });
      } else if (editor !== "edit") {
        const createdId = Number(saved?.id || 0);
        if (createdId) {
          offerUndo("تراجع عن الإضافة", async () => {
            await fetchJson(`/api/schedules/${createdId}`, { method: "DELETE" });
          });
        }
      }
      rememberSave(form);
      markChanged(editor === "edit" ? editId : null);
      // Follow the save: the list jumps to the scope the row was filed under so
      // the user always sees what they just did.
      if (form.AdCollegeId && form.AdCollegeId !== filterCollege) setFilterCollege(form.AdCollegeId);
      if (form.AdSectionId && form.AdSectionId !== filterSection) setFilterSection(form.AdSectionId);
      if (form.AdTermId && form.AdTermId !== filterTerm) setFilterTerm(form.AdTermId);
      await loadRows();
      setMessage(editor === "edit" ? "تم حفظ التعديل" : "تم حفظ الموعد");
      back();
    } catch (e: any) {
      setError(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    if (!window.confirm("هل أنت متأكد من حذف بيانات المقرر الدراسي؟")) return;
    setError(null);
    try {
      const before = rows.find((row) => row.id === id);
      await fetchJson(`/api/schedules/${id}`, { method: "DELETE" });
      if (before) {
        const { id: _id, AdCourseName: _name, ...values } = before as any;
        offerUndo("تراجع عن الحذف", async () => {
          await fetchJson("/api/schedules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values),
          });
        });
      }
      await loadRows();
    } catch (e: any) {
      setError(friendlyError(e));
    }
  };
  useEffect(() => {
    if (mode !== "schedule" || rowsLoading || rows.length || !filterTerm) { setEmptyElsewhere([]); return; }
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
    if (mode !== "schedule") return;
    const timer = window.setTimeout(() => {
      setError(null);
      loadRows().catch((error: any) => setError(friendlyError(error)));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [mode, filterCollege, filterSection, filterTerm]);
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
      setMessage(`تم نسخ ${data.count ?? 0} سجل بنجاح`);
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
      if(blocking.length){const reasons=blocking.slice(0,3).map((c:any)=>[c?.message,c?.detail].filter(Boolean).join(" — ")).filter(Boolean);const reason=reasons.join(" | ")||"هذا النقل يسبب تعارضاً ولا يمكن حفظه.";setError(`تعذر نقل الموعد: ${reason}`);setPhysicsPreview(null);setPhysicsNotice(`رفض النقل: ${reason}`);return;}
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
      setPhysicsPreview(null);
      setPhysicsNotice("استقر القرار بعد الحفظ عبر مسار التعديل الحالي.");
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
  const undoPhysicsDecision = async () => {
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
   * The grid shows the hours that are actually used.
   *
   * A fixed 07:00–21:00 column meant a department that teaches until noon was
   * reading its week through eight empty rows and a scrollbar. The window now
   * follows the data, snapped outward to the half hour with one empty slot of
   * air at each end, and never collapses below four hours.
   */
  const gridWindow = useMemo(() => {
    const starts = weekRows.map(row => mins(row.fstarttime)).filter(value => Number.isFinite(value));
    const ends = weekRows.map(row => mins(row.fendtime)).filter(value => Number.isFinite(value));
    if (!starts.length || !ends.length) return { start: 8 * 60, end: 15 * 60 };
    const start = Math.max(7 * 60, Math.floor(Math.min(...starts) / 30) * 30 - 30);
    const end = Math.min(22 * 60, Math.ceil(Math.max(...ends) / 30) * 30 + 30);
    return { start, end: Math.max(end, start + 4 * 60) };
  }, [weekRows]);
  const timeSlots = useMemo(
    () => Array.from({ length: Math.max(2, Math.round((gridWindow.end - gridWindow.start) / 30)) }, (_, i) =>
      timeFromMins(gridWindow.start + i * 30),
    ),
    [gridWindow],
  );
  const [expandedDay, setExpandedDay] = useState<DayKey | null>(null);

  /**
   * Week layout, per collision cluster rather than per day.
   *
   * A quiet hour with one lecture should use the whole column; a busy hour with
   * four should not shrink the whole day to slivers. So overlapping appointments
   * are grouped into clusters and laid out independently:
   *
   *   1–2 in a cluster  → normal cards side by side, full readable width
   *   3 or more         → one grouped block listing them as compact rows
   *
   * Nothing is hidden and nothing is crushed. Opening a day (its header) widens
   * it to the full grid, where even a six-way collision sits side by side.
   */
  const STACK_THRESHOLD = 3;
  const weekLayout = useMemo(() => {
    const layout: Record<string, {
      laneCount: number;
      clusters: Array<{
        top: number; height: number; items: FSchedule[]; lanes: Map<number, number>; laneCount: number;
      }>;
    }> = {};

    for (const day of days) {
      const items = weekRows
        .filter((item) => Boolean(item[day.key]))
        .slice()
        .sort((a, b) => mins(a.fstarttime) - mins(b.fstarttime) || mins(a.fendtime) - mins(b.fendtime));

      const clusters: FSchedule[][] = [];
      let current: FSchedule[] = [];
      let currentEnd = -1;
      for (const item of items) {
        if (current.length && mins(item.fstarttime) >= currentEnd) {
          clusters.push(current);
          current = [];
          currentEnd = -1;
        }
        current.push(item);
        currentEnd = Math.max(currentEnd, mins(item.fendtime));
      }
      if (current.length) clusters.push(current);

      let dayLaneCount = 1;
      layout[day.key] = {
        laneCount: 1,
        clusters: clusters.map((group) => {
          const laneEnds: number[] = [];
          const lanes = new Map<number, number>();
          for (const item of group) {
            const startAt = mins(item.fstarttime);
            let lane = laneEnds.findIndex((endAt) => endAt <= startAt);
            if (lane < 0) { lane = laneEnds.length; laneEnds.push(0); }
            laneEnds[lane] = mins(item.fendtime);
            lanes.set(item.id, lane);
          }
          const laneCount = Math.max(1, laneEnds.length);
          dayLaneCount = Math.max(dayLaneCount, laneCount);
          const top = ((mins(group[0].fstarttime) - gridWindow.start) / 30) * 36;
          const endAt = Math.max(...group.map((item) => mins(item.fendtime)));
          const height = Math.max(34, ((endAt - mins(group[0].fstarttime)) / 30) * 36 - 3);
          return { top, height, items: group, lanes, laneCount };
        })
      };
      layout[day.key].laneCount = dayLaneCount;
    }
    return layout;
  }, [weekRows, gridWindow]);

  /** A single week card. Shared by ordinary hours and by opened days. */
  const renderWeekCard = (r: FSchedule, d: { key: DayKey; label: string }, style: React.CSSProperties) => {
    const c = courseById.get(r.AdCourseId);
    const i = instructorById.get(r.AdInstructorId);
    const code = c?.CourseCode || r.AdCourseName || "—";
    return (
      <article
        {...physics.bindEvent(r, d.key)}
        draggable={!saving && !physics.supported}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/schedule-id", String(r.id));
          e.dataTransfer.effectAllowed = "move";
          beginRipple(r);
        }}
        onDragEnd={clearRipple}
        onPointerDown={(e) => { pressOrigin.current = { x: e.clientX, y: e.clientY }; }}
        onClick={(e) => {
          // A drag ends in a click too; only a press that stayed put means "open".
          const from = pressOrigin.current;
          if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) return;
          openEdit(r);
        }}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") openEdit(r); }}
        className={`week-event ${lensClass(r)} ${xrayClass(r)} ${physicsRelationClass(r)} ${draggingId === r.id ? "ripple-source" : ""} ${physicsActive && physicsOrigin?.id === r.id ? "physics-source-lift" : ""} ${physicsPreview?.row.id === r.id ? "physics-source-pending" : ""} ${justChangedId === r.id ? "just-changed" : ""} ${reviewFocus.has(r.id) ? "review-flagged" : ""}`}
        style={{ ...style, ["--hue" as any]: courseHue(code) }}
        data-quickview={`${code} · ${r.AdCourseName || c?.CourseName || "مقرر"}
شعبة ${r.SCode} · ${i?.AdInstructorName || "بدون أستاذ"}
${arabicDays(r) || "بدون أيام"} · ${r.fstarttime}-${r.fendtime}
${r.AdRoomCode || "—"}/${r.AdRoomHall || "—"}`}
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
        <strong>{code}</strong>
        <span>{r.AdCourseName || c?.CourseName}</span>
        <small dir="ltr">{r.fstarttime}-{r.fendtime}</small>
        <small>{i?.AdInstructorName} · {r.AdRoomCode}/{r.AdRoomHall}</small>
      </article>
    );
  };

  /**
   * Colour as information.
   *
   * Every course keeps the same hue everywhere it appears, derived from its
   * code, so the eye can trace one course across five days without reading a
   * single word — and five concurrent lectures separate instantly. Red is never
   * assigned; it stays reserved for conflicts.
   */
  const COURSE_HUES = [158, 200, 262, 320, 38, 96, 178, 226, 288, 18];
  const courseHue = (code: string) => {
    let hash = 0;
    const text = String(code || "");
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    return COURSE_HUES[hash % COURSE_HUES.length];
  };

  /** Position inside a cluster. Expanded days always lay every lane side by side. */
  const clusterLaneStyle = (cluster: { lanes: Map<number, number>; laneCount: number }, row: FSchedule): React.CSSProperties => {
    if (cluster.laneCount <= 1) return {};
    const lane = cluster.lanes.get(row.id) || 0;
    const width = 100 / cluster.laneCount;
    return {
      insetInlineStart: `calc(${lane * width}% + 4px)`,
      insetInlineEnd: "auto",
      width: `calc(${width}% - 8px)`,
      zIndex: 20 + lane,
    };
  };

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
    if (
      r.AdRoomCode === xraySelected.AdRoomCode &&
      r.AdRoomHall === xraySelected.AdRoomHall
    )
      rel.push("room");
    if (xraySharedDay(r, xraySelected)) rel.push("day");
    if (xrayTimeConnected(r, xraySelected)) rel.push("time");
    return rel.length
      ? `xray-related ${rel.map((x) => `xray-${x}`).join(" ")}`
      : "xray-dim";
  };
  const physics = useSchedulePhysics({
    disabled:
      mode !== "schedule" ||
      editor !== "index" ||
      viewMode !== "week" ||
      saving ||
      presentationMode,
    evaluateTarget: evaluatePhysicsTarget,
    onStart: (row) => {
      setPhysicsPreview(null);
      setPhysicsNotice("");
      setPhysicsField({});
      beginRipple(row);
    },
    onDecision: (decision, target) => {
      if (!target || !decision) return;
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
      if (isSamePlacement(request.row, request.sourceDay, request.target)) {
        setPhysicsNotice("لم يتغير الموضع؛ عاد الموعد إلى مكانه دون حفظ.");
        setPhysicsField({});
        return;
      }
      setPhysicsPreview(request);
      setPhysicsNotice("الموضع الجديد Preview فقط — لم يتم حفظ أي تغيير.");
    },
    onCancel: () => {
      clearRipple();
      setPhysicsField({});
      setPhysicsNotice("تم إلغاء السحب دون حفظ أي تغيير.");
    },
    onInvalid: (decision) => {
      clearRipple();
      setPhysicsField({});
      const details = (decision?.reasons || []).slice(0, 3).join(" — ");
      const reason = details || decision?.summary || "هذا الموضع غير متاح وفق قواعد الجدول.";
      setError(`تعذر النقل: ${reason}`);
      setPhysicsNotice(`رفض النقل: ${reason}`);
    },
  });
  const physicsOrigin = physics.state.row;
  const physicsActive = Boolean(
    physicsOrigin &&
    physics.state.phase !== "idle" &&
    physics.state.phase !== "armed",
  );
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
  const dragSuggestions = useMemo(() => {
    const carried = physics.state.row;
    if (!carried || physics.state.phase === "idle") return [] as Array<{ day: DayKey; start: string; score: number }>;
    const span = Math.max(30, mins(carried.fendtime) - mins(carried.fstarttime));
    const instructorRows = weekRows.filter(row => row.id !== carried.id && row.AdInstructorId === carried.AdInstructorId);
    const hallRows = weekRows.filter(row => row.id !== carried.id && row.AdRoomCode === carried.AdRoomCode && row.AdRoomHall === carried.AdRoomHall);
    const out: Array<{ day: DayKey; start: string; score: number }> = [];
    for (const day of days) {
      for (const slot of timeSlots) {
        const from = mins(slot);
        const to = from + span;
        if (to > gridWindow.end) continue;
        const busy = (list: FSchedule[]) => list.some(row =>
          (row as any)[day.key] && mins(row.fstarttime) < to && mins(row.fendtime) > from);
        if (busy(instructorRows) || busy(hallRows)) continue;
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
        out.push({ day: day.key as DayKey, start: slot, score });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [physics.state.row, physics.state.phase, weekRows, timeSlots, gridWindow]);
  const suggestionRank = useMemo(() => {
    const map = new Map<string, number>();
    dragSuggestions.forEach((item, index) => map.set(`${item.day}:${item.start}`, index + 1));
    return map;
  }, [dragSuggestions]);

  const physicsSlotClass = (day: DayKey, start: string) => {
    const key = `${day}:${start}`;
    const rank = suggestionRank.get(key);
    const sampled = physicsField[key];
    const active =
      physics.state.target?.day === day &&
      physics.state.target?.start === start;
    const quality = active
      ? physics.state.decision?.quality || sampled || "unknown"
      : sampled || "";
    return `${active ? `physics-target physics-${quality}` : ""} ${sampled ? `gravity-slot gravity-${sampled}` : ""} ${rank ? `suggested-slot suggested-${rank}` : ""}`.trim();
  };
  const pendingCandidate = physicsPreview
    ? buildMoveCandidate(physicsPreview.row, physicsPreview.target)
    : null;
  const confirmPhysicsPreview = async () => {
    if (!physicsPreview) return;
    await moveSchedule(
      physicsPreview.row,
      physicsPreview.target.day as DayKey,
      physicsPreview.target.start,
      { skipConfirm: true, decision: physicsPreview.decision },
    );
  };
  /**
   * Which rows collide with another row in the same scope. Two appointments
   * collide when they share a weekday, overlap in time, and reuse either the
   * same instructor or the same room. Computed once per result set so the
   * presentation board can highlight only what matters.
   */
  const conflictIds = useMemo(() => {
    const flagged = new Set<number>();
    const list = filteredRows;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const sharesDay = days.some(day => Boolean(a[day.key]) && Boolean(b[day.key]));
        if (!sharesDay) continue;
        if (mins(a.fstarttime) >= mins(b.fendtime) || mins(b.fstarttime) >= mins(a.fendtime)) continue;
        const sameInstructor = a.AdInstructorId && a.AdInstructorId === b.AdInstructorId;
        const sameRoom = a.AdRoomCode && a.AdRoomCode === b.AdRoomCode && a.AdRoomHall === b.AdRoomHall;
        if (sameInstructor || sameRoom) { flagged.add(a.id); flagged.add(b.id); }
      }
    }
    return flagged;
  }, [filteredRows]);

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
            · {rows.length.toLocaleString("ar-KW-u-nu-latn")} موعد
          </p>
        </div>
        <div className="cinema-tools">
          <button
            type="button"
            className={presentConflictsOnly ? "active" : ""}
            onClick={() => setPresentConflictsOnly(v => !v)}
            title="التعارضات فقط"
          >
            <AlertTriangle />
            <b>{conflictIds.size}</b>
          </button>
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
                          <b>{r.fstarttime}</b><span>–</span><small>{r.fendtime}</small>
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
                  onChange={(e) => setCopyToTerm(Number(e.target.value) || 0)}
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
                          وفق السلوك الأصلي لن يتم النسخ فوق جدول موجود.
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div className="preview-list">
                    {copyPreview.preview.map((x: any) => (
                      <article key={x.id}>
                        <span className="code-chip">{x.courseCode}</span>
                        <div>
                          <strong>{x.courseName}</strong>
                          <small>
                            {x.instructorName} · شعبة {x.sectionCode}
                          </small>
                        </div>
                        <span dir="ltr">{x.time}</span>
                        <span>{x.room}</span>
                      </article>
                    ))}
                  </div>
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
            {scheduleTouched&&validationIssues.length?<div className="editor-validation-strip"><AlertTriangle/><div><strong>صحّح قبل الحفظ</strong>{validationIssues.map(x=><span key={x}>{x}</span>)}</div></div>:null}
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
                  hint={editId ? undefined : sectionHint}
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
                  />
                  {form.AdInstructorId ? (
                    <span className="field-hint" dir="ltr">
                      {selectedInstructor?.AdInstructorCivil || "0"}
                    </span>
                  ) : null}
                </Field>
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
                              // the lecture, so the end time follows (م.٨/أ،ب).
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
                                <time dir="ltr">{slot.start}–{slot.end}</time>
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
                        ? `${form.fstarttime}–${form.fendtime}`
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
                        ? `${conflicts.length} ملاحظة`
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
                <strong>مساعد التعارضات</strong>
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
                <strong>لا يوجد تعارض ظاهر</strong>
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
                  {solving ? "أبحث عن البدائل..." : "حل التعارض"}
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
                            {x.start}–{x.end}
                          </strong>
                          <small>
                            مبنى {x.roomCode} · قاعة {x.roomHall}
                          </small>
                        </div>
                        <Badge tone={x.conflicts ? "warning" : "success"}>
                          {x.label}
                        </Badge>
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
  return (
    <div className="content-stack schedule-page">
      <PageTitle
        eyebrow="مركز الجدول"
        subtitle="نطاق · مراجعة · نشر"
        action={<AddButton onClick={openCreate}>إضافة موعد</AddButton>}
      >
        الجدول الدراسي
      </PageTitle>
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
        <div className="schedule-tools">
          <Segmented
            value={viewMode}
            onChange={setViewMode}
            options={[
              {
                value: "list",
                label: (
                  <>
                    <LayoutList /> قائمة
                  </>
                ),
              },
              {
                value: "week",
                label: (
                  <>
                    <CalendarDays /> أسبوع
                  </>
                ),
              },
            ]}
          />
          <label className="schedule-quick-search"><Search/><input value={quickSearch} onChange={e=>setQuickSearch(e.target.value)} placeholder="بحث سريع: مقرر، أستاذ، شعبة، قاعة..."/>{quickSearch?<button type="button" onClick={()=>setQuickSearch("")}>×</button>:null}</label>
          <div className="schedule-tool-actions">
            <GhostButton
              type="button"
              onClick={() => {
                setFocusMode(!focusMode);
                setPresentationMode(false);
                if (!focusMode) setViewMode("week");
              }}
            >
              <Focus /> {focusMode ? "إنهاء التركيز" : "تركيز"}
            </GhostButton>
            <GhostButton
              type="button"
              onClick={() => {
                setPresentationMode(!presentationMode);
                setFocusMode(false);
                if (!presentationMode) setViewMode("week");
              }}
            >
              <Expand /> {presentationMode ? "إنهاء العرض" : "عرض"}
            </GhostButton>
            <GhostButton type="button" onClick={() => setReviewOpen(true)} title="فحص الجدول كاملاً قبل الاعتماد">
              <ClipboardCheck /> الاعتماد
            </GhostButton>
            {isPowerAdmin ? (
              <GhostButton type="button" onClick={() => setTransferOpen(true)} title="استيراد وتصدير واستبدال أستاذ">
                <ArrowLeftRight /> نقل
              </GhostButton>
            ) : null}
            {isPowerAdmin ? (
              <SchedulePublish
                collegeId={filterCollege}
                sectionId={filterSection}
                termId={filterTerm}
                scopeLabel={sections.find((x) => x.AdSectionId === filterSection)?.AdSectionName}
              />
            ) : null}
          </div>
        </div>
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
                  rows.filter(
                    (r) =>
                      r.AdRoomCode === xraySelected.AdRoomCode &&
                      r.AdRoomHall === xraySelected.AdRoomHall,
                  ).length
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
      />
      {presentationMode ? (
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
                    className={`agenda-card ${xrayClass(s)} ${justChangedId === s.id ? "just-changed" : ""}`}
                    key={s.id}
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
                        {s.fstarttime}–{s.fendtime}
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
              <SecondaryButton onClick={() => setVisibleLimit((v) => v + 120)}>
                عرض المزيد ·{" "}
                {Math.min(120, filteredRows.length - visibleLimit).toLocaleString(
                  "ar-KW-u-nu-latn",
                )}
              </SecondaryButton>
            </div>
          ) : null}
        </Surface>
      ) : (
        <>
          <Surface
            className={`week-surface ${physicsActive ? "physics-lens-active" : ""} ${physicsPreview ? "physics-preview-active" : ""}`}
          >
            {/* One question at a time, asked of the whole week. */}
            <div className={`week-lens ${lensActive ? "active" : ""}`}>
              <Field label="أستاذ">
                <select value={lens.instructorId || ""} onChange={(e) => setLens(v => ({ ...v, instructorId: Number(e.target.value) || 0 }))}>
                  <option value="">الكل</option>
                  {weekInstructors.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </Field>
              <Field label="المبنى">
                <select value={lens.building} onChange={(e) => setLens(v => ({ ...v, building: e.target.value, hall: "" }))}>
                  <option value="">الكل</option>
                  {weekBuildings.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="القاعة">
                <select value={lens.hall} onChange={(e) => setLens(v => ({ ...v, hall: e.target.value }))}>
                  <option value="">الكل</option>
                  {weekHalls.map(x => <option key={x} value={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="الفترة">
                <div className="time-pair">
                  <input type="time" value={lens.from} onChange={(e) => setLens(v => ({ ...v, from: e.target.value }))} aria-label="من" />
                  <input type="time" value={lens.to} onChange={(e) => setLens(v => ({ ...v, to: e.target.value }))} aria-label="إلى" />
                </div>
              </Field>
              {lensActive ? (
                <button type="button" className="week-lens-clear" onClick={() => setLens({ instructorId: 0, building: "", hall: "", from: "", to: "" })}>
                  <X aria-hidden="true" />
                  <b>{weekLensCount.toLocaleString("ar-KW-u-nu-latn")}</b>
                </button>
              ) : null}
            </div>
            <div
              className={`week-note ${physicsActive ? "gravity-note-active" : ""}`}
            >
              <GripVertical />
              {isPowerAdmin
                ? "اسحب الموعد؛ الجاذبية الهادئة، التوتر، والأثر اللاحق تظهر فوق الجدول قبل أي حفظ."
                : "اسحب الموعد؛ سيظهر لك مباشرة إن كان الموضع ممتازًا أو يحتاج مراجعة، دون تغيير أي شيء حتى تؤكد."}
            </div>
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
                        {ripple.candidate.start}–{ripple.candidate.end}
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
            <div
              className={`week-calendar ${physicsActive ? "gravity-field-active" : ""}`}
              data-expanded={expandedDay || undefined}
            >
              <div className="week-time-head" />
              {days.map((d) => (
                <div
                  className={`week-day-head ${physics.state.target?.day === d.key ? `physics-day-target physics-${physics.state.decision?.quality || "unknown"}` : ""} ${physics.state.target?.day === d.key && physics.state.decision?.stress ? `stress-${physics.state.decision.stress.level}` : ""}`}
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
                    {weekLayout[d.key]?.laneCount > 1 ? (
                      <b>{weekLayout[d.key].laneCount}</b>
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
              </div>
              {days.map((d) => {
                const pending =
                  pendingCandidate && Boolean(pendingCandidate[d.key])
                    ? pendingCandidate
                    : null;
                return (
                  <div
                    className={`week-day ${expandedDay && expandedDay !== d.key ? "week-day-collapsed" : ""}`}
                    data-physics-day-column="true"
                    data-lanes={weekLayout[d.key]?.laneCount || 1}
                    key={d.key}
                  >
                    {timeSlots.map((t) => (
                      <div
                        data-physics-slot="true"
                        data-physics-day={d.key}
                        data-physics-start={t}
                        data-physics-label={d.label}
                        className={`week-slot ${ripple?.targetDay === d.key && ripple?.targetStart === t ? "ripple-target" : ""} ${physicsSlotClass(d.key, t)}`}
                        key={t}
                        onDragOver={(e) => e.preventDefault()}
                        role="button"
                        tabIndex={-1}
                        title={`إضافة موعد · ${d.label} ${t}`}
                        onClick={(e) => {
                          // Only a press on the empty square itself; a press that
                          // landed on a lecture belongs to that lecture.
                          if (e.target !== e.currentTarget) return;
                          openCreate({ day: d.key, start: t });
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
                            if (sourceDay === d.key && row.fstarttime === t) {
                              setPhysicsNotice("لم يتغير الموضع؛ عاد الموعد إلى مكانه دون حفظ.");
                            } else {
                              setPhysicsPreview({ row, sourceDay, target: { day: d.key, start: t, label: d.label }, decision: null });
                              setPhysicsNotice("الموضع الجديد بلون مختلف — معاينة فقط، ولن يُحفظ حتى تضغط اعتماد النقل.");
                            }
                          }
                          window.setTimeout(clearRipple, 0);
                        }}
                      />
                    ))}
                    {experience.ghostEnabled
                      ? experience.ghostRows
                          .filter((r) => Boolean(r[d.key]))
                          .map((r) => {
                            const top =
                                ((mins(r.fstarttime) - gridWindow.start) / 30) * 36,
                              height = Math.max(
                                34,
                                ((mins(r.fendtime) - mins(r.fstarttime)) / 30) *
                                  36 -
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
                                  {r.fstarttime}-{r.fendtime}
                                </small>
                                <small>
                                  {i?.AdInstructorName} · {r.AdRoomCode}/
                                  {r.AdRoomHall}
                                </small>
                              </article>
                            );
                          })
                      : null}
                    {(weekLayout[d.key]?.clusters || []).map((cluster) => {
                      const grouped = cluster.items.length >= STACK_THRESHOLD && expandedDay !== d.key;
                      if (!grouped) {
                        return cluster.items.map((r) => {
                          const top = ((mins(r.fstarttime) - gridWindow.start) / 30) * 36;
                          const height = Math.max(34, ((mins(r.fendtime) - mins(r.fstarttime)) / 30) * 36 - 3);
                          return renderWeekCard(r, d, { top, height, ...clusterLaneStyle(cluster, r) });
                        });
                      }
                      // Three or more at the same hour read better as one block
                      // of colour-coded rows than as four unreadable slivers.
                      const endAt = Math.max(...cluster.items.map((item) => mins(item.fendtime)));
                      return (
                        <div
                          className="week-cluster"
                          key={`cluster-${d.key}-${cluster.top}`}
                          style={{ top: cluster.top, height: cluster.height }}
                        >
                          <header>
                            <time dir="ltr">{cluster.items[0].fstarttime}–{timeFromMins(endAt)}</time>
                            <button
                              type="button"
                              onClick={() => setExpandedDay(d.key)}
                              title="افتح اليوم بعرض كامل"
                            >
                              {cluster.items.length}
                            </button>
                          </header>
                          <div className="week-cluster-rows">
                            {cluster.items.map((r) => {
                              const c = courseById.get(r.AdCourseId);
                              const i = instructorById.get(r.AdInstructorId);
                              const code = c?.CourseCode || r.AdCourseName || "—";
                              return (
                                <article
                                  {...physics.bindEvent(r, d.key)}
                                  key={`chip-${d.key}-${r.id}`}
                                  className={`week-chip ${lensClass(r)} ${xrayClass(r)} ${physicsRelationClass(r)} ${draggingId === r.id ? "ripple-source" : ""} ${justChangedId === r.id ? "just-changed" : ""} ${reviewFocus.has(r.id) ? "review-flagged" : ""}`}
                                  style={{ ["--hue" as any]: courseHue(code) }}
                                  draggable={!saving && !physics.supported}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData("text/schedule-id", String(r.id));
                                    e.dataTransfer.effectAllowed = "move";
                                    beginRipple(r);
                                  }}
                                  onDragEnd={clearRipple}
                                  onPointerDown={(e) => { pressOrigin.current = { x: e.clientX, y: e.clientY }; }}
                                  onClick={(e) => {
                                    const from = pressOrigin.current;
                                    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) > 6) return;
                                    openEdit(r);
                                  }}
                                  tabIndex={0}
                                  onKeyDown={(e) => { if (e.key === "Enter") openEdit(r); }}
                                  data-quickview={`${code} · ${r.AdCourseName || c?.CourseName || "مقرر"}
شعبة ${r.SCode} · ${i?.AdInstructorName || "بدون أستاذ"}
${arabicDays(r) || "بدون أيام"} · ${r.fstarttime}-${r.fendtime}
${r.AdRoomCode || "—"}/${r.AdRoomHall || "—"}`}
                                >
                                  <b dir="ltr">{code}</b>
                                  <span>{r.AdRoomCode || "—"}</span>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {pending
                      ? (() => {
                          const top =
                              ((mins(pending.fstarttime) - gridWindow.start) / 30) * 36,
                            height = Math.max(
                              34,
                              ((mins(pending.fendtime) -
                                mins(pending.fstarttime)) /
                                30) *
                                36 -
                                3,
                            ),
                            c = courseById.get(pending.AdCourseId),
                            i = instructorById.get(pending.AdInstructorId);
                          return (
                            <article
                              className={`week-event physics-pending-card quality-${physicsPreview?.decision?.quality || "unknown"}`}
                              style={{ top, height }}
                              aria-label="معاينة الموضع الجديد"
                            >
                              <span className="physics-pending-mark">
                                غير معتمد
                              </span>
                              <strong>
                                {c?.CourseCode || pending.AdCourseName}
                              </strong>
                              <span>
                                {pending.AdCourseName || c?.CourseName}
                              </span>
                              <small dir="ltr">
                                {pending.fstarttime}-{pending.fendtime}
                              </small>
                              <small>
                                {i?.AdInstructorName} · {pending.AdRoomCode}/
                                {pending.AdRoomHall}
                              </small>
                            </article>
                          );
                        })()
                      : null}
                  </div>
                );
              })}
            </div>
          </Surface>
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
          {physicsPreview ? (
            <ScheduleDecisionPreview
              request={physicsPreview}
              course={courseById.get(physicsPreview.row.AdCourseId)}
              instructor={instructorById.get(physicsPreview.row.AdInstructorId)}
              busy={saving}
              isPowerAdmin={isPowerAdmin}
              onConfirm={() => void confirmPhysicsPreview()}
              onCancel={() => {
                setPhysicsPreview(null);
                setPhysicsField({});
                setPhysicsNotice(
                  "تم إلغاء المعاينة؛ بقي الموعد في مكانه الأصلي دون حفظ.",
                );
              }}
            />
          ) : null}
        </>
      )}
      {undoAction ? (
        <div className="undo-bar no-print" role="status">
          <History aria-hidden="true" />
          <span>{undoAction.label}</span>
          <button type="button" onClick={runUndo} disabled={undoBusy}>{undoBusy ? "يتراجع…" : "تراجع"}</button>
          <button type="button" className="undo-dismiss" onClick={() => setUndoAction(null)} aria-label="إخفاء"><X /></button>
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
      {reviewOpen ? (
        <ScheduleReview
          rows={filteredRows}
          courses={courseById}
          instructors={instructorById}
          previousRows={previousTermRows}
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
      <div className="print-only schedule-print">
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
                <td>
                  {courseById.get(s.AdCourseId)?.CourseCode} — {s.AdCourseName}
                </td>
                <td>{s.SCode}</td>
                <td>
                  {instructorById.get(s.AdInstructorId)?.AdInstructorName}
                </td>
                <td>{arabicDays(s)}</td>
                <td dir="ltr">
                  {s.fstarttime} - {s.fendtime}
                </td>
                <td>
                  {s.AdRoomCode}/{s.AdRoomHall}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
            <button
              className="drawer-close"
              type="button"
              aria-label="إغلاق سياق الموعد"
              title="إغلاق سياق الموعد"
              onClick={() => setContext(null)}
            >
              <X />
            </button>
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
                    <small>{replay.coverage?.note}</small>
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
                <div className="replay-line">
                  {replay.events?.length ? (
                    replay.events.map((event: any, i: number) => (
                      <article
                        className={event.tone || "neutral"}
                        key={`${event.timestamp}-${i}`}
                      >
                        <time>
                          {new Date(event.timestamp).toLocaleString("ar-KW-u-nu-latn")}
                        </time>
                        <i />
                        <div>
                          <strong>{event.title}</strong>
                          <p>{event.detail}</p>
                          <small>{event.actor}</small>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="replay-empty">
                      لا توجد آثار زمنية كافية لهذا الموعد بعد.
                    </p>
                  )}
                </div>
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
                      ? "حل التعارض يحسن القرار"
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
                    {r.fstarttime}–{r.fendtime}
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
                      <strong dir="ltr">
                        {x.start}–{x.end}
                      </strong>
                      <small>
                        {x.roomCode}/{x.roomHall}
                      </small>
                      <Badge tone={x.conflicts ? "warning" : "success"}>
                        {x.label}
                      </Badge>
                    </button>
                  ))}
                </div>
                <p>
                  اختيار البديل يفتح نموذج التعديل معبأً فقط؛ لن يُحفظ شيء قبل
                  ضغط «موافق».
                </p>
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
