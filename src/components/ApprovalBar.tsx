/**
 * ── شريط الاعتماد ───────────────────────────────────────────────────────────
 *
 * يقف فوق جدول القسم، ولا يقول إلا ما يلزم صاحبه الآن. ورئيس القسم الذي لا
 * ينتظره شيء لا يرى شيئاً — وهذا هو الهدوء الذي طُلب صراحةً: شاشته جدولُ قسمه،
 * وزرٌّ واحد حين يحين وقته. وتبقى تفاصيل اللائحة في شاشة التغييرات حيث
 * تُقرأ مع الصفوف والملاحظات التي تخصها.
 *
 * وترتيب ما يُعرض هو ترتيب ما يُفعل:
 *   ١) مُرجَعٌ بملاحظات — أعجلُ ما في الشاشة، فيتصدّرها.
 *   ٢) شُعبٌ تنتظر إقرار رئيس القسم — تمنع إعادة الإرسال، فتُقال قبله.
 *   ٣) التوقيع — حين يحين دوره ولم يُثبَت بعد.
 *   ٤) الإرسال — حين اكتمل التوقيعان ولم يُرسل.
 *   ٥) عند التسجيل — خبرٌ لا فعل، فيُقال بهدوء.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Clock3, CornerUpLeft, History, MessageSquareText, Send, ShieldCheck } from "lucide-react";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";
import {
  APPROVAL_EVENT_LABEL, APPROVAL_STATUS_LABEL, blockingConflictPhrase, deadlinePassed, pendingAdditionTotal,
} from "../utils/approvalWorkflow";
import { AR, countOf } from "../utils/arabicCount";
import type { ScheduleApproval, ScheduleApprovalStatus } from "../types";

interface DeadlineShape {
  effective?: string; past: boolean; daysLeft?: number; tone: string;
  extensionUntil?: string; extensionReason?: string;
}

interface Payload {
  approval: ScheduleApproval;
  deadline: DeadlineShape;
  blockingConflicts: number;
  /** ملاحظاتُ التسجيل التي لم تُعالَج ولم يُردّ عليها: تمنع إعادة الإرسال. */
  openRegistrarNotes: number;
  /** عددُ مواعيد الجدول: لا يُوقَّع على جدولٍ فارغ. */
  rowCount: number;
  statusLabel: string;
  /** سببُ منع التعديل لهذا الناظر، من حارس الخادم نفسه — أو null. */
  lockReason?: string | null;
  /** خلافاتٌ أصرّ عليها التسجيل ثلاثاً، تُعرض لرئيس القسم. */
  escalatedNotes?: number;
  /** أيُعرض «طلب تمديد» الآن: قرب الموعد أو بعده، ولا طلبَ قائم. */
  canRequestExtension?: boolean;
}

interface Props {
  collegeId: number;
  sectionId: number;
  termId: number;
  /** مرحلة التوقيع التي يملكها صاحب الحساب، إن ملك واحدة. */
  signatureStage: "committee" | "head" | null;
  /** حسابُ الإدارة الرئيسي يُرسل ويوقّع نيابةً حيث يسمح الخادم. */
  powerAdmin?: boolean;
  /** يتغيّر كلّما تغيّر الجدول تحته، فيُعاد قراءةُ الحال. */
  refreshSignal?: number;
  onChanged?: () => void;
  /**
   * يُبلَّغ به سببُ منع التعديل كلّما تغيّر (أو null حين يُفتح)، فتعرف الورشةُ
   * قبل أن تفتح محرّراً يقول «صالح للحفظ» ثم يرفضه الخادم.
   */
  onLockChange?: (reason: string | null) => void;
  /** يفتح شاشة التغييرات حيث تُقرأ الملاحظات على مواعيدها. غيابه يعني أنها معروضةٌ هنا. */
  onOpenNotes?: () => void;
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
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("ar-KW-u-nu-latn", { year: "numeric", month: "long", day: "numeric" });
};

