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
  ScheduleAdditionPending, ScheduleApproval, ScheduleApprovalEvent, ScheduleApprovalRound,
  ScheduleApprovalSignature, ScheduleApprovalStatus,
} from "../types";
import { AR, countOf, oblique } from "./arabicCount";

/**
 * ── «خمسة تعارضات مادّي» ────────────────────────────────────────────────────
 *
 * العدُّ العربي يُغيّر صيغة المعدود، والوصفُ يتبع المعدود. فجمعُ عددٍ صحيحٍ إلى
 * وصفٍ مفردٍ ثابت يُنتج ما لا يُقرأ — وهذه الجملةُ بالذات أكثرُ ما يُقرأ في هذه
 * الدورة: هي التي تقف في وجه التوقيع وتُقال لرئيس القسم.
 *
 * فالوصفُ داخلٌ في المعدود، يتبعه في صيغته كما يقتضي اللسان.
 */
const BLOCKING_CONFLICT = {
  one: "تعارض مادّي", two: "تعارضان مادّيان",
  few: "تعارضات مادّية", many: "تعارضاً مادّياً",
} as const;

/** «تعارضٌ مادّي» أو «خمسة تعارضات مادّية» — من موضعٍ واحد لكل من يقولها. */
export function blockingConflictPhrase(count: number): string {
  return countOf(count, BLOCKING_CONFLICT);
}

/**
 * The bar's whole sentence: the conflicts, then the appointments they touch —
 * each with its own noun, so «4» and «5» on one screen never read as two
 * answers to one question. `rows` comes from `approvalBlockerSummary`.
 */
export function blockingSummaryPhrase(conflicts: number, rows?: number): string {
  const head = blockingConflictPhrase(conflicts);
  const touched = Math.max(0, Math.round(Number(rows) || 0));
  return touched > 0 ? `${head} · تمسّ ${countOf(touched, AR.appointment)}` : head;
}

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

/**
 * ── ينتظر توقيعَ رئيس القسم؟ (مراجعة 11) ──────────────────────────────────
 * «committee» هي الحالة المعتادة. لكن جدولاً أرجعه التسجيل يبقى «أُرجع» بعد
 * أن تعيد اللجنة توقيعها (statusAfterSignatureChange يحفظ الإرجاع)، فكان
 * رئيسُ القسم لا يستطيع إرجاعه للجنة، ولا يعدّه عدّادُه وهو ينتظر توقيعه.
 * القاعدة هنا وحدها: الإرجاعُ للجنة، وعدّادُ رئيس القسم، وشريطُه.
 */
export function awaitsHeadSignature(approval: ScheduleApproval): boolean {
  if (approval.status === "committee") return true;
  return approval.status === "returned" && Boolean(signatureOf(approval, "committee")) && !signatureOf(approval, "head");
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
      message: `يوجد ${blockingConflictPhrase(context.blockingConflicts)} يمنع الاعتماد. `
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
  return additionsAwaitingHead(approval) > 0;
}

/**
 * ── الإضافاتُ تنتظر رئيسَ القسم ما دام توقيعُه قائماً ─────────────────────
 *
 * الإضافةُ تُسجَّل لأنها وقعت بعد اعتمادٍ قائم. فإن سقط ذلك الاعتماد (سحبت
 * اللجنةُ توقيعها فسقط توقيعه معه، أو أرجع هو الجدولَ للجنة) لم يبقَ ما أُضيف
 * «بعد اعتماده»: توقيعُه القادم يقع على الجدول كلِّه بما فيه. وكانت القائمةُ
 * تبقى، فيُقال لرئيس القسم «أُضيفت شعبةٌ بعد اعتمادك» ولا اعتمادَ له، ويُعدّ
 * في عدّاد اللجنة ما لا تملك فيه فعلاً. هذا هو العدُّ الذي يقرؤه كلُّ من يعرض
 * الإضافات أو يمنع بها: الشريط، والجرس، والعدّاد، والوارد، والإرسال.
 */
export function additionsAwaitingHead(
  approval: Pick<ScheduleApproval, "signatures" | "pendingAdditions" | "pendingAdditionsOverflow">,
): number {
  return (approval.signatures || []).some(item => item.stage === "head") ? pendingAdditionTotal(approval) : 0;
}

