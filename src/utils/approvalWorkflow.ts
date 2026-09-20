/**
 * ── منطق دورة الاعتماد ──────────────────────────────────────────────────────
 *
 * كل قاعدةٍ في هذه الدورة اتُّفق عليها صراحةً، وكلٌّ منها كانت تحتمل غير ما
 * استقرّت عليه. فهي مجموعةٌ هنا، نقيّةً بلا قاعدة بياناتٍ ولا شبكة، ليُقرأ
 * القرار مرّةً واحدة ويُختبر مرّةً واحدة:
 *
 *   • التوقيع مرّةً واحدة عند أول إرسال — لا في كل جولة. الملاحظات في الجولات
 *     بسيطةٌ في العادة، وإلزامُ توقيعين لتغيير قاعةٍ يُفرغ التوقيع من معناه
 *     بكثرة تكراره.
 *   • المانع الوحيد تعارضٌ مادّي. اللائحة تُعرض ولا تمنع — لأنها معيارٌ يُحتجّ
 *     به لا بوّابةٌ تُقفل، وصاحب القرار هو من يوقّع.
 *   • بعد التوقيع يمرّ كل تعديلٍ إلا إضافة صفّ: هو وحده ما لم يره رئيس القسم
 *     حين وقّع. وإقرارُه ضغطةٌ واحدة، لا توقيعٌ جديد.
 *   • بعد الموعد لا يُستورد ملفٌّ ولا يُنسخ فصلٌ ولا يُحذف الجدول جملةً —
 *     وتبقى التعديلات الجزئية مفتوحة، لأن القاعة تتغيّر والأستاذ يعتذر بعد
 *     الموعد كما قبله.
 */

import type {
  ScheduleApproval, ScheduleApprovalRound, ScheduleApprovalSignature, ScheduleApprovalStatus,
} from "../types";
import { AR, countOf } from "./arabicCount";

export const APPROVAL_STATUS_LABEL: Record<ScheduleApprovalStatus, string> = {
  drafting: "قيد الإعداد",
  committee: "موقّع من اللجنة",
  head: "موقّع من رئيس القسم",
  submitted: "عند التسجيل",
  returned: "مُرجَع بملاحظات",
  accepted: "معتمد",
};

/** سجلٌّ فارغ لقسمٍ لم يبدأ الدورة. يُبنى عند القراءة، ولا يُكتب حتى يقع أول فعل. */
export function emptyApproval(collegeId: number, sectionId: number, termId: number): ScheduleApproval {
  const scopeKey = `${collegeId}:${sectionId}:${termId}`;
  return {
    id: scopeKey, scopeKey,
    AdCollegeId: collegeId, AdSectionId: sectionId, AdTermId: termId,
    status: "drafting", signatures: [], rounds: [], currentRound: 0,
    pendingAdditions: [], updatedAt: new Date().toISOString(),
  };
}

export function signatureOf(approval: ScheduleApproval, stage: "committee" | "head"): ScheduleApprovalSignature | undefined {
  return approval.signatures.find(item => item.stage === stage);
}

/** التوقيعان معاً: هما شرط الإرسال الأول، وهما ما يُبطله الإرجاع. */
export function isFullySigned(approval: ScheduleApproval): boolean {
  return Boolean(signatureOf(approval, "committee") && signatureOf(approval, "head"));
}

/**
 * رمز التحقّق المطبوع.
 *
 * ستّة محارف تُشتقّ من مُعرّف النسخة ومن هوية الموقّع ولحظته. ليست تعميةً ولا
 * تدّعي أن تكون: هي ما يجعل ورقةً في ملفٍّ بعد شهرين قابلةً للمطابقة مع نسخةٍ
 * في النظام، بدل أن تكون ورقةً تشبه غيرها.
 */
