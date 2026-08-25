import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseScheduleTable, type OcrPage } from "../src/utils/documentOcr.ts";
import { resolveAuthorityLocation } from "../src/utils/locationRegistry.ts";

const here=dirname(fileURLToPath(import.meta.url));
const fixture=JSON.parse(readFileSync(join(here,"fixtures/authority-import-golden.json"),"utf8"));
const academic=fixture.academic;
const courseInstructorIds=new Map<number,Set<number>>(Object.entries(academic.courseInstructorIds).map(([id,people])=>[Number(id),new Set((people as number[]).map(Number))]));
const pages:OcrPage[]=[{rows:[],gridRows:academic.rows.map((row:any)=>({
  code:row.code,reference:row.reference,scode:"999",courseText:row.courseText,instructorText:row.instructorText,
  building:row.building,buildingRaw:row.building,hall:row.hall,hallRaw:row.hall,start:row.start,end:row.end,days:row.days,
}))} as any];
const parsed=parseScheduleTable(pages,academic.courses,academic.instructors,new Set(academic.instructors.map((person:any)=>Number(person.AdInstructorId))),{
  authorityDepartmentCode:academic.departmentCode,sequentialSections:true,courseInstructorIds,
});
assert.equal(parsed.rows.length,academic.rows.length,"golden academic row count changed");
academic.rows.forEach((expected:any,index:number)=>{
  const row=parsed.rows[index];
  assert.equal(row.AdCourseId,expected.expectedCourseId,`row ${index+1}: course identity changed`);
  assert.equal(row.AdCourseName,academic.courses.find((course:any)=>Number(course.AdCourseId)===Number(expected.expectedCourseId))?.CourseName,`row ${index+1}: canonical course name changed`);
  assert.equal(row.SCode,expected.expectedSection,`row ${index+1}: 501 sequence changed`);
  assert.equal(row.AdInstructorId,expected.expectedInstructorId,`row ${index+1}: instructor safety changed`);
});

const registry:any={buildings:fixture.locations.buildings,rooms:fixture.locations.rooms};
const known=fixture.locations.buildings.map((building:any)=>building.officialCode);
fixture.locations.cases.forEach((expected:any,index:number)=>{
  const result=resolveAuthorityLocation(registry,{
    rawBuilding:expected.rawBuilding,rawRoom:expected.rawRoom,collegeId:expected.collegeId,sectionId:expected.sectionId,
    branchRoot:expected.branchRoot,sitePrefix:expected.sitePrefix,knownOfficialCodes:known,
  });
  assert.equal(result.building.value?.officialCode??null,expected.expectedBuilding,`location case ${index+1}: building changed`);
  assert.equal(result.room?.value?.canonicalCode??null,expected.expectedRoom,`location case ${index+1}: room changed`);
  assert.equal(result.buildingMethod,expected.expectedMethod,`location case ${index+1}: proof method changed`);
});

console.log(JSON.stringify({passed:academic.rows.length+fixture.locations.cases.length,fixtureVersion:fixture.version,guard:"authority-import-golden"}));
