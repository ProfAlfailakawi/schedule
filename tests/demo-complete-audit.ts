/**
 * ── تدقيق البيئة التجريبية الكاملة ──────────────────────────────────────────
 *
 * جولةٌ حيّة على «تجربة النظام» كشفت أن البيئة تعمل داخل الخدمة الحقيقية ولا
 * تنفصل عنها في كل موضع، وأن أكثر ما يُجرَّب فيها لا يعمل:
 *
 *   P1  ذاكرةُ العملية (سجلّ المباني وغيره) كانت مشتركةً بين الحقيقي والتجريبي.
 *   P2  لا موعدَ يُعدَّل أو يُنقل: الصندوق بلا سجلّ مبانٍ وقاعات.
 *   P3  صفحاتُ الروابط العامة (/s /q /r /m والتقويم) تبحث عن الرمز خارج الصندوق.
 *   P4  البيئة لا تحكي قصّة كل صفة: لا روابط، ولا حالات طلبة، ولا طلبات أساتذة.
 */

import fs from "fs";
import path from "path";
import { Repository } from "../src/db/repository";
import { createDataContextKey } from "../src/server/dataContextCache";
import { createDemoSandboxState } from "../src/db/demoSandbox";
import { locationPreflight } from "../src/server/locationRegistryEngine";
import { isDemoLinkToken, publicLinkTokenFromPath, DEMO_LINK_TOKEN_PREFIX } from "../src/utils/demoLinkToken";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
const lines = server.split("\n");

