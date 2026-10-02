/**
 * ── قائمةُ مواد المقترح (بطاقاتٌ مختصرة) ────────────────────────────────────
 *
 * تبقى ظاهرةً بجانب النموذج: كلُّ مادةٍ بنوع عمليتها وأيامها وأوقاتها وحالة
 * فحصها. «إزالة» هنا تُزيل المادة من المسودة وحدها — لا تلمس الجدول الفعلي.
 */
import React from "react";
import {
  AlertTriangle, ArrowLeftRight, Check, CircleHelp, Clock, FilePlus2, Hourglass, Pencil, Trash2, UserRoundPlus, Wand2, MessageSquareWarning, ThumbsUp,
} from "lucide-react";
import type { StudyProposalOp, StudyProposalOpKind } from "../../types";
import { OP_KIND_LABEL, daysOf, placeLabel, type ProposalEvaluation } from "../../utils/studyProposal";
import type { Workspace } from "./useProposalWorkspace";
import { daysLabel, timeRange } from "./proposalFormat";

const KIND_ICON: Record<StudyProposalOpKind, React.ComponentType<any>> = {
  assign: UserRoundPlus, create: FilePlus2, edit: Pencil, replace: ArrowLeftRight,
};

type OpState = "ok" | "blocked" | "review" | "unchecked" | "checking";

export function opState(ws: Workspace, opId: string): OpState {
  if (!ws.evalCurrent) return ws.evalState === "failed" ? "unchecked" : "checking";
  return (ws.evaluation!.perOp[opId]?.state || "unchecked") as OpState;
}

const STATE_TEXT: Record<OpState, { text: string; Icon: React.ComponentType<any> }> = {
  ok: { text: "لا موانع", Icon: Check },
  blocked: { text: "مانع", Icon: AlertTriangle },
  review: { text: "للمراجعة", Icon: CircleHelp },
  unchecked: { text: "غير مفحوص", Icon: CircleHelp },
  checking: { text: "جاري الفحص", Icon: Hourglass },
};

function OpCard({ ws, op, onEdit }: { key?: React.Key; ws: Workspace; op: StudyProposalOp; onEdit?: (opId: string) => void }) {
  const t = op.target;
  const state = opState(ws, op.id);
  const { text, Icon: StateIcon } = STATE_TEXT[state];
  const Kind = KIND_ICON[op.kind];
  const place = placeLabel(t);
  const decision = ws.view && ws.proposal && ws.proposal.sentVersion === ws.proposal.version ? ws.view.decision : null;
  const answered = decision ? (decision.approved.includes(op.id) ? "approved" : decision.changes.includes(op.id) ? "changes" : "pending") : null;
  const editing = ws.draft.editingOpId === op.id;
  const targetsModified = op.kind === "edit" && op.source;
  return (
    <article className="sp-op" data-kind={op.kind} data-state={state} data-focus={ws.focusOpId === op.id || undefined} data-editing={editing || undefined}>
      <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-op-main" onClick={() => {
        ws.setFocusOpId(ws.focusOpId === op.id ? null : op.id);
        const key = op.kind === "create" || (op.kind === "replace" && op.incoming === "create") ? `new:${op.id}` : `row:${op.source?.id}`;
        ws.setSelectedKey(key);
      }} aria-label={`${OP_KIND_LABEL[op.kind]}: ${t.courseName}، اضغط لإبرازها في الجدول`}>
        <span className="sp-op-kind"><Kind aria-hidden="true" />{OP_KIND_LABEL[op.kind]}</span>
        <span className="sp-op-title"><b>{t.courseName}</b><small>{t.courseCode} · شعبة {t.SCode}</small></span>
        <span className="sp-op-when"><bdi>{daysLabel(daysOf(t))}</bdi><bdi className="sp-time">{timeRange(t.fstarttime, t.fendtime)}</bdi></span>
        <span className="sp-op-where">{place.text}</span>
        {targetsModified ? (
          <span className="sp-op-diff">كان: <bdi>{daysLabel(op.source!.days)}</bdi> <bdi className="sp-time">{timeRange(op.source!.fstarttime, op.source!.fendtime)}</bdi></span>
        ) : null}
        {op.out ? (
          <span className="sp-op-diff" data-out="1">يخرج: <b>{op.out.snapshot.courseName}</b> · شعبة {op.out.snapshot.SCode} — {op.out.action === "delete" ? "حذف الموعد" : "فك الإسناد"}</span>
        ) : null}
        {op.note ? <span className="sp-op-note">«{op.note}»</span> : null}
      </button>
      <div className="sp-op-foot">
        <span className="sp-op-state" data-state={state}><StateIcon aria-hidden="true" />{text}</span>
        {answered ? (
          <span className="sp-op-answer" data-answer={answered}>
            {answered === "approved" ? <ThumbsUp aria-hidden="true" /> : answered === "changes" ? <MessageSquareWarning aria-hidden="true" /> : <Clock aria-hidden="true" />}
            {answered === "approved" ? "وافق الأستاذ" : answered === "changes" ? "طلب تعديلاً" : "بانتظار رده"}
          </span>
        ) : null}
        <span className="sp-op-actions">
          {state === "blocked" ? <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-text" onClick={() => ws.loadAlternatives(op.id)}><Wand2 aria-hidden="true" />أوقات بديلة</button> : null}
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-text" onClick={() => (onEdit ? onEdit(op.id) : ws.editOp(op.id))} aria-label={`تعديل مادة ${t.courseName}`}><Pencil aria-hidden="true" />تعديل</button>
          <button data-guide-ignore="جزء من مساحة إعداد المقترح الدراسي — تشرحه بطاقة المساحة نفسها" type="button" className="sp-icon-text" data-tone="danger" onClick={() => ws.removeOp(op.id)} aria-label={`إزالة ${t.courseName} من المسودة`}><Trash2 aria-hidden="true" />إزالة</button>
        </span>
      </div>
    </article>
  );
}

export default function ProposalOps({ ws, onEdit }: { ws: Workspace; onEdit?: (opId: string) => void }) {
  if (!ws.ops.length) {
    return (
      <section className="sp-ops sp-ops-empty" aria-label="مواد المقترح">
        <p><b>لا مواد في المقترح بعد.</b> اختر نوع الإضافة وأضف أول مادة؛ يظهر أثرها في الجدول فوراً.</p>
      </section>
    );
  }
  return (
    <section className="sp-ops" aria-label="مواد المقترح">
      <ul>{ws.ops.map(op => <li key={op.id}><OpCard ws={ws} op={op} onEdit={onEdit} /></li>)}</ul>
    </section>
  );
}

export type { ProposalEvaluation };
