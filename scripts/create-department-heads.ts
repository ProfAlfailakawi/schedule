/**
 * ── حسابُ رئيس قسمٍ واحد لكل قسم — معاينةٌ أولاً ────────────────────────────
 *
 * القسمُ واحدٌ في كلياته (departmentFamilyKey)، وله حساب «…dept» واحد يغطّيها
 * (Techdept)؛ فرئيسُه حسابٌ واحدٌ يغطّيها كذلك (Techhead) — قرار المالك
 * ٢٠٢٦/١٠/١. الاسم من حساب القسم («Arabicdept» ← «Arabichead»)، وإلا من
 * HEAD_LOGIN أدناه. الصلاحيات من roleDefinition، والنطاق أقسامُ العائلة كلها.
 * الحسابات موقوفةٌ وبلا كلمة سر: يضعها المدير ويفعّلها من شاشة المستخدمين.
 *
 *   npx tsx scripts/create-department-heads.ts          معاينة
 *   npx tsx scripts/create-department-heads.ts --apply  إنشاء
 */
import dotenv from "dotenv";
dotenv.config();
process.env.DATA_MODE = "firestore";

const APPLY = process.argv.includes("--apply");
const { initDatabase, Repository } = await import("../src/db/repository");
const { DEPARTMENT_HEAD_ROLE } = await import("../src/utils/departmentHeadAccounts");
const { roleDefinition } = await import("../src/utils/academicRoles");
const { departmentFamilyKey } = await import("../src/utils/sectionLabel");

/** أقسامٌ بلا حساب «…dept» يُشتقّ منه الاسم. */
const HEAD_LOGIN: Record<string, string> = {
  [departmentFamilyKey("قسم التربية الإسلامية")]: "Islamichead",
  [departmentFamilyKey("وحدة اللغة الإنجليزية")]: "EnglishUnithead",
  [departmentFamilyKey("وحدة الكهرباء")]: "Electricityhead",
};

await initDatabase();
console.log(APPLY ? "تطبيق (--apply)" : "معاينة فقط — لن يُكتب شيء");

const [users, assigns, sections] = await Promise.all([Repository.getUsers(), Repository.getCollegeUserAssigns(), Repository.getSections()]);
const live = (users as any[]).filter(u => !u.IsDeleted);
const userById = new Map(live.map(u => [Number(u.SystemUserId), u]));
const loginTaken = new Set(live.map(u => String(u.SystemUserLogin).toLowerCase()));

type Family = { name: string; sections: Array<{ AdCollegeId: number; AdSectionId: number }>; logins: Set<string> };
const families = new Map<string, Family>();
for (const s of sections as any[]) {
  const key = departmentFamilyKey(s.AdSectionName);
  if (!families.has(key)) families.set(key, { name: String(s.AdSectionName).trim(), sections: [], logins: new Set() });
  families.get(key)!.sections.push({ AdCollegeId: Number(s.AdCollegeId), AdSectionId: Number(s.AdSectionId) });
}
const sectionById = new Map((sections as any[]).map(s => [Number(s.AdSectionId), s]));
for (const a of assigns as any[]) {
  const s = sectionById.get(Number(a.AdSectionId)); const u = userById.get(Number(a.SystemUserId));
  if (s && u) families.get(departmentFamilyKey(s.AdSectionName))!.logins.add(String(u.SystemUserLogin));
}

const definition = roleDefinition(DEPARTMENT_HEAD_ROLE);
const plan: Array<{ login: string; family: Family; status: "create" | "exists" | "review"; note?: string }> = [];
for (const [key, family] of families) {
  const head = [...family.logins].find(l => /head$/i.test(l));
  if (head) { plan.push({ login: head, family, status: "exists" }); continue; }
  const dept = [...family.logins].find(l => /dept$/i.test(l));
  const login = dept ? dept.replace(/dept$/i, "head") : HEAD_LOGIN[key];
  if (!login) { plan.push({ login: "?", family, status: "review", note: "لا حساب «…dept» ولا اسم مقترح" }); continue; }
  if (loginTaken.has(login.toLowerCase())) { plan.push({ login, family, status: "review", note: "الاسم مستخدم لحسابٍ آخر" }); continue; }
  plan.push({ login, family, status: "create" });
}

for (const status of ["create", "exists", "review"] as const) {
  const rows = plan.filter(p => p.status === status);
  if (!rows.length) continue;
  console.log(`\n── ${status} (${rows.length})`);
  for (const p of rows) console.log(`  ${p.login.padEnd(17)} ${p.family.name} · ${p.family.sections.length} كلية${p.note ? `  — ${p.note}` : ""}`);
}

let created = 0;
if (APPLY) {
  for (const p of plan.filter(row => row.status === "create")) {
    if (await Repository.getUserByLogin(p.login)) continue;
    const user = await Repository.createUser({
      Name: `رئيس ${p.family.name}`, SystemUserLogin: p.login, SystemUserPass: "",
      IsAdminUser: false, IsActive: false, IsLocked: false, IsDeleted: false, AdInstructorId: 0,
      Role: DEPARTMENT_HEAD_ROLE,
    } as any);
    await Repository.saveSecurityByUser(user.SystemUserId, definition.formIds);
    await Repository.saveUserAssigns(user.SystemUserId, p.family.sections);
    created++;
  }
}
console.log(APPLY ? `\nأُنشئ: ${created} (موقوفة وبلا كلمة سر)` : `\nمعاينة: ${plan.filter(p => p.status === "create").length} حساباً سيُنشأ. أعد التشغيل مع --apply.`);
process.exit(0);