/**
 * التواقيعُ الباقية بعد سحبٍ أو إرجاع. وإن لم يبقَ توقيعُ رئيس القسم طُويت معه
 * قائمةُ الإضافات التي كانت تنتظره (additionsAwaitingHead): مكانٌ واحد يُسقط
 * التوقيعَ وما عُلّق عليه، لا مساران يتذكّر أحدُهما وينسى الآخر.
 */
export function withRemainingSignatures(approval: ScheduleApproval, signatures: ScheduleApprovalSignature[]): ScheduleApproval {
  if (signatures.some(item => item.stage === "head")) return { ...approval, signatures };
  return { ...approval, signatures, pendingAdditions: [], pendingAdditionsOverflow: 0 };
}

/** كلُّ ما ينتظر الإقرار: المسمّى في القائمة وما زاد عليها. */
export function pendingAdditionTotal(approval: Pick<ScheduleApproval, "pendingAdditions" | "pendingAdditionsOverflow">): number {
  return (approval.pendingAdditions?.length || 0) + Math.max(0, Number(approval.pendingAdditionsOverflow || 0));
}

/** سقفُ ما يُسمّى من الإضافات. ما زاد يُعدّ ولا يُسقط. */
export const PENDING_ADDITIONS_CAP = 60;

/**
 * ضمُّ إضافاتٍ جديدة إلى قائمة الانتظار.
 *
 * كانت القائمة تُقصّ عند ستين فيسقط ما بعدها بلا أثر: استيرادٌ من ثلاثمئة صفٍّ
 * بعد التوقيع يصير «ستون شعبة» ويُقرّ رئيس القسم ستين ويُرسل الباقي بلا علمه.
 * فيُسمّى ما يُقرأ، ويُعدّ الباقي، ويمنع الإرسالَ كلُّه حتى يُقرّ.
 */
export function mergePendingAdditions(
  approval: Pick<ScheduleApproval, "pendingAdditions" | "pendingAdditionsOverflow">,
  fresh: ScheduleAdditionPending[],
): { pendingAdditions: ScheduleAdditionPending[]; pendingAdditionsOverflow: number } {
  const known = new Set(approval.pendingAdditions.map(item => Number(item.scheduleId)));
  const unique = fresh.filter(item => !known.has(Number(item.scheduleId)));
  const room = Math.max(0, PENDING_ADDITIONS_CAP - approval.pendingAdditions.length);
  return {
    pendingAdditions: [...approval.pendingAdditions, ...unique.slice(0, room)],
    pendingAdditionsOverflow: Math.max(0, Number(approval.pendingAdditionsOverflow || 0)) + Math.max(0, unique.length - room),
  };
}

/**
 * إقرارُ رئيس القسم بما رآه، لا بما وصل بعد أن فتح الشاشة.
 *
 * يُقرّ المعرّفاتِ التي عُرضت عليه وحدها، والزائدَ المعدودَ إن كان العددُ هو
 * نفسُه ما رآه. وما أُضيف بين فتحه الشاشةَ وضغطه «موافق» يبقى ينتظره. وحين
 * لا يُرسل الطرفُ ما رآه (واجهةٌ قديمة) يُقرّ الكلّ كما كان.
 */
export function acknowledgeAdditions(
  approval: ScheduleApproval,
  seen?: { ids?: number[]; overflow?: number },
): { next: ScheduleApproval; acknowledged: number; remaining: number } {
  if (!seen || !Array.isArray(seen.ids)) {
    const acknowledged = pendingAdditionTotal(approval);
    return { next: { ...approval, pendingAdditions: [], pendingAdditionsOverflow: 0 }, acknowledged, remaining: 0 };
  }
  const ids = new Set(seen.ids.map(Number));
  const kept = approval.pendingAdditions.filter(item => !ids.has(Number(item.scheduleId)));
  const overflowNow = Math.max(0, Number(approval.pendingAdditionsOverflow || 0));
  const overflowSeen = Number(seen.overflow ?? 0) === overflowNow;
  const overflow = overflowSeen ? 0 : overflowNow;
  const next = { ...approval, pendingAdditions: kept, pendingAdditionsOverflow: overflow };
  const acknowledged = pendingAdditionTotal(approval) - pendingAdditionTotal(next);
  return { next, acknowledged, remaining: pendingAdditionTotal(next) };
}

/**
 * ── تبديلُ المقرر أو الشعبة بعد التوقيع إضافةٌ لا تعديل ────────────────────
 *
 * تغييرُ القاعة يُبدّل خانةً في صفٍّ وافق عليه رئيس القسم. أمّا تبديلُ المقرر
 * أو رقمِ الشعبة فيُنشئ التزاماً آخر في مكان الأول — وهو بالضبط ما وُجدت له
 * قائمة الانتظار.
 */
