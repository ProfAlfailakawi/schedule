import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];
const warnings = [];

async function loadTypescript() {
  try { return await import("typescript"); }
  catch {
    const fallback = "/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js";
    if (fs.existsSync(fallback)) return await import(pathToFileURL(fallback).href);
    throw new Error("تعذر تحميل TypeScript اللازم لتدقيق JSX/AST.");
  }
}
const tsModule = await loadTypescript();
const ts = tsModule.default || tsModule;

const sourceFiles = [];
function walk(dir) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    const stat = fs.statSync(path.join(root, rel));
    if (stat.isDirectory()) walk(rel);
    else if (/\.tsx?$/.test(name)) sourceFiles.push(rel.replaceAll("\\", "/"));
  }
}
walk("src");

function source(file) {
  const text = read(file);
  return { file, text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS) };
}
const parsed = new Map(sourceFiles.map(file => [file, source(file)]));
const registrySource = parsed.get("src/guide/smartGuide.ts");
const appSource = parsed.get("src/App.tsx");
if (!registrySource || !appSource) throw new Error("ملفات المرشد الأساسية غير موجودة.");

function propName(node) {
  return node?.name?.getText?.() || "";
}
function literal(node) {
  if (!node) return undefined;
  if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) return node.text;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    const out = {};
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      out[propName(p)] = literal(p.initializer);
    }
    return out;
  }
  return undefined;
}
function findConstArray(ast, name) {
  let found = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      found = node.initializer.elements.filter(ts.isObjectLiteralExpression).map(literal);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
}

const features = findConstArray(registrySource.ast, "GUIDE_FEATURES");
const actions = findConstArray(registrySource.ast, "GUIDE_ACTIONS");
const journeys = findConstArray(registrySource.ast, "GUIDE_JOURNEYS");
const featureIds = new Set(features.map(f => String(f.id || "")));
const featureById = new Map(features.map(f => [String(f.id || ""), f]));

if (!features.length) failures.push("تعذر قراءة GUIDE_FEATURES من AST.");
if (!actions.length) failures.push("تعذر قراءة GUIDE_ACTIONS من AST.");
if (!journeys.length) failures.push("تعذر قراءة GUIDE_JOURNEYS من AST.");

for (const f of features) {
  const id = String(f.id || "");
  if (!id) failures.push("ميزة في GUIDE_FEATURES بلا id.");
  if (!String(f.title || "").trim()) failures.push(`ميزة بلا عنوان: ${id}`);
  if (!String(f.summary || "").trim()) failures.push(`ميزة بلا شرح مختصر: ${id}`);
  if (!String(f.group || "").trim()) failures.push(`ميزة بلا تصنيف: ${id}`);
  if (!Array.isArray(f.keywords) || !f.keywords.length) failures.push(`ميزة بلا كلمات فهم: ${id}`);
  if (!Number(f.version || 0)) failures.push(`ميزة بلا رقم إصدار: ${id}`);
  if (f.risk && !["read","prepare","write","sensitive"].includes(String(f.risk))) failures.push(`مستوى مخاطر غير صالح: ${id}`);
}

const staticTargets = new Map();
const dynamicTargetPrefixes = [];
for (const {text} of parsed.values()) {
  for (const match of text.matchAll(/data-guide-target\s*=\s*\{\s*`([^`$]*)\$\{/g)) if (match[1]) dynamicTargetPrefixes.push(match[1]);
}
const targetPresent = target => staticTargets.has(target) || dynamicTargetPrefixes.some(prefix => String(target).startsWith(prefix));
const featureMarkers = new Map();
const ignoreReasons = [];
const controls = [];

function jsxAttr(opening, attrName) {
  const attr = opening.attributes?.properties?.find(p => ts.isJsxAttribute(p) && p.name.getText() === attrName);
  if (!attr || !ts.isJsxAttribute(attr)) return undefined;
  if (!attr.initializer) return true;
  if (ts.isStringLiteral(attr.initializer)) return attr.initializer.text;
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression && ts.isStringLiteralLike(attr.initializer.expression)) return attr.initializer.expression.text;
  return "<dynamic>";
}
function jsxText(node) {
  let parts = [];
  function visit(n) {
    if (ts.isJsxText(n)) parts.push(n.getText());
    else if (ts.isStringLiteralLike(n)) parts.push(n.text);
    ts.forEachChild(n, visit);
  }
  visit(node);
  return parts.join(" ").replace(/\s+/g," ").trim();
}

