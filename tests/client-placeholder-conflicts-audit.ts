/**
 * «هيئة تدريسية» ليست شخصاً: القراءات في العميل (المعاينة الشبحية، livingSchedule) تطابق قاعدة الخادم،
 * وإظهار «لماذا؟» مشروطٌ بوجود بيانات.
 */
import fs from "fs";
import { findConflicts, SCHEDULE_DAYS } from "../src/utils/scheduleIntelligence";
import { placeholderInstructorIds } from "../src/utils/instructorIdentity";
import { buildRoomResilience } from "../src/utils/livingSchedule";
import { hasRowExplanation } from "../src/components/RowHistory";

let failed = 0;
const check = (ok: boolean, label: string) => { console.log(`${ok ? "\x1b[32m✓" : "\x1b[31m✗"} ${label}\x1b[0m`); if (!ok) failed++; };
const row = (id: number, o: any = {}) => {
  const r: any = { id, AdCollegeId: 1, AdSectionId: 1, AdTermId: 1, AdCourseId: 100 + id, AdCourseName: "م", SCode: "0" + id, AdInstructorId: 7, fstarttime: "09:00", fendtime: "09:50", AdRoomCode: "G" + id, AdRoomHall: "1", buildingId: 1, roomId: id, locationStatus: "VERIFIED" };
  for (const d of SCHEDULE_DAYS) r[d.key] = false;
  r.fsunday = true;
  return Object.assign(r, o);
};
const people = [{ AdInstructorId: 7, AdInstructorName: "هيئة تدريسية" }, { AdInstructorId: 8, AdInstructorName: "أحمد علي" }];
const ph = placeholderInstructorIds(people);
const all = (rows: any[], opts?: any) => findConflicts([rows[0]], rows, opts);

const a = row(1), b = row(2);
check(all([a, b]).length > 0, "بلا قاعدة الهيئة: يظهر التعارض الزائف (حارس الحارس)");
check(all([a, b], { placeholderInstructorIds: ph }).length === 0, "صفّان لـ«هيئة تدريسية» في وقتٍ واحد: لا تعارض أستاذ");
const sameRoom = [row(1, { AdRoomCode: "G", roomId: 1 }), row(2, { AdRoomCode: "G", roomId: 1 })];
check(all(sameRoom, { placeholderInstructorIds: ph }).length > 0, "وتعارض القاعة يبقى محسوباً");
const c = row(3, { AdInstructorId: 8, fstarttime: "11:00", fendtime: "11:50" });
const res = buildRoomResilience([a], [a, b, c], people as any);
check(res.rooms.length === 1 && res.rooms[0].recoverable === 1, "livingSchedule: هيئة تدريسية لا تمنع نقل الموعد إلى قاعةٍ أخرى");

const sched = fs.readFileSync("src/components/Schedules.tsx", "utf8");
const ghost = sched.match(/findConflicts\(\[after\][^;]*;/g) || [];
check(ghost.length === 2 && ghost.every(s => s.includes("placeholderInstructorIds")), "المعاينة الشبحية (موضعان) تمرّر معرّفات الهيئة");
const living = fs.readFileSync("src/utils/livingSchedule.ts", "utf8");
check((living.match(/findConflicts\(/g) || []).length === (living.match(/findConflicts\([^;]*placeholderInstructorIds/g) || []).length, "كل findConflicts في livingSchedule يمرّر معرّفات الهيئة");

check(!hasRowExplanation(0, null, []), "«لماذا؟»: لا سجل ولا مصدر ولا حقائق = لا شيء");
check(hasRowExplanation(2, null, []) && hasRowExplanation(0, null, [{ tone: "good", kind: "clear", label: "x" }]), "«لماذا؟»: سجلٌّ أو حقائق = تظهر");
const rh = fs.readFileSync("src/components/RowHistory.tsx", "utf8");
check(!rh.includes("مستورد · بلا سجل") && rh.includes("if (!hasRowExplanation"), "لا رقاقة «مستورد · بلا سجل»");
process.exit(failed ? 1 : 0);
