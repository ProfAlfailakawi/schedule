/**
 * ── من الوارد إلى الورشة ────────────────────────────────────────────────────
 *
 * الأستاذ يطلب مقرّراً جديداً، والقاعةُ والشعبةُ ليستا من اختياره. فلا يمكن
 * تثبيتُ الإضافة من الوارد كما تُثبَّت نقلةُ موعدٍ قائم: هناك صفٌّ موجودٌ
 * يُعدَّل، وهنا صفٌّ يُخلق ويحتاج قرارين لم يقلهما أحد.
 *
 * وكان الوارد يقول «افتحها في الورشة» ويقف. وهو طريقٌ مسدود: المنسّقُ يقرأ
 * الطلب، ثم يفتح شاشةً أخرى، ثم يعيد كتابة ما قرأه للتوّ — المقرّر والأستاذ
 * والأيام والوقت — بيده، وكلُّ حرفٍ منها فرصةُ خطأ.
 *
 * هذا الملفّ يحمل ما قاله الأستاذُ فعلاً من الشاشة إلى الشاشة، ويترك ما لم
 * يقله فارغاً ينتظر قرار القسم.
 *
 * **ولماذا `sessionStorage` لا عنوانُ الصفحة؟** لأن هذا البرنامج لا يحمل
 * موجّهَ مساراتٍ يقبل معاملات، ولأن ما يُحمل هنا ليس عنواناً يُشارَك: رابطٌ
 * يحمل بذرةَ طلبٍ يُرسل ويُفتح بعد أسبوعٍ فيبني صفّاً من طلبٍ صار قديماً.
 * وهو يعيش في التبويب وحده، ويُمحى بأول قراءة.
 *
 * **ويُمحى بأول قراءة** عن قصد: بذرةٌ تبقى تُزرع في كل فتحةٍ للورشة تُنتج
 * نموذجاً مملوءاً بلا سبب، فيحفظه أحدٌ يوماً ظانّاً أنه فتحه بنفسه.
 */

export type HandoffDayKey = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";

export interface RequestHandoff {
  /** الطلبُ والبندُ، ليُعاد المنسّقُ إليهما بعد الحفظ. */
  requestId: string;
  itemIndex: number;
  instructorId: number;
  instructorName: string;
  courseId: number;
  collegeId: number;
  sectionId: number;
  termId: number;
  days: HandoffDayKey[];
  start: string;
  end: string;
}

const KEY = "schedule.requestHandoff";

/** يُخزَّن قبل الانتقال. الفشلُ صامتٌ: متصفّحٌ يمنع التخزين لا يمنع الانتقال. */
export function putHandoff(handoff: RequestHandoff): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(handoff)); }
  catch { /* تخزينٌ ممنوع: تُفتح الورشةُ فارغةً، وهو ما كان يحدث قبل هذا كلّه. */ }
}

/**
 * يُقرأ مرّةً واحدة، ويُمحى.
 *
 * ويُتحقَّق من شكله قبل تصديقه: ما في التخزين يكتبه من يملك التبويب، وقيمةٌ
 * مشوّهةٌ تصل النموذجَ أسوأُ من غيابها — لأنها تبدو قراراً اتُّخذ.
 */
export function takeHandoff(): RequestHandoff | null {
  let raw: string | null = null;
  try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); }
  catch { return null; }
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<RequestHandoff>;
    const days = Array.isArray(value.days)
      ? value.days.filter((day): day is HandoffDayKey =>
          ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"].includes(String(day)))
      : [];
    if (!value.requestId || !Number(value.courseId) || !Number(value.termId)) return null;
    if (!/^\d{1,2}:\d{2}$/.test(String(value.start || ""))) return null;
    return {
      requestId: String(value.requestId),
      itemIndex: Number(value.itemIndex) || 0,
      instructorId: Number(value.instructorId) || 0,
      instructorName: String(value.instructorName || ""),
      courseId: Number(value.courseId),
      collegeId: Number(value.collegeId) || 0,
      sectionId: Number(value.sectionId) || 0,
      termId: Number(value.termId),
      days,
      start: String(value.start),
      end: String(value.end || ""),
    };
  } catch { return null; }
}

/** جملةٌ واحدةٌ تقول للمنسّق من أين جاء هذا النموذج ولماذا هو نصفُ ممتلئ. */
export function handoffNotice(handoff: RequestHandoff): string {
  return `هذه إضافةٌ طلبها ${handoff.instructorName || "أستاذ"}. المقرّرُ والأيامُ والوقتُ من طلبه، والشعبةُ والقاعةُ قرارُك.`;
}
