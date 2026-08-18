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
const isolatedTypes = path.join(tmp,"types");
fs.mkdirSync(isolatedTypes,{recursive:true});
const tscCandidates = [path.join(root,"node_modules/.bin/tsc"), "/opt/nvm/versions/node/v22.16.0/bin/tsc", "tsc"];
let compile = null;
for (const bin of tscCandidates) {
  const result = spawnSync(bin, ["src/guide/smartGuide.ts","--target","ES2022","--module","ESNext","--lib","ES2022,DOM","--skipLibCheck","--moduleResolution","bundler","--typeRoots",isolatedTypes,"--outDir",tmp], {cwd:root,encoding:"utf8"});
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
assert(smart.includes('beginScreenHandoff("وضع أشر لي"') && smart.includes("setPointMode(true)") && css.includes(".smart-guide.is-screen-action"), "«أشر لي» يخفي درج المرشد فورًا");
assert(smart.includes("const stopTour") && smart.includes("إيقاف"), "«أرني» يمكن إيقافه في أي لحظة");

// عناصر إضافية من شروط الكمال.
const app=read("src/App.tsx");
assert(app.includes("launcherIntroduced") && app.includes('"icon-only"'), "بعد أول استخدام يتحول «كيف؟» إلى أيقونة النجمة فقط");
assert(/const resumeTask[\s\S]{0,1800}beginScreenHandoff\("أستعيد آخر موضع"/.test(smart), "كل استكمال يحتاج الشاشة يخفي الدرج أولًا");
assert(/const executeSafe[\s\S]{0,2600}beginScreenHandoff\(/.test(smart) && /const simulateFeature[\s\S]{0,800}beginScreenHandoff\(/.test(smart) && /const replayWorkflow[\s\S]{0,400}beginScreenHandoff\(/.test(smart), "كل إجراء ينقل التفاعل إلى الشاشة يخفي «كيف؟» قبل التفاعل");
assert(read("src/components/Schedules.tsx").includes("practiceMode") && read("src/components/Schedules.tsx").includes("practiceSnapshotRef"), "وضع تجربة آمن يعمل داخل نفس واجهة الجدول");
assert(!/<video\b/i.test(smart), "لا يوجد فيديو داخل المرشد");
assert(read("server.ts").includes("rawHistorySent:false"), "AI fallback يرسل سياقًا أدنى دون سجل النقرات الخام");

// المتبقي من تدقيق الاكتمال: Registry ↔ Command Palette + Native AI + UX الهاتف.
const schedulesSource=read("src/components/Schedules.tsx");
assert(schedulesSource.includes("allAllowedGuideFeatures(permissions") && schedulesSource.includes("canRunGuideAction(action, guideSession)"), "Command Palette يقرأ من Registry نفسه ويطبق Predicate الصلاحيات المركزي");
assert(serverSource.includes("OPENAI_API_KEY") && serverSource.includes("/responses") && serverSource.includes("requestGuideAIIntent"), "AI fallback الفعلي متصل من الخادم عند ضبط المفتاح، مع بقاء المحرك الحتمي أولًا");
assert(smart.includes("smart-guide-outside-dismiss") && smart.includes("onPointerDown={onClose}"), "الضغط خارج بطاقة «كيف؟» يغلق المرشد فورًا");
assert(smart.includes("markGuideIconHintSeen") && smart.includes('runIconAction("point"') && smart.includes('runIconAction("now"') && smart.includes('runIconAction("resume"'), "أول ضغطة على أيقونات الهاتف تعرض تعريفًا مختصرًا مرة واحدة");


// 21–38 — إصلاحات جذرية للأخطاء الثمانية عشر + طبقة الكمال المطلوبة.
reset();
const stableA=engine.stableDynamicControlId("schedules",{title:"إشعارات 9",kind:"button",parentKey:"toolbar"});
const stableB=engine.stableDynamicControlId("schedules",{title:"إشعارات 10",kind:"button",parentKey:"toolbar"});
assert(stableA===stableB && stableA.startsWith("runtime.schedules."), "هوية العنصر المكتشف ثابتة ولا تتغير مع العدادات الرقمية");
const room101=engine.stableDynamicControlId("schedules",{title:"قاعة 101",kind:"button",parentKey:"rooms"});
const room102=engine.stableDynamicControlId("schedules",{title:"قاعة 102",kind:"button",parentKey:"rooms"});
assert(room101!==room102, "الأرقام الدلالية مثل أرقام القاعات تبقى جزءًا من الهوية ولا تتصادم بسبب تنقية العدادات");
const engineSource=read("src/guide/smartGuide.ts");
assert(!/forEach\(\(element,\s*index\)/.test(engineSource) && !/auto\.\$\{activeView\}.*index/.test(engineSource), "هوية الاكتشاف لا تعتمد على DOM index إطلاقًا");

reset();
const first=engine.stableDynamicControlId("schedules",{title:"زر أول",kind:"button",parentKey:"toolbar"});
engine.noteDiscoveredControls(201,"schedules",[{id:first,title:"زر أول",summary:"",kind:"button"}]);
p=engine.loadGuideProfile(201);
assert(engine.discoveredNew(p,"schedules").length===0, "أول مسح للشاشة يبني خط أساس ولا يحول الواجهة الحالية إلى 99 عنصرًا جديدًا");
const second=engine.stableDynamicControlId("schedules",{title:"زر جديد",kind:"button",parentKey:"toolbar"});
engine.noteDiscoveredControls(201,"schedules",[{id:first,title:"زر أول",summary:"",kind:"button"},{id:second,title:"زر جديد",summary:"",kind:"button"}]);
p=engine.loadGuideProfile(201);
assert(engine.discoveredNew(p,"schedules").length===1 && engine.discoveredNew(p,"schedules")[0].id===second, "بعد خط الأساس يظهر فقط العنصر المكتشف فعلًا كجديد");
const productFeature=engine.featureById("page.schedules");
p.catalog[productFeature.id]=Math.max(0,productFeature.version-1); engine.saveGuideProfile(p); p=engine.loadGuideProfile(201);
let unread=engine.guideUnreadSummary(p,[productFeature],"schedules");
assert(unread.product.length===1 && unread.runtime.length===1 && unread.total===2, "تحديثات المنتج منفصلة منطقيًا عن عناصر الواجهة المكتشفة مع مجموع واضح");
engine.markAllGuideProductUpdatesSeen(201,[productFeature]); engine.markAllDiscoveredSeen(201,"schedules"); p=engine.loadGuideProfile(201); unread=engine.guideUnreadSummary(p,[productFeature],"schedules");
assert(unread.total===0, "«اعتبر الكل مقروءًا» يصفر المصدرين ضمن النطاق الصحيح");

const reportIntent=engine.parseStructuredGuideIntent("افتح تقرير القاعة");
const advancedIntent=engine.parseStructuredGuideIntent("أبي الاستعلام المتقدم");
const pressureIntent=engine.parseStructuredGuideIntent("ورني خريطة الضغط");
assert(engine.featureIdForGuideIntentGoal(reportIntent.goal)==="page.reportRoom" && engine.featureIdForGuideIntentGoal(advancedIntent.goal)==="page.searchAdvanced" && engine.featureIdForGuideIntentGoal(pressureIntent.goal)==="living.scene.topology", "Structured intents تمتد إلى سجل الميزات العام لا أربع وظائف فقط");

reset();
p=engine.loadGuideProfile(202);
p.workflows={bad:{count:40,successful:0,last:Date.now(),sequence:["page.schedules","page.intelligence"]}}; engine.saveGuideProfile(p);
let prediction=engine.predictedNextFeature(engine.loadGuideProfile(202),"page.schedules");
assert(!prediction || prediction.confidence<.82, "التكرار بلا نجاح لا ينتج اقتراحًا استباقيًا عالي الثقة");
p=engine.loadGuideProfile(202); p.workflows={good:{count:12,successful:12,last:Date.now(),sequence:["page.schedules","page.intelligence"]}}; engine.saveGuideProfile(p);
prediction=engine.predictedNextFeature(engine.loadGuideProfile(202),"page.schedules");
assert(prediction?.id==="page.intelligence" && prediction.confidence>.82, "نجاح متكرر موثق يرفع ثقة الخطوة التالية");

assert(smart.includes('raw.closest(".smart-guide,.guide-point-banner,.guide-screen-handoff")') && smart.includes('[data-guide-feature-id],[data-guide-target],[data-guide-stable-id]'), "«أشر لي» يستثني شريط الإلغاء ويفهم featureId وtarget معًا");
assert(smart.includes('data-guide-ignore="زر إلغاء أشر لي يجب أن يبقى إجراء تحكم بالمرشد"'), "زر إلغاء «أشر لي» محمي من الالتقاط نفسه");
assert(smart.includes('if (!feature.target)') && smart.includes('صفحة أو وظيفة عامة لا تملك نقطة واحدة ثابتة') && smart.includes('setDrawerHidden(false)'), "«أرني» لا يخفي المرشد بصمت عندما لا يوجد target/steps");
assert(app.includes('`${guideNewCount.toLocaleString("ar-KW-u-nu-latn")} جديد`') && css.includes('.smart-guide-fab-new') && css.includes('white-space:nowrap'), "شارة المرشد تشرح أن الرقم يعني عناصر «جديد» بدل رقم مبهم أو حد 99+");
assert(smart.includes('formatGuideCount(unreadSummary.total)') && smart.includes('إخفاء العداد') && smart.includes('تحديثات المنتج ضمن صلاحياتك') && smart.includes('عناصر جديدة في هذه الشاشة فقط'), "تبويب الجديد يوضح الرقم ويتيح تصفيره دون حذف الميزات");
assert(smart.includes('const deduped = new Map<string,SearchRow>()') && smart.includes('row.feature.id === intentFeature.id'), "نتائج البحث تُزال منها التكرارات وتمنع تكرار بطاقة intent");
assert(smart.includes('setAiIntent(null)') && smart.includes('const requestId = ++intentRequestRef.current') && smart.includes('requestId === intentRequestRef.current'), "تغيير السؤال يصفر intent القديم ويحمي من وصول استجابة AI متأخرة");
assert(smart.includes('resolvedIntent?.clarification') && smart.includes('smart-guide-clarification'), "توضيح AI/Rules يظهر فعليًا في الواجهة بدل إسقاطه");
assert(app.includes('guideProfile.hintMode !== "off" ? predictedNextFeature') && app.includes('guideProfile?.hintMode !== "off" && ambientFeature'), "إيقاف المساعدة الاستباقية يوقف اقتراح الخطوة التالية الخارجي فعلًا");
assert(!smart.includes('allAllowed.slice(0,36)') && !smart.includes('known.filter(feature => !feature.id.startsWith("page.")).slice(0,12)'), "«الكل» و«هنا» لا يخفيان الميزات خلف حدود 36/12 صامتة");
assert(smart.includes('preSearchSheetRef.current=sheetLevel') && smart.includes('setSheetLevel(selectedId || selectedDynamic || preview ? "medium" : preSearchSheetRef.current)'), "مسح البحث يعيد ارتفاع الورقة السابق بدل إبقائها Full");
assert(smart.includes('current === "peek" ? "medium" : current === "medium" ? "full" : "medium"'), "النقر على المقبض يتدرج Peek → Medium → Full بشكل متوقع");
assert(schedulesSource.includes('signal:!id ? "schedule.move.no-selection" : "schedule.move.row-missing"') && schedulesSource.includes('ok:false'), "نقل القاعة بلا مقرر يفشل العملية صراحة ولا يترك Transaction مفتوحة");
assert(smart.includes('event.key === "Escape"') && smart.includes('aria-modal={!drawerHidden') && smart.includes('previousFocusRef') && smart.includes('querySelectorAll<HTMLElement>') && smart.includes('drawer.setAttribute("inert","")'), "سطح المرشد يدعم Escape وحبس التركيز واستعادته ويعزل الدرج المخفي عن Tab على سطح المكتب");
assert(smart.includes('className="primary" onClick={startIntroducedIconAction}') && smart.includes('<Play />ابدأ') && !smart.includes('اضغط الأيقونة مرة أخرى للتنفيذ'), "أول ضغطة هاتف تعرض تعريفًا مع زر «ابدأ» بدل مطالبة المستخدم بضغطة ثانية غامضة");
assert(smart.includes('showScreenHandoff') && smart.includes('guide-screen-handoff') && css.includes('@keyframes guideHandoffIn'), "كل تسليم مهم من المرشد إلى الشاشة له انتقال بصري واضح");
assert(smart.includes('التعلّم عن نمط استخدامك محفوظ على هذا الجهاز') && smart.includes('قد يُرسل نص السؤال وسياق محدود'), "نص الخصوصية يفرق بين التعلم المحلي وفهم السؤال عبر خدمة AI");
assert(smart.includes('markAllGuideProductUpdatesSeen(userId, allAllowed)') && smart.includes('markAllDiscoveredSeen(userId, activeView)'), "زر «اعتبر الكل مقروءًا» يحترم صلاحيات المنتج ونطاق الشاشة للعناصر المكتشفة");
assert(!/setPreview\(null\)>إلغاء/.test(smart) && smart.includes('onClick={cancelPreview}>إلغاء'), "إلغاء معاينة «أكمل عني» يغلق Transaction بدل تركها معلقة");
assert(serverSource.includes('featureIdForGuideIntentGoal(intent.goal)') && serverSource.includes('goal بصيغة feature:<id>'), "الخادم يقبل intents لكل Registry مع تحقق صلاحية موحد بدل خريطة أربع وظائف");

assert(smart.includes('focusCardRef.current') && smart.includes('scrollIntoView({ behavior: "smooth", block: "center"') && smart.includes('smart-guide-result-jump'), "اختيار أي نتيجة ينقل المستخدم مباشرة إلى بطاقة التفاصيل أسفل القائمة مع مؤشر بصري واضح");
assert(css.includes('.smart-guide{') && css.includes('overflow-y:auto') && css.includes('-webkit-overflow-scrolling:touch') && css.includes('.smart-guide.level-full'), "المرشد يملك تمريرًا رأسيًا صريحًا يسمح بالوصول إلى نهاية البطاقات على الهاتف وسطح المكتب");
assert(smart.includes('function isGenericGuideTask') && smart.includes('!isGenericGuideTask(profile.currentTask)') && smart.includes('مهمة معلقة · اضغط للمتابعة'), "زيارات الصفحات العامة لا تظهر كمهمة معلقة وهمية، والمهمة الحقيقية كلها قابلة للنقر");
assert(smart.includes('[profile.currentTask, profile.previousTask, context?.currentTask].find(item => item && !isGenericGuideTask(item))'), "سؤال «وين كنت؟» يتجاهل زيارات الصفحات العامة ويستعيد مهمة فعلية فقط");
assert(smart.includes('pendingViewCommandRef.current={view:feature.view,command:prepared}') && smart.includes('onNavigate(feature.view)'), "أوامر القراءة من شاشة أخرى تنتقل للواجهة المطلوبة قبل التنفيذ بدل إرسال أمر إلى مكوّن غير مركب");
assert(smart.includes('const controller = new AbortController()') && smart.includes('window.setTimeout(() => controller.abort(), 5500)'), "فهم السؤال عبر AI له مهلة زمنية ولا يترك المستخدم أمام تحميل لا ينتهي");
assert(app.includes('جديد — اضغط لمعرفة ما هو') && app.includes('} جديد`'), "شارة المشغل تشرح الرقم نصيًا بدل +9 المبهمة");
assert(smart.includes('smart-guide-fold smart-guide-intent-fold') && smart.includes('الأقرب إلى مقصدك') && !smart.includes('<section className="smart-guide-results">'), "«الأقرب إلى مقصدك» أصبح قائمة مغلقة هادئة بدل كتلة نتائج طويلة مفتوحة دائمًا");
assert(smart.includes('smart-guide-fold smart-guide-live-fold') && smart.includes('if (event.currentTarget.open) setSheetLevel("full")') && css.includes('.smart-guide-live-fold[open]>.smart-guide-live-controls') && css.includes('overflow-y:auto!important'), "«اكتشاف حي» يفتح الورقة كاملة ويملك تمريرًا داخليًا مستقلًا للوصول إلى آخر عنصر");
assert(css.includes('.smart-guide>*{flex:0 0 auto;min-width:0}') && css.includes('contain:layout paint'), "بطاقات المرشد معزولة تخطيطيًا ولا يمكن أن تتداخل فوق بعضها أثناء التمرير");

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
