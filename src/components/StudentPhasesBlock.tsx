import React, { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, Flag, FileUp, Heart, Lock, Pencil, Plus, Route, Sparkles, Ticket, Trash2, WandSparkles, X } from "lucide-react";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";
import { kuwaitDateISO } from "../utils/approvalWorkflow";
import { deadlineDateShort } from "../utils/submissionDeadlines";
import { AR, countOf } from "../utils/arabicCount";
import {
  MAX_STUDENT_ROUNDS, ROUND_NAME_MAX, checkStudentPhases, hasStudentPhases, newRoundId, readStudentPhase,
  studentTimeline, suggestStudentPhases, type TimelineStep,
} from "../utils/termStudentPhases";
import { termHasEnded } from "../utils/termSequence";
import type { AdTerm, TermStudentPhases, TermStudentRound } from "../types";

/**
 * ── رحلة الطلبة: خمس محطاتٍ وتواريخُ تُكتب مرة ──────────────────────────────
 *
 * تعيش داخل لوحة «مواعيد التسليم» لا في شاشةٍ جديدة: رئيس التسجيل يضع موعد
 * التسليم ثم يكمل الرحلة من المكان نفسه. الشريطُ يُرى من بعيد (أين نحن اليوم)،
 * والمحرّر يفتح عند الطلب ويقول لكل حقلٍ خطأه بجملة. القواعد كلها من
 * utils/termStudentPhases — الخادم يفحص بها نفسِها فلا تَعِد الشاشة بما يرفضه.
 */

const STEP_ICON: Record<TimelineStep["kind"], React.ComponentType<any>> = {
  submission: FileUp, wishes: Heart, frozen: Lock, round: Ticket, close: Flag,
};

const STATE_WORD: Record<TimelineStep["state"], string> = {
  done: "مضت", now: "الآن", next: "قادمة", unset: "غير محدّدة",
};

const rangeText = (step: TimelineStep): string => {
  if (step.from && step.to && step.from !== step.to) return `${deadlineDateShort(step.from)} ← ${deadlineDateShort(step.to)}`;
  const only = step.to || step.from;
  return only ? deadlineDateShort(only) : "—";
};

