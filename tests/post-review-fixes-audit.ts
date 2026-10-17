/**
 * إصلاحات مراجعة الدمج #351: كلُّ بندٍ يُثبَّت بما يكسره لو عاد.
 *  ١) ذاكرةُ المحاكاة والتنبّؤ تحمل عالَمها (لا يقرأ صندوقٌ تجريبيّ ذاكرةَ آخر)
 *  ٢) الرجوعُ من مساحة المقترح لا يترك عدّاداً عالقاً يبتلع أول رجوعٍ حقيقي
 *  ٣) ردُّ الأستاذ العام يحترم تجميدَ الفصل لا إغلاقَه الصريح وحده
 *  ٤) خياراتُ القاعة السريعة تأتي من سجلّ القاعات لا من صفوف القسم وحدها
 */
import fs from "fs";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed += 1; console.log(`✓ ${name}`); } else { failed += 1; console.error(`✗ ${name}`); } };
const read = (path: string) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sim = read("src/server/simulationRoutes.ts");
const server = read("server.ts");
check(!/(?:inputMemo|predictiveMemo|outcomeMemo)\.get\((?!ctxKey|deps\.dataContextKey)/.test(sim), "كلُّ ذاكرةٍ في المحاكاة تُقرأ بمفتاحٍ يحمل عالَمه");
check(/dataContextKey: dataContextCacheKey,\n\}\);\nregisterInsightRoutes/.test(server) && server.includes("radarNoticeFor(req, { ...scopeDeps, dataContextKey: dataContextCacheKey })"), "الخادم يمرّر قاعدةَ المفتاح إلى مسارات المحاكاة والإشعار");

const ws = read("src/components/proposal/StudyProposalWorkspace.tsx");
check(ws.includes("let ownPopNow = false;") && /window\.addEventListener\("popstate", \(\) => \{ ownPopNow = ownPops > 0;/.test(ws), "الحدثُ الذاتيّ يُستهلك في مستمعٍ دائم");
check(!/if \(ownPops > 0\) \{ ownPops -= 1; return; \}/.test(ws) && /if \(ownPopNow\) return;/.test(ws), "مستمعُ المكوّن لا يستهلك العدّاد بنفسه");

const proposals = read("src/server/studyProposalRoutes.ts");
check(/const termShutOf = async/.test(proposals) && /responseGate\(proposal, Date\.now\(\), await termShutOf\(world, Number\(resolved\.request\.AdTermId\)\)\)/.test(proposals), "ردُّ الأستاذ يُغلق بالتجميد كما بالإغلاق");
check(/const termClosed = await termShutOf\(world, Number\(proposal\.AdTermId\)\);/.test(proposals), "ما يراه الأستاذ من بوابة الرد يوافق ما يقبله الخادم");

check(/hallByKey/.test(server) && /const registered = rules\.hallByKey\.get\(key\);/.test(server), "خياراتُ القاعة السريعة تُحلّ من سجلّ القاعات أولاً");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
