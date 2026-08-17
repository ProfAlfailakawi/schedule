import fs from "fs";
import { setReferenceCacheEnabled } from "../src/db/referenceCache";
import path from "path";
import os from "os";
import { gunzipSync } from "zlib";
import { validateCivilId, generateSyntheticCivilId } from "../src/utils/civilId";
import { buildWeekDensityPlan, clusterSqueezed, courseHue, COURSE_HUES, dayLoad, firstLast, patternForDay, peakConcurrency, pickLive, readableWeekDayWidth } from "../src/utils/weekVisual";
import { findConflicts } from "../src/utils/scheduleIntelligence";
import { findRepairChain, planDisruption } from "../src/utils/repairChain";
import { readCampusFlow } from "../src/utils/campusFlow";
import { describeRollover, readTermRollover } from "../src/utils/termRollover";
import { buildCalendar, escapeText, foldLine } from "../src/utils/icalendar";
import { createPresenceClient, createPresencePainter, type PresencePeer } from "../src/components/schedulePresence";
import { readSettledDrift, settledTerm } from "../src/utils/settledDrift";
import { readStudentDemand, cohortPairs, sharedBetween, PAIR_FLOOR } from "../src/utils/studentDemand";
import { reachAboutCard, unreachable, whatsappNumber } from "../src/utils/reachInstructor";
import { learnRhythm, offRhythm, describeRhythm } from "../src/utils/departmentRhythm";
import { AR, countOf, nounFor } from "../src/utils/arabicCount";
import { readDepartmentMemory } from "../src/utils/departmentMemory";
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

    // Adaptive week geometry: readable cards first, semantic density only when
    // the five-day overview would otherwise become an unbounded canvas.
    assert(readableWeekDayWidth(1) === 224, "one-lane day keeps the calm 224px column");
    assert(readableWeekDayWidth(4) === 480, "four simultaneous lectures receive four readable 112px lanes plus gaps");
    assert(readableWeekDayWidth(12) === 1440, "focus width scales to twelve real lanes instead of microtext");
    const quietPlan = buildWeekDensityPlan([
      { key: "fsunday", peak: 1 }, { key: "fmonday", peak: 2 }, { key: "ftuesday", peak: 4 },
      { key: "fwednesday", peak: 2 }, { key: "fthursday", peak: 1 },
    ] as any);
    assert(quietPlan.days.find(day => day.key === "ftuesday")?.mode === "cards", "one peak-four day stays as four real cards");
    const extremePlan = buildWeekDensityPlan([
      { key: "fsunday", peak: 12 }, { key: "fmonday", peak: 1 }, { key: "ftuesday", peak: 2 },
      { key: "fwednesday", peak: 1 }, { key: "fthursday", peak: 1 },
    ] as any);
    assert(extremePlan.days.find(day => day.key === "fsunday")?.mode === "summary", "twelve-way collision is semantic in overview");
    const allBusyPlan = buildWeekDensityPlan([
      { key: "fsunday", peak: 6 }, { key: "fmonday", peak: 6 }, { key: "ftuesday", peak: 6 },
      { key: "fwednesday", peak: 6 }, { key: "fthursday", peak: 6 },
    ] as any);
    assert(allBusyPlan.totalWidth <= 1880 && allBusyPlan.days.every(day => day.mode === "summary"), "five peak-six days stay inside the overview budget without shrinking cards");
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

  /* --- 17. العدد والمعدود -------------------------------------------------- */
  originalLog("\n--- 17. Arabic number agreement ---");
  {
    const n = AR.appointment;
    // The five rules, and the four wrong forms this replaced.
    assert(countOf(0, n) === "لا مواعيد", "zero is a negation, not a numeral");
    assert(countOf(1, n) === "موعد واحد", "one puts the noun first and the number after");
    assert(countOf(2, n) === "موعدان", "two is a dual and writes no numeral at all");
    assert(countOf(3, n) === "3 مواعيد" && countOf(10, n) === "10 مواعيد", "three to ten take a broken plural");
    assert(countOf(11, n) === "11 موعداً" && countOf(99, n) === "99 موعداً", "eleven to ninety-nine take the accusative singular");
    assert(countOf(100, n) === "100 موعد", "a hundred takes the singular");

    // Compounds follow their LAST part — the rule software always misses.
    assert(countOf(103, n) === "103 مواعيد", "103 follows its last part into the plural");
    assert(countOf(111, n) === "111 موعداً", "111 follows its last part into the accusative");
    assert(countOf(200, n) === "200 موعد", "200 stays singular");
    assert(countOf(1000, n) === "1,000 موعد", "a thousand stays singular and keeps its separator");

    // Feminine nouns inflect differently, and every noun is declared once.
    assert(countOf(2, AR.room) === "قاعتان" && countOf(3, AR.room) === "3 قاعات", "a feminine noun keeps its own dual and plural");
    assert(countOf(2, AR.term) === "فصلان" && countOf(10, AR.term) === "10 فصول" && countOf(11, AR.term) === "11 فصلاً",
      "terms count through all three forms");
    assert(countOf(1, AR.colleague) === "زميل واحد" && countOf(5, AR.colleague) === "5 زملاء", "and so do colleagues");
    assert(nounFor(2, AR.lecture) === "محاضرتان" && nounFor(7, AR.lecture) === "محاضرات",
      "the noun alone can be asked for, when the number is shown separately");
    assert(countOf(0, n, "لا شيء") === "لا شيء", "the zero wording can be replaced where a place needs its own");
    assert(countOf(-4, n) === "لا مواعيد" && countOf(NaN as any, n) === "لا مواعيد", "nonsense counts as none");

    // The forms are complete: nothing may fall through to an empty string.
    for (const [name, noun] of Object.entries(AR))
      for (const value of [0, 1, 2, 3, 10, 11, 99, 100, 103, 111])
        assert(/[؀-ۿ]/.test(countOf(value, noun as any)), `${name} has a form for ${value}`);
  }

  /* --- 18. ذاكرة القسم: المتوقَّع والمفاجئ --------------------------------- */
  originalLog("\n--- 18. Department memory ---");
  {
    let seed = 500;
    const at = (term: number, day: string, from: string, to: string, over: any = {}): any => ({
      id: seed++, AdTermId: term, AdCollegeId: 1, AdSectionId: 1,
      AdCourseId: over.AdCourseId ?? 1, AdInstructorId: over.AdInstructorId ?? 1, SCode: "1",
      fsunday: false, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      [day]: true, fstarttime: from, fendtime: to,
      AdRoomCode: over.AdRoomCode ?? "12", AdRoomHall: over.AdRoomHall ?? "F6",
      AdCourseName: over.AdCourseName ?? "أصول الفقه", fdetail: "",
    });

    const history: any[] = [];
    for (let term = 1; term <= 10; term += 1) {
      // A course that has never moved in ten years.
      history.push(at(term, "fsunday", "08:00", "09:00"));
      // An hour used for six terms, then silently abandoned.
      if (term <= 6) history.push(at(term, "ftuesday", "12:00", "13:00", { AdCourseId: 2, AdCourseName: "مقرر مهجور" }));
      // A hall used all along, but only ever in the morning.
      history.push(at(term, "fmonday", "09:00", "10:30", { AdRoomCode: "14", AdRoomHall: "201", AdCourseId: 3 }));
      // A teacher who has never once taught before ten.
      history.push(at(term, "fwednesday", "10:00", "11:00", { AdInstructorId: 7, AdCourseId: 4 }));
    }
    const people: any[] = [
      { AdInstructorId: 1, AdInstructorName: "د. نورة", AdInstructorCivil: "1", AdInstructorMobile: "" },
      { AdInstructorId: 7, AdInstructorName: "د. سلطان", AdInstructorCivil: "7", AdInstructorMobile: "" },
    ];
    const memory = readDepartmentMemory(history, [], people);
    assert(memory.terms === 10, "the memory states how much history it holds");

    // ── المتوقَّع: the empty hour ────────────────────────────────────────────
    const never = memory.atSlot("fthursday" as any, "08:00");
    assert(Boolean(never) && never!.text.includes("لم يدرّس"), `an hour never used is named (got "${never?.text}")`);
    assert(never!.text.includes("10 فصول"), "and the claim is quoted against its base");

    // ── المفاجئ: the abandoned hour ────────────────────────────────────────
    const abandoned = memory.atSlot("ftuesday" as any, "12:00");
    assert(abandoned?.surprising === true, `an hour used then dropped is marked surprising (got "${abandoned?.text}")`);
    assert(abandoned!.text.includes("توقّف"), "and says plainly that it stopped");

    // ── المفاجئ: the hall that is only ever used in one part of the day ────
    const room = memory.aboutRoom("14", "201");
    assert(room?.surprising === true, `a hall used only in a narrow band is surprising (got "${room?.text}")`);
    assert(room!.text.includes("09:00"), "and names the hours it is confined to");

    // ── المفاجئ: a preference nobody ever declared ─────────────────────────
    const person = memory.aboutInstructor(7);
    assert(person?.surprising === true, `a teacher who never starts early is surprising (got "${person?.text}")`);
    assert(person!.text.includes("د. سلطان") && person!.text.includes("10:00"), "and is named with the hour");

    // ── المتوقَّع: a course that has never moved ────────────────────────────
    const course = memory.aboutCourse(1);
    assert(Boolean(course) && !course!.surprising, "a course that never moved is stated plainly, not as a surprise");
    assert(course!.text.includes("الأحد") && course!.text.includes("08:00"), "and names where it has lived");

    // ── ما ترفض قوله ───────────────────────────────────────────────────────
    /* Instructor 1 in this fixture teaches 08:00–09:00 and 12:00–13:00 and
       nothing else, so «لم يدرّس بعد 13:00» is TRUE of them — the assertion
       that first stood here was wrong about the data, not about the code.
       The real question is whether someone who spans the whole day produces
       no invented pattern, so that is what is asked. */
    const spread = readDepartmentMemory([
      ...Array.from({ length: 10 }, (_, term) => at(term + 1, "fsunday", "08:00", "09:00", { AdInstructorId: 9 })),
      ...Array.from({ length: 10 }, (_, term) => at(term + 1, "fthursday", "16:00", "17:00", { AdInstructorId: 9 })),
      ...Array.from({ length: 10 }, (_, term) => at(term + 1, "fmonday", "11:00", "12:00", { AdInstructorId: 9 })),
      ...Array.from({ length: 10 }, (_, term) => at(term + 1, "ftuesday", "13:00", "14:00", { AdInstructorId: 9 })),
      ...Array.from({ length: 10 }, (_, term) => at(term + 1, "fwednesday", "09:00", "10:00", { AdInstructorId: 9 })),
    ], [], [{ AdInstructorId: 9, AdInstructorName: "د. فيصل", AdInstructorCivil: "9", AdInstructorMobile: "" } as any]);
    assert(spread.aboutInstructor(9) === null,
      "a teacher who uses the whole week and the whole day produces no invented pattern");
    const thin = readDepartmentMemory(history.filter(row => row.AdTermId <= 2), [], people);
    assert(thin.atSlot("fthursday" as any, "08:00") === null, "two terms is anecdote, and states nothing at all");
    assert(readDepartmentMemory([], [], []).surprises().length === 0, "an empty history surprises nobody");

    /* The bar, enforced: history earns a sentence by warning or surprising.
       Being merely correct about an ordinary hour is noise, and noise on a
       board is what teaches people to stop reading it. */
    assert(memory.atSlot("fsunday" as any, "08:00") === null,
      "an hour the department has always used says nothing — it is not news");
    assert(memory.aboutRoom("12", "F6")?.surprising !== false,
      "and a hall says something only when it is a warning or a surprise");

    const surprises = memory.surprises();
    assert(surprises.length >= 3, `the unexpected can be asked for as a set (got ${surprises.length})`);
    assert(surprises.every(item => item.surprising), "and contains only things nobody would have asked");
    assert(surprises[0].strength >= surprises[surprises.length - 1].strength, "strongest first");
  }

  /* --- 19. الأرقام داخل نصّ عربي ------------------------------------------- */
  originalLog("\n--- 19. Bidirectional numerals ---");
  {
    /* The defect these guard: a Latin number inside an Arabic sentence is an
       LTR run inside an RTL one, and the characters around it are NEUTRAL —
       they take the direction of whatever surrounds them. So «58 / 100» is
       rendered «100/», «+11» becomes «11+», and a label glues to its figure.
       No CSS on the parent fixes it; the run has to be isolated. */
    const isolated = (value: string) => /^[\u0660-\u0669\d\s+\-–/%٪.,:]+$/.test(value);
    assert(isolated("58 / 100"), "a fraction is a pure numeric run and must be isolated whole");
    assert(isolated("+11") && isolated("-4"), "a sign belongs to the run, not to the sentence");
    assert(!isolated("58 من 100"), "…and Arabic words are NOT part of it — they stay in the sentence");

    // The counting rule and the isolation rule must not fight: a counted
    // phrase carries Arabic, so it is never wrapped as a numeric run.
    assert(!isolated(countOf(3, AR.room)), "a counted phrase is prose, not a numeral");
    assert(countOf(3, AR.room) === "3 قاعات", "and it still counts correctly");
  }

  /* --- 20. هدف السحب على مسار أفقي ----------------------------------------- */
  originalLog("\n--- 20. Drag target axis ---");
  {
    /* The rooms board lays its slots ACROSS a track; the week stacks them DOWN
       a column. The recovery that finds a slot under an occupied card used to
       search by `y` only — correct for the week, and on the rooms board it
       matched the first slot wherever the pointer was, so every drop resolved
       to 08:00 and the card never appeared to move.
       This reproduces both layouts against the same resolver logic. */
    const rect = (left: number, top: number, w: number, h: number) =>
      ({ left, top, right: left + w, bottom: top + h, width: w, height: h } as DOMRect);

    /** The shipped rule, isolated: pick the slot the pointer is actually over. */
    const resolve = (slots: DOMRect[], x: number, y: number) => {
      const first = slots[0], last = slots[slots.length - 1];
      const horizontal = Math.abs(last.left - first.left) > Math.abs(last.top - first.top);
      const within = horizontal
        ? y >= Math.min(first.top, last.top) && y < Math.max(first.bottom, last.bottom)
        : y >= first.top && y < last.bottom;
      if (!within) return -1;
      const inside = (r: DOMRect) => horizontal ? x >= r.left && x < r.right : y >= r.top && y < r.bottom;
      const found = slots.findIndex(inside);
      if (found >= 0) return found;
      const gap = (r: DOMRect) => horizontal
        ? Math.abs((r.left + r.right) / 2 - x) : Math.abs((r.top + r.bottom) / 2 - y);
      return slots.reduce((best, r, i) => (gap(r) < gap(slots[best]) ? i : best), 0);
    };

    // A rooms track: eight slots across, all sharing one vertical band.
    const across = Array.from({ length: 8 }, (_, i) => rect(i * 50, 100, 50, 64));
    assert(resolve(across, 25, 130) === 0, "the first slot of a horizontal track resolves at its own left edge");
    assert(resolve(across, 275, 130) === 5, "…and the sixth resolves where the sixth actually is");
    assert(resolve(across, 375, 130) === 7, "…and the last at the far end");
    // The exact defect: a y-only search would answer 0 for every one of these.
    assert(new Set([25, 125, 225, 325].map(x => resolve(across, x, 130))).size === 4,
      "four different points across the track give four different slots");
    assert(resolve(across, 200, 400) === -1, "a pointer outside the track's band resolves to nothing");

    // A week column: eight slots down, all sharing one horizontal band.
    const down = Array.from({ length: 8 }, (_, i) => rect(200, i * 40, 120, 40));
    assert(resolve(down, 260, 20) === 0, "a vertical column still resolves by height");
    assert(resolve(down, 260, 220) === 5, "…at any depth");
    assert(new Set([20, 100, 180, 260].map(y => resolve(down, 260, y))).size === 4,
      "and four depths still give four different slots — the week is unchanged");
  }

  /* --- 21. نافذة الشبكة تتّسع لبياناتها ------------------------------------- */
  originalLog("\n--- 21. Grid window ---");
  {
    /* The defect: the week grid was fixed at 08:00–20:00. A lecture outside it
       was not filtered out — it was POSITIONED outside and clipped away, so it
       existed, it counted in every total, it blocked its hall, and it was
       invisible. Anyone searching for it would conclude it had been deleted. */
    const windowFor = (rows: Array<[number, number]>) => {
      let start = SCHEDULE_DAY_START, end = SCHEDULE_DAY_END;
      for (const [from, to] of rows) { if (from < start) start = from; if (to > end) end = to; }
      const down = (v: number) => Math.floor(v / 30) * 30;
      const up = (v: number) => Math.ceil(v / 30) * 30;
      return { start: Math.max(0, down(start)), end: Math.min(24 * 60, up(end)) };
    };
    const ordinary = windowFor([[8 * 60, 9 * 60], [13 * 60, 14 * 60]]);
    assert(ordinary.start === SCHEDULE_DAY_START && ordinary.end === SCHEDULE_DAY_END,
      "an ordinary week leaves the teaching day exactly as it was");
    const early = windowFor([[7 * 60, 8 * 60]]);
    assert(early.start === 7 * 60, "a lecture before eight pulls the grid open to reach it");
    const late = windowFor([[20 * 60, 21 * 60 + 20]]);
    assert(late.end === 21 * 60 + 30, "…and one after eight snaps outward to a whole slot");
    const both = windowFor([[7 * 60 + 15, 8 * 60], [20 * 60, 21 * 60]]);
    assert(both.start === 7 * 60 && both.end === 21 * 60,
      "both ends move independently, and a ragged start snaps down not up");
    assert(windowFor([]).start === SCHEDULE_DAY_START, "an empty week is still a teaching day");
    // The ladder must have a rung for every position a card can take.
    const rungs = (w: { start: number; end: number }) => Math.round((w.end - w.start) / 30);
    assert(rungs(ordinary) === 24, "twelve hours is twenty-four half-hour rungs");
    assert(rungs(both) === 28, "…and a widened window grows its ladder to match");
  }

  /* --- 22. الاستبيان: الطلب ورسم الاشتراك ---------------------------------- */
  originalLog("\n--- 22. Student demand ---");
  {
    const courses: any[] = [
      { AdCourseId: 1, AdCollegeId: 1, AdSectionId: 1, CourseCode: "ISL 210", CourseName: "أصول الفقه", CourseCredit: 3, CourseHours: 3 },
      { AdCourseId: 2, AdCollegeId: 1, AdSectionId: 1, CourseCode: "ARB 220", CourseName: "البلاغة", CourseCredit: 3, CourseHours: 3 },
      { AdCourseId: 3, AdCollegeId: 1, AdSectionId: 1, CourseCode: "EDU 305", CourseName: "طرق التدريس", CourseCredit: 3, CourseHours: 3 },
      { AdCourseId: 9, AdCollegeId: 1, AdSectionId: 1, CourseCode: "OLD 900", CourseName: "مقرر لم يطلبه أحد", CourseCredit: 3, CourseHours: 3 },
    ];
    const need = (n: number, ids: number[]): any =>
      ({ id: `n${n}`, fingerprint: `f${n}`, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
         courseIds: ids, createdAt: "2026-01-01T00:00:00Z" });
    // Four students who need both 1 and 2; one who needs only 3.
    const needs = [need(1,[1,2]), need(2,[1,2]), need(3,[1,2]), need(4,[1,2,3]), need(5,[3])];
    const reading = readStudentDemand(needs, courses);

    assert(reading.respondents === 5, "every number is quoted against who answered");
    assert(reading.courses[0].courseId === 1 && reading.courses[0].students === 4,
      "demand is counted per course, strongest first");
    assert(reading.courses[0].share === 80, "…and stated as a share of the respondents");

    /* THE PRIZE. Nothing in ten years of schedules can say which courses share
       students; this is the only thing that can, and it is what turns a survey
       into a constraint. */
    const pair = reading.pairs.find(p => (p.a === 1 && p.b === 2) || (p.a === 2 && p.b === 1));
    assert(Boolean(pair) && pair!.shared === 4, "the co-enrolment graph is built from the answers");
    assert(sharedBetween(reading, 1, 2) === 4 && sharedBetween(reading, 2, 1) === 4,
      "…and a pair is the same pair whichever way round it is asked");
    assert(cohortPairs(reading).has("1|2"), "the constraint is emitted in the engine's own shape");

    // Two people wanting the same two courses is not a cohort.
    assert(!reading.pairs.some(p => p.shared < PAIR_FLOOR), "a pair below the floor is noise and is dropped");
    assert(sharedBetween(reading, 1, 3) === 0, "…so a one-student overlap yields no constraint");

    assert(reading.unwanted.length === 1 && reading.unwanted[0].courseId === 9,
      "a course nobody asked for is named — worth knowing before opening it");
    assert(readStudentDemand([], courses).headline === "", "no answers means no claim at all");
    assert(reading.headline.includes("5 طلاب"), "the sentence counts students the way Arabic does");

    // A student who changes their mind replaces their answer; they are one person.
    const twice = readStudentDemand([need(1,[1]), { ...need(1,[1,2]), id: "n1b" }], courses);
    assert(twice.respondents === 2, "the reading counts the rows it is given…");
    assert(cohortPairs(readStudentDemand([need(1,[1,2])], courses)).size === 0,
      "…and one person alone never makes a pair");
  }

  /* --- 23. إحساس النقل: هدف يعرف قاعته ------------------------------------- */
  originalLog("\n--- 23. Drag target identity ---");
  {
    /* A square on the week grid is named by a day and an hour, and that pair is
       unique. On the rooms board the SAME pair exists once per hall — measured
       on the live board, «الأحد 08:00» belonged to ten squares in ten different
       rooms. Matching on day+hour alone lit all ten at once, so the week
       highlighted one square under the pointer and the rooms board lit a whole
       column across halls the card was nowhere near. That was the whole
       difference in how the two boards felt. */
    const isActive = (
      target: { day: string; start: string; room?: { code: string; hall: string } } | null,
      day: string, start: string, room?: string,
    ) => {
      const targetRoom = target?.room ? `${target.room.code}|${target.room.hall}` : "";
      return target?.day === day && target?.start === start && (room ? targetRoom === room : !targetRoom);
    };

    const onRooms = { day: "fsunday", start: "08:00", room: { code: "7", hall: "S27" } };
    const halls = ["7|S27", "8|F09", "8|F17", "8|G20", "8|G21", "8|G22", "12|506", "14|201", "B05|11", "G23|17"];
    const lit = halls.filter(hall => isActive(onRooms, "fsunday", "08:00", hall));
    assert(lit.length === 1 && lit[0] === "7|S27",
      `exactly the hall under the pointer lights, out of ten sharing the hour (lit ${lit.length})`);
    assert(!isActive(onRooms, "fsunday", "08:30", "7|S27"), "…and only at its own half hour");
    assert(!isActive(onRooms, "fmonday", "08:00", "7|S27"), "…on its own day");

    // The week grid has no hall, and must be completely unaffected.
    const onWeek = { day: "ftuesday", start: "09:30" };
    assert(isActive(onWeek, "ftuesday", "09:30"), "a week square still lights with no hall in play");
    assert(!isActive(onWeek, "ftuesday", "10:00"), "…and only its own");
    // A week target must never light a rooms square, or the two boards bleed.
    assert(!isActive(onWeek, "ftuesday", "09:30", "12|506"),
      "a target with no hall never lights a square that has one");
    assert(!isActive(onRooms, "fsunday", "08:00"),
      "…and a target with a hall never lights a square that has none");
    assert(!isActive(null, "fsunday", "08:00", "7|S27"), "nothing carried means nothing lit");
  }

  /* --- 24. تعارض الطالب: القيد الذي لم يكن مرئياً ---------------------------- */
  originalLog("\n--- 24. Student clash ---");
  {
    /* The third kind of double booking. This engine has caught the teacher and
       the hall since its first day and could never catch this one, because
       nothing in ten years of schedules says which courses share students.
       The survey is the only thing that can say it. */
    const at = (id: number, courseId: number, from: string, to: string, instructor = 0, room = "12"): any => ({
      id, AdTermId: 1, AdCollegeId: 1, AdSectionId: 1, AdCourseId: courseId,
      AdInstructorId: instructor, SCode: String(id),
      fsunday: true, fmonday: false, ftuesday: false, fwednesday: false, fthursday: false,
      fstarttime: from, fendtime: to, AdRoomCode: room, AdRoomHall: "F6", fdetail: "",
    });
    // Two lectures that overlap: different teachers, different halls. Nothing
    // in the timetable is wrong — and the students cannot attend both.
    const pair = [at(1, 10, "08:00", "09:30", 1, "12"), at(2, 20, "09:00", "10:00", 2, "14")];

    assert(findConflicts(pair, pair).length === 0,
      "without the survey this is invisible — no teacher, no hall, no finding");

    const shared = new Set(["10|20"]);
    const found = findConflicts(pair, pair, { cohortPairs: shared, cohortSize: () => 7 });
    assert(found.length === 1 && found[0].type === "cohort", "with it, the student clash is caught");
    assert(found[0].detail.includes("7"), "…and says how many students it speaks for");
    assert(found[0].severity === "medium",
      "…as a warning, never a refusal — it speaks for who answered, not the registrar");

    // A pair that does not share students is not a clash.
    assert(findConflicts(pair, pair, { cohortPairs: new Set(["10|99"]) }).length === 0,
      "courses with no shared students still overlap freely");
    // Nor is a shared pair that does not actually overlap.
    const apart = [at(1, 10, "08:00", "09:00"), at(2, 20, "10:00", "11:00")];
    assert(findConflicts(apart, apart, { cohortPairs: shared }).length === 0,
      "sharing students says nothing about lectures that never meet");
    // A department with no survey sees exactly what it saw before.
    assert(findConflicts(pair, pair, { cohortPairs: new Set() }).length === 0,
      "an empty graph changes nothing at all");

    /* The timetable's OWN error outranks it: fixing a double-booked teacher may
       resolve the student clash, so the teacher is named first. */
    const both = [at(1, 10, "08:00", "09:30", 5, "12"), at(2, 20, "09:00", "10:00", 5, "14")];
    const ranked = findConflicts(both, both, { cohortPairs: shared, cohortSize: () => 7 });
    assert(ranked.length === 1 && ranked[0].type === "instructor",
      "a double-booked teacher is named ahead of the cohort clash");
    assert(ranked[0].reasons?.includes("cohort"),
      "…without losing the fact that students are caught in it too");
  }

  /* --- 25b. شريط اليوم: شكل لا مواضع ---------------------------------------- */
  originalLog("\n--- 25b. Day shape ---");
  {
    /* Grouping concurrent lectures helped and was still the wrong shape. A
       500px strip cannot show 74 positions; it can show how heavy each hour is,
       which is the question the dashboard asks. Twelve columns, one per hour —
       nothing can overlap because nothing shares a column. */
    const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
    const density = (rows: Array<{ startTime: string; endTime: string }>) =>
      Array.from({ length: 12 }, (_, k) => {
        const from = (8 + k) * 60, to = from + 60;
        return rows.filter(r => {
          const s = mins(r.startTime), e = Math.max(s + 30, mins(r.endTime));
          return s < to && e > from;
        }).length;
      });

    const day = [
      { startTime: "08:00", endTime: "09:15" }, { startTime: "08:00", endTime: "09:15" },
      { startTime: "08:00", endTime: "09:15" }, { startTime: "11:00", endTime: "12:15" },
      { startTime: "13:00", endTime: "16:00" },   // one lecture spanning three hours
    ];
    const shape = density(day);
    assert(shape.length === 12, "the day is always twelve columns, whatever it holds");
    assert(shape[0] === 3, "three lectures at eight make the eight o'clock column three high");
    /* They run until 09:15, so they genuinely occupy part of the nine o'clock
       hour and the column counts them. The first version of this assertion
       expected zero and was wrong about the data, not about the code: an hour
       is busy if a lecture is in the room during it, whatever minute it began. */
    assert(shape[1] === 3, "…and nine still counts them, because they run into it");
    assert(shape[2] === 0, "the first genuinely free hour is ten");
    assert(shape[3] === 1, "an ordinary hour counts its one lecture");
    // A long lecture is present in every hour it actually occupies.
    assert(shape[5] === 1 && shape[6] === 1 && shape[7] === 1,
      "a three-hour lecture stands in all three of its columns");
    assert(density([]).every(n => n === 0), "an empty day is twelve empty columns, not an error");
    // The tallest column sets the scale, so a quiet day still has a shape.
    const peak = Math.max(1, ...shape);
    assert(peak === 3 && Math.round((shape[0] / peak) * 100) === 100,
      "the busiest hour is full height and everything else is measured against it");
    assert(Math.round((shape[3] / peak) * 100) === 33, "…so one against three reads as a third");
  }

  /* --- 25. شريط اليوم: المتزامنات كتلة واحدة -------------------------------- */
  originalLog("\n--- 25. Day strip grouping ---");
  {
    /* Measured on the live dashboard: 74 lectures today, 73 of them drawn at an
       offset another block already occupied, the worst stack fourteen deep.
       Their codes printed over one another into strings like «1464» that are
       not any course — which is what the reader was actually looking at. */
    const lecture = (code: string, start: string, end: string) => ({ courseCode: code, startTime: start, endTime: end });
    const group = (rows: Array<{ startTime: string }>) =>
      Array.from(rows.reduce((map, row) => {
        const bucket = map.get(row.startTime);
        if (bucket) bucket.push(row); else map.set(row.startTime, [row]);
        return map;
      }, new Map<string, typeof rows>()).entries());

    const crowded = [
      lecture("ETC 112", "08:00", "09:15"), lecture("ETC 113", "08:00", "09:15"),
      lecture("ETC 210", "08:00", "09:15"), lecture("ETC 305", "08:00", "09:15"),
      lecture("ETC 320", "11:00", "12:15"), lecture("ETC 401", "13:30", "14:45"),
    ];
    const grouped = group(crowded);
    assert(grouped.length === 3, `six lectures at three start times become three blocks (got ${grouped.length})`);
    assert(grouped[0][1].length === 4, "…and the crowded one knows it holds four");
    // One lecture keeps its own code; a group says how many.
    const labelFor = (g: any[]) => (g.length === 1 ? g[0].courseCode : `×${g.length}`);
    assert(labelFor(grouped[0][1]) === "×4", "a group is labelled by its count, not by one member's code");
    assert(labelFor(grouped[1][1]) === "ETC 320", "a lone lecture still shows its own code");
    // The end of a group is the latest end within it, so the block covers them all.
    const endOf = (g: any[]) => g.map(r => r.endTime).sort().pop();
    assert(endOf(grouped[0][1]) === "09:15", "the block spans until the last of its lectures ends");
    assert(group([]).length === 0, "an empty day draws nothing");
    // Every lecture is still represented — nothing is silently dropped.
    assert(grouped.reduce((n, [, g]) => n + g.length, 0) === crowded.length,
      "grouping loses no lecture; it only stops drawing them on top of each other");
  }

  /* --- 26. ملاحظة بلا تاريخ ------------------------------------------------- */
  originalLog("\n--- 26. A note without a date ---");
  {
    /* The failure an instructor actually saw: choosing «أحتاج تعديلاً» and
       sending. There is no date on that kind of request, so the field arrived
       as `undefined` — and Firestore rejects undefined outright, as an error
       and not as a null. The whole write failed and the person was told the
       system was broken. */
    const written = await Repository.createScheduleComment({
      SystemUserId: 0, userName: "د. نورة", scheduleId: 1,
      AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
      text: "طلب تعديل — تعارض مع اجتماع القسم",
      source: "staff-card", fromInstructorId: 7, kind: "change",
      fromDate: undefined, toDate: undefined,
    } as any);
    assert(!("fromDate" in written), "an absent date is absent, not undefined");
    assert(!("toDate" in written), "…and so is its pair");
    assert(written.kind === "change" && written.source === "staff-card",
      "everything the note DOES carry survives untouched");
    assert(Object.values(written).every(value => value !== undefined),
      "no field of a stored note is ever undefined");

    const dated = await Repository.createScheduleComment({
      SystemUserId: 0, userName: "د. نورة", scheduleId: 2,
      AdCollegeId: 1, AdSectionId: 1, AdTermId: 1,
      text: "اعتذار", source: "staff-card", fromInstructorId: 7,
      kind: "apology", fromDate: "2026-11-08",
    } as any);
    assert(dated.fromDate === "2026-11-08", "a date that IS given is kept");
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
