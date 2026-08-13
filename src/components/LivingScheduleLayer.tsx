import React, { useEffect, useMemo, useState } from "react";
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
  Gauge,
  History,
  Network,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { Badge, GhostButton, PrimaryButton, SecondaryButton } from "./ui";
import {
  BriefScene,
  ContextPicker,
  HealthScene,
  PulseScene,
  TopologyScene,
  WhyResult,
} from "./LivingScheduleScenes";
import type { AdCourse, AdInstructor, AdTerm, FSchedule } from "../types";
import type { ScheduleExperience } from "./ScheduleExperienceLayer";

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
}: Props) {
  const power = Boolean(user?.IsAdminUser || user?.SystemUserId === 1);
  const [living, setLiving] = useState<any>(null),
    [scene, setScene] = useState<Scene | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<number>(sourceRows[0]?.id || 0),
    [whyResult, setWhyResult] = useState<any>(null),
    [candidateStart, setCandidateStart] = useState(""),
    [candidateEnd, setCandidateEnd] = useState(""),
    [candidateRoomCode, setCandidateRoomCode] = useState(""),
    [candidateRoomHall, setCandidateRoomHall] = useState(""),
    [candidateDay, setCandidateDay] = useState<"same" | DayKey>("same");
  const [sourceTerm, setSourceTerm] = useState(0),
    [genesis, setGenesis] = useState<any>(null),
    [memoryReason, setMemoryReason] = useState(""),
    [memory, setMemory] = useState<any>(null),
    [safety, setSafety] = useState<any[]>([]),
    [minutes, setMinutes] = useState<any>(null),
    [copilot, setCopilot] = useState<any>(null);
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
  const contextQuery = () => {
    const p = new URLSearchParams();
    if (collegeId) p.set("collegeId", String(collegeId));
    if (sectionId) p.set("sectionId", String(sectionId));
    if (termId) p.set("termId", String(termId));
    return p.toString();
  };
  const json = async (url: string, options?: RequestInit) => {
    const r = await fetch(url, options),
      d = await r.json();
    if (!r.ok) throw new Error(d.error || "تعذر تنفيذ الطلب");
    return d;
  };
  const loadLiving = async () => {
    try {
      const q = contextQuery();
      const d = await json(`/api/intelligence/living${q ? `?${q}` : ""}`);
      setLiving(d);
      if (!selectedId && rows[0]) setSelectedId(rows[0].id);
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    void loadLiving();
  }, [collegeId, sectionId, termId, rows.length]);
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
    if (!sourceTerm) {
      const previous = [...terms]
        .filter((t) => t.AdTermId !== termId)
        .sort((a, b) => b.AdTermId - a.AdTermId)[0];
      if (previous) setSourceTerm(previous.AdTermId);
    }
  }, [terms, termId, sourceTerm]);
  const open = (next: Scene) => {
    setScene(next);
    setError("");
    setMessage("");
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
          question: kind === "why-not" ? "ليش مو هذا الحل؟" : "ليش هذا أفضل؟",
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
  const runGenesis = async () => {
    if (!sourceTerm) return;
    setBusy(true);
    setError("");
    setGenesis(null);
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
      setMessage("تم بناء مسودة بداية الفصل دون نشر أي موعد.");
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
    if (
      !window.confirm(
        `العودة إلى: ${item.label}؟\nسيتم حفظ نقطة أمان جديدة قبل الاسترجاع.`,
      )
    )
      return;
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
      <div className="living-pulse-shell loading">
        <span />
        <b>أقرأ نبض الجدول…</b>
      </div>
    );
  if (!power)
    return (
      <div className="living-pulse-shell limited">
        <span
          className={`pulse-beacon ${living.pulse?.items?.[0]?.severity || "info"}`}
        />
        <div>
          <small>نبض الجدول</small>
          <strong>{living.pulse?.message}</strong>
          <p>
            {living.pulse?.items?.[0]?.detail ||
              "لا توجد مشكلة حرجة ظاهرة الآن."}
          </p>
        </div>
        <Badge
          tone={
            living.health?.quality >= 85
              ? "success"
              : living.health?.quality >= 70
                ? "warning"
                : "danger"
          }
        >
          {living.health?.quality}/100
        </Badge>
      </div>
    );
  const sceneItems: Array<{ id: Scene; label: string; icon: React.ReactNode }> =
    [
      { id: "pulse", label: "الحالة", icon: <Activity /> },
      { id: "topology", label: "خريطة التعارضات", icon: <Network /> },
      { id: "why", label: "لماذا؟", icon: <CircleHelp /> },
      { id: "health", label: "الصحة والعدالة", icon: <Gauge /> },
      { id: "copilot", label: "مساعد القرار", icon: <BrainCircuit /> },
      { id: "brief", label: "ملخص الدقيقة", icon: <Zap /> },
      { id: "genesis", label: "بداية الفصل", icon: <Dna /> },
      { id: "memory", label: "ذاكرة القرار", icon: <History /> },
      { id: "safety", label: "شبكة الأمان", icon: <RotateCcw /> },
      { id: "meeting", label: "محضر القرار", icon: <FileClock /> },
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
          {experience ? (
            <button className="living-primary-decision" onClick={() => void experience.openDecision()} disabled={!rows.length}>
              <BrainCircuit />
              قرار الآن
            </button>
          ) : null}
          <button className="living-more" onClick={() => open("pulse")}>
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
              <div>
                <span>الجدول الحي</span>
                <h2>{sceneItems.find((x) => x.id === scene)?.label}</h2>
                <p>
                  {living.context?.sectionName} · {living.context?.termName}
                </p>
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
                  onClick={() => open(item.id)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            {experience ? (
              <section className="living-experience-tools" aria-label="أدوات القرار المتقدمة">
                <button type="button" className={experience.ghostEnabled ? "active" : ""} onClick={() => { onEnsureWeek?.(); void experience.toggleGhost(); }} disabled={experience.ghostBusy || !experience.previousTerm}>
                  <Dna /><span>{experience.ghostEnabled ? "إخفاء مقارنة الفصل" : "مقارنة الفصل السابق"}</span>
                </button>
                <button type="button" onClick={() => { setScene(null); void experience.openDecision(); }} disabled={!rows.length}>
                  <BrainCircuit /><span>القرار الأهم الآن</span>
                </button>
                <button type="button" onClick={() => { setScene(null); experience.setSignatureOpen(true); }} disabled={!rows.length}>
                  <Gauge /><span>بصمة القسم</span>
                </button>
              </section>
            ) : null}
            {error ? (
              <div className="living-alert error">
                <AlertTriangle />
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="living-alert success">
                <CheckCircle2 />
                {message}
              </div>
            ) : null}
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
                          {dayLabel(selected)} · {selected.fstarttime}–
                          {selected.fendtime} · {selected.AdRoomCode}/
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
                            value={candidateStart}
                            onChange={(e) => setCandidateStart(e.target.value)}
                          />
                        </label>
                        <label>
                          <span>النهاية</span>
                          <input
                            type="time"
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
                          ليش هذا أفضل؟
                        </PrimaryButton>
                        <SecondaryButton
                          disabled={busy}
                          onClick={() => runWhy("why-not")}
                        >
                          <CircleHelp />
                          ليش مو هذا الحل؟
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
                  <div className="genesis-hero">
                    <Dna />
                    <div>
                      <small>بداية الفصل</small>
                      <h3>لا تبدأ الفصل من صفحة بيضاء</h3>
                      <p>
                        انسخ بصمة الفصل السابق إلى مسودة جديدة ثم راجع الجودة
                        والقيود قبل أي نشر.
                      </p>
                    </div>
                  </div>
                  <div className="genesis-controls">
                    <label>
                      <span>الفصل المصدر</span>
                      <select
                        value={sourceTerm}
                        onChange={(e) => setSourceTerm(Number(e.target.value))}
                      >
                        {terms
                          .filter((t) => t.AdTermId !== termId)
                          .sort((a, b) => b.AdTermId - a.AdTermId)
                          .map((t) => (
                            <option key={t.AdTermId} value={t.AdTermId}>
                              {t.AdTermName}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="genesis-arrow">
                      <ArrowLeft />
                    </div>
                    <label>
                      <span>الفصل الجديد</span>
                      <b>
                        {terms.find((t) => t.AdTermId === termId)?.AdTermName ||
                          living.context?.termName}
                      </b>
                    </label>
                    <PrimaryButton
                      disabled={busy || !sourceTerm}
                      onClick={runGenesis}
                    >
                      <WandSparkles />
                      أنشئ مسودة بداية الفصل
                    </PrimaryButton>
                  </div>
                  {genesis ? (
                    <div className="genesis-result">
                      <CheckCircle2 />
                      <div>
                        <strong>{genesis.draft?.name}</strong>
                        <p>
                          {genesis.coverage?.copiedRows} موعدًا نُسخت إلى مسودة
                          · الجودة {genesis.analysis?.score}/100 · التعارضات{" "}
                          {genesis.analysis?.conflicts}
                        </p>
                        <small>{genesis.guardrail}</small>
                      </div>
                    </div>
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
                      <strong>ليش رفضنا هذا البديل؟</strong>
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
                            {a.score} · تعارضات {a.conflicts}
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
                                  {o.delta.score} · التعارض{" "}
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
