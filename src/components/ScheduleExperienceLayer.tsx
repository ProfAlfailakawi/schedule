import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Fingerprint,
  Layers3,
  MapPin,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import type { AdCourse, AdInstructor, AdTerm, FSchedule } from "../types";

type DayKey = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";
const dayKeys: DayKey[] = [
  "fsunday",
  "fmonday",
  "ftuesday",
  "fwednesday",
  "fthursday",
];
const dayLabels: Record<DayKey, string> = {
  fsunday: "الأحد",
  fmonday: "الاثنين",
  ftuesday: "الثلاثاء",
  fwednesday: "الأربعاء",
  fthursday: "الخميس",
};
const activeDays = (row: Partial<FSchedule>) =>
  dayKeys.filter((day) => Boolean(row[day]));
const roomKey = (row: Partial<FSchedule>) =>
  `${String(row.AdRoomCode || "").trim()}|${String(row.AdRoomHall || "").trim()}`;
const rowIdentity = (row: Partial<FSchedule>) =>
  `${row.AdCourseId || 0}:${String(row.SCode || "").trim()}`;
const placement = (row: Partial<FSchedule>) =>
  `${activeDays(row).join(",")}:${row.fstarttime || ""}:${row.fendtime || ""}:${row.AdInstructorId || 0}:${roomKey(row)}`;

/**
 * A reading that always ends.
 *
 * The one-decision panel could spin for ever, and for two reasons that both
 * amount to the same mistake: nothing bounded the request, so a reply that
 * never came left the spinner running until the tab was closed; and the body
 * was parsed as JSON before its status was checked, so a plain-text rejection
 * ("Rate exceeded.") threw a parser error whose English text went to the screen.
 *
 * Every call now carries a ceiling and every failure carries an Arabic reason.
 * A tool that cannot answer must at least be able to say so.
 */
async function fetchJson(url: string, options?: RequestInit, timeoutMs = 25_000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("استغرقت القراءة وقتاً أطول من المتوقع. حاول مرة أخرى.");
    }
    throw new Error("تعذر الوصول إلى الخدمة. تحقق من الاتصال.");
  } finally {
    window.clearTimeout(timer);
  }

  const raw = await response.text();
  let data: any = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (response.ok) return data;

  if (response.status === 429 || /rate\s*exceeded|too many/i.test(raw)) {
    throw new Error("طلبات كثيرة في وقت قصير. انتظر لحظة ثم أعد المحاولة.");
  }
  if (response.status === 401) throw new Error("انتهت الجلسة. سجّل الدخول مرة أخرى.");
  if (response.status === 403) throw new Error("هذه القراءة خارج صلاحياتك.");
  if (response.status >= 500) throw new Error("الخدمة متوقفة مؤقتاً. حاول بعد قليل.");
  throw new Error(data?.error || "تعذر تحميل القراءة الذكية");
}
function query(collegeId: number, sectionId: number, termId: number) {
  return new URLSearchParams({
    collegeId: String(collegeId),
    sectionId: String(sectionId),
    termId: String(termId),
  }).toString();
}
function ghostSummary(current: FSchedule[], previous: FSchedule[]) {
  const currentByKey = new Map(current.map((row) => [rowIdentity(row), row]));
  let unchanged = 0,
    moved = 0,
    instructor = 0,
    room = 0,
    day = 0,
    missing = 0;
  previous.forEach((old) => {
    const now = currentByKey.get(rowIdentity(old));
    if (!now) {
      missing++;
      return;
    }
    if (placement(old) === placement(now)) {
      unchanged++;
      return;
    }
    moved++;
    if (old.AdInstructorId !== now.AdInstructorId) instructor++;
    if (roomKey(old) !== roomKey(now)) room++;
    if (activeDays(old).join(",") !== activeDays(now).join(",")) day++;
  });
  return { unchanged, moved, instructor, room, day, missing };
}
function strongestRisk(living: any) {
  const fragility = living?.fragility || living?.health?.fragility;
  const risks = [
    ...(fragility?.roomRisk || []),
    ...(fragility?.professorRisk || []),
    ...(fragility?.dayRisk || []),
  ];
  return (
    risks.sort(
      (a: any, b: any) => Number(b.impactPct || 0) - Number(a.impactPct || 0),
    )[0] || null
  );
}
function strengthSentence(living: any) {
  const health = living?.health;
  if (!health) return "";
  const metrics = [
    { label: "الجودة", value: Number(health.quality || 0) },
    { label: "المرونة", value: Number(health.resilience || 0) },
    { label: "العدالة", value: Number(health.fairness || 0) },
  ].sort((a, b) => b.value - a.value);
  return `${metrics[0].label} ${metrics[0].value}/100، ويأتي بعدها ${metrics[1].label} ${metrics[1].value}/100.`;
}