for (const [file, {ast}] of parsed) {
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText();
      const target = jsxAttr(opening, "data-guide-target");
      const featureId = jsxAttr(opening, "data-guide-feature-id");
      const ignore = jsxAttr(opening, "data-guide-ignore");
      const title = jsxAttr(opening, "title");
      const aria = jsxAttr(opening, "aria-label");
      if (typeof target === "string" && target !== "<dynamic>") {
        if (!staticTargets.has(target)) staticTargets.set(target, []);
        staticTargets.get(target).push(file);
      }
      if (typeof featureId === "string" && featureId !== "<dynamic>") {
        if (!featureMarkers.has(featureId)) featureMarkers.set(featureId, []);
        featureMarkers.get(featureId).push(file);
      }
      if (ignore !== undefined) ignoreReasons.push({file, line: ast.getLineAndCharacterOfPosition(opening.getStart()).line + 1, reason:ignore});
      const isControl = tag === "button" || /Button$/.test(tag);
      if (isControl && file !== "src/components/SmartGuide.tsx") {
        controls.push({
          file,
          line: ast.getLineAndCharacterOfPosition(opening.getStart()).line + 1,
          tag,
          target,
          featureId,
          ignore,
          label: [typeof title === "string" ? title : "", typeof aria === "string" ? aria : "", jsxText(node)].join(" ").replace(/\s+/g," ").trim().slice(0,280),
          source: opening.getText().replace(/\s+/g," ").trim().slice(0,320),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

for (const {file,line,reason} of ignoreReasons) {
  if (reason === true || reason === "true" || reason === "" || reason === "<dynamic>") failures.push(`data-guide-ignore يجب أن يحمل سببًا موثقًا: ${file}:${line}`);
}
for (const [id, files] of featureMarkers) if (!featureIds.has(id)) failures.push(`data-guide-feature-id غير مسجل (${id}) في ${files[0]}`);
for (const [target, files] of staticTargets) if (!featureIds.has(target)) failures.push(`هدف حي بلا تعريف مركزي (${target}) في ${files[0]}`);

for (const f of features) {
  if (typeof f.target === "string" && f.target && !targetPresent(f.target)) failures.push(`ميزة تشير إلى target غير موجود في JSX: ${f.id} → ${f.target}`);
  for (const step of Array.isArray(f.steps) ? f.steps : []) {
    if (step?.target && !targetPresent(String(step.target))) failures.push(`خطوة إرشاد تشير إلى target غير موجود: ${f.id} → ${step.target}`);
    if (step?.selector && !selectorLooksPresent(String(step.selector))) failures.push(`خطوة إرشاد تشير إلى selector لم يعد موجودًا: ${f.id} → ${step.selector}`);
  }
}

function selectorLooksPresent(selector) {
  const all = [...parsed.values()].map(item => item.text).join("\n");
  return selector.split(",").some(raw => {
    const item = raw.trim();
    const klass = item.match(/^\.([\w-]+)/)?.[1];
    if (klass) return all.includes(klass);
    const attr = item.match(/^\[([\w-]+)/)?.[1];
    if (attr) return all.includes(attr);
    return true;
  });
}

const actionFeatureIds = new Set(actions.map(action => String(action.featureId || "")));
for (const feature of features) {
  if (feature.safeAction && !actionFeatureIds.has(String(feature.id || ""))) failures.push(`ميزة لديها safeAction بلا Guide Action مركزي: ${feature.id}`);
}

for (const action of actions) {
  const id = String(action.id || "");
  if (!featureIds.has(String(action.featureId || ""))) failures.push(`Action يشير إلى ميزة غير معرفة: ${id}`);
  if (!featureIds.has(String(action.permissionFeatureId || ""))) failures.push(`Action بلا مرجع صلاحية صالح: ${id}`);
  if (!["read","prepare","write","sensitive"].includes(String(action.risk || ""))) failures.push(`Action بلا risk صالح: ${id}`);
  if (!action.verify || !String(action.verify.value || "").trim()) failures.push(`Action بلا verification: ${id}`);
  if (typeof action.requiresConfirmation !== "boolean") failures.push(`Action بلا confirmation policy: ${id}`);
  if (["write","sensitive"].includes(String(action.risk)) && action.requiresConfirmation !== true) failures.push(`Action ${action.risk} يجب أن يتطلب تأكيدًا: ${id}`);
}
for (const journey of journeys) {
  const id = String(journey.id || "");
  if (!featureIds.has(String(journey.featureId || ""))) failures.push(`Journey يشير إلى ميزة غير معرفة: ${id}`);
  if (!Array.isArray(journey.successConditions) || !journey.successConditions.length) failures.push(`Journey بلا success predicate: ${id}`);
  if (!Array.isArray(journey.failureConditions) || !journey.failureConditions.length) failures.push(`Journey بلا failure predicate: ${id}`);
  if (!Array.isArray(journey.steps) || !journey.steps.length) failures.push(`Journey بلا خطوات: ${id}`);
  if (!Number(journey.timeoutMs || 0)) failures.push(`Journey بلا timeout: ${id}`);
}

// CI gate for every NEW interactive control. Existing unannotated controls are
// frozen in a reviewed baseline; anything added after this point must carry
// data-guide-feature-id / data-guide-target, or an explicit documented ignore.
const controlBaselineFile = path.join(root, "scripts/guide-control-baseline.json");
const controlFingerprint = (c) => `${c.file}|${c.tag}|${String(c.label || "").replace(/\d+/g,"#").replace(/\s+/g," ").trim().slice(0,140)}|${String(c.source || "").replace(/\d+/g,"#").replace(/\s+/g," ").trim().slice(0,180)}`;
const unannotatedControls = controls.filter(c => !c.target && !c.featureId && !(typeof c.ignore === "string" && c.ignore.length > 5));
if (process.env.GUIDE_UPDATE_CONTROL_BASELINE === "1") {
  const fingerprints = [...new Set(unannotatedControls.map(controlFingerprint))].sort();
  fs.writeFileSync(controlBaselineFile, JSON.stringify({ version:1, generatedAt:new Date().toISOString(), fingerprints }, null, 2) + "\n");
  console.log(`تم تحديث خط أساس عناصر المرشد: ${fingerprints.length} عنصرًا موروثًا.`);
}
const baseline = exists("scripts/guide-control-baseline.json") ? JSON.parse(read("scripts/guide-control-baseline.json")) : {fingerprints:[]};
const baselineSet = new Set(Array.isArray(baseline?.fingerprints) ? baseline.fingerprints : []);
for (const c of unannotatedControls) {
  const fingerprint = controlFingerprint(c);
  if (baselineSet.has(fingerprint)) continue;
  failures.push(`عنصر تفاعلي جديد بلا guideFeatureId/target أو ignore موثق: ${c.file}:${c.line} «${c.label.slice(0,90)}»`);
}

// كل أداة مؤثرة يجب أن تكون مسجلة أو مفسرة بسبب واضح.
const important = /حذف|نشر|اعتماد|استعادة|استيراد|تصدير|استبدال|نقل|تغيير\s+(?:القاعة|الأستاذ|الاستاذ|الوقت)|طبّق\s+النقل|حفظ\s+المسودة/;
for (const c of controls) {
  if (!important.test(c.label)) continue;
  if (c.target || c.featureId || (typeof c.ignore === "string" && c.ignore.length > 5)) continue;
  failures.push(`عنصر مؤثر بلا guideFeatureId/target أو ignore موثق: ${c.file}:${c.line} «${c.label.slice(0,90)}»`);
}

const app = appSource.text;
const pathBlock = app.match(/const pathByView:[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
const views = new Set(pathBlock ? [...pathBlock[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*"/gm)].map(m => m[1]) : []);
for (const view of views) if (!featureIds.has(`page.${view}`)) failures.push(`لا يوجد تعريف للواجهة: page.${view}`);

const smart = read("src/components/SmartGuide.tsx");
const schedules = read("src/components/Schedules.tsx");
const intelligence = read("src/components/IntelligenceWorkspace.tsx");
const css = read("src/styles/03-shell.css");
const server = read("server.ts");
const packageJson = JSON.parse(read("package.json"));

const tokens = [
  [registrySource.text,"canAccessGuideFeature","Predicate صلاحيات مركزي"],
  [smart,"allAllowedGuideFeatures","البحث عبر ميزات مصفاة مركزيًا"],
  [registrySource.text,"recordFeatureEvent","نتائج حقيقية بدل نجاح النقرة"],
  [registrySource.text,"GUIDE_JOURNEYS","Journey Engine"],
  [registrySource.text,"medianCompletionMs","Baseline زمني"],
  [registrySource.text,"evaluateGuideFriction","محرك تعثر low/medium/high"],
  [registrySource.text,"GUIDE_ACTIONS","Action Registry"],
  [registrySource.text,"GuideTransaction","Transaction/Undo"],
  [registrySource.text,"parseStructuredGuideIntent","فهم اللغة المركبة"],
  [smart,"/api/guide/intent","AI fallback اختياري"],
  [registrySource.text,"classifyGuideReason","Reason Classifier"],
  [registrySource.text,"discoverVisibleControls","Runtime discovery"],
  [smart,"schedule-guide-simulation","Simulation handoff"],
  [schedules,"practiceMode","Practice Mode"],
  [schedules,"schedule-guide-ghost-diff","Ghost Diff"],
  [app,"smart-guide-ambient-next","Ambient Next Step"],
  [server,"/api/intelligence/guide-friction","Product friction telemetry"],
  [css,"smart-guide-fab.icon-only","Expert/after-first-use icon-only launcher"],
  [css,"smart-guide.level-peek","Progressive mobile sheet"],
  [smart,"setDrawerHidden(true)","إخفاء الدرج عند التعامل مع الشاشة"],
  [server,"canAccessGuideFeature(feature", "Predicate الصلاحيات المركزي مستخدم أيضًا في fallback الخادم"],
  [schedules,"allAllowedGuideFeatures", "سجل الميزات مربوط بلوحة الأوامر"],
  [schedules,"canRunGuideAction", "لوحة الأوامر تستخدم صلاحيات Action Registry المركزية"],
  [server,"OPENAI_API_KEY", "AI fallback فعلي عبر مزود أصلي عند عدم ضبط Adapter خارجي"],
  [server,"/responses", "AI fallback يستخدم Responses API من الخادم فقط"],
  [smart,"smart-guide-outside-dismiss", "النقر خارج بطاقة المرشد يغلقها"],
  [smart,"markGuideIconHintSeen", "تعريف أول ضغطة لأيقونات الهاتف"],
];
for (const [text, token, label] of tokens) if (!text.includes(token)) failures.push(`آلية ناقصة: ${label}`);

for (const file of sourceFiles) {
  const text = read(file);
  if (/className=["'{`][^\n]*page-help-action/.test(text)) failures.push(`زر مساعدة عام قديم ما زال مستخدمًا: ${file}`);
}
if (/<video\b|\bvideo\s*:/i.test(smart)) failures.push("المرشد يحتوي فيديو رغم اعتماد الإرشاد الحي.");
if (/recordFeatureUse\([^\n]*["']success["']/.test([app,smart,schedules].join("\n"))) failures.push("يوجد نجاح مبني على recordFeatureUse بدل تحقق النتيجة الفعلية.");
if (!intelligence.includes("copy[index] = after")) failures.push("المحاكاة لا تطبق التغيير المطلوب على نسخة Sandbox.");
if (!css.includes("body.guide-point-mode .smart-guide") && !css.includes(".smart-guide.is-screen-action")) failures.push("وضع أشر لي لا يخفي درج المرشد.");
if (!/smart-guide-browse[\s\S]{0,350}repeat\(4/.test(css)) failures.push("تبويبات الهاتف ليست أربعة أقسام مضغوطة.");
if (!css.includes("prefers-reduced-motion")) failures.push("الحركة لا تحترم prefers-reduced-motion.");
if (server.includes("rawHistory") && !server.includes("rawHistorySent:false")) warnings.push("راجع سياق AI للتأكد من عدم إرسال سجل خام.");
if (/GUIDE_(?:ADMIN|ROOT|PERMISSION)_FEATURES/.test(server)) failures.push("الخادم يكرر خرائط صلاحيات المرشد بدل استخدام canAccessGuideFeature المركزي.");
if (!String(packageJson.scripts?.build || "").includes("audit:guide")) failures.push("production build لا يشغل guide audit.");
if (!String(packageJson.scripts?.build || "").includes("test:guide")) failures.push("production build لا يشغل guide behavior tests.");
if (!String(packageJson.scripts?.build || "").includes("test:guide:perf")) failures.push("production build لا يشغل ميزانية أداء المرشد.");

if (failures.length) {
  console.error("فشل تدقيق مرشد SCHEDULE:\n- " + failures.join("\n- "));
  if (warnings.length) console.error("\nتحذيرات:\n- " + warnings.join("\n- "));
  process.exit(1);
}
if (warnings.length) console.warn("تحذيرات غير مانعة:\n- " + warnings.join("\n- "));
console.log(`مرشد SCHEDULE سليم بنيويًا: ${features.length} ميزة معرفة، ${staticTargets.size} هدفًا حيًا، ${views.size} واجهة، ${actions.length} إجراءً، ${journeys.length} رحلة.`);
