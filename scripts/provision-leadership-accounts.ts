/**
 * ── حسابات القيادة: العمداء والتسجيل ──────────────────────────────────────────
 *
 *   عميد الكلية + العميد المساعد  حسابان لكل كلية من كليات التربية الأساسية الأربع
 *   عميد التسجيل · رئيس التسجيل   كل الكليات (قراءة)
 *   موظف التسجيل                  الكليات الأربع (نطاق يدوي)
 *
 * تُنشأ موقوفةً وبلا كلمة سر؛ يضعها المدير ويفعّل الحساب من شاشة المستخدمين.
 * آمنٌ لإعادة التشغيل: الحساب القائم لا يُمسّ.
 *
 *   npx tsx scripts/provision-leadership-accounts.ts          معاينة
 *   npx tsx scripts/provision-leadership-accounts.ts --apply  تنفيذ
 */
import dotenv from "dotenv";
dotenv.config();
process.env.DATA_MODE = "firestore";
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_DATABASE_ID) {
  const cfg = JSON.parse(await (await import("node:fs/promises")).readFile("firebase-applet-config.json", "utf8"));
  process.env.FIREBASE_PROJECT_ID ||= String(cfg.projectId || "");
  process.env.FIREBASE_DATABASE_ID ||= String(cfg.firestoreDatabaseId || "");
}
const APPLY = process.argv.includes("--apply");
const { initDatabase, Repository } = await import("../src/db/repository");
const { roleDefinition } = await import("../src/utils/academicRoles");
const { officialCollegeSitePrefix } = await import("../src/utils/locationCollegePrefixes");

/** رمز الموقع ← لاحقة اسم الدخول. */
const SITES: Array<[string, string]> = [["012B", "banat"], ["011B", "banin"], ["012J", "jahra"], ["012F", "fahaheel"]];

await initDatabase();
console.log(APPLY ? "تطبيق (--apply)" : "معاينة فقط — لن يُكتب شيء");
const colleges = await Repository.getColleges();
const users = (await Repository.getUsers() as any[]).filter(u => !u.IsDeleted);
const taken = new Set(users.map(u => String(u.SystemUserLogin).toLowerCase()));

type Plan = { login: string; name: string; role: any; assigns: Array<{ AdCollegeId: number; AdSectionId: number }> };
const plans: Plan[] = [];
const fourIds: number[] = [];
for (const [site, suffix] of SITES) {
  const college = colleges.find(c => String(officialCollegeSitePrefix(c.AdCollegeName) || "") === site);
  if (!college) { console.log(`⚠ كلية ${site} غير مسجلة — تُخطّى`); continue; }
  const id = Number(college.AdCollegeId); fourIds.push(id);
  const scope = [{ AdCollegeId: id, AdSectionId: 0 }];
  plans.push({ login: `dean${suffix}`, name: `عميد ${college.AdCollegeName}`, role: "dean", assigns: scope });
  plans.push({ login: `vicedean${suffix}`, name: `العميد المساعد للشؤون الأكاديمية — ${college.AdCollegeName}`, role: "viceDean", assigns: scope });
}
const everyCollege = (colleges as any[]).map(c => ({ AdCollegeId: Number(c.AdCollegeId), AdSectionId: 0 }));
plans.push({ login: "registrardean", name: "عميد التسجيل", role: "registrarDean", assigns: everyCollege });
plans.push({ login: "registrarhead", name: "رئيس التسجيل", role: "registrarHead", assigns: everyCollege });
plans.push({ login: "registrarstaff", name: "موظف التسجيل", role: "registrarStaff", assigns: fourIds.map(id => ({ AdCollegeId: id, AdSectionId: 0 })) });

let created = 0;
for (const p of plans) {
  if (taken.has(p.login.toLowerCase())) { console.log(`  = ${p.login} موجود — لم يُمسّ`); continue; }
  console.log(`  + ${p.login}  ${p.name}  [${p.role}] — ${p.assigns.length} كلية`);
  if (!APPLY) continue;
  const user = await Repository.createUser({
    Name: p.name, SystemUserLogin: p.login, SystemUserPass: "",
    IsAdminUser: false, IsActive: false, IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: p.role,
  } as any);
  await Repository.saveSecurityByUser(user.SystemUserId, roleDefinition(p.role).formIds);
  await Repository.saveUserAssigns(user.SystemUserId, p.assigns);
  created++;
}
console.log(APPLY ? `\nأُنشئ ${created} حساباً (موقوفة وبلا كلمة سر).` : "\nمعاينة فقط. أعد التشغيل مع --apply.");
process.exit(0);
