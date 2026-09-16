import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual server functions with an in-memory repository. Importing
// server.ts itself would start the application and connect to production data.
const server = ts.createSourceFile("server.ts", readFileSync(new URL("../server.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const names = new Set(["departmentInstructorIdSet", "validateSmartRows"]);
const functions = server.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text || ""));
assert.equal(functions.length, names.size);
const code = ts.transpileModule(functions.map(node => node.getText(server)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
let members = [41];
let delegates = [42];
let visitors = [43];
const calls: unknown[][] = [];
const Repository = {
  getInstructorsByScope: async (...args: unknown[]) => { calls.push(args); return members.map(AdInstructorId => ({ AdInstructorId })); },
  getDepartmentDelegates: async () => delegates,
  getVisitingRoster: async () => visitors,
  getColleges: async () => [], getSections: async () => [],
  getCourses: async () => [{ AdCourseId: 1, AdCollegeId: 5, AdSectionId: 7, CourseName: "مقرر" }],
  getInstructors: async () => [41, 42, 43, 99].map(AdInstructorId => ({ AdInstructorId })),
  getSchedulesByScope: async () => [],
};
const { departmentInstructorIdSet, validateSmartRows } = runInNewContext(code + "\n({departmentInstructorIdSet, validateSmartRows})", {
  Repository,
  collegeBranchRoot: () => "012", branchOwnScopes: () => [],
  readLocationRegistry: async () => ({}),
  locationPreflight: () => ({ ok: true, issues: [] }),
  normalizeAuthoritySectionCode: (value: string) => value,
  authoritySectionCodeLooksPlausible: () => true,
  isValidClock: () => true, timeToMinutes: (value: string) => value === "09:00" ? 540 : 600,
  withinScheduleDay: () => true, activeDays: () => ["fsunday"],
});
assert.deepEqual([...await departmentInstructorIdSet([], [], 5, 7, 9)], [41, 42, 43]);
assert.deepEqual(calls, [[7, 0]], "membership uses the same department history as the picker");
const row = (id: number, source: string, method: string) => ({
  AdCourseId: 1, AdInstructorId: id, AdTermId: 9, SCode: "101",
  fstarttime: "09:00", fendtime: "10:00", fsunday: true,
  importEvidence: { instructor: { source, method } },
});
const options = { requireDepartmentInstructor: true, checkConflicts: false };
for (const [source, method] of [["OCR", "EXACT_FULL"], ["OCR", "FACULTY_IDENTITY"], ["MANUAL", "USER_EDIT"], ["OCR", "DEPARTMENT_TWO_NAME"]]) {
  for (const id of [41, 42, 43]) {
    assert.equal((await validateSmartRows([row(id, source, method)], 5, 7, options)).length, 0);
  }
  const errors: string[] = await validateSmartRows([row(99, source, method)], 5, 7, options);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /ليس ضمن قائمة القسم/);
}
members = []; delegates = []; visitors = [];
assert.equal((await departmentInstructorIdSet([], [], 5, 7, 9)).size, 0, "empty departments never expand to the college or university");
assert.match((await validateSmartRows([row(41, "MANUAL", "USER_EDIT")], 5, 7, options))[0], /ليس ضمن قائمة القسم/);
console.log("Department scope: member/delegate/visitor accepted; outside exact, faculty and manual identities rejected; empty scope stays empty.");
