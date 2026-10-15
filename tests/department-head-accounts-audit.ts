/**
 * «إنشاء حسابات رؤساء الأقسام»: الاسم من حساب «…dept»، فضّ التصادم برمز الكلية،
 * والتكرار لا يُنشئ شيئاً مرتين، ولا كلمة سرّ في أي موضع.
 */
import fs from "fs";
import { planAdvisorAccounts, planDepartmentHeadAccounts } from "../src/utils/departmentHeadAccounts";
import { ACADEMIC_ROLES, isAdvisorRole, isReadOnlyRole, roleDefinition } from "../src/utils/academicRoles";

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
  { AdSectionId: 21, AdCollegeId: 2, AdSectionCode: "0109", AdSectionName: "قسم الرياضيات" },
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
check(by(21).status === "create" && by(21).proposedLogin === "9head" && Boolean(by(21).note), "القسم ذو رمز 0109 يستخدم الاسم بعد حذف بادئة 01");
const prefixedArabic = planDepartmentHeadAccounts({
  users: [{ SystemUserId: 50, SystemUserLogin: "01Arabicdept", Role: "committeeChair" }],
  assigns: [{ SystemUserId: 50, AdCollegeId: 1, AdSectionId: 30 }],
  colleges: [{ AdCollegeId: 1, AdCollegeCode: "BG", AdCollegeName: "كلية" }],
  sections: [{ AdSectionId: 30, AdCollegeId: 1, AdSectionCode: "01Arabic", AdSectionName: "قسم اللغة العربية" }],
});
check(prefixedArabic[0].proposedLogin === "Arabichead", "بادئة dept والقسم تزيل 01 من اسم الدخول");
const arabicAdvisor = planAdvisorAccounts({
  users: [{ SystemUserId: 51, SystemUserLogin: "01Arabicdept", Role: "committeeChair" }],
  assigns: [{ SystemUserId: 51, AdCollegeId: 1, AdSectionId: 30 }],
  colleges: [{ AdCollegeId: 1, AdCollegeCode: "BG", AdCollegeName: "كلية" }],
  sections: [{ AdSectionId: 30, AdCollegeId: 1, AdSectionCode: "01Arabic", AdSectionName: "قسم اللغة العربية" }],
});
check(arabicAdvisor[0].proposedLogin === "Arabicadvisor", "حساب الإرشاد العربي يُقترح Arabicadvisor دون 01");
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

/* ── حسابات المرشدين: Econoadvisor وأخواتها ─────────────────────────────── */
const advisors = planAdvisorAccounts({
  users: [{ SystemUserId: 1, SystemUserLogin: "Techdept", Role: "committeeChair" }, { SystemUserId: 2, SystemUserLogin: "Socdept", Role: "committeeChair" }, { SystemUserId: 3, SystemUserLogin: "TechDept", Role: "committeeChair" } as any],
  assigns: [{ SystemUserId: 1, AdCollegeId: 1, AdSectionId: 10 }, { SystemUserId: 2, AdCollegeId: 1, AdSectionId: 11 }, { SystemUserId: 3, AdCollegeId: 2, AdSectionId: 20 }],
  colleges, sections,
});
const adv = (id: number) => advisors.find(row => row.sectionId === id)!;
check(adv(10).proposedLogin === "Techadvisor" && adv(10).status === "create" && adv(10).collegeIds?.length === 2, "مرشد واحد لقسم تكنولوجيا التعليم ويغطي كليتي البنين والبنات");
check(adv(11).proposedLogin === "Socadvisor" && adv(11).status === "create", "Socdept ← Socadvisor");
const codeBasedAdvisor = planAdvisorAccounts({ users: [], assigns: [], colleges, sections: [sections[3]] });
check(codeBasedAdvisor[0].proposedLogin === "9advisor", "القسم ذو رمز 0109 ينتج اسماً بلا بادئة 01");
const numericCodeAdvisor = planAdvisorAccounts({ users: [], assigns: [], colleges, sections: [{ ...sections[3], AdSectionCode: "0109" }] });
check(numericCodeAdvisor[0].proposedLogin === "9advisor", "رمز القسم الرقمي 0109 يزيل بادئة 01 كما طلب المالك");
check(advisors.every(row => row.proposedName.startsWith("إرشاد ")), "اسم الحساب «إرشاد <القسم>»");
check(!advisors.some(row => /head/i.test(row.proposedLogin)), "لا تتداخل حسابات المرشدين مع حسابات الرؤساء");
check(advisors.length === sections.length - 1, "حساب واحد لكل قسم متمايز مع دمج القسم المتناظر بين الكليات");

