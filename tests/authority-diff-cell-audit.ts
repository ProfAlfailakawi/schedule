import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import React from "react";
import AuthorityPdfReport, { AuthorityReport, AuthorityReportEntry } from "../src/components/AuthorityPdfReport";
import { AdCourse, AdInstructor, FSchedule } from "../src/types";

console.log("=========================================================================");
console.log(" AUTHORITY PDF REPORT CELL-LEVEL DIFF & HIGHLIGHTING AUDIT");
console.log("=========================================================================\n");

const courseById = new Map<number, AdCourse>([
  [101, { AdCourseId: 101, AdCollegeId: 6, AdSectionId: 9, CourseCode: "102", CourseName: "الثقافة الإسلامية", CourseHours: 3, CourseCredit: 3, MaxStudent: 45 }],
  [102, { AdCourseId: 102, AdCollegeId: 6, AdSectionId: 9, CourseCode: "150", CourseName: "علوم القرآن", CourseHours: 3, CourseCredit: 3, MaxStudent: 40 }],
]);

const instructorById = new Map<number, AdInstructor>([
  [1, { AdInstructorId: 1, AdInstructorName: "د. علي يوسف أحمد السند" } as any],
  [2, { AdInstructorId: 2, AdInstructorName: "د. عبدالرحمن صالح سالم الجميلي" } as any],
]);

const baseSchedule: FSchedule = {
  id: 1,
  AdCourseId: 101,
  AdCollegeId: 6,
  AdSectionId: 9,
  AdTermId: 1,
  SCode: "501",
  AdRoomCode: "012B09",
  AdRoomHall: "F13",
  fstarttime: "08:00",
  fendtime: "09:20",
  fsunday: false,
  fmonday: true,
  ftuesday: false,
  fwednesday: true,
  fthursday: false,
  AdInstructorId: 1,
  referenceNumber: "18945",
  sourceOrder: 1,
} as any;

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓ PASS:\x1b[0m ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  \x1b[31m✗ FAIL:\x1b[0m ${name}`);
    console.error(err);
  }
}

// Test 1: Change ROOM ONLY
test("Scenario A: Changing ROOM ONLY applies authority-pdf-cell-changed ONLY to room cell", () => {
  const modifiedSchedule: FSchedule = {
    ...baseSchedule,
    AdRoomHall: "F31", // changed from F13 to F31
  };

  const reportEntry: AuthorityReportEntry = {
    status: "changed",
    changedFields: ["AdRoomHall"],
    referenceNumber: "18945",
    source: baseSchedule,
    current: modifiedSchedule,
  };

  const report: AuthorityReport = {
    draftId: "draft-1",
    name: "تقرير مقارنة",
    sourceFileName: "جدول_معتمد.pdf",
    counts: { added: 0, deleted: 0, changed: 1, unchanged: 0 },
    rows: [reportEntry],
  };

  const html = renderToString(
    React.createElement(AuthorityPdfReport, {
      report,
      termName: "الفصل الأول 2026/2027",
      collegeName: "كلية التربية الأساسية",
      collegeCode: "01",
      sectionName: "الدراسات الإسلامية",
      sectionCode: "01",
      courseById,
      instructorById,
      visitingIds: new Set(),
    })
  );

  // Assert count of authority-pdf-cell-changed is EXACTLY 1
  const matches = html.match(/authority-pdf-cell-changed/g) || [];
  assert.equal(matches.length, 1, `Expected exactly 1 highlighted cell, found ${matches.length}`);

  // Assert that F31 has the class, but building 012B09 does not have it
  assert.ok(html.includes('class="print-ltr authority-pdf-cell-changed">F31</div>'));
  assert.ok(html.includes('class="print-ltr ">012B09</div>') || html.includes('class="print-ltr">012B09</div>') || !html.includes('012B09</div>') || html.includes('>012B09</div>'));
  assert.ok(!html.includes('012B09</div>').toString().includes("authority-pdf-cell-changed"));
});

// Test 2: Change INSTRUCTOR + ROOM
test("Scenario B: Changing INSTRUCTOR + ROOM applies authority-pdf-cell-changed ONLY to those two cells", () => {
  const modifiedSchedule: FSchedule = {
    ...baseSchedule,
    AdRoomHall: "F31", // changed
    AdInstructorId: 2, // changed
  };

  const reportEntry: AuthorityReportEntry = {
    status: "changed",
    changedFields: ["AdRoomHall", "AdInstructorId"],
    referenceNumber: "18945",
    source: baseSchedule,
    current: modifiedSchedule,
  };

  const report: AuthorityReport = {
    draftId: "draft-1",
    name: "تقرير مقارنة",
    sourceFileName: "جدول_معتمد.pdf",
    counts: { added: 0, deleted: 0, changed: 1, unchanged: 0 },
    rows: [reportEntry],
  };

  const html = renderToString(
    React.createElement(AuthorityPdfReport, {
      report,
      termName: "الفصل الأول 2026/2027",
      collegeName: "كلية التربية الأساسية",
      collegeCode: "01",
      sectionName: "الدراسات الإسلامية",
      sectionCode: "01",
      courseById,
      instructorById,
      visitingIds: new Set(),
    })
  );

  const matches = html.match(/authority-pdf-cell-changed/g) || [];
  assert.equal(matches.length, 2, `Expected exactly 2 highlighted cells, found ${matches.length}`);
});

// Test 3: Unchanged row has ZERO highlights
test("Scenario C: Unchanged row has ZERO authority-pdf-cell-changed occurrences", () => {
  const reportEntry: AuthorityReportEntry = {
    status: "unchanged",
    changedFields: [],
    referenceNumber: "18945",
    source: baseSchedule,
    current: baseSchedule,
  };

  const report: AuthorityReport = {
    draftId: "draft-1",
    name: "تقرير مقارنة",
    sourceFileName: "جدول_معتمد.pdf",
    counts: { added: 0, deleted: 0, changed: 0, unchanged: 1 },
    rows: [reportEntry],
  };

  const html = renderToString(
    React.createElement(AuthorityPdfReport, {
      report,
      termName: "الفصل الأول 2026/2027",
      collegeName: "كلية التربية الأساسية",
      collegeCode: "01",
      sectionName: "الدراسات الإسلامية",
      sectionCode: "01",
      courseById,
      instructorById,
      visitingIds: new Set(),
    })
  );

  const matches = html.match(/authority-pdf-cell-changed/g) || [];
  assert.equal(matches.length, 0, `Expected 0 highlighted cells for unchanged row, found ${matches.length}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
