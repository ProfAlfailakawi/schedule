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
import { adviseDayPattern, patternsForHours, patternsForHoursOnDay, type DayKey as RegDayKey, type WeeklyPattern } from "../utils/scheduleRegulations";
import type { CourseNature } from "../utils/courseNature";
import { courseLabel, instructorLabel } from "../utils/courseLabel";
export type ScheduleMode = "schedule" | "copy";
interface Props {
  mode: ScheduleMode;
  user: any;
  scopes?: any[];
}
type EditorMode = "index" | "create" | "edit";

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

/**
 * The detail card, painted on the window rather than inside the grid.
 *
 * It opens above the lecture it describes and then measures itself: if it would
 * cross the top of the window it flips below, and if it would cross either side
 * it slides back in. Nothing it says can be clipped by a column, which was the
 * entire failure of the version it replaces.
 */
function WeekPeek({ anchor, title, who, code, section, days: dayText, from, to, room }: {
  anchor: { x: number; y: number };
  title: string; who: string; code: string; section: string;
  days: string; from: string; to: string; room: string;
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
      style={box ? { left: box.left, top: box.top } : { left: -9999, top: -9999 }}
    >
      <strong>{title}</strong>
      <em>{who}</em>
      <dl>
        <dt>الشعبة</dt><dd dir="ltr">{section} · {code}</dd>
        <dt>الأيام</dt><dd>{dayText || "بدون أيام"}</dd>
        <dt>الوقت</dt><dd dir="ltr">{from} – {to}</dd>
        <dt>القاعة</dt><dd dir="ltr">{room || "—"}</dd>
      </dl>
    </div>
  );
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
  const paintOpen = useRef<((seed: { day: DayKey; start: string; end: string }) => void) | null>(null);
  useEffect(() => {
    const finish = () => {
      const stroke = paintRef.current;
      paintRef.current = null;
      if (!stroke) return;
      setPaint(current => {
        if (current) paintOpen.current?.({ day: current.day, start: current.from, end: current.to });
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
    const res = await fetch(url, options),
      data = await res.json();
    if (!res.ok) throw new Error(data.error || "تعذر تحميل البيانات");
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
  useEffect(() => {
    if (!filterSection) return;
    let alive = true;
    // The department's own staff, not the university register.
    fetchJson(`/api/instructors?sectionId=${filterSection}&termId=${filterTerm || 0}`)
      .then((list: any[]) => {
        if (!alive || !Array.isArray(list) || !list.length) return;
        setInstructors(current => mergeById(current as any[], list, row => Number(row.AdInstructorId), row => row.AdInstructorName));
      })
      .catch(() => undefined);
    fetchJson(`/api/courses?sectionId=${filterSection}`)
      .then((list: any[]) => {
        if (!alive || !Array.isArray(list) || !list.length) return;
        setCourses(current => mergeById(current as any[], list, row => Number(row.AdCourseId), row => row.CourseName));
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
  const undoAction = useMemo(
    () => (undoBarId ? undoLog.find(item => item.id === undoBarId && !item.usedAt) || null : null),
    [undoBarId, undoLog],
  );
  const runUndoEntry = async (entry: UndoEntry) => {
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
      for (const step of entry.steps) {
        await fetchJson(step.url, {
          method: step.method,
          ...(step.body === undefined
            ? {}
            : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(step.body) }),
        });
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
    if (!steps.length) return;
    const entry: UndoEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label, at: Date.now(), steps,
    };
    setUndoLog(current => [entry, ...current].slice(0, UNDO_LOG_LIMIT));
    setUndoBarId(entry.id);
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
  useEffect(() => {
    if (!filterCollege || !filterSection || !filterTerm) { setVisitingIds(new Set()); return; }
    let alive = true;
    const query = new URLSearchParams({
      collegeId: String(filterCollege), sectionId: String(filterSection), termId: String(filterTerm),
    });
    fetch(`/api/visiting-roster?${query}`)
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!alive) return;
        const ids = Array.isArray(data?.instructorIds) ? data.instructorIds : Array.isArray(data) ? data : [];
        setVisitingIds(new Set(ids.map(Number).filter(Boolean)));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [filterCollege, filterSection, filterTerm]);

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
  const openCreate = (seed?: { day?: DayKey; start?: string; end?: string }) => {
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
          : timeFromMins(Math.min(23 * 60 + 30, mins(seed.start) + 60));
      }
      // A tap paints one square, which should still mean the usual hour.
      if (seed?.end && seed.start && mins(seed.end) - mins(seed.start) <= 30) {
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
  // The paint gesture ends on a window listener registered once, so it reaches
  // the form opener through a ref rather than by re-binding on every render.
  paintOpen.current = openCreate;
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
        offerUndo(
          `حذف ${before.AdCourseName || courseById.get(before.AdCourseId)?.CourseName || "موعد"}`,
          [{ method: "POST", url: "/api/schedules", body: values }],
        );
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

  const commitMove = async (request: SchedulePhysicsDropRequest) => {
    const { row, target } = request;
    const day = target.day as DayKey;
    // A whole selection travels together, keeping the shape it already had.
    const party = multiSelect.has(row.id)
      ? rows.filter(item => multiSelect.has(item.id))
      : [row];
    const shift = mins(target.start) - mins(row.fstarttime);
    const sourceDay = (days.find(d => Boolean(row[d.key]))?.key || day) as DayKey;
    const dayChanged = sourceDay !== day;

    const moves = party.map(item => {
      const singleDay = days.filter(d => Boolean(item[d.key])).length === 1;
      const start = item.id === row.id ? target.start : timeFromMins(mins(item.fstarttime) + shift);
      const candidate = buildMoveCandidate(item, { day, start });
      // Only the carried card changes day; the rest keep theirs and shift in time.
      if (item.id !== row.id && singleDay && dayChanged) {
        days.forEach(d => { (candidate as any)[d.key] = Boolean(item[d.key]); });
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
      // Ask before writing, once per moved card, so a refusal costs nothing.
      for (const move of moves) {
        const probe: any = { ...move.after };
        delete probe.id;
        delete probe.AdCourseName;
        const check = await fetchJson("/api/schedules/check-conflicts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...probe, excludeId: move.before.id, excludeIds: moves.map(m => m.before.id) }),
        });
        // Members of the same travelling selection are checked against where
        // they *are*, not where they are going — so a card landing on a sibling
        // that is itself about to move is not a real clash.
        const partyIds = new Set(moves.map(m => m.before.id));
        const blocking = (Array.isArray(check.conflicts) ? check.conflicts : [])
          .filter((c: any) => c?.severity === "high" || c?.type === "duplicate")
          .filter((c: any) => !partyIds.has(Number(c?.rowId)) && !partyIds.has(Number(c?.otherId)));
        if (blocking.length) {
          setPhysicsNotice("");
          setError(`لم يُنقل: ${describeConflict(blocking)}`);
          return;
        }
      }

      // The grid answers immediately; the network catches up behind it.
      const patched = new Map(moves.map(m => [m.before.id, m.after]));
      setRows(current => current.map(item => patched.get(item.id) || item));

      for (const move of moves) {
        const payload: any = { ...move.after };
        delete payload.id;
        delete payload.AdCourseName;
        await fetchJson(`/api/schedules/${move.before.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      markChanged(row.id);
      setPhysicsNotice("");
      const label = days.find(d => d.key === day)?.label || "";
      offerUndo(
        moves.length > 1
          ? `نُقل ${moves.length} مواعيد إلى ${label} ${target.start}`
          : `نُقل ${row.AdCourseName || courseById.get(row.AdCourseId)?.CourseName || "الموعد"} إلى ${label} ${target.start}`,
        moves.map(move => restoreStep(move.before)),
      );
      void loadRows();
    } catch (e: any) {
      setError(friendlyError(e));
      void loadRows();
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
   * A phone is given one day, not five.
   *
   * Five readable lanes need about 1148px, so on a narrow screen the week has
   * always been a sideways scroll — the grid was wider than the device and the
   * reader dragged it past the window to find Wednesday. The fold the column
   * header already performs is the answer; this only makes it the opening
   * position on a small screen.
   *
   * It settles the question on entering the week and not again, and it fills
   * only an empty choice, so a reader who deliberately unfolds all five days is
   * never argued with.
   */
  useEffect(() => {
    if (viewMode !== "week" || typeof window === "undefined") return;
    if (!window.matchMedia("(max-width:768px)").matches) return;
    setExpandedDay(current => current ?? todayKey ?? (days[0]?.key as DayKey));
  }, [viewMode, todayKey]);
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
  /** A single-day block this long is a workshop or a laboratory, not a lecture. */
  const LONG_BLOCK = 150;
  const weekLayout = useMemo(() => {
    type Placed = { row: FSchedule; top: number; height: number; lane: number; span: number; lanes: number; spine?: number };
    const layout: Record<string, { items: Placed[]; spine: Placed[]; busiest: number }> = {};

    const geometry = (row: FSchedule) => ({
      top: ((mins(row.fstarttime) - gridWindow.start) / 30) * SLOT_H,
      height: Math.max(SLOT_H - 4, ((mins(row.fendtime) - mins(row.fstarttime)) / 30) * SLOT_H - 3),
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
    const shortWho = i?.AdInstructorName ? instructorLabel(i.AdInstructorName, widthShare) : who;
    const place = [r.AdRoomCode, r.AdRoomHall].filter(Boolean).join("/");
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
          openEdit(r);
        }}
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") openEdit(r); }}
        data-narrow={widthShare <= 0.34 ? "true" : undefined}
        className={`week-event ${lensClass(r)} ${xrayClass(r)} ${physicsRelationClass(r)} ${draggingId === r.id ? "ripple-source" : ""} ${physicsActive && physicsOrigin?.id === r.id ? "physics-source-lift" : ""} ${justChangedId === r.id ? "just-changed" : ""} ${reviewFocus.has(r.id) ? "review-flagged" : ""} ${multiSelect.has(r.id) ? "week-picked" : ""}`}
        style={{ ...style, ["--hue" as any]: courseHue(code) }}
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
        <small className="week-when"><time dir="ltr">{r.fstarttime}–{r.fendtime}</time>{place ? <i>{place}</i> : null}</small>
        <em className="week-code" dir="ltr">{code}<b dir="ltr">{r.SCode}</b></em>
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
      setPhysicsNotice("");
      setPhysicsField({});
      setError(null);
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
      setPhysicsField({});
      if (isSamePlacement(request.row, request.sourceDay, request.target)) {
        setPhysicsNotice("");
        return;
      }
      void commitMove(request);
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
    const suggestions: Array<{ day: DayKey; start: string; score: number }> = [];
    const carried = physics.state.row;
    if (!carried || physics.state.phase === "idle") return { blocked, suggestions };
    const span = Math.max(30, mins(carried.fendtime) - mins(carried.fstarttime));
    const instructorRows = weekRows.filter(row => row.id !== carried.id && carried.AdInstructorId && row.AdInstructorId === carried.AdInstructorId);
    const hallRows = weekRows.filter(row => row.id !== carried.id && carried.AdRoomCode && row.AdRoomCode === carried.AdRoomCode && row.AdRoomHall === carried.AdRoomHall);
    for (const day of days) {
      for (const slot of timeSlots) {
        const key = `${day.key}:${slot}`;
        const from = mins(slot);
        const to = from + span;
        if (to > gridWindow.end) { blocked.set(key, "المحاضرة أطول من الوقت المتبقي في هذا اليوم"); continue; }
        const clash = (list: FSchedule[]) => list.find(row =>
          (row as any)[day.key] && mins(row.fstarttime) < to && mins(row.fendtime) > from);
        const instructorClash = clash(instructorRows);
        if (instructorClash) {
          blocked.set(key, `الأستاذ مرتبط بـ${instructorClash.AdCourseName || courseById.get(instructorClash.AdCourseId)?.CourseName || "موعد آخر"} ${instructorClash.fstarttime}`);
          continue;
        }
        const hallClash = clash(hallRows);
        if (hallClash) {
          blocked.set(key, `القاعة محجوزة لـ${hallClash.AdCourseName || courseById.get(hallClash.AdCourseId)?.CourseName || "موعد آخر"} ${hallClash.fstarttime}`);
          continue;
        }
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
    return { blocked, suggestions: suggestions.slice(0, 3) };
  }, [physics.state.row, physics.state.phase, weekRows, timeSlots, gridWindow, courseById]);
  const dragSuggestions = dragField.suggestions;
  const suggestionRank = useMemo(() => {
    const map = new Map<string, number>();
    dragSuggestions.forEach((item, index) => map.set(`${item.day}:${item.start}`, index + 1));
    return map;
  }, [dragSuggestions]);
  /** Why this square cannot take the carried card, for its tooltip. */
  const slotBlockReason = (day: DayKey, start: string) => dragField.blocked.get(`${day}:${start}`) || "";

  const physicsSlotClass = (day: DayKey, start: string) => {
    const key = `${day}:${start}`;
    const rank = suggestionRank.get(key);
    // Lifting the card shades every square the local reading has ruled out, so
    // the shape of what is free is visible before the pointer goes anywhere.
    // Where the server has since given a verdict for a square the pointer
    // actually visited, that verdict wins — it knows rules this reading cannot.
    const sampled = physicsField[key] || (dragField.blocked.has(key) ? "impossible" : "");
    const active =
      physics.state.target?.day === day &&
      physics.state.target?.start === start;
    const quality = active
      ? physics.state.decision?.quality || sampled || "unknown"
      : sampled || "";
    return `${active ? `physics-target physics-${quality}` : ""} ${sampled ? `gravity-slot gravity-${sampled}` : ""} ${rank ? `suggested-slot suggested-${rank}` : ""}`.trim();
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
                          سيُضاف الجديد بجانب الموجود دون حذف أي شيء.
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
                {courseNature && courseNature.confidence !== "low" ? (
                  <div className="nature-card">
                    <div>
                      <span className="surface-kicker">كما يُدرَّس هذا المقرر عادةً</span>
                      <strong>{courseNature.summary}</strong>
                      <small>
                        من {courseNature.terms.toLocaleString("ar-KW-u-nu-latn")} فصلاً
                        · {courseNature.observations.toLocaleString("ar-KW-u-nu-latn")} شعبة
                        {courseNature.sectionsPerTerm > 1 ? ` · عادةً ${courseNature.sectionsPerTerm.toLocaleString("ar-KW-u-nu-latn")} شعب في الفصل` : ""}
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
            <GhostButton
              type="button"
              onClick={() => setTransferOpen(true)}
              title={isPowerAdmin ? "استيراد وتصدير واستبدال أستاذ والمنتدبون" : "المنتدبون"}
            >
              <ArrowLeftRight /> {isPowerAdmin ? "نقل" : "المنتدبون"}
            </GhostButton>
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
            className={`week-surface ${physicsActive ? "physics-lens-active" : ""} ${picking ? "week-picking" : ""}`}
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
              <span>اسحب الموعد لتنقله · اسحب على عمود فارغ لتنشئ موعداً بطوله · تراجُع متاح دقيقة بعد كل نقل.</span>
              <button
                type="button"
                className={`week-pick-toggle ${picking ? "on" : ""}`}
                onClick={() => { setPicking(v => !v); setMultiSelect(new Set()); }}
                title="اختيار عدة مواعيد ونقلها معاً"
                aria-pressed={picking}
              >
                <Layers aria-hidden="true" />
                {picking ? (multiSelect.size ? `${multiSelect.size} محدد` : "اختر المواعيد") : "تحديد متعدد"}
              </button>
              {multiSelect.size ? (
                <button type="button" className="week-pick-clear" onClick={() => setMultiSelect(new Set())}>
                  <X aria-hidden="true" />إلغاء التحديد
                </button>
              ) : null}
            </div>
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
                  title={expandedDay === d.key ? "العودة إلى الأسبوع كاملاً" : `عرض ${d.label} وحده`}
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
                        style={{ ["--hue" as any]: courseHue(code) }}
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
                        title={slotBlockReason(d.key as DayKey, t) || `إضافة موعد · ${d.label} ${t}`}
                        onPointerDown={(e) => {
                          // Only a press on the empty square itself; a press that
                          // landed on a lecture belongs to that lecture.
                          if (e.target !== e.currentTarget || e.button !== 0) return;
                          paintRef.current = { day: d.key as DayKey, anchor: mins(t) };
                          setPaint({ day: d.key as DayKey, from: t, to: timeFromMins(mins(t) + 30) });
                        }}
                        onPointerEnter={() => {
                          const stroke = paintRef.current;
                          if (!stroke || stroke.day !== d.key) return;
                          const here = mins(t);
                          setPaint({
                            day: d.key as DayKey,
                            from: timeFromMins(Math.min(stroke.anchor, here)),
                            to: timeFromMins(Math.max(stroke.anchor, here) + 30),
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
                    {paint && paint.day === d.key ? (
                      <div
                        className="week-paint"
                        style={{
                          top: ((mins(paint.from) - gridWindow.start) / 30) * SLOT_H,
                          height: Math.max(SLOT_H - 4, ((mins(paint.to) - mins(paint.from)) / 30) * SLOT_H - 3),
                        }}
                        aria-hidden="true"
                      >
                        <b dir="ltr">{paint.from}–{paint.to}</b>
                        <span>موعد جديد</span>
                      </div>
                    ) : null}
                    {/* Today's column carries the hour it actually is. Positioned by the
                        same arithmetic as every card above it, and deliberately free of
                        pointer handlers — a stray one here would land on the cards and
                        take the drag with it. */}
                    {todayKey === d.key &&
                    nowMinutes >= gridWindow.start &&
                    nowMinutes <= gridWindow.end ? (
                      <div
                        className="week-now"
                        style={{ top: ((nowMinutes - gridWindow.start) / 30) * SLOT_H }}
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
                                ((mins(r.fstarttime) - gridWindow.start) / 30) * SLOT_H,
                              height = Math.max(
                                SLOT_H - 4,
                                ((mins(r.fendtime) - mins(r.fstarttime)) / 30) *
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
                    {(weekLayout[d.key]?.spine || []).map((placed) => {
                      const c = courseById.get(placed.row.AdCourseId);
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
                            ["--hue" as any]: courseHue(code),
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
                          <time dir="ltr">{placed.row.fstarttime}</time>
                        </article>
                      );
                    })}
                    {(weekLayout[d.key]?.items || []).map((placed) =>
                      renderWeekCard(placed.row, d, {
                        top: placed.top,
                        height: placed.height,
                        ...(expandedDay === d.key
                          ? {}
                          : laneStyle(placed, (weekLayout[d.key]?.spine || []).reduce((max, x) => Math.max(max, (x.spine || 0) + 1), 0))),
                      }, placed.span / placed.lanes),
                    )}
                  </div>
                );
              })}
            </div>
          </Surface>
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
          <span>سجل اليوم</span>
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
                {undoLog.map(entry => (
                  <li key={entry.id} className={entry.usedAt ? "used" : ""}>
                    <div className="undo-log-line">
                      <span className="undo-log-label">{entry.label}</span>
                      <time dateTime={new Date(entry.at).toISOString()}>{undoClock(entry.at)}</time>
                    </div>
                    {entry.usedAt ? (
                      <span className="undo-log-done">تُراجع عنه {undoClock(entry.usedAt)}</span>
                    ) : (
                      <button type="button" onClick={() => void runUndoEntry(entry)} disabled={Boolean(undoBusy)}>
                        {undoBusy === entry.id ? "يتراجع…" : "تراجع"}
                      </button>
                    )}
                  </li>
                ))}
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