/* ── P1 بنيةً: كلُّ ذاكرةٍ في server.ts مفتاحُها يحمل عالَمه ──────────────── */
function p1Structure() {
  /* جلسةُ الدخول مفتاحُها معرّفُ الجلسة نفسه — والجلسةُ التجريبية معرّفُها
     «demo_…» فلا تلتقي بحقيقية. وما سواها يمرّ بـdataContextCacheKey. */
  const EXEMPT = new Set(["authCache"]);
  const caches = [...server.matchAll(/^const (\w*(?:Cache|Memo))\s*=\s*(?:new Map|createTtlMemo)/gm)].map(m => m[1]);
  check(caches.length >= 8, `عُثر على ذواكر العملية في server.ts (${caches.length})`);
  for (const name of caches) {
    if (EXEMPT.has(name)) continue;
    const uses: Array<{ line: number; arg: string }> = [];
    lines.forEach((text, index) => {
      for (const m of text.matchAll(new RegExp(`\\b${name}\\.(?:get|set)\\(\\s*([^,)]+)`, "g"))) uses.push({ line: index, arg: m[1].trim() });
    });
    check(uses.length > 0, `«${name}» تُقرأ وتُكتب`);
    const bad = uses.filter(({ line, arg }) => {
      if (arg.startsWith("dataContextCacheKey(")) return false;
      if (!/^\w+$/.test(arg)) return true;
      for (let back = line; back >= Math.max(0, line - 260); back--) {
        const decl = lines[back].match(new RegExp(`\\b(?:const|let)\\s+${arg}\\s*=\\s*(.*)`));
        if (decl) return !decl[1].includes("dataContextCacheKey(");
      }
      return true;
    });
    check(bad.length === 0, `«${name}»: كلُّ قراءةٍ وكتابة بمفتاحٍ من dataContextCacheKey${bad.length ? ` (السطر ${bad.map(b => b.line + 1).join("، ")})` : ""}`);
  }
  check(!/^let locationRegistryCache\b/m.test(server), "سجلُّ المباني لم يعد ذاكرةً واحدةً للعملية كلها");
  const reader = server.slice(server.indexOf("async function readLocationRegistry("), server.indexOf("function invalidateLocationRegistry("));
  check(reader.includes("Repository.isDemoRequest()?") && reader.includes("mergeRegistryWithSeed"),
    "الصندوقُ التجريبي يقرأ سجلَّه وحده؛ بذرةُ مباني الجامعة للحقيقي فقط");
  check(server.includes("const dataContextCacheKey = createDataContextKey(() => Repository.currentDemoSessionId());"),
    "المفتاحُ يُبنى من جلسة الصندوق الحاضر — قاعدةٌ واحدة في src/server/dataContextCache.ts");
  check((server.match(/function dataContextCacheKey|createDataContextKey\(/g) || []).length === 1, "ولا نسخةَ ثانيةً من القاعدة");
  const notify = server.slice(server.indexOf("function broadcastNotify("), server.indexOf("const broadcastStudentNotifySoon"));
  check(notify.includes("client.demoSessionId !== demoSessionId") && notify.includes("broadcastNotify(demoSessionId)"),
    "نبضةُ قرارٍ في صندوقٍ تجريبي لا توقظ إلا شاشاتِه");
}

/* ── P1 سلوكاً: الحقيقيُّ وكلُّ صندوقٍ مفاتيحُ مختلفة، والسجلّ لا يتسرّب ───── */
async function p1Behaviour() {
  const keyOf = createDataContextKey(() => Repository.currentDemoSessionId());
  const a = `demo_ctx_a_${Date.now()}`, b = `demo_ctx_b_${Date.now()}`;
  Repository.createDemoSandbox(a, 60_000);
  Repository.createDemoSandbox(b, 60_000);
  const real = keyOf("registry");
  const inA = await Repository.withDemoSandbox(a, () => keyOf("registry"));
  const inB = await Repository.withDemoSandbox(b, () => keyOf("registry"));
  check(real === "real|registry", "خارج الصندوق: مفتاحُ العالم الحقيقي");
  check(inA !== real && inB !== real && inA !== inB, "داخل كل صندوق: مفتاحٌ خاصّ به، لا يلتقي بالحقيقي ولا بصندوقٍ آخر");

  /* ما يحدث فعلاً في readLocationRegistry: ذاكرةٌ بمفتاحٍ من keyOf. */
  const memo = new Map<string, number>();
  const readCount = async () => {
    const k = keyOf("registry");
    if (!memo.has(k)) memo.set(k, (await Repository.getLocationBuildings()).length);
    return memo.get(k)!;
  };
  const demoCount = await Repository.withDemoSandbox(a, readCount);
  const realCount = await readCount();
  check(demoCount > 0, `الصندوقُ يقرأ سجلَّ مبانيه الوهمي (${demoCount})`);
  check(realCount === (await Repository.getLocationBuildings()).length, "والحقيقيُّ بعده يقرأ سجلَّه هو، لا ما حفظه الزائر");
}

/* ── P2: للصندوق سجلُّه، وكلُّ صفٍّ مبذور يمرّ بفحص الموقع عند الحفظ ──────── */
function p2Registry() {
  const state = createDemoSandboxState();
  const registry = { buildings: state.locationBuildings, rooms: state.locationRooms };
  check(state.locationBuildings.length >= state.colleges.length, `لكل كليةٍ مبنىً على الأقل (${state.locationBuildings.length} مبانٍ)`);
  check(state.colleges.every(c => state.locationBuildings.some(b => b.collegeIds.includes(c.AdCollegeId))), "كلُّ كليةٍ تجريبية لها مبناها في السجل");
  check(state.locationBuildings.every(b => b.active && b.confidence === "CONFIRMED" && b.adminVerified && /^\d{3}[A-Z]\d{2}$/.test(b.officialCode)),
    "المباني فعّالةٌ مؤكَّدةٌ بكودٍ رسميّ الشكل");
  check(state.locationBuildings.every(b => !b.officialCode.startsWith("01")), "وكودُها وهميٌّ لا يطابق فرعاً حقيقياً");
  check(state.locationRooms.every(r => r.active && r.confidence === "CONFIRMED" && state.locationBuildings.some(b => b.id === r.buildingId && b.officialCode === r.buildingCode)),
    "كلُّ قاعةٍ فعّالةٌ مؤكَّدةٌ ومبناها في السجل");
  check(state.sections.every(sec => state.locationRooms.some(r => r.sectionIds.includes(sec.AdSectionId))), "لكل قسمٍ قاعاتُه");
  const refused = state.schedules.filter(row => !locationPreflight(row, registry, { collegeId: row.AdCollegeId, sectionId: row.AdSectionId }).ok);
  check(refused.length === 0, `كلُّ صفٍّ مبذور يجتاز locationPreflight — فيُعدَّل ويُنقل${refused.length ? ` (رُفض: ${refused.map(r => r.id).join("، ")})` : ""}`);
  check(state.schedules.every(row => row.locationStatus === "VERIFIED" && row.buildingId && row.roomId),
    "وكلُّ صفٍّ مرتبطٌ بمبناه وقاعته (VERIFIED)");
  check(state.schedules.every(row => {
    const room = state.locationRooms.find(r => r.id === row.roomId);
    const building = state.locationBuildings.find(b => b.id === row.buildingId);
    return room && building && row.AdRoomCode === building.officialCode && row.AdRoomHall === room.canonicalCode;
  }), "والكودان المكتوبان في الصفّ هما كودا السجلّ");
  const csHalls = new Set(state.schedules.filter(r => r.AdCollegeId === 1 && r.AdSectionId === 1).map(r => r.roomId));
  check(csHalls.size >= 3, `محاضراتُ علوم الحاسب موزّعةٌ على قاعاتها (${csHalls.size})، لا في قاعةٍ واحدة`);
  const perHall = new Map<string, number>();
  state.schedules.forEach(r => perHall.set(String(r.roomId), (perHall.get(String(r.roomId)) || 0) + 1));
  check(Math.max(...perHall.values()) <= 5, "ولا قاعةٌ تحمل أكثر من خمس محاضرات — فلا «نقطة اعتماد حساسة» مصطنعة");
  const server = read("src/db/repository.ts");
  check(server.includes("return [...(db.locationBuildings||[])];") && server.includes("return [...(db.locationRooms||[])];"),
    "Repository يقرأ سجلَّ الصندوق داخل الجلسة التجريبية");
}

/* ── P3: الرابطُ العام يُفتح في عالَمه ─────────────────────────────────────── */
async function p3PublicLinks() {
  check(publicLinkTokenFromPath("/s/demo.abc") === "demo.abc" && publicLinkTokenFromPath("/q/demo.abc?x=1") === "demo.abc"
    && publicLinkTokenFromPath("/r/tok") === "tok" && publicLinkTokenFromPath("/m/tok#ref") === "tok",
    "رمزُ الرابط يُقرأ من صفحات /s /q /r /m");
  check(publicLinkTokenFromPath("/api/public/survey/demo.x/proof") === "demo.x" && publicLinkTokenFromPath("/api/public/ics/demo.y/key1") === "demo.y"
    && publicLinkTokenFromPath("/api/public/staff/t1/note") === "t1", "ومن واجهات /api/public/<نوع>/<رمز>");
  check(publicLinkTokenFromPath("/api/schedules") === "" && publicLinkTokenFromPath("/sw.js") === "", "ولا رمزَ لمسارٍ غير عام");
  check(!isDemoLinkToken("Ab-_09xyz") && isDemoLinkToken(`${DEMO_LINK_TOKEN_PREFIX}Ab`), "الرمزُ التجريبي لا يلتبس برمزٍ حقيقي (base64url بلا نقطة)");

  const owner = `demo_links_${Date.now()}`, other = `demo_links_other_${Date.now()}`;
  Repository.createDemoSandbox(owner, 60_000);
  Repository.createDemoSandbox(other, 60_000);
  const link = await Repository.withDemoSandbox(owner, () => Repository.createShareLink({
    AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, label: "اختبار", kind: "survey",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(), SystemUserId: 16, userName: "لجنة", showInstructors: false,
  } as any));
  check(isDemoLinkToken(link.id), "رابطٌ يُنشأ داخل الصندوق يحمل رمزاً تجريبياً");
  check(Repository.demoSandboxForLinkToken(link.id) === owner, "ويُعرف صندوقُه من رمزه — فيُفتح من المتصفّح نفسه أو من هاتفٍ بلا جلسة");
  check(await Repository.getShareLink(link.id) === undefined, "ولا يُبحث عنه في البيانات الحقيقية");
  check(await Repository.withDemoSandbox(other, () => Repository.getShareLink(link.id)) === undefined, "ولا يقرؤه صندوقٌ آخر");
  check(Repository.demoSandboxForLinkToken("realTokenAbc") === "", "والرمزُ الحقيقي لا يُربط بصندوقٍ أبداً");

  check(server.includes("app.use(PUBLIC_LINK_PAGE_PREFIXES.map(prefix => `${prefix}:token`), bindPublicLinkContext);"),
    "صفحاتُ الروابط تُربط بعالَم رمزها قبل أن تُحلّ");
  const pagesAt = server.indexOf("app.use(PUBLIC_LINK_PAGE_PREFIXES.map");
  check(["app.get(\"/s/:token\"", "app.get(\"/q/:token\"", "app.get(\"/r/:token\"", "app.get(\"/m/:token\""].every(route => server.indexOf(route) > pagesAt),
    "والربطُ مسجَّلٌ قبل مسارات الصفحات الأربع");
  const apiBinder = server.slice(server.indexOf('app.use("/api", (req: Request, res: Response, next: NextFunction) => {'));
  check(apiBinder.slice(0, 300).includes('if (req.path.startsWith("/public/")) { bindPublicLinkContext(req, res, next); return; }'),
    "وواجهاتُ /api/public تتبع الرمز لا الجلسة");
  const auth = server.slice(server.indexOf("async function authMiddleware("), server.indexOf("async function authMiddleware(") + 900);
  check(auth.includes('if (sessionId.startsWith("demo_") && !Repository.isDemoRequest()) { next(); return; }'),
    "جلسةٌ تجريبية خارج صندوقها بلا هوية — لا «مدير البيئة التجريبية» على بياناتٍ حقيقية");
  check(server.includes("const studentCaseSecret = () => studentCaseSecretPromise ||= Repository.getSharedServerSecret();"),
    "سرُّ هويات الطلبة المحفوظ للعملية يُقرأ خارج الصندوق — لا يحفظ زائرٌ مفتاحَ صندوقه للطلبة الحقيقيين");
}

async function main() {
  await p3PublicLinks();
  p2Registry();
  p1Structure();
  await p1Behaviour();
  console.log(`\n${passed} نجحت · ${failed} أخفقت`);
  if (failed > 0) process.exit(1);
}
main().catch(error => { console.error(error); process.exit(1); });
