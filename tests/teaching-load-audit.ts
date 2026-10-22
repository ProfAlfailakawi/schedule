/**
 * النصاب التدريسي (ميزةٌ اختيارية): الحسابُ، والتحقّق، وبياناتُ الديمو، وأنها لا تمنع شيئاً ولا تلمس غيرها.
 */
import fs from "node:fs";
import { createDemoSandboxState } from "../src/db/demoSandbox";
import {
  emptyTeachingLoadConfig, evaluateTeachingLoad, hoursLabel, normalizeTeachingLoadConfig, teachingHoursByInstructor, teachingLoadLimits, teachingLoadProblem,
} from "../src/utils/teachingLoad";

let passed = 0, failed = 0;
function check(ok: boolean, label: string) {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); } else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
}

/* ── الحساب ── */
const config = normalizeTeachingLoadConfig({
  enabled: true,
  ranks: [{ id: "p", name: "أستاذ", minHours: 9, maxHours: 12 }, { id: "a", name: "مساعد", minHours: 12, maxHours: 15 }],
  assignments: { "1": { rankId: "p" }, "2": { rankId: "p", extraHours: 2 }, "3": { rankId: "p", maxHours: 6 }, "4": { rankId: "ghost" }, "x": { rankId: "p" } },
});
check(config.enabled && config.ranks.length === 2, "الإعداد يُنقّى: درجتان ومفعَّل");
check(!config.assignments["4"]?.rankId && !config.assignments["x"], "درجةٌ غير موجودة وعضوٌ غير صالح يُسقطان بصمت");
check(normalizeTeachingLoadConfig(undefined).enabled === false && normalizeTeachingLoadConfig(null).ranks.length === 0, "ما لم يُكتب بعدُ: إعدادٌ فارغٌ معطَّل — لا ميزةَ بلا تفعيل");
check(emptyTeachingLoadConfig().enabled === false, "الميزة اختيارية: معطَّلةٌ افتراضياً");

const courseHours = new Map<number, number>([[10, 3], [11, 3], [12, 4]]);
const hours = teachingHoursByInstructor([
  { AdInstructorId: 1, AdCourseId: 10, SCode: "01" }, { AdInstructorId: 1, AdCourseId: 10, SCode: "01" }, // صفّان لشعبةٍ واحدة
  { AdInstructorId: 1, AdCourseId: 10, SCode: "02" }, { AdInstructorId: 1, AdCourseId: 11, SCode: "01" }, { AdInstructorId: 1, AdCourseId: 12, SCode: "01" },
  { AdInstructorId: 2, AdCourseId: 10, SCode: "01" }, { AdInstructorId: 0, AdCourseId: 10, SCode: "01" }, { AdInstructorId: 5, AdCourseId: 99, SCode: "01" },
] as any, courseHours);
check(hours.get(1) === 13, "العبء: الشعبة (مقرر+رمز) مرةً واحدة مهما تعدّدت صفوفها — 3+3+3+4 = 13");
check(hours.get(2) === 3 && !hours.has(0) && !hours.has(5), "بلا أستاذ أو بمقررٍ بلا ساعات: لا يُحسب");

check(evaluateTeachingLoad(config, 1, 13).state === "over" && evaluateTeachingLoad(config, 1, 13).excess === 1, "13 من 12 ← تجاوز ساعةٍ واحدة");
check(evaluateTeachingLoad(config, 1, 12).state === "within", "12 من 12 ← ضمن النصاب (الحدّ نفسُه ليس تجاوزاً)");
check(evaluateTeachingLoad(config, 2, 13).state === "within" && teachingLoadLimits(config, 2).allowed === 14, "الساعات الإضافية تُضاف إلى الحدّ الأعلى: 12+2 = 14");
check(evaluateTeachingLoad(config, 2, 15.5).excess === 1.5, "التجاوز بعد الإضافية يُقال بمقداره: 15.5 − 14 = 1.5");
check(evaluateTeachingLoad(config, 3, 7).state === "over" && evaluateTeachingLoad(config, 3, 7).excess === 1, "النصاب الخاصّ بالعضو يتقدّم على نصاب الدرجة (6)");
check(evaluateTeachingLoad(config, 1, 5).state === "under", "دون الحدّ الأدنى: حالةٌ للإعداد، لا تنبيه");
check(evaluateTeachingLoad(config, 4, 40).state === "unset" && evaluateTeachingLoad(config, 99, 40).state === "unset", "بلا درجةٍ ولا نصاب: غيرُ مضبوط — لا يُفرض رقمٌ مخترَع");
check(hoursLabel(4) === "4 ساعات" && hoursLabel(2) === "ساعتان", "الصياغة العربية: ساعتان · 4 ساعات");

/* ── التحقّق ── */
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 12, maxHours: 9 }] })?.includes("أكبر") === true, "أدنى > أعلى مرفوض");
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 1, maxHours: 2 }, { name: " أ ", minHours: 1, maxHours: 2 }] })?.includes("مكرّرة") === true, "اسمُ درجةٍ مكرّر مرفوض");
check(teachingLoadProblem({ ranks: [{ name: "", minHours: 1, maxHours: 2 }] }) !== null, "درجةٌ بلا اسم مرفوضة");
check(teachingLoadProblem({ ranks: [{ name: "أ", minHours: 0, maxHours: 99 }] }) !== null, "نصابٌ فوق الحدّ المعقول مرفوض");
check(teachingLoadProblem({ ranks: [], assignments: { "1": { extraHours: 99 } } }) !== null && teachingLoadProblem({ ranks: [], assignments: { "1": { minHours: 9, maxHours: 3 } } }) !== null, "ساعاتٌ إضافية مفرطة، وأدنى>أعلى للعضو: مرفوضان");
check(teachingLoadProblem({ ranks: [{ name: "أستاذ", minHours: 9, maxHours: 12 }], assignments: { "1": { rankId: "x", extraHours: 2 } } }) === null, "إعدادٌ سليم يمرّ");

