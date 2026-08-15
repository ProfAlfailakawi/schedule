import fs from "fs";
import { setReferenceCacheEnabled } from "../src/db/referenceCache";
import path from "path";
import os from "os";
import { gunzipSync } from "zlib";
import { validateCivilId, generateSyntheticCivilId } from "../src/utils/civilId";
import { clusterSqueezed, courseHue, COURSE_HUES, dayLoad, firstLast, patternForDay, peakConcurrency, pickLive } from "../src/utils/weekVisual";
import { findConflicts } from "../src/utils/scheduleIntelligence";
import { findRepairChain, planDisruption } from "../src/utils/repairChain";
import { readCampusFlow } from "../src/utils/campusFlow";
import { describeRollover, readTermRollover } from "../src/utils/termRollover";
import { buildCalendar, escapeText, foldLine } from "../src/utils/icalendar";
import { createPresenceClient, createPresencePainter, type PresencePeer } from "../src/components/schedulePresence";
import { readSettledDrift, settledTerm } from "../src/utils/settledDrift";
import { reachAboutCard, unreachable, whatsappNumber } from "../src/utils/reachInstructor";
import { learnRhythm, offRhythm, describeRhythm } from "../src/utils/departmentRhythm";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START, withinScheduleDay } from "../src/utils/scheduleTime";
import { Repository, initDatabase, ScheduleRevisionConflict } from "../src/db/repository";

const originalLog = console.log;
const originalError = console.error;
console.log = () => {};
console.error = () => {};

let passed = 0;
let failed = 0;
function assert(condition: boolean, testName: string) {
  if (condition) { passed++; originalLog(`\x1b[32m✓ PASS: ${testName}\x1b[0m`); }
  else { failed++; originalLog(`\x1b[31m✗ FAIL: ${testName}\x1b[0m`); }
}

const fixtureDir = path.join(process.cwd(), "database");
const fixtureDbPath = path.join(fixtureDir, "db.json");
const gzipPath = path.join(fixtureDir, "db.json.gz");

let originalDb: Buffer | null = null;
if (fs.existsSync(fixtureDbPath)) {
  originalDb = fs.readFileSync(fixtureDbPath);
} else if (fs.existsSync(gzipPath)) {
  originalDb = gunzipSync(fs.readFileSync(gzipPath));
}

const testPrivateDir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-tests-"));
const dbPath = path.join(testPrivateDir, "db.json");
if (originalDb) {
  fs.writeFileSync(dbPath, originalDb, { mode: 0o600 });
} else {
  // Provide an empty but WELL-SHAPED database, so cases that do not need the
  // legacy snapshot can still exercise the write path. `{}` was enough to keep
  // the process alive and not enough to write a single row into.
  fs.writeFileSync(dbPath, JSON.stringify({
    schedules: [], colleges: [], sections: [], terms: [], courses: [], instructors: [],
    systemUsers: [], formSecurity: [], adCollegeUserAssigns: [], formNames: [], sessions: [],
  }), { mode: 0o600 });
}
function cleanupTestState() { fs.rmSync(testPrivateDir, { recursive: true, force: true }); }

