/**
 * One-time repair for advisor accounts created per college before one-account-per-department.
 * Read-only by default. --apply requires an explicit Firestore project/database and only
 * touches inactive, passwordless accounts whose scopes are entirely in the same department.
 * Extra accounts are soft-deleted and locked; their user records remain recoverable.
 */
import { planAdvisorAccounts, ADVISOR_ROLE } from "../src/utils/departmentHeadAccounts";
import { roleDefinition } from "../src/utils/academicRoles";

const apply = process.argv.includes("--apply");
const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
const databaseId = process.env.FIREBASE_DATABASE_ID?.trim();
if (!projectId || !databaseId) throw new Error("حدّد FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID صراحةً.");
process.env.DATA_MODE = "firestore";

const { initDatabase, Repository } = await import("../src/db/repository");
await initDatabase();

async function preview() {
  const [users, assigns, colleges, sections] = await Promise.all([
    Repository.getUsers(), Repository.getCollegeUserAssigns(), Repository.getColleges(), Repository.getSections(),
  ]);
  return { users, assigns, rows: planAdvisorAccounts({ users, assigns, colleges, sections }) };
}

const before = await preview();
const candidates = before.rows.filter(row => row.status === "review" && (row.duplicateUserIds?.length || 0) > 1);
const renames = before.rows.filter(row => row.status === "exists" && row.existingUserId
  && row.existingLogin?.toLowerCase() !== row.proposedLogin.toLowerCase());
console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run", projectId, databaseId,
  candidateDepartments: candidates.length,
  safeDepartments: candidates.filter(row => row.consolidationReady).length,
  extraAccountsToRetire: candidates.filter(row => row.consolidationReady)
    .reduce((sum, row) => sum + (row.duplicateUserIds?.length || 0) - 1, 0),
  inactiveAccountsToRename: renames.map(row => ({ section: row.sectionName, from: row.existingLogin, to: row.proposedLogin })),
  manualReview: candidates.filter(row => !row.consolidationReady).map(row => ({ section: row.sectionName, reason: row.note })),
}, null, 2));
if (!apply) process.exit(0);

