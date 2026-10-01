/**
 * ── ملخصُ الفحص وتفاصيله ────────────────────────────────────────────────────
 *
 * ثلاثةُ أصنافٍ لا يختلط بعضها ببعض: مانعٌ حسب قواعد النظام، وملاحظةٌ تحتاج
 * مراجعة، ومعلومةٌ عن الأثر. وحالتا «جاري الفحص» و«تعذّر الفحص» تُقالان بنصٍّ
 * صريح، ولا تُكتب عبارة «لا توجد تعارضات» إلا بعد فحصٍ مكتمل لهذه المواد بعينها.
 */
import React, { useMemo, useState } from "react";
import {
  AlertTriangle, Check, ChevronDown, Crosshair, Info, Lightbulb, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Undo2, Wand2,
} from "lucide-react";
import { PROPOSAL_DAY_NAMES, type ProposalFinding } from "../../utils/studyProposal";
import { AR, countOf } from "../../utils/arabicCount";
import type { Workspace } from "./useProposalWorkspace";
import { daysLabel, timeRange } from "./proposalFormat";
import { summaryLine } from "./ProposalHeader";

const KIND_TITLE = {
  blocker: { title: "موانع", note: "تمنع الإرسال حسب قواعد النظام", Icon: AlertTriangle },
  review: { title: "ملاحظات تحتاج مراجعة", note: "لا تمنع الإرسال", Icon: Sparkles },
  info: { title: "أثر المقترح", note: "معلومات للعلم", Icon: Info },
} as const;

const ALT_TYPES = new Set(["instructor", "room", "duplicate", "cohort", "doorway", "hallBarter", "hallBarterWindow", "sectionTwice"]);

