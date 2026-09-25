/**
 * ── حُكمُ النظام على ما يطلبه الأستاذ، قبل أن يُرسله ─────────────────────────
 *
 * القسم ينسخ الجدول من الفصل الماضي ثم يرسله، أو يرسل ثم ينسخ — والحالتان
 * تنتهيان إلى الشيء نفسه: أستاذٌ يفتح مسوّدةَ جدوله ويقول «أبقِه» أو «عدّله»
 * أو «احذفه» أو «أضف». وما كان يحدث بعدها أن الطلب يصل القسم نيّئاً، فيقضي
 * المنسّق أسبوعاً يكتشف واحداً واحداً أن هذا يخالف اللائحة وذاك يصطدم بقاعة
 * وثالثاً يتقاطع مع مقرّرٍ يشترك طلبتُه.
 *
 * هذا الملف يقول ذلك كلَّه لحظةَ الطلب، للأستاذ نفسه.
 *
 * **واللائحةُ هنا مُلزِمة، وهي في بقيّة النظام ليست كذلك.** التفريق مقصودٌ
 * وليس تناقضاً: القسمُ سلطةٌ تملك الاستثناء فتُعرض عليه المخالفةُ ولا يُوقَف،
 * والأستاذُ يطلب من القسم فلا يُعقل أن يَطلب ما لا يجوز ثم يُنتظر منه القسم أن
 * يرفضه. فما حكمُه في اللائحة `block` يمنع الإرسال، وما حكمُه `review` يمرّ
 * موسوماً «يحتاج استثناءً» ومعه سببٌ يكتبه الأستاذ.
 *
 * **ولا يُمنع صفٌّ لم يُمسّ.** الصفُّ الذي وضعه القسمُ بنفسه وأبقاه الأستاذ
 * كما هو لا يُحاسَب عليه الأستاذ مهما قالت اللائحة: مَن وضعه هو صاحبُ
 * الاستثناء فيه، ومنعُ الأستاذ من قبول جدولٍ كتبه القسم عبث.
 *
 * **والقاعة لا تصل الأستاذ.** القرارُ في القاعات للقسم آخرَ الأمر، فما يراه
 * الأستاذ كلمةٌ واحدة: الوقت متاحٌ أو غير متاح، ومعه أقربُ الأوقات حين لا
 * يكون. أما أيُّ قاعةٍ بعينها، ومن يشغلُها، فيبقى عند القسم — لأن عرضَه على
 * الأستاذ يجعله يختار، وهذا ما لم يُطلب.
 *
 * **ونهايةُ المحاضرة تُحسب ولا تُسأل.** الأستاذ يكتب «٨» ويختار يومه، والمدّةُ
 * تأتي من اليوم نفسه (٥٠ دقيقة أحدَ وثلاثاءَ وخميساً، و٨٠ اثنينَ وأربعاء)،
 * فلا يُسأل عن شيءٍ تعرفه اللائحة.
 *
 * **ولا شيء هنا يكتب.** كلُّ ما يُخرجه هذا الملف جملةٌ وحُكم. الكتابةُ في
 * الجدول تبقى حيث هي: زرٌّ يضغطه إنسانٌ في القسم، عبر مسار الحفظ نفسه.
 */

import type { AdCourse, AdInstructor, FSchedule } from "../types";
import { AR, countOf } from "./arabicCount";
import {
  DAY_KEYS, DAY_NAMES, DECISION_1912_LABEL, expectedMinutesForDay, isDecision1912Finding,
  requiredGapForDays, reviewSchedule, toMinutes,
  type DayKey, type RegulationFinding,
} from "./scheduleRegulations";
import { findConflicts, minutesToTime } from "./scheduleIntelligence";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "./scheduleTime";
import { roomIdentityKey } from "./locationRegistry";
import type { CourseNature } from "./courseNature";

/** ما يطلبه الأستاذ في صفٍّ واحد. */
export type RequestAction = "keep" | "change" | "delete" | "add";

/** اليومُ كما يُخزَّن في الصفّ. مُصدَّرٌ ليستعمله الخادمُ في التحقّق من المُرسَل. */
export type RequestDayKey = DayKey;

