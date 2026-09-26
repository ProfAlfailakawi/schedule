/**
 * ── النطاق الواحد: الكلية والقسم والفصل تتبع القارئ من شاشةٍ إلى شاشة ──────
 *
 * طلب المالك: «لما أختار كلية التربية الأساسية - قسم الإسلامية - الفصل الأول،
 * بعدها لما أنتقل إلى أي أيقونة أخرى تظل على نفس الكلية والقسم والفصل إلا إذا
 * بدّلته». الموضع الوحيد: src/utils/sharedScope.ts. هذا التدقيق يمسك:
 *   P  الحفظ: لكل حسابٍ مفتاحه، يبقى بعد إعادة التحميل، ويُرحَّل من المفتاح القديم.
 *   W  الكتابة: رقعةٌ جزئية، تغيّر الكلية يُسقط قسم الكلية السابقة، لا إخطار بلا تغيّر.
 *   N  الاشتراك: إخطارٌ بالمصدر، إلغاء الاشتراك، حدث storage من لسانٍ آخر.
 *   R  القراءة على نطاق القارئ: خارج النطاق يُعاد، القسم الوحيد، «كل الأقسام»،
 *      الإدارة والكتالوج، الفصل الزائل يرجع إلى افتراض الشاشة.
 *   F  الإشعار هدفٌ صريح يكتب النطاق.
 *   S  بنيوي: لا شاشة تحفظ نطاقها بنفسها، ولا قارئ ثانٍ للتركيز، وكل شاشة
 *      نطاقٍ تقرأ من المخزن وتكتب فيه حين يختار القارئ.
 */
import fs from "fs";
import path from "path";

/* ── متصفّحٌ صغير: localStorage وsessionStorage يبقيان بعد «إعادة التحميل» ── */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string) { this.map.set(key, String(value)); }
  removeItem(key: string) { this.map.delete(key); }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  get length() { return this.map.size; }
}
const local = new MemoryStorage();
const session = new MemoryStorage();
const storageHandlers: Array<(event: { key: string | null }) => void> = [];
(globalThis as any).window = {
  localStorage: local,
  sessionStorage: session,
  addEventListener: (type: string, fn: any) => { if (type === "storage") storageHandlers.push(fn); },
};
(globalThis as any).sessionStorage = session;
(globalThis as any).localStorage = local;

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

