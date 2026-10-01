/**
 * «القسم واحد ومنتدبوه واحد في كل كلياته»: الأقسام المتطابقة اسماً عبر الكليات
 * عائلةٌ واحدة، ومنتدبوها قائمةٌ واحدة — قراءةً اتحاداً، وكتابةً فرقاً على الاتحاد.
 * يُختبر على قسم «الدراسات الإسلامية» في الكليات الثلاث داخل الصندوق التجريبي.
 */
import fs from "fs";
import { Repository } from "../src/db/repository";
import { departmentFamily, departmentFamilyKey, departmentFamilyResolver } from "../src/utils/sectionLabel";
import { termVisitingIds } from "../src/utils/liveVisiting";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

check(departmentFamilyKey("قسم الدراسات الإجتماعية") === departmentFamilyKey("الدراسات الاجتماعية"), "مفتاح العائلة يتجاوز «قسم» والهمزة");
const sections = [
  { AdSectionId: 10, AdCollegeId: 1, AdSectionName: "قسم تكنولوجيا التعليم" },
  { AdSectionId: 20, AdCollegeId: 2, AdSectionName: "تكنولوجيا التعليم" },
  { AdSectionId: 30, AdCollegeId: 2, AdSectionName: "الرياضيات" },
];
check(JSON.stringify(departmentFamily(sections, 2, 20)) === JSON.stringify([{ collegeId: 2, sectionId: 20 }, { collegeId: 1, sectionId: 10 }]), "عائلة القسم: هو أولاً ثم أخته");
check(departmentFamily(sections, 2, 30).length === 1, "قسمٌ بلا أخت عائلتُه نفسُه");
const resolve = departmentFamilyResolver(sections);
check(termVisitingIds([
  { collegeId: 1, sectionId: 10, instructorIds: [7], kind: "directory" },
  { collegeId: 2, sectionId: 20, instructorIds: [7], kind: "roster", termId: 1 },
], 1, () => true, resolve).includes(7), "متى نلتقي: روسترُ كليةٍ يُقرأ مع دليل أختها");

async function behaviour() {
  const id = `demo_family_${Date.now()}`;
  Repository.createDemoSandbox(id, 60_000);
  await Repository.withDemoSandbox(id, async () => {
    const isl = (await Repository.getSections()).filter(s => String(s.AdSectionCode) === "ISL");
    check(isl.length === 3, "قسم الدراسات الإسلامية في الكليات الثلاث");
    const [a, b, c] = isl.map(s => ({ collegeId: Number(s.AdCollegeId), sectionId: Number(s.AdSectionId) }));
    const person = 13;
    await Repository.addDepartmentDelegate(a.collegeId, a.sectionId, person);
    check((await Repository.getDepartmentDelegates(b.collegeId, b.sectionId)).includes(person), "أُضيف في كلية فظهر في الأخرى بلا ضمّ");
    await Repository.saveVisitingRoster(c.collegeId, c.sectionId, 1, [...await Repository.getVisitingRoster(c.collegeId, c.sectionId, 1), person]);
    check((await Repository.getVisitingRoster(a.collegeId, a.sectionId, 1)).includes(person), "علامة الفصل في كلية تظهر في كل كليات القسم");
    check((await Repository.getVisitingRosterMember(a.collegeId, a.sectionId, 1)).length === 0, "بلا ترحيل: المضاف يُكتب في وثيقة القسم المفتوح وحده");
    const remaining = (await Repository.getDepartmentDelegates(b.collegeId, b.sectionId)).filter(x => x !== person);
    await Repository.saveDepartmentDelegates(b.collegeId, b.sectionId, remaining);
    await Repository.saveVisitingRoster(b.collegeId, b.sectionId, 1, (await Repository.getVisitingRoster(b.collegeId, b.sectionId, 1)).filter(x => x !== person));
    const gone = await Promise.all([a, b, c].map(m => Repository.getDepartmentDelegates(m.collegeId, m.sectionId)));
    check(gone.every(list => !list.includes(person)), "الحذف من كلية يزيله من العائلة كلها (لا يعيده الاتحاد)");
    check(!(await Repository.getVisitingRoster(a.collegeId, a.sectionId, 1)).includes(person), "وكذلك علامة الفصل");
  });
}

const server = fs.readFileSync("server.ts", "utf8");
check(!server.includes("/api/department-delegates/elsewhere") && !server.includes("/api/department-delegates/adopt"), "لا مسار «elsewhere/adopt»: العائلة تقرأ تلقائياً");
check(!fs.readFileSync("src/components/ScheduleTransfer.tsx", "utf8").includes("adoptDelegate"), "ولا زرّ ضمّ في الواجهة");
const famDefs = [server, fs.readFileSync("src/db/repository.ts", "utf8"), fs.readFileSync("src/utils/liveVisiting.ts", "utf8")]
  .some(text => /function departmentFamily(Key)?\b/.test(text));
check(!famDefs, "قاعدة العائلة في sectionLabel وحده");
check(/departmentFamilyResolver\(sections\)/.test(server.slice(server.indexOf("async function meetingExcludedIds"))), "متى نلتقي يستعمل العائلة");

behaviour().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}).catch(error => { console.error(error); process.exit(1); });
