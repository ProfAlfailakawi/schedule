/**
 * ── حسابات القيادة: العمداء والتسجيل ──────────────────────────────────────────
 *
 *   خمسة حسابات، واحد لكل صفة، وكلٌّ منها على كل الكليات والأقسام:
 *   عميد الكلية · العميد المساعد · عميد التسجيل · رئيس التسجيل · موظف التسجيل
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

await initDatabase();
console.log(APPLY ? "تطبيق (--apply)" : "معاينة فقط — لن يُكتب شيء");
const colleges = await Repository.getColleges();
const users = (await Repository.getUsers() as any[]).filter(u => !u.IsDeleted);
const byLogin = new Map(users.map(u => [String(u.SystemUserLogin).toLowerCase(), u]));

/* حساب واحد لكل صفة، يغطي كل الكليات والأقسام (صفٌّ بقسم صفر = الكلية كلها). */
const everyCollege = (colleges as any[]).map(c => ({ AdCollegeId: Number(c.AdCollegeId), AdSectionId: 0 }));
type Plan = { login: string; name: string; role: any; assigns: Array<{ AdCollegeId: number; AdSectionId: number }> };
const plans: Plan[] = [
  { login: "dean", name: "عميد الكلية", role: "dean", assigns: everyCollege },
  { login: "vicedean", name: "العميد المساعد للشؤون الأكاديمية", role: "viceDean", assigns: everyCollege },
  { login: "registrardean", name: "عميد التسجيل", role: "registrarDean", assigns: everyCollege },
  { login: "registrarhead", name: "رئيس التسجيل", role: "registrarHead", assigns: everyCollege },
  { login: "registrarstaff", name: "موظف التسجيل", role: "registrarStaff", assigns: everyCollege },
];

/* الحسابات الثمانية «لكل كلية» التي أنشأها الإصدار الأول من هذا السكربت: لم يُفعَّل
   منها شيء ولا كلمة سر، فتُزال إن بقيت كما أُنشئت. */
const retired = ["banat", "banin", "jahra", "fahaheel"].flatMap(x => [`dean${x}`, `vicedean${x}`]);
for (const login of retired) {
  const u = byLogin.get(login);
  if (!u) continue;
  if (u.IsActive || String(u.SystemUserPass || "").trim()) { console.log(`  ? ${login} فُعّل أو له كلمة سر — لم يُحذف`); continue; }
  console.log(`  - حذف ${login} (قديم: لكل كلية)`);
  if (APPLY) await Repository.deleteUser(Number(u.SystemUserId));
}

let created = 0;
for (const p of plans) {
  const existing = byLogin.get(p.login.toLowerCase());
  if (existing) {
    const current = await Repository.getUserAssigns(Number(existing.SystemUserId));
    const have = new Set(current.map(a => `${Number(a.AdCollegeId)}:${Number(a.AdSectionId)}`));
    const missing = p.assigns.filter(a => !have.has(`${a.AdCollegeId}:${a.AdSectionId}`));
    if (!missing.length) { console.log(`  = ${p.login} موجود وكامل النطاق`); continue; }
    console.log(`  ~ ${p.login}: توسيع +${missing.length} كلية`);
    if (APPLY) await Repository.saveUserAssigns(Number(existing.SystemUserId), [...current.map(a => ({ AdCollegeId: Number(a.AdCollegeId), AdSectionId: Number(a.AdSectionId) })), ...missing]);
    continue;
  }
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
