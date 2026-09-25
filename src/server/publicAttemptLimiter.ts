/**
 * ── حدُّ التخمين على الأبواب العامة: يُعدّ الخطأ، لا الدخول ──────────────────
 *
 * الحدّ القديم كان يعدّ كلَّ طلب — عشرةٌ في عشر دقائق لكل رابطٍ وعنوان. فأستاذٌ
 * يفتح بطاقته، ويبدّل الفصل مرّتين، ويُبلغ عن محاضرتين، ويُحدّث الصفحة، يُردّ
 * بـ«محاولات كثيرة» وهو لم يُخطئ مرّة. والذي يستحقّ الحدَّ هو **التخمين**: رقمٌ
 * لا يطابق. فيُسأل الحدّ قبل البحث (`blocked`)، ولا يُسجَّل عليه إلا الفشل
 * (`fail`). والقيم قابلةٌ للضبط من البيئة، والافتراضيُّ عشرةُ أخطاءٍ في عشر دقائق.
 */
export interface AttemptLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  /** حدٌّ أعلى للذاكرة: خريطةٌ لا تكبر بلا نهاية تحت هجومٍ بعناوين كثيرة. */
  capacity?: number;
  now?: () => number;
}

export function limiterOptionsFromEnv(env: Record<string, string | undefined> = process.env): AttemptLimiterOptions {
  const max = Number(env.PUBLIC_ATTEMPT_MAX_FAILURES);
  const minutes = Number(env.PUBLIC_ATTEMPT_WINDOW_MINUTES);
  return {
    maxFailures: Number.isFinite(max) && max >= 1 ? Math.floor(max) : 10,
    windowMs: (Number.isFinite(minutes) && minutes > 0 ? minutes : 10) * 60 * 1000,
  };
}

export function createAttemptLimiter(options: AttemptLimiterOptions = {}) {
  const maxFailures = Math.max(1, Math.floor(options.maxFailures ?? 10));
  const windowMs = Math.max(1000, options.windowMs ?? 10 * 60 * 1000);
  const capacity = Math.max(100, options.capacity ?? 5000);
  const clock = options.now || Date.now;
  const failures = new Map<string, { count: number; first: number }>();

  const live = (key: string) => {
    const seen = failures.get(key);
    if (seen && clock() - seen.first > windowMs) { failures.delete(key); return undefined; }
    return seen;
  };

  return {
    maxFailures, windowMs,
    /** هل استنفد هذا المفتاحُ أخطاءه في النافذة؟ لا يسجّل شيئاً. */
    blocked(key: string): boolean {
      return (live(key)?.count || 0) >= maxFailures;
    },
    /** محاولةٌ فاشلة: رقمٌ لا يطابق. */
    fail(key: string): void {
      const seen = live(key);
      if (seen) { seen.count += 1; return; }
      if (failures.size >= capacity) failures.clear();
      failures.set(key, { count: 1, first: clock() });
    },
    /** للأبواب التي لم تنتقل بعد إلى عدّ الأخطاء: كلُّ طلبٍ يُعدّ. */
    consume(key: string): boolean {
      if (this.blocked(key)) return false;
      this.fail(key);
      return true;
    },
  };
}
