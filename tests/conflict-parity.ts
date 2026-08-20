/**
 * ── برهان التكافؤ: الفهرسة لا تفوّت تعارضاً ─────────────────────────────────
 *
 * Conflict detection is the foundation of this product, so speeding it up is
 * only allowed if it answers identically. `findConflicts` now examines rows by
 * lookup instead of by sweeping every pair; `findConflictsExhaustive` is the
 * original sweep, kept for exactly this reason.
 *
 * This runs both over the shapes a real timetable takes — shared halls, shared
 * lecturers, combined deliveries, duplicates, tight turnarounds, cohort pairs,
 * rows with no room, rows with no lecturer, multi-day patterns, whole terms of
 * random placement — and fails on the FIRST difference of any kind: a missing
 * pair, an extra pair, a different reason, a different severity, a different
 * sentence, or the same findings in a different order.
 *
 * It is deliberately not a sample. A conflict that the fast path misses once in
 * ten thousand rows is worse than a slow schedule, so the comparison is exact
 * and total, and it runs in `npm run test` for good.
 */
import {
  findConflicts, findConflictsExhaustive, SCHEDULE_DAYS,
  type ConflictOptions,
} from "../src/utils/scheduleIntelligence";
import type { FSchedule } from "../src/types";

let checks = 0, failures = 0;
const fail = (what: string, detail: string) => {
  failures += 1;
  console.error(`\x1b[31m✗ ${what}\x1b[0m\n    ${detail}`);
};

const DAYS = SCHEDULE_DAYS.map(d => d.key as string);

/** A deterministic generator — the same corpus every run, so a failure repeats. */
let seed = 20260820;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length) % list.length];

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function makeRow(id: number, o: Partial<FSchedule> = {}): FSchedule {
  const start = 8 * 60 + Math.floor(rand() * 16) * 30;
  const row: any = {
    id, AdCollegeId: 1 + Math.floor(rand() * 3), AdSectionId: 1 + Math.floor(rand() * 6),
    AdTermId: 10, AdCourseId: 100 + Math.floor(rand() * 40),
    AdCourseName: "مقرر", SCode: String(1 + Math.floor(rand() * 8)).padStart(2, "0"),
    AdInstructorId: 1 + Math.floor(rand() * 25),
    fstarttime: clock(start), fendtime: clock(start + 50),
    AdRoomCode: "G" + Math.floor(rand() * 12), AdRoomHall: String(Math.floor(rand() * 30)),
  };
  for (const d of DAYS) row[d] = false;
  // One, two or three meeting days — the patterns this timetable really uses.
  const pattern = rand();
  if (pattern < 0.45) { row.fsunday = true; row.ftuesday = true; row.fthursday = true; }
  else if (pattern < 0.8) { row.fmonday = true; row.fwednesday = true; }
  else row[pick(DAYS)] = true;
  return Object.assign(row, o) as FSchedule;
}

const corpus = (n: number, o: Partial<FSchedule> = {}) =>
  Array.from({ length: n }, (_, i) => makeRow(i + 1, o));

const stable = (list: any[]) => JSON.stringify(list);

function compare(label: string, targets: FSchedule[], all: FSchedule[], options?: ConflictOptions) {
  checks += 1;
  const fast = findConflicts(targets, all, options);
  const slow = findConflictsExhaustive(targets, all, options);
  if (stable(fast) === stable(slow)) return;
  // Say exactly what differs, not merely that something does.
  const key = (c: any) => `${c.rowId}:${c.otherId}`;
  const fastKeys = new Set(fast.map(key)), slowKeys = new Set(slow.map(key));
  const missing = slow.filter(c => !fastKeys.has(key(c))).map(key);
  const extra = fast.filter(c => !slowKeys.has(key(c))).map(key);
  if (missing.length) fail(label, `تعارضات فاتت الفهرسة: ${missing.slice(0, 5).join(" · ")}`);
  else if (extra.length) fail(label, `تعارضات زائدة: ${extra.slice(0, 5).join(" · ")}`);
  else fail(label, `نفس الأزواج، لكن الترتيب أو التفاصيل مختلفة (${fast.length} تعارضاً)`);
}

