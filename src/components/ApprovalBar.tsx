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
import {
  AlertTriangle, BadgeCheck, CalendarClock, CalendarPlus, CalendarX, Check, ChevronDown, CornerUpLeft, FilePenLine, Flag, History,
  Hourglass, Landmark, ListChecks, ListPlus, Lock, MessageSquareText, PenLine, Quote, Send, ShieldCheck, Undo2, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { safeStorage } from "../utils/safeStorage";
import { Notice, PrimaryButton, SecondaryButton } from "./ui";
import {
  APPROVAL_EVENT_LABEL, APPROVAL_STATUS_LABEL, additionsAwaitingHead, awaitsHeadSignature, blockingSummaryPhrase, deadlinePassed,
} from "../utils/approvalWorkflow";
import { AR, countOf, nounFor, oblique } from "../utils/arabicCount";
import { deadlineDateLong, departmentDeadlineLine, lastExtensionRejection } from "../utils/submissionDeadlines";
import type { ScheduleApproval, ScheduleApprovalStatus } from "../types";

interface DeadlineShape {
  effective?: string; past: boolean; daysLeft?: number; tone: string;
  termDeadline?: string; extensionUntil?: string; extensionReason?: string;
}

interface Payload {
  approval: ScheduleApproval;
  deadline: DeadlineShape;
  blockingConflicts: number;
  /** المواعيدُ التي تقف في تلك التعارضات (approvalBlockerSummary على الخادم). */
  blockingRows?: number;
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
  /* تلميحٌ واحد مثبَّتٌ بالنقر في كل لحظة؛ يُطوى بـ Esc أو بنقرةٍ خارج الشريط. */
  const [openTip, setOpenTip] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openTip) return;
    const away = (event: PointerEvent) => { if (!barRef.current?.contains(event.target as Node)) setOpenTip(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [openTip]);
  /* الشريط مطويٌّ افتراضاً: سطرٌ واحد بالحال والموعد والفعل. التواقيع والتفاصيل
     لمن يطلبها — ويُذكَر اختيارُه على هذا الجهاز. */
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return safeStorage.get("schedule-approval-bar-open") === "1"; } catch { return false; }
  });
  const toggleExpanded = () => setExpanded(open => {
    const next = !open;
    try { safeStorage.set("schedule-approval-bar-open", next ? "1" : "0"); } catch { /* تفضيلٌ لا يلزم حفظه */ }
    return next;
  });

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
      if (Number(result?.remaining || 0) > 0) setError(`أُقرّ ما عُرض عليك. ووصل بعده ${countOf(Number(result.remaining), oblique(AR.section))} تنتظر نظرك.`);
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
  /* المسمّى وما زاد عليه معاً: ما زاد يمنع كما يمنع المسمّى. وما دام توقيعُ
     رئيس القسم قائماً وحده (additionsAwaitingHead): بغيابه يشملها اعتمادُه
     القادم، فلا يُقال له «أُضيفت بعد اعتمادك» ولا اعتمادَ له. */
  const pendingAdditions = additionsAwaitingHead(approval);
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
    : status === "returned" || (status === "drafting" && approval.headReturn) ? "returned"
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
     كان الشريط يَعِد بأن الخانات المعلَّق عليها ملوّنةٌ في الجدول — والجدولُ
     هنا لا يقرأ الملاحظات أصلاً. فيُقال العددُ ومكانُها الحقيقي. */
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
  /* «موعدكم: الأحد 11 أكتوبر 2026 · بقي 15 يوماً (استثناء حتى …)» — السطرُ
     نفسه الذي تبنيه لوحة «مواعيد التسليم» (utils/submissionDeadlines). */
  const countdown = deadline?.effective && !accepted && !locked
    ? deadlineGone
      ? `انقضى موعدكم ${deadlineDateLong(deadline.effective)}${deadline.extensionUntil ? " (استثناء)" : ""}`
      : departmentDeadlineLine({ ...deadline, past: false })
    : "";
  const extensionRequest = approval.extensionRequest;
  const rejected = !extensionRequest ? lastExtensionRejection(approval) : null;
  const events = [...(approval.events || [])].reverse();

  const Icon =
    headMustAcknowledge ? AlertTriangle
    : status === "returned" || (status === "drafting" && headReturn) ? CornerUpLeft
    : pendingAdditions > 0 ? AlertTriangle
    : locked ? Send
    : ShieldCheck;

  /* من لا يوقّع ولا ينتظره شيء لا يُعرض عليه الشريط أصلاً. */
  if (!signatureStage && !locked && status !== "accepted" && status !== "returned") return null;
  const canHeadReturnNow = signatureStage === "head" && awaitsHeadSignature(approval) && !locked;

  /* ── الشريط إنفوجرافيك: الحالُ تُرى، ونصُّها كاملاً في التلميح ─────────────
   *
   * طلب صاحب النظام أن يكون الشريط «بجمالية باقي الموقع: أيقونات بلا كلام
   * وإنفوجرافيك». فصار السطرُ المطويّ: أيقونةَ الحال وعنوانها، ومِرقاةَ
   * الدورة (لجنة ← رئيس قسم ← تسجيل ← معتمد)، وحلقةَ الموعد برقم أيامه،
   * وشاراتٍ بأعدادها، والفعلَ الأول. وكلُّ جملةٍ كانت تُكتب سطراً باقيةٌ كما هي
   * في تلميح عنصرها (يُفتح بالمرور وبالتركيز وبالنقر على الهاتف)، وفي نصٍّ
   * مخفيٍّ لقارئ الشاشة — لا تضيع معلومةٌ، وإنما تنتقل من السطر إلى موضعها.
   */
  const acting = Boolean(signatureStage || powerAdmin);
  const submitShown = readyToSubmit && acting;
  const primaryTaken = headMustAcknowledge || canSignNow || submitShown;
  const notesShown = Boolean(onOpenNotes) && (openNotes > 0 || status === "returned");
  const notesLine = openNotes
    ? `${countOf(openNotes, AR.note)} من التسجيل تنتظر معالجةً أو ردّاً — ${notesWhere}`
    : status === "returned" ? "عُولجت ملاحظات التسجيل كلها" : "";
  const headReturned = status === "drafting" && Boolean(headReturn);
  const signatureTip = (sig: typeof committee, fallback: string) => sig
    ? [sig.roleLabel || fallback, sig.userName, arabicDate(sig.at), `رمز التحقق: ${sig.verifyCode}`]
    : [];

  /* ── مِرقاةُ الدورة ─────────────────────────────────────────────────────
     أين الجدول الآن، ومن وقّع، ومن أرجعه. الحالُ من البيانات نفسها التي
     كانت تُكتب سطوراً: التوقيعان، والحال، والإرجاع، والإضافات المنتظِرة. */
  const steps: StepModel[] = [
    {
      key: "committee", label: "لجنة الجدول", Icon: PenLine,
      state: committee ? "done" : "current",
      turn: !committee || status === "returned",
      sig: signatureTip(committee, "لجنة الجدول"),
      initials: initialsOf(committee?.userName),
    },
    {
      key: "head", label: "رئيس القسم", Icon: BadgeCheck,
      state: pendingAdditions > 0 ? "pending" : head ? "done" : headReturned ? "returned" : committee ? "current" : "waiting",
      turn: (Boolean(committee) && !head && status !== "returned") || pendingAdditions > 0,
      sig: signatureTip(head, "رئيس القسم"),
      initials: initialsOf(head?.userName),
      badge: pendingAdditions > 0 ? `+${(pendingAdditions).toLocaleString("ar-KW-u-nu-latn")}` : undefined,
    },
    {
      key: "registrar", label: "التسجيل", Icon: Landmark,
      state: accepted ? "done" : locked ? "current" : status === "returned" ? "returned" : "waiting",
      turn: locked || (Boolean(committee && head) && !accepted && status !== "returned" && pendingAdditions === 0),
      badge: approval.currentRound > 0 ? `ج${Number(approval.currentRound).toLocaleString("ar-KW-u-nu-latn")}` : undefined,
      badgeTone: amendmentOpen ? "info" : undefined,
    },
    {
      key: "accepted", label: "معتمد", Icon: ShieldCheck,
      state: accepted ? "done" : "waiting",
      turn: false,
    },
  ];
  const returnFrom = status === "returned" ? 2 : headReturned ? 1 : 0;
  const stepWord = (step: StepModel) =>
    step.state === "done" ? (step.key === "accepted" ? "اعتُمد" : step.key === "registrar" ? "قبِل الجدول" : "وقّع")
    : step.state === "returned" ? "أرجع الجدول للجنة"
    : step.state === "pending" ? "شُعبٌ مضافة تنتظر إقراره"
    : step.turn || step.state === "current" ? "الدور عنده الآن"
    : "لم يصل إليه بعد";
  const stepsTip = [
    ...steps.map(step => `${step.label}: ${stepWord(step)}${step.sig?.length ? ` — ${step.sig[1]} · ${step.sig[2]}` : ""}`),
    approval.currentRound > 0 ? `الجولة ${approval.currentRound}${amendmentOpen ? " (جولة تعديل)" : ""}` : "",
  ].filter(Boolean);

  /* ── حلقةُ الموعد ─────────────────────────────────────────────────────── */
  const daysLeft = Math.max(0, Number(deadline?.daysLeft ?? 0));
  const ringTone = deadlineGone ? "past" : deadline?.tone === "near" || daysLeft <= 7 ? "near" : "ok";
  const ringFill = deadlineGone ? 1 : Math.max(0.06, Math.min(1, daysLeft / 14));
  const ringBadge: RingBadge | null =
    extensionRequest ? { tone: "warning", Icon: Hourglass }
    : rejected ? { tone: "danger", Icon: X }
    : deadline?.extensionUntil ? { tone: "info", Icon: CalendarPlus }
    : null;
  const ringTip = countdown ? [
    countdown,
    extensionRequest ? `طُلب تمديد ${countOf(extensionRequest.days, oblique(AR.day))} (${arabicDate(extensionRequest.at)}) — بانتظار رئيس التسجيل` : "",
    deadline?.extensionUntil && deadline.extensionReason && !deadlineGone ? `سبب الاستثناء: ${deadline.extensionReason}` : "",
    rejected ? `رُفض طلب التمديد (${arabicDate(rejected.at)})${rejected.detail ? `: ${rejected.detail}` : ""}` : "",
  ].filter(Boolean) : [];

  const tipProps = (id: string) => ({ open: openTip === id, onToggle: () => setOpenTip(current => current === id ? null : id) });

  const ring = (size: "sm" | "lg") => countdown ? (
    <InfoTip {...tipProps(`ring-${size}`)} label={countdown} tip={ringTip} className="apb-ring" data-tone={ringTone} data-size={size}
      data-guide-ignore="حلقة موعد التسليم — تلميحٌ يعرض التاريخ وحال التمديد، لا فعل">
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="apb-ring-track" cx="18" cy="18" r="15" />
        <circle className="apb-ring-value" cx="18" cy="18" r="15" pathLength={100} strokeDasharray={`${ringFill * 100} 100`} />
      </svg>
      <span className="apb-ring-core" aria-hidden="true">
        {deadlineGone ? <CalendarX /> : daysLeft === 0 ? <Hourglass /> : <b>{daysLeft.toLocaleString("ar-KW-u-nu-latn")}</b>}
        {size === "lg" && !deadlineGone && daysLeft > 0 ? <small>{nounFor(daysLeft, AR.day)}</small> : null}
      </span>
      {ringBadge ? <span className="apb-ring-badge" data-tone={ringBadge.tone} aria-hidden="true"><ringBadge.Icon /></span> : null}
    </InfoTip>
  ) : null;

  return (
    <div className="approval-bar" data-tone={tone} data-expanded={expanded || undefined} ref={barRef}
      onKeyDown={(event) => { if (event.key === "Escape" && openTip) { event.stopPropagation(); setOpenTip(null); } }}>
      <InfoTip {...tipProps("status")} label={headline} tip={detail ? [detail] : [headline]} className="apb-status" align="start"
        data-guide-ignore="أيقونة حال الدورة — تلميحٌ يعرض تفصيل الحال، لا فعل">
        <Icon aria-hidden="true" />
      </InfoTip>
      <strong className="apb-headline">{headline}</strong>

      {/* لقارئ الشاشة: كلُّ ما كان يُكتب سطوراً، كما هو. */}
      <p className="sr-only">
        {detail}{detail ? " " : ""}{countdown}
      </p>
      {committee || head ? (
        <p className="sr-only">
          {committee ? `اللجنة: ${committee.userName} · ${arabicDate(committee.at)} · رمز التحقق ${committee.verifyCode}. ` : ""}
          {head ? `رئيس القسم: ${head.userName} · ${arabicDate(head.at)} · رمز التحقق ${head.verifyCode}.` : ""}
        </p>
      ) : null}

      <div className="apb-visuals">
        {!expanded ? (
          <InfoTip {...tipProps("steps")} label={`مراحل الاعتماد — ${headline}`} tip={stepsTip} className="apb-steps-tip"
            data-guide-ignore="مِرقاة مراحل الاعتماد المصغّرة — تلميحٌ يعرض من وقّع وأين الجدول، لا فعل">
            <Stepper steps={steps} size="sm" returnFrom={returnFrom} />
          </InfoTip>
        ) : null}
        {!expanded ? ring("sm") : null}

        {pendingAdditions > 0 && !headMustAcknowledge ? (
          <InfoTip {...tipProps("additions")} label={`${countOf(pendingAdditions, AR.section)} تنتظر إقرار رئيس القسم`} tip={[additionsLine]}
            className="apb-badge" data-tone="info" data-guide-ignore="شارة الشعب المضافة بعد الاعتماد — تلميحٌ لا فعل">
            <ListPlus aria-hidden="true" /><b>{(pendingAdditions).toLocaleString("ar-KW-u-nu-latn")}</b>
          </InfoTip>
        ) : null}

        {headReturned && headReturn ? (
          <InfoTip {...tipProps("head-return")} label="سبب إرجاع رئيس القسم" tip={[detail]} className="apb-badge" data-tone="warning"
            data-guide-ignore="شارة سبب إرجاع رئيس القسم — تلميحٌ لا فعل">
            <Quote aria-hidden="true" />
          </InfoTip>
        ) : null}

        {!onOpenNotes && openNotes > 0 ? (
          <InfoTip {...tipProps("notes")} label={countOf(openNotes, AR.note)} tip={[notesLine]} className="apb-badge" data-tone="warning"
            data-guide-ignore="شارة ملاحظات التسجيل المفتوحة — الملاحظات معروضةٌ أسفل الشاشة، والشارة تلميحٌ لا فعل">
            <MessageSquareText aria-hidden="true" /><b>{openNotes.toLocaleString("ar-KW-u-nu-latn")}</b>
          </InfoTip>
        ) : null}

        {/* الخلافُ الذي تكرّر ثلاثاً يُعرض لرئيس القسم هنا — وهذا ما تَعِد به شاشةُ الملاحظات. */}
        {escalated > 0 && signatureStage === "head" ? (
          <InfoTip {...tipProps("escalated")} label={`${countOf(escalated, AR.note)} أصرّ عليها التسجيل ثلاثاً`} className="apb-badge" data-tone="warning"
            tip={<>{countOf(escalated, AR.note)} أصرّ عليها التسجيل ثلاثاً بعد ردّ اللجنة — تحتاج نظرك.</>}
            data-guide-ignore="شارة الخلاف المرفوع لرئيس القسم — تلميحٌ لا فعل">
            <Flag aria-hidden="true" /><b>{escalated.toLocaleString("ar-KW-u-nu-latn")}</b>
          </InfoTip>
        ) : null}

        {/* المانعُ شارةٌ بعدده في مكان الزرّ، وسببُه كاملاً في تلميحها. */}
        {canSignNow && blockingConflicts > 0 ? (
          <InfoTip {...tipProps("sign-blocked")} label="يمنع التوقيع" className="apb-badge apb-blocked" data-tone="danger"
            tip={<>يمنع التوقيع: {blockingSummaryPhrase(blockingConflicts, state.blockingRows)}</>}
            data-guide-ignore="شارة مانع التوقيع — تلميحٌ بالسبب، لا فعل">
            <AlertTriangle aria-hidden="true" /><b>{blockingConflicts.toLocaleString("ar-KW-u-nu-latn")}</b>
          </InfoTip>
        ) : null}
        {!readyToSubmit && Boolean(committee && head) && !locked && (signatureStage || powerAdmin) && pendingAdditions === 0 ? (
          accepted ? null
          : blockingConflicts > 0 ? (
            <InfoTip {...tipProps("submit-blocked")} label="يمنع الإرسال" className="apb-badge apb-blocked" data-tone="danger"
              tip={<>يمنع الإرسال: {blockingSummaryPhrase(blockingConflicts, state.blockingRows)}</>}
              data-guide-ignore="شارة مانع الإرسال — تلميحٌ بالسبب، لا فعل">
              <AlertTriangle aria-hidden="true" /><b>{blockingConflicts.toLocaleString("ar-KW-u-nu-latn")}</b>
            </InfoTip>
          ) : openNotes > 0 ? (
            <InfoTip {...tipProps("submit-blocked")} label="يمنع الإرسال" className="apb-badge apb-blocked" data-tone="danger"
              tip={<>يمنع الإرسال: {countOf(openNotes, AR.note)} من التسجيل تنتظر معالجةً أو ردّاً</>}
              data-guide-ignore="شارة مانع الإرسال — تلميحٌ بالسبب، لا فعل">
              <AlertTriangle aria-hidden="true" /><b>{openNotes.toLocaleString("ar-KW-u-nu-latn")}</b>
            </InfoTip>
          ) : pastDeadline ? (
            <InfoTip {...tipProps("submit-blocked")} label="يمنع الإرسال" className="apb-badge apb-blocked" data-tone="danger"
              tip={<>انقضى موعد التسليم — يلزم تمديدٌ من رئيس التسجيل</>}
              data-guide-ignore="شارة مانع الإرسال — تلميحٌ بالسبب، لا فعل">
              <CalendarX aria-hidden="true" />
            </InfoTip>
          ) : null
        ) : null}
      </div>

      <div className="approval-sign">
        {/* الأفعالُ الثانوية أيقونات، واسمُها في تلميحها وفي aria-label. */}
        {/* الملاحظاتُ تُقرأ حيث هي: زرٌّ يفتح شاشة التغييرات بدل وعدٍ بتلوينٍ لا يقع. */}
        {notesShown && primaryTaken ? (
          <IconButton label={`افتح الملاحظات${openNotes ? ` — ${countOf(openNotes, AR.note)}` : ""}`} count={openNotes}
            data-guide-ignore="انتقالٌ إلى شاشة تغييرات الجدول لقراءة الملاحظات — تنقّلٌ لا فعل" onClick={onOpenNotes!}>
            <MessageSquareText aria-hidden="true" />
          </IconButton>
        ) : null}

        {canHeadReturnNow ? (
          <IconButton label="إرجاع للجنة — بسببٍ تقرؤه اللجنة" disabled={busy} data-active={sheet === "head-return" || undefined}
            data-guide-ignore="يفتح ورقة سبب إرجاع الجدول للجنة — الإرسال داخلها وهو مسجّل" onClick={() => { setSheet("head-return"); setReason(""); }}>
            <CornerUpLeft aria-hidden="true" />
          </IconButton>
        ) : null}

        {state.canRequestExtension && signatureStage ? (
          <IconButton label="طلب تمديد لموعد التسليم" disabled={busy} data-active={sheet === "extension" || undefined}
            data-guide-ignore="يفتح ورقة طلب تمديد التسليم — الإرسال داخلها وهو مسجّل" onClick={() => { setSheet("extension"); setReason(""); setDays(7); }}>
            <CalendarClock aria-hidden="true" />
          </IconButton>
        ) : null}

        {/* ── السحب متاحٌ حتى يُرسَل، لا حتى يكتمل التوقيعان ──────────────
            كان يختفي في اللحظة التي يوقّع فيها الطرفُ الآخر، فمن وقّع خطأً لا
            يجد مخرجاً إلا أن يُرسل أو يسأل زميله أن يسحب توقيعه أولاً. والخادم
            يقبله ما دام الجدول لم يُرسَل. */}
        {/* ولا بعد القبول: سحبُ توقيعٍ على جدولٍ معتمد كان يُسقطه صامتاً إلى الإعداد. */}
        {mine && !locked && !accepted ? (
          <IconButton label="سحب توقيعي" disabled={busy}
            data-guide-ignore="سحب توقيعٍ أثبته صاحبه قبل الإرسال — تراجعٌ عن فعلٍ مسجّل" onClick={() => void act("/api/approvals/withdraw")}>
            <Undo2 aria-hidden="true" />
          </IconButton>
        ) : null}

        {events.length ? (
          <IconButton label={historyOpen ? "إخفاء السجلّ" : "السجلّ"} aria-expanded={historyOpen}
            data-guide-ignore="طيّ سجلّ الدورة وفتحه — عرضٌ لا فعل" onClick={() => setHistoryOpen(open => !open)}>
            <History aria-hidden="true" />
          </IconButton>
        ) : null}

        {/* ── الفعلُ الأول: زرٌّ واضح بأيقونةٍ وكلمة ─────────────────────── */}
        {headMustAcknowledge ? (
          <PrimaryButton type="button" className="apb-primary" title={`إقرار ${countOf(pendingAdditions, AR.section)} أُضيفت بعد اعتمادك`}
            data-guide-ignore="إقرار رئيس القسم بالشُّعب المضافة — ضغطةٌ واحدة، لا توقيعٌ جديد" disabled={busy} onClick={() => void act("/api/approvals/acknowledge-additions", {
            /* يُقرّ ما عُرض عليه وحده، لا ما وصل بعد أن فتح الشاشة. */
            expectedPendingIds: approval.pendingAdditions.map(item => Number(item.scheduleId)),
            expectedOverflow: overflow,
          })}>
            <ListChecks aria-hidden="true" /> {busy ? "يحفظ…" : "موافق"}
          </PrimaryButton>
        ) : null}

        {canSignNow ? (
          <PrimaryButton type="button" className="apb-primary" data-guide-target="approval.action.sign" disabled={busy || blockingConflicts > 0}
            aria-label={signatureStage === "head" ? "اعتماد وإرسال للتسجيل" : "توقيع لجنة الجدول"}
            title={signatureStage === "head" ? "اعتماد وإرسال للتسجيل" : "توقيع لجنة الجدول"}
            onClick={() => void act("/api/approvals/sign")}>
            {signatureStage === "head" ? <BadgeCheck aria-hidden="true" /> : <PenLine aria-hidden="true" />}
            {busy ? "يوقّع…" : signatureStage === "head" ? "اعتماد وإرسال" : "توقيع"}
          </PrimaryButton>
        ) : null}

        {/* ── الزرّ الذي كان مفقوداً ────────────────────────────────────────
            يظهر متى اكتمل التوقيعان ولم يكن الجدول عند التسجيل — سواءٌ كان
            أوّلَ إرسالٍ أم إعادةَ إرسالٍ بعد إرجاع. والتوقيعان يبقيان بعد
            الإرجاع، فلا يُطلبان مرّةً ثانية. وحين يمنعه ما يمنعه، تقف شارةُ
            المانع في مكانه وسببُه في تلميحها. */}
        {readyToSubmit && (signatureStage || powerAdmin) ? (
          <PrimaryButton type="button" className="apb-primary" data-guide-target="approval.action.submit" disabled={busy}
            aria-label={status === "returned" ? "إعادة الإرسال إلى التسجيل" : "إرسال إلى التسجيل"}
            title={status === "returned" ? "إعادة الإرسال إلى التسجيل" : "إرسال إلى التسجيل"}
            onClick={() => void act("/api/approvals/submit")}>
            <Send aria-hidden="true" /> {busy ? "يرسل…" : status === "returned" ? "إعادة الإرسال" : "إرسال"}
          </PrimaryButton>
        ) : null}

        {notesShown && !primaryTaken ? (
          <PrimaryButton type="button" className="apb-primary" data-guide-ignore="انتقالٌ إلى شاشة تغييرات الجدول لقراءة الملاحظات — تنقّلٌ لا فعل"
            aria-label={`افتح الملاحظات${openNotes ? ` — ${countOf(openNotes, AR.note)}` : ""}`} title={notesLine || "افتح الملاحظات"} onClick={onOpenNotes}>
            <MessageSquareText aria-hidden="true" /> الملاحظات
            {openNotes ? <span className="apb-count-inline" aria-hidden="true">{openNotes.toLocaleString("ar-KW-u-nu-latn")}</span> : null}
          </PrimaryButton>
        ) : null}

        <IconButton label={expanded ? "إخفاء التفاصيل" : "التفاصيل"} aria-expanded={expanded} className="apb-expand"
          data-guide-ignore="طيّ تفاصيل شريط الاعتماد وفتحها — عرضٌ لا فعل" onClick={toggleExpanded}>
          <ChevronDown aria-hidden="true" />
        </IconButton>
      </div>

      {expanded ? (
        <div className="apb-expanded">
          <div className="apb-expanded-row">
            <Stepper steps={steps} size="lg" returnFrom={returnFrom}
              stamp={(step) => step.sig?.length ? (
                <InfoTip {...tipProps(`stamp-${step.key}`)} label={`${step.label}: ${step.sig.join(" · ")}`} tip={step.sig} className="apb-stamp"
                  data-guide-ignore="ختم توقيع — تلميحٌ بالاسم والتاريخ ورمز التحقق، لا فعل">
                  <span className="apb-stamp-initials" aria-hidden="true">{step.initials}</span>
                  <span className="apb-stamp-check" aria-hidden="true"><Check /></span>
                </InfoTip>
              ) : null} />
            {ring("lg")}
          </div>
          {/* ما كتبه إنسانٌ يُعرض بنصّه: سببُ الإرجاع وأسماءُ الشعب المضافة. */}
          {headReturned && headReturn ? (
            <blockquote className="apb-quote"><CornerUpLeft aria-hidden="true" /><span>«{headReturn.reason}»<small> — {headReturn.by}{headReturn.at ? ` · ${arabicDate(headReturn.at)}` : ""}</small></span></blockquote>
          ) : null}
          {pendingAdditions > 0 ? (
            <ul className="apb-additions" aria-label="الشعب المضافة بعد الاعتماد">
              {approval.pendingAdditions.map(item => (
                <li key={String(item.scheduleId)}><ListPlus aria-hidden="true" />{item.courseName || "مقرر"} · شعبة {item.sectionCode || "—"}</li>
              ))}
              {overflow ? <li>و{countOf(overflow, AR.section)} أخرى</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

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

      {/* السجلّ خطٌّ زمنيّ: أيقونةُ الفعل وتاريخه، ومن فعله وتفصيلُه تحتهما صغيراً. */}
      {historyOpen && events.length ? (
        <ol className="approval-history">
          {events.map((event, index) => {
            const EventIcon = EVENT_ICON[event.action] || History;
            const label = APPROVAL_EVENT_LABEL[event.action] || event.action;
            const who = `${event.by}${event.round ? ` · الجولة ${event.round}` : ""}${event.detail ? ` — ${event.detail}` : ""}`;
            return (
              <li key={`${event.at}:${index}`} data-kind={EVENT_TONE[event.action] || "neutral"} title={`${label} · ${arabicDate(event.at)}\n${who}`}>
                <span className="apb-event-dot" aria-hidden="true"><EventIcon /></span>
                <strong>{label}</strong>
                <time>{arabicDate(event.at)}</time>
                <span className="apb-event-who">{who}</span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {error ? <Notice type="error">{error}</Notice> : null}
    </div>
  );
}

/* ── قطعُ الإنفوجرافيك ──────────────────────────────────────────────────── */

type StepState = "done" | "current" | "waiting" | "returned" | "pending";
interface StepModel {
  key: "committee" | "head" | "registrar" | "accepted";
  label: string;
  Icon: LucideIcon;
  state: StepState;
  /** الدور عنده الآن: نبضةٌ هادئة حول عقدته. */
  turn: boolean;
  /** سطورُ التوقيع للتلميح: الدور، الاسم، التاريخ، رمز التحقق. */
  sig?: string[];
  initials?: string;
  badge?: string;
  badgeTone?: "info";
}
interface RingBadge { tone: "warning" | "danger" | "info"; Icon: LucideIcon }

/** حرفان من الاسم للختم، بلا لقب «د.» — ومفصولان لئلّا يتّصلا كلمةً. */
function initialsOf(name?: string): string {
  const words = String(name || "").replace(/^\s*(د|أ\.?\s*د|م)\s*\.\s*/u, "").split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => Array.from(word)[0]).join("‌");
}

const EVENT_ICON: Record<string, LucideIcon> = {
  sign: PenLine, withdraw: Undo2, "acknowledge-additions": ListChecks, submit: Send, return: CornerUpLeft, accept: ShieldCheck,
  "head-return": CornerUpLeft, extension: CalendarPlus, "extension-request": CalendarClock, "extension-request-rejected": CalendarX,
  "amendment-open": FilePenLine, "closed-term-edit": Lock,
};
const EVENT_TONE: Record<string, string> = {
  sign: "accent", accept: "success", submit: "info", return: "warning", "head-return": "warning",
  "extension-request-rejected": "danger", withdraw: "muted",
};

function Stepper({ steps, size, returnFrom, stamp }: {
  steps: StepModel[]; size: "sm" | "lg"; returnFrom: number;
  stamp?: (step: StepModel) => React.ReactNode;
}) {
  return (
    <ol className="apb-steps" data-size={size} aria-hidden={size === "sm" ? true : undefined} aria-label={size === "lg" ? "مراحل الاعتماد" : undefined}>
      {returnFrom ? <span className="apb-return" data-from={returnFrom} aria-hidden="true">{size === "lg" ? <CornerUpLeft /> : null}</span> : null}
      {steps.map((step, index) => {
        const reached = step.state !== "waiting" || step.turn;
        const stamped = size === "lg" && stamp ? stamp(step) : null;
        return (
          <li key={step.key} data-state={step.state} data-turn={step.turn || undefined} data-reached={reached || undefined} data-index={index}>
            {stamped || (
              <span className="apb-node">
                {step.state === "done" && size === "sm" ? <Check aria-hidden="true" />
                  : step.state === "returned" ? <CornerUpLeft aria-hidden="true" />
                  : <step.Icon aria-hidden="true" />}
              </span>
            )}
            {step.badge ? <span className="apb-node-badge" data-tone={step.badgeTone || (step.state === "pending" ? "info" : undefined)}>{step.badge}</span> : null}
            {size === "lg" ? <span className="apb-step-label">{step.label}</span> : null}
            {size === "lg" ? <span className="sr-only">{step.state === "done" ? "مكتملة" : step.state === "returned" ? "أُرجع منها" : step.turn ? "الدور عندها" : "لم تصل بعد"}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * عنصرٌ يُرى ويُسأل: أيقونةٌ أو شارةٌ أو حلقة، وتلميحُها يظهر بالمرور وبالتركيز،
 * ويُثبَّت بالنقر (للهاتف حيث لا مرور). ونصُّه مربوطٌ بـ aria-describedby.
 */
function InfoTip({ label, tip, open, onToggle, className = "", align, children, ...rest }: {
  label: string; tip: React.ReactNode | string[]; open: boolean; onToggle: () => void; className?: string;
  align?: "start" | "end"; children: React.ReactNode; "data-guide-ignore": string; [data: `data-${string}`]: unknown;
}) {
  const id = React.useId();
  const lines = Array.isArray(tip) ? tip.filter(Boolean) : null;
  return (
    <span className="apb-tip" data-open={open || undefined} data-align={align}>
      <button type="button" className={`apb-tip-target ${className}`.trim()} aria-label={label} aria-describedby={id} aria-expanded={open}
        data-guide-ignore="تلميحُ عنصرٍ مرئيّ في شريط الاعتماد — يُفتح ويُطوى، لا فعل" {...rest} onClick={(event) => { event.stopPropagation(); onToggle(); }}>
        {children}
      </button>
      <span className="apb-pop" role="tooltip" id={id}>
        {lines ? lines.map((line, index) => <span key={index}>{line}</span>) : tip}
      </span>
    </span>
  );
}

/** زرُّ فعلٍ بأيقونةٍ وحدها: اسمُه في aria-label، وفي تلميحٍ يظهر بالمرور والتركيز. */
function IconButton({ label, count, className = "", children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; count?: number; "data-guide-ignore": string; [data: `data-${string}`]: unknown;
}) {
  return (
    <span className="apb-tip" data-align="end">
      <button type="button" data-guide-ignore="زرّ أيقونةٍ في شريط الاعتماد — سببُه الخاصّ يمرّره كلُّ موضعٍ يستعمله" {...props} className={`apb-icon-btn ${className}`.trim()} aria-label={label}>
        {children}
        {count ? <span className="apb-count" aria-hidden="true">{count.toLocaleString("ar-KW-u-nu-latn")}</span> : null}
      </button>
      <span className="apb-pop" aria-hidden="true">{label}</span>
    </span>
  );
}
