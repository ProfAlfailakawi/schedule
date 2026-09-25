/**
 * ── ذاكرةُ الجرس: كشفُ الطلبة يُجمع مرّةً لكل فصل، لا مع كل نداء ─────────────
 *
 * الجرس يُسأل كل دقيقة من كل شاشةٍ مفتوحة، ومع كل نبضة «notify». وكان كلُّ
 * نداءٍ يقرأ طلبات الطلبة لفصلٍ كامل — للجاري ولفصل التخطيط — بلا سقف، وكل
 * قرارٍ على الكشف يبثّ نبضةً توقظ الشاشات كلها فتقرأ الفصل من جديد.
 *
 * فصار المجموعُ (لكل قسمٍ: كم ينتظر اللجنة، وكم ينتظر التسجيل) يُحفظ لكل فصل
 * دقيقةً، ويُمحى حين يُكتب الكشف أو يصل استبيانٌ أو يأتي نبضُ نسخةٍ أخرى.
 * والفصلُ الذي لا طلبات فيه يُحفظ مجموعُه الفارغ كذلك: فلا يُسأل عنه ثانيةً
 * إلا بعد انقضاء الدقيقة أو وصول استبيان.
 */

export interface StudentQueueEntry {
  pendingCommittee: number;
  awaitingRegistration: number;
  oldestPendingAt?: string;
  latestApprovedAt?: string;
}

/** المجموع لكل قسمٍ مالكٍ للمقرّر (`كلية:قسم`). دالّةٌ نقيّة: لا قراءة فيها. */
export function studentQueueAggregate(
  needs: Array<{ AdCollegeId: number; courseIds?: number[]; courseStates?: Array<{ courseId: number; state?: string; at?: string }>; createdAt?: string }>,
  courses: Array<{ AdCourseId: number; AdSectionId?: number }>,
): Map<string, StudentQueueEntry> {
  const ownerOf = new Map(courses.map(row => [Number(row.AdCourseId), Number(row.AdSectionId || 0)]));
  const out = new Map<string, StudentQueueEntry>();
  for (const need of needs) {
    const states = new Map((need.courseStates || []).map(state => [Number(state.courseId), state]));
    for (const id of need.courseIds || []) {
      const owner = ownerOf.get(Number(id)) || 0;
      if (!owner) continue;
      const key = `${Number(need.AdCollegeId)}:${owner}`;
      const entry = out.get(key) || { pendingCommittee: 0, awaitingRegistration: 0 };
      const state = states.get(Number(id));
      if (!state) {
        entry.pendingCommittee += 1;
        const at = String(need.createdAt || "");
        if (at && (!entry.oldestPendingAt || at < entry.oldestPendingAt)) entry.oldestPendingAt = at;
      } else if (state.state === "awaiting-registration") {
        entry.awaitingRegistration += 1;
        if (!entry.latestApprovedAt || String(state.at || "") > entry.latestApprovedAt) entry.latestApprovedAt = String(state.at || "");
      }
      out.set(key, entry);
    }
  }
  return out;
}

/**
 * ذاكرةٌ بمفتاحٍ ومدّة. الطلباتُ المتزامنة على مفتاحٍ واحد تنتظر القراءةَ نفسها،
 * والقراءةُ الفاشلة لا تُحفظ. و`invalidate` يمحو ما حُفظ وما هو قيد القراءة:
 * فقراءةٌ بدأت قبل الكتابة لا تُحفظ بعدها.
 */
export function createTtlMemo<T>(options: { ttlMs?: number; now?: () => number } = {}) {
  const ttlMs = Math.max(1, options.ttlMs ?? 60_000);
  const clock = options.now || Date.now;
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  let generation = 0;
  return {
    get(key: string, load: () => Promise<T>): Promise<T> {
      const seen = entries.get(key);
      if (seen && clock() - seen.at < ttlMs) return seen.value;
      const born = generation;
      const value = load();
      entries.set(key, { at: clock(), value });
      value.then(
        () => { if (born !== generation && entries.get(key)?.value === value) entries.delete(key); },
        () => { if (entries.get(key)?.value === value) entries.delete(key); },
      );
      return value;
    },
    invalidate(): void { generation += 1; entries.clear(); },
    size(): number { return entries.size; },
  };
}

/**
 * نبضةٌ مجمّعة: أوّلُ نداءٍ يضبط موعداً بعد `delayMs`، وما جاء قبله يلحق به.
 * لجنةٌ تقرّر عشرين مقرّراً متتالية لا توقظ الشاشات عشرين مرّة، ولا تؤجَّل
 * النبضةُ بلا نهاية تحت كتابةٍ متواصلة: أقصى تأخيرٍ `delayMs`.
 */
export function createCoalescer(delayMs: number, fire: () => void, timers: {
  set: (fn: () => void, ms: number) => unknown;
} = { set: (fn, ms) => setTimeout(fn, ms) }) {
  let handle: unknown = null;
  return () => {
    if (handle !== null) return;
    handle = timers.set(() => { handle = null; fire(); }, delayMs);
  };
}
