/**
 * ── شريط الاعتماد ───────────────────────────────────────────────────────────
 *
 * يقف فوق جدول القسم، ولا يقول إلا ما يلزم صاحبه الآن. ورئيس القسم الذي لا
 * ينتظره شيء لا يرى شيئاً — وهذا هو الهدوء الذي طُلب صراحةً: شاشته جدولُ قسمه،
 * وزرٌّ واحد حين يحين وقته، وعدّادٌ لائحيٌّ صغير يُفتح عند الضغط فقط.
 *
 * وترتيب ما يُعرض هو ترتيب ما يُفعل:
 *   ١) مُرجَعٌ بملاحظات — أعجلُ ما في الشاشة، فيتصدّرها.
 *   ٢) شُعبٌ تنتظر إقرار رئيس القسم — تمنع إعادة الإرسال، فتُقال قبله.
 *   ٣) التوقيع — حين يحين دوره ولم يُثبَت بعد.
 *   ٤) الإرسال — حين اكتمل التوقيعان ولم يُرسل.
 *   ٥) عند التسجيل — خبرٌ لا فعل، فيُقال بهدوء.
 */

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CornerUpLeft, Scale, Send, ShieldCheck } from "lucide-react";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";
import { APPROVAL_STATUS_LABEL } from "../utils/approvalWorkflow";
import type { ScheduleApproval, ScheduleApprovalStatus } from "../types";

interface DeadlineShape {
  effective?: string; past: boolean; daysLeft?: number; tone: string;
  extensionUntil?: string; extensionReason?: string;
}

interface Payload {
  approval: ScheduleApproval;
  deadline: DeadlineShape;
  blockingConflicts: number;
  regulationNotices: number;
  statusLabel: string;
}

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  /** مرحلة التوقيع التي يملكها صاحب الحساب، إن ملك واحدة. */
  signatureStage: "committee" | "head" | null;
  onChanged?: () => void;
}

const request = async (url: string, init?: RequestInit) => {
  const response = await fetch(url, init);
  const body = await response.text();
  let data: any = {};
  if (body) { try { data = JSON.parse(body); } catch { throw new Error("وصل ردٌّ غير متوقّع من الخادم."); } }
  if (!response.ok) throw new Error(data.error || "تعذّر تنفيذ العملية");
  return data;
};

const arabicDate = (iso?: string) => {
  if (!iso) return "";
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("ar-KW", { year: "numeric", month: "long", day: "numeric" });
};