const roleForms = roleDefinition(ADVISOR_ROLE).formIds;
let departments = 0;
let retired = 0;
for (const planned of candidates) {
  const current = await preview();
  const row = current.rows.find(item => item.sectionIds?.length === planned.sectionIds?.length
    && item.sectionIds?.every((id, index) => id === planned.sectionIds?.[index]));
  if (!row?.consolidationReady || !row.existingUserId || row.proposedLogin !== planned.proposedLogin) {
    throw new Error(`تغيرت حالة ${planned.sectionName} بعد المعاينة؛ توقف التنفيذ عند هذا القسم.`);
  }
  const ids = row.duplicateUserIds || [];
  const owners = ids.map(id => current.users.find(user => Number(user.SystemUserId) === id));
  const allowedScopes = new Set((row.scopeAssignments || []).map(scope => `${scope.AdCollegeId}:${scope.AdSectionId}`));
  const loginOwner = await Repository.getUserByLogin(row.proposedLogin);
  const safe = ids.length > 1 && owners.every(user => user && user.Role === ADVISOR_ROLE && !user.IsDeleted
    && !user.IsActive && !String(user.SystemUserPass || "").trim() && !String(user.SystemUserPassVault || "").trim())
    && owners.every(user => current.assigns.filter(scope => Number(scope.SystemUserId) === Number(user!.SystemUserId))
      .every(scope => allowedScopes.has(`${Number(scope.AdCollegeId)}:${Number(scope.AdSectionId)}`)))
    && (!loginOwner || ids.includes(Number(loginOwner.SystemUserId)));
  if (!safe) throw new Error(`فحص السلامة أخفق للقسم ${planned.sectionName}؛ توقف التنفيذ.`);

  const primaryId = Number(row.existingUserId);
  await Repository.updateUser(primaryId, {
    Name: row.proposedName, SystemUserLogin: row.proposedLogin,
    IsActive: false, IsDeleted: false, Role: ADVISOR_ROLE as any,
  });
  await Repository.saveSecurityByUser(primaryId, roleForms);
  await Repository.saveUserAssigns(primaryId, row.scopeAssignments || []);
  for (const id of ids.filter(id => id !== primaryId)) {
    await Repository.saveSecurityByUser(id, []);
    await Repository.saveUserAssigns(id, []);
    await Repository.updateUser(id, { IsActive: false, IsLocked: true, IsDeleted: true, Role: "standard" as any });
    retired++;
  }
  await Repository.createAuditLog({
    SystemUserId: 0, userName: "SCHEDULE migration", method: "SCRIPT",
    path: "scripts/consolidate-department-advisors.ts", action: "توحيد حسابات المرشدين",
    entity: "users", entityId: String(primaryId),
    changes: `${row.sectionName}: الحساب ${row.proposedLogin} يشمل ${row.scopeAssignments?.length || 0} نطاقاً؛ سُحب ${ids.length - 1} حساب مكرر موقوف`,
    status: 200,
  });
  departments++;
  console.log(JSON.stringify({ consolidated: row.sectionName, login: row.proposedLogin, scopes: row.scopeAssignments?.length || 0, retired: ids.length - 1 }));
}
let renamed = 0;
for (const planned of renames) {
  const current = await preview();
  const row = current.rows.find(item => item.existingUserId === planned.existingUserId);
  const user = current.users.find(item => Number(item.SystemUserId) === Number(row?.existingUserId));
  const owner = row ? await Repository.getUserByLogin(row.proposedLogin) : undefined;
  const targetScopes = new Set((row?.scopeAssignments || []).map(scope => `${scope.AdCollegeId}:${scope.AdSectionId}`));
  const currentScopes = current.assigns.filter(scope => Number(scope.SystemUserId) === Number(user?.SystemUserId));
  if (!row || row.status !== "exists" || row.proposedLogin !== planned.proposedLogin || !user
    || user.Role !== ADVISOR_ROLE || user.IsDeleted || user.IsActive
    || String(user.SystemUserPass || "").trim() || String(user.SystemUserPassVault || "").trim()
    || (owner && Number(owner.SystemUserId) !== Number(user.SystemUserId))
    || currentScopes.some(scope => !targetScopes.has(`${Number(scope.AdCollegeId)}:${Number(scope.AdSectionId)}`))) {
    throw new Error(`لا يمكن إعادة تسمية ${planned.sectionName} بأمان؛ توقف التنفيذ.`);
  }
  await Repository.updateUser(Number(user.SystemUserId), {
    Name: row.proposedName, SystemUserLogin: row.proposedLogin, IsActive: false,
  });
  await Repository.saveSecurityByUser(Number(user.SystemUserId), roleForms);
  await Repository.saveUserAssigns(Number(user.SystemUserId), row.scopeAssignments || []);
  await Repository.createAuditLog({
    SystemUserId: 0, userName: "SCHEDULE migration", method: "SCRIPT",
    path: "scripts/consolidate-department-advisors.ts", action: "تصحيح اسم حساب المرشد",
    entity: "users", entityId: String(user.SystemUserId),
    changes: `${row.sectionName}: ${planned.existingLogin} ← ${row.proposedLogin}`,
    status: 200,
  });
  renamed++;
  console.log(JSON.stringify({ renamed: row.sectionName, from: planned.existingLogin, to: row.proposedLogin }));
}
const after = await preview();
console.log(JSON.stringify({ completed: true, departments, retired, renamed, visibleAdvisors: after.users.filter(user => user.Role === ADVISOR_ROLE && !user.IsDeleted).length,
  unresolvedGroups: after.rows.filter(row => row.status === "review").map(row => ({ section: row.sectionName, reason: row.note })) }, null, 2));
