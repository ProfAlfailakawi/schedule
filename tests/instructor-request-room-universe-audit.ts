/**
 * Regression: the instructor request form said «لا تتوفّر قاعةٌ في هذا الوقت» for
 * a time when rooms were free.
 *
 * Case: a department with ONE class in the term. The form's "known rooms" were
 * the rooms of the section's existing rows — so exactly one room, the one the
 * instructor's own lecture sat in. Adding a second section at that same hour
 * found that single room busy and reported "no room", though the registry holds
 * several free ones and the schedule screen (suggest-slots) would offer them.
 *
 * Both screens now take halls from eligibleHallsForSection, and the verdict
 * names the real blocker: the instructor's own lecture, not the rooms.
 */
import { judgeRequest, type RequestedRow, type VerdictContext } from "../src/utils/instructorRequestVerdict";
import { eligibleHallsForSection, roomKeyOf, type LocationRegistry } from "../src/utils/locationRegistry";
import type { AdCourse, AdInstructor, FSchedule } from "../src/types";

let passed = 0, failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name}`); } };

const TEACHER = 7, SECTION = 5;
const row = (over: Partial<FSchedule> = {}): FSchedule => ({
  id: 1, AdCollegeId: 1, AdSectionId: SECTION, AdTermId: 20,
  AdCourseId: 100, AdCourseName: "مقرر قائم", SCode: "01", AdInstructorId: TEACHER,
  fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
  fstarttime: "12:00", fendtime: "12:50", AdRoomCode: "B1", AdRoomHall: "101", roomId: "r1", locationStatus: "VERIFIED",
  ...over,
} as FSchedule);
const course = (id: number): AdCourse => ({ AdCourseId: id, AdCollegeId: 1, AdSectionId: SECTION, CourseCode: `C${id}`, CourseName: `مقرر ${id}`, CourseCredit: 1, CourseHours: 1, MaxStudent: 25 } as AdCourse);
const person = (id: number): AdInstructor => ({ AdInstructorId: id, AdInstructorName: `د. ${id}`, AdInstructorCivil: String(id).padStart(12, "0"), AdInstructorMobile: "5" } as AdInstructor);

const building = { id: "b1", officialCode: "B1", active: true, confidence: "CONFIRMED" } as any;
const room = (id: string, code: string) => ({ id, buildingId: "b1", buildingCode: "B1", canonicalCode: code, active: true, confidence: "CONFIRMED", sectionIds: [SECTION] }) as any;
const registry: LocationRegistry = { buildings: [building], rooms: [room("r1", "101"), room("r2", "102"), room("r3", "103")] };

const halls = eligibleHallsForSection(registry, SECTION);
check(halls.length === 3, "السجلّ يعطي قاعات القسم الثلاث لا قاعةَ الصف الوحيد");
check(eligibleHallsForSection(registry, 99).length === 0, "قسمٌ بلا قاعات مسجّلة لا يرث قاعات غيره");

const existing = row();
const registryKeys = halls.map(h => roomKeyOf(h.roomId, h.room, h.hall));
const aliases: Record<string, string> = {};
halls.forEach(h => { aliases[roomKeyOf(h.roomId, h.room, h.hall)] = roomKeyOf("", h.room, h.hall); });

const ctx = (over: Partial<VerdictContext> = {}): VerdictContext => ({
  instructorId: TEACHER,
  allRows: [existing],
  instructorRowsAfter: [existing],
  courses: new Map([[100, course(100), ], [200, course(200)]] as any),
  instructors: new Map([[TEACHER, person(TEACHER)]]),
  knownRoomKeys: registryKeys,
  roomAliases: aliases,
  startLadder: ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00"],
  ...over,
});
const addAt = (start: string): RequestedRow => ({ rowId: null as any, tempId: -1, action: "add", AdCourseId: 200, days: ["fsunday"], start });
const withAdd = (start: string) => {
  const added = row({ id: -1, AdCourseId: 200, fstarttime: start, fendtime: start === "12:00" ? "12:50" : "13:50", roomId: undefined, AdRoomCode: "", AdRoomHall: "" } as any);
  return [existing, added];
};

// 1) Same hour as the instructor's own lecture, rooms free: the blocker is the instructor, not the rooms.
const clash = judgeRequest(addAt("12:00"), ctx({ instructorRowsAfter: withAdd("12:00") }));
check(!clash.sendable, "وقتٌ يصطدم بمحاضرة الأستاذ نفسه لا يُرسل");
check(clash.reasons.some(r => r.source === "instructor" && /لديك محاضرة/.test(r.text)), "الرسالة: لديك محاضرةٌ أخرى في هذا الوقت");
check(!clash.reasons.some(r => r.source === "room"), "ولا يُقال «لا قاعة» والقاعات الخالية موجودة");
check(clash.roomAvailable === true && clash.roomCandidates.length >= 2, "القاعات الخالية ظاهرة (قاعتان على الأقل)");

// 2) The old inputs (rooms of existing rows only) reproduce the bug: proves the test bites.
const legacy = judgeRequest(addAt("12:00"), ctx({ instructorRowsAfter: withAdd("12:00"), knownRoomKeys: [roomKeyOf("r1", "B1", "101")], roomAliases: undefined }));
check(legacy.reasons.some(r => r.source === "room"), "المدخلات القديمة (قاعة الصف وحدها) كانت تنتج «لا قاعة»");

// 3) A free hour: sendable, no instructor/room complaint.
const free = judgeRequest(addAt("13:00"), ctx({ instructorRowsAfter: withAdd("13:00") }));
check(free.sendable && free.kind === "clear", "ساعةٌ خالية تمرّ بلا مانع");

// 4) Another instructor's lecture occupies r1 at that hour: still free rooms r2/r3 → sendable.
const colleague = row({ id: 2, AdInstructorId: 8, AdCourseId: 300 });
const others = judgeRequest(addAt("12:00"), ctx({ allRows: [colleague], instructorRowsAfter: withAdd("12:00").slice(1) }));
check(others.sendable && others.roomAvailable === true, "قاعةٌ مشغولة بزميلٍ والباقي خالٍ: متاح");

// 5) Every registered hall truly taken (one by a text-only import row) → genuine «no room», distinct from instructor clash.
const taken = [
  row({ id: 11, AdInstructorId: 21, roomId: "r1" }),
  row({ id: 12, AdInstructorId: 22, roomId: "r2" }),
  row({ id: 13, AdInstructorId: 23, roomId: undefined, AdRoomCode: "B1", AdRoomHall: "103", locationStatus: undefined } as any),
];
const full = judgeRequest(addAt("12:00"), ctx({ allRows: taken, instructorRowsAfter: withAdd("12:00").slice(1) }));
check(full.reasons.some(r => r.source === "room") && !full.reasons.some(r => r.source === "instructor"), "كل القاعات مشغولة فعلاً (ومنها واحدةٌ مستوردة بالنص): «لا قاعة» وحدها");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