export function useScheduleExperience({
  rows,
  courses,
  instructors,
  terms,
  collegeId,
  sectionId,
  termId,
  isPowerAdmin,
}: {
  rows: FSchedule[];
  courses: AdCourse[];
  instructors: AdInstructor[];
  terms: AdTerm[];
  collegeId: number;
  sectionId: number;
  termId: number;
  isPowerAdmin: boolean;
}) {
  const [ghostEnabled, setGhostEnabled] = useState(false),
    [ghostRows, setGhostRows] = useState<FSchedule[]>([]),
    [ghostBusy, setGhostBusy] = useState(false),
    [ghostError, setGhostError] = useState("");
  const [living, setLiving] = useState<any>(null),
    [genome, setGenome] = useState<any>(null),
    [constraints, setConstraints] = useState<any[]>([]),
    [insightBusy, setInsightBusy] = useState(false),
    [insightError, setInsightError] = useState("");
  const [decisionOpen, setDecisionOpen] = useState(false),
    [decisionBusy, setDecisionBusy] = useState(false),
    [decision, setDecision] = useState<any>(null),
    [decisionError, setDecisionError] = useState("");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const currentTerm = terms.find((t) => t.AdTermId === termId) || null;
  const previousTerm = useMemo(() => {
    const history = Array.isArray(genome?.history) ? genome.history : [];
    const first = history[0];
    if (first)
      return (
        terms.find((t) => t.AdTermId === Number(first.termId)) || {
          AdTermId: Number(first.termId),
          AdTermName: String(first.termName || "الفصل السابق"),
        }
      );
    const sorted = [...terms]
      .filter((t) => t.AdTermId < termId)
      .sort((a, b) => b.AdTermId - a.AdTermId);
    return sorted[0] || null;
  }, [genome, terms, termId]);
  const comparison = useMemo(
    () => ghostSummary(rows, ghostRows),
    [rows, ghostRows],
  );
  const risk = useMemo(() => strongestRisk(living), [living]);
  const ready = Boolean(rows.length && living?.health?.readiness === "ready");
  const courseById = useMemo(
    () => new Map(courses.map((c) => [c.AdCourseId, c])),
    [courses],
  );
  const instructorById = useMemo(
    () => new Map(instructors.map((i) => [i.AdInstructorId, i])),
    [instructors],
  );

  useEffect(() => {
    setGhostEnabled(false);
    setGhostRows([]);
    setGhostError("");
    setDecision(null);
    setDecisionOpen(false);
    setSignatureOpen(false);
  }, [collegeId, sectionId, termId]);
  useEffect(() => {
    if (!isPowerAdmin || !collegeId || !sectionId || !termId) {
      setLiving(null);
      setGenome(null);
      setConstraints([]);
      return;
    }
    const controller = new AbortController(),
      timer = window.setTimeout(async () => {
        setInsightBusy(true);
        setInsightError("");
        try {
          const q = query(collegeId, sectionId, termId);
          const [l, g, c] = await Promise.all([
            fetchJson(`/api/intelligence/living?${q}`, {
              signal: controller.signal,
            }),
            fetchJson(`/api/intelligence/genome?${q}`, {
              signal: controller.signal,
            }),
            fetchJson(`/api/intelligence/constraints?${q}`, {
              signal: controller.signal,
            }),
          ]);
          setLiving(l);
          setGenome(g);
          setConstraints(Array.isArray(c) ? c : []);
        } catch (e: any) {
          if (e?.name !== "AbortError")
            setInsightError(String(e?.message || e));
        } finally {
          if (!controller.signal.aborted) setInsightBusy(false);
        }
      }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isPowerAdmin, collegeId, sectionId, termId, rows]);

  const toggleGhost = async () => {
    if (!isPowerAdmin || !collegeId || !sectionId || !termId) return;
    if (ghostEnabled) {
      setGhostEnabled(false);
      return;
    }
    if (!previousTerm) {
      setGhostError("لا يوجد فصل سابق محفوظ لهذا القسم بعد.");
      return;
    }
    setGhostBusy(true);
    setGhostError("");
    try {
      const p = new URLSearchParams({
        collegeId: String(collegeId),
        sectionId: String(sectionId),
        termId: String(previousTerm.AdTermId),
      });
      const data = await fetchJson(`/api/schedules?${p}`);
      setGhostRows(Array.isArray(data) ? data : []);
      setGhostEnabled(true);
    } catch (e: any) {
      setGhostError(String(e?.message || e));
    } finally {
      setGhostBusy(false);
    }
  };
  const openDecision = async () => {
    if (!isPowerAdmin || !collegeId || !sectionId || !termId) return;
    setDecisionOpen(true);
    setDecisionBusy(true);
    setDecisionError("");
    setDecision(null);
    try {
      setDecision(
        await fetchJson("/api/intelligence/war-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collegeId, sectionId, termId }),
        }),
      );
    } catch (e: any) {
      setDecisionError(String(e?.message || e));
    } finally {
      setDecisionBusy(false);
    }
  };
  const ghostClass = (row: FSchedule) => {
    const now = rows.find((r) => rowIdentity(r) === rowIdentity(row));
    if (!now) return "ghost-removed";
    return placement(now) === placement(row) ? "ghost-same" : "ghost-changed";
  };
  return {
    ghostEnabled,
    ghostRows,
    ghostBusy,
    ghostError,
    toggleGhost,
    ghostClass,
    comparison,
    previousTerm,
    currentTerm,
    living,
    genome,
    insightBusy,
    insightError,
    ready,
    risk,
    strength: strengthSentence(living),
    decisionOpen,
    setDecisionOpen,
    decisionBusy,
    decision,
    decisionError,
    openDecision,
    signatureOpen,
    setSignatureOpen,
    courseById,
    instructorById,
    constraints,
  };
}

