/**
 * ── المقترحات الدراسية داخل «وارد الأساتذة» ─────────────────────────────────
 *
 * قطعتان صغيرتان تُعلَّقان بالحوار الموجود دون أن تغيّراه: شريطُ المقترحات في
 * بطاقة الطلب (مع زرّ «إعداد مقترح دراسي» وسجلِّ ما جرى كأنه حوار)، وشريطٌ
 * علويٌّ يبدأ مقترحاً لأيِّ أستاذٍ له طلبٌ في الوارد (الرابط الشخصي يقوم على الطلب).
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
  const ready = readiness.ok && status !== "committed";
  return (
    <li className="sp-pcard" data-status={status}>
      <span className="sp-status" data-status={status}><i aria-hidden="true" /><Icon aria-hidden="true" />{STATUS_LABEL[status]}</span>
      <span className="sp-pcard-title">{p.title}{p.version > 1 ? ` · النسخة ${num(p.version)}` : ""}</span>
      <button type="button" className={ready ? "btn btn-primary" : "btn btn-secondary"}
        onClick={() => onOpen({ requestId: p.requestId, proposalId: p.id, startWith: ready ? "commit" : null })}
        data-guide-ignore="يفتح مساحة المقترح — لا يكتب قبل التأكيد">
        {ready ? "مراجعة وتثبيت" : status === "draft" ? "متابعة" : "فتح"}
      </button>
    </li>
  );
}

/** المقترحاتُ المرتبطة بطلبٍ: سطرٌ واحدٌ لكل مقترح، بلا سجلٍّ ولا تفاصيل (تُرى داخل المساحة). */
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
  const list = showAll ? visible : visible.slice(0, 2);
  if (!visible.length && compact) return null;
  return (
    <section className="sp-thread" aria-label="المقترحات الدراسية">
      {list.length ? <ul className="sp-thread-list">{list.map(view => <ProposalCard key={view.proposal.id} view={view} onOpen={onOpen} />)}</ul> : null}
      {visible.length > 2 ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-link" onClick={() => setShowAll(v => !v)}>{showAll ? "عرض الأحدث فقط" : `عرض الكل (${num(visible.length)})`}</button> : null}
      {compact ? null : (
        <button type="button" className="btn btn-secondary sp-start-btn" onClick={() => onOpen({ requestId, itemIndex })} data-guide-target="proposal-start">
          <ClipboardPen aria-hidden="true" />مقترح دراسي
        </button>
      )}
    </section>
  );
}

/** زرٌّ واحد بجوار أدوات الوارد: «+ مقترح دراسي»، يختار الأستاذَ ثم يفتح المساحة. */
export function ProposalLauncherBar({ rows, proposals, onOpen }: {
  rows: Array<{ id: string; instructorName: string }>;
  proposals: StaffProposalView[];
  onOpen: (open: OpenWorkspace) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState("");
  const toCommit = useMemo(() => proposals.filter(view => { const s = effectiveStatus(view.proposal); return s === "approved" || s === "partial"; }), [proposals]);
  if (!rows.length && !proposals.length) return null;
  return (
    <section className="sp-launch" aria-label="المقترحات الدراسية" data-guide-ignore="بدء مقترح دراسي — لا يكتب في الجدول">
      {toCommit.length ? (
        <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-primary"
          onClick={() => onOpen({ requestId: toCommit[0].proposal.requestId, proposalId: toCommit[0].proposal.id, startWith: "commit" })}>
          <CheckCircle2 aria-hidden="true" />{countOf(toCommit.length, { one: "مقترح", two: "مقترحان", few: "مقترحات", many: "مقترحاً" })} للتثبيت
        </button>
      ) : null}
      {picking ? (
        <>
          <label className="sp-launch-pick"><span className="sr-only">الأستاذ</span>
            <select value={pick} onChange={e => setPick(e.target.value)} aria-label="اختر أستاذاً لإعداد مقترح له" autoFocus>
              <option value="">اختر أستاذاً…</option>
              {rows.map(row => <option key={row.id} value={row.id}>{row.instructorName}</option>)}
            </select>
          </label>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-primary" disabled={!pick} onClick={() => { onOpen({ requestId: pick }); setPicking(false); setPick(""); }}>ابدأ</button>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="btn btn-secondary" onClick={() => { setPicking(false); setPick(""); }}>إلغاء</button>
        </>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setPicking(true)} data-guide-target="proposal-start">
          <ClipboardPen aria-hidden="true" />مقترح دراسي
        </button>
      )}
    </section>
  );
}
