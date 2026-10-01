/**
 * «إنشاء حسابات رؤساء الأقسام»: الاسم من حساب «…dept»، فضّ التصادم برمز الكلية،
 * والتكرار لا يُنشئ شيئاً مرتين، ولا كلمة سرّ في أي موضع.
 */
import fs from "fs";
import { planDepartmentHeadAccounts } from "../src/utils/departmentHeadAccounts";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const colleges = [
  { AdCollegeId: 1, AdCollegeCode: "BG", AdCollegeName: "كلية التربية الأساسية - بنات" },
  { AdCollegeId: 2, AdCollegeCode: "BB", AdCollegeName: "كلية التربية الأساسية - بنين" },
];
const sections = [
  { AdSectionId: 10, AdCollegeId: 1, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 11, AdCollegeId: 1, AdSectionName: "قسم الدراسات الاجتماعية" },
  { AdSectionId: 20, AdCollegeId: 2, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 21, AdCollegeId: 2, AdSectionName: "قسم بلا حساب" },
];
const users = [
  { SystemUserId: 1, SystemUserLogin: "Techdept", Role: "committeeChair" },
  { SystemUserId: 2, SystemUserLogin: "Socdept", Role: "committeeChair" },
  { SystemUserId: 3, SystemUserLogin: "TechDept", Role: "committeeChair" } as any,
  { SystemUserId: 4, SystemUserLogin: "Techhead", Role: "departmentHead" },
];
const assigns = [
  { SystemUserId: 1, AdCollegeId: 1, AdSectionId: 10 },
  { SystemUserId: 2, AdCollegeId: 1, AdSectionId: 11 },
  { SystemUserId: 3, AdCollegeId: 2, AdSectionId: 20 },
  { SystemUserId: 4, AdCollegeId: 1, AdSectionId: 10 },
];
const plan = planDepartmentHeadAccounts({ users, assigns, colleges, sections });
const by = (id: number) => plan.find(row => row.sectionId === id)!;
check(by(10).status === "exists" && by(10).existingLogin === "Techhead", "Techhead الموجود يُعدّ رئيس قسم تكنولوجيا التعليم (بنات) ولا يُنشأ ثانية");
check(by(11).status === "create" && by(11).proposedLogin === "Sochead", "Socdept ← Sochead");
check(by(20).status === "create" && by(20).proposedLogin === "TechheadBB", "البادئة نفسها في كلية أخرى تأخذ رمز الكلية");
check(by(21).status === "create" && by(21).proposedLogin === "s21head" && Boolean(by(21).note), "قسم بلا حساب dept: اسم بديل مع تنبيه");
const logins = plan.map(row => (row.existingLogin || row.proposedLogin).toLowerCase());
check(new Set(logins).size === logins.length, "لا اسمان متطابقان في الخطة");

/* Techhead بلا نطاق بعد (كما قد يكون أنشأه المالك): يُطابَق بالاسم ولا يُكرَّر. */
const unscoped = planDepartmentHeadAccounts({ users, assigns: assigns.filter(a => a.SystemUserId !== 4), colleges, sections });
check(unscoped.filter(row => row.sectionId === 10 || row.sectionId === 20).every(row => row.status === "review"), "Techhead بلا نطاق والبادئة مشتركة: مراجعة لا إنشاء");
const single = planDepartmentHeadAccounts({ users: users.filter(u => u.SystemUserId !== 3), assigns: assigns.filter(a => a.SystemUserId !== 4 && a.SystemUserId !== 3), colleges, sections });
check(single.find(r => r.sectionId === 10)!.status === "exists", "Techhead بلا نطاق والبادئة فريدة: يُعدّ موجوداً مع تنبيه");

/* الإعادة بعد الإنشاء لا تُنشئ شيئاً. */
const afterUsers = [...users, ...plan.filter(r => r.status === "create").map((r, i) => ({ SystemUserId: 100 + i, SystemUserLogin: r.proposedLogin, Role: "departmentHead" }))];
const afterAssigns = [...assigns, ...plan.filter(r => r.status === "create").map((r, i) => ({ SystemUserId: 100 + i, AdCollegeId: r.collegeId, AdSectionId: r.sectionId }))];
const again = planDepartmentHeadAccounts({ users: afterUsers, assigns: afterAssigns, colleges, sections });
check(again.every(row => row.status === "exists"), "التشغيل الثاني: لا شيء يُنشأ");

const server = fs.readFileSync("server.ts", "utf8");
const block = server.slice(server.indexOf('app.post("/api/users/department-heads"'), server.indexOf('app.put("/api/users/:id"'));
check(/requirePowerAdmin/.test(block), "الإنشاء لمدير النظام وحده على الخادم");
check(/SystemUserPass: ""/.test(block) && /IsActive: false/.test(block) && !/hashPassword|randomBytes|encryptPasswordForVault/.test(block), "لا كلمة سرّ تُولَّد، والحساب موقوف");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
