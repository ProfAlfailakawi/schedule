import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const registry = read("src/guide/smartGuide.ts");
const app = read("src/App.tsx");
const sourceFiles = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    const full = path.join(root, rel);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(rel);
    else if (/\.tsx?$/.test(name)) sourceFiles.push(rel);
  }
};
walk("src");

const featureIds = new Set([...registry.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]));
const staticTargets = new Set();
for (const file of sourceFiles) {
  const text = read(file);
  for (const match of text.matchAll(/data-guide-target\s*=\s*"([^"]+)"/g)) {
    if (!match[1].includes("${")) staticTargets.add(match[1]);
  }
}

const pathBlock = app.match(/const pathByView:[\s\S]*?=\s*\{([\s\S]*?)\n\};/);
const views = new Set(pathBlock ? [...pathBlock[1].matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*"/gm)].map((match) => match[1]) : []);
const failures = [];
for (const view of views) {
  if (!featureIds.has(`page.${view}`)) failures.push(`لا يوجد تعريف للواجهة: page.${view}`);
}
for (const target of staticTargets) {
  if (!featureIds.has(target)) failures.push(`عنصر مرشد بلا تعريف: ${target}`);
}

const allSource = sourceFiles.map(read).join("\n");
const guideSelectors = [...registry.matchAll(/selector:\s*"([^"]+)"/g)].map((match) => match[1]);
for (const selector of guideSelectors) {
  const alternatives = selector.split(",").map((item) => item.trim()).filter(Boolean);
  const exists = alternatives.some((item) => {
    const classMatch = item.match(/^\.([A-Za-z0-9_-]+)/);
    if (classMatch) return allSource.includes(classMatch[1]);
    const attrMatch = item.match(/^\[([A-Za-z0-9_-]+)/);
    if (attrMatch) return allSource.includes(attrMatch[1]);
    return true;
  });
  if (!exists) failures.push(`خطوة إرشاد تشير إلى عنصر لم يعد موجودًا: ${selector}`);
}
for (const file of sourceFiles) {
  const text = read(file);
  if (/className="page-help-action"/.test(text)) failures.push(`زر مساعدة قديم ما زال موجودًا: ${file}`);
  if (/aria-label="شرح مركز الذكاء"/.test(text)) failures.push(`شرح منفصل قديم ما زال موجودًا: ${file}`);
}

const smartGuide = read("src/components/SmartGuide.tsx");
const requiredFeatures = [
  "schedule.action.move-room",
  "schedule.action.change-time",
  "schedule.action.change-instructor",
  "schedule.action.find-room",
  "schedule.tool.review",
  "intelligence.scene.try",
];
for (const id of requiredFeatures) if (!featureIds.has(id)) failures.push(`ميزة أساسية مفقودة من المرشد: ${id}`);
const requiredMechanisms = [
  [registry, "discoverVisibleControls", "الاكتشاف التلقائي للميزات"],
  [registry, "masteryScore", "تعلم إتقان المستخدم"],
  [registry, "commonWorkflows", "تعلم المسارات المعتادة"],
  [registry, "changedFeatures", "ما الجديد لكل مستخدم"],
  [registry, "predictedNextFeature", "توقع الخطوة التالية"],
  [registry, "dialectIntentTerms", "فهم اللهجة الكويتية"],
  [registry, "setGuideTask", "خيط المهمة والاستكمال"],
  [smartGuide, "أشر لي", "الإشارة إلى عنصر حي"],
  [smartGuide, "ماذا يحدث الآن؟", "شرح السياق الحالي"],
  [smartGuide, "ماذا يمكنني أن أفعل هنا؟", "استكشاف الشاشة"],
  [smartGuide, "أكمل من حيث توقفت", "استكمال المهمة"],
  [smartGuide, "أرني على شاشتي", "الإرشاد الحي"],
  [smartGuide, "أكمل عني", "المساعدة التنفيذية الآمنة"],
  [smartGuide, "جرّب دون تغيير", "المحاكاة دون لمس الجدول"],
  [smartGuide, "لماذا هذا الاقتراح؟", "تفسير التوصية"],
];
for (const [text, token, label] of requiredMechanisms) if (!text.includes(token)) failures.push(`آلية المرشد مفقودة: ${label}`);
if (/فيديو|<video\b/i.test(smartGuide)) failures.push("المرشد يحتوي على فيديو رغم اعتماد الإرشاد الحي بدل الفيديو");

if (failures.length) {
  console.error("فشل تدقيق مرشد SCHEDULE:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log(`مرشد SCHEDULE سليم: ${featureIds.size} ميزة معرفة، ${staticTargets.size} هدفًا حيًا، ${views.size} واجهة مغطاة.`);