export type ScheduleExperience = ReturnType<typeof useScheduleExperience>;
type Experience = ScheduleExperience;
export default function ScheduleExperienceLayer({
  experience,
  isPowerAdmin,
  onOpenRow,
  onEnsureWeek,
  rows,
  headless = false,
}: {
  experience: Experience;
  isPowerAdmin: boolean;
  onOpenRow: (row: FSchedule) => void;
  onEnsureWeek: () => void;
  rows: FSchedule[];
  headless?: boolean;
}) {
  if (!isPowerAdmin) return null;
  const e = experience,
    health = e.living?.health,
    genome = e.genome;
  const currentDominant = dayKeys
    .map((day) => ({
      day,
      value: Number(genome?.current?.dayShares?.[day] || 0),
    }))
    .sort((a, b) => b.value - a.value)[0];
  const dnaDominant = dayKeys
    .map((day) => ({ day, value: Number(genome?.dna?.dayShares?.[day] || 0) }))
    .sort((a, b) => b.value - a.value)[0];
  const topRooms = (genome?.dna?.rooms || []).slice(0, 3),
    topBottlenecks = (genome?.dna?.bottlenecks || []).slice(0, 3);
  const topInstructor = (() => {
    const counts = new Map<number, number>();
    rows.forEach((row) =>
      counts.set(
        row.AdInstructorId,
        (counts.get(row.AdInstructorId) || 0) +
          Math.max(1, activeDays(row).length),
      ),
    );
    const constrained = new Map<number, number>();
    (e.constraints || [])
      .filter((c: any) => c.enabled !== false && c.AdInstructorId)
      .forEach((c: any) =>
        constrained.set(
          Number(c.AdInstructorId),
          (constrained.get(Number(c.AdInstructorId)) || 0) + 1,
        ),
      );
    const ids = [...new Set([...constrained.keys(), ...counts.keys()])].sort(
      (a, b) =>
        (constrained.get(b) || 0) - (constrained.get(a) || 0) ||
        (counts.get(b) || 0) - (counts.get(a) || 0),
    );
    const id = ids[0];
    return id
      ? {
          name: e.instructorById.get(id)?.AdInstructorName || `أستاذ ${id}`,
          count: counts.get(id) || 0,
          constraints: constrained.get(id) || 0,
        }
      : null;
  })();
  return (
    <>
      {!headless ? (
        <>
      <section
        className="schedule-experience-strip no-print"
        aria-label="طبقة ذكاء الجدول"
      >
        <div className="experience-mark">
          <span>
            <Sparkles />
          </span>
          <div>
            <small>ذكاء الجدول</small>
            <strong>
              {e.insightBusy
                ? "أقرأ نمط الجدول…"
                : health?.descriptor || "الجدول يتعلم نمطه"}
            </strong>
          </div>
        </div>
        <div className="experience-actions">
          <button
            type="button"
            className={e.ghostEnabled ? "active" : ""}
            onClick={() => {
              onEnsureWeek();
              void e.toggleGhost();
            }}
            disabled={e.ghostBusy || !e.previousTerm}
            title="إسقاط الفصل السابق خلف الجدول الحالي"
          >
            <Layers3 />
            <span>
              {e.ghostBusy
                ? "أستدعي الفصل السابق…"
                : e.ghostEnabled
                  ? "إخفاء الشبح"
                  : "شبح الفصل السابق"}
            </span>
          </button>
          <button
            type="button"
            onClick={e.openDecision}
            disabled={!rows.length}
          >
            <Target />
            <span>قرار واحد</span>
          </button>
          <button
            type="button"
            onClick={() => e.setSignatureOpen(true)}
            disabled={!rows.length}
          >
            <Fingerprint />
            <span>بصمة القسم</span>
          </button>
        </div>
        {e.ghostEnabled ? (
          <div className="ghost-semester-readout">
            <span>{e.previousTerm?.AdTermName || "الفصل السابق"}</span>
            <b>{e.comparison.moved} تغيّر</b>
            <small>
              {e.comparison.day} أيام · {e.comparison.instructor} أساتذة ·{" "}
              {e.comparison.room} قاعات
            </small>
          </div>
        ) : null}
        {e.ghostError || e.insightError ? (
          <div className="experience-inline-error">
            <AlertTriangle />
            {e.ghostError || e.insightError}
          </div>
        ) : null}
      </section>

      {e.ready ? (
        <section className="schedule-afterglow no-print">
          <div className="afterglow-aura">
            <span>
              <CheckCircle2 />
            </span>
            <div>
              <small>حالة الجدول بعد القرار</small>
              <strong>الجدول اكتمل… والآن يظهر سبب قوته.</strong>
              <p>{e.strength}</p>
            </div>
          </div>
          <div className="afterglow-metrics">
            <span>
              <b>{health?.quality || 0}</b> جودة
            </span>
            <span>
              <b>{health?.resilience || 0}</b> مرونة
            </span>
            <span>
              <b>{health?.fairness || 0}</b> عدالة
            </span>
          </div>
          <div className="afterglow-risk">
            <span>
              <ShieldCheck />
            </span>
            <div>
              <small>نقطة الانهيار الوحيدة</small>
              <strong>
                {e.risk?.label || "لا توجد نقطة اعتماد حساسة بارزة"}
              </strong>
              <p>
                {e.risk
                  ? `إذا تغيّر هذا العنصر فقد يتأثر نحو ${e.risk.impactPct || 0}% من مواعيد القسم؛ لذلك هو أول شيء يستحق خطة بديلة.`
                  : "لا تظهر القراءة الحالية نقطة مفردة قادرة على إرباك الجدول بدرجة كبيرة."}
              </p>
            </div>
          </div>
        </section>
      ) : null}
        </>
      ) : null}

      {e.decisionOpen ? (
        <div
          className="one-decision-backdrop no-print"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) e.setDecisionOpen(false);
          }}
        >
          <section
            className="one-decision-mode"
            role="dialog"
            aria-modal="true"
            aria-label="قرار واحد"
          >
            <button
              className="experience-close"
              type="button"
              aria-label="إغلاق قرار واحد"
              title="إغلاق قرار واحد"
              onClick={() => e.setDecisionOpen(false)}
            >
              <X />
            </button>
            <header>
              <span className="decision-orb">
                <Target />
              </span>
              <div>
                <small>وضع القرار الواحد</small>
                <h2>ما أفضل شيء أفعله الآن؟</h2>
                <p>
                  كل تعقيد البرنامج اختفى مؤقتًا. أمامك أهم قرار واحد فقط،
                  وسياقه، وثلاثة بدائل للقراءة — بلا حفظ أو تنفيذ تلقائي.
                </p>
              </div>
            </header>
            {e.decisionBusy ? (
              <div className="decision-loading">
                <i />
                <strong>أحدد العقدة الأعلى أثرًا…</strong>
                <span>تعارض · فراغ · قاعة · قواعد</span>
              </div>
            ) : e.decisionError ? (
              <div className="decision-error">
                <AlertTriangle />
                <div>
                  <strong>{e.decisionError}</strong>
                  <button type="button" onClick={() => void e.openDecision()}>أعد المحاولة</button>
                </div>
              </div>
            ) : e.decision ? (
              <>
                <div className="decision-command-summary">
                  <div className="decision-problem">
                    <span>المشكلة التي تستحق القرار</span>
                    <h3>
                      {e.decision.issue
                        ? `${e.decision.issue.courseName} · شعبة ${e.decision.issue.sectionCode}`
                        : "الجدول مستقر"}
                    </h3>
                    <p>
                      {e.decision.issue
                        ? `${e.decision.issue.conflictCount} علاقة تعارض ظاهرة · ${e.decision.issue.professorName || ""} · ${e.decision.issue.room || ""}`
                        : "لا توجد عقدة تعارض واضحة؛ حافظ على الوضع الحالي وراجع نقطة الهشاشة فقط."}
                    </p>
                    {e.decision.issue ? (
                      <button
                        type="button"
                        onClick={() => {
                          const row = rows.find(
                            (r) => r.id === e.decision.issue.rowId,
                          );
                          if (row) {
                            e.setDecisionOpen(false);
                            onOpenRow(row);
                          }
                        }}
                      >
                        افتح الموعد الأصلي
                      </button>
                    ) : null}
                  </div>
                  {(e.decision.options || [])[0] ? (
                    <div className="decision-verdict">
                      <small>الخلاصة</small>
                      <strong>{e.decision.options[0].title}</strong>
                      <p>{e.decision.options[0].reason}</p>
                      <span><CheckCircle2 /> أفضل قراءة حالية · جودة {e.decision.options[0].score}/100</span>
                    </div>
                  ) : null}
                </div>
                <div className="decision-options">
                  {(e.decision.options || [])
                    .slice(0, 3)
                    .map((option: any, index: number) => (
                      <article
                        className={index === 0 ? "recommended" : ""}
                        key={option.id || index}
                      >
                        <span className="decision-rank">0{index + 1}</span>
                        <div className="decision-option-copy">
                          <small>
                            {index === 0 ? "التوصية الأولى" : `البديل ${index}`}
                          </small>
                          <strong>{option.title}</strong>
                          <p>{option.reason}</p>
                        </div>
                        <div className="decision-option-score">
                          <b>{option.score}</b>
                          <span>جودة</span>
                        </div>
                        <div className="decision-option-facts">
                          <span>
                            <CheckCircle2 />
                            <b>{option.conflicts}</b> تعارض
                          </span>
                          <span>
                            <Clock />
                            <b>{option.avgGap}د</b> فراغ
                          </span>
                          <span>
                            <MapPin />
                            {option.roomImpact?.changed
                              ? "تغيير قاعة"
                              : "القاعة ثابتة"}
                          </span>
                          <span>
                            <Users />
                            {option.professorImpact?.gapDelta > 0
                              ? `+${option.professorImpact.gapDelta}د للأستاذ`
                              : option.professorImpact?.gapDelta < 0
                                ? `${option.professorImpact.gapDelta}د للأستاذ`
                                : "أثر الأستاذ ثابت"}
                          </span>
                        </div>
                      </article>
                    ))}
                </div>
                <footer>
                  <span>
                    <ShieldCheck />
                    قراءة تحليلية فقط. لا حفظ ولا نشر قبل رجوعك إلى شاشة الجدول.
                  </span>
                  <button
                    type="button"
                    onClick={() => e.setDecisionOpen(false)}
                  >
                    ارجع للجدول
                  </button>
                </footer>
              </>
            ) : null}
          </section>
        </div>
      ) : null}

      {e.signatureOpen ? (
        <div
          className="signature-backdrop no-print"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) e.setSignatureOpen(false);
          }}
        >
          <section
            className="schedule-signature"
            role="dialog"
            aria-modal="true"
            aria-label="بصمة القسم"
          >
            <button
              className="experience-close"
              type="button"
              aria-label="إغلاق بصمة القسم"
              title="إغلاق بصمة القسم"
              onClick={() => e.setSignatureOpen(false)}
            >
              <X />
            </button>
            <header>
              <span className="signature-glyph">
                <Fingerprint />
              </span>
              <div>
                <small>بصمة الجدول · نمط القسم</small>
                <h2>هذه هي بصمة القسم، لا مجرد إحصائية.</h2>
                <p>
                  {genome?.available
                    ? `الفصل الحالي متوافق مع بصمة القسم بنسبة ${genome.compatibility}/100، محسوبة من ${genome.history?.length || 0} فصول سابقة.`
                    : "يبدأ النظام ببناء بصمة القسم من هذا الفصل وسيزداد دقة مع تراكم الفصول."}
                </p>
              </div>
              <b>
                {genome?.available ? genome.compatibility : "—"}
                <small>/100</small>
              </b>
            </header>
            <div className="signature-grid">
              <article>
                <span>
                  <CalendarDays />
                </span>
                <small>إيقاع الأيام</small>
                <strong>
                  {currentDominant?.value
                    ? dayLabels[currentDominant.day]
                    : "—"}
                </strong>
                <p>
                  {currentDominant?.value
                    ? `${currentDominant.value}% من حضور الفصل الحالي يتركز هنا. البصمة التاريخية يميل إلى ${dnaDominant?.value ? dayLabels[dnaDominant.day] : "نمط غير مكتمل"}.`
                    : "لا توجد بيانات أيام كافية."}
                </p>
                {/* A row of bare bars is a picture of data; the axis makes it data. */}
                <div className="dna-bars" role="img" aria-label="نصيب كل يوم من مواعيد الفصل">
                  {dayKeys.map((day) => (
                    <i
                      key={day}
                      data-day={dayLabels[day]}
                      title={`${dayLabels[day]} · ${Number(genome?.current?.dayShares?.[day] || 0)}%`}
                      style={
                        {
                          "--dna": `${Math.max(4, Number(genome?.current?.dayShares?.[day] || 0))}%`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
              </article>
              <article>
                <span>
                  <Clock />
                </span>
                <small>نافذة الذروة</small>
                <strong>
                  {topBottlenecks[0]
                    ? `${topBottlenecks[0].label} · ${topBottlenecks[0].time}`
                    : "—"}
                </strong>
                <p>
                  {topBottlenecks.length
                    ? `أكثر الخلايا تكرارًا تاريخيًا: ${topBottlenecks.map((x: any) => `${x.label} ${x.time}`).join("، ")}.`
                    : "ستظهر نافذة الذروة بعد توفر تاريخ كافٍ."}
                </p>
              </article>
              <article>
                <span>
                  <MapPin />
                </span>
                <small>القاعات المحورية</small>
                <strong>{topRooms[0]?.key?.replace("|", "/") || "—"}</strong>
                <p>
                  {topRooms.length
                    ? topRooms
                        .map((x: any) => x.key.replace("|", "/"))
                        .join(" · ")
                    : "لا توجد قاعات تاريخية كافية لبناء مركز البصمة."}
                </p>
              </article>
              <article>
                <span>
                  <Users />
                </span>
                <small>الأساتذة الأكثر تقييدًا</small>
                <strong>{topInstructor?.name || "—"}</strong>
                <p>
                  {topInstructor
                    ? `${topInstructor.constraints ? `${topInstructor.constraints} قيد مباشر · ` : ""}${topInstructor.count} حضورًا أسبوعيًا مرتبطًا بهذا الأستاذ؛ لذلك هو الأكثر حساسية داخل البصمة الحالية.`
                    : "لا توجد بيانات أساتذة كافية."}
                </p>
              </article>
            </div>
            <div className="signature-deviations">
              <div>
                <small>مقارنة تاريخية</small>
                <strong>
                  {genome?.deviations?.[0]?.title || "لا توجد انحرافات كبيرة"}
                </strong>
                <p>
                  {genome?.deviations?.[0]?.detail ||
                    "النمط الحالي قريب من بصمة القسم المتراكمة."}
                </p>
              </div>
              {(genome?.history || []).length ? (
                <div className="signature-history">
                  {genome.history.map((item: any) => (
                    <span key={item.termId}>
                      <b>{item.termName}</b>
                      <small>
                        {item.count} موعد · {item.avgGap}د فراغ
                      </small>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <footer>
              <ShieldCheck />
              <span>
                البصمة قراءة تاريخية فقط؛ لا تغيّر جدولًا ولا قاعدة بيانات.
              </span>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
