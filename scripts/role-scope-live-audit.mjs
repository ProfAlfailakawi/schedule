#!/usr/bin/env node
/**
 * ── تدقيقٌ حيّ: ما يصل كلَّ صفةٍ من كل مسار ────────────────────────────────
 *
 * يشغَّل على خادمٍ تجريبيٍّ معزول (DATA_MODE=demo، بلا .env — انظر
 * docs أو ذاكرة «live-demo-environment»). يفتح جلسةَ الديمو، ويبدّل إلى كل صفة،
 * ويطرق كل مسار قراءةٍ بنطاقه وبنطاقِ غيره، ثم يمشي على كل JSON يعود ويجمع كل
 * (كلية، قسم) فيه. أيُّ قسمٍ خارج نطاق الصفة = تسريب.
 *
 *   node scripts/role-scope-live-audit.mjs http://localhost:3000 [--verbose]
 *
 * يخرج بجدول (صفة × مسار → OK / LEAK / DENIED / ERR) ويعود بـ1 إن وُجد تسريب.
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const BASE = process.argv[2] || "http://localhost:3000";
const VERBOSE = process.argv.includes("--verbose");
const ONLY = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7).split(",").filter(Boolean);

let cookie = "";
async function call(method, url, body) {
  const response = await fetch(BASE + url, {
    method, redirect: "manual",
    headers: { cookie, "content-type": "application/json", "x-requested-with": "XMLHttpRequest", origin: BASE },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = response.headers.get("set-cookie");
  if (set && /session_id=/.test(set)) cookie = set.split(";")[0];
  const type = response.headers.get("content-type") || "";
  if (/spreadsheet|octet-stream/.test(type)) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const book = XLSX.read(buffer, { type: "buffer" });
    const text = book.SheetNames.map(name => XLSX.utils.sheet_to_csv(book.Sheets[name])).join("\n");
    return { status: response.status, json: { __sheet: text }, text, headers: response.headers };
  }
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* نصّ أو HTML */ }
  return { status: response.status, json, text, headers: response.headers };
}

const ROLES = ["admin", "dean", "viceDean", "registrarDean", "registrarHead", "registrarStaff", "departmentHead", "committeeChair", "standard", "committeeChairMultiSite"];

/* ── المشي على الجواب ───────────────────────────────────────────────────── */
const COLLEGE_KEYS = ["AdCollegeId", "collegeId", "college_id"];
const SECTION_KEYS = ["AdSectionId", "sectionId", "section_id"];
function walk(value, visit, trail = "$") {
  if (Array.isArray(value)) { value.forEach((item, i) => walk(item, visit, `${trail}[${i}]`)); return; }
  if (value && typeof value === "object") {
    visit(value, trail);
    for (const [key, child] of Object.entries(value)) walk(child, visit, `${trail}.${key}`);
  }
}
const first = (object, keys) => { for (const key of keys) if (key in object) return Number(object[key]); return undefined; };

function pairsIn(json) {
  const found = [];
  walk(json, (object, trail) => {
    const section = first(object, SECTION_KEYS);
    const college = first(object, COLLEGE_KEYS);
    if (section && section > 0) found.push({ college, section, trail });
    else if (college && college > 0 && !("AdCollegeName" in object && Object.keys(object).length <= 4)) found.push({ college, section: 0, trail });
  });
  return found;
}

/* ── النطاق ─────────────────────────────────────────────────────────────── */
function scopeOf(me, sections) {
  const role = me.role?.id || me.user?.Role;
  const admin = Boolean(me.user?.IsAdminUser);
  const allColleges = ["registrarDean", "registrarHead"].includes(role);
  const collegeWide = new Set(), own = new Set();
  for (const scope of me.scopes || []) {
    if (!Number(scope.AdSectionId) || scope.AdCollegeWide) collegeWide.add(Number(scope.AdCollegeId));
    else own.add(Number(scope.AdSectionId));
  }
  const allowedSection = id => admin || allColleges || own.has(id) || collegeWide.has(Number(sections.get(id)?.AdCollegeId));
  const allowedCollege = id => admin || allColleges || collegeWide.has(id) || [...own].some(s => Number(sections.get(s)?.AdCollegeId) === id);
  return { role, admin, allowedSection, allowedCollege, own, collegeWide };
}

