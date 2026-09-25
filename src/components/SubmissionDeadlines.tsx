/**
 * ── مواعيد التسليم ──────────────────────────────────────────────────────────
 *
 * كلَّ فصلٍ يضع رئيسُ التسجيل آخرَ موعدٍ لتسليم الجداول لكل الأقسام، ثم يستثني
 * بالأيام من يحتاج. كان ذلك حقلَ تاريخٍ مجرّداً بجانب اسم الفصل، وزرَّ «تمديد»
 * في كل سطرٍ من الوارد — قراران في موضعين، ولا يُرى منهما أين وصل الفصل.
 *
 * فصارا لوحةً واحدة في رأس «تغييرات الجدول»، وهي الموضعُ الوحيد الذي يُكتب منه
 * الموعدُ واستثناءاتُه:
 *   - الموعدُ كبيراً بيومه وما بقي عليه، وبلا موعدٍ ثلاثةُ مواعيد جاهزة.
 *   - ميزانُ الفصل: من سلّم ومن أُرجع ومن لم يبدأ، ومن تأخّر بالقاعدة الواحدة.
 *   - طلباتُ الأقسام تُمنح أو تُرفض بضغطة.
 *   - الاستثناءاتُ مجموعةً بتاريخها، تُعدَّل وتُرفع.
 * وتُطوى شريطاً واحداً متى وُضع الموعد ولم ينتظر شيءٌ صاحبَها.
 *
 * والقواعدُ كلها من `utils/submissionDeadlines` — المعاينةُ هنا والكتابةُ على
 * الخادم تقرآن الدوالَّ نفسها، فلا تَعِد الشاشةُ بتاريخٍ يكتب الخادمُ غيرَه.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock, CalendarPlus, Check, ChevronDown, ChevronUp, Hourglass, Inbox, Pencil, Search, Trash2, X,
} from "lucide-react";
import { Notice, PrimaryButton, SecondaryButton, useDialogDismiss } from "./ui";
import { daysBetween, kuwaitDateISO, readDeadline } from "../utils/approvalWorkflow";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";
import {
  DEADLINE_PRESET_WEEKS, EXCEPTION_DAY_CHIPS, EXCEPTION_MAX_DAYS, PROGRESS_LABEL,
  deadlineCountdown, deadlineDateLong, deadlineDateShort, deadlineHeadline, deadlinePhase, deadlineProgress,
  exceptionDaysLabel, exceptionRefusal, normalizeExceptionDays, planException, presetDeadline, presetLabel,
  previewExceptions, progressSegment, type ExceptionAmount, type ProgressSegment,
} from "../utils/submissionDeadlines";
import { currentTermId, termHasEnded, termPhase } from "../utils/termSequence";
import type { AdTerm, ScheduleApprovalStatus } from "../types";

/** سطرُ قسمٍ كما يصل من الوارد (/api/approvals/inbox). */
export interface DeadlineRow {
  collegeId: number; sectionId: number; collegeName: string; sectionName: string;
  status: ScheduleApprovalStatus | "notStarted"; round: number; rowCount: number;
  deadline: { effective?: string; past: boolean; daysLeft?: number; tone: string; extensionUntil?: string; extensionReason?: string };
  late: boolean;
  extensionRequest?: { by: string; at: string; reason: string; days: number };
  extensionBy?: string;
  extensionAt?: string;
}

interface Props {
  terms: AdTerm[];
  termId: number;
  onTermChange: (termId: number) => void;
  /** الوارد نفسه — قراءةٌ واحدة للشاشة كلها. null وهو يُقرأ. */
  rows: DeadlineRow[] | null;
  /** رئيسُ التسجيل (والإدارة) يكتب؛ وغيرُه يقرأ الشريط. */
  canEdit: boolean;
  onChanged: () => void;
  /** «تمديد» من سطر الوارد: تُفتح ورقةُ الاستثناء على ذلك القسم. */
  extendFor?: { row: DeadlineRow; nonce: number } | null;
  /** الإشعار فتح اللوحة (وقد يسمّي قسماً له طلب). */
  focus?: { collegeId: number; sectionId: number; nonce: number } | null;
}