/** حُكمُ النظام: يمضي، أو يحتاج استثناءً، أو لا يجوز. */
export type RequestVerdictKind = "clear" | "exception" | "conflict";

/** من أين جاء السبب. الأول وحده يُنسب إلى قرار ١٩١٣/٢٠١٦. */
export type RequestReasonSource = "regulation" | "instructor" | "room" | "cohort" | "window" | "shape" | "load";

export interface RequestReason {
  source: RequestReasonSource;
  /** المادة حين يكون المصدر لائحةً، وإلا فارغة. */
  article?: string;
  /** جملةٌ واحدةٌ يقرؤها الأستاذ. لا تذكر اسمَ قاعةٍ ولا اسمَ زميل. */
  text: string;
  /** هل يمنع هذا السببُ الإرسال؟ */
  blocking: boolean;
}

/** موضعٌ مقترح: يومٌ وبداية، والنهايةُ محسوبة. */
export interface RequestSlot {
  day: DayKey;
  /** أيامُ المحاضرة كلُّها: البديلُ ينقلها بنمطها، فلا تصير محاضرةُ يومين محاضرةَ يوم. */
  days: DayKey[];
  dayLabel: string;
  start: string;
  end: string;
}

export interface RequestVerdict {
  kind: RequestVerdictKind;
  reasons: RequestReason[];
  /** هل يُقبل الإرسال؟ `conflict` وحده يمنع. */
  sendable: boolean;
  /** هل يلزم الأستاذَ سببُ استثناء؟ */
  needsExcuse: boolean;
  /**
   * ما يراه الأستاذ عن القاعة: كلمةٌ واحدة.
   *
   * `null` حين لا يُسأل عن قاعةٍ أصلاً (حذفٌ، أو صفٌّ لم يُمسّ).
   */
  roomAvailable: boolean | null;
  /**
   * القاعات المرشّحة — **للقسم وحده**. لا يمرّ هذا الحقل إلى صفحة الأستاذ.
   * مرتّبةٌ: قاعتُه الحالية أولاً إن كانت حرّة، ثم ما يشبهها.
   */
  roomCandidates: string[];
  /** أقربُ الأوقات المتاحة حين لا تتوفّر قاعة. ثلاثةٌ على الأكثر. */
  nearestTimes: RequestSlot[];
  /** النهاية كما حسبتها اللائحة من اليوم والبداية. */
  computedEnd: string;
  /** جملةٌ واحدةٌ تصف الحكم كله، جاهزةٌ للعرض. */
  headline: string;
}

/** الصفُّ كما يطلبه الأستاذ. لا قاعةَ فيه: القاعةُ ليست من اختياره. */
export interface RequestedRow {
  /** الصفُّ الأصلي حين يكون تعديلاً أو حذفاً، و`null` حين يكون إضافة. */
  rowId: number | null;
  /**
   * هويّةٌ مؤقّتةٌ للإضافة، سالبةٌ وفريدةٌ داخل الحزمة الواحدة.
   *
   * الإضافاتُ لا معرّف لها بعد، وكانت كلُّها تحمل `-1`. فإضافتان في حزمةٍ
   * واحدةٍ على الساعة نفسها كانتا صفّاً واحداً في نظر محرّك التعارض، فيتخطّى
   * المقارنةَ بينهما ويُجيز الاثنتين.
   */
  tempId?: number;
  action: RequestAction;
  AdCourseId: number;
  days: DayKey[];
  start: string;
}

