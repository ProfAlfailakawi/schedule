/**
 * ── بصمةُ جدول أستاذٍ واحد ────────────────────────────────────────────────────
 *
 * «من تغيّر جدولُه منذ أرسلنا له؟» و«ما الذي تغيّر منذ زيارتك الأخيرة؟» سؤالان
 * عن الشيء نفسه: هل صفوفُه الآن هي صفوفُه تلك اللحظة؟ فتُحفظ بصمةٌ لحظةَ
 * الإرسال ولحظةَ الزيارة، وتُقارن ببصمة الآن. البصمةُ لا تحمل شيئاً من الجدول
 * — لا يُقرأ منها موعدٌ ولا قاعة — وتتغيّر مع أيّ تغييرٍ يراه الأستاذ: موعد،
 * يوم، قاعة، مقرّر، شعبة، إضافة أو حذف.
 */
const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

export interface FingerprintRow {
  id?: number | string;
  AdCourseId?: number;
  SCode?: string;
  fstarttime?: string;
  fendtime?: string;
  AdRoomCode?: string;
  AdRoomHall?: string;
  [key: string]: unknown;
}

/** FNV-1a ذو ٣٢ بت — يكفي لكشف التغيّر، ويعمل في المتصفح والخادم بلا مكتبة. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function instructorScheduleFingerprint(rows: ReadonlyArray<FingerprintRow>): string {
  const lines = rows.map(row => [
    String(row.id ?? ""), String(row.AdCourseId ?? ""), String(row.SCode ?? "").trim(),
    DAY_KEYS.filter(key => Boolean(row[key])).join(","),
    String(row.fstarttime ?? ""), String(row.fendtime ?? ""),
    String(row.AdRoomCode ?? "").trim(), String(row.AdRoomHall ?? "").trim(),
  ].join("|")).sort();
  return `${rows.length}:${fnv1a(lines.join("\n"))}`;
}