const request = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  if (text) { try { data = JSON.parse(text); } catch { throw new Error(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`); } }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

const keyOf = (row: { collegeId: number; sectionId: number }) => `${row.collegeId}:${row.sectionId}`;
const COLLAPSE_KEY = "schedule:deadlines-panel:collapsed";
const SEGMENTS: ProgressSegment[] = ["accepted", "sent", "returned", "drafting", "notStarted"];

const stamp = (iso?: string) => {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? "" : at.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", month: "long" });
};

function readCollapsed(): boolean | null {
  try { const raw = localStorage.getItem(COLLAPSE_KEY); return raw === null ? null : raw === "1"; } catch { return null; }
}
function writeCollapsed(value: boolean) {
  try { localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0"); } catch { /* تخزينٌ ممنوع: يبقى الاختيار لهذه الزيارة */ }
}

/* ── ورقة الاستثناء ─────────────────────────────────────────────────────── */

type ScopeKind = "all" | "college" | "departments";

interface SheetSeed {
  title: string;
  scope: ScopeKind;
  picked: string[];
  mode: "days" | "date";
  days: number;
  until: string;
  reason: string;
}

function ExceptionSheet({ seed, rows, termId, termDeadline, onClose, onApplied }: {
  seed: SheetSeed; rows: DeadlineRow[]; termId: number; termDeadline: string;
  onClose: () => void; onApplied: (message: string) => void;
}) {
  const [scope, setScope] = useState<ScopeKind>(seed.scope);
  const [collegeId, setCollegeId] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set(seed.picked));
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"days" | "date">(seed.mode);
  const [days, setDays] = useState(seed.days);
  const [until, setUntil] = useState(seed.until);
  const [reason, setReason] = useState(seed.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failures, setFailures] = useState<Array<{ sectionName: string; error?: string }>>([]);
  useDialogDismiss(true, onClose);

  const colleges = useMemo(() => {
    const seen = new Map<number, string>();
    for (const row of rows) if (!seen.has(row.collegeId)) seen.set(row.collegeId, row.collegeName || `كلية ${row.collegeId}`);
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  }, [rows]);
  useEffect(() => { if (!collegeId && colleges.length) setCollegeId(colleges[0].id); }, [colleges, collegeId]);

  const targets = useMemo(() => rows.filter(row =>
    scope === "all" ? true : scope === "college" ? row.collegeId === collegeId : picked.has(keyOf(row))), [rows, scope, collegeId, picked]);

  const amount: ExceptionAmount | null = mode === "date" ? (until ? { until } : null) : (normalizeExceptionDays(days) ? { days } : null);
  const refusal = exceptionRefusal({ termDeadline, amount: mode === "date" ? { until } : { days }, reason });
  const preview = amount && targets.length
    ? previewExceptions(termDeadline, targets.map(row => ({ key: keyOf(row), extensionUntil: row.deadline.extensionUntil })), amount)
    : null;

  const grouped = useMemo(() => {
    const needle = search.trim();
    const byCollege = new Map<string, DeadlineRow[]>();
    for (const row of rows) {
      if (needle && !`${row.sectionName} ${row.collegeName}`.includes(needle)) continue;
      const list = byCollege.get(row.collegeName) || [];
      list.push(row);
      byCollege.set(row.collegeName, list);
    }
    return [...byCollege].sort((a, b) => a[0].localeCompare(b[0], "ar"));
  }, [rows, search]);

  const toggle = (key: string) => setPicked(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleCollege = (list: DeadlineRow[]) => setPicked(current => {
    const next = new Set(current);
    const all = list.every(row => next.has(keyOf(row)));
    for (const row of list) { if (all) next.delete(keyOf(row)); else next.add(keyOf(row)); }
    return next;
  });

  const apply = async () => {
    if (refusal || !targets.length) return;
    setBusy(true); setError(null); setFailures([]);
    try {
      const body = {
        termId, action: "grant", reason,
        ...(mode === "date" ? { until } : { days }),
        scope: scope === "all" ? { kind: "all" }
          : scope === "college" ? { kind: "college", collegeId }
          : { kind: "departments", departments: targets.map(row => ({ collegeId: row.collegeId, sectionId: row.sectionId })) },
      };
      const data = await request("/api/approvals/extensions", body);
      const failed = (data.results || []).filter((row: any) => !row.ok && !row.unchanged);
      if (failed.length) {
        setFailures(failed);
        setError(`طُبّق على ${countOf(Number(data.applied || 0), AR.department)}، وتعذّر ${countOf(failed.length, oblique(AR.department))}.`);
        onApplied("");
      } else {
        onApplied(`طُبّق الاستثناء على ${countOf(Number(data.applied || 0), AR.department)}.`);
        onClose();
      }
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="changes-extend-sheet sd-sheet" role="dialog" aria-modal="true" aria-label={seed.title}>
      <div className="changes-extend-card sd-sheet-card">
        <header>
          <strong><CalendarPlus aria-hidden="true" /> {seed.title}</strong>
          <button type="button" data-guide-ignore="إغلاق ورقة الاستثناء — لا يغيّر شيئاً" onClick={onClose} aria-label="إغلاق"><X /></button>
        </header>

        <fieldset className="sd-step">
          <legend><b>١</b> على من؟</legend>
          <div className="sd-seg" role="radiogroup" aria-label="نطاق الاستثناء">
            {([["all", `كل الأقسام (${rows.length})`], ["college", "كلية"], ["departments", "أقسام محدّدة"]] as Array<[ScopeKind, string]>).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={scope === value} data-active={scope === value || undefined}
                data-guide-ignore="اختيار نطاق الاستثناء داخل الورقة — التطبيق هو الفعل، وهو مسجّل" onClick={() => setScope(value)}>{label}</button>
            ))}
          </div>
          {scope === "college" ? (
            <label className="sd-field">
              <span>الكلية</span>
              <select value={collegeId} onChange={e => setCollegeId(Number(e.target.value))}>
                {colleges.map(college => <option key={college.id} value={college.id}>{college.name}</option>)}
              </select>
            </label>
          ) : null}
          {scope === "departments" ? (
            <div className="sd-picker">
              <div className="sd-search">
                <Search aria-hidden="true" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="ابحث باسم القسم أو الكلية" aria-label="بحث في الأقسام" />
                <small>{countOf(picked.size, AR.department, "لم يُختر قسم")}</small>
              </div>
              <div className="sd-picker-list">
                {grouped.map(([college, list]) => {
                  const all = list.every(row => picked.has(keyOf(row)));
                  return (
                    <div key={college} className="sd-picker-group">
                      <button type="button" className="sd-picker-college" data-on={all || undefined}
                        data-guide-ignore="تحديد أقسام كلية داخل الورقة — اختيارٌ لا فعل" onClick={() => toggleCollege(list)}>
                        <span className="sd-check" aria-hidden="true">{all ? <Check /> : null}</span>{college || "بلا كلية"}
                        <small>{countOf(list.length, AR.department)}</small>
                      </button>
                      {list.map(row => (
                        <label key={keyOf(row)} className="sd-picker-row">
                          <input type="checkbox" checked={picked.has(keyOf(row))} onChange={() => toggle(keyOf(row))} />
                          <span>{row.sectionName || `قسم ${row.sectionId}`}</span>
                          <small>{row.deadline.extensionUntil ? `استثناء حتى ${deadlineDateShort(row.deadline.extensionUntil)}` : ""}</small>
                        </label>
                      ))}
                    </div>
                  );
                })}
                {!grouped.length ? <p className="sd-muted">لا قسمَ بهذا الاسم.</p> : null}
              </div>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="sd-step">
          <legend><b>٢</b> كم؟</legend>
          <div className="sd-seg" role="radiogroup" aria-label="قدر الاستثناء">
            <button type="button" role="radio" aria-checked={mode === "days"} data-active={mode === "days" || undefined}
              data-guide-ignore="اختيار الأيام بدل التاريخ داخل الورقة — اختيارٌ لا فعل" onClick={() => setMode("days")}>أيامٌ إضافية</button>
            <button type="button" role="radio" aria-checked={mode === "date"} data-active={mode === "date" || undefined}
              data-guide-ignore="اختيار تاريخٍ محدّد داخل الورقة — اختيارٌ لا فعل" onClick={() => setMode("date")}>تاريخٌ محدّد</button>
          </div>
          {mode === "days" ? (
            <div className="sd-chips">
              {EXCEPTION_DAY_CHIPS.map(value => (
                <button key={value} type="button" className="sd-chip" data-active={days === value || undefined} aria-pressed={days === value}
                  data-guide-ignore="اختيار عدد الأيام داخل الورقة — اختيارٌ لا فعل" onClick={() => setDays(value)}>
                  +{countOf(value, AR.day)}
                </button>
              ))}
              <label className="sd-days-input">
                <span>أو</span>
                <input type="number" min={1} max={EXCEPTION_MAX_DAYS} value={days} onChange={e => setDays(Math.round(Number(e.target.value) || 0))} aria-label="عدد الأيام" />
                <span>{nounFor(days, AR.day)}</span>
              </label>
            </div>
          ) : (
            <label className="sd-field">
              <span>حتى تاريخ <small>لا يسبق موعد الفصل ({deadlineDateShort(termDeadline)})</small></span>
              <input type="date" min={termDeadline} value={until} onChange={e => setUntil(e.target.value)} />
            </label>
          )}
        </fieldset>

        <fieldset className="sd-step">
          <legend><b>٣</b> لماذا؟</legend>
          <label className="sd-field">
            <span>السبب <small>مطلوب — يراه القسم مع موعده</small></span>
            <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="تأخّر اعتماد المنتدبين" />
          </label>
        </fieldset>

        <div className="sd-preview" data-ready={Boolean(preview && !refusal) || undefined} aria-live="polite">
          <CalendarClock aria-hidden="true" />
          <div>
            <strong>{preview ? preview.sentence : targets.length ? "اختر الأيام أو التاريخ." : "اختر الأقسام أولاً."}</strong>
            {preview && mode === "days" ? (
              <small>
                تُعدّ الأيام من موعد الفصل ({deadlineDateShort(termDeadline)})
                {preview.fromExtension ? ` — و${countOf(preview.fromExtension, AR.department)} من استثنائه القائم لأنه أبعد` : ""}.
              </small>
            ) : null}
            {refusal && targets.length ? <small className="sd-refusal">{refusal}</small> : null}
          </div>
        </div>

        {error ? <Notice type="error">{error}</Notice> : null}
        {failures.length ? (
          <ul className="sd-failures">{failures.map((row, index) => <li key={index}><b>{row.sectionName}</b> — {row.error}</li>)}</ul>
        ) : null}

        <div className="changes-extend-actions">
          <SecondaryButton type="button" data-guide-ignore="إلغاء الاستثناء قبل تطبيقه — لا يغيّر شيئاً" onClick={onClose}>إلغاء</SecondaryButton>
          <PrimaryButton type="button" data-guide-target="changes.action.exceptions" disabled={busy || Boolean(refusal) || !targets.length} onClick={apply}>
            {busy ? "يطبّق…" : targets.length ? `طبّق على ${countOf(targets.length, AR.department)}` : "طبّق"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ── اللوحة ─────────────────────────────────────────────────────────────── */

export default function SubmissionDeadlines({ terms, termId, onTermChange, rows, canEdit, onChanged, extendFor, focus }: Props) {
  const term = terms.find(row => Number(row.AdTermId) === termId);
  const termDeadline = String(term?.AdTermSubmissionDeadline || "");
  const today = kuwaitDateISO();
  const state = readDeadline({ termDeadline: termDeadline || undefined }, new Date());
  const phase = deadlinePhase(state);
  const list = rows || [];
  const progress = useMemo(() => deadlineProgress(list), [list]);
  const requests = useMemo(() => list.filter(row => row.extensionRequest), [list]);
  const exceptions = useMemo(() => list.filter(row => row.deadline.extensionUntil), [list]);
  const exceptionGroups = useMemo(() => {
    const byDate = new Map<string, DeadlineRow[]>();
    for (const row of exceptions) {
      const until = String(row.deadline.extensionUntil);
      byDate.set(until, [...(byDate.get(until) || []), row]);
    }
    return [...byDate].sort((a, b) => a[0].localeCompare(b[0]));
  }, [exceptions]);
  const handedOver = progress.sent + progress.accepted + progress.returned;

  const [collapsed, setCollapsed] = useState<boolean>(() => readCollapsed() ?? true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(termDeadline);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetSeed | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => { setDraft(termDeadline); setEditing(false); setError(null); setMessage(null); }, [termId, termDeadline]);

  /* ما ينتظر صاحبَ القرار لا يُطوى عنه: فصلٌ بلا موعد، أو طلبٌ معلّق. */
  const needsAttention = canEdit && (phase === "none" || requests.length > 0);
  const open = !collapsed || needsAttention || editing || Boolean(sheet);

  useEffect(() => {
    if (!extendFor) return;
    const { row } = extendFor;
    const ask = row.extensionRequest;
    setSheet({
      title: `استثناءُ «${row.sectionName || `قسم ${row.sectionId}`}»`,
      scope: "departments", picked: [keyOf(row)],
      mode: !ask && row.deadline.extensionUntil ? "date" : "days",
      days: ask ? Math.min(EXCEPTION_MAX_DAYS, Math.max(1, ask.days)) : 3,
      until: row.deadline.extensionUntil || termDeadline,
      reason: ask ? ask.reason : row.deadline.extensionReason || "",
    });
  }, [extendFor?.nonce]);

  useEffect(() => {
    if (!focus) return;
    setCollapsed(false);
    if (focus.sectionId) setHighlight(`${focus.collegeId}:${focus.sectionId}`);
    requestAnimationFrame(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focus?.nonce]);

  const toggleCollapsed = () => setCollapsed(value => { writeCollapsed(!value); return !value; });

  const saveDeadline = async (value: string) => {
    setBusy("deadline"); setError(null); setMessage(null);
    try {
      await request("/api/approvals/deadline", { termId, deadline: value });
      setEditing(false);
      setMessage(value ? `ثُبّت آخر موعد: ${deadlineDateLong(value)} — ظاهرٌ لكل الأقسام.` : "رُفع موعد التسليم.");
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const bulk = async (tag: string, body: Record<string, unknown>, done: string) => {
    setBusy(tag); setError(null); setMessage(null);
    try {
      const data = await request("/api/approvals/extensions", { termId, ...body });
      const failed = (data.results || []).find((row: any) => !row.ok && !row.unchanged);
      if (failed) setError(`${failed.sectionName}: ${failed.error}`); else setMessage(done);
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const one = (row: DeadlineRow) => ({ kind: "departments", departments: [{ collegeId: row.collegeId, sectionId: row.sectionId }] });

  const termOptions = useMemo(() => {
    const live = currentTermId(terms);
    return terms
      .filter(row => Number(row.AdTermId) === termId || (row.AdTermClosed !== true && !termHasEnded(row)))
      .map(row => ({
        id: Number(row.AdTermId),
        label: `${row.AdTermName}${termPhase(row, live) === "current" ? " — الجاري" : termPhase(row, live) === "upcoming" ? " — القادم" : ""}`,
      }));
  }, [terms, termId]);

  const tile = termDeadline ? (() => {
    const at = new Date(Date.UTC(Number(termDeadline.slice(0, 4)), Number(termDeadline.slice(5, 7)) - 1, Number(termDeadline.slice(8, 10))));
    return {
      day: at.toLocaleDateString("ar-KW-u-nu-latn", { day: "numeric", timeZone: "UTC" }),
      month: at.toLocaleDateString("ar-KW-u-nu-latn", { month: "long", timeZone: "UTC" }),
      weekday: at.toLocaleDateString("ar-KW-u-nu-latn", { weekday: "long", timeZone: "UTC" }),
    };
  })() : null;

  const bar = (
    <div className="sd-bar" role="img" aria-label={`${countOf(handedOver, AR.department)} سلّمت من ${progress.total}`}>
      {SEGMENTS.map(segment => progress[segment] ? (
        <span key={segment} data-segment={segment} style={{ flexGrow: progress[segment] }} title={`${PROGRESS_LABEL[segment]}: ${progress[segment]}`} />
      ) : null)}
    </div>
  );

  /* ── الشريط المطويّ ── */
  if (!open) {
    return (
      <section ref={panelRef} className="sd-panel sd-strip" data-phase={phase} data-tone={state.tone} aria-label="مواعيد التسليم">
        <CalendarClock className="sd-strip-icon" aria-hidden="true" />
        <div className="sd-strip-main">
          <strong>{deadlineHeadline(state)}</strong>
          <div className="sd-strip-meta">
            {rows ? bar : null}
            <span>سلّم <b>{handedOver}</b> من {progress.total}</span>
            {progress.late ? <span className="sd-pill" data-tone="danger">{countOf(progress.late, AR.department)} {nounFor(progress.late, AR.lateAdj)}</span> : null}
            {exceptions.length ? <span className="sd-pill">{countOf(exceptions.length, AR.exception)}</span> : null}
            {requests.length ? <span className="sd-pill" data-tone="warning">طلبات تمديد: {requests.length}</span> : null}
          </div>
        </div>
        <button type="button" className="sd-toggle" aria-expanded={false} data-guide-ignore="فتح لوحة مواعيد التسليم — عرضٌ لا فعل" onClick={toggleCollapsed}>
          {canEdit ? "إدارة المواعيد" : "التفاصيل"} <ChevronDown aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <section ref={panelRef} className="sd-panel" data-phase={phase} data-tone={state.tone} aria-label="مواعيد التسليم">
      <header className="sd-head">
        <div className="sd-title">
          <span className="sd-kicker"><CalendarClock aria-hidden="true" /> مواعيد التسليم</span>
          {termOptions.length > 1 ? (
            <label className="sd-term">
              <span className="sr-only">الفصل</span>
              <select value={termId} onChange={e => onTermChange(Number(e.target.value))} aria-label="الفصل">
                {termOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          ) : <span className="sd-term-name">{term?.AdTermName}</span>}
        </div>
        {!needsAttention ? (
          <button type="button" className="sd-toggle" aria-expanded={true} data-guide-ignore="طيّ لوحة مواعيد التسليم — عرضٌ لا فعل" onClick={toggleCollapsed}>
            اطوِ <ChevronUp aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {error ? <Notice type="error" onDismiss={() => setError(null)}>{error}</Notice> : null}
      {message ? <Notice type="success" onDismiss={() => setMessage(null)}>{message}</Notice> : null}

      {/* ── الموعد ── */}
      {phase === "none" && !editing ? (
        <div className="sd-empty">
          <Hourglass aria-hidden="true" />
          <div className="sd-empty-text">
            <strong>لم يُحدَّد آخر موعدٍ لتسليم جداول {term?.AdTermName || "هذا الفصل"}</strong>
            <small>{canEdit
              ? "موعدٌ واحد لكل الأقسام، ينتهي 23:59 بتوقيت الكويت. ثم تُضاف الاستثناءات لمن يحتاج."
              : "يضعه رئيس التسجيل، فيظهر لكل قسمٍ فوق جدوله."}</small>
          </div>
          {canEdit ? (
            <div className="sd-presets">
              {DEADLINE_PRESET_WEEKS.map(weeks => {
                const value = presetDeadline(today, weeks);
                return (
                  <button key={weeks} type="button" className="sd-preset" data-guide-target="changes.action.deadline" disabled={Boolean(busy)} onClick={() => void saveDeadline(value)}>
                    <b>{presetLabel(weeks)}</b>
                    <small>{deadlineDateShort(value)}</small>
                  </button>
                );
              })}
              <button type="button" className="sd-preset" data-variant="custom" data-guide-ignore="يفتح حقل التاريخ — الحفظ بعده هو الفعل" onClick={() => { setDraft(""); setEditing(true); }}>
                <b>تاريخٌ آخر</b><small>اختر من التقويم</small>
              </button>
            </div>
          ) : null}
        </div>
      ) : editing ? (
        <div className="sd-editor">
          <label className="sd-field">
            <span>آخر موعد لتسليم الجداول <small>ينتهي 23:59 بتوقيت الكويت</small></span>
            <input type="date" value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
          </label>
          {draft ? <p className="sd-muted">{deadlineHeadline(readDeadline({ termDeadline: draft }, new Date()))}</p> : null}
          {draft && exceptions.some(row => String(row.deadline.extensionUntil) < draft) ? (
            <p className="sd-refusal">
              استثناءاتٌ أقرب من الموعد الجديد: {exceptions.filter(row => String(row.deadline.extensionUntil) < draft).length} — راجعها بعد الحفظ، فالاستثناء يتقدّم على موعد الفصل.
            </p>
          ) : null}
          <div className="sd-editor-actions">
            <SecondaryButton type="button" data-guide-ignore="إلغاء تعديل الموعد — لا يغيّر شيئاً" onClick={() => { setDraft(termDeadline); setEditing(false); }}>إلغاء</SecondaryButton>
            {termDeadline ? (
              <SecondaryButton type="button" className="sd-danger" data-guide-target="changes.action.deadline" disabled={Boolean(busy)} onClick={() => void saveDeadline("")}>
                <Trash2 aria-hidden="true" /> ارفع الموعد
              </SecondaryButton>
            ) : null}
            <PrimaryButton type="button" data-guide-target="changes.action.deadline" disabled={Boolean(busy) || !draft || draft === termDeadline} onClick={() => void saveDeadline(draft)}>
              {busy === "deadline" ? "يحفظ…" : "أثبِت الموعد"}
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="sd-hero">
          {tile ? (
            <div className="sd-tile" aria-hidden="true">
              <span className="sd-tile-month">{tile.month}</span>
              <b>{tile.day}</b>
              <span className="sd-tile-weekday">{tile.weekday}</span>
            </div>
          ) : null}
          <div className="sd-hero-text">
            <span className="sd-hero-label">آخر موعد لتسليم الجداول</span>
            <strong>{deadlineDateLong(termDeadline)}</strong>
            <div className="sd-hero-meta">
              <span className="sd-countdown" data-phase={phase} data-tone={state.tone}>{deadlineCountdown(state)}</span>
              <small>ينتهي 23:59 بتوقيت الكويت · لكل الأقسام{exceptions.length ? ` عدا ${countOf(exceptions.length, AR.exception)}` : ""}</small>
            </div>
          </div>
          {canEdit ? (
            <SecondaryButton type="button" className="sd-edit" data-guide-ignore="يفتح حقل تعديل الموعد — الحفظ بعده هو الفعل" onClick={() => { setDraft(termDeadline); setEditing(true); }}>
              <Pencil aria-hidden="true" /> غيّر الموعد
            </SecondaryButton>
          ) : null}
        </div>
      )}

      {/* ── ميزان الفصل ── */}
      {rows ? (
        <div className="sd-progress">
          <div className="sd-progress-head">
            <strong>سلّم {handedOver} من {countOf(progress.total, AR.department)}</strong>
            {progress.late ? <span className="sd-pill" data-tone="danger">{countOf(progress.late, AR.department)} {nounFor(progress.late, AR.lateAdj)} عن الموعد</span> : null}
          </div>
          {bar}
          <ul className="sd-legend">
            {SEGMENTS.map(segment => (
              <li key={segment} data-segment={segment} data-zero={!progress[segment] || undefined}>
                <i aria-hidden="true" />{PROGRESS_LABEL[segment]} <b>{progress[segment]}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : <p className="sd-muted">يقرأ الأقسام…</p>}

      {/* ── طلبات الأقسام ── */}
      {requests.length ? (
        <div className="sd-block">
          <h4><Inbox aria-hidden="true" /> طلبات تمديد <span className="sd-count">{requests.length}</span></h4>
          <ul className="sd-requests">
            {requests.map(row => {
              const ask = row.extensionRequest!;
              const days = Math.min(EXCEPTION_MAX_DAYS, Math.max(1, ask.days));
              const plan = termDeadline ? planException(termDeadline, row.deadline.extensionUntil, { days }) : null;
              const key = keyOf(row);
              return (
                <li key={key} className="sd-request" data-highlight={highlight === key || undefined}>
                  <div className="sd-request-text">
                    <strong>{row.sectionName || `قسم ${row.sectionId}`} <small>{row.collegeName}</small></strong>
                    <span>يطلب {countOf(ask.days, oblique(AR.day))} — «{ask.reason}»</span>
                    <small>{ask.by}{ask.at ? ` · ${stamp(ask.at)}` : ""}{plan ? ` · يصير موعده ${deadlineDateShort(plan.until)}` : ""}</small>
                  </div>
                  {canEdit ? (
                    rejecting === key ? (
                      <div className="sd-reject">
                        <input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="سبب الرفض — يراه القسم" aria-label="سبب الرفض" autoFocus />
                        <SecondaryButton type="button" data-guide-ignore="إلغاء الرفض — لا يغيّر شيئاً" onClick={() => setRejecting(null)}>تراجع</SecondaryButton>
                        <SecondaryButton type="button" className="sd-danger" data-guide-target="changes.action.exceptions" disabled={Boolean(busy) || rejectReason.trim().length < 3}
                          onClick={() => void bulk(`reject:${key}`, { action: "reject", reason: rejectReason, scope: one(row) }, `رُفض طلب ${row.sectionName}.`).then(() => setRejecting(null))}>
                          ارفض
                        </SecondaryButton>
                      </div>
                    ) : (
                      <div className="sd-request-actions">
                        <PrimaryButton type="button" data-guide-target="changes.action.exceptions" disabled={Boolean(busy) || !termDeadline}
                          onClick={() => void bulk(`grant:${key}`, { action: "grant", days, reason: ask.reason, scope: one(row) }, `مُنح ${row.sectionName} ${countOf(days, oblique(AR.day))} — حتى ${plan ? deadlineDateShort(plan.until) : ""}.`)}>
                          {busy === `grant:${key}` ? "يمنح…" : <>منح (+{countOf(days, AR.day)})</>}
                        </PrimaryButton>
                        <SecondaryButton type="button" data-guide-ignore="يفتح سبب الرفض — الرفض بعده هو الفعل" disabled={Boolean(busy)} onClick={() => { setRejecting(key); setRejectReason(""); }}>
                          رفض
                        </SecondaryButton>
                      </div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ── الاستثناءات ── */}
      {termDeadline ? (
        <div className="sd-block">
          <h4>
            <CalendarPlus aria-hidden="true" /> الاستثناءات {exceptions.length ? <span className="sd-count">{exceptions.length}</span> : null}
            {canEdit && rows ? (
              <PrimaryButton type="button" className="sd-add" data-guide-target="changes.action.exceptions" onClick={() => setSheet({
                title: "إضافة استثناء", scope: "departments", picked: [], mode: "days", days: 3, until: termDeadline, reason: "",
              })}>
                <CalendarPlus aria-hidden="true" /> إضافة استثناء
              </PrimaryButton>
            ) : null}
          </h4>
          {exceptionGroups.length ? (
            <div className="sd-exceptions">
              {exceptionGroups.map(([until, group]) => (
                <div key={until} className="sd-exception-group">
                  <div className="sd-exception-date">
                    <strong>{deadlineDateShort(until)}</strong>
                    <span className="sd-pill" data-tone={until < termDeadline ? "danger" : undefined}>{exceptionDaysLabel(daysBetween(termDeadline, until))}</span>
                    <small>{countOf(group.length, AR.department)}</small>
                  </div>
                  <ul>
                    {group.map(row => (
                      <li key={keyOf(row)} className="sd-exception" data-highlight={highlight === keyOf(row) || undefined}>
                        <div>
                          <strong>{row.sectionName || `قسم ${row.sectionId}`} <small>{row.collegeName}</small></strong>
                          {row.deadline.extensionReason ? <span>{row.deadline.extensionReason}</span> : null}
                          {row.extensionBy || row.extensionAt ? <small>{[row.extensionBy, stamp(row.extensionAt)].filter(Boolean).join(" · ")}</small> : null}
                        </div>
                        {canEdit ? (
                          <div className="sd-exception-actions">
                            <button type="button" className="sd-icon" title="تعديل الاستثناء" aria-label={`تعديل استثناء ${row.sectionName}`}
                              data-guide-ignore="يفتح ورقة الاستثناء مملوءة — التطبيق بعدها هو الفعل" onClick={() => setSheet({
                                title: `تعديل استثناء «${row.sectionName}»`, scope: "departments", picked: [keyOf(row)],
                                mode: "date", days: 3, until: String(row.deadline.extensionUntil), reason: row.deadline.extensionReason || "",
                              })}>
                              <Pencil aria-hidden="true" />
                            </button>
                            <button type="button" className="sd-icon" data-kind="remove" title="رفع الاستثناء — يعود إلى موعد الفصل" aria-label={`رفع استثناء ${row.sectionName}`}
                              data-guide-target="changes.action.exceptions" disabled={Boolean(busy)}
                              onClick={() => void bulk(`remove:${keyOf(row)}`, { action: "remove", scope: one(row) }, `عاد ${row.sectionName} إلى موعد الفصل.`)}>
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="sd-muted">لا استثناءات — كلُّ الأقسام على موعد الفصل.</p>
          )}
        </div>
      ) : null}

      {sheet && rows && termDeadline ? (
        <ExceptionSheet
          seed={sheet} rows={rows} termId={termId} termDeadline={termDeadline}
          onClose={() => setSheet(null)}
          onApplied={(done) => { if (done) setMessage(done); onChanged(); }}
        />
      ) : null}
    </section>
  );
}
