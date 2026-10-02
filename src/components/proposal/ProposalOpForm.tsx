/**
 * ── نموذج إعداد المادة ─────────────────────────────────────────────────────
 *
 * أربعةُ أنواعٍ من الإضافة في بدايته، ثم الحقولُ نفسها بترتيبها وتسمياتها
 * المألوفة من «إضافة موعد دراسي». الأستاذُ والفصلُ مقرَّران سلفاً فلا يُسألان
 * عنهما مرةً ثانية. ولا زرَّ هنا اسمُه «حفظ الموعد»: ما يحدث مسودةٌ فقط.
 */
import React, { useEffect, useMemo, useState } from "react";
import { TimeField } from "../TimeField";
import {
  AlertTriangle, ArrowLeftRight, Building2, Check, CirclePlus, Clock3, FilePlus2, History, Info, Pencil, RotateCcw, Search, UserRoundPlus, Users,
} from "lucide-react";
import LocationPicker from "../LocationPicker";
import { Field } from "../ui";
import type { StudyProposalDayKey, StudyProposalOp } from "../../types";
import { adviseDayPattern, type DayKey } from "../../utils/scheduleRegulations";
import { timeToMinutes } from "../../utils/scheduleIntelligence";
import { SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME } from "../../utils/scheduleTime";
import { PROPOSAL_DAY_KEYS, PROPOSAL_DAY_NAMES, daysLabel, type GridItem } from "../../utils/studyProposal";
import { toEnglishDigits } from "../../utils/digits";
import { AR, countOf } from "../../utils/arabicCount";
import { proposalApi, type FacultyEntry, type ContextCourse } from "./proposalApi";
import type { CourseHistory } from "../../utils/studyProposal";
import { quickOverlap, suggestSectionCode, type FormDraft, type WorkMode } from "./proposalDraft";
import type { Workspace } from "./useProposalWorkspace";
import { num, timeRange } from "./proposalFormat";

const MODES: Array<{ mode: WorkMode; title: string; hint: string; Icon: React.ComponentType<any> }> = [
  { mode: "assign", title: "شعبة من «هيئة تدريسية»", hint: "إسناد شعبة قائمة إلى الأستاذ", Icon: UserRoundPlus },
  { mode: "create", title: "شعبة جديدة", hint: "لمقرر موجود في الكتالوج", Icon: FilePlus2 },
  { mode: "edit", title: "تعديل موعد قائم", hint: "من مواعيد الأستاذ الحالية", Icon: Pencil },
  { mode: "replace", title: "استبدال موعد", hint: "يخرج موعد ويدخل غيره", Icon: ArrowLeftRight },
];

const PATTERNS: Array<{ label: string; days: StudyProposalDayKey[]; note: string }> = [
  { label: "أحد · ثلاثاء · خميس", days: ["fsunday", "ftuesday", "fthursday"], note: "50 د" },
  { label: "أحد · ثلاثاء", days: ["fsunday", "ftuesday"], note: "50 د" },
  { label: "اثنين · أربعاء", days: ["fmonday", "fwednesday"], note: "80 د" },
];

const PERIODS = [
  { value: "all", label: "كل الأوقات" },
  { value: "am", label: "صباحي" },
  { value: "noon", label: "ظهري" },
  { value: "pm", label: "مسائي" },
] as const;
const periodOf = (start: string) => { const m = timeToMinutes(start); return m < 12 * 60 ? "am" : m < 15 * 60 ? "noon" : "pm"; };

/* ── اختيار شعبةٍ قائمة ───────────────────────────────────────────────────── */

