/**
 * ── مساحةُ إعداد المقترح الدراسي ────────────────────────────────────────────
 *
 * شاشةٌ واحدةٌ للقسم: هويةُ الأستاذ وأثرُ المقترح في الأعلى، والنموذجُ على
 * اليمين، والجدولُ الأسبوعيُّ — العنصرُ الأساسي — على اليسار وتحته الفحص،
 * وشريطُ إجراءاتٍ ثابتٌ في الأسفل لا يحجب شيئاً. على الشاشات الضيّقة تتحوّل
 * إلى ثلاث تبويبات (المواد · الجدول · الفحص) وكلُّ حالةٍ مدخلةٍ باقية.
 *
 * المقترحُ مسودةٌ مستقلةٌ عن الجدول الفعلي: لا يُنشأ فيه موعدٌ ولا يُحجز فيه
 * رقمُ شعبةٍ أو قاعة حتى يوافق الأستاذ ويثبّت القسم.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeftRight, Ban, CalendarClock, CircleAlert, ClipboardList, Eye, LoaderCircle, Pencil, RefreshCw, Save, Send, ShieldCheck, ShieldAlert, Trash2, CheckCircle2, History, Table2, Plus, UserRoundPlus, X,
} from "lucide-react";
import { useDrawerA11y } from "../ui";
import { commitReadiness, effectiveStatus, type GridItem } from "../../utils/studyProposal";
import { proposalApi, ProposalApiError } from "./proposalApi";
import { useProposalWorkspace } from "./useProposalWorkspace";
import ProposalHeader, { summaryLine } from "./ProposalHeader";
import ProposalWeekGrid, { type GridMode } from "./ProposalWeekGrid";
import ProposalOpForm from "./ProposalOpForm";
import ProposalQuickCard, { type QuickSeed } from "./ProposalQuickCard";
import ProposalOps from "./ProposalOps";
import ProposalChecks from "./ProposalChecks";
import { CommitDialog, ProposalResponses, SendDialog } from "./ProposalDialogs";
import { relativeSaved, num } from "./proposalFormat";

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const on = () => setMatch(list.matches);
    on();
    list.addEventListener("change", on);
    return () => list.removeEventListener("change", on);
  }, [query]);
  return match;
}

type Dialog = null | "send" | "commit" | "close" | "withdraw";

export interface WorkspaceProps {
  requestId: string;
  proposalId?: string | null;
  /** البند المرتبط في الحوار إن كان المقترح خارجاً منه. */
  itemIndex?: number | null;
  /** يفتح نافذةً بعينها فور اكتمال التحميل (من زرّ «مراجعة وتثبيت» في الوارد). */
  startWith?: "commit" | "send" | null;
  onClose: () => void;
  /** يُستدعى بعد أي تغييرٍ محفوظ، ليحدّث ما حوله. */
  onChanged?: () => void;
}