export interface VerdictContext {
  /** الأستاذ صاحب الطلب. */
  instructorId: number;
  /** كلُّ صفوف الفصل — للقسم وما حوله، فالقاعة تُشغل من كلِّ مكان. */
  allRows: FSchedule[];
  /** صفوف هذا الأستاذ بعد تطبيق الطلب كله، لتُراجَع دفعةً واحدة. */
  instructorRowsAfter: FSchedule[];
  courses: Map<number, AdCourse>;
  instructors: Map<number, AdInstructor>;
  /** أزواجُ المقرّرات التي يشترك طلبتُها، من الاستبيان. */
  cohortPairs?: Set<string>;
  /** معرّفاتُ «هيئة تدريسية» وما شابهها: لا تُحسب حجزاً مزدوجاً لشخص. */
  placeholderInstructorIds?: Iterable<number>;
  /** القاعات المعروفة في هذا النطاق، بمفاتيح هويّتها. */
  knownRoomKeys?: string[];
  /** سُلّمُ البدايات الذي يدرّس به القسم فعلاً. حين يغيب لا تُقترح أوقات. */
  startLadder?: string[];
  nature?: Map<number, CourseNature> | null;
  previousRows?: FSchedule[];
  /** نافذة الطلبات: خارجَها لا يُقبل شيء. */
  windowOpen?: boolean;
  /**
   * نصابُ الأستاذ بالساعات المعتمدة.
   *
   * غيابُه ليس صفراً: أستاذٌ لا نصابَ مسجّلٌ له لا يُفرض عليه رقمٌ مخترع،
   * ويبقى القيدُ صامتاً كما كان قبل أن يوجد.
   */
  instructorLoad?: number | null;
}

const dayLabel = (day: DayKey) => DAY_NAMES[DAY_KEYS.indexOf(day)];

/**
 * النهاية من البداية واليوم.
 *
 * أيامٌ مختلطة (أحدٌ مع اثنين مثلاً) ليست لها مدّةٌ واحدة، واللائحةُ لا تعطيها
 * واحدة. تُؤخذ الأطول، ويُقال ذلك سبباً يستحقّ نظرةً — لا يُخترع رقمٌ وسط.
 */
export function endForRequest(days: DayKey[], start: string): string {
  if (!days.length || !start) return "";
  const minutes = Math.max(...days.map(expectedMinutesForDay));
  return minutesToTime(Math.min(SCHEDULE_DAY_END, toMinutes(start) + minutes));
}

/** يبني صفَّ جدولٍ من طلبٍ، ليُمرَّر إلى محرّكات الفحص الموجودة. */
export function rowFromRequest(request: RequestedRow, base: Partial<FSchedule>): FSchedule {
  const end = endForRequest(request.days, request.start);
  const row: any = {
    ...base,
    id: request.rowId ?? request.tempId ?? -1,
    AdCourseId: request.AdCourseId,
    fstarttime: request.start,
    fendtime: end,
  };
  for (const key of DAY_KEYS) row[key] = request.days.includes(key);
  return row as FSchedule;
}

/**
 * هل القاعة حرّةٌ في هذا الموضع؟
 *
 * يُقاس على مفتاح هويّة القاعة لا على نصّها، لأن «أ/١٠١» و«أ / 101» قاعةٌ
 * واحدة، والمقارنةُ بالنصّ كانت تُعلن حرّيةَ قاعةٍ مشغولة.
 *
 * ويُحترم الفاصلُ المقرَّر بين محاضرتين: قاعةٌ تنتهي محاضرتُها الساعةَ التاسعة
 * ليست حرّةً في التاسعة تماماً — بينهما عشرُ دقائق أو ربعُ ساعةٍ بحسب اليوم.
 */
function roomFree(roomKey: string, days: DayKey[], start: string, end: string, rows: FSchedule[], ignoreRowId: number | null): boolean {
  const gap = requiredGapForDays(days);
  const from = toMinutes(start), to = toMinutes(end);
  for (const row of rows) {
    if (ignoreRowId != null && Number(row.id) === ignoreRowId) continue;
    if (roomIdentityKey(row) !== roomKey) continue;
    if (!days.some(day => Boolean((row as any)[day]))) continue;
    const otherFrom = toMinutes(row.fstarttime), otherTo = toMinutes(row.fendtime);
    if (from < otherTo + gap && otherFrom < to + gap) return false;
  }
  return true;
}

/** هل الأستاذ نفسه مشغولٌ في هذا الموضع؟ يُقاس على صفوفه هو، لا على القاعة. */
function instructorFree(instructorId: number, days: DayKey[], start: string, end: string, rows: FSchedule[], ignoreRowId: number | null): boolean {
  const from = toMinutes(start), to = toMinutes(end);
  for (const row of rows) {
    if (ignoreRowId != null && Number(row.id) === ignoreRowId) continue;
    if (Number(row.AdInstructorId) !== instructorId) continue;
    if (!days.some(day => Boolean((row as any)[day]))) continue;
    if (from < toMinutes(row.fendtime) && toMinutes(row.fstarttime) < to) return false;
  }
  return true;
}

