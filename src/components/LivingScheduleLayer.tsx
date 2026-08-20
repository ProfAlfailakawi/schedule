import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatScheduleTimeRange } from "../utils/scheduleTime";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Dna,
  FileClock,
  Fingerprint,
  Gauge,
  History,
  Network,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UsersRound,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { Badge, GhostButton, Notice, PrimaryButton, SecondaryButton } from "./ui";
import {
  BriefScene,
  ContextPicker,
  HealthScene,
  PulseScene,
  TopologyScene,
  WhyResult,
} from "./LivingScheduleScenes";
import type { AdCourse, AdInstructor, AdTerm, FSchedule } from "../types";
import { livingScopeKey, readLiving, sharedLiving } from "../utils/livingCache";
import type { ScheduleExperience } from "./ScheduleExperienceLayer";
import { SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME, SCHEDULE_SLOT_MINUTES } from "../utils/scheduleTime";
import { telemetryApi, telemetryBreadcrumb, telemetryError, telemetryTiming } from "../utils/clientTelemetry";
import { sortByName } from "../utils/sorting";

type Scene =
  | "pulse"
  | "topology"
  | "why"
  | "health"
  | "brief"
  | "genesis"
  | "memory"
  | "safety"
  | "meeting"
  | "copilot";
type DayKey = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
const DAYS: Array<{ key: DayKey; label: string }> = [
  { key: "fsunday", label: "الأحد" },
  { key: "fmonday", label: "الاثنين" },
  { key: "ftuesday", label: "الثلاثاء" },
  { key: "fwednesday", label: "الأربعاء" },
  { key: "fthursday", label: "الخميس" },
];
const termChronology = (term: AdTerm | undefined | null) => {
  if (!term) return Number.NEGATIVE_INFINITY;
  const name = String(term.AdTermName || "");
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  const season = name.includes("الصيفي") ? 2 : name.includes("الثاني") ? 1 : name.includes("الأول") ? 0 : 0;
  return years ? Number(years[1]) * 10 + season : Number(term.AdTermId || 0);
};
const dayLabel = (row: FSchedule) =>
  DAYS.filter((day) => row[day.key])
    .map((day) => day.label)
    .join("، ");