const request = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  let data: any = {};
  if (text) { try { data = JSON.parse(text); } catch { throw new Error(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`); } }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** نموذجٌ يبدأ منه المحرّر من موعد التسليم: يُعدَّل ولا يُحفظ وحده. */
export function starterPhases(submissionDeadline: string): TermStudentPhases {
  const open = addDays(submissionDeadline, 1);
  const close = addDays(open, 13);
  return {
    wishesOpen: open, wishesClose: close,
    rounds: [
      { id: "r1", name: "مبكر", start: addDays(close, 6), end: addDays(close, 12) },
      { id: "r2", name: "عادي", start: addDays(close, 20), end: addDays(close, 26) },
    ],
    requestsClose: addDays(close, 40),
  };
}

interface Props {
  term: AdTerm | undefined;
  terms: AdTerm[];
  canEdit: boolean;
  onChanged: () => void;
}

export default function StudentPhasesBlock({ term, terms, canEdit, onChanged }: Props) {
  const saved = term?.AdTermStudentPhases;
  const submission = String(term?.AdTermSubmissionDeadline || "");
  const today = kuwaitDateISO();
  const reading = useMemo(() => readStudentPhase(saved, today), [saved, today]);
  const steps = useMemo(() => studentTimeline(saved, submission || undefined, today), [saved, submission, today]);
  const ended = Boolean(term && ((term as any).AdTermClosed === true || termHasEnded(term as any)));
  const suggestion = useMemo(() => suggestStudentPhases(term, terms), [term, terms]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TermStudentPhases>(saved || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { setEditing(false); setError(null); setMessage(null); setDraft(saved || {}); }, [term?.AdTermId]);
  useEffect(() => { if (!editing) setDraft(saved || {}); }, [saved, editing]);

  const check = useMemo(() => checkStudentPhases(draft, { submissionDeadline: submission || undefined }), [draft, submission]);
  const issueOf = (field: string) => check.issues.find(issue => issue.field === field)?.message;
  const rounds: TermStudentRound[] = draft.rounds || [];
  const dirty = JSON.stringify(check.phases) !== JSON.stringify({ ...(saved || {}), updatedAt: undefined, updatedBy: undefined });

  const setRound = (index: number, patch: Partial<TermStudentRound>) =>
    setDraft(value => ({ ...value, rounds: (value.rounds || []).map((round, i) => (i === index ? { ...round, ...patch } : round)) }));

  const save = async (phases: TermStudentPhases | null) => {
    if (!term) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await request("/api/approvals/student-phases", { termId: term.AdTermId, phases });
      setEditing(false);
      setMessage(phases ? "ثُبّتت مواعيد الطلبة للفصل." : "رُفعت مواعيد الطلبة.");
      onChanged();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const openEditor = (seed?: TermStudentPhases) => { setDraft(seed || saved || {}); setError(null); setEditing(true); };
  const set = hasStudentPhases(saved);

  return (
    <div className="sd-block sp-block" data-mode={reading.mode} aria-label="رحلة الطلبة">
      <h4>
        <Route aria-hidden="true" /> رحلة الطلبة
        {set ? <span className="sp-now" data-key={reading.key}>{reading.label}</span> : null}
        {canEdit && !editing && !ended && set ? (
          <SecondaryButton type="button" className="sd-add" data-guide-ignore="يفتح محرّر مواعيد الطلبة — الحفظ بعده هو الفعل" onClick={() => openEditor()}>
            <Pencil aria-hidden="true" /> عدّل المواعيد
          </SecondaryButton>
        ) : null}
      </h4>

      {error ? <Notice type="error" onDismiss={() => setError(null)}>{error}</Notice> : null}
      {message ? <Notice type="success" onDismiss={() => setMessage(null)}>{message}</Notice> : null}

      <ol className="sp-track" aria-label="مراحل الطلبة في الفصل">
        {steps.map(step => {
          const Icon = step.state === "done" ? Check : STEP_ICON[step.kind];
          return (
            <li key={step.id} className="sp-step" data-state={step.state} data-kind={step.kind} aria-current={step.state === "now" ? "step" : undefined}>
              <span className="sp-dot"><Icon aria-hidden="true" /></span>
              <b>{step.title}</b>
              <small>{rangeText(step)}</small>
              <span className="sr-only">{STATE_WORD[step.state]}</span>
            </li>
          );
        })}
      </ol>

      {set ? <p className="sd-muted sp-line">{reading.line}{reading.nextAt ? <> · التالي: {reading.nextLabel} {deadlineDateShort(reading.nextAt)}</> : null}</p> : null}

      {!set && !editing ? (
        <div className="sd-empty sp-empty">
          <Sparkles aria-hidden="true" />
          <div className="sd-empty-text">
            <strong>لم تُحدَّد مواعيد الطلبة لـ{term?.AdTermName || "هذا الفصل"}</strong>
            <small>{canEdit
              ? "الرغبات، ثم التجميد، ثم جولات التسجيل. بابُ الطالب والأقسام يتحركان بهذه التواريخ وحدها."
              : "يضعها رئيس التسجيل، فتظهر مراحل الطلبة لكل الأقسام."}</small>
          </div>
          {canEdit && !ended ? (
            <div className="sd-presets">
              {suggestion ? (
                <button type="button" className="sd-preset" data-guide-ignore="يفتح المحرّر بتواريخ مقترحة من الفصل نفسه في السنة الماضية — الحفظ بعده هو الفعل" onClick={() => openEditor(suggestion.phases)}>
                  <b><WandSparkles aria-hidden="true" /> مثل العام الماضي</b><small>{suggestion.fromTermName}</small>
                </button>
              ) : null}
              {submission ? (
                <button type="button" className="sd-preset" data-guide-ignore="يفتح المحرّر بنموذج يبدأ من موعد التسليم — الحفظ بعده هو الفعل" onClick={() => openEditor(starterPhases(submission))}>
                  <b><CalendarPlus aria-hidden="true" /> ابدأ بنموذج</b><small>من موعد التسليم</small>
                </button>
              ) : null}
              <button type="button" className="sd-preset" data-variant="custom" data-guide-ignore="يفتح المحرّر فارغاً — الحفظ بعده هو الفعل" onClick={() => openEditor({})}>
                <b>أدخلها بنفسك</b><small>تاريخاً تاريخاً</small>
              </button>
            </div>
          ) : null}
          {canEdit && !submission ? <p className="sd-muted sp-hint">ضع موعد تسليم الجداول أولاً — الرغبات تبدأ بعده.</p> : null}
        </div>
      ) : null}

      {editing ? (
        <div className="sd-editor sp-editor">
          {suggestion && hasStudentPhases(saved) ? (
            <button type="button" className="sp-suggest" data-guide-ignore="يملأ الحقول بتواريخ العام الماضي — الحفظ بعده هو الفعل" onClick={() => setDraft(suggestion.phases)}>
              <WandSparkles aria-hidden="true" /> مثل «{suggestion.fromTermName}» مُزاحةً {countOf(Math.abs(suggestion.shiftDays) / 7, AR.week)}
            </button>
          ) : null}

          <fieldset className="sp-group">
            <legend><Heart aria-hidden="true" /> فترة رغبات الطلبة في «مساري»</legend>
            <p className="sd-muted">هنا تحدد موعد استقبال احتياجات الطلبة لهذا الفصل، لا تسجيلهم الرسمي.</p>
            <div className="sp-pair">
              <label className="sd-field"><span>تبدأ</span>
                <input type="date" value={draft.wishesOpen || ""} onChange={e => setDraft(v => ({ ...v, wishesOpen: e.target.value }))} aria-invalid={Boolean(issueOf("wishesOpen"))} />
              </label>
              <label className="sd-field"><span>تنتهي</span>
                <input type="date" value={draft.wishesClose || ""} onChange={e => setDraft(v => ({ ...v, wishesClose: e.target.value }))} aria-invalid={Boolean(issueOf("wishesClose"))} />
              </label>
            </div>
            {issueOf("wishesOpen") ? <p className="sd-refusal">{issueOf("wishesOpen")}</p> : null}
            {issueOf("wishesClose") ? <p className="sd-refusal">{issueOf("wishesClose")}</p> : null}
          </fieldset>

          <fieldset className="sp-group">
            <legend><Ticket aria-hidden="true" /> جولات التسجيل <small>{countOf(rounds.length, AR.round)}</small></legend>
            {rounds.map((round, index) => (
              <div key={round.id} className="sp-round">
                <label className="sd-field"><span className="sr-only">اسم الجولة</span>
                  <input value={round.name} maxLength={ROUND_NAME_MAX} placeholder="مبكر" aria-label={`اسم الجولة ${index + 1}`} onChange={e => setRound(index, { name: e.target.value })} />
                </label>
                <label className="sd-field"><span className="sr-only">بداية الجولة</span>
                  <input type="date" value={round.start} aria-label={`بداية الجولة ${index + 1}`} onChange={e => setRound(index, { start: e.target.value })} />
                </label>
                <label className="sd-field"><span className="sr-only">نهاية الجولة</span>
                  <input type="date" value={round.end} aria-label={`نهاية الجولة ${index + 1}`} onChange={e => setRound(index, { end: e.target.value })} />
                </label>
                <button type="button" className="sd-icon" data-kind="remove" title="احذف الجولة" aria-label={`احذف الجولة ${index + 1}`}
                  data-guide-ignore="يزيل الجولة من المسودة فقط — لا يُحفظ شيء قبل «أثبِت المواعيد»"
                  onClick={() => setDraft(v => ({ ...v, rounds: (v.rounds || []).filter((_, i) => i !== index) }))}>
                  <Trash2 aria-hidden="true" />
                </button>
                {issueOf(`rounds.${index}`) ? <p className="sd-refusal sp-round-issue">{issueOf(`rounds.${index}`)}</p> : null}
              </div>
            ))}
            {issueOf("rounds") ? <p className="sd-refusal">{issueOf("rounds")}</p> : null}
            <button type="button" className="sp-add" disabled={rounds.length >= MAX_STUDENT_ROUNDS}
              data-guide-ignore="يضيف سطر جولة فارغاً إلى المسودة — لا يُحفظ شيء قبل «أثبِت المواعيد»"
              onClick={() => setDraft(v => {
                const list = v.rounds || [];
                const last = list[list.length - 1];
                const from = last ? addDays(last.end, 7) : (v.wishesClose ? addDays(v.wishesClose, 6) : "");
                return { ...v, rounds: [...list, { id: newRoundId(list), name: "", start: from, end: from ? addDays(from, 6) : "" }] };
              })}>
              <Plus aria-hidden="true" /> أضف جولة
            </button>
          </fieldset>

          <fieldset className="sp-group">
            <legend><Flag aria-hidden="true" /> إغلاق الطلبات</legend>
            <label className="sd-field"><span>آخر يومٍ يستقبل فيه القسمُ طلبَ طالبٍ متعثّر</span>
              <input type="date" value={draft.requestsClose || ""} onChange={e => setDraft(v => ({ ...v, requestsClose: e.target.value }))} aria-invalid={Boolean(issueOf("requestsClose"))} />
            </label>
            {issueOf("requestsClose") ? <p className="sd-refusal">{issueOf("requestsClose")}</p> : null}
          </fieldset>

          <div className="sd-editor-actions">
            <SecondaryButton type="button" data-guide-ignore="إلغاء تعديل مواعيد الطلبة — لا يغيّر شيئاً" onClick={() => { setDraft(saved || {}); setEditing(false); setError(null); }}>
              <X aria-hidden="true" /> إلغاء
            </SecondaryButton>
            {set ? (
              <SecondaryButton type="button" className="sd-danger" disabled={busy} data-guide-ignore="يرفع مواعيد الطلبة كلها عن الفصل — يعود الباب إلى «لم تُحدَّد»"
                onClick={() => void save(null)}>
                <Trash2 aria-hidden="true" /> ارفع المواعيد
              </SecondaryButton>
            ) : null}
            <PrimaryButton type="button" disabled={busy || !check.ok || !hasStudentPhases(check.phases) || !dirty}
              data-guide-ignore="يثبّت مواعيد الطلبة للفصل بعد فحصها — يراها باب الطالب والأقسام"
              onClick={() => void save(check.phases)}>
              {busy ? "يحفظ…" : "أثبِت المواعيد"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