// ── 1 · شبكة عشوائية واسعة، بأحجام تتدرج ─────────────────────────────────
for (const size of [1, 2, 5, 25, 120, 600]) {
  const rows = corpus(size);
  compare(`شبكة عشوائية · ${size} صفاً · الكل مقابل الكل`, rows, rows);
  compare(`شبكة عشوائية · ${size} صفاً · جزء مقابل الكل`, rows.slice(0, Math.ceil(size / 3)), rows);
}

// ── 2 · قاعة واحدة يتقاسمها الجميع: تعارض قاعات كثيف ──────────────────────
{
  const rows = corpus(60).map((r, i) => ({ ...r, AdRoomCode: "G1", AdRoomHall: "1", AdInstructorId: 100 + i }));
  compare("قاعة واحدة للجميع", rows, rows);
}

// ── 3 · أستاذ واحد يدرّس كل شيء: تعارض أساتذة كثيف ────────────────────────
{
  const rows = corpus(60).map((r, i) => ({ ...r, AdInstructorId: 7, AdRoomCode: "G" + i, AdRoomHall: String(i) }));
  compare("أستاذ واحد لكل المواعيد", rows, rows);
}

// ── 4 · مواعيد بلا قاعة وبلا أستاذ ────────────────────────────────────────
{
  const rows = corpus(40).map((r, i) =>
    i % 3 === 0 ? { ...r, AdRoomCode: "", AdRoomHall: "" }
      : i % 3 === 1 ? { ...r, AdInstructorId: 0 } : r);
  compare("صفوف بلا قاعة أو بلا أستاذ", rows, rows);
}

// ── 5 · التسليم المشترك: شعبتان، نفس كل شيء آخر ───────────────────────────
{
  const base = makeRow(1);
  const rows: FSchedule[] = [base, { ...base, id: 2, SCode: "99" }, ...corpus(30).map(r => ({ ...r, id: r.id + 100 }))];
  compare("تسليم مشترك (شعبتان بنفس الموضع)", rows, rows);
}

// ── 6 · المكرر التام: نفس المقرر ونفس الشعبة ونفس الموضع ──────────────────
{
  const base = makeRow(1);
  const rows: FSchedule[] = [base, { ...base, id: 2 }, ...corpus(20).map(r => ({ ...r, id: r.id + 100 }))];
  compare("موعدان متطابقان تماماً", rows, rows);
}

// ── 7 · مهلة الباب، عند كل قيمة حدّية ─────────────────────────────────────
for (const doorway of [0, 1, 5, 10, 15, 30, 60]) {
  const rows = corpus(70).map(r => ({ ...r, AdRoomCode: "G" + (r.id % 4), AdRoomHall: "1" }));
  compare(`مهلة الباب ${doorway} دقيقة`, rows, rows, { doorwayMinutes: doorway });
}

// ── 8 · الأفواج: مقررات مقترنة، بمقاسات مختلفة ────────────────────────────
for (const pairCount of [1, 6, 40]) {
  const rows = corpus(90);
  const pairs = new Set<string>();
  for (let i = 0; i < pairCount; i++) {
    const a = 100 + Math.floor(rand() * 40), b = 100 + Math.floor(rand() * 40);
    if (a !== b) pairs.add(`${Math.min(a, b)}|${Math.max(a, b)}`);
  }
  compare(`أفواج · ${pairs.size} اقتراناً`, rows, rows,
    { cohortPairs: pairs, cohortSize: () => 3 });
  compare(`أفواج + مهلة باب · ${pairs.size} اقتراناً`, rows, rows,
    { cohortPairs: pairs, cohortSize: () => 3, doorwayMinutes: 10 });
}

// ── 9 · فصول مختلطة: صفوف من فصل آخر يجب أن تُتجاهل ───────────────────────
{
  const mine = corpus(40);
  const otherTerm = corpus(60).map(r => ({ ...r, id: r.id + 500, AdTermId: 11 }));
  compare("فصلان في نفس المصفوفة", mine, [...mine, ...otherTerm]);
}

// ── 10 · الحالات الفارغة ──────────────────────────────────────────────────
compare("لا أهداف", [], corpus(30));
compare("لا كون", corpus(10), []);
compare("كلاهما فارغ", [], []);

console.log(`\n${failures ? "\x1b[31m" : "\x1b[32m"}برهان تكافؤ كشف التعارض: ${checks - failures}/${checks} حالة متطابقة تماماً\x1b[0m`);
if (failures) { console.error("الفهرسة لا تطابق المسح الشامل — لا تُعتمد."); process.exit(1); }
