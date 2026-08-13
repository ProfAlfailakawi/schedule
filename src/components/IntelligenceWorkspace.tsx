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
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UsersRound,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Badge,
  Field,
  GhostButton,
  MetaPill,
  Notice,
  PageTitle,
  PrimaryButton,
  RecordCard,
  RecordDeck,
  SecondaryButton,
  Segmented,
  Surface,
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
import { coerceScopeValues, resolveScopeSelection } from "../utils/scopeContext";
import { sortByName } from "../utils/sorting";
import {
  IntelligenceVersionCanvas as VersionCanvas,
  intelligenceDayLabels as dayLabels,
  intelligenceMinutes as twinMinutes,
} from "./IntelligenceVersionCanvas";

type Tab = "command" | "copilot" | "twin" | "history" | "import";
type ChatItem = { prompt: string; answer: any };
interface Props {
  user: any;
  scopes: any[];
}
const smartMessage = (value: any) => {
  const text = String(value?.message || value || "حدث خطأ غير متوقع");
  if (/Failed to fetch|NetworkError/i.test(text))
    return "تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة؛ لم يتم حفظ أي تغيير.";
  if (/API endpoint not found/i.test(text))
    return "جزء من التحديث لم يُرفع على الخادم بعد. ارفع ملفات الحزمة الجديدة كاملة مع الحفاظ على المسارات.";
  return text;
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
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [message, setMessage] = useState<string | null>(null);
  const [heatMode, setHeatMode] = useState("department"),
    [detail, setDetail] = useState<any>(null);
  const [prompt, setPrompt] = useState(""),
    [chat, setChat] = useState<ChatItem[]>([]),
    chatEnd = useRef<HTMLDivElement | null>(null);
  const [scenario, setScenario] = useState<FSchedule[] | null>(null),
    [scenarioEval, setScenarioEval] = useState<any>(null),
    [scenarioId, setScenarioId] = useState<number | "">(""),
    [activeDraftId, setActiveDraftId] = useState<string | null>(null);
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
  const [genome, setGenome] = useState<any>(null),
    [constraints, setConstraints] = useState<any[]>([]),
    [innovationMode, setInnovationMode] = useState<
      "constraints" | "war" | "autopilot"
    >("constraints"),
    [warRoom, setWarRoom] = useState<any>(null),
    [warRowId, setWarRowId] = useState<number | "">(""),
    [warBusy, setWarBusy] = useState(false),
    [autopilotGoal, setAutopilotGoal] = useState(
      "قلل الفراغات والتعارضات بأقل تغيير ممكن، وحافظ على القاعات والأيام الحالية",
    ),
    [autopilot, setAutopilot] = useState<any>(null),
    [autopilotBusy, setAutopilotBusy] = useState(false);
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
    if (options?.method && options.method !== "GET" && !navigator.onLine)
      throw new Error(
        "أنت الآن دون اتصال. العرض متاح، لكن الحفظ والنشر متوقفان لحماية الجدول.",
      );
    const r = await fetch(url, options),
      d = await r.json();
    if (!r.ok)
      throw Object.assign(new Error(d.error || "تعذر تنفيذ العملية"), {
        issues: d.issues,
      });
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
    (async () => {
      setLoading(true);
      try {
        const [c, s, t, lookups] = await Promise.all([
          fetchJson("/api/colleges"),
          fetchJson("/api/sections"),
          fetchJson("/api/terms"),
          fetchJson("/api/intelligence/lookups"),
        ]);
        setColleges(sortByName(c, (row:any)=>row.AdCollegeName));
        setSections(sortByName(s, (row:any)=>row.AdSectionName));
        setTerms(t);
        setCourses(sortByName(lookups.courses || [], (row:any)=>row.CourseName));
        setInstructors(sortByName(lookups.instructors || [], (row:any)=>row.AdInstructorName));
        const latest = [...t].sort((a: any, b: any) => b.AdTermId - a.AdTermId)[0]?.AdTermId || 0;
        const scoped = resolveScopeSelection(scopes, 0, isPowerAdmin);
        const defaultCollege = isPowerAdmin
          ? (c[0]?.AdCollegeId || s[0]?.AdCollegeId || 0)
          : scoped.defaultCollegeId;
        const scopedForCollege = resolveScopeSelection(scopes, defaultCollege, isPowerAdmin);
        const defaultSection = isPowerAdmin
          ? (s.find((item:any)=>item.AdCollegeId===defaultCollege)?.AdSectionId || 0)
          : scopedForCollege.defaultSectionId;
        setCollegeId(defaultCollege);
        setSectionId(defaultSection);
        setTermId(latest);
        const sorted = [...t].sort((a: any, b: any) => b.AdTermId - a.AdTermId);
        setCompareTo(sorted[0]?.AdTermId || 0);
        setCompareFrom(sorted[1]?.AdTermId || sorted[0]?.AdTermId || 0);
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
  const reload = async () => {
    if (!collegeId || !sectionId || !termId) return;
    setLoading(true);
    setError(null);
    try {
      const [o, r, d, v, g, cx] = await Promise.all([
        fetchJson(`/api/intelligence/overview?${contextQuery}`),
        fetchJson(`/api/schedules?${contextQuery}`),
        fetchJson(`/api/intelligence/drafts?${contextQuery}`),
        fetchJson(`/api/intelligence/versions?${contextQuery}`),
        fetchJson(`/api/intelligence/genome?${contextQuery}`),
        fetchJson(`/api/intelligence/constraints?${contextQuery}`),
      ]);
      setOverview(o);
      setRows(r);
      setDrafts(d);
      setVersions(v);
      setGenome(g);
      setConstraints(cx);
      if (!scenario) setScenarioId(r[0]?.id || "");
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setLoading(false);
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
    if (collegeId && sectionId && termId) void reload();
  }, [collegeId, sectionId, termId]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);
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
  }, [scenario]);
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
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
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
    if (
      !confirm(
        `نشر «${d.name}» على الجدول الفعلي؟\nسيتم إنشاء نسخة زمنية تلقائياً قبل التنفيذ ويمكن التراجع عنها.`,
      )
    )
      return;
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
    if (
      !confirm(
        `استرجاع النسخة «${v.label}»؟\nسيُحفظ الجدول الحالي كنسخة جديدة أولاً.`,
      )
    )
      return;
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
  const compareVersions = async () => {
    if (!versionFrom || !versionTo) { setError("اختر نسختين للمقارنة."); return; }
    if (versionFrom === versionTo) { setError("اختر نسختين مختلفتين للمقارنة."); return; }
    setBusy(true);
    try {
      setVersionCompare(
        await fetchJson(
          `/api/intelligence/versions/compare?fromId=${encodeURIComponent(versionFrom)}&toId=${encodeURIComponent(versionTo)}`,
        ),
      );
      setTimeTravel(50);
    } catch (e: any) {
      setError(smartMessage(e));
    } finally {
      setBusy(false);
    }
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
    () =>
      courses.filter(
        (c) => c.AdCollegeId === collegeId && c.AdSectionId === sectionId,
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
    if (!confirm(`حذف القاعدة «${c.label}»؟`)) return;
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

  const ContextBar = () => (
    <IntelligenceContextBar
      collegeId={collegeId}
      sectionId={sectionId}
      termId={termId}
      colleges={colleges}
      sections={sections}
      availableSections={availableSections}
      terms={terms}
      online={online}
      lockCollege={resolveScopeSelection(scopes, collegeId, isPowerAdmin).lockCollege}
      lockSection={resolveScopeSelection(scopes, collegeId, isPowerAdmin).lockSection}
      onCollegeChange={(nextCollegeId, firstSectionId) => {
        setCollegeId(nextCollegeId);
        setSectionId(resolveScopeSelection(scopes, nextCollegeId, isPowerAdmin).defaultSectionId || firstSectionId);
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

  return (
    <div className={`content-stack intelligence-page scene-${scene}`}>
      <PageTitle
        eyebrow="ذكاء الجدول"
        subtitle="افهم · جرّب · اعتمد"
      >
        مركز الذكاء
      </PageTitle>
      <ContextBar />
      <div className="intelligence-scenes no-print">
        <Segmented
          value={scene}
          onChange={changeScene}
          options={[
            {
              value: "understand",
              label: (
                <>
                  <BrainCircuit /> افهم
                </>
              ),
            },
            {
              value: "try",
              label: (
                <>
                  <Network /> جرّب
                </>
              ),
            },
            {
              value: "approve",
              label: (
                <>
                  <ShieldCheck /> اعتمد
                </>
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
      </div>
      {scene === "understand" ? (
        <div className="scene-subnav no-print">
          <button
            className={tab === "command" ? "active" : ""}
            onClick={() => setTab("command")}
          >
            <Gauge /> قراءة القرار
          </button>
          <button
            className={tab === "copilot" ? "active" : ""}
            onClick={() => setTab("copilot")}
          >
            <BrainCircuit /> اسأل الجدول
          </button>
        </div>
      ) : scene === "try" ? (
        <div className="scene-subnav no-print">
          <button
            className={tab === "twin" ? "active" : ""}
            onClick={() => setTab("twin")}
          >
            <Network /> النسخة التجريبية
          </button>
          <button
            className={tab === "import" ? "active" : ""}
            onClick={() => setTab("import")}
          >
            <FileSpreadsheet /> استيراد آمن
          </button>
        </div>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {message ? <Notice type="success">{message}</Notice> : null}
      {loading && !overview ? (
        <div className="intel-loading">
          <span />
          <strong>أقرأ الجدول وأبني صورة القرار...</strong>
        </div>
      ) : null}

      {tab === "command" && overview ? (
        <div className="intel-command-grid">
          <Surface className="quality-hero">
            <div
              className="quality-orbit"
              style={{ "--score": `${overview.score}%` } as React.CSSProperties}
            >
              <div>
                <strong>{overview.score}</strong>
                <small>/ 100</small>
              </div>
            </div>
            <div className="quality-copy">
              <span className="surface-kicker">مؤشر جودة الجدول</span>
              <h2>{readinessLabel}</h2>
              <p>
                الدرجة تجمع التعارضات، فراغات الأساتذة، توازن الأيام، الأوقات
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
              <div className="quality-factors" role="img" aria-label="توزيع نقاط الجودة">
                {overview.factors.map((f: any) => {
                  const cost = Math.max(0, Number(f.penalty) || 0);
                  return (
                    <span key={f.label} className={cost ? "costly" : "clean"}>
                      <em>{f.label}</em>
                      <i aria-hidden="true"><b style={{ width: `${Math.min(100, cost * 2)}%` }} /></i>
                      <u>{cost ? `−${cost}` : "سليم"}</u>
                    </span>
                  );
                })}
              </div>
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
                <span>تعارض حرج</span>
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
            <div className="approval-status">
              <Badge
                tone={
                  overview.readiness === "blocked"
                    ? "danger"
                    : overview.readiness === "ready"
                      ? "success"
                      : "warning"
                }
              >
                {readinessLabel}
              </Badge>
              <span>
                {overview.publication
                  ? `آخر نشر ${new Date(overview.publication.publishedAt).toLocaleString("ar-KW-u-nu-latn")}`
                  : "لم يُسجل نشر من مركز الذكاء بعد"}
              </span>
            </div>
          </Surface>
          <Surface className="attention-center">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">يحتاج انتباهك</span>
                <h2>تنبيهات ذكية</h2>
              </div>
              <AlertTriangle />
            </div>
            <div className="smart-alerts">
              {overview.alerts.map((a: any, i: number) => (
                <article key={i} className={a.severity}>
                  <span />
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </Surface>
          <Surface className="heatmap-card">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">خريطة الكثافة</span>
                <h2>
                  {heatMode === "university" ? "حركة الجامعة" : "حركة القسم"}
                </h2>
              </div>
              <Segmented
                value={heatMode}
                onChange={setHeatMode}
                options={[
                  { value: "department", label: "القسم" },
                  { value: "university", label: "الجامعة" },
                ]}
              />
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
                      <button
                        type="button"
                        key={`${day}-${time}`}
                        className="heat-cell"
                        style={{ "--heat": ratio } as React.CSSProperties}
                        title={`${dayLabels[day]} ${time}: ${cell?.count || 0}`}
                      >
                        <i />
                        {ratio > 0.62 ? <b>{cell?.count}</b> : null}
                      </button>
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
          </Surface>
          {overview.spatialBurnout ? (
            <Surface className="spatial-burnout-card">
              <div className="surface-head">
                <div>
                  <span className="surface-kicker">الرادار الجغرافي</span>
                  <h2>الاحتراق الوظيفي المكاني</h2>
                </div>
                <Building2 />
              </div>
              <div className="spatial-score-row">
                <div className={`spatial-score ${overview.spatialBurnout.highRisk ? "danger" : overview.spatialBurnout.guardedRisk ? "guarded" : "safe"}`}>
                  <strong>{overview.spatialBurnout.score}</strong><span>/100</span>
                  <small>راحة الحركة</small>
                </div>
                <div className="spatial-metrics">
                  <article><b>{overview.spatialBurnout.highRisk}</b><span>خطر إرهاق جسدي</span></article>
                  <article><b>{overview.spatialBurnout.guardedRisk}</b><span>انتقال ضيق</span></article>
                  <article><b>{overview.roomCastling?.length || 0}</b><span>تبديل شطرنجي آمن</span></article>
                </div>
              </div>
              {overview.spatialBurnout.risks?.length ? (
                <div className="spatial-risk-list">
                  {overview.spatialBurnout.risks.slice(0, 5).map((risk: any) => (
                    <article key={`${risk.instructorId}-${risk.day}-${risk.fromRowId}-${risk.toRowId}`} className={risk.level}>
                      <span className="risk-mark"><AlertTriangle /></span>
                      <div><strong>{risk.instructorName}</strong><small>{risk.dayLabel} · {risk.fromBuilding} → {risk.toBuilding}</small></div>
                      <b>{risk.gapMinutes}د <small>متاح</small></b>
                      <span>{risk.requiredMinutes}د مطلوبة</span>
                    </article>
                  ))}
                </div>
              ) : <div className="spatial-clear"><CheckCircle2 /><div><strong>لا توجد انتقالات مرهقة</strong><span>الفواصل تستوعب زمن الحركة.</span></div></div>}
              {overview.roomCastling?.length ? (
                <div className="castling-strip">
                  <div><strong>Room Castling</strong><span>القاعة فقط · بدون مساس بالوقت.</span></div>
                  {overview.roomCastling.slice(0, 3).map((proposal: any, index: number) => (
                    <button key={`${proposal.rowId}-${index}`} type="button" onClick={() => {
                      const changes = new Map((proposal.changes || []).map((c: any) => [Number(c.id), c]));
                      const next = rows.map(row => { const change: any = changes.get(Number(row.id)); return change ? { ...row, AdRoomCode: change.AdRoomCode, AdRoomHall: change.AdRoomHall } : row; });
                      setScenario(next); setScenarioEval(null); setTab("twin"); setMessage(`تم فتح «${proposal.title}» كتجربة فقط — لا شيء محفوظ.`);
                    }}>
                      <span>{proposal.kind === "swap" ? "تبديل شطرنجي" : "تقريب القاعة"}</span>
                      <strong>{proposal.instructorName}</strong>
                      <small>{proposal.before.roomCode}/{proposal.before.roomHall} ← {proposal.after.roomCode}/{proposal.after.roomHall}</small>
                      <ChevronLeft />
                    </button>
                  ))}
                </div>
              ) : null}
            </Surface>
          ) : null}
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
          </Surface>
          <Surface className="professor-intelligence">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">حمل أعضاء هيئة التدريس</span>
                <h2>حمل أعضاء هيئة التدريس</h2>
              </div>
              <UsersRound />
            </div>
            <div className="professor-load-list">
              {overview.professorLoads.slice(0, 8).map((p: any) => (
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
          </Surface>
          <Surface className="data-health">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">صحة البيانات</span>
                <h2>صحة البيانات</h2>
              </div>
              <CheckCircle2 />
            </div>
            <div className="health-score">
              <strong>
                {overview.dataHealth.healthy ? "سليمة" : "تحتاج مراجعة"}
              </strong>
              <span>
                {overview.dataHealth.invalidRows} ناقص ·{" "}
                {overview.dataHealth.duplicates} تكرار ·{" "}
                {overview.dataHealth.unscheduledCourses} مقرر بلا موعد
              </span>
            </div>
            <p>
              هذه القراءة لا تحذف ولا تصحح شيئاً تلقائياً؛ هدفها فقط كشف ما قد
              يفوت أثناء العمل السريع.
            </p>
          </Surface>
          {genome ? (
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
                      ? `${genome.history.length} فصول سابقة في البصمة`
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
              <div className="genome-patterns">
                <section>
                  <span>نمط ساعات البداية</span>
                  <div>
                    {Object.entries(genome.dna?.timeShares || {}).map(
                      ([key, value]: any) => (
                        <b key={key}>
                          <small>{key}</small>
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
                      .slice(0, 5)
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
                  .slice(0, 5)
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
              <div className="genome-foot">
                <History />
                <span>
                  متوسط الفراغ التاريخي:{" "}
                  <b>{genome.dna?.avgGap ?? "—"} دقيقة</b>. هذه قراءة نمطية
                  وليست قاعدة إلزامية.
                </span>
              </div>
            </Surface>
          ) : null}
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
                      <div>
                        <strong>{item.answer.title}</strong>
                        <p>{item.answer.summary}</p>
                        {item.answer.bullets?.length ? (
                          <ul>
                            {item.answer.bullets.map((b: string, j: number) => (
                              <li key={j}>{b}</li>
                            ))}
                          </ul>
                        ) : null}
                        <small>
                          <ShieldCheck />
                          {item.answer.guardrail}
                        </small>
                      </div>
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
              <p>قسمك فقط · التعارض الخارجي مكشوف.</p>
            </Surface>
            <Surface>
              <span className="surface-kicker">أوامر مفيدة</span>
              <div className="mini-command-list">
                <span>
                  <Command /> حلل الفراغات
                </span>
                <span>
                  <Command /> اختبر نقل مقرر
                </span>
                <span>
                  <Command /> اقترح توزيعاً
                </span>
                <span>
                  <Command /> اقرأ القاعات
                </span>
              </div>
            </Surface>
          </aside>
        </div>
      ) : null}

      {tab === "twin" ? (
        <div className="twin-layout">
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
                  ? `غيّرت ${changedRows.length} موعداً داخل السيناريو حتى الآن. لا شيء منها منشور.`
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
                    onClick={() => saveDraft("what-if")}
                    disabled={busy || !changedRows.length}
                  >
                    <Save /> احفظ كمسودة
                  </PrimaryButton>
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
                          ? `${scenarioEval.constraints.scenario.total} مخالفة في السيناريو`
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
                        {warRoom.baseline.conflicts} تعارض ·{" "}
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
                              <b>{o.conflicts}</b> تعارض
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
                              title={`${o.roomImpact?.from || "—"} ← ${o.roomImpact?.to || "—"}`}
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
                              onClick={() =>
                                saveOptionAsDraft(o, `خيار اللجنة ${o.rank}`)
                              }
                            >
                              <Save /> اختيار اللجنة → مسودة
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
                            <span>{o.conflicts} تعارض</span>
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
                              onClick={() =>
                                saveOptionAsDraft(o, `خطة تلقائية ${o.rank}`)
                              }
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
          {scenario ? (
            <>
              <section className="twin-score-row">
                <article>
                  <span>الجدول الحالي</span>
                  <strong>
                    {scenarioEval?.baseline?.score ?? overview?.score}
                  </strong>
                  <small>/100</small>
                </article>
                <ArrowLeftRight />
                <article
                  className={
                    (scenarioEval?.scenario?.score || 0) >=
                    (scenarioEval?.baseline?.score || overview?.score || 0)
                      ? "better"
                      : ""
                  }
                >
                  <span>السيناريو</span>
                  <strong>{scenarioEval?.scenario?.score ?? "—"}</strong>
                  <small>/100</small>
                </article>
                <div className="twin-delta">
                  <b>
                    {scenarioEval
                      ? `${(scenarioEval.scenario.score || 0) - (scenarioEval.baseline.score || 0) >= 0 ? "+" : ""}${(scenarioEval.scenario.score || 0) - (scenarioEval.baseline.score || 0)}`
                      : "—"}
                  </b>
                  <span>فرق الجودة</span>
                </div>
                {scenarioEval?.constraints ? (
                  <div
                    className={`twin-constraint-score ${scenarioEval.constraints.scenario.total ? "warn" : "ok"}`}
                  >
                    <b>{scenarioEval.constraints.scenario.total}</b>
                    <span>مخالفة Constraint</span>
                  </div>
                ) : null}
              </section>
              <Surface className="twin-visual-board">
                <div className="surface-head">
                  <div>
                    <span className="surface-kicker">المساحة البصرية التجريبية</span>
                    <h2>حرّك الوقت… وشاهد النتيجة لحظياً</h2>
                  </div>
                  <span className="twin-live">
                    <i /> تقييم تلقائي
                  </span>
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
                          value={selectedScenario.fstarttime}
                          onChange={(e) =>
                            patchScenario({ fstarttime: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="النهاية">
                        <input
                          type="time"
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
                <Surface className="change-ledger">
                  <div className="surface-head">
                    <div>
                      <span className="surface-kicker">التغييرات</span>
                      <h2>{changedRows.length} تعديل</h2>
                    </div>
                    <FileClock />
                  </div>
                  <div className="change-list">
                    {changedRows.length ? (
                      changedRows.slice(0, 30).map((r) => {
                        const o = originalById.get(r.id);
                        return (
                          <article key={r.id}>
                            <div>
                              <strong>
                                {r.AdCourseName} · {r.SCode}
                              </strong>
                              <span>
                                {o?.fstarttime}-{o?.fendtime} ← {r.fstarttime}-
                                {r.fendtime}
                              </span>
                            </div>
                            {o?.AdRoomCode !== r.AdRoomCode ||
                            o?.AdRoomHall !== r.AdRoomHall ? (
                              <Badge tone="info">
                                قاعة {o?.AdRoomCode}/{o?.AdRoomHall} ←{" "}
                                {r.AdRoomCode}/{r.AdRoomHall}
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
            </>
          ) : (
            <Surface className="twin-explainer">
              <div className="twin-steps">
                <article>
                  <span>1</span>
                  <div>
                    <strong>انسخ</strong>
                    <p>نسخة وهمية مطابقة</p>
                  </div>
                </article>
                <article>
                  <span>2</span>
                  <div>
                    <strong>جرّب</strong>
                    <p>يدوي أو آلي</p>
                  </div>
                </article>
                <article>
                  <span>3</span>
                  <div>
                    <strong>قارن</strong>
                    <p>قبل / بعد</p>
                  </div>
                </article>
                <article>
                  <span>4</span>
                  <div>
                    <strong>اعتمد</strong>
                    <p>مسودة أولاً · النشر باختيارك</p>
                  </div>
                </article>
              </div>
            </Surface>
          )}
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="history-layout">
          <Surface className="term-compare">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">مقارنة الفصول</span>
                <h2>شنو تغيّر؟</h2>
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
                    {termCompare.fromCount} ← {termCompare.toCount}
                  </strong>
                  <span>عدد المواعيد</span>
                </article>
                <article>
                  <strong>
                    {termCompare.fromScore} ← {termCompare.toScore}
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
                    {termCompare.uniqueRoomsFrom} ← {termCompare.uniqueRoomsTo}
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
          <Surface className="versions-card">
            <div className="surface-head">
              <div>
                <span className="surface-kicker">سجل النسخ</span>
                <h2>النسخ الزمنية</h2>
              </div>
              <History />
            </div>
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
                      <h3>اسحب الخط بين النسختين</h3>
                    </div>
                    <div className="time-travel-meta">
                      <span>{versionCompare.from.label}</span>
                      <ArrowLeftRight />
                      <span>{versionCompare.to.label}</span>
                    </div>
                  </div>
                  <div className="time-travel-stage">
                    <VersionCanvas
                      rows={versionCompare.from.rows || []}
                      label="قبل"
                    />
                    <div
                      className="time-travel-after"
                      style={{ clipPath: `inset(0 ${100 - timeTravel}% 0 0)` }}
                    >
                      <VersionCanvas
                        rows={versionCompare.to.rows || []}
                        label="بعد"
                      />
                    </div>
                    <div
                      className="time-travel-divider"
                      style={{ left: `${timeTravel}%` }}
                    >
                      <i />
                    </div>
                    <input
                      className="time-travel-slider"
                      type="range"
                      min="0"
                      max="100"
                      value={timeTravel}
                      onChange={(e) => setTimeTravel(Number(e.target.value))}
                      aria-label="مقارنة النسختين"
                    />
                  </div>
                  <div className="time-travel-caption">
                    <span>0% · النسخة الأولى</span>
                    <b>{timeTravel}%</b>
                    <span>100% · النسخة الثانية</span>
                  </div>
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
          </Surface>
        </div>
      ) : null}

      {tab === "import" ? (
        <div className="import-layout">
          <Surface className="import-drop">
            <div className="import-icon">
              <Upload />
            </div>
            <span className="surface-kicker">معالج استيراد Excel</span>
            <h2>اسحب جدولاً… وافحصه قبل الإدخال</h2>
            <p>
              يدعم ملف Excel بنفس أعمدة تقارير البرنامج: رمز المقرر، الشعبة،
              الأستاذ/الرقم المدني، الوقت، الأيام، المبنى والقاعة.
            </p>
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
              <ShieldCheck /> الاستيراد لا يكتب على الجدول. ينتج معاينة ثم
              مسودة فقط.
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
                    : `${importPreview.issues.length} ملاحظة`}
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
                          value={`${r.fstarttime || "—"}–${r.fendtime || "—"}`}
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
                <div className="drawer-metrics">
                  <article>
                    <strong>{detail.data.totalAppointments}</strong>
                    <span>موعد في الفصل</span>
                  </article>
                  <article>
                    <strong>{detail.data.freeWindows.length}</strong>
                    <span>نافذة فارغة</span>
                  </article>
                </div>
                <h3>أكثر الجهات استخداماً</h3>
                <div className="drawer-list">
                  {detail.data.departments.map((x: any, i: number) => (
                    <div key={i}>
                      <strong>{x.name}</strong>
                      <span>{x.count} لقاء</span>
                    </div>
                  ))}
                </div>
                <h3>أقرب الفترات الفارغة</h3>
                <div className="free-window-grid">
                  {detail.data.freeWindows
                    .slice(0, 12)
                    .map((x: any, i: number) => (
                      <span key={i}>
                        <b>{x.day}</b>
                        <i dir="ltr">
                          {x.start}–{x.end}
                        </i>
                      </span>
                    ))}
                </div>
                <p className="drawer-privacy">
                  حجوزات الأقسام الأخرى تُحسب لضمان عدم التعارض، لكن تفاصيلها
                  تبقى مخفية عن المستخدم غير المصرح له.
                </p>
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
                <h3>المواعيد الظاهرة ضمن صلاحياتك</h3>
                <div className="drawer-schedule-list">
                  {detail.data.visibleRows.map((r: any) => (
                    <article key={r.id}>
                      <strong>
                        {r.AdCourseName} · {r.SCode}
                      </strong>
                      <span>
                        {Object.keys(dayLabels)
                          .filter((k) => r[k])
                          .map((k) => dayLabels[k])
                          .join(" - ")}
                      </span>
                      <small dir="ltr">
                        {r.fstarttime}–{r.fendtime}
                      </small>
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
