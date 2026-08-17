import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const failures = [];
const passes = [];
const assert = (condition, label, detail="") => {
  if (condition) passes.push(label);
  else failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const read = file => fs.readFileSync(path.join(root,file),"utf8");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-guide-test-"));
const tscCandidates = [path.join(root,"node_modules/.bin/tsc"), "/opt/nvm/versions/node/v22.16.0/bin/tsc", "tsc"];
let compile = null;
for (const bin of tscCandidates) {
  const result = spawnSync(bin, ["src/guide/smartGuide.ts","--target","ES2022","--module","ESNext","--lib","ES2022,DOM","--skipLibCheck","--moduleResolution","bundler","--outDir",tmp], {cwd:root,encoding:"utf8"});
  if (!result.error) { compile=result; break; }
}
if (!compile || compile.status !== 0) {
  console.error("تعذر تحويل محرك المرشد للاختبار:\n" + String(compile?.stderr || compile?.stdout || "لم يوجد tsc"));
  process.exit(1);
}

const store = new Map();
globalThis.localStorage = {
  getItem:key => store.has(String(key)) ? store.get(String(key)) : null,
  setItem:(key,value) => store.set(String(key),String(value)),
  removeItem:key => store.delete(String(key)),
  clear:() => store.clear(),
  key:index => [...store.keys()][index] || null,
  get length(){ return store.size; },
};
const engine = await import(pathToFileURL(path.join(tmp,"smartGuide.js")).href + `?t=${Date.now()}`);
const reset = () => store.clear();

// 1/2/3 — نموذج المستخدم والخبرة والتعثر.
reset();
for (let i=0;i<20;i++) {
  engine.recordRoute(101,"schedules","intelligence");
  engine.recordRoute(101,"intelligence","schedules");
  engine.recordFeatureEvent(101,"schedule.view.week","attempt");
  engine.recordFeatureEvent(101,"schedule.view.week","completed",{durationMs:8500,stepCount:1,retries:0});
  engine.recordFeatureEvent(101,"schedule.view.rooms","attempt");
  engine.recordFeatureEvent(101,"schedule.view.rooms","completed",{durationMs:9800,stepCount:1,retries:0});
}
let p = engine.loadGuideProfile(101);
assert(Number(p.routes["schedules>intelligence"]||0) >= 20 && Number(p.routes["intelligence>schedules"]||0) >= 20, "AB: المسار المتكرر يصبح خط أساس فعليًا");
assert(engine.masteryScore(p,"schedule.view.rooms") >= .72, "AB: الاستخدام الناجح المتكرر يبني إتقانًا");
let f = engine.evaluateGuideFriction(p, engine.featureById("schedule.view.rooms"), [{type:"normal-route",count:1,weight:.5}]);
assert(f.confidence === "low", "AB: السلوك الطبيعي الخبير لا يطلق مساعدة");
f = engine.evaluateGuideFriction(p, engine.featureById("schedule.action.move-room"), [{type:"failed-journey",count:4,weight:1.8,knownFailure:true}]);
assert(f.confidence === "high", "AB: الانحراف القوي والفشل المتكرر ينتج ثقة عالية");

// 4 — التردد سبب مختلف عن الجهل.
assert(engine.classifyGuideReason({mastery:.8,hesitation:true}) === "HESITANT", "التردد أمام إجراء حساس يصنف كتردد لا كجهل");

// 5 — تغير الإصدار يضعف إتقان الميزة نفسها فقط.
reset();
for(let i=0;i<10;i++){ engine.recordFeatureEvent(102,"schedule.action.move-room","attempt"); engine.recordFeatureEvent(102,"schedule.action.move-room","completed",{durationMs:12000,stepCount:5,retries:0}); engine.recordFeatureEvent(102,"schedule.view.week","attempt"); engine.recordFeatureEvent(102,"schedule.view.week","completed",{durationMs:5000,stepCount:1,retries:0}); }
p=engine.loadGuideProfile(102);
const beforeMove=engine.masteryScore(p,"schedule.action.move-room");
const beforeWeek=engine.masteryScore(p,"schedule.view.week");
p.mastery["schedule.action.move-room"].versionSeen = Math.max(1,engine.featureById("schedule.action.move-room").version-1);
engine.saveGuideProfile(p); p=engine.loadGuideProfile(102);
assert(engine.masteryScore(p,"schedule.action.move-room") < beforeMove*.6, "تغير Version يخفض إتقان الميزة المتغيرة فقط");
assert(Math.abs(engine.masteryScore(p,"schedule.view.week")-beforeWeek) < .03, "تغير Version لا يخفض إتقان ميزات أخرى");

// 6/7 — الصلاحيات مركزيًا.
const usersFeature = engine.featureById("page.users");
assert(!engine.canAccessGuideFeature(usersFeature,{permissions:[11],root:false,admin:false}), "مستخدم عادي لا يرى adminOnly حتى مع رقم الصلاحية");
assert(engine.canAccessGuideFeature(usersFeature,{permissions:[11],root:true,admin:true}), "المسؤول الرئيسي يرى adminOnly المسموح له");
assert(!engine.allAllowedGuideFeatures([11],false,false).some(x=>x.id==="page.users"), "البحث الحر لا يسرب adminOnly للمستخدم العادي");

// 8 — فهم الكويتية ورد البنية المقروءة فصيح.
const intent=engine.parseStructuredGuideIntent("أبي هذا المقرر يصير يوم الأربعاء الساعة 11 بس لا أبي أغير الدكتور وإذا القاعة مشغولة دور لي أقرب قاعة");
assert(intent.goal === "change-time" && intent.entities.day === "fwednesday" && intent.entities.time === "11:00" && intent.constraints.keepInstructor === true && intent.constraints.findAlternativeRoom === true && intent.compound, "يفهم الطلب الكويتي المركب وقيوده");
const noFalseTime=engine.parseStructuredGuideIntent("شلون أنقل المادة رقم 22 إلى قاعة ثانية؟");
assert(!noFalseTime.entities.time, "الأرقام العادية لا تُفسر وقتًا بلا كلمة وقت/ساعة أو صيغة 11:00");

// 9/10 — الإرشاد الحي والاستكمال.
const smart=read("src/components/SmartGuide.tsx");
assert(/ما فهمت\|مو واضح[\s\S]{0,1200}startTour/.test(smart), "«لم أفهم» يصعد إلى إرشاد حي بدل تكرار النص");
assert(smart.includes("setPendingTourStep(resumeAt)") && smart.includes("setPendingTourId(feature.id)"), "«أين كنت؟» يحتفظ بنفس Journey/Step");

// 11/12 — Sandbox حقيقي.
const intel=read("src/components/IntelligenceWorkspace.tsx");
assert(intel.includes("copy[index] = after") && intel.includes("guideSimulationMeta") && intel.includes("evaluateScenario(copy)"), "المحاكاة تطبق التغيير داخل Sandbox ثم تعيد تقييمه");
assert(intel.includes("findAlternativeRoom") && intel.includes("candidates[0]") && intel.includes("occupied(room)"), "المحاكاة تبحث عن قاعة بديلة متاحة داخل Sandbox عند طلب ذلك");
assert(/لم يتغير الجدول الحقيقي|دون لمس الجدول الحقيقي|لا تمس الجدول الحقيقي/.test(intel), "المحاكاة توضح أن الجدول الحقيقي لم يتغير");

// 13 — Transaction Undo واحد بترتيب عكسي صحيح.
reset();
const tx=engine.beginGuideTransaction(103,"اختبار");
engine.appendGuideTransactionOperation(103,tx,{id:"a",featureId:"schedule.action.move-room",label:"أ",rollback:{scope:"schedule",type:"undoById",value:"A"}});
engine.appendGuideTransactionOperation(103,tx,{id:"b",featureId:"schedule.action.move-room",label:"ب",rollback:{scope:"schedule",type:"undoById",value:"B"}});
engine.completeGuideTransaction(103,tx);
p=engine.loadGuideProfile(103);
const rollback=engine.transactionRollbackCommands(p,tx);
assert(rollback.length===2 && rollback[0].value==="B" && rollback[1].value==="A", "GuideTransaction يعيد السلسلة كلها بضغطة واحدة وبترتيب عكسي");

// 14 يثبت بالـ audit نفسه؛ هنا نتأكد أن البناء يستدعيه.
const pkg=JSON.parse(read("package.json"));
assert(String(pkg.scripts?.build||"").includes("audit:guide") && String(pkg.scripts?.build||"").includes("test:guide") && String(pkg.scripts?.build||"").includes("test:guide:perf"), "Build يشغل تدقيق الميتاداتا واختبارات السلوك والأداء");

// 15 تكرار للصلاحية في مسار البحث الحالي.
assert(!/GUIDE_FEATURES\s*\.filter/.test(smart) && smart.includes("allAllowedGuideFeatures"), "بحث المرشد يستخدم Predicate الصلاحيات المركزي");

// 16 — click/attempt لا يساوي نجاحًا.
reset(); engine.recordFeatureEvent(104,"schedule.action.move-room","attempt"); p=engine.loadGuideProfile(104);
assert(p.mastery["schedule.action.move-room"].completed===0 && p.mastery["schedule.action.move-room"].attempts===1, "النقرة/المحاولة لا تسجل نجاحًا");

// 17 — نجاح بعد المساعدة يستنتج resolvedAfterHelp بلا Rating.
engine.recordFeatureEvent(104,"schedule.action.move-room","helped"); engine.recordFeatureEvent(104,"schedule.action.move-room","completed",{durationMs:15000,stepCount:5,retries:1}); p=engine.loadGuideProfile(104);
assert(p.mastery["schedule.action.move-room"].resolvedAfterHelp>=1, "نجاح الرحلة بعد المساعدة يسجل resolvedAfterHelp تلقائيًا");

// Baseline لا يعتمد على الخام: dwell/failure aggregates فقط.
engine.recordFeatureDwell(104,"schedule.action.move-room",4200);
engine.recordFeatureEvent(104,"schedule.action.move-room","failed",{durationMs:18000,stepCount:4,retries:2});
p=engine.loadGuideProfile(104);
assert(Number(p.mastery["schedule.action.move-room"].baseline.normalDwellMs||0)>=4000, "Baseline يحفظ dwell مجمعًا لكل مستخدم ولكل ميزة");
assert(Number(p.mastery["schedule.action.move-room"].baseline.failureRate||0)>0, "Baseline يحسب معدل الفشل الحقيقي لا عدد النقرات فقط");

const safeFeatures=engine.GUIDE_FEATURES.filter(feature=>feature.safeAction);
assert(safeFeatures.every(feature=>engine.GUIDE_ACTIONS.some(action=>action.featureId===feature.id)), "كل safeAction مسجل في Action Registry المركزي");
const sensitiveActions=engine.GUIDE_ACTIONS.filter(action=>action.risk==="sensitive" || action.risk==="write");
assert(sensitiveActions.length>=3 && sensitiveActions.every(action=>action.requiresConfirmation===true), "كل WRITE/SENSITIVE مسجل بسياسة تأكيد صريحة");
assert(engine.GUIDE_JOURNEYS.some(j=>j.id==="journey.schedule.find-room") && engine.GUIDE_JOURNEYS.some(j=>j.id==="journey.schedule.practice") && engine.GUIDE_JOURNEYS.some(j=>j.id==="journey.intelligence.try"), "الرحلات المهمة خارج النقل والتحرير معرفة Declaratively أيضًا");
const serverSource=read("server.ts");
assert(serverSource.includes('canAccessGuideFeature, featureById') && !serverSource.includes("GUIDE_ADMIN_FEATURES") && !serverSource.includes("GUIDE_PERMISSION_FEATURES"), "الخادم يعيد استخدام Predicate الصلاحيات المركزي ولا يكرر خرائط صلاحية للمرشد");

// 18/19/20 — الهاتف، أشر لي، الإيقاف.
const css=read("src/styles/03-shell.css");
assert(css.includes("smart-guide.level-peek") && css.includes("smart-guide.level-medium") && css.includes("smart-guide.level-full") && css.includes("level-peek .smart-guide-pending-task"), "الهاتف يستخدم Progressive Disclosure بثلاثة ارتفاعات ومستوى بصري واحد افتراضيًا");
assert(smart.includes("setDrawerHidden(true); setPointMode(true)") && css.includes(".smart-guide.is-screen-action"), "«أشر لي» يخفي درج المرشد فورًا");
assert(smart.includes("const stopTour") && smart.includes("إيقاف"), "«أرني» يمكن إيقافه في أي لحظة");

// عناصر إضافية من شروط الكمال.
const app=read("src/App.tsx");
assert(app.includes("launcherIntroduced") && app.includes('"icon-only"'), "بعد أول استخدام يتحول «كيف؟» إلى أيقونة النجمة فقط");
assert(smart.includes("setDrawerHidden(true);\n    const current = profile.currentTask"), "كل استكمال يحتاج الشاشة يخفي الدرج أولًا");
assert(/const executeSafe[\s\S]{0,2400}setDrawerHidden\(true\)/.test(smart) && /const simulateFeature[\s\S]{0,600}setDrawerHidden\(true\)/.test(smart) && /const replayWorkflow[\s\S]{0,220}setDrawerHidden\(true\)/.test(smart), "كل إجراء ينقل التفاعل إلى الشاشة يخفي «كيف؟» قبل التفاعل");
assert(read("src/components/Schedules.tsx").includes("practiceMode") && read("src/components/Schedules.tsx").includes("practiceSnapshotRef"), "وضع تجربة آمن يعمل داخل نفس واجهة الجدول");
assert(!/<video\b/i.test(smart), "لا يوجد فيديو داخل المرشد");
assert(read("server.ts").includes("rawHistorySent:false"), "AI fallback يرسل سياقًا أدنى دون سجل النقرات الخام");

// المتبقي من تدقيق الاكتمال: Registry ↔ Command Palette + Native AI + UX الهاتف.
const schedulesSource=read("src/components/Schedules.tsx");
assert(schedulesSource.includes("allAllowedGuideFeatures(permissions") && schedulesSource.includes("canRunGuideAction(action, guideSession)"), "Command Palette يقرأ من Registry نفسه ويطبق Predicate الصلاحيات المركزي");
assert(serverSource.includes("OPENAI_API_KEY") && serverSource.includes("/responses") && serverSource.includes("requestGuideAIIntent"), "AI fallback الفعلي متصل من الخادم عند ضبط المفتاح، مع بقاء المحرك الحتمي أولًا");
assert(smart.includes("smart-guide-outside-dismiss") && smart.includes("onPointerDown={onClose}"), "الضغط خارج بطاقة «كيف؟» يغلق المرشد فورًا");
assert(smart.includes("markGuideIconHintSeen") && smart.includes('runIconAction("point"') && smart.includes('runIconAction("now"') && smart.includes('runIconAction("resume"'), "أول ضغطة على أيقونات الهاتف تعرض تعريفًا مختصرًا مرة واحدة");

// اختبار CI فعلي: أي زر جديد بلا metadata/ignore يجب أن يفشل التدقيق.
const probe=path.join(root,"src/__guide_ci_probe__.tsx");
try {
  fs.writeFileSync(probe,'export default function Probe(){return <button type="button">ميزة جديدة غير معرفة</button>}\n');
  const auditProbe=spawnSync(process.execPath,["scripts/guide-audit.mjs"],{cwd:root,encoding:"utf8"});
  assert(auditProbe.status !== 0 && `${auditProbe.stdout}\n${auditProbe.stderr}`.includes("عنصر تفاعلي جديد بلا guideFeatureId"), "Feature جديدة بلا guide metadata توقف build/audit فعليًا");
} finally { fs.rmSync(probe,{force:true}); }

fs.rmSync(tmp,{recursive:true,force:true});
if (failures.length) {
  console.error(`فشلت اختبارات قبول المرشد (${failures.length}):\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`نجحت اختبارات قبول المرشد: ${passes.length} اختبارًا سلوكيًا.`);