async function main() {
  const shared = await import("../src/utils/sharedScope");
  const { writeNotifyFocus, takeNotifyFocus } = await import("../src/utils/notifyFocus");
  const {
    readSharedScope, writeSharedScope, subscribeSharedScope, resolveSharedScope, setSharedScopeUser,
    sharedScopeKey, resetSharedScopeMemory, handleSharedScopeStorageEvent,
  } = shared;

  /* ── P: الحفظ ─────────────────────────────────────────────────────────── */
  setSharedScopeUser(7);
  check(eq(readSharedScope(), { collegeId: 0, sectionId: 0, termId: 0 }), "P أوّل زيارة: لا نطاق محفوظ");
  check(local.getItem(sharedScopeKey(7)) === null, "P القراءة لا تكتب شيئاً");
  writeSharedScope({ collegeId: 3, sectionId: 31, termId: 5 });
  const stored = JSON.parse(local.getItem("schedule-scope-7") || "{}");
  check(stored.collegeId === 3 && stored.sectionId === 31 && stored.termId === 5, "P يُحفظ تحت مفتاح الحساب");
  resetSharedScopeMemory(); // «إعادة تحميل»: الذاكرة تفرغ والمخزن يبقى
  setSharedScopeUser(7);
  check(eq(readSharedScope(), { collegeId: 3, sectionId: 31, termId: 5 }), "P يبقى بعد إعادة التحميل");
  check(eq(readSharedScope(8), { collegeId: 0, sectionId: 0, termId: 0 }), "P حسابٌ آخر على الجهاز نفسه لا يرث النطاق");
  check(eq(writeSharedScope({ collegeId: 9 }, { userId: 0 }), { collegeId: 0, sectionId: 0, termId: 0 }) && local.getItem("schedule-scope-0") === null,
    "P بلا حسابٍ معروف لا يُكتب شيء");
  local.setItem("schedule-workspace-prefs-11", JSON.stringify({ filterCollege: 4, filterSection: 41, filterTerm: 6, viewMode: "week" }));
  check(eq(readSharedScope(11), { collegeId: 4, sectionId: 41, termId: 6 }), "P يُرحَّل آخر نطاقٍ من تفضيلات اللوحة القديمة");
  local.setItem("schedule-scope-12", "{not json");
  check(eq(readSharedScope(12), { collegeId: 0, sectionId: 0, termId: 0 }), "P مخزنٌ معطوب لا يُسقط الشاشة");

  /* ── W: الكتابة ──────────────────────────────────────────────────────── */
  writeSharedScope({ termId: 6 });
  check(eq(readSharedScope(), { collegeId: 3, sectionId: 31, termId: 6 }), "W تغيير الفصل وحده يُبقي الكلية والقسم");
  writeSharedScope({ collegeId: 4 });
  check(eq(readSharedScope(), { collegeId: 4, sectionId: 0, termId: 6 }), "W كليةٌ جديدة بلا قسم → «كل الأقسام» لا قسم الكلية السابقة");
  writeSharedScope({ collegeId: 3, sectionId: 32 });
  check(eq(readSharedScope(), { collegeId: 3, sectionId: 32, termId: 6 }), "W الكلية والقسم معاً");
  writeSharedScope({ sectionId: 0 });
  check(readSharedScope().sectionId === 0, "W «كل الأقسام» (صفر) اختيارٌ يُحفظ");
  writeSharedScope({ collegeId: 0 });
  check(eq(readSharedScope(), { collegeId: 0, sectionId: 0, termId: 6 }), "W قسمٌ بلا كلية لا يُحفظ");

  /* ── N: الاشتراك ─────────────────────────────────────────────────────── */
  const heard: Array<{ scope: any; source: string }> = [];
  const off = subscribeSharedScope((scope, source) => heard.push({ scope, source }));
  writeSharedScope({ collegeId: 3, sectionId: 31 }, { source: "reports" });
  check(heard.length === 1 && heard[0].source === "reports" && heard[0].scope.sectionId === 31, "N الشاشات المركّبة تُخطَر ومعها مصدر الكتابة");
  writeSharedScope({ collegeId: 3, sectionId: 31 }, { source: "reports" });
  check(heard.length === 1, "N كتابةٌ لا تغيّر شيئاً لا تُخطِر أحداً");
  writeSharedScope({ termId: 9 }, { userId: 8 });
  check(heard.length === 1, "N نطاق حسابٍ آخر لا يُخطِر مستمعي هذا الحساب");
  // لسانٌ آخر كتب مباشرةً في المخزن
  local.setItem("schedule-scope-7", JSON.stringify({ collegeId: 5, sectionId: 51, termId: 6 }));
  check(storageHandlers.length === 1, "N مستمع حدث storage مركّبٌ مرّة واحدة");
  storageHandlers.forEach(fn => fn({ key: "schedule-scope-7" }));
  check(heard.length === 2 && heard[1].source === "storage" && heard[1].scope.collegeId === 5, "N لسانٌ آخر غيّر النطاق → يُتبع هنا");
  check(readSharedScope().collegeId === 5, "N وذاكرة هذا اللسان تُحدَّث منه");
  handleSharedScopeStorageEvent("schedule-unified-prefs-7");
  check(heard.length === 2, "N مفاتيح أخرى لا تُخطِر");
  off();
  writeSharedScope({ termId: 7 });
  check(heard.length === 2, "N إلغاء الاشتراك يُوقف الإخطار");

  /* ── R: القراءة على نطاق القارئ ──────────────────────────────────────── */
  const chair = [{ AdCollegeId: 3, AdSectionId: 31 }];
  const head2 = [{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 3, AdSectionId: 32 }];
  const dean = [
    { AdCollegeId: 3, AdSectionId: 31, AdCollegeWide: true },
    { AdCollegeId: 3, AdSectionId: 32, AdCollegeWide: true },
    { AdCollegeId: 3, AdSectionId: 33, AdCollegeWide: true },
  ];
  const twoColleges = [{ AdCollegeId: 3, AdSectionId: 31 }, { AdCollegeId: 4, AdSectionId: 41 }];
  check(eq(resolveSharedScope({ collegeId: 9, sectionId: 91, termId: 5 }, { scopes: chair }), { collegeId: 3, sectionId: 31, termId: 5 }),
    "R كليةٌ خارج النطاق (اختارها المدير في جهازه) → نطاق الحساب، لا بياناتٌ خارجه");
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 0, termId: 5 }, { scopes: chair }), { collegeId: 3, sectionId: 31, termId: 5 }),
    "R رئيس اللجنة (قسمٌ واحد): القسم مفهومٌ ضمناً ولو حُفظ «كل الأقسام»");
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 32, termId: 5 }, { scopes: chair }), { collegeId: 3, sectionId: 31, termId: 5 }),
    "R قسمٌ خارج النطاق → القسم الوحيد");
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 0, termId: 5 }, { scopes: head2 }), { collegeId: 3, sectionId: 0, termId: 5 }),
    "R «كل الأقسام» يبقى لمن في كليته أكثر من قسم");
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 32, termId: 5 }, { scopes: head2 }), { collegeId: 3, sectionId: 32, termId: 5 }),
    "R قسمٌ داخل النطاق يبقى كما اختاره");
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 0, termId: 5 }, { scopes: dean }), { collegeId: 3, sectionId: 0, termId: 5 }),
    "R العميد (الكلية كلها) يرى «كل الأقسام»");
  check(eq(resolveSharedScope({ collegeId: 0, sectionId: 0, termId: 5 }, { scopes: twoColleges }), { collegeId: 0, sectionId: 0, termId: 5 }),
    "R كليتان بلا اختيار → لا يُختار عنه");
  check(eq(resolveSharedScope({ collegeId: 4, sectionId: 31, termId: 5 }, { scopes: twoColleges }), { collegeId: 4, sectionId: 41, termId: 5 }),
    "R قسم كليةٍ أخرى لا يُحمل إلى الكلية المختارة");
  const colleges = [{ AdCollegeId: 3 }, { AdCollegeId: 4 }];
  const sections = [{ AdSectionId: 31, AdCollegeId: 3 }, { AdSectionId: 41, AdCollegeId: 4 }];
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 31, termId: 5 }, { isAdmin: true, colleges, sections }), { collegeId: 3, sectionId: 31, termId: 5 }),
    "R الإدارة: ما اختاره يبقى");
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 0, termId: 5 }, { isAdmin: true, scopes: chair, colleges, sections }), { collegeId: 3, sectionId: 0, termId: 5 }),
    "R الإدارة لا تُقفل على قسمٍ واحد أبداً");
  check(eq(resolveSharedScope({ collegeId: 99, sectionId: 31, termId: 5 }, { isAdmin: true, colleges, sections }), { collegeId: 0, sectionId: 0, termId: 5 }),
    "R الإدارة: كليةٌ حُذفت من الكتالوج تسقط");
  check(eq(resolveSharedScope({ collegeId: 3, sectionId: 41, termId: 5 }, { isAdmin: true, colleges, sections }), { collegeId: 3, sectionId: 0, termId: 5 }),
    "R الإدارة: قسمٌ في غير كليته يسقط");
  const terms = [{ AdTermId: 5 }, { AdTermId: 6 }];
  check(resolveSharedScope({ collegeId: 3, termId: 5 }, { scopes: head2, terms, fallbackTermId: 6 }).termId === 5, "R فصلٌ موجود يبقى");
  check(resolveSharedScope({ collegeId: 3, termId: 2 }, { scopes: head2, terms, fallbackTermId: 6 }).termId === 6, "R فصلٌ زال → افتراض الشاشة (فصل التخطيط/الجاري)");
  check(resolveSharedScope({ collegeId: 3, termId: 0 }, { scopes: head2, terms, fallbackTermId: 6 }).termId === 6, "R لا فصل محفوظ → افتراض الشاشة");
  check(resolveSharedScope({ collegeId: 3, termId: 2 }, { scopes: head2, fallbackTermId: 6 }).termId === 2, "R قبل وصول الفصول لا يُحكم على الفصل");
  check(eq(readSharedScope(), { collegeId: 5, sectionId: 51, termId: 7 }), "R العرض على النطاق لا يكتب افتراضه في المخزن");

  /* ── F: الإشعار هدفٌ صريح يغلب ───────────────────────────────────────── */
  setSharedScopeUser(20);
  writeSharedScope({ collegeId: 3, sectionId: 31, termId: 5 });
  writeNotifyFocus({ view: "reportDepartment", collegeId: 4, sectionId: 41, termId: 6 });
  check(takeNotifyFocus("scheduleChanges") === null && eq(readSharedScope(), { collegeId: 3, sectionId: 31, termId: 5 }),
    "F تركيزٌ لشاشةٍ أخرى لا يُغيّر النطاق ولا يُستهلك");
  const focus = takeNotifyFocus("reportDepartment");
  check(Boolean(focus) && eq(readSharedScope(), { collegeId: 4, sectionId: 41, termId: 6 }), "F الشاشة التي تأخذ التركيز تجعله نطاق القارئ في كل الشاشات");
  writeNotifyFocus({ view: "studentRegistration", collegeId: 3, sectionId: 32 });
  takeNotifyFocus("studentRegistration");
  check(eq(readSharedScope(), { collegeId: 3, sectionId: 32, termId: 6 }), "F تركيزٌ بلا فصل يُبقي الفصل المختار");

  /* ── S: بنيوي ─────────────────────────────────────────────────────────── */
  const walk = (dir: string): string[] => fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(tsx?|jsx?)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
  const sources = walk("src").map(file => ({ file, code: stripComments(read(file)) }));
  const owner = path.join("src", "utils", "sharedScope.ts");
  const focusOwner = path.join("src", "utils", "notifyFocus.ts");

  const keyCopies = sources.filter(({ file, code }) => file !== owner && /schedule-scope-/.test(code)).map(({ file }) => file);
  check(!keyCopies.length, `S مفتاح النطاق مكتوبٌ في sharedScope.ts وحده${keyCopies.length ? ` — ${keyCopies.join("، ")}` : ""}`);

  /* نسخةٌ ثانية من النطاق في تفضيلات شاشة: filterCollege/filterSection/filterTerm
     تُحفظ أو تُقرأ من كائنٍ محفوظ، أو «تفضيلات اللوحة المشتركة» تُقرأ خارج المخزن. */
  const persisted = /\b(?:filterCollege|filterSection|filterTerm)\s*:|\.(?:filterCollege|filterSection|filterTerm)\b|\bworkspacePrefKey\b|\bworkspaceSaved\b/;
  const scopeCopies = sources.filter(({ file, code }) => file !== owner && persisted.test(code)).map(({ file }) => file);
  check(!scopeCopies.length, `S لا شاشة تحفظ الكلية/القسم/الفصل في تفضيلاتها${scopeCopies.length ? ` — ${scopeCopies.join("، ")}` : ""}`);

  const reports = stripComments(read("src/components/Reports.tsx"));
  check(/const \{ collegeId: _college, sectionId: _section, termId: _term, \.\.\.rest \} = filters;[\s\S]{0,120}filters: rest/.test(reports),
    "S الاستعلامات تحفظ مرشّحاتها بلا النطاق (العدسة والمرشّحات الأخرى باقية)");
  const schedules = stripComments(read("src/components/Schedules.tsx"));
  check(/JSON\.stringify\(\{\s*viewMode,/.test(schedules), "S تفضيلات اللوحة تحفظ طريقة العرض وحدها بلا النطاق");

  const focusReaders = sources.filter(({ file, code }) => file !== focusOwner && /schedule:notify-focus|getItem\(\s*NOTIFY_FOCUS_KEY/.test(code)).map(({ file }) => file);
  check(!focusReaders.length, `S قارئ التركيز واحد (takeNotifyFocus)${focusReaders.length ? ` — ${focusReaders.join("، ")}` : ""}`);

  const screens = [
    "src/components/Schedules.tsx",
    "src/components/Reports.tsx",
    "src/components/ScheduleChanges.tsx",
    "src/components/StudentRegistration.tsx",
    "src/components/InstructorInbox.tsx",
    "src/components/IntelligenceWorkspace.tsx",
  ];
  for (const file of screens) {
    const code = stripComments(read(file));
    check(/from "\.\.\/utils\/sharedScope"/.test(code) && /useSharedScope\(/.test(code), `S ${path.basename(file)} يقرأ النطاق المشترك ويتبع تغيّره`);
    check(/resolveSharedScope\(/.test(code), `S ${path.basename(file)} يعرض المحفوظ على نطاق القارئ قبل استعماله`);
    check(/\.pick\(/.test(code), `S ${path.basename(file)} يكتب ما يختاره القارئ`);
  }
  const app = stripComments(read("src/App.tsx"));
  check(/function scheduleScopeQuery[\s\S]{0,200}readSharedScope\(userId\)/.test(app), "S البداية الدافئة تسأل بالنطاق نفسه الذي تقرؤه اللوحة");
  check(/setSharedScopeUser\(Number\(user\?\.SystemUserId/.test(app), "S النطاق مفتاحه صاحب الجلسة");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch(error => { console.error(error); process.exit(1); });
