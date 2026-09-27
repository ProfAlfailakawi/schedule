/**
 * ── «مانع الاعتماد» — قاعدةٌ واحدة، وكلُّ مدخلٍ يقول الرقمَ نفسه ──────────
 *
 * Behaviour: «هيئة تدريسية» never blocks as a person anywhere; an
 * indistinguishable double entry blocks everywhere, while the same section in
 * two halls or with two teachers is a warning everywhere (قاعدة المالك
 * 2026-09-27: «التوقيع لا يمنعه إلا تعارض ماديّ»); a clash with another department counts in
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
  approvalBlockerCount, approvalBlockers, approvalWarnings, blockingConflictDetails, blockingConflicts,
  isBlockingConflict, placeholderInstructorIds, rowClashReasons,
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
  const inside: any[] = scope.map(normalize);
  const scan = fastConflictScan(inside, { placeholderInstructorIds: placeholders });
  const outside = outsideScopeClashes(inside, term.map(normalize) as any[], { placeholderInstructorIds: placeholders });
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

/* 2. قاعدة المالك 2026-09-27: «التوقيع لا يمنعه إلا تعارض ماديّ».
      The owner's department (أصول التربية 114101, شعبة 20, Mon+Wed 14:00–15:20) had the same section in G28 with one
      doctor and in G31 with another: no person and no hall booked twice. Every entry point says 0 blockers — and the
      pair is still SAID, as a warning, in the review and on both rows. */
{
  const scope = [row(1, 3, 100, 7, "G28", { SCode: "20" }), row(2, 3, 100, 8, "G31", { SCode: "20" })];
  const c = everyCount(scope, scope);
  check(allEqual(c, 0), `الشعبة نفسها في قاعتين بأستاذين ليست تعارضاً ماديّاً — لا تمنع في أي مدخل (${JSON.stringify(c)})`);
  const warnings = approvalWarnings(scope, scope, { placeholderInstructorIds: placeholders });
  check(warnings.length === 1 && /G28/.test(warnings[0].detail) && /G31/.test(warnings[0].detail) && warnings[0].rowIds.join() === "1,2",
    "…لكنها لا تُسكَت: بندٌ للمراجعة باسم القاعتين");
  const scan = fastConflictScan(scope, { placeholderInstructorIds: placeholders });
  check(scan.ids.size === 0 && scan.warningIds.has(1) && scan.warningIds.has(2) && scan.sectionTwicePairs === 1, "واللوحة تُعلّمها تنبيهاً لا حلقةَ منع");
  const lookup = { row: (id: number) => scope.find(item => item.id === id), course: (item: any) => String(item?.AdCourseName || "") };
  const said = rowClashReasons(scope[0], scan.notes.get(1), lookup);
  check(said.length === 1 && said[0].tone === "warn" && /لا يمنع/.test(said[0].text) && /G28 و G31/.test(said[0].text), `والصفّ يقول سببه ظاهراً (${JSON.stringify(said)})`);
  /* Two real teachers in one hall: the hall is booked twice — physical, blocking. */
  const oneHall = [row(1, 3, 100, 7, "G28", { SCode: "20" }), row(2, 3, 100, 8, "G28", { SCode: "20" })];
  check(allEqual(everyCount(oneHall, oneHall), 1), "والقاعة الواحدة لأستاذين تعارضٌ ماديّ يمنع");
}
/* 2b. The indistinguishable double entry — nothing tells the two rows apart — would publish one lecture twice. */
{
  const scope = [row(1, 3, 100, PLACEHOLDER, "", { SCode: "20", roomId: undefined, AdRoomCode: "", buildingId: undefined }),
    row(2, 3, 100, PLACEHOLDER, "", { SCode: "20", roomId: undefined, AdRoomCode: "", buildingId: undefined })];
  const c = everyCount(scope, scope);
  check(allEqual(c, 1), `الإدخال المكرّر الذي لا يميّزه شيء مانعٌ في كل مدخل (${JSON.stringify(c)})`);
  const scan = fastConflictScan(scope, { placeholderInstructorIds: placeholders });
  const lookup = { row: (id: number) => scope.find(item => item.id === id), course: (item: any) => String(item?.AdCourseName || "") };
  const said = rowClashReasons(scope[0], scan.notes.get(1), lookup);
  check(said.length === 1 && said[0].tone === "block" && /يمنع التوقيع: موعد مكرّر/.test(said[0].text), "والصفّ يقول: موعد مكرّر يمنع التوقيع");
}