/* ── الديمو: حالتان تكفيان للشرح ── */
{
  const demo = createDemoSandboxState() as any;
  const cfg = normalizeTeachingLoadConfig(demo.teachingLoadConfig?.[0]);
  check(cfg.enabled && cfg.ranks.length >= 3 && Object.keys(cfg.assignments).length >= 5, "الديمو: الميزة مفعَّلة بدرجاتٍ وإسنادٍ لعدّة أعضاء");
  const current = demo.terms.find((t: any) => !t.AdTermClosed && /2026\/2027/.test(t.AdTermName) && /الأول/.test(t.AdTermName));
  const byCourse = new Map<number, number>(demo.courses.map((c: any) => [c.AdCourseId, c.CourseHours] as [number, number]));
  const used = teachingHoursByInstructor(demo.schedules.filter((r: any) => r.AdTermId === current.AdTermId), byCourse);
  const states = [...used.entries()].map(([id, h]) => evaluateTeachingLoad(cfg, id, h));
  const over = states.filter(s => s.state === "over"), within = states.filter(s => s.state === "within");
  check(over.length === 2 && within.length === 4, `الديمو: متجاوزان (${over.length}) وأربعةٌ ضمن النصاب (${within.length}) على جدول الفصل الجاري`);
  check(over.some(s => s.instructorId === 3 && s.excess === 1) && over.some(s => s.instructorId === 12 && s.excess === 4), "الديمو: تجاوزُ ساعةٍ (عضو 3) وأربعِ ساعات (عضو 12)");
  const extra = states.find(s => s.instructorId === 5)!;
  check(extra.state === "within" && extra.extra === 2 && extra.hours === 15, "الديمو: عضوٌ بـ15 ساعة ضمن نصابه لأن له ساعتين إضافيتين (13+2)");
  check(states.some(s => s.state === "unset"), "الديمو: أعضاءٌ بلا نصابٍ مضبوط لا يُنبَّه بهم");
}

/* ── العقد: اختياريةٌ، مخوَّلة، قراءةٌ فقط، معزولة ── */
const server = fs.readFileSync("server.ts", "utf8");
const block = server.slice(server.indexOf("النصاب التدريسي (ميزةٌ اختيارية"), server.indexOf('app.post("/api/sections"'));
check(/app\.get\("\/api\/admin\/teaching-load",[^\n]*requireRootAdmin/.test(block) && /app\.put\("\/api\/admin\/teaching-load",[^\n]*requireRootAdmin/.test(block), "الإعداد (قراءةً وحفظاً) للمدير الرئيسي وحده");
check(/app\.get\("\/api\/teaching-load\/status"/.test(block) && block.includes("isScopeAllowed(req, collegeId, sectionId)"), "تنبيه المخطّط محكومٌ بنطاقه");
check(block.includes("if (!config.enabled) { res.json({ enabled: false"), "معطَّلةٌ: لا حسابَ ولا بيانات");
check(!/Repository\.(create|update|delete|save)\w*Schedule/.test(block), "مساراتُ النصاب لا تكتب جدولاً");
const at = server.indexOf('app.post("/api/schedules"');
check(at > 0 && !/teachingLoad|TeachingLoad|evaluateTeachingLoad/.test(server.slice(at, at + 12000)), "حفظُ الموعد لا يعرف النصاب: لا منعَ ولا رفض");
check(server.includes('"/admin/teaching-load"]'), "الديمو: الإعداد للعرض لا يُعدَّل (كبقية إدارة النظام)");

const notice = fs.readFileSync("src/components/TeachingLoadNotice.tsx", "utf8");
check(!/toast|showToast|alert\(|confirm\(|<Notice|createPortal/.test(notice), "التنبيه شارةٌ هادئة: لا توست ولا نافذة ولا alert");
check(notice.includes("if (!over.length) return null") && notice.includes("data?.enabled"), "لا يظهر إلا إن فُعّلت الميزة وتجاوز عضو");
check(notice.includes("window.setTimeout") && notice.includes("controller.abort()"), "تعديلاتٌ متتابعة تُنتج قراءةً واحدة (تأخير وإلغاء)");
const schedules = fs.readFileSync("src/components/Schedules.tsx", "utf8");
check(schedules.split("<TeachingLoadNotice").length === 2 && schedules.split("import TeachingLoadNotice").length === 2, "شاشة الجدول تضيف الشارة في موضعٍ واحد فقط (استيراد + استخدام)");
const admin = fs.readFileSync("src/components/AdminUsers.tsx", "utf8");
check(/rootAdmin \? \{ value: "teachingLoad"/.test(admin) && admin.includes('mode === "teachingLoad"'), "التبويب في إعدادات الإدارة للمدير الرئيسي وحده");
const repo = fs.readFileSync("src/db/repository.ts", "utf8");
check(repo.includes('collection("teachingLoadConfig").doc(TEACHING_LOAD_DOC_ID)') && repo.includes("db.teachingLoadConfig = [row]"), "التخزين: وثيقةٌ واحدة في Firestore وفي القاعدة المحلية/الديمو");

console.log(`\nTeaching load audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
