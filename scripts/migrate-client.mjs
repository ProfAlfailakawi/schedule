import fs from "fs";
import { initializeApp } from "firebase/app";
import { getFirestore, writeBatch, doc, collection, getDocs } from "firebase/firestore";

const config = JSON.parse(fs.readFileSync("firebase-applet-config.json", "utf-8"));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const source = JSON.parse(fs.readFileSync("../schedule-private/db.json", "utf-8"));

async function migrate() {
  console.log("Starting client-side migration...");
  const sets = [
    { collection: "users", rows: source.users || [], idOf: r => `user_${r.SystemUserId}` },
    { collection: "formNames", rows: source.formNames || [], idOf: r => `form_${r.FormNameId}` },
    { collection: "formSecurity", rows: source.formSecurity || [], idOf: r => `permission_${r.legacyId ?? r.Id}` },
    { collection: "userScopes", rows: source.collegeUserAssign || [], idOf: r => r.legacyId != null ? `scope_${r.legacyId}` : `user_${r.SystemUserId}_college_${r.AdCollegeId}_section_${r.AdSectionId}` },
    { collection: "terms", rows: source.terms || [], idOf: r => `term_${r.AdTermId}` },
    { collection: "colleges", rows: source.colleges || [], idOf: r => `college_${r.AdCollegeId}` },
    { collection: "sections", rows: source.sections || [], idOf: r => `section_${r.AdSectionId}` },
    { collection: "instructors", rows: source.instructors || [], idOf: r => `instructor_${r.AdInstructorId}` },
    { collection: "courses", rows: source.courses || [], idOf: r => `course_${r.AdCourseId}` },
    { collection: "schedules", rows: source.schedules || [], idOf: r => `schedule_${r.id}` },
    { collection: "rooms", rows: source.rooms || [], idOf: r => `room_${r.AdRoomId}` }
  ];

  for (const item of sets) {
    let pending = 0;
    let batch = writeBatch(db);
    for (const row of item.rows) {
      batch.set(doc(db, item.collection, item.idOf(row)), row);
      pending++;
      if (pending === 400) {
        await batch.commit();
        batch = writeBatch(db);
        pending = 0;
      }
    }
    if (pending > 0) await batch.commit();
    console.log(`Migrated ${item.rows.length} rows to ${item.collection}`);
  }
  
  // also _meta/counters
  const counters = {
    users: Math.max(0, ...(source.users || []).map(r => Number(r.SystemUserId) || 0)),
    schedules: Math.max(0, ...(source.schedules || []).map(r => Number(r.id) || 0))
  };
  await writeBatch(db).set(doc(db, "_meta", "counters"), counters).commit();
  console.log("Migration finished.");
  process.exit(0);
}

migrate().catch(console.error);
