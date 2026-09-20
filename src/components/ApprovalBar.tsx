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
  /** يتغيّر كلّما تغيّر الجدول تحته، فيُعاد قراءةُ الحال. */
  refreshSignal?: number;
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

export default function ApprovalBar({ collegeId, sectionId, termId, signatureStage, refreshSignal = 0, onChanged }: Props) {
  const [state, setState] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNotices, setShowNotices] = useState(false);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setState(null); return; }
    try {
      setState(await request(`/api/approvals?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`));
    } catch { setState(null); }
  }, [collegeId, sectionId, termId, refreshSignal]);

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

  /* ── حالةٌ واحدة متّصلة، لا خمسُ حالاتٍ يُخرج من كلٍّ منها مبكّراً ────────
   *
   * كان الشريط يُعالج كل حالةٍ بخروجٍ مبكّر، وبدا ذلك مرتّباً — حتى وقع ما لا
   * تُظهره قراءةُ الكود ولا يمنعه مترجم: الجدولُ المُرجَع كان يخرج عند أول
   * حالة، برسالةٍ بلا زرّ. فيعالج القسمُ الملاحظات ثم لا يجد في النظام كلّه
   * بابا يُعيد به الإرسال — والدورةُ تقف عند جولتها الأولى، لا لخللٍ في
   * قاعدةٍ بل لأن الزرّ لم يُرسم.
   *
   * فصار الخبرُ فوق والفعلُ تحت، دائماً. ما يُقال يختلف بالحال، وما يُفعل
   * يبقى في مكانه — فلا حالَ تُنسى لأنها كانت آخرَ ما فُكّر فيه.
   */

  const round = approval.rounds.find(item => item.number === approval.currentRound);
  const locked = status === "submitted";
  const canSignNow = Boolean(signatureStage) && !mine && (signatureStage === "committee" || Boolean(committee));
  const readyToSubmit = Boolean(committee && head) && pendingAdditions === 0 && !locked;
  const headMustAcknowledge = pendingAdditions > 0 && signatureStage === "head";

  const tone =
    status === "returned" ? "returned"
    : pendingAdditions > 0 ? "pending"
    : locked || status === "accepted" ? "locked"
    : undefined;

  const headline =
    status === "returned" ? "أرجع التسجيل الجدول بملاحظات"
    : locked ? "الجدول عند التسجيل"
    : status === "accepted" ? "الجدول معتمدٌ من التسجيل"
    : pendingAdditions > 0
      ? (headMustAcknowledge ? "أُضيفت شُعبٌ بعد اعتمادك" : "بانتظار موافقة رئيس القسم")
      : APPROVAL_STATUS_LABEL[status];

  const detail =
    status === "returned"
      ? `الجولة ${approval.currentRound}${round?.returnedNoteCount ? ` — ${round.returnedNoteCount} ملاحظة` : ""}. الخانات المعلَّق عليها ملوّنةٌ في مكانها من الجدول.`
    : locked
      ? `الجولة ${approval.currentRound} — التعديل مقفلٌ حتى يُقبل أو يُرجَع بملاحظات.`
    : status === "accepted"
      ? `${round?.acceptedAt ? `بتاريخ ${arabicDate(round.acceptedAt)} ` : ""}— أيُّ تعديلٍ بعده يعيده للتسجيل جولةً جديدة.`
    : pendingAdditions > 0
      ? approval.pendingAdditions.map(item => `${item.courseName || "مقرر"} · شعبة ${item.sectionCode || "—"}`).join(" · ")
      : "";

  const Icon =
    status === "returned" ? CornerUpLeft
    : pendingAdditions > 0 ? AlertTriangle
    : locked ? Send
    : ShieldCheck;

  /* من لا يوقّع ولا ينتظره شيء لا يُعرض عليه الشريط أصلاً. */
  if (!signatureStage && !locked && status !== "accepted" && status !== "returned") return null;

  return (
    <div className="approval-bar" data-tone={tone}>
      <Icon aria-hidden="true" />
      <div className="approval-bar-text">
        <strong>{headline}</strong>
        {detail ? <small>{detail}</small> : null}
        {/* التواقيع تُعرض حيثما كانت الحال، لا في حالٍ واحدة: من يسأل «هل
            وُقّع؟» يسأله بعد الإرجاع كما يسأله قبل الإرسال. */}
        {(committee || head) && !locked ? (
          <div className="approval-signed">
            {committee ? <span>اللجنة: <b>{committee.userName}</b> · {arabicDate(committee.at)} · <code>{committee.verifyCode}</code></span> : null}
            {head ? <span>رئيس القسم: <b>{head.userName}</b> · {arabicDate(head.at)} · <code>{head.verifyCode}</code></span> : null}
          </div>
        ) : null}
      </div>

      <div className="approval-sign">
        {headMustAcknowledge ? (
          <PrimaryButton type="button" data-guide-ignore="إقرار رئيس القسم بالشُّعب المضافة — ضغطةٌ واحدة، لا توقيعٌ جديد" disabled={busy} onClick={() => void act("/api/approvals/acknowledge-additions")}>
            {busy ? "يحفظ…" : "موافق"}
          </PrimaryButton>
        ) : null}

        {/* اللائحة تُعرض ولا تمنع: عدّادٌ صغير بجانب الزرّ لا فوقه. */}
        {regulationNotices > 0 && canSignNow ? (
          <button type="button" className="approval-sign-notices" data-guide-ignore="فتح عدّاد الملاحظات اللائحية — عرضٌ لا فعل، واللائحة لا تمنع" onClick={() => setShowNotices(value => !value)}>
            <Scale aria-hidden="true" /> {regulationNotices} ملاحظةً لائحية
          </button>
        ) : null}

        {canSignNow ? (
          <PrimaryButton type="button" data-guide-target="approval.action.sign" disabled={busy || blockingConflicts > 0} onClick={() => void act("/api/approvals/sign")}>
            {busy ? "يوقّع…" : signatureStage === "head" ? "اعتماد الجدول" : "توقيع لجنة الجدول"}
          </PrimaryButton>
        ) : null}

        {mine && !readyToSubmit && !locked ? (
          <SecondaryButton type="button" data-guide-ignore="سحب توقيعٍ أثبته صاحبه قبل الإرسال — تراجعٌ عن فعلٍ مسجّل" disabled={busy} onClick={() => void act("/api/approvals/withdraw")}>
            سحب توقيعي
          </SecondaryButton>
        ) : null}

        {/* ── الزرّ الذي كان مفقوداً ────────────────────────────────────────
            يظهر متى اكتمل التوقيعان ولم يكن الجدول عند التسجيل — سواءٌ كان
            أوّلَ إرسالٍ أم إعادةَ إرسالٍ بعد إرجاع. والتوقيعان يبقيان بعد
            الإرجاع، فلا يُطلبان مرّةً ثانية. */}
        {readyToSubmit && signatureStage ? (
          <PrimaryButton type="button" data-guide-target="approval.action.submit" disabled={busy} onClick={() => void act("/api/approvals/submit")}>
            <Send aria-hidden="true" /> {busy ? "يرسل…" : status === "returned" ? "إعادة الإرسال إلى التسجيل" : "إرسال إلى التسجيل"}
          </PrimaryButton>
        ) : null}
      </div>

      {blockingConflicts > 0 && canSignNow ? (
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