async function runTests() {
  originalLog("\n=================================");
  originalLog(" SCHEDULE LEGACY-PARITY TESTS ");
  originalLog("=================================\n");
  process.env.NODE_ENV = "test";
  process.env.DATA_MODE = "demo"; // demo = exact local legacy snapshot in this build
  // Every case must observe exactly the rows it just wrote, with no reference
  // cache standing between the write and the next read.
  setReferenceCacheEnabled(false);
  // Tests intentionally operate on the bundled fixture, never the persistent production state.
  process.env.SCHEDULE_PRIVATE_DIR = testPrivateDir;
  
  originalLog("--- 1. Kuwaiti Civil ID legacy checksum ---");
  for (let n = 0; n < 1000; n++) {
    const valid = generateSyntheticCivilId();
    assert(validateCivilId(valid).isValid, `synthetic valid civil ID ${n + 1}`);
    const last = Number(valid[11]);
    const corrupted = valid.slice(0, 11) + ((last + 1) % 10);
    assert(!validateCivilId(corrupted).isValid, `single-digit corruption rejected ${n + 1}`);
  }
  assert(!validateCivilId("12345678901").isValid, "11-digit Civil ID rejected");
  assert(!validateCivilId("1234567890123").isValid, "13-digit Civil ID rejected");
  assert(!validateCivilId("١٢٣٤٥٦٧٨٩٠١٢").isValid, "Arabic-Indic digits rejected");
  assert(!validateCivilId("12345a789012").isValid, "letters rejected");

  originalLog("\n--- 1b. Week visual arithmetic (pure) ---");
  {
    // Colour: deterministic, in-palette, and spread for this department's
    // real numeric codes — the exact monochrome regression that shipped once.
    assert(courseHue("112", "ورشة إنتاج مواد تعليمية") === courseHue("112", "ورشة إنتاج مواد تعليمية"), "hue is deterministic");
    assert(COURSE_HUES.includes(courseHue("491", "الوسائط")), "hue stays inside the palette");
    const spread = new Set([
      courseHue("112", "ورشة إنتاج مواد تعليمية"),
      courseHue("112", "الحاسوب التعليمي"),
      courseHue("113", "مشروع التخرج"),
      courseHue("491", "تصميم وإنتاج الأفلام"),
      courseHue("491", "الوسائط المتعددة"),
    ]);
    assert(spread.size >= 3, "numeric codes 112/113/491 no longer collapse to one hue family");
    assert(courseHue("112", "الحاسوب التعليمي") !== courseHue("112", "ورشة إنتاج مواد تعليمية"), "same code, different course name → different hue");

    // Clustering: the chain-tail exemption and the five-member floor.
    const squeeze = (id: number, top: number, height: number, lanes: number, span: number) => ({ id, top, height, lanes, span });
    const peak = [1, 2, 3, 4, 5].map(n => squeeze(n, 100, 90, 5, 1));
    const tail = squeeze(9, 260, 90, 5, 5); // full-span solitary tail of the same chain
    const bundled = clusterSqueezed([...peak, tail]);
    assert(bundled.length === 1, "five squeezed cards form exactly one bundle");
    assert(bundled[0].ids.length === 5 && !bundled[0].ids.includes(9), "full-span chain tail stays out of the weave");
    assert(bundled[0].top === 100 && bundled[0].bottom === 190, "bundle bounds hug its members");
    assert(clusterSqueezed(peak.slice(0, 4)).length === 0, "four squeezed cards stay ordinary cards");
    const twoGroups = clusterSqueezed([
      ...[1, 2, 3, 4, 5].map(n => squeeze(n, 0, 60, 5, 1)),
      ...[6, 7, 8, 9, 10].map(n => squeeze(n, 300, 60, 5, 1)),
    ]);
    assert(twoGroups.length === 2, "separated crushes become separate bundles");
    assert(clusterSqueezed([...Array(12)].map((_, i) => squeeze(i + 1, 50, 80, 12, 1)))[0]?.ids.length === 12, "twelve concurrent lectures weave as one");

    // Day load: minutes, not counts.
    const lecture = (day: string, from: string, to: string) => ({ [day]: true, fstarttime: from, fendtime: to });
    const load = dayLoad([
      lecture("fsunday", "08:00", "09:00"),
      lecture("fmonday", "08:00", "12:00"),
      lecture("fmonday", "12:00", "14:00"),
    ]);
    assert(load.share.fmonday === 100, "heaviest day reads 100");
    assert(load.share.fsunday === 17, "one hour against six reads 17");
    assert(load.minutesByDay.ftuesday === 0 && load.share.ftuesday === 0, "an empty day reads zero");
    assert(dayLoad([lecture("fsunday", "10:00", "09:00")]).minutesByDay.fsunday === 0, "a lecture ending before it starts counts nothing");

    // Running/next: inclusive start, exclusive end, weekend silence.
    const rows = [
      { id: 1, fsunday: true, fstarttime: "08:00", fendtime: "09:30" },
      { id: 2, fsunday: true, fstarttime: "11:00", fendtime: "12:00" },
      { id: 3, fsunday: true, fstarttime: "10:00", fendtime: "10:30" },
    ] as any;
    assert(pickLive(rows, "fsunday", 8 * 60).running.has(1), "a lecture is running at its first minute");
    assert(!pickLive(rows, "fsunday", 9 * 60 + 30).running.has(1), "a lecture is over at its last minute");
    assert(pickLive(rows, "fsunday", 9 * 60 + 45).next === 3, "the nearest coming lecture is the next, not the first listed");
    assert(pickLive(rows, null, 9 * 60).running.size === 0 && pickLive(rows, null, 9 * 60).next === null, "a weekend has no running and no next");

    // Day rhythms: dropping across patterns means switching rhythm.
    assert(patternForDay("fmonday").join() === "fmonday,fwednesday", "Monday belongs to the Mon-Wed rhythm");
    assert(patternForDay("fwednesday").join() === "fmonday,fwednesday", "Wednesday belongs to the Mon-Wed rhythm");
    assert(patternForDay("fsunday").join() === "fsunday,ftuesday,fthursday", "Sunday belongs to the Sun-Tue-Thu rhythm");
    assert(patternForDay("fthursday").join() === "fsunday,ftuesday,fthursday", "Thursday belongs to the Sun-Tue-Thu rhythm");

    // Names cut to card width: honorific + first + last.
    assert(firstLast("د. عبدالرحمن ربل سليمان الشراد") === "د. عبدالرحمن الشراد", "long name keeps honorific, first and last");
    assert(firstLast("د. منى حسن") === "د. منى حسن", "short name passes untouched");
    assert(firstLast("عبدالعزيز خالد العنزي") === "عبدالعزيز العنزي", "no honorific: first and last");
    assert(firstLast("الدكتورة نورة سعد فهد العجمي") === "الدكتورة نورة العجمي", "full-word honorific recognised");
    assert(firstLast("د. عبد الرحمن أحمد السعيد") === "د. عبد الرحمن السعيد", "compound عبد الرحمن remains one given name");
    assert(firstLast("") === "", "empty name stays empty");

    // One university clock everywhere: the boundary is inclusive, but no
    // lecture may begin before 08:00, end after 20:00, or have zero duration.
    assert(withinScheduleDay(SCHEDULE_DAY_START, SCHEDULE_DAY_END), "08:00–20:00 is the full valid teaching day");
    assert(withinScheduleDay(8 * 60, 8 * 60 + 30), "a half-hour at opening is valid");
    assert(withinScheduleDay(19 * 60 + 30, 20 * 60), "a half-hour ending at 20:00 is valid");
    assert(!withinScheduleDay(7 * 60 + 30, 8 * 60 + 30), "07:30 start is rejected");
    assert(!withinScheduleDay(19 * 60 + 30, 20 * 60 + 30), "20:30 end is rejected");
    assert(!withinScheduleDay(10 * 60, 10 * 60), "zero-duration appointment is rejected");

    // A combined class is represented by one row per registered section. It
    // consumes one lecturer and one room once, so those sibling rows must not
    // manufacture a conflict merely because their section codes differ.
    const shared = {
      AdTermId: 1, AdCourseId: 10, AdInstructorId: 20,
      fsunday: true, fmonday: false, ftuesday: true, fwednesday: false, fthursday: false,
      fstarttime: "09:00", fendtime: "10:00", AdRoomCode: "7", AdRoomHall: "F12",
    };
    const combined = [{ ...shared, id: 101, SCode: "1" }, { ...shared, id: 102, SCode: "2" }] as any;
    assert(findConflicts(combined, combined).length === 0, "combined sections sharing one delivery are not conflicts");
    const occupied = { ...shared, id: 103, AdCourseId: 11, SCode: "1" } as any;
    assert(findConflicts([combined[0]], [combined[0], occupied]).length === 1, "a different course still conflicts in the occupied lecturer/room slot");

    // Peak concurrency: nine spread out is not nine at once.
    assert(peakConcurrency([{start:480,end:590},{start:600,end:710},{start:720,end:830}]) === 1, "sequential lectures peak at one");
    assert(peakConcurrency([{start:480,end:710},{start:480,end:710},{start:480,end:710}]) === 3, "three simultaneous peak at three");
    assert(peakConcurrency([{start:480,end:600},{start:600,end:720}]) === 1, "touching end and start do not overlap");
    assert(peakConcurrency([{start:480,end:840},{start:540,end:600},{start:660,end:720}]) === 2, "a long block under two short ones peaks at two");
    assert(peakConcurrency([]) === 0 && peakConcurrency([{start:600,end:600}]) === 0, "empty and zero-length spans peak at zero");
  }

  await initDatabase();
  /* --- 7. A save may not overwrite a change it never saw -------------------
     The versions log could always say what had happened afterwards; it could
     never stop it happening, and the coordinator whose work was overwritten was
     never told. These assertions are the stop. */
  originalLog("\n--- 7. Optimistic concurrency on schedule writes ---");
  {
    // Built from constants, not from the catalogue: this section is about the
    // write path and must hold in an empty installation too.
    const shape = {
      AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 1, AdCourseName: "مقرر اختبار",
      SCode: "900", AdInstructorId: 1,
      fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "12", AdRoomHall: "F6", fdetail: "",
    };
    const born = await Repository.createSchedule({ ...shape, SCode: "REV1" } as any);
    assert(Number(born.rev) === 1, "a new appointment starts at revision 1");

    const first = await Repository.updateSchedule(born.id, { fstarttime: "10:00" }, born.rev);
    assert(Number(first.rev) === 2 && first.fstarttime === "10:00", "a save on the current revision writes and bumps it");

    let refused = false, carried: any = null;
    try { await Repository.updateSchedule(born.id, { fstarttime: "12:00" }, born.rev); }
    catch (error: any) { refused = error instanceof ScheduleRevisionConflict; carried = error?.current; }
    assert(refused, "a save based on a stale revision is refused");
    assert(carried?.fstarttime === "10:00", "the refusal carries the row as it now stands");
    assert((await Repository.getScheduleById(born.id))?.fstarttime === "10:00", "and nothing was overwritten");

    const rebased = await Repository.updateSchedule(born.id, { fstarttime: "12:00" }, first.rev);
    assert(rebased.fstarttime === "12:00", "re-basing on the current revision writes");

    const blind = await Repository.updateSchedule(born.id, { fendtime: "13:30" });
    assert(blind.fendtime === "13:30", "an internal caller with no revision still writes (undo and import paths)");

    const second = await Repository.createSchedule({ ...shape, SCode: "REV2", fstarttime: "14:00", fendtime: "15:00" } as any);
    let partyRefused = false;
    try {
      await Repository.moveSchedulesBatch([
        { id: born.id, fields: { fstarttime: "16:00" }, expectedRev: blind.rev },
        { id: second.id, fields: { fstarttime: "17:00" }, expectedRev: 9999 },
      ]);
    } catch (error: any) { partyRefused = error instanceof ScheduleRevisionConflict; }
    assert(partyRefused, "a party move with one stale member is refused");
    assert((await Repository.getScheduleById(born.id))?.fstarttime === "12:00", "and no member of the party was written");

    await Repository.deleteSchedule(born.id);
    await Repository.deleteSchedule(second.id);
  }


  /* --- 8. Repair chains: the domino, and the promise of the shortest one ---- */
  originalLog("\n--- 8. Least-impact repair chains ---");
  {
    let seed = 1;
    const card = (over: any): any => ({
      id: seed++, AdCollegeId: 1, AdSectionId: 1, AdTermId: 27, AdCourseId: 1, AdCourseName: "مقرر",
      SCode: String(100 + seed), AdInstructorId: 1,
      fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "12", AdRoomHall: "F6", fdetail: "",
      ...over,
    });

    const a = card({ fsunday: true, AdInstructorId: 1, AdCourseName: "أ" });
    const b = card({ fsunday: true, AdInstructorId: 2, AdCourseName: "ب" });
    const simple = findRepairChain(b, [a, b]);
    assert(!!simple, "a chain is found for a plain two-card clash");
    assert(simple!.moves.length === 1, "and it is ONE move — the shortest chain wins, not the first found");
    assert(simple!.after === 0 && simple!.after < simple!.before, "the clash is gone and the board is strictly better");

    // A day with no free hour left: the fix has to displace something.
    const crowded: any[] = [];
    for (let hour = 8; hour < 13; hour++)
      crowded.push(card({ fsunday: true, AdInstructorId: 1, AdCourseName: `س${hour}`,
        fstarttime: `${String(hour).padStart(2, "0")}:00`, fendtime: `${String(hour + 1).padStart(2, "0")}:00` }));
    const intruder = card({ fsunday: true, AdInstructorId: 9, AdCourseName: "الدخيل", fstarttime: "09:00", fendtime: "10:00" });
    crowded.push(intruder);
    const domino = findRepairChain(intruder, crowded, { maxDepth: 4 });
    assert(!!domino, "a chain is found on a crowded day");
    assert(domino!.after < domino!.before, "the crowded case ends with fewer conflicts than it began");
    assert(new Set(domino!.moves.map(m => m.id)).size === domino!.moves.length, "no card is moved twice in one chain");

    // A board with nowhere to go must refuse rather than invent.
    const full: any[] = [];
    for (let hour = 8; hour < 20; hour++)
      for (const hall of ["F6", "F7"])
        full.push(card({ fsunday: true, fmonday: true, ftuesday: true, fwednesday: true, fthursday: true,
          AdInstructorId: 1, AdRoomHall: hall, AdCourseName: `ملء${hour}${hall}`,
          fstarttime: `${String(hour).padStart(2, "0")}:00`, fendtime: `${String(hour + 1).padStart(2, "0")}:00` }));
    const stuck = findRepairChain(full[0], full, { maxDepth: 2, maxBranch: 3 });
    assert(stuck === null || stuck.after <= stuck.before, "an impossible board yields no chain, never a worse one");

    // A hall closes tomorrow: every lecture in it must find somewhere else.
    const hallRows = [
      card({ fsunday: true, AdInstructorId: 1, AdRoomHall: "F6", AdCourseName: "أ" }),
      card({ fsunday: true, AdInstructorId: 2, AdRoomHall: "F6", AdCourseName: "ب", fstarttime: "10:00", fendtime: "11:00" }),
      card({ fmonday: true, AdInstructorId: 3, AdRoomHall: "F7", AdCourseName: "ج" }),
    ];
    const closed = hallRows.filter(row => row.AdRoomHall === "F6");
    const rescue = planDisruption(closed, hallRows, { maxDepth: 3 });
    assert(!!rescue, "a rescue plan exists when a hall closes");
    assert(rescue!.moves.length === closed.length, "every lecture in the closed hall is moved");
    assert(rescue!.moves.every(move => move.roomHall !== "F6"), "and none of them stays in the hall that closed");
    assert(rescue!.after <= rescue!.before, "the rescue leaves no new conflict behind");
  }

  /* --- 9. Campus flow: the corridor the timetable creates ------------------ */
  originalLog("\n--- 9. Campus movement between periods ---");
  {
    let seed = 1;
    const card = (over: any): any => ({
      id: seed++, AdCollegeId: 1, AdSectionId: 1, AdTermId: 27, AdCourseId: 1, AdCourseName: "مقرر",
      SCode: "101", AdInstructorId: 1,
      fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "12", AdRoomHall: "F6", fdetail: "",
      ...over,
    });
    const who = new Map<number, any>([
      [1, { AdInstructorId: 1, AdInstructorName: "د. سلطان" }],
      [2, { AdInstructorId: 2, AdInstructorName: "د. منى" }],
    ]);

    const crowd = [
      card({ fsunday: true, AdRoomCode: "12", AdInstructorId: 1 }),
      card({ fsunday: true, AdRoomCode: "12", AdInstructorId: 2 }),
      card({ fsunday: true, fstarttime: "09:00", fendtime: "10:00", AdRoomCode: "14", AdInstructorId: 2 }),
      card({ fsunday: true, fstarttime: "09:00", fendtime: "10:00", AdRoomCode: "14", AdInstructorId: 2 }),
    ];
    const flow = readCampusFlow(crowd, who, { day: "fsunday" });
    assert(flow.buildings.join(",") === "12,14", "the buildings in use are read from the rows themselves");
    assert(flow.peak?.label === "09:00", "the busiest crossing is the 09:00 break");
    assert(flow.peak?.crossing === 4, "and it counts every lecture that changes building across it");
    assert(flow.peak?.busiestPath === "من 12 إلى 14", "the heaviest corridor is named, in words rather than an arrow");

    const tight = [
      card({ fsunday: true, AdInstructorId: 1, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "12", AdCourseName: "أ" }),
      card({ fsunday: true, AdInstructorId: 1, fstarttime: "09:02", fendtime: "10:00", AdRoomCode: "14", AdCourseName: "ب" }),
    ];
    const walk = readCampusFlow(tight, who, { day: "fsunday" });
    assert(walk.impossible.length === 1, "a walk nobody could make is found");
    assert(walk.impossible[0].gap === 2 && walk.impossible[0].needs === 5, "with the minutes available and the minutes needed");
    assert(walk.impossible[0].instructor === "د. سلطان", "and the teacher who would have to make it is named");

    const same = [
      card({ fsunday: true, AdInstructorId: 1, fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "12" }),
      card({ fsunday: true, AdInstructorId: 1, fstarttime: "09:03", fendtime: "10:00", AdRoomCode: "12" }),
    ];
    assert(readCampusFlow(same, who, { day: "fsunday" }).impossible.length === 0, "a three-minute move inside one building is not flagged");

    const nothing = readCampusFlow([], who, { day: "week" });
    assert(nothing.bands.length === 0 && nothing.peak === null, "an empty scope reads as empty, not as a crash");
  }

  /* --- 10. What carries over, and what carries a decision ------------------ */
  originalLog("\n--- 10. Term rollover reading ---");
  {
    let seed = 1;
    const card = (over: any): any => ({
      id: seed++, AdCollegeId: 1, AdSectionId: 1, AdTermId: 26, AdCourseId: 1, AdCourseName: "مقرر",
      SCode: "101", AdInstructorId: 1,
      fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: "08:00", fendtime: "09:00", AdRoomCode: "12", AdRoomHall: "F6", fdetail: "",
      ...over,
    });
    const catalogue: any[] = [
      { AdCourseId: 1, AdCollegeId: 1, AdSectionId: 1, CourseCode: "112", CourseName: "مقرر", CourseCredit: 3, CourseHours: 3 },
      { AdCourseId: 2, AdCollegeId: 1, AdSectionId: 1, CourseCode: "205", CourseName: "الاسم الجديد", CourseCredit: 3, CourseHours: 3 },
      { AdCourseId: 9, AdCollegeId: 1, AdSectionId: 1, CourseCode: "999", CourseName: "مقرر لم يُدرَّس بعد", CourseCredit: 3, CourseHours: 3 },
    ];
    const people: any[] = [
      { AdInstructorId: 1, AdInstructorName: "د. سلطان", AdInstructorCivil: "1", AdInstructorMobile: "" },
      { AdInstructorId: 2, AdInstructorName: "د. منى", AdInstructorCivil: "2", AdInstructorMobile: "", AdInstructorStatus: "sabbatical" },
    ];
    const source = [
      card({ AdCourseId: 1, AdInstructorId: 1, AdRoomCode: "12", AdRoomHall: "F6" }),           // clean
      card({ AdCourseId: 1, AdInstructorId: 1, AdRoomCode: "12", AdRoomHall: "F7" }),           // clean
      card({ AdCourseId: 2, AdCourseName: "الاسم القديم", AdInstructorId: 1 }),                  // course renamed
      card({ AdCourseId: 7, AdCourseName: "مقرر محذوف", AdInstructorId: 1 }),                   // course gone
      card({ AdCourseId: 1, AdInstructorId: 2 }),                                               // instructor away
      card({ AdCourseId: 1, AdInstructorId: 1, AdRoomCode: "33", AdRoomHall: "Z9" }),           // hall retired
    ];
    const live = ["12/F6", "12/F7", "14/201"];
    const reading = readTermRollover(source, catalogue, people, live);

    assert(reading.sourceRows === 6, "the reading states the size of what it read");
    assert(reading.confident === 2, `only the untroubled rows are called confident (got ${reading.confident})`);
    assert(reading.concerns.length === 4, "every row carrying a decision is listed");
    assert(reading.newCourses.length === 1 && reading.newCourses[0].AdCourseId === 9, "a course never taught last term is new work");
    assert(reading.unavailableInstructors.length === 1, "an instructor on sabbatical is named once, not per row");
    assert(reading.changedCourses.length === 1, "a renamed course is flagged as changed, not as missing");
    assert(reading.retiredRooms.join(",") === "33/Z9", "a hall that appears nowhere else is retired");
    assert(reading.concerns.some(c => c.flags.includes("course-gone")), "a deleted course is a concern of its own kind");
    assert(describeRollover(reading).includes("يمكن نقلها بثقة"), "the sentence is built from the numbers");
    assert(describeRollover(readTermRollover([], catalogue, people, live)).includes("لا جدول"), "an empty previous term says so plainly");
  }

  /* --- 11. The calendar an instructor subscribes to ------------------------ */
  originalLog("\n--- 11. Calendar feed (RFC 5545) ---");
  {
    /* A Wednesday, so "the coming Sunday" is a real jump forward and not today. */
    const now = new Date(Date.UTC(2026, 7, 19, 6, 30, 0));
    const out = buildCalendar({
      name: "التربية الإسلامية بنات", weeks: 16, now,
      lectures: [
        { id: 501, title: "ISL 210 · أصول الفقه الإسلامي وقواعده الكلية",
          code: "ISL 210", section: "12", instructor: "د. نورة العجمي",
          room: "12 / F6", start: "08:00", end: "09:15", days: [0, 2], revision: 4 },
        { id: 502, title: "ISL 305", start: "13:00", end: "14:30", days: [4] },
      ],
    });
    const lines = out.split("\r\n");
    /* VTIMEZONE carries a DTSTART of its own; the events are what is measured. */
    const body = out.slice(out.indexOf("END:VTIMEZONE")).split("\r\n");
    const ev = (prefix: string) => body.filter(line => line.startsWith(prefix));

    // The defect this replaced: times were built in server-local hours and then
    // written as a UTC instant, so on a UTC host every lecture in Kuwait landed
    // three hours late. A wall-clock time paired with a TZID cannot drift.
    assert(ev("DTSTART").every(line => line.includes("TZID=Asia/Kuwait") && !line.endsWith("Z")),
      "start times are campus wall-clock, never a bare UTC instant");
    assert(ev("DTSTART")[0].endsWith(":20260823T080000"), "08:00 stays 08:00, on the coming Sunday");
    assert(ev("DTSTART")[1].endsWith(":20260820T130000"), "a Thursday lecture resolves to tomorrow");
    assert(out.includes("BEGIN:VTIMEZONE") && out.includes("TZOFFSETTO:+0300"), "the file carries the zone it names");

    assert(lines.filter(line => line === "BEGIN:VEVENT").length === 2, "a two-day lecture is one entry, not two");
    assert(ev("RRULE")[0].includes("BYDAY=SU,TU") && ev("RRULE")[0].includes("COUNT=32"),
      "both days sit in one weekly rule, 16 weeks deep");
    assert(ev("RRULE")[1].includes("COUNT=16;BYDAY=TH"), "a single-day lecture repeats sixteen times");

    assert(ev("UID:")[0] === "UID:schedule-501@schedule.app", "an appointment keeps one identity across edits");
    assert(ev("SEQUENCE:")[0] === "SEQUENCE:4", "the row's revision becomes the calendar's version");
    assert(ev("SEQUENCE:")[1] === "SEQUENCE:0", "an unversioned row is version zero");
    assert(out.includes("REFRESH-INTERVAL"), "subscribers are told how often to re-read");

    // Arabic is two bytes a letter, so a 75-OCTET limit is reached at roughly
    // half the characters a naive character count would allow.
    assert(lines.every(line => new TextEncoder().encode(line).length <= 75), "no line exceeds 75 octets");
    const decoder = new TextDecoder("utf-8", { fatal: true }), encoder = new TextEncoder();
    let intact = true;
    for (let length = 1; length <= 200 && intact; length++)
      for (const part of foldLine("SUMMARY:" + "مرحبا ".repeat(length).trim()).split("\r\n"))
        try { decoder.decode(encoder.encode(part)); } catch { intact = false; }
    assert(intact, "folding never cuts an Arabic letter in half");
    assert(foldLine("SUMMARY:" + "أصول الفقه الإسلامي وقواعده الكلية في كلية التربية")
      .split("\r\n").map((part, index) => (index ? part.slice(1) : part)).join("") ===
      "SUMMARY:أصول الفقه الإسلامي وقواعده الكلية في كلية التربية", "unfolding restores the text exactly");
    assert(escapeText("12, F6") === "12\\, F6", "a comma in a room name is escaped, not read as a list");
    assert(!/\d{12}/.test(out), "no civil ID can reach the feed — it is never given one");
  }

  /* --- 11b. A term that knows its own dates -------------------------------- */
  originalLog("\n--- 11b. The calendar stops inventing a semester ---");
  {
    const lecture = { id: 1, title: "x", start: "08:00", end: "09:00", days: [0] };
    const startOf = (out: string) =>
      out.slice(out.indexOf("END:VTIMEZONE")).split("\r\n").find(l => l.startsWith("DTSTART;"))!.split(":")[1];
    const ruleOf = (out: string) =>
      out.slice(out.indexOf("END:VTIMEZONE")).split("\r\n").find(l => l.startsWith("RRULE"))!;

    // THE DEFECT: with no term start, the series anchors on "the next matching
    // weekday from now" — and a subscription is re-fetched forever, so every
    // fetch pushes the whole term forward again and the lectures never end.
    const drifting = [ "2026-09-06", "2026-12-06", "2027-07-04" ].map(day =>
      startOf(buildCalendar({ name: "t", weeks: 16, now: new Date(`${day}T00:00:00Z`), lectures: [lecture] })));
    assert(new Set(drifting).size === 3, "without a term start the anchor really does move on every fetch");

    // THE FIX: a recorded start is a fact, and re-reading it changes nothing.
    const fixed = [ "2026-09-06", "2026-12-06", "2027-07-04" ].map(day =>
      startOf(buildCalendar({ name: "t", weeks: 16, startDate: "2026-09-13",
        now: new Date(`${day}T00:00:00Z`), lectures: [lecture] })));
    assert(new Set(fixed).size === 1, "with a term start every fetch produces the same series");
    assert(fixed[0] === "20260913T080000", "the series begins on the term's own first Sunday");

    const bounded = buildCalendar({ name: "t", weeks: 16, startDate: "2026-09-13",
      now: new Date("2026-09-01T00:00:00Z"), lectures: [lecture] });
    assert(ruleOf(bounded).includes("UNTIL=20270102T235959Z"), "and it ends on a real last day, not after a count");
    assert(!ruleOf(bounded).includes("COUNT="), "a dated term needs no occurrence count");
    assert(ruleOf(buildCalendar({ name: "t", weeks: 16, lectures: [lecture] })).includes("COUNT=16"),
      "an undated term still bounds itself, honestly, by count");
  }

  /* --- 12. Presence: who else is on this board ----------------------------- */
  originalLog("\n--- 12. Live presence ---");
  {
    const peer = (over: Partial<PresencePeer>): PresencePeer =>
      ({ connId: "x", userId: 2, name: "منى القلاف", cell: null, holding: null, editing: null, ...over });

    const client = createPresenceClient();
    client.setScope({ collegeId: 1, sectionId: 1, termId: 1 });

    // A frame for another board must never paint on this one. The scope key is
    // the only thing standing between a coordinator and a colleague's name from
    // a department they are not in.
    client.ingest({ scope: "1:2:1", peers: [peer({ connId: "other" })] });
    assert(client.peers().length === 0, "a frame for another board is ignored entirely");

    client.ingest({ scope: "1:1:1", peers: [peer({ connId: "muna" }), peer({ connId: client.connId, userId: 1 })] });
    assert(client.peers().length === 1, "my own mark is not shown back to me");
    assert(client.peers()[0].connId === "muna", "a colleague on this board is kept");

    client.ingest({ scope: "1:1:1", peers: [peer({ connId: "muna", holding: { rowId: 7, rev: 2 } })] });
    assert(client.claimant(7)?.name === "منى القلاف", "a held row names its holder");
    assert(client.claimant(8) === null, "a row nobody holds has no claimant");
    client.ingest({ scope: "1:1:1", peers: [peer({ connId: "muna", editing: { rowId: 9, rev: 1 } })] });
    assert(client.claimant(9)?.name === "منى القلاف", "an open editor counts as a claim too");

    // Walking to another department drops the old board's roster at once —
    // otherwise a colleague's ring lingers over a lecture that is not theirs.
    client.setScope({ collegeId: 1, sectionId: 2, termId: 1 });
    assert(client.peers().length === 0, "changing board clears the roster immediately");
    client.dispose();

    /* The painter, against a stub DOM. The defect being pinned here is real: the
       first version keyed a cell as `cell:${day}:${start}`, and a start time IS
       "08:00" — splitting that key on ":" turned one cell into two wrong fields
       and the mark landed nowhere. */
    const written: Array<[string, string, string | null]> = [];
    const node = (id: string) => ({
      setAttribute: (attr: string, value: string) => written.push([id, attr, value]),
      removeAttribute: (attr: string) => written.push([id, attr, null]),
    });
    const asked: string[] = [];
    const realDocument = (globalThis as any).document;
    const realRaf = (globalThis as any).requestAnimationFrame;
    (globalThis as any).document = {
      querySelectorAll: (selector: string) => { asked.push(selector); return [node(selector)]; },
    };
    (globalThis as any).requestAnimationFrame = (fn: () => void) => { fn(); return 1; };
    (globalThis as any).cancelAnimationFrame = () => undefined;

    const painter = createPresencePainter(() => 3);
    painter.paint([peer({ connId: "muna", cell: { day: "fsunday", start: "08:00" } })]);
    assert(asked.some(s => s.includes('[data-physics-day="fsunday"]') && s.includes('[data-physics-start="08:00"]')),
      "a colon inside the start time does not break the cell selector");

    asked.length = 0; written.length = 0;
    painter.paint([peer({ connId: "muna", cell: { day: "fmonday", start: "11:00", room: "12|F6" } })]);
    assert(asked.some(s => s.includes('[data-physics-room="12|F6"]')), "the rooms board keys on the hall as well");
    assert(written.some(w => w[1] === "data-presence-cell" && w[2] === null),
      "the mark left behind on the previous cell is erased");

    asked.length = 0; written.length = 0;
    painter.paint([peer({ connId: "muna", holding: { rowId: 42, rev: 1 } })]);
    assert(asked.some(s => s === '[data-row-id="42"]'), "a held row is found by its DOM identity");
    assert(written.some(w => w[1] === "data-presence-hold" && w[2] === "3"), "the holder's hue is written");

    asked.length = 0; written.length = 0;
    painter.paint([peer({ connId: "muna" })]);
    assert(written.every(w => w[2] === null) && written.length > 0, "letting go erases every mark");

    painter.clear();
    (globalThis as any).document = realDocument;
    (globalThis as any).requestAnimationFrame = realRaf;
  }

  /* --- 13. The doorway a hall needs ---------------------------------------- */
  originalLog("\n--- 13. Doorway turnaround ---");
  {
    const at = (id: number, from: string, to: string, room = "12", hall = "F6"): any => ({
      id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: id, AdInstructorId: 0, SCode: String(id),
      fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: from, fendtime: to, AdRoomCode: room, AdRoomHall: hall, fdetail: "",
    });
    const back2back = [at(1, "08:00", "09:00"), at(2, "09:00", "10:00")];

    // The rule is undeclared by default, and an undeclared rule must find nothing.
    assert(findConflicts(back2back, back2back).length === 0,
      "with no declared doorway, back-to-back lectures are not a finding");
    const tight = findConflicts(back2back, back2back, { doorwayMinutes: 10 });
    assert(tight.length === 1 && tight[0].type === "doorway", "a declared doorway catches the turnaround");
    assert(tight[0].severity === "low", "and it is never as loud as a double booking");
    assert(tight[0].detail.includes("0") && tight[0].detail.includes("10"),
      "the finding states the gap it found and the gap it needs");

    // Different halls empty through different doors.
    const elsewhere = [at(1, "08:00", "09:00"), at(2, "09:00", "10:00", "14", "201")];
    assert(findConflicts(elsewhere, elsewhere, { doorwayMinutes: 10 }).length === 0,
      "two halls need no doorway between them");
    // A real overlap must stay the louder finding and must not be counted twice.
    const overlapping = [at(1, "08:00", "09:30"), at(2, "09:00", "10:00")];
    const both = findConflicts(overlapping, overlapping, { doorwayMinutes: 10 });
    assert(both.length === 1 && both[0].type === "room" && both[0].severity === "high",
      "an overlap outranks a tight turnaround and is named once");
    const roomy = [at(1, "08:00", "09:00"), at(2, "09:15", "10:00")];
    assert(findConflicts(roomy, roomy, { doorwayMinutes: 10 }).length === 0,
      "a gap wider than the doorway is silent");
  }

  /* --- 14. What changed under the settled schedule ------------------------- */
  originalLog("\n--- 14. Settled-term drift ---");
  {
    const terms: any[] = [
      { AdTermId: 1, AdTermName: "خريف 2026" },
      { AdTermId: 2, AdTermName: "ربيع 2027" },
    ];
    // The department's own rule: creating the next term is what closes this one.
    assert(settledTerm([terms[0]]).term === null, "one term alone means nothing is settled yet");
    assert(settledTerm(terms).term?.AdTermId === 1, "the term before the newest is the settled one");

    const at = (id: number, college: number, from: string, to: string): any => ({
      id, AdTermId: 1, AdCollegeId: college, AdSectionId: 1, AdCourseId: id, AdInstructorId: 0, SCode: String(id),
      fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: from, fendtime: to, AdRoomCode: "12", AdRoomHall: "F6", fdetail: "",
      AdCourseName: `مقرر ${id}`,
    });
    const mine = [at(1, 1, "08:00", "09:30")];
    // Another college walked into the same hall, months after this was approved.
    const intruder = at(9, 7, "09:00", "10:00");

    const seen = readSettledDrift(terms, mine, [...mine, intruder], () => true);
    assert(seen.findings.length === 1, "a foreign booking in a settled term is found");
    assert(seen.findings[0].foreign, "and it is marked as coming from outside the department");
    assert(seen.findings[0].other?.id === 9, "an entitled reader is told which lecture it is");
    assert(seen.headline.includes("خريف 2026"), "the sentence names the term it is about");

    const masked = readSettledDrift(terms, mine, [...mine, intruder], () => false);
    assert(masked.findings.length === 1, "a reader outside that scope still learns the collision exists");
    assert(masked.findings[0].other === null, "...but is never told whose lecture it is");
    assert(masked.findings[0].detail.includes("خارج نطاق عرضك"), "and is told plainly why");

    assert(readSettledDrift(terms, mine, mine, () => true).findings.length === 0,
      "an untouched settled term reports nothing at all");
    assert(readSettledDrift([terms[1]], mine, mine, () => true).headline === "",
      "with nothing settled there is no sentence to say");
  }

  /* --- 15. Reaching an instructor ------------------------------------------ */
  originalLog("\n--- 15. Reaching an instructor ---");
  {
    assert(whatsappNumber("99001122") === "96599001122", "a local Kuwaiti mobile gains its country code");
    assert(whatsappNumber("96599001122") === "96599001122", "a number that already carries it is left alone");
    assert(whatsappNumber("+965 6600 1122") === "96566001122", "spaces and a plus sign are ignored");
    assert(whatsappNumber("22334455") === null, "a landline is refused rather than guessed at");
    assert(whatsappNumber("") === null && whatsappNumber("لا يوجد") === null, "an empty or textual field is refused");

    const person: any = { AdInstructorId: 1, AdInstructorName: "د. نورة العجمي", AdInstructorMobile: "99001122" };
    const message = reachAboutCard(person, "https://x.test/s/abc");
    assert(message.href?.startsWith("https://wa.me/96599001122?text="), "the conversation opens with the right number");
    assert(message.text.includes("https://x.test/s/abc"), "the card's own address is in the message");
    // A message is forwarded; a link is not. No times, rooms or colleagues in it.
    assert(!/\d{2}:\d{2}/.test(message.text), "no lecture times travel inside the message");

    const noNumber: any = { AdInstructorId: 2, AdInstructorName: "د. سلطان", AdInstructorMobile: "" };
    assert(reachAboutCard(noNumber, "https://x.test/s/abc").href === null, "no number means no dead link");
    assert(unreachable([person, noNumber]).length === 1, "the unreachable are named so the record can be fixed");
  }

  /* --- 16. The style a department keeps, learned from its own history ------ */
  originalLog("\n--- 16. Department rhythm ---");
  {
    let seed = 100;
    const at = (day: string, from: string, to: string, term = 1): any => ({
      id: seed++, AdTermId: term, AdCollegeId: 1, AdSectionId: 1, AdCourseId: seed, AdInstructorId: 0,
      SCode: String(seed), fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      [day]: true, fstarttime: from, fendtime: to, AdRoomCode: "12", AdRoomHall: "F6", fdetail: "",
    });

    /* A department with TWO rhythms, as a Kuwaiti week actually has. Sunday,
       Tuesday and Thursday run an hour with ten minutes between; Monday and
       Wednesday run an hour and a half with the same break. Ten terms of it,
       because a habit is what survives across years. */
    const history: any[] = [];
    for (let term = 1; term <= 10; term += 1) {
      for (const day of ["fsunday", "ftuesday", "fthursday"])
        history.push(at(day, "08:00", "09:00", term), at(day, "09:10", "10:10", term),
                     at(day, "10:20", "11:20", term));
      for (const day of ["fmonday", "fwednesday"])
        history.push(at(day, "08:00", "09:30", term), at(day, "09:40", "11:10", term));
    }
    const reading = learnRhythm(history);

    assert(reading.patterns.length === 2, "a week with two interleaved patterns is read as two");
    const odd = reading.forDay("fsunday" as any)!;
    const even = reading.forDay("fmonday" as any)!;
    assert(odd.days.includes("ftuesday" as any) && odd.days.includes("fthursday" as any),
      "Sunday shares its rhythm with Tuesday and Thursday");
    assert(even.days.includes("fwednesday" as any) && !even.days.includes("fsunday" as any),
      "Monday shares its rhythm with Wednesday alone");

    assert(odd.breakMinutes === 10 && even.breakMinutes === 10,
      "the ten-minute break is read back out of the rows, on both patterns");
    assert(odd.durationMinutes === 60, `Sun/Tue/Thu lectures are an hour (got ${odd.durationMinutes})`);
    assert(even.durationMinutes === 90, `Mon/Wed lectures are an hour and a half (got ${even.durationMinutes})`);
    // The whole reason for reading per pattern: one average would be 72
    // minutes, which is a length this department has never once used.
    assert(odd.durationMinutes !== even.durationMinutes, "and the two are never averaged into one");
    assert(odd.ladder.includes("08:00") && odd.ladder.includes("09:10"), "the habitual start ladder is learned");
    assert(reading.learnedFrom.terms === 10, "the reading states how much history it rests on");

    /* THE CASE THIS EXISTS FOR: someone types 08:55 on a Monday where every
       Monday for ten years has begun at 08:00 or 09:40. Invisible to every
       other check in the program — no clash, no rule, nothing. */
    const slip = offRhythm({ fmonday: true, fstarttime: "09:35", fendtime: "11:05" } as any, reading);
    assert(slip.includes("09:40") && slip.includes("09:35"),
      `a five-minute slip is named with the habit it missed (got "${slip}")`);
    assert(slip.includes("الاثنين"), "and the day it belongs to");

    // A deliberately different hour is a decision, not a slip, and is silent.
    assert(offRhythm({ fmonday: true, fstarttime: "14:00", fendtime: "15:30" } as any, reading) === "",
      "a different hour altogether is a decision, and is not remarked on");
    // An unusual LENGTH is remarked on, whatever the hour.
    const wrongLength = offRhythm({ fsunday: true, fstarttime: "08:00", fendtime: "10:30" } as any, reading);
    assert(wrongLength.includes("مدة"), `an off-pattern length is named (got "${wrongLength}")`);
    // Following the habit exactly says nothing at all.
    assert(offRhythm({ fsunday: true, fstarttime: "09:10", fendtime: "10:10" } as any, reading) === "",
      "a lecture that follows the habit is silent");

    // Refusing to guess: no habit, no claim.
    const noHabit = ["fsunday", "fmonday", "ftuesday", "fwednesday"].flatMap(day => [
      at(day, "08:00", "09:00"), at(day, "09:05", "10:00"), at(day, "10:20", "11:15")]);
    const vague = learnRhythm(noHabit);
    assert(vague.patterns.every(pattern => pattern.breakMinutes === 0),
      "a department with no single habit is told nothing about breaks");
    assert(learnRhythm([]).patterns.every(pattern => !pattern.breakMinutes && !pattern.durationMinutes),
      "an empty history states nothing");
    assert(describeRhythm(learnRhythm([])) === "", "and has no sentence to say");
    assert(describeRhythm(reading).includes("10 دقائق") && describeRhythm(reading).includes("60 دقيقة"),
      "the sentence carries both rhythms");
    // Arabic counts three ways; «10 فصلاً» reads as machine output.
    assert(describeRhythm(reading).includes("10 فصول"), "and counts the terms the way Arabic does");
    const oneTerm = learnRhythm(history.filter(row => row.AdTermId === 1));
    assert(describeRhythm(oneTerm).includes("فصل واحد") || describeRhythm(oneTerm) === "",
      "a single term is counted as one, not as «1 فصول»");

    /* The learned break, handed to the sweep. Exactly ten is fine; tighter is
       a remark and never a refusal. */
    const room = (id: number, from: string, to: string): any => ({
      id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: id, AdInstructorId: 0, SCode: String(id),
      fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: from, fendtime: to, AdRoomCode: "12", AdRoomHall: "F6", fdetail: "",
    });
    const exactly = [room(1, "08:00", "09:00"), room(2, "09:10", "10:10")];
    assert(findConflicts(exactly, exactly, { doorwayMinutes: 10 }).length === 0,
      "a break of exactly the learned length is not a finding");
    const tooTight = [room(1, "08:00", "09:00"), room(2, "09:05", "10:05")];
    const caught = findConflicts(tooTight, tooTight, { doorwayMinutes: 10 })[0];
    assert(caught?.type === "doorway" && caught.severity === "low",
      "five minutes where the department keeps ten is remarked on, softly");
  }

  if (!originalDb) {
    originalLog("\n[!] No legacy parity snapshot found in database/. Skipping DB parity tests in CI.");
    originalLog("\n=================================");
    originalLog(`Total Passed: ${passed}`);
    originalLog(`Total Failed: ${failed}`);
    originalLog("=================================");
    cleanupTestState();
    if (failed) process.exitCode = 1;
    return;
  }

  originalLog("\n--- 2. Real migrated authentication snapshot ---");
  const admin = await Repository.getUserByLogin("admin");
  assert(admin?.SystemUserId === 1, "legacy admin account exists with SystemUserId=1");
  assert(admin?.IsAdminUser === true && admin?.IsActive === true && admin?.IsLocked === false && !admin?.IsDeleted, "legacy admin status preserved");
  assert(!!admin && Repository.verifyPassword("a7424400", admin.SystemUserPass), "legacy admin password authenticates after scrypt migration");
  assert(!!admin && Repository.decryptPasswordFromVault(admin.SystemUserPassVault) === "a7424400", "legacy admin password view/edit value survives AES-GCM compatibility migration");
  assert(!!admin && !Repository.verifyPassword("password123", admin.SystemUserPass), "obsolete AI Studio demo password is rejected");
  const secureHash = Repository.hashPassword("new-password");
  assert(secureHash.startsWith("scrypt$") && Repository.verifyPassword("new-password", secureHash), "new passwords use scrypt");
  await Repository.createSession("test_session", 1, 60_000);
  assert((await Repository.getSession("test_session"))?.userId === 1, "session persists authenticated user");
  await Repository.deleteSession("test_session");
  assert((await Repository.getSession("test_session")) === undefined, "session deletion works");

  originalLog("\n--- 3. Exact legacy data counts ---");
  assert((await Repository.getUsers()).length === 29, "29 SystemUser rows");
  assert((await Repository.getFormNames()).length === 18, "18 FormName rows");
  assert((await Repository.getFormSecurity()).length === 219, "219 FormSecurity rows");
  assert((await Repository.getCollegeUserAssigns()).length === 189, "189 AdCollegeUserAssign rows");
  assert((await Repository.getTerms()).length === 31, "31 AdTerm rows");
  assert((await Repository.getColleges()).length === 13, "13 AdCollege rows");
  assert((await Repository.getSections()).length === 87, "87 AdSection rows");
  assert((await Repository.getInstructors()).length === 743, "743 AdInstructor rows");
  assert((await Repository.getCourses()).length === 1404, "1404 AdCourse rows");
  assert((await Repository.getSchedules()).length === 15430, "15430 FSchedule rows");
  const realSchedules = await Repository.getSchedules();
  const dayKeys = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;
  assert(realSchedules.every(row => row.fdetail === dayKeys.map((key, index) => row[key] ? String(index + 1) : "").filter(Boolean).join(",")), "all 15,430 legacy fdetail values match numeric weekday encoding 1..5");

  originalLog("\n--- 4. Legacy permission/scope row identity ---");
  const permissions = await Repository.getFormSecurity();
  assert(permissions.every(row => Number.isInteger(row.legacyId)), "every imported FormSecurity row preserves legacy Id");
  const scopes = await Repository.getCollegeUserAssigns();
  assert(scopes.every(row => Number.isInteger(row.legacyId)), "every imported AdCollegeUserAssign row preserves legacy Id");
  const duplicateScope = scopes.find((row, idx) => scopes.some((other, j) => j !== idx && other.SystemUserId === row.SystemUserId && other.AdCollegeId === row.AdCollegeId && other.AdSectionId === row.AdSectionId));
  assert(!!duplicateScope, "historical duplicate scope rows are preserved rather than silently de-duplicated");

  const permissionProbe = await Repository.createSecurity(1, 2);
  assert(Number.isInteger(permissionProbe.legacyId), "new permission receives a stable row Id");
  const permissionUpdated = await Repository.updateSecurity(permissionProbe.legacyId!, 1, 3);
  assert(permissionUpdated.FormNameId === 3, "permission edit targets the exact legacy row Id");
  await Repository.deleteSecurity(permissionProbe.legacyId!);
  assert(!(await Repository.getFormSecurity()).some(row => row.legacyId === permissionProbe.legacyId), "permission delete targets one row");

  const scopeProbe = await Repository.createUserAssign(1, (await Repository.getColleges())[0].AdCollegeId, (await Repository.getSections())[0].AdSectionId);
  assert(Number.isInteger(scopeProbe.legacyId), "new user scope receives a stable row Id");
  await Repository.deleteUserAssign(scopeProbe.legacyId!);
  assert(!(await Repository.getCollegeUserAssigns()).some(row => row.legacyId === scopeProbe.legacyId), "scope delete targets one row even when tuple duplicates exist");

  originalLog("\n--- 5. CRUD + decimal CourseHours parity ---");
  const newColl = await Repository.createCollege("ZZT", "كلية اختبار مؤقتة");
  const newSection = await Repository.createSection(newColl.AdCollegeId, "ZZT", "قسم اختبار مؤقت");
  const newCourse = await Repository.createCourse(newColl.AdCollegeId, newSection.AdSectionId, "990001", "مقرر اختبار", 3, 1.5, 30);
  assert(newCourse.CourseHours === 1.5, "CourseHours preserves SQL float decimal 1.5");
  const updatedCourse = await Repository.updateCourse(newCourse.AdCourseId, newColl.AdCollegeId, newSection.AdSectionId, "990002", "مقرر اختبار معدل", 3, 2.5, 35);
  assert(updatedCourse.CourseHours === 2.5, "editing CourseHours preserves decimal values");

  originalLog("\n--- 5b. Relational semantics over Firestore denormalization ---");
  const relationTerm = await Repository.createTerm("فصل اختبار العلاقات");
  const relationInstructor = await Repository.createInstructor(generateSyntheticCivilId(), "أستاذ اختبار العلاقات", "00000000");
  const relationSchedule = await Repository.createSchedule({
    AdCollegeId:newColl.AdCollegeId, AdSectionId:newSection.AdSectionId, AdTermId:relationTerm.AdTermId,
    AdCourseId:newCourse.AdCourseId, AdCourseName:newCourse.CourseName, SCode:"1", AdInstructorId:relationInstructor.AdInstructorId,
    fsunday:true, fmonday:false, ftuesday:false, fwednesday:false, fthursday:false,
    fstarttime:"08:00", fendtime:"09:00", AdRoomCode:"T", AdRoomHall:"1", fdetail:"1"
  });
  const secondCollege = await Repository.createCollege("ZZ2", "كلية اختبار العلاقات الثانية");
  await Repository.updateSection(newSection.AdSectionId, secondCollege.AdCollegeId, newSection.AdSectionCode, newSection.AdSectionName);
  const afterSectionMove = await Repository.getScheduleById(relationSchedule.id);
  assert(afterSectionMove?.AdCollegeId === secondCollege.AdCollegeId, "schedule college follows current Section relationship exactly like SQL navigation");
  const secondSection = await Repository.createSection(secondCollege.AdCollegeId, "ZZ2", "قسم اختبار العلاقات الثاني");
  await Repository.updateCourse(newCourse.AdCourseId, secondCollege.AdCollegeId, secondSection.AdSectionId, "990003", "مقرر منتقل", 3, 2.5, 35);
  const afterCourseMove = await Repository.getScheduleById(relationSchedule.id);
  assert(afterCourseMove?.AdSectionId === secondSection.AdSectionId && afterCourseMove?.AdCollegeId === secondCollege.AdCollegeId, "schedule section/college follow current Course->Section relationship");
  assert(afterCourseMove?.AdCourseName === "مقرر منتقل", "schedule course display name follows current Course name");

  originalLog("\n--- 6. Exact CopySchedule semantics ---");
  const schedules = await Repository.getSchedules();
  const source = schedules.find(row => schedules.filter(r => r.AdCollegeId === row.AdCollegeId && r.AdSectionId === row.AdSectionId && r.AdTermId === row.AdTermId).length > 0)!;
  assert(!!source, "a real legacy source schedule exists");
  const tempTarget = await Repository.createTerm("فصل اختبار النسخ المؤقت");
  const sourceCount = schedules.filter(r => r.AdCollegeId === source.AdCollegeId && r.AdSectionId === source.AdSectionId && r.AdTermId === source.AdTermId).length;
  const copiedCount = await Repository.copySchedule(source.AdCollegeId, source.AdSectionId, source.AdTermId, tempTarget.AdTermId);
  assert(copiedCount === sourceCount, "first copy transfers every source row to an empty target term");
  const secondCopy = await Repository.copySchedule(source.AdCollegeId, source.AdSectionId, source.AdTermId, tempTarget.AdTermId);
  assert(secondCopy === -1, "second copy is rejected when destination section+term already contains any rows");

  originalLog("\n=================================");
  originalLog(`Total Passed: ${passed}`);
  originalLog(`Total Failed: ${failed}`);
  originalLog("=================================");
  cleanupTestState();
  if (failed) process.exitCode = 1;
}

runTests().catch(err => {
  cleanupTestState();
  originalError("Fatal error during test run:", err);
  process.exitCode = 1;
});
