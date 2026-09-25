/**
 * ── «مانع الاعتماد» — قاعدةٌ واحدة، وكلُّ مدخلٍ يقول الرقمَ نفسه ──────────
 *
 * Behaviour: «هيئة تدريسية» never blocks as a person anywhere; an exact
 * duplicate blocks everywhere; a clash with another department counts in
 * both; a legacy hall alias is the same hall once normalised; and every entry
 * point — the count, the detailed list, the analysis alert, the live board
 * scan — returns the same number.
 *
 * Structure: the blocking predicate is written exactly once
 * (`isBlockingConflict`), and every raw `findConflicts(` left in server.ts is
 * on an explicit allow-list with the reason it is not a blocking decision.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approvalBlockerCount, approvalBlockers, blockingConflictDetails, blockingConflicts,
  isBlockingConflict, placeholderInstructorIds,
} from "../src/utils/scheduleBlockers";
import { analyzeSchedule, fastConflictScan, outsideScopeClashes } from "../src/utils/scheduleIntelligence";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const row = (id: number, section: number, course: number, instructor: number, hall: string, extra: Record<string, unknown> = {}) => ({
  id, AdCollegeId: 2, AdSectionId: section, AdTermId: 1, AdCourseId: course, SCode: String(id),
  AdInstructorId: instructor, fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
  fstarttime: "08:00", fendtime: "08:50", AdRoomCode: "B", AdRoomHall: hall, roomId: `room-${hall}`, buildingId: "B",
  locationStatus: "VERIFIED", AdCourseName: `مقرر ${course}`, ...extra,
}) as any;

const PLACEHOLDER = 900;
const instructors = [
  { AdInstructorId: PLACEHOLDER, AdInstructorName: "هيئة تدريسية" },
  { AdInstructorId: 901, AdInstructorName: "هيئة التدريس" },
  { AdInstructorId: 7, AdInstructorName: "د. أستاذ أول" },
  { AdInstructorId: 8, AdInstructorName: "د. أستاذ ثان" },
] as any[];
const placeholders = placeholderInstructorIds(instructors);
check(placeholders.has(PLACEHOLDER) && placeholders.has(901) && !placeholders.has(7), "«هيئة…» تُعرف بصدر اسمها، والأشخاص لا");

/* Every entry point, for one scope, from one options object. */
const everyCount = (scope: any[], term: any[], options: any = {}) => {
  const opts = { placeholderInstructorIds: placeholders, ...options };
  const normalize = opts.normalizeRow || ((r: any) => r);
  const analysis = analyzeSchedule(scope, term, [], instructors, opts);
  const scopeIds = new Set(scope.map(r => r.id));
  const inside = scope.map(normalize);
  const scan = fastConflictScan(inside, { placeholderInstructorIds: placeholders });
  const outside = outsideScopeClashes(inside, term.map(normalize), { placeholderInstructorIds: placeholders });
  return {
    count: approvalBlockerCount(scope, term, opts),
    list: approvalBlockers(scope, term, opts).length,
    legacy: blockingConflictDetails(scope, term, new Map(), new Map(), opts).length,
    raw: blockingConflicts(scope, term, opts).length,
    analysis: analysis.metrics.criticalConflicts,
    alert: analysis.alerts.some((a: any) => /اعتماد/.test(a.title)),
    /* The board sees the scope; the server adds what lies outside it. */
    board: scan.pairs + outside.filter(o => !scopeIds.has(o.otherId)).length,
  };
};
const allEqual = (c: ReturnType<typeof everyCount>, n: number) =>
  c.count === n && c.list === n && c.legacy === n && c.raw === n && c.analysis === n && c.board === n && c.alert === (n > 0);

/* 1. «هيئة تدريسية» in two halls at one hour — two departments used it. */
{
  const scope = [row(1, 3, 100, PLACEHOLDER, "101"), row(2, 3, 101, PLACEHOLDER, "102")];
  const other = [row(40, 4, 400, PLACEHOLDER, "103"), row(41, 4, 401, 901, "104")];
  const c = everyCount(scope, [...scope, ...other]);
  check(allEqual(c, 0), `«هيئة تدريسية» لا تمنع في أي مدخل (${JSON.stringify(c)})`);
  /* …but the hall is still a hall. */
  const shared = [row(1, 3, 100, PLACEHOLDER, "101"), row(2, 3, 101, PLACEHOLDER, "101")];
  check(allEqual(everyCount(shared, shared), 1), "والقاعة المشتركة تبقى مانعاً ولو كان الاسم «هيئة تدريسية»");
}

/* 2. An exact duplicate: same course, same section, same placement, different doctors and halls. */
{
  const scope = [row(1, 3, 100, 7, "101", { SCode: "01" }), row(2, 3, 100, 8, "102", { SCode: "01" })];
  const c = everyCount(scope, scope);
  check(allEqual(c, 1), `الموعد المكرّر مانعٌ في كل مدخل — والتحليل لم يعد يتجاهله (${JSON.stringify(c)})`);
}