async function main() {
  const start = await call("POST", "/api/auth/demo");
  if (start.status !== 200) throw new Error(`demo login failed ${start.status} ${start.text.slice(0, 200)}`);
  // الإدارة ترى كل شيء: منها تُعرف الأقسام وأرقام المواعيد لكل قسم.
  const sectionsList = (await call("GET", "/api/sections")).json || [];
  const sections = new Map(sectionsList.map(row => [Number(row.AdSectionId), row]));
  const adminRows = (await call("GET", "/api/schedules?termId=1")).json || [];
  const adminRowsPrev = (await call("GET", "/api/schedules?termId=2")).json || [];
  const rowOf = sectionId => adminRows.find(row => Number(row.AdSectionId) === sectionId);
  const approvals = (await call("GET", "/api/approvals/term?termId=1")).json || {};
  const accepted = new Set((approvals.approvals || []).filter(a => a.status === "accepted").map(a => Number(a.AdSectionId)));
  const instructors = (await call("GET", "/api/instructors")).json;
  const instructorList = Array.isArray(instructors) ? instructors : instructors?.instructors || instructors?.rows || [];

  const report = [];
  let leaks = 0;
  for (const roleKey of ROLES) {
    if (ONLY.length && !ONLY.includes(roleKey)) continue;
    const switched = await call("POST", "/api/demo/role", { role: roleKey });
    if (switched.status !== 200) { console.log(`! ${roleKey}: switch ${switched.status}`); continue; }
    const me = (await call("GET", "/api/auth/me")).json;
    const scope = scopeOf(me, sections);
    const permissions = new Set(me.permissions || []);
    const ownSection = [...scope.own][0] || [...sections.values()].find(s => scope.collegeWide.has(Number(s.AdCollegeId)))?.AdSectionId || 1;
    const ownCollege = Number(sections.get(Number(ownSection))?.AdCollegeId || 1);
    const foreign = [...sections.values()].find(s => !scope.allowedSection(Number(s.AdSectionId)));
    const foreignSection = Number(foreign?.AdSectionId || 0), foreignCollege = Number(foreign?.AdCollegeId || 0);
    const ownRow = rowOf(Number(ownSection)), foreignRow = foreignSection ? rowOf(foreignSection) : undefined;
    const instructorId = Number(ownRow?.AdInstructorId || instructorList[0]?.AdInstructorId || 1);
    const foreignInstructor = Number(foreignRow?.AdInstructorId || 0);
    const deanReader = ["dean", "viceDean"].includes(scope.role) && !scope.admin;

    const own = `collegeId=${ownCollege}&sectionId=${ownSection}&termId=1`;
    const alien = foreignSection ? `collegeId=${foreignCollege}&sectionId=${foreignSection}&termId=1` : "";
    const alienCollege = foreignSection ? `collegeId=${foreignCollege}&termId=1` : "";
    const probes = [
      ["dashboard", "/api/dashboard?termId=1"],
      ["journey", "/api/journey?termId=1"],
      ["search", "/api/search?q=%D8%AF"],
      ["search:course", "/api/search?q=CS"],
      ["colleges", "/api/colleges"],
      ["sections", "/api/sections"],
      ["terms", "/api/terms"],
      ["instructors", "/api/instructors"],
      ["instructors:search", `/api/instructors?q=${encodeURIComponent("د.")}`],
      ["courses", "/api/courses"],
      ["courses:alien", `/api/courses?collegeId=${foreignCollege}&sectionId=${foreignSection}`],
      ["curriculum:own", `/api/curriculum/sections/${ownSection}`],
      ["curriculum:alien", foreignSection && `/api/curriculum/sections/${foreignSection}`],
      ["schedules:all", "/api/schedules?termId=1"],
      ["schedules:own", `/api/schedules?${own}`],
      ["schedules:alien", alien && `/api/schedules?${alien}`],
      ["schedules:alienCollege", alienCollege && `/api/schedules?${alienCollege}`],
      ["schedules:instructor", `/api/schedules?termId=1&instructorId=${foreignInstructor || instructorId}`],
      ["workspace:own", `/api/schedules/workspace?${own}`],
      ["workspace:alien", alien && `/api/schedules/workspace?${alien}`],
      ["hall-barter", `/api/hall-barter?${own}`],
      ["hall-barter:alien", alien && `/api/hall-barter?${alien}`],
      ["hall-barter/inbox", `/api/hall-barter/inbox?termId=1`],
      ["review-readiness", `/api/schedules/review-readiness?${own}`],
      ["review-readiness:alien", alien && `/api/schedules/review-readiness?${alien}`],
      ["outside-clashes", `/api/schedules/outside-clashes?${own}`],
      ["export", `/api/schedules/export?${own}`],
      ["export:alien", alien && `/api/schedules/export?${alien}`],
      ["visiting-roster", `/api/visiting-roster?${own}`],
      ["visiting-roster:alien", alien && `/api/visiting-roster?${alien}`],
      ["reports/visiting-roster", `/api/reports/visiting-roster?termId=1`],
      ["reports/visiting-history", `/api/reports/visiting-history?collegeId=${ownCollege}&termId=1`],
      ["reports/visiting-history:alien", alienCollege && `/api/reports/visiting-history?${alienCollege}`],
      ["instructor-affiliations", `/api/instructor-affiliations?${own}`],
      ["affiliation:alien", foreignInstructor && `/api/instructors/${foreignInstructor}/affiliation?termId=1`],
      ["delegates", `/api/delegates?${own}`],
      ["department-delegates", `/api/department-delegates?${own}`],
      ["department-delegates:alien", alien && `/api/department-delegates?${alien}`],
      ["department-rooms", `/api/department-rooms?${own}`],
      ["department-rooms:alien", alien && `/api/department-rooms?${alien}`],
      ["location-registry", `/api/location-registry?${own}`],
      ["replace-history", `/api/schedules/replace-instructor/history?${own}`],
      ["replace-history:alien", alien && `/api/schedules/replace-instructor/history?${alien}`],
      ["courses/nature", `/api/courses/nature?${own}`],
      ["rooms/owner", `/api/rooms/owner?${own}`],
      ["exceptions:own", ownRow && `/api/schedules/${ownRow.id}/exceptions`],
      ["exceptions:alien", foreignRow && `/api/schedules/${foreignRow.id}/exceptions`],
      ["substitutes:alien", foreignRow && `/api/schedules/${foreignRow.id}/substitutes`],
      ["copy-preview", `/api/schedules/copy-preview?${own}&fromTermId=2&toTermId=1`],
      ["intel/open-decisions", `/api/intelligence/open-decisions?${own}`],
      ["intel/operations-review", `/api/intelligence/operations-review?${own}`],
      ["intel/overview", `/api/intelligence/overview?${own}`],
      ["intel/overview:all", `/api/intelligence/overview?termId=1`],
      ["intel/spatial-burnout", `/api/intelligence/spatial-burnout?${own}`],
      ["intel/lookups", `/api/intelligence/lookups?${own}`],
      ["intel/genome", `/api/intelligence/genome?${own}`],
      ["intel/constraints", `/api/intelligence/constraints?${own}`],
      ["intel/constraints:alien", alien && `/api/intelligence/constraints?${alien}`],
      ["intel/context:alien", foreignRow && `/api/intelligence/context/${foreignRow.id}`],
      ["intel/replay:alien", foreignRow && `/api/intelligence/replay/${foreignRow.id}`],
      ["intel/room", ownRow && `/api/intelligence/room?termId=1&room=${encodeURIComponent(ownRow.AdRoomCode || "")}&hall=${encodeURIComponent(ownRow.AdRoomHall || "")}&roomId=${encodeURIComponent(ownRow.roomId || "")}`],
      ["intel/room:alien", foreignRow && `/api/intelligence/room?termId=1&room=${encodeURIComponent(foreignRow.AdRoomCode || "")}&hall=${encodeURIComponent(foreignRow.AdRoomHall || "")}&roomId=${encodeURIComponent(foreignRow.roomId || "")}`],
      ["intel/professor:alien", foreignInstructor && `/api/intelligence/professor/${foreignInstructor}?termId=1`],
      ["intel/comments:alien", foreignRow && `/api/intelligence/comments/${foreignRow.id}`],
      ["intel/drafts", `/api/intelligence/drafts?${own}`],
      ["intel/versions", `/api/intelligence/versions?${own}`],
      ["intel/versions:alien", alien && `/api/intelligence/versions?${alien}`],
      ["intel/compare-terms", `/api/intelligence/compare-terms?${own}&fromTermId=2&toTermId=1`],
      ["intel/compare-terms:alien", alien && `/api/intelligence/compare-terms?${alien}&fromTermId=2&toTermId=1`],
      ["intel/living", `/api/intelligence/living?${own}`],
      ["intel/living:alien", alien && `/api/intelligence/living?${alien}`],
      ["intel/decision-memory", `/api/intelligence/decision-memory?${own}`],
      ["intel/start-rhythm", `/api/intelligence/department-start-rhythm?${own}`],
      ["intel/start-rhythm:alien", alien && `/api/intelligence/department-start-rhythm?${alien}`],
      ["intel/settled-drift", `/api/intelligence/settled-drift?${own}`],
      ["intel/rollover", `/api/intelligence/rollover?${own}`],
      ["intel/brief", `/api/intelligence/brief?${own}`],
      ["intel/safety-net", `/api/intelligence/safety-net?${own}`],
      ["intel/guide-friction", `/api/intelligence/guide-friction`],
      ["intel/experience-health", `/api/intelligence/experience-health`],
      ["approvals:own", `/api/approvals?${own}`],
      ["approvals:alien", alien && `/api/approvals?${alien}`],
      ["approvals/term", `/api/approvals/term?termId=1`],
      ["schedule-notes:own", `/api/schedule-notes?${own}`],
      ["schedule-notes:alien", alien && `/api/schedule-notes?${alien}`],
      ["notifications", `/api/notifications?termId=1`],
      ["approvals/badge", `/api/approvals/badge?termId=1`],
      ["approvals/inbox", `/api/approvals/inbox?termId=1`],
      ["schedule-changes:own", `/api/reports/schedule-changes?${own}`],
      ["schedule-changes:alien", alien && `/api/reports/schedule-changes?${alien}`],
      ["authority-diff:alien", alien && `/api/reports/authority-pdf-diff?${alien}`],
      ["audit-logs", `/api/audit-logs`],
      ["users", `/api/users`],
      ["user-scopes", `/api/user-scopes`],
      ["admin-user-options", `/api/admin-user-options`],
      ["admin-instructor-options", `/api/admin-instructor-options`],
      ["excel:schedule", `/api/reports/excel/ScheduleExcel?termId=1`],
      ["excel:department", `/api/reports/excel/ListofTeacherCourseExcel?termId=1`],
      ["excel:department:alien", alien && `/api/reports/excel/ListofTeacherCourseExcel?${alien}`],
      ["excel:instructor", `/api/reports/excel/TeacherWithCourseExcel?termId=1&instructorId=${foreignInstructor || instructorId}`],
      ["natural", `/api/search/natural?q=${encodeURIComponent("محاضرات يوم الأحد")}&termId=1`],
      ["natural:instructor", `/api/search/natural?q=${encodeURIComponent("جدول د. سالم")}&termId=1`],
      ["department-balance", `/api/reports/department-balance?termId=1`],
      ["department-balance:alienCollege", alienCollege && `/api/reports/department-balance?${alienCollege}`],
      ["room-load", `/api/reports/room-load?termId=1`],
      ["room-load:own", `/api/reports/room-load?${own}`],
      ["share", `/api/share?${own}`],
      ["degree-rules", `/api/degree-rules?${own}`],
      ["demand:own", `/api/schedules/demand?${own}`],
      ["demand:alien", alien && `/api/schedules/demand?${alien}`],
      ["student-registration", `/api/student-registration?${own}`],
      ["student-registration:alien", alien && `/api/student-registration?${alien}`],
      ["staff-inbox", `/api/schedules/staff-inbox?${own}`],
      ["instructor-requests", `/api/instructor-requests?collegeId=${ownCollege}&termId=1`],
      ["instructor-requests:alien", alien && `/api/instructor-requests?${alien}`],
      ["mobility", `/api/colleges/${ownCollege}/mobility?termId=1`],
      ["mobility:alien", foreignCollege && `/api/colleges/${foreignCollege}/mobility?termId=1`],
    ].filter(([, url]) => url);
    /* «الكلية وحدها»: لكل مسارٍ يأخذ القسم، نسخةٌ بلا قسم. isScopeAllowed بقسمٍ
       صفر يعني «له شيءٌ في هذه الكلية» — فمسارٌ يقرأ بها الكليةَ كلها يسرّب
       أقسامها لحساب قسمٍ واحد. */
    if (!scope.admin && scope.own.size) {
      for (const [name, url] of [...probes]) {
        if (!url.includes(`sectionId=${ownSection}`) || name.includes(":alien")) continue;
        probes.push([`${name}:collegeOnly`, url.replace(`&sectionId=${ownSection}`, "").replace(`sectionId=${ownSection}&`, "")]);
      }
    }

    for (const [name, url] of probes) {
      const result = await call("GET", url);
      let verdict = "OK", detail = "";
      if (result.status === 401 || result.status === 403 || result.status === 404) verdict = "DENIED";
      else if (result.status >= 400) { verdict = `ERR${result.status}`; detail = (result.json?.error || result.text || "").slice(0, 80); }
      else if (result.json != null) {
        /* طلبُ طالبٍ يسمّي مقرّرين (تعارض مقررين) يحمل مقرّرَ القسم الآخر للقراءة
           وحدها (readOnly + decidedBySectionName): هذا من القرار نفسه، لا تسريب
           (src/utils/studentCaseScope.ts). */
        const shared = new Set();
        walk(result.json, (object, trail) => {
          if (object.readOnly === true && "decidedBySectionName" in object) shared.add(trail);
          if (object.requestType === "course-conflict" && Array.isArray(object.courses)) object.courses.forEach((_, i) => shared.add(`${trail}.courses[${i}]`));
        });
        /* أرقامُ مواعيد بلا قسمٍ بجانبها (scheduleId، rowIds، ids): تُردّ إلى قسمها. */
        const rowSection = new Map([...adminRows, ...adminRowsPrev].map(row => [Number(row.id), Number(row.AdSectionId)]));
        const alienRows = [];
        walk(result.json, (object, trail) => {
          for (const key of ["scheduleId", "rowId", "ownId"]) {
            const id = Number(object[key]);
            if (id && rowSection.has(id) && !scope.allowedSection(rowSection.get(id))) alienRows.push(`${trail}.${key}=${id}`);
          }
          for (const key of ["ids", "rowIds"]) {
            if (Array.isArray(object[key])) object[key].forEach(value => { const id = Number(value); if (id && rowSection.has(id) && !scope.allowedSection(rowSection.get(id))) alienRows.push(`${trail}.${key}∋${id}`); });
          }
        });
        const bad = pairsIn(result.json)
          .filter(pair => !shared.has(pair.trail))
          .filter(pair => pair.section ? !scope.allowedSection(pair.section) : !scope.allowedCollege(pair.college));
        // العميدان: النهائيُّ وحده — صفُّ موعدٍ من قسمٍ غير معتمد تسريبٌ أيضاً.
        const unfinal = [];
        if (deanReader) walk(result.json, (object, trail) => {
          if ("fstarttime" in object && "AdSectionId" in object && !accepted.has(Number(object.AdSectionId))) unfinal.push(trail);
        });
        if (bad.length || unfinal.length || alienRows.length) {
          verdict = "LEAK"; leaks++;
          const sample = [...bad.slice(0, 3).map(p => `${p.college}:${p.section}@${p.trail}`), ...alienRows.slice(0, 2)];
          detail = [...sample, ...(unfinal.length ? [`unfinal×${unfinal.length}@${unfinal[0]}`] : [])].join(" ");
        }
        // الرقمُ المدني كاملاً لأستاذٍ لم يدرّس في نطاق القارئ قطّ = تسريبُ بياناتٍ شخصية.
        if (verdict === "OK" && !scope.admin) {
          const circle = new Set([...adminRows, ...adminRowsPrev].filter(row => scope.allowedSection(Number(row.AdSectionId))).map(row => Number(row.AdInstructorId)));
          const exposed = [];
          walk(result.json, object => {
            if ("AdInstructorId" in object && /^\d{12}$/.test(String(object.AdInstructorCivil || "")) && !circle.has(Number(object.AdInstructorId))) exposed.push(object.AdInstructorId);
          });
          if (exposed.length) { verdict = "LEAK"; leaks++; detail = `civil×${exposed.length} (ids ${[...new Set(exposed)].slice(0, 4).join(",")})`; }
        }
        // اسمُ قسمٍ أجنبيّ في نصّ الجواب (إشارةٌ لا حُكم).
        if (verdict === "OK" && !scope.admin) {
          const allowedNames = new Set([...sections.values()].filter(s => scope.allowedSection(Number(s.AdSectionId))).map(s => String(s.AdSectionName)));
          const names = [...sections.values()].filter(s => !scope.allowedSection(Number(s.AdSectionId)) && !allowedNames.has(String(s.AdSectionName)))
            .map(s => String(s.AdSectionName)).filter(n => n.length > 5 && result.text.includes(n));
          if (names.length) { verdict = "NAME?"; detail = names.join("،"); }
        }
      }
      report.push({ role: roleKey, name, status: result.status, verdict, detail });
      if (VERBOSE || verdict === "LEAK" || verdict === "NAME?" || verdict.startsWith("ERR")) console.log(`${roleKey.padEnd(24)} ${name.padEnd(32)} ${String(result.status).padEnd(4)} ${verdict.padEnd(7)} ${detail}`);
    }
  }
  // الجدول: صفّ لكل مسار، عمود لكل صفة.
  const names = [...new Set(report.map(r => r.name))];
  const roles = [...new Set(report.map(r => r.role))];
  if (process.argv.includes("--json")) console.log(JSON.stringify(report));
  console.log("\nroute".padEnd(34) + roles.map(r => r.slice(0, 10).padEnd(11)).join(""));
  for (const name of names) {
    console.log(name.padEnd(33) + roles.map(role => (report.find(r => r.role === role && r.name === name)?.verdict || "-").padEnd(11)).join(""));
  }
  console.log(`\nLEAK cells: ${leaks}`);
  process.exit(leaks ? 1 : 0);
}

main().catch(error => { console.error(error); process.exit(2); });