/**
 * أقربُ ثلاثة أوقاتٍ يتوفّر فيها كلُّ شيء.
 *
 * البدائل تأتي من سُلّم البدايات الذي يدرّس به القسم فعلاً — لا من ساعاتٍ
 * مخترعة. وحين لا يُعرف السُّلّم لا يُقترح شيء: اقتراحُ ساعةٍ لا يدرّس فيها
 * أحدٌ أسوأُ من الصمت، لأن أحداً سيعمل به.
 *
 * والبار المطلوب مطلق: لا قاعة مشغولة، ولا الأستاذ محجوز، ولا تقاطعَ مع
 * مقرّرٍ يشترك طلبتُه. موضعٌ يُصلح شيئاً ويكسر آخرَ ليس بديلاً.
 */
/** سُلّمُ اللائحة نفسُه: القصيرةُ كل ساعةٍ من الثامنة، والطويلةُ كل ساعةٍ ونصف.
 *  ليس اختراعاً — هو الشبكةُ التي تُبنى عليها الجداول أصلاً — ويُستعمل مع سُلّم
 *  القسم لا بدلاً منه، فلا يبقى الأستاذُ بلا بديلٍ حين تمتلئ بداياتُ قسمه. */
function regulationLadder(days: DayKey[]): string[] {
  const long = days.some(day => day === "fmonday" || day === "fwednesday");
  const short = days.some(day => day !== "fmonday" && day !== "fwednesday");
  if (long && !short) return ["08:00", "09:30", "11:00", "12:30", "14:00", "15:30", "17:00", "18:30"];
  return ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
}

function nearestFree(request: RequestedRow, context: VerdictContext, roomKeys: string[], week: FSchedule[], identity: number): RequestSlot[] {
  const learned = (context.startLadder || []).filter(Boolean);
  /* بلا سُلّمٍ معروفٍ للقسم لا يُقترح شيء. وحين يُعرف، يُكمَّل بشبكة اللائحة
     فلا ينفد البديلُ لأن بداياتِ القسم المعتادة امتلأت كلُّها. */
  if (!learned.length || !request.days.length) return [];
  const days = [...request.days];
  const current = toMinutes(request.start);
  const ladder = [...new Set([...learned, ...regulationLadder(days)])]
    .sort((a, b) => toMinutes(a) - toMinutes(b));
  const found: Array<RequestSlot & { distance: number }> = [];

  /* البديلُ ينقل المحاضرةَ بأيامها كلها إلى بدايةٍ واحدة: الأستاذُ طلب «الأحد
     والثلاثاء»، فلا يُعرض عليه «الأحد وحده» ثم تصير محاضرتُه يوماً واحداً
     بضغطةٍ لم يقصدها. */
  for (const start of ladder) {
    const minutes = toMinutes(start);
    if (minutes === current || minutes < SCHEDULE_DAY_START || minutes >= SCHEDULE_DAY_END) continue;
    const end = endForRequest(days, start);
    if (!end || toMinutes(end) > SCHEDULE_DAY_END) continue;
    if (!instructorFree(context.instructorId, days, start, end, week, identity)) continue;
    if (roomKeys.length && !roomKeys.some(roomKey => roomFree(roomKey, days, start, end, week, identity))) continue;
    if (cohortClash(request.AdCourseId, days, start, end, week, context.cohortPairs, identity)) continue;
    found.push({ day: days[0], days, dayLabel: days.map(dayLabel).join(" · "), start, end, distance: Math.abs(minutes - current) });
  }

  return found.sort((a, b) => a.distance - b.distance).slice(0, 3)
    .map(({ day, days: all, dayLabel: label, start, end }) => ({ day, days: all, dayLabel: label, start, end }));
}

