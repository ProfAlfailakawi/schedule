/**
 * ── معاينةُ الإرسال، ومراجعةُ التثبيت، وردودُ الأستاذ ───────────────────────
 *
 * لا يُرسَل شيءٌ تلقائياً: «معاينة وإرسال» تعرض ما سيراه الأستاذ أولاً، والإرسالُ
 * فعلٌ صريح. وبعد الإرسال يُعطى المنسّق الرابطَ الشخصيَّ ورسالةً جاهزةً للنسخ —
 * ولا يدّعي النظامُ أنه أرسل بريداً أو رسالة، لأنه لم يفعل.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Check, ClipboardCopy, Link2, LoaderCircle, MessageCircle, MessageSquareWarning, Send, ShieldCheck, ThumbsUp, X, Clock, RotateCcw,
} from "lucide-react";
import { useDrawerA11y } from "../ui";
import type { StudyProposal } from "../../types";
import {
  expiryAfterDays, OP_KIND_LABEL, PROPOSAL_DAY_NAMES, PROPOSAL_MESSAGE_LIMIT, STATUS_LABEL, daysOf, effectiveStatus, type ProposalEvaluation,
} from "../../utils/studyProposal";
import { whatsappNumber } from "../../utils/reachInstructor";
import { AR, countOf } from "../../utils/arabicCount";
import { proposalApi, ProposalApiError, type StaffProposalView } from "./proposalApi";
import type { Workspace } from "./useProposalWorkspace";
import ProposalWeekGrid from "./ProposalWeekGrid";
import { arabicDate, arabicDateTime, daysLabel, hoursShort, minutesLabel, num, OP_NOUN, timeRange } from "./proposalFormat";
import { summaryLine } from "./ProposalHeader";

function Modal({ label, onClose, children, wide }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useDrawerA11y<HTMLDivElement>(onClose);
  return (
    <div className="sp-modal-layer">
      <div className="sp-modal-backdrop" onMouseDown={onClose} aria-hidden="true" />
      <div ref={ref} className="sp-modal" data-wide={wide || undefined} role="dialog" aria-modal="true" aria-label={label}>
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-modal-close" onClick={onClose} aria-label="إغلاق"><X aria-hidden="true" /></button>
        {children}
      </div>
    </div>
  );
}

const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = document.createElement("textarea");
    area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
    document.body.appendChild(area); area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    area.remove();
    return ok;
  }
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={async () => { if (await copy(text)) { setDone(true); window.setTimeout(() => setDone(false), 1800); } }}>
      {done ? <Check aria-hidden="true" /> : <ClipboardCopy aria-hidden="true" />}{done ? "تم النسخ" : label}
    </button>
  );
}

/* ═══════════════ معاينة وإرسال ═══════════════ */

