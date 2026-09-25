/**
 * ── محاولتا قرار الاعتماد، وما لا يُعاد بينهما ───────────────────────────────
 *
 * قرارُ الاعتماد يُعاد مرّةً واحدة إن سبقه قرارٌ آخر إلى الوثيقة (تعارض
 * المراجعة). فكلُّ ما يسبق الحفظ يُنفَّذ مرّتين — إلا ما مرّ بـ`once`: يُنفَّذ
 * في الأولى وتأخذ الثانيةُ نتيجته (التقاطُ نسخةٍ لا يتكرّر). وما لا يجوز أن
 * يقع إلا لقرارٍ حُفظ فعلاً يُكتب بعد الحفظ، لا هنا.
 */
export type ApprovalOnce = <T>(key: string, run: () => Promise<T>) => Promise<T>;

export async function runApprovalAttempts(
  task: (once: ApprovalOnce) => Promise<void>,
  options: { isConflict: (error: unknown) => boolean; canRetry: () => boolean; attempts?: number },
): Promise<"done" | "conflict"> {
  const done = new Map<string, Promise<unknown>>();
  const once: ApprovalOnce = <T,>(key: string, run: () => Promise<T>) => {
    if (!done.has(key)) done.set(key, run());
    return done.get(key) as Promise<T>;
  };
  const attempts = Math.max(1, options.attempts ?? 2);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await task(once); return "done"; }
    catch (error) {
      if (!options.isConflict(error) || !options.canRetry()) throw error;
    }
  }
  return "conflict";
}