/* 2c. Independent review, 2026-09-27: a hall tells two twins apart only when BOTH carry one and their hall numbers differ.
       The same hall written two ways (registry «G28», old text «G/G28») and a copy whose hall was cleared are double
       entries — the board and the gate must agree that they block. */
{
  const alias = [row(1, 3, 100, PLACEHOLDER, "G28", { SCode: "20" }),
    row(2, 3, 100, PLACEHOLDER, "G/G28", { SCode: "20", roomId: undefined, locationStatus: "HISTORICAL_TEXT" })];
  const scanAlias = fastConflictScan(alias, { placeholderInstructorIds: placeholders });
  check(scanAlias.ids.has(1) && scanAlias.ids.has(2) && scanAlias.warningIds.size === 0, "القاعة نفسها مكتوبةً بطريقتين ليست «مكانين»: اللوحة تمنع كما تمنع البوابة");
  check(approvalBlockerCount(alias, alias, { placeholderInstructorIds: placeholders }) === 1, "والعدّ يعدّها مانعاً واحداً");
  const cleared = [row(1, 3, 100, PLACEHOLDER, "G28", { SCode: "20" }),
    row(2, 3, 100, PLACEHOLDER, "", { SCode: "20", roomId: undefined, AdRoomCode: "", locationStatus: "PENDING_ROOM" })];
  check(allEqual(everyCount(cleared, cleared), 1), "ونسخةٌ مُسحت قاعتها إدخالٌ مكرّر يمنع في كل مدخل");
  const scanCleared = fastConflictScan(cleared, { placeholderInstructorIds: placeholders });
  check(scanCleared.warningIds.size === 0 && scanCleared.duplicatePairs === 1, "لا تنبيهَ «مكانين» لصفٍّ بلا قاعة");
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

/* The list row states its own reason from the board's reading — the reading that draws its ring. */
{
  const board = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src/components/Schedules.tsx"), "utf8");
  check(/rowClashReasons\(s, liveClash\.notes\?\.get\(s\.id\)/.test(board) && /agenda-clash-reason is-\$\{reason\.tone\}/.test(board),
    "صفّ القائمة يكتب سبب حلقته من قراءة اللوحة نفسها");
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

/* القاعة التاريخية المكتوبة نصّاً ليست «بيانات ناقصة» ولا تحجب الجاهزية. */
{
  const legacy: any = { id: 901, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 5, AdInstructorId: 7, SCode: "01",
    fsunday: true, ftuesday: true, fstarttime: "08:00", fendtime: "09:15", AdRoomCode: "012B09", AdRoomHall: "F13" };
  const noPlace: any = { ...legacy, id: 902, SCode: "02", fstarttime: "10:00", fendtime: "11:15", AdRoomCode: "", AdRoomHall: "" };
  const a = analyzeSchedule([legacy], [legacy], [], []);
  check(a.metrics.invalidRows === 0 && a.readiness !== "blocked", "قاعةٌ تاريخية نصّية بلا معرّف سجلٍّ ليست ناقصة ولا تحجب");
  const b = analyzeSchedule([legacy, noPlace], [legacy, noPlace], [], []);
  check(b.metrics.invalidRows === 1, "وموعدٌ بلا مكانٍ أصلاً يبقى ناقصاً");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