export default function StudyProposalWorkspace({ requestId, proposalId = null, itemIndex = null, startWith = null, onClose, onChanged }: WorkspaceProps) {
  const ws = useProposalWorkspace({ requestId, proposalId, itemIndex, onChanged });
  const wide = useMedia("(min-width: 1100px)");
  const [tab, setTab] = useState<"ops" | "grid" | "checks">("grid");
  const [card, setCard] = useState<QuickSeed | null>(null);
  const [more, setMore] = useState(false);
  const [gridMode, setGridMode] = useState<GridMode>("with");
  const [showGhosts, setShowGhosts] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const dialogRef = useRef<Dialog>(null);
  dialogRef.current = dialog;
  const wsRef = useRef(ws);
  wsRef.current = ws;

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 15000); return () => window.clearInterval(id); }, []);
  useEffect(() => { if (!notice) return; const id = window.setTimeout(() => setNotice(""), 4200); return () => window.clearTimeout(id); }, [notice]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !ws.ctx || !startWith) return;
    started.current = true;
    if (startWith === "commit" && ws.proposal && commitReadiness(ws.proposal).ok) setDialog("commit");
    if (startWith === "send" && ws.ops.length) setDialog("send");
  }, [ws.ctx, ws.proposal, ws.ops.length, startWith]);

  /* الجسم الجاهز يستلم التركيز مرّةً: بدونه يبقى التركيز على الزرّ الذي فتحه خلف الطبقة، والتنقّل بـTab يمرّ بالصفحة الخلفية. */
  const focused = useRef(false);
  const hasCtx = Boolean(ws.ctx);
  useEffect(() => {
    if (!hasCtx || focused.current) return;
    focused.current = true;
    window.requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }));
  }, [hasCtx]);

  const requestClose = () => { if (dialogRef.current) return; if (wsRef.current.dirty) setDialog("close"); else onClose(); };
  const rootRef = useDrawerA11y<HTMLDivElement>(requestClose);

  /* المعاينةُ تُظهر أثر المقترح ما إن توجد مادة، وتعود إلى الحالي بلا مواد. */
  const hadOps = useRef(false);
  useEffect(() => { if (ws.ops.length && !hadOps.current) { hadOps.current = true; setGridMode("with"); } if (!ws.ops.length) hadOps.current = false; }, [ws.ops.length]);

  const proposal = ws.proposal;
  const status = ws.view ? (effectiveStatus(proposal!)) : "draft";
  const statusKey = proposal ? status : "new";
  const sent = Boolean(proposal && proposal.sentVersion > 0);
  const commit = proposal ? commitReadiness(proposal) : null;
  const canCommit = Boolean(commit?.ok) && !ws.dirty;
  const terminal = status === "committed" || status === "withdrawn";
  const checked = ws.evalCurrent && ws.evaluation;
  const blockers = checked ? ws.evaluation!.counts.blockers : null;
  const reviews = checked ? ws.evaluation!.counts.reviews : null;

  const findingsFor = (key: string) => (ws.evaluation && ws.evalCurrent ? ws.evaluation.findings.filter(f => f.gridKeys?.includes(key) && f.kind !== "info") : []);

  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const closeCard = () => { setCard(null); ws.cancelEdit(); };
  const openCreate = (seed: Partial<QuickSeed> = {}, fill?: { day: any; start: number; end: number }) => {
    if (terminal) return;
    ws.chooseMode("create");
    if (fill) ws.patchDraft({ days: [fill.day], start: hhmm(fill.start), end: hhmm(fill.end), endTouched: true });
    setCard({ kind: "create", ...seed });
  };
  const openAssign = () => { if (terminal) return; ws.chooseMode("assign"); setCard({ kind: "assign" }); };
  const openForOp = (opId: string) => {
    const op = ws.ops.find(o => o.id === opId); if (!op) return;
    ws.editOp(opId);
    if (op.kind === "replace") setMore(true);
    else setCard({ kind: op.kind === "assign" ? "assign" : op.kind === "edit" ? "edit" : "create" });
  };
  const actionsFor = (item: GridItem) => {
    const list: Array<{ label: string; Icon: React.ComponentType<any>; run: () => void; tone?: "danger" }> = [];
    if (terminal) return list;
    const op = item.opId ? ws.ops.find(o => o.id === item.opId) : undefined;
    if (op) {
      list.push({ label: "تعديل المادة", Icon: Pencil, run: () => openForOp(op.id) });
      if (ws.marks.blocker.has(item.key)) list.push({ label: "أوقات بديلة", Icon: CalendarClock, run: () => { ws.loadAlternatives(op.id); if (!wide) setTab("checks"); } });
      list.push({ label: "إزالة من المقترح", Icon: Trash2, tone: "danger", run: () => { ws.removeOp(op.id); ws.setSelectedKey(null); } });
    } else if (item.state === "current" && !item.outside && item.rowId > 0) {
      list.push({ label: "تعديل موعد هذا الأستاذ", Icon: Pencil, run: () => { ws.chooseMode("edit"); ws.pickRow(item.rowId); setCard({ kind: "edit" }); } });
      list.push({ label: "استبدال هذا الموعد", Icon: ArrowLeftRight, run: () => { ws.chooseMode("replace"); ws.pickRow(item.rowId); setMore(true); } });
    }
    return list;
  };

  /* ── الإجراءات ───────────────────────────────────────────────────────── */
  const saveNow = async () => { const result = await ws.save(); if (result) setNotice("حُفظت المسودة."); };
  const saveAndClose = async () => { const result = await ws.save(); if (result || !ws.ops.length) { setDialog(null); onClose(); } else setDialog(null); };
  const withdraw = async () => {
    if (!proposal) return;
    try { const result = await proposalApi.withdraw(proposal.id, proposal.rev); ws.replaceView(result); setNotice("سُحب المقترح."); }
    catch (error) { setNotice(error instanceof ProposalApiError ? error.message : "تعذّر سحب المقترح."); }
    setDialog(null);
  };

  /* ── الحالات الأولى ──────────────────────────────────────────────────── */
  if (ws.loading || ws.loadError || !ws.ctx) {
    return (
      <div className="sp-root" role="dialog" aria-modal="true" aria-label="إعداد مقترح دراسي" ref={rootRef}>
        <div className="sp-shell sp-shell-loading">
          {ws.loadError ? (
            <div className="sp-state" role="alert"><CircleAlert aria-hidden="true" /><p>{ws.loadError}</p>
              <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={() => window.location.reload()}><RefreshCw aria-hidden="true" />إعادة التحميل</button>
              <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-ghost" onClick={onClose}>إغلاق</button></div>
          ) : (
            <div className="sp-skeleton" role="status" aria-live="polite"><LoaderCircle className="sp-spin" aria-hidden="true" /><p>نجهّز جدول الأستاذ ومقرّرات القسم…</p></div>
          )}
        </div>
      </div>
    );
  }

  const ctx = ws.ctx;
  const saveLabel = ws.saveState === "saving" ? "جاري الحفظ…"
    : ws.saveState === "error" ? "تعذّر الحفظ"
      : ws.dirty ? "تغييرات غير محفوظة"
        : ws.savedAt ? `تم الحفظ ${relativeSaved(ws.savedAt, now)}`
          : proposal ? "المسودة محفوظة" : "لم تُحفظ مسودة بعد";
  const hasNewVersion = Boolean(proposal && sent && proposal.version > proposal.sentVersion);
  const previewLabel = sent && hasNewVersion ? `معاينة وإرسال النسخة ${num(proposal!.version)}` : "معاينة وإرسال";

  const banners = (
    <>
      <ProposalResponses ws={ws} />
      {ws.restorable ? (
        <div className="sp-banner" role="status" data-tone="info"><History aria-hidden="true" /><span>وجدنا تعديلاتٍ غير محفوظةٍ من جلسةٍ سابقة لهذا المقترح.</span>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={ws.restoreBackup}>استعادتها</button><button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={ws.discardBackup}>تجاهلها</button></div>
      ) : null}
      {ws.conflict ? (
        <div className="sp-banner" role="alert" data-tone="bad"><AlertTriangle aria-hidden="true" /><span>عدّل شخصٌ آخر هذا المقترح أثناء عملك.</span>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={ws.takeTheirs}>اعتماد نسخته</button><button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={ws.keepMine}>الاحتفاظ بتعديلي</button></div>
      ) : null}
      {(() => {
        const others = ctx.proposals.filter(view => view.proposal.id !== proposal?.id && !["withdrawn", "committed", "expired"].includes(effectiveStatus(view.proposal)));
        return others.length ? (
          <div className="sp-banner" role="status" data-tone="info"><AlertTriangle aria-hidden="true" />
            <span>لهذا الأستاذ مقترحاتٌ نشطةٌ أخرى ({num(others.length)}). الإرسال لا يحجز شيئاً، فراجع أن لا تتعارض فيما بينها قبل التثبيت.</span></div>
        ) : null;
      })()}
      {ctx.term.closed ? <div className="sp-banner" role="status" data-tone="bad"><Ban aria-hidden="true" /><span>انتهى هذا الفصل؛ لا تُرسل فيه مقترحات جديدة.</span></div> : null}
      {terminal ? (
        <div className="sp-banner" role="status" data-tone="neutral"><CheckCircle2 aria-hidden="true" /><span>{status === "committed" ? "ثُبّت هذا المقترح ولم يعد قابلاً للتعديل." : "سُحب هذا المقترح. أنشئ مقترحاً جديداً من الحوار."}</span></div>
      ) : null}
    </>
  );

  const opsPane = (
    <div className="sp-ops-wrap">
      <div className="sp-ops-head"><h2><ClipboardList aria-hidden="true" />مواد المقترح</h2>
        <p role="status">{summaryLine(ws.ops.length, blockers, reviews, Boolean(checked))}</p></div>
      <ProposalOps ws={ws} onEdit={openForOp} />
    </div>
  );

  const toolbar = terminal ? null : (
    <div className="sp-toolbar" role="toolbar" aria-label="إضافة مادة إلى المقترح">
      <button type="button" className="btn btn-primary" onClick={() => openCreate()} data-guide-target="proposal-add"><Plus aria-hidden="true" />شعبة جديدة</button>
      <button type="button" className="btn btn-secondary" onClick={openAssign} data-guide-ignore="يفتح بطاقة إسناد شعبة من «هيئة تدريسية» — لا يكتب في الجدول"><UserRoundPlus aria-hidden="true" />إسناد شعبة</button>
      <span className="sp-toolbar-hint">{wide ? "أو اسحب على فراغٍ في الجدول لتحديد اليوم والوقت." : "أو اضغط «إضافة» تحت اليوم المطلوب."}</span>
    </div>
  );

  const gridPane = (
    <ProposalWeekGrid
      mode={gridMode} onMode={setGridMode} showGhosts={showGhosts} onShowGhosts={setShowGhosts}
      currentItems={ws.currentItems} afterItems={ws.afterItems} ghosts={ws.ghostItems} draft={ws.draftItem}
      marks={ws.marks} focusKeys={ws.focusKeys} selectedKey={ws.selectedKey} onSelect={ws.setSelectedKey}
      readOnly={terminal}
      onPaint={(day, start, end, x, y) => openCreate({ x, y }, { day, start, end })}
      onAddDay={wide || terminal ? undefined : day => openCreate({}, { day, start: 8 * 60, end: 8 * 60 + 50 })}
      checking={ws.ops.length > 0 && !ws.evalCurrent && ws.evalState !== "failed"} findingsFor={findingsFor} actionsFor={actionsFor}
      empty={ctx.current.items.length ? undefined : <p><b>ليس للأستاذ مواعيد حالياً.</b> ستظهر هنا أول مادةٍ تضيفها إلى المقترح.</p>}
      variant="auto"
    />
  );
  const checksPane = <ProposalChecks ws={ws} compact={wide} />;

  return (
    <div className="sp-root" role="dialog" aria-modal="true" aria-labelledby="sp-title" ref={rootRef} tabIndex={-1} data-wide={wide || undefined}>
      <div className="sp-shell">
        <ProposalHeader ctx={ctx} proposal={proposal} status={statusKey as any}
          before={ctx.current.metrics} after={ws.evalCurrent && ws.evaluation ? ws.evaluation.after.metrics : null}
          loadCap={ctx.instructor.loadCap} blockers={blockers} reviews={reviews} evalState={ws.evalState} evalCurrent={ws.evalCurrent}
          evalError={ws.evalError} hasOps={ws.ops.length > 0 && !ws.terminal} onRetry={ws.retryEvaluation} onClose={requestClose} />

        {toolbar}

        {!wide ? (
          <nav className="sp-tabs" role="tablist" aria-label="أقسام المساحة">
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="tab" aria-selected={tab === "grid"} onClick={() => setTab("grid")}><Table2 aria-hidden="true" />الجدول</button>
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="tab" aria-selected={tab === "ops"} onClick={() => setTab("ops")}><ClipboardList aria-hidden="true" />المواد{ws.ops.length ? <span className="sp-count">{num(ws.ops.length)}</span> : null}</button>
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" role="tab" aria-selected={tab === "checks"} onClick={() => setTab("checks")}>
              {blockers ? <ShieldAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}الفحص
              {checked && (blockers || reviews) ? <span className="sp-count" data-tone={blockers ? "bad" : "warn"}>{(blockers || 0) + (reviews || 0)}</span> : null}
            </button>
          </nav>
        ) : null}

        <div className="sp-body" data-wide={wide || undefined} data-quick="true">
          {wide ? (
            <>
              <main className="sp-main"><div className="sp-grid-pane">{gridPane}</div></main>
              <aside className="sp-side" aria-label="مواد المقترح والفحص">{banners}{opsPane}{checksPane}</aside>
            </>
          ) : (
            <>
              <div className="sp-panel sp-panel-grid" role="tabpanel" hidden={tab !== "grid"}>{banners}{gridPane}</div>
              <div className="sp-panel" role="tabpanel" hidden={tab !== "ops"}>{opsPane}</div>
              <div className="sp-panel" role="tabpanel" hidden={tab !== "checks"}>{checksPane}</div>
            </>
          )}
        </div>

        <footer className="sp-bar" role="toolbar" aria-label="إجراءات المقترح">
          <div className="sp-bar-actions">
            {!terminal ? (
              <button type="button" className="btn btn-secondary" onClick={saveNow} disabled={ws.saveState === "saving" || (!ws.ops.length && !proposal)} data-guide-target="proposal-save">
                <Save aria-hidden="true" />حفظ المسودة
              </button>
            ) : null}
            {canCommit ? (
              <button type="button" className="btn btn-primary" onClick={() => setDialog("commit")} data-guide-target="proposal-commit-open"><ShieldCheck aria-hidden="true" />مراجعة وتثبيت</button>
            ) : null}
            {!terminal ? (
              <button type="button" className={`btn ${canCommit ? "btn-secondary" : "btn-primary"}`} onClick={() => setDialog("send")} disabled={!ws.ops.length || ctx.term.closed} data-guide-target="proposal-preview">
                <Send aria-hidden="true" />{previewLabel}
              </button>
            ) : null}
            {sent && !terminal ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-ghost" data-tone="danger" onClick={() => setDialog("withdraw")}><Ban aria-hidden="true" />سحب المقترح</button> : null}
            {commit && !commit.ok && sent && !terminal && !ws.dirty && commit.code === "not-approved" ? <span className="sp-bar-hint"><Eye aria-hidden="true" />يظهر «مراجعة وتثبيت» بعد موافقة الأستاذ.</span> : null}
          </div>
          <div className="sp-bar-status" data-state={ws.saveState} role="status" aria-live="polite">
            {ws.saveState === "saving" ? <LoaderCircle className="sp-spin" aria-hidden="true" /> : ws.saveState === "error" ? <AlertTriangle aria-hidden="true" /> : ws.dirty ? <Pencil aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}
            <span>{saveLabel}</span>
            {ws.saveState === "error" ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={() => void ws.save()}>أعد المحاولة</button> : null}
            {notice ? <em className="sp-toast">{notice}</em> : null}
          </div>
        </footer>
      </div>

      {card ? <ProposalQuickCard ws={ws} seed={card} onClose={closeCard} onMore={() => { setCard(null); setMore(true); }} /> : null}
      {more ? (
        <aside className="sp-more-drawer" role="dialog" aria-modal="false" aria-label="النموذج الكامل">
          <header><strong>النموذج الكامل</strong>
            <button type="button" className="sp-icon-btn" onClick={() => { setMore(false); ws.cancelEdit(); }} aria-label="إغلاق النموذج الكامل" data-guide-ignore="يغلق النموذج الكامل"><X aria-hidden="true" /></button></header>
          <ProposalOpForm ws={ws} onDone={() => setMore(false)} />
        </aside>
      ) : null}
      {dialog === "send" ? <SendDialog ws={ws} onClose={() => setDialog(null)} onSent={() => setNotice("أُرسل المقترح.")} /> : null}
      {dialog === "commit" ? <CommitDialog ws={ws} onClose={() => setDialog(null)} onDone={() => setNotice("ثُبّت المقترح.")} /> : null}
      {dialog === "close" ? (
        <ConfirmDialog title="لديك تعديلاتٌ غير محفوظة" text="إن أغلقت المساحة الآن ضاعت التعديلات الأخيرة. احفظ المسودة لتكمل لاحقاً."
          actions={[
            { label: "حفظ وإغلاق", primary: true, run: () => void saveAndClose() },
            { label: "إغلاق دون حفظ", tone: "danger", run: () => { setDialog(null); onClose(); } },
            { label: "متابعة العمل", run: () => setDialog(null) },
          ]} onDismiss={() => setDialog(null)} />
      ) : null}
      {dialog === "withdraw" ? (
        <ConfirmDialog title="سحب المقترح؟" text="لن يستطيع الأستاذ الرد عليه بعد السحب، ولن يتغيّر جدوله. يبقى السجل محفوظاً."
          actions={[{ label: "سحب المقترح", tone: "danger", primary: true, run: () => void withdraw() }, { label: "تراجع", run: () => setDialog(null) }]} onDismiss={() => setDialog(null)} />
      ) : null}
    </div>
  );
}

function ConfirmDialog({ title, text, actions, onDismiss }: {
  title: string; text: string; onDismiss: () => void;
  actions: Array<{ label: string; run: () => void; primary?: boolean; tone?: "danger" }>;
}) {
  const ref = useDrawerA11y<HTMLDivElement>(onDismiss);
  return (
    <div className="sp-modal-layer">
      <div className="sp-modal-backdrop" aria-hidden="true" />
      <div ref={ref} className="sp-modal sp-modal-sm" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2><p>{text}</p>
        <div className="sp-modal-actions">
          {actions.map(a => <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" key={a.label} type="button" className={`btn ${a.primary ? "btn-primary" : "btn-secondary"}`} data-tone={a.tone} onClick={a.run}>{a.label}</button>)}
        </div>
      </div>
    </div>
  );
}