export default function ApprovalBar({ collegeId, sectionId, termId, signatureStage, onChanged }: Props) {
  const [state, setState] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNotices, setShowNotices] = useState(false);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setState(null); return; }
    try {
      setState(await request(`/api/approvals?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`));
    } catch { setState(null); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);

  const act = async (path: string) => {
    setBusy(true); setError(null);
    try {
      await request(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId }),
      });
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!state) return null;

  const { approval, blockingConflicts, regulationNotices } = state;
  const status: ScheduleApprovalStatus = approval.status;
  const mine = signatureStage ? approval.signatures.find(item => item.stage === signatureStage) : undefined;
  const committee = approval.signatures.find(item => item.stage === "committee");
  const head = approval.signatures.find(item => item.stage === "head");
  const pendingAdditions = approval.pendingAdditions.length;

  /* ١) مُرجَعٌ بملاحظات. */
  if (status === "returned") {
    return (
      <div className="approval-bar" data-tone="returned">
        <CornerUpLeft aria-hidden="true" />
        <div className="approval-bar-text">
          <strong>أرجع التسجيل الجدول بملاحظات</strong>
          <small>
            الجولة {approval.currentRound}
            {approval.rounds.find(round => round.number === approval.currentRound)?.returnedNoteCount
              ? ` — ${approval.rounds.find(round => round.number === approval.currentRound)?.returnedNoteCount} ملاحظة`
              : ""}
            . الخانات المعلَّق عليها ملوّنةٌ في مكانها من الجدول.
          </small>
        </div>
        {error ? <Notice type="error">{error}</Notice> : null}
      </div>
    );
  }

  /* ٢) شُعبٌ تنتظر إقرار رئيس القسم. */
  if (pendingAdditions > 0) {
    const forHead = signatureStage === "head";
    return (
      <div className="approval-bar" data-tone="pending">
        <AlertTriangle aria-hidden="true" />
        <div className="approval-bar-text">
          <strong>
            {forHead ? "أُضيفت شُعبٌ بعد اعتمادك" : "بانتظار موافقة رئيس القسم"}
          </strong>
          <small>
            {approval.pendingAdditions.map(item => `${item.courseName || "مقرر"} · شعبة ${item.sectionCode || "—"}`).join(" · ")}
          </small>
        </div>
        {forHead ? (
          <PrimaryButton type="button" disabled={busy} onClick={() => void act("/api/approvals/acknowledge-additions")}>
            {busy ? "يحفظ…" : "موافق"}
          </PrimaryButton>
        ) : null}
        {error ? <Notice type="error">{error}</Notice> : null}
      </div>
    );
  }

  /* ٥) عند التسجيل: خبرٌ لا فعل. */
  if (status === "submitted") {
    return (
      <div className="approval-bar" data-tone="locked">
        <Send aria-hidden="true" />
        <div className="approval-bar-text">
          <strong>الجدول عند التسجيل</strong>
          <small>الجولة {approval.currentRound} — التعديل مقفلٌ حتى يُقبل أو يُرجَع بملاحظات.</small>
        </div>
      </div>
    );
  }

  if (status === "accepted") {
    const round = approval.rounds.find(item => item.number === approval.currentRound);
    return (
      <div className="approval-bar" data-tone="locked">
        <ShieldCheck aria-hidden="true" />
        <div className="approval-bar-text">
          <strong>الجدول معتمدٌ من التسجيل</strong>
          <small>
            {round?.acceptedAt ? `بتاريخ ${arabicDate(round.acceptedAt)}` : ""}
            {" "}— أيُّ تعديلٍ بعده يعيده للتسجيل جولةً جديدة.
          </small>
        </div>
      </div>
    );
  }

  /* ٣) و٤) التوقيع ثم الإرسال. ولا يظهران لمن لا يملكهما. */
  if (!signatureStage) return null;

  const canSignNow = !mine && (signatureStage === "committee" || Boolean(committee));
  const readyToSubmit = Boolean(committee && head);

  return (
    <div className="approval-bar">
      <ShieldCheck aria-hidden="true" />
      <div className="approval-bar-text">
        <strong>{APPROVAL_STATUS_LABEL[status]}</strong>
        <div className="approval-signed">
          {committee ? <span>اللجنة: <b>{committee.userName}</b> · {arabicDate(committee.at)} · <code>{committee.verifyCode}</code></span> : <span>بانتظار توقيع لجنة الجدول</span>}
          {head ? <span>رئيس القسم: <b>{head.userName}</b> · {arabicDate(head.at)} · <code>{head.verifyCode}</code></span> : null}
        </div>
      </div>

      <div className="approval-sign">
        {/* اللائحة تُعرض ولا تمنع: عدّادٌ صغير يُفتح عند الضغط، بجانب الزرّ
            لا فوقه — فالقرار لصاحب التوقيع، والعلم به يُسجَّل معه. */}
        {regulationNotices > 0 && canSignNow ? (
          <button type="button" className="approval-sign-notices" onClick={() => setShowNotices(value => !value)}>
            <Scale aria-hidden="true" /> {regulationNotices} ملاحظةً لائحية
          </button>
        ) : null}
        {canSignNow ? (
          <PrimaryButton type="button" disabled={busy || blockingConflicts > 0} onClick={() => void act("/api/approvals/sign")}>
            {busy ? "يوقّع…" : signatureStage === "head" ? "اعتماد الجدول" : "توقيع لجنة الجدول"}
          </PrimaryButton>
        ) : null}
        {mine && !readyToSubmit ? (
          <SecondaryButton type="button" disabled={busy} onClick={() => void act("/api/approvals/withdraw")}>
            سحب توقيعي
          </SecondaryButton>
        ) : null}
        {readyToSubmit ? (
          <PrimaryButton type="button" disabled={busy} onClick={() => void act("/api/approvals/submit")}>
            <Send aria-hidden="true" /> {busy ? "يرسل…" : "إرسال إلى التسجيل"}
          </PrimaryButton>
        ) : null}
      </div>

      {blockingConflicts > 0 ? (
        <Notice type="error">
          {blockingConflicts} تعارضٌ مادّي يمنع الاعتماد. أمّا الملاحظات اللائحية فلا تمنع التوقيع.
        </Notice>
      ) : null}
      {showNotices ? (
        <Notice type="warning">
          اللائحة معيارٌ يُحتجّ به لا بوّابةٌ تُقفل: تفصيلها في شاشة المراجعة اللائحية،
          وتُسجَّل مع توقيعك فيُطبع «وقّع مع علمه بـ{regulationNotices} ملاحظةً لائحية».
        </Notice>
      ) : null}
      {error ? <Notice type="error">{error}</Notice> : null}
    </div>
  );
}