/** هل يتقاطع هذا الموضع مع مقرّرٍ يشترك طلبتُه مع هذا المقرّر؟ */
function cohortClash(courseId: number, days: DayKey[], start: string, end: string, rows: FSchedule[], pairs: Set<string> | undefined, ignoreRowId: number | null): boolean {
  if (!pairs?.size) return false;
  const partners = new Set<number>();
  for (const entry of pairs) {
    const [a, b] = String(entry).split("|").map(Number);
    if (a === courseId && b) partners.add(b);
    if (b === courseId && a) partners.add(a);
  }
  if (!partners.size) return false;
  const from = toMinutes(start), to = toMinutes(end);
  for (const row of rows) {
    if (ignoreRowId != null && Number(row.id) === ignoreRowId) continue;
    if (!partners.has(Number(row.AdCourseId))) continue;
    if (!days.some(day => Boolean((row as any)[day]))) continue;
    if (from < toMinutes(row.fendtime) && toMinutes(row.fstarttime) < to) return true;
  }
  return false;
}


/**
 * نصابُ الأستاذ من صفوفه: مجموعُ الساعات المعتمدة لما يدرّسه.
 *
 * يُحسب بالساعات لا بالدقائق عن قصد. النصابُ في اللوائح ساعاتٌ معتمدة، ومحاولةُ
 * اشتقاقه من الدقائق تُنتج رقماً لا يطابق ما يكتبه القسمُ بيده: ثلاثُ ساعاتٍ
 * هي ١٥٠ دقيقةً على سُلّمٍ و١٦٠ على آخر، وكلاهما «ثلاث».
 *
 * والشعبةُ الواحدة تُعدّ مرّةً: مقرّرٌ له صفّان في جدولٍ واحدٍ بالشعبة نفسها
 * ساعاتُه ساعاتُه، لا ضعفُها.
 */