/* 3. An instructor clash with another department counts in both departments. */
{
  const mine = [row(1, 3, 100, 7, "101")];
  const theirs = [row(40, 4, 400, 7, "401")];
  const term = [...mine, ...theirs];
  check(allEqual(everyCount(mine, term), 1), "تعارض الأستاذ مع قسمٍ آخر يُحسب في هذا القسم");
  check(allEqual(everyCount(theirs, term), 1), "ويُحسب في القسم الآخر أيضاً");
  const described = approvalBlockers(mine, term, { placeholderInstructorIds: placeholders, courseName: new Map([[400, "مقرر سري"]]) });
  check(described.length === 1 && described[0].title.includes("خارج هذا القسم") && !JSON.stringify(described).includes("مقرر سري") && described[0].rowIds.join() === "1",
    "ويوصف عامّاً «مع موعدٍ خارج هذا القسم» بلا شيءٍ من القسم الآخر");
}

/* 4. A legacy hall alias is the same hall once the gate's normalisation runs. */
{
  const scope = [row(1, 3, 100, 7, "205"), row(2, 3, 101, 8, "205-قديم", { roomId: undefined })];
  const normalizeRow = (r: any) => r.AdRoomHall === "205-قديم" ? { ...r, AdRoomHall: "205", roomId: "room-205" } : r;
  check(approvalBlockerCount(scope, scope, { placeholderInstructorIds: placeholders }) === 0, "بلا تطبيع: الاسمان قاعتان (هذا ما تصلحه البوابة)");
  check(allEqual(everyCount(scope, scope, { normalizeRow }), 1), "بتطبيع البوابة: القاعة واحدة، والعدد واحد في كل مدخل");
}

/* 5. One pair with several reasons is one blocker; soft advice never blocks. */
{
  const scope = [row(1, 3, 100, 7, "101", { SCode: "01" }), row(2, 3, 100, 7, "101", { SCode: "01" })];
  check(allEqual(everyCount(scope, scope), 1), "زوجٌ بثلاثة أسباب مانعٌ واحد");
  check(!isBlockingConflict({ severity: "high", soft: true }) && !isBlockingConflict({ type: "doorway", severity: "low" })
    && isBlockingConflict({ type: "duplicate", severity: "medium" }) && isBlockingConflict({ type: "room", severity: "high" }),
    "المحمول «soft» والفاصل القصير لا يمنعان؛ المكرّر والقاعة يمنعان");
}

/* ── STRUCTURAL ─────────────────────────────────────────────────────────── */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
});
const sources = [join(ROOT, "server.ts"), ...walk(join(ROOT, "src"))];
const PREDICATE = /severity\s*===?\s*["']high["']\s*\|\|\s*[\w?.]*type\s*===?\s*["']duplicate["']|severity\s*!==?\s*["']high["']\s*&&\s*[\w?.]*type\s*!==?\s*["']duplicate["']/g;
const copies = sources.flatMap(path => {
  const text = readFileSync(path, "utf8");
  return (text.match(PREDICATE) || []).map(() => path.replace(ROOT + "/", ""));
});
check(copies.length === 1 && copies[0] === "src/utils/scheduleIntelligence.ts",
  `شرط المانع مكتوبٌ مرةً واحدة فقط — isBlockingConflict (${copies.join(", ")})`);

const server = readFileSync(join(ROOT, "server.ts"), "utf8");
/* Every raw sweep left in the server, and why it is not a blocking decision. */
const ALLOWED_RAW: Array<[string, string]> = [
  ["const raw=findConflicts([candidateCanonical]", "save gate: the full reading of one candidate incl. soft advice; already canonicalised and placeholder-exempt; callers decide with isBlockingConflict"],
  ["const externalConflicts=findConflicts([selected]", "row explanation panel: lists every finding (advice too), placeholder-exempt; decides nothing"],
  ["const conflicts=findConflicts([r],v.rows).length", "timeline of past versions: a historical reading, not an approval decision"],
  ["conflicts:findConflicts([selected],await Repository", "timeline 'current' point: same historical reading"],
];
const rawCalls = (server.match(/findConflicts\(/g) || []).length;
check(rawCalls === ALLOWED_RAW.length && ALLOWED_RAW.every(([snippet]) => server.includes(snippet)),
  `كل findConflicts( خامٍ في الخادم على القائمة المسموحة (${rawCalls}/${ALLOWED_RAW.length})`);
const oracleCalls = server.split("\n").filter(line => /\b(blockingConflicts|countBlockingConflicts|approvalBlockerCount)\(/.test(line) && !/function /.test(line));
check(oracleCalls.length >= 10 && oracleCalls.every(line => /Options|placeholderIds|moveOpts|options/.test(line)),
  `كل نداءٍ للقاعدة في الخادم يمرّر خيارات البوابة (${oracleCalls.length})`);
check(/outsideScopeClashes\(scopeRows as any,termRows as any,\s*\{placeholderInstructorIds:/.test(server), "حلقات اللوحة تستثني «هيئة تدريسية» كذلك");
check(server.includes("return approvalBlockerCount(scopeRows, termRows, options);"), "countBlockingConflicts اسمٌ قديمٌ للقاعدة نفسها لا نسخةٌ منها");
check(!/function placeholderInstructorIds[\s\S]{0,200}instructorIdentityTokens\("هيئة"\)/.test(server), "قراءة «هيئة» ليست مكتوبةً في الخادم مرةً ثانية");
const intelligence = readFileSync(join(ROOT, "src/utils/scheduleIntelligence.ts"), "utf8");
check(intelligence.includes("const critical=conflicts.filter(isBlockingConflict).length;"), "تنبيه «مانع اعتماد» في التحليل يعدّ بالشرط نفسه");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