function FindingCard({ ws, finding }: { key?: React.Key; ws: Workspace; finding: ProposalFinding }) {
  const op = ws.ops.find(o => o.id === finding.opId);
  const focused = ws.focusFindingId === finding.id;
  const timeBits = [finding.day ? PROPOSAL_DAY_NAMES[finding.day] : "", finding.start && finding.end ? timeRange(finding.start, finding.end) : ""].filter(Boolean);
  return (
    <li className="sp-finding" data-kind={finding.kind} data-focus={focused || undefined}>
      <div className="sp-finding-head">
        <b>{finding.title}</b>
        {op ? <small>{op.target.courseName} · شعبة {op.target.SCode}</small> : null}
      </div>
      {finding.detail ? <p className="sp-finding-detail">{finding.detail}</p> : null}
      {timeBits.length ? <p className="sp-finding-when"><span>{timeBits[0]}</span>{timeBits[1] ? <bdi className="sp-time">{timeBits[1]}</bdi> : null}</p> : null}
      {finding.reason ? <p className="sp-finding-why"><Info aria-hidden="true" /><span><b>السبب:</b> {finding.reason}</span></p> : null}
      {finding.fix ? <p className="sp-finding-fix"><Lightbulb aria-hidden="true" /><span><b>ما يمكن فعله:</b> {finding.fix}</span></p> : null}
      <div className="sp-finding-actions">
        {finding.gridKeys?.length ? (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-chip-btn" onClick={() => { ws.setFocusFindingId(focused ? null : finding.id); if (finding.gridKeys?.[0]) ws.setSelectedKey(finding.gridKeys[0]); }}>
            <Crosshair aria-hidden="true" />{focused ? "إلغاء الإبراز" : "أبرزها في الجدول"}
          </button>
        ) : null}
        {finding.kind === "blocker" && finding.opId && ALT_TYPES.has(finding.code) ? (
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-chip-btn" data-primary onClick={() => ws.loadAlternatives(finding.opId!)}><Wand2 aria-hidden="true" />أوقات بديلة</button>
        ) : null}
        {finding.opId ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-chip-btn" onClick={() => ws.editOp(finding.opId!)}>تعديل المادة</button> : null}
      </div>
    </li>
  );
}

function Alternatives({ ws }: { ws: Workspace }) {
  const { alts } = ws;
  if (!alts) return null;
  const op = ws.ops.find(o => o.id === alts.opId);
  return (
    <section className="sp-alts" aria-label="أوقات بديلة" aria-live="polite">
      <header>
        <h4><Wand2 aria-hidden="true" />أوقات بديلة لـ «{op?.target.courseName || "المادة"}»</h4>
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={() => ws.setAlts(null)}>إخفاء</button>
      </header>
      {alts.loading ? <p className="sp-alts-state"><LoaderCircle className="sp-spin" aria-hidden="true" />نفحص الأوقات الصالحة على المقترح كله…</p> : null}
      {alts.error ? <p className="sp-alts-state" role="alert">{alts.error}</p> : null}
      {!alts.loading && !alts.error && !alts.suggestions.length ? <p className="sp-alts-state">{alts.note || "لا يوجد وقتٌ بديل صالح."}</p> : null}
      <ul>
        {alts.suggestions.map(alt => (
          <li key={`${alt.days.join()}-${alt.start}`} className="sp-alt">
            <div>
              <b>{daysLabel(alt.days)}</b>
              <bdi className="sp-time">{timeRange(alt.start, alt.end)}</bdi>
              <span className="sp-alt-ok"><Check aria-hidden="true" />{alt.reviews ? `${alt.reviews} للمراجعة` : "بلا موانع"}</span>
            </div>
            <ul className="sp-alt-why">{alt.reasons.map(r => <li key={r}>{r}</li>)}</ul>
            <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={() => ws.applyAlternative(alts.opId, alt)}>جرّب هذا الوقت</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Group({ ws, kind, items, open }: { ws: Workspace; kind: keyof typeof KIND_TITLE; items: ProposalFinding[]; open: boolean }) {
  const meta = KIND_TITLE[kind];
  const [expanded, setExpanded] = useState(open);
  React.useEffect(() => setExpanded(open), [open]);
  if (!items.length) return null;
  return (
    <section className="sp-group" data-kind={kind}>
      <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-group-head" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
        <meta.Icon aria-hidden="true" /><b>{meta.title}</b><span className="sp-count">{items.length}</span><small>{meta.note}</small>
        <ChevronDown className="sp-chev" aria-hidden="true" />
      </button>
      {expanded ? <ul>{items.map(f => <FindingCard key={f.id} ws={ws} finding={f} />)}</ul> : null}
    </section>
  );
}

export default function ProposalChecks({ ws, compact = false }: { ws: Workspace; compact?: boolean }) {
  const ev = ws.evaluation;
  const checked = ws.evalCurrent && ev !== null;
  const groups = useMemo(() => ({
    blocker: ev?.findings.filter(f => f.kind === "blocker") || [],
    review: ev?.findings.filter(f => f.kind === "review") || [],
    info: ev?.findings.filter(f => f.kind === "info") || [],
  }), [ev]);
  const [open, setOpen] = useState(false);

  const status = ws.terminal ? "closed" : !ws.ops.length ? "empty" : ws.evalState === "failed" ? "failed" : !checked ? "checking"
    : ev!.status === "partial" ? "partial" : groups.blocker.length ? "blocked" : "clear";

  /* مانعٌ جديد أو فحصٌ فاشل يفتح التفاصيل مرّةً عند ظهوره؛ ثم يتحكّم بها القارئ. */
  const lastStatus = React.useRef(status);
  React.useEffect(() => {
    if (lastStatus.current !== status && (status === "blocked" || status === "failed" || status === "partial")) setOpen(true);
    lastStatus.current = status;
  }, [status]);

  const heading = {
    closed: ws.proposal?.status === "withdrawn" ? "المقترح مسحوب — لا فحص" : "المقترح مثبّت في الجدول — لا فحص",
    empty: "لا فحصَ قبل إضافة مادة", failed: "تعذّر الفحص", checking: "جاري الفحص…", partial: "الفحص غير مكتمل",
    blocked: `يوجد ${countOf(groups.blocker.length, AR.blocker)}`, clear: "اكتمل الفحص — لا توجد موانع",
  }[status];

  return (
    <section className="sp-checks" data-status={status} data-compact={compact || undefined} aria-label="ملخص الفحص">
      <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-checks-bar" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        <span className="sp-checks-icon" data-status={status} aria-hidden="true">
          {status === "checking" ? <LoaderCircle className="sp-spin" /> : status === "clear" || (status === "closed" && ws.proposal?.status !== "withdrawn") ? <ShieldCheck /> : status === "empty" || status === "closed" ? <Info /> : <AlertTriangle />}
        </span>
        <span className="sp-checks-text">
          <b role="status">{heading}</b>
          <small>{summaryLine(ws.ops.length, ev ? groups.blocker.length : null, ev ? groups.review.length : null, checked)}</small>
        </span>
        <ChevronDown className="sp-chev" aria-hidden="true" />
      </button>

      {open ? (
        <div className="sp-checks-body">
          {status === "failed" ? (
            <div className="sp-state" role="alert">
              <p>{ws.evalError || "لم يتمكّن الخادم من إكمال الفحص."} لا يُعرض حكمٌ على المقترح قبل اكتمال الفحص.</p>
              <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={ws.retryEvaluation}><RefreshCw aria-hidden="true" />أعد الفحص</button>
            </div>
          ) : null}
          {status === "partial" && ev ? (
            <div className="sp-state" role="status">
              <p>لم يكتمل الفحص لهذه الأسباب:</p>
              <ul>{ev.incompleteReasons.map(r => <li key={r}>{r}</li>)}</ul>
            </div>
          ) : null}
          {status === "clear" ? <p className="sp-clear"><Check aria-hidden="true" />لا يوجد ما يمنع إرسال المقترح{groups.review.length ? "، لكن راجع الملاحظات أدناه." : "."}</p> : null}
          <Group ws={ws} kind="blocker" items={groups.blocker} open />
          <Alternatives ws={ws} />
          {ws.undo ? <p className="sp-undo"><Check aria-hidden="true" />{ws.undo.label}. <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={ws.undoRetarget}><Undo2 aria-hidden="true" />تراجع</button></p> : null}
          <Group ws={ws} kind="review" items={groups.review} open={!groups.blocker.length} />
          <Group ws={ws} kind="info" items={groups.info} open={false} />
        </div>
      ) : null}
    </section>
  );
}