export default function ApprovalBar({ collegeId, sectionId, termId, signatureStage, powerAdmin = false, refreshSignal = 0, onChanged, onLockChange, onOpenNotes }: Props) {
  const [state, setState] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* ورقتان صغيرتان تُفتحان في مكانهما: إرجاعُ رئيس القسم، وطلبُ التمديد. */
  const [sheet, setSheet] = useState<null | "head-return" | "extension">(null);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    if (!collegeId || !sectionId || !termId) { setState(null); return; }
    try {
      setState(await request(`/api/approvals?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`));
    } catch { setState(null); }
  }, [collegeId, sectionId, termId]);

  useEffect(() => { void load(); }, [load]);
  /* وإشارةُ الجدول تُعيد القراءة دون أن تُبدّل هويّة `load` — فلا تُقرأ الحال
     مرّتين لكل فعل: مرّةً من الفعل نفسه ومرّةً من الإشارة التي يبعثها. */
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) { firstSignal.current = false; return; }
    void load();
  }, [refreshSignal]);

  /* سببُ القفل يُبلَّغ للورشة كلّما تغيّر — ولو لم يُرسم الشريط نفسه. */
  const lockReason = state ? (state.lockReason ?? null) : null;
  useEffect(() => { onLockChange?.(lockReason); }, [lockReason]);
  useEffect(() => () => { onLockChange?.(null); }, []);

  /* ── القرارُ يحمل ما رآه صاحبه ──────────────────────────────────────────
     الجولةُ وحالُها وعددُ المواعيد كما في الشاشة لحظةَ الضغط. فإن تغيّر شيءٌ
     منها تحت يده ردّه الخادم «تغيّر الجدول منذ فتحت الشاشة — حدّث». */
  const act = async (path: string, extra?: Record<string, unknown>) => {
    setBusy(true); setError(null);
    try {
      const seen = state ? {
        expectedRound: state.approval.currentRound,
        expectedStatus: state.approval.status,
        expectedRowCount: state.rowCount,
      } : {};
      const result: any = await request(path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collegeId, sectionId, termId, ...seen, ...(extra || {}) }),
      });
      /* اعتمادُ رئيس القسم يُرسل معه؛ فإن منعه مانعٌ قيل السببُ هنا. */
      if (result?.submitBlocked) setError(`حُفظ اعتمادك، ولم يُرسل بعد: ${result.submitBlocked}`);
      if (Number(result?.remaining || 0) > 0) setError(`أُقرّ ما عُرض عليك. ووصل بعده ${countOf(Number(result.remaining), AR.section)} تنتظر نظرك.`);
      setSheet(null); setReason("");
      await load();
      onChanged?.();
    } catch (e: any) { setError(e.message); await load(); }
    finally { setBusy(false); }
  };

  if (!state) return null;

  const { approval, blockingConflicts } = state;
  const openNotes = Number(state.openRegistrarNotes || 0);
  const status: ScheduleApprovalStatus = approval.status;
  const mine = signatureStage ? approval.signatures.find(item => item.stage === signatureStage) : undefined;
  const committee = approval.signatures.find(item => item.stage === "committee");
  const head = approval.signatures.find(item => item.stage === "head");
  /* المسمّى وما زاد عليه معاً: ما زاد يمنع كما يمنع المسمّى. */
  const pendingAdditions = pendingAdditionTotal(approval);
  const overflow = Math.max(0, Number(approval.pendingAdditionsOverflow || 0));
  const additionsLine = approval.pendingAdditions.map(item => `${item.courseName || "مقرر"} · شعبة ${item.sectionCode || "—"}`).join(" · ")
    + (overflow ? ` · و${countOf(overflow, AR.section)} أخرى` : "");
  const escalated = Number(state.escalatedNotes || 0);

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
  /* شرطُ التوقيع كما يقرؤه الخادم: جدولٌ غيرُ فارغ، وترتيبٌ محفوظ، ولم يُوقَّع
     بعد، وليس عند التسجيل. */
  const hasRows = Number(state.rowCount || 0) > 0;
  const canSignNow = Boolean(signatureStage) && !mine && !locked && hasRows
    && (signatureStage === "committee" || Boolean(committee));
  /* شرطُ الإرسال كما يقرؤه الخادم حرفاً بحرف: توقيعان، ولا إضافةً تنتظر
     إقراراً، ولا ملاحظةً من التسجيل بلا معالجةٍ ولا ردّ. فلا يُعرض زرٌّ
     يُرفض، ولا يُخفى زرٌّ يُقبل. */
  /* والموعدُ شرطٌ أيضاً، للتسليم الأول وحده: بعده لا يُسلَّم شاملٌ إلا بتمديد،
     أمّا الجولات فتمرّ. وكانت هذه البيانات تصل الشريط ولا تُقرأ. */
  const firstSubmission = Number(approval.currentRound || 0) === 0;
  /* الموعدُ ينتهي في آخر ثانيةٍ من يومه بتوقيت الكويت — القاعدة نفسها التي
     يقرؤها الخادم، فلا يبقى الزرّ ظاهراً ساعاتٍ بعد أن رُفض. */
  const deadlineGone = Boolean(state.deadline?.past) || deadlinePassed(state.deadline?.effective);
  const pastDeadline = deadlineGone && firstSubmission;
  /* والمعتمدُ لا يُرسل وهو على حاله، والتعارضُ المادّي يمنع الإرسال كما يمنع
     التوقيع — شرطا الخادم في `canSubmit` حرفاً بحرف. */
  const accepted = status === "accepted";
  const readyToSubmit = Boolean(committee && head)
    && pendingAdditions === 0 && openNotes === 0 && !pastDeadline && !locked && !accepted && blockingConflicts === 0;
  const headMustAcknowledge = pendingAdditions > 0 && signatureStage === "head";

  const tone =
    headMustAcknowledge ? "pending"
    : status === "returned" ? "returned"
    : pendingAdditions > 0 ? "pending"
    : locked || status === "accepted" ? "locked"
    : undefined;

  /* ── ما يُطلب من الناظر يتقدّم على ما يُخبَر به ────────────────────────
     رئيسُ قسمٍ أمامه شُعبٌ تنتظر إقراره وجدولٌ مُرجَع: كان يُقال له «أُرجع
     الجدول» ويُعرض زرُّ «موافق» بلا ذكرِ ما يوافق عليه. فصار المطلوبُ منه هو
     العنوان، والإرجاعُ خبرٌ يقرؤه في الجدول نفسه بخاناته الملوّنة. */
  const headReturn = approval.headReturn;
  const headline =
    headMustAcknowledge ? "أُضيفت شُعبٌ بعد اعتمادك"
    : status === "returned" ? "أرجع التسجيل الجدول بملاحظات"
    : status === "drafting" && headReturn ? "أرجع رئيس القسم الجدول للجنة"
    : locked ? "الجدول عند التسجيل"
    : status === "accepted" ? "الجدول معتمدٌ من التسجيل"
    : pendingAdditions > 0
      ? (headMustAcknowledge ? "أُضيفت شُعبٌ بعد اعتمادك" : "بانتظار موافقة رئيس القسم")
      : APPROVAL_STATUS_LABEL[status];

  /* ── ما يُقال عن الملاحظات يُقال صادقاً ────────────────────────────────
     كان الشريط يقول «الخانات المعلَّق عليها ملوّنةٌ في مكانها من الجدول» —
     والجدولُ هنا لا يقرأ الملاحظات أصلاً. فيُقال العددُ ومكانُها الحقيقي. */
  const notesWhere = onOpenNotes ? "تُقرأ على مواعيدها في شاشة تغييرات الجدول." : "معروضةٌ أدناه على مواعيدها.";
  const amendmentOpen = locked && Boolean(round?.amendment) && !state.lockReason;
  const detail =
    headMustAcknowledge
      ? additionsLine
    : status === "returned"
      ? `الجولة ${approval.currentRound} — ${openNotes ? `${countOf(openNotes, AR.note)} من التسجيل تنتظر معالجةً أو ردّاً` : "عُولجت ملاحظات التسجيل كلها"}. ${notesWhere}`
    : status === "drafting" && headReturn
      ? `«${headReturn.reason}» — ${headReturn.by}${headReturn.at ? ` · ${arabicDate(headReturn.at)}` : ""}. يُطوى متى وقّعت اللجنة من جديد.`
    : amendmentOpen
      ? `جولة تعديلٍ بعد القبول (${approval.currentRound}) — التعديلات تتجمّع فيها حتى يكتب التسجيل ملاحظة.`
    : locked
      ? `الجولة ${approval.currentRound} — التعديل مقفلٌ حتى يُقبل أو يُرجَع بملاحظات.`
    : status === "accepted"
      ? `${round?.acceptedAt ? `بتاريخ ${arabicDate(round.acceptedAt)} — ` : ""}أيُّ تعديلٍ بعده يفتح جولةَ تعديلٍ عند التسجيل.`
    : pendingAdditions > 0
      ? additionsLine
      : "";

  /* ── الموعد: عدٌّ تنازليّ يُقرأ، وطلبُ تمديدٍ حين يقترب ─────────────────── */
  const deadline = state.deadline;
  const countdown = deadline?.effective && !accepted && !locked
    ? deadlineGone ? `انقضى موعد التسليم (${arabicDate(deadline.effective)})`
      : deadline.daysLeft === 0 ? "آخر موعد للتسليم اليوم"
      : `بقي ${countOf(Number(deadline.daysLeft || 0), AR.day)} على موعد التسليم`
    : "";
  const extensionRequest = approval.extensionRequest;
  const events = [...(approval.events || [])].reverse();

  const Icon =
    headMustAcknowledge ? AlertTriangle
    : status === "returned" ? CornerUpLeft
    : pendingAdditions > 0 ? AlertTriangle
    : locked ? Send
    : ShieldCheck;

  /* من لا يوقّع ولا ينتظره شيء لا يُعرض عليه الشريط أصلاً. */
  if (!signatureStage && !locked && status !== "accepted" && status !== "returned") return null;
  const canHeadReturnNow = signatureStage === "head" && status === "committee" && !locked;

  return (
    <div className="approval-bar" data-tone={tone}>
      <Icon aria-hidden="true" />
      <div className="approval-bar-text">
        <strong>{headline}</strong>
        {detail ? <small>{detail}</small> : null}
        {/* التواقيع تُعرض في كل حال. ومن يسأل «مَن وقّع؟» يسأله حين يكون
            الجدول عند التسجيل قبل غيرها — فإخفاؤها هناك بالذات إخفاءٌ في
            اللحظة الوحيدة التي تُطلب فيها. */}
        {committee || head ? (
          <div className="approval-signed">
            {committee ? <span>اللجنة: <b>{committee.userName}</b> · {arabicDate(committee.at)} · <code>{committee.verifyCode}</code></span> : null}
            {head ? <span>رئيس القسم: <b>{head.userName}</b> · {arabicDate(head.at)} · <code>{head.verifyCode}</code></span> : null}
          </div>
        ) : null}
        {countdown ? (
          <small className="approval-countdown" data-past={deadlineGone || undefined}>
            <Clock3 aria-hidden="true" /> {countdown}
            {extensionRequest ? ` · طُلب تمديد ${countOf(extensionRequest.days, AR.day)} (${arabicDate(extensionRequest.at)}) — بانتظار رئيس التسجيل` : ""}
          </small>
        ) : null}
        {/* الخلافُ الذي تكرّر ثلاثاً يُعرض لرئيس القسم هنا — وهذا ما تَعِد به شاشةُ الملاحظات. */}
        {escalated > 0 && signatureStage === "head" ? (
          <small className="approval-escalated">
            <MessageSquareText aria-hidden="true" /> {countOf(escalated, AR.note)} أصرّ عليها التسجيل ثلاثاً بعد ردّ اللجنة — تحتاج نظرك.
          </small>
        ) : null}
      </div>

      <div className="approval-sign">
        {headMustAcknowledge ? (
          <PrimaryButton type="button" data-guide-ignore="إقرار رئيس القسم بالشُّعب المضافة — ضغطةٌ واحدة، لا توقيعٌ جديد" disabled={busy} onClick={() => void act("/api/approvals/acknowledge-additions", {
            /* يُقرّ ما عُرض عليه وحده، لا ما وصل بعد أن فتح الشاشة. */
            expectedPendingIds: approval.pendingAdditions.map(item => Number(item.scheduleId)),
            expectedOverflow: overflow,
          })}>
            {busy ? "يحفظ…" : "موافق"}
          </PrimaryButton>
        ) : null}

        {/* الملاحظاتُ تُقرأ حيث هي: زرٌّ يفتح شاشة التغييرات بدل وعدٍ بتلوينٍ لا يقع. */}
        {onOpenNotes && (openNotes > 0 || status === "returned") ? (
          <SecondaryButton type="button" data-guide-ignore="انتقالٌ إلى شاشة تغييرات الجدول لقراءة الملاحظات — تنقّلٌ لا فعل" onClick={onOpenNotes}>
            <MessageSquareText aria-hidden="true" /> افتح الملاحظات{openNotes ? ` (${openNotes.toLocaleString("ar-KW-u-nu-latn")})` : ""}
          </SecondaryButton>
        ) : null}

        {canHeadReturnNow ? (
          <SecondaryButton type="button" data-guide-ignore="يفتح ورقة سبب إرجاع الجدول للجنة — الإرسال داخلها وهو مسجّل" disabled={busy} onClick={() => { setSheet("head-return"); setReason(""); }}>
            <CornerUpLeft aria-hidden="true" /> إرجاع للجنة
          </SecondaryButton>
        ) : null}

        {state.canRequestExtension && signatureStage ? (
          <SecondaryButton type="button" data-guide-ignore="يفتح ورقة طلب تمديد التسليم — الإرسال داخلها وهو مسجّل" disabled={busy} onClick={() => { setSheet("extension"); setReason(""); setDays(7); }}>
            <Clock3 aria-hidden="true" /> طلب تمديد
          </SecondaryButton>
        ) : null}

        {/* المانعُ سطرٌ هادئ بجانب الزرّ، لا تنبيهٌ عائمٌ يعود كلما تحرّكت الشاشة. */}
        {canSignNow && blockingConflicts > 0 ? (
          <span className="approval-blocked">يمنع التوقيع: {blockingConflictPhrase(blockingConflicts)}</span>
        ) : null}
        {canSignNow ? (
          <PrimaryButton type="button" data-guide-target="approval.action.sign" disabled={busy || blockingConflicts > 0} onClick={() => void act("/api/approvals/sign")}>
            {busy ? "يوقّع…" : signatureStage === "head" ? "اعتماد وإرسال للتسجيل" : "توقيع لجنة الجدول"}
          </PrimaryButton>
        ) : null}

        {/* ── السحب متاحٌ حتى يُرسَل، لا حتى يكتمل التوقيعان ──────────────
            كان يختفي في اللحظة التي يوقّع فيها الطرفُ الآخر، فمن وقّع خطأً لا
            يجد مخرجاً إلا أن يُرسل أو يسأل زميله أن يسحب توقيعه أولاً. والخادم
            يقبله ما دام الجدول لم يُرسَل. */}
        {/* ولا بعد القبول: سحبُ توقيعٍ على جدولٍ معتمد كان يُسقطه صامتاً إلى الإعداد. */}
        {mine && !locked && !accepted ? (
          <SecondaryButton type="button" data-guide-ignore="سحب توقيعٍ أثبته صاحبه قبل الإرسال — تراجعٌ عن فعلٍ مسجّل" disabled={busy} onClick={() => void act("/api/approvals/withdraw")}>
            سحب توقيعي
          </SecondaryButton>
        ) : null}

        {/* ── الزرّ الذي كان مفقوداً ────────────────────────────────────────
            يظهر متى اكتمل التوقيعان ولم يكن الجدول عند التسجيل — سواءٌ كان
            أوّلَ إرسالٍ أم إعادةَ إرسالٍ بعد إرجاع. والتوقيعان يبقيان بعد
            الإرجاع، فلا يُطلبان مرّةً ثانية. */}
        {/* وحين يمنعه ما يمنعه، يُقال السببُ في مكان الزرّ لا بعد ضغطه. */}
        {!readyToSubmit && Boolean(committee && head) && !locked && (signatureStage || powerAdmin) && pendingAdditions === 0 ? (
          accepted ? null
          : blockingConflicts > 0 ? (
            <span className="approval-blocked">يمنع الإرسال: {blockingConflictPhrase(blockingConflicts)}</span>
          ) : openNotes > 0 ? (
            <span className="approval-blocked">
              {countOf(openNotes, AR.note)} من التسجيل تنتظر معالجةً أو ردّاً
            </span>
          ) : pastDeadline ? (
            <span className="approval-blocked">انقضى موعد التسليم — يلزم تمديدٌ من رئيس التسجيل</span>
          ) : null
        ) : null}
        {readyToSubmit && (signatureStage || powerAdmin) ? (
          <PrimaryButton type="button" data-guide-target="approval.action.submit" disabled={busy} onClick={() => void act("/api/approvals/submit")}>
            <Send aria-hidden="true" /> {busy ? "يرسل…" : status === "returned" ? "إعادة الإرسال إلى التسجيل" : "إرسال إلى التسجيل"}
          </PrimaryButton>
        ) : null}
        {events.length ? (
          <button type="button" className="approval-history-toggle" aria-expanded={historyOpen} data-guide-ignore="طيّ سجلّ الدورة وفتحه — عرضٌ لا فعل" onClick={() => setHistoryOpen(open => !open)}>
            <History aria-hidden="true" /> السجلّ
          </button>
        ) : null}
      </div>

      {sheet ? (
        <div className="approval-sheet" role="group" aria-label={sheet === "head-return" ? "سبب الإرجاع للجنة" : "طلب تمديد"}>
          <label>
            <span>{sheet === "head-return" ? "سبب الإرجاع — تقرؤه اللجنة في شريطها" : "سبب طلب التمديد"}</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={sheet === "head-return" ? "شعبتا المختبر في وقتٍ واحد" : "تأخّر اعتماد المنتدبين"} autoFocus />
          </label>
          {sheet === "extension" ? (
            <label>
              <span>كم يوماً</span>
              <input type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.min(60, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
          ) : null}
          <div className="approval-sheet-actions">
            <SecondaryButton type="button" data-guide-ignore="إلغاء الورقة — لا يغيّر شيئاً" onClick={() => setSheet(null)}>إلغاء</SecondaryButton>
            <PrimaryButton
              type="button"
              data-guide-ignore="إرسال الورقة المفتوحة: إرجاعُ رئيس القسم للجنة أو طلبُ تمديد — فعلٌ مسجّل في سجلّ الدورة"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void act(sheet === "head-return" ? "/api/approvals/head-return" : "/api/approvals/extension-request", sheet === "head-return" ? { reason } : { reason, days })}
            >
              {busy ? "يرسل…" : sheet === "head-return" ? "أرجِع للجنة" : "أرسل الطلب"}
            </PrimaryButton>
          </div>
        </div>
      ) : null}

      {historyOpen && events.length ? (
        <ol className="approval-history">
          {events.map((event, index) => (
            <li key={`${event.at}:${index}`}>
              <time>{arabicDate(event.at)}</time>
              <strong>{APPROVAL_EVENT_LABEL[event.action] || event.action}</strong>
              <span>{event.by}{event.round ? ` · الجولة ${event.round}` : ""}{event.detail ? ` — ${event.detail}` : ""}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? <Notice type="error">{error}</Notice> : null}
    </div>
  );
}
