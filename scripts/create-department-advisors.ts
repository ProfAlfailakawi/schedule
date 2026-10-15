/**
 * Prepare one inactive, passwordless advisor account for every department,
 * covering matching department sections across colleges in a single scope.
 * Preview by default; pass --apply to create only unambiguous accounts.
 * Usernames follow `<department-prefix>advisor`; no leading `01` is retained.
 */
import dotenv from "dotenv";
dotenv.config();
process.env.DATA_MODE = "firestore";
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_DATABASE_ID) {
  const firebaseConfig = JSON.parse(await (await import("node:fs/promises")).readFile("firebase-applet-config.json", "utf8"));
  process.env.FIREBASE_PROJECT_ID ||= String(firebaseConfig.projectId || "");
  process.env.FIREBASE_DATABASE_ID ||= String(firebaseConfig.firestoreDatabaseId || "");
}

const APPLY = process.argv.includes("--apply");
const { initDatabase, Repository } = await import("../src/db/repository");
const { planAdvisorAccounts, ADVISOR_ROLE } = await import("../src/utils/departmentHeadAccounts");
const { roleDefinition } = await import("../src/utils/academicRoles");

await initDatabase();
const [users, assigns, colleges, sections] = await Promise.all([
  Repository.getUsers(), Repository.getCollegeUserAssigns(), Repository.getColleges(), Repository.getSections(),
]);
const rows = planAdvisorAccounts({ users: users as any, assigns, colleges, sections });
const unexpectedNumericPrefixes = rows.filter(row => /^\d/.test(row.proposedLogin));
for (const status of ["create", "exists", "review"] as const) {
  const batch = rows.filter(row => row.status === status);
  console.log(`\n${status}: ${batch.length}`);
  for (const row of batch) console.log(`${row.proposedLogin}\t${row.collegeName}\t${row.sectionName}${row.note ? `\t${row.note}` : ""}`);
}
if (unexpectedNumericPrefixes.length) {
  console.log(`\nتنبيه: ${unexpectedNumericPrefixes.length} قسماً لا يتوفر له حساب «…dept» أو رمز لاتيني؛ لم نخترع بادئة اسمية. يلزم تحديد أسماء هذه الحسابات.`);
}

let created = 0;
if (APPLY) {
  const definition = roleDefinition(ADVISOR_ROLE);
  for (const row of rows.filter(item => item.status === "create" && !/^\d/.test(item.proposedLogin))) {
    if (await Repository.getUserByLogin(row.proposedLogin)) continue;
    const user = await Repository.createUser({
      Name: row.proposedName,
      SystemUserLogin: row.proposedLogin,
      SystemUserPass: "",
      IsAdminUser: false,
      IsActive: false,
      IsLocked: false,
      IsDeleted: false,
      AdInstructorId: 0,
      Role: ADVISOR_ROLE,
    } as any);
    await Repository.saveSecurityByUser(user.SystemUserId, definition.formIds);
    await Repository.saveUserAssigns(user.SystemUserId, row.scopeAssignments || [{ AdCollegeId: row.collegeId, AdSectionId: row.sectionId }]);
    created++;
  }
}
console.log(`\n${APPLY ? `Created inactive, passwordless accounts: ${created}` : `Preview only; would create: ${rows.filter(row => row.status === "create" && !/^\d/.test(row.proposedLogin)).length}`}`);