export function SendDialog({ ws, onClose, onSent }: { ws: Workspace; onClose: () => void; onSent: () => void }) {
  const { ctx, proposal, evaluation } = ws;
  const [stage, setStage] = useState<"preview" | "sent">("preview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentView, setSentView] = useState<StaffProposalView | null>(null);
  const [gridMode, setGridMode] = useState<"current" | "with">("with");
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  /* المعاينةُ تُحفظ أولاً: ما يراه المنسّق هو ما سيصل. */
  useEffect(() => {
    let live = true;
    (async () => {
      if (ws.dirty || !proposal) { const result = await ws.save(); if (live) setSaved(Boolean(result)); }
      else setSaved(true);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ctx) return null;
  const ready = ws.evalCurrent && evaluation?.readiness.canSend && saved && proposal;
  const hasLinkedHint = ws.ops.some(op => op.kind === "replace" || op.kind === "edit") && ws.ops.length > 1;
  const expiry = expiryAfterDays(ws.expiryDays);
  const link = sentView ? `${location.origin}/r/${ctx.request.linkId}/proposal/${sentView.proposal.id}` : "";
  const deadline = sentView?.proposal.expiresAt ? arabicDate(sentView.proposal.expiresAt) : arabicDate(expiry.expiresAt);
  const readyMessage = [
    `السلام عليكم ${ctx.instructor.name}،`,
    `لديك مقترح دراسي من ${ctx.scope.sectionName || "القسم"} لفصل ${ctx.term.name}.`,
    `تقدر تطّلع على أثره في جدولك وتخبرنا إذا يناسبك من رابطك الشخصي (آخر موعد للرد: ${deadline}):`,
    link,
  ].filter(Boolean).join("\n");
  const wa = whatsappNumber(ctx.instructor.mobile);

  const send = async () => {
    if (!proposal || busy) return;
    setBusy(true); setError("");
    try {
      const result = await proposalApi.send(proposal.id, { rev: proposal.rev, message: ws.message, expiryDays: ws.expiryDays });
      ws.replaceView(result);
      setSentView(result); setStage("sent"); onSent();
    } catch (err) {
      if (err instanceof ProposalApiError && err.isRevisionConflict) setError("عدّل شخصٌ آخر هذا المقترح. أغلق المعاينة وأعد تحميله.");
      else setError(err instanceof Error ? err.message : "تعذّر الإرسال.");
    } finally { setBusy(false); }
  };

  const before = evaluation?.before.metrics, after = evaluation?.after.metrics;
  const rows: Array<[string, string, string]> = before && after ? [
    ["النصاب", before.loadUnits === null ? "غير متوفر" : countOf(before.loadUnits, AR.hour), after.loadUnits === null ? "غير متوفر" : countOf(after.loadUnits, AR.hour)],
    ["عدد الشعب", num(before.sections), num(after.sections)],
    ["أيام الحضور", countOf(before.attendanceDays, AR.day), countOf(after.attendanceDays, AR.day)],
    ["ساعات الحضور", countOf(Number(hoursShort(before.presenceMinutes).replace(",", ".")), AR.hour), countOf(Number(hoursShort(after.presenceMinutes).replace(",", ".")), AR.hour)],
    ["الفراغات بين المحاضرات", minutesLabel(before.gapMinutes), minutesLabel(after.gapMinutes)],
  ] : [];

  if (stage === "sent" && sentView) {
    return (
      <Modal label="تم إرسال المقترح" onClose={onClose}>
        <div className="sp-sent">
          <span className="sp-sent-icon" aria-hidden="true"><Check /></span>
          <h2>أُرسل المقترح إلى الأستاذ</h2>
          <p className="sp-sent-lead">أصبح المقترح (النسخة {num(sentView.proposal.sentVersion)}) ظاهراً في كرت {ctx.instructor.name} الشخصي. الإرسال لا يحجز شعبةً ولا قاعةً، ولا يغيّر جدوله الفعلي.</p>
          <p className="sp-note-box"><AlertTriangle aria-hidden="true" />لم يُرسل النظام بريداً أو رسالةً إلى الأستاذ. انسخ الرابط أو الرسالة الجاهزة وأرسلها له بوسيلتك.</p>
          <label className="sp-copy-field"><span><Link2 aria-hidden="true" />رابط المقترح الشخصي</span>
            <input readOnly value={link} dir="ltr" onFocus={e => e.currentTarget.select()} /></label>
          <label className="sp-copy-field"><span>رسالة جاهزة</span>
            <textarea readOnly rows={5} value={readyMessage} onFocus={e => e.currentTarget.select()} /></label>
          <div className="sp-modal-actions">
            <CopyButton data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" text={link} label="انسخ الرابط" />
            <CopyButton data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" text={readyMessage} label="انسخ الرسالة" />
            {wa ? <a className="btn btn-secondary" href={`https://wa.me/${wa}?text=${encodeURIComponent(readyMessage)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />افتح واتساب</a> : null}
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-primary" onClick={onClose}>تم</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal label="معاينة المقترح قبل الإرسال" onClose={onClose} wide>
      <div className="sp-send">
        <header>
          <p className="sp-eyebrow">معاينة وإرسال</p>
          <h2>هذا ما سيراه {ctx.instructor.name}</h2>
          <p className="sp-send-sum">{summaryLine(ws.ops.length, evaluation?.counts.blockers ?? null, evaluation?.counts.reviews ?? null, ws.evalCurrent)}</p>
        </header>

        <div className="sp-send-grid">
          <div className="sp-send-main">
            <label className="sp-field-block"><span>عنوان المقترح</span>
              <input value={ws.title} maxLength={160} onChange={e => ws.setTitle(e.target.value)} /></label>
            <label className="sp-field-block"><span>رسالة القسم <small><bdi dir="ltr">{num(ws.message.length)} / {num(PROPOSAL_MESSAGE_LIMIT)}</bdi></small></span>
              <textarea rows={4} value={ws.message} maxLength={PROPOSAL_MESSAGE_LIMIT} onChange={e => ws.setMessage(e.target.value)} /></label>

            <fieldset className="sp-field-block sp-mode-choice">
              <legend>طريقة رد الأستاذ</legend>
              <label data-on={ws.responseMode === "independent" || undefined}><input type="radio" name="rmode" checked={ws.responseMode === "independent"} onChange={() => ws.setResponseMode("independent")} />
                <span><b>مواد مستقلة</b><small>يوافق على مادةٍ ويطلب تعديل أخرى، ويُثبَّت ما وافق عليه فقط.</small></span></label>
              <label data-on={ws.responseMode === "linked" || undefined}><input type="radio" name="rmode" checked={ws.responseMode === "linked"} onChange={() => ws.setResponseMode("linked")} />
                <span><b>ترتيبٌ مترابط</b><small>يوافق على المجموعة كاملة أو يطلب تعديلها؛ لا يُثبَّت جزءٌ منها وحده.</small></span></label>
              {hasLinkedHint && ws.responseMode === "independent" ? <p className="sp-hint"><AlertTriangle aria-hidden="true" />في المقترح استبدالٌ أو نقلٌ بين عدة مواد؛ يُنصح بـ«الترتيب المترابط» حتى لا يُثبَّت جزءٌ يترك الجدول ناقصاً.</p> : null}
            </fieldset>

            <label className="sp-field-block"><span>مدة صلاحية الرد</span>
              <select value={ws.expiryDays} onChange={e => ws.setExpiryDays(Number(e.target.value))}>
                {[3, 7, 14, 21, 30].map(d => <option key={d} value={d}>{countOf(d, AR.day)}</option>)}
              </select>
              <small>آخر موعد للرد: {arabicDate(expiry.expiresAt)} — وبعده لا يقبل الرابط ردّاً.</small>
              <details className="sp-policy"><summary>متى يمكن الرد والتثبيت؟</summary>
                <ul>
                  <li><b>الرد:</b> يُقبل حتى آخر موعدٍ أعلاه، حتى لو أُغلق استقبال رغبات جديدة؛ ويتوقف إن سُحب المقترح أو أُرسلت نسخةٌ أحدث أو انتهى الفصل.</li>
                  <li><b>الرابط:</b> يبقى مقروءاً حتى نهاية الفصل، لكنه لا يقبل ردّاً بعد انتهاء الصلاحية.</li>
                  <li><b>التثبيت:</b> بيدك بعد موافقة الأستاذ، ويمنعه تجميد الجدول أو اعتماده عند التسجيل أو تغيّر المواعيد الأصلية.</li>
                </ul>
              </details></label>

            <section className="sp-send-ops" aria-label="مواد المقترح">
              <h3>المواد ({num(ws.ops.length)})</h3>
              <ul>{ws.ops.map(op => (
                <li key={op.id}><b>{OP_KIND_LABEL[op.kind]}</b><span>{op.target.courseName} · شعبة {op.target.SCode}</span>
                  <span>{daysLabel(daysOf(op.target))} · <bdi className="sp-time">{timeRange(op.target.fstarttime, op.target.fendtime)}</bdi></span>
                  {op.out ? <em>يخرج: {op.out.snapshot.courseName} ({op.out.action === "delete" ? "حذف" : "فك إسناد"})</em> : null}</li>
              ))}</ul>
            </section>

            {rows.length ? (
              <table className="sp-compare"><caption>أثر المقترح على جدول الأستاذ</caption>
                <thead><tr><th scope="col" /><th scope="col">الآن</th><th scope="col">بعد المقترح</th></tr></thead>
                <tbody>{rows.map(([label, a, b]) => <tr key={label}><th scope="row">{label}</th><td>{a}</td><td data-changed={a !== b || undefined}>{b}</td></tr>)}</tbody>
              </table>
            ) : null}
          </div>

          <div className="sp-send-grid-col">
            {ws.evalCurrent && evaluation ? (
              <ProposalWeekGrid mode={gridMode} onMode={setGridMode} showGhosts onShowGhosts={() => undefined}
                currentItems={evaluation.before.items} afterItems={evaluation.after.items} ghosts={evaluation.after.ghosts} draft={null}
                marks={{ blocker: new Set(), review: new Set() }} focusKeys={new Set()} selectedKey={selected} onSelect={setSelected} onPaint={() => undefined} readOnly
                checking={false} findingsFor={() => []} actionsFor={() => []} variant="grid" />
            ) : <p className="sp-state"><LoaderCircle className="sp-spin" aria-hidden="true" />جاري تجهيز المعاينة…</p>}
          </div>
        </div>

        {!ready && !busy ? (
          <p className="sp-note-box" role="alert" data-tone="bad"><AlertTriangle aria-hidden="true" />
            {!saved ? "جاري حفظ المسودة قبل الإرسال…" : !ws.evalCurrent ? "لا يُرسل المقترح قبل اكتمال الفحص." : (evaluation?.readiness.reasons[0] || "المقترح غير جاهزٍ للإرسال.")}</p>
        ) : null}
        {error ? <p className="sp-note-box" role="alert" data-tone="bad"><AlertTriangle aria-hidden="true" />{error}</p> : null}

        <footer className="sp-modal-actions">
          <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={send} data-guide-target="proposal-send">
            {busy ? <LoaderCircle className="sp-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}{busy ? "جاري الإرسال…" : "إرسال للأستاذ"}
          </button>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={onClose}><RotateCcw aria-hidden="true" />رجوع للتعديل</button>
        </footer>
      </div>
    </Modal>
  );
}

/* ═══════════════ مراجعة وتثبيت ═══════════════ */

const COMMIT_REASONS: Record<string, string> = {
  "schedule-locked": "الجدول مقفل الآن (اعتماد أو إغلاق فصل). لا يُثبَّت المقترح حتى يُفتح.",
  "proposal-stale": "تغيّرت بيانات الجدول بعد إرسال المقترح. لا يُنفَّذ بديلٌ مختلف عمّا وافق عليه الأستاذ بصمت.",
  "proposal-blocked": "ظهر مانعٌ عند إعادة الفحص قبل التثبيت.",
  "location-invalid": "المكان لم يعد صالحاً بقواعد الحفظ.",
  "scope-denied": "إحدى المواد تتبع قسماً لا تملك التعديل فيه.",
  "term-closed": "انتهى هذا الفصل ولا يُثبَّت فيه جديد.",
  "not-approved": "لا توجد موافقةٌ من الأستاذ على النسخة الحالية.",
  "stale-version": "للمقترح نسخةٌ أحدث لم يردّ الأستاذ عليها.",
  "linked-incomplete": "الترتيب المترابط لا يُثبَّت إلا بموافقة الأستاذ على المجموعة كاملة.",
};

export function CommitDialog({ ws, onClose, onDone }: { ws: Workspace; onClose: () => void; onDone: () => void }) {
  const { proposal, ctx } = ws;
  const [state, setState] = useState<"checking" | "ready" | "refused" | "committing" | "done">("checking");
  const [info, setInfo] = useState<{ evaluation?: ProposalEvaluation; opIds?: string[]; partial?: boolean; code?: string; error?: string; drift?: Array<{ message: string }> } | null>(null);
  const [mode, setMode] = useState<"current" | "with">("with");

  const run = async (confirm: boolean) => {
    if (!proposal) return;
    setState(confirm ? "committing" : "checking");
    try {
      const result = await proposalApi.commit(proposal.id, proposal.rev, confirm);
      if (confirm) { ws.replaceView(result); setState("done"); onDone(); }
      else { setInfo({ evaluation: result.evaluation, opIds: result.opIds, partial: result.partial }); setState("ready"); }
    } catch (error) {
      if (error instanceof ProposalApiError) {
        setInfo({ evaluation: error.body?.evaluation, code: error.code, error: error.message, drift: error.body?.drift });
        if (error.status === 409 && error.body?.alreadyCommitted) { setState("done"); return; }
        setState("refused");
      } else { setInfo({ error: error instanceof Error ? error.message : "تعذّر التثبيت." }); setState("refused"); }
    }
  };
  useEffect(() => { void run(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const approved = useMemo(() => new Set(info?.opIds || ws.view?.decision.approved || []), [info, ws.view]);
  const skipped = ws.ops.filter(op => !approved.has(op.id));
  const applied = ws.ops.filter(op => approved.has(op.id));
  if (!proposal || !ctx) return null;
  const ev = info?.evaluation;

  return (
    <Modal label="مراجعة وتثبيت المقترح" onClose={onClose} wide>
      <div className="sp-commit">
        <header>
          <p className="sp-eyebrow">مراجعة وتثبيت</p>
          <h2>{state === "done" ? "ثُبّت المقترح في الجدول" : "قبل أن يدخل المقترح الجدول الفعلي"}</h2>
        </header>

        {state === "checking" ? <p className="sp-state"><LoaderCircle className="sp-spin" aria-hidden="true" />نعيد فحص التعارضات والصلاحيات وبيانات الجدول…</p> : null}

        {state === "refused" ? (
          <div className="sp-refusal" role="alert">
            <AlertTriangle aria-hidden="true" />
            <div>
              <b>{COMMIT_REASONS[info?.code || ""] || info?.error || "لا يمكن التثبيت الآن."}</b>
              {info?.error && COMMIT_REASONS[info?.code || ""] && info.error !== COMMIT_REASONS[info.code!] ? <p>{info.error}</p> : null}
              {info?.drift?.length ? <ul>{info.drift.map(d => <li key={d.message}>{d.message}</li>)}</ul> : null}
              {ev?.findings.filter(f => f.kind === "blocker").map(f => <p key={f.id}><b>{f.title}</b> {f.detail}</p>)}
              <p className="sp-hint">لم يُكتب شيء في الجدول. أغلق هذه النافذة وعدّل المقترح؛ أي تعديلٍ في التفاصيل ينشئ نسخةً جديدة تحتاج موافقة الأستاذ من جديد.</p>
            </div>
          </div>
        ) : null}

        {state === "ready" || state === "committing" ? (
          <>
            <p className="sp-commit-lead"><ShieldCheck aria-hidden="true" />اكتملت الفحوص: لا موانع، وبيانات الجدول ما زالت كما وافق عليها الأستاذ، والموافقة تخص النسخة {num(proposal.sentVersion)} الحالية.</p>
            <div className="sp-commit-cols">
              <section><h3>سيُنفَّذ ({num(applied.length)})</h3>
                <ul>{applied.map(op => <li key={op.id}><b>{OP_KIND_LABEL[op.kind]}</b> {op.target.courseName} · شعبة {op.target.SCode} — {daysLabel(daysOf(op.target))} <bdi className="sp-time">{timeRange(op.target.fstarttime, op.target.fendtime)}</bdi>
                  {op.kind === "create" || (op.kind === "replace" && op.incoming === "create") ? <small>تُنشأ الآن في الجدول الفعلي</small> : <small>تُسند وتُحدَّث في الجدول الفعلي</small>}</li>)}</ul>
              </section>
              {skipped.length ? <section data-tone="warn"><h3>لن يُنفَّذ ({num(skipped.length)})</h3>
                <p className="sp-hint">لم يوافق عليها الأستاذ بعد؛ تبقى خارج التثبيت.</p>
                <ul>{skipped.map(op => <li key={op.id}>{op.target.courseName} · شعبة {op.target.SCode}</li>)}</ul></section> : null}
            </div>
            {ev ? (
              <ProposalWeekGrid mode={mode} onMode={setMode} showGhosts onShowGhosts={() => undefined}
                currentItems={ev.before.items} afterItems={ev.after.items} ghosts={ev.after.ghosts} draft={null}
                marks={{ blocker: new Set(), review: new Set() }} focusKeys={new Set()} selectedKey={null} onSelect={() => undefined} onPaint={() => undefined} readOnly
                checking={false} findingsFor={() => []} actionsFor={() => []} variant="grid" />
            ) : null}
            {ev?.counts.reviews ? <p className="sp-hint"><AlertTriangle aria-hidden="true" />{countOf(ev.counts.reviews, AR.note)} للمراجعة — لا تمنع التثبيت.</p> : null}
          </>
        ) : null}

        {state === "done" ? (
          <div className="sp-sent"><span className="sp-sent-icon" aria-hidden="true"><Check /></span>
            <p className="sp-sent-lead">ثُبّتت المجموعة كوحدةٍ واحدة وتحدّث الجدول وكرت الأستاذ وسجل الحوار. الضغطة المكررة لا تنشئ شيئاً مرتين.</p>
            {proposal.commit ? (
              <ul className="sp-done-list" aria-label="ما نُفِّذ">
                {proposal.commit.results.map(result => {
                  const op = proposal.ops.find(o => o.id === result.opId);
                  if (!op) return null;
                  const what = result.state === "skipped" ? "لم يُنفَّذ (لم يوافق عليه الأستاذ بعد)"
                    : [result.createdRowIds?.length ? "أُنشئت شعبةٌ جديدة في الجدول" : "", result.updatedRowIds?.length ? (op.out && op.out.action === "unassign" ? "أُسندت الشعبة وفُكّ إسناد الموعد القديم" : "أُسندت الشعبة / عُدّل الموعد") : "", result.deletedRowIds?.length ? "حُذف الموعد القديم من جدول القسم" : ""].filter(Boolean).join(" · ");
                  return <li key={result.opId} data-state={result.state}><b>{op.target.courseName} · شعبة {op.target.SCode}</b><span>{what}</span></li>;
                })}
              </ul>
            ) : null}</div>
        ) : null}

        <footer className="sp-modal-actions">
          {state === "ready" || state === "committing" ? (
            <button type="button" className="btn btn-primary" disabled={state === "committing"} onClick={() => void run(true)} data-guide-target="proposal-commit">
              {state === "committing" ? <LoaderCircle className="sp-spin" aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{state === "committing" ? "جاري التثبيت…" : "تثبيت المقترح في الجدول"}
            </button>
          ) : null}
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={onClose}>{state === "done" ? "إغلاق" : "رجوع للمراجعة"}</button>
        </footer>
      </div>
    </Modal>
  );
}

/* ═══════════════ ردود الأستاذ وسجل المقترح ═══════════════ */

const REASON_TEXT: Record<string, string> = { time: "الوقت", place: "المكان", days: "الأيام", load: "النصاب", other: "سببٌ آخر" };

export function ProposalResponses({ ws }: { ws: Workspace }) {
  const { proposal, view } = ws;
  if (!proposal || proposal.sentVersion === 0 || !view) return null;
  const status = effectiveStatus(proposal);
  const current = proposal.version === proposal.sentVersion;
  const responses = proposal.responses.filter(r => r.by === "instructor" && r.version === proposal.sentVersion);
  const last = responses[responses.length - 1];
  const sentAt = proposal.versions.find(v => v.version === proposal.sentVersion)?.sentAt;
  const opName = (id: string) => proposal.ops.find(op => op.id === id)?.target.courseName || "مادة";

  const head = !current
    ? { Icon: Clock, tone: "warn", text: `تعدّل نسخةً جديدة (${num(proposal.version)}) لم تُرسَل بعد`, sub: "النسخة المرسلة السابقة لا يستطيع الأستاذ الرد عليها الآن، وتحتاج النسخة الجديدة موافقةً جديدة." }
    : status === "approved" ? { Icon: ThumbsUp, tone: "good", text: "وافق الأستاذ على المقترح", sub: last ? `سُجّلت موافقته ${arabicDateTime(last.at)}${last.verifyCode ? ` — رمز التوقيع ${last.verifyCode}` : ""}. بانتظار تثبيت القسم.` : "" }
      : status === "partial" ? { Icon: MessageSquareWarning, tone: "warn", text: "موافقة جزئية", sub: "وافق على بعض المواد وبقي بعضها دون رد أو بطلب تعديل." }
        : status === "changes" ? { Icon: MessageSquareWarning, tone: "warn", text: "طلب الأستاذ تعديلاً", sub: "راجع ملاحظته وعدّل المقترح؛ التعديل ينشئ نسخةً جديدة تحتاج موافقته من جديد." }
          : status === "expired" ? { Icon: Clock, tone: "bad", text: "انتهت صلاحية الرد", sub: "عدّل المقترح وأرسله من جديد لفتح باب الرد." }
            : status === "withdrawn" ? { Icon: X, tone: "bad", text: "سُحب المقترح", sub: "" }
              : status === "committed" ? { Icon: ShieldCheck, tone: "good", text: "ثُبّت المقترح في الجدول", sub: proposal.commit ? `ثبّته ${proposal.commit.byName || "القسم"} ${arabicDateTime(proposal.commit.at)}.` : "" }
                : { Icon: Clock, tone: "neutral", text: "بانتظار رد الأستاذ", sub: proposal.expiresAt ? `آخر موعد للرد ${arabicDate(proposal.expiresAt)}${sentAt ? ` — أُرسل ${arabicDateTime(sentAt)}` : ""}.` : "" };

  return (
    <section className="sp-resp" data-tone={head.tone} aria-label="رد الأستاذ">
      <div className="sp-resp-head"><head.Icon aria-hidden="true" /><div><b>{head.text}</b>{head.sub ? <small>{head.sub}</small> : null}</div></div>
      {current ? responses.slice(-3).map(r => (
        <div key={r.id} className="sp-resp-item">
          <small>{arabicDateTime(r.at)}</small>
          <ul>{r.decisions.map(d => <li key={d.opId} data-d={d.decision}>{d.decision === "approve" ? <Check aria-hidden="true" /> : <MessageSquareWarning aria-hidden="true" />}{opName(d.opId)} — {d.decision === "approve" ? "موافق" : "يحتاج تعديلاً"}</li>)}</ul>
          {r.reason || r.note || r.suggestedStart ? (
            <p className="sp-resp-note">{r.reason ? <b>{REASON_TEXT[r.reason] || r.reason}. </b> : null}{r.note ? `«${r.note}»` : null}
              {r.suggestedStart ? <> يقترح البداية <bdi className="sp-time">{r.suggestedStart}</bdi>{r.suggestedDays?.length ? ` يومَي ${r.suggestedDays.map(d => PROPOSAL_DAY_NAMES[d]).join(" و")}` : ""}.</> : null}</p>
          ) : null}
          {r.suggestedStart ? r.decisions.filter(d => d.decision === "changes").slice(0, 3).map(d => {
            const op = proposal.ops.find(o => o.id === d.opId);
            if (!op) return null;
            const start = r.suggestedStart!;
            return <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={d.opId} type="button" className="sp-chip-btn" onClick={() => {
              const [h, m] = start.split(":").map(Number);
              const dur = Math.max(30, (Number(op.target.fendtime.slice(0, 2)) * 60 + Number(op.target.fendtime.slice(3)) - (Number(op.target.fstarttime.slice(0, 2)) * 60 + Number(op.target.fstarttime.slice(3)))));
              const end = h * 60 + m + dur;
              ws.retargetOp(op.id, { fstarttime: start, fendtime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`, ...(r.suggestedDays?.length ? { days: r.suggestedDays } : {}) }, "جُرّب وقت الأستاذ المقترح");
            }}>جرّب وقت الأستاذ لـ «{op.target.courseName}»</button>;
          }) : null}
        </div>
      )) : null}
      <details className="sp-history">
        <summary>سجل المقترح ({num(proposal.events.length)})</summary>
        <ol>{[...proposal.events].reverse().slice(0, 40).map((e, i) => (
          <li key={`${e.at}-${i}`}><small>{arabicDateTime(e.at)}</small> {({ created: "أُنشئ المقترح", saved: "حُفظت المسودة", sent: "أُرسل المقترح", approved: "وافق الأستاذ", partial: "موافقة جزئية", changes: "طلب الأستاذ تعديلاً", revised: "أُرسلت نسخة معدّلة", withdrawn: "سُحب المقترح", expired: "انتهت الصلاحية", committed: "ثُبّت المقترح", "commit-refused": "رُفض التثبيت", "link-shared": "شُورك الرابط" } as Record<string, string>)[e.kind] || e.kind}{e.version ? ` — النسخة ${num(e.version)}` : ""}{e.by ? ` · ${e.by}` : ""}</li>
        ))}</ol>
      </details>
    </section>
  );
}

export { OP_NOUN, STATUS_LABEL };
export type { StudyProposal };
