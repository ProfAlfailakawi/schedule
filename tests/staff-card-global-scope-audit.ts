import fs from "fs";
import path from "path";

let passed = 0, failed = 0;
function check(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}

const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
const card = server.slice(server.indexOf("async function buildStaffCard"), server.indexOf('app.get("/api/share"'));
const calendar = server.slice(server.indexOf('app.get("/api/public/ics/:token/:key"'), server.indexOf("const STAFF_NOTES_PER_DAY"));
const page = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));

check(card.includes("Repository.getSchedulesByScope({ termId: link.AdTermId })"), "staff link opens the instructor across the whole term");
check(card.includes("Repository.getSchedulesByScope({ termId: displayTermId })"), "term switching remains institution-wide");
check(!card.includes("getSchedulesByScope({ collegeId: link.AdCollegeId, termId:"), "issuing college no longer trims the instructor card");
check(card.includes("requestScopeMap") && card.includes("getInstructorRequests(scope.collegeId, scope.sectionId"), "requests follow each lecture's real college and section");
check(card.includes("movementScopeMap") && card.includes("getScheduleVersions(scope.collegeId, scope.sectionId"), "movement history follows every real teaching scope");
check(card.includes("row.college") && card.includes("department:"), "lecture rows carry their teaching location");
check(card.includes('teachingColleges.length > 1 ? "كل مواقعك"'), "multi-site card is labelled as all locations");
check(page.includes("visibleCardCollege(row.college)") && !page.includes("row.department") && page.includes(".map(esc)"), "visible timetable identifies non-default site without repeating department");
check(calendar.includes("Repository.getSchedulesByScope({ termId: liveTermId })"), "personal calendar follows the instructor institution-wide");
check(!calendar.includes("collegeId: resolved.link.AdCollegeId, termId: liveTermId"), "personal calendar is not limited to the issuing college");
check(calendar.includes("collegeById.get(Number(row.AdCollegeId))?.AdCollegeName"), "calendar location identifies the real college/site");

console.log(`\nStaff-card global-scope audit: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