function FacultyPicker({ ws }: { ws: Workspace }) {
  const { ctx, draft, ops } = ws;
  const [query, setQuery] = useState("");
  const [days, setDays] = useState<StudyProposalDayKey[]>([]);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("all");
  const [clearOnly, setClearOnly] = useState(false);
  const [limit, setLimit] = useState(24);
  const usedIds = useMemo(() => new Set(ops.filter(op => op.id !== draft.editingOpId && op.source).map(op => op.source!.id)), [ops, draft.editingOpId]);
  const multiScope = useMemo(() => new Set((ctx?.faculty || []).map(f => `${f.snapshot.AdCollegeId}:${f.snapshot.AdSectionId}`)).size > 1, [ctx]);
  const instructorRows = ws.currentItems;

  const decorated = useMemo(() => (ctx?.faculty || []).map(entry => {
    const clash = quickOverlap({ days: entry.snapshot.days, start: entry.snapshot.fstarttime, end: entry.snapshot.fendtime }, instructorRows);
    return { entry, clash };
  }), [ctx, instructorRows]);

  const filtered = useMemo(() => {
    const q = toEnglishDigits(query).trim().toLowerCase();
    return decorated.filter(({ entry, clash }) => {
      const s = entry.snapshot;
      if (q && !`${s.courseName} ${s.courseCode} ${s.SCode}`.toLowerCase().includes(q)) return false;
      if (days.length && !days.some(day => s.days.includes(day))) return false;
      if (period !== "all" && periodOf(s.fstarttime) !== period) return false;
      if (clearOnly && clash) return false;
      return true;
    });
  }, [decorated, query, days, period, clearOnly]);

  if (!ctx?.hasPlaceholder) return <EmptyNote Icon={Users} title="لا توجد شعب «هيئة تدريسية» في هذا الفصل" text="لا يوجد سجلٌّ بهذه الهوية، فلا شعبَ قابلةً للإسناد. يمكنك إنشاء شعبة جديدة بدلاً من ذلك." />;
  if (!ctx.faculty.length) return <EmptyNote Icon={Users} title="لا توجد شعب «هيئة تدريسية» متاحة ضمن نطاقك" text="كل شعب الفصل مُسندة، أو أنها خارج الأقسام المسموحة لك. جرّب «شعبة جديدة»." />;

  return (
    <div className="sp-picker">
      <div className="sp-filters">
        <label className="sp-search"><Search aria-hidden="true" />
          <input value={query} onChange={e => { setQuery(e.target.value); setLimit(24); }} onKeyDown={e => { if (e.key === "Enter") e.preventDefault(); }}
            placeholder="ابحث بالمقرر أو رمزه أو رقم الشعبة" aria-label="بحث في الشعب المتاحة" />
        </label>
        <div className="sp-chips" role="group" aria-label="الأيام">
          {PROPOSAL_DAY_KEYS.map(day => (
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={day} type="button" className="sp-chip-toggle" aria-pressed={days.includes(day)}
              onClick={() => { setDays(cur => cur.includes(day) ? cur.filter(d => d !== day) : [...cur, day]); setLimit(24); }}>
              {PROPOSAL_DAY_NAMES[day]}
            </button>
          ))}
        </div>
      </div>
      {filtered.length ? null : <p className="sp-count-line" aria-live="polite">لا توجد شعبة مطابقة للتصفية</p>}
      <ul className="sp-list" role="radiogroup" aria-label="الشعب المتاحة للإسناد">
        {filtered.slice(0, limit).map(({ entry, clash }) => {
          const s = entry.snapshot;
          const used = usedIds.has(s.id);
          const selected = draft.facultyId === s.id;
          return (
            <li key={s.id}>
              <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="radio" aria-checked={selected} className="sp-opt" data-selected={selected || undefined} disabled={used}
                onClick={() => ws.pickFaculty(s.id)}>
                <span className="sp-opt-title"><b>{s.courseName}</b><small>{s.courseCode} · شعبة {s.SCode}</small></span>
                <span className="sp-opt-when"><bdi>{daysLabel(s.days)}</bdi><bdi className="sp-time">{timeRange(s.fstarttime, s.fendtime)}</bdi></span>
                <span className="sp-opt-where"><Building2 aria-hidden="true" />{entry.item.place || "القاعة لم تُحدد"}{multiScope ? ` · ${entry.item.sectionName || ""}` : ""}</span>
                <span className="sp-fit" data-fit={used ? "used" : clash ? "clash" : "clear"}>
                  {used ? <><Check aria-hidden="true" />مضافة إلى المقترح</> : clash ? <><AlertTriangle aria-hidden="true" />يتداخل مع {clash.courseName || "محاضرة"}</> : <><Check aria-hidden="true" />لا يظهر تعارض مع جدوله الحالي</>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {filtered.length > limit ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-more" onClick={() => setLimit(l => l + 24)}>عرض المزيد ({num(filtered.length - limit)})</button> : null}
    </div>
  );
}

function EmptyNote({ Icon, title, text }: { Icon: React.ComponentType<any>; title: string; text: string }) {
  return <div className="sp-empty-note"><Icon aria-hidden="true" /><strong>{title}</strong><p>{text}</p></div>;
}

/* ── اختيار موعدٍ قائمٍ للأستاذ ──────────────────────────────────────────── */

function RowPicker({ ws, label }: { ws: Workspace; label: string }) {
  const { draft, ops } = ws;
  const used = useMemo(() => new Set(ops.filter(op => op.id !== draft.editingOpId).flatMap(op => [op.source?.id, op.out?.snapshot.id]).filter((v): v is number => typeof v === "number")), [ops, draft.editingOpId]);
  const rows = ws.currentItems.filter(item => !item.outside);
  if (!ws.currentItems.length) return <EmptyNote Icon={Clock3} title="ليس للأستاذ مواعيد حالياً" text="لا يوجد موعدٌ يُعدَّل أو يُستبدل. يمكنك إسناد شعبة أو إنشاء شعبة جديدة." />;
  if (!rows.length) return <EmptyNote Icon={Clock3} title="مواعيده خارج نطاق صلاحيتك" text="تظهر مواعيد الأستاذ في الأقسام الأخرى إشغالاً فقط، ولا يمكن تعديلها من هنا." />;
  return (
    <div className="sp-picker">
      <p className="sp-hint"><Info aria-hidden="true" />{label} — أو اضغط الموعد في الجدول.</p>
      <ul className="sp-list sp-list-compact" role="radiogroup" aria-label={label}>
        {rows.map(item => {
          const taken = used.has(item.rowId);
          const selected = draft.rowId === item.rowId;
          return (
            <li key={item.key}>
              <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="radio" aria-checked={selected} className="sp-opt" data-selected={selected || undefined} disabled={taken}
                onClick={() => ws.pickRow(item.rowId)}>
                <span className="sp-opt-title"><b>{item.courseName}</b><small>{item.courseCode} · شعبة {item.SCode}</small></span>
                <span className="sp-opt-when"><bdi>{daysLabel(item.days)}</bdi><bdi className="sp-time">{timeRange(item.start, item.end)}</bdi></span>
                <span className="sp-opt-where"><Building2 aria-hidden="true" />{item.place || "القاعة لم تُحدد"}</span>
                {taken ? <span className="sp-fit" data-fit="used"><Check aria-hidden="true" />مستعمل في مادةٍ أخرى</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── الأيام والوقت والمكان ───────────────────────────────────────────────── */

export function scopeOfDraft(ws: Workspace): { collegeId: number; sectionId: number } {
  const { draft, ctx } = ws;
  const faculty = draft.facultyId != null ? ctx?.faculty.find(f => f.snapshot.id === draft.facultyId)?.snapshot : undefined;
  if (faculty) return { collegeId: faculty.AdCollegeId, sectionId: faculty.AdSectionId };
  const row = draft.rowId != null ? ws.currentItems.find(i => i.rowId === draft.rowId) : undefined;
  if (draft.mode === "edit" && row?.src) return { collegeId: row.src.collegeId, sectionId: row.src.sectionId };
  const course = draft.courseId ? ctx?.courses.find(c => c.id === draft.courseId) : undefined;
  if (course) return { collegeId: course.collegeId, sectionId: course.sectionId };
  return { collegeId: ctx?.scope.collegeId || 0, sectionId: ctx?.scope.sectionId || 0 };
}

/* ── سجلُّ المقرر: كيف نزل في فصولٍ سابقة ─────────────────────────────────── */

const historyCache = new Map<string, CourseHistory>();

export function CourseHistoryNote({ ws, scope, compact = false }: { ws: Workspace; scope: { collegeId: number; sectionId: number }; compact?: boolean }) {
  const { draft, ctx } = ws;
  const row = draft.rowId != null ? ws.currentItems.find(i => i.rowId === draft.rowId) : undefined;
  const courseId = draft.courseId ?? (draft.mode === "edit" ? row?.src?.courseId ?? null : null);
  const termId = ctx?.term.id || 0;
  const key = courseId && scope.collegeId && scope.sectionId ? `${courseId}:${scope.collegeId}:${scope.sectionId}:${termId}` : "";
  const [history, setHistory] = useState<CourseHistory | null>(key ? historyCache.get(key) || null : null);
  useEffect(() => {
    if (!key || !courseId) { setHistory(null); return; }
    const cached = historyCache.get(key);
    if (cached) { setHistory(cached); return; }
    const controller = new AbortController();
    proposalApi.courseHistory({ courseId, collegeId: scope.collegeId, sectionId: scope.sectionId, termId }, controller.signal)
      .then(result => { historyCache.set(key, result); setHistory(result); })
      .catch(() => setHistory(null));
    return () => controller.abort();
  }, [key]);
  if (!history || !history.layouts.length) return null;
  const apply = (layout: CourseHistory["layouts"][number]) => ws.patchDraft({
    days: layout.days, start: layout.start, end: layout.end, endTouched: true,
    block: layout.days.length === 1 && layout.minutes > 80 ? layout.minutes : 0,
  });
  return (
    <section className="sp-history" aria-label="سجل المقرر في الفصول السابقة">
      <p title={compact ? `نزل هذا المقرر في ${countOf(history.terms, { one: "فصل", two: "فصلين", few: "فصول", many: "فصلاً" })}` : undefined}><History aria-hidden="true" />{compact ? "المعتاد في الفصول السابقة:" : null}{compact ? null : <>نزل هذا المقرر في {countOf(history.terms, { one: "فصل", two: "فصلين", few: "فصول", many: "فصلاً" })} ({history.firstTerm}{history.latestTerm && history.latestTerm !== history.firstTerm ? ` ← ${history.latestTerm}` : ""}). الأوضاع المعتادة:</>}</p>
      <ul>
        {history.layouts.map(layout => {
          const on = draft.days.join() === layout.days.join() && draft.start === layout.start && draft.end === layout.end;
          return (
            <li key={`${layout.days.join()}|${layout.start}`}>
              <button type="button" className="sp-chip-btn" aria-pressed={on} onClick={() => apply(layout)} data-guide-ignore="يملأ الأيام والوقت من سجل المقرر — لا يكتب في الجدول">
                {daysLabel(layout.days)} · <bdi className="sp-time">{timeRange(layout.start, layout.end)}</bdi>
                <small> · {countOf(layout.terms, { one: "فصل", two: "فصلان", few: "فصول", many: "فصلاً" })}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ScheduleFields({ ws, locked }: { ws: Workspace; locked?: boolean }) {
  const { draft, ctx } = ws;
  const advice = useMemo(() => draft.days.length && draft.start && draft.end ? adviseDayPattern(draft.days as DayKey[], draft.start, draft.end) : null, [draft.days, draft.start, draft.end]);
  const scope = scopeOfDraft(ws);
  const invalidTime = Boolean(draft.start && draft.end) && timeToMinutes(draft.end) <= timeToMinutes(draft.start);
  const toggleDay = (day: StudyProposalDayKey) => ws.patchDraft(cur => ({ days: cur.days.includes(day) ? cur.days.filter(d => d !== day) : [...cur.days, day] }));

  if (locked) {
    return (
      <div className="sp-locked-summary" aria-label="موعد الشعبة كما هو">
        <p><b>الأيام</b><span>{daysLabel(draft.days) || "—"}</span></p>
        <p><b>الوقت</b><bdi className="sp-time">{draft.start ? timeRange(draft.start, draft.end) : "—"}</bdi></p>
        <p><b>المكان</b><span>{[draft.location.AdRoomCode, draft.location.AdRoomHall].filter(Boolean).join(" · ") || "القاعة لم تُحدد"}</span></p>
      </div>
    );
  }
  return (
    <div className="sp-fields">
      <CourseHistoryNote ws={ws} scope={scope} />
      <Field label="الأيام" required>
        <div className="sp-days" role="group" aria-label="أيام المحاضرة">
          {PROPOSAL_DAY_KEYS.map(day => (
            <label key={day} className="sp-day" data-on={draft.days.includes(day) || undefined}>
              <input type="checkbox" checked={draft.days.includes(day)} onChange={() => toggleDay(day)} />{PROPOSAL_DAY_NAMES[day]}
            </label>
          ))}
        </div>
      </Field>
      <div className="sp-patterns" role="group" aria-label="الأنماط المعتمدة">
        {PATTERNS.map(p => (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={p.label} type="button" className="sp-chip-btn" aria-pressed={draft.days.join() === p.days.join()} onClick={() => ws.patchDraft({ days: p.days, endTouched: false })}>{p.label}<small>{p.note}</small></button>
        ))}
      </div>
      <div className="sp-two">
        <Field label="بداية الوقت" required>
          <TimeField value={draft.start} min={SCHEDULE_DAY_START_TIME} max={SCHEDULE_DAY_END_TIME} dir="ltr"
            onChange={e => ws.patchDraft({ start: e.target.value })} aria-invalid={invalidTime || undefined} />
        </Field>
        <Field label="نهاية الوقت" required>
          <TimeField value={draft.end} min={SCHEDULE_DAY_START_TIME} max={SCHEDULE_DAY_END_TIME} dir="ltr"
            onChange={e => ws.patchDraft({ end: e.target.value, endTouched: true })} aria-invalid={invalidTime || undefined} />
        </Field>
      </div>
      {invalidTime ? <p className="sp-inline-error" role="alert"><AlertTriangle aria-hidden="true" />وقت النهاية يجب أن يكون بعد البداية.</p> : null}
      {advice && !invalidTime && (advice.changed || advice.family === "mixed") ? (
        <p className="sp-hint" role="status"><Info aria-hidden="true" />{advice.note}
          {advice.changed && advice.suggestedEnd ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={() => ws.patchDraft({ end: advice.suggestedEnd, endTouched: true })}>اجعل النهاية {advice.suggestedEnd}</button> : null}
        </p>
      ) : null}
      <div className="sp-location">
        <span className="sp-field-label">المبنى والقاعة</span>
        <LocationPicker collegeId={scope.collegeId} sectionId={scope.sectionId} termId={ctx?.term.id}
          value={{ AdRoomCode: draft.location.AdRoomCode, AdRoomHall: draft.location.AdRoomHall, buildingId: draft.location.buildingId, roomId: draft.location.roomId, locationStatus: draft.location.locationStatus }}
          onChange={patch => ws.patchDraft(cur => ({ location: {
            AdRoomCode: String(patch.AdRoomCode ?? cur.location.AdRoomCode ?? ""), AdRoomHall: String(patch.AdRoomHall ?? cur.location.AdRoomHall ?? ""),
            buildingId: "buildingId" in patch ? patch.buildingId : cur.location.buildingId, roomId: "roomId" in patch ? patch.roomId : cur.location.roomId,
            locationStatus: ("locationStatus" in patch ? patch.locationStatus : cur.location.locationStatus) as any,
          } }))} />
      </div>
    </div>
  );
}

/* ── شعبةٌ جديدة لمقررٍ قائم ─────────────────────────────────────────────── */

function CreateFields({ ws }: { ws: Workspace }) {
  const { ctx, draft, ops } = ws;
  const courses = useMemo(() => [...(ctx?.courses || [])].sort((a, b) => a.name.localeCompare(b.name, "ar")), [ctx]);
  const suggestion = suggestSectionCode(draft.courseId, ctx?.usedCodes || {}, ops, draft.editingOpId);
  const course = courses.find(c => c.id === draft.courseId);
  const multi = new Set(courses.map(c => c.collegeId)).size > 1;
  if (!courses.length) return <EmptyNote Icon={FilePlus2} title="لا توجد مقررات متاحة" text="لا توجد مقررات قائمة ضمن الأقسام المسموحة لك." />;
  return (
    <div className="sp-fields">
      <Field label="المقرر الدراسي" required>
        <select value={draft.courseId ?? ""} onChange={e => ws.patchDraft({ courseId: Number(e.target.value) || null })}>
          <option value="">اختر المقرر</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}{multi ? ` — ${c.collegeName}` : ""}</option>)}
        </select>
      </Field>
      <Field label="رمز المقرر الدراسي" required>
        <select value={draft.courseId ?? ""} dir="ltr" onChange={e => ws.patchDraft({ courseId: Number(e.target.value) || null })}>
          <option value="">اختر الرمز</option>
          {[...courses].sort((a, b) => a.code.localeCompare(b.code)).map(c => <option key={c.id} value={c.id}>{c.code}</option>)}
        </select>
      </Field>
      <Field label="الشعبة" required hint={course ? (suggestion ? `رقم الشعبة المقترح ${suggestion} — غير محجوز حتى التثبيت، ويُعاد التحقق منه عندها.` : "") : "اختر المقرر لاقتراح رقم الشعبة."}>
        <div className="sp-scode">
          <input inputMode="numeric" dir="ltr" value={draft.scode} maxLength={20} placeholder={suggestion || "501"}
            onChange={e => ws.patchDraft({ scode: toEnglishDigits(e.target.value).replace(/\D/g, "") })} />
          {suggestion && draft.scode !== suggestion ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-chip-btn" onClick={() => ws.patchDraft({ scode: suggestion })}>استخدم {suggestion}</button> : null}
        </div>
      </Field>
      <ScheduleFields ws={ws} />
    </div>
  );
}

/* ── النموذج كاملاً ──────────────────────────────────────────────────────── */

export default function ProposalOpForm({ ws, onDone }: { ws: Workspace; onDone?: () => void }) {
  const { draft, ctx } = ws;
  const editing = Boolean(draft.editingOpId);
  const set = ws.patchDraft;

  const diffs = useMemo(() => {
    if (draft.mode !== "edit" || draft.rowId == null) return [] as string[];
    const row = ws.currentItems.find(i => i.rowId === draft.rowId);
    if (!row) return [];
    const out: string[] = [];
    if (row.days.join() !== draft.days.join()) out.push(`الأيام: ${daysLabel(row.days)} ← ${daysLabel(draft.days)}`);
    if (row.start !== draft.start || row.end !== draft.end) out.push(`الوقت: ${timeRange(row.start, row.end)} ← ${draft.start ? timeRange(draft.start, draft.end) : "—"}`);
    const place = [draft.location.AdRoomCode, draft.location.AdRoomHall].filter(Boolean).join(" · ");
    if ((row.src?.roomId || "") !== (draft.location.roomId || "")) out.push(`المكان: ${row.place || "—"} ← ${place || "القاعة لم تُحدد"}`);
    return out;
  }, [draft, ws.currentItems]);
  if (!ctx) return null;

  const assignBody = (
    <>
      <FacultyPicker ws={ws} />
      {draft.facultyId != null ? (
        <div className="sp-adjust" role="group" aria-label="طريقة الإسناد">
          <div className="sp-seg" role="radiogroup">
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="radio" aria-checked={!draft.adjust} onClick={() => ws.pickFaculty(draft.facultyId!)}>إسناد الشعبة كما هي</button>
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="radio" aria-checked={draft.adjust} onClick={() => set({ adjust: true })}>إسنادها مع تعديل موعدها</button>
          </div>
          <p className="sp-hint"><Info aria-hidden="true" />{draft.adjust
            ? "يُغيَّر موعد الشعبة نفسها (لا تُنشأ نسخةٌ جديدة منها) عند التثبيت — وقد يمسّ طلابها."
            : "تُسند الشعبة بموعدها وقاعتها الحاليين دون أي تغيير."}</p>
          <ScheduleFields ws={ws} locked={!draft.adjust} />
        </div>
      ) : null}
    </>
  );

  const rowFields = (
    <>
      <RowPicker ws={ws} label={draft.mode === "edit" ? "اختر الموعد الذي سيتغيّر" : "اختر الموعد الذي سيخرج من جدوله"} />
      {draft.rowId != null && draft.mode === "edit" ? (
        <>
          <p className="sp-ro"><b>المقرر</b><span>{ws.currentItems.find(i => i.rowId === draft.rowId)?.courseName} · شعبة {draft.scode}</span></p>
          <ScheduleFields ws={ws} />
          {diffs.length ? <ul className="sp-diff" aria-label="ما سيتغيّر">{diffs.map(d => <li key={d}>{d}</li>)}</ul> : <p className="sp-hint"><Info aria-hidden="true" />لم تغيّر شيئاً بعد.</p>}
        </>
      ) : null}
    </>
  );

  const replaceBody = (
    <div className="sp-replace">
      <section className="sp-step" aria-labelledby="sp-out">
        <h3 id="sp-out"><span>1</span>الموعد الذي سيخرج من جدول الأستاذ</h3>
        <RowPicker ws={ws} label="اختر الموعد الذي سيخرج" />
        {draft.rowId != null ? (
          <div className="sp-out-action" role="radiogroup" aria-label="ما يُفعل بالموعد الخارج">
            <label data-on={draft.outAction === "unassign" || undefined}><input type="radio" name="out-action" checked={draft.outAction === "unassign"} onChange={() => set({ outAction: "unassign" })} />
              <span><b>فك إسناده</b><small>يبقى الموعد في جدول القسم لـ«هيئة تدريسية»</small></span></label>
            <label data-on={draft.outAction === "delete" || undefined}><input type="radio" name="out-action" checked={draft.outAction === "delete"} onChange={() => set({ outAction: "delete" })} />
              <span><b>حذف الموعد</b><small>يُحذف من جدول القسم نفسه (إن كان مصرّحاً لك)</small></span></label>
          </div>
        ) : null}
      </section>
      <section className="sp-step" aria-labelledby="sp-in">
        <h3 id="sp-in"><span>2</span>الشعبة التي ستدخل مكانه</h3>
        <div className="sp-seg" role="radiogroup" aria-label="نوع الشعبة الداخلة">
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="radio" aria-checked={draft.incoming === "assign"} onClick={() => set({ incoming: "assign", facultyId: null, courseId: null, scode: "" })}>شعبة من «هيئة تدريسية»</button>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="radio" aria-checked={draft.incoming === "create"} onClick={() => set({ incoming: "create", facultyId: null, courseId: null, scode: "" })}>شعبة جديدة</button>
        </div>
        {draft.incoming === "assign" ? assignBody : <CreateFields ws={ws} />}
      </section>
      <p className="sp-linked-note"><ArrowLeftRight aria-hidden="true" />طرفا الاستبدال يُثبَّتان معاً أو لا يُثبَّت أيٌّ منهما.</p>
    </div>
  );

  return (
    <form className="sp-form" onSubmit={e => { e.preventDefault(); if (ws.submitDraft()) onDone?.(); }} aria-labelledby="sp-form-title" noValidate>
      <div className="sp-form-head">
        <h2 id="sp-form-title">{editing ? "تعديل مادة في المقترح" : "إضافة مادة إلى المقترح"}</h2>
        <p className="sp-fixed"><span><Users aria-hidden="true" />{ctx.instructor.name}</span><span>{ctx.term.name}</span></p>
      </div>
      <div className="sp-modes" role="radiogroup" aria-label="نوع الإضافة">
        {MODES.map(({ mode, title, hint, Icon }) => (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={mode} type="button" role="radio" aria-checked={draft.mode === mode} disabled={editing && draft.mode !== mode}
            className="sp-mode" onClick={() => ws.chooseMode(mode)}>
            <Icon aria-hidden="true" /><span><b>{title}</b><small>{hint}</small></span>
          </button>
        ))}
      </div>

      <div className="sp-form-body">
        {draft.mode === "assign" ? assignBody : null}
        {draft.mode === "create" ? <CreateFields ws={ws} /> : null}
        {draft.mode === "edit" ? rowFields : null}
        {draft.mode === "replace" ? replaceBody : null}
        <Field label="ملاحظة للأستاذ (اختياري)">
          <input value={draft.note} maxLength={300} onChange={e => set({ note: e.target.value })} placeholder="سبب الاقتراح أو ما تودّ أن ينتبه إليه" />
        </Field>
      </div>

      {ws.draftFit && draft.mode !== "edit" && draft.mode !== "replace" ? (
        <p className="sp-inline-warn" role="status"><AlertTriangle aria-hidden="true" />يتداخل مع «{ws.draftFit.courseName || "محاضرة"}» في جدول الأستاذ — سيظهر في الفحص.</p>
      ) : null}
      {ws.formIssues.length ? (
        <ul className="sp-issues" role="alert">{ws.formIssues.map(issue => <li key={issue}><AlertTriangle aria-hidden="true" />{issue}</li>)}</ul>
      ) : null}

      <div className="sp-form-actions">
        <button type="submit" className="btn btn-primary" data-guide-target="proposal-add">
          {editing ? <><Check aria-hidden="true" />حفظ تعديل المادة</> : <><CirclePlus aria-hidden="true" />أضف إلى المقترح</>}
        </button>
        {editing ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={ws.cancelEdit}><RotateCcw aria-hidden="true" />إلغاء التعديل</button> : null}
      </div>
    </form>
  );
}

export type { FacultyEntry, ContextCourse, GridItem, StudyProposalOp, FormDraft };
