/**
 * ── «هيئة تدريسية» ليست شخصاً ────────────────────────────────────────────────
 *
 * سجلٌّ اسمه هذا معنى تتشاركه الجامعة: يُكتب حين لا يكون للشعبة مدرّسٌ ثابت.
 * فلا يُقاس عليه الحجز المزدوج (القاعدة المستقرّة، commit 98cd373)، ولا يدخل
 * ميزانَ العدالة كأنه أستاذٌ يحمل عشرين شعبة. وكلمة «هيئة» لا يُسمّى بها
 * الناس، فصدرُ الاسم وحده يعرّف السجل مهما كتبت بقيته.
 *
 * القاعدة هنا وحدها؛ الخادم والواجهة ومحرّك العدالة يسألونها.
 */
import { instructorIdentityTokens } from "./instructorIdentity";

export function placeholderInstructorIdsOf(instructors: ReadonlyArray<{ AdInstructorId?: unknown; AdInstructorName?: unknown }>): Set<number> {
  const head = instructorIdentityTokens("هيئة")[0];
  const ids = new Set<number>();
  for (const person of instructors || []) {
    const tokens = instructorIdentityTokens(String(person?.AdInstructorName || ""));
    const id = Number(person?.AdInstructorId || 0);
    if (id > 0 && tokens[0] === head) ids.add(id);
  }
  return ids;
}
