/**
 * ── المقترحات الدراسية داخل «وارد الأساتذة» ─────────────────────────────────
 *
 * قطعتان صغيرتان تُعلَّقان بالحوار الموجود دون أن تغيّراه: شريطُ المقترحات في
 * بطاقة الطلب (مع زرّ «إعداد مقترح دراسي» وسجلِّ ما جرى كأنه حوار)، وشريطٌ
 * علويٌّ يبدأ مقترحاً لأيِّ أستاذٍ ولو لم يطلب شيئاً.
 */
import React, { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardPen, MessageSquareWarning, Send, ShieldCheck, ThumbsUp, Clock, Ban, FileClock } from "lucide-react";
import { countOf } from "../../utils/arabicCount";
import { commitReadiness, effectiveStatus, OP_KIND_LABEL, STATUS_LABEL } from "../../utils/studyProposal";
import type { StudyProposal } from "../../types";
import type { StaffProposalView } from "./proposalApi";
import { arabicDate, arabicDateTime, daysLabel, num, OP_NOUN, timeRange } from "./proposalFormat";
import { daysOf } from "../../utils/studyProposal";

export interface OpenWorkspace { requestId: string; proposalId?: string | null; itemIndex?: number | null; startWith?: "commit" | "send" | null }

const DRAFT_NOUN = { one: "مسودة", two: "مسودتان", few: "مسودات", many: "مسودة" };

const STATUS_ICON: Record<string, React.ComponentType<any>> = {
  draft: FileClock, sent: Clock, approved: ThumbsUp, partial: MessageSquareWarning, changes: MessageSquareWarning,
  withdrawn: Ban, expired: Ban, committed: ShieldCheck,
};

const EVENT_TEXT: Record<string, string> = {
  created: "أُنشئت مسودة", saved: "حُفظت المسودة", sent: "أُرسل المقترح", approved: "وافق الأستاذ", partial: "موافقة جزئية",
  changes: "طلب الأستاذ تعديلاً", revised: "أُرسلت نسخة معدّلة", withdrawn: "سُحب المقترح", expired: "انتهت صلاحية الرد",
  committed: "ثُبّت المقترح في الجدول", "commit-refused": "رُفض التثبيت", "link-shared": "شورك الرابط",
};