export function isSwapEdit(before: { AdCourseId?: unknown; SCode?: unknown } | undefined, after: { AdCourseId?: unknown; SCode?: unknown } | undefined): boolean {
  if (!before || !after) return false;
  return Number(before.AdCourseId || 0) !== Number(after.AdCourseId || 0)
    || String(before.SCode ?? "").trim() !== String(after.SCode ?? "").trim();
}

/** أيجوز الإرسال للتسجيل الآن؟ */
export type SubmitVerdict =
  | { ok: true }
  | { ok: false; code: "not-signed" | "pending-additions" | "unresolved-notes" | "already-submitted" | "already-accepted" | "blocking-conflicts" | "deadline"; message: string };

export function canSubmit(
  approval: ScheduleApproval,
  context: { openNoteCount: number; deadlineState: DeadlineState; blockingConflicts?: number },
): SubmitVerdict {
  if (approval.status === "submitted") {
    return { ok: false, code: "already-submitted", message: "الجدول مُرسَلٌ بالفعل وينتظر التسجيل." };
  }
  /* ── المقبول لا يُرسل ثانيةً وهو على حاله ──────────────────────────────
     جدولٌ قبِله التسجيل ولم يتغيّر بعده ليس فيه ما يُراجَع. وأيُّ تعديلٍ عليه
     يفتح جولةَ تعديلٍ من تلقاء نفسه، فلا حاجة إلى زرّ إرسالٍ يعيده كما هو. */
  if (approval.status === "accepted") {
    return { ok: false, code: "already-accepted", message: "الجدول معتمدٌ من التسجيل ولم يتغيّر بعد القبول — لا شيء يُرسل." };
  }
  if (!isFullySigned(approval)) {
    return { ok: false, code: "not-signed", message: "يلزم توقيع رئيس لجنة الجدول ثم رئيس القسم قبل الإرسال." };
  }
  if (needsHeadAcknowledgement(approval)) {
    /* العدُّ بصيغته العربية الصحيحة، من الأداة التي يستعملها النظام كله:
       «شعبة» و«شعبتان» و«خمس شعب» — لا «1 شعبة» و«2 شعبة». */
    return {
      ok: false, code: "pending-additions",
      message: `بانتظار موافقة رئيس القسم على ${countOf(pendingAdditionTotal(approval), oblique(AR.section))} أُضيفت بعد اعتماده.`,
    };
  }
  /* ── التعارضُ المادّي يمنع الإرسال كما يمنع التوقيع والقبول ─────────────
     كان يُفحص عند التوقيع وعند القبول، ولا يُفحص عند الإرسال: فجدولٌ نشأ فيه
     تعارضٌ بعد التوقيع يصل التسجيلَ ولا يملك التسجيلُ قبوله. فيُقال هنا، قبل
     أن يُرسل، لمن يملك إصلاحه. */
  if (Number(context.blockingConflicts || 0) > 0) {
    return {
      ok: false, code: "blocking-conflicts",
      message: `يوجد ${blockingConflictPhrase(Number(context.blockingConflicts))} يمنع الإرسال. عالِجه أولاً — التسجيل لا يقبل جدولاً فيه تعارض.`,
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

/* ── الموعد بتوقيت الكويت ─────────────────────────────────────────────────
 *
 * كان «اليوم» يُقرأ من الساعة العالمية: `new Date().toISOString().slice(0,10)`.
 * والكويت تسبقها بثلاث ساعات، فبين منتصف الليل والثالثة فجراً كان الخادم يعدّ
 * أمسِ يوماً قائماً — وموعدٌ انقضى عند منتصف الليل يبقى مفتوحاً ثلاث ساعات،
 * ويقول الشريط «آخر موعد اليوم» عن يومٍ مضى. فالموعدُ ينتهي في آخر ثانيةٍ من
 * يومه بتوقيت الكويت، ويُقرأ من هنا وحده خادماً وواجهة. */
export const KUWAIT_UTC_OFFSET_HOURS = 3;

/** تاريخ اليوم في الكويت، بصيغة YYYY-MM-DD. */
export function kuwaitDateISO(now: Date = new Date()): string {
  return new Date(now.getTime() + KUWAIT_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);
}

/** اللحظةُ التي ينتهي فيها يومُ الموعد: ٢٣:٥٩:٥٩ بتوقيت الكويت. */
export function deadlineEndsAt(dateISO: string): string {
  return `${dateISO.slice(0, 10)}T23:59:59+03:00`;
}

/** أمضى الموعد؟ بعد آخر ثانيةٍ من يومه في الكويت، لا قبلها. */
export function deadlinePassed(dateISO: string | undefined, now: Date = new Date()): boolean {
  if (!dateISO) return false;
  return now.getTime() > Date.parse(deadlineEndsAt(dateISO));
}

/**
 * الموعد كما يُقرأ في الشاشة.
 *
 * فصلٌ بلا موعد هو فصلٌ بلا قيد — وهذا حال كل فصلٍ سبق هذه الإضافة، فلا يجوز
 * أن يُقفل أثراً رجعياً. والتمديد يتقدّم على الموعد دائماً، حتى لو كان أقرب:
 * قرارُ رئيس التسجيل في قسمٍ بعينه أخصُّ من قراره في الفصل كله.
 */
export function readDeadline(
  input: { termDeadline?: string; extensionUntil?: string; extensionReason?: string },
  /** لحظةُ السؤال، أو تاريخٌ في الكويت بصيغة YYYY-MM-DD. */
  today: Date | string = new Date(),
): DeadlineState {
  const effective = input.extensionUntil || input.termDeadline;
  if (!effective) {
    return { termDeadline: input.termDeadline, extensionUntil: input.extensionUntil, past: false, tone: "none" };
  }
  const todayISO = typeof today === "string" ? today.slice(0, 10) : kuwaitDateISO(today);
  const daysLeft = daysBetween(todayISO, effective);
  /* يومٌ كاملٌ في الكويت يسبق «مضى»: بتاريخٍ مجرّد يُقارن اليومان، وبلحظةٍ
     تُقارن بنهاية يوم الموعد بتوقيت الكويت — وهما الحكم نفسه. */
  const past = typeof today === "string" ? daysLeft < 0 : deadlinePassed(effective, today);
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
    : `حذف ${action.deleting} من ${countOf(action.total, oblique(AR.appointment))} دفعةً واحدة`;
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


/* ══════════════════════════════════════════════════════════════════════════
   قواعدُ الدورة بعد تدقيق الأدوار الستّة
   ══════════════════════════════════════════════════════════════════════════
   كلُّ قاعدةٍ هنا كانت مكتوبةً مرّتين أو غيرَ مكتوبةٍ أصلاً. فصارت في موضعٍ
   واحد، يقرؤه الخادم والواجهة، ويُختبر مرّةً واحدة. */

/** رسالةُ الشاشة التي تغيّر ما تحتها بعد أن فُتحت. */
export const STALE_VIEW_MESSAGE = "تغيّر الجدول منذ فتحت الشاشة — حدّث";

/** نصُّ الإغلاق حين يُقبل الجدول وفيه ملاحظةٌ لم تُحسم. */
export const CLOSED_BY_ACCEPTANCE_LABEL = "أُغلقت بالقبول";

/** رسالةُ الفصل المنتهي لكل فعلٍ في الدورة. */
export const TERM_CLOSED_APPROVAL_MESSAGE =
  "انتهى هذا الفصل. دورةُ اعتماده مغلقة: لا توقيع ولا إرسال ولا قرار. ومن أراد فتحه يرفع علامة «منتهٍ» من شاشة الفصول.";

/* ── R4: ملاحظةُ التسجيل المفتوحة — عدٌّ واحد لكل من يعدّ ─────────────────
 *
 * كان يُعدّ في أربعة مواضع بثلاث قواعد: الإرجاعُ يعدّ ملاحظات الجولة الجارية
 * وحدها، فملاحظةٌ أصرّ عليها التسجيل من جولةٍ سابقة لا تُحسب ولا يُرجَع بها
 * الجدول؛ والواردُ وشريطُ القرار يعدّان ملاحظات القسم الداخلية معها، فيرى
 * الموظّف «ثلاث ملاحظات ستُرسل مع الإرجاع» واثنتان منها لرئيس القسم إلى لجنته.
 *
 * والقاعدة الواحدة: من التسجيل، وحالُها «تنتظر» — أيّاً كانت جولتُها. */
export function isOpenRegistrarNote(note: { origin?: string; state?: string }): boolean {
  return note.origin === "registrar" && note.state === "open";
}

export function countOpenRegistrarNotes(notes: ReadonlyArray<{ origin?: string; state?: string }>): number {
  return notes.filter(isOpenRegistrarNote).length;
}

/** ردودُ القسم على ملاحظات التسجيل التي تنتظر قرار التسجيل. */
export function countAnsweredRegistrarNotes(notes: ReadonlyArray<{ origin?: string; state?: string }>): number {
  return notes.filter(note => note.origin === "registrar" && note.state === "answered").length;
}

/* ── R1: سحبُ التوقيع ──────────────────────────────────────────────────── */

export type WithdrawVerdict =
  | { ok: true }
  | { ok: false; code: "locked" | "accepted" | "not-signed"; message: string };

export function canWithdraw(approval: ScheduleApproval, stage: "committee" | "head"): WithdrawVerdict {
  if (approval.status === "submitted") {
    return { ok: false, code: "locked", message: "الجدول عند التسجيل. لا يُسحب توقيعٌ بنى عليه الطرف الآخر عمله." };
  }
  /* بعد القبول صار التوقيعُ جزءاً من جدولٍ معتمد. وسحبُه كان يُسقط الجدول
     صامتاً إلى «قيد الإعداد» — فيختفي من عين العميد ولا يعرف التسجيل. */
  if (approval.status === "accepted") {
    return { ok: false, code: "accepted", message: "الجدول معتمدٌ من التسجيل. لا يُسحب توقيعٌ على جدولٍ معتمد؛ عدّل الجدول فتُفتح جولةُ تعديل." };
  }
  if (!signatureOf(approval, stage)) {
    return { ok: false, code: "not-signed", message: "لا يوجد توقيعٌ لك على هذا الجدول." };
  }
  return { ok: true };
}

/**
 * الحالة بعد تغيّر التواقيع.
 *
 * كالحالة بعد التوقيع، إلا أن جدولاً مُرجَعاً يبقى مُرجَعاً: سحبُ توقيعٍ أو
 * إعادتُه في جولةٍ مفتوحة لا يمحو أن التسجيل أرجعه وينتظر إعادته.
 */
export function statusAfterSignatureChange(approval: ScheduleApproval): ScheduleApprovalStatus {
  if (approval.status === "returned") return "returned";
  return statusAfterSignature(approval);
}

/* ── R6: القرار مشدودٌ إلى ما رآه صاحبه ─────────────────────────────────── */

export interface ViewExpectation {
  expectedRound?: number;
  expectedRowCount?: number;
  expectedStatus?: string;
}

/** يقرأ ما رآه الطرف من جسم الطلب. ما لم يُرسل لا يُفحص — توافقاً مع الواجهات القديمة. */
export function readViewExpectation(body: any): ViewExpectation {
  const num = (value: unknown) => value === undefined || value === null || value === "" || !Number.isFinite(Number(value)) ? undefined : Number(value);
  return {
    expectedRound: num(body?.expectedRound),
    expectedRowCount: num(body?.expectedRowCount),
    expectedStatus: typeof body?.expectedStatus === "string" && body.expectedStatus ? body.expectedStatus : undefined,
  };
}

export function staleViewRefusal(
  current: { round: number; rowCount?: number; status?: string },
  expected: ViewExpectation,
): string | null {
  if (expected.expectedRound !== undefined && expected.expectedRound !== Number(current.round)) return STALE_VIEW_MESSAGE;
  if (expected.expectedStatus !== undefined && current.status !== undefined && expected.expectedStatus !== current.status) return STALE_VIEW_MESSAGE;
  if (expected.expectedRowCount !== undefined && current.rowCount !== undefined && expected.expectedRowCount !== Number(current.rowCount)) return STALE_VIEW_MESSAGE;
  return null;
}

/* ── R8: بناءُ الجولة — من موضعٍ واحد لكل من يفتحها ───────────────────── */

export function openRound(
  approval: ScheduleApproval,
  input: {
    at: string; by: string;
    reviewedVersionId?: string;
    amendment?: boolean; baselineVersionId?: string;
    /** ما تحرّك في الجولة المنتهية، يُكتب عليها لحظةَ إغلاقها. */
    closingChangedRowCount?: number;
  },
): { rounds: ScheduleApprovalRound[]; currentRound: number } {
  const number = approval.currentRound + 1;
  const fresh: ScheduleApprovalRound = {
    number,
    submittedAt: input.at,
    submittedBy: input.by,
    ...(input.reviewedVersionId ? { reviewedVersionId: input.reviewedVersionId } : {}),
    ...(input.amendment ? { amendment: true } : {}),
    ...(input.baselineVersionId ? { baselineVersionId: input.baselineVersionId } : {}),
  };
  const rounds = [...approval.rounds
    .filter(round => round.number !== number)
    .map(round => round.number === approval.currentRound && input.closingChangedRowCount !== undefined
      ? { ...round, changedRowCount: input.closingChangedRowCount }
      : round), fresh].sort((a, b) => a.number - b.number);
  return { rounds, currentRound: number };
}

/**
 * جولةُ التعديل مفتوحةٌ للتعديل ما دام التسجيل لم يكتب فيها ملاحظة.
 *
 * كان أولُ تعديلٍ بعد القبول يفتح جولةً ويُقفل الجدول بعدها: فالتعديلُ الثاني
 * يُرفض، واستثناءُ الأسبوع يُرفض، وقرارُ طلب الأستاذ يُحفظ في الجدول ثم يُرفض
 * تسجيلُه فيضيع. والتعديلاتُ بعد القبول تأتي متتابعة — قاعةٌ ثم أستاذ ثم وقت —
 * فتتجمّع في الجولة نفسها حتى ينظر فيها التسجيل.
 */
export function amendmentStillOpen(approval: ScheduleApproval, registrarNotesInCurrentRound: number): boolean {
  if (approval.status !== "submitted") return false;
  return Boolean(currentRound(approval)?.amendment) && registrarNotesInCurrentRound <= 0;
}

/**
 * سببُ منع التعديل، أو `null`.
 *
 * القاعدة التي يقرؤها حارسُ الخادم وتقرؤها الشاشة قبل أن يمدّ أحدٌ يده.
 * `registrarLock: false` لما لا يقفله التسجيل أصلاً — استثناءُ أسبوعٍ، وقرارُ
 * طلب أستاذ، وإصدارُ روابط الطلبات — ويبقى عليه حكمُ الفصل المنتهي.
 */
export function approvalLockReason(
  approval: ScheduleApproval | undefined,
  context: { termClosed: boolean; isCommittee: boolean; registrarNotesInCurrentRound: number; registrarLock?: boolean },
): string | null {
  if (context.termClosed && !context.isCommittee) {
    return "انتهى هذا الفصل. جدولُه محفوظٌ للاطّلاع والتقارير، ولجنةُ الجدول وحدَها تعمل فيه.";
  }
  if (context.registrarLock === false || !approval) return null;
  if (approval.status === "submitted" && !amendmentStillOpen(approval, context.registrarNotesInCurrentRound)) {
    return "الجدول عند التسجيل الآن وينتظر قراره. التعديل يُفتح متى قُبل أو أُرجع بملاحظات.";
  }
  return null;
}

/* ── R9: أساسُ المقارنة — قاعدةٌ واحدة ─────────────────────────────────── */

/**
 * النسخة التي رآها التسجيل آخر مرّة قبل جولةٍ بعينها.
 *
 * كانت تُقرأ مرّتين: تقريرُ التغييرات يأخذ «ما رآه» وحده، وجدولُ العميد يأخذ
 * «ما قبِله» أولاً — فيفترقان حين يختلفان. والحكم واحد: جولةُ التعديل أساسُها
 * ما قُبل قبلها؛ وغيرُها أساسُها أحدثُ جولةٍ سابقةٍ نظر فيها التسجيل، وما قبِله
 * منها يتقدّم على ما رآه لأنه آخرُ ما نظر فيه.
 *
 * `acceptedOnly` لمن يريد آخرَ جدولٍ قُبل (العميد): تُقرأ الجولات المقبولة
 * وحدها، بالترتيب نفسه والتفضيل نفسه.
 */
export function roundBaselineVersionId(
  approval: Pick<ScheduleApproval, "rounds" | "currentRound">,
  round: number,
  options: { acceptedOnly?: boolean } = {},
): string | undefined {
  const target = approval.rounds.find(item => item.number === round);
  if (!options.acceptedOnly && target?.amendment && target.baselineVersionId) return target.baselineVersionId;
  const earlier = approval.rounds
    .filter(item => (options.acceptedOnly ? item.number <= round : item.number < round))
    .filter(item => !options.acceptedOnly || Boolean(item.acceptedAt))
    .sort((a, b) => b.number - a.number);
  for (const item of earlier) {
    const id = item.acceptedVersionId || item.reviewedVersionId || (options.acceptedOnly ? item.baselineVersionId : undefined);
    if (id) return id;
  }
  return undefined;
}

/**
 * نهايةُ جولةٍ منتهية: ما قُبل فيها أو ما رآه التسجيل فيها، وإلا أساسُ الجولة
 * التي بعدها. والجولةُ الجارية لا نهاية لها بعد — يُقارن بالجدول الحيّ.
 */
export function roundEndVersionId(approval: Pick<ScheduleApproval, "rounds" | "currentRound">, round: number): string | undefined {
  if (round >= approval.currentRound) return undefined;
  const target = approval.rounds.find(item => item.number === round);
  const next = approval.rounds.find(item => item.number === round + 1);
  return target?.acceptedVersionId
    || target?.reviewedVersionId
    || (next?.amendment ? next.baselineVersionId : undefined)
    || next?.reviewedVersionId
    || undefined;
}

/* ── R10: الإرجاع ─────────────────────────────────────────────────────── */

export type ReturnVerdict =
  | { ok: true; reopensAccepted: boolean }
  | { ok: false; code: "not-reviewable" | "no-notes"; message: string };

/**
 * أيجوز الإرجاع؟ من «عند التسجيل»، ومن «معتمد» أيضاً: التسجيلُ الذي يكتشف
 * خطأً بعد القبول كان لا يملك إلا الهاتف. فيُرجعه بملاحظةٍ واحدةٍ على الأقل،
 * في جولةٍ جديدة تبدأ من الجدول كما قُبل.
 */
export function canReturn(approval: ScheduleApproval, openRegistrarNotes: number): ReturnVerdict {
  if (approval.status !== "submitted" && approval.status !== "accepted") {
    return { ok: false, code: "not-reviewable", message: "هذا الجدول ليس عند التسجيل ولا معتمداً الآن." };
  }
  if (openRegistrarNotes <= 0) {
    return { ok: false, code: "no-notes", message: "لا يُرجَع جدولٌ بلا ملاحظة. اكتب ملاحظةً واحدةً على الأقل." };
  }
  return { ok: true, reopensAccepted: approval.status === "accepted" };
}

/* ── R11: رئيسُ القسم يُرجع للجنة ──────────────────────────────────────── */

export type HeadReturnVerdict = { ok: true } | { ok: false; code: "wrong-status" | "reason"; message: string };

export function canHeadReturn(approval: ScheduleApproval, reason: string): HeadReturnVerdict {
  if (!awaitsHeadSignature(approval)) {
    return { ok: false, code: "wrong-status", message: "الإرجاع للجنة يكون بعد توقيعها وقبل اعتمادك." };
  }
  if (String(reason || "").trim().length < 3) {
    return { ok: false, code: "reason", message: "اكتب سبب الإرجاع. اللجنة تحتاج أن تعرف ما تُصلح." };
  }
  return { ok: true };
}

/* ── R16/R17: التمديد وطلبُه ───────────────────────────────────────────── */

/** التمديدُ لا يكون قبل موعد الفصل: تمديدٌ يُقرّب الموعد ليس تمديداً. */
export function extensionRefusal(until: string, termDeadline?: string): string | null {
  if (!until) return null;
  if (termDeadline && until < termDeadline) {
    return `التمديد لا يسبق موعد الفصل (${termDeadline}). اختر تاريخاً بعده أو يساويه.`;
  }
  return null;
}

/** كم يوماً قبل الموعد يُعرض «طلب تمديد». */
export const EXTENSION_REQUEST_WINDOW_DAYS = 3;

export function canRequestExtension(deadline: Pick<DeadlineState, "effective" | "past" | "daysLeft">): boolean {
  if (!deadline.effective) return false;
  return deadline.past || (deadline.daysLeft !== undefined && deadline.daysLeft <= EXTENSION_REQUEST_WINDOW_DAYS);
}

/** الحالاتُ التي ما زال فيها تسليمٌ يُمدَّد: الجدولُ لم يصل التسجيلَ ولم يُعتمد. */
const EXTENSION_REQUEST_STATUSES = new Set(["drafting", "committee", "head", "returned"]);

/**
 * ── طلبُ التمديد: قاعدةٌ واحدة للزرّ وللخادم (مراجعة البروفة) ──────────────
 *
 * الشاشةُ تُظهر «طلب تمديد» لجدولٍ لم يُسلَّم ودنا موعدُه ولا طلبَ قبله. أمّا
 * الخادمُ فكان يقبل الطلبَ في كل حال: رئيسُ قسمٍ جدولُه معتمدٌ منذ أيام أرسل
 * طلباً قبل الموعد بثلاثة عشر يوماً، فوصل رئيسَ التسجيل «علوم الحاسب يطلب
 * تمديد موعد التسليم» عن جدولٍ لا تسليمَ فيه. فالسببُ يُقال من هنا، ويقرؤه
 * الزرُّ (`canRequestExtension` في قراءة الشريط) والمسارُ معاً.
 */
export function extensionRequestRefusal(
  approval: Pick<ScheduleApproval, "status" | "extensionRequest">,
  deadline: Pick<DeadlineState, "effective" | "past" | "daysLeft">,
): string | null {
  if (!deadline.effective) return "لا موعد تسليمٍ لهذا الفصل — لا شيء يُمدَّد.";
  if (approval.status === "accepted") return "الجدول معتمدٌ من التسجيل — لا تسليمَ يُمدَّد.";
  if (!EXTENSION_REQUEST_STATUSES.has(approval.status)) return "الجدول عند التسجيل الآن — لا تسليمَ يُمدَّد.";
  if (approval.extensionRequest) return "طلبُ التمديد السابق ما زال ينتظر رئيس التسجيل.";
  if (!canRequestExtension(deadline)) {
    return `يُطلب التمديد حين يبقى على الموعد ${countOf(EXTENSION_REQUEST_WINDOW_DAYS, AR.day)} أو أقل، أو بعد انقضائه.`;
  }
  return null;
}

/** التاريخُ الذي يُقترح لرئيس التسجيل: الموعدُ الساري أو اليوم، أيّهما أبعد، مضافاً إليه الأيام المطلوبة. */
export function suggestedExtensionDate(effective: string | undefined, days: number, todayISO: string): string {
  const base = effective && effective > todayISO ? effective : todayISO;
  const at = Date.UTC(Number(base.slice(0, 4)), Number(base.slice(5, 7)) - 1, Number(base.slice(8, 10))) + Math.max(1, Math.round(days)) * 86_400_000;
  return new Date(at).toISOString().slice(0, 10);
}

/* ── R18: سجلُّ الدورة ─────────────────────────────────────────────────── */

export const APPROVAL_EVENT_CAP = 200;

export function appendApprovalEvent(
  approval: ScheduleApproval,
  event: Omit<ScheduleApprovalEvent, "at" | "round"> & { at?: string; round?: number },
): ScheduleApproval {
  const entry: ScheduleApprovalEvent = {
    at: event.at || new Date().toISOString(),
    by: event.by,
    ...(event.role ? { role: event.role } : {}),
    action: event.action,
    round: event.round ?? approval.currentRound,
    ...(event.detail ? { detail: event.detail } : {}),
  };
  return { ...approval, events: [...(approval.events || []), entry].slice(-APPROVAL_EVENT_CAP) };
}

/** أسماءُ الأفعال كما تُقرأ في «السجلّ». */
export const APPROVAL_EVENT_LABEL: Record<string, string> = {
  sign: "توقيع", withdraw: "سحب توقيع", "acknowledge-additions": "إقرار شعب مضافة",
  submit: "إرسال إلى التسجيل", return: "إرجاع بملاحظات", accept: "قبول نهائي",
  "head-return": "إرجاع رئيس القسم للجنة", extension: "تمديد", "extension-request": "طلب تمديد", "extension-request-rejected": "رفض طلب التمديد",
  "amendment-open": "فتح جولة تعديل", "closed-term-edit": "تعديل في فصلٍ منتهٍ",
};

/* ── R19: الإصرارُ الثالث ──────────────────────────────────────────────── */

export const ESCALATE_AFTER_INSISTS = 3;

/** ما يُكتب على الملاحظة حين يُصرّ التسجيل: العدّ، ولحظةُ بلوغ الحدّ مرّةً واحدة. */
export function insistOutcome(note: { insistCount?: number; escalatedAt?: string }, at: string): { insistCount: number; escalatedAt?: string } {
  const insistCount = Number(note.insistCount || 0) + 1;
  const escalatedAt = note.escalatedAt || (insistCount >= ESCALATE_AFTER_INSISTS ? at : undefined);
  return { insistCount, ...(escalatedAt ? { escalatedAt } : {}) };
}