const duplicatedAdvisors = planAdvisorAccounts({
  users: [
    { SystemUserId: 71, SystemUserLogin: "Techadvisor01", Role: "advisor", IsActive: false, SystemUserPass: "" },
    { SystemUserId: 72, SystemUserLogin: "Techadvisor02", Role: "advisor", IsActive: false, SystemUserPass: "" },
  ],
  assigns: [
    { SystemUserId: 71, AdCollegeId: 1, AdSectionId: 10 },
    { SystemUserId: 72, AdCollegeId: 2, AdSectionId: 20 },
  ], colleges, sections,
});
const duplicateTech = duplicatedAdvisors.find(row => row.sectionIds?.includes(10) && row.sectionIds?.includes(20));
check(duplicateTech?.status === "review" && duplicateTech.duplicateUserIds?.length === 2 && duplicateTech.consolidationReady, "تُكتشف الحسابات المكررة ويُسمح بتوحيدها فقط وهي موقوفة وبلا كلمة سر وبلا نطاقات أخرى");
const activeDuplicateAdvisors = planAdvisorAccounts({
  users: [
    { SystemUserId: 71, SystemUserLogin: "Techadvisor01", Role: "advisor", IsActive: true, SystemUserPass: "" },
    { SystemUserId: 72, SystemUserLogin: "Techadvisor02", Role: "advisor", IsActive: false, SystemUserPass: "" },
  ],
  assigns: [
    { SystemUserId: 71, AdCollegeId: 1, AdSectionId: 10 },
    { SystemUserId: 72, AdCollegeId: 2, AdSectionId: 20 },
  ], colleges, sections,
});
check(!activeDuplicateAdvisors.find(row => row.sectionIds?.includes(10) && row.sectionIds?.includes(20))?.consolidationReady, "الحساب النشط يمنع الدمج الآلي ويحيل الحالة للمراجعة");
const loginCollision = planAdvisorAccounts({
  users: [], assigns: [],
  colleges: [{ AdCollegeId: 1, AdCollegeName: "كلية أ" }, { AdCollegeId: 2, AdCollegeName: "كلية ب" }],
  sections: [
    { AdSectionId: 31, AdCollegeId: 1, AdSectionCode: "09", AdSectionName: "قسم اللغة العربية" },
    { AdSectionId: 32, AdCollegeId: 2, AdSectionCode: "09", AdSectionName: "قسم الرياضيات" },
  ],
});
check(loginCollision.every(row => row.status === "review" && /بادئة فريدة/.test(row.note || "")), "تصادم اسم الدخول لقسمين مختلفين لا ينشئ حسابات ملتبسة ويطلب بادئة فريدة");
check(isAdvisorRole("advisor") && !isAdvisorRole("departmentHead"), "isAdvisorRole");
const def = roleDefinition("advisor");
check(def.readOnly && isReadOnlyRole("advisor") && def.landing === "registration" && def.scopeMode === "section" && JSON.stringify(def.formIds) === "[14]", "صفة المرشد: قراءة فقط، قسمه، شاشة واحدة، تفتح على كشف التسجيل");
check(ACADEMIC_ROLES.some(role => role.id === "advisor"), "الصفة معرّفة في القائمة");
const appSrc = fs.readFileSync("src/App.tsx", "utf8");
check(/sessionRole\.advisorOnly[\s\S]{0,200}studentRegistration/.test(appSrc) && /advisorOnly\s*\n?\s*\? undefined/.test(appSrc), "القائمة: المرشد بلا استعلامات وتقارير، وأي وجهة تعود إلى كشف التسجيل");

const server = fs.readFileSync("server.ts", "utf8");
const block = server.slice(server.indexOf('app.post("/api/users/department-heads"'), server.indexOf('app.put("/api/users/:id"'));
check(/requirePowerAdmin/.test(block), "الإنشاء لمدير النظام وحده على الخادم");
check(/SystemUserPass: ""/.test(block) && /IsActive: false/.test(block) && !/hashPassword|randomBytes|encryptPasswordForVault/.test(block), "لا كلمة سرّ تُولَّد، والحساب موقوف");

import { roleWriteDecision } from "../src/server/roleGuard";
const guard = (role: string, path: string, method = "DELETE") => roleWriteDecision({ method, path, authenticated: true, powerUser: false, role } as any);
check(!guard("advisor", "/schedule-notes/5").allowed && !guard("advisor", "/student-registration/3/course-state", "POST").allowed && guard("departmentHead", "/schedule-notes/5").allowed, "المرشد لا يكتب في مسارات الاعتماد ولو كانت مفتوحة لغيره من صفات القراءة");
const advBlock = server.slice(server.indexOf('app.post("/api/users/advisors"'), server.indexOf('app.put("/api/users/:id"'));
check(/requirePowerAdmin/.test(advBlock) && /SystemUserPass: ""/.test(advBlock) && /IsActive: false/.test(advBlock) && !/hashPassword|randomBytes|encryptPasswordForVault/.test(advBlock), "حسابات المرشدين: لمدير النظام، موقوفة، بلا كلمة سر");
const consolidateBlock = server.slice(server.indexOf('app.post("/api/users/advisors/consolidate"'), server.indexOf('app.put("/api/users/:id"'));
check(/requireRootAdmin/.test(consolidateBlock) && /saveSecurityByUser\(Number\(id\), \[\]\)/.test(consolidateBlock) && /IsDeleted: true/.test(consolidateBlock), "توحيد التكرار للأدمن الجذر فقط مع سحب الشاشات والنطاقات وإخفاء الحسابات الزائدة دون حذف سجلها");
const advisorScript = fs.readFileSync("scripts/create-department-advisors.ts", "utf8");
check(/row\.scopeAssignments\s*\|\|/.test(advisorScript), "أداة تجهيز الحسابات تضيف جميع كليات القسم إلى الحساب الواحد");
check(/advisorOnly: isAdvisorRole/.test(server), "الخادم يرسل advisorOnly للواجهة");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