function ProposalCard({ view, onOpen }: { key?: React.Key; view: StaffProposalView; onOpen: (open: OpenWorkspace) => void }) {
  const p: StudyProposal = view.proposal;
  const status = effectiveStatus(p);
  const Icon = STATUS_ICON[status] || FileClock;
  const readiness = commitReadiness(p);
  const events = [...p.events].filter(e => e.kind !== "saved").slice(-3).reverse();
  const first = p.ops[0];
  return (
    <li className="sp-pcard" data-status={status}>
      <div className="sp-pcard-top">
        <b>{p.title}</b>
        <span className="sp-status" data-status={status}><i aria-hidden="true" /><Icon aria-hidden="true" />{STATUS_LABEL[status]}</span>
      </div>
      <p>
        {countOf(p.ops.length, OP_NOUN)}
        {first ? ` — ${OP_KIND_LABEL[first.kind]}: ${first.target.courseName}${p.ops.length > 1 ? ` و${num(p.ops.length - 1)} أخرى` : ""}` : ""}
        {p.version > 1 ? ` · النسخة ${num(p.version)}` : ""}
        {p.responseMode === "linked" ? " · ترتيب مترابط" : ""}
      </p>
      {first ? <p className="sp-time-line">{daysLabel(daysOf(first.target))} · <bdi className="sp-time">{timeRange(first.target.fstarttime, first.target.fendtime)}</bdi></p> : null}
      {status === "sent" && p.expiresAt ? <p><CalendarClock aria-hidden="true" /> آخر موعد للرد {arabicDate(p.expiresAt)}</p> : null}
      {status === "approved" || status === "partial" ? <p><ThumbsUp aria-hidden="true" /> {countOf(view.decision.approved.length, OP_NOUN)} موافق عليها — بانتظار تثبيت القسم</p> : null}
      {status === "changes" ? <p><MessageSquareWarning aria-hidden="true" /> طلب الأستاذ تعديلاً؛ افتح المقترح لتراجع ملاحظته.</p> : null}
      <div className="sp-pcard-actions">
        {readiness.ok && status !== "committed" ? (
          <button type="button" className="btn btn-primary" onClick={() => onOpen({ requestId: p.requestId, proposalId: p.id, startWith: "commit" })} data-guide-ignore="يفتح مراجعة التثبيت — لا يكتب قبل التأكيد">
            <ShieldCheck aria-hidden="true" />مراجعة وتثبيت
          </button>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={() => onOpen({ requestId: p.requestId, proposalId: p.id })} data-guide-ignore="يفتح مساحة المقترح">
          {status === "draft" ? "متابعة الإعداد" : "فتح المقترح"}
        </button>
      </div>
      {events.length ? (
        <ol aria-label="سجل المقترح">
          {events.map((e, i) => <li key={`${e.at}-${i}`}>{arabicDateTime(e.at)} — {EVENT_TEXT[e.kind] || e.kind}{e.version ? ` (النسخة ${num(e.version)})` : ""}{e.by ? ` · ${e.by}` : ""}</li>)}
        </ol>
      ) : null}
    </li>
  );
}

export function ProposalStrip({ requestId, proposals, onOpen, itemIndex = null, compact = false }: {
  requestId: string;
  proposals: StaffProposalView[];
  onOpen: (open: OpenWorkspace) => void;
  /** يخصّ المقترحات المرتبطة ببندٍ بعينه. */
  itemIndex?: number | null;
  compact?: boolean;
}) {
  const visible = proposals.filter(view => itemIndex === null ? true : view.proposal.itemIndex === itemIndex);
  const [showAll, setShowAll] = useState(false);
  if (compact && !visible.length) return null;
  const list = showAll ? visible : visible.slice(0, 2);
  return (
    <section className="sp-thread" aria-label="المقترحات الدراسية">
      <header>
        <h4><ClipboardPen aria-hidden="true" />المقترحات الدراسية{visible.length ? <span className="sp-count">{visible.length}</span> : null}</h4>
        {compact ? null : (
          <button type="button" className="btn btn-secondary sp-start-btn" onClick={() => onOpen({ requestId, itemIndex })} data-guide-target="proposal-start">
            <ClipboardPen aria-hidden="true" />إعداد مقترح دراسي
          </button>
        )}
      </header>
      {list.length ? <ul className="sp-thread-list">{list.map(view => <ProposalCard key={view.proposal.id} view={view} onOpen={onOpen} />)}</ul> : (
        <p className="sp-hint">ترتيبٌ كامل لمادةٍ أو أكثر — إسنادٌ أو شعبةٌ جديدة أو تعديلٌ أو استبدال — يُعاين أثره على جدول الأستاذ قبل الإرسال.</p>
      )}
      {visible.length > 2 ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={() => setShowAll(v => !v)}>{showAll ? "عرض الأحدث فقط" : `عرض الكل (${num(visible.length)})`}</button> : null}
    </section>
  );
}

/** شريطٌ علويّ: يبدأ مقترحاً لأيّ أستاذٍ في الوارد، ويعدّ ما ينتظر. */
export function ProposalLauncherBar({ rows, proposals, onOpen }: {
  rows: Array<{ id: string; instructorName: string }>;
  proposals: StaffProposalView[];
  onOpen: (open: OpenWorkspace) => void;
}) {
  const [pick, setPick] = useState("");
  const counts = useMemo(() => {
    let waiting = 0, toCommit = 0, drafts = 0;
    for (const view of proposals) {
      const status = effectiveStatus(view.proposal);
      if (status === "sent") waiting += 1;
      else if (status === "approved" || status === "partial") toCommit += 1;
      else if (status === "draft") drafts += 1;
    }
    return { waiting, toCommit, drafts };
  }, [proposals]);
  if (!rows.length && !proposals.length) return null;
  const nextToCommit = proposals.find(view => { const s = effectiveStatus(view.proposal); return s === "approved" || s === "partial"; });
  return (
    <section className="sp-launch" aria-label="المقترحات الدراسية" data-guide-ignore="بدء مقترح دراسي — لا يكتب في الجدول">
      <div className="sp-launch-text">
        <strong><ClipboardPen aria-hidden="true" />المقترحات الدراسية</strong>
        <small>
          {proposals.length
            ? [counts.toCommit ? `${countOf(counts.toCommit, { one: "مقترح", two: "مقترحان", few: "مقترحات", many: "مقترحاً" })} ${counts.toCommit === 1 ? "ينتظر" : "تنتظر"} التثبيت` : "",
              counts.waiting ? `${countOf(counts.waiting, { one: "مقترح", two: "مقترحان", few: "مقترحات", many: "مقترحاً" })} بانتظار رد الأستاذ` : "",
              counts.drafts ? `${countOf(counts.drafts, DRAFT_NOUN)} قيد الإعداد` : ""].filter(Boolean).join(" · ") || "كل المقترحات مُغلقة"
            : "رتّب لأستاذٍ عدة مواد معاً وعاين أثرها على جدوله قبل الإرسال."}
        </small>
      </div>
      <div className="sp-launch-actions">
        {nextToCommit ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-primary" onClick={() => onOpen({ requestId: nextToCommit.proposal.requestId, proposalId: nextToCommit.proposal.id, startWith: "commit" })}><CheckCircle2 aria-hidden="true" />مراجعة وتثبيت</button> : null}
        <label className="sp-launch-pick"><span className="sr-only">الأستاذ</span>
          <select value={pick} onChange={e => setPick(e.target.value)} aria-label="اختر أستاذاً لإعداد مقترح له">
            <option value="">اختر أستاذاً…</option>
            {rows.map(row => <option key={row.id} value={row.id}>{row.instructorName}</option>)}
          </select>
        </label>
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" disabled={!pick} onClick={() => onOpen({ requestId: pick })}><Send aria-hidden="true" />إعداد مقترح</button>
      </div>
    </section>
  );
}