export function verificationCode(versionId: string, userId: number, at: string): string {
  const source = `${versionId}|${userId}|${at}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(6, "0").slice(-6);
}

export type SignRefusal =
  | { ok: false; code: "blocking-conflicts"; message: string }
  | { ok: false; code: "wrong-order"; message: string }
  | { ok: false; code: "already-signed"; message: string }
  | { ok: false; code: "locked"; message: string }
  | { ok: false; code: "empty"; message: string };

export type SignVerdict = { ok: true } | SignRefusal;

/**
 * أيجوز التوقيع الآن؟
 *
 * التعارض المادّي وحده يمنع — لأنه ليس مخالفةً لقاعدة، بل استحالةٌ في الواقع:
 * أستاذٌ في قاعتين في اللحظة نفسها لا يحدث، مهما وقّع عليه أحد.
 */
export function canSign(
  approval: ScheduleApproval,
  stage: "committee" | "head",
  context: { blockingConflicts: number; rowCount: number },
): SignVerdict {
  if (approval.status === "submitted") {
    return { ok: false, code: "locked", message: "الجدول عند التسجيل الآن. لا توقيع حتى يُقبل أو يُرجَع." };
  }
  if (context.rowCount <= 0) {
    return { ok: false, code: "empty", message: "لا مواعيد في هذا الجدول بعد. لا يُوقَّع على جدولٍ فارغ." };
  }
  if (context.blockingConflicts > 0) {
    return {
      ok: false, code: "blocking-conflicts",
      message: `يوجد ${countOf(context.blockingConflicts, AR.conflict)} مادّي يمنع الاعتماد. `
        + "الملاحظات اللائحية لا تمنع، أمّا التعارض فلا يُوقَّع عليه.",
    };
  }
  if (signatureOf(approval, stage)) {
    return { ok: false, code: "already-signed", message: "هذا التوقيع مُثبَت بالفعل على النسخة الحالية." };
  }
  if (stage === "head" && !signatureOf(approval, "committee")) {
    return { ok: false, code: "wrong-order", message: "يوقّع رئيس لجنة الجدول أولاً، ثم رئيس القسم." };
  }
  return { ok: true };
}

/** الحالة بعد توقيعٍ جديد. لا تتجاوز «موقّع من رئيس القسم» — الإرسال فعلٌ مستقل. */
export function statusAfterSignature(approval: ScheduleApproval): ScheduleApprovalStatus {
  if (signatureOf(approval, "head")) return "head";
  if (signatureOf(approval, "committee")) return "committee";
  return "drafting";
}

/**
 * ── الإضافات بعد التوقيع ───────────────────────────────────────────────────
 *
 * التوقيع مشدودٌ إلى عدد صفوفٍ بعينه. فإن زاد العدد بعده، فثمّ ما لم يره
 * الموقّع. والفرق بين الإضافة وغيرها مقصود: تغييرُ قاعةٍ يُبدّل خانةً في صفٍّ
 * وافق عليه رئيس القسم؛ وإضافةُ شعبةٍ تُنشئ التزاماً لم يوافق عليه أصلاً.
 */
export function needsHeadAcknowledgement(approval: ScheduleApproval): boolean {
  return approval.pendingAdditions.length > 0;
}

/** أيجوز الإرسال للتسجيل الآن؟ */
export type SubmitVerdict =
  | { ok: true }
  | { ok: false; code: "not-signed" | "pending-additions" | "unresolved-notes" | "already-submitted" | "deadline"; message: string };

export function canSubmit(
  approval: ScheduleApproval,
  context: { openNoteCount: number; deadlineState: DeadlineState },
): SubmitVerdict {
  if (approval.status === "submitted") {
    return { ok: false, code: "already-submitted", message: "الجدول مُرسَلٌ بالفعل وينتظر التسجيل." };
  }
  if (!isFullySigned(approval)) {
    return { ok: false, code: "not-signed", message: "يلزم توقيع رئيس لجنة الجدول ثم رئيس القسم قبل الإرسال." };
  }
  if (needsHeadAcknowledgement(approval)) {
    /* العدُّ بصيغته العربية الصحيحة، من الأداة التي يستعملها النظام كله:
       «شعبة» و«شعبتان» و«خمس شعب» — لا «1 شعبة» و«2 شعبة». */
    return {
      ok: false, code: "pending-additions",
      message: `بانتظار موافقة رئيس القسم على ${countOf(approval.pendingAdditions.length, AR.section)} أُضيفت بعد اعتماده.`,
    };
  }
  if (context.openNoteCount > 0) {
    return {
      ok: false, code: "unresolved-notes",
      message: `بقيت ${countOf(context.openNoteCount, AR.note)} من التسجيل بلا معالجةٍ ولا ردّ.`,
    };
  }
  /* أول إرسالٍ بعد الموعد ممنوع، لأنه هو التسليم الشامل نفسه. أمّا الجولات
     فتمرّ: هي معالجةُ ملاحظاتٍ طلبها التسجيل، لا تسليمٌ متأخر. */
  if (context.deadlineState.past && approval.currentRound === 0) {
    return {
      ok: false, code: "deadline",
      message: "انقضى آخر موعدٍ لتسليم الجداول. يلزم تمديدٌ من رئيس التسجيل قبل التسليم الأول.",
    };
  }
  return { ok: true };
}

/* ── الموعد ─────────────────────────────────────────────────────────────── */

export interface DeadlineState {
  /** الموعد الساري: تمديدُ القسم إن وُجد، وإلا موعد الفصل. */
  effective?: string;
  /** موعد الفصل كما وضعه رئيس التسجيل. */
  termDeadline?: string;
  /** تمديدٌ خاصّ بهذا القسم. */
  extensionUntil?: string;
  extensionReason?: string;
  past: boolean;
  /** الأيام الباقية. سالبٌ إن مضى، وغيرُ معرَّفٍ إن لا موعد أصلاً. */
  daysLeft?: number;
  tone: "none" | "ok" | "near" | "past";
}

/** كم يوماً بين تاريخين، بحساب الأيام لا الساعات: «بقي يوم» لا «بقي ١٨ ساعة». */
export function daysBetween(fromISO: string, toISO: string): number {
  const from = Date.UTC(Number(fromISO.slice(0, 4)), Number(fromISO.slice(5, 7)) - 1, Number(fromISO.slice(8, 10)));
  const to = Date.UTC(Number(toISO.slice(0, 4)), Number(toISO.slice(5, 7)) - 1, Number(toISO.slice(8, 10)));
  return Math.round((to - from) / 86_400_000);
}

const NEAR_DAYS = 7;

/**
 * الموعد كما يُقرأ في الشاشة.
 *
 * فصلٌ بلا موعد هو فصلٌ بلا قيد — وهذا حال كل فصلٍ سبق هذه الإضافة، فلا يجوز
 * أن يُقفل أثراً رجعياً. والتمديد يتقدّم على الموعد دائماً، حتى لو كان أقرب:
 * قرارُ رئيس التسجيل في قسمٍ بعينه أخصُّ من قراره في الفصل كله.
 */
export function readDeadline(
  input: { termDeadline?: string; extensionUntil?: string; extensionReason?: string },
  todayISO: string,
): DeadlineState {
  const effective = input.extensionUntil || input.termDeadline;
  if (!effective) {
    return { termDeadline: input.termDeadline, extensionUntil: input.extensionUntil, past: false, tone: "none" };
  }
  const daysLeft = daysBetween(todayISO, effective);
  const past = daysLeft < 0;
  return {
    effective,
    termDeadline: input.termDeadline,
    extensionUntil: input.extensionUntil,
    extensionReason: input.extensionReason,
    past,
    daysLeft,
    tone: past ? "past" : daysLeft <= NEAR_DAYS ? "near" : "ok",
  };
}

/**
 * ── ما يُمنع بعد الموعد ─────────────────────────────────────────────────────
 *
 * «التسليم الشامل» ليس عدداً من الصفوف؛ هو نوعُ الفعل. استيرادُ ملفٍّ ونسخُ
 * فصلٍ يستبدلان الجدول كله بحكم تعريفهما. والحذفُ الجماعي يُقاس بالنسبة لا
 * بالعدد، لأن عشرين صفّاً في قسمٍ صغير هي جدوله كله، وفي قسمٍ كبير تصحيحٌ
 * عادي.
 */
export const WHOLESALE_DELETE_RATIO = 0.3;

export type WholesaleAction =
  | { kind: "import" }
  | { kind: "copy-term" }
  | { kind: "bulk-delete"; deleting: number; total: number };

export function isWholesaleChange(action: WholesaleAction): boolean {
  if (action.kind === "import" || action.kind === "copy-term") return true;
  if (action.total <= 0) return false;
  return action.deleting / action.total > WHOLESALE_DELETE_RATIO;
}

export function describeWholesaleRefusal(action: WholesaleAction, deadline: DeadlineState): string {
  const when = deadline.effective ? ` (${deadline.effective})` : "";
  const what =
    action.kind === "import" ? "استيراد جدولٍ من ملف"
    : action.kind === "copy-term" ? "نسخ الجدول من فصلٍ آخر"
    : `حذف ${action.deleting} من ${action.total} موعداً دفعةً واحدة`;
  return `انقضى آخر موعدٍ لتسليم الجداول${when}. ${what} تسليمٌ شامل، ولا يمرّ بعد الموعد. `
    + "التعديلات الجزئية — إضافة شعبة، أو تغيير قاعةٍ أو أستاذٍ أو وقت — تبقى مفتوحة. "
    + "وللتسليم الشامل يلزم تمديدٌ من رئيس التسجيل.";
}

/* ── الجولات ────────────────────────────────────────────────────────────── */

export function currentRound(approval: ScheduleApproval): ScheduleApprovalRound | undefined {
  return approval.rounds.find(round => round.number === approval.currentRound);
}

/** النسخة التي رآها التسجيل آخر مرّة — أساسُ المقارنة في تقرير التغييرات. */
export function lastReviewedVersionId(approval: ScheduleApproval): string | undefined {
  for (let index = approval.rounds.length - 1; index >= 0; index -= 1) {
    const round = approval.rounds[index];
    if (round.reviewedVersionId) return round.reviewedVersionId;
  }
  return undefined;
}

/**
 * ترتيب صندوق الوارد عند التسجيل.
 *
 * موظّفٌ أمام عشرين قسماً لا يريد قائمةً أبجدية؛ يريد أن يعرف بماذا يبدأ. فما
 * وصل ولم يُفتح أولاً، ثم ما عاد بعد إرجاعٍ لأنه دَينٌ على الموظّف نفسه، ثم ما
 * فيه موانع، وأخيراً ما قُبِل — باهتاً في الأسفل، حاضراً لمن أراده ولا يزاحم.
 */
export function inboxPriority(approval: ScheduleApproval, blockingConflicts: number): number {
  if (approval.status === "submitted" && approval.currentRound <= 1) return 0;
  if (approval.status === "submitted") return 1;
  if (blockingConflicts > 0) return 2;
  if (approval.status === "returned") return 3;
  if (approval.status === "accepted") return 5;
  return 4;
}