export function weeklyLoadOf(rows: FSchedule[], courses: Map<number, AdCourse>): number {
  const seen = new Set<string>();
  let hours = 0;
  for (const row of rows) {
    const courseId = Number(row.AdCourseId || 0);
    if (!courseId) continue;
    const key = `${courseId}|${String(row.SCode ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const course = courses.get(courseId);
    hours += Number(course?.CourseHours || course?.CourseCredit || 0);
  }
  return hours;
}

/**
 * الحكم.
 *
 * كلُّ فحصٍ هنا يستدعي محرّكاً موجوداً ولا يعيد كتابته: اللائحةُ من
 * `reviewSchedule`، والتعارضُ من `findConflicts`، والقاعةُ من سجلّ المواقع،
 * وسلّمُ البدايات من إيقاع القسم. ما يضيفه هذا الملف هو الترتيبُ والصياغة —
 * وأن يُقال كلُّ ذلك للأستاذ قبل أن يضغط إرسال، لا للقسم بعد أسبوع.
 */
export function judgeRequest(request: RequestedRow, context: VerdictContext): RequestVerdict {
  const reasons: RequestReason[] = [];
  const computedEnd = endForRequest(request.days, request.start);
  /* هويّةُ الصفّ: معرّفُه إن كان قائماً، وإلا هويّتُه المؤقّتة. تُستعمل لتخطّي
     الصفِّ نفسِه في كل فحص، فلا يتعارض مع ذاته حين يُنقل. */
  const identity = request.rowId ?? request.tempId ?? -1;

  /* ── الأسبوع الذي يُقاس عليه ───────────────────────────────────────────
   *
   * ليس أسبوعَ الفصل كما هو الآن: هو أسبوعُه بعد تطبيق الحزمة كلها على جدول
   * هذا الأستاذ. والفرقُ ليس تفصيلاً — حزمةٌ تنقل محاضرتين إلى الساعة نفسها
   * لا تصطدم إحداهما بالأخرى في الأسبوع القديم، لأن أيّاً منهما لم تكن هناك
   * بعد. فكانتا تمرّان كلتاهما «بلا تعارض»، ويكتشف القسمُ التصادمَ عند
   * التثبيت أو بعده.
   *
   * فتُستبدل صفوفُ هذا الأستاذ بصفوفه بعد الطلب، ويبقى ما لغيره كما هو —
   * لأن القاعةَ تُشغل من كل مكان، والزميلُ لم يطلب شيئاً.
   */
  const afterRows = context.instructorRowsAfter || [];
  const afterIds = new Set(afterRows.map(row => Number(row.id)));
  const week: FSchedule[] = [
    ...context.allRows.filter(row =>
      !afterIds.has(Number(row.id)) && Number(row.AdInstructorId) !== Number(context.instructorId)),
    ...afterRows,
  ];

  const verdictOf = (): RequestVerdict => {
    const blocking = reasons.some(reason => reason.blocking);
    const kind: RequestVerdictKind = blocking ? "conflict" : reasons.length ? "exception" : "clear";
    return {
      kind, reasons, sendable: !blocking, needsExcuse: kind === "exception",
      roomAvailable: null, roomCandidates: [], nearestTimes: [], computedEnd,
      headline: blocking
        ? reasons.find(reason => reason.blocking)!.text
        : reasons.length ? "يحتاج استثناءً من القسم" : "الوقت متاح",
    };
  };

  /* خارجَ النافذة لا يُقبل شيءٌ أصلاً، فلا معنى لفحص ما بعدها. */
  if (context.windowOpen === false) {
    reasons.push({ source: "window", text: "انتهت مدّة استقبال الطلبات لهذا الفصل.", blocking: true });
    return verdictOf();
  }

  /* الحذفُ لا يُفحص: إخلاءُ موضعٍ لا يصطدم بشيء، ولا قاعةَ يُسأل عنها. القرارُ
     فيه للقسم وحده، وهو ليس حكماً تقنياً. */
  if (request.action === "delete") return verdictOf();

  /* الصفُّ الذي أبقاه الأستاذ كما وضعه القسم ليس طلباً يُحاسَب عليه. */
  if (request.action === "keep") return verdictOf();

  if (!request.days.length) {
    reasons.push({ source: "shape", text: "اختر يوماً واحداً على الأقل.", blocking: true });
    return verdictOf();
  }
  /* الصيغةُ تُتحقَّق قبل القياس: `toMinutes` تقرأ ما ليس وقتاً صفراً، فـ«صباحاً»
     كانت تصير منتصفَ الليل وتمرّ بقيّةَ الفحوص كأنها موعدٌ صحيح. */
  if (!/^\d{1,2}:\d{2}$/.test(String(request.start || ""))) {
    reasons.push({ source: "shape", text: "اكتب وقت البداية بصيغة الساعة والدقيقة.", blocking: true });
    return verdictOf();
  }
  if (!computedEnd) {
    reasons.push({ source: "shape", text: "اكتب وقت البداية.", blocking: true });
    return verdictOf();
  }
  /* واليومُ الدراسيُّ له أوّلٌ كما له آخِر. الفحصُ كان يحرس آخِرَه وحده، فموعدٌ
     السابعةَ صباحاً يمرّ سليماً — ثم لا يجد البحثُ عن البدائل موضعاً له، لأن
     سُلّمَ البدايات يبدأ من الثامنة. حَدٌّ واحدٌ يُحرَس من طرفيه. */
  if (toMinutes(request.start) < SCHEDULE_DAY_START) {
    reasons.push({ source: "shape", text: "تبدأ المحاضرة قبل بداية اليوم الدراسي.", blocking: true });
    return verdictOf();
  }
  /* يُقاس على النهاية قبل الحدّ لا بعده: `endForRequest` تقصّ ما يتجاوز نهاية
     اليوم حتى لا تُخرج وقتاً لا وجود له، والقصُّ نفسُه يُخفي التجاوز عمّن
     يفحصه بعدها — فمحاضرةٌ تبدأ السابعةَ والنصف مساءً يومَ اثنين تنتهي على
     الورق الثامنةَ تماماً وتبدو سليمة. الطولُ غيرُ المقصوص هو الذي يُسأل. */
  const uncut = toMinutes(request.start) + Math.max(...request.days.map(expectedMinutesForDay));
  if (uncut > SCHEDULE_DAY_END) {
    reasons.push({ source: "shape", text: "تتجاوز المحاضرة نهاية اليوم الدراسي.", blocking: true });
    return verdictOf();
  }

  const short = request.days.filter(day => expectedMinutesForDay(day) === 50).length;
  const long = request.days.length - short;
  if (short && long) {
    reasons.push({
      source: "shape",
      article: DECISION_1912_LABEL,
      text: "أيام مختلطة: الأحد والثلاثاء والخميس مدّتها 50 دقيقة، والاثنين والأربعاء 80 دقيقة. راجع التوزيع.",
      blocking: false,
    });
  }

  /* ── اللائحة ──────────────────────────────────────────────────────────── */
  const findings = reviewSchedule({
    rows: context.instructorRowsAfter,
    courses: context.courses,
    instructors: context.instructors,
    previousRows: context.previousRows,
    nature: context.nature,
  }).filter(isDecision1912Finding);

  /* الملاحظةُ تُنسب إلى الصفّ المطلوب وحدَه، لا إلى كل صفٍّ يشاركه رقمَ
     المقرّر: أستاذٌ يدرّس شعبتين من مقرّرٍ واحد كانت ملاحظةٌ تخصّ شعبةً لم
     يمسّها تُعلَّق على الشعبة التي عدّلها، فيُطلب منه استثناءٌ عن غير ذنب. */
  const touched = new Set<number>([identity]);

  for (const finding of findings as RegulationFinding[]) {
    /* ملاحظةٌ لا تمسّ هذا الصفَّ ليست حكماً عليه: جدولُ الأستاذ يُراجَع كاملاً
       لأن قواعدَ اللائحة عن التتابع لا تُقاس على صفٍّ منفرد، لكن ما لا يذكره
       هذا الصفُّ لا يُعلَّق عليه هنا. */
    if (finding.rowIds.length && !finding.rowIds.some(id => touched.has(Number(id)))) continue;
    reasons.push({
      source: "regulation",
      article: finding.article,
      text: `${finding.title} — ${finding.article}`,
      blocking: finding.approvalEffect === "block",
    });
  }

  /* ── الأستاذ نفسه ─────────────────────────────────────────────────────── */
  const clashes = findConflicts(
    [rowFromRequest(request, afterRows.find(row => Number(row.id) === identity) || { AdInstructorId: context.instructorId })],
    week,
    { cohortPairs: context.cohortPairs, placeholderInstructorIds: context.placeholderInstructorIds },
  );
  if (clashes.some(clash => clash.reasons?.includes("instructor") || clash.type === "instructor")) {
    /* والمحاضرةُ المقابلة تُسمّى: هي محاضرتُه هو، يعرفها ولا يكشف اسمُها
       شيئاً عن غيره. و«لديك محاضرةٌ أخرى» وحدَها كانت تتركه يبحث عنها — وقد
       تكون في كليةٍ أخرى لا يراها حيث يعدّل. */
    const from = toMinutes(request.start), to = toMinutes(computedEnd);
    const mine = week.find(row => Number(row.id) !== identity
      && Number(row.AdInstructorId) === Number(context.instructorId)
      && request.days.some(day => Boolean((row as any)[day]))
      && from < toMinutes(row.fendtime) && toMinutes(row.fstarttime) < to);
    const mineName = mine ? String(context.courses.get(Number(mine.AdCourseId))?.CourseName || (mine as any).AdCourseName || "").trim() : "";
    const mineDay = mine ? request.days.find(day => Boolean((mine as any)[day])) : undefined;
    reasons.push({
      source: "instructor",
      text: mine && mineName
        ? `لديك محاضرةٌ أخرى في هذا الوقت: ${mineName} — ${mineDay ? dayLabel(mineDay) : ""} ${mine.fstarttime}–${mine.fendtime}.`
        : "لديك محاضرةٌ أخرى في هذا الوقت.",
      blocking: true,
    });
  }

  /* ── طلبةٌ مشتركون ────────────────────────────────────────────────────── */
  if (cohortClash(request.AdCourseId, request.days, request.start, computedEnd, week, context.cohortPairs, identity)) {
    /* لا يُسمّى المقرّرُ الآخر: الأستاذ لا يحتاج اسمه ليغيّر وقته، وتسميتُه
       تكشف جدولَ قسمٍ آخر لمن لا شأن له به. */
    reasons.push({ source: "cohort", text: "يتقاطع هذا الوقت مع مقرّرٍ يشترك فيه طلبتك.", blocking: true });
  }

  /* ── النصاب ───────────────────────────────────────────────────────────── */
  /* يُقاس على الإضافة وحدَها: نقلُ محاضرةٍ لا يغيّر ساعاتِ المقرّر، وحذفُها
     يُنقصها، والإبقاءُ لا يُحاسَب عليه أحد. فالإضافةُ هي ما يزيد النصاب.

     وغيابُ النصاب ليس صفراً: أستاذٌ لا نصابَ مسجّلٌ له لا يُمنع برقمٍ مخترع. */
  const declared = Number(context.instructorLoad || 0);
  if (request.action === "add" && declared > 0) {
    const after = weeklyLoadOf(afterRows, context.courses);
    if (after > declared) {
      reasons.push({
        source: "load",
        text: `يتجاوز هذا نصابك: ${countOf(after, AR.hour)} مقابل ${declared} مسجّلة.`,
        blocking: true,
      });
    }
  }

  /* ── القاعة ───────────────────────────────────────────────────────────── */
  const roomKeys = (context.knownRoomKeys || []).filter(Boolean);
  const candidates = roomKeys.filter(key => roomFree(key, request.days, request.start, computedEnd, week, identity));
  const roomAvailable = roomKeys.length ? candidates.length > 0 : null;
  if (roomAvailable === false) {
    reasons.push({ source: "room", text: "لا تتوفّر قاعةٌ في هذا الوقت.", blocking: true });
  }

  const verdict = verdictOf();
  verdict.roomAvailable = roomAvailable;
  verdict.roomCandidates = candidates;
  verdict.nearestTimes = verdict.sendable ? [] : nearestFree(request, context, roomKeys, week, identity);
  if (!verdict.sendable && verdict.nearestTimes.length) {
    verdict.headline = `${verdict.headline} أقربُ الأوقات المتاحة: ${verdict.nearestTimes.map(slot => `${slot.dayLabel} ${slot.start}`).join(" · ")}`;
  }
  return verdict;
}

/**
 * سطرٌ واحدٌ يصف حزمةَ طلبٍ كاملة، للقسم.
 *
 * يُقرأ قبل فتح أيّ بطاقة: «أربعةُ تعديلات · اثنان بلا تعارض · واحدٌ يحتاج
 * استثناءً · واحدٌ متعارض». والعددُ مع قاعدته دائماً، فلا يُقال «أربعة» دون أن
 * يُعرف من كم.
 */
export function describeRequest(verdicts: RequestVerdict[]): string {
  if (!verdicts.length) return "لا تعديلات — الجدول كما أرسله القسم";
  const clear = verdicts.filter(verdict => verdict.kind === "clear").length;
  const exception = verdicts.filter(verdict => verdict.kind === "exception").length;
  const conflict = verdicts.filter(verdict => verdict.kind === "conflict").length;
  const parts = [countOf(verdicts.length, AR.change)];
  if (clear) parts.push(`${clear} بلا تعارض`);
  if (exception) parts.push(`${exception} يحتاج استثناءً`);
  if (conflict) parts.push(`${conflict} متعارض`);
  return parts.join(" · ");
}

/**
 * ── «أُغلق الطلب» حين لا يبقى فيه ما ينتظر أحداً ─────────────────────────────
 *
 * كان القسمُ حين يقرّر آخرَ بندٍ في الطلب يُغلقه («settled») — ولو كان قرارُه
 * رفضاً مع بدائل. والطلبُ المغلق بابُه مغلق (`requestWindowOpen`)، فتظهر
 * البدائلُ للأستاذ «للاطلاع» ولا يملك أن يختار منها شيئاً: يعرض القسمُ عليه
 * خياراً لا يستطيع قبوله، ويعود الأمرُ إلى الهاتف.
 *
 * فالرفضُ مع بدائل لم يُختر منها بعدُ ينتظر الأستاذ، والطلبُ يبقى مفتوحاً له
 * حتى يختار — فإذا أرسل اختيارَه عاد إلى القسم («submitted») كأيّ إرسال.
 */
export function requestFullySettled(items: ReadonlyArray<{
  action: RequestAction;
  decision?: { state?: string; alternatives?: readonly unknown[] };
}>): boolean {
  return items.every(item => item.action === "keep"
    || item.decision?.state === "fixed"
    || (item.decision?.state === "rejected" && !(item.decision.alternatives || []).length));
}