interface Props {
  user: any;
  rows: FSchedule[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  terms: AdTerm[];
  collegeId: number;
  sectionId: number;
  termId: number;
  onOpenRow?: (row: FSchedule) => void;
  onRefresh?: () => void;
  experience?: ScheduleExperience;
  onEnsureWeek?: () => void;
  onPanelOpenChange?: (open: boolean) => void;
}

export default function LivingScheduleLayer({
  user,
  rows: sourceRows,
  courses,
  instructors,
  terms,
  collegeId,
  sectionId,
  termId,
  onOpenRow,
  onRefresh,
  experience,
  onEnsureWeek,
  onPanelOpenChange,
}: Props) {
  const power = Boolean(user?.SystemUserId);
  const [living, setLiving] = useState<any>(null),
    [scene, setScene] = useState<Scene | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  // Help is intentionally manual: it opens only when the user asks for it.
  const livingRequest = useRef(0);
  const sourceTargetRef = useRef(0);
  const [selectedId, setSelectedId] = useState<number>(sourceRows[0]?.id || 0),
    [whyResult, setWhyResult] = useState<any>(null),
    [candidateStart, setCandidateStart] = useState(""),
    [candidateEnd, setCandidateEnd] = useState(""),
    [candidateRoomCode, setCandidateRoomCode] = useState(""),
    [candidateRoomHall, setCandidateRoomHall] = useState(""),
    [candidateDay, setCandidateDay] = useState<"same" | DayKey>("same");
  const [sourceTerm, setSourceTerm] = useState(0),
    [genesis, setGenesis] = useState<any>(null),
    [genesisUndoPoint, setGenesisUndoPoint] = useState<any>(null),
    [genesisEditId, setGenesisEditId] = useState<number | null>(null),
    [genesisEdit, setGenesisEdit] = useState<any>(null),
    [genesisBulkEdit, setGenesisBulkEdit] = useState(false),
    [genesisDeleteAllConfirm, setGenesisDeleteAllConfirm] = useState(false),
    [memoryReason, setMemoryReason] = useState(""),
    [memory, setMemory] = useState<any>(null),
    [safety, setSafety] = useState<any[]>([]),
    [minutes, setMinutes] = useState<any>(null),
    [copilot, setCopilot] = useState<any>(null);
  useEffect(() => {
    onPanelOpenChange?.(Boolean(scene));
  }, [scene, onPanelOpenChange]);
  useEffect(() => () => onPanelOpenChange?.(false), [onPanelOpenChange]);
  const rows = useMemo(
    () =>
      living?.context
        ? sourceRows.filter(
            (r) =>
              r.AdCollegeId === living.context.collegeId &&
              r.AdSectionId === living.context.sectionId &&
              r.AdTermId === living.context.termId,
          )
        : sourceRows,
    [
      sourceRows,
      living?.context?.collegeId,
      living?.context?.sectionId,
      living?.context?.termId,
    ],
  );
  const selected = rows.find((r) => r.id === selectedId) || rows[0];
  const courseById = useMemo(
      () => new Map(courses.map((c) => [c.AdCourseId, c])),
      [courses],
    ),
    instructorById = useMemo(
      () => new Map(instructors.map((i) => [i.AdInstructorId, i])),
      [instructors],
    );
  const rooms = useMemo(
    () => [
      ...new Map(
        rows
          .filter((r) => r.AdRoomCode && r.AdRoomHall)
          .map((r) => [
            `${r.AdRoomCode}|${r.AdRoomHall}`,
            {
              key: `${r.AdRoomCode}|${r.AdRoomHall}`,
              label: `${r.AdRoomCode}/${r.AdRoomHall}`,
            },
          ]),
      ).values(),
    ],
    [rows],
  );
  const usedInstructors = useMemo(
    () =>
      [...new Set(rows.map((r) => r.AdInstructorId).filter(Boolean))]
        .map((id) => instructorById.get(id))
        .filter(Boolean) as AdInstructor[],
    [rows, instructorById],
  );
  const targetTerm = useMemo(
    () => terms.find((term) => term.AdTermId === termId) || null,
    [terms, termId],
  );
  const sourceTerms = useMemo(() => {
    const targetOrder = termChronology(targetTerm);
    return [...terms]
      .filter((term) => term.AdTermId !== termId && termChronology(term) < targetOrder)
      .sort((a, b) => termChronology(b) - termChronology(a));
  }, [terms, termId, targetTerm]);
  const contextQuery = () => {
    const p = new URLSearchParams();
    if (collegeId) p.set("collegeId", String(collegeId));
    if (sectionId) p.set("sectionId", String(sectionId));
    if (termId) p.set("termId", String(termId));
    return p.toString();
  };
  const json = async (url: string, options?: RequestInit) => {
    const started = performance.now();
    const method = String(options?.method || "GET").toUpperCase();
    telemetryBreadcrumb(`مركز القرار · ${method} ${url.split("?")[0]}`);
    let status = 0;
    try {
      const r = await fetch(url, options); status = r.status;
      const body = await r.text();
      let d:any = {};
      try { d = body ? JSON.parse(body) : {}; }
      catch { throw new Error(r.ok ? "وصل رد غير متوقع من الخادم." : `الخادم مشغول حالياً (${r.status}).`); }
      telemetryApi(`decision:${url.split("?")[0]}`, performance.now() - started, r.status, r.ok);
      if (!r.ok) {
        const issues = Array.isArray(d?.issues) ? d.issues.filter(Boolean).slice(0, 5) : [];
        const failure:any = new Error(issues.length ? `${d.error || "تعذر تنفيذ الطلب"}: ${issues.join(" · ")}` : (d.error || "تعذر تنفيذ الطلب"));
        failure.data = d;
        throw failure;
      }
      return d;
    } catch (error) {
      telemetryError(`decision:${url.split("?")[0]}`, error, performance.now() - started);
      if (!status) telemetryApi(`decision:${url.split("?")[0]}`, performance.now() - started, 0, false);
      throw error;
    }
  };
  const loadLiving = async () => {
    const request = ++livingRequest.current;
    try {
      const q = contextQuery();
      /* Shared with the experience layer, which asks for the same analysis in
         the same burst. Whoever gets here first issues the read; the rest wait
         on it. The staleness guard below is unchanged and still decides whether
         this component may use what comes back. */
      const d = await sharedLiving(
        livingScopeKey(collegeId, sectionId, termId),
        () => json(`/api/intelligence/living${q ? `?${q}` : ""}`),
      );
      if (request !== livingRequest.current) return;
      setLiving(d);
      if (!selectedId && rows[0]) setSelectedId(rows[0].id);
    } catch (e: any) {
      if (request === livingRequest.current) setError(e.message);
    }
  };
  useEffect(() => {
    // Never wait for the deferred experience bundle. Department accounts do not
    // load that bundle at all, and admin accounts load it during idle time; the
    // old guard therefore left departments stuck forever and made admins wait
    // before the command buttons even existed. The lightweight living read is
    // now requested immediately, while an already available shared result is
    // still reused.
    if (experience?.living) {
      setLiving(experience.living);
      return;
    }
    const shared = readLiving(livingScopeKey(collegeId, sectionId, termId));
    if (shared) { setLiving(shared); return; }
    void loadLiving();
  }, [experience?.living, collegeId, sectionId, termId, rows.length]);
  useEffect(() => {
    if (!selected) return;
    setSelectedId(selected.id);
    setCandidateStart(selected.fstarttime);
    setCandidateEnd(selected.fendtime);
    setCandidateRoomCode(selected.AdRoomCode);
    setCandidateRoomHall(selected.AdRoomHall);
    setCandidateDay("same");
    setWhyResult(null);
  }, [selected?.id]);
  useEffect(() => {
    if (sourceTargetRef.current !== termId) {
      sourceTargetRef.current = termId;
      setSourceTerm(sourceTerms[0]?.AdTermId || 0);
      return;
    }
    if (sourceTerms.some((term) => term.AdTermId === sourceTerm)) return;
    setSourceTerm(sourceTerms[0]?.AdTermId || 0);
  }, [termId, sourceTerms, sourceTerm]);
  const open = (next: Scene) => {
    const uiStarted = performance.now();
    setScene(next);
    setError("");
    setMessage("");
    requestAnimationFrame(() => telemetryTiming("decision-center.open", performance.now() - uiStarted));
    if (next === "safety") void loadSafety();
    if (next === "memory") void loadMemory();
  };
  const candidate = () => {
    if (!selected) return null;
    const c: any = {
      ...selected,
      fstarttime: candidateStart,
      fendtime: candidateEnd,
      AdRoomCode: candidateRoomCode,
      AdRoomHall: candidateRoomHall,
    };
    if (candidateDay !== "same")
      DAYS.forEach((day) => (c[day.key] = day.key === candidateDay));
    return c;
  };
  const runWhy = async (kind: "why" | "why-not") => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const d = await json(`/api/intelligence/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId: selected.id,
          candidate: candidate(),
          question: kind === "why-not" ? "لماذا ليس هذا الحل؟" : "لماذا هذا أفضل؟",
        }),
      });
      setWhyResult({ ...d, kind });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const savePlan = async (plan: any) => {
    setBusy(true);
    setError("");
    try {
      await json("/api/intelligence/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          name: `خطة إنقاذ · ${plan.title}`,
          source: "manual",
          rows: plan.rows,
        }),
      });
      setMessage("تم حفظ خطة الإنقاذ كمسودة فقط. الجدول الحقيقي لم يتغير.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  /**
   * What the copy would carry, read before it is made.
   *
   * The draft was always safe — it writes nothing real — but it was also silent
   * about the only thing that matters first: of three hundred lectures, which
   * ones carry a decision? This asks, and says so in one sentence, so the
   * coordinator spends their attention on the twenty rows that need a person
   * rather than on the two hundred and eighty that do not.
   */
  const [rollover, setRollover] = useState<any>(null);
  useEffect(() => {
    if (scene !== "genesis" || !sourceTerm || !collegeId || !sectionId) { setRollover(null); return; }
    let alive = true;
    (async () => {
      try {
        const query = new URLSearchParams({
          collegeId: String(collegeId), sectionId: String(sectionId), sourceTermId: String(sourceTerm),
        });
        const data = await json(`/api/intelligence/rollover?${query}`);
        if (alive) setRollover(data);
      } catch { if (alive) setRollover(null); }
    })();
    return () => { alive = false; };
  }, [scene, sourceTerm, collegeId, sectionId]);

  const runGenesis = async () => {
    if (!sourceTerm) return;
    setBusy(true);
    setError("");
    setGenesis(null);
    setGenesisUndoPoint(null);
    try {
      const d = await json("/api/intelligence/genesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          sourceTermId: sourceTerm,
          targetTermId: termId,
        }),
      });
      setGenesis(d);
      setMessage(
        d.reviewRequired
          ? `تم بناء المسودة بنجاح، ومعها ${d.reviewRequired} ملاحظة واضحة للمراجعة قبل النشر.`
          : "تم بناء مسودة بداية الفصل دون نشر أي موعد."
      );
      onEnsureWeek?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const beginGenesisEdit = (row: any) => {
    setGenesisEditId(Number(row.id));
    const source = genesis?.draftRows?.find?.((item:any) => Number(item.id) === Number(row.id));
    setGenesisEdit({
      AdInstructorId: Number(source?.AdInstructorId || instructors.find(i => i.AdInstructorName === row.instructor)?.AdInstructorId || 0),
      fstarttime: row.start || source?.fstarttime || "",
      fendtime: row.end || source?.fendtime || "",
      AdRoomCode: row.building || source?.AdRoomCode || "",
      AdRoomHall: row.hall || source?.AdRoomHall || "",
      fsunday: Boolean(row.fsunday ?? source?.fsunday),
      fmonday: Boolean(row.fmonday ?? source?.fmonday),
      ftuesday: Boolean(row.ftuesday ?? source?.ftuesday),
      fwednesday: Boolean(row.fwednesday ?? source?.fwednesday),
      fthursday: Boolean(row.fthursday ?? source?.fthursday),
    });
  };
  const saveGenesisRow = async () => {
    const draftId = String(genesis?.draft?.id || "").trim();
    if (!draftId || genesisEditId == null || !genesisEdit) return;
    setBusy(true); setError("");
    try {
      const result = await json(`/api/intelligence/drafts/${encodeURIComponent(draftId)}/rows/${encodeURIComponent(String(genesisEditId))}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(genesisEdit),
      });
      const instructor = instructors.find(i => Number(i.AdInstructorId) === Number(genesisEdit.AdInstructorId));
      setGenesis((current:any) => current ? {
        ...current,
        issues: result.issues || [], issueRowIds: result.issueRowIds || [], rowIssues: result.rowIssues || {}, reviewRequired: (result.issues || []).length,
        previewRows: (current.previewRows || []).map((row:any) => Number(row.id) === genesisEditId ? {
          ...row, start: genesisEdit.fstarttime, end: genesisEdit.fendtime, building: genesisEdit.AdRoomCode, hall: genesisEdit.AdRoomHall,
          instructor: instructor?.AdInstructorName || row.instructor,
          fsunday:Boolean(genesisEdit.fsunday),fmonday:Boolean(genesisEdit.fmonday),ftuesday:Boolean(genesisEdit.ftuesday),fwednesday:Boolean(genesisEdit.fwednesday),fthursday:Boolean(genesisEdit.fthursday),
          days:[["fsunday","الأحد"],["fmonday","الاثنين"],["ftuesday","الثلاثاء"],["fwednesday","الأربعاء"],["fthursday","الخميس"]].filter(([key]) => Boolean(genesisEdit[key])).map(([,label]) => label).join(" · "),
        } : row),
      } : current);
      const editedId = genesisEditId;
      const currentRows = Array.isArray(genesis?.previewRows) ? genesis.previewRows : [];
      const nextRow = genesisBulkEdit ? currentRows[currentRows.findIndex((row:any) => Number(row.id) === Number(editedId)) + 1] : null;
      setGenesisEditId(null); setGenesisEdit(null);
      setMessage(result.ready ? "تمت معالجة الموانع. المسودة جاهزة للنشر." : `تم حفظ التعديل. بقيت ${(result.issues || []).length} ملاحظة.`);
      if (nextRow) window.setTimeout(() => beginGenesisEdit(nextRow), 0);
      else if (genesisBulkEdit) setGenesisBulkEdit(false);
    } catch (e:any) { setError(e.message); } finally { setBusy(false); }
  };

  const deleteGenesisRow = async (rowId: number) => {
    const draftId = String(genesis?.draft?.id || "").trim();
    if (!draftId || !rowId) return;
    setBusy(true); setError("");
    try {
      const result = await json(`/api/intelligence/drafts/${encodeURIComponent(draftId)}/rows/${encodeURIComponent(String(rowId))}`, { method: "DELETE" });
      setGenesis((current:any) => current ? {
        ...current,
        previewRows: (current.previewRows || []).filter((row:any) => Number(row.id) !== Number(rowId)),
        draftRows: (current.draftRows || []).filter((row:any) => Number(row.id) !== Number(rowId)),
        issues: result.issues || [], issueRowIds: result.issueRowIds || [], rowIssues: result.rowIssues || {}, reviewRequired: (result.issues || []).length,
      } : current);
      if (genesisEditId === rowId) { setGenesisEditId(null); setGenesisEdit(null); }
      setMessage(result.ready ? "تم حذف الموعد وإعادة الفحص. المسودة جاهزة للنشر." : `تم حذف الموعد وإعادة الفحص · بقيت ${(result.issues || []).length} ملاحظة.`);
    } catch (e:any) { setError(e.message); } finally { setBusy(false); }
  };
  const deleteAllGenesisRows = async () => {
    const draftId = String(genesis?.draft?.id || "").trim();
    if (!draftId) return;
    setBusy(true); setError("");
    try {
      const result = await json(`/api/intelligence/drafts/${encodeURIComponent(draftId)}/rows`, { method: "DELETE", headers: { "x-schedule-confirm": "delete-all-draft-rows" } });
      setGenesis((current:any) => current ? { ...current, previewRows: [], draftRows: [], issues: result.issues || [], issueRowIds: [], rowIssues: {}, reviewRequired: 0 } : current);
      setGenesisEditId(null); setGenesisEdit(null); setGenesisBulkEdit(false); setGenesisDeleteAllConfirm(false);
      setMessage("تم حذف جميع المواعيد من المسودة. لم يُنشر أي تغيير على الجدول الرسمي.");
    } catch (e:any) { setError(e.message); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!genesis?.issueRowIds?.length || genesisEditId != null) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(".genesis-row-issue")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [genesis?.draft?.id, genesis?.issueRowIds, genesisEditId]);

  const publishGenesisDraft = async () => {
    const draftId = String(genesis?.draft?.id || "").trim();
    if (!draftId) return;
    // The publish endpoint captures a safety version before changing the live
    // timetable. Keep this a single in-app action instead of a native Safari
    // dialog that can be suppressed by the browser.
    setBusy(true);
    setError("");
    try {
      const result = await json(`/api/intelligence/drafts/${encodeURIComponent(draftId)}/publish`, {
        method: "POST",
        headers: { "x-schedule-confirm": "publish" },
      });
      const q = contextQuery();
      const points = await json(`/api/intelligence/safety-net?${q}`).catch(() => []);
      const undoPoint = Array.isArray(points) ? points[0] : null;
      setGenesisUndoPoint(undoPoint);
      setGenesis((current: any) => current ? { ...current, published: true, publication: result?.publication } : current);
      setMessage(`تم نشر المسودة على الجدول الرسمي بنجاح${result?.count ? ` · ${result.count} موعد` : ""}${result?.adjusted ? ` · عالج النظام ${result.adjusted} موعداً زمنياً بأمان قبل النشر` : ""}.`);
      await loadLiving();
      onRefresh?.();
    } catch (e: any) {
      if (e?.data) setGenesis((current: any) => current ? { ...current, issues: e.data.issues || current.issues, issueRowIds: e.data.issueRowIds || current.issueRowIds, rowIssues: e.data.rowIssues || current.rowIssues, reviewRequired: (e.data.issues || []).length } : current);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const undoGenesisPublish = async () => {
    if (!genesisUndoPoint?.id) return;
    // Undo also snapshots the current state before restoring, so it is itself
    // reversible and does not need a browser-native confirmation modal.
    setBusy(true);
    setError("");
    try {
      const d = await json(`/api/intelligence/safety-net/${genesisUndoPoint.id}/undo`, {
        method: "POST",
        headers: { "x-schedule-confirm": "decision-undo" },
      });
      setGenesis((current: any) => current ? { ...current, published: false } : current);
      setGenesisUndoPoint(null);
      setMessage(d.message || "تم التراجع عن النشر بنجاح.");
      await loadLiving();
      onRefresh?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const loadMemory = async () => {
    if (!power) return;
    try {
      const q = new URLSearchParams({
        collegeId: String(collegeId),
        sectionId: String(sectionId),
      });
      if (selected?.AdCourseId) q.set("courseId", String(selected.AdCourseId));
      setMemory(await json(`/api/intelligence/decision-memory?${q}`));
    } catch (e: any) {
      setError(e.message);
    }
  };
  const saveMemory = async () => {
    if (!selected || !memoryReason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await json("/api/intelligence/decision-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collegeId,
          sectionId,
          termId,
          scheduleId: selected.id,
          AdCourseId: selected.AdCourseId,
          SCode: selected.SCode,
          kind: "rejected-option",
          reason: memoryReason,
          optionSignature: whyResult
            ? JSON.stringify(whyResult.candidate || {})
            : undefined,
        }),
      });
      setMemoryReason("");
      await loadMemory();
      setMessage("تم حفظ سبب القرار في ذاكرة القسم للفصول القادمة.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const loadSafety = async () => {
    if (!power) return;
    try {
      const q = contextQuery();
      setSafety(await json(`/api/intelligence/safety-net?${q}`));
    } catch (e: any) {
      setError(e.message);
    }
  };
  const undoDecision = async (item: any) => {
    // Restoring a point creates another safety snapshot first, so undo remains
    // reversible without a browser-native confirmation dialog.
    setBusy(true);
    setError("");
    try {
      const d = await json(`/api/intelligence/safety-net/${item.id}/undo`, {
        method: "POST",
        headers: { "x-schedule-confirm": "decision-undo" },
      });
      setMessage(d.message || "تم الاسترجاع");
      await loadSafety();
      await loadLiving();
      onRefresh?.();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const runMeeting = async () => {
    setBusy(true);
    setError("");
    try {
      setMinutes(
        await json("/api/intelligence/meeting-minutes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collegeId,
            sectionId,
            termId,
            rowId: selected?.id,
            approvedBy: user?.Name,
          }),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const runCopilot = async (
    contextType: "schedule" | "room" | "instructor" | "day",
    value?: string | number,
  ) => {
    setBusy(true);
    setError("");
    setCopilot(null);
    try {
      setCopilot(
        await json("/api/intelligence/context-copilot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collegeId,
            sectionId,
            termId,
            contextType,
            rowId: contextType === "schedule" ? selected?.id : undefined,
            value,
          }),
        }),
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!living)
    return (
      <section className="living-command-deck living-loading no-print" aria-label="حالة الجدول ومركز القرار">
        <div className="living-pulse-core">
          <span className="pulse-beacon info" />
          <div>
            <small>حالة الجدول</small>
            <strong>أقرأ نبض الجدول…</strong>
            <p>مركز القرار جاهز؛ مؤشرات الصحة تصل بعد لحظة.</p>
          </div>
        </div>
        <div className="living-health-strip" aria-label="مؤشرات صحة الجدول قيد التحميل">
          {["الجودة", "المرونة", "العدالة"].map(label => (
            <span key={label} style={{ ["--reading" as any]: "0%" }}>
              <small>{label}</small><b>—</b>
            </span>
          ))}
        </div>
        <div className="living-command-actions">
          <button
            className="living-more"
            data-guide-feature-id="page.intelligence"
            type="button"
            onClick={() => { open("pulse"); void loadLiving(); }}
            disabled={busy}
          >
            <Sparkles />
            مركز القرار
          </button>
        </div>
      </section>
    );
  const sceneItems: Array<{ id: Scene; label: string; icon: React.ReactNode }> = [
    { id: "pulse", label: "نظرة عامة", icon: <Activity /> },
    { id: "topology", label: "خريطة الضغط", icon: <Network /> },
    { id: "health", label: "الصحة والعدالة", icon: <Gauge /> },
    { id: "brief" as Scene, label: "ملخص الدقيقة", icon: <Zap /> },
    { id: "genesis" as Scene, label: "بداية الفصل", icon: <Dna /> },
    { id: "safety" as Scene, label: "شبكة الأمان", icon: <RotateCcw /> },
  ];
  return (
    <>
      <section className="living-command-deck no-print" aria-label="حالة الجدول ومركز القرار">
        <div className="living-pulse-core">
          <span className={`pulse-beacon ${living.pulse?.items?.[0]?.severity || "info"}`} />
          <div>
            <small>حالة الجدول</small>
            <strong>{living.health?.descriptor || living.pulse?.message || "القراءة جاهزة"}</strong>
            <p>{living.pulse?.items?.[0]?.title || living.pulse?.message || "لا توجد ملاحظة حرجة الآن."}</p>
          </div>
        </div>
        <div className="living-health-strip" aria-label="مؤشرات صحة الجدول">
          {[
            { label: "الجودة", value: living.health?.quality },
            { label: "المرونة", value: living.health?.resilience },
            { label: "العدالة", value: living.health?.fairness },
          ].map(metric => {
            const reading = Number(metric.value);
            const known = Number.isFinite(reading);
            return (
              <span
                key={metric.label}
                /* The meter reads the number rather than repeating it: a score
                   that slips is short before it is read. */
                style={{ ["--reading" as any]: `${known ? Math.max(0, Math.min(100, reading)) : 0}%` }}
              >
                <small>{metric.label}</small>
                <b>{known ? reading : "—"}</b>
              </span>
            );
          })}
        </div>
        <div className="living-command-actions">
          <button className="living-more" data-guide-feature-id="page.intelligence" onClick={() => open("pulse")} >
            <Sparkles />
            مركز القرار
          </button>
        </div>
      </section>
      {scene ? (
        <div
          className="living-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setScene(null);
          }}
        >
          <aside className={`living-panel scene-${scene}`}>
            <header className="living-panel-head">
              <span className="living-panel-scene-icon">
                {sceneItems.find((x) => x.id === scene)?.icon}
              </span>
              <div className="living-panel-heading">
                <span>لوحة الذكاء</span>
                <div>
                  <h2>{sceneItems.find((x) => x.id === scene)?.label}</h2>
                  <p>{living.context?.sectionName} · {living.context?.termName}</p>
                </div>
              </div>
              <button onClick={() => setScene(null)} aria-label="إغلاق">
                <X />
              </button>
            </header>
            <nav className="living-scene-nav">
              {sceneItems.map((item) => (
                <button
                  key={item.id}
                  className={scene === item.id ? "active" : ""}
                  data-guide-target={`living.scene.${item.id}`}
                  onClick={() => open(item.id)}
                  aria-pressed={scene === item.id}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            {experience ? (
              <section className="living-experience-tools" aria-label="اختصارات مركز القرار">
                <button type="button" onClick={() => { setScene(null); void experience.openDecision(); }} disabled={!rows.length}>
                  <BrainCircuit /><span>القرار الأهم الآن</span>
                </button>
                <button type="button" onClick={() => { setScene(null); experience.setSignatureOpen(true); }} disabled={!rows.length}>
                  <Gauge /><span>بصمة القسم</span>
                </button>
              </section>
            ) : null}
            {error ? <Notice>{error}</Notice> : null}
            {message ? <Notice type="success">{message}</Notice> : null}
            <div className="living-panel-body">
              {scene === "pulse" ? (
                <PulseScene living={living} onGo={(s) => open(s)} />
              ) : null}
              {scene === "topology" ? (
                <TopologyScene topology={living.topology} />
              ) : null}
              {scene === "why" ? (
                <div className="why-scene">
                  {/*
                    The answer sits where the eye already is.
                    Reading it used to mean scrolling past the whole form that
                    produced it, which is the panel making the reader do the
                    work of finding its own reply.
                  */}
                  {whyResult ? (
                    <WhyResult
                      data={whyResult}
                      onRemember={() => open("memory")}
                    />
                  ) : null}
                  <ContextPicker
                    selectedId={selected?.id || 0}
                    rows={rows}
                    courseById={courseById}
                    instructorById={instructorById}
                    onChange={setSelectedId}
                  />
                  {selected ? (
                    <div className="why-builder">
                      <div className="why-current">
                        <span>الوضع الحالي</span>
                        <strong>
                          {selected.AdCourseName} · شعبة {selected.SCode}
                        </strong>
                        <small>
                          {dayLabel(selected)} · {formatScheduleTimeRange(selected.fstarttime, selected.fendtime)} · {selected.AdRoomCode}/
                          {selected.AdRoomHall}
                        </small>
                      </div>
                      <div className="why-fields">
                        <label>
                          <span>اليوم</span>
                          <select
                            value={candidateDay}
                            onChange={(e) =>
                              setCandidateDay(e.target.value as any)
                            }
                          >
                            <option value="same">نفس الأيام</option>
                            {DAYS.map((d) => (
                              <option value={d.key} key={d.key}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span>البداية</span>
                          <input
                            type="time"
                            min={SCHEDULE_DAY_START_TIME}
                            max={SCHEDULE_DAY_END_TIME}
                            step={60}
                            value={candidateStart}
                            onChange={(e) => setCandidateStart(e.target.value)}
                          />
                        </label>
                        <label>
                          <span>النهاية</span>
                          <input
                            type="time"
                            min={SCHEDULE_DAY_START_TIME}
                            max={SCHEDULE_DAY_END_TIME}
                            step={60}
                            value={candidateEnd}
                            onChange={(e) => setCandidateEnd(e.target.value)}
                          />
                        </label>
                        <label>
                          <span>المبنى</span>
                          <input
                            value={candidateRoomCode}
                            onChange={(e) =>
                              setCandidateRoomCode(e.target.value)
                            }
                          />
                        </label>
                        <label>
                          <span>القاعة</span>
                          <input
                            value={candidateRoomHall}
                            onChange={(e) =>
                              setCandidateRoomHall(e.target.value)
                            }
                          />
                        </label>
                      </div>
                      <div className="why-actions">
                        <PrimaryButton
                          disabled={busy}
                          onClick={() => runWhy("why")}
                        >
                          <Sparkles />
                          لماذا هذا أفضل؟
                        </PrimaryButton>
                        <SecondaryButton
                          disabled={busy}
                          onClick={() => runWhy("why-not")}
                        >
                          <CircleHelp />
                          لماذا ليس هذا الحل؟
                        </SecondaryButton>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {scene === "health" ? <HealthScene living={living} /> : null}
              {scene === "brief" ? <BriefScene brief={living.brief} /> : null}
              {scene === "genesis" ? (
                <div className="genesis-scene">
                  {/* Three numbered marks instead of the sentence that used to
                      describe them. The paragraph said «اختر المصدر، ثم أنشئ،
                      ثم راجع» — which is the shape of the controls directly
                      below it, written out in words. Drawing the shape says the
                      same thing without asking to be read. */}
                  <div className="genesis-hero">
                    <Dna />
                    <div>
                      <small>بداية الفصل</small>
                      <h3>مسودة الفصل، في ثلاث خطوات</h3>
                      <ol className="genesis-steps" aria-label="خطوات بناء المسودة">
                        <li><b>١</b><span>اختر المصدر</span></li>
                        <li><b>٢</b><span>أنشئ المسودة</span></li>
                        <li><b>٣</b><span>راجع قبل النشر</span></li>
                      </ol>
                    </div>
                  </div>
                  {rollover && rollover.sourceRows ? (
                    <div className="genesis-reading">
                      <strong>{rollover.sentence}</strong>
                      <div className="genesis-reading-grid">
                        <span><b className="num">{rollover.confident}</b> يمكن نقلها بثقة</span>
                        {rollover.newCourses?.length ? <span><b className="num">{rollover.newCourses.length}</b> مقرراً جديداً</span> : null}
                        {rollover.unavailableInstructors?.length ? <span><b className="num">{rollover.unavailableInstructors.length}</b> أستاذاً غير متاح</span> : null}
                        {rollover.changedCourses?.length ? <span><b className="num">{rollover.changedCourses.length}</b> مقرراً تغيّر</span> : null}
                        {rollover.retiredRooms?.length ? <span><b className="num">{rollover.retiredRooms.length}</b> قاعة متوقفة</span> : null}
                        {rollover.concernCount ? <span className="is-concern"><b className="num">{rollover.concernCount}</b> قراراً يستحق المراجعة</span> : null}
                      </div>
                      {/* ── وهل سيبدو كجدولك؟ ─────────────────────────────────
                          The counts above say what survives the copy. This says
                          whether the survivors look like this department's own
                          work — read from its start ladders and lecture lengths
                          across every term it has, not from the source term
                          alone. Absent entirely when the history is too thin to
                          have a habit: a department in its first year has no
                          style to be measured against. */}
                      {rollover.style ? (
                        <div className="genesis-style">
                          <div className="genesis-style-dial" style={{ ["--share" as any]: `${rollover.style.share}%` }}>
                            <b className="num">{rollover.style.share}٪</b>
                            <small>بأسلوب قسمك</small>
                          </div>
                          <div className="genesis-style-read">
                            <span className="is-good"><Fingerprint aria-hidden="true" /><b className="num">{rollover.style.inStyle}</b> على النمط</span>
                            {rollover.style.offStyle ? <span className="is-off"><AlertTriangle aria-hidden="true" /><b className="num">{rollover.style.offStyle}</b> خارجه</span> : null}
                            <em>مقروء من {rollover.style.learnedFrom?.terms || 0} فصلاً · {rollover.style.learnedFrom?.rows || 0} موعد</em>
                          </div>
                        </div>
                      ) : null}
                      {rollover.style?.notes?.length ? (
                        <ul className="genesis-concerns genesis-style-notes">
                          {rollover.style.notes.map((note: any) => (
                            <li key={`style-${note.id}`}>
                              <strong>{note.course || `موعد ${note.id}`}</strong>
                              <span>شعبة {note.section} · {note.text}</span>
                            </li>
                          ))}
                          {rollover.style.offStyle > rollover.style.notes.length
                            ? <li className="genesis-concerns-more">و{rollover.style.offStyle - rollover.style.notes.length} أخرى.</li>
                            : null}
                        </ul>
                      ) : null}
                      {rollover.concerns?.length ? (
                        <ul className="genesis-concerns">
                          {rollover.concerns.slice(0, 6).map((concern: any) => (
                            <li key={concern.id}>
                              <strong>{concern.course || `موعد ${concern.id}`}</strong>
                              <span>شعبة {concern.section} · {concern.why}</span>
                            </li>
                          ))}
                          {rollover.concernCount > 6 ? <li className="genesis-concerns-more">و{rollover.concernCount - 6} أخرى.</li> : null}
                        </ul>
                      ) : null}
                      <small>{rollover.guardrail}</small>
                    </div>
                  ) : null}
                  <div className="genesis-controls">
                    <label>
                      <span>1 · الفصل المصدر</span>
                      <select
                        value={sourceTerm}
                        onChange={(e) => setSourceTerm(Number(e.target.value))}
                        disabled={!sourceTerms.length}
                      >
                        {!sourceTerms.length ? <option value="">لا يوجد فصل سابق متاح</option> : null}
                        {sourceTerms.map((t) => (
                            <option key={t.AdTermId} value={t.AdTermId} title={t.AdTermName}>
                              {t.AdTermName}
                            </option>
                          ))}
                      </select>
                      {sourceTerm ? (
                        <output className="genesis-term-full" title={sourceTerms.find(t => t.AdTermId === sourceTerm)?.AdTermName || ""}>
                          {sourceTerms.find(t => t.AdTermId === sourceTerm)?.AdTermName || ""}
                        </output>
                      ) : null}
                      <small>هذه هي الفصول السابقة المتاحة للنسخ منها فقط.</small>
                    </label>
                    <div className="genesis-arrow">
                      <ArrowLeft />
                    </div>
                    <label>
                      <span>2 · الفصل المستهدف الآن</span>
                      <b title={targetTerm?.AdTermName || living.context?.termName}>
                        {targetTerm?.AdTermName || living.context?.termName}
                      </b>
                      <small>ستُنشأ هنا مسودة تجريبية فقط؛ الجدول الحقيقي لن يتغير قبل قرار النشر.</small>
                    </label>
                    <PrimaryButton
                      disabled={busy || !sourceTerm || !sourceTerms.length}
                      onClick={runGenesis}
                    >
                      <WandSparkles />
                      أنشئ المسودة للفصل الحالي
                    </PrimaryButton>
                  </div>
                  {genesis ? (
                    <>
                      <div className="genesis-result">
                        <CheckCircle2 />
                        <div>
                          <strong>{genesis.draft?.name}</strong>
                          <p>
                            تم نسخ {genesis.coverage?.copiedRows} موعدًا إلى المسودة الجديدة
                            · الجودة {genesis.analysis?.score}/100 · الموانع{" "}
                            {genesis.analysis?.conflicts}
                            {genesis.reviewRequired ? ` · ${genesis.reviewRequired} ملاحظة للمراجعة` : ""}
                          </p>
                          <small>{genesis.guardrail}</small>
                          {Array.isArray(genesis.issues) && genesis.issues.length ? (
                            <ul className="genesis-publish-issues">
                              {genesis.issues.slice(0, 6).map((issue: string, index: number) => <li key={`${index}-${issue}`}>{issue}</li>)}
                            </ul>
                          ) : null}
                        </div>
                      </div>
                      {Array.isArray(genesis.previewRows) && genesis.previewRows.length ? (
                        <section className="genesis-preview" aria-label="الجدول المنسوخ داخل المسودة">
                          <header>
                            <div>
                              <small>النسخة التي تم إنشاؤها فعليًا</small>
                              <strong>الجدول المنسوخ داخل المسودة</strong>
                            </div>
                            <b>{genesis.previewRows.length}</b>
                          </header>
                          <div className="genesis-bulk-tools" role="toolbar" aria-label="إجراءات سريعة على المسودة">
                            <button type="button" onClick={() => { setGenesisBulkEdit(true); const first = genesis.previewRows?.[0]; if (first) beginGenesisEdit(first); }} disabled={busy || !genesis.previewRows?.length}><Save /> تعديل للجميع</button>
                            {!genesisDeleteAllConfirm ? <button type="button" data-guide-ignore="حذف جماعي داخل مسودة بداية الفصل ويتطلب تأكيدًا صريحًا" className="danger" onClick={() => setGenesisDeleteAllConfirm(true)} disabled={busy || !genesis.previewRows?.length}><Trash2 /> حذف للجميع</button> : <span className="genesis-delete-confirm"><b>حذف كل المواعيد من المسودة؟</b><button type="button" data-guide-ignore="تأكيد حذف جماعي داخل المسودة فقط" className="danger" onClick={() => void deleteAllGenesisRows()} disabled={busy}>نعم، احذف</button><button type="button" onClick={() => setGenesisDeleteAllConfirm(false)}>إلغاء</button></span>}
                          </div>
                          <div className="genesis-preview-scroll">
                            <table>
                              <thead>
                                <tr><th>م</th><th>المقرر</th><th>الشعبة</th><th>الأيام</th><th>الوقت</th><th>القاعة</th><th>الأستاذ</th><th>الإجراء</th></tr>
                              </thead>
                              <tbody>
                                {genesis.previewRows.map((row: any) => {
                                  const flagged = (genesis.issueRowIds || []).map(Number).includes(Number(row.id));
                                  const editing = genesisEditId === Number(row.id);
                                  return <React.Fragment key={`${row.id}-${row.index}`}>
                                    <tr className={flagged ? "genesis-row-issue" : ""}>
                                      <td>{row.index}</td>
                                      <td><strong>{row.courseName}</strong><small dir="ltr">{row.courseCode || "—"}</small></td>
                                      <td dir="ltr">{row.section || "—"}</td>
                                      <td>{row.days || "—"}</td>
                                      <td dir="ltr">{formatScheduleTimeRange(row.start, row.end)}</td>
                                      <td dir="ltr">{[row.building,row.hall].filter(Boolean).join("/") || "—"}</td>
                                      <td><span>{row.instructor || "—"}</span></td>
                                      <td><div className="genesis-row-actions"><button className="genesis-fix" type="button" onClick={() => beginGenesisEdit(row)}><Save /> تعديل</button><button className="genesis-delete" data-guide-ignore="حذف موعد واحد من مسودة بداية الفصل فقط" type="button" onClick={() => void deleteGenesisRow(Number(row.id))} disabled={busy}><Trash2 /> حذف</button></div></td>
                                    </tr>
                                    {flagged ? <tr className="genesis-row-reason"><td colSpan={8}><ShieldAlert /><strong>سبب المنع:</strong><span>{(genesis.rowIssues?.[String(row.id)] || [])[0] || "هذا الموعد مرتبط بمشكلة تمنع النشر."}</span></td></tr> : null}
                                    {editing ? <tr className="genesis-inline-editor"><td colSpan={8}><div>
                                      <label><span>الأستاذ</span><select value={genesisEdit?.AdInstructorId || ""} onChange={e => setGenesisEdit((v:any)=>({...v,AdInstructorId:Number(e.target.value)||0}))}><option value="">اختر</option>{sortByName(instructors, i => i.AdInstructorName).map(i=><option key={i.AdInstructorId} value={i.AdInstructorId}>{i.AdInstructorName}</option>)}</select></label>
                                      <label><span>من</span><input type="time" value={genesisEdit?.fstarttime || ""} onChange={e=>setGenesisEdit((v:any)=>({...v,fstarttime:e.target.value}))}/></label>
                                      <label><span>إلى</span><input type="time" value={genesisEdit?.fendtime || ""} onChange={e=>setGenesisEdit((v:any)=>({...v,fendtime:e.target.value}))}/></label>
                                      <label><span>المبنى</span><input value={genesisEdit?.AdRoomCode || ""} onChange={e=>setGenesisEdit((v:any)=>({...v,AdRoomCode:e.target.value}))}/></label>
                                      <label><span>القاعة</span><input value={genesisEdit?.AdRoomHall || ""} onChange={e=>setGenesisEdit((v:any)=>({...v,AdRoomHall:e.target.value}))}/></label>
                                      <fieldset className="genesis-days"><legend>الأيام</legend>{[["fsunday","الأحد"],["fmonday","الاثنين"],["ftuesday","الثلاثاء"],["fwednesday","الأربعاء"],["fthursday","الخميس"]].map(([key,label]) => <label key={key}><input type="checkbox" checked={Boolean(genesisEdit?.[key])} onChange={e=>setGenesisEdit((v:any)=>({...v,[key]:e.target.checked}))}/><span>{label}</span></label>)}</fieldset>
                                      <PrimaryButton type="button" onClick={() => void saveGenesisRow()} disabled={busy}><Save />حفظ وفحص</PrimaryButton>
                                      <GhostButton type="button" onClick={() => {setGenesisEditId(null);setGenesisEdit(null);setGenesisBulkEdit(false);}}>إلغاء</GhostButton>
                                    </div></td></tr> : null}
                                  </React.Fragment>;
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="genesis-preview-actions">
                            <p>{genesis.published ? "هذه المسودة منشورة الآن على الجدول الرسمي." : "راجع الجدول، ثم انشره من هنا مباشرة عندما يكون جاهزاً."}</p>
                            <div>
                              {!genesis.published ? (
                                <PrimaryButton type="button" data-guide-feature-id="schedule.publish" onClick={() => void publishGenesisDraft()} disabled={busy || !genesis?.draft?.id || !genesis?.previewRows?.length || Boolean(genesis?.issues?.length)} title={genesis?.issues?.length ? "عالج الملاحظات المعلّمة أولاً" : undefined}>
                                  <Upload /> انشر الآن
                                </PrimaryButton>
                              ) : null}
                              {genesis.published && genesisUndoPoint ? (
                                <SecondaryButton type="button" data-guide-feature-id="schedule.undo" onClick={() => void undoGenesisPublish()} disabled={busy}>
                                  <RotateCcw /> تراجع عن النشر
                                </SecondaryButton>
                              ) : null}
                            </div>
                          </div>
                        </section>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              {scene === "memory" ? (
                <div className="memory-scene">
                  <ContextPicker
                    selectedId={selected?.id || 0}
                    rows={rows}
                    courseById={courseById}
                    instructorById={instructorById}
                    onChange={(id) => {
                      setSelectedId(id);
                      setTimeout(() => void loadMemory(), 0);
                    }}
                  />
                  <div className="memory-compose">
                    <History />
                    <div>
                      <strong>لماذا رفضنا هذا البديل؟</strong>
                      <p>
                        اكتب السبب مرة واحدة؛ في الفصل القادم لن يتعامل النظام
                        مع القرار كأنه لم يحدث.
                      </p>
                    </div>
                    <textarea
                      value={memoryReason}
                      onChange={(e) => setMemoryReason(e.target.value)}
                      placeholder="مثال: رُفض الثلاثاء 12 — القاعة لا تناسب المقرر"
                      maxLength={700}
                    />
                    <PrimaryButton
                      disabled={busy || memoryReason.trim().length < 3}
                      onClick={saveMemory}
                    >
                      احفظ الذاكرة
                    </PrimaryButton>
                  </div>
                  <div className="memory-list">
                    {memory?.recent?.length ? (
                      memory.recent.map((m: any) => (
                        <article key={m.id}>
                          <span>
                            <History />
                          </span>
                          <div>
                            <strong>{m.reason}</strong>
                            <small>
                              {new Date(m.createdAt).toLocaleString("ar-KW-u-nu-latn")} ·{" "}
                              {m.userName}
                            </small>
                          </div>
                          <Badge
                            tone={
                              m.kind === "rejected-option" ? "warning" : "info"
                            }
                          >
                            {m.kind === "rejected-option"
                              ? "خيار مرفوض"
                              : "قرار"}
                          </Badge>
                        </article>
                      ))
                    ) : (
                      <div className="living-empty">
                        لا توجد ذاكرة قرار سابقة لهذا المقرر.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
              {scene === "safety" ? (
                <div className="safety-scene">
                  <div className="safety-intro">
                    <ShieldCheck />
                    <div>
                      <small>شبكة أمان القرار</small>
                      <h3>التراجع الآمن عن القرار</h3>
                      <p>
                        كل استرجاع يحفظ نقطة أمان جديدة أولًا؛ لن تختفي الحالة
                        الحالية بلا رجعة.
                      </p>
                    </div>
                  </div>
                  <div className="safety-list">
                    {safety.length ? (
                      safety.map((item) => (
                        <article key={item.id}>
                          <span className="safety-node">
                            <RotateCcw />
                          </span>
                          <div>
                            <strong>{item.label}</strong>
                            <small>
                              {new Date(item.createdAt).toLocaleString("ar-KW-u-nu-latn")}{" "}
                              · {item.userName} · {item.rowCount} موعد
                            </small>
                          </div>
                          <GhostButton
                            disabled={busy}
                            onClick={() => undoDecision(item)}
                          >
                            استرجع هذا القرار
                          </GhostButton>
                        </article>
                      ))
                    ) : (
                      <div className="living-empty">لا توجد نقاط أمان بعد.</div>
                    )}
                  </div>
                </div>
              ) : null}
              {scene === "meeting" ? (
                <div className="meeting-scene">
                  <ContextPicker
                    selectedId={selected?.id || 0}
                    rows={rows}
                    courseById={courseById}
                    instructorById={instructorById}
                    onChange={setSelectedId}
                  />
                  <div className="meeting-command">
                    <div>
                      <small>محضر القرار</small>
                      <h3>حوّل نقاش الجدول إلى محضر قرار</h3>
                      <p>
                        المشكلة، البدائل، سبب الاختيار، الأثر المتوقع،
                        والمناقشات المرتبطة.
                      </p>
                    </div>
                    <PrimaryButton disabled={busy} onClick={runMeeting}>
                      <FileClock />
                      ولّد المحضر
                    </PrimaryButton>
                  </div>
                  {minutes ? (
                    <div className="minutes-paper">
                      <header>
                        <span>{minutes.title}</span>
                        <small>
                          {new Date(minutes.generatedAt).toLocaleString(
                            "ar-KW-u-nu-latn",
                          )}
                        </small>
                      </header>
                      <section>
                        <b>المشكلة</b>
                        <p>{minutes.problem}</p>
                      </section>
                      <section>
                        <b>البدائل</b>
                        {minutes.alternatives?.map((a: any) => (
                          <p key={a.id}>
                            <strong>{a.title}</strong> — {a.reason} · جودة{" "}
                            {a.score} · موانع {a.conflicts}
                          </p>
                        ))}
                      </section>
                      <section>
                        <b>القرار المقترح</b>
                        <p>
                          {minutes.selected?.title || "لم يحدد"} —{" "}
                          {minutes.expectedImpact}
                        </p>
                      </section>
                      <section>
                        <b>الاعتماد</b>
                        <p>{minutes.approvedBy}</p>
                      </section>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {scene === "copilot" ? (
                <div className="copilot-scene">
                  <div className="copilot-orbit">
                    <BrainCircuit />
                    <div>
                      <small>مساعد الجدول · يفهم السياق</small>
                      <h3>لا تشرح له ما تنظر إليه</h3>
                      <p>اختر السياق فقط</p>
                    </div>
                  </div>
                  <ContextPicker
                    selectedId={selected?.id || 0}
                    rows={rows}
                    courseById={courseById}
                    instructorById={instructorById}
                    onChange={setSelectedId}
                  />
                  {selected ? (
                    <div className="copilot-context-actions">
                      <button onClick={() => runCopilot("schedule")}>
                        <Sparkles />
                        <span>
                          <b>حسّن هذه المحاضرة</b>
                          <small>{selected.AdCourseName}</small>
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          runCopilot("instructor", selected.AdInstructorId)
                        }
                      >
                        <UsersRound />
                        <span>
                          <b>اختصر حمل الأستاذ</b>
                          <small>
                            {
                              instructorById.get(selected.AdInstructorId)
                                ?.AdInstructorName
                            }
                          </small>
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          runCopilot(
                            "room",
                            `${selected.AdRoomCode}|${selected.AdRoomHall}`,
                          )
                        }
                      >
                        <Building2 />
                        <span>
                          <b>هل عندي قاعة أفضل؟</b>
                          <small>
                            {selected.AdRoomCode}/{selected.AdRoomHall}
                          </small>
                        </span>
                      </button>
                      {DAYS.find((d) => selected[d.key]) ? (
                        <button
                          onClick={() =>
                            runCopilot(
                              "day",
                              DAYS.find((d) => selected[d.key])!.key,
                            )
                          }
                        >
                          <CalendarDays />
                          <span>
                            <b>خفف هذا اليوم</b>
                            <small>
                              {DAYS.find((d) => selected[d.key])!.label}
                            </small>
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {copilot ? (
                    <div className="copilot-answer">
                      <div className="copilot-answer-head">
                        <BrainCircuit />
                        <div>
                          <strong>{copilot.title}</strong>
                          <p>{copilot.summary}</p>
                        </div>
                      </div>
                      {copilot.options?.length ? (
                        <div className="copilot-options">
                          {copilot.options.map((o: any, i: number) => (
                            <article key={i}>
                              <b>{o.title || o.course || `بديل ${i + 1}`}</b>
                              <p>
                                {o.detail || o.verdict || o.current || o.time}
                              </p>
                              {o.delta ? (
                                <small>
                                  الجودة {o.delta.score >= 0 ? "+" : ""}
                                  {o.delta.score} · الموانع{" "}
                                  {o.delta.conflicts >= 0 ? "+" : ""}
                                  {o.delta.conflicts}
                                </small>
                              ) : null}
                              {o.candidate && selected ? (
                                <button
                                  onClick={() =>
                                    onOpenRow?.({ ...selected, ...o.candidate })
                                  }
                                >
                                  افتح في نموذج التعديل <ChevronLeft />
                                </button>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      ) : null}
                      <small className="copilot-guard">
                        <ShieldCheck />
                        {copilot.guardrail}
                      </small>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

    </>
  );
}
