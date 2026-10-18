/**
 * ── كلية صديقة: دبلوم الهندسة الميكانيكية - بحرية (DP-0405) ──────────────────────
 *
 * يحمّل صحيفة البرنامج بمسبقاتها كما في كشف SWRCAPP، ويُنشئ حساباً لكل صفةٍ على كلية
 * «الدراسات التكنولوجية - بنين» وحدها (موقوفةً وبلا كلمة سر؛ يضعها المدير ويفعّلها من شاشة
 * المستخدمين). التفاصيل وضماناتُ الأمان في scripts/lib/programProvision.ts.
 *
 *   npx tsx scripts/provision-marine-diploma.ts                       معاينة فقط
 *   npx tsx scripts/provision-marine-diploma.ts --apply               تنفيذ
 *
 *   --college=<رقم>          إن التبس اسم الكلية أو أردت كليةً بعينها
 *   --create-college         تُنشأ الكلية إن لم توجد (اسمها «كلية الدراسات التكنولوجية - بنين» ورمزها 04)
 *   --college-name= / --college-code=   اسمٌ أو رمزٌ آخر للكلية المُنشأة
 *   --password=<كلمة>        تُفعَّل بها الحسابات (وإلا بقيت موقوفة بلا كلمة سر)؛ لا يُمسّ حسابٌ قائمٌ له كلمة سر
 *   --prefix=tsb             بادئة أسماء الدخول (tsbdean، tsbhead…)
 *   --dept=30=اللغة الإنجليزية   اسم قسمٍ غائب عن الكلية (يتكرر لكل قسم)
 *
 * يلزم ضبط FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID وبيانات اعتماد Google كبقية سكربتات هذا المجلد.
 */
import dotenv from "dotenv";
dotenv.config();
process.env.DATA_MODE ||= "firestore";
if (process.env.DATA_MODE === "firestore" && (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_DATABASE_ID)) {
  const cfg = JSON.parse(await (await import("node:fs/promises")).readFile("firebase-applet-config.json", "utf8"));
  process.env.FIREBASE_PROJECT_ID ||= String(cfg.projectId || "");
  process.env.FIREBASE_DATABASE_ID ||= String(cfg.firestoreDatabaseId || "");
}
const arg = (name: string) => process.argv.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const deptNames: Record<string, string> = {};
for (const item of process.argv.filter(value => value.startsWith("--dept="))) {
  const [, code, ...name] = item.split("=");
  if (code && name.length) deptNames[code.padStart(2, "0")] = name.join("=");
}
const apply = process.argv.includes("--apply");
const { initDatabase, Repository } = await import("../src/db/repository");
const { MARINE_MECHANICAL_DIPLOMA } = await import("../src/data/marineMechanicalDiploma");
const { provisionProgram } = await import("./lib/programProvision");

await initDatabase();
console.log(apply ? "تطبيق (--apply)" : "معاينة فقط — لن يُكتب شيء");
const report = await provisionProgram(Repository, MARINE_MECHANICAL_DIPLOMA, {
  apply, collegeId: arg("college") ? Number(arg("college")) : undefined,
  createCollege: process.argv.includes("--create-college")
    ? { code: arg("college-code") || MARINE_MECHANICAL_DIPLOMA.groups[0].courses[0].code.slice(0, 2), name: arg("college-name") || `${MARINE_MECHANICAL_DIPLOMA.college} - بنين` }
    : undefined, prefix: arg("prefix") || "tsb", deptNames, password: arg("password"), log: line => console.log("  " + line),
});
if (report.error) { console.log(`\n✗ ${report.error}`); process.exit(1); }
console.log(`\nالكلية: ${report.college!.name}${report.collegeToCreate ? ` — ${apply ? "أُنشئت" : "ستُنشأ"} برمز ${report.collegeToCreate.code}` : ` (${report.college!.id})`}`);
if (report.sectionsToCreate.length) console.log(`أقسام ستُنشأ: ${report.sectionsToCreate.map(row => `${row.name} [${row.code}]`).join("، ")}`);
console.log(`المقررات: ${report.coursesExisting} موجودة، ${report.coursesToCreate} ${apply ? "أُنشئت" : "ستُنشأ"}`);
console.log(`الصحيفة: ${report.planStatus} · القواعد: ${report.draftStatus}`);
console.log("الحسابات:");
for (const row of report.accounts) console.log(`  ${row.status === "exists" ? "=" : apply ? "+" : "·"} ${row.login.padEnd(18)} ${row.role.padEnd(15)} ${row.scope}`);
console.log(apply
  ? `\nتم. القواعد «قيد المراجعة»: يعتمدها رئيس لجنة الجدول من «مراجعة الصحيفة» ثم تُنشر الخريطة. ${arg("password") ? "الحسابات فعّالة بكلمة السر المعطاة." : "الحسابات موقوفة: ضع كلمات السر وفعّلها من شاشة المستخدمين."}`
  : "\nمعاينة فقط. أعد التشغيل مع --apply بعد مراجعة الملخص.");
process.exit(0);
